import { LIVERY } from './guards';
import { body, coif, HUE, head, type Look, robe, robed, sash, shade } from './human';
import { PAL } from './palette';
import type { Person } from './people';
import { chain, closedBook, hipLamp, ledger, openBook, saltBag, spade, sunburst } from './props';
import type { DressContext } from './rig';
import { EASY_ROBE, FOLDED, READING, STAFF_CARRY_LEFT, STAFF_LEFT, WRITING } from './stands';

// The long-robed: two model families on the human body (human.ts) that share
// the long robe and differ in who they serve.
//
// `priest`: the Cathedral of the Dawn's clergy and the hedge priests of the
// country chapels. The Dawn wears white with a gold sunburst; the country
// brothers brown or undyed wool. Brother Cuthwin (Brackenmoor), Brother
// Ansgar (the Sallows), Mother Ysolde the High Lector and Sister Agna
// (Aldhaven), and a priest of the Dawn for the close's walks (the plain
// `sister` in commoners.ts walks beside them).
//
// `scholar`: the Lamplit Collegium's grey. Magister Orrin Vey, Corvane's
// glyph-reader, in a crimson baldric (Corvane's colour, kept off his waist:
// red at the waist is a bandit's) with a lamp of glyph light at his hip; and
// two students. Magister Quill, who teaches the mage class, is a `class
// trainer` (trainers.ts) in the same grey.

/** The Cathedral of the Dawn's white wool, and its gold. */
export const DAWN = { robe: 0xe2dccb, gold: PAL.gold } as const;
/** The Lamplit Collegium's grey, its magisters' pale facing, and the warm light of its lamps. */
export const COLLEGIUM = { robe: 0x7c7f88, student: 0x8e9098, facing: 0xc4c6c8, lamp: 0xffcf7a } as const;
/** House Corvane's deep crimson, from the guards' livery (models/guards.ts): darker than the bandits' red, and bluer. */
export const CRIMSON = LIVERY.corvane.field;
/** The black of Corvane's key. */
export const SABLE = LIVERY.corvane.badge;

/** A country brother's brown habit, and an undyed one gone grey-brown. */
const HABIT = 0x4e3a2a;
const UNDYED = 0x6e624e;
/** Fen mud, to the knee. */
const MUD = 0x3e3428;

/** A habit's hood, lying back on the shoulders (as the friar's). */
function cowl(ctx: DressContext, color: number): void {
  const L = ctx.p.spine;
  ctx
    .on('spine')
    .taper(0.44, 0.3, 0.34, 0.27, 0.12, { at: [0, L - 0.07, -0.01], color: shade(color, 0.9) })
    .taper(0.26, 0.06, 0.2, 0.06, 0.16, { at: [0, L - 0.12, -0.17], rot: [-0.2, 0, 0], color: shade(color, 0.9) });
}

// ---------------------------------------------------------------- priests

const CUTHWIN_LOOK: Look = {
  build: 'elder',
  skin: HUE.skinFair,
  hair: 0xb8b2a8,
  hairStyle: 'bald',
  beard: 'short',
  shirt: HABIT,
  trousers: HABIT,
  boots: PAL.leatherDark,
};

/** An old scholar-priest, stooped and grey-bearded: a brown habit and rope belt, a wooden sun on a cord, a book open in his hands. */
function dressCuthwin(ctx: DressContext, l: Look): void {
  body(ctx, l, robed());
  head(ctx, l);
  robe(ctx, l, HABIT, { cord: HUE.linen });
  cowl(ctx, HABIT);
  chain(ctx, l, HUE.linenDark, 0.15, (z, y) => sunburst(ctx, PAL.wood, z, y));
  openBook(ctx, 'L', 0x5a3424);
}

const ANSGAR_LOOK: Look = {
  build: 'average',
  skin: HUE.skinWarm,
  hair: HUE.hairBrown,
  hairStyle: 'cropped',
  beard: 'stubble',
  shirt: UNDYED,
  trousers: UNDYED,
  boots: PAL.leatherDark,
};

