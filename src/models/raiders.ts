import { bow } from './bow';
import type { FamilyDef, NamedFighter, WeaponSpec } from './characters';
import { apron, BUILDS, type BuildName, body, HUE, head, hood, type Look, quiver, shade } from './human';
import type { Vec3 } from './kit';
import { PAL } from './palette';
import type { DressContext } from './rig';

// The fen raiders: fen folk ruined by the rising water, turned on everyone, an
// enemy family in the human body (human.ts). Fen clothes gone ragged, reed
// cloaks, trousers rolled over bare, muddy legs, faces smeared grey with
// mud. They fight with the tools of the fen: the eel spear as grunts, the
// fowling bow as archers, the peat cutter's spade as brutes; Abel Thatch,
// the Cockle End headman, leads them with a long-handled reed slasher.
// Their mud is grey, never the bandits' red; their archers wear the green hood.

const PI = Math.PI;
const DOWN: Vec3 = [PI, 0, 0]; // taper parts grow along +Y; this flips them down a limb

/** The fen's colours, as its folk wear them (maps/sallows/palette.ts): peat, silt, sedge, reed. */
const PEAT = 0x4e4632;
const PEAT_DARK = 0x3e3828;
const SILT = 0x6a6048;
const SEDGE_WOOL = 0x5c6642;
const REED = 0xa89d62;
const REED_DARK = 0x8c8450;
/** Grey fen mud, dried on faces and legs. */
const MUD = 0x7a786c;
const MUD_DARK = 0x564c38;
/** Peeled ash, for the poles. */
const ASH = 0x8a7048;

const thick = (l: Look) => BUILDS[l.build].thickness;

// ---------------------------------------------------------------- what they wear

/** A cloak of reeds bound at the shoulders, its bundles hanging down the back to the thighs, ragged at the ends. */
function reedCloak(ctx: DressContext, l: Look, color: number = REED): void {
  const k = thick(l);
  const L = ctx.p.spine;
  const s = ctx.on('spine');
  s.taper(0.46 * k, 0.3 * k, 0.3 * k, 0.24 * k, 0.12, { at: [0, L - 0.07, -0.005], color: shade(color, 0.9), jitter: 0.15 });
  const bundles: [number, number, number][] = [
    [-0.13, 0.6, 0.07],
    [-0.045, 0.72, 0.02],
    [0.045, 0.66, -0.02],
    [0.13, 0.56, -0.07],
  ];
  for (const [x, len, roll] of bundles) {
    s.box(0.095 * k, len, 0.03, { at: [x * k, L - 0.03 - len / 2, -0.145 * k], rot: [0.07, 0, roll], color, jitter: 0.16 });
  }
}

/** Grey mud dried across the face: a cheek, the other cheek, the brow. */
function mudSmears(ctx: DressContext, variant: number): void {
  const flip = variant % 2 ? -1 : 1;
  ctx
    .on('head')
    .box(0.075, 0.024, 0.012, { at: [0.045 * flip, 0.112, 0.104], rot: [0, 0, 0.35 * flip], color: MUD, jitter: 0 })
    .box(0.035, 0.05, 0.012, { at: [-0.05 * flip, 0.1, 0.103], color: shade(MUD, 0.88), jitter: 0 })
    .box(0.11, 0.022, 0.012, { at: [0.01 * flip, 0.205, 0.1], rot: [0, 0, -0.12 * flip], color: MUD, jitter: 0 });
}

/** Trousers rolled to the knee over bare calves, grey with mud to the ankle. */
function rolledToTheKnee(ctx: DressContext, l: Look): void {
  const k = thick(l);
  const SH = ctx.p.shin;
  const calf = shade(l.skin, 0.82);
  for (const side of ['L', 'R'] as const) {
    ctx
      .on(`shin${side}`)
      .taper(0.098 * k, 0.108 * k, 0.12 * k, 0.13 * k, SH - 0.32, { at: [0, -SH + 0.24, 0], color: calf })
      .taper(0.13 * k, 0.14 * k, 0.135 * k, 0.145 * k, 0.07, { at: [0, -0.1, 0], color: shade(l.trousers, 0.9) });
  }
}

/** A conical hat of plaited rush. */
function rushHat(ctx: DressContext, color: number = REED): void {
  ctx.on('head').cone(0.19, 0.13, 8, { at: [0, 0.29, -0.005], color, jitter: 0.12 });
}

/** A felt hat gone shapeless with the wet, its brim drooping. */
function feltHat(ctx: DressContext, color: number): void {
  ctx
    .on('head')
    .cyl(0.165, 0.17, 0.018, 7, { at: [0, 0.236, 0.005], rot: [0.16, 0, 0.06], color: shade(color, 0.88) })
    .taper(0.2, 0.22, 0.16, 0.17, 0.1, { at: [0, 0.238, -0.005], rot: [0, 0, 0.08], color });
}

