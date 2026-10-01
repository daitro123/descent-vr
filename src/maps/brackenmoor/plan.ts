import { CONFIG } from '../../config';
import type { Tree, PlaceSound } from '../../world/ambience';
import type { Atmosphere } from '../../world/atmosphere';
import { Colliders } from '../forest/colliders';
import { PASS } from '../forest/layout';
import { fbm, lerp, mulberry32, nearestOnPolyline, type P2, sampleCurve, smoothstep, valueNoise } from '../forest/noise';
import { type Deck, deckBetween, Decks } from '../decks';
import { FEN_ROAD, fenRoadHeight, fenRoadSeam } from '../fenRoad';
import { HeightGrid } from '../heightGrid';
import { along, flattenTo, heightsAlong, type LineField, lineField, smoothHeights } from '../lines';
import type { Seam, SideSeam, Spot } from '../types';
import { Walkable } from '../walkable';
import { MOOR_LIGHT, MOOR_SKY } from './palette';

// Brackenmoor: the high, wet moor south of Oakvale's pass (see the zone's
// spec, /zones/brackenmoor.md in the project's files). Over the crest the land
// falls into Passfoot's basin; the pass road runs on south over a saddle by
// the Long Stones to Cairnford, a grey stone market town at a three-arched
// bridge over the Brack Beck. The beck rises in the Blackmire, a flat peat bog
// in the west with Turfmoss's crofts on its edge, and runs east through the
// town and south-east to Beck's Foot, where the Fen road leaves for the
// Sallows. The Kingsroad climbs east through the landlord's walled enclosure
// past Fellgate Hall to a tollhouse on the escarpment; the Sunreach road runs
// south to the Rockfall Gap in the south ridge, closed by a rockfall. The fells
// rise in the north-west round Raven Scar's old quarry, and in the north-east
// the High Fells carry the barrows and Hollowhill. Nothing lives here yet.
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
  /** The road over the moor, the main road's width; the other roads and the tracks. */
  road: { width: 4 },
  /** The rockfall across the Sunreach road where you can walk no farther: rocks this many m across. */
  rockfall: { count: 16, spread: 9, scale: [1.4, 3.2] },
  /** A lone pine's lean, downwind (to the north-east), as run over rise. */
  lean: 0.4,
  /** The Blackmire's bog: its middle, its half sizes, and its pools' one level. */
  bog: { x: -138, z: 400, rx: 62, rz: 66, level: 8.2 },
  /** Cairnford's market square: its middle and half sizes. */
  square: { x: 38, z: 372, hw: 14, hd: 11 },
  /** Raven Scar's quarry pit: its middle, its half sizes, and how deep it's cut. */
  scar: { x: -158, z: 218, hw: 24, hd: 17, depth: 11 },
  /** Hollowhill on the High Fells: its middle, its radius and height. */
  hollowhill: { x: 190, z: 198, r: 16, h: 7 },
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
export type MoorKind = 'bracken' | 'heather' | 'bush' | 'gorse' | 'rock' | 'pine' | 'hawthorn' | 'rowan' | 'reed' | 'cotton';

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
  | 'barrow' | 'hollowhill' | 'spoil' | 'tent' | 'ragPole' | 'ladder' | 'lookout' | 'peatStack' | 'peatBank'
  | 'hut' | 'jetty' | 'boat' | 'grave' | 'stall' | 'cart' | 'garden' | 'hide' | 'crates' | 'borderStone' | 'longStone' | 'marketCross';

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

