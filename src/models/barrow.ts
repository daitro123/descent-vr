import { Euler, Quaternion, Vector3 } from 'three';
import { bow } from './bow';
import type { WeaponSpec } from './characters';
import type { Vec3 } from './kit';
import { PAL } from './palette';
import type { DressContext } from './rig';
import { loincloth, type SkeletonLook, skeleton } from './skeleton';

// The barrow dead: the Deepkings' war-band, laid in the barrows on
// Brackenmoor's High Fells with their grave goods, and walking again now the
// Kerchiefs have dug them open. Skeletons on the same rig as Oakvale's undead,
// told apart by their bone, stained the brown of old peat, the pale barrow
// light in their sockets, and bronze everywhere: helms and scale gone green,
// round shields, leaf-shaped blades. Grunts, an archer, the barrow's champion
// as the brute, and the Barrow Thane under Hollowhill, their war-leader, as
// the Warden's equal. Each look is a dress function here; FAMILIES
// (characters.ts) names them.

const PI = Math.PI;
const DOWN: Vec3 = [PI, 0, 0]; // taper parts grow along +Y; this flips them down a limb

/** Bronze left in a barrow: green where the air's had it, brown-gold where it's rubbed. */
export const BRONZE = {
  bright: 0xb88a4c,
  base: 0x8c6a3c,
  green: 0x5c8a6c,
  greenDark: 0x3c604f,
  greenPale: 0x88b49c,
} as const;

/** Their bone, the peat's brown in it; grave wool rotted to brown; the barrow light. */
const BONE = 0xc2b28c;
const BONE_SHADE = 0x8c7c58;
const WOOL = 0x5a4a36;
const WOOL_DARK = 0x3a3026;
/** A rotted moss-green hood: an archer reads by its green hood in any family. */
const MOSS = 0x48593a;
/** The cold light in a barrow-wight's sockets, and in the Thane's crown and blade. */
export const BARROW_LIGHT = 0xa8ecbc;
/** The Thane's cloak, the heather's purple gone nearly black. */
const HEATHER = 0x4a3048;

const look = (s: number): SkeletonLook => ({ s, eye: BARROW_LIGHT, bone: BONE, shade: BONE_SHADE });

/** Corroded bronze is mottled: more shade from face to face than the kit's usual. */
const MOTTLE = 0.16;

/** The turn (Euler XYZ, as the kit's `rot`) that stands a part's +Y axis along `n`: a disc's face, a spike's point. */
export function facing(n: Vec3): Vec3 {
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...n).normalize());
  const e = new Euler().setFromQuaternion(q, 'XYZ');
  return [e.x, e.y, e.z];
}

// ---------------------------------------------------------------- helms

/** A round bronze cap with cheek guards and a crest ridge; `crown` rings it with points (the Thane's). */
function crestedHelm(ctx: DressContext, s: number, crown = false): void {
  const b = ctx.on('head');
  b.taper(0.225 * s, 0.24 * s, 0.15 * s, 0.165 * s, 0.11 * s, { at: [0, 0.19 * s, -0.005 * s], color: BRONZE.green, jitter: MOTTLE })
    .box(0.232 * s, 0.032 * s, 0.248 * s, { at: [0, 0.2 * s, -0.005 * s], color: BRONZE.bright })
    .box(0.022 * s, 0.11 * s, 0.1 * s, { at: [-0.11 * s, 0.135 * s, 0.02 * s], color: BRONZE.greenDark })
    .box(0.022 * s, 0.11 * s, 0.1 * s, { at: [0.11 * s, 0.135 * s, 0.02 * s], color: BRONZE.greenDark })
    .box(0.03 * s, 0.05 * s, 0.2 * s, { at: [0, 0.32 * s, -0.01 * s], color: BRONZE.base });
  if (!crown) {
    // What's left of a horsehair plume, trailing back off the crest.
    b.box(0.03 * s, 0.14 * s, 0.04 * s, { at: [0, 0.27 * s, -0.13 * s], rot: [0.35, 0, 0], color: WOOL_DARK });
    return;
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2;
    b.cone(0.03 * s, 0.1 * s, 4, { at: [Math.sin(a) * 0.12 * s, 0.26 * s, Math.cos(a) * 0.125 * s], color: BRONZE.bright });
  }
  // A stone of barrow light at the brow.
  b.box(0.04 * s, 0.035 * s, 0.02 * s, { at: [0, 0.205 * s, 0.128 * s], color: BARROW_LIGHT, glow: 1, jitter: 0 });
}

