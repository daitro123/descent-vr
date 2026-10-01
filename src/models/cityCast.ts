import { BASKET_STAND, CHILD_STAND, CROOK_STAND, EASY, EASY_SKIRT, FOLDED, STICK_STAND, stick } from './commoners';
import { apron, body, coif, cuffs, HUE, head, hood, type Look, quiver, rolledSleeves, sash, shawl, skirt } from './human';
import {
  armband,
  badge,
  bakersCap,
  bodice,
  brimHat,
  capelet,
  coat,
  collar,
  feather,
  flatCap,
  headscarf,
  knitCap,
  pack,
  patches,
  pipeInMouth,
  purse,
  skullcap,
  spectacles,
  strawHat,
  stripedApron,
  tricorn,
  yoke,
} from './outfits';
import { bow } from './bow';
import { PAL } from './palette';
import { herbs, PEOPLE, type Person, rag, tankard } from './people';
import type { DressContext, Pose } from './rig';
import {
  apple,
  armBasket,
  armsCrate,
  book,
  bowl,
  broom,
  brush,
  bucket,
  candles,
  cleaver,
  clothBolt,
  curio,
  fish,
  hoe,
  hotTongs,
  knife,
  ledger,
  loaf,
  mortar,
  netting,
  paddle,
  posy,
  quill,
  rake,
  rod,
  ropeCoil,
  saw,
  scraper,
  shoulderSack,
  staff,
  strap,
  whipAtBelt,
} from './tools';

// The city's people in the human body (human.ts): Aldhaven's villagers, and
// any city's after it (/zones/aldhaven-inhabitants.md in the project's
// files). Where Oakvale's and the moor's commoners wear undyed wool, browns
// and ochre, the capital's wear dyed cloth: sea blue, rose, cream, weld
// yellow and russet. Twelve shared looks across the builds for the crowd
// (men and women, old and young, a boy and a girl), never two alike side by
// side; the market's eight stallholders and the harbour's, Guild Row's and
// the fields' trades, each with what they work with in hand; servants in the
// great houses' liveries (Corvane's crimson with the black key, Harrowgate's
// grey with the white tower, Ashby's sea green with the silver ship); and
// the city's named villagers. The colour rules hold: no red at the face or
// the waist (a bandit's), no green hood (an archer's), and blue and gold
// only for the crown's service (the customs officer's badge), as the
// Aldhaven spec recommends. Each look names the work loops it's made for
// (people/trades.ts); a carrier's load is dressed onto them only while they
// hold it.

/** The city's dyed cloth, and the great houses' livery (as their banners: maps/aldhaven/palette.ts HERALDRY). */
export const CLOTH = {
  seaBlue: 0x4f7896,
  seaBlueDark: 0x38566e,
  rose: 0xb8746e,
  roseDark: 0x8a504c,
  cream: 0xe2d6b8,
  creamDark: 0xc4b896,
  weld: 0xc8aa4a,
  weldDark: 0x9a8234,
  russet: 0x8c4c30,
  russetDark: 0x66381f,
  sage: 0x7c8a5e,
  slate: 0x5a606a,
  charcoal: 0x3a3638,
  black: 0x242022,
  white: 0xe8e4d8,
  flour: 0xe6e0d0,
  corvane: 0x9e2b2b,
  corvaneDark: 0x6e1e1e,
  corvaneKey: 0x1e1a1e,
  harrowgate: 0x8a8c90,
  harrowgateDark: 0x5e6064,
  harrowgateTower: 0xf0ece0,
  ashby: 0x3f8a76,
  ashbyDark: 0x2c6656,
  ashbyShip: 0xc8ccd0,
  crown: 0x2c4a8c,
  gold: 0xd9a93b,
  brass: 0xc8a048,
} as const;

const C = CLOTH;
/** Hands and forearms stained to the elbow with woad. */
const WOAD_STAIN = 0x3e5a8a;
const INDIGO = 0x2c3e6e;

// ------------------------------------------------------------------ stands

