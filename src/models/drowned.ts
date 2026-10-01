import { type EnemyKind, type FamilyDef, loincloth, skeleton, type SkeletonLook, type WeaponSpec } from './characters';
import { bow } from './bow';
import { type Look, skirt } from './human';
import type { ModelBuilder, Vec3 } from './kit';
import { PAL } from './palette';
import type { DressContext, Proportions } from './rig';

// The drowned: the dead of Vellmar, the Deepkings' river port under the
// Sallows, and of the fen graveyards the rising water reached. Skeletons on
// the undead's bones (characters.ts), stained peat brown and caked in mud to
// the knee, with weed hanging off them, mussels and barnacles on their
// shoulders, scraps of the Deepkings' green-black armour gone to rust, and
// marsh-light in their eyes. They fight as the undead do: grunts with what
// they drowned holding (a Deepking blade, an eel gaff, a cleaver), archers
// under rotten green hoods, a brute in a lock-warden's plate dragging an
// anchor, and the Drowned Reeve, the town's magistrate, with the Bone
// Warden's size and behaviour. The Old Lantern Man is the one the fen tale is
// named for.

/** Peat, weed, shell and the Deepkings' green-black metal: the drowned's colours, beside the Sallows' palette (maps/sallows/palette.ts). */
export const DROWNED_HUE = {
  /** Bone stained peat brown, three ways, each with its shade. */
  bones: [
    [0x9a8762, 0x6e5f44],
    [0x8c7a58, 0x625540],
    [0xa39070, 0x76664a],
  ],
  /** The Reeve's, older and darker. */
  reeve: [0x857452, 0x56492f],
  mud: 0x3e3626,
  mudWet: 0x2e281c,
  weed: 0x4e6234,
  weedDark: 0x34452a,
  weedPale: 0x76804a,
  shell: 0xcfc6ae,
  mussel: 0x2a2e3a,
  /** The Deepkings' metal: green-black, verdigris at the edges, rust where it's worn. */
  deep: 0x2e3a34,
  deepDark: 0x1f2824,
  verdigris: 0x5a8670,
  rust: 0x7a4a2c,
  rustDark: 0x4e3020,
  /** Rotten cloth, rotten leather and black waterlogged wood. */
  rag: [0x4a4636, 0x3a3a2c, 0x50442e],
  leather: 0x2e261c,
  wood: 0x3a3024,
  /** The Reeve's robes, red-brown gone to rust, and his chain's tarnished gold. */
  robe: 0x6a3a26,
  robeDark: 0x4a281a,
  gold: 0x9a7a3a,
  /** Marsh-light: the pale green glow in their eyes and in the Old Lantern Man's lantern. */
  eye: 0x96ffae,
  lantern: 0xc8ff7a,
} as const;

/** Their bones: grunts, the archer and the brute in the undead's. The Reeve stands as the Bone Warden does. */
export const DROWNED_PROPORTIONS: Record<EnemyKind, Proportions> = {
  grunt: { hipY: 0.92, hipW: 0.09, spine: 0.44, shoulderW: 0.19, neck: 0.48, upperArm: 0.28, forearm: 0.25, thigh: 0.43, shin: 0.43 },
  archer: { hipY: 0.9, hipW: 0.09, spine: 0.43, shoulderW: 0.18, neck: 0.47, upperArm: 0.27, forearm: 0.25, thigh: 0.42, shin: 0.42 },
  // A big skeleton, not stitched flesh: the undead brute's lengths with a skull to match.
  brute: { hipY: 1.02, hipW: 0.15, spine: 0.66, shoulderW: 0.36, neck: 0.66, upperArm: 0.42, forearm: 0.4, thigh: 0.48, shin: 0.5, head: 1.5, headZ: 0.1 },
  warden: { hipY: 1.36, hipW: 0.14, spine: 0.66, shoulderW: 0.31, neck: 0.72, upperArm: 0.42, forearm: 0.38, thigh: 0.64, shin: 0.62, head: 1.45 },
};

// ---------------------------------------------------------------- weed, shells and mud

/**
 * A strand of weed hanging from `at` (in the current bone's space), `len`
 * long, leaning by `tilt` (x, z).
 */
function weed(b: ModelBuilder, at: Vec3, len: number, tilt: readonly [number, number] = [0, 0], color: number = DROWNED_HUE.weed): void {
  const [x, y, z] = at;
  b.box(0.04, len, 0.01, { at: [x, y - len / 2, z], rot: [tilt[0], 0, tilt[1]], color, jitter: 0.14 });
}

