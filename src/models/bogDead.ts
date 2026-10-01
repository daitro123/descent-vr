import type { FamilyDef, WeaponSpec } from './characters';
import { BUILDS, type Look } from './human';
import type { Vec3 } from './kit';
import { PAL } from './palette';
import type { Person } from './people';
import type { DressContext, Pose, Proportions } from './rig';

// The bog dead: the moor's oldest dead, put into the Blackmire with a rope at
// the neck long before the Deepkings were forgotten, and kept by the peat.
// Not skeletons but whole bodies, the skin tanned to dark leather and shrunk
// to the bone, the hair dyed red by the bog, rags of wool and hide, peat and
// moss on them. They're dressed part by part on the human body's bones, as the
// undead brute's stitched flesh is on its own: thin and leathery on the
// average build for the grunts, and the brute's hulking body for the brute.
// They rise out of the peat as the undead do, and fall whole (characters.ts,
// body 'corpse'). One lies `fallen` too: the body the peat cutters turned up.

const PI = Math.PI;
const DOWN: Vec3 = [PI, 0, 0];

/** Bog colours: tanned skin from dark to the light of a stretched cheekbone, peat, moss, the bog's red in the hair. */
export const BOG = {
  skin: 0x5a3c26,
  skinDark: 0x3e2a1c,
  skinLight: 0x7a563a,
  peat: 0x221810,
  moss: 0x4e5a2c,
  hair: 0x8a3e1c,
  rope: 0x7a6440,
  rag: 0x4a4034,
  bogOak: 0x1e1814,
  /** What's left in the eyes: a dim marsh light. */
  eye: 0xc8d060,
} as const;

// ---------------------------------------------------------------- a bog body

/** A shrunken leather head: sunken eyes, a flattened nose, the lips drawn back from the teeth, the bog's red hair matted to one side. */
function bogHead(ctx: DressContext, eyes: boolean): void {
  const neck = ctx.p.neck - ctx.p.spine;
  const h = ctx.on('head');
  h.box(0.075, neck + 0.06, 0.075, { at: [0, -neck / 2 + 0.02, -0.01], color: BOG.skinDark })
    .box(0.17, 0.15, 0.19, { at: [0, 0.155, 0], color: BOG.skin, jitter: 0.16 })
    .taper(0.12, 0.15, 0.16, 0.19, 0.08, { at: [0, 0.0, 0.005], color: BOG.skinDark, jitter: 0.16 })
    // Cheekbones and brow standing out of the sunken face.
    .box(0.17, 0.025, 0.03, { at: [0, 0.172, 0.09], color: BOG.skinLight })
    .box(0.05, 0.04, 0.02, { at: [-0.044, 0.142, 0.092], color: PAL.socket, jitter: 0 })
    .box(0.05, 0.04, 0.02, { at: [0.044, 0.142, 0.092], color: PAL.socket, jitter: 0 })
    .box(0.03, 0.035, 0.03, { at: [0, 0.1, 0.1], color: BOG.skinLight })
    .box(0.08, 0.02, 0.012, { at: [0, 0.063, 0.096], color: PAL.boneShade, jitter: 0 });
  if (eyes) {
    h.box(0.018, 0.016, 0.012, { at: [-0.044, 0.142, 0.098], color: BOG.eye, glow: 0.8, jitter: 0 }).box(0.018, 0.016, 0.012, {
      at: [0.044, 0.142, 0.098],
      color: BOG.eye,
      glow: 0.8,
      jitter: 0,
    });
  }
  // Hair matted flat and swept to its left, long at the back.
  h.box(0.18, 0.04, 0.2, { at: [0.008, 0.24, -0.01], rot: [0, 0, 0.12], color: BOG.hair, jitter: 0.18 }).box(0.17, 0.2, 0.04, {
    at: [0.01, 0.13, -0.1],
    color: BOG.hair,
    jitter: 0.18,
  });
  ctx.on('jaw').box(0.09, 0.03, 0.045, { at: [0, 0.0, 0.015], color: BOG.skinDark });
}

/** The rope that hanged them, knotted at the neck, its cut end hanging down the back. */
function noose(ctx: DressContext, k: number): void {
  const L = ctx.p.spine;
  ctx
    .on('spine')
    .cyl(0.07 * k, 0.075 * k, 0.04, 6, { at: [0, L + 0.04, -0.005], color: BOG.rope })
    .bar([0, L + 0.03, -0.075 * k], [0.03, L - 0.3, -0.115 * k], 0.022, 0.022, { color: BOG.rope });
}

