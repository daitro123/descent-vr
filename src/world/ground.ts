import type { Vector3 } from 'three';

/**
 * The floor rules a fight needs from wherever it happens: the arena's flat
 * room, or a zone's hills and trees. Enemies, arrows and the player go
 * through this, so they never need to know which one they're in.
 */
export interface Ground {
  /** Ground height at (x, z), in metres. */
  heightAt(x: number, z: number): number;
  /** Push a point on the floor plane out of walls and props. True if it moved. */
  resolve(p: Vector3, radius: number): boolean;
  /** Is the straight line a→b clear? (Archers want a clear shot.) */
  lineOfSight(a: Vector3, b: Vector3): boolean;
  /** Bend `dir` (unit, XZ) so a body of `radius` walking from `from` slides round what's ahead. */
  steer(from: Vector3, dir: Vector3, radius: number): void;
  /** Has a flying arrow at `p` struck the floor, a wall or a prop? */
  arrowStops(p: Vector3): boolean;
}
