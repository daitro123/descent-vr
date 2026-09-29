import type { Material } from 'three';
import { bow } from './bow';
import type { EnemyKind, WeaponSpec } from './characters';
import {
  apron,
  BUILDS,
  type BuildName,
  body,
  cuffs,
  HUE,
  head,
  hood,
  kerchief,
  type Look,
  mail,
  pauldrons,
  quiver,
  rolledSleeves,
  sash,
  shade,
  sheathedSword,
  tabard,
} from './human';
import type { Vec3 } from './kit';
import { PAL } from './palette';
import { type DressContext, type Pose, Rig } from './rig';

// Everyone who wears the human body (human.ts): the bandits, who are enemies
// with today's behaviours, and Oakvale's friendly characters, Marshal Hale and
// the three villagers. Colours say who's who: blue and gold are Hale's alone,
// red on the face and at the waist marks a bandit, a green hood an archer of
// either family, and villagers wear undyed linen, browns and ochre.

const PI = Math.PI;
const DOWN: Vec3 = [PI, 0, 0]; // taper parts grow along +Y; this flips them down a limb

// ---------------------------------------------------------------- the bandits

/** The behaviours a bandit fights with: the thug a grunt's, the archer an archer's, the leader a brute's. */
export type BanditKind = Exclude<EnemyKind, 'warden'>;

export const BANDIT_BUILDS: Record<BanditKind, BuildName> = { grunt: 'average', archer: 'average', brute: 'big' };

/** A short iron sword, in the hand along -Y, its edge to -Z. */
function banditSword(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .ball(0.024, { at: [0, 0.03, 0], color: PAL.ironDark })
    .box(0.03, 0.11, 0.03, { at: [0, -0.045, 0], color: PAL.leatherDark })
    .box(0.028, 0.028, 0.15, { at: [0, -0.11, 0], color: PAL.iron, mask: 1 })
    .taper(0.013, 0.055, 0.006, 0.014, 0.66, { at: [0, -0.125, 0], rot: DOWN, color: PAL.steel, mask: 1 });
  return { bone: 'handR', base: [0, -0.13, 0], tip: [0, -0.78, 0], radius: 0.035 };
}

/** A woodcutter's hatchet, its bit to -Z. */
function hatchet(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.035, 0.62, 0.035, { at: [0, -0.26, 0], color: PAL.wood })
    .box(0.04, 0.05, 0.04, { at: [0, -0.02, 0], color: PAL.leatherDark })
    .box(0.03, 0.15, 0.07, { at: [0, -0.5, -0.045], color: PAL.iron, mask: 1 })
    .taper(0.022, 0.15, 0.01, 0.22, 0.1, { at: [0, -0.5, -0.08], rot: [-PI / 2, 0, 0], color: PAL.steel, mask: 1 });
  return { bone: 'handR', base: [0, -0.25, 0], tip: [0, -0.58, -0.17], radius: 0.05 };
}

/** The leader's two-handed felling axe: a long haft and a broad bit, in place of the brute's maul. */
function fellingAxe(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .cyl(0.032, 0.032, 1.25, 6, { at: [0, -0.5, 0], color: PAL.wood })
    .box(0.045, 0.14, 0.045, { at: [0, -0.02, 0], color: PAL.leatherDark })
    .box(0.05, 0.24, 0.11, { at: [0, -1.02, -0.07], color: PAL.ironDark, mask: 1 })
    .taper(0.036, 0.24, 0.012, 0.4, 0.2, { at: [0, -1.02, -0.12], rot: [-PI / 2, 0, 0], color: PAL.steel, mask: 1 })
    .box(0.05, 0.1, 0.1, { at: [0, -1.02, 0.06], color: PAL.ironDark, mask: 1 });
  return { bone: 'handR', base: [0, -0.3, 0], tip: [0, -1.1, -0.3], radius: 0.12 };
}

/** The family's mark: a red kerchief over the nose and mouth, and a red sash. A hood hides the kerchief's knot. */
function banditMarks(ctx: DressContext, l: Look, hooded = false): void {
  kerchief(ctx, HUE.banditRed, !hooded);
  sash(ctx, l, HUE.banditRed);
}

/** A leather jerkin over the shirt, laced at the front. */
function jerkin(ctx: DressContext, color: number): void {
  const L = ctx.p.spine;
  ctx
    .on('spine')
    .taper(0.33, 0.225, 0.42, 0.26, L * 0.66, { at: [0, -0.02, 0.005], color })
    .box(0.015, L * 0.5, 0.015, { at: [0, L * 0.3, 0.13], color: PAL.leatherDark, jitter: 0 });
  ctx.on('hips').taper(0.37, 0.25, 0.34, 0.23, 0.12, { at: [0, -0.08, 0.005], color });
}

