import { Color, Fog, Group, type PerspectiveCamera, type Scene, Vector3, type WebGLRenderer } from 'three';
import { CONFIG } from '../config';
import { MAPS } from '../maps/registry';
import type { GameMap } from '../maps/types';
import { XRInput } from '../player/input';
import { TextPanel } from '../ui/panel';
import type { Ground } from '../world/ground';
import { World } from '../world/world';
import { TouchControls } from './touchControls';

// `?fly`: fly freely through any map in src/maps to look it over, with no
// enemies. `?fly=<id>` opens that map. Zones are shown in the World, lit by
// its rig under its sky; the crypt hall brings its own lights. Flying ignores
// walls; walk mode puts you at eye height on the ground with the player's
// collision, to see the map at the player's scale. Works in the headset, on
// the desktop page, and on phones and tablets with on-screen touch controls.

const EYE = 1.6; // desktop camera height above the rig (the headset supplies its own)
const SPEEDS = [0.5, 1, 2, 4, 8, 16]; // m/s
const BOOST = 4;
const LOOK = 0.0025; // rad per pixel of mouse movement
const PITCH_LIMIT = Math.PI / 2 - 0.01;
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const QUEST_HELP = [
  'L stick move   R stick ◂▸ turn  ▴▾ up/down',
  'grip fast   A next map   B walk/fly',
  'X fog   Y next spot',
];
const DESKTOP_HELP = [
  'click to look around, Esc to let go',
  'WASD move   Q/E down/up   shift fast',
  'wheel speed   M next map   1-9 pick map',
  'G walk/fly   F fog   R next spot   H hide',
];
const TOUCH_HELP = ['stick: move   drag: look   ▲▼: up/down'];

/** A place the viewer can jump you to. `y` is the rig's height; `pitch` only steers the desktop camera. */
export interface Viewpoint {
  label: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Seen from afar: fog would hide everything. */
  clear: boolean;
}

/** Where Y / R takes you, in turn: the start, each landmark, then a view over the whole map. */
export function viewpoints(map: Pick<GameMap, 'spawn' | 'bounds' | 'landmarks' | 'heightAt'>): Viewpoint[] {
  const { spawn, bounds: b } = map;
  const onGround = (label: string, x: number, z: number, yaw: number): Viewpoint => ({
    label,
    x,
    y: map.heightAt(x, z),
    z,
    yaw,
    pitch: 0,
    clear: false,
  });
  const spots = [onGround('Start', spawn.x, spawn.z, spawn.yaw)];
  for (const l of map.landmarks) {
    // Arrive facing the way you'd have walked from the start.
    const dx = l.x - spawn.x;
    const dz = l.z - spawn.z;
    spots.push(onGround(l.label, l.x, l.z, Math.hypot(dx, dz) > 0.5 ? Math.atan2(-dx, -dz) : spawn.yaw));
  }
  // Up and back beyond the south edge, looking north and down at the middle.
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const size = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  const z = b.maxZ + size * 0.4;
  const ground = map.heightAt(cx, cz);
  const y = ground + size * 0.8;
  spots.push({ label: 'Overview', x: cx, y, z, yaw: 0, pitch: -Math.atan2(y + EYE - ground, z - cz), clear: true });
  return spots;
}

const UP = new Vector3(0, 1, 0);
const _fwd = new Vector3();
const _right = new Vector3();
const _head = new Vector3();
const _feet = new Vector3();

export class MapViewer {
  /** Moved and turned by the controls; the camera (the head, in VR) and hands ride in it. */
  readonly rig = new Group();
  /** Lights, sky and ground for every zone shown. */
  readonly world = new World();
  private readonly loaded = new Map<string, Promise<GameMap>>();
  private readonly input: XRInput;
  /** Readout floating over the left controller, for the headset. */
  private readonly panel = new TextPanel(0.3);
  /** Readout on the page, for the desktop and phones. */
  private readonly hud = document.createElement('div');
  private readonly hudText = document.createElement('div');
  private readonly touch: TouchControls;
  private readonly keys = new Set<string>();
  private pitch = 0;
  private snapLatched = false;
  private lastHud = '';
  /** Bumped by every switch, so a slow load can't land after a later one. */
  private switches = 0;

  map: GameMap | null = null;
  index = 0;
  spots: Viewpoint[] = [];
  spot = 0;
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
    this.placeDesktopCamera();
    renderer.xr.addEventListener('sessionend', () => this.placeDesktopCamera());

    this.input = new XRInput(renderer, this.rig);
    this.panel.mesh.visible = false;
    scene.add(this.panel.mesh);

