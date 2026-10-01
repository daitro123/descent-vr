import { crossbow } from './bailiffs';
import type { FamilyDef, WeaponSpec } from './characters';
import { LIVERY } from './guards';
import { BUILDS, body, HUE, head, kerchief, type Look, sash, shade } from './human';
import { MOOR } from './moorBandits';
import { PAL } from './palette';
import type { Person } from './people';
import type { DressContext, Pose } from './rig';

// Diggers: the men House Corvane pays to dig into the Deepkings' graves. Two
// crews, one trade. The Red Kerchiefs' diggers (Brackenmoor's barrows, the
// old mine) are bandits stripped to dig, bare-armed and black with peat, with
// the gang's red at the face and waist, and fight as brutes with their picks.
// Corvane's own lamp crews (Aldhaven's Undercroft) are hired delvers: a
// miner's helmet with its lamp lit, grey with stone dust, the house's crimson
// armband and black key on the arm, never at the face or the waist. They
// fight as grunts with a pick, archers with a crossbow, and brutes with a
// sledge. The fallen ones are here too, for the dead by the open barrow.

const PI = Math.PI;

/** Peat and the mud of a dig, black-brown, and the grey dust of cut stone. */
const MUD = 0x2e241c;
const MUD_WET = 0x3c2e22;
const DUST = 0x8c867a;

const thick = (l: Look) => BUILDS[l.build].thickness;

// ---------------------------------------------------------------- what they dig with (in the hand, along -Y, its point to -Z)

/** The Kerchiefs' two-handed pick: a long ash haft, a heavy iron head with a point forward and a flat adze behind. */
function pick(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.042, 1.0, 0.042, { at: [0, -0.4, 0], color: MOOR.ash })
    .box(0.05, 0.12, 0.05, { at: [0, -0.02, 0], color: PAL.leatherDark })
    .box(0.07, 0.09, 0.12, { at: [0, -0.88, 0], color: PAL.ironDark, mask: 1 })
    .taper(0.06, 0.07, 0.012, 0.014, 0.36, { at: [0, -0.9, -0.05], rot: [-PI / 2 - 0.25, 0, 0], color: PAL.iron, mask: 1 })
    .taper(0.06, 0.06, 0.09, 0.02, 0.2, { at: [0, -0.88, 0.05], rot: [PI / 2 + 0.2, 0, 0], color: PAL.iron, mask: 1 });
  return { bone: 'handR', base: [0, -0.3, 0], tip: [0, -0.98, -0.38], radius: 0.08 };
}

/** A lamp man's one-handed pick: a short haft and a double-pointed head. */
function minersPick(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.034, 0.6, 0.034, { at: [0, -0.22, 0], color: PAL.wood })
    .box(0.04, 0.1, 0.04, { at: [0, -0.02, 0], color: PAL.leatherDark })
    .box(0.05, 0.06, 0.07, { at: [0, -0.52, 0], color: PAL.ironDark, mask: 1 })
    .taper(0.045, 0.05, 0.01, 0.01, 0.26, { at: [0, -0.53, -0.03], rot: [-PI / 2 - 0.2, 0, 0], color: PAL.iron, mask: 1 })
    .taper(0.045, 0.05, 0.01, 0.01, 0.2, { at: [0, -0.53, 0.03], rot: [PI / 2 + 0.2, 0, 0], color: PAL.iron, mask: 1 });
  return { bone: 'handR', base: [0, -0.15, 0], tip: [0, -0.6, -0.26], radius: 0.05 };
}

/** The lamp crews' sledge: a long haft and a block of iron for a head. */
function sledge(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.045, 1.08, 0.045, { at: [0, -0.44, 0], color: PAL.wood })
    .box(0.052, 0.14, 0.052, { at: [0, -0.02, 0], color: PAL.leatherDark })
    .box(0.16, 0.16, 0.3, { at: [0, -0.98, 0], color: PAL.ironDark, mask: 1 })
    .box(0.17, 0.04, 0.31, { at: [0, -0.91, 0], color: PAL.iron, mask: 1 });
  return { bone: 'handR', base: [0, -0.25, 0], tip: [0, -1.06, 0], radius: 0.14 };
}

// ---------------------------------------------------------------- the Kerchiefs' digger

const DIGGER_LOOK: Look = {
  build: 'big',
  skin: HUE.skinFair,
  hair: HUE.hairBrown,
  hairStyle: 'cropped',
  beard: 'full',
  shirt: MOOR.woolDark,
  sleeve: HUE.skinFair,
  forearm: 'skin',
  trousers: MOOR.wool,
  boots: MUD,
};