/** Holding something up before them in the right hand: a loaf, a cleaver, a posy. */
const HOLD_FORTH: Pose = { ...EASY, upperArmR: [-0.15, 0, -0.1], forearmR: [-1.1, 0, 0], handR: [0.4, 0, 0] };
const HOLD_FORTH_SKIRT: Pose = { ...EASY_SKIRT, upperArmR: [-0.15, 0, -0.14], forearmR: [-1.1, 0, 0], handR: [0.4, 0, 0] };
/** A basket (or a bolt of cloth) on the left forearm, and something held up in the right. */
const BASKET_HOLD: Pose = { ...BASKET_STAND, upperArmR: [-0.15, 0, -0.14], forearmR: [-1.1, 0, 0], handR: [0.4, 0, 0] };
/** A ledger open on the left forearm, a quill over it in the right. */
const LEDGER_STAND: Pose = { ...BASKET_STAND, upperArmR: [-0.2, -0.3, -0.1], forearmR: [-1.35, -0.2, 0], handR: [0.5, 0, 0] };
/** A fish hanging from the left fist, held a little out, and a knife in the right. */
const FISH_STAND: Pose = { ...EASY_SKIRT, upperArmL: [-0.25, 0, 0.18], forearmL: [-0.5, 0, 0], ...{ upperArmR: [-0.15, 0, -0.14], forearmR: [-1.1, 0, 0], handR: [0.2, 0, 0] } };
/** A bucket hanging from the right fist, the arm held out from the skirt. */
const BUCKET_STAND: Pose = { ...EASY_SKIRT, upperArmR: [0.02, 0, -0.24], forearmR: [-0.05, 0, 0] };
/** A book held open before the chest in both hands. */
const BOOK_STAND: Pose = {
  ...EASY_SKIRT,
  head: [0.25, 0, 0],
  upperArmL: [-0.35, -0.35, 0.12],
  forearmL: [-1.35, 0, 0],
  handL: [0.2, 0.6, 0],
  upperArmR: [-0.35, 0.35, -0.12],
  forearmR: [-1.35, 0, 0],
  handR: [0.2, -0.3, 0],
};
/** A mortar held at the waist in the left hand, the pestle in it in the right. */
const MORTAR_STAND: Pose = {
  ...EASY_SKIRT,
  upperArmL: [-0.2, -0.2, 0.12],
  forearmL: [-1.25, 0, 0],
  handL: [0.25, 0, 0],
  upperArmR: [-0.3, 0.25, -0.12],
  forearmR: [-1.45, 0, 0],
  handR: [1.2, 0, 0],
};
/** Tongs held out low before them, the hot bar off to the side. */
const TONGS_STAND: Pose = { ...EASY, upperArmR: [-0.3, 0, -0.18], forearmR: [-0.5, 0, 0], handR: [0.2, 0, 0] };
/** A saw hanging at the right side, its blade out ahead. */
const SAW_STAND: Pose = { ...EASY, upperArmR: [0.04, 0, -0.14], forearmR: [-0.3, 0, 0], handR: [0.2, 0, 0] };
/** The scraping knife held across before the thighs in both fists. */
const SCRAPER_STAND: Pose = {
  ...EASY,
  upperArmR: [-0.3, 0.2, -0.12],
  forearmR: [-0.7, 0, 0],
  handR: [0.3, 0, 0],
  upperArmL: [-0.3, -0.25, 0.12],
  forearmL: [-0.7, 0, 0],
  handL: [0.3, 0, 0],
};
/** A rope's coil in the left fist, held before the waist, the right hand at it. */
const COIL_STAND: Pose = { ...EASY, upperArmL: [-0.25, -0.15, 0.1], forearmL: [-1.0, 0, 0], handL: [0.4, 0, 0], upperArmR: [-0.2, 0.2, -0.1], forearmR: [-1.1, 0, 0] };
/** Net bunched in the left fist, the needle in the right. */
const NET_STAND: Pose = { ...EASY, upperArmL: [-0.3, -0.1, 0.12], forearmL: [-0.9, 0, 0], handL: [0.4, 0, 0], upperArmR: [-0.3, 0.25, -0.1], forearmR: [-1.1, 0, 0] };
/** The rod held out ahead and up in both hands. */
const ROD_STAND: Pose = { ...EASY, upperArmR: [-0.5, 0.15, -0.12], forearmR: [-0.9, 0, 0], handR: [0.5, 0, 0], upperArmL: [-0.4, -0.4, 0.1], forearmL: [-1.0, 0, 0] };
/** A bowl held out in the right hand. */
const BOWL_STAND: Pose = { ...EASY, upperArmR: [-0.6, 0.1, -0.1], forearmR: [-0.6, -1.2, 0], handR: [0, 0, 0] };
/** The bow held before them in the left fist, the string hand at it (an archer's at ease: enemies/poses.ts IDLE.archer). */
const BOW_STAND: Pose = {
  spine: [0.05, 0, 0],
  upperArmL: [-0.5, -0.3, 0.1],
  forearmL: [-0.9, 0, 0],
  handL: [-0.2, 0, 0.1],
  upperArmR: [-0.45, 0.45, -0.05],
  forearmR: [-1.1, 0, 0],
  thighL: [-0.1, 0, 0.04],
  shinL: [0.12, 0, 0],
  thighR: [0.08, 0, -0.04],
  shinR: [0.1, 0, 0],
};
/** The tankard and the rag held before them (the innkeeper's). */
const TANKARD_STAND: Pose = { ...EASY_SKIRT, upperArmR: [-0.15, 0, -0.14], forearmR: [-1.1, 0, 0], handR: [0.4, 0, 0] };
/** Herbs held up before the chest (the herbalist's). */
const HERBS_STAND: Pose = { ...EASY_SKIRT, upperArmL: [-0.2, 0, 0.12], forearmL: [-1.2, 0, 0], handL: [0.3, 0, 0], upperArmR: [-0.15, 0, -0.14], forearmR: [-0.9, 0, 0] };

/** A sack over the right shoulder, the right hand up on it in front. */
const CARRY_SACK: Pose = {
  ...EASY,
  spine: [0.06, 0, 0.06],
  head: [0, 0, -0.1],
  upperArmR: [-1.05, 0.15, -0.85],
  forearmR: [-2.0, 0, 0],
  handR: [0.3, 0, 0],
};
/** A crate held before the chest in both arms. */
const CARRY_CRATE: Pose = {
  ...EASY,
  spine: [-0.06, 0, 0],
  upperArmL: [-0.45, 0, 0.22],
  forearmL: [-1.15, 0, 0],
  handL: [0.2, 0, 0.3],
  upperArmR: [-0.45, 0, -0.22],
  forearmR: [-1.15, 0, 0],
  handR: [0.2, 0, -0.3],
};

// ------------------------------------------------------------------ the kit

/** A look on the human body: dressed in the body, the head and `wear` over them. */
function person(label: string, look: Look, stand: Pose, seed: number, wear: (ctx: DressContext, l: Look) => void, more: Partial<Person> = {}): Person {
  return {
    label,
    look,
    stand,
    seed,
    dress(ctx, l) {
      body(ctx, l);
      head(ctx, l);
      wear(ctx, l);
    },
    ...more,
  };
}

/** Another of a look, in other hair and cloth: so two at the same work side by side aren't twins. */
function another(of: Person, label: string, seed: number, look: Partial<Look>): Person {
  return { ...of, label, seed, look: { ...of.look, ...look } };
}

/** Fruit for a basket: red and green apples, a pear. */
const FRUIT = [0xa83a2a, 0x8aac3a, 0xc8b048, 0xa83a2a, 0x8aac3a];
/** Flowers for a basket and a posy. */
const FLOWERS = [0xc85a7a, 0xe8d050, 0xe8e0d8, 0x7a6ac8, 0xd87a5a];

// ------------------------------------------------------------------ the crowd

const townsman = person(
  'Townsman',
  { build: 'average', skin: HUE.skinWarm, hair: HUE.hairBrown, hairStyle: 'short', beard: 'stubble', shirt: C.seaBlue, sleeve: C.cream, forearm: C.cream, trousers: C.russetDark, boots: PAL.leatherDark, belt: PAL.leather },
  EASY,
  101,
  (ctx, l) => {
    skirt(ctx, l, C.seaBlue, { hem: 0.68, flare: 0.03 });
    flatCap(ctx, C.seaBlueDark);
    purse(ctx, l, PAL.leather);
  },
  { works: ['browse', 'talk', 'haggle'] },
);

const burgher = person(
  'Burgher',
  { build: 'stout', skin: HUE.skinFair, hair: HUE.hairGrey, hairStyle: 'short', beard: 'moustache', shirt: C.russet, trousers: C.charcoal, boots: C.black },
  FOLDED,
  102,
  (ctx, l) => {
    bodice(ctx, l, C.weld);
    coat(ctx, l, { hem: 0.42, buttons: C.brass, collar: C.russetDark });
    brimHat(ctx, C.charcoal);
  },
  { works: ['browse', 'talk', 'haggle'] },
);

