import type { Material } from 'three';
import { BANDITS } from './bandits';
import { BAILIFFS } from './bailiffs';
import { BOG } from './bog';
import { bow } from './bow';
import { DROWNED } from './drowned';
import type { Vec3 } from './kit';
import { PAL } from './palette';
import { type BoneName, type DressContext, type Proportions, Rig } from './rig';

// The bestiary's bodies. Each is a Rig (one draw call) dressed from simple
// primitives. Sizes are in metres; `s` scales bone thickness, not length. An
// enemy's body comes from its family as well as its behaviour: the undead are
// the skeletons here (and the brute's stitched flesh); the bandits
// (bandits.ts) and House Corvane's bailiffs (bailiffs.ts) wear the human body
// (human.ts). Every family is an entry in FAMILIES.

/** An enemy's behaviour: how it fights. */
export type EnemyKind = 'grunt' | 'archer' | 'brute' | 'warden';

/** What an enemy family is made of: the dead are skeletons, the living wear the human body, the bog's beasts are mud. */
export type EnemyBody = 'skeleton' | 'human' | 'mud';

/** The business end of a weapon, in its bone's space. Enemy strikes sweep this segment. */
export interface WeaponSpec {
  bone: BoneName;
  base: Vec3;
  tip: Vec3;
  radius: number;
}

export interface CharacterModel {
  rig: Rig;
  weapon: WeaponSpec;
}

/** One family's fighter with one behaviour: the body it fights in, and how that body's dressed. */
export interface Fighter {
  /** Its name in the model inspector: "Bandit thug". */
  readonly label: string;
  /** How many looks it comes in: grunts and thugs vary, the rest have one. */
  readonly looks: number;
  /** Its bone lengths: a skeleton's, or a build of the human body. */
  readonly proportions: Proportions;
  /** Dress it in look `variant` (any whole number: it wraps), and say what it strikes with. */
  dress(ctx: DressContext, variant: number): WeaponSpec;
  /** Its name over its health bar, if it goes by one: the bosses and the named. */
  readonly title?: string;
}

/** One of a family's named enemies (a rare, a boss): a fighter of its own, fighting with the behaviour `kind`. */
export interface NamedFighter extends Fighter {
  readonly kind: EnemyKind;
  readonly title: string;
}

/**
 * An enemy family: who an enemy is, whatever its behaviour. Its body decides
 * how it comes and goes and what flies when it's hit: the dead claw up out of
 * the ground (or come up out of the water) and fall to pieces, the living are
 * simply standing there and fall whole, the bog's beasts lie sunk in the mud
 * as mounds until they heave up. A family fights only with the behaviours it
 * dresses for: only the undead and the drowned have a Warden.
 */
export interface FamilyDef {
  readonly body: EnemyBody;
  readonly fights: Partial<Record<EnemyKind, Fighter>>;
  /** Its named ones, by name, placed one at a time (PostPlan.named): the rares and the bosses no camp fills with. */
  readonly named?: Readonly<Record<string, NamedFighter>>;
  /** Varies its per-face shading, with its look. */
  readonly seed: number;
}

const PI = Math.PI;
const DOWN: Vec3 = [PI, 0, 0]; // taper parts grow along +Y; this flips them down a limb

// ---------------------------------------------------------------- skeleton parts

/** A skeleton's bones: `s` scales their thickness, `eye` glows in the sockets; `bone` and `shade` stain them (the drowned's peat). */
export interface SkeletonLook {
  s: number;
  eye: number;
  bone?: number;
  shade?: number;
}

