import type { EnemyConfig } from '../config';
import { BRONZE } from './barrow';
import type { WeaponSpec } from './characters';
import type { Vec3 } from './kit';
import type { DressContext } from './rig';
import { BASALT, CUT, FAINT, GLYPH } from './vault';

// The Keyward: what the Deepkings left to keep their Sealed Vault under
// Aldhaven's cathedral, and what Vey wakes. A giant of black basalt blocks
// on the giant build (giant.ts), about 5 m to its crown, bound in bronze
// plates and cut with glyphs that glow the vault's faint blue; a keyhole of
// full light in its chest, a slit of it for eyes, and for a weapon the key
// itself, a bronze key as long as a man is tall with a bit like a maul's
// head. It fights as the brute does, its slams scaled up. The vault dead's
// named fighter (FAMILIES.vault in characters.ts): the Sealed Vault's camp
// asks for it by name.

const PI = Math.PI;
const SIDE = [PI / 2, 0, 0] as Vec3; // a cylinder's axis turned from Y to Z: a disc facing forward
const ACROSS = [0, 0, PI / 2] as Vec3; // a cylinder's axis turned from Y to X: a disc facing sideways

/** The Keyward's numbers, over the brute's: a giant's reach and weight, and a boss's health. */
export const KEYWARD_NUMBERS: Partial<EnemyConfig> = {
  hp: 1600,
  radius: 1.0,
  speed: 1.1,
  turnSpeed: 1.7, // slow to come round: get behind it
  poise: 60,
  attackRange: 3.4,
  holdDistance: 4.2,
  attackCooldown: [1.4, 2.6],
  steadyTime: 3,
  parryStagger: 1.2,
  exposedTime: 2.6,
  critMultiplier: 2,
  orbChance: 0,
  death: 'shatter',
  takes: { hold: 0, slow: 0.5 }, // nothing roots it: it stays a boss fight
  knockback: 0.05,
  attacks: [
    { pose: 'slashR', kind: 'melee', windup: 1.3, active: 0.35, recover: 1.0, damage: 34, blockable: true, guardBreak: true, aim: true, weight: 2 },
    { pose: 'slam', kind: 'slam', windup: 1.5, active: 0.3, recover: 1.8, damage: 44, blockable: false, radius: 2.6, exposeOnRecover: true, weight: 1 },
  ],
};

// ---------------------------------------------------------------- the body

/** Hips: a block of basalt, a bronze belt with a glyph, and plates hanging before, beside and behind. */
function hips(ctx: DressContext): void {
  const b = ctx.on('hips');
  b.box(0.95, 0.5, 0.62, { at: [0, -0.05, 0], color: BASALT.base })
    .box(1.02, 0.14, 0.68, { at: [0, 0.2, 0], color: BRONZE.base })
    .box(0.5, 0.03, 0.01, { at: [0, 0.2, 0.345], color: CUT, glow: FAINT, jitter: 0 })
    .box(0.42, 0.62, 0.07, { at: [0, -0.42, 0.34], rot: [-0.1, 0, 0], color: BASALT.light })
    .box(0.44, 0.06, 0.08, { at: [0, -0.72, 0.37], rot: [-0.1, 0, 0], color: BRONZE.base })
    .box(0.03, 0.4, 0.01, { at: [0, -0.4, 0.38], rot: [-0.1, 0, 0], color: CUT, glow: FAINT, jitter: 0 })
    .box(0.72, 0.6, 0.07, { at: [0, -0.38, -0.34], rot: [0.1, 0, 0], color: BASALT.light });
  for (const x of [-1, 1]) {
    b.box(0.07, 0.52, 0.42, { at: [0.5 * x, -0.34, 0.02], rot: [0, 0, 0.1 * x], color: BASALT.light })
      .box(0.08, 0.06, 0.44, { at: [0.53 * x, -0.6, 0.02], rot: [0, 0, 0.1 * x], color: BRONZE.base });
  }
}

/**
 * The trunk: a narrow waist under a chest of basalt broadening to the
 * shoulders, two bronze plates on the breast, the keyhole glowing between
 * them in a bronze ring, glyphs across the yoke, and a bronze spine down the back.
 */