/** A tall pointed helm with a nose guard and cheek guards. */
function conicalHelm(ctx: DressContext, s: number): void {
  ctx
    .on('head')
    .cone(0.15 * s, 0.18 * s, 8, { at: [0, 0.295 * s, 0], color: BRONZE.green, jitter: MOTTLE })
    .box(0.236 * s, 0.035 * s, 0.248 * s, { at: [0, 0.205 * s, 0], color: BRONZE.bright })
    .box(0.026 * s, 0.085 * s, 0.02 * s, { at: [0, 0.16 * s, 0.122 * s], color: BRONZE.bright })
    .box(0.022 * s, 0.11 * s, 0.1 * s, { at: [-0.11 * s, 0.135 * s, 0.02 * s], color: BRONZE.greenDark })
    .box(0.022 * s, 0.11 * s, 0.1 * s, { at: [0.11 * s, 0.135 * s, 0.02 * s], color: BRONZE.greenDark });
}

/** A bronze band round the bare skull, with a disc at the brow. */
function diadem(ctx: DressContext, s: number): void {
  ctx
    .on('head')
    .box(0.205 * s, 0.026 * s, 0.215 * s, { at: [0, 0.205 * s, 0], color: BRONZE.green })
    .cyl(0.028 * s, 0.028 * s, 0.012 * s, 8, { at: [0, 0.212 * s, 0.11 * s], rot: [PI / 2, 0, 0], color: BRONZE.bright });
}

// ---------------------------------------------------------------- grave goods

/**
 * A shirt of bronze scales over the upper ribs, gone green, rows of it
 * catching the light in turn, the lowest ribs bare below its hem, and short
 * sleeves of it over the shoulders. `long` hangs a coat's skirt of it from
 * the hips to mid-thigh, front and back.
 */
function scaleShirt(ctx: DressContext, s: number, long = false): void {
  const L = ctx.p.spine;
  const w = 0.33 * s;
  const d = 0.22 * s;
  const h = L * 0.46;
  const y0 = L - h - 0.01 * s;
  const b = ctx.on('spine');
  b.taper(w, d, w * 1.08, d * 1.04, h, { at: [0, y0, 0.005 * s], color: BRONZE.green, jitter: MOTTLE });
  // Three rows of scales over it, each a little proud of the last, alternately bright and dark.
  for (let i = 0; i < 3; i++) {
    const y = y0 + (h * (i + 0.5)) / 3;
    const k = 1.03 + i * 0.015;
    b.box(w * k, h / 6, d * k, { at: [0, y, 0.005 * s], color: i % 2 ? BRONZE.greenDark : BRONZE.greenPale, jitter: MOTTLE });
  }
  for (const side of ['L', 'R'] as const) {
    const x = side === 'L' ? 1 : -1;
    ctx
      .on(`upperArm${side}`)
      .taper(0.125 * s, 0.13 * s, 0.095 * s, 0.11 * s, 0.1 * s, { at: [0.015 * x * s, -0.07 * s, 0], color: BRONZE.green, jitter: MOTTLE });
  }
  if (!long) return;
  // The skirt: strips of scales hung from the belt, three in front and three behind, splayed.
  const hips = ctx.on('hips');
  const len = ctx.p.thigh * 0.62;
  for (const z of [1, -1]) {
    for (const x of [-1, 0, 1]) {
      hips
        .taper(0.1 * s, 0.025 * s, 0.11 * s, 0.025 * s, len, { at: [x * 0.1 * s, -len - 0.02 * s, z * (0.1 + Math.abs(x) * 0.01) * s], rot: [0, 0, x * -0.06], color: x ? BRONZE.green : BRONZE.greenPale, jitter: MOTTLE })
        .box(0.112 * s, len / 6, 0.034 * s, { at: [x * 0.1 * s, -len * 0.45, z * (0.1 + Math.abs(x) * 0.01) * s], color: BRONZE.greenDark, jitter: MOTTLE });
    }
  }
}

