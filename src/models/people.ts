import type { Material } from 'three';
import type { WorkName } from '../people/work';
import { apron, BUILDS, body, cuffs, HUE, head, type Look, mail, pauldrons, rolledSleeves, sheathedSword, tabard } from './human';
import { PAL } from './palette';
import { type DressContext, type Pose, Rig } from './rig';

// Oakvale's friendly characters in the human body (human.ts): Marshal Hale,
// the three villagers and the herbalist at the alchemy bench. Blue and gold are Hale's alone; villagers wear undyed
// linen, browns and ochre.

const PI = Math.PI;

/** Marshal Hale, the three villagers and the herbalist. */
export type PersonId = 'hale' | 'innkeeper' | 'smith' | 'farmer' | 'herbalist';

export interface Person {
  label: string;
  /** Their build, face and clothes; `dress` adds the rest. */
  look: Look;
  /** The pose they stand in, holding what they hold. */
  stand: Pose;
  dress(ctx: DressContext, look: Look): void;
  /** Varies the per-face shading. */
  seed: number;
  /** The work loops (people/work.ts) this look is made for, beyond standing about: shown in the model inspector. */
  works?: readonly WorkName[];
}

const STAND: Pose = {
  spine: [0.02, 0, 0],
  upperArmL: [0.04, 0, 0.1],
  forearmL: [-0.2, 0, 0],
  upperArmR: [0.04, 0, -0.1],
  forearmR: [-0.2, 0, 0],
  thighL: [-0.04, 0, 0.03],
  thighR: [0.03, 0, -0.03],
};

/** Hale: the left hand on the sword's pommel, the right hanging easy. */
const HALE_STAND: Pose = {
  head: [-0.03, 0, 0],
  upperArmL: [0.25, 0, 0.2],
  forearmL: [-1.9, -0.2, 0],
  handL: [0.35, 0, 0],
  upperArmR: [0.04, 0, -0.12],
  forearmR: [-0.25, 0, 0],
  thighL: [-0.04, 0, 0.05],
  thighR: [0.03, 0, -0.05],
};

/** Hale once they've handed you their sword: the left hand off the empty scabbard, hanging easy. */
export const HALE_UNARMED_STAND: Pose = {
  ...HALE_STAND,
  upperArmL: [0.04, 0, 0.12],
  forearmL: [-0.25, 0, 0],
  handL: [0, 0, 0],
};

/** Holding something in front: a tankard, a hammer. */
const HOLDING: Pose = {
  ...STAND,
  upperArmR: [-0.15, 0, -0.1],
  forearmR: [-1.1, 0, 0],
  handR: [0.4, 0, 0],
};

/** A pitchfork planted upright at the right side. */
const FORK: Pose = {
  ...STAND,
  upperArmR: [-0.25, 0, -0.22],
  forearmR: [-1.25, 0, 0],
};

const HALE_LOOK: Look = {
  build: 'average',
  skin: HUE.skinWarm,
  hair: HUE.hairGrey,
  hairStyle: 'cropped',
  shirt: HUE.mail,
  sleeve: HUE.mail,
  forearm: PAL.leather,
  hands: PAL.leatherDark,
  trousers: PAL.leatherDark,
  boots: PAL.woodDark,
};

/**
 * The village's guard captain: bareheaded, cropped grey hair and clean-shaven,
 * a mail shirt under a blue tabard with a gold mark front and back, steel
 * pauldrons, leather gloves and bracers, a belt with a gold buckle, and their
 * old longsword (the gilded guard the last quest pays out) at the left hip:
 * once it's `given`, the scabbard hangs empty.
 */
function dressHale(ctx: DressContext, l: Look, given = false): void {
  body(ctx, l);
  head(ctx, l);
  mail(ctx, l);
  tabard(ctx, l, HUE.tabard, 0.42, PAL.gold);
  // The belt goes on over the mail and tabard.
  ctx.on('hips').box(0.33, 0.06, 0.24, { at: [0, 0.03, 0.005], color: PAL.leather }).box(0.06, 0.05, 0.02, { at: [0, 0.03, 0.135], color: PAL.gold });
  pauldrons(ctx, l, PAL.steel);
  cuffs(ctx, l, PAL.leatherDark);
  sheathedSword(ctx, l, PAL.gold, !given);
}

