import { BoxGeometry, BufferAttribute, BufferGeometry, ConeGeometry, CylinderGeometry, Matrix4, Vector3 } from 'three';
import { ModelBuilder, type Vec3 } from './kit';

// The birds' body: a small skeleton of its own, apart from the humanoid rig
// (rig.ts), so a whole flock can be one skinned mesh with every bird's bones
// in it (birds/flock.ts) and one draw call. Each bird is a few dozen
// triangles: a hull for the body, the head and the neck, a pyramid for the
// beak, flat plates for the wings and the tail (two-sided, so a wing seen
// from below is still there), thin prisms for the legs. Vertex colours carry
// the plumage, as they carry everything else, with the shared grain.
//
// A bird faces +Z, its left wing along +X, standing on its soles at y = 0.
// Rotations are Euler YXZ, as the rig's, and mean:
//   neck:  x > 0 leans it forward;   head: x > 0 looks down, y > 0 to its left
//   wings: spread at bind; z > 0 raises the left wing (the right's mirror,
//          z < 0, raises it), y > 0 sweeps the left one back; folded at the
//          sides is about [-π/2, π/2, 0] (left) and [-π/2, -π/2, 0] (right)
//   tips:  z > 0 bends the left tip up (folded: in, over the tail)
//   tail:  x > 0 cocks it up;        legs: x < 0 swings the foot forward
// The body's own turn is the bird's: yaw, pitch (> 0 noses down) and roll
// (> 0 raises the left wing), about its hip.

export const BIRD_BONES = ['body', 'neck', 'head', 'wingL', 'tipL', 'wingR', 'tipR', 'tail', 'legL', 'legR'] as const;
export type BirdBone = (typeof BIRD_BONES)[number];
export const BIRD_BONE_COUNT = BIRD_BONES.length;
/** Each bone's parent, by index (the body has none). */
export const BIRD_PARENT: readonly number[] = [-1, 0, 1, 0, 3, 0, 5, 0, 0, 0];

/** Bone indices, for the poses' typed arrays. */
export const B = { body: 0, neck: 1, head: 2, wingL: 3, tipL: 4, wingR: 5, tipR: 6, tail: 7, legL: 8, legR: 9 } as const satisfies Record<BirdBone, number>;

/** One end of the body's hull: its middle (y, z in the body's space) and its width and depth there. */
export interface HullEnd {
  readonly y: number;
  readonly z: number;
  readonly w: number;
  readonly h: number;
}

/** A bird's proportions, in metres. Everything is in the body's space (its hip) unless it says otherwise. */
export interface BirdBody {
  /** The hip over the soles, standing: how tall the legs are. */
  readonly leg: number;
  /** Half the width between the legs. */
  readonly hipW: number;
  readonly legW: number;
  /** The body: at its deepest and widest (the breast), at the rump, and how far the chest runs on forward of the breast to the neck. */
  readonly breast: HullEnd;
  readonly rump: HullEnd;
  readonly chest: number;
  /** The neck's foot (y, z), how long it rises at bind, and how thick it is at its foot and at the head. */
  readonly neckAt: readonly [number, number];
  readonly neck: number;
  readonly neckW: readonly [number, number];
  /** The head: width, height, length, its middle that far forward of the neck's top, and as far up. */
  readonly head: readonly [number, number, number];
  readonly headAt: readonly [number, number];
  /** The beak: its length, and its width and depth at the face. */
  readonly beak: readonly [number, number, number];
  /** The shoulder (x, y, z; the right is at -x). */
  readonly wingAt: Vec3;
  /** The inner wing: its span and chord. */
  readonly arm: readonly [number, number];
  /** The outer wing: its span, its chord at the wrist and at the tip, and how far back the tip sweeps. */
  readonly hand: readonly [number, number, number, number];
  /** Where the tail joins (y, z), and its length and width (at the root, at the end). */
  readonly tailAt: readonly [number, number];
  readonly tail: readonly [number, number, number];
  /** How long the toes are; 0 draws no feet. */
  readonly toes: number;
}

/** Where each bone is at bind, in the bird's space: the body at its hip, the rest on from it. */
export function birdBind(b: BirdBody): Vector3[] {
  const off = birdOffsets(b);
  const at: Vector3[] = [];
  for (let i = 0; i < BIRD_BONE_COUNT; i++) {
    const p = BIRD_PARENT[i];
    at.push(new Vector3(...off[i]).add(p < 0 ? new Vector3() : at[p]));
  }
  return at;
}

/** Each bone's offset from its parent at bind (the body's from the soles' middle). */
export function birdOffsets(b: BirdBody): Vec3[] {
  const [wx, wy, wz] = b.wingAt;
  return [
    [0, b.leg, 0],
    [0, b.neckAt[0], b.neckAt[1]],
    [0, b.neck, 0],
    [wx, wy, wz],
    [b.arm[0], 0, 0],
    [-wx, wy, wz],
    [-b.arm[0], 0, 0],
    [0, b.tailAt[0], b.tailAt[1]],
    [b.hipW, 0, 0],
    [-b.hipW, 0, 0],
  ];
}

// ------------------------------------------------------------ parts

/**
 * A box between two rectangles across `axis`: `a` and `b` are their middles,
 * each with its two half-sizes (x then the other cross axis). The body, the
 * neck, the head, a duck's bill: twelve triangles, any taper or slant.
 */