/** Big plates of bronze over the shoulders, with a bright rim: a champion's and a war-leader's. */
function pauldrons(ctx: DressContext, s: number): void {
  for (const side of ['L', 'R'] as const) {
    const x = side === 'L' ? 1 : -1;
    ctx
      .on(`upperArm${side}`)
      .taper(0.186 * s, 0.2 * s, 0.138 * s, 0.172 * s, 0.138 * s, { at: [0.02 * x * s, -0.083 * s, 0], color: BRONZE.green, jitter: MOTTLE })
      .box(0.2 * s, 0.024 * s, 0.214 * s, { at: [0.02 * x * s, -0.083 * s, 0], color: BRONZE.bright });
  }
}

/** A belt with the bronze disc that closed it at the front. */
function beltDisc(ctx: DressContext, s: number): void {
  ctx
    .on('hips')
    .box(0.31 * s, 0.05 * s, 0.19 * s, { at: [0, -0.015 * s, 0], color: PAL.leatherDark })
    .cyl(0.05 * s, 0.05 * s, 0.016 * s, 8, { at: [0, -0.015 * s, 0.1 * s], rot: [PI / 2, 0, 0], color: BRONZE.bright });
}

/** A bronze ring worn at the neck. */
function torc(ctx: DressContext, s: number): void {
  ctx.on('spine').cyl(0.075 * s, 0.075 * s, 0.024 * s, 8, { at: [0, ctx.p.spine + 0.025 * s, 0.015 * s], color: BRONZE.bright });
}

/**
 * A round bronze shield strapped to the left forearm: the rim, a raised ring
 * and the boss. Its face is turned to look forward and out to the left while
 * the arm is held up in the grunt's guard (IDLE: the forearm raised about
 * 0.95 rad), so the one it faces sees it, and it hangs tilted as the arm
 * drops in the walk.
 */
function roundShield(ctx: DressContext, s: number): void {
  // The face's normal, in the forearm's bind space.
  const n = new Vector3(0.55, -0.67, 0.48).normalize();
  const c = new Vector3(0.05 * s, -0.15 * s, 0.03 * s);
  const at = (k: number): Vec3 => [c.x + n.x * k, c.y + n.y * k, c.z + n.z * k];
  const rot = facing([n.x, n.y, n.z]);
  ctx
    .on('forearmL')
    .cyl(0.23 * s, 0.23 * s, 0.022 * s, 10, { at: at(0), rot, color: BRONZE.green, jitter: MOTTLE })
    .cyl(0.155 * s, 0.155 * s, 0.02 * s, 10, { at: at(0.014 * s), rot, color: BRONZE.greenPale, jitter: MOTTLE })
    .cyl(0.05 * s, 0.065 * s, 0.05 * s, 8, { at: at(0.032 * s), rot, color: BRONZE.bright });
}

/** A rotted wool cloak hanging down the back from the shoulders. */
function cloak(ctx: DressContext, s: number, color: number, len: number): void {
  const L = ctx.p.spine;
  ctx
    .on('spine')
    .box(ctx.p.shoulderW * 2 + 0.06 * s, 0.05 * s, 0.24 * s, { at: [0, L + 0.005 * s, -0.02 * s], color })
    .box(ctx.p.shoulderW * 2 - 0.02 * s, len, 0.03 * s, { at: [0, L - len / 2, -0.135 * s], rot: [0.05, 0, 0], color })
    .box(0.12 * s, 0.16 * s, 0.03 * s, { at: [-0.12 * s, L - len - 0.05 * s, -0.15 * s], rot: [0.05, 0, 0], color })
    .box(0.1 * s, 0.1 * s, 0.03 * s, { at: [0.14 * s, L - len - 0.03 * s, -0.15 * s], rot: [0.05, 0, 0], color });
}