/** Peat to the knee and caked on the forearms, smeared on the shirt. */
function mud(ctx: DressContext, l: Look): void {
  const k = thick(l);
  const { forearm: FA, shin: SH, spine: L } = ctx.p;
  for (const side of ['L', 'R'] as const) {
    ctx.on(`forearm${side}`).taper(0.07 * k, 0.07 * k, 0.088 * k, 0.088 * k, FA * 0.5, { at: [0, -FA * 0.98, 0], color: MUD_WET, jitter: 0.25 });
    ctx.on(`shin${side}`).taper(0.1 * k, 0.11 * k, 0.122 * k, 0.132 * k, SH * 0.55, { at: [0, -SH + 0.2, 0], color: MUD, jitter: 0.25 });
  }
  ctx.on('spine').box(0.16 * k, 0.12, 0.02, { at: [-0.04 * k, L * 0.25, 0.125 * k], rot: [0, 0, 0.4], color: MUD_WET, jitter: 0.25 });
}

/**
 * A Kerchief digger: a big man in a sleeveless wool shirt, bare arms black
 * with peat to the elbow and his legs to the knee, a leather apron, the red
 * kerchief and sash, and a two-handed pick.
 */
function dressKerchiefDigger(ctx: DressContext, l: Look = DIGGER_LOOK, armed = true): WeaponSpec | null {
  const k = thick(l);
  body(ctx, l);
  head(ctx, l);
  mud(ctx, l);
  // A digger's leather apron, from the chest to the knee, scuffed dark.
  const L = ctx.p.spine;
  ctx.on('spine').box(0.28 * k, L * 0.6, 0.02, { at: [0, L * 0.32, 0.13 * k], color: PAL.leather, jitter: 0.12 });
  ctx.on('hips').box(0.32 * k, 0.48, 0.02, { at: [0, -0.2, 0.135 * k], rot: [0.06, 0, 0], color: PAL.leather, jitter: 0.12 });
  kerchief(ctx, HUE.banditRed);
  sash(ctx, l, HUE.banditRed);
  return armed ? pick(ctx) : null;
}

// ---------------------------------------------------------------- Corvane's lamp crews

/**
 * A miner's helmet: a rounded leather cap with an iron rim and a brim at the
 * back, and its lamp on the brow, lit. A dead man's lamp is out.
 */
function lampHelmet(ctx: DressContext, lit = true): void {
  ctx
    .on('head')
    .taper(0.215, 0.235, 0.15, 0.17, 0.11, { at: [0, 0.2, -0.008], color: PAL.leatherDark })
    .box(0.225, 0.03, 0.245, { at: [0, 0.205, -0.008], color: PAL.ironDark })
    .box(0.2, 0.025, 0.08, { at: [0, 0.2, -0.15], rot: [-0.25, 0, 0], color: PAL.leatherDark })
    // The lamp: a brass box on the brow, its window glowing.
    .box(0.06, 0.07, 0.05, { at: [0, 0.27, 0.12], color: PAL.gold })
    .box(0.042, 0.045, 0.02, { at: [0, 0.27, 0.148], color: lit ? PAL.flame : PAL.ironDark, glow: lit ? 1 : 0, jitter: 0 });
}

/** Corvane's crimson armband on the left arm, its black key on the outside. */
function keyArmband(ctx: DressContext, l: Look): void {
  const k = thick(l);
  const r = 0.112 * k;
  ctx
    .on('upperArmL')
    .taper(r, r, r + 0.004, r + 0.004, 0.08, { at: [0, -0.18, 0], color: LIVERY.corvane.field })
    .box(0.012, 0.06, 0.024, { at: [r / 2 + 0.004, -0.14, 0], color: LIVERY.corvane.badge, jitter: 0 });
}

/** A delver's harness: a leather jerkin over grey work wool, everything floured with stone dust, and leather knee pads. */
function delver(ctx: DressContext, l: Look, lit = true): void {
  const k = thick(l);
  const L = ctx.p.spine;
  const SH = ctx.p.shin;
  body(ctx, l);
  head(ctx, l);
  ctx
    .on('spine')
    .taper(0.33 * k, 0.225 * k, 0.42 * k, 0.26 * k, L * 0.66, { at: [0, -0.02, 0.005], color: PAL.leatherDark })
    .box(0.18 * k, 0.1, 0.02, { at: [0.05 * k, L * 0.45, 0.13 * k], rot: [0, 0, -0.3], color: DUST, jitter: 0.25 });
  ctx.on('hips').box((0.33 * k), 0.06, 0.245 * k, { at: [0, 0.03, 0.005], color: LIVERY.corvane.badge });
  for (const side of ['L', 'R'] as const) ctx.on(`shin${side}`).box(0.13 * k, 0.1, 0.06, { at: [0, -0.02, 0.06 * k], color: PAL.leather });
  ctx.on('thighL').box(0.15 * k, 0.12, 0.02, { at: [0, -ctx.p.thigh * 0.5, 0.08 * k], color: DUST, jitter: 0.25 });
  ctx.on('shinR').box(0.12 * k, 0.12, 0.02, { at: [0, -SH * 0.55, 0.063 * k], color: DUST, jitter: 0.25 });
  keyArmband(ctx, l);
  lampHelmet(ctx, lit);
}

const WORK = 0x4c4844;

