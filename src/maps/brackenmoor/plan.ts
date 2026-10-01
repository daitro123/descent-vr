import { CONFIG } from '../../config';
import type { Tree, PlaceSound } from '../../world/ambience';
import type { Atmosphere } from '../../world/atmosphere';
import { Colliders, toLocal } from '../forest/colliders';
import { PASS } from '../forest/layout';
import { fbm, lerp, mulberry32, nearestOnPolyline, type P2, sampleCurve, smoothstep, valueNoise } from '../forest/noise';
import { type Deck, deckBetween, Decks } from '../decks';
import { FEN_ROAD, fenRoadHeight, fenRoadSeam } from '../fenRoad';
import { KINGSROAD, kingsroadHeight, kingsroadSeam } from '../kingsroad';
import { HeightGrid } from '../heightGrid';
import { along, flattenTo, heightsAlong, lengths, type LineField, lineField, pointAlong, smoothHeights } from '../lines';
import type { Seam, SideSeam, Spot } from '../types';
import { Walkable } from '../walkable';
import { chapelLane, houseLook, placeCairnford, TOWN } from './cairnford';
import { MOOR_LIGHT, MOOR_SKY } from './palette';

// Brackenmoor: the high, wet moor south of Oakvale's pass (see the zone's
// spec, /zones/brackenmoor.md in the project's files). Over the crest the land
// falls into Passfoot's basin; the pass road runs on south over a saddle by
// the Long Stones to Cairnford, a grey stone market town at a three-arched
// bridge over the Brack Beck (cairnford.ts lays the town out). The beck rises
// in the Blackmire, a flat peat bog in the west with Turfmoss's crofts on its
// edge, and runs east between the town's quays and south-east to Beck's Foot,
// where the Fen road leaves for the Sallows. The Kingsroad climbs east through
// the landlord's walled enclosure past Fellgate Hall's park to a tollhouse on
// the escarpment, and on through a cutting in the ridge down to Aldhaven; the
// Sunreach road runs south to the Rockfall Gap in the south ridge, closed by a
// rockfall. The fells rise in the north-west round Raven Scar's old quarry,
// and in the north-east the High Fells carry the barrows and Hollowhill, its
// stone door at the end of a walled passage cut into the mound. Nothing lives
// here yet.
//
// This file is the plan only: heights, roads, water, what stands where, what
// you bump into. No three.js meshes, so it runs in tests and in its worker.
// x is east, z is south, in world metres on the one chunk grid.

export const MOOR = {
  /** The land: 12 by 11 chunks south of the crest. */
  land: { minX: -220, maxX: 260, minZ: 140, maxZ: 580 },
  /** Height grid spacing, as Oakvale's, so the two meet vertex for vertex on the crest. */
  cell: 2,
  /** Over this first band of land the moor blends to the crest's heights (and to the Fen road's at its east edge). */
  blend: 40,
  /** The pass carries on `corridor` m past the crest before the moor opens out. */
  opening: { corridor: 24 },
  /**
   * The road over the moor, the main road's width; anything narrower than
   * `track` is a track. A road climbs no steeper than `grade` (as the pass
   * does), a track no steeper than `trackGrade`, cut into the hill where the
   * land is steeper.
   */
  road: { width: 4, track: 3, grade: 0.2, trackGrade: 0.33 },
  /** The rockfall across the Sunreach road where you can walk no farther: rocks this many m across. */
  rockfall: { count: 16, spread: 9, scale: [1.4, 3.2] },
  /** A lone pine's lean, downwind (to the north-east), as run over rise. */
  lean: 0.4,
  /** The Rockfall Gap's notch in the south ridge: its middle's x, where its floor starts, its floor's half width, and how steeply it climbs to the saddle. */
  gap: { x: -20, from: 540, half: 6, climb: 0.45 },
  /** The Blackmire's bog: its middle, its half sizes, and its pools' one level. */
  bog: { x: -138, z: 400, rx: 62, rz: 66, level: 8.2 },
  /** Cairnford's market square: its middle and half sizes. */
  square: TOWN.square,
  /** Raven Scar's quarry pit: its middle, its half sizes, and how deep it's cut. */
  scar: { x: -158, z: 218, hw: 24, hd: 17, depth: 11 },
  /**
   * Hollowhill on the High Fells: its middle, its radius and height, how far
   * south of its middle its door stands, and the half width of the walled
   * passage cut into the mound from its foot to the door.
   */
  hollowhill: { x: 190, z: 196, r: 18, h: 9, door: 12, passage: 2 },
  /** The Long Stones' row along the ridge, from one end to the other. */
  longStones: { from: [42, 287] as P2, to: [100, 298] as P2, count: 9 },
} as const;

/**
 * Brackenmoor's air and light under the World's same sun: a paler, cooler
 * haze than Oakvale's, a whiter sky, and a rust-brown light bounced up off
 * the bracken. Its fog reaches as far as Oakvale's, so the streamer keeps
 * the same distances either side of the crest.
 */
export const MOOR_ATMOSPHERE: Atmosphere = {
  background: MOOR_SKY.haze,
  fog: { color: MOOR_SKY.haze, near: 40, far: 200 },
  sky: { zenith: MOOR_SKY.zenith, horizon: MOOR_SKY.horizon, haze: MOOR_SKY.haze, sun: MOOR_SKY.sun },
  sun: { color: MOOR_LIGHT.sun, intensity: 2.3 },
  hemisphere: { sky: MOOR_LIGHT.sky, ground: MOOR_LIGHT.ground, intensity: 1.5 },
  farPlane: 240,
  flames: [],
};

/** What grows or lies on the moor. Bracken, heather, cotton grass and reeds are undergrowth, too small for a stand-in. */
export type MoorKind = 'bracken' | 'heather' | 'tussock' | 'bush' | 'gorse' | 'rock' | 'pine' | 'hawthorn' | 'rowan' | 'reed' | 'cotton' | 'cypress' | 'crag' | 'scree';

export interface MoorPlant {
  readonly kind: MoorKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly scale: number;
  readonly seed: number;
}

/** Trunk radius for what you can't walk through (scaled by the plant's scale). */
const TRUNK: Partial<Record<MoorKind, number>> = { pine: 0.32, rock: 0.7, hawthorn: 0.2, rowan: 0.18 };

/** How tall a tree stands, for birds to perch in (scaled by the plant's scale). */
const TREE_HEIGHT: Partial<Record<MoorKind, number>> = { pine: 7, hawthorn: 3.4, rowan: 3.6 };

/** Every building and set piece on the moor. */
export type MoorStructureKind =
  | 'house' | 'inn' | 'mootHall' | 'chapel' | 'smithy' | 'mill' | 'cottage' | 'croft' | 'ruin' | 'fold'
  | 'hall' | 'gatehouse' | 'flag' | 'tollhouse' | 'tollgate' | 'cairn' | 'signpost' | 'mapboard' | 'bridge'
  | 'barrow' | 'hollowhill' | 'dromos' | 'spoil' | 'tent' | 'ragPole' | 'ladder' | 'lookout' | 'peatStack' | 'peatBank'
  | 'hut' | 'jetty' | 'boat' | 'grave' | 'stall' | 'cart' | 'garden' | 'hide' | 'crates' | 'borderStone' | 'longStone' | 'marketCross'
  | 'quay' | 'well' | 'trough' | 'bench' | 'barrels' | 'postbox' | 'woodpile' | 'cartShed' | 'wagon' | 'hayrick' | 'townGate'
  | 'bollard' | 'graves' | 'stable' | 'hedge' | 'sundial' | 'fieldGate' | 'campfire' | 'crane' | 'blocks' | 'eelTraps' | 'yard'
  | 'waymark' | 'tor' | 'rack';

/**
 * One building or set piece: where its footprint's middle stands, which way
 * its front faces (as a model turns: 0 faces +Z), the ground under it, and
 * its size where the kind takes one.
 */
export interface MoorStructure {
  readonly kind: MoorStructureKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  /** Width along its own X, depth along its own Z, height or storeys, as the kind reads them. */
  readonly w: number;
  readonly d: number;
  readonly h: number;
  /** A per-piece number for its look: which way a board points, an abandoned croft, a broken barrow. */
  readonly variant: number;
  readonly seed: number;
  /** What else a kind's model needs, as it reads it: a bridge's deck heights over the water, a signpost's boards, a passage's walls. */
  readonly extra?: readonly number[];
}

/** A road or a track: its centre line (about a metre between samples), its width, and its bed's heights along it. */
export interface MoorRoad {
  readonly id: string;
  readonly line: readonly P2[];
  readonly width: number;
  readonly heights: readonly number[];
}

/** A dry stone wall: its line, and whether it's the landlord's dressed stone. */
export interface MoorWall {
  readonly pts: readonly P2[];
  readonly dressed: boolean;
}

/** Where Cairnford is paved with setts: its square and waterside as rectangles, its streets as strips along their lines. */
export interface Paving {
  readonly rects: readonly { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }[];
  readonly strips: readonly { readonly line: readonly P2[]; readonly half: number }[];
}

export interface MoorPlan {
  /** Where you can walk: on from the crest's corridor, then the moor, and over the Kingsroad into Aldhaven and the Fen road into the Sallows. */
  readonly walkable: Walkable;
  /** Its heights along the crest: Oakvale's own, which it meets exactly. */
  readonly seam: Seam;
  /** Its heights along the Fen road's line, which the Sallows meet exactly. */
  readonly fenSeam: SideSeam;
  /** Its heights along the Kingsroad's seam, where Aldhaven meets its east edge north of the Fen road's. */
  readonly kingsSeam: SideSeam;
  readonly ground: HeightGrid;
  /** The pass road, from the crest to Cairnford's square: the road you come in on. */
  readonly road: MoorRoad;
  /** Every road and track, the pass road first. */
  readonly roads: readonly MoorRoad[];
  /** Distance to the nearest road's edge at each ground vertex (negative on it; Infinity far from any). */
  readonly roadDistance: Float32Array;
  /** The Brack Beck's centre line, from its source in the Blackmire to the Fen road's seam, its water's level and its half width along it. */
  readonly beck: { readonly line: readonly P2[]; readonly levels: readonly number[]; readonly halves: readonly number[] };
  /** The water's level at (x, z): the beck's, the bog's pools', or NaN where there's none. */
  waterLevel(x: number, z: number): number;
  readonly plants: readonly MoorPlant[];
  readonly structures: readonly MoorStructure[];
  readonly walls: readonly MoorWall[];
  /** Cairnford's setts. */
  readonly paving: Paving;
  /** The bridge's deck and the Blackmire's boardwalk: what you walk on above the ground. */
  readonly decks: readonly Deck[];
  /** The border stone by the road on the crest, and which way its face turns. */
  readonly stone: { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number; readonly h: number };
  /** Where the Sunreach road ends, against the rockfall in the Rockfall Gap. */
  readonly rockfall: P2;
  readonly colliders: Colliders;
  /** Where `?map=brackenmoor` starts: on the road just over the crest, looking out over the moor. */
  readonly spawn: Spot;
  readonly landmarks: readonly { label: string; x: number; z: number }[];
  /** Its trees, for birds to call from. */
  readonly trees: readonly Tree[];
  /** The places that sound where they are: the beck under the bridge. */
  readonly sounds: readonly PlaceSound[];
  /** Ground height, the bridge and the boardwalk included. */
  heightAt(x: number, z: number): number;
}

