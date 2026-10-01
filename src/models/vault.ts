import { Vector3 } from 'three';
import { BRONZE, facing } from './barrow';
import { bow } from './bow';
import type { WeaponSpec } from './characters';
import type { Vec3 } from './kit';
import { PAL } from './palette';
import type { DressContext } from './rig';
import { loincloth, type SkeletonLook, skeleton } from './skeleton';

// The vault dead: the Deepkings' own guard, sealed in the Sealed Vault under
// Aldhaven's cathedral and woken by Vey's digging. Skeletons on the undead's
// bones, their bone gone the grey of something never touched by air or
// peat, in plate of the black basalt the Deepkings built the city's footings
// of, cut with their glyphs, which glow the faint blue of the vault's own
// light; the same light is in their eyes. Grunts, an archer and a brute;
// FAMILIES (characters.ts) names them. The Keyward stands among them
// (keyward.ts).

const PI = Math.PI;
const DOWN: Vec3 = [PI, 0, 0]; // taper parts grow along +Y; this flips them down a limb

/** The Deepkings' black basalt (Aldhaven's palette), a lighter face of it, and the worn edge. */
export const BASALT = { base: 0x2e2c33, light: 0x45424d, edge: 0x5c5866 } as const;
/** The light in the Deepkings' glyphs, and in the vault dead's eyes. */
export const GLYPH = 0x6ac4f4;
/** How brightly a glyph cut in stone glows: faint, beside the eyes' full light. */
const FAINT = 0.7;
/** Bone that's lain in the dark, sealed: grey, not stained. */
const BONE = 0xb0aa9c;
const BONE_SHADE = 0x7c776c;
/** Their cloth: a slate blue, nearly black. */
const SLATE = 0x2a313e;
/** An archer's hood, green as every archer's is, but the dark of the vault. */
const HOOD = 0x2f4434;

const look = (s: number): SkeletonLook => ({ s, eye: GLYPH, bone: BONE, shade: BONE_SHADE });

// ---------------------------------------------------------------- helms and plate

/** A tall helm of black stone: a cap, a fin crest, cheek plates, and a glyph across the brow. */
function finHelm(ctx: DressContext, s: number): void {
  ctx
    .on('head')
    .taper(0.23 * s, 0.245 * s, 0.17 * s, 0.19 * s, 0.11 * s, { at: [0, 0.195 * s, -0.005 * s], color: BASALT.base })
    .box(0.034 * s, 0.11 * s, 0.24 * s, { at: [0, 0.33 * s, -0.02 * s], color: BASALT.light })
    .box(0.026 * s, 0.15 * s, 0.13 * s, { at: [-0.112 * s, 0.13 * s, 0.01 * s], color: BASALT.light })
    .box(0.026 * s, 0.15 * s, 0.13 * s, { at: [0.112 * s, 0.13 * s, 0.01 * s], color: BASALT.light })
    .box(0.236 * s, 0.03 * s, 0.25 * s, { at: [0, 0.2 * s, -0.005 * s], color: BASALT.edge })
    .box(0.13 * s, 0.014 * s, 0.012 * s, { at: [0, 0.212 * s, 0.128 * s], color: GLYPH, glow: FAINT, jitter: 0 });
}

/** A round-topped helm with a long neck guard and a glyph down the nose guard. */
function domeHelm(ctx: DressContext, s: number): void {
  ctx
    .on('head')
    .taper(0.235 * s, 0.25 * s, 0.12 * s, 0.13 * s, 0.13 * s, { at: [0, 0.19 * s, 0], color: BASALT.base })
    .box(0.24 * s, 0.03 * s, 0.255 * s, { at: [0, 0.2 * s, 0], color: BASALT.edge })
    .box(0.22 * s, 0.12 * s, 0.03 * s, { at: [0, 0.14 * s, -0.12 * s], rot: [-0.2, 0, 0], color: BASALT.light })
    .box(0.03 * s, 0.09 * s, 0.022 * s, { at: [0, 0.16 * s, 0.124 * s], color: BASALT.light })
    .box(0.01 * s, 0.07 * s, 0.01 * s, { at: [0, 0.16 * s, 0.137 * s], color: GLYPH, glow: FAINT, jitter: 0 });
}