/** A cluster of barnacles round `at`: little pale cones, `n` of them, within `r`. */
function barnacles(b: ModelBuilder, at: Vec3, n: number, r: number, k = 1): void {
  const [x, y, z] = at;
  for (let i = 0; i < n; i++) {
    const a = i * 2.4;
    const d = r * (0.35 + ((i * 0.37) % 0.65));
    b.cone(0.016 * k, 0.022 * k, 5, { at: [x + Math.cos(a) * d, y, z + Math.sin(a) * d], color: DROWNED_HUE.shell, jitter: 0.15 });
  }
}

/** Mussels in a clump at `at`: blue-black, long and narrow, lying every way. */
function mussels(b: ModelBuilder, at: Vec3, n: number, k = 1): void {
  const [x, y, z] = at;
  for (let i = 0; i < n; i++) {
    const a = i * 1.9;
    b.box(0.04 * k, 0.016 * k, 0.022 * k, { at: [x + Math.cos(a) * 0.025 * k, y + (i % 2) * 0.008 * k, z + Math.sin(a) * 0.025 * k], rot: [0, a, 0.3], color: DROWNED_HUE.mussel });
  }
}

/** Mud caked on the shins from the knee down, and over the feet: they stood in the river's bed a long time. */
function mudToTheKnee(ctx: DressContext, s: number): void {
  const SH = ctx.p.shin;
  for (const side of ['L', 'R'] as const) {
    ctx
      .on(`shin${side}`)
      .taper(0.075 * s, 0.075 * s, 0.056 * s, 0.056 * s, SH * 0.55, { at: [0, -SH * 0.98, 0], color: DROWNED_HUE.mud, jitter: 0.14 })
      .box(0.09 * s, 0.05 * s, 0.21 * s, { at: [0, -SH - 0.01 * s, 0.05 * s], color: DROWNED_HUE.mudWet });
  }
}

/** Their bones and eyes, stained with look `v`'s peat. */
function stained(v: number, s: number): SkeletonLook {
  const [bone, shade] = DROWNED_HUE.bones[v % DROWNED_HUE.bones.length];
  return { s, eye: DROWNED_HUE.eye, bone, shade };
}

// ---------------------------------------------------------------- what's on their heads

/** A Deepking helm: square, green-black, a verdigris brow band, cheek plates and a nose guard. */
function squareHelm(ctx: DressContext, s: number): void {
  const b = ctx.on('head');
  b.box(0.235 * s, 0.11 * s, 0.245 * s, { at: [0, 0.245 * s, -0.005 * s], color: DROWNED_HUE.deep })
    .box(0.2 * s, 0.03 * s, 0.21 * s, { at: [0, 0.31 * s, -0.005 * s], color: DROWNED_HUE.deepDark })
    .box(0.25 * s, 0.03 * s, 0.26 * s, { at: [0, 0.19 * s, -0.005 * s], color: DROWNED_HUE.verdigris })
    .box(0.025 * s, 0.1 * s, 0.13 * s, { at: [-0.12 * s, 0.13 * s, 0.02 * s], color: DROWNED_HUE.deep })
    .box(0.025 * s, 0.1 * s, 0.13 * s, { at: [0.12 * s, 0.13 * s, 0.02 * s], color: DROWNED_HUE.deep })
    .box(0.024 * s, 0.07 * s, 0.02 * s, { at: [0, 0.16 * s, 0.128 * s], color: DROWNED_HUE.rust });
  barnacles(b, [0.05 * s, 0.3 * s, -0.04 * s], 2, 0.05 * s, s);
  weed(b, [-0.11 * s, 0.25 * s, -0.08 * s], 0.24 * s, [0.1, 0.15]);
}

/** No helm: weed for hair, hanging over the skull's crown and down its back. */
function weedHair(ctx: DressContext, s: number): void {
  const b = ctx.on('head');
  b.box(0.17 * s, 0.025 * s, 0.17 * s, { at: [0, 0.285 * s, -0.01 * s], color: DROWNED_HUE.weedDark, jitter: 0.12 });
  weed(b, [-0.09 * s, 0.27 * s, -0.04 * s], 0.28 * s, [0, 0.14]);
  weed(b, [0.09 * s, 0.27 * s, -0.03 * s], 0.24 * s, [0, -0.14], DROWNED_HUE.weedPale);
  weed(b, [0, 0.28 * s, -0.1 * s], 0.34 * s, [-0.18, 0]);
  weed(b, [0.05 * s, 0.27 * s, 0.07 * s], 0.12 * s, [0.2, -0.1], DROWNED_HUE.weedPale);
}

