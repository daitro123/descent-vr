import { BUILDS, body, cuffs, HUE, head, type Look, robe, robed, shade, shawl, sheathedSword, skirt } from './human';
import { PAL } from './palette';
import type { Person } from './people';
import { CRIMSON, SABLE } from './clergy';
import { badge, chain, closedBook, coin, coinBox, flatCap, keyPendant, ledger, openBook, sealRing, spectacles } from './props';
import type { DressContext } from './rig';
import { ARMS_FOLDED, BEHIND, COUNTING, EASY_ROBE, READING, WRITING } from './stands';

// The well-off, on the human body (human.ts): two model families and the
// named townsfolk who stand with them.
//
// `noble`: the great houses, each in its own colours. House Corvane's crimson
// and black (Lord Chancellor Varric Corvane, with the black key on a chain and
// the Council's seal ring); House Harrowgate's grey with a white tower (Lady
// Maud Harrowgate, in a riding coat with a sword); Sir Osric Dunmore of
// Fellgate Hall (Brackenmoor), Corvane's landlord on the moor; and two
// courtiers for Crown Hill's terrace.
//
// `merchant`: men of business in good dark coats with ledgers, a look rather
// than a role (a merchant may be a vendor, as Ferrow is the bank, or a quest
// giver). Jory Hask (the Sallows) and Steward Pell (Brackenmoor), Corvane's
// men, wear its black key on a seal ring; Master Tobin Ashby wears House
// Ashby's sea green and silver ship; Ferrow and his daughter keep the bank.
//
// And two `villager`s the story turns on: Corvane's secretary in the house's
// livery, and Mistress Wren, the King's Eye, behind her bookshop's door.
//
// Corvane's crimson stays on coats, doublets and livery: never at the face or
// the waist, which mark a bandit.

/** House Harrowgate's grey and its white tower; House Ashby's sea green and silver ship (the guards' livery, models/guards.ts). */
export const HARROWGATE = { field: 0x6a6c70, badge: 0xe2ddd0 } as const;
export const ASHBY = { field: 0x3a6a5e, badge: 0xc8ccd0 } as const;

const thick = (l: Look) => BUILDS[l.build].thickness;
/** How far before the spine the chest's front is, for a chain or a badge over a coat. */
const coatFront = (l: Look) => (0.15 + BUILDS[l.build].belly * 0.4) * thick(l) + BUILDS[l.build].figure.bust;

/** Riding boots to just under the knee, over whatever the body's boots are. */
function tallBoots(ctx: DressContext, l: Look, color: number): void {
  const k = thick(l);
  const SH = ctx.p.shin;
  for (const side of ['L', 'R'] as const) {
    ctx.on(`shin${side}`).taper(0.125 * k, 0.135 * k, 0.135 * k, 0.145 * k, SH * 0.6, { at: [0, -SH * 0.7, 0.002], color });
  }
}

/** A doublet's front: panels down each side of the chest in `color`, over a coat or doublet of another. */
function panels(ctx: DressContext, l: Look, color: number): void {
  const L = ctx.p.spine;
  const z = coatFront(l) - 0.012;
  ctx
    .on('spine')
    .box(0.06, L * 0.62, 0.014, { at: [-0.07 * thick(l), L * 0.42, z], color })
    .box(0.06, L * 0.62, 0.014, { at: [0.07 * thick(l), L * 0.42, z], color });
}

/** A belt over a coat at the waist, with a buckle of `buckle`. */
function coatBelt(ctx: DressContext, l: Look, color: number, buckle: number): void {
  const k = thick(l);
  const { waist } = BUILDS[l.build].figure;
  ctx
    .on('hips')
    .box((waist + 0.06) * k, 0.05, (0.26 + BUILDS[l.build].belly) * k, { at: [0, 0.05, 0.005], color })
    .box(0.05, 0.045, 0.02, { at: [0, 0.05, (0.13 + BUILDS[l.build].belly / 2) * k + 0.012], color: buckle });
}

// ---------------------------------------------------------------- noble

const CORVANE_LOOK: Look = {
  build: 'average',
  skin: HUE.skinFair,
  hair: 0x9a958e,
  hairStyle: 'short',
  beard: 'short',
  shirt: SABLE,
  trousers: SABLE,
  boots: SABLE,
};

/**
 * The Lord Chancellor: silvered hair and a trimmed beard, a plain crimson
 * doublet with black cuffs and belt, black hose and boots, a gold chain with
 * Corvane's black key on it, and the Council's seal ring. Hands behind his back.
 */
