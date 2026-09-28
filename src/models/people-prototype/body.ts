import type { Vec3 } from '../kit';
import { PAL } from '../palette';
import type { DressContext, Proportions } from '../rig';

// PROTOTYPE (Friendly characters): one human body, built once and dressed per
// character. Everything here is throwaway; the pick is recorded on
// .scratch/oakvale-starting-zone/issues/11-friendly-characters.md.

const PI = Math.PI;

/** Human colours, alongside the game's palette (palette.ts). */
export const HUE = {
  skinFair: 0xd6a582,
  skinWarm: 0xc08a66,
  skinTan: 0xa06e4c,
  skinDark: 0x7a5038,
  lip: 0x8a4a3a,
  eye: 0x1a1210,
  hairDark: 0x3a281c,
  hairBrown: 0x6a4428,
  hairSandy: 0xa8844c,
  hairGrey: 0x8e8880,
  hairBlack: 0x1e1816,
  hairRed: 0x8a3a1c,
  linen: 0xcfc2a0,
  linenDark: 0x9c8e70,
  apronWhite: 0xd8d2c0,
  ochre: 0x9a7434,
  russet: 0x7a4a2a,
  moss: 0x5a6a3a,
  slate: 0x4a5462,
  tabard: 0x2c4a86,
  tabardDark: 0x1c3060,
  banditRed: 0xb82c22,
  banditRedDark: 0x6a1a14,
  fur: 0x4a3a2c,
  furLight: 0x7a6a54,
  straw: 0xd4b060,
  strawDark: 0xa88838,
  mail: 0x80848c,
} as const;

/** Average build. Height ≈ 1.78 m (a skeleton grunt is ≈ 1.74 m). */
export const HUMAN: Proportions = {
  hipY: 0.95,
  hipW: 0.1,
  spine: 0.46,
  shoulderW: 0.2,
  neck: 0.5,
  upperArm: 0.29,
  forearm: 0.26,
  thigh: 0.45,
  shin: 0.45,
};

/** A stocky innkeeper: shorter, wider. */
export const STOUT: Proportions = { ...HUMAN, hipY: 0.9, hipW: 0.11, spine: 0.45, shoulderW: 0.21, neck: 0.49, thigh: 0.42, shin: 0.43 };

/** The smith: broad shoulders, long arms. */
export const BROAD: Proportions = { ...HUMAN, hipY: 0.96, hipW: 0.11, spine: 0.48, shoulderW: 0.23, neck: 0.52, upperArm: 0.3, forearm: 0.27 };

/** The bandit leader: a big human, ≈ 1.97 m, much smaller than the undead brute. */
export const BIG: Proportions = {
  hipY: 1.03,
  hipW: 0.13,
  spine: 0.54,
  shoulderW: 0.27,
  neck: 0.58,
  upperArm: 0.34,
  forearm: 0.31,
  thigh: 0.49,
  shin: 0.5,
  head: 1.08,
};

export type Hair = 'short' | 'cropped' | 'long' | 'bald' | 'tied' | 'none';
export type Beard = 'none' | 'stubble' | 'moustache' | 'full' | 'short';

export interface Look {
  /** Bone thickness multiplier (not length). */
  s?: number;
  /** Belly: widens the waist. */
  belly?: number;
  skin: number;
  hair: number;
  hairStyle: Hair;
  beard?: Beard;
  shirt: number;
  /** Upper-arm sleeves; defaults to the shirt. */
  sleeve?: number;
  /** Forearms: bare skin, a sleeve or a bracer colour. */
  forearm?: number | 'skin';
  /** Hands: skin or a glove colour. */
  hands?: number | 'skin';
  trousers: number;
  boots: number;
  belt?: number;
  buckle?: number;
}

const s = (l: Look) => l.s ?? 1;