export interface MoorPlan {
  /** Where you can walk: on from the crest's corridor, then the moor, and over the Fen road into the Sallows. */
  readonly walkable: Walkable;
  /** Its heights along the crest: Oakvale's own, which it meets exactly. */
  readonly seam: Seam;
  /** Its heights along the Fen road's line, which the Sallows meet exactly. */
  readonly fenSeam: SideSeam;
  readonly ground: HeightGrid;
  /** The pass road, from the crest to Cairnford's square: the road you come in on. */
  readonly road: MoorRoad;
  /** Every road and track, the pass road first. */
  readonly roads: readonly MoorRoad[];
  /** Distance to the nearest road's edge at each ground vertex (negative on it; Infinity far from any). */
  readonly roadDistance: Float32Array;
  /** The Brack Beck's centre line, from its source in the Blackmire to the Fen road's seam, and its water's level along it. */
  readonly beck: { readonly line: readonly P2[]; readonly levels: readonly number[]; readonly half: number };
  /** The water's level at (x, z): the beck's, the bog's pools', or NaN where there's none. */
  waterLevel(x: number, z: number): number;
  readonly plants: readonly MoorPlant[];
  readonly structures: readonly MoorStructure[];
  readonly walls: readonly MoorWall[];
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

/** Roads' and tracks' centre lines, before they're sampled. The pass road's first points come from the crest. */
const ROADS: { id: string; width: number; pts: P2[] }[] = [
  { id: 'kingsroad', width: 4, pts: [[52, 369], [72, 367], [96, 364], [120, 360], [145, 356], [170, 351], [195, 345], [215, 338], [232, 331], [244, 327], [252, 318], [256, 304]] },
  { id: 'fen', width: 3.4, pts: [[46, 405], [70, 420], [100, 432], [130, 446], [160, 466], [190, 492], [215, 515], [238, 532], [252, 540], [262, FEN_ROAD.road.z]] },
  { id: 'sunreach', width: 3.4, pts: [[46, 405], [37, 428], [24, 460], [8, 492], [-6, 520], [-15, 545], [-20, 562]] },
  { id: 'hob', width: 2.2, pts: [[-1, 215], [-12, 219], [-24, 223]] },
  { id: 'oldFold', width: 2.2, pts: [[3, 250], [-9, 272], [-22, 297], [-33, 318]] },
  { id: 'scar', width: 2.2, pts: [[-40, 322], [-62, 300], [-88, 277], [-112, 257], [-132, 243]] },
  { id: 'turfmoss', width: 2.2, pts: [[25, 378], [0, 375], [-30, 369], [-60, 361], [-86, 352]] },
  { id: 'fells', width: 2.2, pts: [[112, 361], [122, 333], [138, 302], [152, 270], [168, 242], [184, 222]] },
];

/** The pass road on from the crest's crossing: down through Passfoot, over the Long Stones' saddle, into Cairnford's square. */
const PASS_ROAD: P2[] = [[9, 172], [3, 196], [-2, 222], [4, 246], [15, 268], [22, 289], [27, 312], [33, 338], [36, 358], [38, 368]];

/** The Brack Beck, from its source in the Blackmire to the Fen road's seam (a little past it, so it's carved to the edge). */
const BECK: P2[] = [
  [-150, 405], [-120, 399], [-90, 393], [-55, 390], [-20, 392], [10, 394], [38, 393], [70, 398], [100, 408],
  [135, 425], [165, 448], [195, 478], [222, 500], [245, 514], [262, FEN_ROAD.beck.z],
];

/** The beck's half width at the water, its depth in the middle, and its banks' width. */
const BECK_SHAPE = { half: 2.2, depth: 0.7, bank: 4 } as const;

/** Cairnford's bridge: its middle's x, and where it starts and ends either side of the beck. */
const BRIDGE = { x: 46, from: 385, to: 402, width: 4.6, rise: 0.9 } as const;

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

/** The moor's own height at (x, z), before the beck, the roads, the crest and the edges. */
function moorHeight(x: number, z: number): number {
  let h = base(x, z);
  // The north-west fells round Raven Scar.
  h += 27 * smoothstep(-70, -178, x) * smoothstep(360, 228, z);
  // The High Fells, a broad dome in the north-east, and Hollowhill on its crown.
  const fells = Math.hypot(x - 185, z - 205);
  h += 17 * smoothstep(82, 8, fells);
  const { hollowhill: hh } = MOOR;
  const r = Math.hypot(x - hh.x, z - hh.z) / hh.r;
  if (r < 1) h += hh.h * Math.sqrt(1 - r * r) * (0.9 + 0.1 * smoothstep(1, 0.5, r));
  // The Long Stones' ridge, parted where the pass road crosses it in a saddle.
  const ridge = toSegment(x, z, [-12, 285], [128, 300]);
  h += 8 * smoothstep(34, 6, ridge) * (1 - 0.75 * smoothstep(24, 6, Math.abs(x - 24)));
  // The south ridge, toward Sunreach, lowering east toward Beck's Foot.
  h += (14 + 10 * fbm(x * 0.02, 7, 111)) * smoothstep(505, 575, z) * smoothstep(240, 150, x);
  // Beck's Foot: the ground sinks toward the fens.
  h -= 2.4 * smoothstep(70, 10, Math.hypot(x - 222, z - 512));
  // Cairnford's fold: a shallow hollow round the bridge.
  h -= 1.5 * smoothstep(80, 20, Math.hypot(x - 40, z - 385));
  // The Blackmire: flat peat at the bog's level, its pools where the peat dips under it.
  const wet = inBog(x, z);
  if (wet > 0) h = lerp(h, MOOR.bog.level + 0.2 + (fbm(x * 0.09, z * 0.09, 131) - 0.5) * 1.5, wet);
  return h;
}

/**
 * The rim: hills past where you can walk, rising with the distance from it
 * (`out` m), and steepening to a wall by the land's edges where no neighbour
 * meets it, so the land's end is never seen.
 */
function rimHeight(x: number, z: number, out: number): number {
  const { land } = MOOR;
  const lump = 0.75 + 0.5 * fbm(x * 0.03 + 9, z * 0.03 - 4, 141);
  let h = 30 * lump * smoothstep(5, 48, out);
  const edge = Math.min(x - land.minX, land.maxX - x, land.maxZ - z, z - land.minZ);
  h += 16 * lump * smoothstep(26, 0, edge) * smoothstep(0, 10, out);
  return h;
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
  const roadLines = [{ id: 'pass', width: crossing.width, line: pass }, ...ROADS.map((r) => ({ id: r.id, width: r.width, line: sampleCurve(r.pts, 1) }))];
  const walkable = new Walkable(walkableAreas(crossing.x, pass));

  // 1. The moor's own lie of the land, and the rim past where you walk.
  ground.each((x, z, k) => {
    let h = moorHeight(x, z);
    const cut = scarCut(x, z);
    if (cut > 0) h -= MOOR.scar.depth * cut;
    ground.data[k] = h + rimHeight(x, z, walkable.distance(x, z));
  });

  // 2. The beck: a channel down its line, its water falling all the way from the bog to the fens.
  const beckLine = sampleCurve(BECK, 1);
  const beckField = lineField(ground, beckLine, BECK_SHAPE.half + BECK_SHAPE.bank + 2);
  const levels = beckLevels(ground, beckLine);
  carveBeck(ground, beckField, levels);

  // 3. The roads, each eased into the land along a smoothed line of its heights (the pass road's first held: it's the crest's).
  const roads: MoorRoad[] = [];
  const fields: LineField[] = [];
  for (const r of roadLines) {
    const field = lineField(ground, r.line, r.width / 2 + 4);
    const raw = heightsAlong(ground, r.line).map((h, i) => {
      // Over the beck and its banks a road rides high, onto the bridge's ends.
      const [x, z] = r.line[i];
      const b = nearestOnPolyline(beckLine, x, z).d;
      return b < BECK_SHAPE.half + 3 ? Math.max(h, along(levels, nearestBeck(beckLine, x, z)) + 0.9) : h;
    });
    const heights = smoothHeights(raw, 5, 4, { first: r.id === 'pass', last: r.id === 'fen' });
    if (r.id === 'fen') heights[heights.length - 1] = FEN_ROAD.road.y;
    flattenTo(ground, field, heights, r.width / 2 + 0.6, 3);
    roads.push({ id: r.id, line: r.line, width: r.width, heights });
    fields.push(field);
  }

  // 4. Level pads: the square, and every building's footprint.
  const sq = MOOR.square;
  pad(ground, sq.x, sq.z, sq.hw, sq.hd, 0, ground.at(sq.x, sq.z), 3);
  const structures = placeStructures(ground, roads);
  for (const s of structures) {
    const p = PADS[s.kind];
    if (p) pad(ground, s.x, s.z, s.w / 2 + p, s.d / 2 + p, s.yaw, s.y, 2.5);
  }

  // 5. Last, the edges blend to the neighbours' heights, so the zones agree exactly on their lines.
  meetCrest(ground, crest);
  meetFenRoad(ground);

  // The structures stand on the ground as it ends up.
  const placed = structures.map((s) => ({ ...s, y: s.kind === 'bridge' ? s.y : ground.at(s.x, s.z) }));

  const roadDistance = new Float32Array(ground.data.length).fill(Infinity);
  roads.forEach((r, i) => {
    const f = fields[i];
    for (let k = 0; k < roadDistance.length; k++) roadDistance[k] = Math.min(roadDistance[k], f.d[k] - r.width / 2);
  });

  const bridgeDeck = deckBetween([BRIDGE.x, BRIDGE.from], [BRIDGE.x, BRIDGE.to], BRIDGE.width, ground.at(BRIDGE.x, BRIDGE.from), ground.at(BRIDGE.x, BRIDGE.to), BRIDGE.rise);
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

  const rockfall = roads.find((r) => r.id === 'sunreach')!.line.at(-1)!;
  const beckWater = { line: beckLine, levels, half: BECK_SHAPE.half };
  const waterLevel = (x: number, z: number) => waterAt(beckWater, x, z);
  const plants = placePlants(ground, walkable, colliders, roadDistance, stone, rockfall, beckWater, deckIndex);
  for (const p of plants) {
    const r = TRUNK[p.kind];
    if (r && walkable.distance(p.x, p.z) <= 2) colliders.addCircle({ x: p.x, z: p.z, r: r * p.scale });
  }

  const at = (z: number): P2 => pass.reduce((best, p) => (Math.abs(p[1] - z) < Math.abs(best[1] - z) ? p : best));
  const [sx, sz] = at(land.minZ + 6);
  const trees = plants.filter((p) => TREE_HEIGHT[p.kind]).map((p) => ({ x: p.x, y: p.y, z: p.z, height: TREE_HEIGHT[p.kind]! * p.scale }));
  const fen = fenRoadSeam();
  return {
    walkable,
    seam: { ...crest, heights: crest.heights.map((_, i) => ground.at(crest.minX + i * cell, crest.z)) },
    fenSeam: { ...fen, heights: fen.heights.map((_, i) => ground.at(fen.x, fen.minZ + i * fen.step)) },
    ground,
    road: roads[0],
    roads,
    roadDistance,
    beck: beckWater,
    waterLevel,
    plants,
    structures: placed,
    walls,
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
      { label: 'Fellgate Hall', x: 160, z: 340 },
      { label: 'The tollhouse', x: 226, z: 336 },
      { label: 'Turfmoss', x: -86, z: 356 },
      { label: 'The Blackmire', x: -126, z: 396 },
      { label: 'Raven Scar', x: -150, z: 226 },
      { label: 'Hollowhill', x: 188, z: 222 },
      { label: "Beck's Foot", x: 226, z: 524 },
      { label: 'The Rockfall Gap', x: rockfall[0] + 2, z: rockfall[1] - 6 },
    ],
    trees,
    sounds: [{ id: 'stream', x: BRIDGE.x, y: along(levels, nearestBeck(beckLine, BRIDGE.x, 393)), z: 393, interior: null }],
    heightAt,
  };
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

/** Cut the beck's channel: its bed under its water down its line, its banks a little over it. */
function carveBeck(ground: HeightGrid, field: LineField, levels: readonly number[]): void {
  const { half, depth, bank } = BECK_SHAPE;
  for (let k = 0; k < ground.data.length; k++) {
    const d = field.d[k];
    if (!Number.isFinite(d)) continue;
    const level = along(levels, field.at[k]);
    const bed = level - depth * (1 - Math.min(1, (d / (half + 0.6)) ** 2)) - 0.05;
    if (d <= half + 0.6) ground.data[k] = Math.min(ground.data[k], bed);
    else {
      // The banks: no higher than a little over the water near it, easing back to the land.
      const top = level + 0.25 + (d - half - 0.6) * 0.6;
      const t = smoothstep(half + 0.6 + bank, half + 0.6, d);
      ground.data[k] = lerp(ground.data[k], Math.min(ground.data[k], top), t);
    }
  }
}

/** The water's level at (x, z): the beck's near its line, the Blackmire's pools, or NaN. */
function waterAt(beck: { line: readonly P2[]; levels: readonly number[]; half: number }, x: number, z: number): number {
  if (inBog(x, z) > 0.5) return MOOR.bog.level;
  const { d, i, t } = nearestOnPolyline(beck.line, x, z);
  if (d <= beck.half + BECK_SHAPE.bank + 2) return along(beck.levels, i + t);
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

/** Blend the last MOOR.blend m of columns, along the Fen road's stretch of the east edge, to its heights: exactly them on the line. */
function meetFenRoad(ground: HeightGrid): void {
  const { x, minZ, maxZ } = FEN_ROAD;
  const last = ground.cols - 1;
  if (ground.x(last) !== x) throw new Error("Brackenmoor's east edge must be the Fen road's line");
  for (let j = 0; j < ground.rows; j++) {
    const z = ground.z(j);
    // Fully along the seam, fading over a band past either end of it.
    const w = smoothstep(minZ - 24, minZ, z) * smoothstep(maxZ + 24, maxZ, z);
    if (w <= 0) continue;
    const target = fenRoadHeight(Math.max(minZ, Math.min(maxZ, z)));
    for (let i = last; i >= 0; i--) {
      const t = smoothstep(0, MOOR.blend, x - ground.x(i));
      if (t >= 1) break;
      const k = j * ground.cols + i;
      const on = z >= minZ && z <= maxZ;
      ground.data[k] = i === last && on ? target : lerp(ground.data[k], lerp(ground.data[k], target, w), 1 - t);
    }
  }
}

/**
 * Where you can walk: the pass's corridor on over the crest from
 * CONFIG.world.ground.seam before it (overlapping Oakvale's), along the road
 * until the moor opens, then the moor itself, and out over the Fen road's
 * line by CONFIG.world.ground.seam into the Sallows. Convex areas that
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

/** How far round its footprint each kind's ground is levelled (m), for those that are. */
const PADS: Partial<Record<MoorStructureKind, number>> = {
  house: 1, inn: 1.2, mootHall: 1.2, chapel: 1, smithy: 1, mill: 0.8, cottage: 1, croft: 1, ruin: 0.8, hall: 2, gatehouse: 0.5,
  tollhouse: 1, fold: 0.5, tent: 0.6, hut: 0.5, stall: 0.4, garden: 0.5, hide: 0.5,
};

/** Its footprint, if you can't walk through it: half sizes in its own frame, or a circle. */
function addStructureColliders(c: Colliders, s: MoorStructure): void {
  const box = (hw: number, hd: number, ox = 0, oz = 0) => {
    const cos = Math.cos(s.yaw);
    const sin = Math.sin(s.yaw);
    c.addBox({ x: s.x + ox * cos + oz * sin, z: s.z - ox * sin + oz * cos, hw, hd, yaw: s.yaw });
  };
  switch (s.kind) {
    case 'house': case 'inn': case 'mootHall': case 'chapel': case 'mill': case 'cottage': case 'croft': case 'hall': case 'tollhouse': case 'hut':
      box(s.w / 2 + 0.1, s.d / 2 + 0.1);
      break;
    case 'smithy':
      // Open at the front: its back and side walls, and the forge.
      box(s.w / 2, 0.3, 0, -s.d / 2 + 0.3);
      box(0.3, s.d / 2, -s.w / 2 + 0.3, 0);
      box(0.3, s.d / 2, s.w / 2 - 0.3, 0);
      box(0.8, 0.8, -s.w / 4, -s.d / 4);
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
    case 'tollgate':
      box(s.w / 2, 0.25);
      break;
    case 'cairn': case 'longStone': case 'borderStone': case 'marketCross':
      c.addCircle({ x: s.x, z: s.z, r: s.kind === 'cairn' ? 0.5 + s.h * 0.25 : 0.55 });
      break;
    case 'signpost': case 'ragPole': case 'flag':
      c.addCircle({ x: s.x, z: s.z, r: 0.15 });
      break;
    case 'mapboard':
      box(0.8, 0.15);
      break;
    case 'tent': case 'stall': case 'cart': case 'peatStack': case 'crates': case 'lookout':
      box(s.w / 2, s.d / 2);
      break;
    case 'hollowhill':
      // The door's frame stands proud of the mound; the mound itself you can walk over.
      box(2.2, 0.6, 0, 0);
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

/** Every building and set piece, by place. Their heights are read again once the ground's done. */
function placeStructures(ground: HeightGrid, roads: readonly MoorRoad[]): MoorStructure[] {
  const out: MoorStructure[] = [];
  let seed = 1;
  const add = (kind: MoorStructureKind, x: number, z: number, yaw: number, w = 1, d = 1, h = 1, variant = 0) => {
    out.push({ kind, x, y: ground.at(x, z), z, yaw, w, d, h, variant, seed: seed++ });
  };
  const road = (id: string) => roads.find((r) => r.id === id)!;
  const sq = MOOR.square;
  const toSquare = (x: number, z: number) => facing(x, z, sq.x, sq.z);

  // Passfoot: Hob's Fold, Wenna's croft and fold by the first track, and a weathered map board by the road.
  add('fold', -34, 223, 1.2, 6);
  add('croft', -31, 236, facing(-31, 236, -12, 219), 9, 4.6, 1);
  add('peatStack', -24, 238, 0.3, 2.2, 1.2, 1.1);
  add('mapboard', 5, 211, facing(5, 211, -1, 215));
  add('signpost', 2, 216, 0, 1, 1, 1, 0);

  // The Long Stones, black against the sky along the ridge, and their hawthorns (planted with the plants).
  const { from, to, count } = MOOR.longStones;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const x = lerp(from[0], to[0], t);
    const z = lerp(from[1], to[1], t) + Math.sin(i * 1.7) * 0.6;
    add('longStone', x, z, facing(from[0], from[1], to[0], to[1]) + Math.PI / 2 + Math.sin(i * 3.1) * 0.15, 1, 1, 2.6 + ((i * 37) % 10) / 10, i);
  }

  // Cairnford: the square, the inn on its north side, the moot hall on its west, the smithy at its east
  // corner by the Kingsroad, the chapel on its rise, the mill and the herb garden over the bridge.
  add('marketCross', sq.x, sq.z, 0, 1, 1, 3.2);
  add('mapboard', sq.x - 9, sq.z + 6, toSquare(sq.x - 9, sq.z + 6));
  add('stall', sq.x + 7, sq.z - 4, Math.PI / 2, 3, 2, 1);
  add('stall', sq.x + 7, sq.z + 3, Math.PI / 2, 3, 2, 1);
  add('stall', sq.x - 7, sq.z - 5, -Math.PI / 2, 3, 2, 1);
  add('inn', 53, 352, 0, 12, 8, 2);
  add('mootHall', 16, 371, Math.PI / 2, 12, 8, 2);
  add('smithy', 64, 383, Math.PI, 7, 6, 1);
  add('chapel', 6, 344, facing(6, 344, 20, 360), 6, 13, 1);
  add('mill', 22, 404, Math.PI, 7, 6, 2);
  add('cottage', 18, 420, Math.PI / 2, 6, 5, 1);
  add('garden', 28, 425, 0, 8, 6, 1);
  add('cart', 72, 358, 0.4, 2, 3.4, 1);
  add('cart', 78, 360, -0.2, 2, 3.4, 1);
  add('cairn', 56, 389, 0, 1, 1, 3.2, 0);
  add('cairn', 59, 391, 0, 1, 1, 1.4, 1);
  add('signpost', 52, 408, 0, 1, 1, 1, 1);
  add('signpost', 30, 366, 0, 1, 1, 1, 2);
  add('bridge', BRIDGE.x, (BRIDGE.from + BRIDGE.to) / 2, 0, BRIDGE.width, BRIDGE.to - BRIDGE.from, BRIDGE.rise);
  // The houses: two storeys of grey stone up the market street, along the Kingsroad and over the bridge.
  const houses: [number, number, number, number][] = [
    [27, 338, 6, 7], [27, 349, 6, 6], [46, 336, 7, 6], [15, 356, 7, 6], [63, 343, 7, 6],
    [84, 356, 8, 6], [104, 353, 7, 6], [90, 377, 7, 6], [62, 414, 7, 6], [34, 433, 6, 6], [67, 428, 6, 6], [8, 388, 6, 6],
  ];
  const nearestRoad = (x: number, z: number): P2 => {
    let best: P2 = [x, z + 1];
    let bd = Infinity;
    for (const r of roads) {
      for (const p of r.line) {
        const d = Math.hypot(p[0] - x, p[1] - z);
        if (d < bd) [best, bd] = [p, d];
      }
    }
    return best;
  };
  houses.forEach(([x, z, w, d], i) => {
    const [tx, tz] = nearestRoad(x, z);
    // Facing the road it stands by.
    add('house', x, z, facing(x, z, tx, tz), w, d, 2, i);
  });

  // The Old Fold: a burnt longhouse the Kerchiefs camped in, and its broken fold.
  add('ruin', -44, 331, 0.35, 12, 5.5, 1);
  add('fold', -28, 344, 0.8, 5, 1, 1, 1);
  add('spoil', -50, 342, 0, 3, 3, 1);

  // Three abandoned crofts, their doors hanging open, an empty fold by each.
  for (const [x, z, fx, fz] of [[-92, 262, -100, 250], [112, 472, 120, 484], [-128, 498, -116, 508]] as const) {
    add('croft', x, z, facing(x, z, x + 10, z - 4), 8.5, 4.4, 1, 1);
    add('fold', fx, fz, 0.4, 4.5, 1, 1, 1);
  }

  // Fellgate Hall on its rise in the enclosure: dressed stone, its yard's gate posts, and the noble house's flag.
  add('hall', 160, 318, 0, 18, 11, 3);
  add('gatehouse', 160, 342, 0, 6, 1, 1);
  add('flag', 172, 326, 0, 1, 1, 9);

  // The Kingsroad's tollhouse at the escarpment's top, its gate shut across the road (Aldhaven waits beyond).
  add('tollhouse', 223, 322, facing(223, 322, 232, 331), 6, 5, 1);
  const gate = road('kingsroad').line.reduce((best, p) => (Math.abs(p[0] - 238) < Math.abs(best[0] - 238) ? p : best));
  add('tollgate', gate[0], gate[1], 0.35 + Math.PI / 2, 6, 1, 1);

  // Turfmoss, the peat cutters' crofts on the Blackmire's edge; their stacks, and the banks they cut.
  add('croft', -94, 340, facing(-94, 340, -86, 352), 8, 4.4, 1);
  add('croft', -106, 354, facing(-106, 354, -86, 352), 7.5, 4.2, 1);
  add('croft', -80, 366, facing(-80, 366, -86, 352), 8, 4.4, 1);
  add('peatStack', -98, 362, 0.6, 2.4, 1.3, 1.2);
  add('peatStack', -88, 334, 1.2, 2, 1.2, 1);
  for (const [x, z, yaw] of [[-104, 376, 0.9], [-112, 368, 0.6], [-96, 384, 1.2]] as const) add('peatBank', x, z, yaw, 9, 1.4, 1);
  // The Kerchiefs' hide in a drained pool, out across the boardwalk.
  add('hide', -152, 430, 0.5, 4, 3, 1);
  add('crates', -148, 434, 0.2, 1.6, 1.2, 1);

  // Raven Scar: the Kerchiefs' tents in the quarry pit, red rags on poles along its lip, the ladder path up the
  // scar to the lookout, and a fresh grave behind it with a shepherd's crook.
  const { scar } = MOOR;
  add('tent', scar.x - 8, scar.z - 2, facing(scar.x - 8, scar.z - 2, scar.x + 10, scar.z + 10), 3, 3.6, 1);
  add('tent', scar.x + 6, scar.z - 6, facing(scar.x + 6, scar.z - 6, scar.x + 10, scar.z + 10), 3, 3.6, 1);
  add('tent', scar.x - 2, scar.z + 7, facing(scar.x - 2, scar.z + 7, scar.x + 10, scar.z + 10), 3.4, 4, 1);
  add('crates', scar.x + 2, scar.z + 1, 0.4, 1.6, 1.2, 1);
  add('ladder', scar.x + 4, scar.z - scar.hd + 1.6, Math.PI, 1, 1, scar.depth);
  add('lookout', scar.x + 4, scar.z - scar.hd - 3, 0, 3, 3, 1);
  for (const [x, z] of [[scar.x - 14, scar.z - scar.hd - 4], [scar.x - 24, scar.z - 4], [scar.x + 14, scar.z - scar.hd - 3], [scar.x - 4, scar.z - scar.hd - 5]] as const) add('ragPole', x, z, (Math.abs(x * 7) % 3) - 1.5, 1, 1, 3.2);
  add('grave', scar.x - 12, scar.z - scar.hd - 14, 0.3, 1, 2, 1);

  // The High Fells' barrow field: seven small barrows, three broken open with the diggers' spoil, and Hollowhill.
  const barrows: [number, number, boolean][] = [[148, 200, false], [158, 234, true], [212, 236, true], [232, 210, false], [222, 186, false], [166, 186, true], [196, 254, false]];
  for (const [x, z, broken] of barrows) {
    add('barrow', x, z, facing(x, z, 190, 198), 5, 5, 2, broken ? 1 : 0);
    if (broken) add('spoil', x + 4, z + 3, 0.5, 2.6, 2.6, 1);
  }
  const hh = MOOR.hollowhill;
  add('hollowhill', hh.x, hh.z + hh.r - 1.2, 0, 4, 1, 3.4);

  // Beck's Foot: the eel-trapper's hut on the bank, a jetty into the beck and a boat at it.
  add('hut', 230, 492, facing(230, 492, 230, 504), 4, 3.5, 1);
  add('jetty', 232, 498.5, 0, 1.6, 5, 1);
  add('boat', 234.5, 500, 0.15, 1, 3.6, 1);

  // Signposts at the forks.
  add('signpost', 114, 366, 0, 1, 1, 1, 3);
  add('signpost', 50, 401, 0, 1, 1, 1, 4);
  return out;
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

/**
 * The walls: field walls of rough gritstone across the moor, the landlord's
 * enclosure in dressed stone (built straight across an older wall), and
 * Cairnford's square's low wall. Each is broken where a road, a track, the
 * beck or a deck runs through.
 */
function planWalls(roads: readonly MoorRoad[], decks: readonly Deck[]): MoorWall[] {
  const rough: P2[][] = [
    // Across the middle moor, from the Old Fold's slopes east to the Long Stones' ridge.
    [[-70, 296], [-40, 290], [-10, 290], [12, 296], [24, 302]],
    [[-60, 410], [-20, 412], [10, 416]],
    [[-50, 440], [-30, 470], [-14, 500], [-10, 520]],
    [[60, 446], [80, 470], [96, 500], [120, 520], [160, 528]],
    [[-70, 250], [-62, 280], [-62, 300]],
    [[44, 316], [70, 318], [100, 322], [114, 326]],
    // The old wall the enclosure was built straight across.
    [[84, 300], [118, 294], [150, 290]],
  ];
  const dressed: P2[][] = [
    // The enclosure: its outer wall and the fields inside it.
    [[118, 258], [218, 258], [218, 425], [118, 425], [118, 258]],
    [[118, 300], [218, 300]],
    [[118, 392], [218, 392]],
    [[170, 300], [170, 340]],
  ];
  const sq = MOOR.square;
  const square: P2[][] = [
    [[sq.x - sq.hw, sq.z - sq.hd], [sq.x - sq.hw, sq.z + sq.hd]],
    [[sq.x + sq.hw, sq.z - sq.hd], [sq.x + sq.hw, sq.z + sq.hd]],
  ];
  const deckIndex = new Decks(decks);
  const beck = sampleCurve(BECK, 2);
  const open = (x: number, z: number) =>
    roads.some((r) => nearestOnPolyline(r.line, x, z).d < r.width / 2 + 1.6) || deckIndex.on(x, z, 1) || nearestOnPolyline(beck, x, z).d < BECK_SHAPE.half + 1.5;
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
  for (const l of square) split(l, false);
  return out;
}

/**
 * The moor's plants: bracken and heather in their patches over where you
 * walk, low bushes and gorse, grey rocks (more on slopes and the fells), a
 * few lone pines, hawthorns at the Long Stones, rowans by the beck, cotton
 * grass on the bog, reeds where the beck widens toward the fens, boulders
 * round Raven Scar's crags, and the rockfall across the Sunreach road's end.
 * Seeded, so the same every time.
 */
function placePlants(
  ground: HeightGrid,
  walkable: Walkable,
  colliders: Colliders,
  roadDistance: Float32Array,
  stone: { x: number; z: number },
  rockfall: P2,
  beck: { line: readonly P2[]; levels: readonly number[] },
  decks: Decks,
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
  const clear = (x: number, z: number, margin: number) =>
    onLand(x, z) && roadAt(x, z) > margin + 1 && Math.hypot(x - stone.x, z - stone.z) > 1.5 + margin && !colliders.blocked(x, z, margin + 0.3) && !decks.on(x, z, margin + 0.4);
  const wet = (x: number, z: number) => {
    const level = MOOR.bog.level;
    return inBog(x, z) > 0.5 ? ground.at(x, z) < level + 0.05 : nearestOnPolyline(beck.line, x, z).d < BECK_SHAPE.half + 0.4;
  };
  const grade = (x: number, z: number) => Math.hypot(ground.at(x + 1, z) - ground.at(x - 1, z), ground.at(x, z + 1) - ground.at(x, z - 1)) / 2;
  const add = (kind: MoorKind, x: number, z: number, scale: number) =>
    plants.push({ kind, x, y: ground.at(x, z), z, yaw: rand() * Math.PI * 2, scale, seed: Math.floor(rand() * 1e6) });
  const scatter = (spacing: number, fn: (x: number, z: number) => void, box = land) => {
    for (let gz = box.minZ + spacing / 2; gz < box.maxZ; gz += spacing) {
      for (let gx = box.minX + spacing / 2; gx < box.maxX; gx += spacing) fn(gx + (rand() - 0.5) * spacing, gz + (rand() - 0.5) * spacing);
    }
  };
  const near = (x: number, z: number, m: number) => walkable.distance(x, z) < m;
  const town = (x: number, z: number) => Math.hypot(x - 40, z - 380) < 52;
  const sq = MOOR.square;
  const inSquare = (x: number, z: number) => Math.abs(x - sq.x) < sq.hw + 2 && Math.abs(z - sq.z) < sq.hd + 2;

  // A few lone pines, bent by the wind, none in the bog, the town or the enclosure.
  scatter(18, (x, z) => {
    if (rand() > 0.14 || !clear(x, z, 3) || grade(x, z) > 0.5 || z < land.minZ + 12 || inBog(x, z) > 0 || town(x, z) || inEnclosure(x, z) > 0) return;
    add('pine', x, z, 0.75 + rand() * 0.45);
  });
  // Grey rocks, more on slopes and the fells, bigger away from where you walk.
  scatter(8, (x, z) => {
    if (rand() > 0.08 + 0.4 * Math.min(1, grade(x, z) * 1.5) || !clear(x, z, 1) || inBog(x, z) > 0.3 || town(x, z) || inEnclosure(x, z) > 0) return;
    add('rock', x, z, 0.5 + rand() * (near(x, z, 4) ? 1 : 2.2));
  });
  // Low bilberry bushes and yellow-flecked gorse, scattered where you walk.
  scatter(7, (x, z) => {
    if (rand() > 0.2 || !clear(x, z, 0.8) || !near(x, z, 30) || inBog(x, z) > 0.3 || town(x, z) || inEnclosure(x, z) > 0) return;
    add(rand() < 0.35 ? 'gorse' : 'bush', x, z, 0.6 + rand() * 0.4);
  });
  // Bracken and heather in their patches where you walk and a little past; cotton grass on the bog; reeds by the water.
  scatter(2.4, (x, z) => {
    if (!near(x, z, 12) || !clear(x, z, 0.4) || inSquare(x, z) || inEnclosure(x, z) > 0.5) return;
    const roll = rand();
    if (wet(x, z) || Math.hypot(x - 222, z - 512) < 40) {
      if (roll < 0.5 && (Math.hypot(x - 222, z - 512) < 44 || nearestOnPolyline(beck.line, x, z).d > 1)) add('reed', x, z, 1.2 + rand() * 0.6);
      return;
    }
    if (inBog(x, z) > 0.4) {
      if (roll < 0.45) add('cotton', x, z, 0.9 + rand() * 0.4);
      else if (roll < 0.6) add('heather', x, z, 0.45 + rand() * 0.3);
      return;
    }
    if (town(x, z) && roll < 0.85) return;
    const b = bracken(x, z);
    const h = heather(x, z);
    if (roll < 0.8 * b) add('bracken', x, z, 1.4 + rand() * 0.9);
    else if (roll < 0.8 * b + 0.3 * h) add('heather', x, z, 0.5 + rand() * 0.35);
  });
  // Rowans along the beck's banks, now and then.
  for (let i = 4; i < beck.line.length - 4; i += 9) {
    if (rand() > 0.28) continue;
    const [x, z] = beck.line[i];
    const side = rand() < 0.5 ? -1 : 1;
    const [nx, nz] = beck.line[i + 1];
    const len = Math.hypot(nx - x, nz - z) || 1;
    const off = BECK_SHAPE.half + 2.5 + rand() * 2;
    const px = x + (-(nz - z) / len) * off * side;
    const pz = z + ((nx - x) / len) * off * side;
    if (clear(px, pz, 1.5) && inBog(px, pz) === 0 && !inSquare(px, pz)) add('rowan', px, pz, 0.85 + rand() * 0.3);
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
    const x = scar.x + ax * (scar.hw + 0.5) * (0.92 + rand() * 0.12);
    const z = scar.z + az * (scar.hd + 0.5) * (0.92 + rand() * 0.12);
    add('rock', x, z, 1.5 + rand() * 1.3);
  }
  // The rockfall: big rocks piled across the Sunreach road's end and the gap either side.
  const [ex, ez] = rockfall;
  for (let i = 0; i < MOOR.rockfall.count; i++) {
    const x = ex + (rand() - 0.5) * 2 * MOOR.rockfall.spread;
    const z = ez + 1 + rand() * 7;
    add('rock', x, z, MOOR.rockfall.scale[0] + rand() * (MOOR.rockfall.scale[1] - MOOR.rockfall.scale[0]));
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
