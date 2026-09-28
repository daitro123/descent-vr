import { Group, type PerspectiveCamera, Vector3, type WebGLRenderer } from 'three';
import { CONFIG } from '../config';
import { sfx } from '../fx/sfx';
import type { Ground } from '../world/ground';
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
  /** Seconds of War Cry frenzy left (bonus damage, burning blade). */
  frenzy = 0;
  dashCooldown = 0;
  private dashTime = 0;
  private dodgeTime = 0;
  private readonly dashVel = new Vector3();
  private snapLatched = false;
  /** Called when a dash starts (the HUD dims the edges for comfort). */
  onDash?: () => void;

  constructor(
    readonly camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    /** What you stand on and bump into: the arena, or a zone. */
    readonly ground: Ground,
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

  /** Head position projected to the ground. */
  feetPosition(out: Vector3): Vector3 {
    this.headPosition(out);
    out.y = this.ground.heightAt(out.x, out.z);
    return out;
  }

  /** What enemy weapons can hit: the head sphere's centre and the torso capsule's axis. */
  body(outHead: Vector3, outTop: Vector3, outBottom: Vector3): void {
    const B = CONFIG.player.body;
    this.headPosition(outHead);
    outTop.copy(outHead);
    outTop.y -= B.torsoTop;
    outBottom.copy(outHead);
    outBottom.y = Math.max(this.ground.heightAt(outHead.x, outHead.z) + 0.2, outHead.y - B.torsoBottom);
    outHead.y -= B.headDrop;
  }

  /** In a dash's dodge frames: blows and arrows pass through. */
  get invulnerable(): boolean {
    return this.dodgeTime > 0;
  }

  update(dt: number): void {
    this.input.update();
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.dodgeTime = Math.max(0, this.dodgeTime - dt);
    if (this.alive) {
      this.locomote(dt);
      this.snapTurn();
      this.dash(dt);
    }
    this.collide(dt);
    this.rig.updateMatrixWorld(true);
    this.sword.update(this.rig, dt);
    this.shield.update(this.rig, dt);
    this.rage = Math.max(0, this.rage - CONFIG.player.rageDecayPerSec * dt);
    this.frenzy = Math.max(0, this.frenzy - dt);
    this.sword.frenzy = this.frenzy > 0;
  }

  /** B / Y: a quick step in the stick's direction, backwards if the stick is neutral. */
  private dash(dt: number): void {
    const D = CONFIG.dash;
    const { left, right } = this.input.hands;
    if ((left.secondaryPressed || right.secondaryPressed) && this.dashCooldown <= 0) {
      this.camera.getWorldDirection(_fwd);
      _fwd.y = 0;
      if (_fwd.lengthSq() > 1e-6) {
        _fwd.normalize();
        _right.crossVectors(_fwd, UP);
        const { stickX, stickY } = left;
        const moving = Math.hypot(stickX, stickY) >= CONFIG.player.stickDeadzone;
        this.dashVel.set(0, 0, 0);
        if (moving) this.dashVel.addScaledVector(_fwd, -stickY).addScaledVector(_right, stickX);
        else this.dashVel.copy(_fwd).negate();
        this.dashVel.normalize().multiplyScalar(D.distance / D.time);
        this.dashTime = D.time;
        this.dodgeTime = D.invulnerable;
        this.dashCooldown = D.cooldown;
        sfx.dash();
        this.onDash?.();
      }
    }
    if (this.dashTime > 0) {
      const step = Math.min(dt, this.dashTime);
      this.rig.position.addScaledVector(this.dashVel, step);
      this.dashTime -= step;
    }
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

  /**
   * Keep the head's floor projection out of walls and pillars (covers
   * room-scale walking too), and the feet on the ground, eased for comfort.
   */
  private collide(dt: number): void {
    this.rig.updateMatrixWorld(true);
    this.feetPosition(_head);
    _resolved.copy(_head);
    if (this.ground.resolve(_resolved, CONFIG.player.bodyRadius)) {
      this.rig.position.x += _resolved.x - _head.x;
      this.rig.position.z += _resolved.z - _head.z;
    }
    const floor = this.ground.heightAt(_resolved.x, _resolved.z);
    this.rig.position.y += (floor - this.rig.position.y) * Math.min(1, dt * 10);
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

  /** Back to full health and nothing charged, standing at (x, z) facing `yaw`. */
  reset(x = 0, z = 0, yaw = 0): void {
    this.hp = CONFIG.player.maxHp;
    this.rage = 0;
    this.frenzy = 0;
    this.dashCooldown = this.dashTime = this.dodgeTime = 0;
    this.shield.numb = 0;
    this.place(x, z, yaw);
  }

  /** Stand at (x, z) on the ground, facing `yaw` (0 looks down −Z), and stop any dash. */
  place(x: number, z: number, yaw: number): void {
    this.dashTime = 0;
    this.rig.position.set(x, this.ground.heightAt(x, z), z);
    this.rig.rotation.set(0, yaw, 0);
  }
}