function skull(ctx: DressContext, l: SkeletonLook): void {
  const { s, eye } = l;
  const B = l.bone ?? PAL.bone;
  const S = l.shade ?? PAL.boneShade;
  const neckLen = ctx.p.neck - ctx.p.spine;
  ctx
    .on('head')
    .box(0.045 * s, neckLen + 0.05 * s, 0.045 * s, { at: [0, (0.05 * s - neckLen) / 2, -0.01 * s], color: S })
    .box(0.19 * s, 0.16 * s, 0.2 * s, { at: [0, 0.145 * s, 0], color: B })
    .taper(0.19 * s, 0.2 * s, 0.13 * s, 0.15 * s, 0.05 * s, { at: [0, 0.225 * s, 0], color: B })
    .box(0.2 * s, 0.03 * s, 0.04 * s, { at: [0, 0.168 * s, 0.09 * s], color: S })
    .box(0.16 * s, 0.07 * s, 0.05 * s, { at: [0, 0.088 * s, 0.08 * s], color: B })
    .box(0.056 * s, 0.046 * s, 0.03 * s, { at: [-0.046 * s, 0.13 * s, 0.093 * s], color: PAL.socket, jitter: 0 })
    .box(0.056 * s, 0.046 * s, 0.03 * s, { at: [0.046 * s, 0.13 * s, 0.093 * s], color: PAL.socket, jitter: 0 })
    .box(0.024 * s, 0.024 * s, 0.02 * s, { at: [-0.046 * s, 0.13 * s, 0.1 * s], color: eye, glow: 1, jitter: 0 })
    .box(0.024 * s, 0.024 * s, 0.02 * s, { at: [0.046 * s, 0.13 * s, 0.1 * s], color: eye, glow: 1, jitter: 0 })
    .box(0.026 * s, 0.03 * s, 0.02 * s, { at: [0, 0.09 * s, 0.106 * s], color: PAL.socket, jitter: 0 })
    .box(0.12 * s, 0.022 * s, 0.03 * s, { at: [0, 0.052 * s, 0.09 * s], color: B });
  ctx
    .on('jaw')
    .box(0.14 * s, 0.04 * s, 0.1 * s, { at: [0, 0.01 * s, 0.015 * s], color: B })
    .box(0.11 * s, 0.018 * s, 0.025 * s, { at: [0, 0.035 * s, 0.045 * s], color: B });
}

function ribcage(ctx: DressContext, l: SkeletonLook): void {
  const { s } = l;
  const B = l.bone ?? PAL.bone;
  const S = l.shade ?? PAL.boneShade;
  const L = ctx.p.spine;
  const b = ctx.on('spine');
  b.box(0.045 * s, L + 0.03 * s, 0.045 * s, { at: [0, L / 2 - 0.015 * s, -0.075 * s], color: S });
  const ribs: [number, number, number][] = [
    [L - 0.07 * s, 0.26, 0.17],
    [L - 0.13 * s, 0.28, 0.18],
    [L - 0.19 * s, 0.26, 0.17],
    [L - 0.25 * s, 0.21, 0.15],
  ];
  const t = 0.026 * s;
  for (const [y, w0, d0] of ribs) {
    const w = w0 * s;
    const d = d0 * s;
    b.box(t, t, d, { at: [-w / 2, y, 0], color: B })
      .box(t, t, d, { at: [w / 2, y, 0], color: B })
      .box(w / 2 - 0.03 * s, t, t, { at: [-(w / 4 + 0.015 * s), y - 0.012 * s, d / 2], color: B })
      .box(w / 2 - 0.03 * s, t, t, { at: [w / 4 + 0.015 * s, y - 0.012 * s, d / 2], color: B })
      .box(w, t, t, { at: [0, y, -d / 2], color: S });
  }
  b.box(0.035 * s, 0.2 * s, 0.025 * s, { at: [0, L - 0.16 * s, 0.09 * s], color: B })
    .box(ctx.p.shoulderW * 2, 0.03 * s, 0.035 * s, { at: [0, L - 0.01 * s, 0.03 * s], color: B })
    .box(0.1 * s, 0.12 * s, 0.02 * s, { at: [-0.09 * s, L - 0.09 * s, -0.1 * s], color: S })
    .box(0.1 * s, 0.12 * s, 0.02 * s, { at: [0.09 * s, L - 0.09 * s, -0.1 * s], color: S });
  ctx
    .on('hips')
    .taper(0.16 * s, 0.1 * s, 0.26 * s, 0.14 * s, 0.12 * s, { at: [0, -0.09 * s, 0], color: B })
    .box(0.07 * s, 0.05 * s, 0.03 * s, { at: [0, -0.02 * s, 0.075 * s], color: PAL.socket, jitter: 0 });
}