/** A round cap rusted green-black, barnacled over its crown. */
function barnacleCap(ctx: DressContext, s: number): void {
  const b = ctx.on('head');
  b.cyl(0.09 * s, 0.125 * s, 0.09 * s, 8, { at: [0, 0.235 * s, 0], color: DROWNED_HUE.deep })
    .cyl(0.16 * s, 0.16 * s, 0.018 * s, 8, { at: [0, 0.19 * s, 0], color: DROWNED_HUE.rust });
  barnacles(b, [0, 0.285 * s, 0], 5, 0.07 * s, s);
  mussels(b, [0.1 * s, 0.205 * s, 0.05 * s], 3, s);
  weed(b, [0.12 * s, 0.19 * s, -0.06 * s], 0.2 * s, [0, -0.1]);
}

// ---------------------------------------------------------------- armour and shells

/** A square Deepking pauldron on the left shoulder, barnacled. */
function pauldron(ctx: DressContext, s: number): void {
  const b = ctx.on('upperArmL');
  b.box(0.15 * s, 0.045 * s, 0.17 * s, { at: [0.025 * s, 0.02 * s, 0], color: DROWNED_HUE.deep })
    .box(0.04 * s, 0.15 * s, 0.16 * s, { at: [0.075 * s, -0.06 * s, 0], color: DROWNED_HUE.deep })
    .box(0.042 * s, 0.025 * s, 0.165 * s, { at: [0.077 * s, -0.13 * s, 0], color: DROWNED_HUE.verdigris });
  barnacles(b, [0.03 * s, 0.045 * s, 0], 3, 0.06 * s, s);
}

/** Mussels and barnacles on the right shoulder, where weed has hold of it. */
function shellShoulder(ctx: DressContext, s: number): void {
  const b = ctx.on('upperArmR');
  mussels(b, [-0.02 * s, 0.035 * s, 0.01 * s], 3, s);
  barnacles(b, [0.01 * s, 0.04 * s, -0.03 * s], 2, 0.04 * s, s);
  weed(b, [-0.04 * s, 0.03 * s, -0.03 * s], 0.22 * s, [0.05, 0.12]);
}

/** A broken piece of breastplate over the ribs, hung askew. */
function brokenPlate(ctx: DressContext, s: number): void {
  const L = ctx.p.spine;
  ctx
    .on('spine')
    .box(0.24 * s, 0.17 * s, 0.03 * s, { at: [0.03 * s, L - 0.13 * s, 0.11 * s], rot: [0, 0, 0.14], color: DROWNED_HUE.deep })
    .box(0.24 * s, 0.025 * s, 0.032 * s, { at: [0.042 * s, L - 0.05 * s, 0.112 * s], rot: [0, 0, 0.14], color: DROWNED_HUE.verdigris })
    .box(0.07 * s, 0.07 * s, 0.034 * s, { at: [-0.04 * s, L - 0.17 * s, 0.112 * s], rot: [0, 0, 0.14], color: DROWNED_HUE.rust });
}

/** Weed hanging from the ribs, down over the pelvis. */
function weedOnRibs(ctx: DressContext, s: number, v: number): void {
  const L = ctx.p.spine;
  const b = ctx.on('spine');
  weed(b, [-0.07 * s, L - 0.06 * s, 0.1 * s], 0.36 * s, [0.05, 0.05]);
  if (v % 2) weed(b, [0.09 * s, L - 0.1 * s, 0.09 * s], 0.28 * s, [0.04, -0.06], DROWNED_HUE.weedPale);
  weed(b, [0.05 * s, L - 0.04 * s, -0.12 * s], 0.42 * s, [-0.05, 0]);
}

/** Look `v`'s bones, mud, weed and shells, the same on every drowned. */
function drownedBones(ctx: DressContext, v: number, s: number): void {
  skeleton(ctx, stained(v, s));
  mudToTheKnee(ctx, s);
  weedOnRibs(ctx, s, v);
  shellShoulder(ctx, s);
  loincloth(ctx, s, DROWNED_HUE.rag[v % DROWNED_HUE.rag.length], 0.28 * s);
}

// ---------------------------------------------------------------- weapons (hand space, along -Y, edge to -Z)