/** Thugs vary the way grunts do: three faces, each with a sword or a hatchet. */
const THUG_LOOKS: Look[] = [
  {
    build: 'average',
    skin: HUE.skinFair,
    hair: HUE.hairBrown,
    hairStyle: 'short',
    beard: 'stubble',
    shirt: HUE.linenDark,
    forearm: 'skin',
    trousers: HUE.russet,
    boots: PAL.leatherDark,
    belt: PAL.leatherDark,
  },
  {
    build: 'average',
    skin: HUE.skinTan,
    hair: HUE.hairBlack,
    hairStyle: 'tied',
    shirt: PAL.leatherDark,
    forearm: PAL.leather,
    hands: PAL.leatherDark,
    trousers: PAL.clothDark,
    boots: PAL.woodDark,
    belt: PAL.leather,
  },
  {
    build: 'average',
    skin: HUE.skinDark,
    hair: HUE.hairDark,
    hairStyle: 'cropped',
    shirt: HUE.linenDark,
    forearm: 'skin',
    trousers: PAL.leatherDark,
    boots: PAL.leatherDark,
    belt: PAL.leatherDark,
  },
];

function dressThug(ctx: DressContext, variant: number): WeaponSpec {
  const l = THUG_LOOKS[variant % THUG_LOOKS.length];
  body(ctx, l);
  head(ctx, l);
  jerkin(ctx, variant % 2 ? PAL.leather : shade(PAL.leather, 1.3));
  // A scavenged shoulder guard, like the undead grunt's pauldron.
  if (variant % 3 === 1) ctx.on('upperArmL').taper(0.13, 0.14, 0.1, 0.12, 0.08, { at: [0.02, -0.03, 0], color: PAL.iron });
  banditMarks(ctx, l);
  return variant % 2 ? hatchet(ctx) : banditSword(ctx);
}

const ARCHER_LOOK: Look = {
  build: 'average',
  skin: HUE.skinWarm,
  hair: HUE.hairRed,
  hairStyle: 'short',
  shirt: HUE.linenDark,
  sleeve: PAL.leather,
  forearm: PAL.leatherDark,
  hands: PAL.leatherDark,
  trousers: PAL.leatherDark,
  boots: PAL.woodDark,
  belt: PAL.leatherDark,
};

/** The archer: the green hood and cowl of every archer over the red kerchief, a quiver, bracers and today's bow. */
function dressArcher(ctx: DressContext): WeaponSpec {
  const l = ARCHER_LOOK;
  body(ctx, l);
  head(ctx, l);
  jerkin(ctx, PAL.leather);
  banditMarks(ctx, l, true);
  hood(ctx, l, PAL.hood);
  quiver(ctx, HUE.banditRed);
  bow(ctx, { tips: PAL.iron, string: HUE.bowString });
  // Bows have no strike segment; a placeholder keeps the type uniform.
  return { bone: 'handL', base: [0, 0, 0], tip: [0, -0.1, 0], radius: 0 };
}

const LEADER_LOOK: Look = {
  build: 'big',
  skin: HUE.skinFair,
  hair: HUE.hairBlack,
  hairStyle: 'bald',
  beard: 'full',
  shirt: HUE.banditRedDark,
  sleeve: PAL.leatherDark,
  forearm: 'skin',
  hands: PAL.leatherDark,
  trousers: PAL.clothDark,
  boots: PAL.leatherDark,
};

/** The leader: big, bald and black-bearded, in a long red coat and a shaggy fur mantle, with a felling axe. */
function dressLeader(ctx: DressContext): WeaponSpec {
  const l = LEADER_LOOK;
  body(ctx, l);
  head(ctx, l);
  const L = ctx.p.spine;
  const coat = HUE.banditRed;
  // A long coat, open at the front over the shirt.
  ctx
    .on('spine')
    .box(0.14, L, 0.03, { at: [-0.16, L / 2 - 0.02, 0.15], color: coat })
    .box(0.14, L, 0.03, { at: [0.16, L / 2 - 0.02, 0.15], color: coat })
    .box(0.03, L, 0.3, { at: [-0.24, L / 2 - 0.02, 0], color: coat })
    .box(0.03, L, 0.3, { at: [0.24, L / 2 - 0.02, 0], color: coat })
    .box(0.5, L, 0.03, { at: [0, L / 2 - 0.02, -0.15], color: coat });
  // Its skirts, and a heavy belt with a gold buckle.
  ctx
    .on('hips')
    .box(0.18, 0.6, 0.03, { at: [-0.14, -0.28, 0.16], rot: [0.08, 0, 0], color: coat })
    .box(0.18, 0.6, 0.03, { at: [0.14, -0.28, 0.16], rot: [0.08, 0, 0], color: coat })
    .box(0.5, 0.62, 0.03, { at: [0, -0.29, -0.16], rot: [-0.08, 0, 0], color: coat })
    .box(0.48, 0.1, 0.34, { at: [0, 0.03, 0], color: PAL.leatherDark })
    .box(0.09, 0.08, 0.02, { at: [0, 0.03, 0.18], color: PAL.gold });
  // A fur mantle across the shoulders: a shaggy collar, lighter at the front.
  ctx
    .on('spine')
    .taper(0.64, 0.4, 0.44, 0.3, 0.14, { at: [0, L - 0.06, -0.01], color: HUE.fur, jitter: 0.22 })
    .taper(0.44, 0.32, 0.3, 0.24, 0.06, { at: [0, L + 0.08, -0.01], color: HUE.fur, jitter: 0.22 })
    .box(0.5, 0.1, 0.05, { at: [0, L - 0.02, 0.21], rot: [0.3, 0, 0], color: HUE.furLight, jitter: 0.22 });
  for (const side of ['L', 'R'] as const) {
    ctx.on(`forearm${side}`).taper(0.12, 0.12, 0.13, 0.13, 0.16, { at: [0, -ctx.p.forearm, 0], color: PAL.leatherDark });
  }
  kerchief(ctx, HUE.banditRed);
  return fellingAxe(ctx);
}

