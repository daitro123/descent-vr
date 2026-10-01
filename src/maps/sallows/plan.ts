import { CONFIG } from '../../config';
import type { PlaceSound, Tree } from '../../world/ambience';
import type { Atmosphere } from '../../world/atmosphere';
import { type Deck, Decks, deckBetween } from '../decks';
import { FEN_ROAD, fenRoadHeight, fenRoadSeam } from '../fenRoad';
import { Colliders } from '../forest/colliders';
import { fbm, lerp, mulberry32, nearestOnPolyline, type P2, sampleCurve, smoothstep, valueNoise } from '../forest/noise';
import { HeightGrid } from '../heightGrid';
import { flattenTo, lineField, smoothHeights } from '../lines';
import type { Seam, SideSeam, Spot } from '../types';
import { Walkable } from '../walkable';
import { FEN_LIGHT, FEN_SKY } from './palette';

// The Sallows: the river Ald's delta, reed fens, black channels, mud flats
// and mist, with a drowned Deepking town half sunk in the middle (its spec:
// the project's zones/sallows.md). Almost flat, 0 to 4 m above the water,
// its height in low holms, banks and dykes, the causeway and the ruins. The
// Great Channel runs north to south-east through the middle, deep and banked;
// the rest of the water is shallow enough to wade. Reedholm, the stilt town,
// stands over a pool a quarter of the way in from the west, where the Fen
// road from Brackenmoor meets the channel. Nothing lives here yet.
//
// This file is the plan only: heights, water, roads, decks, what stands
// where, what you bump into. No three.js meshes, so it runs in tests and in
// its worker. x is east, z is south, in world metres on the one chunk grid.

export const SALLOWS = {
  /** 12 by 11 chunks east of Brackenmoor's Fen road and south of Aldhaven. */
  land: { minX: 260, maxX: 740, minZ: 500, maxZ: 940 },
  /** Height grid spacing, as every zone's, so seams meet vertex for vertex. */
  cell: 2,
  /** The one water level: the sea's, the channels', the pools' (the Fen road seam's too). */
  water: FEN_ROAD.beck.water,
  /** Where you can walk: west of the sea, north of the salt marsh, inside the rim hills. */
  walk: { minX: 272, maxX: 700, minZ: 506, maxZ: 905 },
  /** The Great Channel: half its width, its bed, and how far its banks shoulder into the fen. */
  channel: { half: 9, bed: -2.6, shoulder: 3 },
  /** Lodes: the shallow side channels you can wade. */
  lode: { half: 2.5, bed: -0.8, shoulder: 2 },
  /** Roads run on banks at least this high, tracks a little lower. */
  bank: { road: 0.8, track: 0.7 },
  /** Over this many metres in from a seam the land blends to the seam's heights. */
  blend: { west: 30, north: 24 },
  /** Decks you walk on in Reedholm, and the stilt houses' floors over the pool: the same, so a porch meets its lane flush. */
  deck: 0.9,
  floor: 0.9,
} as const;

/** The Delta causeway's line where it crosses into Aldhaven, and the height of its bank there. */
export const CAUSEWAY = { x: 380, y: 1.6, width: 4 } as const;

/**
 * The Sallows' air under the World's one sun: low, thick fog all day in a
 * pale green-grey, a soft gold sun through it, closing far nearer than the
 * moor's (25 to 75 m against 40 to 200), so the streamer reaches less far.
 */
export const SALLOWS_ATMOSPHERE: Atmosphere = {
  background: FEN_SKY.haze,
  fog: { color: FEN_SKY.haze, near: 25, far: 75 },
  sky: { zenith: FEN_SKY.zenith, horizon: FEN_SKY.horizon, haze: FEN_SKY.haze, sun: FEN_SKY.sun },
  sun: { color: FEN_LIGHT.sun, intensity: 1.9 },
  hemisphere: { sky: FEN_LIGHT.sky, ground: FEN_LIGHT.ground, intensity: 1.6 },
  farPlane: 120,
  flames: [],
};

/** What grows or lies in the fens. */
export type FenKind =
  | 'reed' | 'sedge' | 'willow' | 'pollard' | 'alder' | 'lily' | 'deadTree' | 'juniper'
  | 'samphire' | 'cotton' | 'rock' | 'chalkRock' | 'rubble'
  | 'tussock' | 'loosestrife' | 'iris' | 'meadowsweet' | 'marigold';

export interface FenPlant {
  readonly kind: FenKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly scale: number;
  readonly seed: number;
}

/** Too small to see from a stand-in's distance. */
export const UNDERGROWTH: ReadonlySet<FenKind> = new Set(['sedge', 'lily', 'samphire', 'cotton', 'rock', 'tussock', 'loosestrife', 'iris', 'meadowsweet', 'marigold']);

/** Trunk radius for what you can't walk through (scaled by the plant's scale). */
const TRUNK: Partial<Record<FenKind, number>> = {
  willow: 0.35, pollard: 0.42, alder: 0.32, deadTree: 0.35, juniper: 0.3, chalkRock: 0.7, rubble: 0.6,
};

/** How tall a tree stands, for birds to perch in (scaled by its scale). */
const TREE_HEIGHT: Partial<Record<FenKind, number>> = { willow: 6, alder: 6.5, pollard: 3.5, deadTree: 5 };

/** Everything built in the fens, each in its own frame (origin on its footing, front facing +Z). */
export type FenStructureKind =
  | 'stiltHouse' | 'inn' | 'mootHall' | 'forge' | 'herbHut' | 'smokeShed' | 'netRack' | 'punt' | 'eelTraps'
  | 'raft' | 'mapboard' | 'signpost' | 'lanternPost' | 'lastStone'
  | 'tollHouse' | 'tollGate' | 'customsRuin' | 'watchPost'
  | 'chapel' | 'grave' | 'sunkCottage' | 'hide' | 'decoys' | 'gibbet' | 'kiln' | 'chalkBank'
  | 'smokehouse' | 'crates' | 'cog' | 'tent' | 'lookout'
  | 'factorHouse' | 'trestle' | 'lanternPole' | 'palisade' | 'sheerlegs' | 'dredger' | 'deepStatue' | 'deepStairs'
  | 'sluice' | 'sluiceTower' | 'sluiceGate' | 'deepWall' | 'deepArch' | 'deepRoof' | 'drownedTower' | 'bellTower' | 'floodWall'
  | 'bridge'
  | 'stall' | 'revetment' | 'banner' | 'peatStack' | 'fencePosts' | 'plankBridge' | 'column' | 'deepHead' | 'brazier' | 'churchyard'
  | 'washLine';

export interface FenStructure {
  readonly kind: FenStructureKind;
  readonly x: number;
  /** The height its frame's origin stands at: the ground, a deck, or the water line for what stands on piles. */
  readonly y: number;
  readonly z: number;
  /** As a model turns about +Y: its front faces (sin yaw, cos yaw). */
  readonly yaw: number;
  /** Its footprint (m across its own X and Z) and a height, where its kind needs them. */
  readonly w: number;
  readonly d: number;
  readonly h: number;
  readonly seed: number;
  readonly variant: number;
  /** Its footprint is solid: a box you can't walk into. */
  readonly solid: boolean;
  /** For a ring of piles round a holm: the turns (radians from its +Z, as `yaw` is) where a walkway or road crosses it, left open. */
  readonly gaps?: readonly number[];
}

/** A road or track: its centre line (about a metre between samples), width, and the bank's height along it. */
export interface FenRoad {
  readonly id: string;
  readonly line: readonly P2[];
  readonly width: number;
  readonly heights: readonly number[];
  /** Laid with logs across it: the Fen road over the bog. */
  readonly logs: boolean;
}

/** How a deck looks: planks on piles, or the Deepkings' stone (the sluice's walkway and the old bridge). */
export type DeckLook = 'plank' | 'stone';

export interface FenDeck extends Deck {
  readonly look: DeckLook;
  /** Rails along both sides, which you can't walk through. */
  readonly railed: boolean;
  /** Walked on but drawn by something else: a stilt house's porch, which its house's model lays. */
  readonly hidden?: boolean;
}

/** A light's glow (a lantern, a lit window) and a plume of smoke, for the zone's extras. */
export interface FenGlow {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly size: number;
  readonly color: number;
}

export interface SallowsPlan {
  readonly walkable: Walkable;
  /** Its heights along the Fen road, Brackenmoor's own (src/maps/fenRoad.ts). */
  readonly fenSeam: SideSeam;
  /** Its heights along its north edge, where Aldhaven's causeway comes in: for Aldhaven to meet. */
  readonly northSeam: Seam;
  readonly ground: HeightGrid;
  readonly roads: readonly FenRoad[];
  /** Distance to the nearest road's edge at each ground vertex (negative on it, Infinity far off). */
  readonly roadDistance: Float32Array;
  /** The Great Channel's centre line. */
  readonly channel: readonly P2[];
  readonly decks: readonly FenDeck[];
  readonly structures: readonly FenStructure[];
  readonly plants: readonly FenPlant[];
  readonly glows: readonly FenGlow[];
  readonly smoke: readonly { x: number; y: number; z: number; fire: boolean }[];
  readonly sounds: readonly PlaceSound[];
  readonly colliders: Colliders;
  /** Where `?map=sallows` starts: on the Fen road by the Last Stone, looking east over the fen. */
  readonly spawn: Spot;
  readonly landmarks: readonly { label: string; x: number; z: number }[];
  readonly trees: readonly Tree[];
  heightAt(x: number, z: number): number;
}

/** What placing things asks of the land already laid: how far a road's edge, the channel's middle, and the decks. */
interface Fields {
  road(x: number, z: number): number;
  channel(x: number, z: number): number;
  readonly decks: Decks;
}

// ------------------------------------------------------------------ where things are

/** The Great Channel, the Ald's main mouth: in from Aldhaven's side, down past Reedholm and the Sluice House, out to the sea. */
const CHANNEL: readonly P2[] = [
  [452, 494], [448, 540], [452, 600], [462, 650], [470, 700], [490, 750], [530, 795], [590, 835], [650, 868], [700, 885], [748, 892],
];

/**
 * Reedholm: the wide pool it stands over (an oval, its middle flat and
 * under water, so every stilt house has water under it), the landing's holm
 * and the moot hall's island in it, the plank square between them and the
 * forge's stone footing south of the square.
 */
export const REEDHOLM = {
  pool: { x: 398, z: 619, rx: 57, rz: 48 },
  landing: { x: 364, z: 608, r: 10 },
  square: { x: 393, z: 611, hw: 9, hd: 8 },
  moot: { x: 420, z: 611, r: 9 },
  forge: { x: 393, z: 632, half: 4.5 },
} as const;

/** The places worth a look, and the levels of the land round them in the spec. */
export const PLACES = {
  lastStone: { x: 266, z: 548 },
  tollHouse: { x: 391, z: 513 },
  customs: { x: 362, z: 532 },
  watchPost: { x: 424, z: 548 },
  gibbet: { x: 322, z: 642 },
  cockleEnd: { x: 302, z: 714 },
  withy: { x: 374, z: 772 },
  odo: { x: 300, z: 834 },
  eelworks: { x: 400, z: 700 },
  mire: { x: 430, z: 838 },
  sluice: { x: 470, z: 700 },
  drownedTown: { x: 588, z: 708 },
  drownedTower: { x: 630, z: 752 },
  hythe: { x: 684, z: 622 },
  kiln: { x: 294, z: 895 },
} as const;

/** How far out across Reedholm's pool (x, z) is: 0 in its middle, 1 at its rim, which wanders in and out a few metres so it's no drawn oval. */
function inPool(x: number, z: number): number {
  const { pool } = REEDHOLM;
  return Math.hypot((x - pool.x) / pool.rx, (z - pool.z) / pool.rz) + (valueNoise(x * 0.045, z * 0.045, 213) - 0.5) * 0.16;
}

