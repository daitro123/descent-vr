import { BUILDS, HUE, type Look, shade } from './human';
import { PAL } from './palette';
import type { DressContext } from './rig';

// What the robed and named figures carry (clergy.ts, gentry.ts, trainers.ts),
// on the human body: books and ledgers, a quill, staffs, a lamp, a salt bag
// and a spade, spectacles, chains and rings, a coin box, a sword in the fist,
// caps and badges. Each is a handful of primitives on one bone, so it costs a
// few dozen triangles and no draw call of its own.
//
// In a hand's space the fingers point along -Y, the thumb along +Z and the
// palm faces in across the body (+X for the right hand, -X for the left).
// With the forearm raised level before the chest, -Y points ahead and +Z up:
// a book or ledger lies on +Z, a staff stands along Z, and a blade continues
// the arm along -Y, as the weapons' do.

const PI = Math.PI;

export type Side = 'L' | 'R';
/** Which way is across the body from a hand on `side`: toward the middle. */
const inward = (side: Side) => (side === 'L' ? -1 : 1);

/** Paper, and old paper. */
export const PAGE = 0xe6dcc0;
const INK = 0x2a2420;

/**
 * An open book held on the palm, its pages up: spread across toward the
 * middle of the body, its top edge ahead. Two page blocks in a shallow V on
 * the cover.
 */
export function openBook(ctx: DressContext, side: Side, cover: number, size = 1): void {
  const s = inward(side);
  const w = 0.15 * size;
  const h = 0.2 * size;
  ctx
    .on(`hand${side}`)
    .box(w * 2 + 0.02, h + 0.01, 0.014, { at: [s * (w - 0.03), -0.07, 0.05], color: cover })
    .box(w, h, 0.022, { at: [s * (w * 0.5 - 0.03), -0.07, 0.066], rot: [0, s * 0.12, 0], color: PAGE, jitter: 0.04 })
    .box(w, h, 0.022, { at: [s * (w * 1.5 - 0.02), -0.07, 0.066], rot: [0, -s * 0.12, 0], color: shade(PAGE, 0.94), jitter: 0.04 });
}

/** A closed book carried by its spine in a hanging hand, its boards upright beside the leg. */
export function closedBook(ctx: DressContext, side: Side, cover: number): void {
  ctx
    .on(`hand${side}`)
    .box(0.04, 0.22, 0.16, { at: [0, -0.1, 0.05], color: cover })
    .box(0.034, 0.21, 0.012, { at: [0, -0.1, 0.13], color: PAGE, jitter: 0 });
}

/**
 * A ledger open on the palm (as `openBook`, taller and ruled), and a quill in
 * the other hand, its feather up and back past the knuckles.
 */
export function ledger(ctx: DressContext, side: Side, cover: number): void {
  const s = inward(side);
  ctx
    .on(`hand${side}`)
    .box(0.36, 0.27, 0.016, { at: [s * 0.13, -0.08, 0.05], color: cover })
    .box(0.34, 0.25, 0.024, { at: [s * 0.13, -0.08, 0.068], color: PAGE, jitter: 0.04 })
    // The ruled columns and the line written so far.
    .box(0.005, 0.24, 0.004, { at: [s * 0.13, -0.08, 0.081], color: INK, jitter: 0 })
    .box(0.12, 0.012, 0.004, { at: [s * 0.21, -0.05, 0.081], color: INK, jitter: 0 });
  quill(ctx, side === 'L' ? 'R' : 'L');
}

/** A quill pen held as if writing: the nib below the fingertips, the feather standing up behind. */
export function quill(ctx: DressContext, side: Side): void {
  ctx
    .on(`hand${side}`)
    .bar([0, -0.1, 0.05], [0, 0.02, 0.15], 0.008, 0.008, { color: HUE.apronWhite, jitter: 0 })
    .bar([0, -0.01, 0.13], [0, 0.05, 0.19], 0.004, 0.035, { color: 0xf0ece0, jitter: 0 });
}

