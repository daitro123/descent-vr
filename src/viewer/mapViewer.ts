import { Color, Fog, Group, type PerspectiveCamera, type Scene, Vector3, type WebGLRenderer } from 'three';
import { CONFIG } from '../config';
import { XRInput } from '../player/input';
import { TextPanel } from '../ui/panel';
import { type GameMap, MAPS, mapIndex } from '../world/maps';

// `?maps`: fly freely through any map in MAPS to look it over, with no enemies
// and no collision. `?maps=<id>` opens that map. Walk mode drops you to eye
// height on the ground to see the map at the player's scale. Works in the
// headset and on the desktop page.

const EYE = 1.6; // desktop camera height above the rig (the headset supplies its own)
const SPEEDS = [0.5, 1, 2, 4, 8, 16]; // m/s
const BOOST = 4;
const FAR = 400; // m: fog off, you can see across a whole map
const LOOK = 0.0025; // rad per pixel of mouse movement
const PITCH_LIMIT = Math.PI / 2 - 0.01;
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const QUEST_HELP = [
  'L stick move   R stick ◂▸ turn  ▴▾ up/down',
  'grip fast   A next map   B walk/fly',
  'X fog   Y back to start',
];
const DESKTOP_HELP = [
  'click to look around, Esc to let go',
  'WASD move   Q/E down/up   shift fast',
  'wheel speed   M next map   1-9 pick map',
  'G walk/fly   F fog   R back to start   H hide',
];

const UP = new Vector3(0, 1, 0);
const _fwd = new Vector3();
const _right = new Vector3();
const _head = new Vector3();

export class MapViewer {
  /** Moved and turned by the controls; the camera (the head, in VR) and hands ride in it. */
  readonly rig = new Group();
  private readonly built = new Map<number, GameMap>();
  private readonly input: XRInput;
  /** Readout floating over the left controller, for the headset. */
  private readonly panel = new TextPanel(0.3);
  /** Readout on the page, for the desktop. */
  private readonly hud = document.createElement('div');
  private readonly keys = new Set<string>();
  private pitch = 0;
  private snapLatched = false;
  private lastHud = '';

  index = 0;
  speed = SPEEDS.indexOf(2);
  walking = false;
  fog = true;

