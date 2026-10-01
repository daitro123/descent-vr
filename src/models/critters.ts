import { type BufferGeometry, Euler, Vector3 } from 'three';
import { ModelBuilder } from './kit';

// Critters: the small animals that live round you and run from you, a hare
// on the moor, a frog at a pool's edge, a rat along a wall. None has a
// skeleton. Each look is a few still frames (sitting, sitting up, mid-leap),
// built from the same primitives, colours and grain as the people, and a
// critter is drawn in whichever frame it's in, moved and turned whole
// (world/critters.ts). Every critter of one look in one frame is one
// instanced draw, so a meadow of hares costs a handful of draw calls.
//
// Each frame faces +Z with its feet on y = 0 (a leap's are where they'd be
// mid-air), its middle over the origin.

/** A critter's look: what it is, and so how it moves and what it runs from. */
export type CritterLook = 'hare' | 'rabbit' | 'frog' | 'rat';

/** How it lives: a hare and a rabbit live alike (the `rabbit` family). */
export type CritterFamily = 'rabbit' | 'frog' | 'rat';

/** A still a critter is drawn in. */
export type CritterFrame = 'sit' | 'up' | 'graze' | 'leap' | 'puff' | 'run' | 'gather';

export interface CritterModel {
  readonly family: CritterFamily;
  /** Its frames, each one geometry. */
  readonly frames: Partial<Record<CritterFrame, BufferGeometry>>;
  /** Nose to tail, sitting, in metres (for the blob shadow and the checks). */
  readonly length: number;
}

const PI = Math.PI;
/** A taper laid along +Z (it grows along +Y), its front tilted up by `tilt`. */
const along = (tilt = 0, yaw = 0): [number, number, number] => [PI / 2 - tilt, yaw, 0];

/** Critter colours, alongside the game's palette (palette.ts) and the people's (human.ts). */
export const CRITTER_HUE = {
  hare: 0x8a6a42,
  hareDark: 0x5e4630,
  hareHaunch: 0x76583a,
  earInner: 0xb08a70,
  hareBelly: 0xcdbb94,
  rabbit: 0x7a6c5a,
  rabbitDark: 0x564a3e,
  rabbitHaunch: 0x6a5d4d,
  rabbitBelly: 0xb8ac96,
  scut: 0xe8e2d4,
  earTip: 0x1e1814,
  amber: 0xc0862a,
  pupil: 0x140e0a,
  frog: 0x5f7a36,
  frogDark: 0x3a4a22,
  frogSpot: 0x2c3218,
  frogBelly: 0xc8c08a,
  gold: 0xd0a438,
  rat: 0x5a5048,
  ratDark: 0x3e3630,
  ratBelly: 0x8a8070,
  pink: 0xc0948a,
  nose: 0x2a1c1a,
} as const;

function build(seed: number, height: number, dress: (b: ModelBuilder) => void): BufferGeometry {
  const b = new ModelBuilder(seed);
  dress(b);
  return b.build({ ao: { from: 0, to: height, min: 0.7 } });
}

// ---------------------------------------------------------------- hares and rabbits

interface Coat {
  fur: number;
  /** Its haunches, a shade under its fur. */
  haunch: number;
  /** Its feet and the shadowed undersides. */
  dark: number;
  belly: number;
  ear: number;
  /** Ear length, m. */
  ears: number;
  /** Size against the hare's. */
  s: number;
  seed: number;
}

const HARE: Coat = { fur: CRITTER_HUE.hare, haunch: CRITTER_HUE.hareHaunch, dark: CRITTER_HUE.hareDark, belly: CRITTER_HUE.hareBelly, ear: CRITTER_HUE.earTip, ears: 0.15, s: 1, seed: 61 };
const RABBIT: Coat = { fur: CRITTER_HUE.rabbit, haunch: CRITTER_HUE.rabbitHaunch, dark: CRITTER_HUE.rabbitDark, belly: CRITTER_HUE.rabbitBelly, ear: CRITTER_HUE.rabbitDark, ears: 0.1, s: 0.72, seed: 67 };

