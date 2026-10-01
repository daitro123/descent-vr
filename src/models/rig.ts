import { Bone, type BufferGeometry, type Material, Skeleton, SkinnedMesh, Vector3 } from 'three';
import { ModelBuilder, type Vec3 } from './kit';

// Every character is a rig: a skeleton of bones, and one rigidly skinned mesh
// dressed onto it from primitives (kit.ts), so a whole animated body is one
// draw call. A skeleton is data (`SkeletonDef`): its bones in skinning order,
// each one's parent, and where each sits on its parent at bind for a body of
// given proportions. `SkeletonRig` builds any of them; `Rig` is the humanoid
// every person and skeleton wears, and quadruped.ts holds the four-legged one.
//
// Every skeleton faces +Z with its left on +X, and turns its bones in Euler
// order YXZ from bind, so a pose reads the same on any of them: x < 0 swings a
// hanging limb forward and x > 0 pitches a forward-pointing one (a neck, a
// head, a jaw) down; y turns about the vertical; z rolls. A skeleton may turn
// some bones at bind already (an elder's stoop), and every pose turns on from
// there.
//
// The humanoid, in particular:
//   arms (hanging along -Y):  x < 0 raises forward, y swings the raised arm
//                             round the body (+ toward the character's left),
//                             z abducts (right arm: z < 0 lifts it outward)
//   legs:                     x < 0 swings forward;  shins: x > 0 bends the knee
//   feet (at the ankle):      x > 0 points the toe down
//   spine:                    x > 0 leans forward;   y < 0 turns the chest to its right
// The feet came last, for the people's walk (people/walk.ts): the human
// body's soles hang from them; the skeletons' feet are still on their shins.
// Weapons are held along the hand's -Y (continuing the arm), cutting edge
// facing -Z: down in the guard, leading on the chop, and leading on the slashes
// once their pose rolls the hand (poses.ts).

/** One bone's turn from bind: Euler angles in radians, order YXZ. */
export type Turn = readonly [number, number, number];

/** A pose on a skeleton with bones `B`: bone name → its turn from bind. Missing bones stay at bind. */
export type PoseOf<B extends string> = Partial<Record<B, Turn>>;

/**
 * A skeleton: which bones, how they hang together, and where each sits at bind
 * for a body of proportions `P` (bone lengths, widths, heights).
 */
export interface SkeletonDef<B extends string, P> {
  /** Its name, for the checks and the log. */
  readonly name: string;
  /** Every bone, in skinning order; the first is the root, the one `setHipOffset` moves. */
  readonly bones: readonly B[];
  /** Each bone's parent; only the root has none. */
  readonly parent: Readonly<Record<B, B | null>>;
  /** Each bone's offset from its parent at bind (the root's from the feet's floor), in metres. */
  offsets(p: P): Record<B, Vec3>;
  /** Bones already turned at bind, which every pose turns on from (an elder's stoop). Default none. */
  turns?(p: P): PoseOf<B>;
  /** Bones scaled at bind, and all that's dressed on them (a child's bigger head). Default none. */
  scales?(p: P): Partial<Record<B, number>>;
  /** How high the baked shading reaches: parts darken toward the floor below this. */
  shadeTo(p: P): number;
}

/** How a dresser adds parts to a rig on skeleton `B`. */
export interface DressContextOf<B extends string, P> {
  p: P;
  /** Author subsequent parts in this bone's local (bind) space. */
  on(bone: B): ModelBuilder;
  /** A point in a bone's local space, in model space (for stretch parts). */
  point(bone: B, x: number, y: number, z: number): Vector3;
  builder: ModelBuilder;
  index(bone: B): number;
}

export type DresserOf<B extends string, P> = (ctx: DressContextOf<B, P>) => void;

/**
 * A rigidly skinned body on any skeleton: one SkinnedMesh, one draw call.
 * `dress` adds the parts, each authored in its bone's local space via
 * `on(bone)`. Or, given another rig's `geometry` on the same skeleton and
 * proportions, it wears that instead of building its own: bodies dressed alike
 * share one copy (people/cast.ts, animals).
 */
export class SkeletonRig<B extends string, P> {
  readonly mesh: SkinnedMesh;
  readonly bones: Record<B, Bone>;
  readonly proportions: P;
  private readonly bind: Record<B, Vector3>;
  private readonly turns: PoseOf<B>;