/** A Deepking blade: broad and square-ended, green-black, rust in patches, verdigris along the edge. */
function deepBlade(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .ball(0.024, { at: [0, 0.03, 0], color: DROWNED_HUE.deep })
    .box(0.03, 0.11, 0.03, { at: [0, -0.045, 0], color: DROWNED_HUE.leather })
    .box(0.034, 0.035, 0.16, { at: [0, -0.115, 0], color: DROWNED_HUE.deep, mask: 1 })
    .box(0.016, 0.6, 0.07, { at: [0, -0.43, 0], color: DROWNED_HUE.deep, mask: 1 })
    .box(0.012, 0.6, 0.012, { at: [0, -0.43, -0.036], color: DROWNED_HUE.verdigris, mask: 1 })
    .box(0.019, 0.12, 0.05, { at: [0, -0.3, 0.01], color: DROWNED_HUE.rust, mask: 1 })
    .box(0.019, 0.09, 0.04, { at: [0, -0.62, 0.014], color: DROWNED_HUE.rust, mask: 1 });
  return { bone: 'handR', base: [0, -0.13, 0], tip: [0, -0.76, 0], radius: 0.04 };
}

/** An eel gaff: a black ash haft and a rusted hook curling forward off its end. */
function gaff(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.032, 0.8, 0.032, { at: [0, -0.3, 0], color: DROWNED_HUE.wood })
    .box(0.04, 0.06, 0.04, { at: [0, -0.02, 0], color: DROWNED_HUE.rag[0] })
    .box(0.026, 0.12, 0.026, { at: [0, -0.74, 0], color: DROWNED_HUE.rustDark, mask: 1 })
    .bar([0, -0.79, 0], [0, -0.87, -0.06], 0.022, 0.022, { color: DROWNED_HUE.rust, mask: 1 })
    .bar([0, -0.87, -0.06], [0, -0.83, -0.13], 0.02, 0.02, { color: DROWNED_HUE.rust, mask: 1 })
    .bar([0, -0.83, -0.13], [0, -0.75, -0.14], 0.016, 0.016, { color: DROWNED_HUE.rust, mask: 1 });
  weed(ctx.builder, [0.02, -0.82, 0.01], 0.14, [0, 0.1]);
  return { bone: 'handR', base: [0, -0.3, 0], tip: [0, -0.86, -0.08], radius: 0.05 };
}

/** A Deepking cleaver: a short haft and a square green-black head, its edge rusted to a saw. */
function cleaver(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.034, 0.64, 0.034, { at: [0, -0.26, 0], color: DROWNED_HUE.wood })
    .box(0.04, 0.05, 0.04, { at: [0, -0.02, 0], color: DROWNED_HUE.rag[1] })
    .box(0.026, 0.22, 0.15, { at: [0, -0.5, -0.085], color: DROWNED_HUE.deep, mask: 1 })
    .box(0.028, 0.22, 0.03, { at: [0, -0.5, -0.17], color: DROWNED_HUE.rust, mask: 1 })
    .box(0.04, 0.06, 0.05, { at: [0, -0.62, 0], color: DROWNED_HUE.deep, mask: 1 });
  return { bone: 'handR', base: [0, -0.3, 0], tip: [0, -0.62, -0.18], radius: 0.06 };
}

/** The brute's anchor: an iron shank, a ring above the fist, and two flukes at its crown to slam with. */
function anchor(ctx: DressContext): WeaponSpec {
  const b = ctx.on('handR');
  b.cyl(0.036, 0.04, 1.14, 6, { at: [0, -0.46, 0], color: DROWNED_HUE.rustDark })
    .box(0.05, 0.14, 0.05, { at: [0, -0.02, 0], color: DROWNED_HUE.rag[2] })
    // The ring at the shank's head, over the fist.
    .box(0.03, 0.03, 0.2, { at: [0, 0.2, 0], color: DROWNED_HUE.rust })
    .box(0.03, 0.14, 0.03, { at: [0, 0.135, 0.085], color: DROWNED_HUE.rust })
    .box(0.03, 0.14, 0.03, { at: [0, 0.135, -0.085], color: DROWNED_HUE.rust })
    // The crown, the arms sweeping up to the flukes, and the flukes.
    .box(0.12, 0.12, 0.12, { at: [0, -1.04, 0], color: DROWNED_HUE.rustDark, mask: 1 });
  for (const z of [1, -1]) {
    b.bar([0, -1.06, 0.04 * z], [0, -0.9, 0.3 * z], 0.07, 0.07, { color: DROWNED_HUE.rust, mask: 1 })
      .taper(0.05, 0.16, 0.02, 0.02, 0.2, { at: [0, -0.92, 0.3 * z], rot: [z > 0 ? 0.5 : -0.5, 0, 0], color: DROWNED_HUE.rustDark, mask: 1 });
  }
  barnacles(b, [0, -0.98, 0.06], 4, 0.05);
  weed(b, [0.04, -0.95, 0], 0.26, [0, 0.12]);
  return { bone: 'handR', base: [0, -0.2, 0], tip: [0, -1.1, 0], radius: 0.16 };
}