/**
 * A breastplate of black stone over the upper ribs, a glyph down its middle
 * and across its top, and slabs over both shoulders; the lowest ribs bare.
 */
function stonePlate(ctx: DressContext, s: number): void {
  const L = ctx.p.spine;
  const w = 0.34 * s;
  const d = 0.23 * s;
  const h = L * 0.5;
  const y0 = L - h - 0.01 * s;
  ctx
    .on('spine')
    .taper(w * 0.92, d, w * 1.06, d * 1.04, h, { at: [0, y0, 0.005 * s], color: BASALT.base })
    .box(w * 1.1, 0.03 * s, d * 1.1, { at: [0, L - 0.02 * s, 0.005 * s], color: BASALT.edge })
    .box(0.014 * s, h * 0.8, 0.01 * s, { at: [0, y0 + h * 0.48, d * 0.53 + 0.005 * s], color: GLYPH, glow: FAINT, jitter: 0 })
    .box(w * 0.7, 0.014 * s, 0.01 * s, { at: [0, L - 0.06 * s, d * 0.53 + 0.005 * s], color: GLYPH, glow: FAINT, jitter: 0 });
  for (const side of ['L', 'R'] as const) {
    const x = side === 'L' ? 1 : -1;
    ctx
      .on(`upperArm${side}`)
      .box(0.15 * s, 0.05 * s, 0.17 * s, { at: [0.03 * x * s, 0.0, 0], rot: [0, 0, -0.25 * x], color: BASALT.light })
      .box(0.13 * s, 0.035 * s, 0.15 * s, { at: [0.045 * x * s, -0.06 * s, 0], rot: [0, 0, -0.3 * x], color: BASALT.base });
    ctx.on(`forearm${side}`).taper(0.06 * s, 0.06 * s, 0.07 * s, 0.068 * s, 0.13 * s, { at: [0, -ctx.p.forearm + 0.02 * s, 0], color: BASALT.base });
    ctx
      .on(`shin${side}`)
      .taper(0.07 * s, 0.075 * s, 0.075 * s, 0.085 * s, ctx.p.shin * 0.6, { at: [0, -ctx.p.shin * 0.85, 0.012 * s], color: BASALT.base })
      .box(0.01 * s, ctx.p.shin * 0.4, 0.01 * s, { at: [0, -ctx.p.shin * 0.55, 0.058 * s], color: GLYPH, glow: FAINT, jitter: 0 });
  }
}

/** A belt of bronze plates, and the slate cloth below. */
function plateBelt(ctx: DressContext, s: number, len: number): void {
  loincloth(ctx, s, SLATE, len);
  ctx
    .on('hips')
    .box(0.31 * s, 0.055 * s, 0.19 * s, { at: [0, -0.015 * s, 0], color: BRONZE.base })
    .box(0.08 * s, 0.07 * s, 0.02 * s, { at: [0, -0.015 * s, 0.1 * s], color: BASALT.light })
    .box(0.012 * s, 0.04 * s, 0.01 * s, { at: [0, -0.015 * s, 0.112 * s], color: GLYPH, glow: FAINT, jitter: 0 });
}

/**
 * A tall square shield, a slab of stone on the left forearm with a glyph cut
 * in it, faced forward and out while the arm's up in the grunt's guard (as
 * the barrow dead's round shield is).
 */