/** Rags of wool and a hide belt at the hips, torn short. */
function rags(ctx: DressContext, k: number): void {
  ctx
    .on('hips')
    .box(0.27 * k, 0.05, 0.19 * k, { at: [0, 0.02, 0], color: PAL.leatherDark })
    .box(0.2 * k, 0.3, 0.02, { at: [0.02, -0.14, 0.1 * k], rot: [0.05, 0, 0.06], color: BOG.rag, jitter: 0.16 })
    .box(0.24 * k, 0.24, 0.02, { at: [-0.01, -0.11, -0.1 * k], rot: [-0.05, 0, -0.05], color: BOG.rag, jitter: 0.16 });
}

/**
 * A bog body on the human body's bones: thin and leathery, the ribs standing
 * out, long hands, bare feet, the rope at the neck, rags at the hips, and
 * peat and moss caked on a shoulder and a shin.
 */
function bogBody(ctx: DressContext, eyes: boolean, k = 0.88): void {
  const { spine: L, upperArm: UA, forearm: FA, thigh: TH, shin: SH } = ctx.p;
  const s = ctx.on('spine');
  s.taper(0.24 * k, 0.17 * k, 0.33 * k, 0.21 * k, L * 0.72, { at: [0, -0.02, 0], color: BOG.skin, jitter: 0.14 }).taper(
    0.33 * k,
    0.21 * k,
    (ctx.p.shoulderW * 2) * k,
    0.17 * k,
    L * 0.3,
    { at: [0, L * 0.7 - 0.02, 0], color: BOG.skin, jitter: 0.14 },
  );
  // Ribs under the leather, and the hollow below them.
  for (const y of [0.52, 0.64, 0.76]) s.box(0.27 * k, 0.022, 0.02, { at: [0, L * y, 0.1 * k], color: BOG.skinLight, jitter: 0 });
  s.box(0.18 * k, 0.1, 0.02, { at: [0, L * 0.3, 0.085 * k], color: BOG.skinDark, jitter: 0 });
  ctx.on('hips').taper(0.26 * k, 0.17 * k, 0.24 * k, 0.17 * k, 0.16, { at: [0, -0.12, 0], color: BOG.skinDark });
  bogHead(ctx, eyes);
  noose(ctx, k);
  rags(ctx, k);
  for (const side of ['L', 'R'] as const) {
    ctx
      .on(`upperArm${side}`)
      .ball(0.05 * k, { color: BOG.skin })
      .taper(0.06 * k, 0.065 * k, 0.08 * k, 0.085 * k, UA, { at: [0, -UA, 0], color: BOG.skin, jitter: 0.14 });
    ctx.on(`forearm${side}`).taper(0.05 * k, 0.05 * k, 0.065 * k, 0.065 * k, FA, { at: [0, -FA, 0], color: BOG.skinDark, jitter: 0.14 });
    ctx
      .on(`hand${side}`)
      .box(0.06, 0.08, 0.035, { at: [0, -0.04, 0.004], color: BOG.skinDark })
      .box(0.05, 0.07, 0.02, { at: [0, -0.1, 0.008], color: BOG.skin });
    ctx.on(`thigh${side}`).taper(0.085 * k, 0.095 * k, 0.11 * k, 0.12 * k, TH, { at: [0, -TH, 0], color: BOG.skin, jitter: 0.14 });
    ctx
      .on(`shin${side}`)
      .taper(0.06 * k, 0.07 * k, 0.085 * k, 0.095 * k, SH, { at: [0, -SH, 0], color: BOG.skinDark, jitter: 0.14 });
    ctx.on(`foot${side}`).box(0.085, 0.05, 0.21, { at: [0, -0.005, 0.045], color: BOG.skinDark });
  }
  // Peat and moss caked on: a shoulder, the back, a shin.
  ctx.on('upperArmR').box(0.11, 0.08, 0.12, { at: [0, -0.02, 0], color: BOG.peat, jitter: 0.25 });
  s.box(0.2 * k, 0.16, 0.04, { at: [0.04, L * 0.6, -0.1 * k], rot: [0, 0, 0.3], color: BOG.peat, jitter: 0.25 }).box(0.1, 0.06, 0.03, {
    at: [0.08, L * 0.7, -0.12 * k],
    color: BOG.moss,
    jitter: 0.25,
  });
  ctx.on('shinL').box(0.1, 0.14, 0.11, { at: [0, -SH + 0.18, 0], color: BOG.peat, jitter: 0.25 });
}

// ---------------------------------------------------------------- what they strike with (in the hand, along -Y)

