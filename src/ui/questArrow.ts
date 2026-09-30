import type { ArrowTarget } from '../adventureState';
import { CONFIG } from '../config';
import type { QuestPlace } from '../maps/types';
import { GIVERS, type GiverId, type Place } from '../quests';
import type { Interior } from '../save/record';

// The quest arrow's rules, with no three.js in it: where it points, when it
// hides, and which way it turns on the tracker as you turn. The adventure
// state says what it points at; the zone says where that is.

/** Where the arrow's targets are in a zone: each quest's place, and the spot of each giver standing in it. */
export interface ArrowSpots {
  readonly places: Readonly<Record<Place, QuestPlace>>;
  readonly givers: Readonly<Partial<Record<GiverId, { readonly x: number; readonly z: number }>>>;
}

const isGiver = (target: ArrowTarget): target is GiverId => (GIVERS as readonly string[]).includes(target);

/** Where you are, for the arrow: over the floor plane, and the building or the mine you're in. */
export interface Whereabouts {
  readonly x: number;
  readonly z: number;
  readonly interior: Interior | null;
}

/** The spot the arrow points at, as the crow flies: none for a giver who doesn't stand in the zone. */
export function arrowPoint(target: ArrowTarget, way: ArrowSpots): { readonly x: number; readonly z: number } | null {
  return (isGiver(target) ? way.givers[target] : way.places[target]) ?? null;
}

/**
 * Does the arrow hide? Once you're at its place, in its clearing (for the old
 * mine, its front); within 10 m of the giver it points at, where their gold
 * "?" shows the way, or always for one who doesn't stand in the zone; and
 * indoors and in the mine, where it would point through walls and rock. It
 * comes back as you step out.
 */
export function arrowHides(target: ArrowTarget, you: Whereabouts, way: ArrowSpots): boolean {
  if (you.interior !== null) return true;
  if (isGiver(target)) {
    const at = way.givers[target];
    return !at || Math.hypot(you.x - at.x, you.z - at.z) < CONFIG.tracker.arrow.nearGiver;
  }
  const { clearing } = way.places[target];
  return Math.hypot(you.x - clearing.x, you.z - clearing.z) < clearing.r;
}

/**
 * How far round the arrow turns from pointing up (rad, positive to the left),
 * for `to` seen from `from` looking `yaw` (radians about +Y, 0 looks down −Z):
 * up is straight ahead, and it turns as you do.
 */
export function arrowTurn(from: { readonly x: number; readonly z: number; readonly yaw: number }, to: { readonly x: number; readonly z: number }): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const ahead = -dx * Math.sin(from.yaw) - dz * Math.cos(from.yaw);
  const left = -dx * Math.cos(from.yaw) + dz * Math.sin(from.yaw);
  return Math.atan2(left, ahead);
}
