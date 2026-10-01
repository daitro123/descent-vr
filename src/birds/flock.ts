import { type BufferGeometry, DetachedBindMode, type Material, Matrix4, Skeleton, SkinnedMesh, Sphere } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { B, BIRD_BONE_COUNT, BIRD_LOOKS, BIRD_PARENT, type BirdLookId, birdBind, birdOffsets, buildBird } from '../models/bird';

// A flock as one mesh: every bird's parts merged into one skinned geometry,
// each bird with its own ten bones, so a flock of ten pigeons is one draw
// call, as one bird is. The bones aren't objects in the scene: each frame the
// flock writes every bone's matrix straight into the skeleton's texture from
// where its bird is and how it's posed, and only for a flock that was drawn
// last frame (one that isn't costs nothing but its birds' brains). A bird
// can be hidden (a grouse down in the heather) by folding its bones to a
// point. The mesh stands at the world's origin; its bounding sphere follows
// the birds, so a flock out of view isn't drawn.

/** How many numbers a pose holds: an Euler (YXZ) per bone, how far the hip is lifted, and how folded the wings are. */
export const POSE_LENGTH = BIRD_BONE_COUNT * 3 + 2;
/** Where in a pose the hip's lift is (m, over where the legs would stand it). */
export const LIFT = BIRD_BONE_COUNT * 3;
/**
 * Where in a pose the wings' fold is (0 spread, 1 folded): a folded wing's
 * feathers lie over each other, so it's drawn narrower and shorter than a
 * spread one, from the shoulder.
 */
export const FOLD = BIRD_BONE_COUNT * 3 + 1;
/** How much of the inner wing's span, of the outer wing's and of their chord a fold takes in. */
const FOLD_ARM = 0.45;
const FOLD_HAND = 0.4;
const FOLD_CHORD = 0.58;

/** A bird's pose: per bone, its turn from bind; and the hip's lift. */
export type BirdPose = Float32Array;

export function newPose(): BirdPose {
  return new Float32Array(POSE_LENGTH);
}

/** Where a bird is: its hip in the world, which way it faces and how it's tipped (radians). */
export interface Placing {
  x: number;
  y: number;
  z: number;
  /** Faces (sin yaw, cos yaw), as models do. */
  yaw: number;
  /** > 0 noses down. */
  pitch: number;
  /** > 0 raises its left wing. */
  roll: number;
}

/** A skeleton whose matrices the flock writes itself (no bones in the scene to read them from). */
class WrittenSkeleton extends Skeleton {
  constructor(bones: number) {
    super(new Array(bones).fill(null));
    this.computeBoneTexture();
  }

  override update(): void {
    // The flock wrote them.
  }
}

// ------------------------------------------------------------ geometry, shared

const birds = new Map<BirdLookId, BufferGeometry>();
const flocks = new Map<string, { readonly geometry: BufferGeometry; users: number }>();

/** One bird of `look`, built once and kept (they're small, and every flock of its kind is made from it). */
export function birdGeometry(look: BirdLookId): BufferGeometry {
  let g = birds.get(look);
  if (!g) birds.set(look, (g = buildBird(BIRD_LOOKS[look])));
  return g;
}

