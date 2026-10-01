import { IcosahedronGeometry } from 'three';
import type { FamilyDef, WeaponSpec } from './characters';
import type { ModelBuilder, Vec3 } from './kit';
import type { DressContext, Proportions } from './rig';

// The bog beasts: what lives in the Mire's quaking bog, and in the sewers
// under Aldhaven. The bog lurker is a hulking mud thing on the humanoid
// skeleton in a hunched heavy build of its own: short legs, long arms that
// drag its knuckles, its head sunk forward between its shoulders and a mound
// of a back with reeds growing out of it, so that crouched (poses.ts MOUND)
// it is a tussock in the bog until you come close. It fights as a brute,
// swinging a black bog-oak limb. The Mire King is one half again as big,
// crowned with bog-oak; the sewer beast is one bloated grey-brown in the dark.

const PI = Math.PI;
const DOWN: Vec3 = [PI, 0, 0];

/** Mud and peat, reed and lichen, and marsh gas in its eyes; the sewer's grey-brown. */
export const BOG_HUE = {
  mud: 0x4c4130,
  mudDark: 0x382f22,
  mudWet: 0x2c261c,
  peat: 0x2a241c,
  moss: 0x5c6634,
  lichen: 0x7a8060,
  reed: [0xa89d62, 0x9a9058, 0x8c8a50] as const,
  reedHead: 0x5a4430,
  weed: 0x4e6234,
  weedDark: 0x34452a,
  bogOak: 0x2a2420,
  tooth: 0x8a7a5a,
  /** Marsh gas: the sickly yellow-green glow in a lurker's eyes. */
  gas: 0xd8f06a,
  iris: 0xe0c040,
  lily: 0x4e6a3a,
  /** The sewer beast's: grey-brown, pale where it's bloated, and a pale yellow stare. */
  sewer: 0x6a6250,
  sewerDark: 0x4a4438,
  sewerPale: 0x8a8068,
  sewerEye: 0xf0e88a,
  rust: 0x7a4a2c,
  rustDark: 0x4e3020,
  rag: 0x4a4636,
} as const;

/** The lurker's build: short legs, a long back, long arms, the head forward and low. */
export const LURKER: Proportions = {
  hipY: 0.82,
  hipW: 0.17,
  spine: 0.62,
  shoulderW: 0.38,
  neck: 0.48,
  upperArm: 0.5,
  forearm: 0.5,
  thigh: 0.4,
  shin: 0.38,
  head: 1.3,
  headZ: 0.22,
};

/** A build `k` times the size of `p`, every length scaled. */
export function scaledBuild(p: Proportions, k: number): Proportions {
  return {
    ...p,
    hipY: p.hipY * k,
    hipW: p.hipW * k,
    spine: p.spine * k,
    shoulderW: p.shoulderW * k,
    neck: p.neck * k,
    upperArm: p.upperArm * k,
    forearm: p.forearm * k,
    thigh: p.thigh * k,
    shin: p.shin * k,
    head: (p.head ?? 1) * k,
    headZ: (p.headZ ?? 0) * k,
  };
}

/** The Mire King: half again as big as a lurker. */
export const MIRE_KING = scaledBuild(LURKER, 1.5);

/** A lump: a rounded blob `r` across in each direction (a hump, a belly), at `at`. */
function lump(b: ModelBuilder, r: Vec3, o: { at: Vec3; color: number; rot?: Vec3 }, detail = 1): void {
  b.shape(new IcosahedronGeometry(1, detail).scale(r[0], r[1], r[2]), { ...o, jitter: 0.1 });
}

/** A strand of weed hanging from `at`, `len` long. */
function weed(b: ModelBuilder, at: Vec3, len: number, k: number, color: number = BOG_HUE.weed): void {
  b.box(0.04 * k, len, 0.01 * k, { at: [at[0], at[1] - len / 2, at[2]], color, jitter: 0.12 });
}

