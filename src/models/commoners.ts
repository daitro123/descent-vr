import { body, coif, HUE, head, hood, type Look, robe, rolledSleeves, shawl, shade, skirt } from './human';
import type { Person } from './people';
import { PAL } from './palette';
import type { DressContext, Pose } from './rig';

// Plain villagers with no trade of their own, in the human body (human.ts):
// someone for any zone's lanes and squares until a model family dresses that
// zone's own people, one or two in each build: grown men and women, an old
// man and an old woman, a boy and a girl, and a friar and a sister in the
// long robe. Undyed wool and linen, browns and ochre, bare faces: no blue and
// gold (Hale's), no red at the face or waist (a bandit's), no green hood (an
// archer's).

const PI = Math.PI;

/** Wool as it comes off the sheep: a grey-brown. */
const WOOL = 0x7a6e5c;
const WOOL_DARK = 0x5a5044;
/** A habit's brown, and wool dyed with walnut hulls. */
const HABIT = 0x5e4632;
/** Wool dyed with weld: a soft yellow-green. */
const WELD = 0x9a9a5a;

/** Standing easy, hands at the sides. */
const EASY: Pose = {
  spine: [0.02, 0, 0],
  upperArmL: [0.04, 0, 0.1],
  forearmL: [-0.2, 0, 0],
  upperArmR: [0.04, 0, -0.1],
  forearmR: [-0.2, 0, 0],
  thighL: [-0.04, 0, 0.03],
  thighR: [0.03, 0, -0.03],
};

/** Standing easy in a skirt, the hands clear of it. */
const EASY_SKIRT: Pose = { ...EASY, upperArmL: [0.04, 0, 0.17], upperArmR: [0.04, 0, -0.17] };

/** Hands folded before the waist: into their sleeves, or holding their shawl. */
const FOLDED: Pose = {
  ...EASY,
  upperArmL: [-0.18, 0, 0.12],
  forearmL: [-1.25, -0.55, 0],
  handL: [0, 0, 0],
  upperArmR: [-0.18, 0, -0.12],
  forearmR: [-1.25, 0.55, 0],
  handR: [0, 0, 0],
};

/** An old man's stand: leaning on a stick planted ahead at the right, the left hand easy. */
const STICK_STAND: Pose = {
  ...EASY,
  upperArmL: [0.02, 0, 0.12],
  forearmL: [-0.35, 0, 0],
  upperArmR: [-0.32, 0, -0.14],
  forearmR: [-0.62, 0, 0],
  handR: [0.75, 0, 0],
};

/** A child's stand: weight on one leg, head cocked, looking about. */
const CHILD_STAND: Pose = {
  ...EASY,
  spine: [0, 0.08, 0.04],
  head: [0.05, -0.15, 0.08],
  upperArmL: [0.08, 0, 0.14],
  upperArmR: [0.04, 0, -0.08],
  forearmR: [-0.45, 0, 0],
  thighL: [-0.1, 0, 0.08],
  shinL: [0.12, 0, 0],
  thighR: [0.03, 0, -0.04],
};

/** A shepherd's crook planted upright at their right side, the right forearm level. */
const CROOK_STAND: Pose = {
  spine: [0.02, 0, 0],
  upperArmL: [0.04, 0, 0.1],
  forearmL: [-0.2, 0, 0],
  upperArmR: [-0.25, 0, -0.22],
  forearmR: [-1.25, 0, 0],
  thighL: [-0.04, 0, 0.03],
  thighR: [0.03, 0, -0.03],
};

/** A basket on the left forearm, held across the body; the right hand easy. */
const BASKET_STAND: Pose = {
  spine: [0.02, 0, 0],
  upperArmL: [-0.15, 0.25, 0.12],
  forearmL: [-1.45, 0, 0],
  handL: [0.1, 0, 0],
  upperArmR: [0.04, 0, -0.1],
  forearmR: [-0.2, 0, 0],
  thighL: [-0.04, 0, 0.03],
  thighR: [0.03, 0, -0.03],
};

const SHEPHERD_LOOK: Look = {
  build: 'average',
  skin: HUE.skinWarm,
  hair: HUE.hairGrey,
  hairStyle: 'short',
  beard: 'full',
  shirt: WOOL,
  sleeve: WOOL,
  forearm: HUE.linenDark,
  trousers: PAL.leather,
  boots: PAL.leatherDark,
  belt: PAL.leatherDark,
};

