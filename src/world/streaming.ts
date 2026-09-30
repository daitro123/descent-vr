import { CONFIG } from '../config';
import { type ChunkKey, chunkDistance, type Detail } from './chunks';

// Where each chunk should be, decided from where you stand: pure, so it's
// tested at positions without a renderer (world/streamer.ts acts on it).

/** The radii a decision uses, in metres from you to a chunk's nearest point. */
export interface Reach {
  /** Full detail within this. */
  readonly full: number;
  /** A stand-in out to this (the fog's far edge); unloaded beyond. */
  readonly far: number;
  /** A chunk's worth: fetched this much early and dropped this much late, at each radius. */
  readonly hysteresis: number;
}

/** The reach out to the fog's far edge `far`, with the tunables' full radius and hysteresis. */
export function reachTo(far: number): Reach {
  const { full, hysteresis } = CONFIG.streaming;
  return { full, far, hysteresis };
}

/**
 * What a chunk `distance` metres away should be, given what it is `now`:
 * full within the full radius (and kept full out to a chunk past it); a
 * stand-in fetched a chunk before the fog's far edge reaches it and dropped
 * a chunk after; else nothing.
 */
export function detailFor(distance: number, now: Detail | null, reach: Reach): Detail | null {
  const { far, hysteresis } = reach;
  // Never full detail farther out than a stand-in would reach.
  const full = Math.min(reach.full, far);
  if (distance <= full || (now === 'full' && distance <= full + hysteresis)) return 'full';
  if (distance <= far + hysteresis || (now !== null && distance <= far + 2 * hysteresis)) return 'standIn';
  return null;
}

/**
 * Every chunk that should be loaded, standing at (x, z), and at what detail,
 * from what's loaded `now`. Chunks left out should be unloaded.
 */
export function decide(x: number, z: number, keys: readonly ChunkKey[], now: ReadonlyMap<ChunkKey, Detail>, reach: Reach): Map<ChunkKey, Detail> {
  const wanted = new Map<ChunkKey, Detail>();
  for (const key of keys) {
    const detail = detailFor(chunkDistance(key, x, z), now.get(key) ?? null, reach);
    if (detail) wanted.set(key, detail);
  }
  return wanted;
}

/** Is a chunk whose sphere is centred `distance` m from your eye, `radius` round, past the fog's far edge `far`? */
export function beyondFog(distance: number, radius: number, far: number): boolean {
  return distance > far + radius;
}
