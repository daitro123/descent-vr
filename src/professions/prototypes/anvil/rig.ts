import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  type PerspectiveCamera,
  TorusGeometry,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { CONFIG } from '../../../config';
import { XRInput } from '../../../player/input';
import { Shield, Sword } from '../../../player/weapons';
import type { World } from '../../../world/world';

// PROTOTYPE (Hammering at the anvil): you, at the smithy. Walks like `?map`
// (left stick moves, right stick snap-turns), with today's hands: the sword in
// the right and the shield in the left. The tool loop behind the right hip
// (Tools on the belt, ticket 02) swaps them for the smith's hammer and tongs
// while you're near the anvil. Throwaway.

const UP = new Vector3(0, 1, 0);
const EYE = 1.6;
/** The tool loop: how far below the eyes, to the right and behind the head, and its radius. */
const LOOP = { drop: 0.68, right: 0.2, back: 0.16, r: 0.12, maxHandSpeed: 1.5 };
/** Where the hammer's face is in the right grip, and where the tongs' jaws are in the left. */
export const HAMMER_FACE = new Vector3(0, -0.045, -0.3);
export const TONGS_JAW = new Vector3(0, 0, -0.34);

const IRON = 0x3a3c40;
const WOOD = 0x6a4a2a;
const _head = new Vector3();
const _fwd = new Vector3();
const _right = new Vector3();
const _p = new Vector3();
const _hand = new Vector3();

/** The smith's hammer: a handle along the grip's −Z and a head whose face looks down (−Y). */
function buildHammer(): Group {
  const g = new Group();
  const wood = new MeshLambertMaterial({ color: WOOD });
  const iron = new MeshLambertMaterial({ color: IRON });
  const handle = new Mesh(new CylinderGeometry(0.014, 0.017, 0.34, 6), wood);
  handle.rotation.x = Math.PI / 2;
  handle.position.z = -0.14;
  const head = new Mesh(new BoxGeometry(0.05, 0.1, 0.05), iron);
  head.position.set(0, -0.005, -0.3);
  const peen = new Mesh(new BoxGeometry(0.035, 0.04, 0.035), iron);
  peen.position.set(0, 0.06, -0.3);
  g.add(handle, head, peen);
  return g;
}

/** The smith's tongs: two long arms from the fist to the jaws, which close as you squeeze. */
class Tongs {
  readonly model = new Group();
  private readonly arms: Mesh[] = [];

  constructor() {
    const iron = new MeshLambertMaterial({ color: IRON });
    for (const side of [-1, 1]) {
      const arm = new Mesh(new BoxGeometry(0.012, 0.012, 0.36), iron);
      arm.position.set(side * 0.02, 0, -0.17);
      const jaw = new Mesh(new BoxGeometry(0.03, 0.014, 0.05), iron);
      jaw.position.set(0, 0, -0.18);
      arm.add(jaw);
      this.arms.push(arm);
      this.model.add(arm);
    }
  }

  /** 0 open to 1 shut. */
  set grip(t: number) {
    this.arms.forEach((arm, i) => {
      const side = i === 0 ? -1 : 1;
      arm.position.x = side * (0.028 - 0.02 * t);
      arm.rotation.y = side * -0.08 * (1 - t);
    });
  }
}

