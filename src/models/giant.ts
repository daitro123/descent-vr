import type { Proportions } from './rig';

/**
 * The giant build: about 5 m from sole to crown on the humanoid skeleton,
 * every pose and animation the same as a man's, the bones about two and a
 * half times as long. Long arms (the fists hang at mid-thigh), pillar legs,
 * and the head low and forward between the shoulders.
 *
 * The Keyward is built on it (keyward.ts); the Hollow North's giants can
 * share it. What the engine does with a body this size: its walk cycle slows
 * by its height (the stride stays a man's stride, scaled), it rises out of
 * a deeper hole, its guards and hurt volumes scale with it, and a fighter on
 * it brings its own reach and weight (Fighter.numbers: the Keyward's in
 * keyward.ts). The model inspector stands it smaller to fit (inspector.ts).
 */
export const GIANT: Proportions = {
  hipY: 2.52,
  hipW: 0.36,
  spine: 1.25,
  shoulderW: 0.84,
  neck: 1.4,
  upperArm: 1.0,
  forearm: 0.95,
  thigh: 1.22,
  shin: 1.18,
  head: 2.4,
  headZ: 0.24,
};

/** A giant's triangles, both eyes: about twice a man's (see the caps in tests/barrowDead.test.ts). */
export const GIANT_TRIANGLES = 2400;