function skeletonLimbs(ctx: DressContext, l: SkeletonLook): void {
  const { s } = l;
  const B = l.bone ?? PAL.bone;
  const S = l.shade ?? PAL.boneShade;
  const { upperArm: UA, forearm: FA, thigh: TH, shin: SH } = ctx.p;
  for (const side of ['L', 'R'] as const) {
    ctx
      .on(`upperArm${side}`)
      .ball(0.04 * s, { color: B })
      .box(0.04 * s, UA - 0.05 * s, 0.04 * s, { at: [0, -UA / 2, 0], color: B })
      .ball(0.034 * s, { at: [0, -UA, 0], color: S });
    ctx
      .on(`forearm${side}`)
      .box(0.024 * s, FA - 0.03 * s, 0.024 * s, { at: [-0.012 * s, -FA / 2, 0], color: B })
      .box(0.024 * s, FA - 0.03 * s, 0.024 * s, { at: [0.012 * s, -FA / 2, 0], color: S });
    ctx
      .on(`hand${side}`)
      .box(0.05 * s, 0.055 * s, 0.028 * s, { at: [0, -0.035 * s, 0], color: B })
      .box(0.05 * s, 0.045 * s, 0.045 * s, { at: [0, -0.075 * s, 0.006 * s], color: S });
    ctx
      .on(`thigh${side}`)
      .ball(0.045 * s, { color: B })
      .box(0.048 * s, TH - 0.06 * s, 0.048 * s, { at: [0, -TH / 2, 0], color: B })
      .ball(0.042 * s, { at: [0, -TH, 0.01 * s], color: S });
    ctx
      .on(`shin${side}`)
      .box(0.042 * s, SH - 0.04 * s, 0.042 * s, { at: [0, -SH / 2, 0], color: B })
      .box(0.08 * s, 0.045 * s, 0.2 * s, { at: [0, -SH - 0.012 * s, 0.05 * s], color: S });
  }
}

export function skeleton(ctx: DressContext, l: SkeletonLook): void {
  skull(ctx, l);
  ribcage(ctx, l);
  skeletonLimbs(ctx, l);
}

/** Tattered cloth hanging from the hips, front and back. */
export function loincloth(ctx: DressContext, s: number, color: number, len: number): void {
  ctx
    .on('hips')
    .box(0.3 * s, 0.05 * s, 0.18 * s, { at: [0, -0.02 * s, 0], color: PAL.leather })
    .box(0.16 * s, len, 0.02 * s, { at: [0, -len / 2 - 0.02 * s, 0.09 * s], color })
    .box(0.1 * s, len * 0.7, 0.02 * s, { at: [0.03 * s, -len * 0.35 - 0.02 * s, -0.09 * s], color })
    .box(0.06 * s, len * 0.5, 0.02 * s, { at: [-0.07 * s, -len * 0.25 - 0.02 * s, -0.09 * s], color });
}

// ---------------------------------------------------------------- weapons (hand space, along -Y)

function rustySword(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .ball(0.025, { at: [0, 0.03, 0], color: PAL.iron })
    .box(0.03, 0.11, 0.03, { at: [0, -0.045, 0], color: PAL.leatherDark })
    .box(0.03, 0.03, 0.17, { at: [0, -0.11, 0], color: PAL.rust, mask: 1 })
    .taper(0.014, 0.058, 0.006, 0.012, 0.7, { at: [0, -0.125, 0], rot: DOWN, color: PAL.iron, mask: 1 })
    .box(0.016, 0.16, 0.05, { at: [0, -0.3, 0.002], color: PAL.rust, mask: 1 })
    .box(0.016, 0.1, 0.03, { at: [0, -0.62, 0.006], color: PAL.rust, mask: 1 });
  return { bone: 'handR', base: [0, -0.13, 0], tip: [0, -0.82, 0], radius: 0.035 };
}

function rustyAxe(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.035, 0.72, 0.035, { at: [0, -0.3, 0], color: PAL.wood })
    .box(0.04, 0.05, 0.04, { at: [0, -0.02, 0], color: PAL.leatherDark })
    // Head on the cutting side (-Z): the bit flares out to a thin edge.
    .box(0.03, 0.2, 0.08, { at: [0, -0.56, -0.05], color: PAL.rust, mask: 1 })
    .taper(0.024, 0.2, 0.01, 0.28, 0.12, { at: [0, -0.56, -0.09], rot: [-PI / 2, 0, 0], color: PAL.iron, mask: 1 })
    .box(0.05, 0.06, 0.05, { at: [0, -0.66, 0], color: PAL.ironDark, mask: 1 });
  return { bone: 'handR', base: [0, -0.3, 0], tip: [0, -0.68, -0.2], radius: 0.06 };
}

