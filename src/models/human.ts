import { BufferGeometry, Float32BufferAttribute, type Vector3 } from 'three';
import type { Vec3, Weights } from './kit';
import { PAL } from './palette';
import type { DressContext, Proportions } from './rig';

// The human body: one body on the skeletons' humanoid rig, rigidly skinned,
// in one draw call with the shared material and grain, dressed per character
// (people.ts). Its soles hang from the feet (ankle) bones, so a walk can roll
// them. It stands about 1.78 m (a skeleton grunt is about 1.74 m) and
// comes in eight builds: four men's, a woman's, an elder's and an elder
// woman's (stooped), and a child's. The face looks along +Z: eyes with
// whites, brows, a nose, a mouth and ears, with the chin on the jaw bone.
// Hair, beards and clothes are parts laid over it; a skirt or a long robe is
// draped between the hips and the thighs, so it moves with the legs (kit.ts
// `drape`). From the people prototype (in history at commit c987194).

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

export type BuildName = 'average' | 'stout' | 'broad' | 'big' | 'woman' | 'elder' | 'elderWoman' | 'child';

/** The torso's shape, in metres before `thickness`. */
export interface Figure {
  /** Width across the chest, the waist and the hips. */
  readonly chest: number;
  readonly waist: number;
  readonly hips: number;
  /** How far the bust stands forward of the chest: 0 for a man or a child. */
  readonly bust: number;
}

/** How a build walks (people/walk.ts): its pace and step, and how it carries itself. */
export interface Gait {
  /** m/s, strolling a route. */
  readonly speed: number;
  /** m from one footfall to the next. */
  readonly step: number;
  /** m the swinging foot's sole clears the ground by, at most. */
  readonly lift: number;
  /** rad the arms swing fore and aft from the shoulder. */
  readonly arms: number;
  /** rad the chest leans forward into the walk. */
  readonly lean: number;
  /** How far each foot rolls from heel to toe, as a share of a grown stride's: less is flat-footed. */
  readonly roll: number;
}

