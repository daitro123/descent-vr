import { FEN_ROAD } from './fenRoad';
import { lerp, smoothstep } from './forest/noise';
import type { SideSeam } from './types';

// Where Brackenmoor's east edge meets Aldhaven's west: the seam along x = 260
// from z = 220 to 500, where the Fen road's seam takes over to the south. A
// ridge, the moor's escarpment, runs the length of it, and the Kingsroad
// crosses it in a cutting, past the tollhouse, on its way down to the
// Kingsgate. Its heights are fixed here, so either zone plans on its own and
// both meet them exactly. Free of three.js.

export const KINGSROAD = {
  /** The line, on the chunk grid's edges: Brackenmoor's east edge, Aldhaven's west. */
  x: 260,
  minZ: 220,
  maxZ: FEN_ROAD.minZ,
  /** Ground grid spacing either side, so the two zones meet vertex for vertex. */
  step: 2,
  /** Where the road crosses, how wide it is, and its height in the cutting. */
  road: { z: 336, width: 4, y: 8 },
  /** The ridge's height, and how far either side of the road the cutting's walls reach up to it. */
  ridge: 19,
  cutting: 16,
  /** The ridge's ends: high where the Greyspine's foothills rise in the north, the Fen road seam's own hill in the south. */
  ends: { north: 30, south: FEN_ROAD.ends.north },
} as const;

/** The seam's ground height at `z` along it: the same from either side. */
export function kingsroadHeight(z: number): number {
  const { road, ridge, cutting, ends, minZ, maxZ } = KINGSROAD;
  let h = ridge + 3 * Math.sin(z * 0.043) + 1.2 * Math.sin(z * 0.17 + 1);
  // The cutting, a flat road bed between walls that climb to the ridge.
  h = lerp(h, road.y, smoothstep(road.width / 2 + cutting, road.width / 2 + 1, Math.abs(z - road.z)));
  // The ends.
  h = lerp(h, ends.north, smoothstep(minZ + 30, minZ, z));
  h = lerp(h, ends.south, smoothstep(maxZ - 30, maxZ, z));
  return h;
}

/** The seam as a zone lists it: its heights every `step` m from `minZ`, and the road over it, running `dir`. */
export function kingsroadSeam(dir: readonly [number, number]): SideSeam {
  const { x, minZ, maxZ, step, road } = KINGSROAD;
  return {
    x,
    minZ,
    maxZ,
    step,
    heights: Array.from({ length: Math.round((maxZ - minZ) / step) + 1 }, (_, k) => kingsroadHeight(minZ + k * step)),
    roads: [{ z: road.z, width: road.width, dir }],
  };
}