/** The head, its nose at +Z: eyes on its sides, ears from the crown laid back by `lay` (0 upright). */
function hareHead(b: ModelBuilder, c: Coat, at: readonly [number, number, number], pitch: number, lay: number): void {
  const s = c.s;
  const [x, y, z] = at;
  const tilt: [number, number, number] = [pitch, 0, 0];
  b.box(0.075 * s, 0.075 * s, 0.1 * s, { at: [x, y, z], rot: tilt, color: c.fur })
    .taper(0.06 * s, 0.05 * s, 0.04 * s, 0.03 * s, 0.045 * s, { at: [x, y - 0.012 * s, z + 0.045 * s], rot: along(-pitch), color: c.fur })
    .box(0.02 * s, 0.014 * s, 0.01 * s, { at: [x, y - 0.006 * s, z + 0.093 * s], rot: tilt, color: CRITTER_HUE.nose, jitter: 0 })
    .box(0.03 * s, 0.03 * s, 0.035 * s, { at: [x, y - 0.03 * s, z + 0.035 * s], rot: tilt, color: c.belly });
  for (const side of [-1, 1]) {
    b.box(0.01 * s, 0.022 * s, 0.024 * s, { at: [x + side * 0.039 * s, y + 0.012 * s, z + 0.018 * s], rot: tilt, color: CRITTER_HUE.amber, jitter: 0 })
      .box(0.012 * s, 0.012 * s, 0.012 * s, { at: [x + side * 0.041 * s, y + 0.014 * s, z + 0.022 * s], rot: tilt, color: CRITTER_HUE.pupil, jitter: 0 });
    // Ears grow up from the crown, then tip back by `lay`; the tip carries on along the ear.
    const rot: [number, number, number] = [-lay + pitch, side * 0.15, side * 0.22];
    const base: [number, number, number] = [x + side * 0.022 * s, y + 0.03 * s, z - 0.025 * s];
    const long = c.ears * 0.76 * s;
    b.taper(0.03 * s, 0.014 * s, 0.036 * s, 0.012 * s, long, { at: base, rot, color: c.fur })
      .taper(0.02 * s, 0.006 * s, 0.024 * s, 0.006 * s, long * 0.9, { at: onward(base, rot, long * 0.05, 0.006 * s), rot, color: CRITTER_HUE.earInner, jitter: 0.03 })
      .taper(0.036 * s, 0.012 * s, 0.01 * s, 0.008 * s, c.ears * 0.26 * s, { at: onward(base, rot, long), rot, color: c.ear, jitter: 0 });
  }
}

/** `at` moved `h` along the +Y of a part turned by `rot` (where a taper's top face is), and `front` along its +Z. */
function onward(at: readonly [number, number, number], rot: readonly [number, number, number], h: number, front = 0): [number, number, number] {
  const v = new Vector3(0, h, front).applyEuler(new Euler(...rot));
  return [at[0] + v.x, at[1] + v.y, at[2] + v.z];
}

/** The scut: dark over, white under, a hare's; a rabbit's all white. */
function scut(b: ModelBuilder, c: Coat, at: readonly [number, number, number]): void {
  const s = c.s;
  b.box(0.05 * s, 0.045 * s, 0.035 * s, { at: [at[0], at[1], at[2]], color: CRITTER_HUE.scut });
  if (c === HARE) b.box(0.046 * s, 0.018 * s, 0.03 * s, { at: [at[0], at[1] + 0.022 * s, at[2] + 0.002], color: c.ear, jitter: 0 });
}

/** Crouched at rest, ears laid along its back; `graze` puts the nose to the grass. */
function hareSit(c: Coat, graze: boolean): BufferGeometry {
  const s = c.s;
  return build(c.seed, 0.25 * s, (b) => {
    b.taper(0.15 * s, 0.15 * s, 0.11 * s, 0.11 * s, 0.28 * s, { at: [0, 0.1 * s, -0.15 * s], rot: along(graze ? -0.05 : 0.2), color: c.fur })
      .taper(0.13 * s, 0.05 * s, 0.09 * s, 0.03 * s, 0.14 * s, { at: [0, 0.17 * s, -0.17 * s], rot: along(graze ? 0 : 0.25), color: c.fur })
      .box(0.11 * s, 0.03 * s, 0.22 * s, { at: [0, 0.035 * s, -0.02 * s], color: c.belly });
    for (const side of [-1, 1]) {
      b.taper(0.04 * s, 0.15 * s, 0.035 * s, 0.1 * s, 0.11 * s, { at: [side * 0.07 * s, 0.02 * s, -0.1 * s], color: c.haunch })
        .box(0.035 * s, 0.025 * s, 0.15 * s, { at: [side * 0.06 * s, 0.012 * s, -0.05 * s], color: c.dark })
        .box(0.022 * s, (graze ? 0.06 : 0.09) * s, 0.028 * s, { at: [side * 0.035 * s, (graze ? 0.03 : 0.045) * s, 0.11 * s], color: c.fur })
        .box(0.024 * s, 0.014 * s, 0.04 * s, { at: [side * 0.035 * s, 0.007 * s, 0.125 * s], color: c.belly });
    }
    scut(b, c, [0, 0.12 * s, -0.19 * s]);
    if (graze) hareHead(b, c, [0, 0.07 * s, 0.17 * s], 0.7, 1.1);
    else hareHead(b, c, [0, 0.2 * s, 0.15 * s], 0.1, 1.25);
  });
}

