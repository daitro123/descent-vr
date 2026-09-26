import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { resolveFloor } from '../src/world/arena';

// Every spot a body can stand on must be reachable from the middle of the
// room. A gap between a prop and a wall that's narrower than a body makes a
// pocket: knock an enemy in there and it can never walk out.
describe('arena layout', () => {
  const radii = new Set([CONFIG.player.bodyRadius, ...Object.values(CONFIG.enemies).map((e) => e.radius)]);

  it.each([...radii])('has no unreachable pockets for a body of radius %s', (radius) => {
    const step = 0.1;
    const half = CONFIG.arena.halfSize;
    const n = Math.round((2 * half) / step) + 1;
    const free = new Uint8Array(n * n);
    const p = new Vector3();
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        p.set(-half + i * step, 0, -half + j * step);
        free[i * n + j] = resolveFloor(p, radius) ? 0 : 1;
      }
    }
    // Flood fill from the room's centre.
    const seen = new Uint8Array(n * n);
    const c = Math.floor(n / 2);
    const stack = [c * n + c];
    seen[c * n + c] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      const i = Math.floor(k / n);
      const j = k % n;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const a = i + di;
        const b = j + dj;
        if (a < 0 || b < 0 || a >= n || b >= n) continue;
        const kk = a * n + b;
        if (free[kk] && !seen[kk]) {
          seen[kk] = 1;
          stack.push(kk);
        }
      }
    }
    const pockets: string[] = [];
    for (let k = 0; k < n * n; k++) {
      if (free[k] && !seen[k]) pockets.push(`(${(-half + Math.floor(k / n) * step).toFixed(1)}, ${(-half + (k % n) * step).toFixed(1)})`);
    }
    expect(pockets.slice(0, 5)).toEqual([]);
  });
});
