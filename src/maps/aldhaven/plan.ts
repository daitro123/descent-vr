import { CONFIG } from '../../config';
import type { PlaceSound, Tree } from '../../world/ambience';
import type { Atmosphere } from '../../world/atmosphere';
import { type Box, Colliders } from '../forest/colliders';
import { fbm, lerp, mulberry32, nearestOnPolyline, type P2, sampleCurve, smoothstep, valueNoise } from '../forest/noise';
import { HeightGrid } from '../heightGrid';
import { KINGSROAD, kingsroadHeight, kingsroadSeam } from '../kingsroad';
import { along, heightsAlong, lineField, smoothHeights } from '../lines';
import { CAUSEWAY, northEdgeHeight } from '../sallows/plan';
import type { Seam, SideSeam, Spot } from '../types';
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
// the end. Its west edge is Brackenmoor's east, along the Kingsroad's seam
// (src/maps/kingsroad.ts); its south edge is the Sallows' north, where the
// causeway runs on. Its seam with Greyfell (the Gorgegate, north) waits for
// that zone.

export const ALDHAVEN = {
  /** Where the city's middle sits in the world: its west edge on Brackenmoor's east (x = 260), its south edge on the Sallows' north (z = 500). */
  at: { x: 420, z: 360 },
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
  /**
   * The Ald above the city: out of the gorge in the north-west, down the
   * valley between the moor's crest and the west wall, and round into the
   * water gate. Its centre line, its half-width, and how wide it opens at the
   * water gate (the city's reach is 32 m across).
   */
  ald: { line: [[-121, -146], [-122, -110], [-123, -60], [-123, -10], [-122, 22], [-119, 38], [-114, 52], [-108, 60]] as const, half: 6.5, mouth: 16 },
  /** The Aldbridge: its roadway's middle, its deck's width, and where it lands on either bank. */
  bridge: { x: -30, width: 14, road: 7, from: 40, to: 80, rise: 1.5 },
  /** The Kingsbridge, the Kingsroad's last stretch over the Ald to the Kingsgate (along X): its ends, its line, its deck's width and heights, and its hump. */
  kingsbridge: { x0: -133, x1: -113.5, z: -15, width: 7.5, y0: 3.9, y1: 3.2, rise: 0.5 },
  /** The mole out to the harbour light: a built stone pier, its top at `height`. */
  mole: { line: [[111, 24], [146, 38], [150, 45]] as const, width: 7, height: 2.4 },
  /**
   * The Delta causeway south over the tidal flats from the south gate, and the
   * flats' depth under the water. It bends south-west to cross into the
   * Sallows where their causeway meets it, at CAUSEWAY.x in the world.
   */
  causeway: { x: -21, width: 8, height: 1.9, line: [[-21, 110], [-21, 121], [-40, 133], [-40, 142]] as const },
  flats: -0.5,
  /**
   * The gorge's mouth in the north-west, where the Ald and the valley road
   * come down out of the Greyspine: its floor's middle and half-width, where
   * the hills along the north edge begin, and how high they rise by the
   * land's edge (the Greyspine's own fells go on up past it, city.ts). The
   * Gorgegate stands across the road at `gate`.
   */
  gorge: { x: -110, half: 19, from: -124, cliff: 13, road: -103, gate: -132 },
  /** Over this many metres in from a seam the land blends to the seam's heights: Brackenmoor's ridge west, the Sallows' fen south. */
  blend: { west: 16, south: 24 },
} as const;

if (ALDHAVEN.causeway.line.at(-1)![0] + ALDHAVEN.at.x !== CAUSEWAY.x) throw new Error("Aldhaven's causeway must cross into the Sallows on theirs");
if (ALDHAVEN.land.minX + ALDHAVEN.at.x !== KINGSROAD.x || ALDHAVEN.land.minZ + ALDHAVEN.at.z !== KINGSROAD.minZ || ALDHAVEN.land.maxZ + ALDHAVEN.at.z !== KINGSROAD.maxZ) {
  throw new Error("Aldhaven's west edge must be the Kingsroad's seam");
}

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
  | 'cathedral' | 'keep' | 'collegium' | 'lighthouse' | 'crane' | 'bridge' | 'kingsbridge' | 'beacon' | 'mole'
  | 'wall' | 'tower' | 'gatehouse' | 'waterGate' | 'gorgegate' | 'quay' | 'lowWall'
  | 'marketCross' | 'stall' | 'lamp' | 'well' | 'statue' | 'grave' | 'butt' | 'dummy' | 'bench'
  | 'crates' | 'barrels' | 'cart' | 'ship' | 'boat' | 'signpost' | 'mapboard' | 'banner' | 'sinkhole' | 'haystack' | 'bollard' | 'pondRim'
  | 'fountain' | 'kerb' | 'tent' | 'bundle' | 'nets' | 'vats' | 'rack' | 'woodpile' | 'shed' | 'sacks' | 'anchor' | 'planter'
  | 'washing';