function maul(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .cyl(0.035, 0.035, 1.12, 6, { at: [0, -0.46, 0], color: PAL.wood })
    .box(0.05, 0.14, 0.05, { at: [0, -0.02, 0], color: PAL.leatherDark })
    .box(0.26, 0.26, 0.46, { at: [0, -1.02, 0], color: PAL.stone, mask: 1 })
    .box(0.28, 0.06, 0.48, { at: [0, -0.94, 0], color: PAL.ironDark, mask: 1 })
    .box(0.28, 0.06, 0.48, { at: [0, -1.1, 0], color: PAL.ironDark, mask: 1 })
    .box(0.2, 0.2, 0.06, { at: [0, -1.02, 0.25], color: PAL.stoneDark, mask: 1 });
  return { bone: 'handR', base: [0, -0.2, 0], tip: [0, -1.1, 0], radius: 0.16 };
}

function greatsword(ctx: DressContext): WeaponSpec {
  const b = ctx.on('handR');
  b.ball(0.05, { at: [0, 0.08, 0], color: PAL.gold })
    .box(0.045, 0.3, 0.045, { at: [0, -0.07, 0], color: PAL.leatherDark })
    .box(0.06, 0.06, 0.46, { at: [0, -0.24, 0], color: PAL.ironDark, mask: 1 })
    .box(0.07, 0.08, 0.08, { at: [0, -0.24, 0], color: PAL.gold, mask: 1 })
    .taper(0.028, 0.13, 0.012, 0.03, 1.42, { at: [0, -0.27, 0], rot: DOWN, color: PAL.steel, mask: 1 })
    .box(0.032, 1.1, 0.02, { at: [0, -0.86, 0], color: PAL.iron, mask: 1 });
  for (let i = 0; i < 5; i++) {
    const y = -0.42 - i * 0.2;
    b.box(0.036, 0.05, 0.022, { at: [0, y, 0], color: PAL.rune, glow: 1, mask: 1, jitter: 0 });
  }
  return { bone: 'handR', base: [0, -0.3, 0], tip: [0, -1.66, 0], radius: 0.06 };
}

// ---------------------------------------------------------------- the bestiary

export const PROPORTIONS: Record<EnemyKind, Proportions> = {
  grunt: { hipY: 0.92, hipW: 0.09, spine: 0.44, shoulderW: 0.19, neck: 0.48, upperArm: 0.28, forearm: 0.25, thigh: 0.43, shin: 0.43 },
  archer: { hipY: 0.9, hipW: 0.09, spine: 0.43, shoulderW: 0.18, neck: 0.47, upperArm: 0.27, forearm: 0.25, thigh: 0.42, shin: 0.42 },
  brute: {
    hipY: 1.02,
    hipW: 0.17,
    spine: 0.66,
    shoulderW: 0.4,
    neck: 0.62,
    upperArm: 0.42,
    forearm: 0.4,
    thigh: 0.48,
    shin: 0.5,
    head: 1.6,
    headZ: 0.16,
  },
  warden: {
    hipY: 1.36,
    hipW: 0.14,
    spine: 0.66,
    shoulderW: 0.31,
    neck: 0.72,
    upperArm: 0.42,
    forearm: 0.38,
    thigh: 0.64,
    shin: 0.62,
    head: 1.45,
  },
};

function dressGrunt(ctx: DressContext, variant: number): WeaponSpec {
  const look = { s: 1, eye: PAL.emberEye };
  skeleton(ctx, look);
  loincloth(ctx, 1, variant % 2 ? PAL.cloth : PAL.clothDark, 0.3);
  // Rusty kettle helm and a single pauldron: scavenged armour.
  if (variant % 3 !== 2) {
    ctx
      .on('head')
      .cyl(0.085, 0.12, 0.09, 8, { at: [0, 0.235, 0], color: PAL.rust })
      .cyl(0.17, 0.17, 0.018, 8, { at: [0, 0.19, 0], color: PAL.rust });
  }
  ctx
    .on('upperArmL')
    .taper(0.13, 0.14, 0.1, 0.12, 0.08, { at: [0.02, -0.03, 0], color: PAL.rust })
    .box(0.04, 0.14, 0.13, { at: [0.07, -0.08, 0], color: PAL.ironDark });
  return variant % 2 ? rustyAxe(ctx) : rustySword(ctx);
}

