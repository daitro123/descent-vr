import { apron, body, HUE, head, hood, type Look, rolledSleeves } from './human';
import type { Person } from './people';
import { PAL } from './palette';
import type { DressContext, Pose } from './rig';

// Plain villagers with no trade of their own, in the human body (human.ts):
// someone for any zone's lanes and squares until a model family dresses that
// zone's own people. Undyed wool and linen, browns and ochre, bare faces: no
// blue and gold (Hale's), no red at the face or waist (a bandit's), no green
// hood (an archer's).

const PI = Math.PI;

/** Wool as it comes off the sheep: a grey-brown. */
const WOOL = 0x7a6e5c;
const WOOL_DARK = 0x5a5044;

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
  build: 'stout',
  skin: HUE.skinFair,
  hair: HUE.hairRed,
  hairStyle: 'tied',
  shirt: HUE.linen,
  forearm: 'skin',
  trousers: HUE.russet,
  boots: PAL.leatherDark,
  belt: PAL.leather,
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

/** Stout, red hair tied back: rolled linen sleeves, an ochre shawl round the shoulders, a long apron and a basket. */
function dressGoodwife(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  rolledSleeves(ctx, l, HUE.linen);
  const L = ctx.p.spine;
  ctx.on('spine').taper(0.5, 0.3, 0.34, 0.27, 0.14, { at: [0, L - 0.1, -0.005], color: HUE.ochre, jitter: 0.08 });
  apron(ctx, l, HUE.linenDark, false, 0.72);
  basket(ctx);
}

/** The plain villagers, by their cast name (people/cast.ts). */
export const COMMONERS = {
  shepherd: { label: 'Shepherd', look: SHEPHERD_LOOK, stand: CROOK_STAND, dress: dressShepherd, seed: 71 },
  goodwife: { label: 'Goodwife', look: GOODWIFE_LOOK, stand: BASKET_STAND, dress: dressGoodwife, seed: 72 },
} satisfies Record<string, Person>;
