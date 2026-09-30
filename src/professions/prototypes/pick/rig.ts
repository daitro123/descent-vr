import { Group, type PerspectiveCamera, Vector3, type WebGLRenderer } from 'three';
import { CONFIG } from '../../../config';
import { XRInput } from '../../../player/input';
import { Shield, Sword } from '../../../player/weapons';
import type { Ground } from '../../../world/ground';

// PROTOTYPE (?proto=pick): today's hands on a walk with no run and no dash
// (the left stick's click switches variants): sword in the right hand, shield
// in the left, the left stick walks and the right snap-turns. On a desktop,
// WASD walks and dragging looks. Throwaway.

const UP = new Vector3(0, 1, 0);
const EYE = 1.6;
const _head = new Vector3();
const _fwd = new Vector3();
const _right = new Vector3();
const _p = new Vector3();

export class Rig {
  readonly rig = new Group();
  readonly input: XRInput;
  readonly sword = new Sword();
  readonly shield = new Shield();
  /** What the right hand holds instead of the sword, if anything. */
  private tool: Group | null = null;
  private snapLatched = false;
  private readonly keys = new Set<string>();
  private yaw = 0;
  private pitch = 0;
  /** Things you can't walk into, as floor circles. */
  readonly blocks: { x: number; z: number; r: number }[] = [];

  constructor(
    private readonly renderer: WebGLRenderer,
    readonly camera: PerspectiveCamera,
    private readonly ground: Pick<Ground, 'heightAt' | 'resolve'>,
  ) {
    this.rig.add(camera);
    this.input = new XRInput(renderer, this.rig);
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
    this.input.hands.right.grip.add(this.tool ?? this.sword.model);
    this.input.hands.left.grip.add(this.shield.model);
  }

  /** Put `tool` in the right hand in place of the sword, or the sword back (null). */
  hold(tool: Group | null): void {
    (this.tool ?? this.sword.model).removeFromParent();
    this.tool = tool;
    this.attach();
  }

  /** Stand at (x, z) facing `yaw` (0 looks down −Z). */
  place(x: number, z: number, yaw: number): void {
    this.rig.rotation.set(0, yaw, 0);
    _head.copy(this.camera.position).setY(0).applyAxisAngle(UP, yaw);
    this.rig.position.set(x - _head.x, this.ground.heightAt(x, z), z - _head.z);
    this.yaw = this.pitch = 0;
  }

  update(dt: number): void {
    const xr = this.renderer.xr.isPresenting;
    // Off the headset the grips sit at your feet; keep what they hold out of the desktop view.
    this.input.hands.right.grip.visible = this.input.hands.left.grip.visible = xr;
    if (!xr) {
      this.camera.position.set(0, EYE, 0);
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }
    this.input.update();
    const { left, right } = this.input.hands;
    let sx = left.stickX;
    let sy = left.stickY;
    if (!xr) {
      const k = (...codes: string[]) => (codes.some((c) => this.keys.has(c)) ? 1 : 0);
      sx = k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft');
      sy = k('KeyS', 'ArrowDown') - k('KeyW', 'ArrowUp');
    }
    this.walk(dt, sx, sy);
    this.snapTurn(right.stickX);
    this.collide(dt);
    this.rig.updateMatrixWorld(true);
  }

  private walk(dt: number, sx: number, sy: number): void {
    const { moveSpeed, stickDeadzone } = CONFIG.player;
    if (Math.hypot(sx, sy) < stickDeadzone) return;
    this.camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) return;
    _fwd.normalize();
    _right.crossVectors(_fwd, UP);
    this.rig.position.addScaledVector(_fwd, -sy * moveSpeed * dt).addScaledVector(_right, sx * moveSpeed * dt);
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
    this.ground.resolve(_p, CONFIG.player.bodyRadius);
    for (const b of this.blocks) {
      const dx = _p.x - b.x;
      const dz = _p.z - b.z;
      const min = b.r + CONFIG.player.bodyRadius;
      const d = Math.hypot(dx, dz);
      if (d < min && d > 1e-6) _p.set(b.x + (dx / d) * min, 0, b.z + (dz / d) * min);
    }
    this.rig.position.x += _p.x - _head.x;
    this.rig.position.z += _p.z - _head.z;
    const floor = this.ground.heightAt(_p.x, _p.z);
    this.rig.position.y += (floor - this.rig.position.y) * Math.min(1, dt * 10);
  }
}
