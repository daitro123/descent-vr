import { Group, type Object3D, type PerspectiveCamera, Quaternion, Vector3, type WebGLRenderer } from 'three';
import { CONFIG } from '../../../config';
import { type Handedness, XRInput } from '../../../player/input';
import { Shield, Sword } from '../../../player/weapons';
import type { Ground } from '../../../world/ground';
import { hand } from './props';

// PROTOTYPE (Brewing at the alchemy table): you, as `?map` walks: today's
// sword and shield, which go away at the table for a pair of gloved hands, and
// the walk and snap turn. Off the headset a script can move the hands
// (`puppet`), since the grips are otherwise at your feet. Throwaway.

type Floor = Pick<Ground, 'heightAt' | 'resolve'>;

const UP = new Vector3(0, 1, 0);
const EYE = 1.6;
const _head = new Vector3();
const _fwd = new Vector3();
const _right = new Vector3();
const _p = new Vector3();
const _one = new Vector3(1, 1, 1);

export interface Hand {
  readonly model: Group;
  readonly fingers: Group;
  /** A script's hand, off the headset: where it is in the rig and whether it squeezes. */
  puppet: { at: Vector3; turn: Quaternion; squeeze: boolean } | null;
  squeezing: boolean;
  /** Edges this frame. */
  grabbed: boolean;
  released: boolean;
}

export class BrewRig {
  readonly rig = new Group();
  readonly input: XRInput;
  readonly sword = new Sword();
  readonly shield = new Shield();
  readonly hands: Record<Handedness, Hand>;
  /** At the table: the weapons are put away and your hands are free. */
  bare = false;
  private snapLatched = false;
  private readonly keys = new Set<string>();
  yaw = 0;
  pitch = 0;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly camera: PerspectiveCamera,
    private readonly floor: Floor,
  ) {
    this.rig.name = 'brew-rig';
    this.rig.add(camera);
    this.input = new XRInput(renderer, this.rig);
    const make = (): Hand => {
      const { root, fingers } = hand();
      return { model: root, fingers, puppet: null, squeezing: false, grabbed: false, released: false };
    };
    this.hands = { left: make(), right: make() };
    this.hands.left.model.scale.x = -1;
    this.input.onRemap = () => this.attach();
    this.attach();

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

  private attach(): void {
    const { left, right } = this.input.hands;
    right.grip.add(this.sword.model, this.hands.right.model);
    left.grip.add(this.shield.model, this.hands.left.model);
  }

  grip(hand: Handedness): Object3D {
    return this.input.hands[hand].grip;
  }

  /** Stand at (x, z) on the floor, facing `yaw` (0 looks down -Z). */
  teleport(x: number, z: number, yaw: number): void {
    this.rig.position.set(x, this.floor.heightAt(x, z), z);
    this.rig.rotation.set(0, yaw, 0);
    this.yaw = 0;
    this.pitch = 0;
    if (!this.renderer.xr.isPresenting) this.camera.position.set(0, EYE, 0);
  }

  update(dt: number): void {
    const xr = this.renderer.xr.isPresenting;
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
    this.collide(dt);

    for (const side of ['left', 'right'] as const) {
      const h = this.hands[side];
      const grip = this.input.hands[side].grip;
      if (!xr && h.puppet) {
        grip.matrix.compose(h.puppet.at, h.puppet.turn, _one);
        grip.visible = true;
      }
      const was = h.squeezing;
      const squeeze = !xr && h.puppet ? (h.puppet.squeeze ? 1 : 0) : this.input.hands[side].squeeze;
      h.squeezing = was ? squeeze > 0.35 : squeeze > 0.6;
      h.grabbed = h.squeezing && !was;
      h.released = !h.squeezing && was;
      h.fingers.rotation.x = h.squeezing ? -1.2 : -0.25;
      h.model.visible = this.bare;
    }
    // Weapons off the headset stay out of the desktop view, as `?map`'s do.
    this.sword.model.visible = this.shield.model.visible = (xr || !!this.hands.right.puppet) && !this.bare;
    this.rig.updateMatrixWorld(true);
    this.sword.update(this.rig, dt);
    this.shield.update(this.rig, dt);
  }

  private locomote(dt: number, stickX: number, stickY: number): void {
    const { moveSpeed, stickDeadzone } = CONFIG.player;
    if (Math.hypot(stickX, stickY) < stickDeadzone) return;
    this.camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) return;
    _fwd.normalize();
    _right.crossVectors(_fwd, UP);
    const speed = moveSpeed * dt * 0.7; // indoors: a stroll
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

  private collide(dt: number): void {
    this.rig.updateMatrixWorld(true);
    this.camera.getWorldPosition(_head);
    _p.set(_head.x, 0, _head.z);
    if (this.floor.resolve(_p, 0.2)) {
      this.rig.position.x += _p.x - _head.x;
      this.rig.position.z += _p.z - _head.z;
    }
    const ground = this.floor.heightAt(_p.x, _p.z);
    this.rig.position.y += (ground - this.rig.position.y) * Math.min(1, dt * 10);
  }
}