function hull(axis: 'y' | 'z', a: Vec3, aw: number, ah: number, b: Vec3, bw: number, bh: number): BufferGeometry {
  const g = new BoxGeometry(1, 1, 1).toNonIndexed();
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (axis === 'z') {
      const end = z > 0 ? b : a;
      const [w, h] = z > 0 ? [bw, bh] : [aw, ah];
      pos.setXYZ(i, end[0] + x * 2 * w, end[1] + y * 2 * h, end[2]);
    } else {
      const end = y > 0 ? b : a;
      const [w, d] = y > 0 ? [bw, bh] : [aw, ah];
      pos.setXYZ(i, end[0] + x * 2 * w, end[1], end[2] + z * 2 * d);
    }
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A flat polygon in the XZ plane (a fan from its first corner), drawn from
 * above and below: a wing, a tail, a foot. Four triangles for a quad.
 */
function plate(points: readonly (readonly [number, number])[], y = 0, twoSided = true): BufferGeometry {
  const v: number[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const [p0, p1, p2] = [points[0], points[i], points[i + 1]];
    // Counter-clockwise seen from above (+Y), then the same reversed for below.
    v.push(p0[0], y, p0[1], p2[0], y, p2[1], p1[0], y, p1[1]);
    if (twoSided) v.push(p0[0], y, p0[1], p1[0], y, p1[1], p2[0], y, p2[1]);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(v), 3));
  g.computeVertexNormals();
  return g;
}

/** A quad facing +X (or -X): an eye on the side of a head. Two triangles. */
/** A flat shape standing upright on the bird's middle (in its YZ plane at `x`), seen from both sides: a comb, wattles. `points` are (z, y), round its edge. */
function fin(points: readonly (readonly [number, number])[], x = 0): BufferGeometry {
  const v: number[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const [p0, p1, p2] = [points[0], points[i], points[i + 1]];
    v.push(x, p0[1], p0[0], x, p1[1], p1[0], x, p2[1], p2[0]);
    v.push(x, p0[1], p0[0], x, p2[1], p2[0], x, p1[1], p1[0]);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(v), 3));
  g.computeVertexNormals();
  return g;
}

function sideQuad(x: number, y: number, z: number, h: number, l: number, out: 1 | -1): BufferGeometry {
  const v =
    out > 0
      ? [x, y - h, z - l, x, y + h, z + l, x, y - h, z + l, x, y - h, z - l, x, y + h, z - l, x, y + h, z + l]
      : [x, y - h, z - l, x, y - h, z + l, x, y + h, z + l, x, y - h, z - l, x, y + h, z + l, x, y + h, z - l];
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(v), 3));
  g.computeVertexNormals();
  return g;
}

/** A three-sided prism along -Y from the bone, open at the ends: a leg. Six triangles. */
function prism(r: number, h: number): BufferGeometry {
  const g = new CylinderGeometry(r, r * 0.8, h, 3, 1, true);
  g.translate(0, -h / 2, 0);
  return g;
}

/** A pyramid along +Z, open at its base (hidden in the face): a beak. Three or four triangles. */
function spike(w: number, h: number, len: number, sides = 4): BufferGeometry {
  const g = new ConeGeometry(0.5, len, sides, 1, true);
  g.rotateY(sides === 4 ? Math.PI / 4 : 0);
  g.scale(w * (sides === 4 ? Math.SQRT2 : 1.15), 1, h * (sides === 4 ? Math.SQRT2 : 1.15));
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, len / 2);
  return g;
}

// ------------------------------------------------------------ looks

/** The families of the inhabitant specs, each a body and its looks. */
export type BirdFamily = 'crow' | 'gull' | 'hen' | 'duck' | 'heron';

/** The plumage: a colour per part, and what each look adds. */
export interface Plumage {
  readonly body: number;
  /** The back, over the body's top; the body's colour if not given. */
  readonly back?: number;
  readonly breast?: number;
  readonly head: number;
  readonly neck?: number;
  readonly beak: number;
  readonly eye: number;
  readonly legs: number;
  /** The inner wing: its leading part, and its trailing band (a pigeon's bars, a duck's speculum). */
  readonly wing: number;
  readonly band?: number;
  /** The outer wing (the primaries). */
  readonly tip: number;
  readonly tail: number;
  /** The tail's end, if it's barred. */
  readonly tailEnd?: number;
}

/** What a bird adds to the common parts: a comb, a crest, a collar. */
export type Extras = (ctx: BirdContext) => void;

/** What a look's extras author in: the builder on a bone, and the body. */
export interface BirdContext {
  readonly body: BirdBody;
  on(bone: BirdBone): ModelBuilder;
  /** A part from the kit's `shape`, so extras can use the hulls and plates too. */
  hull: typeof hull;
  plate: typeof plate;
  fin: typeof fin;
  spike: typeof spike;
}

export interface BirdLook {
  readonly label: string;
  readonly family: BirdFamily;
  readonly body: BirdBody;
  readonly plumage: Plumage;
  readonly extras?: Extras;
  /** A beak bent down along its length (a curlew's): how far its tip drops. */
  readonly beakCurve?: number;
  readonly seed: number;
}

/**
 * One bird of `look` as a skinned geometry at bind (bone indices 0–9, the
 * order of BIRD_BONES): every part authored in its bone's space at bind, and
 * merged, with a little shade toward the soles.
 */
