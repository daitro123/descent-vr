import { boltCase, crossbow } from './bailiffs';
import type { FamilyDef, NamedFighter, WeaponSpec } from './characters';
import { chestZ } from './guards';
import { apron, BUILDS, type BuildName, body, cuffs, HUE, head, hood, type Look, rolledSleeves, sash, shade } from './human';
import type { Vec3 } from './kit';
import { beltLantern, handLantern } from './lantern';
import type { Person } from './people';
import { PAL } from './palette';
import type { DressContext, Pose } from './rig';

// The smugglers, an enemy family in the human body (human.ts), in two looks
// that never mix in one camp, so each is a family of its own here:
//
// - The Lantern Men of the Sallows, named for the fen tale of the lights
//   that lead travellers to drown: tarred leather coats and fen boots, hats,
//   and a shuttered lantern at every belt glowing amber. Their men fight as
//   grunts with a cutlass or a boat hook, their crossbowmen as archers, their
//   dredgers as brutes with a long dredging hook or a wooden beetle. Their
//   leaders wear a woad-blue sash stolen from Reedholm, and Captain Silas
//   Crake, the Lantern Master, carries his lantern in his hand.
// - The Undergate of Aldhaven's cellars: patched black hoods and no colours,
//   long knives and crossbows.
//
// Both have a calm, unarmed look for villagers who are smugglers in all but
// name (Hask's man Gil Tarr in Reedholm, Cass by the Drowned Lamp). No red at
// the face or waist (a bandit's). The Lantern Men's crossbowmen wear the green
// hood of every archer; the Undergate's wear no colours at all, so their
// crossbow marks them, as it does Corvane's bailiffs'. Woad blue never sits
// with gold.

const PI = Math.PI;
const DOWN: Vec3 = [PI, 0, 0]; // taper parts grow along +Y; this flips them down a limb

/** Tarred leather, nearly black, and its worn edges, turned cuffs and collars. */
const TAR = 0x2e2824;
const TAR_WORN = 0x433a30;
/** Sailcloth slops and canvas trousers. */
const CANVAS = 0x6e6852;
const CANVAS_DARK = 0x4e4a3c;
/** Knitted wool caps and scarves: undyed, and dyed a dull sedge green. */
const KNIT = 0x6a6050;
const SEDGE = 0x56603e;
/** Reedholm's woad (maps/sallows/palette.ts), on the Lantern Men's leaders. */
export const WOAD = 0x3c6a85;
/** The Undergate's blacks, and the cloth they're patched with. */
const BLACK = 0x221f22;
const BLACK_WORN = 0x343034;
const PATCH = 0x4a4238;
const PATCH_GREY = 0x56524c;

const thick = (l: Look) => BUILDS[l.build].thickness;

// ---------------------------------------------------------------- clothes

/**
 * A tarred leather coat: the look's shirt is its body and sleeves, open at
 * the throat over the linen, with its collar turned up, cuffs turned back and
 * skirts to `len` below the belt, split front and back so the legs can move.
 */
function tarredCoat(ctx: DressContext, l: Look, len: number, opts: { color?: number; facing?: number; throat?: number } = {}): void {
  const k = thick(l);
  const L = ctx.p.spine;
  const color = opts.color ?? TAR;
  const facing = opts.facing ?? TAR_WORN;
  const zf = chestZ(l);
  ctx
    .on('spine')
    .box(0.085 * k, L * 0.36, 0.012, { at: [0, L * 0.8, zf - 0.004], color: opts.throat ?? HUE.linenDark })
    .box(0.3 * k, 0.1, 0.045, { at: [0, L + 0.02, -0.1 * k], rot: [-0.3, 0, 0], color: facing });
  const top = 0.06;
  const h = len + top;
  const y = top - h / 2;
  const zs = (0.13 + BUILDS[l.build].belly * 0.6) * k;
  ctx
    .on('hips')
    .box(0.17 * k, h, 0.03, { at: [-0.095 * k, y, zs], rot: [-0.07, 0, 0], color })
    .box(0.17 * k, h, 0.03, { at: [0.095 * k, y, zs], rot: [-0.07, 0, 0], color })
    .box(0.36 * k, h, 0.03, { at: [0, y, -0.13 * k], rot: [0.07, 0, 0], color });
  cuffs(ctx, l, facing, 0.09);
}