/** A young hedge priest of the fens: an undyed habit muddy to the knee, sleeves close, a salt bag at his hip and a spade in his left hand. */
function dressAnsgar(ctx: DressContext, l: Look): void {
  body(ctx, l, robed());
  head(ctx, l);
  robe(ctx, l, UNDYED, { sleeves: 'close', cord: PAL.leather, lower: MUD });
  cowl(ctx, UNDYED);
  saltBag(ctx, l, HUE.linen);
  spade(ctx, 'L', 1.15);
}

const YSOLDE_LOOK: Look = {
  build: 'elderWoman',
  skin: HUE.skinFair,
  hair: 0xd8d4cc,
  hairStyle: 'none',
  shirt: DAWN.robe,
  trousers: DAWN.robe,
  boots: PAL.leatherDark,
};

/** The High Lector: old and stooped, her hair under a white coif, a white robe with a gold stole and a gold sunburst on a chain, her hands folded. */
function dressYsolde(ctx: DressContext, l: Look): void {
  body(ctx, l, robed());
  head(ctx, l);
  coif(ctx, 0xf0ebe0);
  robe(ctx, l, DAWN.robe, { stole: DAWN.gold });
  chain(ctx, l, DAWN.gold, 0.17, (z, y) => sunburst(ctx, DAWN.gold, z, y));
}

const AGNA_LOOK: Look = {
  build: 'woman',
  skin: HUE.skinWarm,
  hair: HUE.hairBrown,
  hairStyle: 'none',
  shirt: DAWN.robe,
  trousers: DAWN.robe,
  boots: PAL.leatherDark,
};

/** A round brown loaf in the right hand. */
function loaf(ctx: DressContext): void {
  ctx.on('handR').box(0.12, 0.07, 0.16, { at: [0.02, -0.08, 0.03], color: 0x9a6a38, jitter: 0.12 }).box(0.1, 0.02, 0.12, { at: [0.02, -0.04, 0.03], color: 0xb08048 });
}

/** The almoner: a white habit with close sleeves under a linen apron, a white coif, a loaf to give. */
function dressAgna(ctx: DressContext, l: Look): void {
  body(ctx, l, robed());
  head(ctx, l);
  coif(ctx, 0xf0ebe0);
  robe(ctx, l, DAWN.robe, { sleeves: 'close', cord: DAWN.gold, apron: HUE.linen });
  loaf(ctx);
}

const DAWN_PRIEST_LOOK: Look = {
  build: 'average',
  skin: HUE.skinTan,
  hair: HUE.hairDark,
  hairStyle: 'short',
  beard: 'short',
  shirt: DAWN.robe,
  trousers: DAWN.robe,
  boots: PAL.leatherDark,
};

/** A priest of the Dawn: the white robe with a linen stole and a small gold sun, reading as he walks. */
function dressDawnPriest(ctx: DressContext, l: Look): void {
  body(ctx, l, robed());
  head(ctx, l);
  robe(ctx, l, DAWN.robe, { cord: DAWN.gold, stole: HUE.linen });
  chain(ctx, l, DAWN.gold, 0.15, (z, y) => sunburst(ctx, DAWN.gold, z, y));
  openBook(ctx, 'L', 0x6a2a20);
}

// ---------------------------------------------------------------- the Collegium

const VEY_LOOK: Look = {
  build: 'average',
  skin: HUE.skinFair,
  hair: HUE.hairBlack,
  hairStyle: 'cropped',
  beard: 'short',
  shirt: COLLEGIUM.robe,
  trousers: COLLEGIUM.robe,
  boots: PAL.leatherDark,
};

/** A baldric from the left shoulder to the right hip, its end hanging there. */
function baldric(ctx: DressContext, color: number): void {
  const L = ctx.p.spine;
  ctx
    .on('spine')
    .box(0.07, L * 1.15, 0.02, { at: [0, L * 0.5, 0.15], rot: [0, 0, -0.6], color })
    .box(0.07, L * 1.15, 0.02, { at: [0, L * 0.5, -0.15], rot: [0, 0, 0.6], color });
  ctx.on('hips').box(0.07, 0.24, 0.02, { at: [-0.2, -0.02, 0.06], rot: [0, 0, 0.12], color });
}