  constructor(
    readonly skeleton: SkeletonDef<B, P>,
    p: P,
    dress: DresserOf<B, P> | BufferGeometry,
    material?: Material,
    seed = 1,
  ) {
    this.proportions = p;
    const { bones: names, parent } = skeleton;
    const offsets = skeleton.offsets(p);
    const turns: PoseOf<B> = skeleton.turns?.(p) ?? {};
    const scales: Partial<Record<B, number>> = skeleton.scales?.(p) ?? {};
    const bones = {} as Record<B, Bone>;
    const bind = {} as Record<B, Vector3>;
    for (const name of names) {
      const bone = new Bone();
      bone.name = name;
      bone.rotation.order = 'YXZ';
      const [x, y, z] = offsets[name];
      bone.position.set(x, y, z);
      const turn = turns[name];
      if (turn) bone.rotation.set(turn[0], turn[1], turn[2]);
      bone.scale.setScalar(scales[name] ?? 1);
      bind[name] = bone.position.clone();
      bones[name] = bone;
      const up = parent[name];
      if (up) bones[up].add(bone);
    }
    const root = bones[names[0]];
    root.updateMatrixWorld(true);

    let geometry: BufferGeometry;
    if (typeof dress === 'function') {
      const builder = new ModelBuilder(seed);
      dress({
        p,
        builder,
        on: (name) => builder.on(names.indexOf(name), bones[name].matrixWorld),
        point: (name, x, y, z) => new Vector3(x, y, z).applyMatrix4(bones[name].matrixWorld),
        index: (name) => names.indexOf(name),
      });
      geometry = builder.build({ skinned: true, ao: { from: 0, to: skeleton.shadeTo(p), min: 0.55 } });
    } else geometry = dress;

    this.mesh = new SkinnedMesh(geometry, material);
    this.mesh.add(root);
    this.mesh.bind(new Skeleton(names.map((n) => bones[n])));
    // Bones swing well outside the bind-pose bounds (and scatter on death).
    this.mesh.frustumCulled = false;
    this.bones = bones;
    this.bind = bind;
    this.turns = turns;
  }

  /** Its bones in skinning order. */
  get boneNames(): readonly B[] {
    return this.skeleton.bones;
  }

  /**
   * Leave it undrawn while it's out of view: it's culled by a sphere `pad` m
   * wider than its body at bind, room for its limbs to swing and what it holds
   * to move. (Enemies stay uncullable: they scatter as they fall.)
   */
  cullOutside(pad: number): void {
    const geometry = this.mesh.geometry;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere!.clone();
    sphere.radius += pad;
    this.mesh.boundingSphere = sphere;
    this.mesh.frustumCulled = true;
  }

  /** What the body costs to draw. */
  get triangles(): number {
    return this.mesh.geometry.getAttribute('position').count / 3;
  }

  /** Set every bone from a pose, turned on from bind (a stoop stays stooped); bones the pose omits return to bind. */
  apply(pose: PoseOf<B>): void {
    for (const name of this.skeleton.bones) {
      const r = pose[name];
      const b = this.turns[name];
      if (b) this.bones[name].rotation.set(b[0] + (r?.[0] ?? 0), b[1] + (r?.[1] ?? 0), b[2] + (r?.[2] ?? 0));
      else if (r) this.bones[name].rotation.set(r[0], r[1], r[2]);
      else this.bones[name].rotation.set(0, 0, 0);
    }
  }

  /** The root's offset from bind (bob, crouch, lunge), in the rig's space. */
  setHipOffset(x: number, y: number, z: number): void {
    const root = this.skeleton.bones[0];
    const b = this.bind[root];
    this.bones[root].position.set(b.x + x, b.y + y, b.z + z);
  }

  resetBones(): void {
    for (const name of this.skeleton.bones) {
      const bone = this.bones[name];
      bone.position.copy(this.bind[name]);
      const b = this.turns[name];
      bone.rotation.set(b?.[0] ?? 0, b?.[1] ?? 0, b?.[2] ?? 0);
    }
  }
}

// ---------------------------------------------------------------- the humanoid

export const BONES = [
  'hips',
  'spine',
  'head',
  'jaw',
  'upperArmL',
  'forearmL',
  'handL',
  'upperArmR',
  'forearmR',
  'handR',
  'thighL',
  'shinL',
  'thighR',
  'shinR',
  'footL',
  'footR',
] as const;
export type BoneName = (typeof BONES)[number];