export function buildBird(look: BirdLook): BufferGeometry {
  const b = look.body;
  const c = look.plumage;
  const bind = birdBind(b);
  const builder = new ModelBuilder(look.seed);
  const m = new Matrix4();
  const on = (bone: BirdBone) => {
    const i = B[bone];
    return builder.on(i, m.makeTranslation(bind[i].x, bind[i].y, bind[i].z));
  };
  const jitter = 0.06;

  // The body: from the rump to its deepest at the breast, then the chest tapering forward to the neck;
  // the back a shade over it when it's another colour.
  const { breast: br, rump: ru } = b;
  const front: HullEnd = { y: br.y + br.h * 0.08, z: br.z + b.chest, w: br.w * 0.62, h: br.h * 0.68 };
  on('body')
    .shape(hull('z', [0, ru.y, ru.z], ru.w / 2, ru.h / 2, [0, br.y, br.z], br.w / 2, br.h / 2), { color: c.body, jitter })
    .shape(hull('z', [0, br.y, br.z - 0.001], br.w / 2, br.h / 2, [0, front.y, front.z], front.w / 2, front.h / 2), { color: c.breast ?? c.body, jitter });
  if (c.back !== undefined) {
    const top = (e: HullEnd): Vec3 => [0, e.y + e.h * 0.36, e.z];
    on('body').shape(hull('z', top(ru), ru.w * 0.44, ru.h * 0.16, top(br), br.w * 0.47, br.h * 0.16), { color: c.back, jitter });
  }

  // The neck: a hull from its foot to the head, when there's a neck to see.
  const [nw0, nw1] = b.neckW;
  if (b.neck > 0.03) on('neck').shape(hull('y', [0, -nw0 * 0.3, 0], nw0 / 2, nw0 / 2, [0, b.neck, 0], nw1 / 2, nw1 / 2), { color: c.neck ?? c.head, jitter });

  // The head, the eyes on its sides, and the beak out of its face.
  const [hw, hh, hl] = b.head;
  const [hz, hy] = b.headAt;
  on('head').shape(hull('z', [0, hy + hh * 0.02, hz - hl / 2], hw * 0.47, hh * 0.47, [0, hy - hh * 0.05, hz + hl / 2], hw * 0.36, hh * 0.38), { color: c.head, jitter });
  const eyeR = Math.max(0.004, hh * 0.085);
  for (const s of [1, -1] as const) {
    // On the head's side, which narrows toward the bill: just proud of it where the eye is.
    const x = (hw / 2) * (0.94 - 0.22 * 0.68) + 0.0015;
    on('head').shape(sideQuad(s * x, hy + hh * 0.12, hz + hl * 0.18, eyeR, eyeR, s), { color: c.eye, jitter: 0 });
  }
  const [bl, bw, bh] = b.beak;
  const face: Vec3 = [0, hy - hh * 0.1, hz + hl / 2 - 0.002];
  if (look.beakCurve) {
    // In two pieces, the outer bent down: a curlew's.
    const half = bl / 2;
    on('head').shape(spike(bw, bh, half + 0.004, 4), { at: face, color: c.beak, jitter: 0.03 });
    const drop = look.beakCurve;
    on('head').shape(spike(bw * 0.7, bh * 0.7, half, 4), { at: [0, face[1] - drop * 0.3, face[2] + half], rot: [Math.atan2(drop, half), 0, 0], color: c.beak, jitter: 0.03 });
  } else if (bw > bh * 1.4) {
    // Broad and flat: a duck's, a swan's, a goose's bill.
    on('head').shape(hull('z', face, bw / 2, bh / 2, [0, face[1] - bh * 0.15, face[2] + bl], bw * 0.42, bh * 0.25), { color: c.beak, jitter: 0.03 });
  } else on('head').shape(spike(bw, bh, bl), { at: face, color: c.beak, jitter: 0.03 });

  // The wings, spread at bind: the inner wing (with its band behind), then the primaries.
  const [arm, chord] = b.arm;
  const [hand, wrist, tipChord, sweep] = b.hand;
  for (const s of [1, -1] as const) {
    const wing = s > 0 ? 'wingL' : 'wingR';
    const tip = s > 0 ? 'tipL' : 'tipR';
    const lead = chord * 0.25;
    const split = c.band !== undefined ? -chord * 0.4 : -chord * 0.75;
    on(wing).shape(plate([[0, lead], [s * arm, lead * 0.8], [s * arm, split], [0, split]]), { color: c.wing, jitter });
    if (c.band !== undefined) on(wing).shape(plate([[0, split], [s * arm, split], [s * arm, -chord * 0.75], [0, -chord * 0.72]]), { color: c.band, jitter });
    const wl = wrist * 0.25;
    on(tip).shape(plate([[0, wl * 0.8], [s * hand, wl * 0.2 - sweep], [s * hand, -tipChord + wl * 0.2 - sweep], [0, -wrist * 0.75]]), { color: c.tip, jitter });
  }

  // The tail, a fan from its root.
  const [tl, tw0, tw1] = b.tail;
  const endAt = c.tailEnd !== undefined ? -tl * 0.72 : -tl;
  on('tail').shape(plate([[-tw0 / 2, 0.01], [tw0 / 2, 0.01], [tw1 / 2, endAt], [-tw1 / 2, endAt]]), { color: c.tail, jitter });
  if (c.tailEnd !== undefined) on('tail').shape(plate([[-tw1 / 2, endAt], [tw1 / 2, endAt], [tw1 / 2, -tl], [-tw1 / 2, -tl]]), { color: c.tailEnd, jitter });

  // The legs, down from the hip to the soles, and the toes splayed on the ground.
  for (const s of [1, -1] as const) {
    const leg = s > 0 ? 'legL' : 'legR';
    on(leg).shape(prism(b.legW / 2, b.leg + 0.004), { color: c.legs, jitter: 0.04 });
    if (b.toes > 0) {
      const t = b.toes;
      on(leg).shape(plate([[0, -t * 0.3], [t * 0.45, t], [0, t * 0.55], [-t * 0.45, t]], -b.leg + 0.003), { color: c.legs, jitter: 0.04 });
    }
  }

  look.extras?.({ body: b, on, hull, plate, fin, spike });
  return builder.build({ skinned: true, ao: { from: 0, to: b.leg + b.breast.y + b.breast.h / 2, min: 0.72 } });
}