/** Fen boots to the knee, tarred, over the trousers. */
function fenBoots(ctx: DressContext, l: Look, color: number): void {
  const k = thick(l);
  const SH = ctx.p.shin;
  for (const side of ['L', 'R'] as const) {
    ctx.on(`shin${side}`).taper(0.11 * k, 0.12 * k, 0.135 * k, 0.145 * k, SH - 0.22, { at: [0, -SH + 0.2, 0], color });
  }
}

/** A scarf wound round the neck. */
function scarf(ctx: DressContext, l: Look, color: number): void {
  const k = thick(l);
  ctx.on('spine').taper(0.27 * k, 0.22 * k, 0.17 * k, 0.16 * k, 0.08, { at: [0, ctx.p.spine - 0.04, 0.005], color, jitter: 0.1 });
}

/** A hood thrown back: its cowl round the shoulders and the hood itself lying on the back. */
function cowl(ctx: DressContext, l: Look, color: number): void {
  const k = thick(l);
  const L = ctx.p.spine;
  ctx
    .on('spine')
    .taper(0.44 * k, 0.28 * k, 0.28 * k, 0.22 * k, 0.12, { at: [0, L - 0.07, -0.005], color })
    .box(0.22 * k, 0.2, 0.06, { at: [0, L - 0.1, -0.15 * k], rot: [0.15, 0, 0], color: shade(color, 0.85) });
}

// ---------------------------------------------------------------- hats

/** A wide-brimmed slouch hat, the brim low over the eyes, with a band. */
function slouchHat(ctx: DressContext, color: number, band: number): void {
  ctx
    .on('head')
    .cyl(0.18, 0.18, 0.016, 8, { at: [0, 0.238, 0.01], rot: [0.1, 0, 0], color: shade(color, 0.9) })
    .taper(0.2, 0.22, 0.15, 0.17, 0.11, { at: [0, 0.24, -0.005], color })
    .taper(0.205, 0.225, 0.195, 0.215, 0.03, { at: [0, 0.245, -0.005], color: band });
}

/** A knitted wool cap pulled down over the ears, its brim rolled. */
function knitCap(ctx: DressContext, color: number): void {
  ctx
    .on('head')
    .taper(0.205, 0.225, 0.15, 0.17, 0.11, { at: [0, 0.2, -0.012], color, jitter: 0.12 })
    .box(0.214, 0.04, 0.234, { at: [0, 0.215, -0.012], color: shade(color, 0.82) });
}

/** A sailor's round hat, tarred against the wet: a low crown and a narrow brim. */
function roundHat(ctx: DressContext, color: number): void {
  ctx
    .on('head')
    .cyl(0.15, 0.15, 0.014, 8, { at: [0, 0.236, -0.005], color: shade(color, 0.85) })
    .taper(0.2, 0.22, 0.185, 0.205, 0.085, { at: [0, 0.236, -0.005], color });
}

/**
 * A tricorn: a low crown with its brim cocked up on three sides into a
 * triangle, the point to the front. Each flap leans out and is longer at its
 * top than its foot, so the corners stand up in points; its top edge is bound
 * in pale cord.
 */