/** The Sluice House's tower, on the Great Channel's west bank, its door on the lock's walkway. */
const SLUICE_TOWER = { x: 453.5, z: 697.5, w: 7 } as const;

/** Raised ground: the holms and footings, each to `h` at its middle, out to `r`. */
const HOLMS: readonly { x: number; z: number; r: number; h: number; steep?: boolean }[] = [
  // The landing's holm and the moot hall's island are built up behind timber staithes: flat to their rims, then down into the pool.
  { ...REEDHOLM.landing, h: 0.85, steep: true },
  { ...REEDHOLM.moot, h: 0.85, steep: true },
  { ...PLACES.gibbet, r: 8, h: 1.0 },
  { ...PLACES.withy, r: 20, h: 0.9 },
  { ...PLACES.odo, r: 17, h: 1.3 },
  { ...PLACES.eelworks, r: 11, h: 0.8 },
  { ...PLACES.tollHouse, r: 9, h: 1.4 },
  { ...PLACES.customs, r: 7, h: 0.9 },
  { x: SLUICE_TOWER.x, z: SLUICE_TOWER.z, r: 12, h: 1.2 },
  { x: 489, z: 696, r: 7, h: 1.2 },
  { ...PLACES.hythe, r: 15, h: 0.7 },
  { ...PLACES.kiln, r: 9, h: 2.2 },
  { x: 610, z: 690, r: 7, h: 0.5 },
  { x: 566, z: 732, r: 6, h: 0.4 },
];

/** Hollows where the water stands: flooded Cockle End, the moat round the Gibbet Willow's holm and the drowned town's basin. */
const HOLLOWS: readonly { x: number; z: number; r: number; h: number }[] = [
  { ...PLACES.cockleEnd, r: 24, h: -0.5 },
  { ...PLACES.gibbet, r: 20, h: -0.35 },
  { ...PLACES.drownedTown, r: 58, h: -0.7 },
];

/** The lodes: shallow side channels, wadeable. */
const LODES: readonly (readonly P2[])[] = [
  [[426, 614], [440, 616], [452, 618]],
  [[408, 650], [404, 668], [401, 690]],
  [[296, 690], [312, 730], [338, 757], [362, 771]],
  [[520, 610], [560, 600], [610, 596], [660, 590], [700, 586]],
  [[600, 760], [630, 800], [640, 840]],
];

/** The roads: each runs on a bank, and every one of them keeps you out of deep water. */
const ROADS: readonly { id: string; pts: readonly P2[]; width: number; logs?: boolean; track?: boolean; first?: number }[] = [
  // The Fen road from Brackenmoor, a log road over the bog to Reedholm's landing.
  { id: 'fen', pts: [[FEN_ROAD.x, FEN_ROAD.road.z], [272, 543], [292, 546], [318, 556], [340, 572], [355, 590], [362, 603]], width: FEN_ROAD.road.width, logs: true, first: FEN_ROAD.road.y },
  // The Delta causeway in from Aldhaven, by the toll house, to where its boardwalk begins.
  { id: 'causeway', pts: [[CAUSEWAY.x, 500], [CAUSEWAY.x, 512], [380, 526]], width: CAUSEWAY.width, first: CAUSEWAY.y },
  // The Dyke Path: Reedholm's moot island south along the Great Channel's west bank, past the Sluice House's tower, to the old bridge.
  { id: 'dyke', pts: [[424, 619], [434, 640], [440, 668], [443, 690], [447, 712], [457, 738], [471, 760], [490, 780], [510, 796]], width: 3.2 },
  // Over the old bridge and along the drowned town's ring dyke, past the Drowned Tower, north to Smugglers' Hythe on the eastern flats.
  { id: 'drowned', pts: [[534, 776], [552, 772], [578, 773], [604, 770], [624, 772], [644, 760], [655, 735], [659, 705], [663, 674], [669, 648], [675, 632], [679.5, 626.5]], width: 3.2 },
  // The Chalk Road: south-west from the landing along a dyke, past the Lime Kiln, out towards Sunreach.
  { id: 'chalk', pts: [[358, 614], [350, 640], [342, 680], [336, 720], [331, 760], [318, 810], [304, 858], [292, 884], [276, 900], [258, 905]], width: 3.4 },
  // Tracks to the places off the roads.
  { id: 'cockle', pts: [[340, 700], [324, 708], [316, 712]], width: 2.2, track: true },
  { id: 'withy', pts: [[333, 742], [352, 752], [366, 764], [374, 774]], width: 2.2, track: true },
  { id: 'odo', pts: [[318, 812], [308, 824]], width: 2.2, track: true },
  { id: 'eelworks', pts: [[440, 668], [424, 682], [410, 694]], width: 2.2, track: true },
  { id: 'mire', pts: [[471, 760], [458, 790], [446, 814], [436, 828]], width: 2.2, track: true },
  // Into the drowned town off the ring dyke: an old street, raised, to the flood walls.
  { id: 'street', pts: [[566, 772], [566, 756], [568, 742], [570, 732]], width: 3, track: true },
];

/** The causeway's boardwalk on to Reedholm's square, over open water the reeds close in on. */
const BOARDWALK: readonly P2[] = [[380, 524], [382, 545], [384, 570], [386, 590], [386.5, 603.3]];

/**
 * Reedholm's lanes: plank walkways out from the square and the forge's
 * footing, with houses either side, each ending on a road's bank or at a
 * jetty out over the pool.
 */
const LANES: readonly (readonly P2[])[] = [
  // North-west, round the landing's holm to the Fen road.
  [[384.6, 605.6], [376, 600], [366, 596.5], [360.8, 595.2]],
  // North-east, past the eel jetty to Mother Sedge's hut.
  [[401.4, 605.6], [410, 598.5], [421, 594], [433.4, 591]],
  // South-west, out over the pool to a jetty.
  [[384.6, 616.4], [377, 624], [370, 632], [364, 641.5]],
  // South-east from the forge, out to the Dyke Path.
  [[397.5, 636.6], [408, 642], [420, 646], [431, 648.5], [435.2, 649.2]],
  // South off the moot hall's island, down to the south-east lane.
  [[418.6, 618.5], [416.5, 630], [414.2, 643.6]],
  // North off the north-west lane, out over the pool to a jetty.
  [[376.5, 600.6], [375.2, 590], [373.6, 580.5]],
  // North off the north-east lane, between the inn and the eel jetty.
  [[409.6, 599.2], [409.2, 590], [408.6, 581]],
];

/** Lanes' width, and a stilt house's porch: how far out it reaches, so it meets its lane's edge. */
export const LANE = { width: 3, porch: 1.8 } as const;

/** Old Wenna's eel jetty, north off the north-east lane towards the causeway. */
const EEL_JETTY: readonly P2[] = [[421.6, 594.4], [421, 582]];

/** The ferry's jetty, south off the landing's holm, where Hob's flat boat ties up. */
const FERRY_JETTY: readonly P2[] = [[362.5, 615.5], [362.5, 627]];

/** A plank jetty off Smugglers' Hythe's shell bank, to where the boats come in. */
const HYTHE_JETTY: readonly P2[] = [[690, 627], [699, 628.5]];

/** The drowned town's stone quay, at the end of its old street, out over the basin. */
const STREET_QUAY: readonly P2[] = [[569, 735], [571.5, 722.5]];

/** A landing stage at the Cockle End track's end, out over the flood towards the cottages. */
const COCKLE_JETTY: readonly P2[] = [[316.5, 711.8], [309.5, 713]];

/** Mother Sedge's hut at the north-east lane's end, facing back down it. */
const HERB_HUT = { x: 437.3, z: 591, yaw: -Math.PI / 2 } as const;

// ------------------------------------------------------------------ the plan

/** Plan the Sallows. Seeded throughout, so the same every time. */
export function planSallows(): SallowsPlan {
  const { land, cell } = SALLOWS;
  const cols = Math.round((land.maxX - land.minX) / cell) + 1;
  const rows = Math.round((land.maxZ - land.minZ) / cell) + 1;
  const ground = new HeightGrid(land.minX, land.minZ, cols, rows, cell);
  const channel = sampleCurve(CHANNEL, 1);

  // 1. The fen's own lie: low, wet and uneven, with its holms, hollows, channels, the sea and the rim hills.
  ground.each((x, z, k) => (ground.data[k] = fenHeight(x, z)));
  for (const lode of LODES) cut(ground, sampleCurve(lode, 1), SALLOWS.lode);
  cut(ground, channel, SALLOWS.channel);
  // Under the boardwalk, a lode of open water.
  cut(ground, sampleCurve(BOARDWALK, 1).slice(4), { half: 4.5, bed: -0.4, shoulder: 3 });

  // 2. The roads, each on a bank.
  const roads = ROADS.map((r): FenRoad => {
    const line = sampleCurve(r.pts, 1);
    const min = r.track ? SALLOWS.bank.track : SALLOWS.bank.road;
    const raw = line.map(([x, z]) => Math.max(min, ground.at(x, z) + 0.15));
    // A road that runs on over a seam starts at the seam's height and eases off it.
    if (r.first !== undefined) raw.forEach((h, i) => (raw[i] = lerp(r.first!, h, smoothstep(0, 18, i))));
    const heights = smoothHeights(raw, 5, 4, { first: r.first !== undefined }).map((h, i) => (r.first === undefined ? h : lerp(r.first, h, smoothstep(0, 14, i))));
    return { id: r.id, line, width: r.width, heights, logs: !!r.logs };
  });
  for (const r of roads) flattenTo(ground, lineField(ground, r.line, r.width / 2 + 3), r.heights, r.width / 2 + 0.6, 2.4);
  // Abutments where the crossings land on each bank.
  for (const end of [...CROSSINGS.sluice, ...CROSSINGS.bridge]) abut(ground, end, ABUTMENT.h, ABUTMENT.r);

  // 3. Last, the seams: the Fen road's line exactly as Brackenmoor's (fenRoad.ts), and the north edge as Aldhaven will meet it.
  meetWest(ground);
  meetNorth(ground);

  const heightField = (x: number, z: number) => ground.at(x, z);

  // How far each ground vertex is from the nearest road's edge, and from the Great Channel's middle.
  const roadDistance = new Float32Array(ground.data.length).fill(Infinity);
  for (const r of roads) {
    const f = lineField(ground, r.line, 16);
    for (let k = 0; k < roadDistance.length; k++) roadDistance[k] = Math.min(roadDistance[k], f.d[k] - r.width / 2);
  }
  const channelField = lineField(ground, channel, 20).d;
  const vertex = (x: number, z: number) => ground.row(z) * ground.cols + ground.col(x);
  const road = (x: number, z: number) => roadDistance[vertex(x, z)];
  const inChannel = (x: number, z: number) => channelField[vertex(x, z)];

  // The walkways first, then Reedholm's houses along them, whose porches you walk onto too.
  const walks = planDecks(heightField);
  const town = planHouses(heightField, { road, channel: inChannel, decks: new Decks(walks) });
  const decks = [...walks, ...town.porches];
  const deckSet = new Decks(decks);
  const heightAt = (x: number, z: number) => Math.max(ground.at(x, z), deckSet.at(x, z));
  const fields: Fields = { road, channel: inChannel, decks: deckSet };

  const walkable = new Walkable(walkableAreas());
  const colliders = new Colliders(walkable);
  const structures = placeStructures(heightField, fields, town.houses, town.boats);
  for (const s of structures) if (s.solid) colliders.addBox({ x: s.x, z: s.z, hw: s.w / 2, hd: s.d / 2, yaw: s.yaw });
  addChannelBanks(colliders, channel, decks);
  for (const d of decks) if (d.railed) addRails(colliders, d);

  const plants = placePlants(ground, walkable, fields, roads, structures);
  for (const p of plants) {
    const r = TRUNK[p.kind];
    if (r && walkable.distance(p.x, p.z) <= 2) colliders.addCircle({ x: p.x, z: p.z, r: r * p.scale });
  }

  const trees = plants
    .filter((p) => TREE_HEIGHT[p.kind] !== undefined)
    .map((p) => ({ x: p.x, y: p.y, z: p.z, height: TREE_HEIGHT[p.kind]! * p.scale }));
  const fenSeam = fenRoadSeam();
  const northSeam: Seam = {
    z: land.minZ,
    minX: land.minX,
    maxX: land.maxX,
    step: cell,
    heights: Array.from({ length: cols }, (_, i) => ground.get(i, 0)),
    roads: [{ x: CAUSEWAY.x, width: CAUSEWAY.width, dir: [0, -1] }],
  };
  const { lights, plumes } = lightsAndSmoke(structures);
  return {
    walkable,
    fenSeam,
    northSeam,
    ground,
    roads,
    roadDistance,
    channel,
    decks,
    structures,
    plants,
    glows: lights,
    smoke: plumes,
    sounds: [
      { id: 'stream', x: PLACES.sluice.x, y: 0.5, z: PLACES.sluice.z, interior: null },
      { id: 'dock', x: REEDHOLM.landing.x + 4, y: 0.4, z: REEDHOLM.landing.z, interior: null },
      { id: 'campfire', x: PLACES.kiln.x, y: 3, z: PLACES.kiln.z, interior: null },
    ],
    colliders,
    spawn: { x: 268, z: FEN_ROAD.road.z, yaw: -Math.PI / 2 },
    landmarks: [
      { label: 'The Last Stone', x: 274, z: FEN_ROAD.road.z },
      { label: 'Reedholm', x: REEDHOLM.square.x, z: REEDHOLM.square.z },
      { label: 'The toll house', x: CAUSEWAY.x, z: 518 },
      { label: 'The Gibbet Willow', x: PLACES.gibbet.x + 8, z: PLACES.gibbet.z },
      { label: 'Cockle End', x: 320, z: 709 },
      { label: 'The Eelworks', x: 414, z: 690 },
      { label: 'The Sluice House', x: 452, z: 712 },
      { label: 'The Withy Holm', x: 360, z: 765 },
      { label: "Saint Odo's Chapel", x: 312, z: 822 },
      { label: 'The Mire', x: 438, z: 826 },
      { label: 'The Drowned Town', x: 572, z: 724 },
      { label: "Smugglers' Hythe", x: 672, z: 630 },
      { label: 'The Lime Kiln', x: 300, z: 884 },
    ],
    trees,
    heightAt,
  };
}