// ------------------------------------------------------------ the bodies

/** A small pigeon: a blue-grey town bird about 32 cm long and 65 cm across the wings. */
const PIGEON: BirdBody = {
  leg: 0.055,
  hipW: 0.02,
  legW: 0.012,
  breast: { y: 0.045, z: 0.025, w: 0.1, h: 0.095 },
  rump: { y: 0.05, z: -0.085, w: 0.055, h: 0.045 },
  chest: 0.05,
  neckAt: [0.072, 0.055],
  neck: 0.035,
  neckW: [0.05, 0.04],
  head: [0.042, 0.045, 0.052],
  headAt: [0.01, 0.014],
  beak: [0.02, 0.01, 0.009],
  wingAt: [0.052, 0.075, 0.035],
  arm: [0.12, 0.1],
  hand: [0.15, 0.09, 0.04, 0.03],
  tailAt: [0.055, -0.08],
  tail: [0.11, 0.045, 0.075],
  toes: 0,
};

/** Scale every length of `b` by `k`. */
function scaled(b: BirdBody, k: number): BirdBody {
  const s = (v: number) => v * k;
  const end = (e: HullEnd): HullEnd => ({ y: s(e.y), z: s(e.z), w: s(e.w), h: s(e.h) });
  return {
    leg: s(b.leg),
    hipW: s(b.hipW),
    legW: s(b.legW),
    breast: end(b.breast),
    rump: end(b.rump),
    chest: s(b.chest),
    neckAt: [s(b.neckAt[0]), s(b.neckAt[1])],
    neck: s(b.neck),
    neckW: [s(b.neckW[0]), s(b.neckW[1])],
    head: [s(b.head[0]), s(b.head[1]), s(b.head[2])],
    headAt: [s(b.headAt[0]), s(b.headAt[1])],
    beak: [s(b.beak[0]), s(b.beak[1]), s(b.beak[2])],
    wingAt: [s(b.wingAt[0]), s(b.wingAt[1]), s(b.wingAt[2])],
    arm: [s(b.arm[0]), s(b.arm[1])],
    hand: [s(b.hand[0]), s(b.hand[1]), s(b.hand[2]), s(b.hand[3])],
    tailAt: [s(b.tailAt[0]), s(b.tailAt[1])],
    tail: [s(b.tail[0]), s(b.tail[1]), s(b.tail[2])],
    toes: s(b.toes),
  };
}

/** A carrion crow: a pigeon's frame half again as big, longer in the bill, the leg and the hand. */
const CROW: BirdBody = {
  ...scaled(PIGEON, 1.42),
  leg: 0.085,
  legW: 0.014,
  rump: { y: 0.07, z: -0.12, w: 0.07, h: 0.06 },
  neckW: [0.07, 0.055],
  head: [0.055, 0.06, 0.07],
  beak: [0.05, 0.016, 0.02],
  hand: [0.24, 0.12, 0.07, 0.03],
  tail: [0.17, 0.05, 0.08],
  toes: 0.04,
};

/** A raven: a crow's frame bigger again, a heavy bill and a wedge of a tail. */
const RAVEN: BirdBody = {
  ...scaled(CROW, 1.32),
  head: [0.072, 0.076, 0.095],
  beak: [0.078, 0.024, 0.034],
  tail: [0.24, 0.06, 0.1],
};

/** A herring gull: long narrow wings, white, about 1.4 m across. */
const GULL: BirdBody = {
  leg: 0.09,
  hipW: 0.032,
  legW: 0.016,
  breast: { y: 0.05, z: 0.025, w: 0.14, h: 0.13 },
  rump: { y: 0.065, z: -0.16, w: 0.07, h: 0.06 },
  chest: 0.085,
  neckAt: [0.085, 0.09],
  neck: 0.05,
  neckW: [0.075, 0.058],
  head: [0.062, 0.066, 0.082],
  headAt: [0.02, 0.012],
  beak: [0.058, 0.016, 0.022],
  wingAt: [0.073, 0.09, 0.04],
  arm: [0.24, 0.16],
  hand: [0.33, 0.14, 0.05, 0.06],
  tailAt: [0.07, -0.15],
  tail: [0.14, 0.06, 0.11],
  toes: 0.055,
};