function tricorn(ctx: DressContext, color: number, cord: number): void {
  const h = ctx.on('head');
  h.taper(0.2, 0.22, 0.175, 0.195, 0.11, { at: [0, 0.232, -0.015], color: shade(color, 1.15) });
  const back = -0.14;
  const corners: [number, number][] = [
    [0.2, back],
    [0, 0.21],
    [-0.2, back],
  ];
  const tall = 0.1;
  const foot = 0.222;
  for (let i = 0; i < 3; i++) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 3];
    const len = Math.hypot(bx - ax, bz - az);
    // A board along its own Z, rolled about that length so its top leans out by `lean`, then turned to run from corner to corner.
    const yaw = Math.atan2(bx - ax, bz - az);
    const lean = -0.42;
    const mid: Vec3 = [(ax + bx) / 2, foot, (az + bz) / 2];
    h.taper(0.024, len * 0.78, 0.024, len + 0.04, tall, { at: mid, rot: [0, yaw, lean], color });
    // The cord along its top edge, leant out as far.
    const out = Math.sin(-lean) * tall;
    const nx = Math.cos(yaw) * out;
    const nz = -Math.sin(yaw) * out;
    h.box(0.03, 0.016, len + 0.045, { at: [mid[0] + nx, foot + tall * Math.cos(lean), mid[2] + nz], rot: [0, yaw, lean], color: cord, jitter: 0 });
  }
}

// ---------------------------------------------------------------- what they hold (right hand, along -Y, the striking side to -Z)

/** A cutlass: a short, broad, curved blade, its knuckle bow over the edge side. `reach` lengthens the blade (Crake's). */
function cutlass(ctx: DressContext, guard: number = PAL.iron, reach = 1): WeaponSpec {
  const a = 0.44 * reach;
  const b = 0.24 * reach;
  ctx
    .on('handR')
    .box(0.034, 0.03, 0.034, { at: [0, 0.02, 0], color: guard })
    .box(0.03, 0.11, 0.03, { at: [0, -0.045, 0], color: PAL.leatherDark })
    .box(0.032, 0.03, 0.13, { at: [0, -0.112, 0.01], color: guard, mask: 1 })
    .bar([0, -0.115, -0.055], [0, 0.015, -0.035], 0.016, 0.016, { color: guard, jitter: 0 })
    .taper(0.012, 0.042, 0.009, 0.055, a, { at: [0, -0.125, 0], rot: DOWN, color: PAL.steel, mask: 1 })
    .taper(0.009, 0.055, 0.004, 0.018, b, { at: [0, -0.125 - a, 0.004], rot: [PI - 0.2, 0, 0], color: PAL.steel, mask: 1 });
  return { bone: 'handR', base: [0, -0.15, 0], tip: [0, -0.13 - a - b, 0], radius: 0.04 };
}

/** A boat hook: an ash pole a metre long, an iron spike at its end and a hook curling back from it on the striking side. */
function boatHook(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.034, 0.12, 0.034, { at: [0, -0.04, 0], color: PAL.leatherDark })
    .box(0.03, 1.0, 0.03, { at: [0, -0.4, 0], color: PAL.wood })
    .box(0.04, 0.1, 0.04, { at: [0, -0.92, 0], color: PAL.ironDark, mask: 1 })
    .taper(0.03, 0.03, 0.006, 0.006, 0.12, { at: [0, -0.97, 0], rot: DOWN, color: PAL.iron, mask: 1 })
    .bar([0, -0.94, -0.01], [0, -1.0, -0.08], 0.022, 0.022, { color: PAL.iron, mask: 1 })
    .bar([0, -1.0, -0.08], [0, -0.93, -0.12], 0.02, 0.02, { color: PAL.iron, mask: 1 });
  return { bone: 'handR', base: [0, -0.3, 0], tip: [0, -1.02, -0.06], radius: 0.05 };
}

/** The dredger's hook: a long pole, held two-handed at its end, with a heavy iron hook to drag the channels' bottoms. */
function dredgingHook(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.045, 0.16, 0.045, { at: [0, -0.04, 0], color: PAL.leatherDark })
    .box(0.04, 1.42, 0.04, { at: [0, -0.62, 0], color: PAL.woodDark })
    .box(0.055, 0.12, 0.055, { at: [0, -1.33, 0], color: PAL.ironDark, mask: 1 })
    .bar([0, -1.36, -0.01], [0, -1.46, -0.11], 0.04, 0.035, { color: PAL.ironDark, mask: 1 })
    .bar([0, -1.46, -0.11], [0, -1.37, -0.21], 0.035, 0.03, { color: PAL.ironDark, mask: 1 })
    .taper(0.03, 0.03, 0.006, 0.006, 0.1, { at: [0, -1.37, -0.21], rot: [0.5, 0, 0], color: PAL.iron, mask: 1 });
  return { bone: 'handR', base: [0, -0.3, 0], tip: [0, -1.44, -0.14], radius: 0.08 };
}

