import { bow } from './bow';
import { COLLEGIUM } from './clergy';
import { body, cuffs, HUE, head, hood, type Look, mail, quiver, robe, robed, shade, tabard } from './human';
import { PAL } from './palette';
import type { Person } from './people';
import { cloak, featheredCap, openBook, staff, swordInHand } from './props';
import type { DressContext } from './rig';
import { ARROW, BOW_EASY, ON_SWORD, READING, STAFF_AND_BOOK } from './stands';

// The `class trainer` family on the human body (human.ts): whoever teaches a
// class looks the part of it. A drill master with a drawn sword for the
// warrior, a lodge-master with a longbow for the ranger (in a cap, never the
// green hood that marks an archer of either enemy family), a magister in the
// Collegium's grey with a lamp-staff or a light in the hand for the mage.
// Aldhaven's three are named (Sergeant-at-arms Rook in the City Watch's
// colours, Lodge-master Fen Ashgrove, Magister Elsabet Quill); the three
// plain ones stand in any hub that has none of its own (Reedholm first).
// A trainer who looks like their trade instead (Brackenmoor's Brannoc at his
// anvil, Ysolde Tarn the hunter, Brother Cuthwin the priest) is dressed by that
// trade's family.

/** The crown's blue and gold: Marshal Hale's, and the City Watch's (the guards' livery, models/guards.ts). */
const CROWN = { field: HUE.tabard, badge: PAL.gold } as const;
/** A ranger's forest-green cloak: lighter than the archers' hood, and never a hood. */
const FOREST = 0x48582e;

const ROOK_LOOK: Look = {
  build: 'broad',
  skin: HUE.skinTan,
  hair: 0x5a5450,
  hairStyle: 'cropped',
  beard: 'short',
  shirt: HUE.mail,
  sleeve: HUE.mail,
  forearm: PAL.leather,
  hands: PAL.leatherDark,
  trousers: PAL.leatherDark,
  boots: PAL.woodDark,
};

/** A scar down the left cheek, pale against the skin. */
function scar(ctx: DressContext, l: Look): void {
  ctx.on('head').box(0.012, 0.07, 0.01, { at: [0.06, 0.12, 0.104], rot: [0, 0, 0.3], color: shade(l.skin, 1.3), jitter: 0 });
}

/** The Watch's drill master: broad and scarred, cropped grey hair, mail under the crown's blue tabard with the gold mark, a drawn sword. */
function dressRook(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  scar(ctx, l);
  mail(ctx, l);
  tabard(ctx, l, CROWN.field, 0.42, CROWN.badge);
  ctx.on('hips').box(0.36, 0.06, 0.27, { at: [0, 0.03, 0.005], color: PAL.leather }).box(0.06, 0.05, 0.02, { at: [0, 0.03, 0.15], color: CROWN.badge });
  cuffs(ctx, l, PAL.leatherDark);
  swordInHand(ctx, 'R', PAL.iron);
}

const ASHGROVE_LOOK: Look = {
  build: 'average',
  skin: HUE.skinWarm,
  hair: HUE.hairBrown,
  hairStyle: 'tied',
  beard: 'full',
  shirt: PAL.leather,
  sleeve: HUE.linenDark,
  forearm: PAL.leatherDark,
  hands: PAL.leatherDark,
  trousers: 0x4a4030,
  boots: PAL.leatherDark,
};

/** The king's lodge-master: bearded, a leather jerkin and a forest-green cloak, a feathered cap, a quiver and a longbow strung in hand. */
function dressAshgrove(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  cloak(ctx, l, FOREST, 0.82, PAL.gold);
  featheredCap(ctx, FOREST, 0xd8ccb0);
  quiver(ctx, 0xd8ccb0);
  bow(ctx, { tips: PAL.iron, string: HUE.bowString });
}

const QUILL_LOOK: Look = {
  build: 'woman',
  skin: HUE.skinFair,
  hair: 0x7a3e24,
  hairStyle: 'bun',
  shirt: COLLEGIUM.robe,
  trousers: COLLEGIUM.robe,
  boots: PAL.leatherDark,
};

/** A magister who teaches the mage: auburn hair pinned up, the Collegium's grey robe and pale facing, a lamp-staff alight, and a book. */
function dressQuill(ctx: DressContext, l: Look): void {
  body(ctx, l, robed());
  head(ctx, l);
  robe(ctx, l, COLLEGIUM.robe, { stole: COLLEGIUM.facing });
  staff(ctx, 'R', { length: 1.85, below: 1.1, lamp: { cage: PAL.ironDark, light: COLLEGIUM.lamp } });
  openBook(ctx, 'L', 0x3a2a4a, 0.85);
}

// ---------------------------------------------------------------- any hub