// ---------------------------------------------------------------- weapons (hand space, along -Y)

/** The leaf-shaped bronze blade: widest two-thirds of the way down, a bright midrib, a cast hilt. */
function leafBlade(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.042, 0.03, 0.052, { at: [0, 0.03, 0], color: BRONZE.base })
    .box(0.03, 0.11, 0.032, { at: [0, -0.04, 0], color: PAL.leatherDark })
    .box(0.036, 0.03, 0.1, { at: [0, -0.105, 0], color: BRONZE.base, mask: 1 })
    .taper(0.016, 0.044, 0.014, 0.078, 0.42, { at: [0, -0.115, 0], rot: DOWN, color: BRONZE.green, mask: 1 })
    .taper(0.014, 0.078, 0.004, 0.008, 0.28, { at: [0, -0.535, 0], rot: DOWN, color: BRONZE.green, mask: 1 })
    .box(0.02, 0.6, 0.016, { at: [0, -0.43, 0], color: BRONZE.bright, mask: 1 });
  return { bone: 'handR', base: [0, -0.13, 0], tip: [0, -0.8, 0], radius: 0.04 };
}

/** A bronze axe on an ash haft: the bit flares to its edge on the cutting side (-Z). */
function bronzeAxe(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.035, 0.72, 0.035, { at: [0, -0.3, 0], color: PAL.wood })
    .box(0.04, 0.05, 0.04, { at: [0, -0.02, 0], color: PAL.leatherDark })
    .box(0.034, 0.16, 0.07, { at: [0, -0.56, -0.04], color: BRONZE.green, mask: 1 })
    .taper(0.026, 0.16, 0.008, 0.26, 0.13, { at: [0, -0.56, -0.07], rot: [-PI / 2, 0, 0], color: BRONZE.green, mask: 1 })
    .box(0.03, 0.26, 0.018, { at: [0, -0.56, -0.205], color: BRONZE.bright, mask: 1 })
    .box(0.05, 0.05, 0.05, { at: [0, -0.66, 0], color: BRONZE.greenDark, mask: 1 });
  return { bone: 'handR', base: [0, -0.3, 0], tip: [0, -0.68, -0.2], radius: 0.06 };
}

/** The champion's great axe: a long haft and a broad crescent of bronze, swung two-handed. */
function greatAxe(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .cyl(0.034, 0.038, 1.36, 6, { at: [0, -0.56, 0], color: PAL.woodDark })
    .box(0.05, 0.16, 0.05, { at: [0, -0.02, 0], color: PAL.leatherDark })
    .box(0.06, 0.05, 0.06, { at: [0, -0.5, 0], color: BRONZE.base })
    // The head: a socket round the haft, a neck, and the crescent flaring to its edge.
    .box(0.07, 0.26, 0.08, { at: [0, -1.1, -0.02], color: BRONZE.greenDark, mask: 1 })
    .taper(0.05, 0.22, 0.016, 0.46, 0.26, { at: [0, -1.1, -0.06], rot: [-PI / 2, 0, 0], color: BRONZE.green, mask: 1 })
    .box(0.03, 0.46, 0.03, { at: [0, -1.1, -0.32], color: BRONZE.bright, mask: 1 })
    .cone(0.04, 0.14, 4, { at: [0, -1.1, 0.1], rot: [PI / 2, 0, 0], color: BRONZE.base, mask: 1 })
    .box(0.05, 0.08, 0.05, { at: [0, -1.27, 0], color: BRONZE.base, mask: 1 });
  return { bone: 'handR', base: [0, -0.3, 0], tip: [0, -1.18, -0.24], radius: 0.13 };
}