const journeyman = person(
  'Journeyman',
  { build: 'broad', skin: HUE.skinTan, hair: HUE.hairBlack, hairStyle: 'cropped', beard: 'short', shirt: C.cream, forearm: 'skin', trousers: PAL.leather, boots: PAL.leatherDark, belt: PAL.leatherDark },
  EASY,
  103,
  (ctx, l) => {
    rolledSleeves(ctx, l, C.cream);
    bodice(ctx, l, C.weldDark);
    purse(ctx, l, PAL.leatherDark);
    apple(ctx, 0x8aac3a);
  },
  { works: ['eat', 'browse', 'talk', 'haggle'] },
);

const youth = person(
  'Young man',
  { build: 'average', skin: HUE.skinFair, hair: HUE.hairSandy, hairStyle: 'tied', shirt: C.rose, sleeve: C.cream, forearm: C.cream, trousers: C.seaBlueDark, boots: PAL.leather, belt: PAL.leatherDark },
  EASY,
  104,
  (ctx, l) => {
    skirt(ctx, l, C.rose, { hem: 0.7, flare: 0.03 });
    collar(ctx, l, C.cream);
    flatCap(ctx, C.roseDark);
    feather(ctx, C.cream, 0.27);
  },
  { works: ['browse', 'talk'] },
);

const townswoman = person(
  'Townswoman',
  { build: 'woman', skin: HUE.skinWarm, hair: HUE.hairDark, hairStyle: 'bun', shirt: C.cream, trousers: PAL.leatherDark, boots: PAL.leatherDark },
  EASY_SKIRT,
  105,
  (ctx, l) => {
    bodice(ctx, l, C.seaBlue, C.cream);
    skirt(ctx, l, C.seaBlue, { apron: C.creamDark });
  },
  { works: ['browse', 'talk', 'haggle'] },
);

const matron = person(
  'Goodwoman',
  { build: 'woman', skin: HUE.skinFair, hair: HUE.hairBrown, hairStyle: 'bun', shirt: C.weld, forearm: C.weld, trousers: PAL.leatherDark, boots: PAL.leatherDark },
  BASKET_STAND,
  106,
  (ctx, l) => {
    headscarf(ctx, C.russet);
    shawl(ctx, l, C.russetDark);
    skirt(ctx, l, C.russet, { apron: C.cream });
    armBasket(ctx, [0xb47a3a, 0xa83a2a, 0x8aac3a]);
  },
  { works: ['browse', 'haggle', 'talk'] },
);

const lass = person(
  'Lass',
  { build: 'woman', skin: HUE.skinFair, hair: HUE.hairRed, hairStyle: 'braids', shirt: C.cream, trousers: PAL.leatherDark, boots: PAL.leather },
  EASY_SKIRT,
  107,
  (ctx, l) => {
    bodice(ctx, l, C.rose, C.cream);
    skirt(ctx, l, C.rose, { border: C.weld, hem: 0.1 });
  },
  { works: ['browse', 'talk'] },
);

const wife = person(
  'Wife',
  { build: 'woman', skin: HUE.skinTan, hair: HUE.hairBlack, hairStyle: 'none', shirt: C.seaBlueDark, trousers: PAL.leatherDark, boots: PAL.leatherDark },
  FOLDED,
  108,
  (ctx, l) => {
    coif(ctx, C.cream);
    shawl(ctx, l, C.weld);
    skirt(ctx, l, C.seaBlueDark, { apron: C.cream });
  },
  { works: ['browse', 'talk', 'haggle'] },
);

const oldTownsman = person(
  'Old man',
  { build: 'elder', skin: HUE.skinFair, hair: 0xd0ccc4, hairStyle: 'bald', beard: 'full', shirt: C.seaBlueDark, trousers: C.charcoal, boots: C.black },
  STICK_STAND,
  109,
  (ctx, l) => {
    coat(ctx, l, { hem: 0.46, buttons: C.brass, collar: C.charcoal });
    skullcap(ctx, C.charcoal);
    stick(ctx, 0.84);
  },
);

const oldTownswoman = person(
  'Old woman',
  { build: 'elderWoman', skin: HUE.skinWarm, hair: HUE.hairGrey, hairStyle: 'bun', shirt: C.roseDark, trousers: PAL.leatherDark, boots: PAL.leatherDark },
  FOLDED,
  110,
  (ctx, l) => {
    coif(ctx, C.cream);
    shawl(ctx, l, C.roseDark);
    skirt(ctx, l, C.charcoal, { hem: 0.05 });
  },
  { works: ['talk', 'browse'] },
);

const cityBoy = person(
  'Boy',
  { build: 'child', skin: HUE.skinTan, hair: HUE.hairBlack, hairStyle: 'short', shirt: C.seaBlue, forearm: 'skin', trousers: C.russet, boots: PAL.leather, belt: PAL.leatherDark },
  CHILD_STAND,
  111,
  (ctx, l) => {
    rolledSleeves(ctx, l, C.seaBlue);
    flatCap(ctx, C.russetDark);
  },
);

const cityGirl = person(
  'Girl',
  { build: 'child', skin: HUE.skinFair, hair: HUE.hairSandy, hairStyle: 'braids', shirt: C.cream, trousers: C.creamDark, boots: PAL.leather },
  EASY_SKIRT,
  112,
  (ctx, l) => {
    bodice(ctx, l, C.rose);
    skirt(ctx, l, C.rose, { hem: 0.16, flare: 0.05 });
  },
);

// ------------------------------------------------------------------ the market's stallholders

const baker = person(
  'Baker',
  { build: 'stout', skin: HUE.skinFair, hair: HUE.hairSandy, hairStyle: 'short', shirt: C.cream, forearm: 'skin', trousers: C.creamDark, boots: PAL.leather },
  HOLD_FORTH,
  121,
  (ctx, l) => {
    rolledSleeves(ctx, l, C.cream);
    apron(ctx, l, C.white, true, 0.62);
    bakersCap(ctx, C.white);
    loaf(ctx);
  },
  { works: ['cry'], cries: ['Fresh bread! Still warm from the oven!', "Rolls a ha'penny, loaves a penny!", 'Honey cakes, sweet as summer!'] },
);

const fruiterer = person(
  'Fruiterer',
  { build: 'woman', skin: HUE.skinWarm, hair: HUE.hairBrown, hairStyle: 'braids', shirt: C.cream, forearm: 'skin', trousers: PAL.leatherDark, boots: PAL.leatherDark },
  BASKET_HOLD,
  122,
  (ctx, l) => {
    rolledSleeves(ctx, l, C.cream);
    bodice(ctx, l, C.sage);
    skirt(ctx, l, C.weld, { apron: C.cream, hem: 0.1 });
    armBasket(ctx, FRUIT);
    apple(ctx);
  },
  { works: ['cry'], cries: ['Apples from the Sunreach! Sweet and crisp!', 'Pears and plums, the last of the cherries!'] },
);

