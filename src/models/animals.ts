import type { ModelBuilder, PartOpts, Vec3 } from './kit';
import { PAL } from './palette';
import { legs, type QuadDresser, type QuadProportions, waist } from './quadruped';

// The animals on the four-legged skeleton (quadruped.ts), dressed in code in
// the same blocks and grain as the people: sheep, dogs, wolves and horses.
// Each look is an `Animal`: its species, its proportions and its dresser. One
// dresser per species is shared by its looks (a ewe and a white sheep are one
// dresser with other colours and sizes). Everyone of a look shares one
// geometry (animals/herds.ts), so a flock of sixteen costs one build.

const PI = Math.PI;

/** Animal colours, alongside the game's palette (palette.ts). */
export const COAT = {
  fleeceMoor: 0x8a7f6c,
  fleeceMoorDark: 0x6e6454,
  fleeceWhite: 0xe2dccb,
  fleeceWhiteShade: 0xc8c0ac,
  fleeceLamb: 0xb4aa96,
  faceDark: 0x2e2824,
  faceWhite: 0xd8c4b4,
  horn: 0xb8aa88,
  hornDark: 0x8a7c60,
  hoof: 0x2a2420,
  nose: 0x1a1412,
  eye: 0x120c0a,
  black: 0x221e1c,
  white: 0xe4ded0,
  tan: 0x9a6a3c,
  brown: 0x6a4428,
  brownDark: 0x4a2e1c,
  sandy: 0xa88458,
  grey: 0x7c7870,
  greyDark: 0x55524c,
  wolf: 0x6e6658,
  wolfDark: 0x48413a,
  wolfPale: 0xb0a690,
  wolfEye: 0xffb030,
  bay: 0x7a4024,
  bayDark: 0x4e2818,
  dapple: 0x9a968c,
  dappleLight: 0xc4c0b6,
  mane: 0x2a201a,
  pink: 0xb88878,
} as const;

/** A species: who shares a body and its animations. */
export type Species = 'sheep' | 'dog' | 'horse';

/** One look of an animal: what it is, how big, and how it's dressed. */
export interface Animal {
  readonly label: string;
  readonly species: Species;
  readonly proportions: QuadProportions;
  readonly dress: QuadDresser;
  /** Seeds the per-face shading, so two looks don't shade alike. */
  readonly seed: number;
}

/**
 * The tip of the muzzle, under the nose, in the head bone's space: what
 * reaches the grass when an animal of `species` grazes, or the scent when a
 * dog sniffs (animals/poses.ts).
 */
export function muzzleOf(species: Species, p: QuadProportions): Vec3 {
  switch (species) {
    case 'sheep':
      return [0, -0.045 * p.head, 0.17 * p.head];
    case 'dog':
      return [0, -0.03 * p.head, 0.18 * p.head];
    case 'horse': {
      const s = p.body;
      return [0, -0.26 * s, 0.47 * s];
    }
  }
}

// ---------------------------------------------------------------- shared parts

/**
 * A tapered block from `a` to `b` (both on the bone's middle plane, x = 0):
 * `w0`×`d0` at `a` to `w1`×`d1` at `b`, its depth across the line in the
 * up-and-forward plane. Necks, tails, bodies.
 */
function spar(bd: ModelBuilder, a: readonly [number, number], b: readonly [number, number], w0: number, d0: number, w1: number, d1: number, o: PartOpts): ModelBuilder {
  const dy = b[0] - a[0];
  const dz = b[1] - a[1];
  return bd.taper(w0, d0, w1, d1, Math.hypot(dy, dz), { ...o, at: [0, a[0], a[1]], rot: [Math.atan2(dz, dy), 0, 0] });
}

/**
 * A length of body along the back, set by its top line: from `z0` to `z1`,
 * its top at `top0` then `top1`, `h0` then `h1` deep and `w0` then `w1` wide.
 * A deep chest and a tucked-up loin keep a level back.
 */
function trunk(b: ModelBuilder, z0: number, top0: number, w0: number, h0: number, z1: number, top1: number, w1: number, h1: number, o: PartOpts): ModelBuilder {
  return spar(b, [top0 - h0 / 2, z0], [top1 - h1 / 2, z1], w0, h0, w1, h1, o);
}

