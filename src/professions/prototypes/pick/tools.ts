import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  type Object3D,
  type PerspectiveCamera,
  TorusGeometry,
  Vector3,
} from 'three';

// PROTOTYPE (?proto=pick): the pick, the herb knife, the swing gate they share
// with the sword, and the tool loop behind the right hip they hang on
// (professions ticket 02). Throwaway.

const Y = new Vector3(0, 1, 0);
const _v = new Vector3();
const _dir = new Vector3();
/** The hand turning back further than this from its travel starts a new swing (as player/swing.ts). */
const TURN_BACK = Math.cos((100 * Math.PI) / 180);

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
 * passed in: the hand must travel `travel` metres one way at `handSpeed` or
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

export type ToolKind = 'pick' | 'knife';

/** Numbers to tune on the headset. */
export const TOOLS = {
  pick: {
    /** Where the head's two points are, from the hand (m along the handle, and either side of it). */
    reach: 0.5,
    spike: 0.17,
    /** The sword's gate: 0.2 m of hand travel at 1 m/s… */
    travel: 0.2,
    handSpeed: 1.0,
    /** …and the head's point at 2.5 m/s (the sword's tip wants 2.8, a metre out; the pick's head is half as far). */
    minSpeed: 2.5,
    /** Power 1 at this speed. */
    fullSpeed: 4.5,
  },
  knife: {
    bladeStart: 0.1,
    bladeEnd: 0.3,
    travel: 0.1,
    handSpeed: 0.6,
    minSpeed: 1.4,
  },
};

const wood = new MeshLambertMaterial({ color: 0x7a5232, flatShading: true });
const iron = new MeshLambertMaterial({ color: 0x8d949c, flatShading: true });
const leather = new MeshLambertMaterial({ color: 0x4a3222, flatShading: true });
const steel = new MeshLambertMaterial({ color: 0xc9d0d6, flatShading: true });

/**
 * The pick in the hand: the handle runs out of the fist along grip −Z, and the
 * head lies across it along grip ±Y, a point each side, so it strikes the same
 * whichever way up it's held.
 */
export class Pick {
  readonly model = new Group();
  readonly hand = new Tracked(new Vector3());
  /** The head's two points. */
  readonly points: Tracked[];
  readonly gate = new Gate(TOOLS.pick.travel, TOOLS.pick.handSpeed);

  constructor() {
    const { reach, spike } = TOOLS.pick;
    const handle = new Mesh(new CylinderGeometry(0.017, 0.02, reach + 0.12, 6), wood);
    handle.rotation.x = Math.PI / 2;
    handle.position.z = -(reach + 0.12) / 2 + 0.08;
    const head = new Group();
    head.position.z = -reach;
    head.add(new Mesh(new BoxGeometry(0.045, 0.06, 0.05), iron));
    for (const s of [1, -1]) {
      const arm = new Mesh(new ConeGeometry(0.022, spike, 5), iron);
      arm.position.y = (s * spike) / 2;
      if (s < 0) arm.rotation.z = Math.PI;
      head.add(arm);
    }
    this.model.add(handle, head);
    this.points = [1, -1].map((s) => new Tracked(new Vector3(0, s * spike, -reach)));
  }

  update(rig: Object3D, dt: number): void {
    this.hand.sample(this.model, rig, dt);
    for (const p of this.points) p.sample(this.model, rig, dt);
    this.gate.update(this.hand.rigPos, this.hand.velocity, dt);
  }

  reset(): void {
    this.hand.valid = false;
    for (const p of this.points) p.valid = false;
  }
}

/** The herb knife: a short blade straight out of the fist. */
export class Knife {
  readonly model = new Group();
  readonly hand = new Tracked(new Vector3());
  /** Points along the edge, base to tip. */
  readonly points: Tracked[];
  readonly gate = new Gate(TOOLS.knife.travel, TOOLS.knife.handSpeed);