const butcher = person(
  'Butcher',
  { build: 'broad', skin: HUE.skinFair, hair: HUE.hairDark, hairStyle: 'bald', beard: 'moustache', shirt: C.cream, forearm: 'skin', trousers: C.charcoal, boots: PAL.leatherDark },
  HOLD_FORTH,
  123,
  (ctx, l) => {
    rolledSleeves(ctx, l, C.cream);
    stripedApron(ctx, l, C.white, C.seaBlue, 0.6);
    cleaver(ctx);
  },
  { works: ['cry'], cries: ['Mutton! Good mutton off the moor!', 'Sausages, made this morning!'] },
);

const clothier = person(
  'Clothier',
  { build: 'average', skin: HUE.skinWarm, hair: HUE.hairDark, hairStyle: 'tied', beard: 'short', shirt: C.rose, trousers: C.seaBlueDark, boots: PAL.leatherDark, belt: PAL.leatherDark },
  BASKET_STAND,
  124,
  (ctx, l) => {
    skirt(ctx, l, C.rose, { hem: 0.66, flare: 0.04 });
    collar(ctx, l, C.cream);
    brimHat(ctx, C.seaBlueDark, C.weld, 0.17);
    clothBolt(ctx, C.seaBlue);
  },
  { works: ['cry'], cries: ['Fine wool, dyed here in Aldhaven!', 'Linen from the Sallows, fit for a king!'] },
);

const leatherworker = person(
  'Leatherworker',
  { build: 'average', skin: HUE.skinTan, hair: HUE.hairBrown, hairStyle: 'short', beard: 'full', shirt: C.cream, forearm: 'skin', trousers: PAL.leatherDark, boots: PAL.leather },
  HOLD_FORTH,
  125,
  (ctx, l) => {
    rolledSleeves(ctx, l, C.cream);
    apron(ctx, l, PAL.leather, true, 0.6);
    strap(ctx);
  },
  { works: ['cry'], cries: ['Belts and purses! Good leather, fair price!', 'Boots mended while you wait!'] },
);

const chandler = person(
  'Chandler',
  { build: 'woman', skin: HUE.skinFair, hair: HUE.hairGrey, hairStyle: 'bun', shirt: C.slate, trousers: PAL.leatherDark, boots: PAL.leatherDark },
  HOLD_FORTH_SKIRT,
  126,
  (ctx, l) => {
    headscarf(ctx, C.cream);
    bodice(ctx, l, C.russet);
    skirt(ctx, l, C.russetDark, { apron: C.cream });
    candles(ctx);
  },
  { works: ['cry'], cries: ['Candles! Tallow and beeswax!', 'Lamp oil and wicks, a light for the long nights!'] },
);

const curioSeller = person(
  'Curio seller',
  { build: 'elder', skin: HUE.skinTan, hair: HUE.hairGrey, hairStyle: 'short', beard: 'full', shirt: C.seaBlueDark, trousers: C.charcoal, boots: PAL.leatherDark },
  HOLD_FORTH,
  127,
  (ctx, l) => {
    coat(ctx, l, { hem: 0.3, buttons: C.brass, collar: C.roseDark });
    skullcap(ctx, C.roseDark);
    curio(ctx);
  },
  { works: ['cry'], cries: ['Curios from over the sea! Glyph-stones from the deep places!', 'A lucky charm, friend? Keeps off the damp and the dead!'] },
);

const flowerSeller = person(
  'Flower seller',
  { build: 'woman', skin: HUE.skinFair, hair: HUE.hairDark, hairStyle: 'long', shirt: C.cream, trousers: PAL.leatherDark, boots: PAL.leather },
  BASKET_HOLD,
  128,
  (ctx, l) => {
    bodice(ctx, l, C.weld);
    skirt(ctx, l, C.sage, { border: C.rose, hem: 0.1 });
    armBasket(ctx, FLOWERS);
    posy(ctx, [FLOWERS[0], FLOWERS[1], FLOWERS[3]]);
  },
  { works: ['cry'], cries: ['Flowers! Fresh flowers for your sweetheart!', 'Violets, a penny a posy!'] },
);

// ------------------------------------------------------------------ the harbour

const docker = person(
  'Docker',
  { build: 'broad', skin: HUE.skinTan, hair: HUE.hairDark, hairStyle: 'cropped', beard: 'stubble', shirt: C.creamDark, sleeve: HUE.skinTan, forearm: 'skin', trousers: PAL.leather, boots: PAL.leatherDark, belt: PAL.leatherDark },
  EASY,
  131,
  (ctx, l) => {
    knitCap(ctx, C.seaBlueDark);
    yoke(ctx, l, PAL.leather);
  },
  { works: ['unload', 'take'], load: { dress: (ctx, l) => shoulderSack(ctx, l), pose: CARRY_SACK } },
);

const porter = person(
  'Porter',
  { build: 'average', skin: HUE.skinWarm, hair: HUE.hairSandy, hairStyle: 'short', shirt: C.weld, forearm: 'skin', trousers: C.russetDark, boots: PAL.leatherDark, belt: PAL.leather },
  EASY,
  132,
  (ctx, l) => {
    rolledSleeves(ctx, l, C.weld);
    flatCap(ctx, C.russet);
  },
  { works: ['unload', 'take'], load: { dress: (ctx, l) => armsCrate(ctx, l), pose: CARRY_CRATE } },
);

const sailor = person(
  'Sailor',
  { build: 'average', skin: HUE.skinTan, hair: HUE.hairBrown, hairStyle: 'tied', beard: 'short', shirt: C.seaBlue, trousers: C.cream, boots: HUE.skinTan },
  EASY,
  133,
  (ctx, l) => {
    skirt(ctx, l, C.seaBlue, { hem: 0.6, flare: 0.05 });
    knitCap(ctx, C.cream);
  },
  { works: ['haul', 'coil', 'talk', 'take'], load: { dress: (ctx, l) => armsCrate(ctx, l), pose: CARRY_CRATE } },
);

const deckhand = person(
  'Deckhand',
  { build: 'average', skin: HUE.skinFair, hair: HUE.hairRed, hairStyle: 'cropped', beard: 'stubble', shirt: C.cream, trousers: C.seaBlueDark, boots: HUE.skinFair },
  COIL_STAND,
  134,
  (ctx, l) => {
    bodice(ctx, l, C.russet);
    headscarf(ctx, C.seaBlueDark);
    ropeCoil(ctx);
  },
  { works: ['coil', 'haul', 'talk'] },
);

