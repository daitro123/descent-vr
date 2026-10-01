import { bow } from './bow';
import type { FamilyDef, WeaponSpec } from './characters';
import { BUILDS, body, HUE, head, hood, kerchief, type Look, quiver, sash, shade } from './human';
import type { Vec3 } from './kit';
import { PAL } from './palette';
import type { DressContext } from './rig';

// The Red Kerchiefs on Brackenmoor: the same gang as Oakvale's bandits
// (bandits.ts), dressed for the fells. They were the moor's shepherds before
// the enclosure took their grazing, so they wear what shepherds wear:
// sheepskin and undyed wool, a plaid, a flat bonnet, leg wraps, and a
// billhook or a long knife. The gang's red is the same: a kerchief over the
// face and a sash at the waist, and the archer the green hood of every
// archer. Their leader is Red Annis, a shepherd's wife, with a crook-bladed
// polearm. The diggers they hire out are diggers.ts.

const PI = Math.PI;
const DOWN: Vec3 = [PI, 0, 0]; // taper parts grow along +Y; this flips them down a limb

/** Moor colours: sheepskin worn fleece out, its hide side, and wool as it comes off the sheep. */
export const MOOR = {
  fleece: 0xcbbf9f,
  fleeceGrey: 0x9e937c,
  hide: 0x7e5e40,
  wool: 0x7a6e5c,
  woolDark: 0x544a3e,
  oatmeal: 0xa69a80,
  /** Ash, pale and straight: crooks and staves. */
  ash: 0x8f7048,
} as const;

const thick = (l: Look) => BUILDS[l.build].thickness;
const bellyOf = (l: Look) => BUILDS[l.build].belly;

// ---------------------------------------------------------------- garments

/** A sleeveless sheepskin jerkin worn fleece out, to the waist; `open` down the front over the shirt, edged with its hide, with a shaggy collar. */
export function fleeceVest(ctx: DressContext, l: Look, fleece: number, open = true): void {
  const k = thick(l);
  const b = bellyOf(l);
  const L = ctx.p.spine;
  const s = ctx.on('spine');
  s.taper((0.345 + b) * k, (0.25 + b) * k, 0.45 * k, 0.285 * k, L * 0.7, { at: [0, -0.03, 0.005 + b * 0.3], color: fleece, jitter: 0.2 })
    .taper(0.45 * k, 0.285 * k, (ctx.p.shoulderW * 2 + 0.05) * k, 0.235 * k, L * 0.32, { at: [0, L * 0.68 - 0.03, 0], color: fleece, jitter: 0.2 });
  if (!open) return;
  // The opening, the shirt showing down the middle between edges of hide.
  s.box(0.07 * k, L * 0.66, 0.016, { at: [0, L * 0.36, (0.138 + b * 0.45) * k], color: MOOR.hide, jitter: 0 })
    .box(0.04 * k, L * 0.66, 0.02, { at: [0, L * 0.36, (0.14 + b * 0.45) * k], color: l.shirt, jitter: 0 })
    // A shaggy collar.
    .taper(0.26 * k, 0.24 * k, 0.2 * k, 0.19 * k, 0.07, { at: [0, L - 0.01, -0.01], color: fleece, jitter: 0.25 });
}

/** A sheepskin mantle over the shoulders: sloping with them, a shaggy collar round the neck, and down the back to the shoulder blades. */
export function fleeceMantle(ctx: DressContext, l: Look, fleece: number): void {
  const k = thick(l);
  const L = ctx.p.spine;
  ctx
    .on('spine')
    .taper((ctx.p.shoulderW * 2 + 0.08) * k, 0.3 * k, 0.3 * k, 0.25 * k, 0.15, { at: [0, L - 0.11, -0.005], color: fleece, jitter: 0.22 })
    .box(0.38 * k, 0.26, 0.05, { at: [0, L - 0.22, -0.13 * k], rot: [0.08, 0, 0], color: fleece, jitter: 0.22 })
    .taper(0.25 * k, 0.23 * k, 0.21 * k, 0.19 * k, 0.07, { at: [0, L + 0.03, -0.01], color: shade(fleece, 1.08), jitter: 0.25 });
}