/** Along the hand's Z, so it stands upright with the forearm held level: an ash staff and its hook. */
function crook(ctx: DressContext): void {
  const b = ctx.on('handR');
  b.cyl(0.018, 0.018, 1.6, 5, { at: [0, -0.02, -0.02], rot: [PI / 2, 0, 0], color: PAL.wood })
    .cyl(0.016, 0.016, 0.16, 5, { at: [0, 0.04, 0.82], rot: [PI / 2 + 0.9, 0, 0], color: PAL.wood })
    .cyl(0.016, 0.016, 0.1, 5, { at: [0, 0.1, 0.78], rot: [0.3, 0, 0], color: PAL.wood });
}

/** Grey-bearded in a wool hood and jerkin over a linen shirt, leaning their weight on a crook. */
function dressShepherd(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  hood(ctx, l, WOOL_DARK);
  crook(ctx);
}

const GOODWIFE_LOOK: Look = {
  build: 'woman',
  skin: HUE.skinFair,
  hair: HUE.hairRed,
  hairStyle: 'bun',
  shirt: HUE.linen,
  forearm: 'skin',
  trousers: PAL.leatherDark,
  boots: PAL.leatherDark,
};

/** A wicker basket hung on the left forearm, a cloth over what's in it. */
function basket(ctx: DressContext): void {
  ctx
    .on('forearmL')
    .box(0.3, 0.16, 0.2, { at: [0.02, -0.26, 0.12], color: HUE.strawDark, jitter: 0.12 })
    .box(0.27, 0.02, 0.17, { at: [0.02, -0.17, 0.12], color: HUE.linen })
    .box(0.02, 0.14, 0.02, { at: [-0.12, -0.12, 0.12], rot: [0, 0, -0.5], color: HUE.strawDark })
    .box(0.02, 0.14, 0.02, { at: [0.16, -0.12, 0.12], rot: [0, 0, 0.5], color: HUE.strawDark });
}

/** Red hair pinned up: rolled linen sleeves, an ochre shawl round the shoulders, a russet skirt to the ankles under a long apron, and a basket. */
function dressGoodwife(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  rolledSleeves(ctx, l, HUE.linen);
  shawl(ctx, l, HUE.ochre);
  skirt(ctx, l, HUE.russet, { apron: HUE.linenDark });
  basket(ctx);
}

const MAID_LOOK: Look = {
  build: 'woman',
  skin: HUE.skinWarm,
  hair: HUE.hairSandy,
  hairStyle: 'braids',
  shirt: HUE.linen,
  forearm: HUE.linen,
  trousers: PAL.leatherDark,
  boots: PAL.leatherDark,
  belt: PAL.leather,
};

/** Sandy braids over the shoulders: a linen shirt and a weld-green skirt with an ochre border, a leather belt. */
function dressMaid(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  skirt(ctx, l, WELD, { border: HUE.ochre, hem: 0.1 });
}

const GREYBEARD_LOOK: Look = {
  build: 'elder',
  skin: HUE.skinFair,
  hair: 0xc8c4bc,
  hairStyle: 'bald',
  beard: 'full',
  shirt: WOOL_DARK,
  sleeve: WOOL_DARK,
  forearm: WOOL_DARK,
  trousers: HUE.linenDark,
  boots: PAL.leatherDark,
  belt: PAL.leather,
};

/** A walking stick in the right hand, held along the hand's -Y: it reaches the ground ahead of the right foot. */
function stick(ctx: DressContext, len: number): void {
  ctx
    .on('handR')
    .cyl(0.018, 0.016, len, 5, { at: [0, -len / 2 + 0.03, 0.01], color: PAL.woodDark })
    .box(0.03, 0.035, 0.06, { at: [0, 0.015, 0.02], color: PAL.wood });
}

/** White-bearded and bald, stooped: a long dark wool coat over linen, and a stick to lean on. */
function dressGreybeard(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  // The coat's skirts to the knee, draped like a skirt so they swing as he walks.
  skirt(ctx, l, WOOL_DARK, { hem: 0.46, flare: 0.04 });
  stick(ctx, 0.84);
}

const GRANNY_LOOK: Look = {
  build: 'elderWoman',
  skin: HUE.skinFair,
  hair: HUE.hairGrey,
  hairStyle: 'bun',
  shirt: WOOL,
  forearm: WOOL,
  trousers: PAL.leatherDark,
  boots: PAL.leatherDark,
};

