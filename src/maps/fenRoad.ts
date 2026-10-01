import type { SideSeam } from './types';
import { smoothstep } from './forest/noise';

// Where Brackenmoor's Fen road comes down off the moor into the Sallows: the
// seam along x = 260 from z = 500 to 580, past Beck's Foot, by the Last Stone.
// Its heights are fixed here, so either zone plans on its own and both meet
// them exactly: the Brack Beck's channel low in the north of it, the road on
// a low bank in the middle, and the ground lifting to the moor's last hills at
// either end. Free of three.js.

export const FEN_ROAD = {
  /** The line, on the chunk grid's edges. */
  x: 260,
  minZ: 500,
  maxZ: 580,
  /** Ground grid spacing either side, so the two zones meet vertex for vertex. */
  step: 2,
  /** Where the road crosses, how wide it is, and the bank it runs on. */
  road: { z: 543, width: 3.4, y: 1.3 },
  /** Where the beck crosses: its channel's middle and half width, its bed, and its water (the Sallows' one level). */
  beck: { z: 522, half: 4, bed: -0.9, water: 0 },
  /** The fens' ground either side of the road and the beck. */
  flat: 0.7,
  /** The hills at the line's ends. */
  ends: { north: 10, south: 9 },
} as const;

/** The seam's ground height at `z` along it: the same from either side. */
export function fenRoadHeight(z: number): number {
  const { road, beck, flat, ends, minZ, maxZ } = FEN_ROAD;
  let h = flat + 0.25 * Math.sin(z * 0.37);
  // The beck's channel.
  const db = Math.abs(z - beck.z);
  h += (beck.bed - h) * smoothstep(beck.half + 2, beck.half - 1.5, db);
  // The road's bank.
  h += (road.y - h) * smoothstep(road.width / 2 + 3, road.width / 2 + 0.5, Math.abs(z - road.z));
  // The hills either end.
  h += (ends.north - h) * smoothstep(minZ + 16, minZ, z);
  h += (ends.south - h) * smoothstep(maxZ - 22, maxZ, z);
  return h;
}

/** The seam as a zone lists it: its heights every `step` m from `minZ`, and the road over it, running east. */
export function fenRoadSeam(): SideSeam {
  const { x, minZ, maxZ, step, road } = FEN_ROAD;
  return {
    x,
    minZ,
    maxZ,
    step,
    heights: Array.from({ length: Math.round((maxZ - minZ) / step) + 1 }, (_, k) => fenRoadHeight(minZ + k * step)),
    roads: [{ z: road.z, width: road.width, dir: [1, 0] }],
  };
}