// ------------------------------------------------------------------ the lie of the land

/**
 * Roads' and tracks' centre lines, before they're sampled. The pass road's
 * first points come from the crest. A track that `join`s another road starts
 * on that road's line, where its first point falls, so the two meet.
 */
const ROADS: { id: string; width: number; pts: P2[]; join?: string }[] = [
  { id: 'kingsroad', width: 4, pts: [[52, 369], [72, 367], [96, 364], [120, 360], [145, 356], [170, 351], [195, 345], [215, 338], [232, 331], [244, 331], [254, 334], [KINGSROAD.x, KINGSROAD.road.z]] },
  { id: 'fen', width: 3.4, pts: [[46, 405], [70, 420], [100, 432], [130, 446], [160, 466], [190, 492], [215, 515], [238, 532], [252, 540], [262, FEN_ROAD.road.z]] },
  { id: 'sunreach', width: 3.4, pts: [[46, 405], [37, 428], [24, 460], [8, 492], [-6, 520], [-15, 545], [-20, 562]] },
  // Tracks: to Hob's Fold's croft door, past the Old Fold's ruin and on to Raven Scar's pit, along the beck to
  // Turfmoss and the Blackmire's boardwalk, up the High Fells to Hollowhill's passage, Fellgate Hall's drive,
  // the chapel's lane, the mill lane on the south bank, and the eel-trapper's path at Beck's Foot.
  { id: 'hob', width: 2.2, join: 'pass', pts: [[-1, 215], [-12, 219], [-20.5, 226], [-24.2, 234.4], [-26.6, 238.6]] },
  { id: 'oldFold', width: 2.2, join: 'pass', pts: [[4, 250], [-9, 272], [-22, 297], [-33, 318], [-36, 325.5]] },
  { id: 'scar', width: 2.2, join: 'oldFold', pts: [[-33, 318], [-48, 309], [-64, 298], [-88, 277], [-112, 257], [-132, 243], [-143, 234], [-151, 225]] },
  { id: 'turfmoss', width: 2.2, pts: [[26, 381], [12, 381.5], [0, 378.6], [-30, 369], [-60, 361], [-85, 353], [-89.6, 357.6], [-91.6, 361.2]] },
  { id: 'fells', width: 2.2, join: 'kingsroad', pts: [[112, 361], [122, 333], [138, 302], [152, 270], [168, 242], [183, 224], [190, MOOR.hollowhill.z + MOOR.hollowhill.r + 2]] },
  { id: 'hall', width: 3, join: 'kingsroad', pts: [[160, 353], [160, 342], [160, 327.6]] },
  // Its points are the lane's through the gap in the market street's houses (cairnford.ts), worked out from the pass road's line.
  { id: 'chapel', width: 2, join: 'pass', pts: [] },
  { id: 'mill', width: 2.4, pts: [[45, 405.6], [36, 407.6], [24, 408.7], [12, 409.3], [2, 408.6]] },
  { id: 'beckFoot', width: 2, join: 'fen', pts: [[219, 519], [218.4, 513.2]] },
];

/** The pass road on from the crest's crossing: down through Passfoot, over the Long Stones' saddle, into Cairnford's square. */
const PASS_ROAD: P2[] = [[9, 172], [3, 196], [-2, 222], [4, 246], [15, 268], [22, 289], [27, 312], [33, 338], [36, 358], [38, 368]];

/** The Brack Beck, from its source in the Blackmire to the Fen road's seam (a little past it, so it's carved to the edge). */
const BECK: P2[] = [
  [-150, 405], [-120, 399], [-90, 393], [-55, 390], [-20, 392], [10, 394], [38, 393], [70, 398], [100, 408],
  [135, 425], [165, 448], [195, 478], [222, 500], [245, 514], [262, FEN_ROAD.beck.z],
];

/** The beck's half width at the water over the open moor, its depth in the middle, and its banks' width. Through Cairnford it runs wider between quays (TOWN.quays). */
const BECK_SHAPE = { half: 2.6, depth: 0.75, bank: 5 } as const;

/** Cairnford's bridge: its middle's x, and where it starts and ends either side of the beck. */
const BRIDGE = TOWN.bridge;

/** The general fall of the land, high north-west to low south-east, and its swells. */
function base(x: number, z: number): number {
  return 6.6 - 0.011 * (x - 20) - 0.006 * (z - 360) + (fbm(x * 0.012, z * 0.012, 101) - 0.5) * 6 + (fbm(x * 0.05, z * 0.05, 103) - 0.5) * 1.1;
}

/** Distance from (x, z) to the segment a→b. */
function toSegment(x: number, z: number, a: P2, b: P2): number {
  const ex = b[0] - a[0];
  const ez = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez || 1)));
  return Math.hypot(x - (a[0] + ex * t), z - (a[1] + ez * t));
}

/** How far into the Blackmire (x, z) is: 1 well inside, 0 outside its edge. */
function inBog(x: number, z: number): number {
  const { bog } = MOOR;
  const e = Math.hypot((x - bog.x) / bog.rx, (z - bog.z) / bog.rz);
  return smoothstep(1, 0.72, e);
}

/** How far into the landlord's enclosure (x, z) is: 1 inside its walls. */
export function inEnclosure(x: number, z: number): number {
  return smoothstep(116, 121, x) * smoothstep(220, 215, x) * smoothstep(256, 261, z) * smoothstep(427, 422, z);
}

/** How far into Cairnford (x, z) is: 1 among its houses, easing out to the moor round it. */
export function inTown(x: number, z: number): number {
  return Math.max(smoothstep(70, 46, Math.hypot((x - 46) * 0.8, z - 378)), smoothstep(26, 14, Math.hypot(x - TOWN.chapel.x, z - TOWN.chapel.z)));
}

/** How far onto Hollowhill's mound (x, z) is: 1 over it, easing out past its foot. Its steep skirt is turf, not crag. */
export function onHollowhill(x: number, z: number): number {
  const hh = MOOR.hollowhill;
  return smoothstep(hh.r + 3, hh.r, Math.hypot(x - hh.x, z - hh.z));
}

/** Hollowhill's mound over the fells at (x, z), and how far into its passage's cut (x, z) is (1 on its floor). */
function hollowhill(x: number, z: number): { mound: number; cut: number; dip: number } {
  const hh = MOOR.hollowhill;
  const r = Math.hypot(x - hh.x, z - hh.z) / hh.r;
  const mound = r < 1 ? hh.h * Math.sqrt(1 - r * r) * (0.9 + 0.1 * smoothstep(1, 0.5, r)) : 0;
  // The passage: straight in from the mound's south foot to the door, its floor dipping a little toward it. The door
  // stands on a line of the ground's 2 m cells, the cut's full depth reaching it and none of the one behind.
  const door = hh.z + hh.door;
  const mouth = hh.z + hh.r + 1;
  const across = smoothstep(hh.passage + 1.4, hh.passage + 0.2, Math.abs(x - hh.x));
  const cut = across * smoothstep(door - 1.9, door - 0.1, z) * smoothstep(mouth + 3, mouth, z);
  return { mound, cut, dip: 0.5 * smoothstep(mouth, door, z) };
}

/** The moor's own height at (x, z), before the beck, the roads, the crest and the edges. */
function moorHeight(x: number, z: number): number {
  let h = base(x, z);
  // The north-west fells round Raven Scar.
  h += 27 * smoothstep(-70, -178, x) * smoothstep(360, 228, z);
  // The High Fells, a broad dome in the north-east, and Hollowhill on its crown, its passage cut into it.
  const fells = Math.hypot(x - 185, z - 205);
  h += 17 * smoothstep(82, 8, fells);
  const hh = hollowhill(x, z);
  h += hh.mound * (1 - hh.cut) - hh.dip * hh.cut;
  // The Long Stones' ridge, parted where the pass road crosses it in a saddle.
  const ridge = toSegment(x, z, [-12, 285], [128, 300]);
  h += 8 * smoothstep(34, 6, ridge) * (1 - 0.75 * smoothstep(24, 6, Math.abs(x - 24)));
  // The south ridge, toward Sunreach, lowering east toward Beck's Foot.
  h += (14 + 10 * fbm(x * 0.02, 7, 111)) * smoothstep(505, 575, z) * smoothstep(240, 150, x);
  // Beck's Foot: the ground sinks toward the fens.
  h -= 2.4 * smoothstep(70, 10, Math.hypot(x - 222, z - 512));
  // Cairnford's fold: a shallow hollow round the bridge, and the chapel's rise above it to the north-west.
  h -= 1.5 * smoothstep(80, 20, Math.hypot(x - 40, z - 385));
  h += TOWN.chapel.rise * smoothstep(30, 9, Math.hypot(x - TOWN.chapel.x, z - TOWN.chapel.z));
  // The Blackmire: flat peat at the bog's level, its pools where the peat dips under it.
  const wet = inBog(x, z);
  if (wet > 0) h = lerp(h, MOOR.bog.level + 0.2 + (fbm(x * 0.09, z * 0.09, 131) - 0.5) * 1.5, wet);
  return h;
}

/**
 * The rim: hills past where you can walk, rising with the distance from it
 * (`out` m), and steepening to a wall by the land's edges where no neighbour
 * meets it, so the land's end is never seen. Its slopes break in a step or
 * two, as the fells' do, where its crags stand (placePlants).
 */
function rimHeight(x: number, z: number, out: number): number {
  const { land } = MOOR;
  const lump = 0.75 + 0.5 * fbm(x * 0.03 + 9, z * 0.03 - 4, 141);
  const rise = smoothstep(5, 48, out);
  // A bench part way up: the slope eases, then steepens again into the next crag.
  const bench = 0.08 * Math.sin(rise * Math.PI * 2) * smoothstep(0, 0.3, rise) * (0.6 + 0.8 * fbm(x * 0.05, z * 0.05, 143));
  let h = 30 * lump * (rise - bench);
  const edge = Math.min(x - land.minX, land.maxX - x, land.maxZ - z, z - land.minZ);
  h += 16 * lump * smoothstep(26, 0, edge) * smoothstep(0, 10, out);
  return h;
}

/**
 * The Rockfall Gap: a notch cut through the south ridge where the Sunreach
 * road leaves, its floor climbing from where the road ends to a saddle on the
 * land's edge, so from the moor you look up through it at the sky over
 * Sunreach, past the rocks that fill it.
 */
function gapNotch(x: number, z: number, h: number): number {
  const { x: gx, from, half, climb } = MOOR.gap;
  const w = smoothstep(half + 9, half, Math.abs(x - gx - Math.sin(z * 0.08) * 2)) * smoothstep(from - 16, from, z);
  if (w <= 0) return h;
  const floor = moorHeight(gx, from) + Math.max(0, z - from - 14) * climb;
  return lerp(h, Math.min(h, floor), w);
}

/** Raven Scar's pit: how deep the quarry is cut at (x, z), and 1 on its floor. Its mouth opens to the south-east. */
function scarCut(x: number, z: number): number {
  const { scar } = MOOR;
  const lx = (x - scar.x) / scar.hw;
  const lz = (z - scar.z) / scar.hd;
  // A rounded box, stretched toward its mouth so the floor runs out to the track.
  const mouth = smoothstep(0, 1.6, lx * 0.7 + lz * 0.7);
  const e = Math.max(Math.abs(lx), Math.abs(lz)) * 0.6 + Math.hypot(lx, lz) * 0.4;
  return smoothstep(1.08, 0.86, e - mouth * 0.9) * (1 - 0.65 * mouth);
}

