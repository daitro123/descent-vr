import { Mesh, type Object3D, Vector3 } from 'three';
import { CONFIG } from '../../config';
import { ModelBuilder } from '../../models/kit';
import { sharedModelMaterial } from '../../models/materials';
import { PAL } from '../../models/palette';

// The pick in the hand, promoted from ?proto=pick (prototypes/pick/tools.ts,
// which keeps its own copy): the swing gate it shares with the sword, and the
// points on its head that strike. The handle runs out of the fist along the
// grip's −Z, and the head lies across it along ±Y, a point each side, so it
// strikes the same whichever way up it's held.

/** The hand turning back further than this from its travel starts a new swing (as player/swing.ts). */
const TURN_BACK = Math.cos((100 * Math.PI) / 180);
const _dir = new Vector3();

/** A point on a hand-held thing, tracked in rig space so walking and snap turns don't count as swinging. */
export class Tracked {
  readonly rigPos = new Vector3();
  readonly prevRigPos = new Vector3();
  readonly velocity = new Vector3();
  valid = false;

  constructor(readonly local: Vector3) {}

  sample(owner: Object3D, rig: Object3D, dt: number): void {
    this.prevRigPos.copy(this.rigPos);
    rig.worldToLocal(owner.localToWorld(this.rigPos.copy(this.local)));
    if (this.valid && dt > 0) this.velocity.subVectors(this.rigPos, this.prevRigPos).divideScalar(dt);
    else {
      this.prevRigPos.copy(this.rigPos);
      this.velocity.set(0, 0, 0);
    }
    this.valid = true;
  }

  now(rig: Object3D, out: Vector3): Vector3 {
    return rig.localToWorld(out.copy(this.rigPos));
  }

  prev(rig: Object3D, out: Vector3): Vector3 {
    return rig.localToWorld(out.copy(this.prevRigPos));
  }

  get speed(): number {
    return this.velocity.length();
  }
}

/**
 * The sword's rule for a committed swing (player/swing.ts), with its numbers
 * passed in: the hand must travel `travel` m one way at `handSpeed` m/s or
 * more; turning back starts over. `count` goes up with every new swing.
 */
export class Gate {
  committed = false;
  count = 0;
  private active = false;
  private slow = 0;
  private readonly start = new Vector3();
  private readonly dir = new Vector3();

  constructor(
    private readonly travel: number,
    private readonly handSpeed: number,
  ) {}

  update(hand: Vector3, velocity: Vector3, dt: number): void {
    const speed = velocity.length();
    if (speed < this.handSpeed) {
      this.slow += dt;
      if (this.slow > 0.06) this.active = this.committed = false;
      return;
    }
    this.slow = 0;
    _dir.copy(velocity).divideScalar(speed);
    if (!this.active || _dir.dot(this.dir) < TURN_BACK) {
      this.active = true;
      this.committed = false;
      this.count++;
      this.start.copy(hand).addScaledVector(velocity, -dt);
      this.dir.copy(_dir);
    } else this.dir.lerp(_dir, 0.25).normalize();
    if (hand.distanceTo(this.start) >= this.travel) this.committed = true;
  }
}

export class Pick {
  /** Held in the main hand's grip while drawn. */
  readonly model: Mesh;
  readonly hand = new Tracked(new Vector3());
  /** The head's two points. */
  readonly points: readonly Tracked[];
  readonly gate: Gate;

  constructor() {
    const { reach, spike, travel, handSpeed } = CONFIG.professions.pick;
    const handle = reach + 0.12;
    const b = new ModelBuilder(29)
      .cyl(0.017, 0.02, handle, 6, { color: PAL.wood, at: [0, 0, -handle / 2 + 0.08], rot: [Math.PI / 2, 0, 0], jitter: 0.1 })
      .box(0.045, 0.06, 0.05, { color: PAL.iron, at: [0, 0, -reach] })
      .cone(0.022, spike, 5, { color: PAL.iron, at: [0, spike / 2, -reach] })
      .cone(0.022, spike, 5, { color: PAL.iron, at: [0, -spike / 2, -reach], rot: [0, 0, Math.PI] });
    this.model = new Mesh(b.build(), sharedModelMaterial());
    this.model.name = 'pick';
    this.points = [1, -1].map((s) => new Tracked(new Vector3(0, s * spike, -reach)));
    this.gate = new Gate(travel, handSpeed);
  }

  /** One frame of the pick in the hand: its points and the swing. */
  update(rig: Object3D, dt: number): void {
    this.model.updateWorldMatrix(true, false);
    this.hand.sample(this.model, rig, dt);
    for (const p of this.points) p.sample(this.model, rig, dt);
    this.gate.update(this.hand.rigPos, this.hand.velocity, dt);
  }

  /** Just drawn: nothing it did before counts as a swing now. */
  reset(): void {
    this.hand.valid = false;
    for (const p of this.points) p.valid = false;
  }
}
