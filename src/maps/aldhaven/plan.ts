import type { Tree } from '../../world/ambience';
import type { Atmosphere } from '../../world/atmosphere';
import { type Box, Colliders } from '../forest/colliders';
import { fbm, lerp, mulberry32, nearestOnPolyline, type P2, sampleCurve, smoothstep } from '../forest/noise';
import { HeightGrid } from '../heightGrid';
import type { Spot } from '../types';
import { Walkable } from '../walkable';
import { CITY_LIGHT, CITY_SKY, type District } from './palette';

// Aldhaven, the crown's capital (the zone spec, /zones/aldhaven.md in the
// project's files): a white-walled port where the river Ald meets the
// Morning Sea. Crown Hill rises on the north bank with the keep on top; the
// Great Market lies inside the Kingsgate to the west; the Cathedral of the
// Dawn stands in its close east of the market; Old Town's black basalt lanes
// run down to the river; the Aldbridge, crowded with houses, crosses to Guild
// Row on the low south bank; the harbour opens east to the sea behind a mole
// with the harbour light at its end. Outside the walls: hedged fields and an
// orchard to the west, the mouth of the Ald gorge and the Gorgegate to the
// north, and the Delta causeway south over the tidal flats.
//
// Environment only for now: no people, no quests, nothing that moves. This
// file is the plan: heights, streets, what stands where, what you bump into.
// No three.js meshes, so it runs in tests and in its worker. Everything is
// laid out in the city's own frame (x east, z south, metres from the city's
// middle) and moved to its place on the world's chunk grid, `ALDHAVEN.at`, at
// the end. It joins no neighbour yet: its seams with Brackenmoor (the
// Kingsroad, west), the Sallows (the causeway, south) and Greyfell (the
// Gorgegate, north) wait for those zones.

export const ALDHAVEN = {
  /** Where the city's middle sits in the world: east of Brackenmoor's moor, with unzoned land between. */
  at: { x: 540, z: 360 },
  /** The land: 8 by 7 chunks, in the city's frame. */
  land: { minX: -160, maxX: 160, minZ: -140, maxZ: 140 },
  cell: 2,
  /** The water line: the sea, the river and the harbour, in world metres. */
  water: 0,
  /** The river's banks: the north bank's edge, the south's, and where the river widens into the harbour basin. */
  river: { north: 44, south: 76, basin: { from: 38, to: 52, north: 30, south: 92 }, bed: -3 },
  /** The sea wall's line: east of it is the Morning Sea. */
  coast: 113,
  /** The quays' and streets' level by the river, over the water line. */
  quay: 2.4,
  /** Crown Hill: its top, how high it rises over the town, and how far it reaches. */
  hill: { x: 0, z: -80, rise: 13, top: 12, foot: 88 },
  /** The city wall: its line, its height and thickness, and its gates. */
  wall: { north: -112, west: -110, south: 112, ne: [75, -112, 113, -84] as const, height: 9, thick: 3 },
  gates: {
    kingsgate: { x: -110, z: -15 },
    northGate: { x: 20, z: -112 },
    southGate: { x: -21, z: 112 },
    width: 7,
  },
  /** The Aldbridge: its roadway's middle, its deck's width, and where it lands on either bank. */
  bridge: { x: -30, width: 14, road: 7, from: 40, to: 80, rise: 1.5 },
  /** The mole out to the harbour light. */
  mole: { line: [[111, 24], [146, 38], [150, 45]] as const, width: 7, height: 2.3 },
  /** The Delta causeway south over the tidal flats, and the flats' depth under the water. */
  causeway: { x: -21, width: 8, height: 1.9 },
  flats: -0.5,
  /** The gorge's mouth: the valley road between cliffs, north of the North Gate. */
  gorge: { x: 25, half: 22, from: -118, cliff: 28 },
} as const;

/** Aldhaven's air and light: the clearest sky since Oakvale, a pale sea-blue haze, and morning gold off the sea. */
export const ALDHAVEN_ATMOSPHERE: Atmosphere = {
  background: CITY_SKY.haze,
  fog: { color: CITY_SKY.haze, near: 50, far: 210 },
  sky: { zenith: CITY_SKY.zenith, horizon: CITY_SKY.horizon, haze: CITY_SKY.haze, sun: CITY_SKY.sun },
  sun: { color: CITY_LIGHT.sun, intensity: 2.5 },
  hemisphere: { sky: CITY_LIGHT.sky, ground: CITY_LIGHT.ground, intensity: 1.55 },
  farPlane: 250,
  flames: [],
};

/** What can stand in the city: a building, a landmark, a stretch of wall, a prop. */
export type PieceKind =
  | 'house' | 'warehouse' | 'inn' | 'hall' | 'townhouse' | 'barracks' | 'forge' | 'lodge' | 'stables' | 'barn' | 'windmill'
  | 'cathedral' | 'keep' | 'collegium' | 'lighthouse' | 'crane' | 'bridge'
  | 'wall' | 'tower' | 'gatehouse' | 'waterGate' | 'gorgegate' | 'quay' | 'lowWall'
  | 'marketCross' | 'stall' | 'lamp' | 'well' | 'statue' | 'grave' | 'butt' | 'dummy' | 'bench'
  | 'crates' | 'barrels' | 'cart' | 'ship' | 'boat' | 'signpost' | 'mapboard' | 'banner' | 'sinkhole' | 'haystack' | 'bollard' | 'pondRim';

/** Too small to see from a stand-in's distance. */
export const SMALL: ReadonlySet<PieceKind> = new Set<PieceKind>([
  'stall', 'lamp', 'well', 'statue', 'grave', 'butt', 'dummy', 'bench', 'crates', 'barrels', 'cart', 'boat',
  'signpost', 'mapboard', 'banner', 'sinkhole', 'haystack', 'bollard', 'pondRim',
]);

/**
 * One thing standing in the city, in world metres: the middle of its foot,
 * on the ground it stands on, its front facing (sin yaw, cos yaw). `w` is
 * its width along its own X, `d` its depth along Z, `h` a height where it
 * has one, `storeys` its floors; `variant` picks among a kind's looks.
 */
export interface Piece {
  readonly kind: PieceKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly w: number;
  readonly d: number;
  readonly h: number;
  readonly storeys: number;
  readonly variant: number;
  readonly district: District;
  readonly seed: number;
}

/** What grows in and round the city. */
export type CityPlantKind = 'plane' | 'oak' | 'pine' | 'orchard' | 'hedge' | 'bush' | 'rock' | 'reed' | 'grass' | 'flower';

/** Undergrowth, too small for a stand-in. */
export const UNDERGROWTH: ReadonlySet<CityPlantKind> = new Set<CityPlantKind>(['reed', 'grass', 'flower']);

export interface CityPlant {
  readonly kind: CityPlantKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly scale: number;
  readonly seed: number;
}

/** A street or road: its centre line (about a metre between samples), its width, and whether it's a dirt road outside the walls. */
export interface Street {
  readonly line: readonly P2[];
  readonly width: number;
  readonly dirt: boolean;
}