    const canvas = renderer.domElement;
    this.touch = new TouchControls(
      canvas,
      {
        map: () => void this.show(this.index + 1),
        walk: () => this.toggleWalk(),
        fog: () => this.toggleFog(),
        spot: () => this.goTo(this.spot + 1),
      },
      (yaw, pitch) => this.look(yaw, pitch),
    );
    this.hud.id = 'viewer-hud';
    this.hud.append(this.hudText, this.touch.buttons);
    document.body.appendChild(this.hud);

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') void canvas.requestPointerLock?.()?.catch?.(() => {});
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) this.look(e.movementX * LOOK, e.movementY * LOOK);
    });
    addEventListener('wheel', (e) => this.setSpeed(this.speed - Math.sign(e.deltaY)), { passive: true });
    addEventListener('keydown', (e) => this.onKey(e, true));
    addEventListener('keyup', (e) => this.onKey(e, false));
    addEventListener('blur', () => this.keys.clear());

    void this.show(Math.max(0, MAPS.findIndex((m) => m.id === mapId)));
  }

  /** Switch map and go to its start. Loaded maps are kept, so switching back is instant. */
  async show(index: number): Promise<void> {
    const n = MAPS.length;
    this.index = ((index % n) + n) % n;
    const info = MAPS[this.index];
    const ticket = ++this.switches;
    let pending = this.loaded.get(info.id);
    if (!pending) {
      pending = info.load();
      this.loaded.set(info.id, pending);
      pending.catch(() => this.loaded.delete(info.id)); // let a retry load it again
    }
    const map = await pending;
    if (ticket !== this.switches) return;

    if (this.map?.kind === 'whole') this.scene.remove(this.map.root);
    this.map = map;
    if (map.kind === 'zone') {
      this.world.load(map);
      this.world.attach(this.scene, this.camera, this.renderer);
    } else {
      this.world.detach(this.scene);
      this.scene.add(map.root);
    }
    this.spots = viewpoints(map);
    this.fog = true;
    this.goTo(0);
    // Reloading the page keeps you on this map. Bare flags (?emulate) stay bare.
    const query = new URLSearchParams(location.search);
    query.set('fly', info.id);
    history.replaceState(null, '', `?${query.toString().replace(/=(?=&|$)/g, '')}${location.hash}`);
  }

  /** Jump to one of the map's viewpoints (0 is the start). */
  goTo(index: number): void {
    if (!this.spots.length) return;
    this.spot = index % this.spots.length;
    const s = this.spots[this.spot];
    this.rig.position.set(s.x, s.y, s.z);
    this.rig.rotation.set(0, s.yaw, 0);
    this.pitch = s.pitch;
    if (!this.renderer.xr.isPresenting) this.camera.rotation.set(s.pitch, 0, 0);
    if (s.clear) this.fog = false;
    this.applyAtmosphere();
    // A jump shows the zone round where you land at once, rather than streaming in a few chunks a frame.
    if (this.map?.kind === 'zone') this.world.fill(s.x, s.z);
  }

  /** Turn the view: `yaw` to the right and `pitch` down, in radians. */
  private look(yaw: number, pitch: number): void {
    this.rig.rotation.y -= yaw;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch - pitch));
    if (!this.renderer.xr.isPresenting) this.camera.rotation.x = this.pitch;
  }

  toggleFog(): void {
    this.fog = !this.fog;
    this.applyAtmosphere();
    // Lifting the fog shows the whole zone, so every chunk comes in at once.
    if (this.map?.kind === 'zone') this.world.fill(this.rig.position.x, this.rig.position.z);
  }

  toggleWalk(): void {
    this.walking = !this.walking;
  }

  private setSpeed(i: number): void {
    this.speed = Math.max(0, Math.min(SPEEDS.length - 1, i));
  }

  private applyAtmosphere(): void {
    const map = this.map;
    if (!map) return;
    // Without fog you can see the whole map, from the overview too.
    const b = map.bounds;
    const size = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    if (map.kind === 'zone') {
      if (this.fog) this.world.restoreFog();
      else this.world.liftFog(Math.max(map.atmosphere.farPlane, size * 3));
      return;
    }
    const { sky, viewDistance } = map;
    this.scene.background = new Color(sky.background);
    this.scene.fog = this.fog ? new Fog(sky.fog.color, sky.fog.near, sky.fog.far) : null;
    this.camera.far = this.fog ? viewDistance : Math.max(viewDistance, size * 3);
    this.camera.updateProjectionMatrix();
  }

  /** The ground to walk on: the World's for a zone, the map's own for the crypt. */
  private ground(map: GameMap): Pick<Ground, 'heightAt' | 'resolve'> {
    return map.kind === 'zone' ? this.world : map;
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
    if (k >= '1' && k <= '9' && Number(k) <= MAPS.length) return void this.show(Number(k) - 1);
    switch (k) {
      case 'm':
        return void this.show(this.index + (e.shiftKey ? -1 : 1));
      case 'g':
        return this.toggleWalk();
      case 'f':
        return this.toggleFog();
      case 'r':
        return this.goTo(this.spot + 1);
      case 'h':
        this.hud.hidden = !this.hud.hidden;
        return;
    }
  }

  private handleInput(map: GameMap, dt: number): void {
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
      if (right.primaryPressed) void this.show(this.index + 1); // A
      if (right.secondaryPressed) this.toggleWalk(); // B
      if (left.primaryPressed) this.toggleFog(); // X
      if (left.secondaryPressed) this.goTo(this.spot + 1); // Y
    } else {
      // Keys and touch only drive the page view: in the emulator its own play mode uses the keys.
      const held = (key: string) => (this.keys.has(key) ? 1 : 0);
      const t = this.touch;
      forward = held('w') - held('s') - t.moveY;
      strafe = held('d') - held('a') + t.moveX;
      rise = held('e') - held('q') + t.rise;
      fast = this.keys.has('shift') || t.fast;
    }

    // Forward is where you look; flying follows your pitch, walking stays level.
    this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(_fwd);
    _right.setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize();
    if (this.walking) _fwd.crossVectors(UP, _right);
    const step = SPEEDS[this.speed] * (fast ? BOOST : 1) * dt;
    this.rig.position.addScaledVector(_fwd, forward * step).addScaledVector(_right, strafe * step);
    if (!this.walking) {
      this.rig.position.y += rise * step;
      return;
    }
    // Walking plays by the player's rules: blocked by walls and props, feet on the ground.
    const ground = this.ground(map);
    this.rig.updateMatrixWorld(true);
    this.camera.getWorldPosition(_head).setY(0);
    _feet.copy(_head);
    if (ground.resolve(_feet, CONFIG.player.bodyRadius)) {
      this.rig.position.x += _feet.x - _head.x;
      this.rig.position.z += _feet.z - _head.z;
    }
    this.rig.position.y = ground.heightAt(_feet.x, _feet.z);
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
    this.input.update();
    const map = this.map;
    if (map) this.handleInput(map, dt);
    this.rig.updateMatrixWorld(true);
    if (map?.kind === 'zone') this.world.update(dt, this.camera);
    else map?.update(dt, this.camera);
    this.placePanel();
    const status = this.describe(map);
    this.panel.draw([...status, '', ...QUEST_HELP]);
    this.touch.sync(this.walking, this.fog);
    this.drawHud(this.touch.active ? [...status, ...TOUCH_HELP] : [...status, '', ...DESKTOP_HELP]);
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

  private describe(map: GameMap | null): string[] {
    const heading = `${MAPS[this.index].label.toUpperCase()}   ${this.index + 1}/${MAPS.length}`;
    // Mid-switch, the old map is still showing while the new one loads.
    if (!map || map.id !== MAPS[this.index].id) return [heading, 'loading…'];
    this.camera.getWorldPosition(_head);
    this.camera.getWorldDirection(_fwd);
    const bearing = ((Math.atan2(_fwd.x, -_fwd.z) * 180) / Math.PI + 360) % 360;
    const above = _head.y - this.ground(map).heightAt(_head.x, _head.z);
    const b = map.bounds;
    const inside = _head.x >= b.minX && _head.x <= b.maxX && _head.z >= b.minZ && _head.z <= b.maxZ;
    const f = (v: number) => v.toFixed(1);
    return [
      heading,
      `${this.walking ? 'walk' : 'fly'}   ${SPEEDS[this.speed] * (this.touch.fast ? BOOST : 1)} m/s   fog ${this.fog ? 'on' : 'off'}   next: ${this.spots[(this.spot + 1) % this.spots.length].label}`,
      `x ${f(_head.x)}  y ${f(_head.y)}  z ${f(_head.z)}   ${COMPASS[Math.round(bearing / 45) % 8]} ${bearing.toFixed(0)}°`,
      `${f(above)} m above the ground${inside ? '' : ', outside the map'}`,
    ];
  }

  private drawHud(lines: string[]): void {
    const text = lines.join('\n');
    if (text === this.lastHud) return;
    this.lastHud = text;
    const [head, ...rest] = lines;
    const b = document.createElement('b');
    b.textContent = head;
    this.hudText.replaceChildren(b, '\n' + rest.join('\n'));
  }
}