/** How a lurker is dressed: its colours and what grows on it. */
interface LurkerLook {
  /** Thickness and size of everything on it, with its build. */
  k: number;
  mud: number;
  mudDark: number;
  mudWet: number;
  eye: number;
  /** Reeds out of its back: none in the sewer. */
  reeds: number;
  /** A belly bloated with sewer water. */
  bloated?: boolean;
}

/** The body: a heavy pelvis and stumpy legs, a torso widening to the shoulders, the mound of its back, the long arms and the sunk head. */
function lurkerBody(ctx: DressContext, l: LurkerLook): void {
  const { k, mud, mudDark, mudWet } = l;
  const { spine: L, upperArm: UA, forearm: FA, thigh: TH, shin: SH } = ctx.p;
  ctx.on('hips').taper(0.46 * k, 0.4 * k, 0.56 * k, 0.46 * k, 0.3 * k, { at: [0, -0.22 * k, 0], color: mudDark });
  const torso = ctx.on('spine');
  torso
    .taper(0.56 * k, 0.46 * k, 0.86 * k, 0.56 * k, L, { at: [0, 0, 0.02 * k], color: mud })
    .box(0.5 * k, 0.12 * k, 0.1 * k, { at: [0, L - 0.08 * k, 0.26 * k], color: mudDark });
  // The mound of its back, rising over its shoulders, with moss on it.
  lump(torso, [0.44 * k, 0.36 * k, 0.36 * k], { at: [0, L - 0.04 * k, -0.17 * k], color: mudDark });
  torso
    .box(0.24 * k, 0.02 * k, 0.2 * k, { at: [0.12 * k, L + 0.28 * k, -0.2 * k], rot: [-0.3, 0, 0.2], color: l.reeds ? BOG_HUE.moss : BOG_HUE.sewerPale })
    .box(0.18 * k, 0.02 * k, 0.16 * k, { at: [-0.16 * k, L + 0.22 * k, -0.05 * k], rot: [0.2, 0, -0.35], color: l.reeds ? BOG_HUE.lichen : mudWet });
  if (l.bloated) lump(torso, [0.4 * k, 0.36 * k, 0.3 * k], { at: [0, 0.2 * k, 0.18 * k], color: BOG_HUE.sewerPale });
  weed(torso, [0.36 * k, L + 0.02 * k, -0.12 * k], 0.38 * k, k);
  weed(torso, [-0.38 * k, L - 0.04 * k, -0.08 * k], 0.3 * k, k, BOG_HUE.weedDark);
  // The head, low, broad and flat; a brow over its eyes; a wide jaw with peg teeth.
  ctx
    .on('head')
    .taper(0.38 * k, 0.32 * k, 0.3 * k, 0.26 * k, 0.22 * k, { at: [0, -0.02 * k, 0.02 * k], color: mud })
    .box(0.38 * k, 0.06 * k, 0.09 * k, { at: [0, 0.17 * k, 0.14 * k], color: mudDark })
    .box(0.06 * k, 0.034 * k, 0.02 * k, { at: [-0.085 * k, 0.125 * k, 0.168 * k], color: l.eye, glow: 1, jitter: 0 })
    .box(0.06 * k, 0.034 * k, 0.02 * k, { at: [0.085 * k, 0.125 * k, 0.168 * k], color: l.eye, glow: 1, jitter: 0 })
    .box(0.07 * k, 0.05 * k, 0.05 * k, { at: [0, 0.07 * k, 0.17 * k], color: mudDark });
  const jaw = ctx.on('jaw');
  jaw.box(0.36 * k, 0.09 * k, 0.26 * k, { at: [0, -0.05 * k, 0.03 * k], color: mudDark }).box(0.3 * k, 0.02 * k, 0.02 * k, { at: [0, -0.005 * k, 0.16 * k], color: BOG_HUE.peat, jitter: 0 });
  for (const x of [-0.1, -0.03, 0.05, 0.11]) jaw.cone(0.016 * k, 0.05 * k, 4, { at: [x * k, 0.02 * k, 0.15 * k], color: BOG_HUE.tooth });
  for (const side of ['L', 'R'] as const) {
    const x = side === 'L' ? 1 : -1;
    const arm = ctx.on(`upperArm${side}`);
    lump(arm, [0.15 * k, 0.13 * k, 0.15 * k], { at: [0.02 * k * x, 0, 0], color: mud }, 0);
    arm.taper(0.2 * k, 0.2 * k, 0.16 * k, 0.16 * k, UA, { rot: DOWN, color: mud });
    ctx
      .on(`forearm${side}`)
      .taper(0.16 * k, 0.16 * k, 0.25 * k, 0.24 * k, FA, { rot: DOWN, color: mudDark })
      .box(0.26 * k, 0.12 * k, 0.25 * k, { at: [0, -FA * 0.85, 0], color: mudWet });
    // A big hand, three root-like claws.
    const hand = ctx.on(`hand${side}`);
    hand.box(0.24 * k, 0.15 * k, 0.22 * k, { at: [0, -0.07 * k, 0], color: mudWet });
    for (const z of [-0.07, 0, 0.07]) hand.taper(0.045 * k, 0.045 * k, 0.015 * k, 0.015 * k, 0.15 * k, { at: [0.06 * x * k, -0.13 * k, z * k], rot: DOWN, color: BOG_HUE.peat });
    ctx
      .on(`thigh${side}`)
      .taper(0.27 * k, 0.27 * k, 0.22 * k, 0.22 * k, TH, { rot: DOWN, color: mudDark })
      .box(0.24 * k, 0.06 * k, 0.24 * k, { at: [0, -TH * 0.7, 0], color: mudWet });
    ctx
      .on(`shin${side}`)
      .taper(0.22 * k, 0.22 * k, 0.25 * k, 0.25 * k, SH - 0.04 * k, { rot: DOWN, color: mud })
      .box(0.28 * k, 0.08 * k, 0.34 * k, { at: [0, -SH + 0.0 * k, 0.07 * k], color: mudWet });
  }
}