  constructor() {
    const { bladeStart, bladeEnd } = TOOLS.knife;
    const grip = new Mesh(new CylinderGeometry(0.016, 0.018, 0.12, 6), leather);
    grip.rotation.x = Math.PI / 2;
    grip.position.z = -0.01;
    const blade = new Mesh(new BoxGeometry(0.006, 0.035, bladeEnd - bladeStart), steel);
    blade.position.z = -(bladeStart + bladeEnd) / 2;
    const tip = new Mesh(new ConeGeometry(0.018, 0.04, 4), steel);
    tip.rotation.x = -Math.PI / 2;
    tip.scale.set(0.35, 1, 1);
    tip.position.z = -bladeEnd - 0.02;
    this.model.add(grip, blade, tip);
    this.points = [0, 0.33, 0.66, 1].map((t) => new Tracked(new Vector3(0, 0, -(bladeStart + (bladeEnd - bladeStart) * t))));
  }

  get tip(): Tracked {
    return this.points[this.points.length - 1];
  }

  update(rig: Object3D, dt: number): void {
    this.hand.sample(this.model, rig, dt);
    for (const p of this.points) p.sample(this.model, rig, dt);
    this.gate.update(this.hand.rigPos, this.hand.velocity, dt);
  }

  reset(): void {
    this.hand.valid = false;
    for (const p of this.points) p.valid = false;
  }
}

/**
 * The tool loop behind the right hip (ticket 02): a sphere placed from the
 * headset (its height and a smoothed yaw), about 20 cm behind where the potion
 * slot will sit. It glows and ticks when the right hand comes in.
 */
export class ToolLoop {
  readonly root = new Group();
  static readonly RADIUS = 0.12;
  /** From the head, in its yaw's frame: right, down, back (+Z is behind you). */
  private static readonly OFFSET = new Vector3(0.19, -0.66, 0.16);
  private yaw = 0;
  private placed = false;
  private readonly ring: Mesh<TorusGeometry, MeshLambertMaterial>;
  private readonly handles: Group[] = [];
  private inside = false;

  constructor() {
    this.ring = new Mesh(new TorusGeometry(0.06, 0.009, 5, 12), new MeshLambertMaterial({ color: 0x5a3c26, flatShading: true }));
    this.ring.rotation.x = Math.PI / 2;
    this.root.add(this.ring);
    // What hangs there: the pick's handle and the knife's, butts up, so a glance down finds them.
    const pick = new Group();
    const shaft = new Mesh(new CylinderGeometry(0.015, 0.017, 0.22, 6), wood);
    shaft.position.y = 0.02;
    const knob = new Mesh(new BoxGeometry(0.03, 0.03, 0.05), iron);
    knob.position.y = -0.1;
    pick.add(shaft, knob);
    pick.position.x = 0.025;
    const knife = new Group();
    const hilt = new Mesh(new CylinderGeometry(0.014, 0.014, 0.1, 6), leather);
    hilt.position.y = 0.03;
    knife.add(hilt);
    knife.position.x = -0.03;
    this.handles.push(pick, knife);
    this.root.add(pick, knife);
  }

  /** Follow the head. */
  update(camera: PerspectiveCamera, dt: number): void {
    camera.getWorldDirection(_dir);
    const want = Math.atan2(-_dir.x, -_dir.z);
    if (!this.placed) this.yaw = want;
    let d = want - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 4);
    camera.getWorldPosition(_v);
    this.root.position.copy(ToolLoop.OFFSET).applyAxisAngle(Y, this.yaw).add(_v);
    this.root.rotation.y = this.yaw;
    this.placed = true;
  }

  /** Is `hand` (world) in the loop? Lights it, and says whether it just came in. */
  touch(hand: Vector3 | null): { inside: boolean; entered: boolean } {
    const inside = !!hand && hand.distanceTo(this.root.position) < ToolLoop.RADIUS;
    const entered = inside && !this.inside;
    this.inside = inside;
    this.ring.material.emissive.setHex(inside ? 0x806030 : 0x000000);
    return { inside, entered };
  }

  /** Show which tools hang there (the one in your hand doesn't). */
  showHanging(drawn: ToolKind | null): void {
    this.handles[0].visible = drawn !== 'pick';
    this.handles[1].visible = drawn !== 'knife';
  }
}
