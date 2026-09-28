import type { Material } from 'three';
import { IDLE } from '../../enemies/poses';
import type { CharacterModel, EnemyKind, WeaponSpec } from '../characters';
import type { Vec3 } from '../kit';
import { PAL } from '../palette';
import { type DressContext, type Pose, type Proportions, Rig } from '../rig';
import {
  apron,
  BIG,
  BROAD,
  body,
  cloak,
  DOWN,
  gloves,
  HUE,
  HUMAN,
  head,
  headwrap,
  hood,
  kerchief,
  type Look,
  mail,
  pauldrons,
  quiver,
  rolledSleeves,
  STOUT,
  shade,
  sheathedSword,
  tabard,
} from './body';

// PROTOTYPE (Friendly characters): Marshal Hale, the three bandits and the
// villagers who might stand about Oakvale, all on one human body (body.ts).
// Three looks for Hale (A/B/C) and three family marks for the bandits (A/B/C)
// are here to compare; the pick goes on the ticket and this folder goes.

const PI = Math.PI;

export type BanditMark = 'A' | 'B' | 'C';

export interface Person {
  id: string;
  label: string;
  /** The enemy behaviour it wears (its animations), or null for a friendly character. */
  behaviour: EnemyKind | null;
  /** The pose it stands in. */
  stand: Pose;
  build(material?: Material): CharacterModel;
}

// ---------------------------------------------------------------- stand poses

const STAND: Pose = {
  spine: [0.02, 0, 0],
  upperArmL: [0.04, 0, 0.1],
  forearmL: [-0.2, 0, 0],
  upperArmR: [0.04, 0, -0.1],
  forearmR: [-0.2, 0, 0],
  thighL: [-0.04, 0, 0.03],
  thighR: [0.03, 0, -0.03],
};

/** Hale: left hand on the sword's pommel, right hanging easy. */
const HALE_STAND: Pose = {
  spine: [0.0, 0, 0],
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
  handR: [0, 0, 0],
};

// ---------------------------------------------------------------- weapons and tools (hand space, along -Y)

function banditSword(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .ball(0.024, { at: [0, 0.03, 0], color: PAL.ironDark })
    .box(0.03, 0.11, 0.03, { at: [0, -0.045, 0], color: PAL.leatherDark })
    .box(0.028, 0.028, 0.15, { at: [0, -0.11, 0], color: PAL.iron, mask: 1 })
    .taper(0.013, 0.055, 0.006, 0.014, 0.66, { at: [0, -0.125, 0], rot: DOWN, color: PAL.steel, mask: 1 });
  return { bone: 'handR', base: [0, -0.13, 0], tip: [0, -0.78, 0], radius: 0.035 };
}

function hatchet(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.035, 0.62, 0.035, { at: [0, -0.26, 0], color: PAL.wood })
    .box(0.04, 0.05, 0.04, { at: [0, -0.02, 0], color: PAL.leatherDark })
    .box(0.03, 0.15, 0.07, { at: [0, -0.5, -0.045], color: PAL.iron, mask: 1 })
    .taper(0.022, 0.15, 0.01, 0.22, 0.1, { at: [0, -0.5, -0.08], rot: [-PI / 2, 0, 0], color: PAL.steel, mask: 1 });
  return { bone: 'handR', base: [0, -0.25, 0], tip: [0, -0.58, -0.17], radius: 0.05 };
}

/** The leader's felling axe: a long haft and a broad bit. Two-handed, brute behaviour. */
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

function bow(ctx: DressContext): WeaponSpec {
  const b = ctx.on('handL');
  const pts: Vec3[] = [
    [0, -0.06, 0],
    [0, -0.04, 0.2],
    [0, 0.0, 0.38],
    [0, 0.07, 0.54],
  ];
  for (const sign of [1, -1]) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, c] = [pts[i], pts[i + 1]];
      b.bar([a[0], a[1], a[2] * sign], [c[0], c[1], c[2] * sign], 0.03 - i * 0.005, 0.025 - i * 0.004, {
        color: i === 0 ? PAL.leatherDark : PAL.wood,
        mask: 1,
      });
    }
    b.box(0.025, 0.03, 0.03, { at: [0, 0.075, 0.55 * sign], color: PAL.iron, mask: 1 });
  }
  const nock = ctx.point('handR', 0, -0.06, 0.02);
  for (const sign of [1, -1]) {
    ctx.builder.stretch(ctx.index('handL'), ctx.point('handL', 0, 0.075, 0.55 * sign), ctx.index('handR'), nock, 0.006, {
      color: 0xd8d0b8,
      jitter: 0,
    });
  }
  return { bone: 'handL', base: [0, 0, 0], tip: [0, -0.1, 0], radius: 0 };
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

