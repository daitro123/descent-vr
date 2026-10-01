import { Vector3 } from 'three';
import { DRAW } from '../enemies/poses';
import type { FamilyDef, WeaponSpec } from './characters';
import { belt, kettleHelm, keyBadge, LIVERY, liveryTabard, paddedJack } from './guards';
import { BUILDS, body, HUE, head, type Look, mail, shade } from './human';
import { PAL } from './palette';
import { type DressContext, posedBones, type Proportions } from './rig';

// House Corvane's bailiffs: an enemy family in the human body (human.ts),
// Dunmore's men on Brackenmoor's enclosures, its Kingsroad and Fellgate Hall,
// in the same crimson and black key as Corvane's men-at-arms at their door in
// Aldhaven (guards.ts). They fight with today's behaviours: the cudgel men as
// grunts, the crossbowmen as archers, and a big man with a shield and a mace
// as the brute. Corvane's crimson is deep and bluish and goes with black, on
// tabards and shields only, never on the face or as a sash, so it doesn't
// read as the bandits' red; the crossbow marks their archers.

const PI = Math.PI;
const DOWN = [PI, 0, 0] as const;
const { field: CRIMSON, badge: SABLE } = LIVERY.corvane;

/** A bailiff's ash cudgel, thickening to the striking end, in the hand along -Y. */
function cudgel(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.036, 0.12, 0.036, { at: [0, -0.04, 0], color: PAL.leatherDark })
    .taper(0.034, 0.034, 0.06, 0.06, 0.5, { at: [0, -0.09, 0], rot: DOWN, color: PAL.wood, mask: 1 })
    .box(0.066, 0.05, 0.066, { at: [0, -0.585, 0], color: PAL.woodDark, mask: 1 });
  return { bone: 'handR', base: [0, -0.15, 0], tip: [0, -0.62, 0], radius: 0.045 };
}

/** A shorter club, its head bound in iron and studded. */
function club(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.036, 0.12, 0.036, { at: [0, -0.04, 0], color: PAL.leatherDark })
    .taper(0.034, 0.034, 0.05, 0.05, 0.42, { at: [0, -0.09, 0], rot: DOWN, color: PAL.woodDark, mask: 1 })
    .box(0.07, 0.13, 0.07, { at: [0, -0.48, 0], color: PAL.ironDark, mask: 1 })
    .box(0.1, 0.03, 0.03, { at: [0, -0.46, 0], color: PAL.iron, mask: 1 })
    .box(0.03, 0.03, 0.1, { at: [0, -0.5, 0], color: PAL.iron, mask: 1 });
  return { bone: 'handR', base: [0, -0.15, 0], tip: [0, -0.56, 0], radius: 0.05 };
}

/** The shieldman's mace: a long haft and a flanged iron head, in the hand along -Y. */
function mace(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .cyl(0.026, 0.03, 1.1, 6, { at: [0, -0.48, 0], color: PAL.woodDark })
    .box(0.042, 0.16, 0.042, { at: [0, -0.04, 0], color: PAL.leatherDark })
    .box(0.09, 0.2, 0.09, { at: [0, -1.0, 0], color: PAL.ironDark, mask: 1 })
    .box(0.17, 0.15, 0.025, { at: [0, -1.0, 0], color: PAL.iron, mask: 1 })
    .box(0.025, 0.15, 0.17, { at: [0, -1.0, 0], color: PAL.iron, mask: 1 });
  return { bone: 'handR', base: [0, -0.3, 0], tip: [0, -1.08, 0], radius: 0.1 };
}

/** The right hand's nock at full draw (Enemy's NOCK), in the left hand's space: where a crossbow's stock meets the cheek. */
function cheekFrom(p: Proportions): Vector3 {
  const bones = posedBones(p, DRAW.windup);
  return new Vector3(0, -0.06, 0.02).applyMatrix4(bones.handR).applyMatrix4(bones.handL.invert());
}

/**
 * A crossbow in the left fist, aimed as the archer aims a bow: its stock runs
 * from in front of the fist back to the right hand at the cheek, the bolt
 * along it, the prod across its front and the string spanned back to the nut.
 * A crossbow strikes nothing, so its spec is the bow's placeholder.
 */
export function crossbow(ctx: DressContext): WeaponSpec {
  const grip = new Vector3(0, -0.06, 0);
  const cheek = cheekFrom(ctx.p);
  const back = cheek.clone().sub(grip).normalize();
  const front = grip.clone().addScaledVector(back, -0.24);
  const butt = cheek.clone().addScaledVector(back, 0.05);
  // Across the stock, level at full draw: the bow's limbs stand along the hand's Z, so the prod lies along its X.
  const across = new Vector3(1, 0, 0).addScaledVector(back, -back.x).normalize();
  const nut = front.clone().addScaledVector(back, 0.2);
  const v = (p: Vector3) => [p.x, p.y, p.z] as const;
  const b = ctx.on('handL');
  b.bar(v(front), v(butt), 0.04, 0.05, { color: PAL.wood, mask: 1 });
  for (const s of [1, -1]) {
    const tip = front.clone().addScaledVector(across, 0.3 * s).addScaledVector(back, 0.06);
    b.bar(v(front), v(tip), 0.03, 0.03, { color: PAL.ironDark, mask: 1 }).bar(v(tip), v(nut), 0.008, 0.008, { color: HUE.bowString, jitter: 0 });
  }
  b.bar(v(nut), v(front.clone().addScaledVector(back, -0.06)), 0.014, 0.014, { color: PAL.iron, jitter: 0 });
  return { bone: 'handL', base: [0, 0, 0], tip: [0, -0.1, 0], radius: 0 };
}