/** Too small to see from a stand-in's distance. */
export const SMALL: ReadonlySet<PieceKind> = new Set<PieceKind>([
  'stall', 'lamp', 'well', 'statue', 'grave', 'butt', 'dummy', 'bench', 'crates', 'barrels', 'cart', 'boat',
  'signpost', 'mapboard', 'banner', 'sinkhole', 'haystack', 'bollard', 'pondRim',
  'fountain', 'kerb', 'tent', 'bundle', 'nets', 'vats', 'rack', 'woodpile', 'shed', 'sacks', 'anchor', 'planter', 'washing',
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
  /** How far the street in front of a building lies below its floor: it gets steps down to it. */
  readonly drop?: number;
  /** How far down a building's plinth reaches under its floor (a house on the Aldbridge sits on the deck). */
  readonly footing?: number;
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
  /** Its heights along its west edge, the Kingsroad's seam with Brackenmoor (src/maps/kingsroad.ts), which it meets exactly. */
  readonly westSeam: SideSeam;
  /** Its heights along its south edge, the Sallows' north edge, which it meets exactly; the causeway crosses it. */
  readonly southSeam: Seam;
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
  /** The places that sound where they are: the river under the bridges, the water at the quays, the Great Forge, the windmill. */
  readonly sounds: readonly PlaceSound[];
  /** What a point on the ground is: in the walls and paved, which district, a garden, a field. */
  surface(x: number, z: number): Surface;
  heightAt(x: number, z: number): number;
  /** The height of a built deck you walk on at (x, z) (the Aldbridge, the Kingsbridge, the mole), or null off them all. */
  deckAt(x: number, z: number): number | null;
}

/** What the ground is at a point, for its colour. */
export interface Surface {
  readonly paved: boolean;
  /** Old Town's black basalt setts. */
  readonly basalt: boolean;
  readonly garden: boolean;
  readonly field: boolean;
  /** A street's worn middle (paved), rather than a square's or a yard's setts. */
  readonly street: boolean;
  /** A back yard behind the houses: packed earth and grass, not setts. */
  readonly yard: boolean;
}

const PI = Math.PI;
/** The escarpment's foot over the Ald, west (x in the city's frame): the fields lie east of it, its face climbs west. */
const ESCARPMENT = -141.5;
const { river, coast, hill, wall, gates, bridge, kingsbridge, mole, causeway, gorge, ald } = ALDHAVEN;

/** How far (x, z) is from the causeway's line, in the city's frame. */
function offCauseway(x: number, z: number): number {
  return nearestOnPolyline(causeway.line, x, z).d;
}

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

/** How far along the Ald's line each of its points is, as a share of the whole. */
const ALD_ALONG = (() => {
  const out = [0];
  for (let i = 1; i < ald.line.length; i++) out.push(out[i - 1] + Math.hypot(ald.line[i][0] - ald.line[i - 1][0], ald.line[i][1] - ald.line[i - 1][1]));
  return out.map((d) => d / out[out.length - 1]);
})();

/**
 * How far (x, z) lies outside the Ald's banks above the city, negative in
 * the water (in the city's frame). It widens round the bend into the water
 * gate, to meet the city's reach. Only outside the west wall: inside it the
 * city's reach is the river.
 */
export function offAld(x: number, z: number): number {
  if (x > wall.west - 1) return Infinity;
  const n = nearestOnPolyline(ald.line, x, z);
  const along = lerp(ALD_ALONG[n.i], ALD_ALONG[n.i + 1], n.t);
  return n.d - lerp(ald.half, ald.mouth, smoothstep(0.8, 1, along));
}

/** Is (x, z) in the river or the harbour basin (between its banks), or in the Ald above the city? */
function inRiver(x: number, z: number, margin = 0): boolean {
  const reach = x > wall.west - 4 && x < coast + 30 && z > northEdge(x) - margin && z < southEdge(x) + margin;
  return reach || offAld(x, z) < margin;
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
  // The Kingsgate's way in, level with the Kingsbridge's east end.
  h = lerp(h, kingsbridge.y1, smoothstep(15, 7, Math.hypot(x - gates.kingsgate.x, (z - gates.kingsgate.z) * 1.3)));
  // The hills along the north edge, the Greyspine's feet, and the gorge the Ald and the valley road come down out of, in the north-west.
  // Their toe wanders a little; they rise more steeply as they go, to the land's edge.
  const toe = gorge.from - 3 * fbm(x * 0.04, 3, 219);
  const t = Math.min(1, Math.max(0, (toe - z) / (toe - land.minZ)));
  const hills = t * t * (1.6 - 0.6 * t);
  const floor = smoothstep(gorge.half, gorge.half - 8, Math.abs(x - gorge.x));
  h += hills * (gorge.cliff * (1 - floor) * (0.8 + 0.4 * fbm(x * 0.05, z * 0.05, 205)) + 1.6 * floor);
  // The south bank is low and flat; past the south wall, the tidal flats under a hand of water.
  if (z > southEdge(x)) h = lerp(h, ALDHAVEN.quay + (fbm(x * 0.03, z * 0.03, 207) - 0.5) * 0.4, smoothstep(southEdge(x), southEdge(x) + 6, z) * (x > wall.west ? 1 : 0.4));
  if (z > wall.south + 1.5) h = lerp(h, ALDHAVEN.flats, smoothstep(wall.south + 1.5, wall.south + 4, z));
  // A reed bank along the land's south edge, low dunes, so the flats' end is a shore.
  h += 1.4 * smoothstep(land.maxZ - 14, land.maxZ, z) * smoothstep(wall.south, wall.south + 6, z);
  // Over the Ald, west, the moor's escarpment: the fields rise gently from the river to its foot, then its face climbs
  // steeply to the crest, on down to the flats (its last stretch blends to the Kingsroad seam's ridge, src/maps/kingsroad.ts).
  h += (1.6 * smoothstep(-129, ESCARPMENT, x) + 15 * smoothstep(ESCARPMENT, -162, x)) * (0.85 + 0.3 * fbm(x * 0.03, z * 0.03, 203));
  // The river: the city's reach between quay walls, from the water gate to the sea; the Ald above it between grassy banks.
  const n = northEdge(x);
  const s = southEdge(x);
  const reach = smoothstep(n, n + 2, z) * smoothstep(s, s - 2, z) * smoothstep(wall.west - 8, wall.west - 3, x);
  const upper = smoothstep(3.5, -1.5, offAld(x, z));
  h = lerp(h, river.bed + (fbm(x * 0.1, z * 0.1, 209) - 0.5) * 0.6, Math.max(reach, upper));
  // The sea.
  const shore = shoreAt(z);
  h = lerp(h, -5 - smoothstep(shore, shore + 40, x) * 3, smoothstep(shore - (z < wall.ne[3] - 4 ? 4 : 0), shore + 2, x));
  // The causeway, raised over the flats. (The mole is built, on the sea bed.)
  if (z > wall.south - 2) h = lerp(h, causeway.height, smoothstep(causeway.width / 2 + 1.5, causeway.width / 2, offCauseway(x, z)));
  return h;
}

/** The Aldbridge's deck height at z along it (it humps over the river). */
export function deckHeight(z: number): number {
  const t = Math.min(1, Math.max(0, (z - bridge.from) / (bridge.to - bridge.from)));
  return ALDHAVEN.quay + bridge.rise * Math.sin(PI * t);
}

/** The Kingsbridge's deck height at x along it: down from the west bank to the Kingsgate, humped over the Ald. */
export function kingsDeck(x: number): number {
  const { x0, x1, y0, y1, rise } = kingsbridge;
  const t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
  return lerp(y0, y1, t) + rise * Math.sin(PI * t);
}

/** Is (x, z) on the Aldbridge's deck? */
function onBridge(x: number, z: number): boolean {
  return Math.abs(x - bridge.x) <= bridge.width / 2 && z >= bridge.from && z <= bridge.to;
}

/** Is (x, z) on the Kingsbridge's deck? */
function onKingsbridge(x: number, z: number): boolean {
  return x >= kingsbridge.x0 && x <= kingsbridge.x1 && Math.abs(z - kingsbridge.z) <= kingsbridge.width / 2;
}

/** The mole's round head under the harbour light. */
const MOLE_HEAD = { r: 6.5 } as const;

/** Is (x, z) on the mole (out past the sea wall), or its head? */
function onMole(x: number, z: number): boolean {
  if (x < coast - 0.5) return false;
  const [hx, hz] = mole.line[mole.line.length - 1];
  return nearestOnPolyline(mole.line, x, z).d <= mole.width / 2 || Math.hypot(x - hx, z - hz) <= MOLE_HEAD.r;
}

/** The height of the deck you'd stand on at (x, z) in the city's frame (a bridge, the mole), or null. */
function deckAtCity(x: number, z: number): number | null {
  if (onBridge(x, z)) return deckHeight(z);
  if (onKingsbridge(x, z)) return kingsDeck(x);
  if (onMole(x, z)) return mole.height;
  return null;
}

// ------------------------------------------------------------------ streets

/** The streets and roads, in the city's frame: [points, width, dirt?]. */
const STREETS: readonly (readonly [readonly P2[], number, boolean?])[] = [
  // The Kingsroad, from the moor's crest down to the Kingsbridge, over the Ald to the Kingsgate, and in through it to the market.
  [[[-162, -24], [-151, -22.6], [-141, -18.6], [-134, -15.3], [-124, -15], [-113, -15], [-108, -15]], 5.5, true],
  [[[-112, -15], [-90, -15]], 7],
  // The farm track off it, down the Ald's west bank to the barn and the windmill in the river's bend.
  [[[-136, -16], [-136.5, -4], [-136, 24], [-133, 50], [-129.5, 70], [-127, 88]], 3, true],
  // High Street, the market to the cathedral's west gate.
  [[[-50, -15], [-20, -16], [6, -15]], 7],
  // The Crown terrace: from the market up round the hill's south face and down to the harbour.
  [[[-52, -36], [-30, -44], [0, -46], [40, -44], [72, -40], [90, -26], [96, -10]], 7],
  // Up to the keep's gate.
  [[[0, -46], [0, -63]], 6],
  // North Street, from the terrace to the North Gate, and out of it as the valley road: west under the north wall, and up the Ald's east bank into the gorge, through the Gorgegate.
  [[[20, -45], [25, -72], [22, -98], [20, -114]], 6],
  [[[20, -110], [20, -118], [10, -121], [-30, -121.5], [-70, -121], [-92, -121.5], [-101, -125], [-103, -132], [-103, -143]], 5, true],
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
  // The Delta causeway, paved, south over the flats and bending to meet the Sallows' causeway.
  [[[-21, 112], ...causeway.line.slice(1)], 6],
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
  // The harbour: east of the close, and the Long Quay along the basin's north side.
  if (x > 64 || (x > 50 && z > 12)) return 'harbour';
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

  // ---- The ground first: the city's own, blended at its edges to its neighbours', the roads outside the walls laid into it.
  const ox = at.x;
  const oz = at.z;
  const worldLand = { minX: land.minX + ox, maxX: land.maxX + ox, minZ: land.minZ + oz, maxZ: land.maxZ + oz };
  const cols = Math.round((land.maxX - land.minX) / cell) + 1;
  const rows = Math.round((land.maxZ - land.minZ) / cell) + 1;
  const ground = new HeightGrid(worldLand.minX, worldLand.minZ, cols, rows, cell);
  ground.each((x, z, k) => (ground.data[k] = cityHeight(x - ox, z - oz)));
  // The edges blend to the neighbours' heights, so the zones agree exactly on their lines.
  meetWest(ground);
  meetSouth(ground);
  layRoads(ground, streets);
  // What stands and grows stands on the ground as it ends up (or on a bridge's deck, or the mole), in the city's frame.
  const ground0 = (x: number, z: number) => deckAtCity(x, z) ?? ground.at(x + ox, z + oz);

  // ---- Where houses may not stand, and where the paved streets' worn middles run.
  const plot = new Plot(land.minX, land.minZ, land.maxX, land.maxZ);
  plot.mark(land.minX, land.maxX, land.minZ, land.maxZ, (x, z) => !insideWalls(x, z, wall.thick / 2 + 0.6) || inRiver(x, z, 1.5) || (Math.abs(x - bridge.x) < bridge.width / 2 + 1 && z > 30 && z < 90));
  const worn = new Plot(land.minX, land.minZ, land.maxX, land.maxZ);
  for (const s of streets) {
    const r = s.width / 2 + 0.4;
    for (const [px, pz] of s.line) plot.mark(px - r, px + r, pz - r, pz + r, (x, z) => Math.hypot(x - px, z - pz) < r);
    if (s.dirt) continue;
    const m = s.width / 2 - 1;
    for (const [px, pz] of s.line) worn.mark(px - m, px + m, pz - m, pz + m, (x, z) => Math.hypot(x - px, z - pz) < m);
  }
  for (const [x0, x1, z0, z1] of OPEN) plot.mark(x0, x1, z0, z1, () => true);
  for (const [cx, cz, r] of OPEN_ROUND) plot.mark(cx - r, cx + r, cz - r, cz + r, (x, z) => Math.hypot(x - cx, z - cz) < r);

  const pieces: Omit<Piece, 'y'>[] = [];
  /** Where something solid already stands, squares and quays included: so the clutter doesn't pile up on itself. */
  const taken = new Plot(land.minX, land.minZ, land.maxX, land.maxZ);
  const boxes: Box[] = [];
  const circles: { x: number; z: number; r: number }[] = [];
  let seed = 1;
  const put = (kind: PieceKind, x: number, z: number, yaw: number, o: Partial<Omit<Piece, 'kind' | 'x' | 'z' | 'yaw' | 'y'>> = {}, solid: 'box' | 'circle' | 'none' = 'box') => {
    const p = { kind, x, z, yaw, w: o.w ?? 1, d: o.d ?? 1, h: o.h ?? 0, storeys: o.storeys ?? 1, variant: o.variant ?? 0, district: o.district ?? districtAt(x, z), seed: o.seed ?? seed++, footing: o.footing };
    pieces.push(p);
    if (solid !== 'none' && kind !== 'wall' && kind !== 'tower') plot.claim({ x, z, w: p.w, d: p.d, yaw });
    if (solid !== 'none') taken.claim({ x, z, w: p.w, d: p.d, yaw });
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
  // The Great Market: the Gilded Gull on the north side; the bank and the Exchange on the south; the
  // market cross in the middle ringed by stalls, more stalls along the sides, and carts and goods between.
  building('inn', -70, -44, 0, 16, 11, { storeys: 3, variant: 0, district: 'market' });
  building('hall', -82, 13, PI, 14, 11, { storeys: 2, variant: 1, district: 'market' });
  building('hall', -58, 13, PI, 14, 11, { storeys: 2, variant: 2, district: 'market' });
  put('marketCross', -70, -15, 0, { w: 5, d: 5, h: 8 }, 'circle');
  let stalls = 0;
  const stall = (x: number, z: number, yaw: number) => {
    put('stall', x, z, yaw, { w: 3.6, d: 2.4, h: 2.8, variant: stalls++ });
    // The stallholder's stock behind it.
    const bx = x - Math.sin(yaw) * 2.1 + Math.cos(yaw) * (rand() - 0.5) * 2;
    const bz = z - Math.cos(yaw) * 2.1 - Math.sin(yaw) * (rand() - 0.5) * 2;
    put(['crates', 'barrels', 'sacks'][Math.floor(rand() * 3)] as PieceKind, bx, bz, rand() * PI, { w: 1.2, d: 1.2, variant: Math.floor(rand() * 3) }, 'circle');
  };
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * PI * 2 + PI / 8;
    stall(-70 + Math.sin(a) * 12.5, -15 + Math.cos(a) * 12.5, a + PI);
  }
  for (const x of [-81, -76, -64, -59]) stall(x, -31, 0);
  for (const z of [-27, -21.5, -8.5, -3]) {
    stall(-88, z, PI / 2);
    stall(-52, z, -PI / 2);
  }
  put('cart', -77, 1.5, 0.3, { w: 1.6, d: 3 });
  put('cart', -63, 0.5, -0.5, { w: 1.6, d: 3 });
  for (const [x, z] of [[-65, -10], [-75, -10], [-65, -20], [-75, -20]] as const) put('lamp', x, z, 0, { w: 0.3, d: 0.3, h: 3.4 }, 'circle');
  // Inside the Kingsgate: the Watch house, the coaching yard's stables across the way, a trough for the horses.
  building('hall', -100, -27, 0, 12, 8, { storeys: 2, variant: 3, district: 'market' });
  building('stables', -100, 6, PI, 14, 7);
  put('cart', -96, -2, 0.4, { w: 1.6, d: 3 });
  put('fountain', -104, -21, PI / 2, { w: 3.2, d: 1.4, h: 1.6 });
  put('haystack', -106, 1, 0.4, { w: 2, d: 2, h: 1.8 }, 'circle');
  put('barrels', -94, 3, 0.2, { w: 1.2, d: 1.2 }, 'circle');
  // Old Town: the Lamplit Collegium's tower, the Drowned Lamp, the old well and the fenced-off sinkhole.
  building('collegium', 10, 29, PI, 12, 9, { h: 30, district: 'oldTown' });
  building('inn', 40, 30, PI, 12, 9, { storeys: 3, variant: 1, district: 'oldTown' });
  put('well', 22, 29, 0, { w: 2.2, d: 2.2, h: 2.6 }, 'circle');
  put('sinkhole', -14, 30, 0.3, { w: 6, d: 6 }, 'circle');
  // Guild Row: the Great Forge and the Apothecaries' Hall face the river.
  building('forge', -60, 93, PI, 16, 7.5, { district: 'guild' });
  building('hall', -5, 93, PI, 14, 7.5, { storeys: 2, variant: 4, district: 'guild' });
  // The harbour: warehouses on both quays, the treadwheel crane on the Long Quay.
  for (const [x, w] of [[59, 12], [72, 12], [95.5, 10], [106, 10]] as const) building('warehouse', x, 6, 0, w, 12, { storeys: 2, variant: x % 3 });
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
  for (const [x, z, yaw] of [[-92, 72.5, PI / 2], [-80, 73, PI / 2 + 0.2], [-66, 72.5, PI / 2], [10, 47, 0.1], [-50, 71, -0.2], [104, 34.5, PI / 2 - 0.1], [60, 89, -PI / 2], [-58, 47.4, PI / 2 + 0.08], [-14, 47.2, PI / 2 - 0.06], [24, 72.7, -PI / 2 + 0.1], [-4, 72.9, PI / 2], [64, 33.2, PI / 2 + 0.05], [92, 88.7, -PI / 2 + 0.12]] as const) put('boat', x, z, yaw, { w: 1.5, d: 4.5 }, 'none');
  // A river barge at the wharf, and a ship alongside the Long Quay under the crane's jib.
  put('boat', -100, 71.5, PI / 2, { w: 3.4, d: 11, variant: 1 }, 'none');
  put('ship', 82, 35, PI / 2, { w: 5, d: 17, h: 14, variant: 2 }, 'none');
  // The Aldbridge, and the narrow houses crowding along it.
  put('bridge', bridge.x, (bridge.from + bridge.to) / 2, 0, { w: bridge.width, d: bridge.to - bridge.from, h: bridge.rise }, 'none');
  for (const side of [-1, 1]) {
    for (const z of [47, 54, 66, 73]) {
      put('house', bridge.x + side * (bridge.road / 2 + 1.7), z, side < 0 ? PI / 2 : -PI / 2, { w: 6, d: 3.4, storeys: 2, district: 'oldTown', footing: 0.9 });
    }
  }
  // ---- Outside the walls.
  // The Kingsbridge: the Kingsroad's last stretch, over the Ald to the Kingsgate.
  put('kingsbridge', (kingsbridge.x0 + kingsbridge.x1) / 2, kingsbridge.z, 0, { w: kingsbridge.x1 - kingsbridge.x0, d: kingsbridge.width, h: kingsbridge.rise, district: 'fields' }, 'none');
  // Westwatch: the ruined beacon tower on the moor's last crest, over the Kingsroad, looking down on the city.
  put('beacon', -151, -41, PI / 2, { w: 6, d: 6, h: 9, district: 'fields' }, 'circle');
  // The Gorgegate across the valley road where the Ald comes out of the gorge, its west tower on the river's bank and a chain
  // boom across the water to the far side. Shut for now: the road north waits on Greyfell.
  put('gorgegate', gorge.road, gorge.gate, PI, { w: 26, d: 5, h: 12, district: 'fields' }, 'none');
  boxes.push({ x: gorge.road, z: gorge.gate, hw: 13, hd: 2.5, yaw: 0 });
  // A windmill, a barn at the farm track's end and haystacks on the land in the river's bend.
  put('windmill', -118, 97, PI / 2, { w: 6, d: 6, h: 14, district: 'fields' }, 'circle');
  building('barn', -131, 99.5, PI, 9, 14, { storeys: 1, district: 'fields' });
  for (const [x, z] of [[-138.5, 89], [-139.5, 95.5], [-122, 106]] as const) put('haystack', x, z, rand() * PI, { w: 2.6, d: 2.6, h: 2.4, district: 'fields' }, 'circle');
  put('cart', -124.5, 92, 2.2, { w: 1.6, d: 3, district: 'fields' });
  put('woodpile', -137.5, 103, PI / 2, { w: 3.2, d: 1.4, h: 1.2, district: 'fields' });
  // The mole, built out from the sea wall to the harbour light's round head.
  for (let k = 0; k < mole.line.length - 1; k++) {
    const [ax, az] = mole.line[k];
    const [bx, bz] = mole.line[k + 1];
    const from = k === 0 ? (coast - ax) / (bx - ax) : 0;
    const [sx, sz] = [ax + (bx - ax) * from, az + (bz - az) * from];
    const len = Math.hypot(bx - sx, bz - sz);
    put('mole', (sx + bx) / 2, (sz + bz) / 2, Math.atan2(bx - sx, bz - sz), { w: mole.width, d: len + (k === 0 ? 0.6 : 0.3), district: 'harbour' }, 'none');
  }
  {
    const [hx, hz] = mole.line[mole.line.length - 1];
    put('mole', hx, hz, 0, { w: MOLE_HEAD.r * 2, d: MOLE_HEAD.r * 2, variant: 1, district: 'harbour' }, 'none');
  }

  // ---- Signposts, map boards, lamps and the quays' clutter.
  put('signpost', -137, -20.5, -PI / 2, { variant: 0, h: 2.6 }, 'circle');
  put('signpost', 27, -117.5, PI, { variant: 0, h: 2.6 }, 'circle');
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
  /** Goods piled on a quay or a wharf: crates, barrels and sacks, `n` heaps scattered over the box, none on another. */
  const cargo = (x0: number, x1: number, z0: number, z1: number, n: number, kinds: readonly PieceKind[] = ['crates', 'barrels', 'sacks']) => {
    for (let k = 0, tries = 0; k < n && tries < n * 8; tries++) {
      const x = x0 + rand() * (x1 - x0);
      const z = z0 + rand() * (z1 - z0);
      if (!taken.fits({ x, z, w: 2.2, d: 2.2, yaw: 0 })) continue;
      put(kinds[Math.floor(rand() * kinds.length)], x, z, rand() * PI, { w: 1.4, d: 1.4, variant: Math.floor(rand() * 3) }, 'circle');
      k++;
    }
  };
  // The Long Quay: cargo stacked between the warehouses and the water, nets drying, an anchor, the fish market's stalls.
  cargo(54, 76, 14, 21, 7);
  cargo(90, 111, 14, 20, 6);
  for (const x of [60, 66]) put('nets', x, 24, 0, { w: 3.2, d: 0.4, h: 2.2 });
  put('anchor', 99, 25.5, 0.3, { w: 1.6, d: 1.0 }, 'circle');
  for (const x of [94, 100, 106]) put('stall', x, 18.5, PI, { w: 3.6, d: 2.4, h: 2.8, variant: 3 + (x % 3) });
  // The south quay.
  cargo(54, 111, 93.5, 97.5, 8);
  put('nets', 70, 94, PI, { w: 3.2, d: 0.4, h: 2.2 });
  put('cart', 96, 97, PI / 2 + 0.2, { w: 1.6, d: 3 });
  // Guild Row's wharf along the river: goods for the barges, the tanners' racks, the dyers' vats, timber for the joiners.
  cargo(-104, -60, 77.5, 81.5, 7);
  cargo(-12, 36, 77.5, 81.5, 5, ['crates', 'barrels']);
  for (const x of [-10, -4]) put('rack', x, 80.5, PI, { w: 3, d: 0.6, h: 2.2 });
  put('vats', 6, 79.8, 0, { w: 4.2, d: 2, h: 1 });
  put('vats', 20, 79.8, 0, { w: 4.2, d: 2, h: 1, variant: 1 });
  put('woodpile', 30, 80.2, 0, { w: 4, d: 1.6, h: 1.4 });
  put('woodpile', -52, 80.2, 0, { w: 3.2, d: 1.6, h: 1.2 });
  // Mooring bollards along the quays' edges.
  for (let x = 58; x < 112; x += 9) put('bollard', x, 29.2, 0, { w: 0.5, d: 0.5 }, 'circle');
  for (let x = 58; x < 112; x += 9) put('bollard', x, 92.8, 0, { w: 0.5, d: 0.5 }, 'circle');
  for (const x of [-104, -84, -64, -10, 10, 30]) put('bollard', x, 76.9, 0, { w: 0.5, d: 0.5 }, 'circle');
  // Lamps along the quays' edges, so the water's edge reads at dusk.
  for (let x = 62; x < 112; x += 16) {
    put('lamp', x, 28.6, PI, { w: 0.3, d: 0.3, h: 3.4 }, 'circle');
    put('lamp', x + 8, 93.4, 0, { w: 0.3, d: 0.3, h: 3.4 }, 'circle');
  }
  for (const x of [-96, -72, -6, 16]) put('lamp', x, 77.6, 0, { w: 0.3, d: 0.3, h: 3.4 }, 'circle');
  // Outside the North Gate, under the wall: the first refugees from the north, a few shelters and their bundles.
  for (const [x, z, yaw] of [[-2, -116, 0.1], [5, -115.8, -0.15], [34, -116.2, 0.05]] as const) put('tent', x, z, yaw, { w: 3, d: 2.4, h: 1.8, district: 'fields' });
  for (const [x, z] of [[1.5, -117.4], [8.5, -116.8], [30.5, -117], [37, -117.6], [12, -116]] as const) put('bundle', x, z, rand() * PI, { w: 1, d: 1, district: 'fields' }, 'circle');
  // Banners: the crown's on the market and the keep, Corvane's crimson on its house.
  for (const [x, z, yaw, v] of [[-90, -36, PI / 4, 0], [-50, -36, -PI / 4, 0], [-28, -51.6, 0, 1], [40, -53.6, 0, 2], [70, -53.6, 0, 3]] as const) put('banner', x, z, yaw, { h: 6, variant: v }, 'none');
  // Benches under the plane trees and in the gardens.
  for (const [x, z, yaw] of [[-86, -27.5, PI], [-54, -27.5, PI], [-90, -70, PI / 2], [-74, -82, -PI / 2], [-96, -60, PI], [20, -24, -PI / 2], [30, 10, PI]] as const) put('bench', x, z, yaw, { w: 2, d: 0.6 }, 'none');

  // ---- The houses: rows along every street inside the walls, fronts to the street.
  /** The row houses' doors, for what stands outside them (see below). */
  const doors: { x: number; z: number; yaw: number; w: number; d: number; door: number; district: District; street: Street }[] = [];
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
          const variant = Math.floor(rand() * 4);
          put(kind, f.x, f.z, f.yaw, { w, d, storeys, district, variant });
          if (kind === 'house') doors.push({ ...f, door: ((variant % 3) - 1) * (w / 4), district, street: s });
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

  // ---- Outside the row houses' doors, beside them: the household's barrels, a crate, a planter, a bench to sit out on, sacks
  // at a shop's. Kept to the strip between the street and the house front. Their own dice, so the city's layout stands.
  const dress = mulberry32(4211);
  for (const h of doors) {
    if (dress() > 0.45) continue;
    const [fx, fz] = [Math.sin(h.yaw), Math.cos(h.yaw)];
    const [ax, az] = [Math.cos(h.yaw), -Math.sin(h.yaw)];
    // Beside the door, on the side with the more wall.
    const side = h.door > 0 ? -1 : h.door < 0 ? 1 : dress() < 0.5 ? -1 : 1;
    const along = h.door + side * (1.7 + dress() * Math.max(0, h.w / 2 - Math.abs(h.door) - 2.6));
    const out = h.d / 2 + 0.6;
    const [x, z] = [h.x + fx * out + ax * along, h.z + fz * out + az * along];
    if (nearestOnPolyline(h.street.line, x, z).d < h.street.width / 2 + 0.3 || !taken.fits({ x, z, w: 1, d: 0.8, yaw: h.yaw })) continue;
    const r = dress();
    const shop = h.district === 'market' || h.district === 'guild';
    if (r < 0.3) put('barrels', x, z, h.yaw, { w: 0.9, d: 0.9, variant: Math.floor(dress() * 3) }, 'circle');
    else if (r < 0.5) put(shop ? 'sacks' : 'crates', x, z, h.yaw, { w: 0.9, d: 0.9, variant: Math.floor(dress() * 3) }, 'circle');
    else if (r < 0.75 && h.district !== 'harbour') put('planter', x, z, h.yaw, { w: 1.4, d: 0.6, h: 0.5, variant: Math.floor(dress() * 3) });
    else put('bench', x, z, h.yaw, { w: 1.6, d: 0.5 }, 'none');
  }

  // ---- Kerbs along the wider streets' edges, where they pass between houses: a pale line of stone, so a street reads apart
  // from a square. Not across another street's mouth, a square, a bridge or the river.
  const inOpen = (x: number, z: number) => OPEN.some(([x0, x1, z0, z1]) => x > x0 - 1 && x < x1 + 1 && z > z0 - 1 && z < z1 + 1);
  for (const s of streets) {
    if (s.dirt || s.width < 5) continue;
    const others = streets.filter((o) => o !== s && !o.dirt);
    for (const side of [-1, 1]) {
      for (let i = 2; i + 3 < s.line.length - 2; i += 3) {
        const [ax, az] = s.line[i];
        const [bx, bz] = s.line[i + 3];
        const len = Math.hypot(bx - ax, bz - az) || 1;
        const [nx, nz] = [(-(bz - az) / len) * side, ((bx - ax) / len) * side];
        const off = s.width / 2 + 0.15;
        const [x, z] = [(ax + bx) / 2 + nx * off, (az + bz) / 2 + nz * off];
        const ends: P2[] = [[ax + nx * off, az + nz * off], [bx + nx * off, bz + nz * off]];
        if (!insideWalls(x, z, 3) || inRiver(x, z, 2) || deckAtCity(x, z) !== null || inOpen(x, z)) continue;
        if (ends.some(([ex, ez]) => others.some((o) => nearestOnPolyline(o.line, ex, ez).d < o.width / 2 + 0.8) || inOpen(ex, ez))) continue;
        if (Math.abs(ground0(...ends[0]) - ground0(...ends[1])) > 0.3 || !taken.fits({ x, z, w: len - 0.4, d: 0.3, yaw: Math.atan2(nx, nz) })) continue;
        put('kerb', x, z, Math.atan2(nx, nz), { w: len + 0.05, d: 0.3 }, 'none');
      }
    }
  }

  // ---- What grows.
  const plants: Omit<CityPlant, 'y'>[] = [];
  const plant = (kind: CityPlantKind, x: number, z: number, scale: number, solid = 0) => {
    plants.push({ kind, x, z, yaw: rand() * PI * 2, scale, seed: Math.floor(rand() * 1e6) });
    if (solid) circles.push({ x, z, r: solid * scale });
  };

  // ---- The back yards: what's left between the houses, behind the rows, each with a shed, a woodpile, a tree, a cart or the
  // household's barrels, or left bare. Their ground is packed earth and grass, not setts (see `surface`).
  for (let z = land.minZ + 1.5; z < land.maxZ; z += 3) {
    for (let x = land.minX + 1.5; x < land.maxX; x += 3) {
      const px = x + (rand() - 0.5);
      const pz = z + (rand() - 0.5);
      if (!insideWalls(px, pz, 4)) continue;
      const f = { x: px, z: pz, w: 2.8, d: 2.8, yaw: 0 };
      if (!plot.fits(f)) continue;
      const yaw = Math.floor(rand() * 4) * (PI / 2) + (rand() - 0.5) * 0.2;
      const r = rand();
      if (r < 0.2) {
        plot.claim(f);
        plant('plane', px, pz, 0.5 + rand() * 0.2, 0.3);
      } else if (r < 0.36) put('shed', px, pz, yaw, { w: 2.6, d: 2, h: 2.3, variant: Math.floor(rand() * 3) });
      else if (r < 0.5) put('woodpile', px, pz, yaw, { w: 2.4, d: 1.2, h: 1.1 });
      else if (r < 0.66) put(rand() < 0.5 ? 'barrels' : 'crates', px, pz, yaw, { w: 1.4, d: 1.4, variant: Math.floor(rand() * 3) }, 'circle');
      else if (r < 0.72) put('cart', px, pz, yaw, { w: 1.6, d: 3 });
      else if (r < 0.8) put('planter', px, pz, yaw, { w: 2.2, d: 1, h: 0.6, variant: Math.floor(rand() * 3) });
      else plot.claim(f);
    }
  }
  // What's still open between the houses, and not a street's or a square's, nor on a street's frontage: a yard.
  const frontage = new Plot(land.minX, land.minZ, land.maxX, land.maxZ);
  for (const s of streets) {
    if (s.dirt) continue;
    const r = s.width / 2 + 2.5;
    for (const [px, pz] of s.line) frontage.mark(px - r, px + r, pz - r, pz + r, (x, z) => Math.hypot(x - px, z - pz) < r);
  }
  const yards = new Uint8Array(plot.taken.length);
  for (let j = 1; j < plot.rows - 1; j++) {
    for (let i = 1; i < plot.cols - 1; i++) {
      if (frontage.taken[j * plot.cols + i]) continue;
      let open = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) open += plot.taken[(j + dj) * plot.cols + i + di] ? 0 : 1;
      if (open >= 6) yards[j * plot.cols + i] = 1;
    }
  }
  for (const p of pieces) {
    // Under the sheds, the woodpiles and the yards' clutter, too.
    if (p.kind !== 'shed' && p.kind !== 'woodpile' && p.kind !== 'planter' && p.kind !== 'cart') continue;
    for (const [x, z] of Plot.samples(p, 1)) {
      const [i, j] = [Math.floor(x - land.minX), Math.floor(z - land.minZ)];
      if (i >= 0 && j >= 0 && i < plot.cols && j < plot.rows) yards[j * plot.cols + i] = 1;
    }
  }

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
  // Outside the walls: hedgerows round the fields up the west bank and in the river's bend, the orchard, gorse up the moor's
  // crest, reeds along the Ald, pines on the Greyspine's feet and in the gorge, reeds on the flats, rocks on the shore.
  const nearRoad = (x: number, z: number, m: number) => streets.some((s) => nearestOnPolyline(s.line, x, z).d < s.width / 2 + m);
  const hedge = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    for (let s = 0; s < len; s += 1.7) {
      const [x, z] = [ax + ((bx - ax) * s) / len + (rand() - 0.5) * 0.4, az + ((bz - az) * s) / len + (rand() - 0.5) * 0.4];
      if (!nearRoad(x, z, 1) && offAld(x, z) > 2) plant('hedge', x, z, 0.9 + rand() * 0.3);
    }
  };
  // The fields' hedges: along the escarpment's foot, across the strips down to the river, flanking the road.
  hedge(ESCARPMENT, -106, ESCARPMENT, -31);
  hedge(ESCARPMENT, -8, ESCARPMENT, 34);
  for (const z of [-100, -72, -46, 8]) hedge(ESCARPMENT, z, -131.5, z);
  hedge(-147, -29, -139, -25.5);
  hedge(-146, -11.5, -139.5, -11);
  hedge(ESCARPMENT, 82, -131, 82);
  // The orchard below the escarpment, west of the bend.
  for (const x of [-139.5, -135.5, -131.5]) {
    for (let z = 38; z < 80; z += 5.5) {
      const [px, pz] = [x + (rand() - 0.5), z + (rand() - 0.5)];
      if (offAld(px, pz) > 3.5 && !nearRoad(px, pz, 1.8)) plant('orchard', px, pz, 0.75 + rand() * 0.25, 0.3);
    }
  }
  // The first pines at the gorge's mouth, by the valley road.
  for (const [x, z] of [[-95, -127], [-93, -134], [-97, -139], [-115.5, -138]] as const) plant('pine', x, z, 0.9 + rand() * 0.3, 0.32);
  const scatter = (spacing: number, fn: (x: number, z: number) => void) => {
    for (let z = land.minZ + spacing / 2; z < land.maxZ; z += spacing) for (let x = land.minX + spacing / 2; x < land.maxX; x += spacing) fn(x + (rand() - 0.5) * spacing, z + (rand() - 0.5) * spacing);
  };
  const nearPiece = (x: number, z: number) => !taken.fits({ x, z, w: 1.2, d: 1.2, yaw: 0 });
  scatter(5, (x, z) => {
    if (insideWalls(x, z, -4) || inRiver(x, z, 1.2) || x > shoreAt(z) - 2 || nearRoad(x, z, 1.5) || deckAtCity(x, z) !== null || nearPiece(x, z)) return;
    const h = ground0(x, z);
    const bank = offAld(x, z);
    if (z < gorge.from - 2 && h > 7) {
      if (rand() < 0.5) plant('pine', x, z, 0.8 + rand() * 0.5, 0.32);
      else if (rand() < 0.3) plant('rock', x, z, 0.8 + rand() * 1.6, 0.6);
    } else if (bank < 3.5) {
      if (rand() < 0.55) plant('reed', x, z, 0.9 + rand() * 0.5);
      else if (rand() < 0.1 && bank > 1.8 && z > gorge.from) plant('oak', x, z, 0.55 + rand() * 0.2, 0.35);
    } else if (x < ESCARPMENT + 1) {
      if (rand() < 0.35) plant(rand() < 0.65 ? 'bush' : 'rock', x, z, 0.7 + rand() * 0.6);
      else if (rand() < 0.5) plant('grass', x, z, 0.8 + rand() * 0.6);
    } else if (z > wall.south + 4 && h < 0.4 && rand() < 0.35) plant('reed', x, z, 0.9 + rand() * 0.5);
    else if (z > ALDHAVEN.land.maxZ - 14 && rand() < 0.6) plant('reed', x, z, 1 + rand() * 0.5);
    else if (x > coast - 6 && z < wall.ne[3] && rand() < 0.4) plant('rock', x, z, 0.8 + rand() * 1.5);
    else if (rand() < 0.4 && h > 0.5) plant('grass', x, z, 0.8 + rand() * 0.6);
    else if (rand() < 0.04 && h > 0.5 && z < wall.south) plant('bush', x, z, 0.7 + rand() * 0.4);
  });

  // ---- Into the world: move everything from the city's frame to its place.
  const heightAt = (x: number, z: number) => ground0(x - ox, z - oz);
  const move = (p: P2): P2 => [p[0] + ox, p[1] + oz];

  const walkable = new Walkable(walkableAreas().map((area) => area.map(move)));
  const colliders = new Colliders(walkable);
  for (const b of boxes) colliders.addBox({ ...b, x: b.x + ox, z: b.z + oz });
  for (const c of circles) colliders.addCircle({ ...c, x: c.x + ox, z: c.z + oz });

  const SETTLES: ReadonlySet<PieceKind> = new Set<PieceKind>(['tent', 'shed', 'stall', 'woodpile', 'vats', 'rack', 'nets', 'cart', 'haystack', 'planter', 'bench']);
  /** The buildings that stand at their door: level with the street in front, dug into the slope behind. */
  const DOORS: ReadonlySet<PieceKind> = new Set<PieceKind>(['house', 'warehouse', 'inn', 'hall', 'townhouse', 'barracks', 'forge', 'lodge', 'stables', 'barn', 'collegium', 'cathedral', 'keep']);
  const footY = (p: Omit<Piece, 'y'>): { y: number; drop: number } => {
    if (p.kind === 'bridge' || p.kind === 'kingsbridge' || p.kind === 'ship' || p.kind === 'boat' || p.kind === 'waterGate') return { y: ALDHAVEN.water, drop: 0 };
    if (p.kind === 'quay') return { y: ALDHAVEN.quay, drop: 0 };
    if (p.kind === 'mole') return { y: mole.height, drop: 0 };
    const deck = deckAtCity(p.x, p.z);
    if (deck !== null) return { y: deck, drop: 0 };
    const under = Plot.samples(p, 0).map(([x, z]) => ground0(x, z));
    // Walls and towers sink their footings into the slope; a prop stands on the ground under it.
    if (p.kind === 'wall' || p.kind === 'tower' || p.kind === 'beacon') return { y: Math.min(...under), drop: 0 };
    // The wider props on a slope settle halfway between the ground at their middle and at their lowest corner: no side hangs in the air.
    if (SETTLES.has(p.kind)) return { y: (ground0(p.x, p.z) + Math.min(...under)) / 2, drop: 0 };
    if (SMALL.has(p.kind) || p.kind === 'gatehouse' || p.kind === 'gorgegate') return { y: ground0(p.x, p.z), drop: 0 };
    const top = Math.max(...under);
    if (!DOORS.has(p.kind)) return { y: top, drop: 0 };
    // A building's floor is level with the street at its door, but never more than a plinth below its highest corner:
    // where the street falls away further, steps go down to it.
    const out = p.d / 2 + 0.8;
    const front = ground0(p.x + Math.sin(p.yaw) * out, p.z + Math.cos(p.yaw) * out);
    const y = Math.min(top + 0.15, Math.max(front, top - 1.4));
    return { y, drop: Math.max(0, y - front) };
  };
  const placed: Piece[] = pieces.map((p) => {
    const { y, drop } = footY(p);
    return { ...p, y, x: p.x + ox, z: p.z + oz, ...(drop > 0.12 ? { drop } : {}) };
  });
  const grown: CityPlant[] = plants.map((p) => ({ ...p, y: ground0(p.x, p.z), x: p.x + ox, z: p.z + oz }));
  const TREE_HEIGHT: Partial<Record<CityPlantKind, number>> = { plane: 9, oak: 9, pine: 8, orchard: 4 };
  const trees = grown.filter((p) => TREE_HEIGHT[p.kind]).map((p) => ({ x: p.x, y: p.y, z: p.z, height: (TREE_HEIGHT[p.kind] ?? 0) * p.scale }));

  // Washing hung out over the narrower streets of the old town, the harbour, the guilds and the close: a line from
  // one house's upper floor to the house facing it, where nothing stands in the way. Its piece sits at the line's
  // middle, at the line's height (`h` its rise from one end to the other, `w` its length).
  const WASHING: ReadonlySet<District> = new Set<District>(['oldTown', 'harbour', 'guild', 'close']);
  const washRand = mulberry32(5153);
  const hung = new Set<Piece>();
  const houses = placed.filter((p) => p.kind === 'house' && p.storeys >= 2 && WASHING.has(p.district));
  const LOW: ReadonlySet<PieceKind> = new Set<PieceKind>(['quay', 'lowWall', 'bridge', 'kingsbridge', 'mole']);
  const blockers = placed.filter((p) => (!SMALL.has(p.kind) && !LOW.has(p.kind)) || p.kind === 'banner');
  const within = (p: Piece, x: number, z: number, pad: number) => {
    const [dx, dz] = [x - p.x, z - p.z];
    return Math.abs(dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) < p.w / 2 + pad && Math.abs(dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw)) < p.d / 2 + pad;
  };
  const washing: Piece[] = [];
  for (const a of houses) {
    if (hung.has(a)) continue;
    const fa: P2 = [Math.sin(a.yaw), Math.cos(a.yaw)];
    const e: P2 = [Math.cos(a.yaw), -Math.sin(a.yaw)];
    let best: { b: Piece; ea: P2; eb: P2; gap: number } | null = null;
    for (const b of houses) {
      if (b === a || hung.has(b) || Math.abs(b.x - a.x) + Math.abs(b.z - a.z) > 30) continue;
      const fb: P2 = [Math.sin(b.yaw), Math.cos(b.yaw)];
      if (fa[0] * fb[0] + fa[1] * fb[1] > -0.97) continue;
      const [ua, ub] = [a.x * e[0] + a.z * e[1], b.x * e[0] + b.z * e[1]];
      const u = (ua + ub) / 2;
      if (Math.abs(u - ua) > a.w / 2 - 0.9 || Math.abs(u - ub) > b.w / 2 - 0.9) continue;
      const ea: P2 = [a.x + fa[0] * (a.d / 2 + 0.3) + e[0] * (u - ua), a.z + fa[1] * (a.d / 2 + 0.3) + e[1] * (u - ua)];
      const eb: P2 = [b.x + fb[0] * (b.d / 2 + 0.3) + e[0] * (u - ub), b.z + fb[1] * (b.d / 2 + 0.3) + e[1] * (u - ub)];
      const gap = Math.hypot(eb[0] - ea[0], eb[1] - ea[1]);
      const across = (eb[0] - ea[0]) * fa[0] + (eb[1] - ea[1]) * fa[1];
      if (across < 3.5 || across > 10 || gap > across * 1.05) continue;
      if (!best || gap < best.gap) best = { b, ea, eb, gap };
    }
    if (!best || washRand() > 0.6) continue;
    const { b, ea, eb, gap } = best;
    const [ya, yb] = [a.y + 5.9, b.y + 5.9];
    if (Math.abs(ya - yb) > 0.7) continue;
    let clear = true;
    for (let k = 1; k < 10 && clear; k++) {
      const [x, z] = [ea[0] + ((eb[0] - ea[0]) * k) / 10, ea[1] + ((eb[1] - ea[1]) * k) / 10];
      if (blockers.some((p) => p !== a && p !== b && within(p, x, z, p.kind === 'banner' ? 0.8 : 0.4))) clear = false;
      if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 3.2)) clear = false;
    }
    if (!clear) continue;
    hung.add(a);
    hung.add(b);
    washing.push({
      kind: 'washing', x: (ea[0] + eb[0]) / 2, z: (ea[1] + eb[1]) / 2, y: (ya + yb) / 2, yaw: Math.atan2(-(eb[1] - ea[1]), eb[0] - ea[0]),
      w: gap, d: 0.4, h: yb - ya, storeys: 0, variant: Math.floor(washRand() * 3), district: a.district, seed: 20000 + washing.length,
    });
  }
  placed.push(...washing);

  // The places that sound where they are.
  const sound = (id: PlaceSound['id'], x: number, z: number, y = ground0(x, z) + 1): PlaceSound => ({ id, x: x + ox, y, z: z + oz, interior: null });
  const sounds: PlaceSound[] = [
    sound('stream', bridge.x, 60, 1),
    sound('stream', wall.west - 2, 60, 1),
    sound('stream', -123, -15, 1),
    sound('stream', -121, -118, 1),
    sound('dock', 80, 30),
    sound('dock', 100, 92),
    sound('dock', -80, 77),
    sound('dock', 132, 32),
    sound('dock', 10, 44),
    sound('forge', -64, 92),
    sound('windmill', -124, 100, ground0(-124, 100) + 10),
  ];

  /** What the ground is at (x, z) in the world. */
  const cellOf = (x: number, z: number) => {
    const [i, j] = [Math.floor(x - land.minX), Math.floor(z - land.minZ)];
    return i >= 0 && j >= 0 && i < plot.cols && j < plot.rows ? j * plot.cols + i : -1;
  };
  const surface = (wx: number, wz: number): Surface => {
    const x = wx - ox;
    const z = wz - oz;
    const k = cellOf(x, z);
    const garden = (x > -108 && x < -58 && z > -108 && z < -52) || (x > 8 && x < 64 && z > -36 && z < 16);
    const inside = insideWalls(x, z, -2);
    const yard = inside && !garden && k >= 0 && yards[k] === 1;
    const causewayTop = z > wall.south - 2 && offCauseway(x, z) < causeway.width / 2 + 0.3;
    const paved = (inside && !garden && !yard) || causewayTop;
    // Old Town's black setts, ragged at their edge where the pale ones were laid over them.
    const jx = (valueNoise(x * 0.6, z * 0.6, 313) - 0.5) * 5;
    const jz = (valueNoise(x * 0.6, z * 0.6, 317) - 0.5) * 5;
    const basalt = paved && inside && districtAt(x + jx, z + jz) === 'oldTown';
    const street = paved && inside && k >= 0 && worn.taken[k] === 1;
    const westBank = x < -127 && x > ESCARPMENT && z > -106 && z < 34 && offAld(x, z) > 2.5 && Math.abs(z + 17) > 5;
    const inBend = x < wall.west - 3 && x > -126 && z > 82 && z < 111 && offAld(x, z) > 2.5;
    return { paved, basalt, garden, field: !inside && (westBank || inBend), street, yard };
  };
  const west = kingsroadSeam([-1, 0]);
  const westSeam: SideSeam = { ...west, heights: west.heights.map((_, k) => ground.get(0, k)) };
  const southSeam: Seam = {
    z: worldLand.maxZ,
    minX: worldLand.minX,
    maxX: worldLand.maxX,
    step: cell,
    heights: Array.from({ length: cols }, (_, i) => ground.get(i, rows - 1)),
    roads: [{ x: CAUSEWAY.x, width: CAUSEWAY.width, dir: [0, 1] }],
  };
  const landmark = (label: string, x: number, z: number) => ({ label, x: x + ox, z: z + oz });
  return {
    land: worldLand,
    walkable,
    ground,
    westSeam,
    southSeam,
    streets: streets.map((s) => ({ ...s, line: s.line.map(move) })),
    pieces: placed,
    plants: grown,
    colliders,
    pond: { x: pond.x + ox, z: pond.z + oz, r: pond.r, y: ground0(pond.x, pond.z) + 0.55 },
    spawn: { x: -146 + ox, z: -21 + oz, yaw: -PI / 2 - 0.08 },
    landmarks: [
      landmark('The Kingsroad', -146, -21),
      landmark('The Kingsbridge', -123, -15),
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
      landmark('The valley road', -40, -121),
      landmark('The Gorgegate', gorge.road, gorge.gate + 6),
      landmark('The Delta causeway', -30.5, 127),
    ],
    trees,
    sounds,
    surface,
    heightAt,
    deckAt: (x, z) => deckAtCity(x - ox, z - oz),
  };
}