/** Two eyes on a head, `x` apart from the middle, at (y, z). */
function eyes(b: ModelBuilder, x: number, y: number, z: number, size: number, color: number = COAT.eye, glow = 0): ModelBuilder {
  for (const s of [-1, 1]) b.box(size, size, size * 0.6, { at: [s * x, y, z], color, glow, jitter: 0 });
  return b;
}

/** The neck's line, root to the head's pivot, in the neck's space. */
function neckLine(p: QuadProportions): readonly [number, number] {
  return [p.neck * Math.sin(p.neckRise), p.neck * Math.cos(p.neckRise)];
}

/** Turns a box to lie along the neck (its height along the neck's line). */
function alongNeck(p: QuadProportions): Vec3 {
  return [PI / 2 - p.neckRise, 0, 0];
}

// ---------------------------------------------------------------- sheep

interface SheepLook {
  fleece: number;
  /** The darker wool under the belly. */
  shade: number;
  face: number;
  /** Fleece size: 1 a moor ewe, more for the landlord's fat white sheep. */
  fat: number;
  horns: boolean;
}

/**
 * Half a fleece, from `z0` to `z1` in its bone's space, centred at height `y`:
 * a block with its edges rounded off by two more, the end at `cap` (−1 the
 * rump, 1 the chest) rounded too, and darker wool under the belly.
 */
function fleece(b: ModelBuilder, z0: number, z1: number, y: number, W: number, H: number, cap: -1 | 1, l: SheepLook): void {
  const L = z1 - z0;
  const z = (z0 + z1) / 2;
  const o = { color: l.fleece, jitter: 0.12 };
  const e = 0.05 * W;
  b.box(W, H * 0.76, L, { ...o, at: [0, y, z] })
    .box(W * 0.76, H, L * 0.94, { ...o, at: [0, y, z] })
    .box(W * 0.8, H * 0.74, e * 2, { ...o, at: [0, y, cap > 0 ? z1 + e * 0.6 : z0 - e * 0.6] })
    .box(W * 0.78, H * 0.16, L * 0.9, { color: l.shade, jitter: 0.16, at: [0, y - H * 0.44, z] });
}

function dressSheep(l: SheepLook): QuadDresser {
  return (ctx) => {
    const p = ctx.p;
    const k = p.head; // a lamb's head is smaller
    const s = p.body / 0.5;
    const W = 0.34 * l.fat * s;
    const H = 0.3 * (0.85 + 0.15 * l.fat) * s;
    const mid = waist(p);
    const rise = p.shoulderY - p.hipY;
    // The fleece hangs down over the tops of the legs; the rump on the hips, the barrel and chest on the spine.
    const y = H / 2 - 0.12 * s;
    fleece(ctx.on('hips'), -0.15 * s, mid + 0.04 * s, y, W, H, -1, l);
    fleece(ctx.on('spine'), -0.02 * s, p.body - mid + 0.04 * s, y + rise, W * 1.02, H * 1.02, 1, l);
    // The neck in its fleece, rising out of the chest.
    const [ny, nz] = neckLine(p);
    spar(ctx.on('neck'), [-0.07 * s, -0.04 * s], [ny, nz], 0.18 * s * l.fat, 0.2 * s, 0.12 * k * l.fat, 0.13 * k, { color: l.fleece, jitter: 0.12 });
    // The head: bare, long in the face, the nose dark.
    ctx
      .on('head')
      .box(0.1 * k, 0.11 * k, 0.12 * k, { at: [0, 0.01 * k, 0.02 * k], color: l.face })
      .taper(0.09 * k, 0.1 * k, 0.065 * k, 0.07 * k, 0.1 * k, { at: [0, -0.01 * k, 0.07 * k], rot: [PI / 2 + 0.25, 0, 0], color: l.face })
      .box(0.05 * k, 0.03 * k, 0.03 * k, { at: [0, -0.02 * k, 0.175 * k], color: COAT.nose, jitter: 0 })
      // A topknot of fleece, and the ears out sideways.
      .box(0.11 * k, 0.05 * k, 0.08 * k, { at: [0, 0.075 * k, -0.01 * k], color: l.fleece })
      .box(0.07 * k, 0.025 * k, 0.035 * k, { at: [0.08 * k, 0.03 * k, -0.02 * k], rot: [0, 0, -0.35], color: l.face })
      .box(0.07 * k, 0.025 * k, 0.035 * k, { at: [-0.08 * k, 0.03 * k, -0.02 * k], rot: [0, 0, 0.35], color: l.face });
    eyes(ctx.on('head'), 0.05 * k, 0.03 * k, 0.065 * k, 0.022 * k, 0xc8a040);
    if (l.horns) {
      // Curled horns: three blocks round each side, back, down and forward.
      for (const side of [-1, 1]) {
        ctx
          .on('head')
          .box(0.035, 0.035, 0.07, { at: [side * 0.055 * k, 0.07 * k, -0.04 * k], rot: [0.5, 0, 0], color: COAT.horn })
          .box(0.035, 0.07, 0.035, { at: [side * 0.075 * k, 0.02 * k, -0.075 * k], color: COAT.hornDark })
          .box(0.03, 0.03, 0.06, { at: [side * 0.08 * k, -0.025 * k, -0.04 * k], rot: [-0.4, 0, 0], color: COAT.horn });
      }
    }
    ctx.on('jaw').box(0.05 * k, 0.025 * k, 0.08 * k, { at: [0, -0.005 * k, 0.07 * k], color: l.face });
    // A short tail, hanging.
    ctx.on('tail').bar([0, 0.01, 0.02], [0, -p.tail * 0.9, -p.tail * 0.35], 0.06 * l.fat * s, 0.05 * s, { color: l.fleece });
    // Thin dark legs, woolly at the top.
    const leg = { lower: [0.035 * s, 0.04 * s] as const, color: l.fleece, shank: l.face, foot: { color: COAT.hoof, size: [0.045 * s, 0.035 * s, 0.05 * s] as const } };
    legs(ctx, { ...leg, upper: [0.07 * l.fat * s, 0.08 * s] }, { ...leg, upper: [0.08 * l.fat * s, 0.1 * s] });
  };
}