  constructor(
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
    private readonly renderer: WebGLRenderer,
    mapId: string | null,
  ) {
    this.rig.name = 'map-viewer-rig';
    this.rig.add(camera);
    scene.add(this.rig);
    camera.far = FAR;
    camera.updateProjectionMatrix();
    this.placeDesktopCamera();
    renderer.xr.addEventListener('sessionend', () => this.placeDesktopCamera());

    this.input = new XRInput(renderer, this.rig);
    this.panel.mesh.visible = false;
    scene.add(this.panel.mesh);

    this.hud.id = 'viewer-hud';
    document.body.appendChild(this.hud);

    const canvas = renderer.domElement;
    canvas.addEventListener('click', () => void canvas.requestPointerLock?.()?.catch?.(() => {}));
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.rig.rotation.y -= e.movementX * LOOK;
      this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch - e.movementY * LOOK));
      if (!renderer.xr.isPresenting) camera.rotation.x = this.pitch;
    });
    addEventListener('wheel', (e) => this.setSpeed(this.speed - Math.sign(e.deltaY)), { passive: true });
    addEventListener('keydown', (e) => this.onKey(e, true));
    addEventListener('keyup', (e) => this.onKey(e, false));
    addEventListener('blur', () => this.keys.clear());

    this.show(mapIndex(mapId));
  }

  get map(): GameMap {
    let m = this.built.get(this.index);
    if (!m) {
      m = MAPS[this.index].build();
      this.built.set(this.index, m);
    }
    return m;
  }

  /** Switch map and go back to its start. Built maps are kept, so switching back is instant. */
  show(index: number): void {
    const n = MAPS.length;
    if (this.built.has(this.index)) this.scene.remove(this.map.root);
    this.index = ((index % n) + n) % n;
    this.scene.add(this.map.root);
    this.applyAtmosphere();
    this.reset();
    // Reloading the page keeps you on this map. Bare flags (?emulate) stay bare.
    const query = new URLSearchParams(location.search);
    query.set('maps', MAPS[this.index].id);
    history.replaceState(null, '', `?${query.toString().replace(/=(?=&|$)/g, '')}${location.hash}`);
  }

  /** Back to where the game puts the player: the origin, facing north (−Z). */
  reset(): void {
    this.rig.position.set(0, this.ground(0, 0), 0);
    this.rig.rotation.set(0, 0, 0);
    this.pitch = 0;
    if (!this.renderer.xr.isPresenting) this.camera.rotation.set(0, 0, 0);
  }

  toggleFog(): void {
    this.fog = !this.fog;
    this.applyAtmosphere();
  }

  toggleWalk(): void {
    this.walking = !this.walking;
  }

  private setSpeed(i: number): void {
    this.speed = Math.max(0, Math.min(SPEEDS.length - 1, i));
  }

  private applyAtmosphere(): void {
    const { sky, fog } = MAPS[this.index];
    this.scene.background = new Color(sky);
    this.scene.fog = this.fog && fog ? new Fog(sky, fog[0], fog[1]) : null;
  }

  private ground(x: number, z: number): number {
    return this.map.groundHeight?.(x, z) ?? 0;
  }

  private placeDesktopCamera(): void {
    this.camera.position.set(0, EYE, 0);
    this.camera.rotation.set(this.pitch, 0, 0);
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const k = e.key.toLowerCase();
    if (!down) {
      this.keys.delete(k);
      return;
    }
    this.keys.add(k);
    if (e.repeat) return;
    if (k >= '1' && k <= '9' && Number(k) <= MAPS.length) return this.show(Number(k) - 1);
    switch (k) {
      case 'm':
        return this.show(this.index + (e.shiftKey ? -1 : 1));
      case 'g':
        return this.toggleWalk();
      case 'f':
        return this.toggleFog();
      case 'r':
        return this.reset();
      case 'h':
        this.hud.hidden = !this.hud.hidden;
        return;
    }
  }

  private handleInput(dt: number): void {
    this.input.update();
    const { left, right } = this.input.hands;
    const dead = CONFIG.player.stickDeadzone;
    let forward = 0;
    let strafe = 0;
    let rise = 0;
    let fast = false;

    if (this.renderer.xr.isPresenting) {
      if (Math.hypot(left.stickX, left.stickY) >= dead) {
        forward = -left.stickY;
        strafe = left.stickX;
      }
      if (Math.abs(right.stickY) >= dead) rise = -right.stickY;
      fast = left.squeeze > 0.5 || right.squeeze > 0.5;
      this.snapTurn(right.stickX);
      if (right.primaryPressed) this.show(this.index + 1); // A
      if (right.secondaryPressed) this.toggleWalk(); // B
      if (left.primaryPressed) this.toggleFog(); // X
      if (left.secondaryPressed) this.reset(); // Y
    } else {
      // Keys only drive the desktop view: in the emulator its own play mode uses them.
      const held = (key: string) => (this.keys.has(key) ? 1 : 0);
      forward = held('w') - held('s');
      strafe = held('d') - held('a');
      rise = held('e') - held('q');
      fast = this.keys.has('shift');
    }

    // Forward is where you look; flying follows your pitch, walking stays level.
    this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(_fwd);
    _right.setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize();
    if (this.walking) _fwd.crossVectors(UP, _right);
    const step = SPEEDS[this.speed] * (fast ? BOOST : 1) * dt;
    this.rig.position.addScaledVector(_fwd, forward * step).addScaledVector(_right, strafe * step);
    if (!this.walking) this.rig.position.y += rise * step;
    else {
      this.camera.getWorldPosition(_head);
      this.rig.position.y = this.ground(_head.x, _head.z);
    }
  }

  /** Right stick: turn 45° about the head, not the rig origin, so you turn in place. */
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

  update(dt: number): void {
    dt = Math.min(dt, 0.1); // a stalled tab shouldn't fling you across the map
    this.handleInput(dt);
    this.rig.updateMatrixWorld(true);
    this.map.update(dt, this.camera);
    this.placePanel();
    const status = this.describe();
    this.panel.draw([...status, '', ...QUEST_HELP]);
    this.drawHud([...status, '', ...DESKTOP_HELP]);
  }

  /**
   * Over the left hand, turned to face you. Placed in world space rather than
   * parented to the grip, so it reads upright however the controller is held.
   */
  private placePanel(): void {
    const grip = this.input.hands.left.grip;
    const mesh = this.panel.mesh;
    mesh.visible = this.renderer.xr.isPresenting && grip.visible;
    if (!mesh.visible) return;
    grip.getWorldPosition(mesh.position).y += 0.14;
    mesh.lookAt(this.camera.getWorldPosition(_head));
  }

  private describe(): string[] {
    const entry = MAPS[this.index];
    this.camera.getWorldPosition(_head);
    this.camera.getWorldDirection(_fwd);
    const bearing = ((Math.atan2(_fwd.x, -_fwd.z) * 180) / Math.PI + 360) % 360;
    const above = _head.y - this.ground(_head.x, _head.z);
    const f = (v: number) => v.toFixed(1);
    return [
      `${entry.label.toUpperCase()}   ${this.index + 1}/${MAPS.length}`,
      `${this.walking ? 'walk' : 'fly'}   ${SPEEDS[this.speed]} m/s   fog ${this.fog ? 'on' : 'off'}`,
      `x ${f(_head.x)}  y ${f(_head.y)}  z ${f(_head.z)}   ${COMPASS[Math.round(bearing / 45) % 8]} ${bearing.toFixed(0)}°`,
      `${f(above)} m above the ground`,
    ];
  }

  private drawHud(lines: string[]): void {
    const text = lines.join('\n');
    if (text === this.lastHud) return;
    this.lastHud = text;
    const [head, ...rest] = lines;
    const b = document.createElement('b');
    b.textContent = head;
    this.hud.replaceChildren(b, '\n' + rest.join('\n'));
  }
}