/**
 * Lay the roads outside the walls into `ground` (world metres; `streets` in
 * the city's frame): each road's bed eased to a smooth run of heights, and
 * its shoulders blended back to the land. The Kingsroad comes down from the
 * seam's cutting (src/maps/kingsroad.ts) at an even grade to the
 * Kingsbridge's west end; the others follow the land, smoothed. The seams'
 * own lines (the west column, the south row) are left as they are.
 */
function layRoads(ground: HeightGrid, streets: readonly Street[]): void {
  const { at, land } = ALDHAVEN;
  const toWorld = (line: readonly P2[]): P2[] => line.map(([x, z]) => [x + at.x, z + at.z]);
  for (const [n, s] of streets.entries()) {
    if (!s.dirt) continue;
    // The Kingsroad stops at the Kingsbridge: the river runs under the rest.
    const line = n === 0 ? s.line.filter(([x]) => x <= kingsbridge.x0 + 0.5) : s.line;
    const world = toWorld(line);
    const heights =
      n === 0
        ? line.map(([x]) => lerp(KINGSROAD.road.y, kingsbridge.y0, Math.min(1, Math.max(0, (x - land.minX) / (kingsbridge.x0 - land.minX)))))
        : smoothHeights(heightsAlong(ground, world), 6, 4, { first: true, last: true });
    const half = s.width / 2 + 0.4;
    const shoulder = 3;
    const field = lineField(ground, world, half + shoulder);
    const last = ground.rows - 1;
    for (let j = 0; j < ground.rows; j++) {
      for (let i = 1; i < ground.cols; i++) {
        if (j === last) continue;
        const k = j * ground.cols + i;
        const d = field.d[k];
        if (d > half + shoulder) continue;
        ground.data[k] = lerp(ground.data[k], along(heights, field.at[k]), smoothstep(half + shoulder, half, d));
      }
    }
  }
}

