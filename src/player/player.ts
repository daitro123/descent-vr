import { Group, type PerspectiveCamera, Vector3, type WebGLRenderer } from 'three';
import { CONFIG } from '../config';
import type { Arena } from '../world/arena';
import { XRInput } from './input';
import { Shield, Sword } from './weapons';

const UP = new Vector3(0, 1, 0);
const _head = new Vector3();
const _fwd = new Vector3();
const _right = new Vector3();
const _resolved = new Vector3();

/**
 * The warrior: XR rig (camera + controllers), locomotion, collision and the
 * sword (right hand) / shield (left hand) loadout.
 */
export class Player {
  readonly rig = new Group();
  readonly input: XRInput;
  readonly sword = new Sword();
  readonly shield = new Shield();
  hp: number = CONFIG.player.maxHp;
  rage = 0;
  private snapLatched = false;

  constructor(
    readonly camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    private readonly arena: Arena,
  ) {
    this.rig.name = 'player-rig';
    this.rig.add(camera);
    this.input = new XRInput(renderer, this.rig);
    this.input.onRemap = () => this.attachWeapons();
    this.attachWeapons();
  }

  private attachWeapons(): void {
    this.input.hands.right.grip.add(this.sword.model);
    this.input.hands.left.grip.add(this.shield.model);
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  /** Head position in world space. */
  headPosition(out: Vector3): Vector3 {
    return this.camera.getWorldPosition(out);
  }

  /** Head position projected to the floor. */
  feetPosition(out: Vector3): Vector3 {
    this.headPosition(out);
    out.y = 0;
    return out;
  }

  update(dt: number): void {
    this.input.update();
    if (this.alive) {
      this.locomote(dt);
      this.snapTurn();
    }
    this.collide();
    this.rig.updateMatrixWorld(true);
    this.sword.update(this.rig, dt);
    this.shield.update(this.rig, dt);
    this.rage = Math.max(0, this.rage - CONFIG.player.rageDecayPerSec * dt);
  }

  private locomote(dt: number): void {
    const { stickX, stickY } = this.input.hands.left;
    const { moveSpeed, stickDeadzone } = CONFIG.player;
    if (Math.hypot(stickX, stickY) < stickDeadzone) return;

    // Head-relative: forward is where you look, flattened to the floor.
    this.camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) return;
    _fwd.normalize();
    _right.crossVectors(_fwd, UP);
    this.rig.position
      .addScaledVector(_fwd, -stickY * moveSpeed * dt)
      .addScaledVector(_right, stickX * moveSpeed * dt);
  }

  private snapTurn(): void {
    const x = this.input.hands.right.stickX;
    if (Math.abs(x) < 0.7) {
      this.snapLatched = false;
      return;
    }
    if (this.snapLatched) return;
    this.snapLatched = true;

    // Rotate the rig about the head, not the rig origin, so the player
    // turns in place rather than orbiting their play-space centre.
    const angle = (-Math.sign(x) * CONFIG.player.snapTurnDeg * Math.PI) / 180;
    this.headPosition(_head);
    this.rig.position.sub(_head).applyAxisAngle(UP, angle).add(_head);
    this.rig.rotation.y += angle;
  }

  /** Keep the head's floor projection out of walls and pillars (covers room-scale walking too). */
  private collide(): void {
    this.rig.updateMatrixWorld(true);
    this.feetPosition(_head);
    _resolved.copy(_head);
    if (this.arena.resolve(_resolved, CONFIG.player.bodyRadius)) {
      this.rig.position.x += _resolved.x - _head.x;
      this.rig.position.z += _resolved.z - _head.z;
    }
  }

  damage(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
    this.input.pulse('left', CONFIG.feel.hapticHurt.intensity, CONFIG.feel.hapticHurt.ms);
    this.input.pulse('right', CONFIG.feel.hapticHurt.intensity, CONFIG.feel.hapticHurt.ms);
  }

  heal(amount: number): void {
    this.hp = Math.min(CONFIG.player.maxHp, this.hp + amount);
  }

  addRage(amount: number): void {
    this.rage = Math.min(CONFIG.player.maxRage, this.rage + amount);
  }

  reset(): void {
    this.hp = CONFIG.player.maxHp;
    this.rage = 0;
    this.rig.position.set(0, 0, 0);
    this.rig.rotation.set(0, 0, 0);
  }
}