const EWE: QuadProportions = {
  hipY: 0.42,
  shoulderY: 0.43,
  body: 0.5,
  hipW: 0.085,
  shoulderW: 0.08,
  knee: 0.5,
  hock: 0.42,
  hockBack: 0.05,
  withers: 0,
  neck: 0.29,
  neckRise: 0.8,
  head: 1,
  tail: 0.14,
};

// ---------------------------------------------------------------- dogs and wolves

interface CanineLook {
  coat: number;
  /** The darker saddle along the back. */
  saddle: number;
  /** Chest, muzzle and belly. */
  pale: number;
  /** White feet and tail tip (a collie's), or none. */
  socks?: number;
  /** A white ring round the neck and a blaze down the face (a collie's), or none. */
  collie?: number;
  ears: 'pricked' | 'folded' | 'drop';
  tail: 'bushy' | 'thin';
  /** A rough ruff along the neck and back: the wolf's ragged coat. */
  ruff?: number;
  eye: number;
  /** Eye glow: an enemy's eyes catch the light. */
  glow?: number;
  /** A leather collar, for a dog with a master. */
  collar?: number;
}

/** The canine body's size against a sheepdog's: the dressers scale by it. */
function canineScale(p: QuadProportions): number {
  return p.body / 0.42;
}

function dressCanine(l: CanineLook): QuadDresser {
  return (ctx) => {
    const p = ctx.p;
    const s = canineScale(p);
    const h = p.head;
    const mid = waist(p);
    const rise = p.shoulderY - p.hipY;
    const front = p.body - mid;
    const coat = { color: l.coat };
    // A lean body: the rump, the loin tucked up behind the ribs, and a deep chest.
    trunk(ctx.on('hips'), -0.075 * s, 0.1 * s, 0.13 * s, 0.14 * s, mid + 0.03 * s, 0.1 * s, 0.12 * s, 0.12 * s, coat);
    trunk(ctx.on('spine'), -0.03 * s, 0.1 * s, 0.12 * s, 0.12 * s, front + 0.06 * s, rise + 0.11 * s, 0.15 * s, 0.22 * s, coat);
    if (l.saddle !== l.coat) trunk(ctx.on('spine'), -0.06 * s, 0.11 * s, 0.09 * s, 0.03 * s, front - 0.02 * s, rise + 0.12 * s, 0.1 * s, 0.03 * s, { color: l.saddle });
    // The pale chest, under the throat.
    ctx.on('spine').box(0.11 * s, 0.15 * s, 0.04 * s, { at: [0, rise - 0.02 * s, front + 0.05 * s], color: l.collie ?? l.pale });
    // The neck, deep at its root.
    const [ny, nz] = neckLine(p);
    spar(ctx.on('neck'), [-0.06 * s, -0.03 * s], [ny, nz], 0.11 * s, 0.15 * s, 0.09 * h, 0.1 * h, coat);
    if (l.ruff !== undefined) {
      // Ragged fur: a collar of tufts at the neck's root and a crest down the back.
      ctx
        .on('neck')
        .box(0.16 * s, 0.12 * s, 0.1 * s, { at: [0, 0.0, 0.01 * s], rot: alongNeck(p), color: l.ruff, jitter: 0.14 })
        .box(0.06 * s, 0.06 * s, 0.08 * s, { at: [0.08 * s, -0.03 * s, 0.03 * s], rot: [0.2, 0.3, 0.4], color: l.ruff })
        .box(0.06 * s, 0.06 * s, 0.08 * s, { at: [-0.08 * s, -0.03 * s, 0.03 * s], rot: [0.2, -0.3, -0.4], color: l.ruff });
      ctx
        .on('spine')
        .box(0.06 * s, 0.04 * s, 0.12 * s, { at: [0, rise + 0.12 * s, front * 0.55], rot: [0.25, 0, 0], color: l.ruff })
        .box(0.05 * s, 0.035 * s, 0.1 * s, { at: [0, 0.11 * s, front * 0.05], rot: [0.2, 0, 0.1], color: l.ruff });
    }
    // A ring of white round the neck (a collie's), or a leather collar.
    const ring = l.collie ?? l.collar;
    if (ring !== undefined) {
      const big = l.collie !== undefined;
      ctx.on('neck').box(0.13 * s * (big ? 1.08 : 1), big ? 0.06 * s : 0.025 * s, 0.15 * s * (big ? 1.05 : 0.95), { at: [0, ny * 0.3, nz * 0.3], rot: alongNeck(p), color: ring, jitter: 0.04 });
    }
    // The head: a skull, a muzzle and a nose; the lower jaw on its own bone.
    const b = ctx.on('head');
    b.box(0.12 * h, 0.1 * h, 0.12 * h, { at: [0, 0.02 * h, 0.02 * h], color: l.coat })
      .taper(0.075 * h, 0.07 * h, 0.06 * h, 0.05 * h, 0.1 * h, { at: [0, -0.012 * h, 0.075 * h], rot: [PI / 2, 0, 0], color: l.pale })
      .box(0.05 * h, 0.028 * h, 0.03 * h, { at: [0, 0.0, 0.18 * h], color: COAT.nose, jitter: 0 })
      // The upper teeth, under the muzzle's tip.
      .box(0.05 * h, 0.012 * h, 0.012 * h, { at: [0, -0.042 * h, 0.16 * h], color: PAL.bone, mask: 1, jitter: 0 });
    if (l.saddle !== l.coat) b.box(0.06 * h, 0.022 * h, 0.06 * h, { at: [0, 0.07 * h, 0.03 * h], color: l.saddle });
    if (l.collie !== undefined) b.box(0.028 * h, 0.012 * h, 0.13 * h, { at: [0, 0.064 * h, 0.07 * h], rot: [0.32, 0, 0], color: l.collie, jitter: 0.03 });
    eyes(b, 0.038 * h, 0.04 * h, 0.08 * h, 0.022 * h, l.eye, l.glow ?? 0);
    for (const side of [-1, 1]) {
      const x = side * 0.04 * h;
      if (l.ears === 'pricked') b.taper(0.045 * h, 0.025 * h, 0.012 * h, 0.01 * h, 0.07 * h, { at: [x, 0.065 * h, -0.01 * h], rot: [-0.15, 0, -side * 0.2], color: l.saddle });
      else if (l.ears === 'folded')
        b.taper(0.045 * h, 0.022 * h, 0.03 * h, 0.012 * h, 0.05 * h, { at: [x, 0.065 * h, 0.0], rot: [0.9, 0, -side * 0.25], color: l.saddle });
      else b.box(0.035 * h, 0.08 * h, 0.05 * h, { at: [side * 0.068 * h, 0.02 * h, 0.0], rot: [0, 0, side * 0.2], color: l.saddle });
    }
    // The lower jaw, its teeth showing: the bite's business end (`mask`: its telegraph).
    ctx
      .on('jaw')
      .box(0.055 * h, 0.022 * h, 0.12 * h, { at: [0, -0.006 * h, 0.08 * h], color: l.pale })
      .box(0.045 * h, 0.012 * h, 0.012 * h, { at: [0, 0.01 * h, 0.13 * h], color: PAL.bone, mask: 1, jitter: 0 });
    // The tail, hanging from the rump.
    const T = p.tail;
    const t = ctx.on('tail');
    if (l.tail === 'bushy') {
      // Hanging low, the brush thickening, its tip turned out.
      t.bar([0, 0.01, 0.01], [0, -T * 0.5, -T * 0.32], 0.05 * s, 0.06 * s, coat)
        .bar([0, -T * 0.45, -T * 0.29], [0, -T * 0.82, -T * 0.4], 0.07 * s, 0.075 * s, coat)
        .bar([0, -T * 0.78, -T * 0.39], [0, -T * 1.0, -T * 0.5], 0.06 * s, 0.065 * s, { color: l.socks ?? l.saddle });
    } else t.bar([0, 0.01, 0.01], [0, -T * 0.66, -T * 0.4], 0.03 * s, 0.035 * s, coat).bar([0, -T * 0.64, -T * 0.39], [0, -T * 0.92, -T * 0.6], 0.028 * s, 0.03 * s, coat);
    const foot = { color: l.socks ?? l.pale, size: [0.05 * s, 0.03 * s, 0.07 * s] as const };
    legs(
      ctx,
      { upper: [0.05 * s, 0.065 * s], lower: [0.036 * s, 0.04 * s], color: l.coat, foot, tuck: 0.05 * s },
      { upper: [0.06 * s, 0.09 * s], lower: [0.036 * s, 0.04 * s], color: l.coat, foot, tuck: 0.05 * s },
    );
  };
}