// ------------------------------------------------------------------ the land

/** The fen's height at (x, z) before its channels, roads and seams. */
function fenHeight(x: number, z: number): number {
  const { land } = SALLOWS;
  // Peat and silt a little over the water, and pools a little under it.
  let h = 0.32 + (fbm(x * 0.017, z * 0.017, 201) - 0.5) * 2.4 + (fbm(x * 0.07, z * 0.07, 203) - 0.5) * 0.45;
  // The Mire: quaking bog, all hummocks and pools.
  const mire = smoothstep(40, 26, Math.hypot(x - PLACES.mire.x, z - PLACES.mire.z));
  h = lerp(h, 0.08 + (valueNoise(x * 0.35, z * 0.35, 207) - 0.5) * 0.8, mire);
  for (const p of HOLLOWS) h = lerp(h, p.h + (valueNoise(x * 0.2, z * 0.2, 209) - 0.5) * 0.2, smoothstep(p.r, p.r * 0.6, Math.hypot(x - p.x, z - p.z)));
  // Reedholm's pool: flat and knee deep under the whole town, banking up only at its rim.
  h = lerp(h, -0.55 + (valueNoise(x * 0.2, z * 0.2, 209) - 0.5) * 0.12, smoothstep(1, 0.74, inPool(x, z)));
  for (const p of HOLMS) h = Math.max(h, lerp(h, p.h + (valueNoise(x * 0.3, z * 0.3, 211) - 0.5) * (p.steep ? 0.05 : 0.12), smoothstep(p.r, p.steep ? p.r - 2 : p.r * 0.55, Math.hypot(x - p.x, z - p.z))));
  // Kiln Edge: the fen dries onto chalk in the south-west, in low banks.
  const chalk = smoothstep(350, 320, x) * smoothstep(850, 880, z);
  h = Math.max(h, lerp(h, 1.0 + fbm(x * 0.05, z * 0.05, 213) * 2.2, chalk));
  // The shell banks along the eastern flats, then the sea.
  h += 0.55 * Math.exp(-(((x - 668) / 5) ** 2)) * smoothstep(520, 560, z) * smoothstep(870, 840, z);
  h = lerp(h, -2.4, smoothstep(684, 728, x));
  // The salt marsh to the south, left for later.
  h = lerp(h, -0.45 + (valueNoise(x * 0.1, z * 0.1, 215) - 0.5) * 0.4, smoothstep(902, 926, z));
  // Rough hills along the west, where Sunreach's will be, but for the Chalk Road's way out by the kiln.
  const west = smoothstep(306, land.minX, x) * smoothstep(575, 600, z);
  const gap = 1 - 0.85 * smoothstep(16, 5, Math.abs(z - 905));
  h += west * west * (6 + 3 * fbm(x * 0.03, z * 0.03, 217)) * gap;
  return h;
}

/** The crossings' abutments: ground raised to `h` round each end. */
const ABUTMENT = { h: 1.0, r: 5 } as const;

/** Raise the ground round `p` to `h`, out to `r`. */
function abut(ground: HeightGrid, p: P2, h: number, r: number): void {
  ground.each((x, z, k) => {
    const d = Math.hypot(x - p[0], z - p[1]);
    if (d < r) ground.data[k] = Math.max(ground.data[k], lerp(ground.data[k], h, smoothstep(r, r * 0.5, d)));
  });
}

/** Cut a channel along `line`: to `bed` within `half` of its middle, shouldering back to the land by `shoulder` more. */
function cut(ground: HeightGrid, line: readonly P2[], c: { half: number; bed: number; shoulder: number }): void {
  const field = lineField(ground, line, c.half + c.shoulder);
  for (let k = 0; k < ground.data.length; k++) {
    const d = field.d[k];
    if (d > c.half + c.shoulder) continue;
    const t = smoothstep(c.half + c.shoulder, c.half - 1.5, d);
    ground.data[k] = Math.min(ground.data[k], lerp(ground.data[k], c.bed, t));
  }
}

/** The west edge's heights: the Fen road seam's own along it, the rim hills elsewhere; the first SALLOWS.blend.west m blend to them. */
function meetWest(ground: HeightGrid): void {
  const { minZ, maxZ } = FEN_ROAD;
  for (let j = 0; j < ground.rows; j++) {
    const z = ground.z(j);
    if (z < minZ || z > maxZ) continue;
    // Beyond the seam's ends, fade the blend out over a few metres so it never steps.
    const edge = fenRoadHeight(z);
    for (let i = 0; i < ground.cols; i++) {
      const t = smoothstep(0, SALLOWS.blend.west, ground.x(i) - ground.x0);
      if (t >= 1) break;
      const k = j * ground.cols + i;
      ground.data[k] = i === 0 ? edge : lerp(edge, ground.data[k], t);
    }
  }
  // South of the seam the west edge is the rim hills', and they meet the seam's south end without a step.
  const south = fenRoadHeight(maxZ);
  for (let j = 0; j < ground.rows; j++) {
    const z = ground.z(j);
    if (z <= maxZ || z > maxZ + 20) continue;
    const u = smoothstep(maxZ + 20, maxZ, z);
    for (let i = 0; i < ground.cols; i++) {
      const t = smoothstep(0, SALLOWS.blend.west, ground.x(i) - ground.x0);
      if (t >= 1) break;
      const k = j * ground.cols + i;
      ground.data[k] = lerp(ground.data[k], lerp(south, ground.data[k], t), u);
    }
  }
}

/**
 * The north edge as Aldhaven meets it: low fen, the causeway's bank where
 * it crosses, the Great Channel's bed, the sea in the east, and up to the
 * Fen road seam's hill at the west corner.
 */
export function northEdgeHeight(x: number): number {
  const { channel } = SALLOWS;
  let h = 0.45 + 0.2 * Math.sin(x * 0.11) + 0.1 * Math.sin(x * 0.37);
  h += (CAUSEWAY.y - h) * smoothstep(CAUSEWAY.width / 2 + 3, CAUSEWAY.width / 2 + 0.6, Math.abs(x - CAUSEWAY.x));
  h += (channel.bed - h) * smoothstep(channel.half + channel.shoulder, channel.half - 1.5, Math.abs(x - CHANNEL[0][0] - 0.3));
  h = lerp(h, -2.4, smoothstep(684, 728, x));
  h += (FEN_ROAD.ends.north - h) * smoothstep(300, SALLOWS.land.minX, x);
  return h;
}

function meetNorth(ground: HeightGrid): void {
  for (let j = 0; j < ground.rows; j++) {
    const t = smoothstep(0, SALLOWS.blend.north, ground.z(j) - ground.z0);
    if (t >= 1) break;
    for (let i = 0; i < ground.cols; i++) {
      const k = j * ground.cols + i;
      // The west column is the Fen road seam's: the corner agrees (both are its north hill).
      if (i === 0 && ground.z(j) >= FEN_ROAD.minZ) continue;
      const edge = northEdgeHeight(ground.x(i));
      ground.data[k] = j === 0 ? edge : lerp(edge, ground.data[k], t);
    }
  }
}

/**
 * Where you can walk: the fen inside its rim, the Fen road's last stretch
 * on to the seam (reaching CONFIG.world.ground.seam over it, into
 * Brackenmoor's), and the causeway's on to Aldhaven's line.
 */
function walkableAreas(): P2[][] {
  const { walk } = SALLOWS;
  const over = CONFIG.world.ground.seam;
  const rect = (x0: number, x1: number, z0: number, z1: number): P2[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  return [
    rect(walk.minX, walk.maxX, walk.minZ, walk.maxZ),
    rect(FEN_ROAD.x - over, walk.minX + 2, FEN_ROAD.road.z - 6, FEN_ROAD.road.z + 6),
    rect(CAUSEWAY.x - 4, CAUSEWAY.x + 4, SALLOWS.land.minZ - over, walk.minZ + 2),
  ];
}

// ------------------------------------------------------------------ decks

/** A walkway along `pts`, split into straight decks no longer than `max` m, each end at the height `y` gives. */
function walkway(pts: readonly P2[], width: number, y: (x: number, z: number) => number, look: DeckLook = 'plank', railed = false, max = 10): FenDeck[] {
  const out: FenDeck[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / max));
    for (let k = 0; k < n; k++) {
      const p: P2 = [lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)];
      const q: P2 = [lerp(a[0], b[0], (k + 1) / n), lerp(a[1], b[1], (k + 1) / n)];
      // Each overlaps the next by a little, so there's no seam underfoot.
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const ex = ((q[0] - p[0]) / len) * 0.15;
      const ez = ((q[1] - p[1]) / len) * 0.15;
      out.push({ ...deckBetween([p[0] - ex, p[1] - ez], [q[0] + ex, q[1] + ez], width, y(...p), y(...q)), look, railed });
    }
  }
  return out;
}