/** The Reeve's rod of office: an iron rod as long as the Warden's greatsword, a square cage at its end with marsh-light in it. */
function rodOfOffice(ctx: DressContext): WeaponSpec {
  const b = ctx.on('handR');
  b.box(0.045, 0.16, 0.045, { at: [0, 0.06, 0], color: DROWNED_HUE.gold })
    .box(0.042, 0.2, 0.042, { at: [0, -0.06, 0], color: DROWNED_HUE.leather })
    .box(0.034, 1.24, 0.034, { at: [0, -0.78, 0], color: DROWNED_HUE.deep, mask: 1 })
    .box(0.06, 0.04, 0.06, { at: [0, -0.2, 0], color: DROWNED_HUE.gold, mask: 1 })
    .box(0.056, 0.04, 0.056, { at: [0, -0.8, 0], color: DROWNED_HUE.rust, mask: 1 })
    // The cage: four corner bars between two square plates, a glow inside.
    .box(0.15, 0.035, 0.15, { at: [0, -1.4, 0], color: DROWNED_HUE.deep, mask: 1 })
    .box(0.17, 0.04, 0.17, { at: [0, -1.64, 0], color: DROWNED_HUE.deep, mask: 1 })
    .box(0.06, 0.12, 0.06, { at: [0, -1.52, 0], color: DROWNED_HUE.lantern, glow: 1, jitter: 0 });
  for (const [x, z] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    b.box(0.022, 0.22, 0.022, { at: [0.06 * x, -1.52, 0.06 * z], color: DROWNED_HUE.verdigris, mask: 1 });
  }
  weed(b, [0.07, -1.42, 0.02], 0.3, [0, 0.08]);
  return { bone: 'handR', base: [0, -0.3, 0], tip: [0, -1.64, 0], radius: 0.07 };
}

/** A lantern on a short chain from the left fist, lit with marsh-light, hanging plumb while the arm is at rest (the grunt's idle). */
function marshLantern(ctx: DressContext): void {
  // The grunt's idle raises the left hand 0.95 rad forward (shoulder and elbow
  // together): hang the lantern back by as much, so it hangs straight down.
  const a = 0.95;
  const hang: Vec3 = [a, 0, 0];
  const [c, sn] = [Math.cos(a), Math.sin(a)];
  /** A point `down` m below the fist and `out` (x, z) off the lantern's middle, in the hand's space. */
  const at = (down: number, x = 0, z = 0): Vec3 => [x, -0.04 - down * c - z * sn, -down * sn + z * c];
  const b = ctx.on('handL');
  b.box(0.012, 0.12, 0.012, { at: at(0.07), rot: hang, color: DROWNED_HUE.rustDark })
    .box(0.12, 0.025, 0.12, { at: at(0.14), rot: hang, color: DROWNED_HUE.deep })
    .box(0.09, 0.14, 0.09, { at: at(0.225), rot: hang, color: DROWNED_HUE.lantern, glow: 1, jitter: 0 })
    .box(0.13, 0.03, 0.13, { at: at(0.31), rot: hang, color: DROWNED_HUE.deep });
  for (const [x, z] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    b.box(0.018, 0.16, 0.018, { at: at(0.225, 0.055 * x, 0.055 * z), rot: hang, color: DROWNED_HUE.rust });
  }
}

// ---------------------------------------------------------------- the drowned

/**
 * A grunt in six looks: a Deepking blade, an eel gaff or a cleaver; a square
 * helm, weed for hair or a barnacled cap; a broken breastplate on every
 * other one.
 */
function dressGrunt(ctx: DressContext, v: number): WeaponSpec {
  drownedBones(ctx, v, 1);
  pauldron(ctx, 1);
  [squareHelm, weedHair, barnacleCap][Math.floor(v / 2) % 3](ctx, 1);
  if (v % 2 === 0) brokenPlate(ctx, 1);
  return [deepBlade, gaff, cleaver][v % 3](ctx);
}