const DOG: QuadProportions = {
  hipY: 0.36,
  shoulderY: 0.38,
  body: 0.42,
  hipW: 0.06,
  shoulderW: 0.06,
  knee: 0.45,
  hock: 0.38,
  hockBack: 0.07,
  withers: 0,
  neck: 0.22,
  neckRise: 0.8,
  head: 1,
  tail: 0.32,
};

/** A moor hound: a rough grey lurcher, taller and leaner than a sheepdog. */
const LURCHER: QuadProportions = { ...DOG, hipY: 0.46, shoulderY: 0.48, body: 0.5, hock: 0.36, hockBack: 0.09, neck: 0.28, neckRise: 0.75, head: 1.1, tail: 0.42 };

/** A wolf: a big dog, long in the leg, its head carried low. */
export const WOLF_BUILD: QuadProportions = {
  hipY: 0.52,
  shoulderY: 0.56,
  body: 0.6,
  hipW: 0.075,
  shoulderW: 0.075,
  knee: 0.45,
  hock: 0.37,
  hockBack: 0.1,
  withers: 0.06,
  neck: 0.24,
  neckRise: 0.5,
  head: 1.3,
  tail: 0.44,
};

// ---------------------------------------------------------------- horses

interface HorseLook {
  coat: number;
  /** The lower legs (a bay's black points). */
  points: number;
  mane: number;
  /** A white blaze down the face, or none. */
  blaze?: number;
  /** Long white hair round the hooves: a cart horse's feathering. */
  feathers?: number;
  tack: 'collar' | 'saddle' | 'blinkers';
  /** The saddle cloth or the collar's pad. */
  cloth: number;
}