function dressCorvane(ctx: DressContext, l: Look): void {
  body(ctx, l, robed(0.66));
  head(ctx, l);
  robe(ctx, l, CRIMSON, { hem: 0.66, sleeves: 'close' });
  cuffs(ctx, l, SABLE, 0.07);
  coatBelt(ctx, l, SABLE, PAL.gold);
  chain(ctx, l, PAL.gold, coatFront(l), (z, y) => keyPendant(ctx, SABLE, z, y));
  sealRing(ctx, 'R', PAL.gold, SABLE);
}

const HARROWGATE_LOOK: Look = {
  build: 'woman',
  skin: HUE.skinWarm,
  hair: HUE.hairGrey,
  hairStyle: 'tied',
  shirt: HARROWGATE.field,
  trousers: 0x3a3836,
  boots: PAL.leatherDark,
};

/** Lady Maud Harrowgate: grey hair tied back, a long grey riding coat with the white tower on the breast, riding boots and a sword at the hip, arms folded. */
function dressHarrowgate(ctx: DressContext, l: Look): void {
  body(ctx, l, robed(0.3));
  head(ctx, l);
  tallBoots(ctx, l, PAL.leatherDark);
  robe(ctx, l, HARROWGATE.field, { hem: 0.3, sleeves: 'close', stole: shade(HARROWGATE.field, 0.7) });
  coatBelt(ctx, l, PAL.leatherDark, PAL.steel);
  badge(ctx, coatFront(l) + 0.004, ctx.p.spine * 0.7, HARROWGATE.badge, 'tower');
  sheathedSword(ctx, l, PAL.steel);
}

const DUNMORE_LOOK: Look = {
  build: 'average',
  skin: HUE.skinWarm,
  hair: HUE.hairBrown,
  hairStyle: 'short',
  beard: 'moustache',
  shirt: HUE.linen,
  trousers: 0x5a4a38,
  boots: PAL.leatherDark,
};

/** Sir Osric Dunmore: a moss-green riding coat faced with tan, riding boots, a sword at the hip; a landlord looking over his fields, hands behind his back. */
function dressDunmore(ctx: DressContext, l: Look): void {
  body(ctx, l, robed(0.45));
  head(ctx, l);
  tallBoots(ctx, l, PAL.leatherDark);
  robe(ctx, l, 0x3e4a30, { hem: 0.45, sleeves: 'close', stole: 0x9a8058 });
  coatBelt(ctx, l, PAL.leatherDark, PAL.gold);
  sheathedSword(ctx, l, PAL.gold);
}

const COURTIER_LOOK: Look = {
  build: 'average',
  skin: HUE.skinFair,
  hair: HUE.hairSandy,
  hairStyle: 'cropped',
  beard: 'none',
  shirt: HUE.apronWhite,
  trousers: 0x2a2a30,
  boots: SABLE,
};

/** A courtier: a plum doublet panelled in cream, dark hose, a teal velvet cap worn aslant, a gold chain. */
function dressCourtier(ctx: DressContext, l: Look): void {
  body(ctx, l, robed(0.68));
  head(ctx, l);
  robe(ctx, l, 0x5a3456, { hem: 0.68, sleeves: 'close' });
  panels(ctx, l, HUE.apronWhite);
  flatCap(ctx, 0x2e5a5e);
  chain(ctx, l, PAL.gold, coatFront(l));
}

const COURTIER_LADY_LOOK: Look = {
  build: 'woman',
  skin: HUE.skinFair,
  hair: HUE.hairDark,
  hairStyle: 'bun',
  shirt: 0xa25e68,
  trousers: 0xa25e68,
  boots: PAL.leatherDark,
};

/** A lady of the court: a rose gown to the floor with bell sleeves and a cream panel down the front, a gold chain. */
function dressCourtierLady(ctx: DressContext, l: Look): void {
  body(ctx, l, robed());
  head(ctx, l);
  robe(ctx, l, 0xa25e68, { stole: 0xe0d4bc });
  chain(ctx, l, PAL.gold, coatFront(l) + 0.01);
}

// ---------------------------------------------------------------- merchant

const HASK_LOOK: Look = {
  build: 'average',
  skin: HUE.skinFair,
  hair: HUE.hairBlack,
  hairStyle: 'short',
  beard: 'moustache',
  shirt: HUE.apronWhite,
  trousers: 0x2e2a28,
  boots: SABLE,
};