function dressArcher(ctx: DressContext): WeaponSpec {
  const s = 0.95;
  skeleton(ctx, { s, eye: PAL.greenEye });
  loincloth(ctx, s, PAL.hood, 0.28);
  // Hood and mantle: a green cowl makes archers readable across the room.
  ctx
    .on('head')
    .taper(0.24, 0.25, 0.14, 0.16, 0.2, { at: [0, 0.08, -0.03], color: PAL.hood })
    .box(0.24, 0.12, 0.05, { at: [0, 0.13, -0.12], color: PAL.hood })
    .cone(0.06, 0.12, 4, { at: [0, 0.3, -0.07], rot: [-0.5, 0, 0], color: PAL.hood });
  ctx
    .on('spine')
    .taper(0.34, 0.24, 0.3, 0.2, 0.12, { at: [0, ctx.p.spine - 0.08, 0], color: PAL.hood })
    // Quiver across the back, fletching poking out over the right shoulder.
    .cyl(0.05, 0.045, 0.42, 6, { at: [-0.06, ctx.p.spine - 0.2, -0.14], rot: [0, 0, -0.35], color: PAL.leather })
    .box(0.03, 0.1, 0.03, { at: [-0.14, ctx.p.spine + 0.04, -0.14], rot: [0, 0, -0.35], color: PAL.cloth })
    .box(0.03, 0.1, 0.03, { at: [-0.1, ctx.p.spine + 0.05, -0.15], rot: [0, 0, -0.3], color: PAL.boneShade });
  return bow(ctx, { tips: PAL.boneShade, string: PAL.boneShade });
}

function dressBrute(ctx: DressContext): WeaponSpec {
  const { upperArm: UA, forearm: FA, thigh: TH, shin: SH, spine: L } = ctx.p;
  const F = PAL.flesh;
  const FD = PAL.fleshDark;
  ctx
    .on('hips')
    .taper(0.36, 0.3, 0.46, 0.36, 0.24, { at: [0, -0.18, 0], color: FD })
    .box(0.52, 0.09, 0.42, { at: [0, 0.02, 0], color: PAL.leather })
    .box(0.09, 0.08, 0.03, { at: [0, 0.02, 0.215], color: PAL.gold })
    .box(0.28, 0.42, 0.03, { at: [0, -0.22, 0.2], color: PAL.clothDark })
    .box(0.34, 0.36, 0.03, { at: [0, -0.2, -0.2], color: PAL.clothDark });
  ctx
    .on('spine')
    .taper(0.46, 0.38, 0.6, 0.44, 0.36, { at: [0, 0, 0.03], color: F })
    .taper(0.6, 0.44, 0.84, 0.4, 0.32, { at: [0, 0.34, 0], color: F })
    .ball(0.22, { at: [0, L - 0.06, -0.15], color: FD }, 1)
    .box(0.32, 0.12, 0.06, { at: [0, L - 0.12, 0.2], color: FD })
    .box(0.02, 0.26, 0.02, { at: [0.12, 0.2, 0.26], rot: [0, 0, 0.5], color: PAL.stitch })
    .box(0.18, 0.02, 0.02, { at: [0.12, 0.2, 0.26], rot: [0, 0, 0.5], color: PAL.stitch })
    .bar([0.34, L - 0.02, 0.18], [-0.22, 0.02, 0.26], 0.04, 0.04, { color: PAL.ironDark })
    .bar([0.34, L - 0.02, -0.18], [-0.22, 0.02, -0.26], 0.04, 0.04, { color: PAL.ironDark });
  ctx
    .on('head')
    .taper(0.28, 0.28, 0.22, 0.24, 0.26, { at: [0, -0.02, 0], color: F })
    .box(0.3, 0.06, 0.09, { at: [0, 0.17, 0.1], color: FD })
    .box(0.05, 0.035, 0.02, { at: [-0.065, 0.13, 0.135], color: PAL.yellowEye, glow: 1, jitter: 0 })
    .box(0.05, 0.035, 0.02, { at: [0.065, 0.13, 0.135], color: PAL.yellowEye, glow: 1, jitter: 0 })
    .box(0.06, 0.07, 0.06, { at: [0, 0.08, 0.15], color: FD })
    .box(0.05, 0.1, 0.1, { at: [-0.16, 0.1, 0], color: FD })
    .box(0.05, 0.1, 0.1, { at: [0.16, 0.1, 0], color: FD });
  ctx
    .on('jaw')
    .box(0.32, 0.11, 0.22, { at: [0, -0.07, 0.0], color: F })
    .cone(0.028, 0.1, 5, { at: [-0.1, 0.0, 0.08], color: PAL.bone })
    .cone(0.028, 0.1, 5, { at: [0.1, 0.0, 0.08], color: PAL.bone });
  for (const side of ['L', 'R'] as const) {
    ctx
      .on(`upperArm${side}`)
      .taper(0.26, 0.26, 0.2, 0.2, UA, { rot: DOWN, color: F })
      .box(0.22, 0.05, 0.22, { at: [0, -UA * 0.6, 0], color: PAL.leather });
    ctx
      .on(`forearm${side}`)
      .taper(0.2, 0.2, 0.27, 0.25, FA, { rot: DOWN, color: F })
      .box(0.29, 0.14, 0.27, { at: [0, -FA * 0.7, 0], color: PAL.leatherDark });
    ctx.on(`hand${side}`).box(0.21, 0.18, 0.21, { at: [0, -0.08, 0], color: FD });
    ctx
      .on(`thigh${side}`)
      .taper(0.28, 0.28, 0.21, 0.21, TH, { rot: DOWN, color: FD })
      .box(0.24, 0.06, 0.24, { at: [0, -TH * 0.8, 0], color: PAL.leather });
    ctx
      .on(`shin${side}`)
      .taper(0.21, 0.21, 0.17, 0.17, SH, { rot: DOWN, color: F })
      .box(0.21, 0.1, 0.34, { at: [0, -SH + 0.03, 0.07], color: FD });
  }
  // Spiked iron pauldron on the maul arm.
  ctx
    .on('upperArmR')
    .taper(0.34, 0.34, 0.26, 0.3, 0.14, { at: [0, -0.06, 0], color: PAL.ironDark })
    .cone(0.04, 0.16, 4, { at: [-0.08, 0.12, 0], color: PAL.iron })
    .cone(0.04, 0.14, 4, { at: [-0.04, 0.1, 0.1], rot: [0.5, 0, 0], color: PAL.iron })
    .cone(0.04, 0.14, 4, { at: [-0.04, 0.1, -0.1], rot: [-0.5, 0, 0], color: PAL.iron });
  return maul(ctx);
}