/** A hen: plump, its tail cocked up, about 40 cm to the top of its head. */
const HEN: BirdBody = {
  leg: 0.1,
  hipW: 0.04,
  legW: 0.018,
  breast: { y: 0.08, z: 0.02, w: 0.17, h: 0.17 },
  rump: { y: 0.11, z: -0.11, w: 0.11, h: 0.12 },
  chest: 0.075,
  neckAt: [0.14, 0.07],
  neck: 0.08,
  neckW: [0.08, 0.055],
  head: [0.052, 0.062, 0.068],
  headAt: [0.012, 0.012],
  beak: [0.026, 0.016, 0.016],
  wingAt: [0.088, 0.12, 0.03],
  arm: [0.14, 0.13],
  hand: [0.14, 0.11, 0.05, 0.02],
  tailAt: [0.15, -0.1],
  tail: [0.14, 0.05, 0.11],
  toes: 0.06,
};

/** A cock: a hen's frame, taller and longer in the tail. */
const COCK: BirdBody = {
  ...scaled(HEN, 1.14),
  leg: 0.135,
  tail: [0.24, 0.05, 0.13],
};

/** A red grouse: round and low in the heather, short-legged, about 38 cm long. */
const GROUSE: BirdBody = {
  leg: 0.05,
  hipW: 0.035,
  legW: 0.022,
  breast: { y: 0.06, z: 0.015, w: 0.16, h: 0.14 },
  rump: { y: 0.07, z: -0.1, w: 0.1, h: 0.08 },
  chest: 0.065,
  neckAt: [0.1, 0.06],
  neck: 0.03,
  neckW: [0.07, 0.055],
  head: [0.052, 0.056, 0.062],
  headAt: [0.012, 0.01],
  beak: [0.018, 0.015, 0.014],
  wingAt: [0.082, 0.09, 0.02],
  arm: [0.13, 0.12],
  hand: [0.14, 0.1, 0.05, 0.02],
  tailAt: [0.07, -0.09],
  tail: [0.09, 0.06, 0.1],
  toes: 0.04,
};

/** A mallard: long and low on the water, a flat bill, about 58 cm long. */
const MALLARD: BirdBody = {
  leg: 0.07,
  hipW: 0.045,
  legW: 0.016,
  breast: { y: 0.06, z: 0.03, w: 0.19, h: 0.15 },
  rump: { y: 0.065, z: -0.17, w: 0.11, h: 0.09 },
  chest: 0.1,
  neckAt: [0.09, 0.1],
  neck: 0.1,
  neckW: [0.065, 0.05],
  head: [0.06, 0.068, 0.085],
  headAt: [0.015, 0.012],
  beak: [0.055, 0.04, 0.016],
  wingAt: [0.098, 0.1, 0.04],
  arm: [0.18, 0.14],
  hand: [0.22, 0.12, 0.05, 0.05],
  tailAt: [0.08, -0.16],
  tail: [0.08, 0.07, 0.09],
  toes: 0.055,
};

/** A mute swan: big and white, its neck long, about 1.4 m long and 2.2 m across. */
const SWAN: BirdBody = {
  leg: 0.12,
  hipW: 0.09,
  legW: 0.03,
  breast: { y: 0.13, z: 0.05, w: 0.42, h: 0.3 },
  rump: { y: 0.17, z: -0.33, w: 0.28, h: 0.2 },
  chest: 0.22,
  neckAt: [0.17, 0.2],
  neck: 0.52,
  neckW: [0.12, 0.065],
  head: [0.072, 0.088, 0.13],
  headAt: [0.035, 0.02],
  beak: [0.1, 0.058, 0.03],
  wingAt: [0.214, 0.22, 0.08],
  arm: [0.42, 0.34],
  hand: [0.52, 0.28, 0.12, 0.08],
  tailAt: [0.17, -0.3],
  tail: [0.14, 0.15, 0.17],
  toes: 0.11,
};

/** A greylag goose: a heavy grey-brown farm goose, about 80 cm long. */
const GOOSE: BirdBody = {
  leg: 0.13,
  hipW: 0.06,
  legW: 0.024,
  breast: { y: 0.09, z: 0.03, w: 0.26, h: 0.22 },
  rump: { y: 0.11, z: -0.24, w: 0.16, h: 0.13 },
  chest: 0.13,
  neckAt: [0.13, 0.12],
  neck: 0.25,
  neckW: [0.09, 0.058],
  head: [0.066, 0.078, 0.1],
  headAt: [0.022, 0.012],
  beak: [0.065, 0.042, 0.028],
  wingAt: [0.134, 0.15, 0.05],
  arm: [0.3, 0.24],
  hand: [0.38, 0.2, 0.08, 0.06],
  tailAt: [0.1, -0.22],
  tail: [0.11, 0.1, 0.12],
  toes: 0.08,
};

/** A grey heron: about 95 cm tall on long legs, broad wings 1.8 m across, a dagger of a bill. */
const HERON: BirdBody = {
  leg: 0.42,
  hipW: 0.04,
  legW: 0.02,
  breast: { y: 0.06, z: 0.03, w: 0.15, h: 0.17 },
  rump: { y: 0.03, z: -0.2, w: 0.09, h: 0.09 },
  chest: 0.09,
  neckAt: [0.11, 0.09],
  neck: 0.3,
  neckW: [0.065, 0.04],
  head: [0.044, 0.054, 0.09],
  headAt: [0.02, 0.008],
  beak: [0.14, 0.02, 0.026],
  wingAt: [0.078, 0.1, 0.05],
  arm: [0.36, 0.28],
  hand: [0.46, 0.25, 0.13, 0.05],
  tailAt: [0.04, -0.19],
  tail: [0.11, 0.06, 0.09],
  toes: 0.09,
};