/** House Corvane's factor in the Sallows: a good plum-brown coat with a linen collar, clean black boots, a ledger, and Corvane's black key on his seal ring. */
function dressHask(ctx: DressContext, l: Look): void {
  body(ctx, l, robed(0.4));
  head(ctx, l);
  robe(ctx, l, 0x40282c, { hem: 0.4, sleeves: 'close', stole: HUE.apronWhite });
  coatBelt(ctx, l, SABLE, PAL.gold);
  ledger(ctx, 'L', SABLE);
  sealRing(ctx, 'R', PAL.gold, SABLE);
}

const PELL_LOOK: Look = {
  build: 'average',
  skin: HUE.skinFair,
  hair: 0x7a7068,
  hairStyle: 'bald',
  shirt: HUE.apronWhite,
  trousers: SABLE,
  boots: SABLE,
};

/** A ring of iron keys hung at the left hip. */
function keys(ctx: DressContext, l: Look): void {
  const x = 0.2 * thick(l);
  const b = ctx.on('hips');
  b.box(0.05, 0.05, 0.012, { at: [x, -0.02, 0.06], color: PAL.iron });
  for (const [dx, r] of [
    [-0.015, 0.25],
    [0.015, -0.2],
  ] as const) {
    b.box(0.014, 0.1, 0.012, { at: [x + dx, -0.09, 0.06], rot: [0, 0, r], color: PAL.ironDark });
  }
}

/** Dunmore's steward: balding and clean-shaven, a black coat faced with grey, the hall's keys at his hip, a ledger, and Corvane's black key on his seal ring. */
function dressPell(ctx: DressContext, l: Look): void {
  body(ctx, l, robed(0.36));
  head(ctx, l);
  robe(ctx, l, 0x221e20, { hem: 0.36, sleeves: 'close', stole: 0x5a5658 });
  coatBelt(ctx, l, PAL.leatherDark, PAL.iron);
  keys(ctx, l);
  ledger(ctx, 'L', 0x4a2a1a);
  sealRing(ctx, 'R', PAL.gold, SABLE);
}

const ASHBY_LOOK: Look = {
  build: 'stout',
  skin: HUE.skinTan,
  hair: HUE.hairSandy,
  hairStyle: 'short',
  beard: 'full',
  shirt: HUE.linen,
  trousers: 0x3a3430,
  boots: PAL.leatherDark,
};

/** The shipowner: weathered and bearded, a sea-green coat with House Ashby's silver ship on the breast, a ledger closed in his left hand. */
function dressAshby(ctx: DressContext, l: Look): void {
  body(ctx, l, robed(0.42));
  head(ctx, l);
  robe(ctx, l, ASHBY.field, { hem: 0.42, sleeves: 'close', stole: shade(ASHBY.field, 0.72) });
  coatBelt(ctx, l, PAL.leatherDark, ASHBY.badge);
  badge(ctx, coatFront(l) + 0.004, ctx.p.spine * 0.68, ASHBY.badge, 'ship');
  closedBook(ctx, 'L', 0x4a3424);
}

const FERROW_LOOK: Look = {
  build: 'elder',
  skin: HUE.skinFair,
  hair: 0xe0dcd4,
  hairStyle: 'bald',
  shirt: HUE.apronWhite,
  trousers: SABLE,
  boots: SABLE,
};

/** The banker: old and bald, white-haired at the sides, spectacles, a long black coat and a gold chain with a medallion; counts coins into a box. */
function dressFerrow(ctx: DressContext, l: Look): void {
  body(ctx, l, robed(0.22));
  head(ctx, l);
  spectacles(ctx, PAL.gold);
  robe(ctx, l, 0x1e1c20, { hem: 0.22, sleeves: 'close', stole: 0x3a3a40 });
  chain(ctx, l, PAL.gold, coatFront(l) + 0.01, (z, y) => ctx.on('spine').cyl(0.035, 0.035, 0.012, 6, { at: [0, y - 0.04, z], rot: [Math.PI / 2, 0, 0], color: PAL.gold }));
  coinBox(ctx, 'L');
  coin(ctx, 'R');
}

const FERROW_DAUGHTER_LOOK: Look = {
  build: 'woman',
  skin: HUE.skinFair,
  hair: HUE.hairBrown,
  hairStyle: 'bun',
  shirt: 0x5a3a2c,
  trousers: 0x5a3a2c,
  boots: PAL.leatherDark,
};