/** A bandit with the behaviour `kind` dresses for it; thugs vary with `variant`. */
export function dressBandit(ctx: DressContext, kind: BanditKind, variant: number): WeaponSpec {
  switch (kind) {
    case 'grunt':
      return dressThug(ctx, variant);
    case 'archer':
      return dressArcher(ctx);
    case 'brute':
      return dressLeader(ctx);
  }
}

// ---------------------------------------------------------------- friendly characters

/** Marshal Hale and the three villagers. */
export type PersonId = 'hale' | 'innkeeper' | 'smith' | 'farmer';

export interface Person {
  label: string;
  build: BuildName;
  /** The pose they stand in, holding what they hold. */
  stand: Pose;
  dress(ctx: DressContext): void;
  /** Varies the per-face shading. */
  seed: number;
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
  upperArmL: [0.2, 0, 0.06],
  forearmL: [-1.45, 0, 0],
  handL: [0.35, 0, 0],
  upperArmR: [0.04, 0, -0.12],
  forearmR: [-0.25, 0, 0],
  thighL: [-0.04, 0, 0.05],
  thighR: [0.03, 0, -0.05],
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
  belt: PAL.leather,
  buckle: PAL.gold,
};

/**
 * The village's guard captain: bareheaded, cropped grey hair and clean-shaven,
 * a mail shirt under a blue tabard with a gold mark front and back, steel
 * pauldrons, leather gloves and bracers, a belt with a gold buckle, and their
 * old longsword (the gilded guard the last quest pays out) at the left hip.
 */
function dressHale(ctx: DressContext): void {
  const l = HALE_LOOK;
  body(ctx, l);
  head(ctx, l);
  mail(ctx, l);
  tabard(ctx, l, HUE.tabard, 0.42, PAL.gold);
  ctx.on('hips').box(0.33, 0.06, 0.24, { at: [0, 0.03, 0.005], color: PAL.leather }).box(0.06, 0.05, 0.02, { at: [0, 0.03, 0.135], color: PAL.gold });
  pauldrons(ctx, l, PAL.steel);
  cuffs(ctx, l, PAL.leatherDark);
  sheathedSword(ctx, l, PAL.gold);
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

/** Stout and bald with a brown moustache: rolled sleeves, a russet waistcoat, a long white apron and a tankard. */
function dressInnkeeper(ctx: DressContext): void {
  const l: Look = {
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
}

/** Broad, with cropped dark hair and a short beard: a sleeveless dark shirt, a leather bib apron, thick gloves and a hammer. */
function dressSmith(ctx: DressContext): void {
  const l: Look = {
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
  body(ctx, l);
  head(ctx, l);
  apron(ctx, l, PAL.leather, true, 0.66);
  cuffs(ctx, l, PAL.leatherDark);
  hammer(ctx);
}

/** The farm's own farmer, driven out by the bandits: a straw hat, a linen shirt with braces, ochre trousers and a pitchfork. */
function dressFarmer(ctx: DressContext): void {
  const l: Look = {
    build: 'average',
    skin: HUE.skinWarm,
    hair: HUE.hairSandy,
    hairStyle: 'short',
    beard: 'stubble',
    shirt: HUE.linen,
    trousers: HUE.ochre,
    boots: PAL.leatherDark,
  };
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

export const PEOPLE: Record<PersonId, Person> = {
  hale: { label: 'Marshal Hale', build: 'average', stand: HALE_STAND, dress: dressHale, seed: 5 },
  innkeeper: { label: 'Innkeeper', build: 'stout', stand: HOLDING, dress: dressInnkeeper, seed: 61 },
  smith: { label: 'Smith', build: 'broad', stand: HOLDING, dress: dressSmith, seed: 62 },
  farmer: { label: 'Farmer', build: 'average', stand: FORK, dress: dressFarmer, seed: 63 },
};

/** A friendly character's body, standing at bind (apply their `stand`). One draw call. */
export function buildPerson(id: PersonId, material?: Material): Rig {
  const p = PEOPLE[id];
  return new Rig(BUILDS[p.build].proportions, p.dress, material, p.seed);
}