export interface AldhavenPlan {
  readonly land: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number };
  readonly walkable: Walkable;
  readonly ground: HeightGrid;
  readonly streets: readonly Street[];
  readonly pieces: readonly Piece[];
  readonly plants: readonly CityPlant[];
  readonly colliders: Colliders;
  /** The King's Garden's pond: its middle, its radius and its water's height. */
  readonly pond: { readonly x: number; readonly z: number; readonly r: number; readonly y: number };
  /** Where `?map=aldhaven` starts: on the Kingsroad outside the Kingsgate, looking at the city. */
  readonly spawn: Spot;
  readonly landmarks: readonly { label: string; x: number; z: number }[];
  /** Its trees, for birds to call from. */
  readonly trees: readonly Tree[];
  /** What a point on the ground is: in the walls and paved, which district, a garden, a field. */
  surface(x: number, z: number): Surface;
  heightAt(x: number, z: number): number;
}

/** What the ground is at a point, for its colour. */
export interface Surface {
  readonly paved: boolean;
  /** Old Town's black basalt setts. */
  readonly basalt: boolean;
  readonly garden: boolean;
  readonly field: boolean;
}

const PI = Math.PI;
const { river, coast, hill, wall, gates, bridge, mole, causeway, gorge } = ALDHAVEN;

// ------------------------------------------------------------------ the lie of the land

/** The north bank's edge at x: the river's, then the harbour basin's. */
function northEdge(x: number): number {
  const { basin } = river;
  return lerp(river.north, basin.north, smoothstep(basin.from, basin.to, x));
}

/** The south bank's edge at x. */
function southEdge(x: number): number {
  const { basin } = river;
  return lerp(river.south, basin.south, smoothstep(basin.from, basin.to, x));
}

/** Where the shore is at z: the sea wall inside the walls, a ragged rocky shore north of them. */
function shoreAt(z: number): number {
  if (z > wall.ne[3] - 4 && z < 120) return coast;
  return coast + (fbm(z * 0.05, 3, 211) - 0.5) * 8;
}

/** Is (x, z) inside the city wall (in the city's frame), with `margin` m to spare? */
export function insideWalls(x: number, z: number, margin = 0): boolean {
  const [ax, az, bx, bz] = wall.ne;
  if (x < wall.west + margin || z < wall.north + margin || z > wall.south - margin || x > coast - margin) return false;
  // The north-east wall runs on the diagonal down to the shore.
  const cross = (bx - ax) * (z - az) - (bz - az) * (x - ax);
  return cross / Math.hypot(bx - ax, bz - az) > margin;
}

/** Is (x, z) in the river or the harbour basin (between its banks)? */
function inRiver(x: number, z: number, margin = 0): boolean {
  return x < coast + 30 && z > northEdge(x) - margin && z < southEdge(x) + margin;
}

/** Crown Hill's rise at (x, z). */
function crownHill(x: number, z: number): number {
  const d = Math.hypot(x - hill.x, (z - hill.z) * 0.9);
  return hill.rise * (1 - smoothstep(hill.top, hill.foot, d));
}

/** The ground's height at (x, z) in the city's frame. */
function cityHeight(x: number, z: number): number {
  const { land } = ALDHAVEN;
  let h = ALDHAVEN.quay + 0.2 + (fbm(x * 0.02, z * 0.02, 201) - 0.5) * 1.0;
  // Flat by the river, so the quays and the river streets are level.
  const nearRiver = Math.min(Math.abs(z - northEdge(x)), Math.abs(z - southEdge(x)));
  h = lerp(ALDHAVEN.quay, h, smoothstep(4, 16, nearRiver));
  h += crownHill(x, z);
  // The land climbs west to the moor, and rises at the land's other edges so its end is never seen.
  h += 13 * smoothstep(-112, -162, x) * (0.8 + 0.4 * fbm(x * 0.03, z * 0.03, 203));
  // The gorge's mouth: cliffs either side of the valley road, which climbs gently north.
  const north = smoothstep(gorge.from + 2, gorge.from - 14, z);
  const valley = smoothstep(gorge.half, gorge.half - 10, Math.abs(x - gorge.x));
  h += north * (gorge.cliff * (1 - valley) * (0.85 + 0.3 * fbm(x * 0.05, z * 0.05, 205)) + 3 * valley);
  // The south bank is low and flat; past the south wall, the tidal flats under a hand of water.
  if (z > southEdge(x)) h = lerp(h, ALDHAVEN.quay + (fbm(x * 0.03, z * 0.03, 207) - 0.5) * 0.4, smoothstep(southEdge(x), southEdge(x) + 6, z) * (x > wall.west ? 1 : 0.4));
  if (z > wall.south + 1.5) h = lerp(h, ALDHAVEN.flats, smoothstep(wall.south + 1.5, wall.south + 4, z));
  // A reed bank along the land's south edge, low dunes, so the flats' end is a shore.
  h += 1.4 * smoothstep(land.maxZ - 14, land.maxZ, z) * smoothstep(wall.south, wall.south + 6, z);
  // The river and the harbour: quay walls inside the walls, grassy banks outside.
  const soft = x < wall.west - 2 ? 3 : 0;
  const n = northEdge(x);
  const s = southEdge(x);
  const inside = smoothstep(n - soft, n + 2 + soft, z) * smoothstep(s + soft, s - 2 - soft, z);
  h = lerp(h, river.bed + (fbm(x * 0.1, z * 0.1, 209) - 0.5) * 0.6, inside);
  // The sea.
  const shore = shoreAt(z);
  h = lerp(h, -5 - smoothstep(shore, shore + 40, x) * 3, smoothstep(shore - (z < wall.ne[3] - 4 ? 4 : 0), shore + 2, x));
  // Raised ways over the water: the mole and the causeway.
  const m = nearestOnPolyline(mole.line, x, z).d;
  h = lerp(h, mole.height, smoothstep(mole.width / 2 + 1.5, mole.width / 2, m));
  if (z > wall.south - 2) h = lerp(h, causeway.height, smoothstep(causeway.width / 2 + 1.5, causeway.width / 2, Math.abs(x - causeway.x)));
  return h;
}

/** The Aldbridge's deck height at z along it (it humps over the river). */
export function deckHeight(z: number): number {
  const t = Math.min(1, Math.max(0, (z - bridge.from) / (bridge.to - bridge.from)));
  return ALDHAVEN.quay + bridge.rise * Math.sin(PI * t);
}

/** Is (x, z) on the Aldbridge's deck? */
function onBridge(x: number, z: number): boolean {
  return Math.abs(x - bridge.x) <= bridge.width / 2 && z >= bridge.from && z <= bridge.to;
}

// ------------------------------------------------------------------ streets

