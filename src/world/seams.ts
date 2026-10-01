import { CONFIG } from '../config';
import type { Zone } from '../maps/types';

// Where the loaded zones meet, and what that means for where you stand
// (spec, "The world"): pure, so it's tested at positions without a renderer.
// The zone underfoot answers for the ground; the current zone (its name, the
// save, the sound) changes only once you're a couple of metres over a seam's
// line, so standing on it never flickers; and the zones' light and ambience
// blend by where you stand across a band either side of it.

/** The rectangle a zone's land covers, on the floor plane. */
type Land = Zone['land'];

/** How far (x, z) is from `land` over the floor plane: 0 on it. */
export function landGap(land: Land, x: number, z: number): number {
  return Math.hypot(Math.max(land.minX - x, 0, x - land.maxX), Math.max(land.minZ - z, 0, z - land.maxZ));
}

/**
 * The zone underfoot at (x, z): the one whose land holds it (on a seam's
 * line, where their heights agree, the first), else the one whose walkable
 * area is nearest.
 */
export function zoneUnder<Z extends Pick<Zone, 'land' | 'walkable'>>(zones: readonly Z[], x: number, z: number): Z | undefined {
  let best: Z | undefined;
  let bestGap = Infinity;
  for (const zone of zones) {
    if (landGap(zone.land, x, z) === 0) return zone;
    const gap = zone.walkable.distance(x, z);
    if (gap < bestGap) [best, bestGap] = [zone, gap];
  }
  return best;
}

/**
 * The current zone for you at (x, z), having been in `current`: it stays
 * until you're more than `past` m off its land, then it's the zone underfoot.
 */
export function currentZone<Z extends Pick<Zone, 'land' | 'walkable'>>(
  current: Z,
  zones: readonly Z[],
  x: number,
  z: number,
  past: number = CONFIG.world.crossing.past,
): Z {
  if (landGap(current.land, x, z) <= past) return current;
  return zoneUnder(zones, x, z) ?? current;
}

/** Where two loaded zones meet across a line along x: along z = `z` from `minX` to `maxX`, `north` on the −z side and `south` on the +z side. */
export interface NorthSouth<Z = Zone> {
  readonly z: number;
  readonly minX: number;
  readonly maxX: number;
  readonly north: Z;
  readonly south: Z;
}

/** Where two loaded zones meet across a line along z: along x = `x` from `minZ` to `maxZ`, `west` on the −x side and `east` on the +x side. */
export interface WestEast<Z = Zone> {
  readonly x: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly west: Z;
  readonly east: Z;
}

/** Where two loaded zones meet. */
export type Crossing<Z = Zone> = NorthSouth<Z> | WestEast<Z>;

/**
 * Every place two of `zones` meet: each seam a zone lists, with the zone
 * whose land lies on its other side along it (one edge can meet several
 * zones, as Brackenmoor's east meets Aldhaven and the Sallows), once each,
 * over the stretch where both lie.
 */
export function crossings<Z extends Pick<Zone, 'land' | 'seams' | 'sideSeams'>>(zones: readonly Z[]): Crossing<Z>[] {
  const out: Crossing<Z>[] = [];
  for (const a of zones) {
    for (const s of a.seams) {
      const aNorth = a.land.maxZ === s.z;
      const b = zones.find((o) => o !== a && (aNorth ? o.land.minZ === s.z : o.land.maxZ === s.z) && o.land.minX < s.maxX && o.land.maxX > s.minX);
      if (!b) continue;
      const [north, south] = aNorth ? [a, b] : [b, a];
      if (out.some((c) => 'z' in c && c.z === s.z && c.north === north && c.south === south)) continue;
      out.push({ z: s.z, minX: Math.max(s.minX, b.land.minX), maxX: Math.min(s.maxX, b.land.maxX), north, south });
    }
    for (const s of a.sideSeams ?? []) {
      const aWest = a.land.maxX === s.x;
      const b = zones.find((o) => o !== a && (aWest ? o.land.minX === s.x : o.land.maxX === s.x) && o.land.minZ < s.maxZ && o.land.maxZ > s.minZ);
      if (!b) continue;
      const [west, east] = aWest ? [a, b] : [b, a];
      if (out.some((c) => 'x' in c && c.x === s.x && c.west === west && c.east === east)) continue;
      out.push({ x: s.x, minZ: Math.max(s.minZ, b.land.minZ), maxZ: Math.min(s.maxZ, b.land.maxZ), west, east });
    }
  }
  return out;
}

/** How the air is where you stand: `from`'s, blended `t` of the way to `to`'s (the same zone, 0, away from any seam). */
export interface Air<Z = Zone> {
  from: Z;
  to: Z;
  t: number;
}

/**
 * The air at (x, z): within `band` m either side of a crossing's line, its
 * north (or west) zone's blended towards its south's (or east's) by how far
 * across the band you are, eased at both edges (halfway on the line);
 * elsewhere the zone
 * underfoot's own. Written into `into` if given (reused each frame), else a
 * new one; null with no zones.
 */
export function airAt<Z extends Pick<Zone, 'land' | 'walkable'>>(
  zones: readonly Z[],
  crossings: readonly Crossing<Z>[],
  x: number,
  z: number,
  band: number = CONFIG.world.crossing.band,
  into?: Air<Z>,
): Air<Z> | null {
  const set = (from: Z, to: Z, t: number): Air<Z> => {
    if (!into) return { from, to, t };
    into.from = from;
    into.to = to;
    into.t = t;
    return into;
  };
  for (const c of crossings) {
    const [along, lo, hi, across, from, to] = 'z' in c ? [x, c.minX, c.maxX, z - c.z, c.north, c.south] : [z, c.minZ, c.maxZ, x - c.x, c.west, c.east];
    if (along < lo || along > hi || Math.abs(across) >= band) continue;
    const u = (across + band) / (2 * band);
    return set(from, to, u * u * (3 - 2 * u));
  }
  const under = zoneUnder(zones, x, z);
  return under ? set(under, under, 0) : null;
}

/** Each of `zones`' share of `air`, in their order: 0 to 1, summing to 1. */
export function shares<Z>(zones: readonly Z[], air: Air<Z> | null, out: number[] = []): number[] {
  out.length = zones.length;
  zones.forEach((zone, i) => {
    out[i] = air ? (zone === air.from ? 1 - air.t : 0) + (zone === air.to ? air.t : 0) : 0;
  });
  return out;
}
