import type { Pose } from '../models/rig';

// How friendly characters move on the human body, shared by the game and the
// model inspector so what loops on the plinth is what stands in Oakvale.

/** Breathing's phase rate, in radians a second. */
const BREATH = 1.7;
/** Seconds from one breath to the next. */
export const BREATH_PERIOD = (2 * Math.PI) / BREATH;
/** The raised hand's wave side to side, in radians a second. */
const WAVE = 10;

/**
 * Standing in `stand` and breathing, `clock` seconds in. During a wave (`wave`:
 * seconds into it, of `duration`) the right arm comes up, the hand waves, and
 * the arm goes back down.
 */
export function friendlyPose(stand: Pose, clock: number, wave?: { t: number; duration: number }): Pose {
  const spine = stand.spine ?? [0, 0, 0];
  const pose: Pose = { ...stand, spine: [spine[0] + 0.02 * Math.sin(clock * BREATH), spine[1], spine[2]] };
  if (!wave) return pose;
  const lift = Math.max(0, Math.min(1, (wave.duration - wave.t) * 4, wave.t * 6));
  return {
    ...pose,
    upperArmR: [-0.3 * lift, 0, -0.1 - 2.3 * lift],
    forearmR: [0, 0, -0.5 * lift + 0.45 * lift * Math.sin(clock * WAVE)],
    handR: [0, 0, 0],
  };
}