/** Head, face and hair, on the head and jaw bones. The face looks along +Z. */
export function head(ctx: DressContext, l: Look): void {
  const k = s(l);
  const neck = ctx.p.neck - ctx.p.spine;
  const h = ctx.on('head');
  h.box(0.1 * k, neck + 0.06, 0.1 * k, { at: [0, -neck / 2 + 0.02, -0.01], color: l.skin });
  // Skull: a box, narrower at the chin.
  h.box(0.18, 0.15, 0.2, { at: [0, 0.155, 0], color: l.skin })
    .taper(0.14, 0.16, 0.18, 0.2, 0.08, { at: [0, 0.0, 0.005], color: l.skin });
  // Ears.
  h.box(0.03, 0.06, 0.04, { at: [-0.095, 0.13, -0.005], color: l.skin }).box(0.03, 0.06, 0.04, { at: [0.095, 0.13, -0.005], color: l.skin });
  // Eyes, brows, nose, mouth.
  const face = 0.1;
  h.box(0.034, 0.026, 0.012, { at: [-0.043, 0.148, face], color: 0xe8e0d0, jitter: 0 })
    .box(0.034, 0.026, 0.012, { at: [0.043, 0.148, face], color: 0xe8e0d0, jitter: 0 })
    .box(0.018, 0.022, 0.014, { at: [-0.043, 0.147, face + 0.002], color: HUE.eye, jitter: 0 })
    .box(0.018, 0.022, 0.014, { at: [0.043, 0.147, face + 0.002], color: HUE.eye, jitter: 0 })
    .box(0.05, 0.016, 0.02, { at: [-0.045, 0.176, face], color: l.hairStyle === 'bald' ? HUE.hairDark : l.hair, jitter: 0 })
    .box(0.05, 0.016, 0.02, { at: [0.045, 0.176, face], color: l.hairStyle === 'bald' ? HUE.hairDark : l.hair, jitter: 0 })
    .taper(0.036, 0.05, 0.022, 0.02, 0.06, { at: [0, 0.09, face + 0.005], color: l.skin })
    .box(0.06, 0.012, 0.012, { at: [0, 0.062, face], color: HUE.lip, jitter: 0 });
  hair(ctx, l);
  beard(ctx, l);
  ctx.on('jaw').box(0.1, 0.035, 0.05, { at: [0, 0.0, 0.015], color: l.skin });
}

function hair(ctx: DressContext, l: Look): void {
  const h = ctx.on('head');
  const c = l.hair;
  switch (l.hairStyle) {
    case 'short':
      h.box(0.195, 0.05, 0.215, { at: [0, 0.245, -0.005], color: c })
        .box(0.195, 0.12, 0.05, { at: [0, 0.18, -0.09], color: c })
        .box(0.03, 0.07, 0.12, { at: [-0.095, 0.2, -0.03], color: c })
        .box(0.03, 0.07, 0.12, { at: [0.095, 0.2, -0.03], color: c })
        .box(0.17, 0.035, 0.03, { at: [0, 0.225, 0.095], color: c });
      break;
    case 'cropped':
      h.box(0.19, 0.03, 0.21, { at: [0, 0.238, -0.005], color: c })
        .box(0.19, 0.1, 0.03, { at: [0, 0.19, -0.098], color: c })
        .box(0.02, 0.05, 0.1, { at: [-0.093, 0.205, -0.04], color: c })
        .box(0.02, 0.05, 0.1, { at: [0.093, 0.205, -0.04], color: c });
      break;
    case 'long':
      h.box(0.2, 0.05, 0.22, { at: [0, 0.245, -0.005], color: c })
        .box(0.21, 0.26, 0.06, { at: [0, 0.12, -0.09], color: c })
        .box(0.03, 0.18, 0.14, { at: [-0.1, 0.16, -0.03], color: c })
        .box(0.03, 0.18, 0.14, { at: [0.1, 0.16, -0.03], color: c })
        .box(0.17, 0.035, 0.03, { at: [0, 0.225, 0.095], color: c });
      break;
    case 'tied':
      h.box(0.195, 0.045, 0.215, { at: [0, 0.245, -0.005], color: c })
        .box(0.195, 0.14, 0.04, { at: [0, 0.18, -0.095], color: c })
        .box(0.06, 0.12, 0.05, { at: [0, 0.14, -0.13], color: c });
      break;
    case 'bald':
      // A fringe round the back and sides.
      h.box(0.19, 0.05, 0.03, { at: [0, 0.16, -0.098], color: c })
        .box(0.02, 0.05, 0.1, { at: [-0.093, 0.165, -0.04], color: c })
        .box(0.02, 0.05, 0.1, { at: [0.093, 0.165, -0.04], color: c });
      break;
    case 'none':
      break;
  }
}