/** The archer: a rotten green hood and mantle (an archer of every family wears one), a warped bow strung with weed. */
function dressArcher(ctx: DressContext, v: number): WeaponSpec {
  const s = 0.95;
  drownedBones(ctx, v + 1, s);
  const L = ctx.p.spine;
  const head = ctx.on('head');
  head
    .taper(0.24, 0.25, 0.14, 0.16, 0.2, { at: [0, 0.08, -0.03], color: PAL.hood })
    .box(0.24, 0.12, 0.05, { at: [0, 0.13, -0.12], color: PAL.hood })
    .cone(0.06, 0.12, 4, { at: [0, 0.3, -0.07], rot: [-0.5, 0, 0], color: PAL.hood });
  weed(head, [0.1, 0.16, 0.02], 0.2, [0, -0.1]);
  weed(head, [-0.04, 0.18, -0.14], 0.3, [-0.12, 0], DROWNED_HUE.weedPale);
  ctx
    .on('spine')
    .taper(0.34, 0.24, 0.3, 0.2, 0.12, { at: [0, L - 0.08, 0], color: PAL.hood })
    .box(0.1, 0.16, 0.02, { at: [0.11, L - 0.16, 0.08], rot: [0.1, 0, 0.1], color: PAL.hood })
    .cyl(0.05, 0.045, 0.42, 6, { at: [-0.06, L - 0.2, -0.14], rot: [0, 0, -0.35], color: DROWNED_HUE.leather })
    .box(0.03, 0.1, 0.03, { at: [-0.14, L + 0.04, -0.14], rot: [0, 0, -0.35], color: DROWNED_HUE.rag[0] })
    .box(0.03, 0.1, 0.03, { at: [-0.1, L + 0.05, -0.15], rot: [0, 0, -0.3], color: DROWNED_HUE.weedPale });
  barnacles(ctx.on('spine'), [-0.05, L - 0.3, -0.18], 3, 0.03);
  return bow(ctx, { tips: DROWNED_HUE.bones[1][1], string: DROWNED_HUE.weedPale });
}

/** The brute: a big skeleton in a lock-warden's plate, square helm and pauldrons, dragging an anchor. */
function dressBrute(ctx: DressContext, v: number): WeaponSpec {
  const s = 1.5;
  const L = ctx.p.spine;
  drownedBones(ctx, v + 2, s);
  squareHelm(ctx, s);
  // The breastplate over the upper ribs (the lower ones bare), its verdigris band and ridge.
  const chest = ctx.on('spine');
  chest
    .taper(0.44, 0.3, 0.6, 0.38, 0.34, { at: [0, L - 0.4, 0.02], color: DROWNED_HUE.deep })
    .box(0.62, 0.04, 0.4, { at: [0, L - 0.05, 0.02], color: DROWNED_HUE.verdigris })
    .box(0.06, 0.3, 0.02, { at: [0, L - 0.22, 0.21], color: DROWNED_HUE.deepDark })
    .box(0.12, 0.1, 0.02, { at: [0.14, L - 0.3, 0.2], rot: [0, 0, 0.2], color: DROWNED_HUE.rust });
  mussels(chest, [-0.16, L - 0.12, 0.2], 4, 1.3);
  barnacles(chest, [0.12, L - 0.18, 0.2], 4, 0.06, 1.3);
  ctx
    .on('hips')
    .box(0.46, 0.12, 0.34, { at: [0, 0.0, 0], color: DROWNED_HUE.deep })
    .box(0.18, 0.3, 0.03, { at: [-0.1, -0.2, 0.17], rot: [-0.06, 0, 0.04], color: DROWNED_HUE.deep })
    .box(0.18, 0.26, 0.03, { at: [0.11, -0.18, 0.17], rot: [-0.06, 0, -0.06], color: DROWNED_HUE.rustDark });
  for (const side of ['L', 'R'] as const) {
    const x = side === 'L' ? 1 : -1;
    const arm = ctx.on(`upperArm${side}`);
    arm
      .box(0.26, 0.06, 0.28, { at: [0.03 * x, 0.03, 0], color: DROWNED_HUE.deep })
      .box(0.06, 0.2, 0.26, { at: [0.12 * x, -0.08, 0], color: DROWNED_HUE.deep })
      .box(0.065, 0.03, 0.27, { at: [0.122 * x, -0.18, 0], color: DROWNED_HUE.verdigris });
    barnacles(arm, [0.04 * x, 0.07, 0], 5, 0.09, 1.4);
    ctx.on(`forearm${side}`).box(0.12, 0.2, 0.12, { at: [0, -ctx.p.forearm * 0.62, 0], color: DROWNED_HUE.rustDark });
  }
  return anchor(ctx);
}

/** A look for the Reeve's robe: only its build counts, the big man's (skirt() sizes the robe from it). */
const ROBE_FIT: Look = { build: 'big', skin: 0, hair: 0, hairStyle: 'none', shirt: 0, trousers: 0, boots: 0 };

/**
 * The Drowned Reeve: the Bone Warden's size, a Deepking magistrate's robes
 * gone to rust, a tall square cap, a beard of weed, the chain of office
 * across his ribs and the rod of office in his fist.
 */