/** A beetle: a heavy wooden mallet for driving piles, its head bound in iron at each end. */
function beetle(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.045, 0.16, 0.045, { at: [0, -0.04, 0], color: PAL.leatherDark })
    .box(0.042, 0.98, 0.042, { at: [0, -0.45, 0], color: PAL.wood })
    .box(0.2, 0.2, 0.36, { at: [0, -1.0, 0], color: PAL.woodDark, mask: 1 })
    .box(0.215, 0.215, 0.035, { at: [0, -1.0, 0.15], color: PAL.ironDark, mask: 1 })
    .box(0.215, 0.215, 0.035, { at: [0, -1.0, -0.15], color: PAL.ironDark, mask: 1 });
  return { bone: 'handR', base: [0, -0.2, 0], tip: [0, -1.08, 0], radius: 0.14 };
}

/** A boarding axe: a long haft, a bearded bit on the striking side and a spike behind. */
function boardingAxe(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.042, 0.16, 0.042, { at: [0, -0.04, 0], color: PAL.leatherDark })
    .box(0.036, 1.12, 0.036, { at: [0, -0.48, 0], color: PAL.woodDark })
    .box(0.046, 0.14, 0.08, { at: [0, -0.98, -0.05], color: PAL.ironDark, mask: 1 })
    .taper(0.03, 0.14, 0.01, 0.3, 0.17, { at: [0, -0.99, -0.085], rot: [-PI / 2, 0, 0], color: PAL.steel, mask: 1 })
    .bar([0, -0.97, 0.02], [0, -0.99, 0.16], 0.026, 0.026, { color: PAL.ironDark, mask: 1 });
  return { bone: 'handR', base: [0, -0.3, 0], tip: [0, -1.08, -0.24], radius: 0.1 };
}

/** A long knife: a plain grip and a straight, single-edged blade most of a forearm long. */
function longKnife(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.03, 0.11, 0.03, { at: [0, -0.045, 0], color: PAL.woodDark })
    .box(0.03, 0.024, 0.07, { at: [0, -0.11, 0], color: PAL.iron, mask: 1 })
    .taper(0.012, 0.045, 0.008, 0.04, 0.5, { at: [0, -0.12, 0.002], rot: DOWN, color: PAL.steel, mask: 1 })
    .taper(0.008, 0.04, 0.004, 0.006, 0.12, { at: [0, -0.62, -0.002], rot: DOWN, color: PAL.steel, mask: 1 });
  return { bone: 'handR', base: [0, -0.14, 0], tip: [0, -0.74, 0], radius: 0.035 };
}

/** A knife sheathed at the right hip. */
function sheathedKnife(ctx: DressContext, l: Look): void {
  const x = -0.19 * thick(l);
  ctx.on('hips').box(0.03, 0.24, 0.05, { at: [x, -0.08, 0.06], rot: [0.15, 0, 0], color: PAL.leatherDark });
}

// ---------------------------------------------------------------- the Lantern Men

const MAN_BUILD: BuildName = 'average';