/** A build: bone lengths, how thick the body is round them, its figure and its walk. */
export interface Build {
  readonly proportions: Proportions;
  /** Bone thickness multiplier (not length). */
  readonly thickness: number;
  /** Widens the waist and pushes the belly forward, in metres. */
  readonly belly: number;
  readonly figure: Figure;
  readonly gait: Gait;
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

/** A man's torso, and a woman's: narrower at the shoulders and the waist, wider at the hips. */
const MAN: Figure = { chest: 0.4, waist: 0.3, hips: 0.34, bust: 0 };
const WOMAN: Figure = { chest: 0.36, waist: 0.27, hips: 0.38, bust: 0.035 };

/** A grown man's stroll: about 1.65 steps a second. */
const STRIDE: Gait = { speed: 1.1, step: 0.66, lift: 0.04, arms: 0.28, lean: 0.04, roll: 1 };

/**
 * Average (Hale, the thugs, the archer, the farmer), stout (the innkeeper:
 * shorter, with a belly), broad (the smith: broad shoulders, long arms) and big
 * (the bandit leader, about 1.97 m and heavily built, still far smaller than
 * the undead brute). Then a woman (about 1.66 m, slighter, narrow-waisted), an
 * elder (an old man, about 1.70 m stooped, who shuffles), an elder woman
 * (about 1.58 m stooped) and a child (about 1.22 m, seven or eight years old,
 * their head a bigger share of them, quick short steps).
 */
export const BUILDS: Record<BuildName, Build> = {
  average: { proportions: AVERAGE, thickness: 1, belly: 0, figure: MAN, gait: STRIDE },
  stout: {
    proportions: { ...AVERAGE, hipY: 0.9, hipW: 0.11, spine: 0.45, shoulderW: 0.21, neck: 0.49, thigh: 0.42, shin: 0.43 },
    thickness: 1,
    belly: 0.08,
    figure: MAN,
    gait: { ...STRIDE, speed: 1, step: 0.58, lift: 0.05, arms: 0.22, lean: 0.02 },
  },
  broad: {
    proportions: { ...AVERAGE, hipY: 0.95, hipW: 0.11, spine: 0.48, shoulderW: 0.23, neck: 0.52, upperArm: 0.3, forearm: 0.27 },
    thickness: 1.1,
    belly: 0,
    figure: MAN,
    gait: { ...STRIDE, step: 0.68, arms: 0.3, lean: 0.05 },
  },
  woman: {
    proportions: {
      hipY: 0.89,
      hipW: 0.1,
      spine: 0.42,
      shoulderW: 0.175,
      neck: 0.45,
      upperArm: 0.27,
      forearm: 0.24,
      thigh: 0.42,
      shin: 0.42,
      headSize: 0.96,
    },
    thickness: 0.9,
    belly: 0,
    figure: WOMAN,
    gait: { ...STRIDE, speed: 1.05, step: 0.6, lift: 0.05, arms: 0.2, lean: 0.03 },
  },
  elder: {
    proportions: { ...AVERAGE, hipY: 0.92, spine: 0.44, shoulderW: 0.19, neck: 0.48, upperArm: 0.29, thigh: 0.435, shin: 0.435, stoop: 0.28, headZ: 0.03 },
    thickness: 0.92,
    belly: 0.02,
    figure: { ...MAN, chest: 0.38 },
    gait: { speed: 0.7, step: 0.4, lift: 0.03, arms: 0.1, lean: 0.04, roll: 0.45 },
  },
  elderWoman: {
    proportions: {
      hipY: 0.86,
      hipW: 0.1,
      spine: 0.4,
      shoulderW: 0.17,
      neck: 0.43,
      upperArm: 0.26,
      forearm: 0.23,
      thigh: 0.405,
      shin: 0.405,
      headSize: 0.95,
      stoop: 0.28,
      headZ: 0.03,
    },
    thickness: 0.88,
    belly: 0,
    figure: { ...WOMAN, waist: 0.3, bust: 0.025 },
    gait: { speed: 0.65, step: 0.36, lift: 0.03, arms: 0.08, lean: 0.04, roll: 0.4 },
  },
  child: {
    proportions: {
      hipY: 0.6,
      hipW: 0.075,
      spine: 0.3,
      shoulderW: 0.13,
      neck: 0.33,
      upperArm: 0.19,
      forearm: 0.17,
      thigh: 0.275,
      shin: 0.275,
      headSize: 0.86,
    },
    thickness: 0.72,
    belly: 0,
    figure: { chest: 0.4, waist: 0.37, hips: 0.37, bust: 0 },
    gait: { speed: 1.1, step: 0.44, lift: 0.04, arms: 0.32, lean: 0.03, roll: 0.8 },
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
    figure: MAN,
    gait: { ...STRIDE, speed: 1.15, step: 0.74, lift: 0.07, arms: 0.3, lean: 0.05 },
  },
};

export type Hair = 'short' | 'cropped' | 'long' | 'bald' | 'tied' | 'bun' | 'braids' | 'none';
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
const figureOf = (l: Look) => BUILDS[l.build].figure;

/** How far forward of the spine a panel over the chest hangs (a tabard, an apron's bib), clear of the belly and the bust. */
function chestFront(l: Look, front: number): number {
  const k = thick(l);
  const { bust } = figureOf(l);
  const z = (front + bellyOf(l) * 0.6) * k;
  return bust > 0 ? Math.max(z, 0.12 * k + bust + 0.012) : z;
}

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
    case 'bun':
      // Drawn back off the face and pinned up in a knot at the back of the head.
      h.box(0.195, 0.045, 0.215, { at: [0, 0.245, -0.005], color: c })
        .box(0.195, 0.14, 0.04, { at: [0, 0.18, -0.095], color: c })
        .box(0.03, 0.06, 0.12, { at: [-0.095, 0.205, -0.03], color: c })
        .box(0.03, 0.06, 0.12, { at: [0.095, 0.205, -0.03], color: c })
        .box(0.1, 0.09, 0.07, { at: [0, 0.215, -0.135], color: c });
      break;
    case 'braids':
      // Parted and plaited, a braid hanging forward over each shoulder.
      h.box(0.195, 0.045, 0.215, { at: [0, 0.245, -0.005], color: c })
        .box(0.195, 0.16, 0.04, { at: [0, 0.17, -0.095], color: c })
        .box(0.03, 0.12, 0.13, { at: [-0.095, 0.18, -0.03], color: c })
        .box(0.03, 0.12, 0.13, { at: [0.095, 0.18, -0.03], color: c })
        .box(0.045, 0.3, 0.045, { at: [-0.1, -0.03, -0.075], rot: [-0.25, 0, 0.12], color: c })
        .box(0.045, 0.3, 0.045, { at: [0.1, -0.03, -0.075], rot: [-0.25, 0, -0.12], color: c })
        .box(0.05, 0.04, 0.05, { at: [-0.093, -0.17, -0.04], color: shade(c, 0.8) })
        .box(0.05, 0.04, 0.05, { at: [0.093, -0.17, -0.04], color: shade(c, 0.8) });
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
  const { chest, waist, hips, bust } = figureOf(l);
  const { spine: L, upperArm: UA, forearm: FA, thigh: TH, shin: SH, shoulderW: SW } = ctx.p;
  ctx
    .on('spine')
    .taper((waist + belly) * k, (0.2 + belly) * k, chest * k, 0.24 * k, L * 0.7, { at: [0, -0.02, 0.005 + belly * 0.3], color: l.shirt })
    .taper(chest * k, 0.24 * k, (SW * 2 + 0.02) * k, 0.2 * k, L * 0.32, { at: [0, L * 0.68 - 0.02, 0], color: l.shirt });
  if (bust > 0) {
    // The bust: swelling out below the collarbones, and in again underneath.
    const z = 0.12 * k + bust / 2;
    ctx
      .on('spine')
      .taper(chest * 0.8 * k, 0.01, chest * 0.85 * k, bust + 0.01, 0.08, { at: [0, L * 0.47, z - bust / 2 + 0.005], color: l.shirt })
      .taper(chest * 0.85 * k, bust + 0.01, chest * 0.8 * k, 0.01, 0.07, { at: [0, L * 0.47 + 0.08, z - bust / 2 + 0.005], color: l.shirt });
  }
  ctx.on('hips').taper(hips * k, 0.22 * k, (waist + belly) * k, (0.2 + belly) * k, 0.2, { at: [0, -0.14, 0.005], color: l.trousers });
  if (l.belt !== undefined) {
    ctx
      .on('hips')
      .box((waist + 0.02 + belly) * k, 0.06, (0.22 + belly) * k, { at: [0, 0.03, 0.005], color: l.belt })
      .box(0.06, 0.05, 0.02, { at: [0, 0.03, (0.11 + belly / 2) * k + 0.01], color: l.buckle ?? PAL.iron });
  }
  // A child's boots come up their shin no higher than a grown-up's come up theirs.
  const shaft = 0.24 * Math.min(1, SH / 0.4);
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
      .box(0.12 * k, shaft, 0.13 * k, { at: [0, -SH + 0.01 + shaft / 2, 0], color: l.boots });
    // The foot, from the ankle: its sole 0.03 m below it, the heel 0.085 behind and the toe 0.165 ahead (people/walk.ts rolls on these).
    ctx.on(`foot${side}`).box(0.12 * k, 0.07, 0.25 * k, { at: [0, 0.005, 0.04 * k], color: l.boots });
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
  const zf = chestFront(l, 0.125);
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
  const zh = (0.125 + bellyOf(l) * 0.6) * k;
  ctx
    .on('hips')
    .box(0.27 * k, len, 0.02, { at: [0, -len / 2 + 0.02, zh], color })
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
  if (bib) ctx.on('spine').box(0.24 * k, L * 0.75, 0.02, { at: [0, L * 0.4, Math.max(zf, chestFront(l, 0.12))], color });
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

// ------------------------------------------------- skirts, robes and shawls

/** Sides round a skirt: enough for a round hem at arm's length, few enough to stay cheap. */
const SKIRT_SIDES = 12;

export interface SkirtOpts {
  /** m above the floor the hem hangs at: 0.08 sweeps the ankles, 0.3 shows the calves. Default 0.08. */
  hem?: number;
  /** m the hem stands out past the hips, all round. Default 0.08. */
  flare?: number;
  /** An apron over the front, in this colour, draped with the skirt. */
  apron?: number;
  /** A band of another colour round the hem (a dyed border, a muddy hem). */
  border?: number;
}

/**
 * A skirt from the waist to `hem` above the floor, draped between the hips
 * and the thighs (kit.ts `drape`): at the waist it follows the hips, toward
 * the hem more and more the thigh on its side, so a stride swings it with the
 * legs instead of cutting through it. Its lowest band is lined, so it reads
 * from below. Wear it with a woman's build, or any: the long robe is one.
 */
export function skirt(ctx: DressContext, l: Look, color: number, opts: SkirtOpts = {}): void {
  const k = thick(l);
  const belly = bellyOf(l);
  const { waist, hips } = figureOf(l);
  const { hipY, thigh: TH, shin: SH } = ctx.p;
  const hem = opts.hem ?? 0.08;
  const flare = opts.flare ?? 0.08;
  // Rings in the hips' space, waist to hem: y, half-width, half-depth, forward shift.
  const bottom = hem - hipY;
  const knee = -0.02 - TH;
  const rings: [number, number, number, number][] = [
    [0.07, ((waist + belly) / 2) * k + 0.012, (0.1 + belly / 2) * k + 0.012, 0.005 + belly * 0.3],
    [-0.12, (hips / 2) * k + 0.01, 0.115 * k + 0.014, 0.005 + belly * 0.2],
    [Math.max(knee, bottom + 0.05), (hips / 2) * k + flare * 0.55 + 0.02, 0.115 * k + flare * 0.6 + 0.03, 0.01],
    [bottom, (hips / 2) * k + flare + 0.02, 0.115 * k + flare + 0.035, 0.01],
  ];
  // Short skirts end above the knee ring.
  if (bottom > knee) rings.splice(2, 1);
  const index = { hips: ctx.index('hips'), left: ctx.index('thighL'), right: ctx.index('thighR') };
  const top = hipY + rings[0][0];
  const reach = hipY + bottom;
  const legs = Math.min(1, (top - reach) / (TH + SH * 0.6));
  const weigh = (at: Vector3): Weights => {
    // Down the skirt the legs take over; by the hem of a long one, most of it is theirs.
    const down = Math.max(0, Math.min(1, (top - at.y) / (top - reach)));
    const f = 0.7 * legs * Math.pow(down, 1.3);
    const left = Math.max(0, Math.min(1, 0.5 + at.x / (0.14 * k)));
    return [
      [index.hips, 1 - f],
      [index.left, f * left],
      [index.right, f * (1 - left)],
    ];
  };
  const b = ctx.on('hips');
  b.drape(tube(rings, 0, rings.length - 1), weigh, { color, jitter: 0.06 });
  // The lining of the last band, seen looking up under the hem.
  b.drape(tube(rings, rings.length - 2, rings.length - 1, true), weigh, { color: shade(color, 0.6), jitter: 0 });
  if (opts.border !== undefined) {
    const [y, w, d, z] = rings[rings.length - 1];
    const band: [number, number, number, number][] = [
      [y + 0.07, w * 0.97 + 0.003, d * 0.97 + 0.003, z],
      [y - 0.002, w + 0.004, d + 0.004, z],
    ];
    const lerp = rings[rings.length - 2];
    band[0][1] = lerp[1] + (w - lerp[1]) * (1 - 0.07 / (lerp[0] - y)) + 0.003;
    band[0][2] = lerp[2] + (d - lerp[2]) * (1 - 0.07 / (lerp[0] - y)) + 0.003;
    b.drape(tube(band, 0, 1), weigh, { color: opts.border, jitter: 0.06 });
  }
  if (opts.apron !== undefined) {
    // The apron: a panel over the front from the waist to above the hem, draped like the skirt.
    const apronRings = rings.map(([y, w, d, z]): [number, number, number, number] => [y, w + 0.008, d + 0.008, z]);
    const last = apronRings[apronRings.length - 1];
    const prev = apronRings[apronRings.length - 2];
    const t = 0.12 / (prev[0] - last[0]);
    apronRings[apronRings.length - 1] = [last[0] + 0.12, last[1] + (prev[1] - last[1]) * t, last[2] + (prev[2] - last[2]) * t, last[3]];
    // Its columns fall on the skirt's own, so the two stay parallel as they bend.
    b.drape(tube(apronRings, 0, apronRings.length - 1, false, (4 / SKIRT_SIDES) * Math.PI), weigh, { color: opts.apron, jitter: 0.05 });
  }
}

/**
 * A tube through `rings` (each y, half-width, half-depth, forward shift), from
 * ring `from` to ring `to`, open at both ends: facing out, or in (`inside`,
 * a lining). With `arc`, only the front, from -arc to arc round from straight
 * ahead (an apron).
 */
function tube(rings: readonly (readonly [number, number, number, number])[], from: number, to: number, inside = false, arc = Math.PI): BufferGeometry {
  const n = arc < Math.PI ? 4 : SKIRT_SIDES;
  const closed = arc >= Math.PI;
  const cols = closed ? n : n + 1;
  const at = (r: number, j: number): [number, number, number] => {
    const [y, w, d, z] = rings[r];
    const a = closed ? (j / n) * 2 * Math.PI : -arc + (j / n) * 2 * arc;
    const inset = inside ? 0.004 : 0;
    return [(w - inset) * Math.sin(a), y, (d - inset) * Math.cos(a) + z];
  };
  const pos: number[] = [];
  for (let r = from; r < to; r++) {
    for (let j = 0; j < (closed ? n : n); j++) {
      const a = at(r, j);
      const b = at(r, (j + 1) % cols === 0 && closed ? 0 : j + 1);
      const c = at(r + 1, j);
      const d = at(r + 1, (j + 1) % cols === 0 && closed ? 0 : j + 1);
      if (inside) pos.push(...a, ...d, ...c, ...a, ...b, ...d);
      else pos.push(...a, ...c, ...d, ...a, ...d, ...b);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export interface RobeOpts {
  /** m above the floor the hem hangs at. Default 0.07, over the feet: low enough to sweep them, high enough not to drag as the hips dip in the walk. */
  hem?: number;
  /** Bell sleeves, wide at the wrist (a priest's, a scholar's); or close ones. Default wide. */
  sleeves?: 'wide' | 'close';
  /** A cord or sash at the waist, in this colour. */
  cord?: number;
  /** A broad band down the front from the neck to the hem, in this colour (a stole, a scholar's facing). */
  stole?: number;
}

/**
 * A long robe from the shoulders to the feet over whatever the look wears: a
 * habit, a priest's robe, a scholar's gown. Its skirt is the skirt's drape,
 * so it walks; its sleeves hang from the shoulders, belled at the wrist.
 */
export function robe(ctx: DressContext, l: Look, color: number, opts: RobeOpts = {}): void {
  const k = thick(l);
  const belly = bellyOf(l);
  const { chest, waist, bust } = figureOf(l);
  const { spine: L, upperArm: UA, forearm: FA, shoulderW: SW } = ctx.p;
  // The bodice, a little proud of the body beneath.
  ctx
    .on('spine')
    .taper((waist + belly) * k + 0.025, (0.2 + belly) * k + 0.025, chest * k + 0.025, 0.24 * k + 0.025 + bust * 1.4, L * 0.7, {
      at: [0, -0.03, 0.005 + belly * 0.3],
      color,
    })
    .taper(chest * k + 0.025, 0.24 * k + 0.025 + bust * 1.4, (SW * 2 + 0.02) * k + 0.02, 0.2 * k + 0.02, L * 0.33, { at: [0, L * 0.67 - 0.03, 0], color });
  skirt(ctx, l, color, { hem: opts.hem ?? 0.07, flare: 0.1 });
  const wide = (opts.sleeves ?? 'wide') === 'wide';
  for (const side of ['L', 'R'] as const) {
    ctx
      .on(`upperArm${side}`)
      .ball(0.075 * k, { color })
      .taper(0.105 * k, 0.105 * k, 0.12 * k, 0.12 * k, UA, { at: [0, -UA, 0], color });
    if (wide) {
      ctx
        .on(`forearm${side}`)
        .taper(0.2 * k, 0.17 * k, 0.11 * k, 0.11 * k, FA * 0.9, { at: [0, -FA * 0.95, -0.015], color })
        .taper(0.2 * k, 0.17 * k, 0.2 * k, 0.17 * k, 0.012, { at: [0, -FA * 0.95 - 0.006, -0.015], color: shade(color, 0.55), jitter: 0 });
    } else ctx.on(`forearm${side}`).taper(0.08 * k, 0.08 * k, 0.095 * k, 0.095 * k, FA * 0.9, { at: [0, -FA * 0.9, 0], color });
  }
  if (opts.cord !== undefined) {
    ctx
      .on('hips')
      .box((waist + belly) * k + 0.04, 0.03, (0.2 + belly) * k + 0.04, { at: [0, 0.05, 0.005 + belly * 0.3], color: opts.cord })
      .box(0.025, 0.36, 0.025, { at: [0.07 * k, -0.13, (0.1 + belly / 2) * k + 0.035], rot: [0.1, 0, 0.05], color: opts.cord });
  }
  if (opts.stole !== undefined) {
    const front = chestFront(l, 0.125) + 0.02;
    ctx
      .on('spine')
      .box(0.05, L * 0.95, 0.015, { at: [-0.06 * k, L * 0.5, front - 0.01], rot: [0, 0, -0.12], color: opts.stole })
      .box(0.05, L * 0.95, 0.015, { at: [0.06 * k, L * 0.5, front - 0.01], rot: [0, 0, 0.12], color: opts.stole });
    ctx
      .on('hips')
      .box(0.06, 0.55, 0.015, { at: [-0.06 * k, -0.25, (0.115 + belly) * k + 0.045], rot: [-0.08, 0, 0], color: opts.stole })
      .box(0.06, 0.55, 0.015, { at: [0.06 * k, -0.25, (0.115 + belly) * k + 0.045], rot: [-0.08, 0, 0], color: opts.stole });
  }
}

/** A shawl round the shoulders, knotted at the breast, its point hanging down the back. */
export function shawl(ctx: DressContext, l: Look, color: number): void {
  const k = thick(l);
  const { bust } = figureOf(l);
  const L = ctx.p.spine;
  const SW = ctx.p.shoulderW;
  const w = (SW * 2 + 0.1) * k;
  ctx
    .on('spine')
    .taper(w, 0.3 * k + bust, (SW * 2 - 0.02) * k, 0.26 * k, 0.15, { at: [0, L - 0.11, 0.005], color, jitter: 0.08 })
    .taper(0.28 * k, 0.03, 0.02, 0.02, 0.32, { at: [0, L - 0.08, -0.13 * k], rot: [Math.PI, 0, 0], color, jitter: 0.08 })
    .box(0.06, 0.05, 0.04, { at: [0, L - 0.16, chestFront(l, 0.12) + 0.01], color: shade(color, 0.85) });
}

/** A linen coif or headscarf over the hair, framing the face, its cloth down the nape. */
export function coif(ctx: DressContext, color: number): void {
  ctx
    .on('head')
    .box(0.215, 0.05, 0.235, { at: [0, 0.255, -0.005], color })
    .box(0.025, 0.2, 0.22, { at: [-0.105, 0.15, -0.015], color })
    .box(0.025, 0.2, 0.22, { at: [0.105, 0.15, -0.015], color })
    .box(0.215, 0.27, 0.03, { at: [0, 0.12, -0.115], color })
    .box(0.2, 0.03, 0.03, { at: [0, 0.235, 0.1], color: shade(color, 0.9) });
}