function beard(ctx: DressContext, l: Look): void {
  const c = l.hair;
  const h = ctx.on('head');
  switch (l.beard ?? 'none') {
    case 'moustache':
      h.box(0.08, 0.018, 0.02, { at: [0, 0.074, 0.108], color: c, jitter: 0 })
        .box(0.018, 0.04, 0.02, { at: [-0.04, 0.06, 0.106], color: c, jitter: 0 })
        .box(0.018, 0.04, 0.02, { at: [0.04, 0.06, 0.106], color: c, jitter: 0 });
      break;
    case 'short':
      h.box(0.08, 0.018, 0.02, { at: [0, 0.074, 0.108], color: c, jitter: 0 });
      ctx.on('jaw').box(0.14, 0.05, 0.1, { at: [0, -0.015, 0.035], color: c }).box(0.02, 0.06, 0.08, { at: [-0.075, 0.03, 0.02], color: c }).box(0.02, 0.06, 0.08, { at: [0.075, 0.03, 0.02], color: c });
      break;
    case 'full':
      h.box(0.09, 0.02, 0.02, { at: [0, 0.074, 0.108], color: c, jitter: 0 });
      ctx
        .on('jaw')
        .taper(0.1, 0.07, 0.16, 0.12, 0.1, { at: [0, -0.08, 0.03], color: c })
        .box(0.02, 0.08, 0.1, { at: [-0.08, 0.04, 0.01], color: c })
        .box(0.02, 0.08, 0.1, { at: [0.08, 0.04, 0.01], color: c });
      break;
    case 'stubble':
      ctx.on('jaw').box(0.125, 0.035, 0.085, { at: [0, -0.008, 0.032], color: shade(l.skin, 0.8) });
      break;
    case 'none':
      break;
  }
}

/** Torso, hips, arms, legs, boots. Garments go on top. */
export function body(ctx: DressContext, l: Look): void {
  const k = s(l);
  const { spine: L, upperArm: UA, forearm: FA, thigh: TH, shin: SH, shoulderW: SW } = ctx.p;
  const belly = l.belly ?? 0;
  ctx
    .on('spine')
    .taper((0.3 + belly) * k, (0.2 + belly) * k, 0.4 * k, 0.24 * k, L * 0.7, { at: [0, -0.02, 0.005 + belly * 0.3], color: l.shirt })
    .taper(0.4 * k, 0.24 * k, (SW * 2 + 0.02) * k, 0.2 * k, L * 0.32, { at: [0, L * 0.68 - 0.02, 0], color: l.shirt });
  ctx
    .on('hips')
    .taper(0.34 * k, 0.22 * k, (0.3 + belly) * k, (0.2 + belly) * k, 0.2, { at: [0, -0.14, 0.005], color: l.trousers });
  if (l.belt !== undefined) {
    ctx
      .on('hips')
      .box((0.32 + belly) * k, 0.06, (0.22 + belly) * k, { at: [0, 0.03, 0.005], color: l.belt })
      .box(0.06, 0.05, 0.02, { at: [0, 0.03, (0.11 + belly / 2) * k + 0.01], color: l.buckle ?? PAL.iron });
  }
  const forearm = l.forearm === 'skin' ? l.skin : (l.forearm ?? l.sleeve ?? l.shirt);
  const hand = l.hands === undefined || l.hands === 'skin' ? l.skin : l.hands;
  for (const side of ['L', 'R'] as const) {
    ctx
      .on(`upperArm${side}`)
      .ball(0.068 * k, { color: l.sleeve ?? l.shirt })
      .taper(0.085 * k, 0.085 * k, 0.105 * k, 0.105 * k, UA, { at: [0, -UA, 0], color: l.sleeve ?? l.shirt });
    ctx.on(`forearm${side}`).taper(0.066 * k, 0.066 * k, 0.085 * k, 0.085 * k, FA, { at: [0, -FA, 0], color: forearm });
    ctx
      .on(`hand${side}`)
      .box(0.07 * k, 0.09, 0.05 * k, { at: [0, -0.045, 0.005], color: hand })
      .box(0.025 * k, 0.05, 0.03 * k, { at: [side === 'L' ? -0.03 * k : 0.03 * k, -0.03, 0.03 * k], color: hand });
    ctx.on(`thigh${side}`).taper(0.115 * k, 0.125 * k, 0.145 * k, 0.16 * k, TH, { at: [0, -TH, 0], color: l.trousers });
    ctx
      .on(`shin${side}`)
      .taper(0.09 * k, 0.1 * k, 0.115 * k, 0.125 * k, SH, { at: [0, -SH, 0], color: l.trousers })
      .box(0.12 * k, 0.24, 0.13 * k, { at: [0, -SH + 0.13, 0], color: l.boots })
      .box(0.12 * k, 0.07, 0.25 * k, { at: [0, -SH + 0.005, 0.04 * k], color: l.boots });
  }
}

export function shade(c: number, k: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k));
  const b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
}

// ---------------------------------------------------------------- garments