function trunk(ctx: DressContext): void {
  const L = ctx.p.spine;
  const b = ctx.on('spine');
  b.taper(0.72, 0.5, 0.86, 0.6, 0.32, { at: [0, -0.02, 0], color: BASALT.base })
    .taper(0.98, 0.66, 1.5, 0.92, L - 0.3, { at: [0, 0.3, 0.02], color: BASALT.base })
    .box(1.6, 0.16, 0.98, { at: [0, L - 0.04, 0.02], color: BASALT.edge })
    .box(1.0, 0.03, 0.01, { at: [0, L - 0.16, 0.495], color: CUT, glow: FAINT, jitter: 0 });
  // The breast plates, leaning with the chest's front.
  for (const x of [-1, 1]) {
    b.box(0.54, 0.42, 0.06, { at: [0.37 * x, 0.92, 0.47], rot: [0.14, 0, 0.06 * x], color: BRONZE.base })
      .box(0.56, 0.05, 0.07, { at: [0.37 * x, 1.12, 0.5], rot: [0.14, 0, 0.06 * x], color: BRONZE.bright })
      .box(0.03, 0.3, 0.01, { at: [0.37 * x, 0.92, 0.505], rot: [0.14, 0, 0.06 * x], color: CUT, glow: FAINT, jitter: 0 });
  }
  // The keyhole: a ring of bronze and the vault's light full in it.
  b.cyl(0.2, 0.2, 0.06, 8, { at: [0, 0.6, 0.42], rot: SIDE, color: BRONZE.bright })
    .cyl(0.1, 0.1, 0.07, 8, { at: [0, 0.64, 0.425], rot: SIDE, color: GLYPH, glow: 1, jitter: 0 })
    .taper(0.13, 0.07, 0.06, 0.07, 0.17, { at: [0, 0.46, 0.425], color: GLYPH, glow: 1, jitter: 0 })
    .box(0.03, 0.26, 0.01, { at: [0, 0.27, 0.37], color: CUT, glow: FAINT, jitter: 0 });
  // Down its back: a bronze spine over stone blocks.
  b.box(0.2, 0.92, 0.1, { at: [0, 0.75, -0.47], rot: [-0.14, 0, 0], color: BRONZE.base });
  for (const y of [0.42, 0.72, 1.02]) b.box(0.54, 0.18, 0.12, { at: [0, y, -0.43 - (y - 0.4) * 0.12], rot: [-0.14, 0, 0], color: BASALT.light });
}

/** Its arms: great stepped pauldrons, stone columns, bronze at the elbow and wrist, and fists of stone. */
function arms(ctx: DressContext): void {
  for (const side of ['L', 'R'] as const) {
    const x = side === 'L' ? 1 : -1;
    ctx
      .on(`upperArm${side}`)
      .taper(0.64, 0.74, 0.54, 0.62, 0.42, { at: [0.06 * x, -0.3, 0], color: BASALT.light })
      .box(0.7, 0.1, 0.8, { at: [0.06 * x, 0.12, 0], color: BASALT.edge })
      .box(0.7, 0.08, 0.8, { at: [0.06 * x, -0.3, 0], color: BRONZE.base })
      .box(0.01, 0.3, 0.03, { at: [0.39 * x, -0.1, 0], color: CUT, glow: FAINT, jitter: 0 })
      .taper(0.36, 0.38, 0.42, 0.44, 0.75, { at: [0, -0.95, 0], color: BASALT.base })
      .box(0.44, 0.16, 0.46, { at: [0, -1.0, 0], color: BRONZE.base });
    ctx
      .on(`forearm${side}`)
      .taper(0.5, 0.5, 0.38, 0.4, 0.82, { at: [0, -0.88, 0], color: BASALT.base })
      .box(0.54, 0.22, 0.54, { at: [0, -0.7, 0], color: BRONZE.base })
      .box(0.01, 0.16, 0.03, { at: [0.275 * x, -0.7, 0], color: CUT, glow: FAINT, jitter: 0 });
    ctx
      .on(`hand${side}`)
      .box(0.44, 0.4, 0.46, { at: [0, -0.16, 0.02], color: BASALT.light })
      .box(0.46, 0.08, 0.2, { at: [0, -0.26, 0.17], color: BRONZE.base });
  }
}