const WARRIOR_LOOK: Look = {
  build: 'broad',
  skin: HUE.skinWarm,
  hair: HUE.hairDark,
  hairStyle: 'short',
  beard: 'stubble',
  shirt: HUE.mail,
  sleeve: 0x8e826a,
  forearm: PAL.leather,
  hands: PAL.leatherDark,
  trousers: PAL.leatherDark,
  boots: PAL.leatherDark,
};

/** A veteran: a mail shirt under a leather jerkin, padded sleeves, a drawn sword. */
function dressWarriorTrainer(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  mail(ctx, l);
  tabard(ctx, l, PAL.leather, 0.36);
  ctx.on('hips').box(0.36, 0.06, 0.27, { at: [0, 0.03, 0.005], color: PAL.leatherDark }).box(0.06, 0.05, 0.02, { at: [0, 0.03, 0.15], color: PAL.iron });
  cuffs(ctx, l, PAL.leatherDark);
  swordInHand(ctx, 'R', PAL.iron);
}

const RANGER_LOOK: Look = {
  build: 'average',
  skin: HUE.skinTan,
  hair: HUE.hairSandy,
  hairStyle: 'short',
  beard: 'short',
  shirt: PAL.leather,
  sleeve: HUE.linenDark,
  forearm: PAL.leatherDark,
  trousers: 0x4a4030,
  boots: PAL.leatherDark,
};

/** An arrow in the right fist, along -Y: its head ahead with the forearm level, its fletching at the wrist. */
function arrow(ctx: DressContext): void {
  ctx
    .on('handR')
    .box(0.012, 0.72, 0.012, { at: [0, -0.16, 0.02], color: PAL.wood, jitter: 0 })
    .box(0.03, 0.06, 0.016, { at: [0, -0.54, 0.02], color: PAL.iron })
    .box(0.004, 0.12, 0.05, { at: [0, 0.12, 0.02], color: 0xd8ccb0, jitter: 0 })
    .box(0.05, 0.12, 0.004, { at: [0, 0.12, 0.02], color: 0xd8ccb0, jitter: 0 });
}

/** A ranger: a leather jerkin, a green cloak and a brown feathered cap, a quiver and an unstrung bow across the back, an arrow to fletch. */
function dressRangerTrainer(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  cloak(ctx, l, FOREST, 0.7);
  featheredCap(ctx, 0x3e3424, 0x9a7a52);
  quiver(ctx, 0xd8ccb0);
  // The bow, unstrung, across the back from the right shoulder to the left hip.
  const L = ctx.p.spine;
  ctx.on('spine').bar([-0.26, L + 0.32, -0.22], [0.3, -0.62, -0.22], 0.03, 0.025, { color: PAL.wood });
  arrow(ctx);
}

const MAGE_LOOK: Look = {
  build: 'elder',
  skin: HUE.skinFair,
  hair: HUE.hairGrey,
  hairStyle: 'short',
  beard: 'full',
  shirt: COLLEGIUM.robe,
  trousers: COLLEGIUM.robe,
  boots: PAL.leatherDark,
};

/** An old magister on the road: the Collegium's grey with its hood up, a book open, a small light glowing over the right palm. */
function dressMageTrainer(ctx: DressContext, l: Look): void {
  body(ctx, l, robed());
  head(ctx, l);
  robe(ctx, l, COLLEGIUM.robe, { sleeves: 'close', cord: COLLEGIUM.facing });
  hood(ctx, l, shade(COLLEGIUM.robe, 0.9));
  openBook(ctx, 'L', 0x4a3a2a, 0.85);
  ctx.on('handR').box(0.05, 0.05, 0.05, { at: [0.05, -0.06, 0.07], rot: [0.6, 0.6, 0], color: COLLEGIUM.lamp, glow: 1, jitter: 0 });
}

/** The `class trainer` family, by their cast name (people/cast.ts). */
export const TRAINERS = {
  sergeantRook: { label: 'Sergeant-at-arms Rook', look: ROOK_LOOK, stand: ON_SWORD, dress: dressRook, seed: 111, works: ['form'] },
  lodgemasterAshgrove: { label: 'Lodge-master Ashgrove', look: ASHGROVE_LOOK, stand: BOW_EASY, dress: dressAshgrove, seed: 112, works: ['loose'] },
  magisterQuill: { label: 'Magister Quill', look: QUILL_LOOK, stand: STAFF_AND_BOOK, dress: dressQuill, seed: 113, works: ['read'] },
  warriorTrainer: { label: 'Warrior trainer', look: WARRIOR_LOOK, stand: ON_SWORD, dress: dressWarriorTrainer, seed: 114, works: ['form'] },
  rangerTrainer: { label: 'Ranger trainer', look: RANGER_LOOK, stand: ARROW, dress: dressRangerTrainer, seed: 115, works: ['fletch'] },
  mageTrainer: { label: 'Mage trainer', look: MAGE_LOOK, stand: READING, dress: dressMageTrainer, seed: 116, works: ['read'] },
} satisfies Record<string, Person>;
