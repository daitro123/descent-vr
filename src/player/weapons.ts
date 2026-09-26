import { Color, Group, Mesh, Object3D, Vector3 } from 'three';
import { CONFIG } from '../config';
import { buildHeaterShield, buildLongsword } from '../models/gear';
import { createModelMaterial } from '../models/materials';

const DEG = Math.PI / 180;
const _zero = new Vector3();

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
  private readonly pivot = new Group();
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
    this.pivot.add(new Mesh(buildLongsword(bladeStart, bladeEnd, bladeHalfWidth), this.material));
    this.localBase = new Vector3(0, 0, -bladeStart);
    this.localTip = new Vector3(0, 0, -bladeEnd);
  }

  update(rig: Object3D, dt: number): void {
    if (!this.model.parent?.visible) {
      this.base.valid = this.tip.valid = false;
      return;
    }
    this.base.sample(this.localBase, this.pivot, rig, dt);
    this.tip.sample(this.localTip, this.pivot, rig, dt);

    // Blade glows blue once it is moving fast enough to deal damage —
    // invaluable while tuning `minHitSpeed`.
    const ready = this.tipSpeed >= CONFIG.sword.minHitSpeed;
    const glow = this.material.telegraph;
    if (ready) glow.copy(this.frenzy ? this.frenzyColor : this.readyColor).multiplyScalar(0.8);
    else if (this.frenzy) glow.copy(this.frenzyColor).multiplyScalar(0.25);
    else glow.setRGB(0, 0, 0);
  }

  /** World-space blade segment (base → tip), this frame. */
  segment(rig: Object3D, outBase: Vector3, outTip: Vector3): void {
    this.base.worldNow(rig, outBase);
    this.tip.worldNow(rig, outTip);
  }

  get tipSpeed(): number {
    return this.tip.velocity.length();
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