/** The Thane's leaf greatsword: a long bronze leaf with the Deepkings' inlaid line glowing down it. */
function leafGreatsword(ctx: DressContext): WeaponSpec {
  const b = ctx.on('handR');
  b.ball(0.05, { at: [0, 0.08, 0], color: BRONZE.bright })
    .box(0.045, 0.3, 0.045, { at: [0, -0.07, 0], color: PAL.leatherDark })
    .box(0.06, 0.06, 0.34, { at: [0, -0.24, 0], color: BRONZE.base, mask: 1 })
    .taper(0.03, 0.08, 0.026, 0.16, 0.86, { at: [0, -0.27, 0], rot: DOWN, color: BRONZE.green, mask: 1 })
    .taper(0.026, 0.16, 0.006, 0.012, 0.54, { at: [0, -1.13, 0], rot: DOWN, color: BRONZE.green, mask: 1 })
    .box(0.034, 1.2, 0.024, { at: [0, -0.86, 0], color: BRONZE.bright, mask: 1 });
  // The inlay: short dashes of barrow light down the midrib.
  for (let i = 0; i < 5; i++) {
    b.box(0.038, 0.06, 0.016, { at: [0, -0.42 - i * 0.2, 0], color: BARROW_LIGHT, glow: 0.85, mask: 1, jitter: 0 });
  }
  return { bone: 'handR', base: [0, -0.3, 0], tip: [0, -1.66, 0], radius: 0.06 };
}

// ---------------------------------------------------------------- the barrow dead

/**
 * A grunt of the barrow dead, in four looks: a crested helm and a leaf blade
 * (0), a pointed helm and an axe (1), bare-skulled with a diadem, torc and
 * cloak (2), and a crested helm and axe with no shield (3).
 */
export function dressBarrowGrunt(ctx: DressContext, variant: number): WeaponSpec {
  const v = ((variant % 4) + 4) % 4;
  skeleton(ctx, look(1));
  loincloth(ctx, 1, v % 2 ? WOOL : WOOL_DARK, 0.3);
  beltDisc(ctx, 1);
  if (v === 1) conicalHelm(ctx, 1);
  else if (v === 2) diadem(ctx, 1);
  else crestedHelm(ctx, 1);
  if (v === 2) {
    torc(ctx, 1);
    cloak(ctx, 1, WOOL, 0.62);
  } else scaleShirt(ctx, 1);
  if (v !== 3) roundShield(ctx, 1);
  return v % 2 ? bronzeAxe(ctx) : leafBlade(ctx);
}

/** The barrow archer: a rotted moss-green hood and mantle, a bronze bracer, a bow tipped with bronze. */
export function dressBarrowArcher(ctx: DressContext): WeaponSpec {
  const s = 0.95;
  const L = ctx.p.spine;
  skeleton(ctx, look(s));
  loincloth(ctx, s, WOOL, 0.28);
  beltDisc(ctx, s);
  ctx
    .on('head')
    .taper(0.24, 0.25, 0.14, 0.16, 0.2, { at: [0, 0.08, -0.03], color: MOSS })
    .box(0.24, 0.12, 0.05, { at: [0, 0.13, -0.12], color: MOSS })
    .cone(0.06, 0.12, 4, { at: [0, 0.3, -0.07], rot: [-0.5, 0, 0], color: MOSS });
  ctx
    .on('spine')
    .taper(0.34, 0.24, 0.3, 0.2, 0.12, { at: [0, L - 0.08, 0], color: MOSS })
    .box(0.05, 0.05, 0.03, { at: [0.08, L - 0.02, 0.11], color: BRONZE.bright })
    // A quiver of bark and leather across the back, fletching over the right shoulder.
    .cyl(0.05, 0.045, 0.42, 6, { at: [-0.06, L - 0.2, -0.14], rot: [0, 0, -0.35], color: PAL.leather })
    .box(0.03, 0.1, 0.03, { at: [-0.14, L + 0.04, -0.14], rot: [0, 0, -0.35], color: WOOL_DARK })
    .box(0.03, 0.1, 0.03, { at: [-0.1, L + 0.05, -0.15], rot: [0, 0, -0.3], color: BONE_SHADE });
  // A bronze guard on the bow arm.
  ctx.on('forearmL').taper(0.06, 0.06, 0.07, 0.07, 0.14, { at: [0, -0.21, 0], color: BRONZE.green });
  return bow(ctx, { tips: BRONZE.bright, string: BONE_SHADE });
}