const fishwife = person(
  'Fishwife',
  { build: 'woman', skin: HUE.skinWarm, hair: HUE.hairDark, hairStyle: 'bun', shirt: C.cream, forearm: 'skin', trousers: PAL.leatherDark, boots: PAL.leatherDark },
  FISH_STAND,
  135,
  (ctx, l) => {
    rolledSleeves(ctx, l, C.cream);
    headscarf(ctx, C.seaBlueDark);
    skirt(ctx, l, C.seaBlue, { hem: 0.2, apron: 0x9a9a88 });
    fish(ctx);
    knife(ctx);
  },
  { works: ['gut'], cries: ['Herring! Fresh herring off the boats!', 'Cod and mackerel, caught this morning!', 'Oysters! Oysters from the flats!'] },
);

const fisher = person(
  'Fisher',
  { build: 'average', skin: HUE.skinTan, hair: HUE.hairGrey, hairStyle: 'short', beard: 'full', shirt: C.seaBlueDark, trousers: C.cream, boots: PAL.leatherDark },
  NET_STAND,
  136,
  (ctx) => {
    knitCap(ctx, C.charcoal);
    netting(ctx);
  },
  { works: ['mend'] },
);

const customsOfficer = person(
  'Customs officer',
  { build: 'average', skin: HUE.skinFair, hair: HUE.hairDark, hairStyle: 'cropped', beard: 'moustache', shirt: C.slate, trousers: C.black, boots: C.black },
  LEDGER_STAND,
  137,
  (ctx, l) => {
    coat(ctx, l, { hem: 0.42, buttons: C.gold, collar: C.crown });
    badge(ctx, l, 'crown', C.gold);
    armband(ctx, l, C.crown);
    brimHat(ctx, C.black, C.crown, 0.17);
    ledger(ctx);
    quill(ctx);
  },
  { works: ['inspect', 'write'] },
);

const lighthouseKeeper = person(
  'Lighthouse keeper',
  { build: 'elder', skin: HUE.skinTan, hair: 0xd8d4cc, hairStyle: 'short', beard: 'full', shirt: C.seaBlueDark, trousers: C.charcoal, boots: PAL.leatherDark },
  EASY,
  138,
  (ctx) => {
    knitCap(ctx, C.cream);
    pipeInMouth(ctx);
  },
  { works: ['pipe'] },
);

const boatman = person(
  'Boatman',
  { build: 'average', skin: HUE.skinTan, hair: HUE.hairBlack, hairStyle: 'short', beard: 'stubble', shirt: C.cream, trousers: C.charcoal, boots: PAL.leatherDark },
  COIL_STAND,
  139,
  (ctx, l) => {
    bodice(ctx, l, C.russet);
    flatCap(ctx, C.charcoal);
    ropeCoil(ctx);
  },
  { works: ['coil', 'take'] },
);

const bargeman = person(
  'Bargeman',
  { build: 'broad', skin: HUE.skinWarm, hair: HUE.hairBrown, hairStyle: 'tied', beard: 'full', shirt: C.weldDark, forearm: 'skin', trousers: PAL.leather, boots: PAL.leatherDark, belt: PAL.leatherDark },
  EASY,
  140,
  (ctx, l) => {
    rolledSleeves(ctx, l, C.weldDark);
    brimHat(ctx, PAL.leather, PAL.leatherDark, 0.18);
  },
  { works: ['take', 'coil'], load: { dress: (ctx, l) => shoulderSack(ctx, l), pose: CARRY_SACK } },
);

const angler = person(
  'Angler',
  { build: 'average', skin: HUE.skinFair, hair: HUE.hairSandy, hairStyle: 'short', beard: 'short', shirt: C.sage, trousers: C.creamDark, boots: PAL.leatherDark },
  ROD_STAND,
  141,
  (ctx) => {
    strawHat(ctx, HUE.straw, C.seaBlueDark);
    rod(ctx);
  },
  { works: ['fish'] },
);

// ------------------------------------------------------------------ Guild Row

const smithApprentice = person(
  "Smith's apprentice",
  { build: 'average', skin: HUE.skinFair, hair: HUE.hairRed, hairStyle: 'short', shirt: C.charcoal, sleeve: HUE.skinFair, forearm: 'skin', hands: PAL.leatherDark, trousers: PAL.leatherDark, boots: PAL.woodDark },
  TONGS_STAND,
  151,
  (ctx, l) => {
    apron(ctx, l, PAL.leather, true, 0.56);
    hotTongs(ctx);
  },
  { works: ['quench'] },
);

const forgeHand = person(
  'Forge hand',
  { build: 'stout', skin: HUE.skinTan, hair: HUE.hairBlack, hairStyle: 'cropped', beard: 'short', shirt: PAL.clothDark, sleeve: HUE.skinTan, forearm: 'skin', hands: PAL.leatherDark, trousers: PAL.leatherDark, boots: PAL.woodDark },
  EASY,
  152,
  (ctx, l) => {
    apron(ctx, l, PAL.leatherDark, true, 0.56);
    cuffs(ctx, l, PAL.leatherDark);
  },
  { works: ['bellows'] },
);

const apothecary = person(
  "Apothecary's apprentice",
  { build: 'woman', skin: HUE.skinFair, hair: HUE.hairBrown, hairStyle: 'braids', shirt: C.cream, forearm: C.cream, trousers: PAL.leatherDark, boots: PAL.leatherDark },
  MORTAR_STAND,
  153,
  (ctx, l) => {
    skirt(ctx, l, C.sage, { apron: C.creamDark });
    mortar(ctx);
  },
  { works: ['grind'] },
);

const tanner = person(
  'Tanner',
  { build: 'broad', skin: HUE.skinTan, hair: HUE.hairDark, hairStyle: 'bald', beard: 'short', shirt: C.creamDark, sleeve: HUE.skinTan, forearm: 'skin', trousers: PAL.leatherDark, boots: PAL.leatherDark },
  SCRAPER_STAND,
  154,
  (ctx, l) => {
    apron(ctx, l, PAL.leather, true, 0.7);
    scraper(ctx);
  },
  { works: ['scrape'] },
);

const dyer = person(
  'Dyer',
  { build: 'average', skin: HUE.skinFair, hair: HUE.hairBrown, hairStyle: 'short', beard: 'stubble', shirt: C.cream, forearm: WOAD_STAIN, hands: WOAD_STAIN, trousers: C.slate, boots: PAL.leatherDark },
  CROOK_STAND,
  155,
  (ctx, l) => {
    apron(ctx, l, 0x7a8098, false, 0.62);
    paddle(ctx, INDIGO);
  },
  { works: ['stir'] },
);