/** Across the Great Channel at its point nearest (x, z): from bank to bank and `reach` m on, the west end first. */
function across(x: number, z: number, reach: number): [P2, P2] {
  const line = sampleCurve(CHANNEL, 1);
  const { i } = nearestOnPolyline(line, x, z);
  const [a, b] = [line[i], line[Math.min(i + 1, line.length - 1)]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const [nx, nz] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  const half = SALLOWS.channel.half + reach;
  const ends: [P2, P2] = [
    [a[0] - nx * half, a[1] - nz * half],
    [a[0] + nx * half, a[1] + nz * half],
  ];
  // West bank first.
  return ends[0][0] <= ends[1][0] ? ends : [ends[1], ends[0]];
}

/** The sluice's walkway and the old bridge over the Great Channel. */
export const CROSSINGS = {
  sluice: across(PLACES.sluice.x, PLACES.sluice.z, 4),
  bridge: across(522, 786, 5),
} as const;

/** Every deck you walk on: Reedholm's square, walkways, lanes, jetties and the forge's footing, the causeway's boardwalk, the sluice's walkway and the old bridge. */
function planDecks(ground: (x: number, z: number) => number): FenDeck[] {
  const { square, forge, landing, moot } = REEDHOLM;
  const deck = SALLOWS.deck;
  const flat = () => deck;
  /** A lane's height: the deck's over the pool, and a bank's where it lands on one, so it never steps or sinks. */
  const onto = (x: number, z: number) => Math.max(deck, ground(x, z) + 0.04);
  const decks: FenDeck[] = [
    { ...deckBetween([square.x, square.z - square.hd], [square.x, square.z + square.hd], 2 * square.hw, deck, deck), look: 'plank', railed: false },
    { ...deckBetween([forge.x, forge.z - forge.half], [forge.x, forge.z + forge.half], 2 * forge.half, deck, deck), look: 'stone', railed: false },
    // From the landing to the square, and on to the moot hall's island: the main walkway, railed and wide enough for crowds.
    ...walkway([[landing.x + 6.5, square.z], [square.x - square.hw + 0.1, square.z]], 4, flat, 'plank', true, 20),
    ...walkway([[square.x + square.hw - 0.1, square.z], [moot.x - 5.5, square.z]], 4, flat, 'plank', true, 20),
    // The forge's footing off the square's south side.
    ...walkway([[forge.x, square.z + square.hd - 0.1], [forge.x, forge.z - forge.half + 0.1]], 3, flat),
    // The lanes, and the jetties off them.
    ...LANES.flatMap((lane) => walkway(lane, LANE.width, onto)),
    ...walkway(EEL_JETTY, 2, flat),
    ...walkway(FERRY_JETTY, 2.2, onto),
    // The causeway's boardwalk, from its bank down to the square.
    ...walkway(BOARDWALK, 3, onto),
    // Out beyond Reedholm: the Hythe's jetty and Cockle End's landing stage.
    ...walkway(HYTHE_JETTY, 2, onto),
    ...walkway(COCKLE_JETTY, 1.8, onto),
  ];
  // The drowned town's old street ends on a stone quay before the flood walls.
  decks.push({ ...deckBetween(STREET_QUAY[0], STREET_QUAY[1], 7, 0.9, 0.9), look: 'stone', railed: false });
  // Over the Great Channel: the sluice's walkway, its rails solid, and the old Deepking bridge, arched.
  const [sw, se] = CROSSINGS.sluice;
  decks.push({ ...deckBetween(sw, se, 2.6, ground(...sw), ground(...se)), look: 'stone', railed: true });
  const [bw, be] = CROSSINGS.bridge;
  decks.push({ ...deckBetween(bw, be, 3.4, ground(...bw), ground(...be), 1.2), look: 'stone', railed: true });
  return decks;
}

/** A footprint on the floor: middle, turn, half extents along its own X and Z. */
interface Rect {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly hw: number;
  readonly hd: number;
}

/** Do two footprints overlap, each grown by `margin`? (Separating axes.) */
function overlaps(a: Rect, b: Rect, margin = 0): boolean {
  const axes = [a.yaw, b.yaw].flatMap((y) => [[Math.cos(y), -Math.sin(y)], [Math.sin(y), Math.cos(y)]] as const);
  for (const [ax, az] of axes) {
    const reach = (r: Rect) => {
      const [c, s] = [Math.cos(r.yaw), Math.sin(r.yaw)];
      // The rect's own X and Z in world terms, projected on the axis.
      return Math.abs((c * ax - s * az) * (r.hw + margin)) + Math.abs((s * ax + c * az) * (r.hd + margin));
    };
    const gap = Math.abs((a.x - b.x) * ax + (a.z - b.z) * az);
    if (gap > reach(a) + reach(b)) return false;
  }
  return true;
}

/**
 * Reedholm's stilt houses: along both sides of every lane, every few metres,
 * and round the square's south and east edges, each facing its lane with its
 * porch reaching exactly to the lane's edge (the porch a deck of its own,
 * drawn by its house), standing only where there's water under it and
 * nothing else built in the way. Seeded, so the same every time.
 */
function planHouses(ground: (x: number, z: number) => number, fields: Fields): { houses: FenStructure[]; porches: FenDeck[]; boats: FenStructure[] } {
  const rand = mulberry32(4211);
  const houses: FenStructure[] = [];
  const porches: FenDeck[] = [];
  const taken: Rect[] = [];
  let seed = 600;
  /** A house facing (fx, fz), its porch's edge at (px, pz), of its own size unless given one: there if it fits. */
  const place = (px: number, pz: number, fx: number, fz: number, size?: { w: number; d: number; h: number; kind: FenStructureKind }): boolean => {
    const w = size?.w ?? 4.4 + rand() * 1.6;
    const d = size?.d ?? 3.9 + rand() * 0.8;
    const h = size?.h ?? 2.3 + rand() * 0.5;
    const variant = Math.floor(rand() * 8);
    const back = LANE.porch + d / 2;
    const x = px - fx * back;
    const z = pz - fz * back;
    const yaw = Math.atan2(fx, fz);
    // The house and its porch, and room round them.
    const all: Rect = { x: px - (fx * (d + LANE.porch)) / 2, z: pz - (fz * (d + LANE.porch)) / 2, yaw, hw: w / 2 + 0.3, hd: (d + LANE.porch) / 2 };
    const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => [x + Math.cos(yaw) * sx * (w / 2 + 0.4) + Math.sin(yaw) * sz * (d / 2 + 0.4), z - Math.sin(yaw) * sx * (w / 2 + 0.4) + Math.cos(yaw) * sz * (d / 2 + 0.4)] as const));
    // Water under it (or the pool's muddy rim), off the roads, out of the channel, on no walkway.
    if (corners.some(([cx, cz]) => ground(cx, cz) > 0.35 || fields.road(cx, cz) < 1 || fields.channel(cx, cz) < SALLOWS.channel.half + 3 || fields.decks.on(cx, cz, 0.2))) return false;
    if (fields.decks.on(x, z, Math.max(w, d) / 2) || taken.some((t) => overlaps(t, all, 0.5))) return false;
    taken.push(all);
    houses.push({ kind: size?.kind ?? 'stiltHouse', x, y: SALLOWS.water, z, yaw, w, d, h, seed: seed++, variant, solid: true });
    // The porch: from the house's front wall out over its lane's edge a little, so there's no gap underfoot.
    const front: P2 = [x + fx * (d / 2 - 0.2), z + fz * (d / 2 - 0.2)];
    const edge: P2 = [px + fx * 0.25, pz + fz * 0.25];
    porches.push({ ...deckBetween(front, edge, w, SALLOWS.floor, SALLOWS.floor), look: 'plank', railed: false, hidden: true });
    return true;
  };
  const half = LANE.width / 2;
  LANES.forEach((lane, li) => {
    const line = sampleCurve(lane, 0.5);
    const len = line.length * 0.5;
    for (const side of [-1, 1]) {
      for (let s = 4.5 + (side > 0 ? 0 : 2.5) + li; s < len - 3; s += 6.4) {
        const i = Math.min(line.length - 2, Math.round(s / 0.5));
        const [a, b] = [line[i], line[i + 1]];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        // The lane's side, and the house's front facing back across it.
        const [nx, nz] = [(-(b[1] - a[1]) / l) * side, ((b[0] - a[0]) / l) * side];
        if (place(a[0] + nx * half, a[1] + nz * half, -nx, -nz)) s += rand() * 1.2;
      }
    }
  });
  // Round the square: two on its south edge either side of the forge's walkway, one on its east edge, all facing onto it.
  const { square } = REEDHOLM;
  // Jory Hask's office on its east edge first, the salvage factor's, the smartest house in Reedholm.
  place(square.x + square.hw, square.z + 5.8, -1, 0, { w: 4.8, d: 4.4, h: 2.6, kind: 'factorHouse' });
  place(square.x - 5.5, square.z + square.hd, 0, -1);
  place(square.x + 6, square.z + square.hd, 0, -1);

  // A punt tied up by about half the houses, alongside the wall their ladder's on, where there's room on the water.
  const boats: FenStructure[] = [];
  for (const house of houses) {
    if (rand() > 0.6) continue;
    const [c, sn] = [Math.cos(house.yaw), Math.sin(house.yaw)];
    const [lx, lz] = [-house.w / 2 - 1.2, house.d / 2 - 1.3];
    const [x, z] = [house.x + c * lx + sn * lz, house.z - sn * lx + c * lz];
    const boat: Rect = { x, z, yaw: house.yaw, hw: 0.6, hd: 2.3 };
    const ends = [-2.3, 0, 2.3].map((t) => [x + sn * t, z + c * t] as const);
    if (taken.some((t) => overlaps(t, boat, 0.05)) || ends.some(([ex, ez]) => fields.decks.on(ex, ez, 0.35) || ground(ex, ez) > -0.15)) continue;
    taken.push(boat);
    boats.push({ kind: 'punt', x, y: SALLOWS.water, z, yaw: house.yaw + (rand() - 0.5) * 0.1, w: 1.1, d: 4.6, h: 1, seed: seed++, variant: Math.floor(rand() * 3), solid: false });
  }
  return { houses, porches, boats };
}

/** Solid rails along both long sides of a deck. */
function addRails(colliders: Colliders, d: FenDeck): void {
  const c = Math.cos(d.yaw);
  const s = Math.sin(d.yaw);
  for (const side of [-1, 1]) {
    // The deck's own +X, in world terms (toLocal's inverse).
    const off = side * (d.hw + 0.1);
    colliders.addBox({ x: d.x + off * c, z: d.z - off * s, hw: 0.12, hd: d.hd - 0.6, yaw: d.yaw });
  }
}

/**
 * The Great Channel's banks, which you can't walk over (it's deep): a short
 * box every metre along each, but where a crossing spans it, from rail to
 * rail, the bank's next box closing on the rail too near for a body to pass.
 */
function addChannelBanks(colliders: Colliders, line: readonly P2[], decks: readonly FenDeck[]): void {
  const spans = decks.filter((d) => d.railed);
  const onSpan = (x: number, z: number) =>
    spans.some((d) => {
      const dx = x - d.x;
      const dz = z - d.z;
      const lx = dx * Math.cos(d.yaw) - dz * Math.sin(d.yaw);
      const lz = dx * Math.sin(d.yaw) + dz * Math.cos(d.yaw);
      return Math.abs(lx) < d.hw + 0.3 && Math.abs(lz) < d.hd + 0.5;
    });
  const off = SALLOWS.channel.half + 0.6;
  for (let i = 0; i < line.length - 1; i++) {
    const [a, b] = [line[i], line[i + 1]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.1) continue;
    const [nx, nz] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
    for (const side of [-1, 1]) {
      const x = (a[0] + b[0]) / 2 + nx * off * side;
      const z = (a[1] + b[1]) / 2 + nz * off * side;
      if (onSpan(x, z)) continue;
      colliders.addBox({ x, z, hw: 0.4, hd: len / 2 + 0.1, yaw });
    }
  }
}