/**
 * The barrow's champion, as the brute: a big-boned skeleton hunched under a
 * scale coat and a crested helm, swinging a bronze great axe two-handed.
 */
export function dressBarrowBrute(ctx: DressContext): WeaponSpec {
  const s = 1.6;
  skeleton(ctx, look(s));
  loincloth(ctx, s * 0.9, WOOL_DARK, 0.42);
  beltDisc(ctx, s * 0.95);
  crestedHelm(ctx, s);
  scaleShirt(ctx, s * 0.9, true);
  pauldrons(ctx, s * 0.95);
  torc(ctx, s);
  // Bronze greaves and a bracer on each arm: grave goods for a champion.
  for (const side of ['L', 'R'] as const) {
    ctx.on(`forearm${side}`).taper(0.1, 0.1, 0.12, 0.12, 0.22, { at: [0, -ctx.p.forearm + 0.02, 0], color: BRONZE.green });
    ctx.on(`shin${side}`).taper(0.12, 0.13, 0.13, 0.14, 0.34, { at: [0, -ctx.p.shin + 0.06, 0.02], color: BRONZE.green });
  }
  return greatAxe(ctx);
}

/**
 * The Barrow Thane, the war-leader laid under Hollowhill to guard the seal:
 * at the Warden's size, in a bronze crown-helm and a long scale coat, a
 * heather cloak, broken binding chains hanging from his wrists, and the leaf
 * greatsword.
 */
export function dressBarrowThane(ctx: DressContext): WeaponSpec {
  const s = 1.45;
  const L = ctx.p.spine;
  skeleton(ctx, look(s));
  crestedHelm(ctx, s, true);
  scaleShirt(ctx, s, true);
  pauldrons(ctx, s);
  torc(ctx, s);
  // A collar of bronze across the shoulders, and the cloak behind.
  ctx
    .on('spine')
    .box(0.6, 0.05, 0.36, { at: [0, L - 0.02, 0.02], color: BRONZE.bright })
    .box(0.62, 1.25, 0.03, { at: [0, L - 0.64, -0.25], rot: [0.08, 0, 0], color: HEATHER })
    .box(0.18, 0.2, 0.03, { at: [-0.2, L - 1.36, -0.31], rot: [0.08, 0, 0], color: HEATHER })
    .box(0.12, 0.14, 0.03, { at: [0.18, L - 1.33, -0.31], rot: [0.08, 0, 0], color: HEATHER });
  ctx
    .on('hips')
    .box(0.46, 0.08, 0.3, { at: [0, 0.0, 0], color: PAL.leatherDark })
    .cyl(0.07, 0.07, 0.02, 8, { at: [0, 0.0, 0.155], rot: [PI / 2, 0, 0], color: BRONZE.bright });
  for (const side of ['L', 'R'] as const) {
    const x = side === 'L' ? 1 : -1;
    const FA = ctx.p.forearm;
    // A bracer, the iron cuff of a binding chain over it, and three links hanging from it.
    const f = ctx.on(`forearm${side}`);
    f.taper(0.12, 0.12, 0.14, 0.13, 0.24, { at: [0, -FA + 0.02, 0], color: BRONZE.green })
      .box(0.17, 0.06, 0.16, { at: [0, -FA + 0.07, 0], color: PAL.ironDark });
    for (let i = 0; i < 3; i++) {
      f.box(i % 2 ? 0.016 : 0.05, 0.08, i % 2 ? 0.05 : 0.016, { at: [0.07 * x, -FA + 0.02 - i * 0.07, -0.04], color: PAL.iron });
    }
    ctx.on(`shin${side}`).taper(0.13, 0.15, 0.14, 0.16, 0.38, { at: [0, -0.5, 0.02], color: BRONZE.green });
  }
  return leafGreatsword(ctx);
}
