import { BUILDS, chestFront, HUE, type Look, shade } from './human';
import { PAL } from './palette';
import type { DressContext } from './rig';

// What the city's people hold at their work and carry about, each on the bone
// that holds it (human.ts's conventions): gripped in a fist, a shaft runs
// along the hand's Z, so it stands upright with the forearm held level (a
// broom, a rake) and points ahead with the arm hanging (a knife, a saw);
// what hangs from a fist (a bucket, a fish) hangs along its -Y. What lies on
// a forearm held level across the body (a basket, a bolt of cloth, a ledger)
// sits on its +Z, the forearm's top. A load (a sack on the shoulder, a crate
// in the arms) is dressed onto its carrier only while they hold it
// (people/cast.ts `Wardrobe`).

const PI = Math.PI;
const thick = (l: Look) => BUILDS[l.build].thickness;

/** Hessian, the sacks' and the bales' cloth. */
export const HESSIAN = 0xb09a6c;
/** Tallow, the candles'. */
const TALLOW = 0xe6dcb4;
/** A silvery fish. */
const FISH = 0x9aa6a8;
const BRASS = 0xc8a048;
const TIMBER = 0x7a5634;

// ---------------------------------------------------------------- in a fist

/** A long loaf, gripped round its middle. */
export function loaf(ctx: DressContext, hand: 'handL' | 'handR' = 'handR'): void {
  ctx
    .on(hand)
    .taper(0.09, 0.07, 0.1, 0.08, 0.24, { at: [0, -0.07, -0.08], rot: [PI / 2, 0, 0], color: 0xb47a3a })
    .box(0.06, 0.012, 0.18, { at: [0, -0.07 + 0.045, 0.04], color: 0xd8a860, jitter: 0 });
}

/** An apple in the fingers. */
export function apple(ctx: DressContext, color = 0xa83a2a, hand: 'handL' | 'handR' = 'handR'): void {
  ctx.on(hand).ball(0.042, { at: [0, -0.1, 0.03], color, jitter: 0.1 });
}

/** A fish held by the tail, hanging from the fist. */
export function fish(ctx: DressContext, hand: 'handL' | 'handR' = 'handL'): void {
  ctx
    .on(hand)
    .taper(0.025, 0.06, 0.035, 0.09, 0.28, { at: [0, -0.37, 0.02], color: FISH, jitter: 0.08 })
    .box(0.012, 0.07, 0.07, { at: [0, -0.07, 0.02], color: shade(FISH, 0.75), jitter: 0 })
    .box(0.03, 0.03, 0.02, { at: [0, -0.36, 0.06], color: 0x2a2a30, jitter: 0 });
}

/** A short knife, its blade out of the thumb's side of the fist. */
export function knife(ctx: DressContext, hand: 'handL' | 'handR' = 'handR'): void {
  ctx
    .on(hand)
    .box(0.022, 0.025, 0.1, { at: [0, -0.05, 0.0], color: PAL.woodDark })
    .box(0.008, 0.025, 0.12, { at: [0, -0.05, 0.11], color: PAL.steel, jitter: 0 });
}

/** A butcher's cleaver: a short handle, a broad blade. */
export function cleaver(ctx: DressContext): void {
  ctx
    .on('handR')
    .box(0.025, 0.028, 0.12, { at: [0, -0.05, 0.0], color: PAL.woodDark })
    .box(0.01, 0.1, 0.15, { at: [0, -0.08, 0.13], color: PAL.steel, jitter: 0 });
}

/** A bundle of tallow candles, tied at the middle. */
export function candles(ctx: DressContext): void {
  const h = ctx.on('handR');
  for (const [x, y] of [
    [-0.018, -0.04],
    [0.018, -0.04],
    [0, -0.07],
  ] as const) {
    h.cyl(0.016, 0.016, 0.28, 5, { at: [x, y, 0.06], rot: [PI / 2, 0, 0], color: TALLOW });
  }
  h.box(0.06, 0.06, 0.02, { at: [0, -0.05, -0.02], color: HESSIAN, jitter: 0 });
}

/** A brass curio held up: a ringed astrolabe on a chain. */
export function curio(ctx: DressContext): void {
  ctx
    .on('handR')
    .cyl(0.065, 0.065, 0.012, 10, { at: [0, -0.04, 0.12], rot: [PI / 2, 0, 0], color: BRASS, jitter: 0 })
    .cyl(0.035, 0.035, 0.016, 8, { at: [0, -0.04, 0.12], rot: [PI / 2, 0, 0], color: 0x3a5a7a, glow: 0.3, jitter: 0 })
    .box(0.006, 0.006, 0.08, { at: [0, -0.04, 0.04], color: BRASS, jitter: 0 });
}