// ------------------------------------------------------------------ the beck

/** Along the beck's line, its half width (wider between Cairnford's quays) and how far its banks are quays (1) rather than the moor's own (0). */
function beckShape(line: readonly P2[]): { halves: number[]; quays: number[] } {
  const { from, to, half } = TOWN.quays;
  const quays = line.map(([x]) => smoothstep(from - 3, from, x) * smoothstep(to + 3, to, x));
  // Wider through the town, easing out to the moor's width either side of its quays.
  const wide = line.map(([x]) => smoothstep(from - 14, from - 1, x) * smoothstep(to + 14, to + 1, x));
  return { halves: wide.map((w) => lerp(BECK_SHAPE.half, half, w)), quays };
}

// ------------------------------------------------------------------ the plan

/**
 * Plan Brackenmoor against Oakvale's `crest`: its heights there, which the
 * moor's land meets exactly, and the road crossing it, which runs on.
 */
export function planBrackenmoor(crest: Seam): MoorPlan {
  const { land, cell } = MOOR;
  if (crest.z !== land.minZ || crest.step !== cell || crest.minX < land.minX || crest.maxX > land.maxX) {
    throw new Error("Brackenmoor's land must meet the crest along its north edge, vertex for vertex");
  }
  const cols = Math.round((land.maxX - land.minX) / cell) + 1;
  const rows = Math.round((land.maxZ - land.minZ) / cell) + 1;
  const ground = new HeightGrid(land.minX, land.minZ, cols, rows, cell);
  const [crossing] = crest.roads;
  const pass = sampleCurve([[crossing.x, land.minZ], [crossing.x + crossing.dir[0] * 10, land.minZ + crossing.dir[1] * 10], ...PASS_ROAD], 1);
  const roadLines: { id: string; width: number; line: P2[] }[] = [{ id: 'pass', width: crossing.width, line: pass }];
  for (const r of ROADS) {
    const pts = r.id === 'chapel' ? chapelLane(pass) : [...r.pts];
    if (r.join) {
      // Start on the joined road's line, where the first point falls.
      const other = roadLines.find((o) => o.id === r.join)!.line;
      const { i, t } = nearestOnPolyline(other, ...pts[0]);
      pts[0] = [lerp(other[i][0], other[i + 1][0], t), lerp(other[i][1], other[i + 1][1], t)];
    }
    roadLines.push({ id: r.id, width: r.width, line: sampleCurve(pts, 1) });
  }
  const walkable = new Walkable(walkableAreas(crossing.x, pass));

  // 1. The moor's own lie of the land, and the rim past where you walk.
  ground.each((x, z, k) => {
    let h = moorHeight(x, z);
    const cut = scarCut(x, z);
    if (cut > 0) h -= MOOR.scar.depth * cut;
    ground.data[k] = gapNotch(x, z, h + rimHeight(x, z, walkable.distance(x, z)));
  });

  // 2. The beck: a channel down its line, its water falling all the way from the bog to the fens; between quays through the town.
  const beckLine = sampleCurve(BECK, 1);
  const { halves, quays } = beckShape(beckLine);
  const beckField = lineField(ground, beckLine, TOWN.quays.half + BECK_SHAPE.bank + 2);
  const levels = beckLevels(ground, beckLine);
  carveBeck(ground, beckField, levels, halves, quays);
  const nearestBeckAt = (x: number, z: number) => nearestBeck(beckLine, x, z);
  const halfAt = (at: number) => along(halves, at);

  // 3. The roads, each eased into the land along a smoothed line of its heights (the pass road's first held: it's the crest's).
  const roads: MoorRoad[] = [];
  const fields: LineField[] = [];
  for (const r of roadLines) {
    const field = lineField(ground, r.line, r.width / 2 + 4);
    const raw = heightsAlong(ground, r.line).map((h, i) => {
      // Over the beck and its banks a road rides high.
      const [x, z] = r.line[i];
      const b = nearestOnPolyline(beckLine, x, z);
      return b.d < halfAt(b.i + b.t) + 3 ? Math.max(h, along(levels, b.i + b.t) + 0.9) : h;
    });
    const seamY = r.id === 'fen' ? FEN_ROAD.road.y : r.id === 'kingsroad' ? KINGSROAD.road.y : undefined;
    const smooth = smoothHeights(raw, 5, 4, { first: r.id === 'pass', last: seamY !== undefined });
    if (seamY !== undefined) smooth[smooth.length - 1] = seamY;
    const heights = regrade(r.line, smooth, r.width >= MOOR.road.track ? MOOR.road.grade : MOOR.road.trackGrade, seamY !== undefined);
    flattenTo(ground, field, heights, r.width / 2 + 0.6, 3);
    roads.push({ id: r.id, line: r.line, width: r.width, heights });
    fields.push(field);
  }

  // 4. Level pads: the square, and every building's footprint.
  const sq = MOOR.square;
  pad(ground, sq.x, sq.z, sq.hw, sq.hd, 0, ground.at(sq.x, sq.z), 3);
  const beckLevelAt = (at: number) => along(levels, at);
  const structures = placeStructures(ground, roads, { line: beckLine, half: halfAt, level: beckLevelAt });
  for (const s of structures) {
    const p = PADS[s.kind];
    if (p === undefined) continue;
    // Round things on round pads; the rest on their footprints.
    if (s.kind === 'barrow' || s.kind === 'fold' || s.kind === 'tor') pad(ground, s.x, s.z, s.w * p, s.w * p, 0, s.y, 3);
    else pad(ground, s.x, s.z, s.w / 2 + p, s.d / 2 + p, s.yaw, s.y, 2.5);
  }

  // 5. Last, the edges blend to the neighbours' heights, so the zones agree exactly on their lines.
  meetCrest(ground, crest);
  // Along the Kingsroad's stretch the blend leaves the road's own bed be: the seam's cutting meets it on the line.
  const kingsroad = roads.find((r) => r.id === 'kingsroad')!;
  meetEast(ground, fields[roads.indexOf(kingsroad)], kingsroad.width);
  // The blends mustn't tilt what stands near the edges: level its pads again.
  for (const s of structures) {
    const p = PADS[s.kind];
    if (p === undefined || (s.z > land.minZ + MOOR.blend + 12 && s.x < land.maxX - MOOR.blend - 12)) continue;
    if (s.kind === 'barrow' || s.kind === 'fold' || s.kind === 'tor') pad(ground, s.x, s.z, s.w * p, s.w * p, 0, s.y, 3);
    else pad(ground, s.x, s.z, s.w / 2 + p, s.d / 2 + p, s.yaw, s.y, 2.5);
  }
  // The fens' blend and the pads mustn't fill the beck's channel: cut it again, and hold the seams' own heights on their line.
  carveBeck(ground, beckField, levels, halves, quays);
  holdEastSeams(ground);

  // The structures stand on the ground as it ends up.
  const beckWater = { line: beckLine, levels, halves };
  const waterLevel = (x: number, z: number) => waterAt(beckWater, x, z);
  // A boat floats, and a jetty stands from the water, wherever the bed under them is.
  const afloat = (x: number, z: number) => Math.max(ground.at(x, z), waterLevel(x, z) || -Infinity);
  const bridgeWater = beckLevelAt(nearestBeckAt(BRIDGE.x, (BRIDGE.from + BRIDGE.to) / 2));
  const [bridgeY0, bridgeY1] = [ground.at(BRIDGE.x, BRIDGE.from), ground.at(BRIDGE.x, BRIDGE.to)];
  const placed = structures.map((s): MoorStructure => {
    switch (s.kind) {
      case 'bridge': {
        // Its deck's ends over the water, and where the channel under it runs from and to, in its own frame.
        const at = nearestBeckAt(s.x, s.z);
        const mid = (BRIDGE.from + BRIDGE.to) / 2;
        const lz = beckLine[Math.round(at)][1] - mid;
        return { ...s, y: bridgeWater, extra: [bridgeY0 - bridgeWater, bridgeY1 - bridgeWater, lz - halfAt(at), lz + halfAt(at)] };
      }
      case 'quay': {
        // Its top at the bank behind it.
        const [ox, oz] = [-Math.sin(s.yaw), -Math.cos(s.yaw)];
        return { ...s, y: ground.at(s.x + ox * 4.2, s.z + oz * 4.2) };
      }
      case 'boat':
        return { ...s, y: afloat(s.x, s.z) - 0.08 };
      case 'jetty': case 'eelTraps':
        return { ...s, y: afloat(s.x, s.z) };
      default:
        return { ...s, y: ground.at(s.x, s.z) };
    }
  });

  const roadDistance = new Float32Array(ground.data.length).fill(Infinity);
  roads.forEach((r, i) => {
    const f = fields[i];
    for (let k = 0; k < roadDistance.length; k++) roadDistance[k] = Math.min(roadDistance[k], f.d[k] - r.width / 2);
  });

  const bridgeDeck = deckBetween([BRIDGE.x, BRIDGE.from], [BRIDGE.x, BRIDGE.to], BRIDGE.width, bridgeY0, bridgeY1, BRIDGE.rise);
  const decks = [bridgeDeck, ...boardwalk(ground)];
  const deckIndex = new Decks(decks);
  const heightAt = (x: number, z: number) => Math.max(ground.at(x, z), deckIndex.at(x, z));

  const colliders = new Colliders(walkable);
  const stoneAt: P2 = [crossing.x + crossing.width / 2 + 2.5, land.minZ + 1];
  const stone = { x: stoneAt[0], y: ground.at(...stoneAt), z: stoneAt[1], yaw: -Math.PI / 2, h: 2.9 };
  colliders.addCircle({ x: stone.x, z: stone.z, r: 0.55 });
  for (const s of placed) addStructureColliders(colliders, s);
  // The bridge's parapets, either side of its deck.
  for (const side of [-1, 1]) colliders.addBox({ x: BRIDGE.x + side * (BRIDGE.width / 2 + 0.2), z: (BRIDGE.from + BRIDGE.to) / 2, hw: 0.2, hd: (BRIDGE.to - BRIDGE.from) / 2 - 0.4, yaw: 0 });

  const walls = planWalls(roads, decks);
  for (const w of walls) addWallColliders(colliders, w);

  const paving = planPaving(roads);
  const rockfall = roads.find((r) => r.id === 'sunreach')!.line.at(-1)!;
  const plants = placePlants(ground, walkable, colliders, roadDistance, stone, rockfall, beckWater, deckIndex, paving).filter((p) => {
    const r = TRUNK[p.kind];
    if (!r || walkable.distance(p.x, p.z) > 2) return true;
    // A trunk or rock that would leave a gap too narrow for the widest body beside another is left out, so no pocket is shut in.
    if (narrowGap(colliders, p.x, p.z, r * p.scale)) return false;
    colliders.addCircle({ x: p.x, z: p.z, r: r * p.scale });
    return true;
  });

  const at = (z: number): P2 => pass.reduce((best, p) => (Math.abs(p[1] - z) < Math.abs(best[1] - z) ? p : best));
  const [sx, sz] = at(land.minZ + 6);
  const trees = plants.filter((p) => TREE_HEIGHT[p.kind]).map((p) => ({ x: p.x, y: p.y, z: p.z, height: TREE_HEIGHT[p.kind]! * p.scale }));
  const fen = fenRoadSeam();
  const kings = kingsroadSeam([1, 0]);
  const hh = MOOR.hollowhill;
  return {
    walkable,
    seam: { ...crest, heights: crest.heights.map((_, i) => ground.at(crest.minX + i * cell, crest.z)) },
    fenSeam: { ...fen, heights: fen.heights.map((_, i) => ground.at(fen.x, fen.minZ + i * fen.step)) },
    kingsSeam: { ...kings, heights: kings.heights.map((_, i) => ground.at(kings.x, kings.minZ + i * kings.step)) },
    ground,
    road: roads[0],
    roads,
    roadDistance,
    beck: beckWater,
    waterLevel,
    plants,
    structures: placed,
    walls,
    paving,
    decks,
    stone,
    rockfall,
    colliders,
    spawn: { x: sx, z: sz, yaw: Math.PI },
    landmarks: [
      { label: 'The crest', x: stone.x - 2, z: stone.z + 2 },
      { label: "Hob's Fold", x: -18, z: 226 },
      { label: 'The Long Stones', x: 66, z: 300 },
      { label: 'Cairnford', x: sq.x, z: sq.z },
      { label: 'The Old Fold', x: -30, z: 336 },
      { label: 'Fellgate Hall', x: 160, z: 338 },
      { label: 'The tollhouse', x: 226, z: 336 },
      { label: 'Turfmoss', x: -86, z: 356 },
      { label: 'The Blackmire', x: -126, z: 396 },
      { label: 'Raven Scar', x: -150, z: 226 },
      { label: 'Hollowhill', x: hh.x, z: hh.z + hh.r + 4 },
      { label: "Beck's Foot", x: 222, z: 524 },
      { label: 'The Rockfall Gap', x: rockfall[0] + 2, z: rockfall[1] - 12 },
    ],
    trees,
    sounds: [{ id: 'stream', x: BRIDGE.x, y: bridgeWater, z: 393, interior: null }],
    heightAt,
  };
}