export interface StaffOpts {
  /** m of the staff from its foot to its head. */
  length: number;
  /** m from the fist down to the staff's foot. */
  below: number;
  wood?: number;
  /** A lamp at the head: its cage and its glowing light. */
  lamp?: { cage: number; light: number };
}

/**
 * A staff held upright in the fist with the forearm level (along the hand's
 * Z, as the shepherd's crook), its foot `below` the fist; with a lamp, a cage
 * of iron round a glowing light at its head.
 */
export function staff(ctx: DressContext, side: Side, o: StaffOpts): void {
  const b = ctx.on(`hand${side}`);
  const mid = o.length / 2 - o.below;
  b.cyl(0.02, 0.022, o.length, 5, { at: [0, -0.03, mid], rot: [PI / 2, 0, 0], color: o.wood ?? PAL.woodDark });
  if (!o.lamp) return;
  const top = o.length - o.below;
  b.box(0.11, 0.11, 0.014, { at: [0, -0.03, top + 0.005], color: o.lamp.cage })
    .box(0.07, 0.07, 0.12, { at: [0, -0.03, top + 0.07], color: o.lamp.light, glow: 0.9, jitter: 0 })
    .box(0.1, 0.1, 0.02, { at: [0, -0.03, top + 0.135], color: o.lamp.cage })
    .box(0.02, 0.02, 0.06, { at: [0, -0.03, top + 0.17], color: o.lamp.cage });
}

/** A small lantern hung at the right hip on a ring: an iron cage round a glowing light. */
export function hipLamp(ctx: DressContext, l: Look, cage: number, light: number): void {
  const k = BUILDS[l.build].thickness;
  const x = -0.2 * k;
  ctx
    .on('hips')
    .box(0.02, 0.06, 0.02, { at: [x, -0.02, 0.04], color: cage })
    .box(0.09, 0.016, 0.09, { at: [x, -0.06, 0.04], color: cage })
    .box(0.06, 0.1, 0.06, { at: [x, -0.12, 0.04], color: light, glow: 0.85, jitter: 0 })
    .box(0.085, 0.016, 0.085, { at: [x, -0.18, 0.04], color: cage });
}

/** A linen bag at the right hip on a strap from the left shoulder: a hedge priest's salt. */
export function saltBag(ctx: DressContext, l: Look, cloth: number): void {
  const k = BUILDS[l.build].thickness;
  const L = ctx.p.spine;
  ctx.on('spine').box(0.035, L * 1.05, 0.02, { at: [0, L * 0.5, 0.135 * k], rot: [0, 0, -0.55], color: PAL.leather });
  ctx
    .on('hips')
    .box(0.15, 0.17, 0.12, { at: [-0.21 * k, -0.08, 0.05], color: cloth, jitter: 0.1 })
    .box(0.1, 0.03, 0.08, { at: [-0.21 * k, 0.02, 0.05], color: shade(cloth, 0.8) });
}

/** A spade held upright in the fist with the forearm level, its blade on the ground. */
export function spade(ctx: DressContext, side: Side, below: number): void {
  const b = ctx.on(`hand${side}`);
  const len = below + 0.25;
  b.cyl(0.018, 0.018, len, 5, { at: [0, -0.03, len / 2 - below + 0.05], rot: [PI / 2, 0, 0], color: PAL.wood })
    .box(0.12, 0.025, 0.025, { at: [0, -0.03, len - below + 0.05], color: PAL.woodDark })
    .box(0.17, 0.02, 0.24, { at: [0, -0.03, -below + 0.1], color: PAL.iron })
    .box(0.17, 0.024, 0.04, { at: [0, -0.03, -below + 0.03], color: 0x4a3a2a });
}