/** Front and back panels from the shoulders to mid-thigh, split at the belt so legs can move. */
export function tabard(ctx: DressContext, l: Look, color: number, len = 0.4, emblem?: number): void {
  const k = s(l);
  const L = ctx.p.spine;
  const belly = l.belly ?? 0;
  const zf = (0.125 + belly * 0.6) * k;
  const zb = -0.125 * k;
  ctx
    .on('spine')
    .box(0.28 * k, L, 0.02, { at: [0, L / 2 - 0.02, zf], color })
    .box(0.28 * k, L, 0.02, { at: [0, L / 2 - 0.02, zb], color });
  if (emblem !== undefined) {
    ctx
      .on('spine')
      .box(0.1 * k, 0.12, 0.012, { at: [0, L * 0.62, zf + 0.012], color: emblem })
      .box(0.04 * k, 0.06, 0.012, { at: [0, L * 0.62 - 0.08, zf + 0.012], color: emblem });
  }
  ctx
    .on('hips')
    .box(0.27 * k, len, 0.02, { at: [0, -len / 2 + 0.02, zf], color })
    .box(0.27 * k, len, 0.02, { at: [0, -len / 2 + 0.02, zb], color });
}

/** Mail shirt: iron torso with a skirt below the belt and short sleeves. */
export function mail(ctx: DressContext, l: Look, skirt = 0.2): void {
  const k = s(l);
  const { spine: L, upperArm: UA } = ctx.p;
  ctx
    .on('spine')
    .taper(0.32 * k, 0.215 * k, 0.42 * k, 0.26 * k, L * 0.72, { at: [0, -0.02, 0.005], color: HUE.mail })
    .taper(0.42 * k, 0.26 * k, (ctx.p.shoulderW * 2 + 0.03) * k, 0.22 * k, L * 0.32, { at: [0, L * 0.7 - 0.02, 0], color: HUE.mail });
  ctx.on('hips').taper(0.38 * k, 0.25 * k, 0.33 * k, 0.23 * k, skirt, { at: [0, -skirt + 0.02, 0.005], color: HUE.mail });
  for (const side of ['L', 'R'] as const) {
    ctx.on(`upperArm${side}`).taper(0.1 * k, 0.1 * k, 0.115 * k, 0.115 * k, UA * 0.7, { at: [0, -UA * 0.7, 0], color: HUE.mail });
  }
}

export function pauldrons(ctx: DressContext, l: Look, color: number, size = 1): void {
  const k = s(l) * size;
  for (const side of ['L', 'R'] as const) {
    const x = side === 'L' ? 1 : -1;
    ctx
      .on(`upperArm${side}`)
      .taper(0.17 * k, 0.17 * k, 0.12 * k, 0.14 * k, 0.1, { at: [0.015 * x, -0.07, 0], color })
      .box(0.03, 0.12 * k, 0.15 * k, { at: [0.075 * k * x, -0.08, 0], color: shade(color, 0.8) });
  }
}

/** A cloak down the back, from the shoulders to the calves. */
export function cloak(ctx: DressContext, l: Look, color: number, len = 1.2): void {
  const k = s(l);
  const L = ctx.p.spine;
  ctx
    .on('spine')
    .box((ctx.p.shoulderW * 2 + 0.1) * k, len, 0.025, { at: [0, L - len / 2, -0.15 * k], rot: [0.06, 0, 0], color })
    .box((ctx.p.shoulderW * 2 + 0.12) * k, 0.06, 0.26 * k, { at: [0, L + 0.01, -0.02], color: shade(color, 0.85) });
}

/** Apron: a front panel from the chest (bib) or the belt down to the knees. */
export function apron(ctx: DressContext, l: Look, color: number, bib: boolean, len = 0.55): void {
  const k = s(l);
  const L = ctx.p.spine;
  const belly = l.belly ?? 0;
  const zf = (0.12 + belly * 0.62) * k;
  if (bib) ctx.on('spine').box(0.24 * k, L * 0.75, 0.02, { at: [0, L * 0.4, zf], color });
  ctx.on('hips').box(0.3 * k, len, 0.02, { at: [0, -len / 2 + 0.04, zf + 0.005], color });
}

/** The bandits' mark: a kerchief over the nose and mouth, knotted at the back. */
export function kerchief(ctx: DressContext, color: number): void {
  ctx
    .on('head')
    .taper(0.205, 0.25, 0.195, 0.24, 0.085, { at: [0, 0.045, 0.012], color })
    .taper(0.13, 0.02, 0.02, 0.02, 0.07, { at: [0, 0.05, 0.128], rot: [PI, 0, 0], color })
    .box(0.03, 0.03, 0.03, { at: [0, 0.1, -0.115], color: shade(color, 0.8) })
    .box(0.03, 0.1, 0.012, { at: [-0.015, 0.05, -0.12], rot: [0.2, 0, 0.15], color })
    .box(0.03, 0.08, 0.012, { at: [0.02, 0.055, -0.12], rot: [0.2, 0, -0.2], color });
}

