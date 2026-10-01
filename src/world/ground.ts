import { Vector3 } from 'three';
import { CONFIG } from '../config';

/**
 * The floor rules a fight needs from wherever it happens: the arena's flat
 * room, or a zone's hills and trees. Enemies, arrows and the player go
 * through this, so they never need to know which one they're in.
 */
export interface Ground {
  /** Ground height at (x, z), in metres. */
  heightAt(x: number, z: number): number;
  /**
   * The water's surface at (x, z), where water stands over the ground there
   * (a pool, a beck, the fens' channels), or null where it's dry. What swims
   * floats on it (a leech); what doesn't keeps out of it (a hare). Floors
   * without water leave it out.
   */
  waterAt?(x: number, z: number): number | null;
  /** Push a point on the floor plane out of walls and props. True if it moved. */
  resolve(p: Vector3, radius: number): boolean;
  /** Is the straight line a→b clear? (Archers want a clear shot.) */
  lineOfSight(a: Vector3, b: Vector3): boolean;
  /** Bend `dir` (unit, XZ) so a body of `radius` walking from `from` slides round what's ahead. */
  steer(from: Vector3, dir: Vector3, radius: number): void;
  /** Has a flying arrow at `p` struck the floor, a wall or a prop? */
  arrowStops(p: Vector3): boolean;
  /**
   * Is there rock between `from` and `to`, so a body can't simply head
   * there? Then `out` is where to head next: on along a route's centre line
   * towards `to` (the mine's). Without it (or false), head straight for `to`.
   */
  wayRound?(from: Vector3, to: Vector3, out: Vector3): boolean;
}

const _probe = new Vector3();

/**
 * Local steering, no navmesh: look a stride ahead of `from` along `dir`, and
 * if `resolve` pushes a body of `radius` there, turn towards the side it
 * would push, then the other, a little more each time, and take the first
 * way that's clear.
 */
export function steerRound(resolve: (p: Vector3, radius: number) => boolean, from: Vector3, dir: Vector3, radius: number): void {
  const { lookAhead, turns } = CONFIG.world.ground;
  const look = lookAhead + radius;
  const ax = from.x + dir.x * look;
  const az = from.z + dir.z * look;
  _probe.x = ax;
  _probe.z = az;
  if (!resolve(_probe, radius)) return;
  // Turning by +a swings dir towards (dir.z, -dir.x): start on the side the probe was pushed to.
  const pushX = _probe.x - ax;
  const pushZ = _probe.z - az;
  const first = dir.z * pushX - dir.x * pushZ >= 0 ? 1 : -1;
  const x0 = dir.x;
  const z0 = dir.z;
  for (const a of turns) {
    for (const side of [first, -first]) {
      const c = Math.cos(a * side);
      const s = Math.sin(a * side);
      const x = x0 * c + z0 * s;
      const z = -x0 * s + z0 * c;
      _probe.x = from.x + x * look;
      _probe.z = from.z + z * look;
      if (!resolve(_probe, radius)) {
        dir.set(x, 0, z);
        return;
      }
    }
  }
}
