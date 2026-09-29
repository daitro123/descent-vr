import { Color, Group, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import { CONFIG } from '../config';
import { buildHeaterShield, buildLongsword } from '../models/gear';
import { createModelMaterial } from '../models/materials';
import type { Sword as SwordId } from '../quests';
import { SwingDetector } from './swing';

const DEG = Math.PI / 180;
const _zero = new Vector3();
const _gripQ = new Quaternion();
const _rigQ = new Quaternion();
const _handQ = new Quaternion();
const _swingQ = new Quaternion();
const _handP = new Vector3();
const _aim = new Vector3();
const _want = new Vector3();
const _dir = new Vector3();
const _acc = new Vector3();
const IDENTITY = new Quaternion();
/** Longest step of the tip's spring (s): a dropped frame is split so it stays stable. */
const TIP_STEP = 1 / 120;

/**
 * Tracks a point attached to a hand in *rig* space, so velocity reflects the
 * arm's motion and not stick locomotion or snap turns moving the whole rig.
 */
class TrackedPoint {
  readonly rigPos = new Vector3();
  readonly prevRigPos = new Vector3();
  readonly velocity = new Vector3(); // rig space, m/s
  valid = false;

  sample(local: Vector3, owner: Object3D, rig: Object3D, dt: number): void {
    this.prevRigPos.copy(this.rigPos);
    this.rigPos.copy(local);
    owner.localToWorld(this.rigPos);
    rig.worldToLocal(this.rigPos);
    if (this.valid && dt > 0) {
      this.velocity.subVectors(this.rigPos, this.prevRigPos).divideScalar(dt);
    } else {
      this.prevRigPos.copy(this.rigPos);
      this.velocity.set(0, 0, 0);
    }
    this.valid = true;
  }

  worldNow(rig: Object3D, out: Vector3): Vector3 {
    return rig.localToWorld(out.copy(this.rigPos));
  }

  worldPrev(rig: Object3D, out: Vector3): Vector3 {
    return rig.localToWorld(out.copy(this.prevRigPos));
  }
}

export class Sword {
  readonly model = new Group();
  readonly base = new TrackedPoint();
  readonly tip = new TrackedPoint();
  /** The grip origin: where the hand is, for telling a swing from a wiggle. */
  readonly hand = new TrackedPoint();
  readonly swing = new SwingDetector();
  private readonly pivot = new Group();
  /** The sword's mesh: yours, or Hale's once they've handed it to you. */
  private readonly blade: Mesh;
  private look: SwordId = 'plain';
  /** Where the blade points out of the fist, in the model's space. */
  private readonly bladeAxis: Vector3;
  /** The heavy tip (see `follow`): rig-space position and velocity. */
  private readonly tipPos = new Vector3();
  private readonly tipVel = new Vector3();
  private tipValid = false;
  private readonly localBase: Vector3;
  private readonly localTip: Vector3;
  private readonly material = createModelMaterial();
  private readonly readyColor = new Color(0x3a5cff);
  private readonly frenzyColor = new Color(0xff4a10);
  /** War Cry's frenzy buff: the blade burns orange while it lasts. */
  frenzy = false;

  constructor() {
    const { bladeStart, bladeEnd, bladeHalfWidth, pitchDeg } = CONFIG.sword;
    this.pivot.rotation.x = pitchDeg * DEG;
    this.model.add(this.pivot);
    this.blade = new Mesh(buildLongsword(bladeStart, bladeEnd, bladeHalfWidth), this.material);
    this.pivot.add(this.blade);
    this.localBase = new Vector3(0, 0, -bladeStart);
    this.localTip = new Vector3(0, 0, -bladeEnd);
    this.bladeAxis = new Vector3(0, 0, -1).applyEuler(this.pivot.rotation);
  }

  /** Which sword this is. Every sword has the same shape, so it handles alike. */
  get sword(): SwordId {
    return this.look;
  }

  set sword(sword: SwordId) {
    if (sword === this.look) return;
    this.look = sword;
    const { bladeStart, bladeEnd, bladeHalfWidth } = CONFIG.sword;
    this.blade.geometry.dispose();
    this.blade.geometry = buildLongsword(bladeStart, bladeEnd, bladeHalfWidth, sword);
  }

  update(rig: Object3D, dt: number): void {
    const grip = this.model.parent;
    if (!grip?.visible) {
      this.base.valid = this.tip.valid = this.hand.valid = this.tipValid = false;
      this.swing.reset();
      return;
    }
    this.follow(grip, rig, dt);
    this.base.sample(this.localBase, this.pivot, rig, dt);
    this.tip.sample(this.localTip, this.pivot, rig, dt);
    this.hand.sample(_zero, this.model, rig, dt);
    this.swing.update(this.hand.rigPos, this.hand.velocity, dt);

    // Blade glows blue while a swing can deal damage: invaluable while tuning
    // `minHitSpeed` and `minSwingTravel`.
    const glow = this.material.telegraph;
    if (this.hot) glow.copy(this.frenzy ? this.frenzyColor : this.readyColor).multiplyScalar(0.8);
    else if (this.frenzy) glow.copy(this.frenzyColor).multiplyScalar(0.25);
    else glow.setRGB(0, 0, 0);
  }

  /**
   * Weight. The tip is a heavy point on the end of the blade: it chases where
   * the hand points the blade on a critically damped spring, `tipLag` seconds
   * behind, so it trails a fast turn or a quick sweep of the arm and the wrist
   * can't flick it about. It never trails by more than `maxLagDeg`. All in rig
   * space, so snap turns and walking carry the blade along instantly.
   */
  private follow(grip: Object3D, rig: Object3D, dt: number): void {
    const { tipLag, maxLagDeg, bladeEnd } = CONFIG.sword;
    grip.getWorldQuaternion(_gripQ);
    rig.getWorldQuaternion(_rigQ);
    _handQ.copy(_rigQ).invert().multiply(_gripQ); // the hand's turn, in rig space
    rig.worldToLocal(grip.getWorldPosition(_handP));
    _aim.copy(this.bladeAxis).applyQuaternion(_handQ); // where the hand points the blade
    _want.copy(_handP).addScaledVector(_aim, bladeEnd);
    if (!this.tipValid || tipLag <= 0) {
      this.tipPos.copy(_want);
      this.tipVel.set(0, 0, 0);
      this.tipValid = true;
    } else {
      const w = 2 / tipLag;
      const steps = Math.ceil(dt / TIP_STEP);
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        _acc.subVectors(_want, this.tipPos).multiplyScalar(w * w).addScaledVector(this.tipVel, -2 * w);
        this.tipVel.addScaledVector(_acc, h);
        this.tipPos.addScaledVector(this.tipVel, h);
      }
      // Back onto the blade: its length from the hand, at most maxLagDeg off the aim.
      _dir.subVectors(this.tipPos, _handP);
      if (_dir.lengthSq() < 1e-8) _dir.copy(_aim);
      _dir.normalize();
      const off = _dir.angleTo(_aim);
      const max = maxLagDeg * DEG;
      if (off > max) {
        _swingQ.setFromUnitVectors(_aim, _dir).slerp(IDENTITY, 1 - max / off);
        _dir.copy(_aim).applyQuaternion(_swingQ);
      }
      this.tipPos.copy(_handP).addScaledVector(_dir, bladeEnd);
    }
    // Swing the blade from where the hand points it to where the tip is, then
    // undo the hand's own turn: grip⁻¹ · rig · swing · hand.
    _dir.subVectors(this.tipPos, _handP).normalize();
    _swingQ.setFromUnitVectors(_aim, _dir).multiply(_handQ);
    this.model.quaternion.copy(_gripQ).invert().multiply(_rigQ).multiply(_swingQ);
    this.model.updateMatrixWorld(true);
  }

  /** World-space blade segment (base → tip), this frame. */
  segment(rig: Object3D, outBase: Vector3, outTip: Vector3): void {
    this.base.worldNow(rig, outBase);
    this.tip.worldNow(rig, outTip);
  }

  get tipSpeed(): number {
    return this.tip.velocity.length();
  }

  /** A committed swing (see SwingDetector) with the tip at damage speed: this blade hurts. */
  get hot(): boolean {
    return this.swing.committed && this.tipSpeed >= CONFIG.sword.minHitSpeed;
  }
}