/** A little egret: a heron's frame at two thirds, all white. */
const EGRET: BirdBody = { ...scaled(HERON, 0.66), beak: [0.1, 0.016, 0.018] };

/** A bittern: a heron's stocky cousin, short in the neck and the leg. */
const BITTERN: BirdBody = {
  ...scaled(HERON, 0.8),
  leg: 0.24,
  breast: { y: 0.05, z: 0.03, w: 0.17, h: 0.19 },
  neck: 0.16,
  neckW: [0.09, 0.06],
  beak: [0.085, 0.02, 0.024],
};

/** A curlew: a wader the size of a gull on longer legs, with a long bill bent down. */
const CURLEW: BirdBody = {
  ...scaled(GULL, 0.9),
  leg: 0.15,
  legW: 0.012,
  neck: 0.07,
  beak: [0.14, 0.012, 0.012],
};

// ------------------------------------------------------------ the looks

/** A comb and wattles in red, blades over and under the bill: a hen's (a cock's bigger). */
function comb(size: number, wattles: boolean, colour = 0xc42a26): Extras {
  return ({ body, on, fin }) => {
    const [, hh, hl] = body.head;
    const [hz, hy] = body.headAt;
    const top = hy + hh / 2;
    const [back, front] = [hz - hl * 0.38, hz + hl * 0.38];
    on('head').shape(fin([[back, top - size * 0.2], [back, top + size * 0.3], [hz, top + size * 0.62], [front, top + size * 0.68], [front, top - size * 0.2]]), { color: colour, jitter: 0.08 });
    if (!wattles) return;
    const [z, bottom] = [hz + hl * 0.3, hy - hh / 2];
    on('head').shape(fin([[z - size * 0.25, bottom + 0.004], [z + size * 0.3, bottom + 0.004], [z + size * 0.15, bottom - size * 0.85], [z - size * 0.1, bottom - size * 0.75]]), { color: colour, jitter: 0.08 });
  };
}

/** A grouse's red brows: a wattle over each eye. */
function brows(colour: number): Extras {
  return ({ body, on, hull }) => {
    const [hw, hh, hl] = body.head;
    const [hz, hy] = body.headAt;
    for (const s of [1, -1]) {
      const x = (s * hw) / 2;
      on('head').shape(hull('z', [x, hy + hh * 0.3, hz - hl * 0.05], 0.006, 0.006, [x, hy + hh * 0.3, hz + hl * 0.32], 0.006, 0.01), { color: colour, jitter: 0.05 });
    }
  };
}

/** Sickle feathers arching over a cock's tail, and a cape of hackles on the neck. */
function cockTail(sickle: number, hackles: number): Extras {
  return ({ body, on, plate, hull }) => {
    const [tl, , tw1] = body.tail;
    on('tail').shape(plate([[-0.012, 0], [0.012, 0], [0.03, -tl * 0.8], [0, -tl * 1.25], [-0.03, -tl * 0.8]], 0.03), { color: sickle, jitter: 0.08 });
    on('tail').shape(plate([[-tw1 * 0.4, -tl * 0.4], [tw1 * 0.4, -tl * 0.4], [0, -tl * 1.05]], 0.015), { color: sickle, jitter: 0.08 });
    const [w0] = body.neckW;
    on('neck').shape(hull('y', [0, -w0 * 0.4, -0.01], w0 * 0.62, w0 * 0.65, [0, body.neck * 0.75, 0], w0 * 0.42, w0 * 0.42), { color: hackles, jitter: 0.1 });
  };
}

/** A gull's red spot near the bill's tip, and the white mirrors in its black primaries. */
function gullMarks(): Extras {
  return ({ body, on, plate }) => {
    const [, hh, hl] = body.head;
    const [hz, hy] = body.headAt;
    const [bl, bw] = body.beak;
    const z = hz + hl / 2 + bl * 0.55;
    on('head').shape(plate([[-bw * 0.42, z - 0.008], [bw * 0.42, z - 0.008], [bw * 0.3, z + 0.008], [-bw * 0.3, z + 0.008]], hy - hh * 0.08 - bw * 0.48, true), { color: 0xc83a2a, jitter: 0 });
    const [hand, , tc, sweep] = body.hand;
    for (const s of [1, -1]) {
      const tip = s > 0 ? 'tipL' : 'tipR';
      const x = s * hand * 0.88;
      on(tip).shape(plate([[x - 0.02 * s, -sweep - tc * 0.1], [x + 0.025 * s, -sweep - tc * 0.1], [x + 0.025 * s, -sweep - tc * 0.55], [x - 0.02 * s, -sweep - tc * 0.55]], 0.002), { color: 0xeeeeea, jitter: 0 });
    }
  };
}

/** A raven's shaggy throat. */
function hackles(colour: number): Extras {
  return ({ body, on, hull }) => {
    const [hw, hh, hl] = body.head;
    const [hz, hy] = body.headAt;
    on('head').shape(hull('z', [0, hy - hh * 0.5, hz - hl * 0.5], hw * 0.4, hh * 0.18, [0, hy - hh * 0.55, hz + hl * 0.25], hw * 0.32, hh * 0.2), { color: colour, jitter: 0.1 });
  };
}

