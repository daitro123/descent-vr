import { CONFIG } from '../../config';
import { Arena } from '../../world/arena';
import type { WholeMap } from '../types';

/** The combat prototype's crypt hall, as a map. */
export function buildCrypt(): WholeMap {
  const arena = new Arena();
  const h = CONFIG.arena.halfSize;
  return {
    kind: 'whole',
    id: 'crypt',
    root: arena.root,
    sky: { background: 0x0c0a0e, fog: { color: 0x0c0a0e, near: 6, far: h * 2.2 } },
    viewDistance: 60,
    spawn: { x: 0, z: 0, yaw: 0 },
    bounds: { minX: -h, maxX: h, minZ: -h, maxZ: h },
    landmarks: [
      { label: 'Centre', x: 0, z: 0 },
      { label: 'Throne', x: 0, z: -4.5 },
    ],
    heightAt: () => 0,
    resolve: (p, r) => arena.resolve(p, r),
    update: (dt, camera) => arena.update(dt, camera),
  };
}