/** Its legs: thighs of stone, bronze knees, pillar shins broadening to the floor, bronze greaves, block feet. */
function legs(ctx: DressContext): void {
  for (const side of ['L', 'R'] as const) {
    const x = side === 'L' ? 1 : -1;
    ctx
      .on(`thigh${side}`)
      .taper(0.5, 0.56, 0.6, 0.64, 1.0, { at: [0.02 * x, -1.12, 0], color: BASALT.base })
      .box(0.48, 0.48, 0.06, { at: [0.02 * x, -0.55, 0.32], color: BASALT.light })
      .box(0.48, 0.2, 0.52, { at: [0, -1.2, 0], color: BASALT.edge })
      .box(0.4, 0.26, 0.12, { at: [0, -1.2, 0.3], color: BRONZE.base });
    ctx
      .on(`shin${side}`)
      .taper(0.62, 0.66, 0.48, 0.52, 1.02, { at: [0, -1.12, 0], color: BASALT.base })
      .box(0.42, 0.72, 0.07, { at: [0, -0.56, 0.3], rot: [0.06, 0, 0], color: BRONZE.base })
      .box(0.03, 0.5, 0.01, { at: [0, -0.56, 0.34], rot: [0.06, 0, 0], color: CUT, glow: FAINT, jitter: 0 });
    ctx
      .on(`foot${side}`)
      .box(0.68, 0.2, 0.94, { at: [0, -0.0, 0.16], color: BASALT.light })
      .box(0.7, 0.12, 0.2, { at: [0, -0.04, 0.62], color: BRONZE.base });
  }
}

/** Its head, low and forward between the shoulders: a block mask, a slit of light for eyes, a bronze keystone for a crown. */
function head(ctx: DressContext): void {
  ctx
    .on('head')
    .box(0.42, 0.34, 0.42, { at: [0, -0.06, -0.06], color: BASALT.base })
    .box(0.58, 0.58, 0.6, { at: [0, 0.34, 0.05], color: BASALT.light })
    .box(0.64, 0.12, 0.18, { at: [0, 0.47, 0.32], color: BASALT.edge })
    .box(0.42, 0.045, 0.04, { at: [0, 0.37, 0.36], color: GLYPH, glow: 1, jitter: 0 })
    .box(0.03, 0.16, 0.02, { at: [0, 0.22, 0.36], color: CUT, glow: FAINT, jitter: 0 })
    .box(0.06, 0.42, 0.44, { at: [0.31, 0.3, 0.08], color: BRONZE.base })
    .box(0.06, 0.42, 0.44, { at: [-0.31, 0.3, 0.08], color: BRONZE.base })
    .taper(0.4, 0.56, 0.22, 0.46, 0.2, { at: [0, 0.63, 0.04], color: BRONZE.base })
    .box(0.1, 0.22, 0.5, { at: [0, 0.9, 0.02], color: BASALT.edge })
    .box(0.02, 0.12, 0.012, { at: [0, 0.73, 0.28], rot: [0.5, 0, 0], color: CUT, glow: FAINT, jitter: 0 });
  ctx.on('jaw').box(0.48, 0.16, 0.4, { at: [0, -0.02, -0.04], color: BASALT.base });
}

// ---------------------------------------------------------------- the key (hand space, along -Y)

/**
 * The Deepkings' key: a bronze bow above the fist with the vault's light in
 * its eye, a shank of basalt bound in bronze, and the bit at its end, a block
 * of bronze stepped with stone wards, struck with like a maul's head.
 */
function greatKey(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .cyl(0.26, 0.26, 0.09, 8, { at: [0, 0.42, 0], rot: ACROSS, color: BRONZE.base })
    .cyl(0.12, 0.12, 0.1, 8, { at: [0, 0.42, 0], rot: ACROSS, color: GLYPH, glow: FAINT, jitter: 0 })
    .box(0.17, 0.14, 0.17, { at: [0, 0.12, 0], color: BRONZE.bright })
    .cyl(0.075, 0.075, 2.1, 6, { at: [0, -0.95, 0], color: BASALT.base })
    .box(0.18, 0.1, 0.18, { at: [0, -0.62, 0], color: BRONZE.base })
    .box(0.18, 0.1, 0.18, { at: [0, -1.3, 0], color: BRONZE.base })
    .box(0.36, 0.52, 0.52, { at: [0, -1.98, -0.14], color: BRONZE.base, mask: 1 })
    .box(0.3, 0.14, 0.26, { at: [0, -1.84, -0.5], color: BASALT.light, mask: 1 })
    .box(0.3, 0.12, 0.2, { at: [0, -2.08, -0.47], color: BASALT.light, mask: 1 })
    .box(0.37, 0.03, 0.53, { at: [0, -1.96, -0.14], color: CUT, glow: FAINT, mask: 1, jitter: 0 })
    .box(0.26, 0.14, 0.26, { at: [0, -2.28, 0], color: BRONZE.bright, mask: 1 });
  return { bone: 'handR', base: [0, -0.3, 0], tip: [0, -2.2, -0.2], radius: 0.2 };
}

// ---------------------------------------------------------------- the Keyward

export function dressKeyward(ctx: DressContext): WeaponSpec {
  hips(ctx);
  trunk(ctx);
  arms(ctx);
  legs(ctx);
  head(ctx);
  return greatKey(ctx);
}