/** Sat up on its haunches, ears straight up, watching. */
function hareUp(c: Coat): BufferGeometry {
  const s = c.s;
  return build(c.seed + 1, 0.32 * s, (b) => {
    b.taper(0.15 * s, 0.15 * s, 0.1 * s, 0.11 * s, 0.3 * s, { at: [0, 0.07 * s, -0.11 * s], rot: along(0.95), color: c.fur })
      .box(0.08 * s, 0.2 * s, 0.03 * s, { at: [0, 0.2 * s, 0.035 * s], rot: [-0.55, 0, 0], color: c.belly });
    for (const side of [-1, 1]) {
      b.taper(0.04 * s, 0.15 * s, 0.035 * s, 0.1 * s, 0.12 * s, { at: [side * 0.07 * s, 0.015 * s, -0.08 * s], color: c.haunch })
        .box(0.035 * s, 0.025 * s, 0.16 * s, { at: [side * 0.06 * s, 0.012 * s, -0.03 * s], color: c.dark })
        .box(0.022 * s, 0.1 * s, 0.026 * s, { at: [side * 0.03 * s, 0.2 * s, 0.07 * s], rot: [-0.35, 0, 0], color: c.fur });
    }
    scut(b, c, [0, 0.06 * s, -0.17 * s]);
    hareHead(b, c, [0, 0.37 * s, 0.07 * s], -0.1, 0.08);
  });
}

/** Mid-leap, stretched out: hind legs flung back, forelegs reaching. */
function hareLeap(c: Coat): BufferGeometry {
  const s = c.s;
  return build(c.seed + 2, 0.25 * s, (b) => {
    b.taper(0.13 * s, 0.14 * s, 0.11 * s, 0.11 * s, 0.34 * s, { at: [0, 0.12 * s, -0.18 * s], rot: along(0.05), color: c.fur })
      .box(0.1 * s, 0.03 * s, 0.26 * s, { at: [0, 0.065 * s, -0.01 * s], color: c.belly });
    for (const side of [-1, 1]) {
      b.box(0.04 * s, 0.1 * s, 0.13 * s, { at: [side * 0.065 * s, 0.1 * s, -0.14 * s], color: c.haunch })
        .bar([side * 0.06 * s, 0.07 * s, -0.19 * s], [side * 0.055 * s, 0.03 * s, -0.36 * s], 0.032 * s, 0.026 * s, { color: c.dark })
        .bar([side * 0.035 * s, 0.09 * s, 0.13 * s], [side * 0.035 * s, 0.06 * s, 0.27 * s], 0.022 * s, 0.024 * s, { color: c.fur });
    }
    scut(b, c, [0, 0.16 * s, -0.215 * s]);
    hareHead(b, c, [0, 0.19 * s, 0.2 * s], 0.15, 1.35);
  });
}

function rabbitFamily(c: Coat): CritterModel {
  return {
    family: 'rabbit',
    length: 0.5 * c.s,
    frames: { sit: hareSit(c, false), graze: hareSit(c, true), up: hareUp(c), leap: hareLeap(c) },
  };
}

// ---------------------------------------------------------------- the frog

/** Squat on its haunches at the water's edge; `puff` swells its throat. */
function frogSit(puff: boolean): BufferGeometry {
  const H = CRITTER_HUE;
  return build(puff ? 73 : 71, 0.06, (b) => {
    b.taper(0.08, 0.045, 0.062, 0.04, 0.09, { at: [0, 0.035, -0.05], rot: along(0.35), color: H.frog })
      .box(0.064, 0.012, 0.08, { at: [0, 0.012, -0.005], rot: [-0.3, 0, 0], color: H.frogBelly })
      .box(0.07, 0.034, 0.05, { at: [0, 0.058, 0.045], rot: [0.12, 0, 0], color: H.frog })
      .box(0.012, 0.012, 0.012, { at: [-0.012, 0.042, -0.035], color: H.frogSpot, jitter: 0 })
      .box(0.014, 0.012, 0.014, { at: [0.016, 0.05, -0.012], color: H.frogSpot, jitter: 0 })
      .box(0.012, 0.01, 0.01, { at: [-0.008, 0.06, 0.008], color: H.frogSpot, jitter: 0 });
    for (const side of [-1, 1]) {
      b.box(0.02, 0.02, 0.02, { at: [side * 0.024, 0.08, 0.05], color: H.gold, jitter: 0 })
        .box(0.012, 0.012, 0.012, { at: [side * 0.026, 0.083, 0.058], color: H.pupil, jitter: 0 })
        // Hind legs folded at the sides, feet splayed forward; forelegs propping the front up.
        .box(0.026, 0.03, 0.06, { at: [side * 0.045, 0.02, -0.04], rot: [0, side * 0.25, 0], color: H.frogDark })
        .box(0.03, 0.008, 0.045, { at: [side * 0.055, 0.004, 0.0], rot: [0, -side * 0.3, 0], color: H.frogDark })
        .box(0.012, 0.04, 0.014, { at: [side * 0.03, 0.02, 0.055], rot: [0.25, 0, side * 0.2], color: H.frog })
        .box(0.022, 0.006, 0.02, { at: [side * 0.036, 0.003, 0.064], color: H.frogDark });
    }
    if (puff) b.ball(0.024, { at: [0, 0.034, 0.066], color: H.frogBelly });
  });
}