function dressHorse(l: HorseLook): QuadDresser {
  return (ctx) => {
    const p = ctx.p;
    const s = p.body;
    const mid = waist(p);
    const rise = p.shoulderY - p.hipY;
    const front = p.body - mid;
    const coat = { color: l.coat };
    // The quarters, rounded over the croup; the barrel deep under the ribs; the chest.
    trunk(ctx.on('hips'), -0.22 * s, 0.38 * s, 0.4 * s, 0.5 * s, mid + 0.06 * s, 0.42 * s, 0.47 * s, 0.56 * s, coat);
    trunk(ctx.on('hips'), -0.18 * s, 0.42 * s, 0.26 * s, 0.4 * s, mid, 0.45 * s, 0.32 * s, 0.4 * s, coat);
    trunk(ctx.on('spine'), -0.04 * s, 0.43 * s, 0.48 * s, 0.6 * s, front + 0.13 * s, rise + 0.5 * s, 0.4 * s, 0.6 * s, coat);
    // The withers, over the shoulders.
    ctx.on('spine').box(0.18 * s, 0.12 * s, 0.32 * s, { at: [0, rise + 0.5 * s, front - 0.06 * s], rot: [-0.15, 0, 0], ...coat });
    // A long neck, deep at its root, the mane along its crest.
    const [ny, nz] = neckLine(p);
    spar(ctx.on('neck'), [-0.16 * s, -0.12 * s], [ny, nz], 0.24 * s, 0.5 * s, 0.15 * s, 0.26 * s, coat);
    const crest: [number, number] = [Math.cos(p.neckRise), -Math.sin(p.neckRise)];
    for (let i = 0; i < 4; i++) {
      const u = 0.04 + i * 0.27;
      const d = 0.24 * s - u * 0.1 * s;
      ctx.on('neck').box(0.07 * s, 0.22 * s, 0.08 * s, {
        at: [0, ny * u + crest[0] * d * 0.55, nz * u + crest[1] * d * 0.55],
        rot: [PI / 2 - p.neckRise + 0.15, 0, 0],
        color: l.mane,
      });
    }
    // The head hangs from its pivot at the poll, the muzzle forward and down.
    const b = ctx.on('head');
    b.box(0.2 * s, 0.2 * s, 0.22 * s, { at: [0, -0.02 * s, 0.06 * s], ...coat })
      .taper(0.18 * s, 0.16 * s, 0.14 * s, 0.12 * s, 0.34 * s, { at: [0, -0.07 * s, 0.14 * s], rot: [PI / 2 + 0.35, 0, 0], ...coat })
      .box(0.15 * s, 0.1 * s, 0.1 * s, { at: [0, -0.2 * s, 0.45 * s], rot: [0.35, 0, 0], color: COAT.greyDark })
      // The forelock.
      .box(0.05 * s, 0.08 * s, 0.07 * s, { at: [0, 0.11 * s, 0.07 * s], rot: [0.4, 0, 0], color: l.mane });
    eyes(b, 0.095 * s, 0.03 * s, 0.1 * s, 0.035 * s);
    for (const side of [-1, 1]) b.taper(0.05 * s, 0.035 * s, 0.015 * s, 0.015 * s, 0.11 * s, { at: [side * 0.06 * s, 0.07 * s, -0.01 * s], rot: [-0.25, 0, -side * 0.2], ...coat });
    if (l.blaze !== undefined) b.box(0.05 * s, 0.03 * s, 0.32 * s, { at: [0, -0.005 * s, 0.26 * s], rot: [0.35, 0, 0], color: l.blaze, jitter: 0.03 });
    // A bridle's noseband; blinkers on a coach horse.
    b.box(0.21 * s, 0.035 * s, 0.035 * s, { at: [0, -0.13 * s, 0.33 * s], rot: [0.35, 0, 0], color: PAL.leatherDark });
    if (l.tack === 'blinkers') for (const side of [-1, 1]) b.box(0.02 * s, 0.07 * s, 0.08 * s, { at: [side * 0.12 * s, 0.03 * s, 0.1 * s], color: PAL.leatherDark });
    // The lower lip on the jaw: it chews as it crops.
    ctx.on('jaw').box(0.12 * s, 0.05 * s, 0.14 * s, { at: [0, -0.12 * s, 0.36 * s], rot: [0.35, 0, 0], ...coat });
    // The tail: a dock and a long fall of hair.
    ctx
      .on('tail')
      .bar([0, 0.02 * s, 0.02 * s], [0, -0.12 * s, -0.12 * s], 0.09 * s, 0.09 * s, { color: l.mane })
      .bar([0, -0.1 * s, -0.12 * s], [0, -p.tail, -0.2 * s], 0.13 * s, 0.07 * s, { color: l.mane });
    // Tack.
    if (l.tack === 'saddle') {
      ctx
        .on('spine')
        .box(0.52 * s, 0.04 * s, 0.4 * s, { at: [0, 0.45 * s + rise * 0.4, front * 0.4], color: l.cloth })
        .box(0.38 * s, 0.08 * s, 0.32 * s, { at: [0, 0.49 * s + rise * 0.4, front * 0.4], color: PAL.leather })
        .box(0.12 * s, 0.07 * s, 0.06 * s, { at: [0, 0.54 * s + rise * 0.4, front * 0.4 + 0.14 * s], color: PAL.leatherDark })
        // The girth.
        .box(0.5 * s, 0.6 * s, 0.05 * s, { at: [0, 0.18 * s + rise * 0.4, front * 0.4], color: PAL.leatherDark });
    } else {
      // A collar round the neck's root, its pad, and the hames' brass knobs.
      ctx
        .on('neck')
        .box(0.34 * s, 0.11 * s, 0.56 * s, { at: [0, ny * 0.14, nz * 0.14 - 0.06 * s], rot: alongNeck(p), color: PAL.leatherDark })
        .box(0.28 * s, 0.07 * s, 0.5 * s, { at: [0, ny * 0.22, nz * 0.22 - 0.06 * s], rot: alongNeck(p), color: l.cloth })
        .box(0.06 * s, 0.06 * s, 0.06 * s, { at: [0.17 * s, ny * 0.2 + 0.14 * s, nz * 0.2 - 0.14 * s], color: PAL.gold })
        .box(0.06 * s, 0.06 * s, 0.06 * s, { at: [-0.17 * s, ny * 0.2 + 0.14 * s, nz * 0.2 - 0.14 * s], color: PAL.gold });
      // The back strap.
      ctx.on('spine').box(0.5 * s, 0.05 * s, 0.1 * s, { at: [0, 0.44 * s + rise * 0.4, front * 0.3], color: PAL.leatherDark });
    }
    const foot = { color: COAT.hoof, size: [0.13 * s, 0.09 * s, 0.15 * s] as const };
    const fore = { upper: [0.13 * s, 0.17 * s] as const, lower: [0.08 * s, 0.09 * s] as const, color: l.coat, shank: l.points, foot, tuck: 0.18 * s };
    legs(ctx, fore, { ...fore, upper: [0.15 * s, 0.24 * s] });
    if (l.feathers !== undefined) {
      for (const shin of ['foreShinL', 'foreShinR', 'hindShinL', 'hindShinR'] as const) {
        const isFore = shin.startsWith('fore');
        const sole = isFore ? -p.shoulderY * p.knee : -p.hipY * p.hock;
        const z = isFore ? 0 : p.hockBack * 0.5;
        ctx.on(shin).box(0.12 * s, 0.13 * s, 0.13 * s, { at: [0, sole + 0.15 * s, z], color: l.feathers, jitter: 0.12 });
      }
    }
  };
}

