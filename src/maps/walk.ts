import { type Camera, Color, Fog, Group, type PerspectiveCamera, type Scene, Timer, Vector3, type WebGLRenderer } from 'three';
import { CONFIG } from '../config';
import { XRInput } from '../player/input';
import { Shield, Sword } from '../player/weapons';
import type { Ground } from '../world/ground';
import { World } from '../world/world';
import { findMap, loadNeighbours, MAPS } from './registry';

// `?map=<id>`: walk a map with the warrior's locomotion and no enemies, to
// judge scale and layout from the ground. A zone is walked in the World, on
// its ground, with its neighbours over their seams; the crypt hall brings its own. In the headset: left stick moves
// (head-relative), right stick snap-turns. On a desktop: WASD or the arrow
// keys walk, dragging looks around.

/** What walking needs of the ground underfoot. */
type Floor = Pick<Ground, 'heightAt' | 'resolve'>;

const UP = new Vector3(0, 1, 0);
const EYE = 1.6;
const _head = new Vector3();
const _fwd = new Vector3();
const _right = new Vector3();
const _p = new Vector3();

class Walker {
  readonly rig = new Group();
  private readonly input: XRInput;
  private readonly sword = new Sword();
  private readonly shield = new Shield();
  private snapLatched = false;
  private readonly keys = new Set<string>();
  yaw = 0;
  pitch = 0;
  /** Metres to float above the ground: for overview shots from the console. */
  hover = 0;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly camera: PerspectiveCamera,
    private readonly floor: Floor,
    spawn: { x: number; z: number; yaw: number },
  ) {
    this.rig.name = 'walker-rig';
    this.rig.add(camera);
    this.input = new XRInput(renderer, this.rig);
    this.input.onRemap = () => this.attachWeapons();
    this.attachWeapons();
    this.teleport(spawn.x, spawn.z, spawn.yaw);

    addEventListener('keydown', (e) => this.keys.add(e.code));
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    let drag: { x: number; y: number } | null = null;
    renderer.domElement.addEventListener('pointerdown', (e) => (drag = { x: e.clientX, y: e.clientY }));
    addEventListener('pointerup', () => (drag = null));
    addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.yaw -= (e.clientX - drag.x) * 0.004;
      this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch - (e.clientY - drag.y) * 0.004));
      drag = { x: e.clientX, y: e.clientY };
    });
  }

  private attachWeapons(): void {
    this.input.hands.right.grip.add(this.sword.model);
    this.input.hands.left.grip.add(this.shield.model);
  }

  /** Stand at (x, z) on the ground, facing `yaw`. */
  teleport(x: number, z: number, yaw: number): void {
    this.rig.position.set(x, this.floor.heightAt(x, z) + this.hover, z);
    this.rig.rotation.set(0, yaw, 0);
    this.yaw = 0;
    this.pitch = 0;
    if (!this.renderer.xr.isPresenting) this.camera.position.set(0, EYE, 0);
  }

  update(dt: number): void {
    const xr = this.renderer.xr.isPresenting;
    // Off the headset the grips sit at your feet; keep the weapons out of the desktop view.
    this.sword.model.visible = this.shield.model.visible = xr;
    if (!xr) {
      this.camera.position.set(0, EYE, 0);
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }
    this.input.update();
    const { left, right } = this.input.hands;
    let stickX = left.stickX;
    let stickY = left.stickY;
    if (!xr) {
      const k = (...codes: string[]) => (codes.some((c) => this.keys.has(c)) ? 1 : 0);
      stickX = k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft');
      stickY = k('KeyS', 'ArrowDown') - k('KeyW', 'ArrowUp');
    }
    this.locomote(dt, stickX, stickY, this.keys.has('ShiftLeft') ? 3 : 1);
    this.snapTurn(right.stickX);
    this.collideAndGround(dt);
  }

  private locomote(dt: number, stickX: number, stickY: number, boost: number): void {
    const { moveSpeed, stickDeadzone } = CONFIG.player;
    if (Math.hypot(stickX, stickY) < stickDeadzone) return;
    this.camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) return;
    _fwd.normalize();
    _right.crossVectors(_fwd, UP);
    const speed = moveSpeed * boost * dt;
    this.rig.position.addScaledVector(_fwd, -stickY * speed).addScaledVector(_right, stickX * speed);
  }

  /** Turn about the head, not the rig's origin, so you turn in place. */
  private snapTurn(x: number): void {
    if (Math.abs(x) < 0.7) {
      this.snapLatched = false;
      return;
    }
    if (this.snapLatched) return;
    this.snapLatched = true;
    const angle = (-Math.sign(x) * CONFIG.player.snapTurnDeg * Math.PI) / 180;
    this.camera.getWorldPosition(_head);
    this.rig.position.sub(_head).applyAxisAngle(UP, angle).add(_head);
    this.rig.rotation.y += angle;
  }

  /** Keep the head's floor point out of trunks and walls, and the feet on the ground (eased, for comfort). */
  private collideAndGround(dt: number): void {
    this.rig.updateMatrixWorld(true);
    this.camera.getWorldPosition(_head);
    _p.set(_head.x, 0, _head.z);
    if (this.floor.resolve(_p, CONFIG.player.bodyRadius)) {
      this.rig.position.x += _p.x - _head.x;
      this.rig.position.z += _p.z - _head.z;
    }
    const ground = this.floor.heightAt(_p.x, _p.z) + this.hover;
    this.rig.position.y += (ground - this.rig.position.y) * Math.min(1, dt * 10);
  }
}