/** A posy of flowers: stems in the fist, heads above. */
export function posy(ctx: DressContext, colors: readonly number[]): void {
  const h = ctx.on('handR');
  h.cyl(0.02, 0.012, 0.18, 5, { at: [0, -0.05, 0.05], rot: [PI / 2, 0, 0], color: 0x4a7a3a });
  colors.forEach((c, i) => {
    const a = (i / colors.length) * PI * 2;
    h.ball(0.03, { at: [Math.sin(a) * 0.03, -0.05 + Math.cos(a) * 0.03, 0.16], color: c, jitter: 0 });
  });
}

/** A leather belt hanging from the fist, its buckle at the end. */
export function strap(ctx: DressContext): void {
  ctx
    .on('handR')
    .box(0.04, 0.6, 0.008, { at: [0, -0.33, 0.03], color: PAL.leather })
    .box(0.05, 0.04, 0.012, { at: [0, -0.64, 0.03], color: BRASS, jitter: 0 });
}

/** A quill pen, its feather up out of the fist. */
export function quill(ctx: DressContext): void {
  ctx
    .on('handR')
    .box(0.008, 0.008, 0.14, { at: [0, -0.05, 0.05], color: 0x3a3030, jitter: 0 })
    .box(0.005, 0.03, 0.12, { at: [0, -0.04, 0.15], color: 0xe8e4d8, jitter: 0 });
}

/** A bunch of fishing net hanging from the left fist, and a netting needle in the right. */
export function netting(ctx: DressContext): void {
  ctx
    .on('handL')
    .taper(0.08, 0.04, 0.22, 0.06, 0.34, { at: [0, -0.42, 0.03], color: 0x6a5a3a, jitter: 0.15 })
    .box(0.03, 0.08, 0.03, { at: [0, -0.07, 0.03], color: 0x5a4a30 });
  ctx.on('handR').box(0.01, 0.01, 0.12, { at: [0, -0.05, 0.06], color: PAL.wood, jitter: 0 });
}

/** A shallow wooden bowl, held out. */
export function bowl(ctx: DressContext): void {
  ctx.on('handR').cyl(0.085, 0.05, 0.05, 8, { at: [0, -0.1, 0.04], rot: [0, 0, PI / 2], color: PAL.wood });
}

/** A coil of rope in the fist, its end trailing. */
export function ropeCoil(ctx: DressContext, hand: 'handL' | 'handR' = 'handL'): void {
  ctx
    .on(hand)
    .cyl(0.15, 0.15, 0.06, 10, { at: [0, -0.15, 0.03], rot: [0, 0, PI / 2], color: 0xb09a6a })
    .cyl(0.09, 0.09, 0.064, 8, { at: [0, -0.15, 0.03], rot: [0, 0, PI / 2], color: 0x7a6a48, jitter: 0 });
}

/** A fishing rod held out ahead, and a cork float down at its tip. */
export function rod(ctx: DressContext): void {
  ctx
    .on('handR')
    .cyl(0.01, 0.02, 2.4, 5, { at: [0, -0.04, 1.0], rot: [PI / 2, 0, 0], color: 0x8a6a3a })
    .box(0.004, 0.5, 0.004, { at: [0, -0.3, 2.18], color: 0xd8d0b8, jitter: 0 });
}

/** A broom: its shaft up through the fist, its besom of twigs below. */
export function broom(ctx: DressContext): void {
  ctx
    .on('handR')
    .cyl(0.016, 0.016, 1.35, 5, { at: [0, -0.03, -0.3], rot: [PI / 2, 0, 0], color: PAL.wood })
    .taper(0.07, 0.07, 0.2, 0.09, 0.32, { at: [0, -0.03, -0.92], rot: [-PI / 2, 0, 0], color: 0xa88a4a, jitter: 0.12 });
}

/** A garden rake: a long shaft, a cross-head of tines at its foot. */
export function rake(ctx: DressContext): void {
  const h = ctx.on('handR');
  h.cyl(0.016, 0.016, 1.55, 5, { at: [0, -0.03, -0.3], rot: [PI / 2, 0, 0], color: PAL.wood }).box(0.4, 0.04, 0.035, { at: [0, -0.03, -1.07], color: PAL.woodDark });
  for (const x of [-0.16, -0.08, 0, 0.08, 0.16]) h.box(0.012, 0.012, 0.08, { at: [x, -0.07, -1.1], rot: [0.9, 0, 0], color: PAL.iron, jitter: 0 });
}