/** The streets and roads, in the city's frame: [points, width, dirt?]. */
const STREETS: readonly (readonly [readonly P2[], number, boolean?])[] = [
  // The Kingsroad, from the moor's edge down to the Kingsgate, and in through it to the market.
  [[[-162, -24], [-140, -21], [-122, -16], [-108, -15]], 5.5, true],
  [[[-112, -15], [-90, -15]], 7],
  // High Street, the market to the cathedral's west gate.
  [[[-50, -15], [-20, -16], [6, -15]], 7],
  // The Crown terrace: from the market up round the hill's south face and down to the harbour.
  [[[-52, -36], [-30, -44], [0, -46], [40, -44], [72, -40], [90, -26], [96, -10]], 7],
  // Up to the keep's gate.
  [[[0, -46], [0, -63]], 6],
  // North Street, from the terrace to the North Gate, and on as the valley road into the gorge.
  [[[20, -45], [25, -72], [22, -98], [20, -114]], 6],
  [[[20, -110], [22, -124], [26, -142]], 5.5, true],
  // The lane up beside the King's Garden.
  [[[-46, -40], [-52, -74], [-54, -106]], 5],
  // The river streets on the north bank, either side of the bridge head, on to the Long Quay.
  [[[-108, 39.5], [-40, 39.5]], 6],
  [[[-22, 39.5], [12, 39.5], [36, 38], [48, 28], [56, 24]], 6],
  // Old Town's crooked lanes.
  [[[-46, -12], [-40, 4], [-32, 20], [-27, 37]], 4.5],
  [[[-20, -12], [-14, 8], [-2, 16], [12, 21], [30, 21], [50, 19], [64, 15], [68, 4], [68, -14]], 4.5],
  [[[-2, 16], [0, 28], [-4, 37]], 4.5],
  [[[30, 21], [31, 37]], 4.5],
  // Lanes through the deeper blocks: west of Old Town, and up Crown Hill's east side to the barracks.
  [[[-106, 23], [-80, 24], [-46, 22]], 4.5],
  [[[56, -43], [56, -80]], 4.5],
  [[[-24, -46], [-20, -62], [-4, -64]], 4.5],
  // From the market's south side down to the river.
  [[[-92, 6], [-96, 22], [-98, 37]], 5],
  [[[-70, 6], [-70, 24], [-60, 37]], 5],
  // The harbour: the street behind the warehouses, a lane down to the quay, and the shore road inside the sea wall.
  [[[68, -12], [88, -9], [108, -8]], 6],
  [[[86, -9], [86, 15]], 6],
  [[[108, -82], [108, -8]], 5],
  // The south bank: Guild Row along the river, the back lane, and the south street from the bridge to the south gate.
  [[[-108, 86], [-40, 86], [40, 86], [54, 95]], 7],
  [[[-108, 99.5], [-40, 99], [40, 99.5]], 4.5],
  [[[-30, 80], [-26, 96], [-21, 108], [-21, 114]], 7],
  // The Delta causeway, paved, south over the flats.
  [[[-21, 112], [-21, 142]], 6],
];

// ------------------------------------------------------------------ what stands where

/** Open places no house is built on: the squares, the quays, the gardens, the landmarks' plots. [minX, maxX, minZ, maxZ]. */
const OPEN: readonly (readonly [number, number, number, number])[] = [
  [-92, -48, -37, 7], // the Great Market
  [6, 66, -38, 18], // Cathedral Close
  [-108, -58, -108, -51], // the King's Garden
  [52, 113, 13, 31], // the Long Quay
  [52, 113, 92, 100], // the south quay
  [-104, -56, 76, 83], // the river wharf
  [-44, -16, 31, 45], // the bridge's north head
  [-44, -16, 75, 84], // and its south foot
  [-108, -92, -1, 10], // the coaching yard
  [42, 68, -96, -82], // the barracks yard
  [-112, -102, -24, -6], // inside the Kingsgate
  [12, 28, -112, -102], // inside the North Gate
  [-28, -14, 104, 112], // inside the south gate
];

/** Round plots: the keep on Crown Hill, the sinkhole, the old well. [x, z, r]. */
const OPEN_ROUND: readonly (readonly [number, number, number])[] = [
  [0, -86, 22],
  [-14, 30, 4],
  [22, 29, 3],
];

interface Footprint {
  x: number;
  z: number;
  w: number;
  d: number;
  yaw: number;
}

/** A raster of the city's frame, a metre a cell: where a house may not stand. */
export class Plot {
  readonly cols: number;
  readonly rows: number;
  readonly taken: Uint8Array;
  constructor(private readonly minX: number, private readonly minZ: number, maxX: number, maxZ: number) {
    this.cols = maxX - minX;
    this.rows = maxZ - minZ;
    this.taken = new Uint8Array(this.cols * this.rows);
  }
  private index(x: number, z: number): number {
    const i = Math.floor(x - this.minX);
    const j = Math.floor(z - this.minZ);
    if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) return -1;
    return j * this.cols + i;
  }
  isTaken(x: number, z: number): boolean {
    const k = this.index(x, z);
    return k < 0 || this.taken[k] === 1;
  }
  take(x: number, z: number): void {
    const k = this.index(x, z);
    if (k >= 0) this.taken[k] = 1;
  }
  /** Mark every cell `test` says, over the box [x0, x1] × [z0, z1]. */
  mark(x0: number, x1: number, z0: number, z1: number, test: (x: number, z: number) => boolean): void {
    for (let z = Math.floor(z0); z <= Math.ceil(z1); z++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) if (test(x + 0.5, z + 0.5)) this.take(x + 0.5, z + 0.5);
  }
  /** Points over a footprint, about every metre and round its edge. */
  static samples(f: Footprint, grow = 0): P2[] {
    const c = Math.cos(f.yaw);
    const s = Math.sin(f.yaw);
    const hw = f.w / 2 + grow;
    const hd = f.d / 2 + grow;
    const nx = Math.max(2, Math.ceil(hw * 2));
    const nz = Math.max(2, Math.ceil(hd * 2));
    const out: P2[] = [];
    for (let a = 0; a <= nx; a++) {
      for (let b = 0; b <= nz; b++) {
        const lx = -hw + (2 * hw * a) / nx;
        const lz = -hd + (2 * hd * b) / nz;
        out.push([f.x + lx * c + lz * s, f.z - lx * s + lz * c]);
      }
    }
    return out;
  }
  fits(f: Footprint): boolean {
    return Plot.samples(f, -0.15).every(([x, z]) => !this.isTaken(x, z));
  }
  claim(f: Footprint): void {
    for (const [x, z] of Plot.samples(f, 0.2)) this.take(x, z);
  }
}

/** Which district (x, z) is in, in the city's frame. */
export function districtAt(x: number, z: number): District {
  if (!insideWalls(x, z, -4)) return 'fields';
  if (z > southEdge(x)) return x > 50 ? 'harbour' : 'guild';
  if (x > 64) return 'harbour';
  if (x >= 6 && x <= 66 && z >= -38 && z <= 18) return 'close';
  if (z > 4 + 16 * (fbm(x * 0.05, 7, 215) - 0.5) && x > -50) return 'oldTown';
  if (z < -36 && x > -56) return 'crown';
  return 'market';
}

/** A district's houses: frontage, depth and storeys, [lo, hi]. */
const HOUSES: Readonly<Record<District, { w: P2; d: P2; storeys: P2 }>> = {
  market: { w: [7, 10], d: [8, 11], storeys: [2, 3] },
  crown: { w: [9, 13], d: [9, 12], storeys: [3, 3] },
  close: { w: [7, 9], d: [7, 9], storeys: [2, 2] },
  oldTown: { w: [5, 7], d: [6, 8], storeys: [2, 3] },
  guild: { w: [8, 12], d: [8, 9], storeys: [2, 2] },
  harbour: { w: [9, 13], d: [9, 12], storeys: [2, 3] },
  fields: { w: [8, 10], d: [7, 8], storeys: [1, 2] },
};