function pitchfork(ctx: DressContext): void {
  // Along the hand's Z, so it stands upright with the forearm held level.
  const b = ctx.on('handR');
  b.cyl(0.02, 0.02, 1.55, 5, { at: [0, -0.02, -0.05], rot: [PI / 2, 0, 0], color: PAL.wood })
    .box(0.18, 0.02, 0.03, { at: [0, -0.02, 0.73], color: PAL.ironDark });
  for (const x of [-0.08, 0, 0.08]) b.box(0.015, 0.015, 0.22, { at: [x, -0.02, 0.85], color: PAL.iron });
}

// ---------------------------------------------------------------- Marshal Hale

const HALE_LOOK: Look = {
  skin: HUE.skinWarm,
  hair: HUE.hairGrey,
  hairStyle: 'cropped',
  beard: 'none',
  shirt: HUE.mail,
  sleeve: HUE.mail,
  forearm: PAL.leather,
  hands: PAL.leatherDark,
  trousers: PAL.leatherDark,
  boots: PAL.woodDark,
  belt: PAL.leather,
  buckle: PAL.gold,
};

/** A · Captain: bareheaded, mail under a blue tabard with a gold mark, steel pauldrons. */
function haleCaptain(ctx: DressContext): void {
  const l = HALE_LOOK;
  body(ctx, l);
  head(ctx, l);
  mail(ctx, l);
  tabard(ctx, l, HUE.tabard, 0.42, PAL.gold);
  ctx.on('hips').box(0.33, 0.06, 0.24, { at: [0, 0.03, 0.005], color: PAL.leather }).box(0.06, 0.05, 0.02, { at: [0, 0.03, 0.135], color: PAL.gold });
  pauldrons(ctx, l, PAL.steel);
  gloves(ctx, l, PAL.leatherDark);
  sheathedSword(ctx, l, PAL.gold);
}

/** B · Knight: steel breastplate, open helm with a blue crest, blue cloak. */
function haleKnight(ctx: DressContext): void {
  const l: Look = { ...HALE_LOOK, hairStyle: 'none' };
  body(ctx, l);
  head(ctx, l);
  mail(ctx, l, 0.26);
  const L = ctx.p.spine;
  ctx
    .on('spine')
    .taper(0.34, 0.24, 0.44, 0.28, L * 0.8, { at: [0, 0.02, 0.012], color: PAL.steel })
    .box(0.06, L * 0.5, 0.02, { at: [0, L * 0.45, 0.15], color: PAL.gold });
  tabard(ctx, l, HUE.tabard, 0.4);
  pauldrons(ctx, l, PAL.steel, 1.25);
  cloak(ctx, l, HUE.tabard, 1.15);
  gloves(ctx, l, PAL.iron);
  ctx
    .on('head')
    .box(0.215, 0.1, 0.235, { at: [0, 0.24, -0.005], color: PAL.steel })
    .box(0.03, 0.2, 0.2, { at: [-0.105, 0.14, -0.03], color: PAL.steel })
    .box(0.03, 0.2, 0.2, { at: [0.105, 0.14, -0.03], color: PAL.steel })
    .box(0.215, 0.2, 0.03, { at: [0, 0.15, -0.115], color: PAL.steel })
    .box(0.23, 0.025, 0.25, { at: [0, 0.195, -0.005], color: PAL.gold })
    .box(0.04, 0.14, 0.2, { at: [0, 0.33, -0.03], color: HUE.tabard });
  sheathedSword(ctx, l, PAL.gold);
}

