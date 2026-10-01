import type { Build } from '../models/human';
import { blendPoses, type Pose } from '../models/rig';

// The kit every villager's work loop is made with (people/work.ts, Oakvale's
// trades and standing about; people/trades.ts, the city's): a loop is
// stretches strung end to end, each easing from one moment of work to the
// next, holding one, or working it out (`at(u)`), round and round.

/** A moment of work: the pose, how far they've turned from their spot's facing (rad, + to their left), and the hips' shift. */
export interface Working {
  readonly pose: Pose;
  readonly turn: number;
  readonly hip: readonly [number, number, number];
}

/** A villager's work, round and round. */
export interface WorkLoop {
  /** Seconds round the loop. */
  readonly duration: number;
  /** Where the loop is `t` s in (any t: it wraps). */
  at(t: number): Working;
  /** The seconds into the loop at which the smith's hammer lands on the anvil: none for the others. */
  readonly strikes: readonly number[];
  /**
   * Does everyone at it keep time together (the recruits' drill)? Then it runs
   * on the clock of everyone placed, not each from their own start, and
   * doesn't stop while they look at you.
   */
  readonly together?: boolean;
  /** The seconds into the loop at which a stallholder cries their wares to anyone near (people/population.ts): none for most. */
  readonly cries?: readonly number[];
  /** Whether their load is in their hands `t` s in (a porter taking sacks off a cart): never, without one. */
  laden?(t: number): boolean;
}

/** Who is at a work, for the loops that need to know: their build (how long their legs are, how they walk), and how they hold a load, if they carry one (models/people.ts `Load`). */
export interface Worker {
  readonly build: Build;
  readonly load?: Pose;
}

/** One stretch of a loop: `u` goes 0 to 1 across its `time` seconds. */
export interface Segment {
  readonly time: number;
  at(u: number): Working;
}

export const ease = (u: number) => u * u * (3 - 2 * u);
export const clamp01 = (u: number) => Math.max(0, Math.min(1, u));
export const STILL: readonly [number, number, number] = [0, 0, 0];

/** `a` to `b`, `t` of the way (both poses, the turn and the hips). */
export function mix(a: Working, b: Working, t: number): Working {
  return {
    pose: blendPoses(a.pose, b.pose, t, {}),
    turn: a.turn + (b.turn - a.turn) * t,
    hip: [a.hip[0] + (b.hip[0] - a.hip[0]) * t, a.hip[1] + (b.hip[1] - a.hip[1]) * t, a.hip[2] + (b.hip[2] - a.hip[2]) * t],
  };
}

export const still = (pose: Pose, turn = 0, hip = STILL): Working => ({ pose, turn, hip });
/** Easing from `a` to `b` over `time` s. */
export const move = (time: number, a: Working, b: Working): Segment => ({ time, at: (u) => mix(a, b, ease(u)) });
/** Holding `w`, `time` s. */
export const hold = (time: number, w: Working): Segment => ({ time, at: () => w });

/** A pose with `add` added onto `base`, bone by bone. */
export function plus(base: Pose, add: Pose): Pose {
  const out: Record<string, [number, number, number]> = {};
  for (const [bone, r] of Object.entries(base)) out[bone] = [r[0], r[1], r[2]];
  for (const [bone, r] of Object.entries(add)) {
    const o = (out[bone] ??= [0, 0, 0]);
    for (let i = 0; i < 3; i++) o[i] += r[i];
  }
  return out;
}

/** `pose` with each turn scaled by `k`. */
export function scaled(pose: Pose, k: number): Pose {
  const out: Record<string, [number, number, number]> = {};
  for (const [bone, r] of Object.entries(pose)) out[bone] = [r[0] * k, r[1] * k, r[2] * k];
  return out;
}

/**
 * The segments strung into a loop, with the strikes (s into the loop); kept
 * in time by everyone at it, or for a stallholder, the moments they cry their
 * wares.
 */
export function loop(segments: readonly Segment[], strikes: readonly number[] = [], more: { readonly together?: boolean; readonly cries?: readonly number[] } = {}): WorkLoop {
  const duration = segments.reduce((s, g) => s + g.time, 0);
  return {
    duration,
    strikes,
    together: more.together ?? false,
    cries: more.cries,
    at(t: number): Working {
      let at = ((t % duration) + duration) % duration;
      for (const g of segments) {
        if (at < g.time) return g.at(at / g.time);
        at -= g.time;
      }
      const last = segments[segments.length - 1];
      return last.at(1);
    },
  };
}

/** Where in `segments` (s into the loop) the `i`th one starts. */
export function startOf(segments: readonly Segment[], i: number): number {
  let t = 0;
  for (let k = 0; k < i; k++) t += segments[k].time;
  return t;
}

/** How many of `times` (s into a loop of `duration` s) come after `from` s and up to `to` s (any times: it wraps). */
export function eventsBetween(times: readonly number[], duration: number, from: number, to: number): number {
  if (!times.length || to <= from) return 0;
  const count = (t: number) => {
    const rounds = Math.floor(t / duration);
    const into = t - rounds * duration;
    return rounds * times.length + times.filter((s) => s <= into).length;
  };
  return count(to) - count(from);
}
