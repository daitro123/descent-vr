import { Vector3 } from 'three';
import type { Enemy } from './enemy';

// The debug handle's enemy helpers, so scripted checks can root, freeze and
// slow an enemy without an ability that does it: `enemies.freeze(3)` freezes
// the one nearest you. Each returns the seconds it took (0: it took none).

const _feet = new Vector3();

/** The helpers, over the enemies standing now and where your feet are. */
export function enemiesDebug(enemies: () => Iterable<Enemy>, feet: (out: Vector3) => Vector3) {
  /** The living enemy nearest you, or null. */
  const nearest = (): Enemy | null => {
    feet(_feet);
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of enemies()) {
      const d = e.alive ? Math.hypot(e.position.x - _feet.x, e.position.z - _feet.z) : Infinity;
      if (d < bestD) [best, bestD] = [e, d];
    }
    return best;
  };
  return {
    nearest,
    /** Root `enemy` (the nearest by default) for `seconds`. */
    root: (seconds = 4, enemy = nearest()) => enemy?.afflict('rooted', seconds) ?? 0,
    /** Freeze `enemy` (the nearest by default) for `seconds`. */
    freeze: (seconds = 4, enemy = nearest()) => enemy?.afflict('frozen', seconds) ?? 0,
    /** Slow `enemy` (the nearest by default) by `by` for `seconds`. */
    slow: (seconds = 4, by = 0.5, enemy = nearest()) => enemy?.afflict('slowed', seconds, by) ?? 0,
  };
}