/** A wool plaid over the left shoulder, across the chest and back to the right hip, its end hanging behind. */
export function plaid(ctx: DressContext, l: Look, color: number): void {
  const k = thick(l);
  const b = bellyOf(l);
  const L = ctx.p.spine;
  const zf = (0.135 + b * 0.5) * k;
  const s = ctx.on('spine');
  s.bar([0.15 * k, L + 0.02, 0.07 * k], [-0.13 * k, 0.0, zf + 0.01], 0.15, 0.035, { color, jitter: 0.1 })
    .bar([0.15 * k, L + 0.02, -0.07 * k], [-0.13 * k, 0.0, -0.13 * k], 0.15, 0.035, { color, jitter: 0.1 })
    .box(0.15 * k, 0.05, 0.27 * k, { at: [0.15 * k, L + 0.0, 0], rot: [0, 0, -0.3], color, jitter: 0.1 })
    // A darker stripe woven along it, and its fringed end hanging down the back.
    .bar([0.17 * k, L + 0.03, 0.08 * k], [-0.11 * k, 0.02, zf + 0.03], 0.025, 0.02, { color: shade(color, 0.7), jitter: 0 })
    .box(0.13 * k, 0.42, 0.025, { at: [0.11 * k, L - 0.22, -0.155 * k], rot: [0.05, 0, 0.12], color, jitter: 0.1 });
}

/** A flat wool bonnet, wider than the head, pulled down to one side. */
export function bonnet(ctx: DressContext, color: number): void {
  ctx.on('head').cyl(0.15, 0.115, 0.06, 7, { at: [0.01, 0.272, -0.01], rot: [-0.1, 0, 0.14], color, jitter: 0.08 });
}

/** Wool wrapped round the shins over the trousers, from the boot to below the knee, cross-tied. */
export function legWraps(ctx: DressContext, l: Look, color: number): void {
  const k = thick(l);
  const SH = ctx.p.shin;
  for (const side of ['L', 'R'] as const) {
    const s = ctx.on(`shin${side}`);
    s.taper(0.108 * k, 0.118 * k, 0.12 * k, 0.13 * k, SH * 0.48, { at: [0, -SH + 0.23, 0], color, jitter: 0.1 });
  }
}

/** A kerchief pulled down off the face, knotted round the neck, its point on the chest. */
export function neckerchief(ctx: DressContext, l: Look, color: number): void {
  const k = thick(l);
  const { bust } = BUILDS[l.build].figure;
  const L = ctx.p.spine;
  ctx
    .on('spine')
    .taper(0.2 * k, 0.19 * k, 0.17 * k, 0.16 * k, 0.07, { at: [0, L + 0.0, 0.0], color })
    .taper(0.15 * k, 0.025, 0.02, 0.02, 0.13, { at: [0, L + 0.03, 0.105 * k + bust * 0.6], rot: [PI - 0.15 - bust * 3, 0, 0], color });
}

// ---------------------------------------------------------------- weapons (in the hand, along -Y, edge to -Z)

/** A hedger's billhook: a short ash haft and a broad blade whose tip hooks forward over the edge. */
function billhook(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.034, 0.16, 0.034, { at: [0, -0.04, 0], color: MOOR.ash })
    .box(0.04, 0.03, 0.04, { at: [0, -0.13, 0], color: PAL.ironDark, mask: 1 })
    .box(0.012, 0.3, 0.07, { at: [0, -0.29, -0.025], color: PAL.iron, mask: 1 })
    .box(0.01, 0.28, 0.012, { at: [0, -0.29, -0.062], color: PAL.steel, mask: 1, jitter: 0 })
    .bar([0, -0.44, -0.06], [0, -0.43, -0.13], 0.012, 0.045, { color: PAL.iron, mask: 1 })
    .box(0.012, 0.03, 0.06, { at: [0, -0.445, 0.0], color: PAL.iron, mask: 1 });
  return { bone: 'handR', base: [0, -0.14, 0], tip: [0, -0.46, -0.1], radius: 0.05 };
}