// ------------------------------------------------------------------ structures

/** Everything built, the lie of the land under it given by `ground`, Reedholm's houses (`houses`) and the punts tied up by them (`boats`) already planned. */
function placeStructures(ground: (x: number, z: number) => number, fields: Fields, houses: readonly FenStructure[], boats: readonly FenStructure[]): FenStructure[] {
  const out: FenStructure[] = [...houses, ...boats];
  let seed = 1;
  const add = (kind: FenStructureKind, x: number, z: number, yaw: number, o: Partial<Omit<FenStructure, 'kind' | 'x' | 'z' | 'yaw'>> = {}) =>
    out.push({ kind, x, z, yaw, y: o.y ?? ground(x, z), w: o.w ?? 1, d: o.d ?? 1, h: o.h ?? 1, seed: o.seed ?? seed++, variant: o.variant ?? 0, solid: o.solid ?? false });
  const faceTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);
  /** Room for something `r` m round at (x, z): off the roads and decks, and clear of what's built. */
  const free = (x: number, z: number, r: number) =>
    fields.road(x, z) > r + 1 && !fields.decks.on(x, z, r) && out.every((s) => s.kind === 'revetment' || Math.hypot(s.x - x, s.z - z) > r + Math.hypot(s.w, s.d) / 2);
  const { square, moot, forge, landing } = REEDHOLM;
  const deck = SALLOWS.deck;
  const [sx0, sx1, sz0, sz1] = [square.x - square.hw, square.x + square.hw, square.z - square.hd, square.z + square.hd];

  // Reedholm: the moot hall on its island facing the square down the main walkway, the inn on the square's north side, its porch on the square, and the forge on its stone footing.
  add('mootHall', moot.x + 1.5, moot.z, -Math.PI / 2, { w: 9, d: 7, h: 4, solid: true });
  add('inn', square.x + 3, sz0 - 5.1, 0, { y: SALLOWS.water, w: 10, d: 8, h: 3.6, solid: true });
  add('forge', forge.x, forge.z + 0.8, Math.PI, { y: deck, w: 6, d: 5, h: 3, solid: true });
  // Timber staithes round the landing's holm and the moot hall's island, where the pool laps them.
  for (const holm of [landing, moot]) {
    const r = holm.r - 1.4;
    const gaps: number[] = [];
    for (let a = 0; a < Math.PI * 2; a += 0.02) {
      const [x, z] = [holm.x + Math.sin(a) * r, holm.z + Math.cos(a) * r];
      if (fields.decks.on(x, z, 0.5) || fields.road(x, z) < 1.2) gaps.push(a);
    }
    out.push({ kind: 'revetment', x: holm.x, y: ground(holm.x, holm.z), z: holm.z, yaw: 0, w: r, d: r, h: 1, seed: seed++, variant: 0, solid: false, gaps });
  }
  // Mother Sedge's hut, herbs under its eaves, and Old Wenna's eel traps along her jetty.
  add('herbHut', HERB_HUT.x, HERB_HUT.z, HERB_HUT.yaw, { y: SALLOWS.water, w: 4.2, d: 4, h: 2.6, solid: true });
  for (const [x, z, yaw] of [[419.2, 586, 0.3], [423, 589.5, 1.9], [419.4, 591.2, 2.6]] as const) add('eelTraps', x, z, yaw, { y: SALLOWS.water });
  // The landing: the map board and signpost by the Fen road's end, a smoking shed and nets drying, a woad banner on the holm.
  add('mapboard', landing.x + 2, landing.z - 4.6, -Math.PI / 2 + 0.25, { solid: true, w: 1.6, d: 0.4 });
  add('signpost', landing.x + 1.6, landing.z + 3.6, 0, { variant: 0, solid: true, w: 0.3, d: 0.3 });
  add('banner', landing.x - 2.4, landing.z + 0.4, 0.4, { h: 5.5, solid: true, w: 0.3, d: 0.3 });
  add('smokeShed', landing.x - 6.5, landing.z + 1, 1.2, { w: 3.4, d: 3, h: 2.6, solid: true });
  add('netRack', landing.x - 6, landing.z - 4.5, 1.2, { w: 4 });
  add('crates', landing.x + 4.4, landing.z + 5.2, 0.3, { solid: true, w: 2.2, d: 2.2 });
  // The refugees' raft moored off the south-west lane.
  add('raft', 370, 640.5, 0.75, { y: SALLOWS.water, w: 4, d: 5 });
  add('smokeShed', 405.5, 627.5, Math.PI / 2, { y: SALLOWS.water, w: 3.4, d: 3, h: 2.6, solid: true });
  add('netRack', moot.x - 1, moot.z + 8.4, 0.1, { w: 4 });
  // The square: stalls along its south edge either side of the forge's walkway, crates and barrels by the inn, lanterns flanking each walkway's mouth.
  add('stall', square.x - 4.2, sz1 - 1.4, Math.PI, { y: deck, w: 3.2, d: 1.6, h: 2.4, solid: true, variant: 0 });
  add('stall', square.x + 4.6, sz1 - 1.4, Math.PI, { y: deck, w: 3.2, d: 1.6, h: 2.4, solid: true, variant: 1 });
  add('crates', sx0 + 4.8, sz0 + 1.3, 1.2, { y: deck, solid: true, w: 1.8, d: 1.8 });
  for (const [x, z] of [[sx0 + 0.6, square.z - 2.6], [sx0 + 0.6, square.z + 2.6], [sx1 - 0.6, square.z - 2.6], [sx1 - 0.6, square.z + 2.6], [forge.x - 1.3, sz1 + 1.6], [landing.x + 5, landing.z - 2.6], [moot.x - 4.8, moot.z - 2.8]] as const) {
    add('lanternPost', x, z, x < forge.x - 1 ? Math.PI / 2 : -Math.PI / 2, { y: Math.max(deck, ground(x, z)), solid: true, w: 0.25, d: 0.25 });
  }
  // Lanterns along the lanes, on their edges, never in front of a house's door.
  const byDoor = (x: number, z: number) =>
    houses.some((h) => {
      const [dx, dz] = [x - h.x, z - h.z];
      const across = dx * Math.cos(h.yaw) - dz * Math.sin(h.yaw);
      const out = dx * Math.sin(h.yaw) + dz * Math.cos(h.yaw);
      return Math.abs(across) < h.w / 2 + 0.6 && out > 0 && out < h.d / 2 + LANE.porch + 1;
    });
  LANES.forEach((lane, li) => {
    const line = sampleCurve(lane, 1);
    const side = li % 2 ? 1 : -1;
    const at = (i: number): P2 => {
      const [a, b] = [line[i], line[i + 1]];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [a[0] + (-(b[1] - a[1]) / l) * side * (LANE.width / 2 - 0.2), a[1] + ((b[0] - a[0]) / l) * side * (LANE.width / 2 - 0.2)];
    };
    for (let i0 = 9 + li * 2; i0 < line.length - 4; i0 += 14) {
      const i = [i0, i0 + 2, i0 - 2, i0 + 4, i0 - 4].find((j) => j > 2 && j < line.length - 4 && !byDoor(...at(j)));
      if (i === undefined) continue;
      const [a, b] = [line[i], line[i + 1]];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const [x, z] = at(i);
      add('lanternPost', x, z, Math.atan2(-(-(b[1] - a[1]) / l) * side, -((b[0] - a[0]) / l) * side), { y: deck, solid: true, w: 0.25, d: 0.25 });
    }
  });
  // The punts tied up round the pool: off the lanes, the jetties and the landing; Hob's flat boat at the ferry jetty.
  for (const [x, z, yaw, v] of [[365.4, 621, 0.02, 3], [359.6, 624, 3.1, 0], [418.6, 584, 0.05, 1], [424, 586, 3.0, 0], [380, 633.5, 0.8, 2], [404, 652, 1.6, 1], [427, 640.5, 1.5, 0], [404.5, 591, 2.3, 2], [352, 603.5, 1.9, 1], [375, 594, 1.2, 0]] as const) {
    if (!fields.decks.on(x, z, 1.2) && fields.road(x, z) > 1.5) add('punt', x, z, yaw, { y: SALLOWS.water, d: v === 3 ? 7 : 4.6, variant: v });
  }
  // Trestle tables on the square before the inn, where Reedholm gathers; a general vendor's stall on the landing.
  for (const x of [square.x - 1.5, square.x + 4.5]) add('trestle', x, sz0 + 3.1, 0, { y: deck, w: 2.4, d: 2.2, solid: true });
  const round = Array.from({ length: 40 }, (_, k) => [landing.x + Math.sin(k * 0.6) * (5.5 + (k % 3) * 0.8), landing.z + Math.cos(k * 0.6) * (5.5 + (k % 3) * 0.8)] as const);
  const vendor = round.find(([x, z]) => free(x, z, 1.7) && !fields.decks.on(x, z, 3) && ground(x, z) > SALLOWS.water + 0.2);
  if (vendor) add('stall', vendor[0], vendor[1], faceTo(vendor[0], vendor[1], landing.x, landing.z), { w: 3.2, d: 1.6, h: 2.4, solid: true, variant: 1 });
  // Eel traps hung off the lanes' piles into the water, where nothing else is.
  LANES.forEach((lane, li) => {
    const line = sampleCurve(lane, 1);
    for (let i = 5 + li; i < line.length - 3; i += 9) {
      const [a, b] = [line[i], line[i + 1]];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const side = (i + li) % 2 ? 1 : -1;
      const [x, z] = [a[0] + (-(b[1] - a[1]) / l) * side * (LANE.width / 2 + 1.1), a[1] + ((b[0] - a[0]) / l) * side * (LANE.width / 2 + 1.1)];
      if (ground(x, z) < -0.2 && free(x, z, 0.9)) add('eelTraps', x, z, Math.atan2(b[0] - a[0], b[1] - a[1]), { y: SALLOWS.water });
    }
  });

  // A few houses on dry ground along the Fen road's last stretch, before the landing.
  for (const [x, z, tx, tz] of [[325, 570, 329, 564], [352, 575, 347, 581], [338, 586, 347, 581]] as const) add('stiltHouse', x, z, faceTo(x, z, tx, tz), { w: 5, d: 4.2, h: 2.4, solid: true, variant: Math.round(x) & 3 });

  // The Last Stone by the Fen road at the seam.
  add('lastStone', PLACES.lastStone.x, PLACES.lastStone.z, -Math.PI / 2, { h: 2.2, solid: true, w: 0.7, d: 0.5 });

  // The causeway: the crown's toll house and its barred gate, a ruined customs post, the smugglers' watch post in the reeds.
  add('tollHouse', PLACES.tollHouse.x + 2, PLACES.tollHouse.z, -Math.PI / 2, { w: 6, d: 5, h: 3.4, solid: true });
  add('tollGate', CAUSEWAY.x, 516, 0, { w: CAUSEWAY.width + 1 });
  add('mapboard', CAUSEWAY.x - 3, 520, Math.PI / 2, { solid: true, w: 1.6, d: 0.4 });
  add('customsRuin', PLACES.customs.x, PLACES.customs.z, 0.4, { w: 6, d: 5, h: 2, solid: true });
  add('watchPost', PLACES.watchPost.x, PLACES.watchPost.z, -2.2, { y: SALLOWS.water, w: 3, d: 3, h: 3.4, solid: true });

  // Peat cut along the Fen road, stacked to dry.
  for (const [x, z, yaw] of [[296, 553, 0.3], [309, 557.5, 0.5], [331, 576, 0.9], [286, 538, 0.1]] as const) if (free(x, z, 1.6)) add('peatStack', x, z, yaw, { solid: true, w: 2.4, d: 1.4 });

  // The Gibbet Willow on its lone holm in its moat of black water, its cage hanging, a rotten punt sunk at its foot.
  add('gibbet', PLACES.gibbet.x, PLACES.gibbet.z, 0.7, { h: 9, solid: true, w: 1.6, d: 1.6 });
  add('punt', PLACES.gibbet.x - 9, PLACES.gibbet.z + 5, 2.4, { y: -0.18, d: 4.6, variant: 4 });

  // Cockle End: a fen village drowned to its eaves, the raiders' planks laid loft to loft, old garden fences poking out of the water, a line of washing.
  const cockle = [[-12, -6, 0.3], [-2, -13, 0.1], [-14, 6, 2.6], [-4, 9, 2.9], [6, 12, 3.4], [-21, -2, 1.4]] as const;
  for (const [dx, dz, yaw] of cockle) add('sunkCottage', PLACES.cockleEnd.x + dx, PLACES.cockleEnd.z + dz, yaw, { y: SALLOWS.water, w: 6, d: 4.5, h: 2.6, solid: true });
  for (const [a, b] of [[0, 1], [2, 3], [0, 2]] as const) {
    const [ax, az] = [PLACES.cockleEnd.x + cockle[a][0], PLACES.cockleEnd.z + cockle[a][1]];
    const [bx, bz] = [PLACES.cockleEnd.x + cockle[b][0], PLACES.cockleEnd.z + cockle[b][1]];
    add('plankBridge', (ax + bx) / 2, (az + bz) / 2, Math.atan2(bx - ax, bz - az), { y: SALLOWS.water + 1.55, w: 0.9, d: Math.hypot(bx - ax, bz - az) - 4.4 });
  }
  for (const [x, z, yaw, w] of [[310, 702, 1.2, 9], [294, 726, 0.2, 11], [312, 721, 2.3, 7]] as const) add('fencePosts', x, z, yaw, { y: SALLOWS.water, w });
  add('washLine', PLACES.cockleEnd.x - 8, PLACES.cockleEnd.z + 1.5, 1.3, { y: SALLOWS.water, w: 5 });
  add('punt', PLACES.cockleEnd.x + 4, PLACES.cockleEnd.z - 3, 0.9, { y: SALLOWS.water, d: 4.6, variant: 1 });

  // The Withy Holm: a wildfowler's hide, his nets and decoys, his punt in the shallows.
  add('hide', PLACES.withy.x + 6, PLACES.withy.z + 8, 2.6, { w: 3, d: 2.6, h: 2, solid: true });
  add('netRack', PLACES.withy.x + 1, PLACES.withy.z + 9, 0.4, { w: 3.6 });
  add('decoys', PLACES.withy.x + 13, PLACES.withy.z + 15, 0, { y: SALLOWS.water });
  add('punt', PLACES.withy.x + 15, PLACES.withy.z + 4, 1.1, { y: SALLOWS.water, d: 4.6 });

  // Saint Odo's Chapel, its graveyard inside a low wall with its gate towards the track.
  add('chapel', PLACES.odo.x - 2, PLACES.odo.z - 3, Math.PI * 0.75, { w: 10, d: 6, h: 4, solid: true });
  add('churchyard', PLACES.odo.x, PLACES.odo.z, Math.atan2(318 - PLACES.odo.x, 812 - PLACES.odo.z), { w: 13.5 });
  for (let i = 0; i < 14; i++) {
    const a = 0.6 + i * 0.33;
    const r = 7.5 + (i % 3) * 1.8;
    add('grave', PLACES.odo.x + Math.cos(a) * r, PLACES.odo.z + Math.sin(a) * r, a + Math.PI / 2, { variant: i % 3 });
  }

  // The Eelworks: a ruined smokehouse, crates, a brazier and punts, the smugglers' now.
  add('smokehouse', PLACES.eelworks.x, PLACES.eelworks.z + 1, 0.2, { w: 8, d: 5, h: 3, solid: true });
  add('crates', PLACES.eelworks.x + 6, PLACES.eelworks.z - 4, 0.5, { solid: true, w: 2.2, d: 2.2 });
  add('brazier', PLACES.eelworks.x + 2.5, PLACES.eelworks.z - 5, 0, { solid: true, w: 0.7, d: 0.7 });
  add('punt', PLACES.eelworks.x - 4, PLACES.eelworks.z - 10, 0.1, { y: SALLOWS.water, d: 4.6 });
  add('eelTraps', PLACES.eelworks.x - 2, PLACES.eelworks.z - 12, 1.4, { y: SALLOWS.water });

  // The Sluice House: its lock across the Great Channel, gates open, its tower on the west bank by the walkway's end, and the gate chained shut on the east.
  const [sw, se] = CROSSINGS.sluice;
  // The walkway's own +Z runs west to east across the channel; the lock's +X does.
  const across = Math.atan2(se[0] - sw[0], se[1] - sw[1]);
  add('sluice', (sw[0] + se[0]) / 2, (sw[1] + se[1]) / 2, across - Math.PI / 2, { y: SALLOWS.water, w: 2 * SALLOWS.channel.half + 4, d: 7, h: 6 });
  add('sluiceTower', SLUICE_TOWER.x, SLUICE_TOWER.z, across - Math.PI / 2, { w: SLUICE_TOWER.w, d: SLUICE_TOWER.w, h: 15, solid: true });
  add('sluiceGate', se[0] - (se[0] - sw[0]) * 0.08, se[1] - (se[1] - sw[1]) * 0.08, across, { y: ground(...se), w: 2.8, d: 0.3, solid: true });
  // The Lantern Men's stronghold round the tower: crates, a brazier, a tent.
  for (const [kind, x, z, yaw] of [['crates', 452, 709.5, 0.4], ['brazier', 450.6, 704.5, 0], ['tent', 456.5, 712.5, 0.4], ['crates', 459, 692, 1.1]] as const) {
    if (free(x, z, kind === 'tent' ? 2 : 1)) add(kind, x, z, yaw, kind === 'tent' ? { w: 3, d: 3.4, h: 2.2, solid: true } : { solid: true, w: kind === 'brazier' ? 0.7 : 2.2, d: kind === 'brazier' ? 0.7 : 2.2 });
  }

  /** Room for a post or a stake on dry ground just off the road and the walkway, whatever else is near but the tower. */
  const offPath = (x: number, z: number, r: number) =>
    fields.road(x, z) > r + 0.4 && !fields.decks.on(x, z, r + 0.3) && fields.channel(x, z) > SALLOWS.channel.half + 1 && ground(x, z) > SALLOWS.water + 0.15 &&
    out.every((o) => o.kind === 'sluiceTower' || o.kind === 'sluice' || Math.hypot(o.x - x, o.z - z) > r + Math.hypot(o.w, o.d) / 2);
  // Their stakes round the tower's mound, broken where the path and the walkway come through.
  for (let a = 0; a < Math.PI * 2; a += 0.2) {
    const [x, z] = [SLUICE_TOWER.x + Math.sin(a) * 10.5, SLUICE_TOWER.z + Math.cos(a) * 10.5];
    if (offPath(x, z, 1.1)) add('palisade', x, z, a, { w: 2.2, solid: true, d: 0.5 });
  }

  // The Lantern Men's signal lanterns on poles along the Dyke Path either side of the tower, and at both ends of the lock's walkway.
  const dyke = sampleCurve(ROADS.find((r) => r.id === 'dyke')!.pts, 1);
  for (let i = 0; i < dyke.length - 1; i++) {
    const [a, b] = [dyke[i], dyke[i + 1]];
    if (a[1] < 676 || a[1] > 722 || i % 9 !== 0) continue;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const side = i % 18 ? 1 : -1;
    const [x, z] = [a[0] + (-(b[1] - a[1]) / l) * side * 3.0, a[1] + ((b[0] - a[0]) / l) * side * 3.0];
    if (fields.road(x, z) > 1.1 && free(x, z, 0.2) && ground(x, z) > SALLOWS.water + 0.1) add('lanternPole', x, z, faceTo(x, z, a[0], a[1]), { h: 3.4, solid: true, w: 0.3, d: 0.3 });
  }
  const [ax, az] = [(se[0] - sw[0]) / Math.hypot(se[0] - sw[0], se[1] - sw[1]), (se[1] - sw[1]) / Math.hypot(se[0] - sw[0], se[1] - sw[1])];
  for (const [ex, ez, out1] of [[sw[0], sw[1], -1], [se[0], se[1], 1]] as const) {
    for (const side of [-1, 1]) {
      const [x, z] = [ex + ax * out1 * 1.2 - az * side * 3.2, ez + az * out1 * 1.2 + ax * side * 3.2];
      if (offPath(x, z, 0.3)) add('lanternPole', x, z, faceTo(x, z, ex, ez), { h: 3.6, solid: true, w: 0.3, d: 0.3 });
    }
  }

  // The old Deepking bridge.
  const [bw, be] = CROSSINGS.bridge;
  add('bridge', (bw[0] + be[0]) / 2, (bw[1] + be[1]) / 2, Math.atan2(be[0] - bw[0], be[1] - bw[1]), { y: SALLOWS.water, w: 3.4, d: Math.hypot(be[0] - bw[0], be[1] - bw[1]), h: 1.2 });

  // The Drowned Town, Vellmar: its streets still square under the water, a house's stone roof or broken walls on each plot, columns and arches
  // along the streets, carved faces fallen in them, flood marks on the walls by its quay, its bell tower and the leaning Drowned Tower.
  const town = mulberry32(911);
  const { x: tx, z: tz } = PLACES.drownedTown;
  const grid = 0.12;
  const [gc, gs] = [Math.cos(grid), Math.sin(grid)];
  /** A point `u` m along the town's own X and `v` along its Z from its middle. */
  const plot = (u: number, v: number): [number, number] => [tx + u * gc + v * gs, tz - u * gs + v * gc];
  const bell = plot(-14, -14);
  const sunk = (x: number, z: number) => Math.min(ground(x, z), SALLOWS.water) - 0.2;
  const clearOf = (x: number, z: number) => Math.hypot(x - PLACES.drownedTower.x, z - PLACES.drownedTower.z) > 11 && Math.hypot(x - bell[0], z - bell[1]) > 8 && Math.hypot(x - 568, z - 714) > 12;
  for (let u = -42; u <= 42; u += 14) {
    for (let v = -42; v <= 42; v += 14) {
      const [x, z] = plot(u, v);
      if (Math.hypot(u, v) > 52 || !clearOf(x, z) || !free(x, z, 4)) continue;
      const pick = town();
      const turn = grid + (town() < 0.5 ? 0 : Math.PI / 2);
      if (pick < 0.44) {
        add('deepRoof', x, z, turn, { y: sunk(x, z), w: 6 + town() * 2.5, d: 5 + town() * 2.5, h: 2 + town() * 2.2, solid: true, variant: Math.floor(town() * 3) });
      } else if (pick < 0.66) {
        // A house's walls without its roof: two sides of it, broken off.
        const [ax, az] = plot(u, v - 3.5);
        add('deepWall', ax, az, grid, { y: sunk(ax, az), w: 7, d: 1.1, h: 1.6 + town() * 2.4, solid: true });
        const [bx, bz] = plot(u - 3.5, v);
        add('deepWall', bx, bz, grid + Math.PI / 2, { y: sunk(bx, bz), w: 6, d: 1.1, h: 1.2 + town() * 2.6, solid: true });
      } else if (pick < 0.78) {
        for (const du of [-3, 3]) {
          const [cx, cz] = plot(u + du, v + 7);
          if (town() < 0.8) add('column', cx, cz, grid, { y: sunk(cx, cz), h: 1.5 + town() * 4, solid: true, w: 1.2, d: 1.2, variant: Math.floor(town() * 2) });
        }
      } else if (pick < 0.88) {
        // An arch over the street beside the plot.
        const [ax, az] = plot(u + 7, v);
        if (free(ax, az, 3)) add('deepArch', ax, az, grid + Math.PI / 2, { y: sunk(ax, az), w: 5.5 + town() * 2, d: 1.2, h: 2.4 + town() * 2, solid: true });
      }
    }
  }
  // Columns fallen across the crossroads, their drums half under the water.
  const fallen = mulberry32(912);
  for (let u = -35; u <= 35; u += 14) {
    for (let v = -35; v <= 35; v += 14) {
      const [x, z] = plot(u, v);
      if (fallen() > 0.4 || Math.hypot(u, v) > 50 || !clearOf(x, z) || !free(x, z, 3)) continue;
      add('column', x, z, grid + (fallen() < 0.5 ? 0 : Math.PI / 2) + (fallen() - 0.5) * 0.5, { y: sunk(x, z), h: 1, solid: true, w: 1.2, d: 6, variant: 2 });
    }
  }
  // The carved faces of the Deepkings' magistrates, fallen in the streets.
  for (const [u, v, yaw] of [[7, 14, 2.2], [-21, 21, 0.6]] as const) {
    const [x, z] = plot(u, v);
    if (free(x, z, 2)) add('deepHead', x, z, grid + yaw, { y: sunk(x, z) + 0.1, w: 3, h: 3, solid: true });
  }
  add('bellTower', bell[0], bell[1], grid, { y: -0.6, w: 5, d: 5, h: 9, solid: true });
  add('drownedTower', PLACES.drownedTower.x, PLACES.drownedTower.z, grid, { y: -0.6, w: 7, d: 7, h: 30, solid: true });
  for (const [x, z, yaw] of [[556, 722, 0.9], [566, 711, 0.6], [580, 704, 0.2]] as const) add('floodWall', x, z, yaw, { y: ground(x, z) - 0.3, w: 5, d: 1, h: 3.2, solid: true });
  // Its kings still standing along the old high street, one headless and one an arm gone.
  ([[7, -28, 0], [7, 14, 0], [-7, 28, 1], [21, 0, 2]] as const).forEach(([u, v, broken], k) => {
    const [x, z] = plot(u, v);
    if (clearOf(x, z) && free(x, z, 1.6)) add('deepStatue', x, z, grid + (k % 2 ? Math.PI / 2 : -Math.PI / 2), { y: sunk(x, z), h: 5 + (k % 3) * 0.6, w: 1.6, d: 1.6, solid: true, variant: broken });
  });
  // The Lantern Men at work: dredging rafts moored over the town, and sheerlegs on the quay hauling up what they've found.
  let rafts = 0;
  for (let k = 0; k < 60 && rafts < 3; k++) {
    const [u, v] = [-35 + ((k * 23) % 11) * 7, -35 + ((k * 37) % 11) * 7];
    const [x, z] = plot(u, v);
    if (Math.hypot(u, v) > 45 || ground(x, z) > -0.3 || !clearOf(x, z) || !free(x, z, 2.4)) continue;
    add('dredger', x, z, grid + (k % 4) * (Math.PI / 2) + 0.3, { y: SALLOWS.water, w: 4, d: 5.5, solid: true });
    rafts++;
  }
  const [qa, qb] = [STREET_QUAY[0], STREET_QUAY[1]];
  const ql = Math.hypot(qb[0] - qa[0], qb[1] - qa[1]);
  const [qx, qz] = [(qb[0] - qa[0]) / ql, (qb[1] - qa[1]) / ql];
  add('deepStairs', qb[0], qb[1], Math.atan2(qx, qz), { y: SALLOWS.deck, w: 4, h: 0 });
  const [sx, sz] = [qb[0] - qx * 4 - qz * 3.2, qb[1] - qz * 4 + qx * 3.2];
  add('sheerlegs', sx, sz, Math.atan2(-qz, qx), { y: SALLOWS.deck, h: 5 });

  // Smugglers' Hythe: a cog beached on the shell bank, a jetty out to the sea's edge, crates, a tent, lanterns and a brazier.
  add('cog', PLACES.hythe.x + 9, PLACES.hythe.z + 9, 0.35, { y: 0.1, w: 5, d: 16, h: 6, solid: true });
  add('tent', PLACES.hythe.x - 6, PLACES.hythe.z - 3, 2.2, { w: 3, d: 3.4, h: 2.2, solid: true });
  add('crates', PLACES.hythe.x - 1, PLACES.hythe.z + 6, 1.1, { solid: true, w: 2.2, d: 2.2 });
  add('crates', PLACES.hythe.x + 1, PLACES.hythe.z - 7, 0.3, { solid: true, w: 2.2, d: 2.2 });
  add('crates', PLACES.hythe.x + 6.5, PLACES.hythe.z - 2.5, 2.0, { solid: true, w: 2.2, d: 2.2 });
  add('brazier', PLACES.hythe.x - 2.5, PLACES.hythe.z + 0.5, 0, { solid: true, w: 0.7, d: 0.7 });
  add('washLine', PLACES.hythe.x - 9, PLACES.hythe.z - 8, 0.3, { w: 4.5 });
  // Their lookout on the bank's seaward edge, a shed for what they land, nets drying, peat stacked for the brazier.
  for (const [kind, x, z, yaw, o] of [
    ['lookout', PLACES.hythe.x + 8, PLACES.hythe.z - 12, 0.4, { h: 5.5, w: 3.2, d: 3.2, solid: true }],
    ['smokeShed', PLACES.hythe.x - 10, PLACES.hythe.z + 2, 1.9, { w: 3.4, d: 3, h: 2.6, solid: true }],
    ['netRack', PLACES.hythe.x + 2, PLACES.hythe.z - 12, 0.2, { w: 4 }],
    ['peatStack', PLACES.hythe.x - 4, PLACES.hythe.z - 8.5, 0.6, { w: 2.4, d: 1.4, h: 1.2, solid: true }],
  ] as const) if (free(x, z, Math.max(o.w, 'd' in o ? o.d : 0) / 2)) add(kind, x, z, yaw, o);
  for (const [x, z] of [[PLACES.hythe.x + 4, PLACES.hythe.z - 1.5], [HYTHE_JETTY[1][0] - 0.6, HYTHE_JETTY[1][1] - 1]] as const) {
    add('lanternPost', x, z, -Math.PI / 2, { y: Math.max(SALLOWS.deck, ground(x, z)), solid: true, w: 0.25, d: 0.25 });
  }
  add('punt', PLACES.hythe.x - 10, PLACES.hythe.z + 10, 2.0, { y: SALLOWS.water, d: 4.6 });
  add('punt', HYTHE_JETTY[1][0] - 2, HYTHE_JETTY[1][1] + 1.8, 1.5, { y: SALLOWS.water, d: 4.6, variant: 2 });

  // The Lime Kiln at the fen's dry south-west edge, and the first white chalk banks past it.
  add('kiln', PLACES.kiln.x, PLACES.kiln.z, 0.6, { w: 6, d: 6, h: 4.5, solid: true });
  add('signpost', 304, 867, 0.3, { variant: 1, solid: true, w: 0.3, d: 0.3 });
  for (const [x, z, yaw, w] of [[270, 914, 0.3, 9], [282, 926, 1.4, 12], [262, 890, 1.0, 7], [300, 920, 0.1, 8]] as const) add('chalkBank', x, z, yaw, { w, d: 4, h: 2.2 });

  return out;
}