const joiner = person(
  'Joiner',
  { build: 'average', skin: HUE.skinWarm, hair: HUE.hairSandy, hairStyle: 'short', beard: 'short', shirt: C.weld, forearm: 'skin', trousers: PAL.leather, boots: PAL.leatherDark },
  SAW_STAND,
  156,
  (ctx, l) => {
    rolledSleeves(ctx, l, C.weld);
    apron(ctx, l, PAL.leather, false, 0.5);
    flatCap(ctx, PAL.leather);
    saw(ctx);
  },
  { works: ['saw'] },
);

// ------------------------------------------------------------------ about the city

const groom = person(
  'Groom',
  { build: 'average', skin: HUE.skinTan, hair: HUE.hairDark, hairStyle: 'short', shirt: C.cream, forearm: 'skin', trousers: PAL.leather, boots: PAL.leatherDark, belt: PAL.leatherDark },
  CROOK_STAND,
  161,
  (ctx, l) => {
    rolledSleeves(ctx, l, C.cream);
    bodice(ctx, l, PAL.leather);
    fork(ctx);
  },
  { works: ['fork'] },
);

/** A hay fork, upright through the fist with its tines high. */
function fork(ctx: DressContext): void {
  const h = ctx.on('handR');
  h.cyl(0.018, 0.018, 1.55, 5, { at: [0, -0.02, -0.05], rot: [Math.PI / 2, 0, 0], color: PAL.wood }).box(0.14, 0.02, 0.03, { at: [0, -0.02, 0.73], color: PAL.ironDark });
  for (const x of [-0.06, 0.06]) h.box(0.015, 0.015, 0.24, { at: [x, -0.02, 0.86], color: PAL.iron });
}

const gardener = person(
  'Gardener',
  { build: 'elder', skin: HUE.skinWarm, hair: HUE.hairGrey, hairStyle: 'short', beard: 'stubble', shirt: C.sage, trousers: PAL.leather, boots: PAL.leatherDark },
  CROOK_STAND,
  162,
  (ctx, l) => {
    strawHat(ctx, HUE.strawDark);
    apron(ctx, l, PAL.leather, false, 0.5);
    rake(ctx);
  },
  { works: ['rake'] },
);

const gardenWife = person(
  'Weeder',
  { build: 'woman', skin: HUE.skinTan, hair: HUE.hairBrown, hairStyle: 'bun', shirt: C.cream, forearm: 'skin', trousers: PAL.leatherDark, boots: PAL.leatherDark },
  BASKET_STAND,
  163,
  (ctx, l) => {
    rolledSleeves(ctx, l, C.cream);
    headscarf(ctx, C.sage);
    skirt(ctx, l, C.russetDark, { hem: 0.14, apron: PAL.leather });
    armBasket(ctx, [0x5a8a3a, 0x6a9a44, 0x4e7a34]);
  },
  { works: ['weed'] },
);

const archer = person(
  'Archer',
  { build: 'average', skin: HUE.skinFair, hair: HUE.hairBrown, hairStyle: 'short', beard: 'stubble', shirt: C.weld, trousers: PAL.leather, boots: PAL.leatherDark, belt: PAL.leatherDark },
  BOW_STAND,
  164,
  (ctx, l) => {
    bodice(ctx, l, PAL.leather);
    flatCap(ctx, C.russet);
    feather(ctx, C.cream, 0.27);
    quiver(ctx, C.cream);
    bow(ctx, { tips: PAL.leatherDark, string: HUE.bowString });
  },
  { works: ['archery'] },
);

const clerk = person(
  'Clerk',
  { build: 'average', skin: HUE.skinFair, hair: HUE.hairBlack, hairStyle: 'short', shirt: C.slate, trousers: C.black, boots: C.black },
  LEDGER_STAND,
  165,
  (ctx, l) => {
    coat(ctx, l, { hem: 0.45, collar: C.cream });
    spectacles(ctx, PAL.ironDark);
    // Ink on the cuffs.
    cuffs(ctx, l, 0x2a2c3a, 0.04);
    ledger(ctx);
    quill(ctx);
  },
  { works: ['write', 'ledger'] },
);

const secretary = person(
  'Secretary',
  { build: 'average', skin: HUE.skinWarm, hair: HUE.hairDark, hairStyle: 'tied', shirt: C.corvane, trousers: C.black, boots: C.black },
  LEDGER_STAND,
  166,
  (ctx, l) => {
    coat(ctx, l, { hem: 0.45, buttons: C.corvaneKey, collar: C.black });
    badge(ctx, l, 'key', C.corvaneKey);
    ledger(ctx, C.black);
    quill(ctx);
  },
  { works: ['write'] },
);

const corvaneServant = person(
  'Corvane servant',
  { build: 'average', skin: HUE.skinFair, hair: HUE.hairBrown, hairStyle: 'short', shirt: C.corvane, sleeve: C.corvaneDark, trousers: C.black, boots: C.black },
  BASKET_STAND,
  167,
  (ctx, l) => {
    coat(ctx, l, { hem: 0.5, buttons: C.corvaneKey, collar: C.black });
    badge(ctx, l, 'key', C.corvaneKey, C.corvaneKey);
    armBasket(ctx, [C.cream, 0xb47a3a]);
  },
  { works: ['browse'] },
);

const corvaneMaid = person(
  'Corvane maid',
  { build: 'woman', skin: HUE.skinWarm, hair: HUE.hairDark, hairStyle: 'none', shirt: C.corvane, trousers: C.black, boots: C.black },
  BASKET_STAND,
  168,
  (ctx, l) => {
    coif(ctx, C.white);
    skirt(ctx, l, C.corvaneDark, { apron: C.white });
    badge(ctx, l, 'key', C.corvaneKey, C.corvaneKey);
    armBasket(ctx, [C.cream, 0xa83a2a, 0xb47a3a]);
  },
  { works: ['browse'] },
);

const harrowgateServant = person(
  'Harrowgate servant',
  { build: 'average', skin: HUE.skinWarm, hair: HUE.hairGrey, hairStyle: 'cropped', beard: 'short', shirt: C.harrowgate, sleeve: C.harrowgateDark, trousers: C.charcoal, boots: C.black },
  FOLDED,
  169,
  (ctx, l) => {
    coat(ctx, l, { hem: 0.5, buttons: C.harrowgateTower, collar: C.harrowgateDark });
    badge(ctx, l, 'tower', C.harrowgateTower, C.harrowgateTower);
  },
);