function slabShield(ctx: DressContext, s: number): void {
  const n = new Vector3(0.55, -0.67, 0.48).normalize();
  const c = new Vector3(0.05 * s, -0.14 * s, 0.03 * s);
  const at = (k: number): Vec3 => [c.x + n.x * k, c.y + n.y * k, c.z + n.z * k];
  // Stand its height along the forearm's line as the arm holds it up: the slab's long side runs up the arm.
  const rot = facing([n.x, n.y, n.z]);
  ctx
    .on('forearmL')
    .box(0.34 * s, 0.03 * s, 0.44 * s, { at: at(0), rot, color: BASALT.base })
    .box(0.36 * s, 0.02 * s, 0.03 * s, { at: at(0.005 * s), rot, color: BASALT.edge })
    .box(0.04 * s, 0.012 * s, 0.26 * s, { at: at(0.02 * s), rot, color: GLYPH, glow: FAINT, jitter: 0 })
    .box(0.16 * s, 0.012 * s, 0.04 * s, { at: at(0.02 * s), rot, color: GLYPH, glow: FAINT, jitter: 0 });
}

// ---------------------------------------------------------------- weapons (hand space, along -Y)

/** A straight blade of black iron, a bronze guard, and a glyph glowing down the fuller. */
function glyphSword(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.042, 0.032, 0.05, { at: [0, 0.03, 0], color: BRONZE.base })
    .box(0.03, 0.11, 0.032, { at: [0, -0.04, 0], color: BASALT.base })
    .box(0.036, 0.032, 0.15, { at: [0, -0.11, 0], color: BRONZE.base, mask: 1 })
    .taper(0.016, 0.06, 0.008, 0.016, 0.7, { at: [0, -0.125, 0], rot: DOWN, color: PAL.ironDark, mask: 1 })
    .box(0.02, 0.5, 0.01, { at: [0, -0.42, 0], color: GLYPH, glow: FAINT, mask: 1, jitter: 0 });
  return { bone: 'handR', base: [0, -0.13, 0], tip: [0, -0.82, 0], radius: 0.035 };
}

/** A crescent axe: a black stone blade, bronze-rimmed, on a black haft. */
function crescentAxe(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.036, 0.74, 0.036, { at: [0, -0.31, 0], color: BASALT.base })
    .box(0.042, 0.06, 0.042, { at: [0, -0.02, 0], color: BRONZE.base })
    .box(0.034, 0.12, 0.08, { at: [0, -0.58, -0.04], color: BASALT.light, mask: 1 })
    .taper(0.028, 0.12, 0.01, 0.3, 0.13, { at: [0, -0.58, -0.07], rot: [-PI / 2, 0, 0], color: BASALT.base, mask: 1 })
    .box(0.03, 0.3, 0.02, { at: [0, -0.58, -0.205], color: BRONZE.base, mask: 1 })
    .box(0.01, 0.1, 0.01, { at: [0.018, -0.58, -0.12], color: GLYPH, glow: FAINT, mask: 1, jitter: 0 });
  return { bone: 'handR', base: [0, -0.3, 0], tip: [0, -0.7, -0.2], radius: 0.06 };
}

/** The brute's stone maul: a black haft bound in bronze, a block of basalt banded with glyphs. */
function vaultMaul(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .cyl(0.035, 0.035, 1.12, 6, { at: [0, -0.46, 0], color: BASALT.base })
    .box(0.05, 0.14, 0.05, { at: [0, -0.02, 0], color: BRONZE.base })
    .box(0.05, 0.05, 0.05, { at: [0, -0.5, 0], color: BRONZE.base })
    .box(0.26, 0.26, 0.46, { at: [0, -1.02, 0], color: BASALT.base, mask: 1 })
    .box(0.28, 0.05, 0.48, { at: [0, -0.92, 0], color: BRONZE.base, mask: 1 })
    .box(0.28, 0.05, 0.48, { at: [0, -1.12, 0], color: BRONZE.base, mask: 1 })
    .box(0.27, 0.014, 0.47, { at: [0, -1.02, 0], color: GLYPH, glow: FAINT, mask: 1, jitter: 0 });
  return { bone: 'handR', base: [0, -0.2, 0], tip: [0, -1.1, 0], radius: 0.16 };
}

// ---------------------------------------------------------------- the vault dead

