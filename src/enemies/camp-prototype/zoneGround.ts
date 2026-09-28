import { Vector3 } from 'three';
import type { GameMap } from '../../maps/types';
import type { Ground } from '../../world/ground';

// PROTOTYPE (Enemies in the open): the floor rules of a zone for a fight, over
// any GameMap. Steering is local only: look a stride ahead, and if a trunk,
// tent or fence is there, turn towards the side the collider would push you.
// No navmesh; whether this is enough is one of the questions `?camp` asks.

/** Eye height for sight lines, above the ground at each end. */
const EYE = 1.4;
const _probe = new Vector3();

export function zoneGround(map: GameMap): Ground {
  /** Would a body of `radius` at (x, z) be pushed out of something? */
  const blocked = (x: number, z: number, radius: number) => map.resolve(_probe.set(x, 0, z), radius);

  return {
    heightAt: (x, z) => map.heightAt(x, z),
    resolve: (p, radius) => map.resolve(p, radius),

    /** Eye to eye: trunks, tents and the lie of the land in between all block it. */
    lineOfSight(a, b) {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      const n = Math.ceil(len / 0.5);
      const ya = map.heightAt(a.x, a.z) + EYE;
      const yb = map.heightAt(b.x, b.z) + EYE;
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const x = a.x + dx * t;
        const z = a.z + dz * t;
        if (map.heightAt(x, z) > ya + (yb - ya) * t) return false;
        // The two bodies stand at the ends; only what's between them counts.
        if (t * len < 0.8 || (1 - t) * len < 0.8) continue;
        if (blocked(x, z, 0.05)) return false;
      }
      return true;
    },

    steer(from, dir, radius) {
      const look = 1 + radius;
      const ax = from.x + dir.x * look;
      const az = from.z + dir.z * look;
      _probe.set(ax, 0, az);
      if (!map.resolve(_probe, radius)) return;
      // Something's ahead. Turning by +a swings dir towards (dir.z, -dir.x):
      // start on the side the collider pushed the probe to.
      const pushX = _probe.x - ax;
      const pushZ = _probe.z - az;
      const first = dir.z * pushX - dir.x * pushZ >= 0 ? 1 : -1;
      const x0 = dir.x;
      const z0 = dir.z;
      for (const a of [0.4, 0.8, 1.2, 1.6, 2.0]) {
        for (const side of [first, -first]) {
          const c = Math.cos(a * side);
          const s = Math.sin(a * side);
          const x = x0 * c + z0 * s;
          const z = -x0 * s + z0 * c;
          if (!blocked(from.x + x * look, from.z + z * look, radius)) {
            dir.set(x, 0, z);
            return;
          }
        }
      }
    },

    arrowStops(p) {
      const floor = map.heightAt(p.x, p.z);
      if (p.y <= floor + 0.02) return true;
      // Trunks and tents are about this tall; above them the way is clear.
      return p.y < floor + 3 && blocked(p.x, p.z, 0.02);
    },
  };
}