const ashbyServant = person(
  'Ashby servant',
  { build: 'woman', skin: HUE.skinFair, hair: HUE.hairSandy, hairStyle: 'none', shirt: C.ashby, trousers: PAL.leatherDark, boots: PAL.leatherDark },
  CROOK_STAND,
  170,
  (ctx, l) => {
    coif(ctx, C.white);
    skirt(ctx, l, C.ashbyDark, { apron: C.white });
    badge(ctx, l, 'ship', C.ashbyShip, C.ashbyShip);
    broom(ctx);
  },
  { works: ['sweep'] },
);

const nurse = person(
  'Nurse',
  { build: 'woman', skin: HUE.skinWarm, hair: HUE.hairBrown, hairStyle: 'none', shirt: C.cream, trousers: PAL.leatherDark, boots: PAL.leatherDark },
  FOLDED,
  171,
  (ctx, l) => {
    coif(ctx, C.white);
    bodice(ctx, l, C.seaBlue);
    skirt(ctx, l, C.seaBlueDark, { apron: C.white });
  },
  { works: ['talk'] },
);

const mourner = person(
  'Mourner',
  { build: 'woman', skin: HUE.skinFair, hair: HUE.hairDark, hairStyle: 'none', shirt: C.black, trousers: C.black, boots: C.black },
  FOLDED,
  172,
  (ctx, l) => {
    headscarf(ctx, C.black);
    shawl(ctx, l, C.charcoal);
    skirt(ctx, l, C.black, { hem: 0.08 });
  },
  { works: ['mourn'] },
);

const mournerMan = person(
  'Mourner',
  { build: 'average', skin: HUE.skinFair, hair: HUE.hairGrey, hairStyle: 'short', beard: 'short', shirt: C.black, trousers: C.black, boots: C.black },
  FOLDED,
  173,
  (ctx, l) => {
    coat(ctx, l, { hem: 0.4, collar: C.charcoal });
    brimHat(ctx, C.black, C.charcoal, 0.17);
  },
  { works: ['mourn'] },
);

const beggar = person(
  'Beggar',
  { build: 'elder', skin: HUE.skinTan, hair: HUE.hairGrey, hairStyle: 'long', beard: 'full', shirt: 0x6a5e4a, trousers: 0x5a4e3a, boots: HUE.skinTan },
  BOWL_STAND,
  174,
  (ctx, l) => {
    patches(ctx, l, [0x7a6a50, 0x4a4234, 0x8a7a5a]);
    hood(ctx, l, 0x5a5040);
    bowl(ctx);
  },
  { works: ['beg'] },
);

const waterCarrier = person(
  'Water carrier',
  { build: 'woman', skin: HUE.skinFair, hair: HUE.hairDark, hairStyle: 'bun', shirt: C.cream, forearm: 'skin', trousers: PAL.leatherDark, boots: PAL.leatherDark },
  BUCKET_STAND,
  175,
  (ctx, l) => {
    rolledSleeves(ctx, l, C.cream);
    headscarf(ctx, C.weld);
    skirt(ctx, l, C.russet, { hem: 0.12 });
    bucket(ctx);
  },
  { works: ['drawWater'] },
);

const miller = person(
  'Miller',
  { build: 'stout', skin: HUE.skinFair, hair: HUE.hairBrown, hairStyle: 'short', beard: 'moustache', shirt: C.flour, forearm: 'skin', trousers: C.creamDark, boots: PAL.leather },
  EASY,
  176,
  (ctx, l) => {
    rolledSleeves(ctx, l, C.flour);
    apron(ctx, l, C.white, false, 0.6);
    flatCap(ctx, C.flour);
  },
  { works: ['unload', 'take'], load: { dress: (ctx, l) => shoulderSack(ctx, l, C.flour), pose: CARRY_SACK } },
);

const farmhand = person(
  'Farmhand',
  { build: 'average', skin: HUE.skinTan, hair: HUE.hairSandy, hairStyle: 'short', beard: 'stubble', shirt: C.cream, forearm: 'skin', trousers: PAL.leather, boots: PAL.leatherDark },
  CROOK_STAND,
  177,
  (ctx, l) => {
    rolledSleeves(ctx, l, C.cream);
    strawHat(ctx, HUE.straw);
    hoe(ctx);
  },
  { works: ['hoe'] },
);

const picker = person(
  'Picker',
  { build: 'woman', skin: HUE.skinWarm, hair: HUE.hairRed, hairStyle: 'braids', shirt: C.cream, forearm: 'skin', trousers: PAL.leatherDark, boots: PAL.leatherDark },
  BASKET_STAND,
  178,
  (ctx, l) => {
    rolledSleeves(ctx, l, C.cream);
    headscarf(ctx, C.rose);
    bodice(ctx, l, C.weldDark);
    skirt(ctx, l, C.sage, { hem: 0.12 });
    armBasket(ctx, FRUIT);
  },
  { works: ['pick'] },
);

const traveller = person(
  'Traveller',
  { build: 'average', skin: HUE.skinWarm, hair: HUE.hairBrown, hairStyle: 'short', beard: 'short', shirt: C.russet, trousers: PAL.leather, boots: PAL.leatherDark, belt: PAL.leatherDark },
  CROOK_STAND,
  179,
  (ctx, l) => {
    hood(ctx, l, 0x6a5038);
    pack(ctx, l, PAL.leather, C.creamDark);
    staff(ctx);
  },
);

// ------------------------------------------------------------------ the named

const hesterGale = person(
  'Hester Gale',
  { build: 'woman', skin: HUE.skinFair, hair: 0x7a3a22, hairStyle: 'bun', shirt: C.cream, forearm: 'skin', trousers: PAL.leatherDark, boots: PAL.leatherDark },
  TANKARD_STAND,
  191,
  (ctx, l) => {
    rolledSleeves(ctx, l, C.cream);
    bodice(ctx, l, C.russet, C.cream);
    skirt(ctx, l, C.seaBlueDark, { apron: C.white });
    tankard(ctx);
    rag(ctx);
  },
  { works: ['innkeeper'] },
);

const oldNan = person(
  'Old Nan Brindle',
  { build: 'elderWoman', skin: HUE.skinFair, hair: 0xdcd8d0, hairStyle: 'bun', shirt: C.charcoal, trousers: PAL.leatherDark, boots: PAL.leatherDark },
  CROOK_STAND,
  192,
  (ctx, l) => {
    shawl(ctx, l, C.roseDark);
    skirt(ctx, l, C.charcoal, { hem: 0.05, apron: C.cream });
    broom(ctx);
  },
  { works: ['sweep'] },
);