/** A shepherd's long knife: a single-edged blade as long as the forearm, a horn grip. */
function longKnife(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.032, 0.12, 0.032, { at: [0, -0.04, 0], color: 0x5a4a38 })
    .box(0.03, 0.02, 0.07, { at: [0, -0.11, -0.005], color: PAL.ironDark, mask: 1 })
    .taper(0.012, 0.05, 0.008, 0.03, 0.46, { at: [0, -0.12, -0.008], rot: DOWN, color: PAL.steel, mask: 1 })
    .box(0.014, 0.4, 0.014, { at: [0, -0.33, 0.012], color: PAL.iron, mask: 1, jitter: 0 });
  return { bone: 'handR', base: [0, -0.13, 0], tip: [0, -0.6, 0], radius: 0.04 };
}

/**
 * Red Annis's crook-blade: her husband's shepherd's crook, a long ash staff
 * held with a forearm's length of it behind the fist, with a bill's blade
 * lashed on under the crook's curl, edge out and its beak turned back.
 */
export function crookBlade(ctx: DressContext): WeaponSpec {
  const top = -1.32;
  const butt = 0.5;
  const b = ctx.on('handR');
  b.box(0.04, butt - top, 0.04, { at: [0, (butt + top) / 2, 0], color: MOOR.ash })
    .box(0.05, 0.13, 0.05, { at: [0, -0.02, 0], color: PAL.leatherDark })
    .box(0.05, 0.05, 0.05, { at: [0, butt - 0.02, 0], color: PAL.ironDark });
  // The crook's curl: on up past the blade, over toward her (+Z) and down.
  const curl: Vec3[] = [
    [0, top, 0],
    [0, top - 0.13, 0.04],
    [0, top - 0.14, 0.14],
    [0, top - 0.05, 0.18],
  ];
  for (let i = 0; i < curl.length - 1; i++) b.bar(curl[i], curl[i + 1], 0.036, 0.032, { color: MOOR.ash, mask: 1 });
  // The blade, lashed on below the curl: its back on the staff, its edge out to -Z, its beak hooked back down the staff.
  b.box(0.012, 0.36, 0.1, { at: [0, top + 0.18, -0.065], color: PAL.iron, mask: 1 })
    .box(0.01, 0.38, 0.016, { at: [0, top + 0.17, -0.12], color: PAL.steel, mask: 1, jitter: 0 })
    .bar([0, top + 0.34, -0.11], [0, top + 0.47, -0.18], 0.012, 0.045, { color: PAL.steel, mask: 1 })
    .box(0.06, 0.05, 0.06, { at: [0, top + 0.05, 0], color: PAL.leatherDark, mask: 1 })
    .box(0.06, 0.05, 0.06, { at: [0, top + 0.3, 0], color: PAL.leatherDark, mask: 1 });
  // A red rag tied on under the blade: the gang's colour.
  b.box(0.03, 0.17, 0.012, { at: [0.025, top + 0.45, 0.01], rot: [0.15, 0, 0.2], color: HUE.banditRed });
  return { bone: 'handR', base: [0, -0.3, 0], tip: [0, top - 0.06, -0.12], radius: 0.09 };
}

// ---------------------------------------------------------------- the thugs

/** Three faces, each in its own moor clothes: a sheepskin jerkin, a plaid, or a sheepskin mantle over a leather jerkin. */
const THUG_LOOKS: Look[] = [
  {
    build: 'average',
    skin: HUE.skinFair,
    hair: HUE.hairSandy,
    hairStyle: 'short',
    beard: 'stubble',
    shirt: MOOR.woolDark,
    forearm: 'skin',
    trousers: PAL.leather,
    boots: PAL.leatherDark,
    belt: PAL.leatherDark,
  },
  {
    build: 'average',
    skin: HUE.skinTan,
    hair: HUE.hairDark,
    hairStyle: 'long',
    beard: 'full',
    shirt: HUE.linenDark,
    sleeve: MOOR.wool,
    forearm: MOOR.wool,
    trousers: MOOR.woolDark,
    boots: PAL.woodDark,
    belt: PAL.leather,
  },
  {
    build: 'average',
    skin: HUE.skinWarm,
    hair: HUE.hairRed,
    hairStyle: 'cropped',
    shirt: MOOR.wool,
    forearm: PAL.leatherDark,
    hands: PAL.leatherDark,
    trousers: MOOR.oatmeal,
    boots: PAL.leatherDark,
    belt: PAL.leatherDark,
  },
];

