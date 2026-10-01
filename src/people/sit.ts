import { CONFIG } from '../config';
import type { Build } from '../models/human';
import type { Pose } from '../models/rig';
import { reach, SOLE } from './walk';

// The legs of anyone not standing, on any build: sitting on a bench, a kerb,
// a crate or the ground (/zones/aldhaven-inhabitants.md, "Sitting"), down on
// one knee at the weeds, or crouched to set a load down. Each is worked out
// from the build's own thighs and shins, so the feet land flat on the floor
// (or hang, where it's out of reach) on a child as on a big man, and the
// hips drop as far as the legs fold.

/** Where a villager sits: the seat's height over the floor at their feet, and whether their legs hang over an edge before them. */
export interface Seat {
  /** m from the floor under them up to the seat: 0 on the ground, a bench's about 0.5. */
  readonly height: number;
  /** Their legs hang down over an edge (a quay's, the mole's), whatever the seat's height. */
  readonly hang?: boolean;
}

/** Legs folded under a villager: the leg bones' turns, and the hips' offset from bind to go with them. */
export interface Folded {
  readonly legs: Pose;
  readonly hip: readonly [number, number, number];
}

/** The leg bones. */
export const LEG_BONES = ['thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'] as const;

/** Where the thigh joints are at bind, over the floor. */
const jointOf = (b: Build) => b.proportions.hipY - 0.02;

/**
 * Sitting on `seat` in `build`: the hips' joint a little over the seat, the
 * thighs out ahead and the feet flat on the floor a little ahead of the
 * knees (on the ground, the knees drawn up); or, where the floor is beyond
 * the feet (a high kerb, an edge), the shins hanging and the toes down.
 */
export function sitting(build: Build, seat: Seat): Folded {
  const { thigh, shin } = build.proportions;
  const k = build.thickness;
  const joint = seat.height + CONFIG.villagers.sit.over * k;
  const z = thigh * 0.85 + 0.12;
  const y = SOLE * k - joint;
  const hang = seat.hang || Math.hypot(z, y) > (thigh + shin) * 0.97;
  let t: number;
  let s: number;
  let f: number;
  if (hang) {
    t = -1.45;
    s = 1.3;
    f = 0.4;
  } else {
    [t, s] = reach(z, y, thigh, shin);
    // The foot flat on the floor, whatever the shin's angle.
    f = -(t + s);
  }
  return {
    legs: { thighL: [t, 0, 0.07], shinL: [s, 0, 0], footL: [f, 0, 0], thighR: [t, 0, -0.07], shinR: [s, 0, 0], footR: [f, 0, 0] },
    hip: [0, joint - jointOf(build), 0],
  };
}

/**
 * Bent at the knees, the feet kept where they stood: the thighs `a` rad
 * forward and the knees `b` rad bent, the hips dropped and drawn back to
 * match and the feet flat. For setting a load down, or reaching low.
 */
export function crouched(build: Build, a: number, b: number): Folded {
  const { thigh, shin } = build.proportions;
  const ahead = thigh * Math.sin(a) + shin * Math.sin(a - b);
  const high = thigh * Math.cos(a) + shin * Math.cos(a - b);
  return {
    legs: { thighL: [-a, 0, 0.04], shinL: [b, 0, 0], footL: [a - b, 0, 0], thighR: [-a, 0, -0.04], shinR: [b, 0, 0], footR: [a - b, 0, 0] },
    hip: [0, high - (thigh + shin), -ahead],
  };
}

/**
 * Down on the left knee, the shin flat behind along the ground and the right
 * foot planted ahead: weeding, or tending something low.
 */
export function kneeling(build: Build): Folded {
  const { thigh, shin } = build.proportions;
  const k = build.thickness;
  // The left thigh near upright over the knee, its shin's thickness off the ground.
  const lean = 0.12;
  const joint = thigh * Math.cos(lean) + 0.06 * k;
  const [t, s] = reach(0.32, SOLE * k - joint, thigh, shin);
  return {
    legs: {
      thighL: [-lean, 0, 0.05],
      shinL: [Math.PI / 2 + lean, 0, 0],
      // The top of the foot flat on the ground behind.
      footL: [Math.PI / 2 - lean, 0, 0],
      thighR: [t, 0, -0.08],
      shinR: [s, 0, 0],
      footR: [-(t + s), 0, 0],
    },
    hip: [0, joint - jointOf(build), 0],
  };
}

/** `pose` with its legs folded as `folded` has them. */
export function withLegs(pose: Pose, folded: Folded): Pose {
  return { ...pose, ...folded.legs };
}
