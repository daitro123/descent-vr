import { bow } from './bow';
import type { FamilyDef, HumanoidKind, WeaponSpec } from './characters';
import { BUILDS, type BuildName, body, HUE, head, hood, kerchief, type Look, quiver, sash, shade } from './human';
import type { Vec3 } from './kit';
import { PAL } from './palette';
import type { DressContext } from './rig';

// The bandits: enemies with today's behaviours, in the human body (human.ts).
// Red on the face and at the waist marks the family, and a green hood an
// archer of either family.

const PI = Math.PI;
const DOWN: Vec3 = [PI, 0, 0]; // taper parts grow along +Y; this flips them down a limb

/** The behaviours a bandit fights with: the thug a grunt's, the archer an archer's, the leader a brute's. */
export type BanditKind = Exclude<HumanoidKind, 'warden'>;

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

const THUG_BUILD: BuildName = 'average';

/** Thugs vary the way grunts do: three faces, each with a sword or a hatchet. */
const THUG_LOOKS: Look[] = [
  {
    build: THUG_BUILD,
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
    build: THUG_BUILD,
    skin: HUE.skinTan,
    hair: HUE.hairBlack,
    hairStyle: 'tied',
    shirt: HUE.linen,
    forearm: PAL.leather,
    hands: PAL.leatherDark,
    trousers: PAL.clothDark,
    boots: PAL.woodDark,
    belt: PAL.leather,
  },
  {
    build: THUG_BUILD,
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
  return bow(ctx, { tips: PAL.iron, string: HUE.bowString });
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
    .box(0.48, 0.1, 0.34, { at: [0, 0.0, 0], color: PAL.leatherDark })
    .box(0.09, 0.08, 0.02, { at: [0, 0.0, 0.18], color: PAL.gold });
  // A fur mantle across the shoulders: a shaggy collar, lighter at the front.
  ctx
    .on('spine')
    .taper(0.64, 0.4, 0.44, 0.3, 0.14, { at: [0, L - 0.06, -0.01], color: HUE.fur, jitter: 0.22 })
    .taper(0.44, 0.32, 0.3, 0.24, 0.06, { at: [0, L + 0.08, -0.01], color: HUE.fur, jitter: 0.22 })
    .box(0.5, 0.1, 0.05, { at: [0, L - 0.02, 0.21], rot: [0.3, 0, 0], color: HUE.furLight, jitter: 0.22 });
  for (const side of ['L', 'R'] as const) {
    ctx.on(`forearm${side}`).taper(0.12, 0.12, 0.13, 0.13, 0.16, { at: [0, -ctx.p.forearm, 0], color: PAL.leatherDark });
  }
  // The family's marks; the sash, wound over the coat above the belt, is dark so it shows on the red.
  kerchief(ctx, HUE.banditRed);
  sash(ctx, l, HUE.banditRedDark, 1.5);
  return fellingAxe(ctx);
}

/** The build each bandit's body is made in. */
export const BANDIT_BUILDS: Record<BanditKind, BuildName> = { grunt: THUG_BUILD, archer: ARCHER_LOOK.build, brute: LEADER_LOOK.build };

/** The bandits, in the human body: thugs fight as grunts, the archer as an archer, the leader as a brute. */
export const BANDITS: FamilyDef = {
  body: 'human',
  seed: 21,
  fights: {
    grunt: { label: 'Bandit thug', looks: 6, proportions: BUILDS[BANDIT_BUILDS.grunt].proportions, dress: dressThug },
    archer: { label: 'Bandit archer', looks: 1, proportions: BUILDS[BANDIT_BUILDS.archer].proportions, dress: dressArcher },
    brute: { label: 'Bandit leader', looks: 1, proportions: BUILDS[BANDIT_BUILDS.brute].proportions, dress: dressLeader },
  },
};