// ---------------------------------------------------------------- what they hold (right hand, along -Y, the striking side to -Z)

/**
 * An eel spear: an ash pole and an iron head of flat tines in a row along
 * the striking side's line, for pinning eels in the mud: four on a leister,
 * three on a gig.
 */
function eelSpear(ctx: DressContext, tines: 3 | 4): WeaponSpec {
  const spread = tines === 4 ? 0.047 : 0.045;
  const b = ctx
    .on('handR')
    .box(0.034, 0.12, 0.034, { at: [0, -0.04, 0], color: PAL.leatherDark })
    .box(0.03, 1.12, 0.03, { at: [0, -0.44, 0], color: ASH })
    .box(0.036, 0.024, spread * (tines - 1) + 0.03, { at: [0, -1.0, 0], color: PAL.ironDark, mask: 1 });
  for (let i = 0; i < tines; i++) {
    const z = (i - (tines - 1) / 2) * spread;
    b.taper(0.012, 0.014, 0.006, 0.006, 0.17, { at: [0, -1.01, z], rot: DOWN, color: PAL.iron, mask: 1 });
  }
  return { bone: 'handR', base: [0, -0.3, 0], tip: [0, -1.17, 0], radius: 0.07 };
}

/** A peat cutter's spade (a slane): a long ash shaft and a narrow iron blade with a wing along its striking edge. */
function peatSpade(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.045, 0.15, 0.045, { at: [0, -0.04, 0], color: PAL.leatherDark })
    .box(0.04, 1.06, 0.04, { at: [0, -0.43, 0], color: ASH })
    .box(0.05, 0.08, 0.05, { at: [0, -0.98, 0], color: PAL.ironDark, mask: 1 })
    .box(0.014, 0.34, 0.13, { at: [0, -1.18, 0], color: PAL.iron, mask: 1 })
    .box(0.075, 0.3, 0.014, { at: [0.035, -1.19, -0.062], color: PAL.iron, mask: 1 });
  return { bone: 'handR', base: [0, -0.3, 0], tip: [0, -1.34, 0], radius: 0.08 };
}

/** A reed slasher: a long-handled billhook, its hooked blade's edge on the striking side. */
function slasher(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.042, 0.15, 0.042, { at: [0, -0.04, 0], color: PAL.leatherDark })
    .box(0.034, 1.08, 0.034, { at: [0, -0.46, 0], color: ASH })
    .box(0.04, 0.07, 0.04, { at: [0, -1.02, 0], color: PAL.ironDark, mask: 1 })
    .box(0.012, 0.3, 0.075, { at: [0, -1.19, -0.022], color: PAL.iron, mask: 1 })
    .bar([0, -1.33, -0.02], [0, -1.39, -0.13], 0.012, 0.05, { color: PAL.iron, mask: 1 });
  return { bone: 'handR', base: [0, -0.3, 0], tip: [0, -1.35, -0.1], radius: 0.07 };
}

// ---------------------------------------------------------------- the raiders

const RAIDER_BUILD: BuildName = 'average';

/** The raiders' three faces, in what's left of fen clothes. */
const RAIDER_FACES: Look[] = [
  {
    build: RAIDER_BUILD,
    skin: HUE.skinFair,
    hair: HUE.hairBrown,
    hairStyle: 'long',
    beard: 'stubble',
    shirt: HUE.linenDark,
    forearm: 'skin',
    trousers: PEAT,
    boots: MUD_DARK,
    belt: PAL.leatherDark,
  },
  {
    build: RAIDER_BUILD,
    skin: HUE.skinTan,
    hair: HUE.hairBlack,
    hairStyle: 'short',
    beard: 'full',
    shirt: SILT,
    sleeve: SILT,
    forearm: 'skin',
    trousers: PEAT_DARK,
    boots: MUD_DARK,
    belt: PAL.leather,
  },
  {
    build: RAIDER_BUILD,
    skin: HUE.skinWarm,
    hair: HUE.hairRed,
    hairStyle: 'cropped',
    shirt: SEDGE_WOOL,
    forearm: 'skin',
    trousers: SILT,
    boots: MUD_DARK,
    belt: PAL.leatherDark,
  },
];

/** A fen raider: three faces, each with a leister or a gig, a reed cloak on two, a rush hat on some. */
function dressRaider(ctx: DressContext, variant: number): WeaponSpec {
  const v = ((variant % 6) + 6) % 6;
  const l = RAIDER_FACES[v % 3];
  body(ctx, l);
  head(ctx, l);
  mudSmears(ctx, v);
  rolledToTheKnee(ctx, l);
  if (v % 3 !== 1) reedCloak(ctx, l, v % 2 ? REED_DARK : REED);
  if (v === 1 || v === 2 || v === 3) rushHat(ctx, v === 2 ? REED_DARK : REED);
  return eelSpear(ctx, v % 2 ? 3 : 4);
}