/** The Lantern Men's three faces, each in tarred coat, canvas or slops and fen boots. */
const LANTERN_FACES: Look[] = [
  {
    build: MAN_BUILD,
    skin: HUE.skinTan,
    hair: HUE.hairBlack,
    hairStyle: 'cropped',
    beard: 'stubble',
    shirt: TAR,
    forearm: TAR,
    hands: PAL.leatherDark,
    trousers: CANVAS,
    boots: TAR,
    belt: PAL.leatherDark,
  },
  {
    build: MAN_BUILD,
    skin: HUE.skinFair,
    hair: HUE.hairSandy,
    hairStyle: 'cropped',
    beard: 'moustache',
    shirt: TAR,
    forearm: TAR,
    hands: 'skin',
    trousers: CANVAS_DARK,
    boots: TAR,
    belt: PAL.leather,
  },
  {
    build: MAN_BUILD,
    skin: HUE.skinWarm,
    hair: HUE.hairGrey,
    hairStyle: 'cropped',
    beard: 'short',
    shirt: shade(TAR, 1.15),
    forearm: shade(TAR, 1.15),
    hands: PAL.leatherDark,
    trousers: CANVAS,
    boots: TAR,
    belt: PAL.leatherDark,
  },
];

/** The hats the Lantern Men wear: a slouch hat, a knitted cap, a sailor's round hat. */
const HATS: ((ctx: DressContext) => void)[] = [
  (ctx) => slouchHat(ctx, shade(TAR, 1.25), TAR_WORN),
  (ctx) => knitCap(ctx, KNIT),
  (ctx) => roundHat(ctx, TAR),
];

/** A Lantern Man: three faces, each with a cutlass or a boat hook, and the hats among them. */
function dressLanternMan(ctx: DressContext, variant: number): WeaponSpec {
  const v = ((variant % 6) + 6) % 6;
  const l = LANTERN_FACES[v % 3];
  body(ctx, l);
  head(ctx, l);
  tarredCoat(ctx, l, 0.42);
  fenBoots(ctx, l, TAR);
  scarf(ctx, l, v % 2 ? SEDGE : KNIT);
  HATS[(v + Math.floor(v / 3)) % 3](ctx);
  beltLantern(ctx, l);
  return v % 2 ? boatHook(ctx) : cutlass(ctx);
}

const CROSSBOW_LOOK: Look = { ...LANTERN_FACES[1], skin: HUE.skinWarm, hair: HUE.hairBrown, hairStyle: 'none', beard: 'stubble', hands: PAL.leatherDark };

/** A Lantern Men crossbowman: the green hood of every archer over the tarred coat, a case of bolts, the lantern. */
function dressLanternCrossbow(ctx: DressContext): WeaponSpec {
  const l = CROSSBOW_LOOK;
  body(ctx, l);
  head(ctx, l);
  tarredCoat(ctx, l, 0.4);
  fenBoots(ctx, l, TAR);
  hood(ctx, l, PAL.hood);
  boltCase(ctx);
  beltLantern(ctx, l);
  return crossbow(ctx);
}

/** The dredgers' two faces: big men in waders and a leather apron, sleeves rolled. */
const DREDGER_LOOKS: Look[] = [
  {
    build: 'big',
    skin: HUE.skinTan,
    hair: HUE.hairDark,
    hairStyle: 'cropped',
    beard: 'stubble',
    shirt: HUE.linenDark,
    forearm: 'skin',
    trousers: TAR,
    boots: TAR,
    belt: PAL.leatherDark,
  },
  {
    build: 'big',
    skin: HUE.skinFair,
    hair: HUE.hairRed,
    hairStyle: 'cropped',
    beard: 'full',
    shirt: CANVAS,
    forearm: 'skin',
    trousers: TAR,
    boots: TAR,
    belt: PAL.leatherDark,
  },
];

/** A dredger: waders, a leather bib apron, a knitted cap, and a long dredging hook or a beetle. */
function dressDredger(ctx: DressContext, variant: number): WeaponSpec {
  const v = ((variant % 2) + 2) % 2;
  const l = DREDGER_LOOKS[v];
  body(ctx, l);
  head(ctx, l);
  rolledSleeves(ctx, l, shade(l.shirt, 0.85));
  apron(ctx, l, PAL.leather, true, 0.6);
  knitCap(ctx, v ? SEDGE : KNIT);
  beltLantern(ctx, l);
  return v ? beetle(ctx) : dredgingHook(ctx);
}