/** A drake's white collar ring, and the black curl over his tail. */
function drake(): Extras {
  return ({ body, on, hull, plate }) => {
    const [w0, w1] = body.neckW;
    const y = body.neck * 0.12;
    on('neck').shape(hull('y', [0, y - 0.008, 0], w0 * 0.53, w0 * 0.53, [0, y + 0.008, 0], (w0 * 0.8 + w1 * 0.2) * 0.53, (w0 * 0.8 + w1 * 0.2) * 0.53), { color: 0xeeeee6, jitter: 0.02 });
    on('tail').shape(plate([[-0.01, -0.01], [0.01, -0.01], [0.006, -0.05], [-0.006, -0.05]], 0.03), { rot: [0.9, 0, 0], color: 0x141414, jitter: 0 });
  };
}

/** A mute swan's black knob at the base of its bill, and the black round its eyes. */
function swanKnob(): Extras {
  return ({ body, on, hull }) => {
    const [, hh, hl] = body.head;
    const [hz, hy] = body.headAt;
    const z = hz + hl / 2;
    on('head').shape(hull('z', [0, hy + hh * 0.02, z - 0.012], 0.012, 0.012, [0, hy + hh * 0.08, z + 0.022], 0.009, 0.016), { color: 0x141414, jitter: 0.02 });
  };
}

/** A heron's black crest trailing from the back of its head, and the black stripe at its shoulder. */
function crest(colour: number, plumes: number): Extras {
  return ({ body, on, plate }) => {
    const [, hh, hl] = body.head;
    const [hz, hy] = body.headAt;
    const z = hz - hl / 2 + 0.01;
    on('head').shape(plate([[-0.006, z], [0.006, z], [0.004, z - plumes], [-0.004, z - plumes]], hy + hh * 0.3), { rot: [-0.25, 0, 0], color: colour, jitter: 0.02 });
  };
}