/** Reeds out of the mound of its back, leaning back and out, some in seed; `n` of them. */
function reedsOnBack(ctx: DressContext, k: number, n: number, iris: boolean): void {
  const L = ctx.p.spine;
  const b = ctx.on('spine');
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * PI + 0.4;
    const r = 0.1 + ((i * 0.37) % 0.18);
    const x = Math.cos(a) * r * 2;
    const z = -0.2 + Math.sin(a) * r * 1.2;
    const h = (0.45 + ((i * 0.29) % 0.35)) * k;
    const y = L + (0.26 - r * 0.5) * k;
    // Back against the hunch, so they stand up from the mound when it crouches, and fan out.
    const lean: Vec3 = [-0.8 + Math.sin(a) * 0.2, 0, -x * 1.2];
    const base: Vec3 = [x * k, y - 0.05 * k, z * k];
    // A point `f` of the way up the reed (its box turns about its middle, Euler XYZ).
    const up = (f: number): Vec3 => {
      const [rx, , rz] = lean;
      const d = f * h;
      return [base[0] - d * Math.sin(rz), base[1] + d * Math.cos(rz) * Math.cos(rx), base[2] + d * Math.cos(rz) * Math.sin(rx)];
    };
    b.box(0.022 * k, h, 0.022 * k, { at: up(0.5), rot: lean, color: BOG_HUE.reed[i % 3] });
    if (i % 3 === 0) b.box(0.04 * k, 0.14 * k, 0.04 * k, { at: up(0.92), rot: lean, color: BOG_HUE.reedHead });
    else if (iris && i % 3 === 1) b.box(0.07 * k, 0.05 * k, 0.07 * k, { at: up(0.78), rot: lean, color: BOG_HUE.iris });
  }
}

