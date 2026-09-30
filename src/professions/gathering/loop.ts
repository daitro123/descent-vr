import { Vector3 } from 'three';
import { CONFIG } from '../../config';
import { type BeltFrame, TOOL_LOOP } from '../../player/beltZones';

// The tool loop's rules, with no three.js or XR in them (.scratch/professions/
// spec.md, "Gathering spots and the tool loop"; issues/02-tools-on-the-belt.md).
// The loop hangs behind the main hand's hip. A grip pressed in it, the hand
// moving under 1.5 m/s, draws the tool for the nearest gathering spot within
// 3 m, or puts the tool in the hand back. Far from every spot it does nothing,
// so a stray grab while walking never swaps your weapon, and while anything
// fights you it does nothing at all. A drawn tool goes back by itself when a
// pull catches you, or once you've walked 5 m from every spot.

const _loop = new Vector3();

/**
 * Is a hand at `hand` (world) in the loop, where the belt's frame hangs it
 * now? This, not a place fixed to your head, is what takes a grip from the
 * gestures: the belt turns with you only once you've looked well away.
 */
export function inLoop(frame: BeltFrame, hand: Vector3): boolean {
  return frame.place(TOOL_LOOP, _loop).distanceTo(hand) < CONFIG.professions.toolLoop.radius;
}

/** What a grip in the loop does. */
export type LoopAct = 'draw' | 'putAway' | 'nothing';

/** Why a drawn tool went back by itself. */
export type PutBack = 'pulled' | 'walkedOff';

/** How the loop stands this frame. */
export interface LoopNow {
  /** A tool is in the main hand. */
  readonly drawn: boolean;
  /** Anything is fighting you. */
  readonly fighting: boolean;
  /** How far (m) the nearest spot you could gather from now is: one full, of a profession you know. Infinity with none. */
  readonly nearestFull: number;
  /** How far (m) the nearest spot of a profession you know is, full or taken. */
  readonly nearestAny: number;
}

/** The main hand this frame, as the loop sees it. */
export interface LoopHand {
  /** Its grip went down this frame. */
  readonly gripDown: boolean;
  /** It's inside the loop's sphere. */
  readonly inLoop: boolean;
  /** m/s, in the rig (walking and turning don't count). */
  readonly speed: number;
}

/** What a grip does: null unless it went down in the loop slowly enough; then draw, put back, or nothing (with the reason's buzz). */
export function loopGrip(hand: LoopHand, now: LoopNow): LoopAct | null {
  const L = CONFIG.professions.toolLoop;
  if (!hand.gripDown || !hand.inLoop || hand.speed >= L.maxSpeed) return null;
  if (now.fighting) return 'nothing';
  if (now.drawn) return 'putAway';
  return now.nearestFull <= L.draw ? 'draw' : 'nothing';
}

/** Would a grip in the loop give or take now? It glows and ticks only then. */
export function loopOpen(now: LoopNow): boolean {
  return !now.fighting && (now.drawn || now.nearestFull <= CONFIG.professions.toolLoop.draw);
}

/** A drawn tool going back by itself: at once in a fight, or once you're past `putAway` m from every spot. Null keeps it. */
export function putBack(now: LoopNow): PutBack | null {
  if (!now.drawn) return null;
  if (now.fighting) return 'pulled';
  return now.nearestAny > CONFIG.professions.toolLoop.putAway ? 'walkedOff' : null;
}