/** A case of bolts at the right hip. */
function boltCase(ctx: DressContext): void {
  ctx
    .on('hips')
    .box(0.07, 0.24, 0.09, { at: [-0.2, -0.1, -0.02], rot: [0, 0, -0.08], color: PAL.leatherDark })
    .box(0.05, 0.05, 0.07, { at: [-0.205, 0.04, -0.02], color: HUE.bowString });
}

/** A heater shield strapped to the left forearm, facing out: Corvane's crimson and its black key. */
function shield(ctx: DressContext): void {
  const fa = ctx.p.forearm;
  const y = -fa * 0.5;
  const x = 0.1;
  const b = ctx.on('forearmL');
  b.box(0.04, 0.5, 0.44, { at: [x, y + 0.04, 0.02], color: CRIMSON })
    .taper(0.04, 0.44, 0.04, 0.05, 0.2, { at: [x, y - 0.21, 0.02], rot: DOWN, color: CRIMSON })
    .box(0.046, 0.52, 0.035, { at: [x, y + 0.04, 0.02], color: SABLE });
  // The key on its face: a ring (the field showing through) over a shaft.
  b.box(0.012, 0.11, 0.11, { at: [x + 0.026, y + 0.17, 0.02], color: SABLE }).box(0.012, 0.05, 0.05, { at: [x + 0.033, y + 0.17, 0.02], color: CRIMSON });
}

const FACES: Look[] = [
  { build: 'average', skin: HUE.skinFair, hair: HUE.hairDark, hairStyle: 'none', beard: 'stubble', shirt: PAL.leatherDark, forearm: PAL.leatherDark, hands: SABLE, trousers: SABLE, boots: SABLE },
  { build: 'average', skin: HUE.skinWarm, hair: HUE.hairSandy, hairStyle: 'none', beard: 'moustache', shirt: PAL.leatherDark, forearm: PAL.leather, hands: SABLE, trousers: SABLE, boots: SABLE },
  { build: 'average', skin: HUE.skinTan, hair: HUE.hairBlack, hairStyle: 'cropped', shirt: PAL.leatherDark, forearm: PAL.leatherDark, hands: SABLE, trousers: SABLE, boots: SABLE },
];

/** The house's harness: a padded jack under the crimson tabard and its black key, a black belt. */
function harness(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  paddedJack(ctx, l, shade(PAL.leatherDark, 1.25), 0.2);
  liveryTabard(ctx, l, CRIMSON, 0.4, keyBadge);
  belt(ctx, l, SABLE, PAL.steel);
}

/** A bailiff with a cudgel: three faces, each with a cudgel or an iron-bound club, a blackened kettle helm on two. */
function dressBailiff(ctx: DressContext, variant: number): WeaponSpec {
  const face = variant % FACES.length;
  harness(ctx, FACES[face]);
  if (face !== 2) kettleHelm(ctx, PAL.ironDark);
  return variant % 2 ? club(ctx) : cudgel(ctx);
}

const CROSSBOW_LOOK: Look = { ...FACES[1], skin: HUE.skinFair, hair: HUE.hairBrown, hairStyle: 'short', beard: 'none' };

/** A crossbowman: bareheaded with a black leather cap, a case of bolts at the hip. */
function dressCrossbowman(ctx: DressContext): WeaponSpec {
  const l = CROSSBOW_LOOK;
  harness(ctx, l);
  ctx
    .on('head')
    .taper(0.205, 0.225, 0.17, 0.19, 0.06, { at: [0, 0.215, -0.01], color: SABLE })
    .box(0.2, 0.02, 0.05, { at: [0, 0.22, 0.11], rot: [0.25, 0, 0], color: SABLE });
  boltCase(ctx);
  return crossbow(ctx);
}

const SHIELDMAN_LOOK: Look = {
  build: 'big',
  skin: HUE.skinWarm,
  hair: HUE.hairBrown,
  hairStyle: 'none',
  beard: 'full',
  shirt: PAL.leatherDark,
  forearm: PAL.leatherDark,
  hands: SABLE,
  trousers: SABLE,
  boots: SABLE,
};

/** The shieldman: a big man in mail under the house's tabard, a blackened helm, a crimson shield with the key, and a long mace. */
function dressShieldman(ctx: DressContext): WeaponSpec {
  const l = SHIELDMAN_LOOK;
  body(ctx, l);
  head(ctx, l);
  mail(ctx, l, 0.24);
  // The key in front only: his shield carries it too.
  liveryTabard(ctx, l, CRIMSON, 0.44, (c, look, z, back) => {
    if (!back) keyBadge(c, look, z, back);
  });
  belt(ctx, l, SABLE, PAL.steel);
  kettleHelm(ctx, PAL.ironDark);
  shield(ctx);
  return mace(ctx);
}

/** The build each bailiff's body is made in. */
export const BAILIFF_BUILDS = { grunt: FACES[0].build, archer: CROSSBOW_LOOK.build, brute: SHIELDMAN_LOOK.build } as const;

/** House Corvane's bailiffs: cudgel men fight as grunts, crossbowmen as archers, the shieldman as a brute. */
export const BAILIFFS: FamilyDef = {
  body: 'human',
  seed: 31,
  fights: {
    grunt: { label: 'Bailiff', looks: 6, proportions: BUILDS[BAILIFF_BUILDS.grunt].proportions, dress: dressBailiff },
    archer: { label: 'Bailiff crossbowman', looks: 1, proportions: BUILDS[BAILIFF_BUILDS.archer].proportions, dress: dressCrossbowman },
    brute: { label: 'Bailiff shieldman', looks: 1, proportions: BUILDS[BAILIFF_BUILDS.brute].proportions, dress: dressShieldman },
  },
};