const LEADER_LOOK: Look = {
  build: 'big',
  skin: HUE.skinWarm,
  hair: HUE.hairDark,
  hairStyle: 'cropped',
  beard: 'short',
  shirt: TAR,
  forearm: TAR,
  hands: PAL.leatherDark,
  trousers: CANVAS_DARK,
  boots: TAR,
  belt: PAL.leatherDark,
};

/** A Lantern Men leader (the Hythe's bosun, the Sluice House's mate): the woad sash wound over a long coat, a slouch hat, a boarding axe. */
function dressLanternLeader(ctx: DressContext): WeaponSpec {
  const l = LEADER_LOOK;
  body(ctx, l);
  head(ctx, l);
  tarredCoat(ctx, l, 0.56);
  fenBoots(ctx, l, TAR);
  sash(ctx, l, WOAD, 1.55);
  slouchHat(ctx, shade(TAR, 1.25), shade(WOAD, 0.8));
  beltLantern(ctx, l);
  return boardingAxe(ctx);
}

const CRAKE_LOOK: Look = {
  build: 'big',
  skin: HUE.skinFair,
  hair: HUE.hairGrey,
  hairStyle: 'none',
  beard: 'short',
  shirt: 0x272320,
  forearm: 0x272320,
  hands: PAL.leatherDark,
  trousers: CANVAS_DARK,
  boots: TAR,
  belt: PAL.leatherDark,
  buckle: PAL.iron,
};
/** The sea-green his greatcoat is faced with, and the dull brass of his lantern and hilt. */
const CRAKE_FACING = 0x2e4a40;
const BRASS = 0x8a7038;

/**
 * Captain Silas Crake, the Lantern Master: a tarred greatcoat to his shins,
 * faced in sea-green, a white stock, a tricorn bound in pale cord over grey
 * hair tied back, a heavy cutlass in his right hand and in his left the
 * Lantern Master's Lantern, lit.
 */
function dressCrake(ctx: DressContext): WeaponSpec {
  const l = CRAKE_LOOK;
  body(ctx, l);
  head(ctx, l);
  // His queue, under the hat.
  ctx.on('head').box(0.05, 0.16, 0.04, { at: [0, 0.14, -0.115], rot: [0.15, 0, 0], color: HUE.hairGrey });
  tarredCoat(ctx, l, 0.86, { color: 0x272320, facing: CRAKE_FACING, throat: HUE.apronWhite });
  fenBoots(ctx, l, TAR);
  tricorn(ctx, 0x1e1b1a, HUE.linen);
  handLantern(ctx, { frame: BRASS, lit: true, size: 1.15 });
  return cutlass(ctx, BRASS, 1.45);
}

// ---------------------------------------------------------------- the Undergate

/** The Undergate's faces: patched blacks, the hood up. */
const UNDERGATE_FACES: Look[] = [
  {
    build: 'average',
    skin: HUE.skinFair,
    hair: HUE.hairDark,
    hairStyle: 'none',
    beard: 'stubble',
    shirt: BLACK,
    sleeve: BLACK_WORN,
    forearm: BLACK,
    hands: 'skin',
    trousers: BLACK_WORN,
    boots: PAL.leatherDark,
    belt: PAL.leatherDark,
  },
  {
    build: 'average',
    skin: HUE.skinDark,
    hair: HUE.hairBlack,
    hairStyle: 'none',
    shirt: BLACK_WORN,
    sleeve: BLACK,
    forearm: PAL.leatherDark,
    hands: PAL.leatherDark,
    trousers: BLACK,
    boots: PAL.leatherDark,
    belt: PAL.leatherDark,
  },
  {
    build: 'average',
    skin: HUE.skinTan,
    hair: HUE.hairBrown,
    hairStyle: 'none',
    beard: 'moustache',
    shirt: BLACK,
    sleeve: BLACK,
    forearm: 'skin',
    hands: 'skin',
    trousers: BLACK_WORN,
    boots: PAL.woodDark,
    belt: PAL.leather,
  },
];