function tankard(ctx: DressContext): void {
  ctx
    .on('handR')
    .cyl(0.05, 0.05, 0.13, 8, { at: [0, -0.06, 0.07], rot: [PI / 2, 0, 0], color: PAL.wood })
    .cyl(0.052, 0.052, 0.02, 8, { at: [0, -0.0, 0.07], rot: [PI / 2, 0, 0], color: PAL.gold })
    .cyl(0.045, 0.045, 0.01, 8, { at: [0, -0.125, 0.07], rot: [PI / 2, 0, 0], color: 0xe8dcc0 });
}

function hammer(ctx: DressContext): void {
  ctx
    .on('handR')
    .box(0.03, 0.42, 0.03, { at: [0, -0.14, 0], color: PAL.woodDark })
    .box(0.07, 0.07, 0.17, { at: [0, -0.36, 0.02], color: PAL.ironDark });
}

/** Along the hand's Z, so it stands upright with the forearm held level. */
function pitchfork(ctx: DressContext): void {
  const b = ctx.on('handR');
  b.cyl(0.02, 0.02, 1.55, 5, { at: [0, -0.02, -0.05], rot: [PI / 2, 0, 0], color: PAL.wood }).box(0.18, 0.02, 0.03, { at: [0, -0.02, 0.73], color: PAL.ironDark });
  for (const x of [-0.08, 0, 0.08]) b.box(0.015, 0.015, 0.22, { at: [x, -0.02, 0.85], color: PAL.iron });
}

/** Tongs in the left hand, gripping a bar hot from the forge across their jaws. */
function tongs(ctx: DressContext): void {
  ctx
    .on('handL')
    .box(0.016, 0.44, 0.016, { at: [-0.013, -0.2, 0.01], color: PAL.ironDark })
    .box(0.016, 0.44, 0.016, { at: [0.013, -0.2, 0.01], color: PAL.ironDark })
    .box(0.03, 0.03, 0.24, { at: [0, -0.43, 0.05], color: HUE.hotIron, glow: 0.8, jitter: 0 });
}

/** A rag in the left hand, for the bar and the tankards. */
function rag(ctx: DressContext): void {
  ctx.on('handL').box(0.11, 0.025, 0.13, { at: [0, -0.075, 0.02], color: HUE.linenDark });
}

const INNKEEPER_LOOK: Look = {
  build: 'stout',
  skin: HUE.skinFair,
  hair: HUE.hairBrown,
  hairStyle: 'bald',
  beard: 'moustache',
  shirt: HUE.linen,
  forearm: 'skin',
  trousers: PAL.leatherDark,
  boots: PAL.leatherDark,
  belt: PAL.leather,
};

/** Stout and bald with a brown moustache: rolled sleeves, a russet waistcoat, a long white apron, a tankard and a rag. */
function dressInnkeeper(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  rolledSleeves(ctx, l, HUE.linen);
  const L = ctx.p.spine;
  ctx
    .on('spine')
    .box(0.12, L * 0.7, 0.02, { at: [-0.1, L * 0.45, 0.18], color: HUE.russet })
    .box(0.12, L * 0.7, 0.02, { at: [0.1, L * 0.45, 0.18], color: HUE.russet });
  apron(ctx, l, HUE.apronWhite, false, 0.62);
  tankard(ctx);
  rag(ctx);
}

const SMITH_LOOK: Look = {
  build: 'broad',
  skin: HUE.skinTan,
  hair: HUE.hairDark,
  hairStyle: 'cropped',
  beard: 'short',
  shirt: PAL.clothDark,
  sleeve: HUE.skinTan,
  forearm: 'skin',
  hands: PAL.leatherDark,
  trousers: PAL.leatherDark,
  boots: PAL.woodDark,
  belt: PAL.leatherDark,
};

/** Broad, with cropped dark hair and a short beard: a sleeveless dark shirt, a leather bib apron, thick gloves, a hammer and tongs. */
function dressSmith(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  apron(ctx, l, PAL.leather, true, 0.66);
  cuffs(ctx, l, PAL.leatherDark);
  hammer(ctx);
  tongs(ctx);
}

const FARMER_LOOK: Look = {
  build: 'average',
  skin: HUE.skinWarm,
  hair: HUE.hairSandy,
  hairStyle: 'short',
  beard: 'stubble',
  shirt: HUE.linen,
  trousers: HUE.ochre,
  boots: PAL.leatherDark,
};