/**
 * Blend the first ALDHAVEN.blend.west m of columns to the Kingsroad seam's
 * heights (src/maps/kingsroad.ts): exactly them on the line, all the city's
 * own a band on. The ridge closes the river's head; the road comes down
 * through the cutting.
 */
function meetWest(ground: HeightGrid): void {
  if (ground.x0 !== KINGSROAD.x) throw new Error("Aldhaven's west edge must be the Kingsroad's line");
  for (let i = 0; i < ground.cols; i++) {
    const t = smoothstep(0, ALDHAVEN.blend.west, ground.x(i) - ground.x0);
    if (t >= 1) break;
    for (let j = 0; j < ground.rows; j++) {
      const k = j * ground.cols + i;
      const edge = kingsroadHeight(ground.z(j));
      ground.data[k] = i === 0 ? edge : lerp(edge, ground.data[k], t);
    }
  }
}

/**
 * Blend the last ALDHAVEN.blend.south m of rows to the Sallows' north edge
 * (northEdgeHeight): exactly it on the line. The west column is the
 * Kingsroad seam's, which meets the Sallows' at the corner (both are the Fen
 * road seam's north hill there).
 */
function meetSouth(ground: HeightGrid): void {
  const last = ground.rows - 1;
  for (let j = last; j >= 0; j--) {
    const t = smoothstep(0, ALDHAVEN.blend.south, ground.z(last) - ground.z(j));
    if (t >= 1) break;
    for (let i = 1; i < ground.cols; i++) {
      const k = j * ground.cols + i;
      const edge = northEdgeHeight(ground.x(i));
      ground.data[k] = j === last ? edge : lerp(edge, ground.data[k], t);
    }
  }
}