function dressReeve(ctx: DressContext): WeaponSpec {
  const s = 1.45;
  const L = ctx.p.spine;
  const [bone, shade] = DROWNED_HUE.reeve;
  skeleton(ctx, { s, eye: DROWNED_HUE.eye, bone, shade });
  // The robe from the waist to above the ankles, its hem black with mud.
  skirt(ctx, ROBE_FIT, DROWNED_HUE.robe, { hem: 0.16, flare: 0.14, border: DROWNED_HUE.mudWet });
  ctx
    .on('hips')
    .box(0.5, 0.07, 0.36, { at: [0, 0.06, 0.005], color: DROWNED_HUE.deep })
    .box(0.07, 0.6, 0.02, { at: [0, -0.3, 0.215], rot: [-0.06, 0, 0], color: DROWNED_HUE.deep })
    .box(0.03, 0.6, 0.022, { at: [0, -0.3, 0.218], rot: [-0.06, 0, 0], color: DROWNED_HUE.verdigris });
  // A mantle over the shoulders and a cape behind, ragged at the bottom; the ribs bare in front.
  const back = ctx.on('spine');
  back
    .taper(0.74, 0.38, 0.7, 0.34, 0.2, { at: [0, L - 0.16, -0.04], color: DROWNED_HUE.robeDark })
    .box(0.66, 1.0, 0.03, { at: [0, L - 0.62, -0.23], rot: [0.06, 0, 0], color: DROWNED_HUE.robe })
    .box(0.18, 0.2, 0.03, { at: [-0.22, L - 1.2, -0.27], rot: [0.06, 0, 0], color: DROWNED_HUE.robe })
    .box(0.14, 0.14, 0.03, { at: [0.2, L - 1.16, -0.27], rot: [0.06, 0, 0], color: DROWNED_HUE.robe })
    // The high square collar behind the skull.
    .box(0.42, 0.22, 0.05, { at: [0, L + 0.1, -0.15], rot: [-0.15, 0, 0], color: DROWNED_HUE.deep })
    .box(0.44, 0.035, 0.055, { at: [0, L + 0.21, -0.165], rot: [-0.15, 0, 0], color: DROWNED_HUE.verdigris });
  weed(back, [0.18, L + 0.02, -0.25], 0.6, [-0.04, 0]);
  weed(back, [-0.12, L, -0.25], 0.45, [-0.04, 0], DROWNED_HUE.weedPale);
  mussels(back, [0.3, L + 0.03, 0.02], 5, 1.4);
  barnacles(back, [-0.3, L + 0.04, 0.0], 6, 0.07, 1.4);
  // The chain of office, shoulder to sternum and back up, and its square medallion.
  const chain: Vec3[] = [
    [0.24, L + 0.02, 0.12],
    [0.15, L - 0.14, 0.2],
    [0.05, L - 0.26, 0.225],
  ];
  for (const x of [1, -1]) {
    for (let i = 0; i < chain.length - 1; i++) {
      const [a, c] = [chain[i], chain[i + 1]];
      back.bar([a[0] * x, a[1], a[2]], [c[0] * x, c[1], c[2]], 0.035, 0.025, { color: DROWNED_HUE.gold });
    }
  }
  back
    .box(0.15, 0.17, 0.03, { at: [0, L - 0.36, 0.235], color: DROWNED_HUE.gold })
    .box(0.1, 0.11, 0.034, { at: [0, L - 0.36, 0.24], color: DROWNED_HUE.verdigris })
    .box(0.04, 0.04, 0.02, { at: [0, L - 0.36, 0.26], color: DROWNED_HUE.eye, glow: 1, jitter: 0 });
  // Wide sleeves, the bony hands out of them.
  for (const side of ['L', 'R'] as const) {
    const UA = ctx.p.upperArm;
    const FA = ctx.p.forearm;
    ctx
      .on(`upperArm${side}`)
      .ball(0.1, { color: DROWNED_HUE.robeDark })
      .taper(0.15, 0.15, 0.17, 0.17, UA, { at: [0, -UA, 0], color: DROWNED_HUE.robe });
    ctx
      .on(`forearm${side}`)
      .taper(0.28, 0.24, 0.16, 0.16, FA * 0.9, { at: [0, -FA * 0.95, -0.02], color: DROWNED_HUE.robe })
      .taper(0.28, 0.24, 0.28, 0.24, 0.016, { at: [0, -FA * 0.95 - 0.008, -0.02], color: DROWNED_HUE.mudWet, jitter: 0 });
  }
  // The magistrate's cap: a verdigris band and a tall square crown, flaring to its top; weed over it and a beard of it.
  const cap = ctx.on('head');
  cap
    .box(0.31, 0.06, 0.32, { at: [0, 0.35, -0.005], color: DROWNED_HUE.verdigris })
    .taper(0.29, 0.3, 0.34, 0.35, 0.24, { at: [0, 0.37, -0.005], color: DROWNED_HUE.deep })
    .box(0.36, 0.03, 0.37, { at: [0, 0.625, -0.005], color: DROWNED_HUE.deepDark });
  barnacles(cap, [0.06, 0.645, 0.04], 5, 0.1, 1.3);
  weed(cap, [0.15, 0.6, 0.05], 0.36, [0, -0.08]);
  weed(cap, [-0.16, 0.58, -0.08], 0.42, [0.06, 0.08], DROWNED_HUE.weedPale);
  const jaw = ctx.on('jaw');
  for (const [x, len] of [
    [-0.05, 0.32],
    [0.0, 0.42],
    [0.06, 0.3],
  ] as const) {
    weed(jaw, [x, 0.0, 0.07], len, [0.12, 0], x === 0 ? DROWNED_HUE.weed : DROWNED_HUE.weedDark);
  }
  mudToTheKnee(ctx, s);
  return rodOfOffice(ctx);
}