/** Spectacles on the nose: two round-ish lenses in a thin frame. */
export function spectacles(ctx: DressContext, frame: number): void {
  ctx
    .on('head')
    .box(0.05, 0.036, 0.008, { at: [-0.043, 0.148, 0.112], color: frame, jitter: 0 })
    .box(0.05, 0.036, 0.008, { at: [0.043, 0.148, 0.112], color: frame, jitter: 0 })
    .box(0.034, 0.022, 0.006, { at: [-0.043, 0.148, 0.117], color: 0xc8d4d0, glow: 0.2, jitter: 0 })
    .box(0.034, 0.022, 0.006, { at: [0.043, 0.148, 0.117], color: 0xc8d4d0, glow: 0.2, jitter: 0 });
}

/** A chain hung round the neck in a V to the breastbone, where `pendant` hangs from it. */
export function chain(ctx: DressContext, l: Look, metal: number, front: number, pendant?: (z: number, y: number) => void): void {
  const L = ctx.p.spine;
  const SW = ctx.p.shoulderW;
  const k = BUILDS[l.build].thickness;
  const y = L * 0.56;
  ctx
    .on('spine')
    .bar([-SW * 0.55 * k, L * 0.97, front - 0.02], [0, y, front], 0.016, 0.012, { color: metal, jitter: 0.12 })
    .bar([SW * 0.55 * k, L * 0.97, front - 0.02], [0, y, front], 0.016, 0.012, { color: metal, jitter: 0.12 });
  pendant?.(front + 0.008, y);
}

/** A key hung bow up from a chain at (0, y, z) on the spine: Corvane's black key. */
export function keyPendant(ctx: DressContext, color: number, z: number, y: number): void {
  ctx
    .on('spine')
    .box(0.05, 0.045, 0.014, { at: [0, y - 0.03, z], color })
    .box(0.016, 0.1, 0.014, { at: [0, y - 0.1, z], color })
    .box(0.03, 0.025, 0.014, { at: [-0.02, y - 0.14, z], color });
}

/** A sunburst hung from a chain at (0, y, z) on the spine: the Cathedral of the Dawn's sign. */
export function sunburst(ctx: DressContext, color: number, z: number, y: number): void {
  const b = ctx.on('spine');
  b.box(0.05, 0.05, 0.014, { at: [0, y - 0.05, z], color, glow: 0.15 });
  for (const r of [0, PI / 4]) b.box(0.012, 0.11, 0.01, { at: [0, y - 0.05, z + 0.004], rot: [0, 0, r], color, glow: 0.15 });
  b.box(0.11, 0.012, 0.01, { at: [0, y - 0.05, z + 0.004], color, glow: 0.15 });
}

/** A ring on the fourth finger: a seal of `face` in a band of `band`. */
export function sealRing(ctx: DressContext, side: Side, band: number, face: number): void {
  const x = side === 'L' ? 0.022 : -0.022;
  ctx.on(`hand${side}`).box(0.026, 0.02, 0.06, { at: [x, -0.06, 0.006], color: band, jitter: 0 }).box(0.022, 0.022, 0.02, { at: [x, -0.06, 0.04], color: face, jitter: 0 });
}

/** A small iron-bound box of coins on the palm, the lid open behind. */
export function coinBox(ctx: DressContext, side: Side): void {
  const s = inward(side);
  ctx
    .on(`hand${side}`)
    .box(0.2, 0.15, 0.09, { at: [s * 0.07, -0.07, 0.085], color: PAL.woodDark })
    .box(0.18, 0.13, 0.01, { at: [s * 0.07, -0.07, 0.126], color: PAL.gold, jitter: 0.2 })
    .box(0.2, 0.012, 0.14, { at: [s * 0.07, 0.01, 0.16], rot: [0.3, 0, 0], color: PAL.woodDark })
    .box(0.21, 0.02, 0.095, { at: [s * 0.07, -0.07, 0.085], color: PAL.ironDark });
}

/** A coin pinched in the fingers. */
export function coin(ctx: DressContext, side: Side): void {
  ctx.on(`hand${side}`).cyl(0.018, 0.018, 0.006, 6, { at: [inward(side) * 0.01, -0.085, 0.03], rot: [0, 0, PI / 2], color: PAL.gold, jitter: 0 });
}