/** The lanterns and lit windows (glows) and the smoke over Reedholm's chimneys and smoking sheds and the kiln. */
function lightsAndSmoke(structures: readonly FenStructure[]): { lights: FenGlow[]; plumes: { x: number; y: number; z: number; fire: boolean }[] } {
  const lights: FenGlow[] = [];
  const plumes: { x: number; y: number; z: number; fire: boolean }[] = [];
  const amber = 0xe3a046;
  const at = (s: FenStructure, lx: number, ly: number, lz: number): [number, number, number] => {
    const c = Math.cos(s.yaw);
    const sn = Math.sin(s.yaw);
    return [s.x + lx * c + lz * sn, s.y + ly, s.z - lx * sn + lz * c];
  };
  for (const s of structures) {
    switch (s.kind) {
      case 'lanternPost': {
        const [x, y, z] = at(s, 0, 2.3, 0.35);
        lights.push({ x, y, z, size: 1.1, color: amber });
        break;
      }
      case 'inn': {
        for (const lx of [-3, 3]) {
          const [x, y, z] = at(s, lx, SALLOWS.floor + 1.3, s.d / 2 + 0.1);
          lights.push({ x, y, z, size: 0.9, color: amber });
        }
        for (const lx of [-1, 1]) {
          const [x, y, z] = at(s, lx, SALLOWS.floor + 2.1, s.d / 2 + 0.3);
          lights.push({ x, y, z, size: 0.6, color: amber });
        }
        const [cx, cy, cz] = at(s, s.w / 2 - 1, SALLOWS.floor + s.h + 6.3, 0);
        plumes.push({ x: cx, y: cy, z: cz, fire: false });
        break;
      }
      case 'sluiceTower': {
        const [x, y, z] = at(s, 0, 2.7, s.w / 2 + 1.4);
        lights.push({ x, y, z, size: 1.0, color: amber });
        const top = (s.w / 2) * (1 - (0.16 * (s.h - 1.1)) / (s.h + 1.5)) + 1.0;
        for (const [lx, lz] of [[0, top], [top, 0], [-top, 0], [0, -top]] as const) {
          const [gx, gy, gz] = at(s, lx, s.h - 1.6, lz);
          lights.push({ x: gx, y: gy, z: gz, size: 0.8, color: amber });
        }
        break;
      }
      case 'lookout': {
        const [x, y, z] = at(s, 1.0, s.h + 1.35, 0.9);
        lights.push({ x, y, z, size: 0.9, color: amber });
        break;
      }
      case 'forge': {
        const [x, y, z] = at(s, 0, 0.9, 0.5);
        lights.push({ x, y, z, size: 1.4, color: 0xff7a30 });
        const [cx, cy, cz] = at(s, -s.w / 2 + 0.8, s.h + 2.4, -s.d / 2 + 0.8);
        plumes.push({ x: cx, y: cy, z: cz, fire: false });
        break;
      }
      case 'smokeShed': {
        const [x, y, z] = at(s, 0, (s.y === SALLOWS.water ? SALLOWS.floor : 0) + s.h + 1.4, 0);
        plumes.push({ x, y, z, fire: false });
        break;
      }
      case 'kiln': {
        const [x, y, z] = at(s, 0, s.h + 0.3, 0);
        plumes.push({ x, y, z, fire: false });
        const [fx, fy, fz] = at(s, 0, 0.7, s.d / 2 + 0.2);
        lights.push({ x: fx, y: fy, z: fz, size: 1.3, color: 0xff7a30 });
        break;
      }
      case 'mootHall': {
        const [x, y, z] = at(s, 0, 1.8, s.d / 2 + 0.6);
        lights.push({ x, y, z, size: 0.9, color: amber });
        break;
      }
      case 'stiltHouse':
        if ((s.variant & 3) === 1 && s.y === SALLOWS.water) {
          const [x, y, z] = at(s, 1.2, SALLOWS.floor + 1.2, s.d / 2 + 0.1);
          lights.push({ x, y, z, size: 0.7, color: amber });
        }
        // Smoke from the hood over the hearth's smoke hole.
        if ((s.variant & 3) === 2 && s.y === SALLOWS.water) {
          const gable = (s.variant & 4) !== 0;
          const [x, y, z] = at(s, gable ? 0 : -s.w / 4, SALLOWS.floor + s.h * 0.7 + s.h * 0.95 + 0.7, gable ? -s.d / 4 : 0);
          plumes.push({ x, y, z, fire: false });
        }
        break;
      case 'factorHouse': {
        for (const [lx, ly, lz] of [[-1.0, SALLOWS.floor + 1.25, s.d / 2 + 0.1], [-s.w / 4, SALLOWS.floor + 3.7, s.d / 2 + 0.35], [s.w / 4, SALLOWS.floor + 3.7, s.d / 2 + 0.35]] as const) {
          const [x, y, z] = at(s, lx, ly, lz);
          lights.push({ x, y, z, size: 0.7, color: amber });
        }
        const [cx, cy, cz] = at(s, -s.w / 2 + 0.6, SALLOWS.floor + 4.7 + s.h * 0.8 + 1.4, -0.4);
        plumes.push({ x: cx, y: cy, z: cz, fire: false });
        break;
      }
      case 'lanternPole': {
        const [x, y, z] = at(s, 0, s.h - 0.5, 0.85);
        lights.push({ x, y, z, size: 0.9, color: amber });
        break;
      }
      case 'dredger': {
        const [x, y, z] = at(s, s.w / 2 - 0.3, 2.3, -s.d / 2 + 0.4);
        lights.push({ x, y, z, size: 0.9, color: amber });
        break;
      }
      case 'sluice':
        for (const lx of [-s.w / 2 + 1.4, 0, s.w / 2 - 1.4]) {
          const [x, y, z] = at(s, lx, 0.85 + 6.2 - 2.2, 0);
          lights.push({ x, y, z, size: 1.0, color: amber });
        }
        break;
      case 'brazier': {
        const [x, y, z] = at(s, 0, 1.15, 0);
        lights.push({ x, y, z, size: 1.2, color: 0xff7a30 });
        plumes.push({ x, y: y + 0.6, z, fire: true });
        break;
      }
      case 'tollHouse': {
        const [x, y, z] = at(s, 0, 2.2, s.d / 2 + 0.3);
        lights.push({ x, y, z, size: 0.9, color: amber });
        break;
      }
      case 'watchPost': {
        // A Lantern Man's shuttered lantern, left burning.
        const [x, y, z] = at(s, 0, SALLOWS.floor + s.h - 0.6, 0);
        lights.push({ x, y, z, size: 0.8, color: amber });
        break;
      }
    }
  }
  return { lights, plumes };
}