/** Each bird of the flock in turn, its bones numbered on from the last's. */
function mergeFlock(looks: readonly BirdLookId[]): BufferGeometry {
  const parts = looks.map((look, i) => {
    const g = birdGeometry(look).clone();
    const skin = g.getAttribute('skinIndex');
    for (let v = 0; v < skin.count; v++) skin.setX(v, skin.getX(v) + i * BIRD_BONE_COUNT);
    return g;
  });
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** A flock of `looks`, shared by every flock of the same birds while any is built. */
function takeFlock(looks: readonly BirdLookId[]): BufferGeometry {
  const key = looks.join(',');
  let held = flocks.get(key);
  if (!held) flocks.set(key, (held = { geometry: mergeFlock(looks), users: 0 }));
  held.users++;
  return held.geometry;
}

function giveFlock(looks: readonly BirdLookId[]): void {
  const key = looks.join(',');
  const held = flocks.get(key);
  if (!held || --held.users > 0) return;
  held.geometry.dispose();
  flocks.delete(key);
}

/** How many flock geometries are built (one per kind of flock), for the checks. */
export function flockGeometries(): number {
  return flocks.size;
}

// ------------------------------------------------------------ the mesh

const IDENTITY = new Matrix4();
/** Room round a flock's hips for its wings and necks, past its biggest bird's span. */
const PAD = 0.3;

export class FlockMesh {
  readonly mesh: SkinnedMesh;
  readonly count: number;
  /** Each bird's look, in order. */
  readonly looks: readonly BirdLookId[];
  /** Each bird's size, as a share of its look's (a little different, bird to bird). */
  readonly sizes: Float32Array;
  /** Has it been drawn since it was last posed? Then it's worth posing again. */
  drawn = true;
  private readonly skeleton: WrittenSkeleton;
  /** Each bird's bones' offsets from their parents, and where they are at bind (x, y, z each). */
  private readonly offsets: Float32Array;
  private readonly binds: Float32Array;
  /** Each bone's world matrix as it's worked out: a 3×3 turn (column by column) and a position. */
  private readonly world = new Float32Array(BIRD_BONE_COUNT * 12);
  private readonly sphere = new Sphere();
  private readonly reach: number;

  constructor(looks: readonly BirdLookId[], material: Material, sizes?: readonly number[]) {
    this.looks = looks;
    this.count = looks.length;
    this.sizes = Float32Array.from(sizes ?? looks.map(() => 1));
    this.skeleton = new WrittenSkeleton(this.count * BIRD_BONE_COUNT);
    this.offsets = new Float32Array(this.count * BIRD_BONE_COUNT * 3);
    this.binds = new Float32Array(this.count * BIRD_BONE_COUNT * 3);
    let reach = 0;
    looks.forEach((look, i) => {
      const body = BIRD_LOOKS[look].body;
      const off = birdOffsets(body);
      const bind = birdBind(body);
      for (let b = 0; b < BIRD_BONE_COUNT; b++) {
        const k = (i * BIRD_BONE_COUNT + b) * 3;
        this.offsets.set(off[b], k);
        this.binds.set([bind[b].x, bind[b].y, bind[b].z], k);
      }
      reach = Math.max(reach, (body.wingAt[0] + body.arm[0] + body.hand[0]) * this.sizes[i], body.neck + body.leg);
    });
    this.reach = reach + PAD;
    this.mesh = new SkinnedMesh(takeFlock(looks), material);
    this.mesh.name = 'flock';
    this.mesh.bindMode = DetachedBindMode;
    this.mesh.bind(this.skeleton, IDENTITY);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.boundingSphere = this.sphere;
    this.mesh.onBeforeRender = () => {
      this.drawn = true;
    };
  }

  /** What the flock costs to draw, in triangles (each eye). */
  get triangles(): number {
    return this.mesh.geometry.getAttribute('position').count / 3;
  }

  /**
   * Set bird `i`'s bones: its hip at `at`, turned and tipped so, and posed.
   * The body's own entry in the pose adds to the turn (pitch, yaw, roll).
   */
  pose(i: number, at: Placing, pose: BirdPose): void {
    const w = this.world;
    const k0 = i * BIRD_BONE_COUNT;
    const out = this.skeleton.boneMatrices!;
    const s = this.sizes[i];
    const arm = 1 - FOLD_ARM * pose[FOLD];
    const hand = 1 - FOLD_HAND * pose[FOLD];
    const chord = 1 - FOLD_CHORD * pose[FOLD];
    for (let b = 0; b < BIRD_BONE_COUNT; b++) {
      const p = b * 3;
      const r = rotation(pose[p], pose[p + 1], pose[p + 2], b === B.body ? at : null);
      const o = (k0 + b) * 3;
      const m = b * 12;
      if (b === B.body) {
        for (let j = 0; j < 9; j++) w[m + j] = r[j] * s;
        w[m + 9] = at.x;
        w[m + 10] = at.y + pose[LIFT];
        w[m + 11] = at.z;
      } else {
        const q = BIRD_PARENT[b] * 12;
        // This bone's world turn is its parent's times its own; its place, the parent's plus its offset turned by the parent.
        for (let c = 0; c < 3; c++) {
          for (let row = 0; row < 3; row++) {
            w[m + c * 3 + row] = w[q + row] * r[c * 3] + w[q + 3 + row] * r[c * 3 + 1] + w[q + 6 + row] * r[c * 3 + 2];
          }
        }
        // A tip hangs from its wing's end, wherever the fold has drawn it in to.
        const ox = this.offsets[o] * (b === B.tipL || b === B.tipR ? arm : 1);
        const oy = this.offsets[o + 1];
        const oz = this.offsets[o + 2];
        for (let row = 0; row < 3; row++) w[m + 9 + row] = w[q + 9 + row] + w[q + row] * ox + w[q + 3 + row] * oy + w[q + 6 + row] * oz;
      }
      // Skinned: the bone's world matrix after its place at bind is taken away. A wing's parts are
      // drawn in (span and chord, about the bone) by the fold, which its children don't inherit.
      const tip = b === B.tipL || b === B.tipR;
      const wing = tip || b === B.wingL || b === B.wingR;
      const sx = tip ? hand : wing ? arm : 1;
      const sz = wing ? chord : 1;
      const bx = this.binds[o];
      const by = this.binds[o + 1];
      const bz = this.binds[o + 2];
      const t = (k0 + b) * 16;
      out[t] = w[m] * sx;
      out[t + 1] = w[m + 1] * sx;
      out[t + 2] = w[m + 2] * sx;
      out[t + 3] = 0;
      out[t + 4] = w[m + 3];
      out[t + 5] = w[m + 4];
      out[t + 6] = w[m + 5];
      out[t + 7] = 0;
      out[t + 8] = w[m + 6] * sz;
      out[t + 9] = w[m + 7] * sz;
      out[t + 10] = w[m + 8] * sz;
      out[t + 11] = 0;
      for (let row = 0; row < 3; row++) out[t + 12 + row] = w[m + 9 + row] - (out[t + row] * bx + out[t + 4 + row] * by + out[t + 8 + row] * bz);
      out[t + 15] = 1;
    }
  }

  /** Fold bird `i` away to a point at (x, y, z): it isn't seen (and costs next to nothing). */
  hide(i: number, x: number, y: number, z: number): void {
    const out = this.skeleton.boneMatrices!;
    for (let b = 0; b < BIRD_BONE_COUNT; b++) {
      const t = (i * BIRD_BONE_COUNT + b) * 16;
      out.fill(0, t, t + 12);
      out[t + 12] = x;
      out[t + 13] = y;
      out[t + 14] = z;
      out[t + 15] = 1;
    }
  }

  /** Done posing for this frame: the matrices go up with the next draw. */
  commit(): void {
    this.skeleton.boneTexture!.needsUpdate = true;
    this.drawn = false;
  }

  /** Bound the flock round its birds' hips (min and max of each axis), for culling. */
  bound(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): void {
    this.sphere.center.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    this.sphere.radius = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2 + this.reach;
  }

  /** Where bird `i`'s bone `b` is in the world, as last posed (for the checks). */
  boneAt(i: number, b: number, out: { x: number; y: number; z: number }): typeof out {
    const m = this.skeleton.boneMatrices!;
    const t = (i * BIRD_BONE_COUNT + b) * 16;
    const k = (i * BIRD_BONE_COUNT + b) * 3;
    const [x, y, z] = [this.binds[k], this.binds[k + 1], this.binds[k + 2]];
    out.x = m[t] * x + m[t + 4] * y + m[t + 8] * z + m[t + 12];
    out.y = m[t + 1] * x + m[t + 5] * y + m[t + 9] * z + m[t + 13];
    out.z = m[t + 2] * x + m[t + 6] * y + m[t + 10] * z + m[t + 14];
    return out;
  }

  /** Every vertex as last posed, for the checks: calls `each(x, y, z, bird)`. */
  vertices(each: (x: number, y: number, z: number, bird: number) => void): void {
    const pos = this.mesh.geometry.getAttribute('position');
    const skin = this.mesh.geometry.getAttribute('skinIndex');
    const m = this.skeleton.boneMatrices!;
    for (let v = 0; v < pos.count; v++) {
      const bone = skin.getX(v);
      const t = bone * 16;
      const [x, y, z] = [pos.getX(v), pos.getY(v), pos.getZ(v)];
      each(m[t] * x + m[t + 4] * y + m[t + 8] * z + m[t + 12], m[t + 1] * x + m[t + 5] * y + m[t + 9] * z + m[t + 13], m[t + 2] * x + m[t + 6] * y + m[t + 10] * z + m[t + 14], Math.floor(bone / BIRD_BONE_COUNT));
    }
  }

  dispose(): void {
    giveFlock(this.looks);
    this.skeleton.dispose();
    this.mesh.removeFromParent();
  }
}

const _r = new Float32Array(9);

/**
 * A YXZ Euler turn as a 3×3 (column by column), as three.js's
 * `makeRotationFromEuler`: for the body, the bird's yaw, pitch and roll are
 * added to the pose's own.
 */
function rotation(px: number, py: number, pz: number, at: Placing | null): Float32Array {
  const x = at ? px + at.pitch : px;
  const y = at ? py + at.yaw : py;
  const z = at ? pz + at.roll : pz;
  const a = Math.cos(x);
  const b = Math.sin(x);
  const c = Math.cos(y);
  const d = Math.sin(y);
  const e = Math.cos(z);
  const f = Math.sin(z);
  const ce = c * e;
  const cf = c * f;
  const de = d * e;
  const df = d * f;
  _r[0] = ce + df * b;
  _r[1] = a * f;
  _r[2] = cf * b - de;
  _r[3] = de * b - cf;
  _r[4] = a * e;
  _r[5] = df + ce * b;
  _r[6] = a * d;
  _r[7] = -b;
  _r[8] = a * c;
  return _r;
}
