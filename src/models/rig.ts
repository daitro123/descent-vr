import { Bone, type BufferGeometry, type Material, type Matrix4, Skeleton, SkinnedMesh, Vector3 } from 'three';
import { ModelBuilder } from './kit';

// A humanoid skeleton shared by every enemy. The character faces +Z, so its
// right side is -X. Rotations use Euler order YXZ, which makes poses readable:
//   arms (hanging along -Y):  x < 0 raises forward, y swings the raised arm
//                             round the body (+ toward the character's left),
//                             z abducts (right arm: z < 0 lifts it outward)
//   legs:                     x < 0 swings forward;  shins: x > 0 bends the knee
//   spine:                    x > 0 leans forward;   y < 0 turns the chest to its right
// Weapons are held along the hand's -Y (continuing the arm), cutting edge
// facing -Z: down in the guard, leading on the chop, and leading on the slashes
// once their pose rolls the hand (poses.ts).

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
  /** Skull scale (moves the jaw hinge). Default 1. */
  head?: number;
  /** Head pivot pushed forward, for hunched brutes. Default 0. */
  headZ?: number;
}

/** Bone name → Euler (YXZ) offset from the bind pose. Missing bones stay at bind. */
export type Pose = Partial<Record<BoneName, readonly [number, number, number]>>;

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
};

function bindOffsets(p: Proportions): Record<BoneName, [number, number, number]> {
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
  };
}

export interface DressContext {
  p: Proportions;
  /** Author subsequent parts in this bone's local (bind) space. */
  on(bone: BoneName): ModelBuilder;
  /** A point in a bone's local space, in model space (for stretch parts). */
  point(bone: BoneName, x: number, y: number, z: number): Vector3;
  builder: ModelBuilder;
  index(bone: BoneName): number;
}

export type Dresser = (ctx: DressContext) => void;

/** The bones of a body with these proportions, each at bind and hung from its parent. */
function skeletonOf(p: Proportions): Record<BoneName, Bone> {
  const offsets = bindOffsets(p);
  const bones = {} as Record<BoneName, Bone>;
  for (const name of BONES) {
    const bone = new Bone();
    bone.name = name;
    bone.rotation.order = 'YXZ';
    bone.position.set(...offsets[name]);
    bones[name] = bone;
    const parent = PARENT[name];
    if (parent) bones[parent].add(bone);
  }
  bones.hips.updateMatrixWorld(true);
  return bones;
}

/**
 * Each bone's place in a body of these proportions standing in `pose`, with
 * nothing built: for a dresser that fits a part to a pose, as the crossbow's
 * stock is laid from the fist to the cheek at full draw.
 */
export function posedBones(p: Proportions, pose: Pose): Record<BoneName, Matrix4> {
  const bones = skeletonOf(p);
  for (const name of BONES) {
    const r = pose[name];
    if (r) bones[name].rotation.set(r[0], r[1], r[2]);
  }
  bones.hips.updateMatrixWorld(true);
  const out = {} as Record<BoneName, Matrix4>;
  for (const name of BONES) out[name] = bones[name].matrixWorld.clone();
  return out;
}

/**
 * A rigidly skinned humanoid: one SkinnedMesh, one draw call. `dress` adds the
 * parts, each authored in its bone's local space via `on(bone)`. Or, given
 * another rig's `geometry` with the same proportions, it wears that instead
 * of building its own: people dressed alike share one copy (people/cast.ts).
 */
export class Rig {
  readonly mesh: SkinnedMesh;
  readonly bones: Record<BoneName, Bone>;
  readonly proportions: Proportions;
  private readonly bind: Record<BoneName, Vector3>;

  constructor(p: Proportions, dress: Dresser | BufferGeometry, material?: Material, seed = 1) {
    this.proportions = p;
    const bones = skeletonOf(p);
    const bind = {} as Record<BoneName, Vector3>;
    for (const name of BONES) bind[name] = bones[name].position.clone();

    let geometry: BufferGeometry;
    if (typeof dress === 'function') {
      const builder = new ModelBuilder(seed);
      dress({
        p,
        builder,
        on: (name) => builder.on(BONES.indexOf(name), bones[name].matrixWorld),
        point: (name, x, y, z) => new Vector3(x, y, z).applyMatrix4(bones[name].matrixWorld),
        index: (name) => BONES.indexOf(name),
      });
      geometry = builder.build({ skinned: true, ao: { from: 0, to: p.hipY, min: 0.55 } });
    } else geometry = dress;

    this.mesh = new SkinnedMesh(geometry, material);
    this.mesh.add(bones.hips);
    this.mesh.bind(new Skeleton(BONES.map((n) => bones[n])));
    // Bones swing well outside the bind-pose bounds (and scatter on death).
    this.mesh.frustumCulled = false;
    this.bones = bones;
    this.bind = bind;
  }

  /**
   * Leave it undrawn while it's out of view: it's culled by a sphere `pad` m
   * wider than its body at bind, room for its arms to swing and what it holds
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

  /** Set every bone from a pose; bones the pose omits return to bind. */
  apply(pose: Pose): void {
    for (const name of BONES) {
      const r = pose[name];
      if (r) this.bones[name].rotation.set(r[0], r[1], r[2]);
      else this.bones[name].rotation.set(0, 0, 0);
    }
  }

  /** Hip offset from bind (bob, crouch, lunge), in the rig's space. */
  setHipOffset(x: number, y: number, z: number): void {
    const b = this.bind.hips;
    this.bones.hips.position.set(b.x + x, b.y + y, b.z + z);
  }

  resetBones(): void {
    for (const name of BONES) {
      const bone = this.bones[name];
      bone.position.copy(this.bind[name]);
      bone.rotation.set(0, 0, 0);
    }
  }
}

/** Linear blend of two poses into `out` (per-component Euler lerp; predictable arcs). */
export function blendPoses(a: Pose, b: Pose, t: number, out: Record<string, [number, number, number]>): Pose {
  for (const name of BONES) {
    const ra = a[name];
    const rb = b[name];
    if (!ra && !rb) {
      delete out[name];
      continue;
    }
    const o = (out[name] ??= [0, 0, 0]);
    for (let i = 0; i < 3; i++) o[i] = (ra?.[i] ?? 0) + ((rb?.[i] ?? 0) - (ra?.[i] ?? 0)) * t;
  }
  return out as Pose;
}