/** The widest body's width, and a little over: the narrowest gap left between two things you can't walk through. */
const GAP = 2 * Math.max(CONFIG.player.bodyRadius, ...Object.values(CONFIG.enemies).map((e) => e.radius)) + 0.1;

/** Would a circle of radius `r` at (x, z) stand within GAP of a collider without touching it? */
function narrowGap(colliders: Colliders, x: number, z: number, r: number): boolean {
  for (const c of colliders.circles) {
    const gap = Math.hypot(x - c.x, z - c.z) - r - c.r;
    if (gap > 0 && gap < GAP) return true;
  }
  for (const b of colliders.boxes) {
    const [lx, lz] = toLocal(b, x, z);
    const gap = Math.hypot(Math.max(Math.abs(lx) - b.hw, 0), Math.max(Math.abs(lz) - b.hd, 0)) - r;
    if (gap > 0 && gap < GAP) return true;
  }
  return false;
}

/**
 * A road's heights eased to climb no steeper than `grade` anywhere: from its
 * first point on, and back from its last too if `last` is held (the Fen road
 * meets the seam's bank), so it cuts into a slope too steep for it.
 */
function regrade(line: readonly P2[], heights: readonly number[], grade: number, last: boolean): number[] {
  const h = [...heights];
  const run = (i: number) => Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]) * grade;
  for (let i = 1; i < h.length; i++) h[i] = Math.max(h[i - 1] - run(i), Math.min(h[i - 1] + run(i), h[i]));
  if (last) {
    h[h.length - 1] = heights[heights.length - 1];
    for (let i = h.length - 1; i > 1; i--) h[i - 1] = Math.max(h[i] - run(i), Math.min(h[i] + run(i), h[i - 1]));
  }
  return h;
}

/** Where along the beck's line (index + fraction) is nearest (x, z). */
function nearestBeck(line: readonly P2[], x: number, z: number): number {
  const { i, t } = nearestOnPolyline(line, x, z);
  return i + t;
}

/**
 * The beck's water level along its line: the bog's level at its source, below
 * its banks all the way, never rising downstream, and the fens' own level at
 * the Fen road's seam.
 */
function beckLevels(ground: HeightGrid, line: readonly P2[]): number[] {
  const banks = line.map(([x, z]) => {
    // The lowest of the ground a little either side: the water sits under both banks.
    let low = ground.at(x, z);
    for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) low = Math.min(low, ground.at(x + dx, z + dz));
    return low - 0.5;
  });
  let levels = smoothHeights(banks, 8, 3, {});
  levels[0] = Math.min(levels[0], MOOR.bog.level);
  for (let i = 1; i < levels.length; i++) levels[i] = Math.min(levels[i], levels[i - 1] - 0.004);
  // Its last stretch eases down to the fens' level, which it meets on the seam.
  const n = levels.length;
  const water = FEN_ROAD.beck.water;
  levels = levels.map((l, i) => (i > n - 60 ? lerp(l, water, smoothstep(n - 60, n - 8, i)) : l));
  for (let i = 1; i < n; i++) levels[i] = Math.min(levels[i], levels[i - 1]);
  levels[n - 1] = water;
  return levels;
}

/**
 * Cut the beck's channel: its bed under its water down its line, `halves`
 * wide; over the open moor its banks shelve down to a little over the water,
 * and between the town's quays (`quays` 1) the bank stands square at a quay's
 * height over the water, the quays' walls holding it.
 */
function carveBeck(ground: HeightGrid, field: LineField, levels: readonly number[], halves: readonly number[], quays: readonly number[]): void {
  const { depth, bank } = BECK_SHAPE;
  for (let k = 0; k < ground.data.length; k++) {
    const d = field.d[k];
    if (!Number.isFinite(d)) continue;
    const level = along(levels, field.at[k]);
    const half = along(halves, field.at[k]);
    const q = along(quays, field.at[k]);
    // A flatter, deeper bed between the quays.
    const bed = level - (depth + 0.35 * q) * (1 - Math.min(1, (d / (half + 0.6)) ** (2 + 4 * q))) - 0.05;
    // Between the quays the bed runs on under their walls, so the bank's slope is hidden inside them.
    if (d <= half + 0.6 * (1 - q) + 1.6 * q) {
      ground.data[k] = Math.min(ground.data[k], bed);
      continue;
    }
    // The moor's banks: no higher than a little over the water near it, easing back to the land.
    const top = level + 0.2 + (d - half - 0.6) * 0.45;
    const t = smoothstep(half + 0.6 + bank, half + 0.6, d);
    const natural = lerp(ground.data[k], Math.min(ground.data[k], top), t);
    // The quays' banks: up at the quay's height over the water, wherever the town's ground lies lower.
    const quayed = lerp(ground.data[k], Math.max(ground.data[k], level + TOWN.quays.rise), smoothstep(half + 7, half + 1, d));
    ground.data[k] = lerp(natural, quayed, q);
  }
}

/** The water's level at (x, z): the beck's near its line, the Blackmire's pools, or NaN. */
function waterAt(beck: { line: readonly P2[]; levels: readonly number[]; halves: readonly number[] }, x: number, z: number): number {
  if (inBog(x, z) > 0.5) return MOOR.bog.level;
  const { d, i, t } = nearestOnPolyline(beck.line, x, z);
  if (d <= along(beck.halves, i + t) + BECK_SHAPE.bank + 2) return along(beck.levels, i + t);
  // Beck's Foot's pools hold the fens' water a little over it.
  if (Math.hypot(x - 222, z - 512) < 44) return 0.35;
  return NaN;
}

/** Ease the ground within a `hw` by `hd` box (turned by `yaw`) to `y`, blending back by `shoulder` m. */
function pad(ground: HeightGrid, cx: number, cz: number, hw: number, hd: number, yaw: number, y: number, shoulder: number): void {
  const r = Math.hypot(hw, hd) + shoulder;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  for (let j = ground.row(cz - r); j <= ground.row(cz + r); j++) {
    for (let i = ground.col(cx - r); i <= ground.col(cx + r); i++) {
      const dx = ground.x(i) - cx;
      const dz = ground.z(j) - cz;
      const lx = Math.abs(dx * c - dz * s) - hw;
      const lz = Math.abs(dx * s + dz * c) - hd;
      const out = Math.hypot(Math.max(lx, 0), Math.max(lz, 0));
      if (out > shoulder) continue;
      const k = j * ground.cols + i;
      ground.data[k] = lerp(ground.data[k], y, smoothstep(shoulder, 0, out));
    }
  }
}

/**
 * Blend the first MOOR.blend m of rows to the crest's heights: exactly them on
 * the line, all the moor's own a band on. Past the crest's ends the north
 * edge blends to its end heights, so the Greyspine runs on east and west.
 */
function meetCrest(ground: HeightGrid, crest: Seam): void {
  const edge = (x: number) => {
    const k = Math.max(0, Math.min(crest.heights.length - 1, Math.round((x - crest.minX) / crest.step)));
    return crest.heights[k];
  };
  for (let j = 0; j < ground.rows; j++) {
    const t = smoothstep(0, MOOR.blend, ground.z(j) - ground.z0);
    if (t >= 1) break;
    for (let i = 0; i < ground.cols; i++) {
      const k = j * ground.cols + i;
      const h = edge(ground.x(i));
      ground.data[k] = j === 0 ? h : lerp(h, ground.data[k], t);
    }
  }
}

/** The east edge's heights where a neighbour meets it: Aldhaven's along the Kingsroad's seam, the Sallows' along the Fen road's. */
function eastEdgeHeight(z: number): number {
  return z <= KINGSROAD.maxZ ? kingsroadHeight(z) : fenRoadHeight(z);
}

/**
 * Blend the last MOOR.blend m of columns, along the seams of the east edge
 * (the Kingsroad's, then the Fen road's), to their heights: exactly them on
 * the line, fading over a band north of the Kingsroad's end. Within a few
 * metres of the Kingsroad (`road`, its line's field) the road's own bed is
 * left be: the seam's cutting meets it on the line.
 */
function meetEast(ground: HeightGrid, road: LineField, width: number): void {
  const { x } = FEN_ROAD;
  const minZ = KINGSROAD.minZ;
  const maxZ = FEN_ROAD.maxZ;
  const last = ground.cols - 1;
  if (ground.x(last) !== x || KINGSROAD.x !== x) throw new Error("Brackenmoor's east edge must be the Kingsroad's and the Fen road's line");
  for (let j = 0; j < ground.rows; j++) {
    const z = ground.z(j);
    // Fully along the seams, fading over a band past either end of them.
    const w = smoothstep(minZ - 24, minZ, z) * smoothstep(maxZ + 24, maxZ, z);
    if (w <= 0) continue;
    const target = eastEdgeHeight(Math.max(minZ, Math.min(maxZ, z)));
    for (let i = last; i >= 0; i--) {
      const t = smoothstep(0, MOOR.blend, x - ground.x(i));
      if (t >= 1) break;
      const k = j * ground.cols + i;
      const on = z >= minZ && z <= maxZ;
      const keep = smoothstep(width / 2 + 4, width / 2 + 1, road.d[k]) * (i === last ? 0 : 1);
      const blended = i === last && on ? target : lerp(ground.data[k], lerp(ground.data[k], target, w), 1 - t);
      ground.data[k] = lerp(blended, ground.data[k], keep);
    }
  }
}