/**
 * Convex strips along one bank of the Ald outside the walls (`side` 1 its
 * east bank, -1 its west), from `margin` m off its water `reach` m out, from
 * where the bank leaves the gorge's cliffs. With `cap`, on round the river's
 * end at the water gate.
 */
function aldBanks(side: 1 | -1, margin: number, reach: number, cap: boolean): P2[][] {
  const pts = ald.line;
  const halfAt = (t: number) => lerp(ald.half, ald.mouth, smoothstep(0.8, 1, t));
  const rays: { p: P2; n: P2 }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n: P2 = [((bz - az) / len) * side, (-(bx - ax) / len) * side];
    const steps = Math.max(1, Math.ceil(len / 6));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const r = halfAt(lerp(ALD_ALONG[i], ALD_ALONG[i + 1], t)) + margin;
      rays.push({ p: [ax + (bx - ax) * t + n[0] * r, az + (bz - az) * t + n[1] * r], n });
    }
  }
  if (cap) {
    // Round the end, from the last bank's normal to straight on.
    const [ex, ez] = pts[pts.length - 1];
    const [px, pz] = pts[pts.length - 2];
    const len = Math.hypot(ex - px, ez - pz);
    const fwd: P2 = [(ex - px) / len, (ez - pz) / len];
    const last = rays[rays.length - 1].n;
    const r = ald.mouth + margin;
    for (let k = 1; k <= 4; k++) {
      const a = (k / 4) * (PI / 2);
      const n: P2 = [last[0] * Math.cos(a) + fwd[0] * Math.sin(a), last[1] * Math.cos(a) + fwd[1] * Math.sin(a)];
      rays.push({ p: [ex + n[0] * r, ez + n[1] * r], n });
    }
  }
  const out: P2[][] = [];
  for (let k = 0; k < rays.length - 1; k++) {
    const a = rays[k];
    const b = rays[k + 1];
    if (a.p[1] < gorge.from || b.p[1] < gorge.from) continue;
    if (Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1]) < 1e-6 && a.n[0] === b.n[0] && a.n[1] === b.n[1]) continue;
    out.push([a.p, b.p, [b.p[0] + b.n[0] * reach, b.p[1] + b.n[1] * reach], [a.p[0] + a.n[0] * reach, a.p[1] + a.n[1] * reach]]);
  }
  return out;
}