/** A stake of black bog oak, knotted and thicker at the end. */
function bogOakStake(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .taper(0.035, 0.035, 0.05, 0.045, 0.66, { at: [0, 0.06, 0], rot: DOWN, color: BOG.bogOak, mask: 1 })
    .box(0.07, 0.08, 0.06, { at: [0.01, -0.5, 0.0], rot: [0, 0.4, 0.2], color: BOG.bogOak, mask: 1 });
  return { bone: 'handR', base: [0, -0.12, 0], tip: [0, -0.6, 0], radius: 0.05 };
}

/** An old blade the bog has eaten black and ragged. */
function oldBlade(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.03, 0.1, 0.03, { at: [0, -0.04, 0], color: BOG.bogOak })
    .box(0.026, 0.026, 0.12, { at: [0, -0.1, 0], color: PAL.rust, mask: 1 })
    .taper(0.012, 0.05, 0.008, 0.02, 0.62, { at: [0, -0.11, 0], rot: DOWN, color: 0x3a3430, mask: 1 })
    .box(0.014, 0.12, 0.03, { at: [0, -0.4, -0.01], color: PAL.rust, mask: 1 });
  return { bone: 'handR', base: [0, -0.12, 0], tip: [0, -0.74, 0], radius: 0.035 };
}

/** A log of bog oak, black and heavy, a root-knot for a head: the brute's maul. */
function bogOakLog(ctx: DressContext): WeaponSpec {
  ctx
    .on('handR')
    .box(0.06, 1.0, 0.06, { at: [0, -0.42, 0], color: BOG.bogOak, mask: 1 })
    .box(0.22, 0.28, 0.24, { at: [0, -0.98, 0], rot: [0.2, 0.3, 0], color: BOG.bogOak, mask: 1, jitter: 0.2 })
    .box(0.12, 0.08, 0.12, { at: [0.06, -0.86, 0.08], color: BOG.moss, mask: 1 });
  return { bone: 'handR', base: [0, -0.2, 0], tip: [0, -1.1, 0], radius: 0.16 };
}

// ---------------------------------------------------------------- the grunt and the brute

/** A bog dead grunt: the bog body, a sheepskin cap on some, a bog-oak stake or an old blade. */
function dressBogGrunt(ctx: DressContext, variant: number): WeaponSpec {
  bogBody(ctx, true);
  // The pointed sheepskin cap some were put into the peat in, tied under the chin.
  if (variant % 3 === 1) {
    ctx
      .on('head')
      .taper(0.2, 0.22, 0.06, 0.06, 0.13, { at: [0, 0.2, -0.01], color: PAL.leather, jitter: 0.16 })
      .box(0.012, 0.14, 0.012, { at: [-0.09, 0.12, 0.03], color: PAL.leatherDark, jitter: 0 });
  }
  return variant % 2 ? oldBlade(ctx) : bogOakStake(ctx);
}