/** Stooped, grey hair under a linen coif: a dark wool shawl over her hands, a brown skirt to the ground. */
function dressGranny(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  coif(ctx, HUE.apronWhite);
  shawl(ctx, l, WOOL_DARK);
  skirt(ctx, l, HABIT, { hem: 0.05, apron: HUE.linenDark });
}

const BOY_LOOK: Look = {
  build: 'child',
  skin: HUE.skinWarm,
  hair: HUE.hairBrown,
  hairStyle: 'short',
  shirt: HUE.linen,
  forearm: 'skin',
  trousers: WOOL,
  boots: PAL.leather,
  belt: PAL.leatherDark,
};

/** A boy in a linen shirt with the sleeves pushed up and grey-brown breeches. */
function dressBoy(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  rolledSleeves(ctx, l, HUE.linen);
}

const GIRL_LOOK: Look = {
  build: 'child',
  skin: HUE.skinFair,
  hair: HUE.hairRed,
  hairStyle: 'braids',
  shirt: HUE.linen,
  trousers: HUE.linenDark,
  boots: PAL.leather,
};

/** A girl with red braids: a linen shirt and an ochre pinafore skirt to the calves. */
function dressGirl(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  skirt(ctx, l, HUE.ochre, { hem: 0.16, flare: 0.05 });
}

const FRIAR_LOOK: Look = {
  build: 'average',
  skin: HUE.skinWarm,
  hair: HUE.hairBrown,
  hairStyle: 'bald',
  shirt: HABIT,
  trousers: HABIT,
  boots: PAL.leatherDark,
};

/** A friar in a brown habit to the feet, its hood down on the shoulders, a rope at the waist. */
function dressFriar(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  robe(ctx, l, HABIT, { cord: HUE.linen });
  // The hood lies back on the shoulders.
  const L = ctx.p.spine;
  ctx
    .on('spine')
    .taper(0.44, 0.3, 0.34, 0.27, 0.12, { at: [0, L - 0.07, -0.01], color: shade(HABIT, 0.9) })
    .taper(0.26, 0.06, 0.2, 0.06, 0.16, { at: [0, L - 0.12, -0.17], rot: [-0.2, 0, 0], color: shade(HABIT, 0.9) });
}

const SISTER_LOOK: Look = {
  build: 'woman',
  skin: HUE.skinFair,
  hair: HUE.hairDark,
  hairStyle: 'none',
  shirt: HUE.apronWhite,
  trousers: HUE.apronWhite,
  boots: PAL.leatherDark,
};

/** A sister in a cream habit to the feet with a stole of undyed linen, her hair under a white coif. */
function dressSister(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  coif(ctx, 0xeae4d4);
  robe(ctx, l, 0xd4ccb4, { cord: PAL.leather, stole: HUE.linenDark });
}

/** The plain villagers, by their cast name (people/cast.ts). */
export const COMMONERS = {
  shepherd: { label: 'Shepherd', look: SHEPHERD_LOOK, stand: CROOK_STAND, dress: dressShepherd, seed: 71 },
  goodwife: { label: 'Goodwife', look: GOODWIFE_LOOK, stand: BASKET_STAND, dress: dressGoodwife, seed: 72 },
  maid: { label: 'Maid', look: MAID_LOOK, stand: EASY_SKIRT, dress: dressMaid, seed: 73 },
  greybeard: { label: 'Greybeard', look: GREYBEARD_LOOK, stand: STICK_STAND, dress: dressGreybeard, seed: 74 },
  granny: { label: 'Granny', look: GRANNY_LOOK, stand: FOLDED, dress: dressGranny, seed: 75 },
  boy: { label: 'Boy', look: BOY_LOOK, stand: CHILD_STAND, dress: dressBoy, seed: 76 },
  girl: { label: 'Girl', look: GIRL_LOOK, stand: EASY_SKIRT, dress: dressGirl, seed: 77 },
  friar: { label: 'Friar', look: FRIAR_LOOK, stand: FOLDED, dress: dressFriar, seed: 78 },
  sister: { label: 'Sister', look: SISTER_LOOK, stand: FOLDED, dress: dressSister, seed: 79 },
} satisfies Record<string, Person>;