/** Patches on an Undergate coat: on a shoulder, the chest and a knee, in odd cloth. */
function patches(ctx: DressContext, l: Look, variant: number): void {
  const k = thick(l);
  const zf = chestZ(l) + 0.006;
  const c = variant % 2 ? PATCH : PATCH_GREY;
  ctx.on('spine').box(0.08 * k, 0.07, 0.012, { at: [(variant % 3) * 0.04 * k - 0.05 * k, ctx.p.spine * 0.45, zf], color: c, jitter: 0 });
  ctx.on(variant % 2 ? 'upperArmL' : 'upperArmR').box(0.11 * k, 0.08, 0.11 * k, { at: [0, -0.14, 0], color: variant % 2 ? PATCH_GREY : PATCH, jitter: 0 });
  ctx.on(variant % 2 ? 'thighR' : 'thighL').box(0.15 * k, 0.09, 0.03, { at: [0, -ctx.p.thigh * 0.75, 0.07 * k], color: c, jitter: 0 });
}

/** A cloth tied over the nose and mouth, leaving the eyes: its chin part on the jaw. */
function mask(ctx: DressContext, color: number): void {
  ctx.on('head').box(0.196, 0.075, 0.13, { at: [0, 0.088, 0.075], color, jitter: 0.08 });
  ctx.on('jaw').box(0.12, 0.05, 0.07, { at: [0, -0.002, 0.02], color, jitter: 0.08 });
}

/**
 * A cellar thief, patched blacks and a long knife: the black hood up (0), the
 * hood thrown back under a knit cap with a cloth over the face (1), or the
 * hood up over the cloth, nothing showing but the eyes (2).
 */
function dressUndergate(ctx: DressContext, variant: number): WeaponSpec {
  const v = ((variant % 3) + 3) % 3;
  const l = UNDERGATE_FACES[v];
  body(ctx, l);
  head(ctx, l);
  if (v === 1) {
    cowl(ctx, l, BLACK);
    knitCap(ctx, BLACK_WORN);
  } else {
    hood(ctx, l, BLACK);
  }
  if (v > 0) mask(ctx, v === 1 ? PATCH_GREY : BLACK_WORN);
  patches(ctx, l, v);
  return longKnife(ctx);
}

const UNDERGATE_CROSSBOW_LOOK: Look = { ...UNDERGATE_FACES[1], skin: HUE.skinWarm, beard: 'stubble' };

/** An Undergate crossbowman: the black hood and patched blacks, a case of bolts. The crossbow marks him an archer. */
function dressUndergateCrossbow(ctx: DressContext): WeaponSpec {
  const l = UNDERGATE_CROSSBOW_LOOK;
  body(ctx, l);
  head(ctx, l);
  hood(ctx, l, BLACK);
  patches(ctx, l, 4);
  boltCase(ctx);
  return crossbow(ctx);
}

// ---------------------------------------------------------------- the families

/** The Lantern Men's leaders and their captain: each stands where a camp names them, fighting as a brute. */
const LANTERN_NAMED: Record<string, NamedFighter> = {
  leader: { kind: 'brute', label: 'Lantern Men leader', looks: 1, proportions: BUILDS[LEADER_LOOK.build].proportions, dress: dressLanternLeader },
  crake: { kind: 'brute', label: 'Captain Silas Crake', looks: 1, proportions: BUILDS[CRAKE_LOOK.build].proportions, dress: dressCrake },
};

/** The build each Lantern Men fighter's body is made in. */
export const LANTERN_BUILDS = { grunt: MAN_BUILD, archer: CROSSBOW_LOOK.build, brute: DREDGER_LOOKS[0].build } as const;

/** The Lantern Men: cutlass and boat-hook men fight as grunts, crossbowmen as archers, dredgers as brutes. */
export const LANTERN_MEN: FamilyDef = {
  body: 'human',
  seed: 41,
  fights: {
    grunt: { label: 'Lantern Man', looks: 6, proportions: BUILDS[MAN_BUILD].proportions, dress: dressLanternMan },
    archer: { label: 'Lantern Men crossbowman', looks: 1, proportions: BUILDS[CROSSBOW_LOOK.build].proportions, dress: dressLanternCrossbow },
    brute: { label: 'Lantern Men dredger', looks: 2, proportions: BUILDS[DREDGER_LOOKS[0].build].proportions, dress: dressDredger },
  },
  named: LANTERN_NAMED,
};

