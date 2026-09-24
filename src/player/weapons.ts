import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshLambertMaterial,
  type Object3D,
  Vector3,
} from 'three';
import { CONFIG } from '../config';

const DEG = Math.PI / 180;

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
  private readonly bladeMat = new MeshLambertMaterial({ color: 0xc8ccd4 });
  private readonly readyColor = new Color(0x5a7cff);

  constructor() {
    const { bladeStart, bladeEnd, bladeHalfWidth, pitchDeg } = CONFIG.sword;
    this.pivot.rotation.x = pitchDeg * DEG;
    this.model.add(this.pivot);

    const bladeLen = bladeEnd - bladeStart;
    const blade = new Mesh(new BoxGeometry(bladeHalfWidth * 2, 0.012, bladeLen), this.bladeMat);
    blade.position.z = -(bladeStart + bladeLen / 2);
    const guard = new Mesh(
      new BoxGeometry(0.2, 0.03, 0.03),
      new MeshLambertMaterial({ color: 0x8a6a2a }),
    );
    guard.position.z = -bladeStart;
    const handle = new Mesh(
      new BoxGeometry(0.03, 0.03, 0.18),
      new MeshLambertMaterial({ color: 0x4a3020 }),
    );
    handle.position.z = -bladeStart + 0.1;
    this.pivot.add(blade, guard, handle);

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
    this.bladeMat.emissive.copy(ready ? this.readyColor : this.bladeMat.color).multiplyScalar(ready ? 0.6 : 0);
  }

  get tipSpeed(): number {
    return this.tip.velocity.length();
  }
}

export class Shield {
  readonly model = new Group();
  readonly centre = new TrackedPoint();
  /** The block volume; test against it in its local space. */
  readonly board: Mesh;
  private readonly material = new MeshLambertMaterial({ color: 0x6b4a2b });
  private flashTimer = 0;

  constructor() {
    const { width, height, depth, forwardOffset, pitchDeg } = CONFIG.shield;
    const pivot = new Group();
    pivot.rotation.x = pitchDeg * DEG;
    this.model.add(pivot);
    // Centre-grip buckler: the fist holds a bar behind the boss, so the board
    // sits just in front of the knuckles, face along the pivot's -Z.
    this.board = new Mesh(new BoxGeometry(width, height, depth), this.material);
    this.board.position.set(0, 0, -forwardOffset);
    const boss = new Mesh(
      new BoxGeometry(0.12, 0.12, 0.04),
      new MeshLambertMaterial({ color: 0x9a9aa0 }),
    );
    boss.position.z = -depth / 2 - 0.02;
    this.board.add(boss);
    pivot.add(this.board);
  }

  update(rig: Object3D, dt: number): void {
    if (!this.model.parent?.visible) {
      this.centre.valid = false;
      return;
    }
    this.centre.sample(new Vector3(), this.board, rig, dt);
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.material.emissive.setRGB(1, 0.9, 0.5).multiplyScalar(this.flashTimer * 4);
  }

  flash(): void {
    this.flashTimer = 0.2;
  }

  get tracked(): boolean {
    return this.centre.valid;
  }
}