/** A hoe: a long shaft, its iron blade at the foot, turned in. */
export function hoe(ctx: DressContext): void {
  ctx
    .on('handR')
    .cyl(0.016, 0.016, 1.5, 5, { at: [0, -0.03, -0.3], rot: [PI / 2, 0, 0], color: PAL.wood })
    .box(0.16, 0.13, 0.012, { at: [0, -0.09, -1.04], rot: [0.2, 0, 0], color: PAL.iron, jitter: 0 });
}

/** A hand saw: a wooden grip in the fist, its toothed blade out ahead. */
export function saw(ctx: DressContext): void {
  ctx
    .on('handR')
    .box(0.03, 0.09, 0.08, { at: [0, -0.05, 0.0], color: PAL.wood })
    .taper(0.006, 0.12, 0.006, 0.06, 0.55, { at: [0, -0.06, 0.04], rot: [PI / 2, 0, 0], color: PAL.steel, jitter: 0 });
}

/** A dyer's paddle: a long shaft up through the fist, its stained blade below. */
export function paddle(ctx: DressContext, stain: number): void {
  ctx
    .on('handR')
    .cyl(0.02, 0.02, 1.3, 5, { at: [0, -0.03, -0.25], rot: [PI / 2, 0, 0], color: shade(PAL.wood, 1.2) })
    .box(0.12, 0.025, 0.32, { at: [0, -0.03, -0.98], color: stain });
}

/** A tanner's scraping knife: a long curved blade held across both fists, by its right-hand grip. */
export function scraper(ctx: DressContext): void {
  ctx
    .on('handR')
    .box(0.03, 0.03, 0.1, { at: [0, -0.05, 0.0], color: PAL.woodDark })
    .bar([0, -0.07, 0.05], [0.4, -0.07, 0.08], 0.012, 0.05, { color: PAL.steel, jitter: 0 })
    .box(0.03, 0.03, 0.1, { at: [0.44, -0.05, 0.03], color: PAL.woodDark });
}

/** A stone mortar in the left fist, and a pestle in the right. */
export function mortar(ctx: DressContext): void {
  ctx
    .on('handL')
    .cyl(0.08, 0.06, 0.09, 8, { at: [0, -0.06, 0.08], color: 0xa8a49c })
    .cyl(0.06, 0.06, 0.01, 8, { at: [0, -0.015, 0.08], color: 0x5a7a3a, jitter: 0 });
  ctx.on('handR').cyl(0.018, 0.024, 0.2, 5, { at: [0, -0.06, 0.05], rot: [PI / 2, 0, 0], color: 0xc8c4bc });
}

/** A horse brush in the right fist. */
export function brush(ctx: DressContext): void {
  ctx
    .on('handR')
    .box(0.09, 0.04, 0.16, { at: [0, -0.07, 0.02], color: PAL.wood })
    .box(0.08, 0.04, 0.14, { at: [0, -0.1, 0.02], color: 0x3a2a1c, jitter: 0.1 });
}

/** A coachman's whip, its handle tucked in the belt at the left hip and its lash wound round it. */
export function whipAtBelt(ctx: DressContext, l: Look): void {
  const k = thick(l);
  ctx
    .on('hips')
    .bar([0.17 * k, 0.12, 0.08], [0.2 * k, -0.4, -0.05], 0.025, 0.025, { color: PAL.leatherDark })
    .cyl(0.05, 0.05, 0.12, 6, { at: [0.19 * k, -0.18, 0.02], color: PAL.leather });
}

/** A wooden bucket hanging from the fist by its handle. */
export function bucket(ctx: DressContext): void {
  ctx
    .on('handR')
    .cyl(0.12, 0.1, 0.24, 8, { at: [0, -0.3, 0.02], color: TIMBER })
    .cyl(0.123, 0.123, 0.03, 8, { at: [0, -0.22, 0.02], color: PAL.iron, jitter: 0 })
    .box(0.01, 0.12, 0.01, { at: [0, -0.12, 0.02], color: PAL.iron, jitter: 0 });
}

/** A walking staff up through the fist, longer than a stick. */
export function staff(ctx: DressContext, len = 1.6): void {
  ctx.on('handR').cyl(0.022, 0.022, len, 5, { at: [0, -0.02, 0.16 - len / 2 + 0.5], rot: [PI / 2, 0, 0], color: PAL.woodDark });
}