function dressWarden(ctx: DressContext): WeaponSpec {
  const s = 1.45;
  const L = ctx.p.spine;
  const look = { s, eye: PAL.blueEye };
  skeleton(ctx, look);
  // Crown of the Warden.
  const crown = ctx.on('head');
  crown.cyl(0.155, 0.15, 0.06, 8, { at: [0, 0.31, 0], color: PAL.gold });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2;
    crown.cone(0.028, 0.1, 4, { at: [Math.sin(a) * 0.14, 0.38, Math.cos(a) * 0.14], color: PAL.gold });
  }
  crown.box(0.035, 0.035, 0.02, { at: [0, 0.31, 0.155], color: PAL.blueEye, glow: 1, jitter: 0 });
  // Breastplate over the upper ribs; the lower ribs stay bare.
  ctx
    .on('spine')
    .taper(0.44, 0.3, 0.56, 0.34, 0.3, { at: [0, L - 0.32, 0.02], color: PAL.ironDark })
    .box(0.58, 0.04, 0.36, { at: [0, L - 0.02, 0.02], color: PAL.gold })
    .box(0.06, 0.24, 0.02, { at: [0, L - 0.16, 0.2], color: PAL.gold })
    // Tattered cape.
    .box(0.62, 1.3, 0.03, { at: [0, L - 0.66, -0.24], rot: [0.08, 0, 0], color: PAL.cloth })
    .box(0.16, 0.22, 0.03, { at: [-0.2, L - 1.4, -0.3], rot: [0.08, 0, 0], color: PAL.cloth })
    .box(0.12, 0.14, 0.03, { at: [0.18, L - 1.36, -0.3], rot: [0.08, 0, 0], color: PAL.cloth });
  ctx
    .on('hips')
    .box(0.44, 0.08, 0.3, { at: [0, 0.0, 0], color: PAL.leatherDark })
    .box(0.26, 0.62, 0.03, { at: [0, -0.34, 0.16], color: PAL.cloth })
    .box(0.06, 0.62, 0.035, { at: [0, -0.34, 0.17], color: PAL.gold });
  for (const side of ['L', 'R'] as const) {
    const x = side === 'L' ? 1 : -1;
    ctx
      .on(`upperArm${side}`)
      .taper(0.28, 0.3, 0.2, 0.26, 0.2, { at: [0.03 * x, -0.12, 0], color: PAL.ironDark })
      .box(0.3, 0.04, 0.32, { at: [0.03 * x, -0.12, 0], color: PAL.gold })
      .cone(0.05, 0.2, 4, { at: [0.08 * x, 0.14, 0], rot: [0, 0, -0.4 * x], color: PAL.iron });
    ctx.on(`forearm${side}`).taper(0.12, 0.12, 0.15, 0.14, 0.26, { at: [0, -0.34, 0], color: PAL.ironDark });
    ctx.on(`shin${side}`).taper(0.12, 0.14, 0.14, 0.15, 0.36, { at: [0, -0.5, 0.02], color: PAL.ironDark });
  }
  return greatsword(ctx);
}