/** Mid-leap: long legs straight out behind. */
function frogLeap(): BufferGeometry {
  const H = CRITTER_HUE;
  return build(75, 0.05, (b) => {
    b.taper(0.07, 0.04, 0.06, 0.036, 0.1, { at: [0, 0.04, -0.06], rot: along(0.1), color: H.frog })
      .box(0.056, 0.01, 0.08, { at: [0, 0.022, -0.01], color: H.frogBelly })
      .box(0.066, 0.032, 0.05, { at: [0, 0.05, 0.06], color: H.frog })
      .box(0.012, 0.012, 0.012, { at: [0.012, 0.06, -0.02], color: H.frogSpot, jitter: 0 });
    for (const side of [-1, 1]) {
      b.box(0.02, 0.02, 0.02, { at: [side * 0.022, 0.07, 0.06], color: H.gold, jitter: 0 })
        .box(0.012, 0.012, 0.012, { at: [side * 0.024, 0.073, 0.068], color: H.pupil, jitter: 0 })
        .bar([side * 0.03, 0.035, -0.06], [side * 0.045, 0.03, -0.13], 0.02, 0.018, { color: H.frogDark })
        .bar([side * 0.045, 0.03, -0.13], [side * 0.04, 0.03, -0.2], 0.014, 0.012, { color: H.frogDark })
        .box(0.026, 0.006, 0.03, { at: [side * 0.04, 0.03, -0.21], color: H.frogDark })
        .bar([side * 0.025, 0.035, 0.07], [side * 0.03, 0.02, 0.11], 0.012, 0.012, { color: H.frog });
    }
  });
}

// ---------------------------------------------------------------- the gutter rat

/** The rat's head: a tapered snout at +Z, pink ears, black eyes. */
function ratHead(b: ModelBuilder, at: readonly [number, number, number], pitch: number): void {
  const H = CRITTER_HUE;
  const [x, y, z] = at;
  b.taper(0.05, 0.045, 0.018, 0.018, 0.07, { at: [x, y, z - 0.02], rot: along(-pitch), color: H.rat })
    .box(0.014, 0.012, 0.01, { at: [x, y - Math.sin(pitch) * 0.07, z + Math.cos(pitch) * 0.05], color: H.pink, jitter: 0 });
  for (const side of [-1, 1]) {
    b.box(0.022, 0.024, 0.008, { at: [x + side * 0.022, y + 0.026, z - 0.015], rot: [0, side * 0.4, 0], color: H.pink })
      .box(0.008, 0.01, 0.01, { at: [x + side * 0.019, y + 0.01, z + 0.012], color: H.pupil, jitter: 0 });
  }
}

/** The tail, a few thin bars from `from` along `bends` (each a step's yaw and drop). */
function ratTail(b: ModelBuilder, from: readonly [number, number, number], heading: number, bends: readonly number[], lift = 0): void {
  let [x, y, z] = from;
  let a = heading;
  const step = 0.07;
  bends.forEach((bend, i) => {
    a += bend;
    const nx = x + Math.sin(a) * step;
    const nz = z - Math.cos(a) * step;
    const ny = Math.max(0.006, y - 0.012 + (i === 0 ? lift : 0));
    b.bar([x, y, z], [nx, ny, nz], 0.012 - i * 0.002, 0.012 - i * 0.002, { color: CRITTER_HUE.pink });
    [x, y, z] = [nx, ny, nz];
  });
}