/** Tongs in the right fist, a bar hot from the forge across their jaws. */
export function hotTongs(ctx: DressContext): void {
  ctx
    .on('handR')
    .box(0.016, 0.016, 0.44, { at: [-0.013, -0.04, 0.2], color: PAL.ironDark })
    .box(0.016, 0.016, 0.44, { at: [0.013, -0.04, 0.2], color: PAL.ironDark })
    .box(0.03, 0.2, 0.03, { at: [0, -0.04, 0.43], color: HUE.hotIron, glow: 0.8, jitter: 0 });
}

/** A book held shut in the fingers, or open as the hands move apart. */
export function book(ctx: DressContext, cover: number): void {
  ctx
    .on('handL')
    .box(0.03, 0.2, 0.15, { at: [-0.02, -0.08, 0.06], color: cover })
    .box(0.034, 0.19, 0.14, { at: [-0.04, -0.08, 0.06], color: 0xe8e0c8, jitter: 0 });
}

// ---------------------------------------------------------------- on a forearm

/** A basket hung on the left forearm held level across the body, heaped with `goods` (fruit, flowers, a cloth). */
export function armBasket(ctx: DressContext, goods: readonly number[], wicker: number = HUE.strawDark): void {
  const f = ctx.on('forearmL');
  f.box(0.3, 0.16, 0.2, { at: [0.02, -0.26, 0.12], color: wicker, jitter: 0.12 })
    .box(0.02, 0.14, 0.02, { at: [-0.12, -0.12, 0.12], rot: [0, 0, -0.5], color: wicker })
    .box(0.02, 0.14, 0.02, { at: [0.16, -0.12, 0.12], rot: [0, 0, 0.5], color: wicker });
  goods.forEach((c, i) => f.ball(0.045, { at: [-0.08 + (i % 3) * 0.08, -0.17, 0.1 + Math.floor(i / 3) * 0.06 - 0.02], color: c, jitter: 0.1 }));
}

/** A bolt of cloth lying on the left forearm held level across the body. */
export function clothBolt(ctx: DressContext, color: number): void {
  ctx
    .on('forearmL')
    .cyl(0.07, 0.07, 0.55, 8, { at: [0.02, -0.2, 0.09], rot: [0, 0, PI / 2], color })
    .cyl(0.072, 0.072, 0.04, 8, { at: [0.02, -0.2, 0.09], rot: [0, 0, PI / 2], color: shade(color, 0.7), jitter: 0 });
}

/** A ledger lying open on the left forearm held level across the body, tipped up towards the face to read. */
export function ledger(ctx: DressContext, cover: number = PAL.leatherDark): void {
  const tip = -0.75;
  const c = Math.cos(tip);
  const s = Math.sin(tip);
  // The pages lie on the cover, both tipped about the forearm's wrist end.
  const on = (up: number): [number, number, number] => [0, -0.24 + 0.02 - up * s, 0.06 + up * c];
  ctx
    .on('forearmL')
    .box(0.32, 0.24, 0.025, { at: on(0), rot: [tip, 0, 0], color: cover })
    .box(0.3, 0.22, 0.012, { at: on(0.017), rot: [tip, 0, 0], color: 0xe8e0c8, jitter: 0 });
}

// ---------------------------------------------------------------- loads

/** A sack over the right shoulder, the right hand up on it at the front. */
export function shoulderSack(ctx: DressContext, l: Look, color: number = HESSIAN): void {
  const k = thick(l);
  const L = ctx.p.spine;
  ctx
    .on('spine')
    .taper(0.24, 0.42, 0.3, 0.5, 0.2, { at: [-0.16 * k, L + 0.02, -0.03], rot: [0, 0, 0.12], color, jitter: 0.08 })
    .box(0.05, 0.06, 0.06, { at: [-0.15 * k, L + 0.14, 0.26], color: shade(color, 0.8) });
}

/** A crate held before the chest in both arms, the hands under its sides. */
export function armsCrate(ctx: DressContext, l: Look): void {
  const k = thick(l);
  const L = ctx.p.spine;
  const z = chestFront(l, 0.12) + 0.2;
  ctx
    .on('spine')
    .box(0.42 * k, 0.3, 0.34, { at: [0, L * 0.3 - 0.07, z], color: TIMBER, jitter: 0.1 })
    .box(0.43 * k, 0.04, 0.35, { at: [0, L * 0.3 + 0.01, z], color: shade(TIMBER, 0.75), jitter: 0 });
}