/** A moor thug: one of three faces in its own clothes, each with a billhook or a long knife. */
function dressThug(ctx: DressContext, variant: number): WeaponSpec {
  const face = variant % THUG_LOOKS.length;
  const l = THUG_LOOKS[face];
  body(ctx, l);
  head(ctx, l);
  if (face === 0) {
    fleeceVest(ctx, l, MOOR.fleece);
    legWraps(ctx, l, MOOR.woolDark);
    bonnet(ctx, MOOR.woolDark);
  } else if (face === 1) {
    plaid(ctx, l, MOOR.wool);
    legWraps(ctx, l, MOOR.oatmeal);
  } else {
    const L = ctx.p.spine;
    const k = thick(l);
    ctx
      .on('spine')
      .taper(0.33 * k, 0.225 * k, 0.42 * k, 0.26 * k, L * 0.66, { at: [0, -0.02, 0.005], color: PAL.leather })
      .box(0.015, L * 0.5, 0.015, { at: [0, L * 0.3, 0.13 * k], color: PAL.leatherDark, jitter: 0 });
    ctx.on('hips').taper(0.37 * k, 0.25 * k, 0.34 * k, 0.23 * k, 0.12, { at: [0, -0.08, 0.005], color: PAL.leather });
    fleeceMantle(ctx, l, MOOR.fleeceGrey);
  }
  kerchief(ctx, HUE.banditRed);
  sash(ctx, l, HUE.banditRed);
  return variant % 2 ? longKnife(ctx) : billhook(ctx);
}

// ---------------------------------------------------------------- the archer

const ARCHER_LOOK: Look = {
  build: 'average',
  skin: HUE.skinFair,
  hair: HUE.hairBrown,
  hairStyle: 'short',
  beard: 'stubble',
  shirt: MOOR.woolDark,
  sleeve: MOOR.woolDark,
  forearm: PAL.leather,
  hands: PAL.leatherDark,
  trousers: MOOR.wool,
  boots: PAL.woodDark,
  belt: PAL.leatherDark,
};

/** The archer: a sheepskin jerkin under the green hood of every archer, the red kerchief, leg wraps, a quiver and the bow. */
function dressArcher(ctx: DressContext): WeaponSpec {
  const l = ARCHER_LOOK;
  body(ctx, l);
  head(ctx, l);
  fleeceVest(ctx, l, MOOR.fleeceGrey, false);
  legWraps(ctx, l, MOOR.oatmeal);
  kerchief(ctx, HUE.banditRed, false);
  sash(ctx, l, HUE.banditRed);
  hood(ctx, l, PAL.hood);
  quiver(ctx, HUE.banditRed);
  return bow(ctx, { tips: PAL.iron, string: HUE.bowString });
}

// ---------------------------------------------------------------- Red Annis

const ANNIS_LOOK: Look = {
  build: 'woman',
  skin: HUE.skinWarm,
  // Copper, brighter than the gang's red, so her hair shows against her coat.
  hair: 0xc4652c,
  hairStyle: 'long',
  shirt: MOOR.oatmeal,
  sleeve: HUE.banditRed,
  forearm: PAL.leather,
  hands: PAL.leatherDark,
  trousers: MOOR.woolDark,
  boots: PAL.leatherDark,
};

/**
 * A long coat to the knees: a fitted body over the shirt, a little proud of
 * it as a robe's bodice is (human.ts `robe`) and clear of a bust, closed down
 * the front, its skirts split front and back so the legs can move.
 */