const dobbs = person(
  'Coachman Dobbs',
  { build: 'stout', skin: 0xd09a7a, hair: HUE.hairGrey, hairStyle: 'short', beard: 'moustache', shirt: C.charcoal, trousers: PAL.leather, boots: C.black },
  EASY,
  193,
  (ctx, l) => {
    coat(ctx, l, { hem: 0.32, buttons: C.brass, collar: C.black });
    capelet(ctx, l, C.slate);
    brimHat(ctx, C.black, C.brass, 0.22);
    whipAtBelt(ctx, l);
    brush(ctx);
  },
  { works: ['brush'] },
);

const wren = person(
  'Mistress Wren',
  { build: 'woman', skin: HUE.skinFair, hair: 0x7a7068, hairStyle: 'bun', shirt: C.slate, trousers: PAL.leatherDark, boots: C.black },
  BOOK_STAND,
  194,
  (ctx, l) => {
    spectacles(ctx, C.brass);
    shawl(ctx, l, C.charcoal);
    skirt(ctx, l, C.slate, { hem: 0.06 });
    book(ctx, C.russetDark);
  },
  { works: ['read'] },
);

const bramTolliver = person(
  'Bram Tolliver',
  { build: 'stout', skin: HUE.skinTan, hair: 0xb8b4ac, hairStyle: 'short', beard: 'full', shirt: C.seaBlueDark, trousers: C.charcoal, boots: C.black },
  LEDGER_STAND,
  195,
  (ctx, l) => {
    coat(ctx, l, { hem: 0.4, buttons: C.brass, collar: C.charcoal });
    tricorn(ctx, C.charcoal, C.brass);
    ledger(ctx);
  },
  { works: ['ledger', 'signal', 'talk'] },
);

/** Master smith Garran Holt: Oakvale's smith's dress, grey-bearded, at the Great Forge. */
const garranHolt: Person = {
  ...PEOPLE.smith,
  label: 'Garran Holt',
  seed: 196,
  look: { ...PEOPLE.smith.look, skin: HUE.skinWarm, hair: HUE.hairGrey, beard: 'full', shirt: C.charcoal },
  works: ['smith'],
};

const ilsaMarrow = person(
  'Ilsa Marrow',
  { build: 'woman', skin: HUE.skinFair, hair: HUE.hairBlack, hairStyle: 'braids', shirt: C.cream, forearm: 'skin', trousers: PAL.leatherDark, boots: PAL.leatherDark },
  HERBS_STAND,
  197,
  (ctx, l) => {
    rolledSleeves(ctx, l, C.cream);
    skirt(ctx, l, C.sage, { apron: HUE.linenDark, border: 0x5a7a3a });
    sash(ctx, l, PAL.leather);
    herbs(ctx);
  },
  { works: ['herbalist'] },
);

// ------------------------------------------------------------------ the cast

/**
 * The city's cast, by name (people/cast.ts spreads it into the cast): the
 * crowd's twelve, the stallholders, the harbour, Guild Row and the fields,
 * the liveries, and the named. Where a spec puts two at the same work side by
 * side, a second of the look in other hair and cloth.
 */
export const CITY_CAST = {
  townsman,
  burgher,
  journeyman,
  youth,
  townswoman,
  matron,
  lass,
  wife,
  oldTownsman,
  oldTownswoman,
  cityBoy,
  cityGirl,
  baker,
  fruiterer,
  butcher,
  clothier,
  leatherworker,
  chandler,
  curioSeller,
  flowerSeller,
  docker,
  docker2: another(docker, 'Docker', 142, { skin: HUE.skinDark, hair: HUE.hairBlack, beard: 'short', shirt: C.weldDark, trousers: C.charcoal }),
  docker3: another(docker, 'Docker', 148, { skin: HUE.skinFair, hair: HUE.hairSandy, hairStyle: 'short', beard: 'none', shirt: C.russet, trousers: C.seaBlueDark }),
  porter,
  porter2: another(porter, 'Porter', 143, { skin: HUE.skinFair, hair: HUE.hairRed, shirt: C.cream, trousers: PAL.leather }),
  sailor,
  sailor2: another(sailor, 'Sailor', 149, { skin: HUE.skinFair, hair: HUE.hairRed, hairStyle: 'short', beard: 'full', trousers: C.creamDark }),
  sailor3: another(sailor, 'Sailor', 150, { skin: HUE.skinDark, hair: HUE.hairBlack, hairStyle: 'cropped', beard: 'none', trousers: C.charcoal }),
  deckhand,
  fishwife,
  fishwife2: another(fishwife, 'Fishwife', 144, { skin: HUE.skinFair, hair: HUE.hairRed, shirt: C.creamDark }),
  fishwife3: another(fishwife, 'Fishwife', 145, { skin: HUE.skinTan, hair: HUE.hairGrey, shirt: C.weld, forearm: C.weld }),
  fisher,
  fisher2: another(fisher, 'Fisher', 146, { skin: HUE.skinWarm, hair: HUE.hairBlack, beard: 'stubble', shirt: C.russetDark }),
  customsOfficer,
  lighthouseKeeper,
  boatman,
  bargeman,
  angler,
  angler2: another(angler, 'Angler', 147, { skin: HUE.skinTan, hair: HUE.hairGrey, shirt: C.seaBlueDark, beard: 'full' }),
  smithApprentice,
  forgeHand,
  apothecary,
  tanner,
  tanner2: another(tanner, 'Tanner', 157, { skin: HUE.skinWarm, hair: HUE.hairBrown, hairStyle: 'short', beard: 'stubble' }),
  dyer,
  dyer2: another(dyer, 'Dyer', 158, { hair: HUE.hairBlack, hairStyle: 'tied', beard: 'none', shirt: C.creamDark, trousers: C.charcoal }),
  joiner,
  groom,
  gardener,
  gardenWife,
  archer,
  archer2: another(archer, 'Archer', 180, { skin: HUE.skinTan, hair: HUE.hairBlack, beard: 'short', shirt: C.seaBlue }),
  clerk,
  secretary,
  corvaneServant,
  corvaneMaid,
  harrowgateServant,
  ashbyServant,
  nurse,
  mourner,
  mournerMan,
  beggar,
  waterCarrier,
  miller,
  farmhand,
  picker,
  traveller,
  hesterGale,
  oldNan,
  dobbs,
  wren,
  bramTolliver,
  garranHolt,
  ilsaMarrow,
} satisfies Record<string, Person>;