/** Every bird a zone can place, by name (`BirdFlockPlan.birds`). */
export const BIRD_LOOKS = {
  pigeon: {
    label: 'Pigeon',
    family: 'crow',
    body: PIGEON,
    plumage: { body: 0x8c929e, back: 0x9aa0ac, breast: 0x7a7088, head: 0x6c7280, neck: 0x4e7464, beak: 0x2c2a2a, eye: 0xe07a2a, legs: 0xc0545a, wing: 0xa4aab4, band: 0x2c2e36, tip: 0x4c505c, tail: 0x868c98, tailEnd: 0x2c2e36 },
    seed: 301,
  },
  crow: {
    label: 'Crow',
    family: 'crow',
    body: CROW,
    plumage: { body: 0x1e1e24, head: 0x1a1a20, beak: 0x121214, eye: 0x2a2018, legs: 0x141416, wing: 0x22263a, tip: 0x1c1e2a, tail: 0x1c1c24 },
    seed: 302,
  },
  raven: {
    label: 'Raven',
    family: 'crow',
    body: RAVEN,
    plumage: { body: 0x18181e, head: 0x16161c, beak: 0x101012, eye: 0x241a14, legs: 0x121214, wing: 0x26223a, tip: 0x1c1a2a, tail: 0x18181e },
    extras: hackles(0x1c1c24),
    seed: 303,
  },
  gull: {
    label: 'Herring gull',
    family: 'gull',
    body: GULL,
    plumage: { body: 0xe8eaec, back: 0x9ca8b6, head: 0xeeeeec, beak: 0xe8c040, eye: 0xe8d870, legs: 0xd89a96, wing: 0xa4b0be, tip: 0x1a1a1e, tail: 0xf0f0ee },
    extras: gullMarks(),
    seed: 304,
  },
  gullYoung: {
    label: 'Young gull',
    family: 'gull',
    body: GULL,
    plumage: { body: 0x9a8a74, back: 0x7a6a56, head: 0xaa9c88, beak: 0x2a2420, eye: 0x2a2018, legs: 0xc8a09a, wing: 0x86765e, band: 0x6a5a46, tip: 0x3c3228, tail: 0x8a7a66, tailEnd: 0x3c3228 },
    seed: 305,
  },
  hen: {
    label: 'Hen',
    family: 'hen',
    body: HEN,
    plumage: { body: 0x9a5a2c, back: 0x8a4c24, breast: 0xa86834, head: 0x9a5a2c, neck: 0xb07038, beak: 0xd8b048, eye: 0xd88a2a, legs: 0xd8b048, wing: 0x7a4422, tip: 0x5a3018, tail: 0x3a2618 },
    extras: comb(0.03, true),
    seed: 306,
  },
  henWhite: {
    label: 'White hen',
    family: 'hen',
    body: HEN,
    plumage: { body: 0xe6e0ce, head: 0xeae4d4, beak: 0xd8b048, eye: 0xd88a2a, legs: 0xd8b048, wing: 0xdcd6c2, tip: 0xcac2ac, tail: 0xe0dac6 },
    extras: comb(0.034, true),
    seed: 307,
  },
  henBlack: {
    label: 'Black hen',
    family: 'hen',
    body: HEN,
    plumage: { body: 0x262224, head: 0x2a2626, neck: 0x23302a, beak: 0x4a4440, eye: 0xa86a2a, legs: 0x4a4440, wing: 0x202420, tip: 0x1a1c1a, tail: 0x1c2a24 },
    extras: comb(0.03, true),
    seed: 308,
  },
  henSpeckled: {
    label: 'Speckled hen',
    family: 'hen',
    body: HEN,
    plumage: { body: 0x8a8476, back: 0x6e6a5e, breast: 0x9a9486, head: 0x8a8476, neck: 0xa29c8c, beak: 0xd0b050, eye: 0xd88a2a, legs: 0xd0b050, wing: 0x76705e, band: 0x4a463c, tip: 0x5a564a, tail: 0x3e3a32 },
    extras: comb(0.028, true),
    seed: 309,
  },
  cock: {
    label: 'Cock',
    family: 'hen',
    body: COCK,
    plumage: { body: 0x2a1e1a, back: 0xa8401e, breast: 0x221a18, head: 0xc0581e, neck: 0xd88a2a, beak: 0xd8b048, eye: 0xd88a2a, legs: 0xd8b048, wing: 0x9a3a1c, band: 0x1e3a2c, tip: 0x3a2a1a, tail: 0x1a3226 },
    extras: (ctx) => {
      comb(0.05, true)(ctx);
      cockTail(0x1e3a2c, 0xd88a2a)(ctx);
    },
    seed: 310,
  },
  grouse: {
    label: 'Red grouse',
    family: 'hen',
    body: GROUSE,
    plumage: { body: 0x7a3a22, back: 0x5e2c1a, breast: 0x6e321e, head: 0x763620, beak: 0x2a2420, eye: 0x1e1612, legs: 0xd4ccbc, wing: 0x6a3420, band: 0x4a2414, tip: 0x5a3626, tail: 0x241812 },
    extras: brows(0xd0302a),
    seed: 311,
  },
  mallard: {
    label: 'Mallard drake',
    family: 'duck',
    body: MALLARD,
    plumage: { body: 0xaeaca2, back: 0x6e665a, breast: 0x6a3a2a, head: 0x1e6a36, neck: 0x1e6a36, beak: 0xd0c440, eye: 0x1a1210, legs: 0xe0862a, wing: 0x7a7468, band: 0x3a4aa8, tip: 0x5a564e, tail: 0xd8d8d0 },
    extras: drake(),
    seed: 312,
  },
  mallardDuck: {
    label: 'Mallard duck',
    family: 'duck',
    body: MALLARD,
    plumage: { body: 0x8a6a48, back: 0x6a5038, breast: 0x9a7a56, head: 0x9a8264, neck: 0x9a8264, beak: 0xb87a3a, eye: 0x1a1210, legs: 0xd8822a, wing: 0x7a5e42, band: 0x3a4aa8, tip: 0x5e4a36, tail: 0x8a6e4e },
    seed: 313,
  },
  swan: {
    label: 'Mute swan',
    family: 'duck',
    body: SWAN,
    plumage: { body: 0xf0eee8, head: 0xf4f2ec, beak: 0xe0742a, eye: 0x141414, legs: 0x1e1e1e, wing: 0xeceae2, tip: 0xe2e0d6, tail: 0xeceae4 },
    extras: swanKnob(),
    seed: 314,
  },
  goose: {
    label: 'Goose',
    family: 'duck',
    body: GOOSE,
    plumage: { body: 0x8e8674, back: 0x6e6656, breast: 0x9a927e, head: 0x7a7262, neck: 0x847c6a, beak: 0xe0864a, eye: 0x1a1410, legs: 0xd89a8a, wing: 0x7c7462, band: 0x5e574a, tip: 0x6a6656, tail: 0xe6e4dc },
    seed: 315,
  },
  heron: {
    label: 'Grey heron',
    family: 'heron',
    body: HERON,
    plumage: { body: 0xd8dade, back: 0x8a929c, breast: 0xe6e6e6, head: 0xeceeee, neck: 0xe0e2e4, beak: 0xd8a040, eye: 0xe0c040, legs: 0x9a8a5a, wing: 0x8e96a0, band: 0x7a828e, tip: 0x2a2c32, tail: 0x8a929c },
    extras: crest(0x1a1a1e, 0.1),
    seed: 316,
  },
  egret: {
    label: 'Little egret',
    family: 'heron',
    body: EGRET,
    plumage: { body: 0xf2f2ee, head: 0xf6f6f2, beak: 0x1a1a1a, eye: 0xe0c040, legs: 0x1e1e1e, wing: 0xeeeeea, tip: 0xe6e6e0, tail: 0xeeeeea },
    extras: crest(0xf2f2ee, 0.09),
    seed: 317,
  },
  bittern: {
    label: 'Bittern',
    family: 'heron',
    body: BITTERN,
    plumage: { body: 0x9a7a4a, back: 0x6a5030, breast: 0xb08e5a, head: 0x7a5a34, neck: 0xa8864e, beak: 0xb8a040, eye: 0xd8c040, legs: 0x8a9a4a, wing: 0x8a6a3e, band: 0x5e4428, tip: 0x5a4226, tail: 0x7a5a36 },
    seed: 318,
  },
  curlew: {
    label: 'Curlew',
    family: 'heron',
    body: CURLEW,
    plumage: { body: 0x8a7458, back: 0x6a563e, breast: 0xa08a6c, head: 0x7e6a50, beak: 0x3a2e26, eye: 0x1a1410, legs: 0x6a7480, wing: 0x7a654a, band: 0x5a4834, tip: 0x4a3c2c, tail: 0x8a7a62 },
    beakCurve: 0.035,
    seed: 319,
  },
} satisfies Record<string, BirdLook>;

/** One of the birds, by name. */
export type BirdLookId = keyof typeof BIRD_LOOKS;