/** C · Officer: a long blue coat to the knees, gold buttons and sash, no armour. */
function haleOfficer(ctx: DressContext): void {
  const l: Look = { ...HALE_LOOK, hairStyle: 'short', beard: 'short', shirt: HUE.tabard, sleeve: HUE.tabard, forearm: HUE.tabard };
  body(ctx, l);
  head(ctx, l);
  const L = ctx.p.spine;
  ctx
    .on('spine')
    .box(0.02, L * 0.9, 0.02, { at: [0, L * 0.45, 0.13], color: PAL.gold })
    .box(0.44, 0.07, 0.27, { at: [0, L - 0.01, 0], color: HUE.tabardDark });
  for (let i = 0; i < 4; i++) ctx.on('spine').box(0.025, 0.025, 0.02, { at: [0.04, L * 0.2 + i * 0.09, 0.132], color: PAL.gold, jitter: 0 });
  // Coat skirts, split front and back.
  ctx
    .on('hips')
    .box(0.17, 0.55, 0.02, { at: [-0.085, -0.25, 0.12], rot: [0.06, 0, 0], color: HUE.tabard })
    .box(0.17, 0.55, 0.02, { at: [0.085, -0.25, 0.12], rot: [0.06, 0, 0], color: HUE.tabard })
    .box(0.34, 0.58, 0.02, { at: [0, -0.26, -0.12], rot: [-0.06, 0, 0], color: HUE.tabard })
    .box(0.02, 0.5, 0.22, { at: [-0.16, -0.24, 0], color: HUE.tabard })
    .box(0.02, 0.5, 0.22, { at: [0.16, -0.24, 0], color: HUE.tabard })
    .box(0.34, 0.08, 0.25, { at: [0, 0.03, 0.005], color: PAL.gold });
  gloves(ctx, l, PAL.leatherDark);
  // Baldric across the chest.
  ctx.on('spine').bar([-0.19, L - 0.02, 0.13], [0.16, 0.04, 0.13], 0.05, 0.015, { color: PAL.leather });
  sheathedSword(ctx, l, PAL.gold);
}

// ---------------------------------------------------------------- bandits

const THUG_LOOKS: Look[] = [
  { skin: HUE.skinFair, hair: HUE.hairBrown, hairStyle: 'short', beard: 'stubble', shirt: HUE.linenDark, sleeve: HUE.linenDark, forearm: 'skin', hands: 'skin', trousers: HUE.russet, boots: PAL.leatherDark, belt: PAL.leatherDark },
  { skin: HUE.skinTan, hair: HUE.hairBlack, hairStyle: 'tied', beard: 'none', shirt: PAL.leatherDark, sleeve: PAL.leatherDark, forearm: PAL.leather, hands: PAL.leatherDark, trousers: PAL.clothDark, boots: PAL.woodDark, belt: PAL.leather },
  { skin: HUE.skinDark, hair: HUE.hairDark, hairStyle: 'cropped', beard: 'none', shirt: HUE.linenDark, sleeve: HUE.linenDark, forearm: 'skin', hands: 'skin', trousers: PAL.leatherDark, boots: PAL.leatherDark, belt: PAL.leatherDark },
];

/** The family mark: A a red kerchief mask, B a red headwrap and bare face, C a black hood and mask. */
function banditMark(ctx: DressContext, l: Look, mark: BanditMark, archer: boolean): void {
  if (mark === 'A') {
    kerchief(ctx, HUE.banditRed);
    if (archer) hood(ctx, l, PAL.hood);
    // A red sash too, so the family reads from behind.
    ctx
      .on('hips')
      .box(0.35, 0.07, 0.25, { at: [0, 0.07, 0.005], rot: [0, 0, 0.1], color: HUE.banditRed })
      .box(0.06, 0.2, 0.02, { at: [0.12, -0.06, 0.12], rot: [0, 0, 0.15], color: HUE.banditRed });
  } else if (mark === 'B') {
    if (archer) hood(ctx, l, PAL.hood);
    else headwrap(ctx, HUE.banditRed);
    ctx.on('spine').box(0.3, 0.05, 0.25, { at: [0, ctx.p.spine * 0.25, 0], rot: [0, 0, 0.15], color: HUE.banditRed });
  } else {
    kerchief(ctx, PAL.clothDark);
    hood(ctx, l, archer ? PAL.hood : PAL.clothDark, archer);
  }
}

/** Leather jerkin over the shirt, laced at the front. */
function jerkin(ctx: DressContext, l: Look, color: number): void {
  const L = ctx.p.spine;
  ctx
    .on('spine')
    .taper(0.33, 0.225, 0.42, 0.26, L * 0.66, { at: [0, -0.02, 0.005], color })
    .box(0.015, L * 0.5, 0.015, { at: [0, L * 0.3, 0.13], color: PAL.leatherDark, jitter: 0 });
  ctx.on('hips').taper(0.37, 0.25, 0.34, 0.23, 0.12, { at: [0, -0.08, 0.005], color });
  void l;
}