/** Corvane's magister: black-haired and pale, a grey robe with the magisters' pale facing, a crimson baldric, a lamp of blue glyph light at his hip, and a ledger he writes glyphs in. */
function dressVey(ctx: DressContext, l: Look): void {
  body(ctx, l, robed());
  head(ctx, l);
  robe(ctx, l, COLLEGIUM.robe, { stole: COLLEGIUM.facing });
  baldric(ctx, CRIMSON);
  hipLamp(ctx, l, PAL.ironDark, PAL.rune);
  ledger(ctx, 'L', SABLE);
}

const STUDENT_LOOK: Look = {
  build: 'average',
  skin: HUE.skinWarm,
  hair: HUE.hairSandy,
  hairStyle: 'short',
  shirt: COLLEGIUM.student,
  trousers: 0x4a4a50,
  boots: PAL.leatherDark,
};

/** A Collegium student: a short grey gown to the calf over dark hose, a cord at the waist, a book. */
function dressStudent(ctx: DressContext, l: Look): void {
  body(ctx, l, robed(0.3));
  head(ctx, l);
  robe(ctx, l, COLLEGIUM.student, { hem: 0.3, sleeves: 'close', cord: COLLEGIUM.facing });
  openBook(ctx, 'L', 0x3a4a5a);
}

const STUDENT_WOMAN_LOOK: Look = {
  build: 'woman',
  skin: HUE.skinFair,
  hair: HUE.hairDark,
  hairStyle: 'braids',
  shirt: COLLEGIUM.student,
  trousers: COLLEGIUM.student,
  boots: PAL.leatherDark,
};

/** A Collegium student: dark braids, the grey gown to the feet with a sash of the magisters' pale grey, a book under her arm. */
function dressStudentWoman(ctx: DressContext, l: Look): void {
  body(ctx, l, robed());
  head(ctx, l);
  robe(ctx, l, COLLEGIUM.student, { sleeves: 'close' });
  sash(ctx, l, COLLEGIUM.facing, 1.2);
  closedBook(ctx, 'L', 0x5a3a2a);
}

/** The `priest` and `scholar` families, by their cast name (people/cast.ts). */
export const CLERGY = {
  brotherCuthwin: { label: 'Brother Cuthwin', look: CUTHWIN_LOOK, stand: READING, dress: dressCuthwin, seed: 81, works: ['read'] },
  brotherAnsgar: { label: 'Brother Ansgar', look: ANSGAR_LOOK, stand: STAFF_LEFT, dress: dressAnsgar, seed: 82, works: ['salt'], carry: STAFF_CARRY_LEFT },
  motherYsolde: { label: 'Mother Ysolde', look: YSOLDE_LOOK, stand: FOLDED, dress: dressYsolde, seed: 83, works: ['pray'] },
  sisterAgna: { label: 'Sister Agna', look: AGNA_LOOK, stand: EASY_ROBE, dress: dressAgna, seed: 84, works: ['alms'] },
  dawnPriest: { label: 'Priest of the Dawn', look: DAWN_PRIEST_LOOK, stand: READING, dress: dressDawnPriest, seed: 85, works: ['read'] },
  magisterVey: { label: 'Magister Vey', look: VEY_LOOK, stand: WRITING, dress: dressVey, seed: 86, works: ['ledger'] },
  student: { label: 'Student', look: STUDENT_LOOK, stand: READING, dress: dressStudent, seed: 87, works: ['read'] },
  studentWoman: { label: 'Student (woman)', look: STUDENT_WOMAN_LOOK, stand: EASY_ROBE, dress: dressStudentWoman, seed: 88, works: ['converse'] },
} satisfies Record<string, Person>;