/** A bandana tied over the head, tails behind. */
export function headwrap(ctx: DressContext, color: number): void {
  ctx
    .on('head')
    .box(0.205, 0.07, 0.225, { at: [0, 0.245, -0.005], color })
    .box(0.205, 0.08, 0.04, { at: [0, 0.2, -0.1], color })
    .box(0.03, 0.12, 0.012, { at: [-0.02, 0.14, -0.125], rot: [0.3, 0, 0.2], color })
    .box(0.03, 0.1, 0.012, { at: [0.02, 0.15, -0.125], rot: [0.3, 0, -0.2], color });
}

/** Deep hood, cowl on the shoulders. Face left open. */
export function hood(ctx: DressContext, l: Look, color: number, point = true): void {
  const k = s(l);
  const L = ctx.p.spine;
  ctx
    .on('head')
    .box(0.23, 0.05, 0.25, { at: [0, 0.27, -0.01], color })
    .box(0.03, 0.26, 0.24, { at: [-0.115, 0.13, -0.01], color })
    .box(0.03, 0.26, 0.24, { at: [0.115, 0.13, -0.01], color })
    .box(0.23, 0.28, 0.04, { at: [0, 0.14, -0.125], color })
    .box(0.23, 0.04, 0.04, { at: [0, 0.26, 0.11], color: shade(color, 0.8) });
  if (point) ctx.on('head').cone(0.06, 0.14, 4, { at: [0, 0.3, -0.12], rot: [-0.9, 0, 0], color });
  ctx.on('spine').taper(0.44 * k, 0.28 * k, 0.3 * k, 0.24 * k, 0.12, { at: [0, L - 0.07, -0.005], color });
}

export function quiver(ctx: DressContext): void {
  const L = ctx.p.spine;
  ctx
    .on('spine')
    .cyl(0.05, 0.045, 0.44, 6, { at: [-0.06, L - 0.2, -0.16], rot: [0, 0, -0.35], color: PAL.leather })
    .box(0.03, 0.1, 0.03, { at: [-0.14, L + 0.05, -0.16], rot: [0, 0, -0.35], color: 0xe0e0d0 })
    .box(0.03, 0.1, 0.03, { at: [-0.1, L + 0.06, -0.17], rot: [0, 0, -0.3], color: HUE.banditRed })
    .bar([0.18, L, 0.12], [-0.16, 0.05, -0.13], 0.03, 0.02, { color: PAL.leatherDark });
}

/** A sheathed sword at the left hip; its guard gilded (Hale's old longsword). */
export function sheathedSword(ctx: DressContext, l: Look, guard: number): void {
  const k = s(l);
  const x = 0.19 * k;
  const tilt: Vec3 = [0.28, 0, 0.06];
  ctx
    .on('hips')
    // Scabbard: hilt forward and up, tip back and down.
    .box(0.045, 0.78, 0.065, { at: [x, -0.36, 0.05], rot: tilt, color: PAL.leatherDark })
    .box(0.05, 0.08, 0.07, { at: [x + 0.02, -0.73, -0.055], rot: tilt, color: guard })
    .box(0.035, 0.035, 0.18, { at: [x, 0.04, 0.165], rot: tilt, color: guard })
    .box(0.035, 0.15, 0.035, { at: [x - 0.005, 0.13, 0.19], rot: tilt, color: PAL.leather })
    .ball(0.03, { at: [x - 0.01, 0.215, 0.215], color: guard });
}

export function gloves(ctx: DressContext, l: Look, color: number, cuff = true): void {
  const k = s(l);
  for (const side of ['L', 'R'] as const) {
    if (cuff) ctx.on(`forearm${side}`).taper(0.08 * k, 0.08 * k, 0.09 * k, 0.09 * k, 0.1, { at: [0, -ctx.p.forearm, 0], color });
  }
}

/** Rolled-up sleeves: a band at the elbow. */
export function rolledSleeves(ctx: DressContext, l: Look, color: number): void {
  const k = s(l);
  for (const side of ['L', 'R'] as const) {
    ctx.on(`forearm${side}`).taper(0.095 * k, 0.095 * k, 0.1 * k, 0.1 * k, 0.06, { at: [0, -0.06, 0], color });
  }
}

export const DOWN: Vec3 = [PI, 0, 0];