/** The build each Undergate fighter's body is made in. */
export const UNDERGATE_BUILDS = { grunt: 'average', archer: UNDERGATE_CROSSBOW_LOOK.build } as const;

/** The Undergate's cellar thieves: knife men fight as grunts, crossbowmen as archers. They have no brute. */
export const UNDERGATE: FamilyDef = {
  body: 'human',
  seed: 47,
  fights: {
    grunt: { label: 'Undergate thief', looks: 3, proportions: BUILDS.average.proportions, dress: dressUndergate },
    archer: { label: 'Undergate crossbowman', looks: 1, proportions: BUILDS[UNDERGATE_CROSSBOW_LOOK.build].proportions, dress: dressUndergateCrossbow },
  },
};

// ---------------------------------------------------------------- the calm ones (villagers)

/** Thumbs hooked in the belt, weight on one foot: someone with nowhere to be. */
const THUMBS_IN_BELT: Pose = {
  spine: [-0.03, 0.05, 0],
  head: [-0.04, -0.12, 0],
  upperArmL: [0.18, 0.05, 0.33],
  forearmL: [-1.05, -0.55, 0],
  handL: [0.1, 0, 0.2],
  upperArmR: [0.18, -0.05, -0.33],
  forearmR: [-1.05, 0.55, 0],
  handR: [0.1, 0, -0.2],
  thighL: [-0.06, 0, 0.07],
  shinL: [0.08, 0, 0],
  thighR: [0.02, 0, -0.03],
};

/** Arms folded, leaning back a little, watching who passes. */
const ARMS_FOLDED: Pose = {
  spine: [-0.05, 0, 0],
  head: [-0.02, 0.15, 0],
  upperArmL: [-0.44, 0.01, 0.09],
  forearmL: [-1.53, -1.23, 0],
  upperArmR: [-0.42, 0.34, -0.25],
  forearmR: [-1.78, 0.95, 0],
  thighL: [-0.04, 0, 0.06],
  thighR: [0.06, 0, -0.05],
  shinR: [0.06, 0, 0],
};

const GIL_LOOK: Look = { ...LANTERN_FACES[0], skin: HUE.skinWarm, hair: HUE.hairDark, hairStyle: 'tied', beard: 'stubble' };

/** A Lantern Man by day: the tarred coat, bareheaded, the lantern at his belt dark, a knife sheathed. Gil Tarr, Hask's man. */
function dressLanternManAtEase(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  tarredCoat(ctx, l, 0.42);
  fenBoots(ctx, l, TAR);
  scarf(ctx, l, SEDGE);
  beltLantern(ctx, l, false);
  sheathedKnife(ctx, l);
}

const CASS_LOOK: Look = { ...UNDERGATE_FACES[2], skin: HUE.skinFair, hair: HUE.hairBlack, hairStyle: 'tied', beard: 'none' };

/** An Undergate fixer at ease: the black hood down on the shoulders, patched blacks, a knife sheathed. Cass, by the Drowned Lamp. */
function dressUndergateAtEase(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  cowl(ctx, l, BLACK);
  patches(ctx, l, 1);
  sheathedKnife(ctx, l);
}

/** The smugglers' calm looks, by their cast name (people/cast.ts): for villagers who are smugglers in all but name. */
export const SMUGGLERS = {
  lanternManAtEase: { label: 'Lantern Man at ease', look: GIL_LOOK, stand: THUMBS_IN_BELT, dress: dressLanternManAtEase, seed: 81 },
  undergateAtEase: { label: 'Undergate fixer', look: CASS_LOOK, stand: ARMS_FOLDED, dress: dressUndergateAtEase, seed: 82 },
} satisfies Record<string, Person>;