/** The farm's own farmer, driven out by the bandits: a straw hat, a linen shirt with braces, ochre trousers and a pitchfork. */
function dressFarmer(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  const L = ctx.p.spine;
  ctx
    .on('spine')
    .box(0.03, L, 0.02, { at: [-0.08, L / 2, 0.125], color: PAL.leatherDark })
    .box(0.03, L, 0.02, { at: [0.08, L / 2, 0.125], color: PAL.leatherDark });
  ctx
    .on('head')
    .cyl(0.23, 0.24, 0.02, 10, { at: [0, 0.24, 0], color: HUE.straw })
    .cyl(0.1, 0.12, 0.1, 8, { at: [0, 0.29, 0], color: HUE.straw })
    .cyl(0.121, 0.121, 0.025, 8, { at: [0, 0.255, 0], color: HUE.strawDark });
  pitchfork(ctx);
}

const HERBALIST_LOOK: Look = {
  build: 'average',
  skin: HUE.skinFair,
  hair: HUE.hairGrey,
  hairStyle: 'tied',
  shirt: HUE.linen,
  forearm: 'skin',
  trousers: HUE.linenDark,
  boots: PAL.leatherDark,
  belt: PAL.leather,
};

/** A bundle of Hearthleaf in the left hand, tied at the stems. */
function herbs(ctx: DressContext): void {
  ctx
    .on('handL')
    .box(0.02, 0.1, 0.02, { at: [0, -0.06, 0.02], color: HUE.strawDark })
    .box(0.09, 0.08, 0.05, { at: [0, -0.14, 0.02], color: 0x5a9a3a, jitter: 0.12 })
    .box(0.05, 0.05, 0.04, { at: [0.03, -0.18, 0.03], color: 0x4e8a34, jitter: 0.12 });
}

/**
 * Grey hair tied back: undyed linen, rolled sleeves, a long apron stained green
 * at the hem and a herb satchel on the right hip, a bundle of Hearthleaf in hand.
 */
function dressHerbalist(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  rolledSleeves(ctx, l, HUE.linen);
  apron(ctx, l, HUE.linenDark, true, 0.7);
  // The apron's hem, green with the work.
  ctx.on('hips').box(0.3, 0.12, 0.022, { at: [0, -0.6, 0.13], color: 0x5a7a3a, jitter: 0.1 });
  // The satchel on its strap, from the left shoulder to the right hip.
  const L = ctx.p.spine;
  ctx.on('spine').box(0.04, L * 1.05, 0.02, { at: [0, L * 0.5, 0.125], rot: [0, 0, 0.55], color: PAL.leather });
  ctx.on('hips').box(0.07, 0.16, 0.2, { at: [0.2, -0.08, 0.02], color: PAL.leather }).box(0.075, 0.06, 0.205, { at: [0.2, 0.02, 0.02], color: PAL.leatherDark });
  herbs(ctx);
}

/** Holding a bundle of herbs up before the chest, the right hand at it. */
const HERBS: Pose = {
  ...STAND,
  upperArmL: [-0.2, 0, 0.1],
  forearmL: [-1.2, 0, 0],
  handL: [0.3, 0, 0],
  upperArmR: [-0.15, 0, -0.1],
  forearmR: [-0.9, 0, 0],
};

export const PEOPLE: Record<PersonId, Person> = {
  hale: { label: 'Marshal Hale', look: HALE_LOOK, stand: HALE_STAND, dress: dressHale, seed: 5 },
  innkeeper: { label: 'Innkeeper', look: INNKEEPER_LOOK, stand: HOLDING, dress: dressInnkeeper, seed: 61 },
  smith: { label: 'Smith', look: SMITH_LOOK, stand: HOLDING, dress: dressSmith, seed: 62 },
  farmer: { label: 'Farmer', look: FARMER_LOOK, stand: FORK, dress: dressFarmer, seed: 63 },
  herbalist: { label: 'Herbalist', look: HERBALIST_LOOK, stand: HERBS, dress: dressHerbalist, seed: 64 },
};

/** Hale's body, with their sword at the hip or, once `given` to you, without it. One draw call. */
export function buildHale(given: boolean, material?: Material): Rig {
  const p = PEOPLE.hale;
  return new Rig(BUILDS[p.look.build].proportions, (ctx) => dressHale(ctx, p.look, given), material, p.seed);
}

/** A friendly character's body, standing at bind (apply their `stand`). One draw call. */
export function buildPerson(id: PersonId, material?: Material): Rig {
  const p = PEOPLE[id];
  return new Rig(BUILDS[p.look.build].proportions, (ctx) => p.dress(ctx, p.look), material, p.seed);
}