/**
 * A longsword in the fist, along the hand's -Y as the enemies' weapons are
 * held, so the attacks' poses swing it: a wire-bound grip, a straight guard
 * of `guard`, and a bright blade.
 */
export function swordInHand(ctx: DressContext, side: Side, guard: number): void {
  ctx
    .on(`hand${side}`)
    .ball(0.026, { at: [0, 0.03, 0], color: guard })
    .box(0.03, 0.12, 0.03, { at: [0, -0.045, 0], color: PAL.leatherDark })
    .box(0.03, 0.03, 0.2, { at: [0, -0.115, 0], color: guard, mask: 1 })
    .taper(0.016, 0.06, 0.006, 0.014, 0.78, { at: [0, -0.13, 0], rot: [PI, 0, 0], color: PAL.steel, mask: 1 });
}

/** A soft round cap, its brim turned up, with a feather swept back over the left ear. */
export function featheredCap(ctx: DressContext, felt: number, feather: number): void {
  ctx
    .on('head')
    .cyl(0.112, 0.118, 0.07, 7, { at: [0, 0.26, -0.01], color: felt })
    .cyl(0.125, 0.125, 0.025, 7, { at: [0, 0.232, -0.01], color: shade(felt, 0.8) })
    .taper(0.03, 0.01, 0.006, 0.006, 0.22, { at: [0.11, 0.26, -0.02], rot: [-1.4, 0, -0.5], color: feather, jitter: 0.05 });
}

/** A flat velvet cap worn to one side: a courtier's, a magister's. */
export function flatCap(ctx: DressContext, color: number): void {
  ctx
    .on('head')
    .cyl(0.16, 0.13, 0.05, 8, { at: [0.02, 0.29, -0.012], rot: [0, 0, 0.2], color })
    .cyl(0.118, 0.118, 0.03, 8, { at: [0.01, 0.258, -0.008], rot: [0, 0, 0.2], color: shade(color, 0.75) });
}

/** A cloak hung from the shoulders down the back to `len` below the shoulders, a clasp at each side of the collar. */
export function cloak(ctx: DressContext, l: Look, color: number, len: number, clasp: number = PAL.iron): void {
  const k = BUILDS[l.build].thickness;
  const L = ctx.p.spine;
  const SW = ctx.p.shoulderW;
  const w = (SW * 2 + 0.12) * k;
  ctx
    .on('spine')
    // Over the shoulders, then down the back, standing off it as it falls.
    .taper(w, 0.3 * k, w - 0.04, 0.26 * k, 0.1, { at: [0, L - 0.07, -0.01], color })
    .taper(w * 1.05, 0.03, w - 0.04, 0.03, len, { at: [0, L + 0.02 - len, -0.15 * k - 0.03], rot: [0.06, 0, 0], color, jitter: 0.06 })
    .box(0.04, 0.04, 0.03, { at: [-SW * 0.6 * k, L - 0.03, 0.12 * k], color: clasp })
    .box(0.04, 0.04, 0.03, { at: [SW * 0.6 * k, L - 0.03, 0.12 * k], color: clasp });
}

/** A badge on the chest at height `y` up the spine, standing `z` forward: a plain shape in `color`. */
export function badge(ctx: DressContext, z: number, y: number, color: number, shape: 'tower' | 'ship'): void {
  const b = ctx.on('spine');
  if (shape === 'tower') {
    // A white tower: its body and battlements.
    b.box(0.035, 0.06, 0.01, { at: [0, y, z], color, jitter: 0 }).box(0.05, 0.015, 0.01, { at: [0, y + 0.035, z], color, jitter: 0 });
  } else {
    // A silver ship: hull and mast.
    b.box(0.07, 0.018, 0.01, { at: [0, y - 0.02, z], color, jitter: 0 })
      .box(0.008, 0.06, 0.01, { at: [0, y + 0.015, z], color, jitter: 0 })
      .box(0.03, 0.03, 0.01, { at: [0.012, y + 0.015, z], color: shade(color, 0.85), jitter: 0 });
  }
}