/**
 * Where you can walk, in the city's frame: the north bank inside the walls
 * and out, under the north wall to the gorge's mouth and up the valley road
 * to the Gorgegate; the narrow bank between the Ald and the west wall; the
 * fields over the Ald, west and round its bend; the south bank; the
 * Kingsbridge, the Aldbridge, the mole and the causeway, and the Kingsroad
 * and the causeway on over their seams. Convex areas that overlap where they
 * join; the river, the harbour and the sea are outside them all, and the
 * walls keep you to the gates.
 */
function walkableAreas(): P2[][] {
  const { basin } = river;
  const e = 1;
  const westEdge = ESCARPMENT - 0.5;
  /** Out from the Ald's east bank, along the west wall's foot. */
  const eastBank = -114;
  const strip = (a: readonly number[], b: readonly number[], half: number, ends = 1): P2[] => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = (-(b[1] - a[1]) / len) * half;
    const nz = ((b[0] - a[0]) / len) * half;
    const ux = ((b[0] - a[0]) / len) * ends;
    const uz = ((b[1] - a[1]) / len) * ends;
    return [
      [a[0] + nx - ux, a[1] + nz - uz],
      [b[0] + nx + ux, b[1] + nz + uz],
      [b[0] - nx + ux, b[1] - nz + uz],
      [a[0] - nx - ux, a[1] - nz - uz],
    ];
  };
  const octagon = (cx: number, cz: number, r: number): P2[] => Array.from({ length: 8 }, (_, k) => [cx + r * Math.cos((k * PI) / 4 + PI / 8), cz + r * Math.sin((k * PI) / 4 + PI / 8)] as P2);
  const [m0, m1, m2] = mole.line;
  const [, c1, c2, c3] = causeway.line;
  const { land } = ALDHAVEN;
  const seam = CONFIG.world.ground.seam;
  const kz = KINGSROAD.road.z - ALDHAVEN.at.z;
  const kb = kingsbridge;
  return [
    // The north bank, from the Greyspine's feet down to the river streets, the strip along the west wall's foot with it.
    [[eastBank, gorge.from], [70, gorge.from], [108, -90], [coast - e, wall.ne[3]], [coast - e, basin.north - e], [wall.west + 2, basin.north - e], [eastBank, 22]],
    [[wall.west + 1.5, basin.north - e - 1], [basin.to, basin.north - e - 1], [basin.from, river.north - e], [wall.west + 1.5, river.north - e]],
    // The valley road up the gorge's floor to the Gorgegate.
    [[eastBank, gorge.from + 6], [gorge.x + 17, gorge.from + 6], [gorge.x + 13, gorge.gate + 1], [eastBank, gorge.gate + 1]],
    // The fields over the Ald, under the escarpment, and round its bend.
    ...aldBanks(-1, 1.2, 14, true),
    [[westEdge, gorge.from], [-134, gorge.from], [-134, 80], [westEdge, 80]],
    [[westEdge, 80], [wall.west - 2, 80], [wall.west - 2, wall.south - 1], [westEdge, wall.south - 1]],
    // The south bank.
    [[wall.west + 1.5, river.south + e], [basin.from, river.south + e], [basin.to, basin.south + e + 1], [wall.west + 1.5, basin.south + e + 1]],
    [[wall.west + 1.5, basin.south + e], [coast - e, basin.south + e], [coast - e, wall.south - 1], [wall.west + 1.5, wall.south - 1]],
    // The causeway over the flats, on over the seam into the Sallows by CONFIG.world.ground.seam.
    strip([causeway.x, wall.south - 2], c1, 3.2),
    strip(c1, c2, 3.2),
    strip(c2, [c3[0], land.maxZ + seam - 1], 3.2),
    // The Kingsroad's last stretch down off the crest through its cutting, on over the seam into Brackenmoor by CONFIG.world.ground.seam.
    [[land.minX - seam, kz - 7], [-150, kz - 5.5], [-150, kz + 7], [land.minX - seam, kz + 7]],
    strip([-151, -22.6], [-141, -18.6], 4.5),
    strip([-141, -18.6], [-133, -15.3], 4.5),
    // The Kingsbridge's deck, between its parapets.
    [[kb.x0 - 2, kb.z - kb.width / 2 + 0.7], [kb.x1 + 1.5, kb.z - kb.width / 2 + 0.7], [kb.x1 + 1.5, kb.z + kb.width / 2 - 0.7], [kb.x0 - 2, kb.z + kb.width / 2 - 0.7]],
    // The Aldbridge's roadway.
    [[bridge.x - bridge.road / 2 + 0.3, river.north - 3], [bridge.x + bridge.road / 2 - 0.3, river.north - 3], [bridge.x + bridge.road / 2 - 0.3, river.south + 3], [bridge.x - bridge.road / 2 + 0.3, river.south + 3]],
    // The mole, out to the harbour light, and round its head.
    strip([coast - 4, m0[1] - (m1[1] - m0[1]) * (4 / (m1[0] - m0[0]))], m1, mole.width / 2 - 0.8),
    strip(m1, m2, mole.width / 2 - 0.8),
    octagon(m2[0], m2[1], MOLE_HEAD.r - 0.9),
  ];
}