export class Smith {
  readonly rig = new Group();
  readonly input: XRInput;
  readonly sword = new Sword();
  readonly shield = new Shield();
  readonly hammer = buildHammer();
  readonly tongs = new Tongs();
  /** The hammer and tongs are out (instead of the sword and shield). */
  tools = false;
  /** The tool loop behind the right hip, lit while the hand is in it. */
  readonly loop = new Group();
  private readonly loopRing: Mesh<TorusGeometry, MeshLambertMaterial>;
  private loopYaw = 0;
  private handInLoop = false;
  private squeezeWas = false;
  private snapLatched = false;
  private readonly keys = new Set<string>();
  yaw = 0;
  pitch = 0;
  /** Where the right hand was last frame: it must be moving under maxHandSpeed to use the loop. */
  private readonly lastHand = new Vector3();

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly camera: PerspectiveCamera,
    private readonly world: World,
  ) {
    this.rig.name = 'anvil-prototype-rig';
    this.rig.add(camera);
    this.input = new XRInput(renderer, this.rig);
    this.input.onRemap = () => this.attach();
    this.attach();

    this.loopRing = new Mesh(new TorusGeometry(LOOP.r * 0.7, 0.008, 6, 20), new MeshLambertMaterial({ color: 0x6a5238 }));
    this.loopRing.rotation.x = Math.PI / 2;
    const handle = buildHammer();
    handle.scale.setScalar(0.8);
    handle.rotation.x = Math.PI / 2 + 0.3; // hanging head down
    handle.position.y = 0.1;
    this.loop.add(this.loopRing, handle);

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

  /** Put what each hand holds in it: sword and shield, or hammer and tongs. */
  private attach(): void {
    const { left, right } = this.input.hands;
    for (const m of [this.sword.model, this.shield.model, this.hammer, this.tongs.model]) m.removeFromParent();
    right.grip.add(this.tools ? this.hammer : this.sword.model);
    left.grip.add(this.tools ? this.tongs.model : this.shield.model);
  }

  setTools(on: boolean): void {
    if (on === this.tools) return;
    this.tools = on;
    this.attach();
    this.input.pulse('right', 0.6, 40);
  }

  /** Stand at (x, z) facing `yaw` (0 looks down −Z). */
  teleport(x: number, z: number, yaw: number): void {
    this.rig.position.set(x, this.world.heightAt(x, z), z);
    this.rig.rotation.set(0, yaw, 0);
    this.yaw = 0;
    this.pitch = 0;
    if (!this.renderer.xr.isPresenting) this.camera.position.set(0, EYE, 0);
    this.loopYaw = yaw;
  }

  /** The hammer's face, in the world. */
  hammerFace(out: Vector3): Vector3 {
    return this.hammer.localToWorld(out.copy(HAMMER_FACE));
  }

  /** The tongs' jaws, in the world. */
  jaw(out: Vector3): Vector3 {
    return this.tongs.model.localToWorld(out.copy(TONGS_JAW));
  }

  head(out: Vector3): Vector3 {
    return this.camera.getWorldPosition(out);
  }

  /** The left squeeze, 0 to 1 (desktop: hold G). */
  get squeeze(): number {
    return this.renderer.xr.isPresenting ? this.input.hands.left.squeeze : this.keys.has('KeyG') ? 1 : 0;
  }

  /**
   * One frame: read the controllers, walk, turn, keep out of walls. Returns
   * true when the right hand squeezed in the tool loop (or T on a desktop).
   */
  update(dt: number): boolean {
    const xr = this.renderer.xr.isPresenting;
    for (const m of [this.sword.model, this.shield.model, this.hammer, this.tongs.model]) m.visible = xr;
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
    this.locomote(dt, stickX, stickY);
    this.snapTurn(right.stickX);
    this.collideAndGround(dt);
    this.rig.updateMatrixWorld(true);
    this.sword.update(this.rig, dt);
    this.shield.update(this.rig, dt);
    this.tongs.grip = Math.min(1, this.squeeze * 1.4);
    return this.updateLoop(dt) || (!xr && this.keyEdge('KeyT'));
  }

  private readonly edges = new Set<string>();
  private keyEdge(code: string): boolean {
    const down = this.keys.has(code);
    const was = this.edges.has(code);
    if (down) this.edges.add(code);
    else this.edges.delete(code);
    return down && !was;
  }

  /** Follow the hips (the head's height and a smoothed yaw), and see if the right hand grips in the loop. */
  private updateLoop(dt: number): boolean {
    this.camera.getWorldPosition(_head);
    this.camera.getWorldDirection(_fwd).setY(0);
    if (_fwd.lengthSq() > 1e-6) {
      const want = Math.atan2(-_fwd.x, -_fwd.z);
      let d = want - this.loopYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.loopYaw += d * Math.min(1, dt * 4);
    }
    _fwd.set(-Math.sin(this.loopYaw), 0, -Math.cos(this.loopYaw));
    _right.crossVectors(_fwd, UP);
    this.loop.position.copy(_head).addScaledVector(_right, LOOP.right).addScaledVector(_fwd, -LOOP.back);
    this.loop.position.y -= LOOP.drop;
    this.loop.rotation.set(0, this.loopYaw, 0);

    const right = this.input.hands.right;
    right.grip.getWorldPosition(_hand);
    const speed = dt > 0 ? _hand.distanceTo(this.lastHand) / dt : 0;
    this.lastHand.copy(_hand);
    const inside = !!right.source && _hand.distanceTo(this.loop.position) < LOOP.r && speed < LOOP.maxHandSpeed;
    if (inside && !this.handInLoop) this.input.pulse('right', 0.25, 15);
    this.handInLoop = inside;
    this.loopRing.material.emissive.setHex(inside ? 0x806020 : 0x000000);
    const squeeze = right.squeeze > 0.6;
    const pressed = squeeze && !this.squeezeWas;
    this.squeezeWas = squeeze;
    return inside && pressed;
  }

  private locomote(dt: number, stickX: number, stickY: number): void {
    const { moveSpeed, stickDeadzone } = CONFIG.player;
    if (Math.hypot(stickX, stickY) < stickDeadzone) return;
    this.camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) return;
    _fwd.normalize();
    _right.crossVectors(_fwd, UP);
    const speed = moveSpeed * dt;
    this.rig.position.addScaledVector(_fwd, -stickY * speed).addScaledVector(_right, stickX * speed);
  }

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

  private collideAndGround(dt: number): void {
    this.rig.updateMatrixWorld(true);
    this.camera.getWorldPosition(_head);
    _p.set(_head.x, 0, _head.z);
    if (this.world.resolve(_p, CONFIG.player.bodyRadius)) {
      this.rig.position.x += _p.x - _head.x;
      this.rig.position.z += _p.z - _head.z;
    }
    const ground = this.world.heightAt(_p.x, _p.z);
    this.rig.position.y += (ground - this.rig.position.y) * Math.min(1, dt * 10);
  }
}