/** Three faces among the lamp men with picks. */
const LAMP_FACES: Look[] = [
  { build: 'average', skin: HUE.skinTan, hair: HUE.hairBlack, hairStyle: 'none', beard: 'stubble', shirt: WORK, forearm: 'skin', hands: PAL.leatherDark, trousers: WORK, boots: PAL.leatherDark },
  { build: 'average', skin: HUE.skinFair, hair: HUE.hairSandy, hairStyle: 'none', beard: 'moustache', shirt: shade(WORK, 1.2), forearm: WORK, hands: 'skin', trousers: WORK, boots: PAL.woodDark },
  { build: 'average', skin: HUE.skinDark, hair: HUE.hairDark, hairStyle: 'none', beard: 'short', shirt: WORK, forearm: 'skin', hands: PAL.leatherDark, trousers: shade(WORK, 1.2), boots: PAL.leatherDark },
];

function dressLampPick(ctx: DressContext, variant: number): WeaponSpec {
  delver(ctx, LAMP_FACES[variant % LAMP_FACES.length]);
  return minersPick(ctx);
}

const LAMP_CROSSBOW_LOOK: Look = { ...LAMP_FACES[1], skin: HUE.skinWarm, hair: HUE.hairBrown, beard: 'none', hands: PAL.leatherDark };

function dressLampCrossbow(ctx: DressContext): WeaponSpec {
  delver(ctx, LAMP_CROSSBOW_LOOK);
  // A case of bolts at the right hip.
  ctx.on('hips').box(0.07, 0.24, 0.09, { at: [-0.2, -0.1, -0.02], rot: [0, 0, -0.08], color: PAL.leatherDark });
  return crossbow(ctx);
}

const LAMP_SLEDGE_LOOK: Look = { build: 'big', skin: HUE.skinWarm, hair: HUE.hairGrey, hairStyle: 'none', beard: 'full', shirt: WORK, sleeve: HUE.skinWarm, forearm: 'skin', hands: PAL.leatherDark, trousers: WORK, boots: PAL.leatherDark };

function dressLampSledge(ctx: DressContext): WeaponSpec {
  delver(ctx, LAMP_SLEDGE_LOOK);
  return sledge(ctx);
}

// ---------------------------------------------------------------- the families

/** The build each digger's body is made in. */
export const DIGGER_BUILDS = { brute: DIGGER_LOOK.build } as const;
export const LAMP_CREW_BUILDS = { grunt: LAMP_FACES[0].build, archer: LAMP_CROSSBOW_LOOK.build, brute: LAMP_SLEDGE_LOOK.build } as const;

/** The Red Kerchiefs' diggers: big men with picks, fighting as brutes beside the gang's thugs and archers (moorBandits.ts, bandits.ts). */
export const DIGGERS: FamilyDef = {
  body: 'human',
  seed: 51,
  fights: {
    brute: { label: 'Kerchief digger', looks: 1, proportions: BUILDS[DIGGER_BUILDS.brute].proportions, dress: (ctx) => dressKerchiefDigger(ctx)! },
  },
};

/** House Corvane's lamp crews: picks fight as grunts, crossbows as archers, the sledge as a brute. */
export const LAMP_CREWS: FamilyDef = {
  body: 'human',
  seed: 61,
  fights: {
    grunt: { label: 'Lamp crew pick', looks: 3, proportions: BUILDS[LAMP_CREW_BUILDS.grunt].proportions, dress: dressLampPick },
    archer: { label: 'Lamp crew crossbow', looks: 1, proportions: BUILDS[LAMP_CREW_BUILDS.archer].proportions, dress: dressLampCrossbow },
    brute: { label: 'Lamp crew sledge', looks: 1, proportions: BUILDS[LAMP_CREW_BUILDS.brute].proportions, dress: dressLampSledge },
  },
};

// ---------------------------------------------------------------- the fallen

/** How they'd stand, were they standing: no one sees it, they're placed `fallen`. */
const LIMP: Pose = { upperArmL: [0.04, 0, 0.1], upperArmR: [0.04, 0, -0.1] };

/**
 * The dead diggers, for a zone to place `fallen` (people/fallen.ts): a
 * Kerchief digger without his pick (it lies where he dropped it, or went on
 * into the barrow without him), and a lamp man, his lamp out.
 */
export const FALLEN_DIGGERS = {
  fallenDigger: {
    label: 'Fallen digger',
    look: { ...DIGGER_LOOK, skin: shade(HUE.skinFair, 0.82), hair: HUE.hairDark },
    stand: LIMP,
    dress: (ctx, l) => void dressKerchiefDigger(ctx, l, false),
    seed: 81,
  },
  fallenLampman: {
    label: 'Fallen lamp man',
    look: { ...LAMP_FACES[0], skin: shade(HUE.skinTan, 0.85) },
    stand: LIMP,
    dress: (ctx, l) => delver(ctx, l, false),
    seed: 82,
  },
} satisfies Record<string, Person>;