function dressThug(ctx: DressContext, variant: number, mark: BanditMark): WeaponSpec {
  const l = THUG_LOOKS[variant % THUG_LOOKS.length];
  body(ctx, l);
  head(ctx, l);
  jerkin(ctx, l, variant % 2 ? PAL.leather : shade(PAL.leather, 1.3));
  if (variant % 3 === 1) {
    // A scavenged shoulder guard, like the undead grunt's pauldron.
    ctx.on('upperArmL').taper(0.13, 0.14, 0.1, 0.12, 0.08, { at: [0.02, -0.03, 0], color: PAL.iron });
  }
  banditMark(ctx, l, mark, false);
  return variant % 2 ? hatchet(ctx) : banditSword(ctx);
}

function dressBanditArcher(ctx: DressContext, mark: BanditMark): WeaponSpec {
  const l: Look = { skin: HUE.skinWarm, hair: HUE.hairRed, hairStyle: 'short', shirt: HUE.linenDark, sleeve: PAL.leather, forearm: PAL.leatherDark, hands: PAL.leatherDark, trousers: PAL.leatherDark, boots: PAL.woodDark, belt: PAL.leatherDark };
  body(ctx, l);
  head(ctx, l);
  jerkin(ctx, l, PAL.leather);
  banditMark(ctx, l, mark, true);
  quiver(ctx);
  return bow(ctx);
}

function dressLeader(ctx: DressContext, mark: BanditMark): WeaponSpec {
  const l: Look = { s: 1.3, skin: HUE.skinFair, hair: HUE.hairBlack, hairStyle: 'bald', beard: 'full', shirt: mark === 'C' ? PAL.clothDark : HUE.banditRedDark, sleeve: PAL.leatherDark, forearm: 'skin', hands: PAL.leatherDark, trousers: PAL.clothDark, boots: PAL.leatherDark, belt: PAL.leatherDark, buckle: PAL.gold };
  body(ctx, l);
  head(ctx, l);
  const L = ctx.p.spine;
  const coat = mark === 'C' ? PAL.clothDark : HUE.banditRed;
  // A long coat, open at the front over the shirt.
  ctx
    .on('spine')
    .box(0.14, L, 0.03, { at: [-0.16, L / 2 - 0.02, 0.15], color: coat })
    .box(0.14, L, 0.03, { at: [0.16, L / 2 - 0.02, 0.15], color: coat })
    .box(0.03, L, 0.3, { at: [-0.24, L / 2 - 0.02, 0], color: coat })
    .box(0.03, L, 0.3, { at: [0.24, L / 2 - 0.02, 0], color: coat })
    .box(0.5, L, 0.03, { at: [0, L / 2 - 0.02, -0.15], color: coat });
  ctx
    .on('hips')
    .box(0.18, 0.6, 0.03, { at: [-0.14, -0.28, 0.16], rot: [0.08, 0, 0], color: coat })
    .box(0.18, 0.6, 0.03, { at: [0.14, -0.28, 0.16], rot: [0.08, 0, 0], color: coat })
    .box(0.5, 0.62, 0.03, { at: [0, -0.29, -0.16], rot: [-0.08, 0, 0], color: coat })
    .box(0.48, 0.1, 0.34, { at: [0, 0.03, 0], color: PAL.leatherDark })
    .box(0.09, 0.08, 0.02, { at: [0, 0.03, 0.18], color: PAL.gold });
  // Fur mantle across the shoulders: a shaggy collar, lighter at the front.
  ctx
    .on('spine')
    .taper(0.64, 0.4, 0.44, 0.3, 0.14, { at: [0, L - 0.06, -0.01], color: HUE.fur, jitter: 0.22 })
    .taper(0.44, 0.32, 0.3, 0.24, 0.06, { at: [0, L + 0.08, -0.01], color: HUE.fur, jitter: 0.22 })
    .box(0.5, 0.1, 0.05, { at: [0, L - 0.02, 0.21], rot: [0.3, 0, 0], color: HUE.furLight, jitter: 0.22 });
  for (const side of ['L', 'R'] as const) {
    ctx.on(`forearm${side}`).taper(0.12, 0.12, 0.13, 0.13, 0.16, { at: [0, -ctx.p.forearm, 0], color: PAL.leatherDark });
  }
  if (mark === 'A') kerchief(ctx, HUE.banditRed);
  else if (mark === 'B') headwrap(ctx, HUE.banditRed);
  else {
    kerchief(ctx, PAL.clothDark);
    hood(ctx, l, PAL.clothDark, false);
  }
  return fellingAxe(ctx);
}

// ---------------------------------------------------------------- villagers