/** Set the east edge's heights along both seams' line to the seams' exactly. */
function holdEastSeams(ground: HeightGrid): void {
  const last = ground.cols - 1;
  for (let j = ground.row(KINGSROAD.minZ); j <= ground.row(FEN_ROAD.maxZ); j++) ground.data[j * ground.cols + last] = eastEdgeHeight(ground.z(j));
}

/**
 * Where you can walk: the pass's corridor on over the crest from
 * CONFIG.world.ground.seam before it (overlapping Oakvale's), along the road
 * until the moor opens, then the moor itself, and out over the east edge by
 * CONFIG.world.ground.seam: along the Kingsroad into Aldhaven, along the Fen
 * road into the Sallows. Convex areas that
 * overlap where they join.
 */
function walkableAreas(crossX: number, line: readonly P2[]): P2[][] {
  const { land, opening } = MOOR;
  const { half } = PASS; // the pass's corridor runs on at Oakvale's width
  const top = land.minZ - CONFIG.world.ground.seam;
  const xAt = (z: number) => line.reduce((best, p) => (Math.abs(p[1] - z) < Math.abs(best[1] - z) ? p : best))[0];
  const mid = land.minZ + opening.corridor;
  const bx = xAt(mid);
  const over = FEN_ROAD.x + CONFIG.world.ground.seam;
  return [
    // Straight on over the crest at its width, as Oakvale's last stretch runs.
    [
      [crossX - half, top],
      [crossX + half, top],
      [crossX + half, land.minZ + 6],
      [crossX - half, land.minZ + 6],
    ],
    // Along the road to where the moor opens.
    [
      [crossX - half, land.minZ + 4],
      [crossX + half, land.minZ + 4],
      [bx + half, mid + 2],
      [bx - half, mid + 2],
    ],
    // Out from the corridor, widening onto the moor.
    [
      [bx - half, mid],
      [bx + half, mid],
      [bx + 46, 200],
      [bx - 46, 200],
    ],
    // The moor.
    [
      [-205, 197],
      [238, 179],
      [244, 470],
      [238, 552],
      [-200, 556],
      [-210, 300],
    ],
    // Out along the Kingsroad through the cutting, over the seam into Aldhaven.
    [
      [228, 322],
      [over, 328],
      [over, 344],
      [228, 340],
    ],
    // Out along the Fen road over the seam.
    [
      [228, 518],
      [over, 518],
      [over, 562],
      [228, 556],
    ],
  ];
}

// ------------------------------------------------------------------ what stands where

/** How far round its footprint each kind's ground is levelled (m), for those that are; for round things, the share of their radius. */
const PADS: Partial<Record<MoorStructureKind, number>> = {
  house: 1, inn: 1.2, mootHall: 1.2, chapel: 1, smithy: 1, mill: 0.8, cottage: 1, croft: 1, ruin: 0.8, hall: 2, gatehouse: 0.5,
  tollhouse: 1, fold: 1.1, tent: 0.6, hut: 0.5, stall: 0.4, garden: 0.5, hide: 0.5, barrow: 0.75, cartShed: 0.8, stable: 1,
  campfire: 0.6, tor: 0.6, sundial: 4.6,
};

/** Its footprint, if you can't walk through it: half sizes in its own frame, or a circle. */
function addStructureColliders(c: Colliders, s: MoorStructure): void {
  const box = (hw: number, hd: number, ox = 0, oz = 0) => {
    const cos = Math.cos(s.yaw);
    const sin = Math.sin(s.yaw);
    c.addBox({ x: s.x + ox * cos + oz * sin, z: s.z - ox * sin + oz * cos, hw, hd, yaw: s.yaw });
  };
  switch (s.kind) {
    case 'house': {
      box(s.w / 2 + 0.1, s.d / 2 + 0.1);
      // Its lean-to at the back.
      const { outshut } = houseLook(s.variant);
      if (outshut !== 0) box(s.w / 4, 1.05, outshut * (s.w / 4), -s.d / 2 - 1.0);
      break;
    }
    case 'inn':
      box(s.w / 2 + 0.1, s.d / 2 + 0.1);
      // Its porch, and the kitchen's lean-to.
      box(1.5, 0.85, 0, s.d / 2 + 0.8);
      box(s.w / 4, 1.25, -s.w / 4, -s.d / 2 - 1.2);
      break;
    case 'mootHall':
      box(s.w / 2 + 0.1, s.d / 2 + 0.1);
      // The stair up its gable.
      box(0.65, s.d / 2, -s.w / 2 - 0.75, 0);
      break;
    case 'chapel': case 'mill': case 'cottage': case 'croft': case 'hall': case 'tollhouse': case 'hut': case 'stable':
      box(s.w / 2 + 0.1, s.d / 2 + 0.1);
      break;
    case 'smithy':
      // Open at the front: its back and side walls, and the forge.
      box(s.w / 2, 0.3, 0, -s.d / 2 + 0.3);
      box(0.3, s.d / 2, -s.w / 2 + 0.3, 0);
      box(0.3, s.d / 2, s.w / 2 - 0.3, 0);
      box(0.8, 0.8, -s.w / 4, -s.d / 4);
      break;
    case 'cartShed':
      // Open-fronted: its back wall and its end walls.
      box(s.w / 2, 0.3, 0, -s.d / 2 + 0.3);
      box(0.3, s.d / 2, -s.w / 2 + 0.3, 0);
      box(0.3, s.d / 2, s.w / 2 - 0.3, 0);
      break;
    case 'ruin':
      // Its standing walls, the doorway gap left.
      box(s.w / 2, 0.35, 0, -s.d / 2);
      box(0.35, s.d / 2, -s.w / 2, 0);
      box(s.w / 4, 0.35, s.w / 4, s.d / 2);
      break;
    case 'fold':
      for (let a = 0.5; a < Math.PI * 2 - 0.3; a += 0.42) c.addCircle({ x: s.x + Math.sin(s.yaw + a) * s.w, z: s.z + Math.cos(s.yaw + a) * s.w, r: 0.45 });
      break;
    case 'gatehouse':
      box(0.6, 0.6, -s.w / 2, 0);
      box(0.6, 0.6, s.w / 2, 0);
      break;
    case 'townGate':
      box(0.7, 0.7, -s.w / 2 - 0.5, 0);
      box(0.7, 0.7, s.w / 2 + 0.5, 0);
      break;
    case 'tollgate':
      // Its posts either side of the road; the bar is raised.
      box(0.2, 0.2, -s.w / 2, 0);
      box(0.2, 0.2, s.w / 2, 0);
      break;
    case 'quay':
      // Its parapet along the water's edge.
      box(s.w / 2, 0.25, 0, 0.2);
      break;
    case 'cairn': case 'longStone': case 'borderStone': case 'marketCross': case 'well': case 'tor':
      c.addCircle({ x: s.x, z: s.z, r: s.kind === 'cairn' ? 0.5 + s.h * 0.25 : s.kind === 'marketCross' ? 1.2 : s.kind === 'well' ? 0.95 : s.kind === 'tor' ? s.w * 0.55 : 0.55 });
      break;
    case 'signpost': case 'ragPole': case 'flag': case 'postbox': case 'bollard': case 'waymark': case 'sundial':
      c.addCircle({ x: s.x, z: s.z, r: s.kind === 'waymark' || s.kind === 'sundial' ? 0.3 : 0.15 });
      break;
    case 'mapboard':
      box(0.8, 0.15);
      break;
    case 'tent': case 'stall': case 'cart': case 'peatStack': case 'crates': case 'lookout': case 'trough': case 'bench': case 'barrels': case 'woodpile':
    case 'wagon': case 'hayrick': case 'hedge': case 'blocks': case 'rack':
      box(s.w / 2, s.d / 2);
      break;
    case 'hollowhill':
      // The door's frame and the stone face it's set in, across the passage's end.
      box(s.w / 2 + 1.6, 0.6, 0, 0);
      break;
    case 'dromos':
      // Its two walls either side of the passage, from the door out to the mouth.
      box(0.4, s.d / 2, -s.w / 2 - 0.4, s.d / 2);
      box(0.4, s.d / 2, s.w / 2 + 0.4, s.d / 2);
      break;
    default:
      break;
  }
}

/** The walls' stretches as boxes, for walking into. */
function addWallColliders(c: Colliders, w: MoorWall): void {
  for (let i = 0; i < w.pts.length - 1; i++) {
    const [ax, az] = w.pts[i];
    const [bx, bz] = w.pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) continue;
    c.addBox({ x: (ax + bx) / 2, z: (az + bz) / 2, hw: 0.32, hd: len / 2, yaw: Math.atan2(bx - ax, bz - az) });
  }
}

/** The yaw a model turns by to face from (x, z) toward (tx, tz). */
function facing(x: number, z: number, tx: number, tz: number): number {
  return Math.atan2(tx - x, tz - z);
}

/** A signpost's boards, each pointing at a place from where it stands. */
function ways(x: number, z: number, ...to: P2[]): number[] {
  return to.map(([tx, tz]) => facing(x, z, tx, tz));
}