/** The bog dead brute: the undead brute's hulking body, but whole and tanned dark, peat to the waist, a rope at its thick neck, with a bog-oak log. */
function dressBogBrute(ctx: DressContext): WeaponSpec {
  const { upperArm: UA, forearm: FA, thigh: TH, shin: SH, spine: L } = ctx.p;
  const F = BOG.skin;
  const FD = BOG.skinDark;
  ctx
    .on('hips')
    .taper(0.36, 0.3, 0.46, 0.36, 0.24, { at: [0, -0.18, 0], color: BOG.peat, jitter: 0.22 })
    .box(0.5, 0.08, 0.4, { at: [0, 0.02, 0], color: PAL.leatherDark })
    .box(0.3, 0.38, 0.03, { at: [0, -0.2, 0.2], color: BOG.rag, jitter: 0.16 });
  ctx
    .on('spine')
    .taper(0.46, 0.38, 0.6, 0.44, 0.36, { at: [0, 0, 0.03], color: F, jitter: 0.14 })
    .taper(0.6, 0.44, 0.84, 0.4, 0.32, { at: [0, 0.34, 0], color: F, jitter: 0.14 })
    .ball(0.22, { at: [0, L - 0.06, -0.15], color: FD }, 1)
    .box(0.4, 0.024, 0.03, { at: [0, L * 0.55, 0.23], color: BOG.skinLight, jitter: 0 })
    .box(0.4, 0.024, 0.03, { at: [0, L * 0.7, 0.21], color: BOG.skinLight, jitter: 0 })
    .box(0.36, 0.26, 0.05, { at: [0.08, L * 0.5, -0.22], rot: [0, 0, 0.3], color: BOG.peat, jitter: 0.25 })
    .box(0.16, 0.08, 0.04, { at: [0.14, L * 0.62, -0.25], color: BOG.moss, jitter: 0.25 })
    .cyl(0.17, 0.19, 0.06, 6, { at: [0, L + 0.02, 0.02], color: BOG.rope })
    .bar([0.05, L, 0.18], [0.1, L - 0.4, 0.27], 0.035, 0.035, { color: BOG.rope });
  ctx
    .on('head')
    .taper(0.26, 0.26, 0.2, 0.22, 0.24, { at: [0, -0.02, 0], color: F, jitter: 0.14 })
    .box(0.28, 0.05, 0.08, { at: [0, 0.16, 0.1], color: BOG.skinLight })
    .box(0.06, 0.05, 0.03, { at: [-0.065, 0.12, 0.13], color: PAL.socket, jitter: 0 })
    .box(0.06, 0.05, 0.03, { at: [0.065, 0.12, 0.13], color: PAL.socket, jitter: 0 })
    .box(0.03, 0.025, 0.02, { at: [-0.065, 0.12, 0.142], color: BOG.eye, glow: 0.8, jitter: 0 })
    .box(0.03, 0.025, 0.02, { at: [0.065, 0.12, 0.142], color: BOG.eye, glow: 0.8, jitter: 0 })
    .box(0.27, 0.1, 0.24, { at: [0.01, 0.23, -0.02], rot: [0, 0, 0.1], color: BOG.hair, jitter: 0.18 });
  ctx
    .on('jaw')
    .box(0.28, 0.1, 0.2, { at: [0, -0.06, 0.0], color: FD })
    .box(0.18, 0.025, 0.02, { at: [0, -0.02, 0.1], color: PAL.boneShade, jitter: 0 });
  for (const side of ['L', 'R'] as const) {
    ctx.on(`upperArm${side}`).taper(0.24, 0.24, 0.18, 0.18, UA, { rot: DOWN, color: F, jitter: 0.14 });
    ctx.on(`forearm${side}`).taper(0.18, 0.18, 0.24, 0.22, FA, { rot: DOWN, color: FD, jitter: 0.14 });
    ctx.on(`hand${side}`).box(0.2, 0.2, 0.16, { at: [0, -0.09, 0], color: FD });
    ctx.on(`thigh${side}`).taper(0.26, 0.26, 0.2, 0.2, TH, { rot: DOWN, color: BOG.peat, jitter: 0.22 });
    ctx
      .on(`shin${side}`)
      .taper(0.2, 0.2, 0.16, 0.16, SH, { rot: DOWN, color: FD, jitter: 0.14 });
    ctx.on(`foot${side}`).box(0.2, 0.08, 0.32, { at: [0, 0.02, 0.07], color: FD });
  }
  return bogOakLog(ctx);
}

// ---------------------------------------------------------------- the family

/** The grunts' bones: the human body's average build, so a bog body can lie `fallen` too. */
const GRUNT: Proportions = BUILDS.average.proportions;

/** The brute's bones: the undead brute's (characters.ts `PROPORTIONS.brute`), whose reach the brute's behaviour was set for. */
export const BOG_BRUTE: Proportions = {
  hipY: 1.02,
  hipW: 0.17,
  spine: 0.66,
  shoulderW: 0.4,
  neck: 0.62,
  upperArm: 0.42,
  forearm: 0.4,
  thigh: 0.48,
  shin: 0.5,
  head: 1.6,
  headZ: 0.16,
};

/** The bog dead: grunts in the human body's bones, the brute in the undead brute's; they rise from the peat and fall whole. */
export const BOG_DEAD: FamilyDef = {
  body: 'corpse',
  seed: 71,
  fights: {
    grunt: { label: 'Bog dead', looks: 6, proportions: GRUNT, dress: dressBogGrunt },
    brute: { label: 'Bog dead brute', looks: 1, proportions: BOG_BRUTE, dress: dressBogBrute },
  },
};

/** Lying as they were put into the peat: no one sees them stand. */
const LIMP: Pose = { upperArmL: [0.04, 0, 0.1], upperArmR: [0.04, 0, -0.1] };

/** Its build only sets its bones: the body is the bog's own. */
const BOG_BODY_LOOK: Look = { build: 'average', skin: BOG.skin, hair: BOG.hair, hairStyle: 'none', shirt: BOG.skin, trousers: BOG.skin, boots: BOG.skinDark };

/** The bog body the peat cutters turned up at Turfmoss, for a zone to place `fallen` (people/fallen.ts): no light in its eyes. */
export const BOG_BODIES = {
  bogBody: { label: 'Bog body', look: BOG_BODY_LOOK, stand: LIMP, dress: (ctx) => bogBody(ctx, false), seed: 83 },
} satisfies Record<string, Person>;