export async function startWalk(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, id: string): Promise<void> {
  const info = findMap(id) ?? MAPS[0];
  const intro = document.getElementById('intro');
  if (intro) intro.innerHTML = `<h1>${info.label}</h1>Loading…`;
  // Let the loading line paint before the (synchronous) build.
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const t0 = performance.now();
  const map = await info.load();
  const buildMs = Math.round(performance.now() - t0);

  let floor: Floor;
  let animate: (dt: number, camera: Camera) => void;
  let world: World | null = null;
  if (map.kind === 'zone') {
    const w = new World(findMap);
    w.attach(scene, camera, renderer);
    // Its neighbours too, so you can walk over into them.
    for (const n of await loadNeighbours(map)) w.add(n);
    w.load(map);
    world = floor = w;
    animate = (dt, c) => w.update(dt, c);
  } else {
    scene.add(map.root);
    scene.background = new Color(map.sky.background);
    scene.fog = new Fog(map.sky.fog.color, map.sky.fog.near, map.sky.fog.far);
    camera.far = map.viewDistance;
    camera.updateProjectionMatrix();
    floor = map;
    animate = (dt, c) => map.update(dt, c);
  }
  const walker = new Walker(renderer, camera, floor, map.spawn);
  scene.add(walker.rig);

  if (intro) {
    intro.innerHTML =
      `<h1>${info.label}</h1>` +
      'Walk the map, no enemies. Press <b>Enter VR</b>: left stick moves, right stick turns.<br>' +
      'Desktop: WASD or arrows to walk (Shift to hurry), drag to look.<br>' +
      `Other maps: ${MAPS.map((m) => `<a href="?map=${m.id}">${m.id}</a>`).join(' · ')} · <a href="./">back to the game</a>`;
  }
  renderer.xr.addEventListener('sessionstart', () => intro?.style.setProperty('display', 'none'));
  renderer.xr.addEventListener('sessionend', () => intro?.style.removeProperty('display'));

  // Handle for poking from the console and for scripted screenshots.
  const teleport = (x: number, z: number, yaw = 0) => walker.teleport(x, z, yaw);
  Object.assign(window, { __descent: { map, world, walker, renderer, camera, teleport, buildMs } });

  const timer = new Timer();
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 1 / 30);
    if (renderer.xr.isPresenting) renderer.xr.updateCamera(camera);
    walker.update(dt);
    animate(dt, camera);
    renderer.render(scene, camera);
  });
}