/**
 * A grunt of the vault dead, in three looks: a fin-crested helm and a glyph
 * sword (0), a dome helm and a crescent axe (1), and a fin helm, the sword
 * and a slab shield (2).
 */
export function dressVaultGrunt(ctx: DressContext, variant: number): WeaponSpec {
  const v = ((variant % 3) + 3) % 3;
  skeleton(ctx, look(1));
  plateBelt(ctx, 1, 0.32);
  stonePlate(ctx, 1);
  if (v === 1) domeHelm(ctx, 1);
  else finHelm(ctx, 1);
  if (v === 2) slabShield(ctx, 1);
  return v === 1 ? crescentAxe(ctx) : glyphSword(ctx);
}

/** The vault archer: a dark green hood over a stone collar, a black bow tipped with bronze, a glyph at its grip. */
export function dressVaultArcher(ctx: DressContext): WeaponSpec {
  const s = 0.95;
  const L = ctx.p.spine;
  skeleton(ctx, look(s));
  plateBelt(ctx, s, 0.3);
  ctx
    .on('head')
    .taper(0.24, 0.25, 0.14, 0.16, 0.2, { at: [0, 0.08, -0.03], color: HOOD })
    .box(0.24, 0.12, 0.05, { at: [0, 0.13, -0.12], color: HOOD })
    .cone(0.06, 0.12, 4, { at: [0, 0.3, -0.07], rot: [-0.5, 0, 0], color: HOOD })
    .box(0.1, 0.012, 0.012, { at: [0, 0.205, 0.125], color: GLYPH, glow: FAINT, jitter: 0 });
  ctx
    .on('spine')
    .taper(0.34, 0.24, 0.3, 0.2, 0.12, { at: [0, L - 0.08, 0], color: HOOD })
    .taper(0.27, 0.19, 0.3, 0.2, 0.16, { at: [0, L - 0.25, 0.005], color: BASALT.base })
    .box(0.012, 0.13, 0.01, { at: [0, L - 0.17, 0.105], color: GLYPH, glow: FAINT, jitter: 0 })
    .cyl(0.05, 0.045, 0.42, 6, { at: [-0.06, L - 0.2, -0.14], rot: [0, 0, -0.35], color: PAL.leatherDark })
    .box(0.03, 0.1, 0.03, { at: [-0.14, L + 0.04, -0.14], rot: [0, 0, -0.35], color: SLATE })
    .box(0.03, 0.1, 0.03, { at: [-0.1, L + 0.05, -0.15], rot: [0, 0, -0.3], color: BONE_SHADE });
  ctx.on('forearmL').taper(0.06, 0.06, 0.07, 0.07, 0.14, { at: [0, -0.21, 0], color: BASALT.base });
  const spec = bow(ctx, { tips: BRONZE.base, string: BONE_SHADE });
  ctx.on('handL').box(0.036, 0.02, 0.06, { at: [0, -0.06, 0], color: GLYPH, glow: FAINT, jitter: 0 });
  return spec;
}

/** The vault's brute: a big-boned skeleton in heavy stone plate and a fin helm, with a glyph-banded maul. */
export function dressVaultBrute(ctx: DressContext): WeaponSpec {
  const s = 1.6;
  skeleton(ctx, look(s));
  plateBelt(ctx, s * 0.9, 0.44);
  finHelm(ctx, s);
  stonePlate(ctx, s * 0.95);
  for (const side of ['L', 'R'] as const) {
    const x = side === 'L' ? 1 : -1;
    ctx
      .on(`upperArm${side}`)
      .box(0.28, 0.08, 0.3, { at: [0.06 * x, 0.02, 0], rot: [0, 0, -0.3 * x], color: BASALT.light })
      .box(0.012, 0.012, 0.31, { at: [0.06 * x, 0.065, 0], rot: [0, 0, -0.3 * x], color: GLYPH, glow: FAINT, jitter: 0 });
  }
  return vaultMaul(ctx);
}