/** Every building and set piece, by place. Their heights are read again once the ground's done. */
function placeStructures(ground: HeightGrid, roads: readonly MoorRoad[], beck: { line: readonly P2[]; half(at: number): number; level(at: number): number }): MoorStructure[] {
  const out: MoorStructure[] = [];
  let seed = 1;
  const add = (kind: MoorStructureKind, x: number, z: number, yaw: number, w = 1, d = 1, h = 1, variant = 0, extra?: readonly number[]) => {
    if (kind === 'yard') {
      // A back yard runs out from its house's back wall as far as it's clear of the roads, the beck and the yard walls.
      const clearAt = (u: number, v: number) => {
        const px = x + Math.cos(yaw) * u - Math.sin(yaw) * v;
        const pz = z - Math.sin(yaw) * u - Math.cos(yaw) * v;
        const b = nearestOnPolyline(beck.line, px, pz);
        return (
          roads.every((r) => nearestOnPolyline(r.line, px, pz).d > r.width / 2 + 0.5) &&
          b.d > beck.half(b.i + b.t) + 1.4 &&
          YARD_WALLS.every((wl) => nearestOnPolyline(wl, px, pz).d > 0.6)
        );
      };
      let depth = 0;
      for (let v = 0.5; v <= d; v += 0.25) {
        if (![-w / 2 + 0.3, 0, w / 2 - 0.3].every((u) => clearAt(u, v))) break;
        depth = v;
      }
      if (depth < 1.5) return;
      extra = [depth];
    }
    out.push({ kind, x, y: ground.at(x, z), z, yaw, w, d, h, variant, seed: seed++, ...(extra ? { extra } : {}) });
  };
  const road = (id: string) => roads.find((r) => r.id === id)!;

  // Passfoot: Hob's Fold, Wenna's croft and fold at the end of the first track, and a weathered map board by the road.
  add('fold', -36, 222, 1.2, 6);
  add('croft', -30.5, 236.6, Math.PI / 2, 9, 4.6, 1);
  add('peatStack', -27.6, 243.6, 0.3, 2.2, 1.2, 1.1);
  add('woodpile', -34.5, 231, 0, 2.2, 0.9, 1);
  add('mapboard', 5, 211, facing(5, 211, -1, 215));
  add('signpost', 2.2, 217.6, 0, 1, 1, 1, 0, ways(2.2, 217.6, [0, 150], [10, 300], [-24, 224]));

  // The Long Stones, black against the sky along the ridge, and their hawthorns (planted with the plants).
  const { from, to, count } = MOOR.longStones;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const x = lerp(from[0], to[0], t);
    const z = lerp(from[1], to[1], t) + Math.sin(i * 1.7) * 0.6;
    add('longStone', x, z, facing(from[0], from[1], to[0], to[1]) + Math.PI / 2 + Math.sin(i * 3.1) * 0.15, 1, 1, 2.9 + ((i * 37) % 10) / 8, i);
  }

  // Cairnford (cairnford.ts) and its bridge, its quays along the beck either side of it.
  placeCairnford({ add, road, ground, beck });
  add('bridge', BRIDGE.x, (BRIDGE.from + BRIDGE.to) / 2, 0, BRIDGE.width, BRIDGE.to - BRIDGE.from, BRIDGE.rise);
  placeQuays(add, beck, out);
  add('signpost', 48.6, 411.4, 0, 1, 1, 1, 0, ways(48.6, 411.4, [46, 380], [24, 460], [100, 432]));

  // Waymark stones along the pass road and the Kingsroad, a stone every so often by the verge.
  for (const [id, every, start, stop] of [['pass', 46, 30, 170], ['kingsroad', 44, 70, 190], ['fen', 50, 40, 230], ['sunreach', 48, 30, 150]] as const) {
    const r = road(id);
    const lens = lengths(r.line);
    for (let s = start; s < Math.min(stop, lens.at(-1)! - 10); s += every) {
      const p = pointAlong(r.line, s);
      const side = Math.floor(s / every) % 2 ? 1 : -1;
      const off = r.width / 2 + 1.3;
      add('waymark', p.x - p.dz * off * side, p.z + p.dx * off * side, Math.atan2(p.dx, p.dz), 1, 1, 0.9 + (s % 3) * 0.12);
    }
  }

  // The Old Fold: a burnt longhouse the Kerchiefs camp in, its broken fold, their tent, fire and rag pole.
  add('ruin', -44, 331, 0.35, 12, 5.5, 1);
  add('fold', -27, 345, 0.8, 5, 1, 1, 1);
  add('tent', -34.5, 337.6, facing(-34.5, 337.6, -41, 334), 3, 3.6, 1);
  add('campfire', -38.6, 336, 0, 1.4, 1.4, 1);
  add('ragPole', -49.5, 324.5, 0.4, 1, 1, 3.4);
  add('crates', -42, 337.5, 0.5, 1.6, 1.2, 1);
  add('woodpile', -52, 336, 0.35, 2.4, 1, 1.1);

  // Three abandoned crofts, their doors hanging open, an empty fold by each.
  for (const [x, z, fx, fz] of [[-92, 262, -101, 250], [112, 472, 121, 485], [-128, 498, -116, 509]] as const) {
    add('croft', x, z, facing(x, z, x + 10, z - 4), 8.5, 4.4, 1, 1);
    add('fold', fx, fz, 0.4, 4.5, 1, 1, 1);
  }
  // Empty sheepfolds out on the open moor, and the moor's gritstone tors on its rises.
  for (const [x, z, r] of [[-60, 470, 5], [84, 520, 4.5], [-150, 300, 5], [150, 500, 4]] as const) add('fold', x, z, (x * 0.37) % 6, r, 1, 1, 1);
  for (const [x, z, r, v] of [[-70, 240, 3.2, 0], [70, 248, 2.6, 1], [100, 290, 2.2, 2], [-100, 455, 3, 3], [30, 515, 2.8, 4], [140, 395, 2.4, 5], [-170, 330, 3.4, 6], [205, 270, 2.6, 7], [-30, 440, 2.4, 8]] as const) {
    add('tor', x, z, (x * 0.13 + z * 0.07) % 6, r, r, 1, v);
  }

  // Fellgate Hall in its walled park in the enclosure: dressed stone, its drive up from the Kingsroad through
  // the gate posts to its porch, the stable block across the forecourt, a knot of clipped hedges round a sundial,
  // and the noble house's flag.
  add('hall', 160, 318, 0, 18, 11, 3);
  add('gatehouse', 160, 346, 0, 6, 1, 1);
  add('flag', 150.5, 335.5, 0, 1, 1, 9);
  add('stable', 174.6, 331, -Math.PI / 2, 12, 6, 1);
  add('sundial', 147.6, 324.6, 0, 1, 1, 1);
  for (const [x, z, w, d] of [[147.6, 320.4, 6, 1.1], [147.6, 328.8, 6, 1.1], [143.4, 324.6, 1.1, 5], [151.8, 321.6, 1.1, 1.2], [151.8, 327.6, 1.1, 1.2]] as const) add('hedge', x, z, 0, w, d, 1.1);

  // The Kingsroad's tollhouse at the escarpment's top beside its gate, the gate's bar raised: the road runs on
  // through the cutting to Aldhaven.
  add('tollhouse', 231, 324.6, 0, 6, 5, 1);
  add('bench', 227.2, 327.6, 0, 1.6, 0.5, 1);
  const gate = road('kingsroad').line.reduce((best, p) => (Math.abs(p[0] - 239) < Math.abs(best[0] - 239) ? p : best));
  add('tollgate', gate[0], gate[1], Math.PI / 2, 6, 1, 1);
  add('signpost', 117.6, 366.2, 0, 1, 1, 1, 0, ways(117.6, 366.2, [40, 372], [180, 349], [130, 320]));

  // Turfmoss, the peat cutters' crofts on the Blackmire's edge round their green; their stacks, the banks they cut,
  // a drying rack and a peat cart.
  add('croft', -95, 341, facing(-95, 341, -86, 353), 8, 4.4, 1);
  add('croft', -106, 354, facing(-106, 354, -87, 354), 7.5, 4.2, 1);
  add('croft', -77, 366, facing(-77, 366, -86, 353), 8, 4.4, 1);
  add('peatStack', -100, 364, 0.6, 2.4, 1.3, 1.2);
  add('peatStack', -86, 336, 1.2, 2, 1.2, 1);
  add('rack', -80, 344, 0.9, 3.4, 1.0, 1);
  add('cart', -90, 347, 2.4, 2, 3.4, 1, 1);
  for (const [x, z, yaw] of [[-106, 378, 0.9], [-114, 370, 0.6], [-98, 386, 1.2]] as const) add('peatBank', x, z, yaw, 9, 1.4, 1);
  // The Kerchiefs' hide in a drained pool, out across the boardwalk.
  add('hide', -152, 430, 0.5, 4, 3, 1);
  add('crates', -148, 434, 0.2, 1.6, 1.2, 1);

  // Raven Scar: the Kerchiefs' tents in the quarry pit round their fire, red rags on poles along its lip, the ladder
  // path up the scar to the lookout, the old quarry's cut blocks and its timber crane, and a fresh grave behind it
  // with a shepherd's crook.
  const { scar } = MOOR;
  const hearth: P2 = [scar.x + 1, scar.z + 3];
  add('tent', scar.x - 8, scar.z - 2, facing(scar.x - 8, scar.z - 2, ...hearth), 3, 3.6, 1);
  add('tent', scar.x + 6, scar.z - 6, facing(scar.x + 6, scar.z - 6, ...hearth), 3, 3.6, 1);
  add('tent', scar.x - 7, scar.z + 9, facing(scar.x - 7, scar.z + 9, ...hearth), 3.4, 4, 1);
  add('campfire', ...hearth, 0, 1.4, 1.4, 1);
  add('crates', scar.x + 7, scar.z + 3, 0.4, 1.6, 1.2, 1);
  add('barrels', scar.x - 12, scar.z + 4, 0.2, 1.4, 1.4, 1, 1);
  add('blocks', scar.x - 15, scar.z - 9, 0.3, 3.4, 2.2, 1);
  add('blocks', scar.x + 12, scar.z - 9, -0.4, 2.8, 2, 1, 1);
  add('ladder', scar.x + 4, scar.z - scar.hd + 1.6, Math.PI, 1, 1, scar.depth);
  add('lookout', scar.x + 4, scar.z - scar.hd - 3, 0, 3, 3, 1);
  add('crane', scar.x - 8, scar.z - scar.hd - 2.5, 0.2, 1, 1, 7);
  for (const [x, z] of [[scar.x - 14, scar.z - scar.hd - 4], [scar.x - 26, scar.z - 4], [scar.x + 14, scar.z - scar.hd - 3], [scar.x - 3, scar.z - scar.hd - 5]] as const) add('ragPole', x, z, (Math.abs(x * 7) % 3) - 1.5, 1, 1, 3.2);
  add('grave', scar.x - 12, scar.z - scar.hd - 14, 0.3, 1, 2, 1);

  // The High Fells' barrow field: seven small barrows, three broken open with the diggers' spoil, and Hollowhill:
  // its stone door at the end of a passage walled in drystone, cut into the mound from its south foot.
  const hh = MOOR.hollowhill;
  const barrows: [number, number, boolean][] = [[146, 196, false], [156, 232, true], [214, 236, true], [232, 206, false], [222, 178, false], [164, 176, true], [204, 252, false]];
  for (const [x, z, broken] of barrows) {
    const yaw = facing(x, z, hh.x, hh.z) + Math.PI;
    add('barrow', x, z, yaw, 5, 5, 2, broken ? 1 : 0);
    if (broken) add('spoil', x + Math.sin(yaw) * 7 + Math.cos(yaw) * 2.5, z + Math.cos(yaw) * 7 - Math.sin(yaw) * 2.5, 0.5, 2.6, 2.6, 1);
  }
  const door = hh.z + hh.door;
  const mouth = hh.z + hh.r + 1.2;
  // The passage's walls, from the door to its mouth: their tops follow the mound's face either side.
  const floor0 = ground.at(hh.x, door);
  const len = mouth - door;
  const tops: number[] = [];
  for (let k = 0; k <= Math.ceil(len); k++) {
    const z = Math.min(mouth, door + k);
    // Over the door's floor: as high as the mound beside them, and never under knee height over the passage's own.
    const beside = Math.min(ground.at(hh.x - hh.passage - 2.4, z), ground.at(hh.x + hh.passage + 2.4, z));
    tops.push(Math.max(ground.at(hh.x, z) + 0.6, beside) - floor0);
  }
  // The door's face of dressed stone runs up past the walls' tops to the turf, just under the mound behind it.
  const back = Math.min(...[-1, 0, 1].map((s) => ground.at(hh.x + s * (hh.passage + 2.45), door - 2)));
  add('hollowhill', hh.x, door, 0, 4, 1, 3.4, 0, [back - floor0 - 0.25, tops[0]]);
  add('dromos', hh.x, door, 0, hh.passage * 2, len, 1, 0, tops);
  add('spoil', hh.x + 6, mouth + 2, 0.4, 2.8, 2.8, 1);
  add('crates', hh.x - 4.6, mouth + 1.4, 0.7, 1.6, 1.2, 1);

  // Beck's Foot: the eel-trapper's hut on the south bank by the Fen road, a jetty out into the beck with a boat at
  // it and eel traps in the water; a smugglers' boat drawn up on the bank, its crates beside it.
  add('hut', 218.4, 510.6, 0, 4, 3.5, 1);
  add('jetty', 225.4, 505.4, Math.PI, 1.6, 5.4, 1);
  add('boat', 227.6, 503.4, 0.15, 1, 3.6, 1);
  add('eelTraps', 231.4, 503, 0.4, 3, 2, 1);
  add('boat', 240.4, 518.2, 1.1, 1, 4, 1);
  add('crates', 237, 520.6, 0.3, 1.6, 1.2, 1);

  // At the Rockfall Gap, the Sunreach road's last signpost, a plank nailed across its board for Vinhold, and a cart
  // left broken where the rocks came down.
  const end = road('sunreach').line.at(-1)!;
  add('signpost', end[0] + 6, end[1] - 10, 0, 1, 1, 1, 1, ways(end[0] + 6, end[1] - 10, [end[0], end[1] + 20], [46, 405]));
  add('cart', end[0] - 4.6, end[1] - 4, 0.7, 2, 3.4, 1, 2);
  return out;
}

