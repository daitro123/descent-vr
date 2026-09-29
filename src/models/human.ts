import type { Vec3 } from './kit';
import { PAL } from './palette';
import type { DressContext, Proportions } from './rig';

// The human body: one body on the skeletons' 14-bone rig, rigidly skinned, in
// one draw call with the shared material and grain, dressed per character
// (people.ts). It stands about 1.78 m (a skeleton grunt is about 1.74 m) and
// comes in four builds. The face looks along +Z: eyes with whites, brows, a
// nose, a mouth and ears, with the chin on the jaw bone. Hair, beards and
// clothes are parts laid over it. From the people prototype (in history at
// commit c987194).

const PI = Math.PI;

/** Human colours, alongside the game's palette (palette.ts). */
export const HUE = {
  skinFair: 0xd6a582,
  skinWarm: 0xc08a66,
  skinTan: 0xa06e4c,
  skinDark: 0x7a5038,
  lip: 0x8a4a3a,
  eye: 0x1a1210,
  eyeWhite: 0xe8e0d0,
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
  tabard: 0x2c4a86,
  banditRed: 0xb82c22,
  banditRedDark: 0x6a1a14,
  fur: 0x4a3a2c,
  furLight: 0x7a6a54,
  straw: 0xd4b060,
  strawDark: 0xa88838,
  mail: 0x80848c,
  bowString: 0xd8d0b8,
  hotIron: 0xff7a2a,
} as const;

export type BuildName = 'average' | 'stout' | 'broad' | 'big';

/** A build: bone lengths, and how thick the body is round them. */
export interface Build {
  readonly proportions: Proportions;
  /** Bone thickness multiplier (not length). */
  readonly thickness: number;
  /** Widens the waist and pushes the belly forward, in metres. */
  readonly belly: number;
}