/**
 * The Old Lantern Man, the drowned thing the fen tale is named for (a rare):
 * a grunt in a ragged hooded oilskin, its marsh-light lantern lit in its left
 * hand, an eel gaff in its right.
 */
function dressLanternMan(ctx: DressContext): WeaponSpec {
  drownedBones(ctx, 1, 1);
  const L = ctx.p.spine;
  const coat = 0x2a2a22;
  const head = ctx.on('head');
  head
    .taper(0.26, 0.27, 0.16, 0.18, 0.22, { at: [0, 0.08, -0.035], color: coat })
    .box(0.26, 0.14, 0.05, { at: [0, 0.14, -0.13], color: coat })
    .cone(0.07, 0.14, 4, { at: [0, 0.32, -0.08], rot: [-0.6, 0, 0], color: coat });
  weed(head, [0.11, 0.2, 0.06], 0.26, [0.05, -0.1]);
  weed(head, [-0.11, 0.2, 0.04], 0.2, [0.05, 0.1], DROWNED_HUE.weedPale);
  // The oilskin over its shoulders and down its back to the knee, in rags.
  const back = ctx.on('spine');
  back
    .taper(0.4, 0.28, 0.36, 0.24, 0.14, { at: [0, L - 0.1, -0.01], color: coat })
    .box(0.4, 0.8, 0.025, { at: [0, L - 0.48, -0.15], rot: [0.08, 0, 0], color: coat })
    .box(0.12, 0.18, 0.025, { at: [-0.12, L - 0.96, -0.19], rot: [0.08, 0, 0.1], color: coat })
    .box(0.1, 0.14, 0.025, { at: [0.1, L - 0.94, -0.19], rot: [0.08, 0, -0.1], color: coat })
    .box(0.12, 0.5, 0.025, { at: [0.17, L - 0.3, 0.06], rot: [0.05, 0, 0.12], color: coat })
    .box(0.12, 0.45, 0.025, { at: [-0.17, L - 0.28, 0.06], rot: [0.05, 0, -0.12], color: coat });
  weed(back, [0.0, L - 0.2, -0.17], 0.5, [-0.08, 0]);
  barnacles(back, [0.12, L + 0.0, -0.02], 4, 0.05);
  marshLantern(ctx);
  return gaff(ctx);
}

/**
 * The drowned: skeletons, so they rise and fall to pieces as the undead do,
 * but up out of the water where they lie in it. The Reeve is their Warden.
 */
export const DROWNED: FamilyDef = {
  body: 'skeleton',
  seed: 31,
  fights: {
    grunt: { label: 'Drowned', looks: 6, proportions: DROWNED_PROPORTIONS.grunt, dress: dressGrunt },
    archer: { label: 'Drowned archer', looks: 1, proportions: DROWNED_PROPORTIONS.archer, dress: dressArcher },
    brute: { label: 'Drowned lock-warden', looks: 1, proportions: DROWNED_PROPORTIONS.brute, dress: dressBrute },
    warden: { label: 'Drowned Reeve', looks: 1, proportions: DROWNED_PROPORTIONS.warden, dress: dressReeve, title: 'The Drowned Reeve' },
  },
  named: {
    /** The rare the fen tale is about: a drowned grunt with a lantern. */
    oldLanternMan: { kind: 'grunt', label: 'The Old Lantern Man', title: 'The Old Lantern Man', looks: 1, proportions: DROWNED_PROPORTIONS.grunt, dress: dressLanternMan },
  },
};