/** A black bog-oak limb out of the peat, gnarled, a knot of root at its end: what it swings. */
function bogOak(ctx: DressContext, k = 1): WeaponSpec {
  const b = ctx.on('handR');
  const pts: Vec3[] = [
    [0, 0.08, 0],
    [0.02, -0.3, -0.02],
    [-0.03, -0.66, 0.02],
    [0.01, -0.92, -0.01],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, c] = [pts[i], pts[i + 1]];
    b.bar([a[0] * k, a[1] * k, a[2] * k], [c[0] * k, c[1] * k, c[2] * k], (0.07 - i * 0.004) * k, (0.065 - i * 0.004) * k, { color: BOG_HUE.bogOak, mask: i > 0 ? 1 : 0 });
  }
  lump(b, [0.13 * k, 0.12 * k, 0.12 * k], { at: [0, -0.98 * k, 0], color: BOG_HUE.bogOak }, 0);
  b.bar([0, -0.9 * k, 0], [0.12 * k, -1.04 * k, -0.05 * k], 0.04 * k, 0.04 * k, { color: BOG_HUE.peat, mask: 1 })
    .bar([0, -0.95 * k, 0], [-0.1 * k, -1.06 * k, 0.06 * k], 0.035 * k, 0.035 * k, { color: BOG_HUE.peat, mask: 1 })
    .box(0.1 * k, 0.03 * k, 0.1 * k, { at: [0.02 * k, -0.5 * k, 0], rot: [0, 0.4, 0.2], color: BOG_HUE.lichen });
  return { bone: 'handR', base: [0, -0.2 * k, 0], tip: [0, -1.05 * k, 0], radius: 0.15 * k };
}

/** The sewer beast's club: a length of rusted grate bar, its crossbars still on it. */
function grateBar(ctx: DressContext): WeaponSpec {
  const b = ctx.on('handR');
  b.box(0.05, 1.08, 0.05, { at: [0, -0.46, 0], color: BOG_HUE.rustDark })
    .box(0.06, 0.12, 0.06, { at: [0, -0.02, 0], color: BOG_HUE.rag })
    .box(0.04, 0.04, 0.34, { at: [0, -0.72, 0], color: BOG_HUE.rust, mask: 1 })
    .box(0.04, 0.04, 0.3, { at: [0, -0.96, 0.02], color: BOG_HUE.rust, mask: 1 })
    .box(0.07, 0.12, 0.07, { at: [0, -1.0, 0], color: BOG_HUE.rustDark, mask: 1 })
    .box(0.052, 0.6, 0.052, { at: [0, -0.7, 0], color: BOG_HUE.rustDark, mask: 1 });
  return { bone: 'handR', base: [0, -0.2, 0], tip: [0, -1.05, 0], radius: 0.15 };
}

/** A bog lurker, in two looks: the mud a little lighter or darker, more reeds or fewer. */
function dressLurker(ctx: DressContext, v: number): WeaponSpec {
  const dark = v % 2 === 1;
  const look: LurkerLook = {
    k: 1,
    mud: dark ? BOG_HUE.mudDark : BOG_HUE.mud,
    mudDark: dark ? BOG_HUE.mudWet : BOG_HUE.mudDark,
    mudWet: BOG_HUE.peat,
    eye: BOG_HUE.gas,
    reeds: dark ? 7 : 10,
  };
  lurkerBody(ctx, look);
  reedsOnBack(ctx, 1, look.reeds, false);
  return bogOak(ctx);
}