/**
 * The quays: a stone wall square along each bank of the beck where it runs
 * through Cairnford, a stretch every few metres, its face to the water, but
 * where the bridge's abutments and the mill's wall stand at the water's edge.
 */
function placeQuays(add: (kind: MoorStructureKind, x: number, z: number, yaw: number, w?: number, d?: number, h?: number, variant?: number) => void, beck: { line: readonly P2[]; half(at: number): number }, placed: readonly MoorStructure[]): void {
  const { from, to } = TOWN.quays;
  const lens = lengths(beck.line);
  const mill = placed.find((s) => s.kind === 'mill')!;
  const start = lens[beck.line.findIndex((p) => p[0] >= from)];
  const stop = lens[beck.line.findIndex((p) => p[0] >= to)];
  const step = 3.2;
  for (let s = start + step / 2; s < stop; s += step) {
    const p = pointAlong(beck.line, s);
    const at = nearestBeck(beck.line, p.x, p.z);
    for (const side of [-1, 1]) {
      const [nx, nz] = [-p.dz * side, p.dx * side];
      const off = beck.half(at) + 0.45;
      const [x, z] = [p.x + nx * off, p.z + nz * off];
      if (Math.abs(x - BRIDGE.x) < BRIDGE.width / 2 + 1.4) continue;
      if (side > 0 && Math.abs(x - mill.x) < mill.w / 2 + 0.6 && Math.abs(z - mill.z) < mill.d / 2 + 2) continue;
      // Its face (its own +Z) toward the water.
      add('quay', x, z, Math.atan2(-nx, -nz), step + 0.1, 1, 1);
    }
  }
}

/** The Blackmire's boardwalk from Turfmoss out across the bog to the Kerchiefs' hide: decks a little over the peat. */
function boardwalk(ground: HeightGrid): Deck[] {
  const pts: P2[] = [[-92, 362], [-104, 372], [-116, 384], [-128, 398], [-138, 410], [-146, 422]];
  const decks: Deck[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const ya = Math.max(ground.at(...a), MOOR.bog.level) + 0.3;
    const yb = Math.max(ground.at(...b), MOOR.bog.level) + 0.3;
    // Each a little longer than the gap, so they overlap where they meet.
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ex = ((b[0] - a[0]) / len) * 0.6;
    const ez = ((b[1] - a[1]) / len) * 0.6;
    decks.push(deckBetween([a[0] - ex, a[1] - ez], [b[0] + ex, b[1] + ez], 1.6, ya, yb));
  }
  return decks;
}

/** Cairnford's setts: its square and the waterside below it, the market street, the Kingsroad to the east gate, and the street over the bridge's south end. */
function planPaving(roads: readonly MoorRoad[]): Paving {
  const sq = MOOR.square;
  const part = (id: string, keep: (x: number, z: number) => boolean) => roads.find((r) => r.id === id)!.line.filter(([x, z]) => keep(x, z));
  // Out to the houses' fronts and a little under them.
  const half = 2 + TOWN.set + 0.25;
  return {
    rects: [
      { minX: sq.x - sq.hw, maxX: sq.x + sq.hw, minZ: sq.z - sq.hd, maxZ: sq.z + sq.hd },
      { minX: sq.x - sq.hw + 2, maxX: sq.x + sq.hw + 6, minZ: sq.z + sq.hd, maxZ: sq.z + sq.hd + 4.6 },
    ],
    strips: [
      { line: part('pass', (_, z) => z > 321 && z < sq.z - sq.hd + 1), half },
      { line: part('kingsroad', (x) => x > sq.x + sq.hw - 1 && x < TOWN.gate + 2), half },
      { line: part('sunreach', (_, z) => z < 420), half: 1.7 + TOWN.set + 0.25 },
      { line: part('fen', (x) => x < 82), half: 1.7 + TOWN.set + 0.25 },
    ],
  };
}

/** The back walls of the Kingsroad's yards, north and south of it. */
const YARD_WALLS: P2[][] = [
  [[56, 350.5], [70, 349.2], [80, 347.8], [92, 346.2]],
  [[66, 386.4], [80, 384.6], [94, 382]],
];

/**
 * The walls: field walls of rough gritstone across the moor, the landlord's
 * enclosure in dressed stone (built straight across an older wall) and
 * Fellgate Hall's park inside it, Cairnford's back-yard walls and the
 * chapel's graveyard. Each is broken where a road, a track, the beck or a deck
 * runs through.
 */
function planWalls(roads: readonly MoorRoad[], decks: readonly Deck[]): MoorWall[] {
  const ch = TOWN.chapel;
  const rough: P2[][] = [
    // Across the middle moor, from the Old Fold's slopes east to the Long Stones' ridge.
    [[-70, 296], [-40, 290], [-10, 290], [12, 296], [24, 302]],
    [[-60, 410], [-20, 412], [-2, 416]],
    [[-50, 440], [-30, 470], [-14, 500], [-10, 520]],
    [[60, 446], [80, 470], [96, 500], [120, 520], [160, 528]],
    [[-70, 250], [-62, 280], [-62, 300]],
    [[44, 316], [70, 318], [100, 322], [114, 326]],
    // Cairnford's intakes: the walled fields round the town, north of it either side of the market street and south of the beck.
    [[-14, 324], [-10, 304], [16, 300]],
    [[48, 318], [62, 322], [86, 330], [90, 344]],
    [[-6, 432], [10, 446], [28, 446]],
    [[56, 440], [84, 446], [108, 452], [112, 440]],
    // The old wall the enclosure was built straight across.
    [[84, 300], [118, 294], [150, 290]],
    // The back walls of the Kingsroad's yards, and the wagon yard's.
    ...YARD_WALLS,
    [[92, 346.2], [106, 345.4], [106, 356]],
    [[91, 346.2], [91, 357]],
    // The chapel's graveyard wall, its gate toward the town.
    [[ch.x + 10.5, ch.z - 3], [ch.x + 10.5, ch.z - 12], [ch.x - 12, ch.z - 12], [ch.x - 12, ch.z + 12], [ch.x + 10.5, ch.z + 12], [ch.x + 10.5, ch.z + 3]],
  ];
  const dressed: P2[][] = [
    // The enclosure: its outer wall and the fields inside it.
    [[118, 258], [218, 258], [218, 425], [118, 425], [118, 258]],
    // The fields' cross walls, each with a gate gap.
    [[118, 300], [150, 300]],
    [[156, 300], [218, 300]],
    [[118, 392], [182, 392]],
    [[188, 392], [218, 392]],
    // Fellgate Hall's park: its gate on the drive, in from the Kingsroad.
    [[157, 346], [140, 346], [140, 306], [182, 306], [182, 346], [163, 346]],
  ];
  const deckIndex = new Decks(decks);
  const beck = sampleCurve(BECK, 2);
  const open = (x: number, z: number) =>
    roads.some((r) => nearestOnPolyline(r.line, x, z).d < r.width / 2 + 1.6) || deckIndex.on(x, z, 1) || nearestOnPolyline(beck, x, z).d < TOWN.quays.half + 1.5;
  const out: MoorWall[] = [];
  const split = (line: readonly P2[], isDressed: boolean) => {
    // Every metre or two along it, kept where nothing runs through.
    let run: P2[] = [];
    const flush = () => {
      if (run.length > 1) out.push({ pts: run, dressed: isDressed });
      run = [];
    };
    for (let i = 0; i < line.length - 1; i++) {
      const [a, b] = [line[i], line[i + 1]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.round(len / 1.8));
      for (let k = i === 0 ? 0 : 1; k <= n; k++) {
        const p: P2 = [lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)];
        if (open(...p)) flush();
        else run.push(p);
      }
    }
    flush();
  };
  for (const l of rough) split(l, false);
  for (const l of dressed) split(l, true);
  return out;
}

/**
 * The moor's plants: bracken and heather in their patches over where you
 * walk and up the rim, low bushes and gorse, grey rocks (more on slopes and
 * the fells), gritstone crags and scree breaking the rim's steep slopes, a
 * few lone pines, hawthorns at the Long Stones, rowans by the beck, cotton
 * grass on the bog, reeds in the wet where the beck widens toward the fens,
 * boulders round Raven Scar's crags, and the rockfall across the Sunreach
 * road's end. Seeded, so the same every time.
 */