const ARCHER_LOOK: Look = { ...RAIDER_FACES[0], skin: HUE.skinTan, hair: HUE.hairDark, hairStyle: 'none', beard: 'stubble', shirt: PEAT, sleeve: PEAT, trousers: SILT };

/** A fen raider archer: the green hood of every archer, a quiver of reed-fletched arrows, and a fowler's long bow. */
function dressRaiderArcher(ctx: DressContext): WeaponSpec {
  const l = ARCHER_LOOK;
  body(ctx, l);
  head(ctx, l);
  mudSmears(ctx, 1);
  rolledToTheKnee(ctx, l);
  hood(ctx, l, PAL.hood);
  quiver(ctx, REED);
  return bow(ctx, { tips: PAL.boneShade, string: HUE.bowString, wood: ASH, span: 1.3 });
}

const CUTTER_LOOK: Look = {
  build: 'big',
  skin: HUE.skinWarm,
  hair: HUE.hairDark,
  hairStyle: 'cropped',
  beard: 'full',
  shirt: HUE.linenDark,
  sleeve: HUE.linenDark,
  forearm: 'skin',
  trousers: PEAT_DARK,
  boots: MUD_DARK,
  belt: PAL.leatherDark,
};

/** A peat cutter turned raider: a big man in a leather apron, sleeves torn off, the reed cloak, his spade. */
function dressPeatCutter(ctx: DressContext): WeaponSpec {
  const l = CUTTER_LOOK;
  body(ctx, l);
  head(ctx, l);
  mudSmears(ctx, 0);
  rolledToTheKnee(ctx, l);
  apron(ctx, l, PAL.leather, false, 0.5);
  reedCloak(ctx, l, REED_DARK);
  return peatSpade(ctx);
}

const HEADMAN_LOOK: Look = {
  build: 'big',
  skin: HUE.skinFair,
  hair: HUE.hairGrey,
  hairStyle: 'long',
  beard: 'full',
  shirt: SEDGE_WOOL,
  sleeve: SEDGE_WOOL,
  forearm: shade(SEDGE_WOOL, 0.85),
  hands: 'skin',
  trousers: PEAT,
  boots: MUD_DARK,
  belt: PAL.leatherDark,
};

/** Abel Thatch, the Cockle End headman: grey and long-haired under a felt hat gone shapeless, a sedge-green coat, the reed cloak, his slasher. */
function dressHeadman(ctx: DressContext): WeaponSpec {
  const l = HEADMAN_LOOK;
  body(ctx, l);
  head(ctx, l);
  mudSmears(ctx, 1);
  rolledToTheKnee(ctx, l);
  // The skirts of his coat, front and back.
  const k = thick(l);
  ctx
    .on('hips')
    .box(0.36 * k, 0.5, 0.03, { at: [0, -0.2, 0.13 * k], rot: [-0.06, 0, 0], color: SEDGE_WOOL })
    .box(0.36 * k, 0.5, 0.03, { at: [0, -0.2, -0.13 * k], rot: [0.06, 0, 0], color: SEDGE_WOOL });
  reedCloak(ctx, l);
  feltHat(ctx, PEAT);
  return slasher(ctx);
}

/** The build each raider's body is made in. */
export const RAIDER_BUILDS = { grunt: RAIDER_BUILD, archer: ARCHER_LOOK.build, brute: CUTTER_LOOK.build } as const;

/** Abel Thatch, who leads them at Cockle End, fighting as a brute. */
const RAIDER_NAMED: Record<string, NamedFighter> = {
  headman: { kind: 'brute', label: 'Abel Thatch, the Cockle End headman', looks: 1, proportions: BUILDS[HEADMAN_LOOK.build].proportions, dress: dressHeadman },
};

/** The fen raiders: eel spears fight as grunts, fowlers as archers, peat cutters as brutes. */
export const RAIDERS: FamilyDef = {
  body: 'human',
  seed: 53,
  fights: {
    grunt: { label: 'Fen raider', looks: 6, proportions: BUILDS[RAIDER_BUILD].proportions, dress: dressRaider },
    archer: { label: 'Fen raider fowler', looks: 1, proportions: BUILDS[ARCHER_LOOK.build].proportions, dress: dressRaiderArcher },
    brute: { label: 'Fen raider peat cutter', looks: 1, proportions: BUILDS[CUTTER_LOOK.build].proportions, dress: dressPeatCutter },
  },
  named: RAIDER_NAMED,
};