/** Hunched at rest, sniffing; `up` rears it on its hind legs. */
function ratSit(up: boolean): BufferGeometry {
  const H = CRITTER_HUE;
  return build(up ? 83 : 81, 0.1, (b) => {
    if (up) {
      b.taper(0.085, 0.08, 0.06, 0.06, 0.13, { at: [0, 0.025, -0.06], rot: along(1.05), color: H.rat })
        .box(0.05, 0.08, 0.02, { at: [0, 0.08, -0.01], rot: [-0.5, 0, 0], color: H.ratBelly });
      for (const side of [-1, 1]) {
        b.box(0.022, 0.035, 0.05, { at: [side * 0.035, 0.02, -0.05], color: H.ratDark })
          .box(0.012, 0.035, 0.012, { at: [side * 0.018, 0.1, 0.02], rot: [-0.6, 0, 0], color: H.pink });
      }
      ratHead(b, [0, 0.15, 0.025], -0.35);
      ratTail(b, [0, 0.02, -0.1], 0, [0.1, 0.4, 0.5, 0.4]);
      return;
    }
    b.taper(0.08, 0.075, 0.065, 0.06, 0.16, { at: [0, 0.042, -0.1], rot: along(0.12), color: H.rat })
      .box(0.06, 0.012, 0.14, { at: [0, 0.012, -0.02], color: H.ratBelly })
      .box(0.05, 0.03, 0.05, { at: [0, 0.085, -0.03], color: H.ratDark });
    for (const side of [-1, 1]) {
      b.box(0.022, 0.035, 0.05, { at: [side * 0.035, 0.02, -0.07], color: H.ratDark })
        .box(0.014, 0.025, 0.014, { at: [side * 0.022, 0.012, 0.045], color: H.pink });
    }
    ratHead(b, [0, 0.06, 0.08], 0.15);
    ratTail(b, [0, 0.03, -0.1], 0, [0.3, 0.45, 0.5, 0.4]);
  });
}

/**
 * Running, in the two halves of a gallop: stretched out (`run`), legs flung
 * fore and aft, and gathered (`gather`), feet bunched under, back arched.
 */
function ratRun(gathered: boolean): BufferGeometry {
  const H = CRITTER_HUE;
  return build(gathered ? 87 : 85, 0.1, (b) => {
    if (gathered) {
      b.taper(0.075, 0.08, 0.06, 0.06, 0.15, { at: [0, 0.035, -0.08], rot: along(0.25), color: H.rat })
        .box(0.05, 0.03, 0.06, { at: [0, 0.09, -0.02], color: H.ratDark });
      for (const side of [-1, 1]) {
        b.box(0.02, 0.03, 0.04, { at: [side * 0.032, 0.016, -0.02], color: H.ratDark }).box(0.012, 0.025, 0.012, { at: [side * 0.02, 0.012, 0.02], color: H.pink });
      }
      ratHead(b, [0, 0.07, 0.085], 0.2);
      ratTail(b, [0, 0.04, -0.08], 0, [0, -0.1, 0.1, 0.05], 0.02);
      return;
    }
    b.taper(0.07, 0.07, 0.058, 0.055, 0.19, { at: [0, 0.045, -0.11], rot: along(0.02), color: H.rat })
      .box(0.05, 0.012, 0.15, { at: [0, 0.018, -0.02], color: H.ratBelly });
    for (const side of [-1, 1]) {
      b.bar([side * 0.03, 0.03, -0.09], [side * 0.03, 0.01, -0.15], 0.018, 0.018, { color: H.ratDark })
        .bar([side * 0.02, 0.03, 0.05], [side * 0.02, 0.008, 0.11], 0.012, 0.012, { color: H.pink });
    }
    ratHead(b, [0, 0.055, 0.115], 0.05);
    ratTail(b, [0, 0.04, -0.11], 0, [0, 0.05, -0.05, 0.05], 0.01);
  });
}

// ---------------------------------------------------------------- every look

const built = new Map<CritterLook, CritterModel>();

/** `look`'s frames, built once and shared by every critter of that look. */
export function critterModel(look: CritterLook): CritterModel {
  let m = built.get(look);
  if (!m) {
    switch (look) {
      case 'hare':
        m = rabbitFamily(HARE);
        break;
      case 'rabbit':
        m = rabbitFamily(RABBIT);
        break;
      case 'frog':
        m = { family: 'frog', length: 0.13, frames: { sit: frogSit(false), puff: frogSit(true), leap: frogLeap() } };
        break;
      case 'rat':
        m = { family: 'rat', length: 0.36, frames: { sit: ratSit(false), up: ratSit(true), run: ratRun(false), gather: ratRun(true) } };
        break;
    }
    built.set(look, m);
  }
  return m;
}

export const CRITTER_LOOKS: readonly CritterLook[] = ['hare', 'rabbit', 'frog', 'rat'];