/** Plan Aldhaven: everything in the city's frame, then moved to `ALDHAVEN.at` on the world's grid. */
export function planAldhaven(): AldhavenPlan {
  const { land, cell, at } = ALDHAVEN;
  const rand = mulberry32(1871);
  const streets: Street[] = STREETS.map(([pts, width, dirt]) => ({ line: sampleCurve(pts, 1), width, dirt: dirt ?? false }));

  // The ground, in the city's frame for now.
  const local = (x: number, z: number) => (onBridge(x, z) ? deckHeight(z) : cityHeight(x, z));

  // ---- Where houses may not stand.
  const plot = new Plot(land.minX, land.minZ, land.maxX, land.maxZ);
  plot.mark(land.minX, land.maxX, land.minZ, land.maxZ, (x, z) => !insideWalls(x, z, wall.thick / 2 + 0.6) || inRiver(x, z, 1.5) || Math.abs(x - bridge.x) < bridge.width / 2 + 1 && z > 30 && z < 90);
  for (const s of streets) {
    const r = s.width / 2 + 0.4;
    for (const [px, pz] of s.line) plot.mark(px - r, px + r, pz - r, pz + r, (x, z) => Math.hypot(x - px, z - pz) < r);
  }
  for (const [x0, x1, z0, z1] of OPEN) plot.mark(x0, x1, z0, z1, () => true);
  for (const [cx, cz, r] of OPEN_ROUND) plot.mark(cx - r, cx + r, cz - r, cz + r, (x, z) => Math.hypot(x - cx, z - cz) < r);

  const pieces: Omit<Piece, 'y'>[] = [];
  const boxes: Box[] = [];
  const circles: { x: number; z: number; r: number }[] = [];
  let seed = 1;
  const put = (kind: PieceKind, x: number, z: number, yaw: number, o: Partial<Omit<Piece, 'kind' | 'x' | 'z' | 'yaw' | 'y'>> = {}, solid: 'box' | 'circle' | 'none' = 'box') => {
    const p = { kind, x, z, yaw, w: o.w ?? 1, d: o.d ?? 1, h: o.h ?? 0, storeys: o.storeys ?? 1, variant: o.variant ?? 0, district: o.district ?? districtAt(x, z), seed: o.seed ?? seed++ };
    pieces.push(p);
    if (solid !== 'none' && kind !== 'wall' && kind !== 'tower') plot.claim({ x, z, w: p.w, d: p.d, yaw });
    if (solid === 'box') boxes.push({ x, z, hw: p.w / 2, hd: p.d / 2, yaw });
    else if (solid === 'circle') circles.push({ x, z, r: Math.max(p.w, p.d) / 2 });
    return p;
  };
  /** A building whose plot is claimed, so no house is built over it. */
  const building = (kind: PieceKind, x: number, z: number, yaw: number, w: number, d: number, o: Partial<Piece> = {}) => {
    plot.claim({ x, z, w, d, yaw });
    return put(kind, x, z, yaw, { ...o, w, d });
  };

  // ---- The walls, their towers and gates.
  const gapAt = (ax: number, az: number, bx: number, bz: number): number[] => {
    const out: number[] = [];
    for (const g of [gates.kingsgate, gates.northGate, gates.southGate]) {
      const len = Math.hypot(bx - ax, bz - az);
      const t = ((g.x - ax) * (bx - ax) + (g.z - az) * (bz - az)) / (len * len);
      const px = ax + (bx - ax) * t;
      const pz = az + (bz - az) * t;
      if (t > 0 && t < 1 && Math.hypot(px - g.x, pz - g.z) < 1) out.push(t * len);
    }
    return out;
  };
  const towersAt: P2[] = [];
  const wallLine = (ax: number, az: number, bx: number, bz: number, outward: P2, towers = true) => {
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    // Its front faces out of the city: square to the wall, on the side `outward` says.
    const flip = uz * outward[0] - ux * outward[1] < 0 ? -1 : 1;
    const yaw = Math.atan2(uz * flip, -ux * flip);
    const gaps = gapAt(ax, az, bx, bz);
    const half = gates.width / 2 + 7;
    // Cut into runs about 10 m long, round the gates.
    const spans: P2[] = [];
    let from = 0;
    for (const g of gaps) {
      spans.push([from, g - half]);
      from = g + half;
    }
    spans.push([from, len]);
    for (const [s0, s1] of spans) {
      const n = Math.max(1, Math.round((s1 - s0) / 10));
      for (let k = 0; k < n; k++) {
        const a = s0 + ((s1 - s0) * k) / n;
        const b = s0 + ((s1 - s0) * (k + 1)) / n;
        const m = (a + b) / 2;
        put('wall', ax + ux * m, az + uz * m, yaw, { w: b - a + 0.2, d: wall.thick, h: wall.height });
      }
    }
    for (const g of gaps) put('gatehouse', ax + ux * g, az + uz * g, yaw, { w: gates.width + 14, d: 8, h: 14 }, 'none');
    if (!towers) return;
    const count = Math.max(1, Math.round(len / 42));
    for (let k = 0; k <= count; k++) {
      const s = (len * k) / count;
      const [tx, tz] = [ax + ux * s, az + uz * s];
      if (gaps.some((g) => Math.abs(g - s) < half + 4) || towersAt.some(([x, z]) => Math.hypot(x - tx, z - tz) < 6)) continue;
      towersAt.push([tx, tz]);
      put('tower', tx, tz, yaw, { w: 9, d: 9, h: 13 }, 'circle');
    }
  };
  const [nex0, nez0, nex1, nez1] = wall.ne;
  wallLine(wall.west, wall.north, nex0, nez0, [0, -1]);
  wallLine(nex0, nez0, nex1, nez1, [0.6, -0.8]);
  wallLine(wall.west, wall.north, wall.west, river.north - 1, [-1, 0]);
  wallLine(wall.west, river.south + 1, wall.west, wall.south, [-1, 0]);
  wallLine(wall.west, wall.south, coast, wall.south, [0, 1]);
  // The gatehouses' towers stand either side of the way through: solid.
  for (const g of [gates.kingsgate, gates.northGate, gates.southGate]) {
    const across: P2 = g === gates.kingsgate ? [0, 1] : [1, 0];
    for (const side of [-1, 1]) {
      const off = side * (gates.width / 2 + 3.5);
      boxes.push({ x: g.x + across[0] * off, z: g.z + across[1] * off, hw: 3.5, hd: 3.5, yaw: 0 });
    }
  }
  // The water gate over the river, where the wall crosses it.
  put('waterGate', wall.west, (river.north + river.south) / 2, -PI / 2, { w: river.south - river.north + 2, d: wall.thick, h: wall.height }, 'none');
  // The quays along the banks and the sea wall.
  const quayRun = (pts: readonly P2[], water: 1 | -1) => {
    const line = sampleCurve(pts, 1);
    for (let i = 0; i < line.length - 1; i += 6) {
      const j = Math.min(line.length - 1, i + 6);
      const [ax, az] = line[i];
      const [bx, bz] = line[j];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.5) continue;
      // Its front faces the water: to the right of the way it runs for 1, the left for -1.
      const ox = (-(bz - az) / len) * -water;
      const oz = ((bx - ax) / len) * -water;
      put('quay', (ax + bx) / 2 + ox * 0.5, (az + bz) / 2 + oz * 0.5, Math.atan2(ox, oz), { w: len + 0.15, d: 1, h: ALDHAVEN.quay }, 'none');
    }
  };
  const { basin } = river;
  quayRun([[wall.west + 1.5, river.north], [basin.from, river.north], [basin.to, basin.north], [coast, basin.north]], 1);
  quayRun([[wall.west + 1.5, river.south], [basin.from, river.south], [basin.to, basin.south], [coast, basin.south]], -1);
  quayRun([[coast, wall.ne[3]], [coast, basin.north]], -1);
  quayRun([[coast, basin.south], [coast, wall.south]], -1);

  // ---- The landmarks.
  // The Cathedral of the Dawn, its west front and spire towards the market, in its walled close.
  building('cathedral', 36, -10, -PI / 2, 24, 48, { h: 48, district: 'close' });
  const closeWall = (ax: number, az: number, bx: number, bz: number, gap?: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const parts: P2[] = gap === undefined ? [[0, len]] : [[0, gap - 2.5], [gap + 2.5, len]];
    for (const [s0, s1] of parts) {
      const m = (s0 + s1) / 2;
      put('lowWall', ax + ((bx - ax) * m) / len, az + ((bz - az) * m) / len, Math.atan2(-(bz - az), bx - ax), { w: s1 - s0, d: 0.6, h: 1.8 });
    }
  };
  closeWall(8, -36, 64, -36);
  closeWall(64, -36, 64, 16, 40);
  closeWall(64, 16, 8, 16, 20);
  closeWall(8, 16, 8, -36, 31);
  put('statue', 12, -26, PI / 2, { w: 1.6, d: 1.6, h: 4 }, 'circle');
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) put('grave', 46 + i * 4 + (j % 2), 6 + j * 3, PI / 2 + (rand() - 0.5) * 0.2, { w: 0.7, d: 0.3, h: 1 }, 'none');
  // The keep on Crown Hill, its gate to the south, and the Council hall beside it.
  building('keep', 0, -86, 0, 34, 34, { h: 24, district: 'crown' });
  building('hall', -34, -86, PI / 2, 12, 20, { storeys: 2, variant: 0, district: 'crown' });
  // The great houses' townhouses along the terrace: Corvane, Harrowgate, Ashby.
  building('townhouse', -28, -58, 0, 18, 12, { variant: 0, storeys: 3 });
  building('townhouse', 40, -60, 0, 18, 12, { variant: 1, storeys: 3 });
  building('townhouse', 70, -60, 0, 16, 12, { variant: 2, storeys: 3 });
  // The barracks against the north wall, its yard in front with the drill posts.
  building('barracks', 55, -102, 0, 26, 9, { storeys: 2 });
  for (let i = 0; i < 4; i++) put('dummy', 46 + i * 6, -88, PI, { w: 0.6, d: 0.6, h: 1.8 }, 'circle');
  // The Great Market: the Gilded Gull on the north side; the bank and the Exchange on the south.
  building('inn', -70, -44, 0, 16, 11, { storeys: 3, variant: 0, district: 'market' });
  building('hall', -82, 13, PI, 14, 11, { storeys: 2, variant: 1, district: 'market' });
  building('hall', -58, 13, PI, 14, 11, { storeys: 2, variant: 2, district: 'market' });
  put('marketCross', -70, -15, 0, { w: 4, d: 4, h: 6 }, 'circle');
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * PI * 2 + PI / 8;
    put('stall', -70 + Math.sin(a) * 11.5, -15 + Math.cos(a) * 11.5, a + PI, { w: 3.2, d: 2, h: 2.6, variant: k });
  }
  // Inside the Kingsgate: the Watch house, and the coaching yard's stables across the way.
  building('hall', -100, -27, 0, 12, 8, { storeys: 2, variant: 3, district: 'market' });
  building('stables', -100, 6, PI, 14, 7);
  put('cart', -96, -2, 0.4, { w: 1.6, d: 3 });
  // Old Town: the Lamplit Collegium's tower, the Drowned Lamp, the old well and the fenced-off sinkhole.
  building('collegium', 10, 29, PI, 12, 9, { h: 30, district: 'oldTown' });
  building('inn', 40, 30, PI, 12, 9, { storeys: 3, variant: 1, district: 'oldTown' });
  put('well', 22, 29, 0, { w: 2.2, d: 2.2, h: 2.6 }, 'circle');
  put('sinkhole', -14, 30, 0.3, { w: 6, d: 6 }, 'circle');
  // Guild Row: the Great Forge and the Apothecaries' Hall face the river.
  building('forge', -60, 93, PI, 16, 7.5, { district: 'guild' });
  building('hall', -5, 93, PI, 14, 7.5, { storeys: 2, variant: 4, district: 'guild' });
  // The harbour: warehouses on both quays, the treadwheel crane on the Long Quay.
  for (const [x, w] of [[59, 12], [72, 12], [96, 10], [107, 10]] as const) building('warehouse', x, 6, 0, w, 12, { storeys: 2, variant: x % 3 });
  for (const [x, w] of [[59, 12], [72, 12], [87, 12], [104, 14]] as const) building('warehouse', x, 105, PI, w, 9, { storeys: 2, variant: (x + 1) % 3 });
  put('crane', 82, 26, 0, { w: 6, d: 6, h: 14 }, 'box');
  // The King's Garden: its wall, the ranger lodge, the archery butts and the pond.
  closeWall(-106, -52, -58, -52, 24);
  closeWall(-58, -52, -58, -108, 20);
  building('lodge', -96, -96, 0, 10, 7, { district: 'crown' });
  for (let k = 0; k < 3; k++) put('butt', -68, -100 + k * 5, -PI / 2, { w: 1.6, d: 0.8, h: 1.8 }, 'circle');
  const pond = { x: -82, z: -76, r: 7 };
  put('pondRim', pond.x, pond.z, 0, { w: pond.r * 2, d: pond.r * 2 }, 'none');
  // The harbour mole and its light; ships at anchor in the basin and boats at the wharf.
  put('lighthouse', 150, 45, PI, { w: 8, d: 8, h: 20 }, 'circle');
  for (const [x, z, yaw, v] of [[72, 52, PI / 2, 0], [98, 64, PI / 2 + 0.15, 1], [74, 78, -PI / 2, 2], [126, 60, PI / 2 - 0.3, 1]] as const) put('ship', x, z, yaw, { w: 5, d: 17, h: 14, variant: v }, 'none');
  for (const [x, z, yaw] of [[-92, 78, PI / 2], [-80, 78.5, PI / 2 + 0.2], [-66, 78, PI / 2], [10, 46, 0.1], [-50, 74, -0.2]] as const) put('boat', x, z, yaw, { w: 1.5, d: 4.5 }, 'none');
  // The Aldbridge, and the narrow houses crowding along it.
  put('bridge', bridge.x, (bridge.from + bridge.to) / 2, 0, { w: bridge.width, d: bridge.to - bridge.from, h: bridge.rise }, 'none');
  for (const side of [-1, 1]) {
    for (const z of [47, 54, 66, 73]) {
      put('house', bridge.x + side * (bridge.road / 2 + 1.7), z, side < 0 ? PI / 2 : -PI / 2, { w: 6, d: 3.4, storeys: 2, district: 'oldTown' });
    }
  }
  // Outside the walls: the Gorgegate across the valley road, a windmill, a barn and haystacks in the fields.
  put('gorgegate', gorge.x, -131, PI, { w: 2 * gorge.half + 6, d: 4, h: 12 }, 'none');
  for (const side of [-1, 1]) {
    boxes.push({ x: gorge.x + side * 9, z: -131, hw: 5, hd: 2, yaw: 0 });
  }
  put('windmill', -138, -64, PI / 2, { w: 6, d: 6, h: 14, district: 'fields' }, 'circle');
  building('barn', -142, -84, PI / 2, 9, 14, { storeys: 1, district: 'fields' });
  for (const [x, z] of [[-130, -78], [-126, -86], [-128, -94]] as const) put('haystack', x, z, rand() * PI, { w: 2.6, d: 2.6, h: 2.4, district: 'fields' }, 'circle');

  // ---- Signposts, map boards, lamps and the quays' clutter.
  put('signpost', -118, -20, -PI / 2, { variant: 0, h: 2.6 }, 'circle');
  put('signpost', -42, 34, PI / 4, { variant: 1, h: 2.6 }, 'circle');
  put('signpost', 16, -47, 0, { variant: 2, h: 2.6 }, 'circle');
  put('signpost', -16, 108, PI, { variant: 3, h: 2.6 }, 'circle');
  for (const [x, z, yaw] of [[-104, -8, -PI / 2], [-63, -9, 0], [-14, 106, PI], [60, 18, PI]] as const) put('mapboard', x, z, yaw, { w: 2, d: 0.4, h: 2.2 });
  for (const s of streets) {
    if (s.dirt || s.width < 6) continue;
    for (let i = 8; i < s.line.length - 4; i += 18) {
      const [x, z] = s.line[i];
      const [nx, nz] = s.line[i + 1];
      const len = Math.hypot(nx - x, nz - z) || 1;
      const side = (i / 18) % 2 ? 1 : -1;
      const lx = x + (-(nz - z) / len) * side * (s.width / 2 - 0.5);
      const lz = z + ((nx - x) / len) * side * (s.width / 2 - 0.5);
      if (!insideWalls(lx, lz, 4) || inRiver(lx, lz, 1) || onBridge(lx, lz)) continue;
      put('lamp', lx, lz, 0, { w: 0.3, d: 0.3, h: 3.4 }, 'circle');
    }
  }
  for (const [x, z] of [[-35, -5], [-5, -5], [-82, -12], [95, -14], [-30, 92], [20, 92]] as const) put('lamp', x, z, 0, { w: 0.3, d: 0.3, h: 3.4 }, 'circle');
  const clutter = (x0: number, x1: number, z0: number, z1: number, n: number) => {
    for (let k = 0; k < n; k++) {
      const x = x0 + rand() * (x1 - x0);
      const z = z0 + rand() * (z1 - z0);
      put(rand() < 0.55 ? 'crates' : 'barrels', x, z, rand() * PI, { w: 1.6, d: 1.6, variant: Math.floor(rand() * 3) }, 'circle');
    }
  };
  clutter(56, 74, 15, 22, 4);
  clutter(92, 110, 15, 22, 4);
  clutter(56, 110, 94, 97, 5);
  clutter(-100, -60, 79, 81.5, 4);
  for (let x = 58; x < 112; x += 9) put('bollard', x, 29.2, 0, { w: 0.5, d: 0.5 }, 'circle');
  for (let x = 58; x < 112; x += 9) put('bollard', x, 92.8, 0, { w: 0.5, d: 0.5 }, 'circle');
  // Banners: the crown's on the market and the keep, Corvane's crimson on its house.
  for (const [x, z, yaw, v] of [[-90, -36, PI / 4, 0], [-50, -36, -PI / 4, 0], [-28, -51.6, 0, 1], [40, -53.6, 0, 2], [70, -53.6, 0, 3]] as const) put('banner', x, z, yaw, { h: 6, variant: v }, 'none');
  put('bench', -62, -31, PI, { w: 2, d: 0.6 }, 'none');
  put('bench', -78, -31, PI, { w: 2, d: 0.6 }, 'none');
  put('bench', -90, -70, PI / 2, { w: 2, d: 0.6 }, 'none');
  put('bench', -74, -82, -PI / 2, { w: 2, d: 0.6 }, 'none');

  // ---- The houses: rows along every street inside the walls, fronts to the street.
  for (const s of streets) {
    if (s.dirt) continue;
    for (const side of [-1, 1]) {
      let i = 0;
      while (i < s.line.length - 2) {
        const [x, z] = s.line[i];
        const [nx, nz] = s.line[Math.min(s.line.length - 1, i + 1)];
        const len = Math.hypot(nx - x, nz - z) || 1;
        const tx = (nx - x) / len;
        const tz = (nz - z) / len;
        const ox = -tz * side;
        const oz = tx * side;
        const district = districtAt(x + ox * (s.width / 2 + 4), z + oz * (s.width / 2 + 4));
        const spec = HOUSES[district];
        const w = spec.w[0] + rand() * (spec.w[1] - spec.w[0]);
        const d = spec.d[0] + rand() * (spec.d[1] - spec.d[0]);
        const off = s.width / 2 + 1.4 + d / 2;
        const f = { x: x + tx * (w / 2) + ox * off, z: z + tz * (w / 2) + oz * off, w, d, yaw: Math.atan2(-ox, -oz) };
        if (district !== 'fields' && rand() > 0.08 && plot.fits(f)) {
          plot.claim(f);
          const storeys = Math.round(spec.storeys[0] + rand() * (spec.storeys[1] - spec.storeys[0]));
          const kind: PieceKind = district === 'harbour' && rand() < 0.35 ? 'warehouse' : 'house';
          put(kind, f.x, f.z, f.yaw, { w, d, storeys, district, variant: Math.floor(rand() * 4) });
          i += Math.max(1, Math.round(w + 0.1));
        } else i += 1;
      }
    }
  }

  // Then the blocks behind the rows, filled house against house, each turned to its nearest street.
  const townStreets = streets.filter((s) => !s.dirt);
  for (let round = 0; round < 3; round++) {
    for (let z = land.minZ; z < land.maxZ; z += 2.5) {
      for (let x = land.minX; x < land.maxX; x += 2.5) {
        const px = x + (rand() - 0.5) * 2;
        const pz = z + (rand() - 0.5) * 2;
        if (plot.isTaken(px, pz)) continue;
        const district = districtAt(px, pz);
        if (district === 'fields') continue;
        let best = { d: Infinity, s: townStreets[0], i: 0 };
        for (const s of townStreets) {
          const n = nearestOnPolyline(s.line, px, pz);
          if (n.d < best.d) best = { d: n.d, s, i: n.i };
        }
        const [ax, az] = best.s.line[best.i];
        const [bx, bz] = best.s.line[Math.min(best.s.line.length - 1, best.i + 1)];
        const len = Math.hypot(bx - ax, bz - az) || 1;
        // Square to the street, its front towards it.
        const tx = (bx - ax) / len;
        const tz = (bz - az) / len;
        const side = (px - ax) * -tz + (pz - az) * tx > 0 ? 1 : -1;
        const spec = HOUSES[district];
        const yaw = Math.atan2(tz * side, -tx * side);
        // The district's size if it fits, else its smallest, else a narrow back house.
        const sizes: P2[] = [[spec.w[0] + rand() * (spec.w[1] - spec.w[0]), spec.d[0] + rand() * (spec.d[1] - spec.d[0])], [spec.w[0], spec.d[0]], [5.5, 6], [4.5, 5.5]];
        const f = sizes.map(([w, d]) => ({ x: px, z: pz, w, d, yaw })).find((c) => plot.fits(c));
        if (!f) continue;
        const { w, d } = f;
        plot.claim(f);
        const storeys = Math.round(spec.storeys[0] + rand() * (spec.storeys[1] - spec.storeys[0]));
        const kind: PieceKind = district === 'harbour' && rand() < 0.35 ? 'warehouse' : 'house';
        put(kind, f.x, f.z, f.yaw, { w, d, storeys, district, variant: Math.floor(rand() * 4) });
      }
    }
  }

  // ---- What grows.
  const plants: Omit<CityPlant, 'y'>[] = [];
  const plant = (kind: CityPlantKind, x: number, z: number, scale: number, solid = 0) => {
    plants.push({ kind, x, z, yaw: rand() * PI * 2, scale, seed: Math.floor(rand() * 1e6) });
    if (solid) circles.push({ x, z, r: solid * scale });
  };
  // Plane trees at the market's corners and along the terrace; trees in the close's garden.
  for (const [x, z] of [[-86, -31], [-54, -31], [-86, 1], [-54, 1], [-40, -40], [20, -42], [56, -38]] as const) plant('plane', x, z, 1.05 + rand() * 0.2, 0.45);
  for (let k = 0; k < 7; k++) plant('plane', 14 + k * 7.5 + rand() * 2, -31 + rand() * 3, 0.7 + rand() * 0.2, 0.35);
  for (let k = 0; k < 18; k++) plant('flower', 12 + rand() * 48, -34 + rand() * 6, 0.8 + rand() * 0.4);
  // The King's Garden: old oaks round the pond and along its walls, lawns, flowers.
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * PI * 2 + rand() * 0.3;
    plant('oak', pond.x + Math.sin(a) * (pond.r + 6 + rand() * 3), pond.z + Math.cos(a) * (pond.r + 6 + rand() * 3), 0.9 + rand() * 0.35, 0.45);
  }
  for (const [x, z] of [[-102, -58], [-102, -72], [-64, -58], [-88, -104], [-76, -104], [-104, -86]] as const) plant('oak', x, z, 0.8 + rand() * 0.3, 0.45);
  for (let k = 0; k < 60; k++) {
    const x = -105 + rand() * 46;
    const z = -107 + rand() * 54;
    if (Math.hypot(x - pond.x, z - pond.z) < pond.r + 1) continue;
    plant(rand() < 0.3 ? 'flower' : 'grass', x, z, 0.8 + rand() * 0.5);
  }
  // Outside the walls: hedgerows round the fields, the orchard, gorse up the moor's slope, pines on the gorge's cliffs, reeds on the flats, rocks on the shore.
  const hedge = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    for (let s = 0; s < len; s += 1.7) plant('hedge', ax + ((bx - ax) * s) / len + (rand() - 0.5) * 0.4, az + ((bz - az) * s) / len + (rand() - 0.5) * 0.4, 0.9 + rand() * 0.3);
  };
  hedge(-155, -30, -118, -30);
  hedge(-155, -55, -118, -55);
  hedge(-155, -100, -118, -100);
  hedge(-118, -110, -118, -30);
  hedge(-118, -8, -118, 34);
  hedge(-155, 10, -122, 10);
  for (let x = -152; x < -118; x += 6) for (let z = 84; z < 108; z += 6) plant('orchard', x + (rand() - 0.5), z + (rand() - 0.5), 0.75 + rand() * 0.25, 0.3);
  const scatter = (spacing: number, fn: (x: number, z: number) => void) => {
    for (let z = land.minZ + spacing / 2; z < land.maxZ; z += spacing) for (let x = land.minX + spacing / 2; x < land.maxX; x += spacing) fn(x + (rand() - 0.5) * spacing, z + (rand() - 0.5) * spacing);
  };
  const nearRoad = (x: number, z: number, m: number) => streets.some((s) => nearestOnPolyline(s.line, x, z).d < s.width / 2 + m);
  scatter(5, (x, z) => {
    if (insideWalls(x, z, -4) || inRiver(x, z, 2) || x > shoreAt(z) - 2 || nearRoad(x, z, 1.5)) return;
    const h = cityHeight(x, z);
    if (z < gorge.from - 3 && h > 8) {
      if (Math.abs(x - gorge.x) < gorge.half - 4) return;
      if (rand() < 0.45) plant('pine', x, z, 0.8 + rand() * 0.5, 0.32);
      else if (rand() < 0.3) plant('rock', x, z, 0.8 + rand() * 1.6, 0.6);
    } else if (x < -150 && rand() < 0.3) plant(rand() < 0.6 ? 'bush' : 'rock', x, z, 0.7 + rand() * 0.6);
    else if (z > wall.south + 4 && h < 0.4 && rand() < 0.35) plant('reed', x, z, 0.9 + rand() * 0.5);
    else if (z > ALDHAVEN.land.maxZ - 14 && rand() < 0.6) plant('reed', x, z, 1 + rand() * 0.5);
    else if (x > coast - 6 && z < wall.ne[3] && rand() < 0.4) plant('rock', x, z, 0.8 + rand() * 1.5);
    else if (rand() < 0.4 && h > 0.5) plant('grass', x, z, 0.8 + rand() * 0.6);
    else if (rand() < 0.04 && h > 0.5 && z < wall.south) plant('bush', x, z, 0.7 + rand() * 0.4);
  });

  // ---- Into the world: move everything from the city's frame to its place.
  const ox = at.x;
  const oz = at.z;
  const worldLand = { minX: land.minX + ox, maxX: land.maxX + ox, minZ: land.minZ + oz, maxZ: land.maxZ + oz };
  const cols = Math.round((land.maxX - land.minX) / cell) + 1;
  const rows = Math.round((land.maxZ - land.minZ) / cell) + 1;
  const ground = new HeightGrid(worldLand.minX, worldLand.minZ, cols, rows, cell);
  ground.each((x, z, k) => (ground.data[k] = cityHeight(x - ox, z - oz)));
  const heightAt = (x: number, z: number) => (onBridge(x - ox, z - oz) ? deckHeight(z - oz) : ground.at(x, z));
  const move = (p: P2): P2 => [p[0] + ox, p[1] + oz];

  const walkable = new Walkable(walkableAreas().map((area) => area.map(move)));
  const colliders = new Colliders(walkable);
  for (const b of boxes) colliders.addBox({ ...b, x: b.x + ox, z: b.z + oz });
  for (const c of circles) colliders.addCircle({ ...c, x: c.x + ox, z: c.z + oz });

  const footY = (p: Omit<Piece, 'y'>): number => {
    if (p.kind === 'bridge' || p.kind === 'ship' || p.kind === 'boat' || p.kind === 'waterGate') return ALDHAVEN.water;
    if (p.kind === 'quay') return ALDHAVEN.quay;
    if (onBridge(p.x, p.z)) return deckHeight(p.z);
    if (p.kind === 'wall' || p.kind === 'tower') return Math.min(...Plot.samples(p, 0).map(([x, z]) => local(x, z)));
    // A building stands on the highest corner of its plot, its plinth showing down the slope; a prop on the ground under it.
    if (SMALL.has(p.kind) || p.kind === 'gatehouse' || p.kind === 'gorgegate') return local(p.x, p.z);
    return Math.max(...Plot.samples(p, 0).map(([x, z]) => local(x, z)));
  };
  const placed: Piece[] = pieces.map((p) => ({ ...p, y: footY(p), x: p.x + ox, z: p.z + oz }));
  const grown: CityPlant[] = plants.map((p) => ({ ...p, y: local(p.x, p.z), x: p.x + ox, z: p.z + oz }));
  const TREE_HEIGHT: Partial<Record<CityPlantKind, number>> = { plane: 9, oak: 9, pine: 8, orchard: 4 };
  const trees = grown.filter((p) => TREE_HEIGHT[p.kind]).map((p) => ({ x: p.x, y: p.y, z: p.z, height: (TREE_HEIGHT[p.kind] ?? 0) * p.scale }));

  const surface = (x: number, z: number): Surface => surfaceAt(x - ox, z - oz);
  const landmark = (label: string, x: number, z: number) => ({ label, x: x + ox, z: z + oz });
  return {
    land: worldLand,
    walkable,
    ground,
    streets: streets.map((s) => ({ ...s, line: s.line.map(move) })),
    pieces: placed,
    plants: grown,
    colliders,
    pond: { x: pond.x + ox, z: pond.z + oz, r: pond.r, y: local(pond.x, pond.z) + 0.55 },
    spawn: { x: -146 + ox, z: -21.5 + oz, yaw: -PI / 2 - 0.08 },
    landmarks: [
      landmark('The Kingsroad', -146, -21.5),
      landmark('The Kingsgate', -104, -15),
      landmark('The Great Market', -70, -24),
      landmark('The Cathedral of the Dawn', 0, -15),
      landmark('The keep on Crown Hill', 0, -50),
      landmark('The Crown terrace', 20, -46),
      landmark('Old Town', 0, 22),
      landmark('The Aldbridge', bridge.x, 60),
      landmark('Guild Row', -40, 88),
      landmark('The Long Quay', 80, 20),
      landmark('The harbour light', 128, 31),
      landmark("The King's Garden", -82, -62),
      landmark('The North Gate', 20, -106),
      landmark('The Gorgegate', 25, -121),
      landmark('The Delta causeway', -21, 130),
    ],
    trees,
    surface,
    heightAt,
  };
}