export interface Proportions {
  hipY: number; // hip joint height
  hipW: number; // half-width between hip joints
  spine: number; // lower-back pivot → shoulder line
  shoulderW: number; // half-width between shoulder joints
  neck: number; // spine pivot → head pivot
  upperArm: number;
  forearm: number;
  thigh: number;
  shin: number;
  /** Where the jaw hinges, as a share of an average skull (the skeletons draw their skulls this big). Default 1. */
  head?: number;
  /** Head pivot pushed forward, for hunched brutes. Default 0. */
  headZ?: number;
  /**
   * The back bent forward at the waist, rad, at bind: an elder's stoop. The
   * arms still hang and the face still looks ahead, and every pose plays on
   * top of it. Default 0.
   */
  stoop?: number;
  /** The head, and all that's on it, scaled at bind: a child's head is a bigger share of them. Default 1. */
  headSize?: number;
}

/** A humanoid pose: bone name → Euler (YXZ) offset from the bind pose. Missing bones stay at bind. */
export type Pose = PoseOf<BoneName>;

const PARENT: Record<BoneName, BoneName | null> = {
  hips: null,
  spine: 'hips',
  head: 'spine',
  jaw: 'head',
  upperArmL: 'spine',
  forearmL: 'upperArmL',
  handL: 'forearmL',
  upperArmR: 'spine',
  forearmR: 'upperArmR',
  handR: 'forearmR',
  thighL: 'hips',
  shinL: 'thighL',
  thighR: 'hips',
  shinR: 'thighR',
  footL: 'shinL',
  footR: 'shinR',
};

function bindOffsets(p: Proportions): Record<BoneName, Vec3> {
  return {
    hips: [0, p.hipY, 0],
    spine: [0, 0.06, 0],
    head: [0, p.neck, p.headZ ?? 0],
    jaw: [0, 0.02 * (p.head ?? 1), 0.05 * (p.head ?? 1)],
    upperArmL: [p.shoulderW, p.spine, 0],
    forearmL: [0, -p.upperArm, 0],
    handL: [0, -p.forearm, 0],
    upperArmR: [-p.shoulderW, p.spine, 0],
    forearmR: [0, -p.upperArm, 0],
    handR: [0, -p.forearm, 0],
    thighL: [p.hipW, -0.02, 0],
    shinL: [0, -p.thigh, 0],
    thighR: [-p.hipW, -0.02, 0],
    shinR: [0, -p.thigh, 0],
    footL: [0, -p.shin, 0],
    footR: [0, -p.shin, 0],
  };
}

/** The stoop: the back bent at bind, the head and arms turned back to hang and look as they did. */
function bindTurns(p: Proportions): Pose {
  const s = p.stoop ?? 0;
  if (!s) return {};
  return { spine: [s, 0, 0], head: [-s, 0, 0], upperArmL: [-s, 0, 0], upperArmR: [-s, 0, 0] };
}

/** The humanoid skeleton: hips, spine, head and jaw, two arms and two legs, and feet. */
export const HUMANOID: SkeletonDef<BoneName, Proportions> = {
  name: 'humanoid',
  bones: BONES,
  parent: PARENT,
  offsets: bindOffsets,
  turns: bindTurns,
  // A bigger head scales its face, hair and hat, and the jaw with it.
  scales: (p) => (p.headSize ? { head: p.headSize } : {}),
  shadeTo: (p) => p.hipY,
};

export type DressContext = DressContextOf<BoneName, Proportions>;
export type Dresser = DresserOf<BoneName, Proportions>;

/**
 * A rigidly skinned humanoid: one SkinnedMesh, one draw call. `dress` adds the
 * parts, each authored in its bone's local space via `on(bone)`. Or, given
 * another rig's `geometry` with the same proportions, it wears that instead
 * of building its own: people dressed alike share one copy (people/cast.ts).
 */
export class Rig extends SkeletonRig<BoneName, Proportions> {
  constructor(p: Proportions, dress: Dresser | BufferGeometry, material?: Material, seed = 1) {
    super(HUMANOID, p, dress, material, seed);
  }
}

/**
 * Linear blend of two poses into `out` (per-component Euler lerp; predictable
 * arcs), over `bones`: the humanoid's unless another skeleton's are given.
 */
export function blendPoses<B extends string = BoneName>(
  a: PoseOf<B>,
  b: PoseOf<B>,
  t: number,
  out: Record<string, [number, number, number]>,
  bones: readonly B[] = BONES as readonly string[] as readonly B[],
): PoseOf<B> {
  for (const name of bones) {
    const ra = a[name];
    const rb = b[name];
    if (!ra && !rb) {
      delete out[name];
      continue;
    }
    const o = (out[name] ??= [0, 0, 0]);
    for (let i = 0; i < 3; i++) o[i] = (ra?.[i] ?? 0) + ((rb?.[i] ?? 0) - (ra?.[i] ?? 0)) * t;
  }
  return out as unknown as PoseOf<B>;
}