/** The Mire King: a lurker half again as big, crowned with bog-oak, flag iris among the reeds on its back, lilies on its shoulders. */
function dressMireKing(ctx: DressContext): WeaponSpec {
  const k = 1.5;
  lurkerBody(ctx, { k, mud: BOG_HUE.mudDark, mudDark: BOG_HUE.mudWet, mudWet: BOG_HUE.peat, eye: BOG_HUE.gas, reeds: 13 });
  reedsOnBack(ctx, k, 13, true);
  const crown = ctx.on('head');
  for (const [x, z, lean, len] of [
    [0.14, 0.02, -0.7, 0.5],
    [-0.14, 0.02, 0.7, 0.5],
    [0.08, -0.06, -0.3, 0.42],
    [-0.08, -0.06, 0.3, 0.44],
    [0, -0.1, 0, 0.36],
  ] as const) {
    const y0 = 0.2 * k;
    const top: Vec3 = [(x + Math.sin(-lean) * len) * k, y0 + len * Math.cos(lean) * k, (z - 0.06) * k];
    crown.bar([x * k, y0, z * k], top, 0.05 * k, 0.05 * k, { color: BOG_HUE.bogOak });
    crown.bar(top, [top[0] * 1.2, top[1] + 0.12 * k, top[2] - 0.06 * k], 0.035 * k, 0.035 * k, { color: BOG_HUE.lichen });
  }
  crown.box(0.08 * k, 0.04 * k, 0.04 * k, { at: [0, 0.21 * k, 0.15 * k], color: BOG_HUE.gas, glow: 1, jitter: 0 });
  for (const side of ['L', 'R'] as const) {
    ctx.on(`upperArm${side}`).cyl(0.12 * k, 0.12 * k, 0.012, 6, { at: [0, 0.13 * k, 0.02], rot: [0.2, 0, 0.3], color: BOG_HUE.lily });
  }
  return bogOak(ctx, 1.35);
}

/** The sewer beast (Aldhaven's Undercroft): a lurker bloated grey-brown, rags and a rusted chain on it, swinging a grate bar. */
function dressSewerBeast(ctx: DressContext): WeaponSpec {
  lurkerBody(ctx, { k: 1, mud: BOG_HUE.sewer, mudDark: BOG_HUE.sewerDark, mudWet: BOG_HUE.mudWet, eye: BOG_HUE.sewerEye, reeds: 0, bloated: true });
  const FA = ctx.p.forearm;
  const L = ctx.p.spine;
  // A shackle and its chain on the left wrist, a rag over the back.
  const wrist = ctx.on('forearmL');
  wrist.box(0.29, 0.06, 0.28, { at: [0, -FA * 0.72, 0], color: BOG_HUE.rustDark });
  for (let i = 0; i < 4; i++) wrist.box(0.04, 0.07, 0.025, { at: [0.1, -FA * 0.78 - i * 0.07, 0.12], rot: [0, i % 2 ? PI / 2 : 0, 0], color: BOG_HUE.rust });
  ctx
    .on('spine')
    .box(0.5, 0.4, 0.03, { at: [0.05, L + 0.1, -0.42], rot: [-0.5, 0, 0.1], color: BOG_HUE.rag })
    .box(0.14, 0.2, 0.03, { at: [-0.15, L - 0.16, -0.48], rot: [-0.3, 0, 0.1], color: BOG_HUE.rag });
  return grateBar(ctx);
}

/**
 * The bog's beasts: mud, so they lie sunk in it as mounds until something
 * comes near, and heave up. The lurker fights as a brute (the mire toads,
 * four-legged, are another thread's grunts); the Mire King is the rare, the
 * sewer beast a lurker that crawled into Aldhaven's drains.
 */
export const BOG: FamilyDef = {
  body: 'mud',
  seed: 41,
  fights: {
    brute: { label: 'Bog lurker', looks: 2, proportions: LURKER, dress: dressLurker },
  },
  named: {
    mireKing: { kind: 'brute', label: 'The Mire King', title: 'The Mire King', looks: 1, proportions: MIRE_KING, dress: dressMireKing },
    sewerBeast: { kind: 'brute', label: 'The sewer beast', title: 'The Sewer Beast', looks: 1, proportions: LURKER, dress: dressSewerBeast },
  },
};