/** The undead: skeletons, and the brute's stitched flesh, raised by the Warden among them. */
const UNDEAD: FamilyDef = {
  body: 'skeleton',
  seed: 11,
  fights: {
    grunt: { label: 'Grunt', looks: 6, proportions: PROPORTIONS.grunt, dress: dressGrunt },
    archer: { label: 'Archer', looks: 1, proportions: PROPORTIONS.archer, dress: dressArcher },
    brute: { label: 'Brute', looks: 1, proportions: PROPORTIONS.brute, dress: dressBrute },
    warden: { label: 'Bone Warden', looks: 1, proportions: PROPORTIONS.warden, dress: dressWarden, title: 'The Bone Warden' },
  },
};

/**
 * Every enemy family, by name. A new family is a new entry here, with its
 * fighters dressed in a file of its own, and its junk in items.ts (JUNK);
 * camps, the inspector, combat and the loot take it from there.
 */
export const FAMILIES = {
  undead: UNDEAD,
  bandit: BANDITS,
  corvane: BAILIFFS,
  drowned: DROWNED,
  bog: BOG,
} satisfies Record<string, FamilyDef>;

/** Who an enemy is, whatever its behaviour: one of FAMILIES. */
export type Family = keyof typeof FAMILIES;

export interface BuildOptions {
  material?: Material;
  /** Who it is: the undead (the default, skeletons) or a family in the human body. */
  family?: Family;
  /** Which of its family's looks for its behaviour: varies helmets, cloth, faces and weapons. */
  variant?: number;
  /** One of its family's named (FamilyDef.named) rather than an ordinary fighter: it must fight as `kind`. */
  named?: string;
}

/** `family`'s fighter with the behaviour `kind`, or its named one `named`: there's none of some (only the undead and the drowned have a Warden). */
export function fighterOf(kind: EnemyKind, family: Family = 'undead', named?: string): Fighter {
  const def: FamilyDef = FAMILIES[family];
  if (named) {
    const one = def.named?.[named];
    if (!one) throw new Error(`No ${named} among the ${family} family`);
    if (one.kind !== kind) throw new Error(`${one.label} fights as a ${one.kind}, not a ${kind}`);
    return one;
  }
  const fighter = def.fights[kind];
  if (!fighter) throw new Error(`No ${kind} among the ${family} family`);
  return fighter;
}

/** The bone lengths of an enemy with this behaviour and family (or of its named one). */
export function proportionsOf(kind: EnemyKind, family: Family = 'undead', named?: string): Proportions {
  return fighterOf(kind, family, named).proportions;
}

export function buildCharacter(kind: EnemyKind, opts: BuildOptions = {}): CharacterModel {
  const variant = opts.variant ?? 0;
  const family = opts.family ?? 'undead';
  const fighter = fighterOf(kind, family, opts.named);
  let weapon: WeaponSpec | undefined;
  const rig = new Rig(fighter.proportions, (ctx) => (weapon = fighter.dress(ctx, variant)), opts.material, FAMILIES[family].seed + variant * 7);
  return { rig, weapon: weapon! };
}