function dressInnkeeper(ctx: DressContext): void {
  const l: Look = { belly: 0.08, skin: HUE.skinFair, hair: HUE.hairBrown, hairStyle: 'bald', beard: 'moustache', shirt: HUE.linen, sleeve: HUE.linen, forearm: 'skin', trousers: PAL.leatherDark, boots: PAL.leatherDark, belt: PAL.leather };
  body(ctx, l);
  head(ctx, l);
  rolledSleeves(ctx, l, HUE.linen);
  // Waistcoat.
  const L = ctx.p.spine;
  ctx
    .on('spine')
    .box(0.12, L * 0.7, 0.02, { at: [-0.1, L * 0.45, 0.18], color: HUE.russet })
    .box(0.12, L * 0.7, 0.02, { at: [0.1, L * 0.45, 0.18], color: HUE.russet });
  apron(ctx, l, HUE.apronWhite, false, 0.62);
  tankard(ctx);
}

function dressSmith(ctx: DressContext): void {
  const l: Look = { s: 1.1, skin: HUE.skinTan, hair: HUE.hairDark, hairStyle: 'cropped', beard: 'short', shirt: PAL.clothDark, sleeve: HUE.skinTan, forearm: 'skin', hands: PAL.leatherDark, trousers: PAL.leatherDark, boots: PAL.woodDark, belt: PAL.leatherDark };
  body(ctx, l);
  head(ctx, l);
  apron(ctx, l, PAL.leather, true, 0.66);
  gloves(ctx, l, PAL.leatherDark);
  hammer(ctx);
}

function dressFarmer(ctx: DressContext): void {
  const l: Look = { skin: HUE.skinWarm, hair: HUE.hairSandy, hairStyle: 'short', beard: 'stubble', shirt: HUE.linen, sleeve: HUE.linen, forearm: HUE.linen, trousers: HUE.ochre, boots: PAL.leatherDark };
  body(ctx, l);
  head(ctx, l);
  // Braces and a straw hat.
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

// ---------------------------------------------------------------- registry

function person(id: string, label: string, behaviour: EnemyKind | null, stand: Pose, p: Proportions, seed: number, dress: (ctx: DressContext) => WeaponSpec | void): Person {
  return {
    id,
    label,
    behaviour,
    stand,
    build(material) {
      let weapon: WeaponSpec = { bone: 'handR', base: [0, 0, 0], tip: [0, -0.1, 0], radius: 0 };
      const rig = new Rig(p, (ctx) => {
        const w = dress(ctx);
        if (w) weapon = w;
      }, material, seed);
      return { rig, weapon };
    },
  };
}

export function banditsWith(mark: BanditMark): Person[] {
  return [
    person(`thug0${mark}`, `Bandit thug v0 · ${mark}`, 'grunt', IDLE.grunt, HUMAN, 21, (ctx) => dressThug(ctx, 0, mark)),
    person(`thug1${mark}`, `Bandit thug v1 · ${mark}`, 'grunt', IDLE.grunt, HUMAN, 28, (ctx) => dressThug(ctx, 1, mark)),
    person(`thug2${mark}`, `Bandit thug v2 · ${mark}`, 'grunt', IDLE.grunt, HUMAN, 35, (ctx) => dressThug(ctx, 2, mark)),
    person(`archer${mark}`, `Bandit archer · ${mark}`, 'archer', IDLE.archer, { ...HUMAN, hipY: 0.93 }, 42, (ctx) => dressBanditArcher(ctx, mark)),
    person(`leader${mark}`, `Bandit leader · ${mark}`, 'brute', IDLE.brute, BIG, 49, (ctx) => dressLeader(ctx, mark)),
  ];
}

export const HALES: Person[] = [
  person('haleA', 'Marshal Hale · A captain', null, HALE_STAND, HUMAN, 5, haleCaptain),
  person('haleB', 'Marshal Hale · B knight', null, HALE_STAND, HUMAN, 6, haleKnight),
  person('haleC', 'Marshal Hale · C officer', null, HALE_STAND, HUMAN, 7, haleOfficer),
];

export const VILLAGERS: Person[] = [
  person('innkeeper', 'Innkeeper', null, HOLDING, STOUT, 61, dressInnkeeper),
  person('smith', 'Smith', null, HOLDING, BROAD, 62, dressSmith),
  person('farmer', 'Farmer', null, FORK, HUMAN, 63, dressFarmer),
];

export const PEOPLE: Person[] = [...HALES, ...(['A', 'B', 'C'] as const).flatMap(banditsWith), ...VILLAGERS];

export function findPerson(id: string): Person | undefined {
  return PEOPLE.find((p) => p.id === id);
}