const RIDING: QuadProportions = {
  hipY: 0.98,
  shoulderY: 1.0,
  body: 0.92,
  hipW: 0.13,
  shoulderW: 0.12,
  knee: 0.46,
  hock: 0.44,
  hockBack: 0.14,
  withers: 0.2,
  neck: 0.72,
  neckRise: 0.8,
  head: 2.4,
  tail: 0.85,
};

/** A cart horse: heavier and broader, a little lower in the neck. */
const CART: QuadProportions = { ...RIDING, hipY: 1.0, shoulderY: 1.02, body: 1.04, hipW: 0.16, shoulderW: 0.15, neck: 0.76, neckRise: 0.74, head: 2.6, tail: 0.95 };

// ---------------------------------------------------------------- the animals

/**
 * Every animal look a zone can place (animals/herds.ts), by name: the moor's
 * ewes and lambs and the landlord's white sheep; the sheepdog, the town and
 * farm dogs and Red Annis's moor hounds; the cart, riding and coach horses.
 */
export const ANIMALS = {
  moorEwe: {
    label: 'Moor ewe',
    species: 'sheep',
    proportions: EWE,
    dress: dressSheep({ fleece: COAT.fleeceMoor, shade: COAT.fleeceMoorDark, face: COAT.faceDark, fat: 1, horns: true }),
    seed: 31,
  },
  whiteSheep: {
    label: 'White sheep',
    species: 'sheep',
    proportions: { ...EWE, hipY: 0.44, shoulderY: 0.45, body: 0.56, hipW: 0.1, shoulderW: 0.095, neck: 0.31 },
    dress: dressSheep({ fleece: COAT.fleeceWhite, shade: COAT.fleeceWhiteShade, face: COAT.faceWhite, fat: 1.3, horns: false }),
    seed: 37,
  },
  lamb: {
    label: 'Lamb',
    species: 'sheep',
    proportions: { ...EWE, hipY: 0.3, shoulderY: 0.31, body: 0.3, hipW: 0.055, shoulderW: 0.05, knee: 0.52, hockBack: 0.03, withers: 0.02, neck: 0.18, head: 0.82, tail: 0.1 },
    dress: dressSheep({ fleece: COAT.fleeceLamb, shade: COAT.fleeceMoor, face: COAT.faceDark, fat: 1, horns: false }),
    seed: 41,
  },
  sheepdog: {
    label: 'Sheepdog',
    species: 'dog',
    proportions: DOG,
    dress: dressCanine({ coat: COAT.black, saddle: COAT.black, pale: COAT.white, socks: COAT.white, collie: COAT.white, ears: 'folded', tail: 'bushy', eye: COAT.eye }),
    seed: 43,
  },
  townDog: {
    label: 'Town dog',
    species: 'dog',
    proportions: { ...DOG, hipY: 0.33, shoulderY: 0.35, body: 0.4 },
    dress: dressCanine({ coat: COAT.brown, saddle: COAT.brownDark, pale: COAT.tan, ears: 'drop', tail: 'thin', eye: COAT.eye, collar: PAL.leatherDark }),
    seed: 47,
  },
  farmDog: {
    label: 'Farm dog',
    species: 'dog',
    proportions: { ...DOG, hipY: 0.4, shoulderY: 0.42, body: 0.46, head: 1.08 },
    dress: dressCanine({ coat: COAT.sandy, saddle: COAT.tan, pale: COAT.white, ears: 'folded', tail: 'bushy', eye: COAT.eye }),
    seed: 53,
  },
  hound: {
    label: 'Moor hound',
    species: 'dog',
    proportions: LURCHER,
    dress: dressCanine({ coat: COAT.grey, saddle: COAT.greyDark, pale: COAT.dappleLight, ears: 'folded', tail: 'thin', ruff: COAT.greyDark, eye: COAT.eye, collar: PAL.cloth }),
    seed: 59,
  },
  cartHorse: {
    label: 'Cart horse',
    species: 'horse',
    proportions: CART,
    dress: dressHorse({ coat: COAT.dapple, points: COAT.greyDark, mane: COAT.greyDark, blaze: COAT.dappleLight, feathers: COAT.white, tack: 'collar', cloth: PAL.cloth }),
    seed: 61,
  },
  ridingHorse: {
    label: 'Riding horse',
    species: 'horse',
    proportions: RIDING,
    dress: dressHorse({ coat: COAT.bay, points: COAT.mane, mane: COAT.mane, blaze: COAT.white, tack: 'saddle', cloth: PAL.hood }),
    seed: 67,
  },
  coachHorse: {
    label: 'Coach horse',
    species: 'horse',
    proportions: { ...RIDING, hipY: 1.0, shoulderY: 1.02, body: 0.98, hipW: 0.14, shoulderW: 0.13, neck: 0.74 },
    dress: dressHorse({ coat: COAT.bayDark, points: COAT.mane, mane: COAT.mane, tack: 'blinkers', cloth: PAL.banner }),
    seed: 71,
  },
} satisfies Record<string, Animal>;

/** One of the animal looks, by name. */
export type AnimalId = keyof typeof ANIMALS;

/** The wolves' looks (enemies/body.ts fights them): grey-brown and ragged, three coats. */
export const WOLF_LOOKS: readonly CanineLook[] = [
  { coat: COAT.wolf, saddle: COAT.wolfDark, pale: COAT.wolfPale, ears: 'pricked', tail: 'bushy', ruff: COAT.wolfDark, eye: COAT.wolfEye, glow: 0.6 },
  { coat: 0x5e584e, saddle: 0x3a3530, pale: 0x98907c, ears: 'pricked', tail: 'bushy', ruff: 0x3a3530, eye: COAT.wolfEye, glow: 0.6 },
  { coat: 0x7e705c, saddle: 0x564a3c, pale: 0xbcb09a, ears: 'pricked', tail: 'bushy', ruff: 0x564a3c, eye: COAT.wolfEye, glow: 0.6 },
];

/** A wolf's dresser, in one of its looks (`variant`, wrapping round). */
export function dressWolf(variant: number): QuadDresser {
  return dressCanine(WOLF_LOOKS[((variant % WOLF_LOOKS.length) + WOLF_LOOKS.length) % WOLF_LOOKS.length]);
}