function placePlants(
  ground: HeightGrid,
  walkable: Walkable,
  colliders: Colliders,
  roadDistance: Float32Array,
  stone: { x: number; z: number },
  rockfall: P2,
  beck: { line: readonly P2[]; levels: readonly number[]; halves: readonly number[] },
  decks: Decks,
  paving: Paving,
): MoorPlant[] {
  const rand = mulberry32(4711);
  const { land, scar } = MOOR;
  const plants: MoorPlant[] = [];
  const roadAt = (x: number, z: number) => {
    const i = ground.col(x);
    const j = ground.row(z);
    return roadDistance[j * ground.cols + i];
  };
  const onLand = (x: number, z: number) => x > land.minX + 1 && x < land.maxX - 1 && z > land.minZ + 0.5 && z < land.maxZ - 1;
  const paved = (x: number, z: number) =>
    paving.rects.some((r) => x > r.minX - 1 && x < r.maxX + 1 && z > r.minZ - 1 && z < r.maxZ + 1) || paving.strips.some((s) => s.line.length > 1 && nearestOnPolyline(s.line, x, z).d < s.half + 0.8);
  const clear = (x: number, z: number, margin: number) =>
    onLand(x, z) && roadAt(x, z) > margin + 1 && Math.hypot(x - stone.x, z - stone.z) > 1.5 + margin && !colliders.blocked(x, z, margin + 0.3) && !decks.on(x, z, margin + 0.4);
  const beckAt = (x: number, z: number) => {
    const b = nearestOnPolyline(beck.line, x, z);
    return { d: b.d, half: along(beck.halves, b.i + b.t), level: along(beck.levels, b.i + b.t) };
  };
  const wet = (x: number, z: number) => {
    if (inBog(x, z) > 0.5) return ground.at(x, z) < MOOR.bog.level + 0.05;
    const b = beckAt(x, z);
    return b.d < b.half + 0.4;
  };
  // Beck's Foot's reed beds: low, wet ground near the water there, not the road's dry verges.
  const reedy = (x: number, z: number) => {
    if (Math.hypot(x - 222, z - 512) > 44) return false;
    const b = beckAt(x, z);
    const g = ground.at(x, z);
    return g < 0.5 || (b.d < b.half + 3 && g < b.level + 0.6);
  };
  const grade = (x: number, z: number) => Math.hypot(ground.at(x + 1, z) - ground.at(x - 1, z), ground.at(x, z + 1) - ground.at(x, z - 1)) / 2;
  const add = (kind: MoorKind, x: number, z: number, scale: number, yaw = rand() * Math.PI * 2) =>
    plants.push({ kind, x, y: ground.at(x, z), z, yaw, scale, seed: Math.floor(rand() * 1e6) });
  // The way down the slope at (x, z), as a yaw: a crag's face and a scree's spill turn to it.
  const downhill = (x: number, z: number) => Math.atan2(ground.at(x - 1, z) - ground.at(x + 1, z), ground.at(x, z - 1) - ground.at(x, z + 1));
  const scatter = (spacing: number, fn: (x: number, z: number) => void, box = land) => {
    for (let gz = box.minZ + spacing / 2; gz < box.maxZ; gz += spacing) {
      for (let gx = box.minX + spacing / 2; gx < box.maxX; gx += spacing) fn(gx + (rand() - 0.5) * spacing, gz + (rand() - 0.5) * spacing);
    }
  };
  const near = (x: number, z: number, m: number) => walkable.distance(x, z) < m;
  const town = (x: number, z: number) => inTown(x, z) > 0.4;
  const sq = MOOR.square;
  const inSquare = (x: number, z: number) => Math.abs(x - sq.x) < sq.hw + 2 && Math.abs(z - sq.z) < sq.hd + 2;
  // Hollowhill's mound is kept bare of trees, rocks and bushes, and nothing grows in its passage or over its walls.
  const hh = MOOR.hollowhill;
  const onMound = (x: number, z: number) => Math.hypot(x - hh.x, z - hh.z) < hh.r + 1.5;
  const inPassage = (x: number, z: number) => Math.abs(x - hh.x) < hh.passage + 2.8 && z > hh.z + hh.door - 2.5 && z < hh.z + hh.r + 2.5;

  // A few lone pines, bent by the wind, none in the bog, the town or the enclosure.
  scatter(18, (x, z) => {
    if (rand() > 0.14 || !clear(x, z, 3) || grade(x, z) > 0.5 || z < land.minZ + 12 || inBog(x, z) > 0 || town(x, z) || inEnclosure(x, z) > 0 || onMound(x, z)) return;
    add('pine', x, z, 0.75 + rand() * 0.45);
  });
  // Grey rocks, more on slopes and the fells, bigger away from where you walk.
  scatter(8, (x, z) => {
    if (rand() > 0.08 + 0.4 * Math.min(1, grade(x, z) * 1.5) || !clear(x, z, 1) || inBog(x, z) > 0.3 || town(x, z) || inEnclosure(x, z) > 0 || onMound(x, z)) return;
    add('rock', x, z, 0.5 + rand() * (near(x, z, 4) ? 1 : 2.2));
  });
  // The rim's crags: long gritstone edges where its slopes stand steepest, with scree spilled below them; past where you walk.
  scatter(9, (x, z) => {
    const out = walkable.distance(x, z);
    if (out < 6 || !onLand(x, z) || rand() > 0.75 || onMound(x, z)) return;
    const g = grade(x, z);
    if (g > 0.55 && rand() < 0.55) {
      // A crag runs along the slope: shorter where the ground falls away under its ends, none where even a short one's would.
      const yaw = downhill(x, z) + (rand() - 0.5) * 0.5;
      const g0 = ground.at(x, z);
      const held = (k: number) => [-1, 1].every((e) => ground.at(x + Math.cos(yaw) * 1.4 * k * e, z - Math.sin(yaw) * 1.4 * k * e) > g0 - 1.1 * k);
      let k = 1.7 + rand() * 1.7;
      while (k > 1.3 && !held(k)) k *= 0.8;
      if (held(k)) add('crag', x, z, k, yaw);
    }
    else if (g > 0.3 && rand() < 0.35) add('scree', x, z, 1.6 + rand() * 1.6, downhill(x, z));
  });
  // Low bilberry bushes and yellow-flecked gorse, scattered where you walk.
  scatter(7, (x, z) => {
    if (rand() > 0.2 || !clear(x, z, 0.8) || !near(x, z, 30) || inBog(x, z) > 0.3 || town(x, z) || inEnclosure(x, z) > 0 || onMound(x, z)) return;
    add(rand() < 0.35 ? 'gorse' : 'bush', x, z, 0.6 + rand() * 0.4);
  });
  // Bracken and heather in their patches where you walk and up the rim's lower slopes; cotton grass on the bog; reeds in the wet.
  scatter(2.4, (x, z) => {
    const out = walkable.distance(x, z);
    if (out > 22 || !clear(x, z, 0.4) || inSquare(x, z) || paved(x, z) || inEnclosure(x, z) > 0.5 || inPassage(x, z)) return;
    // Thinning out up the rim, where it's seen only from afar.
    if (out > 8 && rand() < smoothstep(8, 22, out) * 0.8) return;
    const roll = rand();
    if (wet(x, z) || reedy(x, z)) {
      // None between the town's quays.
      if (town(x, z)) return;
      if (roll < 0.5 && (reedy(x, z) || beckAt(x, z).d > 1)) add('reed', x, z, 1.2 + rand() * 0.6);
      return;
    }
    if (inBog(x, z) > 0.4) {
      if (roll < 0.45) add('cotton', x, z, 0.9 + rand() * 0.4);
      else if (roll < 0.6) add('heather', x, z, 0.45 + rand() * 0.3);
      return;
    }
    if (town(x, z) && roll < 0.93) return;
    // Thinning toward the east edge's seams, where the moor greens into the neighbours' grass.
    const fade = 1 - 0.8 * smoothstep(220, 256, x) * smoothstep(KINGSROAD.minZ - 30, KINGSROAD.minZ, z) * smoothstep(FEN_ROAD.maxZ + 30, FEN_ROAD.maxZ, z);
    const b = bracken(x, z) * fade;
    const h = heather(x, z) * fade;
    if (roll < 0.8 * b) add('bracken', x, z, 1.4 + rand() * 0.9);
    else if (roll < 0.8 * b + 0.3 * h) add('heather', x, z, 0.5 + rand() * 0.35);
    // Between the patches, the moor's own coarse grass in tussocks, thickest beside the ways.
    else if (rand() < (0.6 - 0.5 * Math.max(b, h)) * (near(x, z, 10) ? 1 : 0.5)) add('tussock', x + (rand() - 0.5), z + (rand() - 0.5), 0.7 + rand() * 0.5);
  });
  // Rowans along the beck's banks, now and then.
  for (let i = 4; i < beck.line.length - 4; i += 9) {
    if (rand() > 0.28) continue;
    const [x, z] = beck.line[i];
    const side = rand() < 0.5 ? -1 : 1;
    const [nx, nz] = beck.line[i + 1];
    const len = Math.hypot(nx - x, nz - z) || 1;
    const off = beck.halves[i] + 2.5 + rand() * 2;
    const px = x + (-(nz - z) / len) * off * side;
    const pz = z + ((nx - x) / len) * off * side;
    if (clear(px, pz, 1.5) && inBog(px, pz) === 0 && !inSquare(px, pz) && !town(px, pz)) add('rowan', px, pz, 0.85 + rand() * 0.3);
  }
  // Stones along the beck's edges out on the moor, some in the water, some up on the bank.
  for (let i = 1; i < beck.line.length - 1; i++) {
    const [x, z] = beck.line[i];
    const [nx, nz] = beck.line[i + 1];
    const len = Math.hypot(nx - x, nz - z) || 1;
    for (const side of [-1, 1]) {
      if (rand() > 0.5) continue;
      const off = beck.halves[i] + (rand() - 0.6) * 0.9;
      const px = x + (-(nz - z) / len) * off * side;
      const pz = z + ((nx - x) / len) * off * side;
      if (town(px, pz) || inTown(px, pz) > 0.1 || inBog(px, pz) > 0.2 || decks.on(px, pz, 1) || roadAt(px, pz) < 1.5 || colliders.blocked(px, pz, 0.6)) continue;
      add('rock', px, pz, 0.3 + rand() * 0.45);
    }
  }
  // A stand of old hawthorns at the Long Stones.
  const { from, to } = MOOR.longStones;
  for (let i = 0; i < 9; i++) {
    const t = rand();
    const x = lerp(from[0], to[0], t) + (rand() - 0.5) * 16;
    const z = lerp(from[1], to[1], t) + 5 + rand() * 9;
    if (clear(x, z, 1)) add('hawthorn', x, z, 0.8 + rand() * 0.35);
  }
  // Boulders fallen round the foot of Raven Scar's crags, where the quarry's walls stand too steep to climb.
  for (let a = -0.6; a < Math.PI * 1.55; a += 0.16) {
    const ax = Math.cos(a + Math.PI * 0.75);
    const az = -Math.sin(a + Math.PI * 0.75);
    // None across its mouth, where the track comes in.
    if (ax + az > 0.3) continue;
    const x = scar.x + ax * (scar.hw + 0.5) * (0.92 + rand() * 0.12);
    const z = scar.z + az * (scar.hd + 0.5) * (0.92 + rand() * 0.12);
    add('rock', x, z, 1.5 + rand() * 1.3);
  }
  // Through the gap, on its saddle: the first dark cypresses of Sunreach.
  for (const [dx, z, sc] of [[-3.5, 574, 1.1], [2.5, 577, 0.9], [6, 573, 0.75]] as const) add('cypress', MOOR.gap.x + dx, z, sc);
  // The rockfall: big rocks piled across the Sunreach road's end and the gap either side, and scree spilled up its walls.
  const [ex, ez] = rockfall;
  for (let i = 0; i < MOOR.rockfall.count; i++) {
    const x = ex + (rand() - 0.5) * 2 * MOOR.rockfall.spread;
    const z = ez + 1 + rand() * 7;
    add('rock', x, z, MOOR.rockfall.scale[0] + rand() * (MOOR.rockfall.scale[1] - MOOR.rockfall.scale[0]));
  }
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? 1 : -1;
    const [x, z] = [ex + side * (MOOR.gap.half + 2 + rand() * 6), ez - 6 + rand() * 14];
    add('scree', x, z, 1.6 + rand() * 1.4, downhill(x, z));
  }
  return plants;
}

/** How much bracken grows at (x, z), 0 to 1: in broad rusty patches. */
export function bracken(x: number, z: number): number {
  return smoothstep(0.46, 0.62, fbm(x * 0.03, z * 0.03, 121));
}

/** How much heather grows at (x, z), 0 to 1: in purple patches between the bracken. */
export function heather(x: number, z: number): number {
  return smoothstep(0.5, 0.66, fbm(x * 0.035 + 40, z * 0.035, 131)) * (1 - 0.7 * bracken(x, z));
}

/** How golden the moor's grass has dried at (x, z): toward the south ridge and Sunreach beyond it. */
export function drySouth(x: number, z: number): number {
  return smoothstep(470, 560, z) * (0.6 + 0.4 * valueNoise(x * 0.05, z * 0.05, 151));
}

export { inBog };