function longCoat(ctx: DressContext, l: Look, color: number): void {
  const k = thick(l);
  const b = bellyOf(l);
  const { chest, waist, bust } = BUILDS[l.build].figure;
  const { spine: L, shoulderW: SW } = ctx.p;
  const low = (0.2 + b) * k + 0.03;
  const high = 0.24 * k + 0.03 + bust * 1.4;
  const s = ctx.on('spine');
  s.taper((waist + b) * k + 0.03, low, chest * k + 0.03, high, L * 0.7, { at: [0, -0.03, 0.005 + b * 0.3], color })
    .taper(chest * k + 0.03, high, (SW * 2 + 0.02) * k + 0.025, 0.2 * k + 0.025, L * 0.33, { at: [0, L * 0.67 - 0.03, 0], color });
  // Where its fronts meet, from the hem of the body to under the breast, following it out.
  const front = (y: number) => 0.005 + b * 0.3 + (low + ((high - low) * (y + 0.03)) / (L * 0.7)) / 2;
  s.bar([0, -0.03, front(-0.03) + 0.002], [0, L * 0.42, front(L * 0.42) + 0.002], 0.022, 0.012, { color: shade(color, 0.6), jitter: 0 });
  const zf = (0.135 + b * 0.5) * k;
  const h = ctx.on('hips');
  for (const x of [-0.12, 0.12]) h.box(0.17 * k, 0.56, 0.025, { at: [x * k, -0.26, zf + 0.02], rot: [0.1, 0, 0], color });
  h.box(0.44 * k, 0.58, 0.025, { at: [0, -0.27, -zf - 0.02], rot: [-0.1, 0, 0], color });
}

/** A thick braid of her red hair forward over her left shoulder and down the front of her mantle, tied off with a strip of the gang's cloth. */
function braid(ctx: DressContext, hair: number): void {
  ctx
    .on('head')
    .bar([0.075, 0.12, -0.06], [0.1, -0.02, 0.12], 0.05, 0.045, { color: hair })
    .bar([0.1, -0.02, 0.12], [0.07, -0.26, 0.17], 0.045, 0.04, { color: shade(hair, 0.9) })
    .box(0.05, 0.03, 0.045, { at: [0.07, -0.265, 0.172], rot: [-0.2, 0, 0], color: HUE.banditRed })
    .bar([0.07, -0.27, 0.173], [0.068, -0.34, 0.18], 0.04, 0.03, { color: hair });
}

/**
 * Red Annis: her red hair loose but for a braid, the leader's long red coat over a
 * shepherd's wool, a sheepskin mantle, her kerchief pulled down round her
 * neck so her face shows, the gang's sash, and her crook-blade.
 */
function dressAnnis(ctx: DressContext): WeaponSpec {
  const l = ANNIS_LOOK;
  body(ctx, l);
  head(ctx, l);
  braid(ctx, l.hair);
  longCoat(ctx, l, HUE.banditRed);
  fleeceMantle(ctx, l, MOOR.fleece);
  neckerchief(ctx, l, HUE.banditRedDark);
  // The sash wound over the coat, dark so it shows on the red.
  sash(ctx, l, HUE.banditRedDark, thick(l) * 1.3);
  return crookBlade(ctx);
}

// ---------------------------------------------------------------- the family

/** The build each moor bandit's body is made in. */
export const MOOR_BANDIT_BUILDS = { grunt: THUG_LOOKS[0].build, archer: ARCHER_LOOK.build, brute: ANNIS_LOOK.build } as const;

/**
 * The Red Kerchiefs on the moor: thugs fight as grunts, the archer as an
 * archer, and Red Annis, their leader, as a brute. Like Oakvale's leader she
 * is one of a kind: a camp's ordinary brutes are its diggers (diggers.ts).
 */
export const MOOR_BANDITS: FamilyDef = {
  body: 'human',
  seed: 41,
  fights: {
    grunt: { label: 'Moor thug', looks: 6, proportions: BUILDS[MOOR_BANDIT_BUILDS.grunt].proportions, dress: dressThug },
    archer: { label: 'Moor archer', looks: 1, proportions: BUILDS[MOOR_BANDIT_BUILDS.archer].proportions, dress: dressArcher },
    brute: { label: 'Red Annis', looks: 1, proportions: BUILDS[MOOR_BANDIT_BUILDS.brute].proportions, dress: dressAnnis },
  },
};