export class Shield {
  readonly model = new Group();
  readonly centre = new TrackedPoint();
  /** The block volume (a box of CONFIG.shield size); test against it in its local space. */
  readonly board = new Object3D();
  private readonly material = createModelMaterial();
  private flashTimer = 0;
  private flashColor = new Color(1, 0.9, 0.5);
  /** Seconds the shield arm is numb after a guard break; it can't block meanwhile. */
  numb = 0;

  constructor() {
    const { width, height, depth, forwardOffset, pitchDeg } = CONFIG.shield;
    const pivot = new Group();
    pivot.rotation.x = pitchDeg * DEG;
    this.model.add(pivot);
    // Centre-grip heater: the fist holds a bar behind the boss, so the board
    // sits just in front of the knuckles, face along the pivot's -Z.
    this.board.position.set(0, 0, -forwardOffset);
    this.board.add(new Mesh(buildHeaterShield(width, height, depth), this.material));
    pivot.add(this.board);
  }

  update(rig: Object3D, dt: number): void {
    if (!this.model.parent?.visible) {
      this.centre.valid = false;
      return;
    }
    this.centre.sample(_zero, this.board, rig, dt);
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.numb = Math.max(0, this.numb - dt);
    this.material.emissive.copy(this.flashColor).multiplyScalar(this.flashTimer * 3);
    // A numb shield sags visibly so the player knows it won't block.
    this.model.rotation.x = -0.6 * Math.min(1, this.numb * 3);
  }

  flash(color = 0xffe680): void {
    this.flashColor.setHex(color);
    this.flashTimer = 0.2;
  }

  get tracked(): boolean {
    return this.centre.valid;
  }

  get canBlock(): boolean {
    return this.centre.valid && this.numb <= 0;
  }
}