const AVERAGE: Proportions = {
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

/**
 * Average (Hale, the thugs, the archer, the farmer), stout (the innkeeper:
 * shorter, with a belly), broad (the smith: broad shoulders, long arms) and big
 * (the bandit leader, about 1.97 m and heavily built, still far smaller than
 * the undead brute).
 */
export const BUILDS: Record<BuildName, Build> = {
  average: { proportions: AVERAGE, thickness: 1, belly: 0 },
  stout: {
    proportions: { ...AVERAGE, hipY: 0.9, hipW: 0.11, spine: 0.45, shoulderW: 0.21, neck: 0.49, thigh: 0.42, shin: 0.43 },
    thickness: 1,
    belly: 0.08,
  },
  broad: {
    proportions: { ...AVERAGE, hipY: 0.95, hipW: 0.11, spine: 0.48, shoulderW: 0.23, neck: 0.52, upperArm: 0.3, forearm: 0.27 },
    thickness: 1.1,
    belly: 0,
  },
  big: {
    proportions: {
      hipY: 1.07,
      hipW: 0.13,
      spine: 0.56,
      shoulderW: 0.27,
      neck: 0.61,
      upperArm: 0.34,
      forearm: 0.31,
      thigh: 0.51,
      shin: 0.51,
      head: 1.08,
    },
    thickness: 1.3,
    belly: 0,
  },
};

export type Hair = 'short' | 'cropped' | 'long' | 'bald' | 'tied' | 'none';
export type Beard = 'none' | 'stubble' | 'moustache' | 'full' | 'short';

/** One character's body: build, skin, hair and the clothes every body wears. */
export interface Look {
  build: BuildName;
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

const thick = (l: Look) => BUILDS[l.build].thickness;
const bellyOf = (l: Look) => BUILDS[l.build].belly;

/** Head, face and hair, on the head and jaw bones. */
export function head(ctx: DressContext, l: Look): void {
  const k = thick(l);
  const neck = ctx.p.neck - ctx.p.spine;
  const h = ctx.on('head');
  h.box(0.1 * k, neck + 0.06, 0.1 * k, { at: [0, -neck / 2 + 0.02, -0.01], color: l.skin });
  // Skull: a box, narrower at the chin.
  h.box(0.18, 0.15, 0.2, { at: [0, 0.155, 0], color: l.skin }).taper(0.14, 0.16, 0.18, 0.2, 0.08, { at: [0, 0.0, 0.005], color: l.skin });
  // Ears.
  h.box(0.03, 0.06, 0.04, { at: [-0.095, 0.13, -0.005], color: l.skin }).box(0.03, 0.06, 0.04, { at: [0.095, 0.13, -0.005], color: l.skin });
  // Eyes, brows, nose, mouth.
  const face = 0.1;
  const brow = l.hairStyle === 'bald' ? HUE.hairDark : l.hair;
  h.box(0.034, 0.026, 0.012, { at: [-0.043, 0.148, face], color: HUE.eyeWhite, jitter: 0 })
    .box(0.034, 0.026, 0.012, { at: [0.043, 0.148, face], color: HUE.eyeWhite, jitter: 0 })
    .box(0.018, 0.022, 0.014, { at: [-0.043, 0.147, face + 0.002], color: HUE.eye, jitter: 0 })
    .box(0.018, 0.022, 0.014, { at: [0.043, 0.147, face + 0.002], color: HUE.eye, jitter: 0 })
    .box(0.05, 0.016, 0.02, { at: [-0.045, 0.176, face], color: brow, jitter: 0 })
    .box(0.05, 0.016, 0.02, { at: [0.045, 0.176, face], color: brow, jitter: 0 })
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
      ctx
        .on('jaw')
        .box(0.14, 0.05, 0.1, { at: [0, -0.015, 0.035], color: c })
        .box(0.02, 0.06, 0.08, { at: [-0.075, 0.03, 0.02], color: c })
        .box(0.02, 0.06, 0.08, { at: [0.075, 0.03, 0.02], color: c });
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

/** Torso, hips, arms, legs and boots, in the look's shirt, trousers and boots. Garments go on top. */
export function body(ctx: DressContext, l: Look): void {
  const k = thick(l);
  const belly = bellyOf(l);
  const { spine: L, upperArm: UA, forearm: FA, thigh: TH, shin: SH, shoulderW: SW } = ctx.p;
  ctx
    .on('spine')
    .taper((0.3 + belly) * k, (0.2 + belly) * k, 0.4 * k, 0.24 * k, L * 0.7, { at: [0, -0.02, 0.005 + belly * 0.3], color: l.shirt })
    .taper(0.4 * k, 0.24 * k, (SW * 2 + 0.02) * k, 0.2 * k, L * 0.32, { at: [0, L * 0.68 - 0.02, 0], color: l.shirt });
  ctx.on('hips').taper(0.34 * k, 0.22 * k, (0.3 + belly) * k, (0.2 + belly) * k, 0.2, { at: [0, -0.14, 0.005], color: l.trousers });
  if (l.belt !== undefined) {
    ctx
      .on('hips')
      .box((0.32 + belly) * k, 0.06, (0.22 + belly) * k, { at: [0, 0.03, 0.005], color: l.belt })
      .box(0.06, 0.05, 0.02, { at: [0, 0.03, (0.11 + belly / 2) * k + 0.01], color: l.buckle ?? PAL.iron });
  }
  const sleeve = l.sleeve ?? l.shirt;
  const forearm = l.forearm === 'skin' ? l.skin : (l.forearm ?? sleeve);
  const hand = l.hands === undefined || l.hands === 'skin' ? l.skin : l.hands;
  for (const side of ['L', 'R'] as const) {
    ctx
      .on(`upperArm${side}`)
      .ball(0.068 * k, { color: sleeve })
      .taper(0.085 * k, 0.085 * k, 0.105 * k, 0.105 * k, UA, { at: [0, -UA, 0], color: sleeve });
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

/** `c` with each channel scaled by `k`. */
export function shade(c: number, k: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k));
  const b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
}

// ---------------------------------------------------------------- garments

/** Front and back panels from the shoulders to mid-thigh, split at the belt so the legs can move; an emblem on the chest. */
export function tabard(ctx: DressContext, l: Look, color: number, len: number, emblem?: number): void {
  const k = thick(l);
  const L = ctx.p.spine;
  const zf = (0.125 + bellyOf(l) * 0.6) * k;
  const zb = -0.125 * k;
  ctx
    .on('spine')
    .box(0.28 * k, L, 0.02, { at: [0, L / 2 - 0.02, zf], color })
    .box(0.28 * k, L, 0.02, { at: [0, L / 2 - 0.02, zb], color });
  if (emblem !== undefined) {
    ctx
      .on('spine')
      .box(0.1 * k, 0.12, 0.012, { at: [0, L * 0.62, zf + 0.012], color: emblem })
      .box(0.04 * k, 0.06, 0.012, { at: [0, L * 0.62 - 0.08, zf + 0.012], color: emblem })
      .box(0.1 * k, 0.12, 0.012, { at: [0, L * 0.62, zb - 0.012], color: emblem });
  }
  ctx
    .on('hips')
    .box(0.27 * k, len, 0.02, { at: [0, -len / 2 + 0.02, zf], color })
    .box(0.27 * k, len, 0.02, { at: [0, -len / 2 + 0.02, zb], color });
}

/** A mail shirt: an iron torso with a skirt below the belt and short sleeves. */
export function mail(ctx: DressContext, l: Look, skirt = 0.2): void {
  const k = thick(l);
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

export function pauldrons(ctx: DressContext, l: Look, color: number): void {
  const k = thick(l);
  for (const side of ['L', 'R'] as const) {
    const x = side === 'L' ? 1 : -1;
    ctx
      .on(`upperArm${side}`)
      .taper(0.17 * k, 0.17 * k, 0.12 * k, 0.14 * k, 0.1, { at: [0.015 * x, -0.07, 0], color })
      .box(0.03, 0.12 * k, 0.15 * k, { at: [0.075 * k * x, -0.08, 0], color: shade(color, 0.8) });
  }
}

/** An apron: a front panel from the chest (a bib) or from the belt, down to the knees. */
export function apron(ctx: DressContext, l: Look, color: number, bib: boolean, len: number): void {
  const k = thick(l);
  const L = ctx.p.spine;
  const zf = (0.12 + bellyOf(l) * 0.62) * k;
  if (bib) ctx.on('spine').box(0.24 * k, L * 0.75, 0.02, { at: [0, L * 0.4, zf], color });
  ctx.on('hips').box(0.3 * k, len, 0.02, { at: [0, -len / 2 + 0.04, zf + 0.005], color });
}

/** A kerchief over the nose and mouth, knotted at the back of the head (unless a hood hides the knot): the bandits' mark. */
export function kerchief(ctx: DressContext, color: number, knot = true): void {
  const h = ctx.on('head');
  h.taper(0.205, 0.25, 0.195, 0.24, 0.085, { at: [0, 0.045, 0.012], color }).taper(0.13, 0.02, 0.02, 0.02, 0.07, {
    at: [0, 0.05, 0.128],
    rot: [PI, 0, 0],
    color,
  });
  if (!knot) return;
  h.box(0.03, 0.03, 0.03, { at: [0, 0.1, -0.115], color: shade(color, 0.8) })
    .box(0.03, 0.1, 0.012, { at: [-0.015, 0.05, -0.12], rot: [0.2, 0, 0.15], color })
    .box(0.03, 0.08, 0.012, { at: [0.02, 0.055, -0.12], rot: [0.2, 0, -0.2], color });
}

/** A sash round the waist, its end hanging at the right hip, so the mark reads from behind too. A larger `girth` winds it over a coat. */
export function sash(ctx: DressContext, l: Look, color: number, girth = thick(l)): void {
  const k = girth;
  ctx
    .on('hips')
    .box(0.35 * k, 0.07, 0.25 * k, { at: [0, 0.07, 0.005], rot: [0, 0, 0.1], color })
    .box(0.06, 0.2, 0.02, { at: [0.12 * k, -0.06, 0.12 * k], rot: [0, 0, 0.15], color });
}

/** A deep hood with a point, and its cowl on the shoulders. The face is left open. */
export function hood(ctx: DressContext, l: Look, color: number): void {
  const k = thick(l);
  const L = ctx.p.spine;
  ctx
    .on('head')
    .box(0.23, 0.05, 0.25, { at: [0, 0.27, -0.01], color })
    .box(0.03, 0.26, 0.24, { at: [-0.115, 0.13, -0.01], color })
    .box(0.03, 0.26, 0.24, { at: [0.115, 0.13, -0.01], color })
    .box(0.23, 0.28, 0.04, { at: [0, 0.14, -0.125], color })
    .box(0.23, 0.04, 0.04, { at: [0, 0.26, 0.11], color: shade(color, 0.8) })
    .cone(0.06, 0.14, 4, { at: [0, 0.3, -0.12], rot: [-0.9, 0, 0], color });
  ctx.on('spine').taper(0.44 * k, 0.28 * k, 0.3 * k, 0.24 * k, 0.12, { at: [0, L - 0.07, -0.005], color });
}

/** A quiver across the back, its strap over the chest and its fletching over the right shoulder. */
export function quiver(ctx: DressContext, fletching: number): void {
  const L = ctx.p.spine;
  ctx
    .on('spine')
    .cyl(0.05, 0.045, 0.44, 6, { at: [-0.06, L - 0.2, -0.16], rot: [0, 0, -0.35], color: PAL.leather })
    .box(0.03, 0.1, 0.03, { at: [-0.14, L + 0.05, -0.16], rot: [0, 0, -0.35], color: HUE.linen })
    .box(0.03, 0.1, 0.03, { at: [-0.1, L + 0.06, -0.17], rot: [0, 0, -0.3], color: fletching })
    .bar([0.18, L, 0.12], [-0.16, 0.05, -0.13], 0.03, 0.02, { color: PAL.leatherDark });
}

/** Where the sheathed sword's pommel sits, in the hips' space. */
export function pommelOf(l: Look): Vec3 {
  return [0.19 * thick(l) - 0.01, 0.215, 0.215];
}

/**
 * A sheathed sword at the left hip, hilt forward and up; its guard, pommel
 * and the scabbard's chape in `guard`. Without its `hilt`, the scabbard hangs
 * empty.
 */
export function sheathedSword(ctx: DressContext, l: Look, guard: number, hilt = true): void {
  const x = 0.19 * thick(l);
  const tilt: Vec3 = [0.28, 0, 0.06];
  const b = ctx
    .on('hips')
    .box(0.045, 0.78, 0.065, { at: [x, -0.36, 0.05], rot: tilt, color: PAL.leatherDark })
    .box(0.05, 0.08, 0.07, { at: [x + 0.02, -0.73, -0.055], rot: tilt, color: guard });
  if (!hilt) return;
  b.box(0.035, 0.035, 0.18, { at: [x, 0.04, 0.165], rot: tilt, color: guard })
    .box(0.035, 0.15, 0.035, { at: [x - 0.005, 0.13, 0.19], rot: tilt, color: PAL.leather })
    .ball(0.03, { at: pommelOf(l), color: guard });
}

/** Cuffs over the wrists: gloves' gauntlets or bracers. */
export function cuffs(ctx: DressContext, l: Look, color: number, len = 0.1): void {
  const k = thick(l);
  for (const side of ['L', 'R'] as const) {
    ctx.on(`forearm${side}`).taper(0.08 * k, 0.08 * k, 0.09 * k, 0.09 * k, len, { at: [0, -ctx.p.forearm, 0], color });
  }
}

/** Rolled-up sleeves: a band at the elbow. */
export function rolledSleeves(ctx: DressContext, l: Look, color: number): void {
  const k = thick(l);
  for (const side of ['L', 'R'] as const) {
    ctx.on(`forearm${side}`).taper(0.095 * k, 0.095 * k, 0.1 * k, 0.1 * k, 0.06, { at: [0, -0.06, 0], color });
  }
}