/** What the ground is at (x, z), in the city's frame. */
function surfaceAt(x: number, z: number): Surface {
  const inGarden = (x > -108 && x < -58 && z > -108 && z < -52) || (x > 8 && x < 64 && z > -36 && z < 16);
  const quays = nearestOnPolyline(mole.line, x, z).d < mole.width / 2 + 0.5 || (z > wall.south - 2 && Math.abs(x - causeway.x) < causeway.width / 2 + 0.3);
  const paved = (insideWalls(x, z, -2) && !inGarden) || quays;
  const basalt = paved && districtAt(x, z) === 'oldTown';
  const field = !insideWalls(x, z, -4) && x < wall.west - 6 && x > -158 && (z < river.north - 4 || (z > river.south + 4 && z < wall.south)) && Math.abs(z + 18) > 6;
  return { paved, basalt, garden: inGarden, field };
}

/**
 * Where you can walk, in the city's frame: the north bank (inside and out,
 * to the gorge's cliffs), the valley road up between them, the south bank,
 * the Aldbridge, the mole and the causeway. Convex areas that overlap where
 * they join; the river, the harbour and the sea are outside them all, and
 * the walls keep you to the gates.
 */
function walkableAreas(): P2[][] {
  const { basin } = river;
  const e = 1;
  const westEdge = -150;
  const moleArea = (a: readonly number[], b: readonly number[], half: number): P2[] => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = (-(b[1] - a[1]) / len) * half;
    const nz = ((b[0] - a[0]) / len) * half;
    const ux = ((b[0] - a[0]) / len) * 1;
    const uz = ((b[1] - a[1]) / len) * 1;
    return [
      [a[0] + nx - ux, a[1] + nz - uz],
      [b[0] + nx + ux, b[1] + nz + uz],
      [b[0] - nx + ux, b[1] - nz + uz],
      [a[0] - nx - ux, a[1] - nz - uz],
    ];
  };
  const [m0, m1, m2] = mole.line;
  return [
    // The north bank, from the gorge's cliffs down to the river streets.
    [[westEdge, gorge.from], [70, gorge.from], [108, -90], [coast - e, wall.ne[3]], [coast - e, basin.north - e], [westEdge, basin.north - e]],
    [[westEdge, basin.north - e - 1], [basin.to, basin.north - e - 1], [basin.from, river.north - e], [westEdge, river.north - e]],
    // The valley road, up into the gorge.
    [[gorge.x - 12, gorge.from + 2], [gorge.x + 12, gorge.from + 2], [gorge.x + 12, ALDHAVEN.land.minZ + 4], [gorge.x - 12, ALDHAVEN.land.minZ + 4]],
    // The south bank.
    [[westEdge, river.south + e], [basin.from, river.south + e], [basin.to, basin.south + e + 1], [westEdge, basin.south + e + 1]],
    [[westEdge, basin.south + e], [coast - e, basin.south + e], [coast - e, wall.south - 1], [westEdge, wall.south - 1]],
    // The causeway over the flats.
    [[causeway.x - 3.2, wall.south - 3], [causeway.x + 3.2, wall.south - 3], [causeway.x + 3.2, ALDHAVEN.land.maxZ - 4], [causeway.x - 3.2, ALDHAVEN.land.maxZ - 4]],
    // The Aldbridge's roadway.
    [[bridge.x - bridge.road / 2 + 0.3, river.north - 3], [bridge.x + bridge.road / 2 - 0.3, river.north - 3], [bridge.x + bridge.road / 2 - 0.3, river.south + 3], [bridge.x - bridge.road / 2 + 0.3, river.south + 3]],
    // The mole, out to the harbour light.
    moleArea([coast - 4, m0[1] - (m1[1] - m0[1]) * (4 / (m1[0] - m0[0]))], m1, mole.width / 2 - 0.8),
    moleArea(m1, m2, mole.width / 2 - 0.8),
  ];
}