/** Ferrow's daughter: a russet gown with a cream collar and close sleeves, writing in the bank's ledger. */
function dressFerrowDaughter(ctx: DressContext, l: Look): void {
  body(ctx, l, robed());
  head(ctx, l);
  robe(ctx, l, 0x5a3a2c, { sleeves: 'close', stole: 0xd8ccb0 });
  ledger(ctx, 'L', 0x5a2a1e);
}

// ---------------------------------------------------------------- villagers

const SECRETARY_LOOK: Look = {
  build: 'average',
  skin: HUE.skinWarm,
  hair: HUE.hairBrown,
  hairStyle: 'cropped',
  shirt: HUE.apronWhite,
  trousers: SABLE,
  boots: SABLE,
};

/** Corvane's secretary: a clerk in the house's livery, a crimson coat faced with black and a black cap, writing as the Chancellor talks. */
function dressSecretary(ctx: DressContext, l: Look): void {
  body(ctx, l, robed(0.4));
  head(ctx, l);
  robe(ctx, l, CRIMSON, { hem: 0.4, sleeves: 'close', stole: SABLE });
  coatBelt(ctx, l, SABLE, PAL.iron);
  flatCap(ctx, SABLE);
  ledger(ctx, 'L', SABLE);
}

const WREN_LOOK: Look = {
  build: 'woman',
  skin: HUE.skinFair,
  hair: 0x8a8278,
  hairStyle: 'bun',
  shirt: HUE.linen,
  forearm: HUE.linen,
  trousers: PAL.leatherDark,
  boots: PAL.leatherDark,
};

/** Mistress Wren, the King's Eye: grey-streaked hair pinned up, spectacles, a slate shawl over a linen blouse and a dark green skirt, a book open in her hands. */
function dressWren(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  // Grey streaks through the brown, at the temples.
  ctx
    .on('head')
    .box(0.03, 0.06, 0.08, { at: [-0.097, 0.21, -0.02], color: 0xb8b2a8 })
    .box(0.03, 0.06, 0.08, { at: [0.097, 0.21, -0.02], color: 0xb8b2a8 });
  spectacles(ctx, PAL.ironDark);
  skirt(ctx, l, 0x3a4a3a, { hem: 0.07 });
  shawl(ctx, l, 0x4e5258);
  openBook(ctx, 'L', 0x6a4a2a, 0.9);
}

/** The `noble` and `merchant` families, and the two villagers who stand with them, by their cast name (people/cast.ts). */
export const GENTRY = {
  lordCorvane: { label: 'Lord Corvane', look: CORVANE_LOOK, stand: BEHIND, dress: dressCorvane, seed: 91, works: ['converse'] },
  ladyHarrowgate: { label: 'Lady Harrowgate', look: HARROWGATE_LOOK, stand: ARMS_FOLDED, dress: dressHarrowgate, seed: 92 },
  sirDunmore: { label: 'Sir Osric Dunmore', look: DUNMORE_LOOK, stand: BEHIND, dress: dressDunmore, seed: 93 },
  courtier: { label: 'Courtier', look: COURTIER_LOOK, stand: BEHIND, dress: dressCourtier, seed: 94, works: ['converse'] },
  courtierLady: { label: 'Courtier (lady)', look: COURTIER_LADY_LOOK, stand: EASY_ROBE, dress: dressCourtierLady, seed: 95, works: ['converse'] },
  joryHask: { label: 'Jory Hask', look: HASK_LOOK, stand: WRITING, dress: dressHask, seed: 96, works: ['ledger'] },
  stewardPell: { label: 'Steward Pell', look: PELL_LOOK, stand: WRITING, dress: dressPell, seed: 97, works: ['ledger'] },
  masterAshby: { label: 'Master Ashby', look: ASHBY_LOOK, stand: EASY_ROBE, dress: dressAshby, seed: 98, works: ['point'] },
  ferrow: { label: 'Ferrow', look: FERROW_LOOK, stand: COUNTING, dress: dressFerrow, seed: 99, works: ['coins'] },
  ferrowDaughter: { label: "Ferrow's daughter", look: FERROW_DAUGHTER_LOOK, stand: WRITING, dress: dressFerrowDaughter, seed: 100, works: ['ledger'] },
  corvaneSecretary: { label: "Corvane's secretary", look: SECRETARY_LOOK, stand: WRITING, dress: dressSecretary, seed: 101, works: ['ledger'] },
  mistressWren: { label: 'Mistress Wren', look: WREN_LOOK, stand: READING, dress: dressWren, seed: 102, works: ['read'] },
} satisfies Record<string, Person>;