// ------------------------------------------------------------------ plants

/** How thick the reeds grow at (x, z), 0 to 1: in broad beds, thickest at the water's edge. */
export function reedBed(x: number, z: number, h: number): number {
  const bed = smoothstep(0.38, 0.54, fbm(x * 0.022 + 11, z * 0.022 - 4, 221));
  const margin = smoothstep(-0.75, -0.3, h) * smoothstep(0.95, 0.4, h);
  return bed * margin;
}

/** Willow and alder carr: wet woodland on the holms. */
function carr(x: number, z: number): number {
  return smoothstep(0.55, 0.68, fbm(x * 0.03 - 7, z * 0.03 + 3, 223));
}

/**
 * The fens' plants: reed beds over the margins and the shallows, sedge on
 * the wet ground, willow and alder carr on the holms, pollards along the
 * dykes, lilies on still water, dead trees in the Mire, juniper and chalk at
 * Kiln Edge, samphire on the salt marsh and bog cotton towards the moor.
 * Seeded, so the same every time.
 */
function placePlants(ground: HeightGrid, walkable: Walkable, fields: Fields, roads: readonly FenRoad[], structures: readonly FenStructure[]): FenPlant[] {
  const rand = mulberry32(5813);
  const { land } = SALLOWS;
  const plants: FenPlant[] = [];
  const near = (x: number, z: number, m: number) => walkable.distance(x, z) < m;
  const clearOf = structures.map((s) => ({ x: s.x, z: s.z, r: Math.hypot(s.w, s.d) / 2 + 1.2 }));
  const clear = (x: number, z: number, margin: number) =>
    x > land.minX + 0.5 &&
    x < land.maxX - 0.5 &&
    z > land.minZ + 0.5 &&
    z < land.maxZ - 0.5 &&
    !fields.decks.on(x, z, margin + 0.5) &&
    fields.road(x, z) > margin + 1 &&
    clearOf.every((c) => Math.hypot(x - c.x, z - c.z) > c.r + margin);
  const inChannel = (x: number, z: number) => fields.channel(x, z) < SALLOWS.channel.half + 1;
  const add = (kind: FenKind, x: number, z: number, scale: number, y = ground.at(x, z)) =>
    plants.push({ kind, x, y, z, yaw: rand() * Math.PI * 2, scale, seed: Math.floor(rand() * 1e6) });
  const scatter = (spacing: number, fn: (x: number, z: number) => void) => {
    for (let gz = land.minZ + spacing / 2; gz < land.maxZ; gz += spacing) {
      for (let gx = land.minX + spacing / 2; gx < land.maxX; gx += spacing) fn(gx + (rand() - 0.5) * spacing, gz + (rand() - 0.5) * spacing);
    }
  };
  const reedholm = (x: number, z: number) => inPool(x, z) < 0.92;
  // The Gibbet Willow stands alone on its holm, nothing else as tall near it.
  const gibbet = (x: number, z: number) => Math.hypot(x - PLACES.gibbet.x, z - PLACES.gibbet.z) < 24;
  const mire = (x: number, z: number) => Math.hypot(x - PLACES.mire.x, z - PLACES.mire.z) < 36;
  const kilnEdge = (x: number, z: number) => x < 345 && z > 862;

  // Willow and alder carr on the holms; pollarded willows along the dykes.
  scatter(7, (x, z) => {
    const h = ground.at(x, z);
    if (h < 0.35 || rand() > 0.8 * carr(x, z) || !clear(x, z, 2.5) || reedholm(x, z) || kilnEdge(x, z) || gibbet(x, z) || x > 660) return;
    add(rand() < 0.6 ? 'willow' : 'alder', x, z, 0.65 + rand() * 0.4);
  });
  for (const r of roads) {
    if (r.id === 'causeway' || r.id === 'fen') continue;
    for (let i = 6; i < r.line.length - 6; i += 13 + Math.floor(rand() * 6)) {
      const [a, b] = [r.line[i], r.line[i + 1]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const side = rand() < 0.5 ? -1 : 1;
      const off = r.width / 2 + 2.2;
      const x = a[0] + (-(b[1] - a[1]) / len) * off * side;
      const z = a[1] + ((b[0] - a[0]) / len) * off * side;
      if (clear(x, z, 1) && !inChannel(x, z) && !gibbet(x, z) && !reedholm(x, z)) add('pollard', x, z, 0.85 + rand() * 0.3);
    }
  }
  // A few willows round Reedholm's landing, and the gibbet's holm left bare.
  for (const [x, z] of [[352, 616], [358, 596], [430, 600], [425, 626]] as const) if (clear(x, z, 1)) add('willow', x, z, 0.8);
  // Dead trees in the Mire, and on the drowned town's edge.
  scatter(9, (x, z) => {
    const town = Math.hypot(x - PLACES.drownedTown.x, z - PLACES.drownedTown.z);
    if (!(mire(x, z) || (town > 48 && town < 64)) || rand() > 0.35 || !clear(x, z, 1.5)) return;
    add('deadTree', x, z, 0.7 + rand() * 0.5);
  });
  // Juniper and chalk at Kiln Edge.
  scatter(5, (x, z) => {
    if (!kilnEdge(x, z) || !clear(x, z, 1)) return;
    const roll = rand();
    if (roll < 0.12) add('juniper', x, z, 0.6 + rand() * 0.5);
    else if (roll < 0.2) add('chalkRock', x, z, 0.4 + rand() * 0.8);
  });
  // Rubble of the Deepkings' green-black stone round the drowned town.
  scatter(6, (x, z) => {
    if (Math.hypot(x - PLACES.drownedTown.x, z - PLACES.drownedTown.z) > 58 || rand() > 0.3 || !clear(x, z, 1)) return;
    add('rubble', x, z, 0.4 + rand() * 0.9);
  });
  // Reed beds, tall as hedges, over the margins and the shallows, never in the Great Channel or on a road or deck.
  scatter(2.4, (x, z) => {
    const h = ground.at(x, z);
    if (rand() > 0.9 * reedBed(x, z, h) || !clear(x, z, 0.6) || inChannel(x, z) || reedholm(x, z) || kilnEdge(x, z)) return;
    add('reed', x, z, 0.85 + rand() * 0.35, Math.max(h, SALLOWS.water - 0.1));
  });
  // Sedge and rushes on the wet ground where you walk; samphire and sea lavender on the salt flats; bog cotton towards the moor.
  scatter(2.4, (x, z) => {
    const h = ground.at(x, z);
    if (!near(x, z, 8) || h < 0.05 || !clear(x, z, 0.3) || kilnEdge(x, z)) return;
    const roll = rand();
    if (x > 630) {
      if (roll < 0.35) add('samphire', x, z, 0.8 + rand() * 0.5);
    } else if (x < 320 && roll < 0.1) add('cotton', x, z, 0.8 + rand() * 0.4);
    else if (roll < 0.32) add('sedge', x, z, 1.1 + rand() * 0.6);
  });
  // Tussocks of rough grass over the wet meadows and the dykes' sides, thick in places and thin in others.
  scatter(2.8, (x, z) => {
    const h = ground.at(x, z);
    if (h < 0.08 || x > 640 || kilnEdge(x, z) || rand() > 0.55 * smoothstep(0.3, 0.6, fbm(x * 0.04, z * 0.04, 231)) || !clear(x, z, 0.4)) return;
    add('tussock', x, z, 0.8 + rand() * 0.6);
  });
  // The fen's flowers in drifts: flag iris and marsh marigold at the water's edge, loosestrife along the reeds' margins, meadowsweet on the damp banks.
  scatter(1.9, (x, z) => {
    const drift = fbm(x * 0.06, z * 0.06, 241);
    if (drift < 0.58 || x > 640 || kilnEdge(x, z) || rand() > 0.6 * smoothstep(0.58, 0.72, drift) || inChannel(x, z) || !clear(x, z, 0.4)) return;
    const h = ground.at(x, z);
    const roll = rand();
    if (h > -0.15 && h < 0.12) add(roll < 0.55 ? 'iris' : 'marigold', x, z, 0.8 + rand() * 0.5, Math.max(h, SALLOWS.water - 0.05));
    else if (h >= 0.12 && h < 0.45) add(roll < 0.6 ? 'loosestrife' : 'meadowsweet', x, z, 0.85 + rand() * 0.4);
    else if (h >= 0.45 && h < 1.6) add(roll < 0.75 ? 'meadowsweet' : 'loosestrife', x, z, 0.8 + rand() * 0.4);
  });
  // Lilies on the still pools, Reedholm's among them: not the channel, not under a walkway or a house.
  scatter(2.8, (x, z) => {
    const h = ground.at(x, z);
    if (h > -0.15 || h < -1.2 || inChannel(x, z) || rand() > 0.45 * smoothstep(0.4, 0.58, fbm(x * 0.05, z * 0.05, 225)) || !clear(x, z, 0.5)) return;
    add('lily', x, z, 0.8 + rand() * 0.6, SALLOWS.water + 0.02);
  });
  // A scatter of grey stones where you walk.
  scatter(11, (x, z) => {
    if (rand() > 0.08 || ground.at(x, z) < 0.2 || !clear(x, z, 1) || !near(x, z, 4)) return;
    add('rock', x, z, 0.35 + rand() * 0.4);
  });
  return plants;
}
