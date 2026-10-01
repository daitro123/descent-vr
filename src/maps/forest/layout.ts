import { CONFIG } from '../../config';
import { PatrolWalk } from '../../enemies/patrol';
import type { PlaceSound, Tree } from '../../world/ambience';
import type { Atmosphere } from '../../world/atmosphere';
import type { InteriorPlan } from '../../world/interiors';
import type { MinePlan } from '../../world/mine';
import type { Place } from '../../quests';
import type { CampId, CampPlan, ChestPlan, Pickup, PostPlan, QuestPlace, Respawn, Seam, Spot, SpotPlan, StashSpot, VillagerSpot } from '../types';
import { HeightGrid } from '../heightGrid';
import { Walkable } from '../walkable';
import { Colliders } from './colliders';
import { HOUSE, planHouse } from './house';
import { INN, planInn } from './inn';
import { breakUpRidge, DOORSTEP, easeRailBank, planFootpaths, roundTowerHill } from './dressing';
import { mineCamp, mineChest, mineClumps, mineRespawn, mineVeins, mouthColliders, mouthOf, planMine } from './mine';
import { SMITHY, smithyColliders } from './smithy';
import { fbm, lerp, mulberry32, nearestOnPolyline, type P2, sampleCurve, smoothstep, valueNoise } from './noise';
import { LIGHT, SKY } from './palette';

// Oakvale: a gentle forest valley. A dirt road runs north from the southern
// pass through a crossroads village, over a stone bridge and up to an old mine
// in the northern ridge. Side roads lead east to a farm, west to a pond, and
// into the woods to a lumber camp and a watchtower on a hill. Mountains ring
// the valley so there's never an edge to see.
//
// This file is the plan only: heights, paths, what stands where, what you
// bump into. No three.js meshes, so it runs in unit tests. x is east, z is
// south (−z is north), metres.

export const FOREST = {
  /** The terrain reaches ±half; the ring past the play area is mountains. */
  half: 140,
  /** Terrain grid spacing. */
  cell: 2,
  /** You can walk within ±play. */
  play: 84,
  /** Height of every water surface (the stream and the pond). */
  water: -0.35,
} as const;

/**
 * Oakvale's air and light under the World's late-afternoon sun: a pale blue
 * haze, closing in from 45 m. No flames for the light pool: outdoors, glows
 * fake every lantern and fire.
 */
export const OAKVALE_ATMOSPHERE: Atmosphere = {
  background: SKY.haze,
  fog: { color: SKY.haze, near: 45, far: 200 },
  sky: { zenith: SKY.zenith, horizon: SKY.horizon, haze: SKY.haze, sun: SKY.sun },
  sun: { color: LIGHT.sun, intensity: 2.3 },
  hemisphere: { sky: LIGHT.sky, ground: LIGHT.ground, intensity: 1.5 },
  farPlane: 240,
  flames: [],
};

/**
 * The southern pass's crest, where Brackenmoor takes over: the terrain's
 * whole south edge, the pass's valley and the Greyspine either side of it,
 * which Brackenmoor's land meets all along.
 */
export const CREST = { z: 140, minX: -140, maxX: 140 } as const;

/**
 * The southern pass, walkable from the play square's edge up to the crest: a
 * corridor `half` m either side of the main road, bounded where its walls
 * turn steep, with rocks and pines along its edges about every `every` m,
 * `out` m on past them. The road's steepest stretch is eased to `grade`.
 */
export const PASS = { half: 10, grade: 0.2, every: 3.5, out: [1, 2.5] } as const;

// ------------------------------------------------------------------ plan

const MAIN_ROAD: P2[] = [
  [6, 150], [3, 110], [-3, 86], [-6, 66], [1, 46], [4, 28], [1, 12], [0, 0],
  [-2, -12], [-5, -22], [-6, -31], [-5, -40], [-8, -52], [-12, -64], [-14, -73],
];

/**
 * The Old North Pass: a cut in the northern ridge just east of the old mine's
 * front, choked by a rockslide. The old cart road leaves the main road below
 * the mine and climbs to the slide's toe, where it's buried; a weathered
 * cairn by it carries a faded waymark. Pines and a little snow show above
 * the slide. Scenery only: nothing to climb, and where you can walk doesn't
 * change (Greyfell opens it from the north, much later).
 */
export const NORTH_PASS = {
  /** The cut's floor line, from its foot at the play area's edge up through the ridge to the land's edge. */
  line: [[10, -82], [14, -94], [17, -108], [19, -124], [20, -141]] as P2[],
  /** Its floor's half width, its sides' slope (rise over run), and its floor's height at its foot and at the land's edge. */
  half: 5,
  side: 1.3,
  floor: [10, 34] as const,
  /** The slide: big boulders heaped in the cut between these distances along it, scree spilling below them. */
  slide: { from: 8, to: 36, boulders: 42, scree: 26 },
  /** The old cart road, from the main road below the mine up to the slide's toe. */
  road: [[-11, -64.5], [-4, -69], [3, -75], [9, -83], [13, -92]] as P2[],
  /** The cairn by the road below the slide, its waymark stuck in its top. */
  cairn: { x: 8.4, z: -77.6, h: 1.25 },
} as const;

/**
 * The roads. Each side road starts on the main road's middle, its mouth
 * splayed out into it (`flare`); those that end in a yard (the farm road, the
 * watchtower's, the lumber camp's, and the main road at the mine's front) wear
 * away into its earth over their last few metres (`fade`).
 */
const PATHS: { id: string; width: number; pts: P2[]; flare?: Path['flare']; fade?: number }[] = [
  { id: 'main', width: 4, pts: MAIN_ROAD, fade: 5 },
  { id: 'east', width: 3.4, pts: [[1, -1], [12, -2], [26, 3], [38, 12], [47, 20], [54, 26]], flare: { extra: 3, length: 7 }, fade: 6 },
  { id: 'west', width: 2.4, pts: [[-1, 3], [-14, 5], [-26, 12], [-34, 19], [-39, 24]], flare: { extra: 2.6, length: 6 } },
  { id: 'tower', width: 2.2, pts: [[-5, -43], [6, -49], [18, -54], [28, -57], [35, -58]], flare: { extra: 2.6, length: 6 }, fade: 4 },
  { id: 'camp', width: 2.2, pts: [[-7, -50], [-20, -47], [-32, -44], [-42, -42]], flare: { extra: 2.6, length: 6 }, fade: 5 },
];

const STREAM: P2[] = [
  [-150, -12], [-110, -20], [-80, -32], [-55, -30], [-30, -26], [-16, -30], [-6, -31],
  [6, -30], [22, -26], [40, -32], [62, -28], [90, -36], [150, -30],
];
const STREAM_HALF = 2.6;

export const POND = { x: -50, z: 30, r: 12 } as const;

/**
 * Marshal Hale's spot: the crossroads' south-east corner, at the main road's
 * edge just west of the signpost. They face north, towards the crossroads.
 */
export const HALE = { x: 1.5, z: 4.8 } as const;

/** The farm's yard, which the farmer by the well looks off towards. */
const FARM: P2 = [54, 28];

/** The farmer's spot: at the well's east side, clear of its wall, towards the crossroads. */
const FARMER: P2 = [-4.1, -4.8];

/** Where a new character starts: on the road about 3.5 m from Hale, facing them. */
const START: P2 = [0.2, 1.5];

/**
 * The camps, each at a clearing. The farm's raiders stand in two pairs: one
 * in the yard eyeing the farmhouse, a few steps past where the road comes in
 * (and clear of the hay bales, which trap anyone walking home through them),
 * and one by the windmill at the wheat field's corner. Each pair is within a
 * pull of itself and out of the other's, so you can take them a pair at a time.
 *
 * The lumber camp's gang is spread round its clearing much as round two of
 * the `?camp` prototype placed them (merge 1135338): a thug where the camp
 * road comes in, one at the fire, one on the log pile's dry side (the
 * prototype's stood on the stream bank), the archer to the north watching the
 * woods (the stream bank takes the south), and the leader before their tent's
 * door. A pull brings two to four of them rather than the lot.
 *
 * The watchtower's gang holds the flat top of its hill: a thug at the tower's
 * door where the road comes up, facing down it; the archer on the hill's
 * south-west brow, looking down over the road; and a thug round the back,
 * watching the woods. The archer is within a pull of the door's thug, the
 * back's thug of neither, so you can take the pair first.
 */
const CAMPS: {
  id: CampId;
  clearing: string;
  level: number;
  posts: (Omit<PostPlan, 'yaw'> & { face: P2 })[];
}[] = [
  {
    id: 'farm',
    clearing: 'farm',
    level: 1,
    posts: [
      { behaviour: 'grunt', family: 'bandit', x: 60, z: 33, face: [44, 37] },
      { behaviour: 'grunt', family: 'bandit', x: 57.5, z: 37.5, face: [44, 37] },
      { behaviour: 'grunt', family: 'bandit', x: 67.5, z: 43, face: [58, 48] },
      { behaviour: 'grunt', family: 'bandit', x: 72, z: 45.5, face: [58, 48] },
    ],
  },
  {
    id: 'lumberCamp',
    clearing: 'camp',
    level: 2,
    posts: [
      { behaviour: 'grunt', family: 'bandit', x: -38.5, z: -43, face: [-30, -45.5] },
      { behaviour: 'grunt', family: 'bandit', x: -47.5, z: -39.3, face: [-48, -41] },
      { behaviour: 'grunt', family: 'bandit', x: -54.5, z: -40.5, face: [-55, -38] },
      { behaviour: 'archer', family: 'bandit', x: -46, z: -49.5, face: [-38, -53] },
      { behaviour: 'brute', role: 'leader', family: 'bandit', x: -50, z: -44.3, face: [-44, -41] },
    ],
  },
  {
    id: 'watchtower',
    clearing: 'towerTop',
    level: 2,
    posts: [
      { behaviour: 'grunt', family: 'bandit', x: 35, z: -59.5, face: [28, -57.5] },
      { behaviour: 'archer', family: 'bandit', x: 37.5, z: -53, face: [28, -55] },
      { behaviour: 'grunt', family: 'bandit', x: 45, z: -62, face: [52, -66] },
    ],
  },
];

/**
 * The lumber camp's patrol: two thugs walking the camp road in single file,
 * level 2. Their road is the stretch of the camp road at least `clearMain` m
 * from the main road's middle, so walking the main road (4 m wide) never
 * wakes them, and at least `clearCamp` m from every one of the lumber camp's
 * posts, so jumping them at the camp's end doesn't wake the camp too.
 */
const PATROL = { path: 'camp', level: 2, count: 2, clearMain: 10, clearCamp: 9 } as const;

/**
 * The lumber camp leader's tent, in its own frame (its door faces +Z): a
 * ridge tent, solid for everyone, its door flaps rolled back on two crates
 * stacked just inside, with the leader's orders on top. You reach in from
 * the doorway; you can't walk in (a tent you could would trap anyone chasing
 * you inside it).
 */
export const TENT = {
  hw: 1.7,
  hd: 1.85,
  ridge: 2.5,
  /** The crates just inside the door, their front on its line: the stack's centre, its half width and depth, and the height of its top. */
  crates: { z: 1.55, half: 0.3, top: 1.0 },
  /** Where the orders lie on the top crate, near its front edge: a hand's reach from the doorway. */
  orders: { x: 0, z: 1.75 },
} as const;

/**
 * Oakvale's chests out of doors (.scratch/inventory/issues/07-oakvales-items.md;
 * the third, the bandits' strongbox, is the mine's: mine.ts). Where each one's
 * contents come out is in its own frame (its front faces +Z): beside it, out
 * of your feet's way as you stand before it to lift the lid.
 */
export const CHESTS = {
  /**
   * On the watchtower's hilltop, its back to the tower's wall `r` m from its
   * middle, `a` rad round from its door (the tower's +Z): the far side from
   * the door's thug and the archer, and well clear of the thug round the back.
   */
  watchtower: { id: 'oakvale-watchtower', level: 2, a: 2.36, r: 3.95, drop: { x: 0.95, z: 0.15 } },
  /**
   * In the lumber camp leader's tent, in its frame: beside the crates the
   * orders lie on, on the side away from the leader's post, its front on the
   * door's line so you reach its lid from the doorway. What's inside comes out
   * on the ground outside the door, on the crates' other side.
   */
  tent: { id: 'oakvale-leaders-tent', level: 2, x: -0.8, drop: { x: 1.9, z: 1.0 } },
} as const;

/**
 * Oakvale's copper veins out of doors (.scratch/professions/issues/10-…; the
 * mine's two are in its gallery: mine.ts): boulders streaked green and copper,
 * each at (x, z) with its ore facing `face`, where you'd come at it from. Two
 * in the rocks at the village's east edge behind the smithy, two in the ridge
 * either side of the old mine's front, one on the watchtower's hilltop among
 * its gang, and one in the rocks round the standing stones. Nothing grows
 * within `clear` m of one (a tree `clear.tree`), and you bump into each.
 */
export const VEINS = {
  outdoors: [
    { id: 'smithy-east', x: 22, z: 19, face: [13, 12] },
    { id: 'smithy-south', x: 24.5, z: 14.5, face: [13, 12] },
    { id: 'mine-ridge-west', x: -21, z: -74, face: [-14, -72] },
    { id: 'mine-ridge-east', x: -7, z: -74, face: [-14, -72] },
    { id: 'watchtower', x: 45.5, z: -53.5, face: [40, -58] },
    { id: 'standing-stones', x: -23, z: 58, face: [-30, 52] },
  ] as readonly { readonly id: string; readonly x: number; readonly z: number; readonly face: P2 }[],
  clear: { plant: 1.6, tree: 3 },
} as const;

/**
 * Oakvale's clumps of herbs out of doors (.scratch/professions/issues/10-…;
 * the mine's two Duskcap are in its gallery: mine.ts), each at (x, z).
 * Hearthleaf, bright leaves on an earthen bank: three by the farm's fields
 * among its raiders (west and north of the wheat, south of the cabbages), one
 * by the road south towards the pass, one by the bridge, two on the pond's
 * shore and one in the meadow by the standing stones. Duskcap, dark caps on
 * old stumps: two in the deep woods west of the main road and two in the
 * woods round the lumber camp. Nothing else grows within `CONFIG.professions.
 * clump.clear` m of one, and you bump into its rise.
 */
export const HERBS = {
  hearthleaf: [
    { id: 'farm-wheat-west', x: 48, z: 46.5 },
    { id: 'farm-wheat-north', x: 62.5, z: 40.5 },
    { id: 'farm-cabbages', x: 71, z: 60 },
    { id: 'road-south', x: -9.5, z: 72 },
    { id: 'bridge', x: -10.5, z: -26 },
    { id: 'pond-east', x: -35.5, z: 36.5 },
    { id: 'pond-west', x: -64, z: 23 },
    { id: 'standing-stones-meadow', x: -37, z: 45.5 },
  ],
  duskcap: [
    { id: 'west-woods-north', x: -44, z: -12 },
    { id: 'west-woods-south', x: -33, z: -19 },
    { id: 'lumber-camp-west', x: -62, z: -45 },
    { id: 'lumber-camp-north', x: -41, z: -56 },
  ],
} as const satisfies Record<'hearthleaf' | 'duskcap', readonly { readonly id: string; readonly x: number; readonly z: number }[]>;

/** A board on a signpost: the name painted on it, the way it points (as a yaw: towards (sin a, cos a)) and its middle's height. */
export interface SignBoard {
  readonly name: string;
  readonly a: number;
  readonly y: number;
}

/** A signpost: its post's height, and its boards' length and height, each with its name painted on both faces. */
export interface SignpostPlan {
  readonly post: number;
  readonly length: number;
  readonly height: number;
  readonly boards: readonly SignBoard[];
  /** Weathered grey, its names all but worn away. */
  readonly faded?: boolean;
}

/**
 * The signposts, by the variant of their structure. The crossroads' boards
 * point down its four roads, "Lumber Camp" under "Old Mine" since both lie up
 * the north road. The smaller one stands north of the bridge, where the
 * watchtower's road leaves the main road to the east and the lumber camp's to
 * the west, its boards along each road as it leaves. They name the world's
 * places; nothing on them follows the quest.
 */
export const SIGNPOSTS: readonly SignpostPlan[] = [
  {
    post: 2.6,
    length: 1.0,
    height: 0.2,
    boards: [
      { name: 'Old Mine', a: Math.PI, y: 2.3 },
      { name: 'Lumber Camp', a: Math.PI, y: 2.05 },
      { name: 'Farm', a: Math.PI / 2 - 0.1, y: 1.8 },
      { name: 'Pond', a: -Math.PI / 2 - 0.2, y: 1.55 },
      { name: 'Brackenmoor', a: 0.1, y: 1.3 },
    ],
  },
  {
    post: 2.3,
    length: 0.85,
    height: 0.17,
    boards: [
      { name: 'Old Mine', a: -2.86, y: 2.05 },
      { name: 'Lumber Camp', a: -1.34, y: 1.83 },
      { name: 'Watchtower', a: 2.07, y: 1.61 },
      { name: 'Village', a: -0.11, y: 1.39 },
    ],
  },
  {
    // The waymark in the cairn below the Old North Pass: one weathered board, pointing up the buried road.
    post: 1.75,
    length: 0.7,
    height: 0.15,
    faded: true,
    boards: [{ name: 'North Road', a: Math.PI - 0.45, y: 1.6 }],
  },
];

/**
 * The painted map of Oakvale at the crossroads: its face's width and height,
 * its top's height, how far it leans back, and the patch of the zone it shows
 * (x is east, z south). It's painted heads-up: facing it you face east, so
 * east is at its top and north at its left, as the zone lies before you.
 */
export const MAP_BOARD = {
  w: 1.2,
  h: 0.9,
  top: 1.5,
  lean: 0.17,
  shows: { minX: -64, maxX: 78, minZ: -88, maxZ: 92 },
} as const;

/** A plain cottage's chimney, over its right gable: in from the side wall, along its depth, and how far it rises over the eaves. */
export const COTTAGE_CHIMNEY = { inset: 0.9, z: -0.8, rise: 3.1 } as const;

/** Where smoke rises: a chimney's top or the lumber camp's fire. */
export interface Plume {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly fire: boolean;
}

export interface Clearing {
  id: string;
  x: number;
  z: number;
  /** Flattened out to r; trees keep `treeFree` metres off the centre. */
  r: number;
  treeFree: number;
  /** Ground height to flatten to; defaults to the ground at the centre. */
  h?: number;
}

const CLEARINGS: Clearing[] = [
  { id: 'village', x: 0, z: 0, r: 25, treeFree: 22 },
  { id: 'farm', x: 56, z: 36, r: 30, treeFree: 27 },
  { id: 'camp', x: -48, z: -42, r: 13, treeFree: 9 },
  { id: 'towerTop', x: 40, z: -58, r: 8, treeFree: 7 },
  { id: 'mineFront', x: -14, z: -72, r: 7, treeFree: 7 },
  { id: 'stones', x: -30, z: 52, r: 11, treeFree: 8 },
  { id: 'pondShore', x: POND.x, z: POND.z, r: 22, treeFree: 15, h: FOREST.water + 0.55 },
];

export type StructureKind =
  | 'inn' | 'house' | 'smithy' | 'well' | 'signpost' | 'lamp' | 'cart' | 'farmhouse' | 'barn'
  | 'windmill' | 'scarecrow' | 'haybale' | 'trough' | 'tower' | 'mine' | 'tent' | 'campfire'
  | 'logpile' | 'stones' | 'dock' | 'boat' | 'bridge' | 'mapboard' | 'cairn' | 'rockslide';

export interface Structure {
  kind: StructureKind;
  x: number;
  z: number;
  /** Turn about +Y; the model's front (+Z) faces (sin yaw, cos yaw). */
  yaw: number;
  /** Ground height under its origin (filled in by the layout). */
  y: number;
  /** Footprint half extents in its own frame: trees keep off it, and solid ones collide. */
  hw: number;
  hd: number;
  solid: boolean;
  variant: number;
}

/** Yaw that turns a model's front (+Z) to face from (x, z) towards (tx, tz). */
function facing(x: number, z: number, tx: number, tz: number): number {
  return Math.atan2(tx - x, tz - z);
}

type Spec = Omit<Structure, 'y' | 'variant' | 'solid'> & { variant?: number; solid?: boolean };

const STRUCTURES: Spec[] = [
  // Crossroads village.
  // The inn collides through its interior's walls (inn.ts), which leave its doorway open.
  { kind: 'inn', x: 13, z: -15, yaw: facing(13, -15, 2, -3), hw: INN.hw, hd: INN.hd, solid: false },
  // The house by the well opens: it collides through its interior's walls (house.ts), which leave its doorway open.
  { kind: 'house', x: -13, z: -12, yaw: facing(-13, -12, -2, -3), hw: HOUSE.hw, hd: HOUSE.hd, solid: false },
  { kind: 'house', x: -15, z: 15, yaw: facing(-15, 15, -2, 5), hw: 3.2, hd: 2.8, variant: 1 },
  { kind: 'house', x: -24, z: -3, yaw: facing(-24, -3, -10, 3), hw: 3, hd: 2.6, variant: 2 },
  // You walk in under the smithy's roof: it collides by its walls and what stands in it (smithy.ts).
  { kind: 'smithy', x: 13, z: 12, yaw: facing(13, 12, 3, 3), hw: SMITHY.hw, hd: SMITHY.hd, solid: false },
  { kind: 'well', x: -5.5, z: -5.5, yaw: 0.3, hw: 1, hd: 1 },
  { kind: 'signpost', x: 3.8, z: 4.4, yaw: 0, hw: 0.2, hd: 0.2 },
  // The map board, across the signpost from Hale on the farm road's south side, facing west over the crossroads.
  { kind: 'mapboard', x: 6.3, z: 4.4, yaw: -Math.PI / 2, hw: MAP_BOARD.w / 2 + 0.1, hd: 0.25 },
  { kind: 'lamp', x: 3.4, z: -8, yaw: 0, hw: 0.2, hd: 0.2 },
  { kind: 'lamp', x: -3.4, z: 8, yaw: 0, hw: 0.2, hd: 0.2 },
  { kind: 'lamp', x: 7, z: -4.6, yaw: 0, hw: 0.2, hd: 0.2 },
  { kind: 'lamp', x: -7, z: 0.4, yaw: 0, hw: 0.2, hd: 0.2 },
  { kind: 'cart', x: 7, z: 7.5, yaw: 0.5, hw: 1, hd: 1.9 },
  // The farm.
  { kind: 'farmhouse', x: 44, z: 37, yaw: facing(44, 37, 54, 27), hw: 4, hd: 3 },
  { kind: 'barn', x: 67, z: 20, yaw: facing(67, 20, 55, 27), hw: 5, hd: 4 },
  { kind: 'windmill', x: 73, z: 40, yaw: facing(73, 40, 56, 34), hw: 2.6, hd: 2.6 },
  { kind: 'haybale', x: 60.5, z: 27.5, yaw: 0.4, hw: 0.9, hd: 0.6 },
  { kind: 'haybale', x: 62.5, z: 25.5, yaw: 1.3, hw: 0.9, hd: 0.6 },
  { kind: 'haybale', x: 63.8, z: 28.6, yaw: 2.2, hw: 0.9, hd: 0.6 },
  { kind: 'trough', x: 46.2, z: 29.6, yaw: 0.8, hw: 1.1, hd: 0.45 },
  { kind: 'scarecrow', x: 58, z: 47, yaw: facing(58, 47, 56, 36), hw: 0.3, hd: 0.3 },
  // Watchtower on its hill, lumber camp, the old mine, the standing stones.
  { kind: 'tower', x: 40, z: -58, yaw: facing(40, -58, 34, -58), hw: 3.4, hd: 3.4 },
  { kind: 'tent', x: -51.95, z: -46.6, yaw: facing(-51.95, -46.6, -48, -41), hw: TENT.hw, hd: TENT.hd },
  { kind: 'campfire', x: -48, z: -41, yaw: 0, hw: 0.6, hd: 0.6 },
  { kind: 'logpile', x: -55, z: -38, yaw: 0.35, hw: 2.1, hd: 1 },
  // The old mine opens: the boulders round its mouth collide (mine.ts), and inside is the mine's own.
  { kind: 'mine', x: -14, z: -80.5, yaw: 0, hw: 4.5, hd: 2.5, solid: false },
  // The second signpost, west of the main road between the watchtower's road and the lumber camp's.
  { kind: 'signpost', x: -10, z: -45.5, yaw: 0, hw: 0.2, hd: 0.2, variant: 1 },
  { kind: 'stones', x: -30, z: 52, yaw: 0, hw: 6, hd: 6, solid: false },
];

export interface Field {
  crop: 'wheat' | 'pumpkin' | 'cabbage';
  x: number;
  z: number;
  /** Half extents in its own frame. */
  hw: number;
  hd: number;
  yaw: number;
}

const FIELDS: Field[] = [
  { crop: 'wheat', x: 58, z: 48, hw: 7, hd: 5, yaw: 0.1 },
  { crop: 'pumpkin', x: 40, z: 51, hw: 5, hd: 4, yaw: -0.15 },
  { crop: 'cabbage', x: 71, z: 53, hw: 4, hd: 4, yaw: 0.2 },
];

export type PlantKind =
  | 'oak' | 'goldOak' | 'pine' | 'young' | 'bush' | 'rock' | 'grass' | 'flower' | 'mushroom'
  | 'log' | 'stump' | 'reed' | 'lily';

export interface Plant {
  kind: PlantKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  seed: number;
}

export interface Path {
  id: string;
  width: number;
  /** Centre line, about a metre between samples. */
  line: P2[];
  /** Ground height along the centre line. */
  heights: number[];
  /** A trodden footpath to a door or a gate (dressing.ts): no ruts, laid under the roads and yards it leaves. */
  foot?: boolean;
  /** Its mouth splayed into the road it leaves, and its end worn away into a yard (as `addRoads` lays it). */
  flare?: { readonly extra: number; readonly length: number };
  fade?: number;
  /** How far above the ground it's laid, if not by its place in the list. */
  lift?: number;
}

/** A deck you walk on above the terrain: its centre line runs along its own Z. */
export interface Deck {
  x: number;
  z: number;
  yaw: number;
  hw: number;
  hd: number;
  /** Deck height at the ends, and how far the middle rises above them (an arch). */
  y0: number;
  y1: number;
  rise: number;
}

// ------------------------------------------------------------------ height field

/** Oakvale's heights: a square grid round the origin, out to ±`half`. */
export class HeightField extends HeightGrid {
  /** Vertices along each side. */
  readonly n: number;

  constructor(
    readonly half: number,
    cell: number,
  ) {
    const n = Math.round((2 * half) / cell) + 1;
    super(-half, -half, n, n, cell);
    this.n = n;
  }
}

/**
 * Distance to the nearest of some polylines (less an offset, e.g. to a road's
 * edge rather than its centre), on a 1 m grid out to a fixed reach. Built by
 * stamping each line's samples, so it's cheap to build and O(1) to read.
 */
export class DistanceField {
  private readonly n: number;
  private readonly data: Float32Array;

  constructor(private readonly half: number) {
    this.n = 2 * half + 1;
    this.data = new Float32Array(this.n * this.n).fill(Infinity);
  }

  /** Stamp a line (sampled about every metre) out to `reach` metres; stored values are distance − `offset`. */
  stamp(line: readonly P2[], reach: number, offset = 0): void {
    const r = Math.ceil(reach);
    for (const [x, z] of line) {
      const ci = Math.round(x + this.half);
      const cj = Math.round(z + this.half);
      for (let j = Math.max(0, cj - r); j <= Math.min(this.n - 1, cj + r); j++) {
        for (let i = Math.max(0, ci - r); i <= Math.min(this.n - 1, ci + r); i++) {
          const d = Math.hypot(i - this.half - x, j - this.half - z);
          if (d > reach) continue;
          const k = j * this.n + i;
          if (d - offset < this.data[k]) this.data[k] = d - offset;
        }
      }
    }
  }

  /** Nearest grid point's value; Infinity past the reach. */
  at(x: number, z: number): number {
    const i = Math.round(x + this.half);
    const j = Math.round(z + this.half);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return Infinity;
    return this.data[j * this.n + i];
  }
}

// ------------------------------------------------------------------ the layout

export interface ForestLayout {
  /** Where you can walk: the play square and the southern pass up to its crest. */
  walkable: Walkable;
  /** The rockslide choking the Old North Pass, boulder by boulder. */
  slide: readonly Boulder[];
  /** Its fog, sky colours and light, which the World applies. */
  atmosphere: Atmosphere;
  /** Its heights along each seam with a neighbour, which the neighbour's land meets. */
  seams: Seam[];
  ground: HeightField;
  paths: Path[];
  stream: { line: P2[]; half: number };
  clearings: Clearing[];
  structures: Structure[];
  fields: Field[];
  fences: P2[][];
  plants: Plant[];
  bridge: Deck;
  dock: Deck;
  colliders: Colliders;
  /** Distance to the nearest path's edge (negative on it), within a few metres of one. */
  roadDistance: DistanceField;
  /** Where a new character starts, and where `?map` and `?fly` begin: the crossroads, facing Hale's spot. */
  spawn: { x: number; z: number; yaw: number };
  /** Where you wake after a death (yaw as `spawn`'s): the village's is by the inn's hearth, the mine's outside its mouth. */
  respawns: { village: Respawn; mine: Respawn };
  /** The stash's chest, by the inn's hearth. */
  stash: StashSpot;
  /** The buildings you walk into: the inn, then the house by the well. */
  interiors: InteriorPlan[];
  /** The old mine, which you walk into by its mouth. */
  mine: MinePlan;
  /** Where Marshal Hale stands, facing the crossroads' centre (yaw as a model turns: 0 faces +Z). */
  hale: Spot;
  /** Where each quest sends you, for the quest arrow: the farm, the lumber camp, and the old mine's mouth with its front. */
  places: Record<Place, QuestPlace>;
  /** Where smoke rises: the inn's two chimneys, the two cottages' that have one, the smithy's forge and the lumber camp's fire. */
  smoke: Plume[];
  /** Where the innkeeper (behind the inn's bar), the smith (at the anvil) and the farmer (by the well) work. */
  villagers: VillagerSpot[];
  camps: CampPlan[];
  /** What lies about to be picked up by hand: the leader's orders in their tent. */
  pickups: Pickup[];
  /** The chests: on the watchtower's hilltop, in the leader's tent and the bandits' strongbox in the mine. */
  chests: ChestPlan[];
  /** The gathering spots: the copper veins out of doors (VEINS), then the mine's; the clumps of herbs out of doors (HERBS), then the mine's. */
  spots: SpotPlan[];
  /** The places that sound where they are: the stream under the bridge, the dock, the windmill, the smithy, the inn's hearth, the lumber camp's fire and the mine's mouth. */
  sounds: PlaceSound[];
  /** The trees in the play area, for birds to call from. */
  trees: Tree[];
  landmarks: { label: string; x: number; z: number }[];
  /** Ground height, including the bridge and dock decks. */
  heightAt(x: number, z: number): number;
}

let planned: ForestLayout | null = null;

/** Oakvale's plan, made once: the zone, its neighbour Brackenmoor (for the crest) and its worker share it. */
export function planOakvale(): ForestLayout {
  return (planned ??= buildLayout());
}

export function buildLayout(): ForestLayout {
  const { half, cell, play, water } = FOREST;
  const ground = new HeightField(half, cell);
  const streamLine = sampleCurve(STREAM, 1);
  const mainLine = sampleCurve(MAIN_ROAD, 1);
  const streamField = new DistanceField(half);
  streamField.stamp(streamLine, 42);
  const southField = new DistanceField(half);
  southField.stamp(mainLine.filter(([, z]) => z > 40), 36);

  // 1. Rolling ground, rising into mountains past the play area. The stream
  // and the southern road leave through valleys, so the ring has gaps that
  // read as the world going on.
  const dStream = new Float32Array(ground.data.length);
  ground.each((x, z, k) => {
    dStream[k] = streamField.at(x, z);
    let h = 1.6 + (fbm(x * 0.012, z * 0.012, 1) - 0.4) * 18 + (fbm(x * 0.05, z * 0.05, 2) - 0.5) * 1.6;
    h = smoothMax(h, 0.35, 0.8);
    const r = Math.sqrt(Math.sqrt(x ** 4 + z ** 4));
    const edge = Math.pow(smoothstep(60, 142, r), 1.6);
    const valley = Math.max(smoothstep(40, 8, dStream[k]), smoothstep(34, 6, southField.at(x, z)));
    h += edge * (18 + 26 * fbm(x * 0.02 + 9, z * 0.02 - 4, 3)) * (1 - 0.9 * valley);
    // A steep ridge behind the mine.
    h += 12 * smoothstep(-76, -83, z) * smoothstep(34, 14, Math.abs(x + 14));
    // The watchtower's hill.
    h += 6 * Math.exp(-(((x - 40) ** 2 + (z + 58) ** 2) / 15 ** 2));
    // The stream runs along a shallow valley floor.
    h = lerp(h, Math.min(h, water + 0.7), smoothstep(13, 3, dStream[k]));
    ground.data[k] = h;
  });

  // 2. Clearings flatten to the ground at their centre.
  for (const c of CLEARINGS) {
    const target = c.h ?? ground.at(c.x, c.z);
    c.h = target;
    ground.each((x, z, k) => {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r) ground.data[k] = lerp(ground.data[k], target, smoothstep(c.r, c.r * 0.6, d));
    });
  }

  // 3. Paths, in order, each following a smoothed version of the ground so
  // later ones meet earlier ones at the same height.
  const paths: Path[] = PATHS.map((spec) => {
    // The main road ends at the crest, where Brackenmoor's road carries on.
    const line = spec.id === 'main' ? upTo(sampleCurve(spec.pts, 1), CREST.z) : sampleCurve(spec.pts, 1);
    let heights = line.map(([x, z]) => ground.at(x, z));
    for (let pass = 0; pass < 4; pass++) heights = smooth(heights, 5);
    heights = heights.map((h) => Math.max(h, water + 0.5));
    // Up the pass, no steeper than PASS.grade.
    if (spec.id === 'main') heights = easeGrade(line, heights, line.findIndex(([, z]) => z <= play), PASS.grade);
    const path: Path = { id: spec.id, width: spec.width, line, heights, flare: spec.flare, fade: spec.fade };
    flattenAlong(ground, path);
    return path;
  });

  // 4. Cut the stream's channel and the pond's bowl into it all.
  ground.each((x, z, k) => {
    const wobble = (valueNoise(x * 0.15, z * 0.15, 11) - 0.5) * 1.2;
    const w = smoothstep(STREAM_HALF + 2.2 + wobble, STREAM_HALF - 0.4 + wobble, dStream[k]);
    if (w > 0) ground.data[k] = lerp(ground.data[k], Math.min(ground.data[k], water - 0.75), w);
    const dp = Math.hypot(x - POND.x, z - POND.z);
    const edge = pondRadius(x, z);
    const wp = smoothstep(edge + 3, edge - 2.5, dp);
    if (wp > 0) ground.data[k] = lerp(ground.data[k], water - 1.3, wp);
  });

  const structures: Structure[] = STRUCTURES.map((s) => ({
    ...s,
    y: ground.at(s.x, s.z),
    variant: s.variant ?? 0,
    solid: s.solid ?? true,
  }));
  // The mine is dug into the ridge: its floor is level with the ground at its mouth.
  const mine = structures.find((s) => s.kind === 'mine')!;
  mine.y = ground.at(mine.x, mine.z + mine.hd + 0.5);
  // The ground as it lay before anything was levelled for a building: the finishing touches ease back to it.
  const unlevelled = ground.data.slice();
  // Level a bed for the rails out of the mouth, so they don't hang over the dip in front.
  levelRect(ground, mine, mine.y, -2.8, 2.8, mine.hd - 0.3, mine.hd + 9, 3);
  // The watchtower's hilltop is levelled to its base, so the road climbs to its door
  // instead of the door hanging over a cutting.
  const tower = structures.find((s) => s.kind === 'tower')!;
  levelRect(ground, tower, tower.y, -6.5, 6.5, -6.5, 6.5, 4);
  // The inn stands on level ground, out to the foot of the steps at its door.
  const innSite = structures.find((s) => s.kind === 'inn')!;
  levelRect(ground, innSite, innSite.y, -INN.hw - 0.3, INN.hw + 0.3, -INN.hd - 0.3, INN.hd + INN.steps.out + 1.5, 2);
  // So does the house by the well, and the smithy, whose flagstones are flush with the ground.
  const houseSite = structures.find((s) => s.kind === 'house' && s.variant === 0)!;
  levelRect(ground, houseSite, houseSite.y, -HOUSE.hw - 0.3, HOUSE.hw + 0.3, -HOUSE.hd - 0.3, HOUSE.hd + HOUSE.steps.out + 1, 2);
  const smithySite = structures.find((s) => s.kind === 'smithy')!;
  levelRect(ground, smithySite, smithySite.y, -SMITHY.hw - 1.5, SMITHY.hw + 1.5, -SMITHY.hd - 1.5, SMITHY.hd + 1.5, 2);

  // The bridge spans the channel where the main road meets the stream.
  const main = paths[0];
  const wet = main.line.map(([x, z]) => streamField.at(x, z) < STREAM_HALF + 2.4);
  const first = Math.max(0, wet.indexOf(true) - 1);
  const last = Math.min(main.line.length - 1, wet.lastIndexOf(true) + 1);
  const [ax, az] = main.line[first];
  const [bx, bz] = main.line[last];
  const bridge: Deck = {
    x: (ax + bx) / 2,
    z: (az + bz) / 2,
    yaw: Math.atan2(bx - ax, bz - az),
    hw: 1.7,
    hd: Math.hypot(bx - ax, bz - az) / 2,
    y0: main.heights[first] + 0.02,
    y1: main.heights[last] + 0.02,
    rise: 0.8,
  };
  structures.push({ kind: 'bridge', x: bridge.x, z: bridge.z, yaw: bridge.yaw, y: bridge.y0, hw: bridge.hw, hd: bridge.hd, solid: false, variant: 0 });

  // The dock runs from the end of the west path out over the pond.
  const toPond = Math.atan2(POND.x - -39, POND.z - 24);
  const dockLen = 7;
  const dock: Deck = {
    x: -39 + Math.sin(toPond) * (dockLen / 2 - 0.5),
    z: 24 + Math.cos(toPond) * (dockLen / 2 - 0.5),
    yaw: toPond,
    hw: 0.9,
    hd: dockLen / 2,
    y0: water + 0.5,
    y1: water + 0.5,
    rise: 0,
  };
  structures.push({ kind: 'dock', x: dock.x, z: dock.z, yaw: dock.yaw, y: dock.y0, hw: dock.hw, hd: dock.hd, solid: false, variant: 0 });
  const boatAt = localToWorld(dock, 1.7, 1.2);
  structures.push({ kind: 'boat', x: boatAt[0], z: boatAt[1], yaw: toPond + 0.15, y: water, hw: 0.6, hd: 1.6, solid: false, variant: 0 });

  const heightAt = (x: number, z: number): number => {
    let h = ground.at(x, z);
    for (const deck of [bridge, dock]) {
      const [lx, lz] = worldToLocal(deck, x, z);
      if (Math.abs(lx) > deck.hw || Math.abs(lz) > deck.hd) continue;
      const t = (lz + deck.hd) / (2 * deck.hd);
      h = Math.max(h, lerp(deck.y0, deck.y1, t) + deck.rise * Math.sin(Math.PI * t));
    }
    return h;
  };

  const fences = buildFences(structures);
  const walkable = new Walkable([Walkable.rect(-play, play, -play, play).areas[0], ...passCorridor(main.line)]);
  const colliders = new Colliders(walkable);
  for (const s of structures) {
    if (!s.solid) continue;
    if (['well', 'windmill', 'tower', 'campfire', 'signpost', 'lamp', 'scarecrow'].includes(s.kind)) {
      colliders.addCircle({ x: s.x, z: s.z, r: Math.max(s.hw, s.hd) });
    } else colliders.addBox({ x: s.x, z: s.z, hw: s.hw, hd: s.hd, yaw: s.yaw });
  }
  const stones = structures.find((s) => s.kind === 'stones')!;
  for (const [x, z] of standingStones(stones)) colliders.addCircle({ x, z, r: 0.55 });
  const smithyShapes = smithyColliders();
  for (const [lx, lz, hw, hd] of smithyShapes.boxes) {
    const [x, z] = localToWorld(smithySite, lx, lz);
    colliders.addBox({ x, z, hw, hd, yaw: smithySite.yaw });
  }
  for (const [lx, lz, r] of smithyShapes.circles) {
    const [x, z] = localToWorld(smithySite, lx, lz);
    colliders.addCircle({ x, z, r });
  }
  const mouth = mouthOf(mine);
  for (const [lx, lz, hw, hd] of mouthColliders().boxes) {
    const [x, z] = localToWorld(mouth, lx, lz);
    colliders.addBox({ x, z, hw, hd, yaw: mouth.yaw });
  }
  // The chests: the one on the watchtower's hilltop stands in your way (the tent's is in the tent,
  // and the mine's strongbox is the mine's own prop).
  const chests = placeChests(tower, structures.find((s) => s.kind === 'tent')!, mouth, heightAt);
  const { w, d } = CONFIG.chests.looks.chest;
  const onHill = chests.find((c) => c.id === CHESTS.watchtower.id)!;
  colliders.addBox({ x: onHill.x, z: onHill.z, hw: w / 2, hd: d / 2, yaw: onHill.yaw });
  // Bridge railings, so the arch can't be walked off sideways.
  for (const side of [-1, 1]) {
    const [x, z] = localToWorld(bridge, side * (bridge.hw + 0.12), 0);
    colliders.addBox({ x, z, hw: 0.15, hd: bridge.hd - 0.6, yaw: bridge.yaw });
  }
  for (const fence of fences) {
    for (let i = 0; i < fence.length - 1; i++) {
      const [x0, z0] = fence[i];
      const [x1, z1] = fence[i + 1];
      colliders.addBox({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: 0.08, hd: Math.hypot(x1 - x0, z1 - z0) / 2, yaw: Math.atan2(x1 - x0, z1 - z0) });
    }
  }

  // The Old North Pass comes last, so nothing planned before it moves: the woods are planted
  // over the ground and roads as they were without it, then cleared off it and settled on it.
  const natural = new HeightField(half, cell);
  natural.data.set(ground.data);
  const naturalRoads = new DistanceField(half);
  for (const p of paths) naturalRoads.stamp(p.line, p.width / 2 + 6, p.width / 2);
  const planted = structures.slice();
  // The finishing touches to the ground (dressing.ts), before the pass is cut through the ridge they break up.
  roundTowerHill(ground, unlevelled, tower);
  easeRailBank(ground, unlevelled, mine);
  breakUpRidge(ground, mine);
  cutNorthPass(ground);
  const cartRoad = northPassRoad(ground);
  paths.push(cartRoad);
  const slide = northPassSlide(ground);
  structures.push(...northPassPieces(ground));
  // The footpaths to every door and gate, laid over the ground as it's finished (dressing.ts).
  const footpaths = planFootpaths(ground, paths, structures);
  paths.push(...footpaths);
  const roadDistance = new DistanceField(half);
  // A footpath's last stretch runs up to a door or a gate, which stands on it: that isn't road to keep things off.
  for (const p of paths) roadDistance.stamp(p.foot ? p.line.slice(0, -DOORSTEP) : p.line, p.width / 2 + 6, p.width / 2);
  // The veins out of doors: what grows there is thinned away after it's placed (so nothing else moves), and they're solid.
  const veins: SpotPlan[] = VEINS.outdoors.map((v) => ({
    id: v.id,
    kind: 'copperVein',
    x: v.x,
    y: heightAt(v.x, v.z),
    z: v.z,
    yaw: facing(v.x, v.z, v.face[0], v.face[1]),
    interior: null,
  }));
  // The clumps of herbs out of doors, each turned its own way: the same.
  const clumps: SpotPlan[] = (['hearthleaf', 'duskcap'] as const).flatMap((kind) =>
    HERBS[kind].map((h, i) => ({ id: `${kind}-${h.id}`, kind, x: h.x, y: heightAt(h.x, h.z), z: h.z, yaw: i * 2.4, interior: null })),
  );
  const C = CONFIG.professions.clump;
  const plants = placePlants(natural, naturalRoads, streamField, planted, colliders).filter(
    (p) =>
      !veins.some((v) => Math.hypot(p.x - v.x, p.z - v.z) < (TREE_HEIGHT[p.kind] ? VEINS.clear.tree : VEINS.clear.plant)) &&
      !clumps.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < (TREE_HEIGHT[p.kind] ? C.clear.tree : C.clear.plant)),
  );
  // Nothing grows in the Old North Pass's cut, on its cart road or by its cairn; what grows by them stands on the ground as it's cut.
  const cairn = structures.find((st) => st.kind === 'cairn')!;
  plants.splice(
    0,
    plants.length,
    ...plants
      .filter((p) => !inNorthPass(p.x, p.z, 2.5) && nearestOnPolyline(cartRoad.line, p.x, p.z).d > cartRoad.width / 2 + (TREE_HEIGHT[p.kind] ? 1.6 : 0.4) && Math.hypot(p.x - cairn.x, p.z - cairn.z) > 1.4)
      // Nor on the footpaths: trees and rocks keep back from their edges, the grass from their middles.
      .filter((p) => footpaths.every((f) => nearestOnPolyline(f.line, p.x, p.z).d > (TREE_HEIGHT[p.kind] ? f.width / 2 + 1.2 : p.kind === 'grass' || p.kind === 'flower' ? f.width / 2 - 0.1 : f.width / 2 + 0.5)))
      .map((p) => ({ ...p, y: p.y + ground.at(p.x, p.z) - natural.at(p.x, p.z) })),
  );
  plants.push(...passEdges(ground, main.line));
  colliders.addCircle({ x: cairn.x, z: cairn.z, r: cairn.hw });
  // The slide's boulders where they come within reach of where you walk.
  for (const r of slide) if (walkable.distance(r.x, r.z) < r.r + 1) colliders.addCircle({ x: r.x, z: r.z, r: r.r * 0.85 });
  for (const v of veins) colliders.addCircle({ x: v.x, z: v.z, r: CONFIG.professions.vein.body });
  for (const c of clumps) colliders.addCircle({ x: c.x, z: c.z, r: C.body });
  for (const p of plants) {
    if (walkable.distance(p.x, p.z) > 2) continue;
    const r = TRUNK_RADIUS[p.kind];
    if (r) colliders.addCircle({ x: p.x, z: p.z, r: r * p.scale });
  }

  // A new character starts at the crossroads, looking at Hale.
  const [sx, sz] = START;
  const spawn = { x: sx, z: sz, yaw: Math.atan2(-(HALE.x - sx), -(HALE.z - sz)) };
  const south = main.line[main.line.findIndex(([, z]) => z < 70)];

  const at = (kind: StructureKind) => structures.find((st) => st.kind === kind)!;
  const interiors = [planInn(at('inn')), planHouse(houseSite)];
  // After a death outside the mine you wake by the inn's hearth, inside with the door shut;
  // inside the mine, on the rail bed outside its mouth.
  const respawns = { village: { ...interiors[0].respawn!, interior: interiors[0].id }, mine: mineRespawn(mouth) };
  const stash = placeStash(at('inn'));
  const hale = { ...HALE, yaw: facing(HALE.x, HALE.z, 0, 0) };
  const villagers = placeVillagers(at('inn'), at('smithy'), houseSite);
  const clearing = (id: string) => {
    const { x, z, r } = CLEARINGS.find((c) => c.id === id)!;
    return { x, z, r };
  };
  const places: Record<Place, QuestPlace> = {
    farm: { ...clearing('farm'), clearing: clearing('farm') },
    lumberCamp: { ...clearing('camp'), clearing: clearing('camp') },
    mine: { x: mouth.x, z: mouth.z, clearing: clearing('mineFront') },
    ...trainerPlaces(at('smithy'), houseSite),
  };
  const camps: CampPlan[] = CAMPS.map((c) => {
    const clearing = CLEARINGS.find((cl) => cl.id === c.clearing)!;
    return {
      id: c.id,
      place: { x: clearing.x, z: clearing.z, r: clearing.r },
      level: c.level,
      posts: c.posts.map(({ face, ...p }) => ({ ...p, yaw: facing(p.x, p.z, face[0], face[1]) })),
    };
  });
  const lumber = camps.find((c) => c.id === 'lumberCamp')!;
  const road = paths
    .find((p) => p.id === PATROL.path)!
    .line.filter(([x, z]) => nearestOnPolyline(main.line, x, z).d >= PATROL.clearMain && lumber.posts.every((p) => Math.hypot(p.x - x, p.z - z) >= PATROL.clearCamp))
    .map(([x, z]) => ({ x, z }));
  const walk = new PatrolWalk(road, PATROL.count);
  const [a, b] = [road[0], road[road.length - 1]];
  camps.push({
    id: 'patrol',
    // A circle round its road, for anything asking where a camp is (its refill goes by the road itself).
    place: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, r: Math.hypot(b.x - a.x, b.z - a.z) / 2 },
    level: PATROL.level,
    posts: Array.from({ length: PATROL.count }, (_, i) => ({ behaviour: 'grunt', family: 'bandit', ...walk.spot(i) }) as const),
    road,
  });
  // The mine's undead, the last camp, down the mine.
  camps.push(mineCamp(mouth));
  const tent = at('tent');
  const [ox, oz] = localToWorld(tent, TENT.orders.x, TENT.orders.z);
  const pickups: Pickup[] = [{ item: 'orders', x: ox, y: tent.y + TENT.crates.top, z: oz, yaw: tent.yaw }];
  const sounds = placeSounds(structures, bridge, dock, interiors, mouth);
  const smoke = placeSmoke(structures);
  const trees: Tree[] = plants
    .filter((p) => TREE_HEIGHT[p.kind] && Math.abs(p.x) <= play && Math.abs(p.z) <= play)
    .map((p) => ({ x: p.x, y: p.y, z: p.z, height: TREE_HEIGHT[p.kind]! * p.scale }));
  const landmarks = [
    { label: 'Southern road', x: south[0], z: south[1] },
    { label: 'Inn', x: at('inn').x, z: at('inn').z },
    { label: 'Stone bridge', x: bridge.x, z: bridge.z },
    { label: 'Farm', x: FARM[0], z: FARM[1] },
    { label: 'Pond', x: dock.x, z: dock.z },
    { label: 'Standing stones', x: stones.x, z: stones.z },
    { label: 'Lumber camp', x: -48, z: -42 },
    { label: 'Watchtower', x: at('tower').x, z: at('tower').z },
    { label: 'Old mine', x: -14, z: -74 },
  ];

  // The main road runs on over the crest: where it crosses, and which way.
  const [[rx, rz], [nx, nz]] = main.line;
  const len = Math.hypot(rx - nx, rz - nz);
  const crest: Seam = {
    ...CREST,
    step: cell,
    heights: Array.from({ length: Math.round((CREST.maxX - CREST.minX) / cell) + 1 }, (_, k) => ground.at(CREST.minX + k * cell, CREST.z)),
    roads: [{ x: rx, width: main.width, dir: [(rx - nx) / len, (rz - nz) / len] }],
  };

  return {
    walkable,
    slide,
    atmosphere: OAKVALE_ATMOSPHERE,
    seams: [crest],
    ground,
    paths,
    stream: { line: streamLine, half: STREAM_HALF },
    clearings: CLEARINGS,
    structures,
    fields: FIELDS,
    fences,
    plants,
    bridge,
    dock,
    colliders,
    roadDistance,
    spawn,
    respawns,
    stash,
    interiors,
    mine: planMine(mouth),
    hale,
    places,
    smoke,
    villagers,
    camps,
    pickups,
    chests,
    spots: [...veins, ...mineVeins(mouth), ...clumps, ...mineClumps(mouth)],
    sounds,
    trees,
    landmarks,
    heightAt,
  };
}

/** Oakvale's chests: on the watchtower's hilltop, in the leader's tent (CHESTS), and the bandits' strongbox in the mine's dig. */
function placeChests(tower: Structure, tent: Structure, mouth: ReturnType<typeof mouthOf>, heightAt: (x: number, z: number) => number): ChestPlan[] {
  /** A wooden chest out of doors at (x, z) facing `yaw`, with its contents coming out at `drop` in its frame. */
  const chest = (c: { id: string; level: number; drop: { x: number; z: number } }, x: number, z: number, yaw: number): ChestPlan => {
    const [dx, dz] = localToWorld({ x, z, yaw }, c.drop.x, c.drop.z);
    return { id: c.id, level: c.level, look: 'chest', x, y: heightAt(x, z), z, yaw, interior: null, drop: { x: dx, y: heightAt(dx, dz), z: dz } };
  };
  const { watchtower: w, tent: t } = CHESTS;
  const [hx, hz] = localToWorld(tower, w.r * Math.sin(w.a), w.r * Math.cos(w.a));
  const [tx, tz] = localToWorld(tent, t.x, TENT.hd - 0.02 - CONFIG.chests.looks.chest.d / 2);
  return [chest(w, hx, hz, facing(tower.x, tower.z, hx, hz)), { ...chest(t, tx, tz, tent.yaw), y: tent.y }, mineChest(mouth)];
}

/**
 * Where each place's sound comes from: the water under the bridge's middle,
 * the pond's water off the dock's end, the windmill's sails' hub, the smithy's
 * forge and anvil, the inn's hearth (its first flame), the lumber camp's fire
 * and just inside the mine's mouth.
 */
function placeSounds(structures: Structure[], bridge: Deck, dock: Deck, interiors: InteriorPlan[], mouth: { x: number; z: number; yaw: number; y: number }): PlaceSound[] {
  const at = (kind: StructureKind) => structures.find((st) => st.kind === kind)!;
  const on = (s: { x: number; z: number; yaw: number }, lx: number, lz: number) => localToWorld(s, lx, lz);
  const mill = at('windmill');
  const smithy = at('smithy');
  const fire = at('campfire');
  const inn = interiors.find((i) => i.id === 'inn')!;
  const hearth = inn.flames[0];
  const [hx, hz] = on(mill, 0, 2.1);
  const [fx, fz] = on(smithy, SMITHY.forge.x, SMITHY.forge.z);
  const [ax, az] = on(smithy, SMITHY.anvil.x, SMITHY.anvil.z);
  const [dx, dz] = on(dock, 0, dock.hd + 0.8);
  const [mx, mz] = on(mouth, 0, -1.5);
  return [
    { id: 'stream', x: bridge.x, y: FOREST.water, z: bridge.z, interior: null },
    { id: 'dock', x: dx, y: FOREST.water, z: dz, interior: null },
    { id: 'windmill', x: hx, y: mill.y + 7.4, z: hz, interior: null },
    { id: 'forge', x: fx, y: smithy.y + 1, z: fz, interior: null },
    { id: 'anvil', x: ax, y: smithy.y + 0.8, z: az, interior: null },
    { id: 'hearth', x: hearth.x, y: hearth.y, z: hearth.z, interior: 'inn' },
    { id: 'campfire', x: fire.x, y: fire.y + 0.3, z: fire.z, interior: null },
    { id: 'mineMouth', x: mx, y: mouth.y + 1.5, z: mz, interior: null },
  ];
}

/**
 * Where smoke rises: the inn's two chimneys, the house by the well's and the
 * plain cottage's (the thatched one has none), the smithy's forge's flue and
 * the lumber camp's fire. Not the farmhouse, whose farmer is at the well.
 */
function placeSmoke(structures: Structure[]): Plume[] {
  const plumes: Plume[] = [];
  const add = (s: Structure, lx: number, lz: number, y: number, fire = false) => {
    const [x, z] = localToWorld(s, lx, lz);
    plumes.push({ x, y: s.y + y, z, fire });
  };
  for (const s of structures) {
    if (s.kind === 'inn') for (const c of INN.chimneys) add(s, c.x, c.z, c.top);
    if (s.kind === 'house' && s.variant === 0) add(s, HOUSE.chimney.x, HOUSE.hearth.z, HOUSE.eaves + HOUSE.chimney.rise);
    if (s.kind === 'house' && s.variant === 2) add(s, s.hw - COTTAGE_CHIMNEY.inset, COTTAGE_CHIMNEY.z, HOUSE.eaves + COTTAGE_CHIMNEY.rise);
    if (s.kind === 'smithy') add(s, SMITHY.forge.x, SMITHY.forge.z, SMITHY.flue);
    if (s.kind === 'campfire') add(s, 0, 0, 0.6, true);
  }
  return plumes;
}

/** The stash's chest against the inn's right wall, its front facing into the room (−X in the inn's frame). */
function placeStash(inn: Structure): StashSpot {
  const { room, floor, stash } = INN;
  const [x, z] = localToWorld(inn, room.hw - stash.depth / 2, stash.z);
  return { x, z, y: inn.y + floor, yaw: inn.yaw - Math.PI / 2, interior: 'inn' };
}

/**
 * Where the trainers' intro quests send you: the two copper veins by the
 * smithy, the smith's anvil, the farm's three clumps of Hearthleaf round its
 * fields, and the alchemy bench in the house by the well. Each place's
 * clearing is where the quest arrow hides, since you're there.
 */
function trainerPlaces(smithy: Structure, house: Structure): Record<'veins' | 'anvil' | 'fields' | 'bench', QuestPlace> {
  const round = (points: readonly { readonly x: number; readonly z: number }[], pad: number): QuestPlace => {
    const x = points.reduce((a, p) => a + p.x, 0) / points.length;
    const z = points.reduce((a, p) => a + p.z, 0) / points.length;
    const r = Math.max(...points.map((p) => Math.hypot(p.x - x, p.z - z))) + pad;
    return { x, z, clearing: { x, z, r } };
  };
  const [ax, az] = localToWorld(smithy, SMITHY.anvil.x, SMITHY.anvil.z);
  return {
    veins: round(VEINS.outdoors.filter((v) => v.id.startsWith('smithy-')), 4),
    anvil: round([{ x: ax, z: az }], 3),
    fields: round(HERBS.hearthleaf.filter((h) => h.id.startsWith('farm-')), 3),
    bench: round([{ x: house.x, z: house.z }], Math.hypot(HOUSE.hw, HOUSE.hd) + 1),
  };
}

/**
 * The villagers at work, each facing their work: the innkeeper behind the
 * bar, facing the room; the smith at the anvil, facing it and the smithy's
 * open front, the bellows round behind them on their right; the farmer by the well,
 * facing the farm; and the herbalist at the alchemy bench's end in the house
 * by the well, turned to the room.
 */
function placeVillagers(inn: Structure, smithy: Structure, house: Structure): VillagerSpot[] {
  const [kx, kz] = localToWorld(inn, INN.keeper.x, INN.keeper.z);
  const { smith, bellows } = SMITHY;
  const [sx, sz] = localToWorld(smithy, smith.x, smith.z);
  // Round to the bellows' handle, a little short of it, so it's before their right hand, which pumps it,
  // and the fire beyond before their left, whose tongs hold the piece in it.
  const handle = Math.atan2(bellows.handle.x - smith.x, bellows.handle.z - smith.z);
  const [fx, fz] = FARMER;
  const { herbalist } = HOUSE.bench;
  const [hx, hz] = localToWorld(house, herbalist.x, herbalist.z);
  return [
    { id: 'innkeeper', x: kx, z: kz, yaw: inn.yaw, interior: 'inn', turn: 0 },
    { id: 'smith', x: sx, z: sz, yaw: smithy.yaw, interior: null, turn: handle + 0.35 },
    { id: 'farmer', x: fx, z: fz, yaw: facing(fx, fz, FARM[0], FARM[1]), interior: null, turn: 0 },
    { id: 'herbalist', x: hx, z: hz, yaw: house.yaw + herbalist.yaw, interior: 'house', turn: 0 },
  ];
}

/**
 * The pass's corridor, as areas of the walkable shape: `PASS.half` m either
 * side of the main road (`line`, from the crest north) from inside the play
 * square to the crest, and on over it by CONFIG.world.ground.seam, where
 * Brackenmoor's own walkable area overlaps it. Overlapping quads, since the
 * road bends; the last runs straight at the crest's width, as Brackenmoor's
 * first does.
 */
function passCorridor(line: readonly P2[]): P2[][] {
  const { half } = PASS;
  const over = CREST.z + CONFIG.world.ground.seam;
  const xAt = (z: number) => {
    for (let i = 0; i < line.length - 1; i++) {
      const [x0, z0] = line[i];
      const [x1, z1] = line[i + 1];
      if (z <= z0 && z >= z1) return x0 + ((x1 - x0) * (z0 - z)) / (z0 - z1 || 1);
    }
    return line[0][0];
  };
  const quad = (za: number, zb: number, xa = xAt(za), xb = xAt(zb)): P2[] => [
    [xa - half, za],
    [xa + half, za],
    [xb + half, zb],
    [xb - half, zb],
  ];
  const stations = [FOREST.play - 6, 100, 116, 130, CREST.z - 4];
  const areas = stations.slice(1).map((zb, k) => quad(stations[k] - (k ? 2 : 0), zb + 2));
  areas.push(quad(CREST.z - 6, over, xAt(CREST.z), xAt(CREST.z)));
  return areas;
}

/**
 * Rocks and pines along the pass's corridor, just outside its edges, so the
 * limit reads. Their own random stream, so nothing else in Oakvale moves.
 */
function passEdges(ground: HeightField, line: readonly P2[]): Plant[] {
  const rand = mulberry32(8841);
  const { half, every, out } = PASS;
  const plants: Plant[] = [];
  const road = line.filter(([, z]) => z > FOREST.play + 3 && z < CREST.z - 1);
  // The first pair right by the crest.
  let walked: number = every;
  for (let i = 1; i < road.length; i++) {
    const [x0, z0] = road[i - 1];
    const [x1, z1] = road[i];
    const len = Math.hypot(x1 - x0, z1 - z0) || 1;
    walked += len;
    if (walked < every) continue;
    walked = 0;
    for (const side of [-1, 1]) {
      const off = half + out[0] + rand() * (out[1] - out[0]);
      const x = x1 + (-(z1 - z0) / len) * off * side;
      const z = Math.min(CREST.z - 0.5, z1 + ((x1 - x0) / len) * off * side);
      const pine = rand() < 0.6;
      plants.push({
        kind: pine ? 'pine' : 'rock',
        x,
        y: ground.at(x, z),
        z,
        yaw: rand() * Math.PI * 2,
        scale: pine ? 0.8 + rand() * 0.4 : 0.8 + rand() * 1.0,
        seed: Math.floor(rand() * 1e6),
      });
    }
  }
  return plants;
}

/** How far (x, z) is from the Old North Pass's floor line, and how far along it. */
function northPassAt(x: number, z: number): { d: number; s: number } {
  const { line } = NORTH_PASS;
  const near = nearestOnPolyline(line, x, z);
  let s = 0;
  for (let i = 0; i < near.i; i++) s += Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]);
  const [a, b] = [line[near.i], line[near.i + 1]];
  s += Math.hypot(b[0] - a[0], b[1] - a[1]) * near.t;
  return { d: near.d, s };
}

/** The Old North Pass's floor line's length. */
const NORTH_PASS_LENGTH = NORTH_PASS.line.reduce((sum, p, i, l) => (i ? sum + Math.hypot(p[0] - l[i - 1][0], p[1] - l[i - 1][1]) : 0), 0);

/**
 * How much of the Old North Pass's scar shows at (x, z), 0 to 1: the bare
 * grey rubble the slide left in the cut and up its sides.
 */
export function northPassScar(x: number, z: number): number {
  if (z > -FOREST.play + 4) return 0;
  const { d, s } = northPassAt(x, z);
  const { half, slide } = NORTH_PASS;
  return smoothstep(half + 9, half + 2, d) * smoothstep(slide.from - 8, slide.from, s) * smoothstep(slide.to + 18, slide.to, s) * smoothstep(-FOREST.play + 4, -FOREST.play - 2, z);
}

/** Is (x, z) in the Old North Pass's cut (past the play area's edge), `margin` m over its floor's sides? */
function inNorthPass(x: number, z: number, margin: number): boolean {
  if (z > -FOREST.play) return false;
  return northPassAt(x, z).d < NORTH_PASS.half + margin;
}

/** The old cart road up to the Old North Pass, laid over the ground as the other roads are, its heights smoothed. */
function northPassRoad(ground: HeightField): Path {
  const line = sampleCurve(NORTH_PASS.road as unknown as P2[], 1);
  let heights = line.map(([x, z]) => ground.at(x, z));
  for (let pass = 0; pass < 4; pass++) heights = smooth(heights, 5);
  const path = { id: 'northPass', width: 2.2, line, heights };
  flattenAlong(ground, path);
  return path;
}

/**
 * The Old North Pass's set pieces: the rockslide, from its toe up the cut;
 * the cairn by the cart road below it, and the waymark stuck in the cairn.
 */
function northPassPieces(ground: HeightField): Structure[] {
  const [toeX, toeZ] = NORTH_PASS.line[1];
  const [footX, footZ] = NORTH_PASS.line[0];
  const { x, z } = NORTH_PASS.cairn;
  const y = ground.at(x, z);
  return [
    { kind: 'rockslide', x: toeX, z: toeZ, y: ground.at(toeX, toeZ), yaw: Math.atan2(toeX - footX, toeZ - footZ), hw: NORTH_PASS.half + 4, hd: 20, solid: false, variant: 0 },
    { kind: 'cairn', x, z, y, yaw: 0.7, hw: 0.75, hd: 0.75, solid: false, variant: 0 },
    { kind: 'signpost', x, z, y, yaw: 0, hw: 0.2, hd: 0.2, solid: false, variant: 2 },
  ];
}

/**
 * Cut the Old North Pass into the northern ridge: a floor rising from its
 * foot to the land's edge, its sides sloping up to the ridge either side.
 * Only past the play area's edge, and only ever lower.
 */
function cutNorthPass(ground: HeightField): void {
  const { half, side, floor } = NORTH_PASS;
  ground.each((x, z, k) => {
    const weight = smoothstep(-FOREST.play + 2, -FOREST.play - 4, z);
    if (weight <= 0) return;
    const { d, s } = northPassAt(x, z);
    if (d > half + 40) return;
    const t = Math.min(1, s / NORTH_PASS_LENGTH);
    const bed = lerp(floor[0], floor[1], t * t * 0.4 + t * 0.6) + (valueNoise(x * 0.3, z * 0.3, 61) - 0.5) * 0.8;
    const cut = bed + Math.max(0, d - half) * side;
    // Its shoulders stand up either side, so it reads as a notch in the ridge, not a valley.
    const shoulders = ground.data[k] + 9 * smoothstep(half + 28, half + 7, d);
    ground.data[k] = lerp(ground.data[k], Math.min(shoulders, cut), weight);
  });
}

/** One boulder of the Old North Pass's rockslide: where it lies, its size, and how it's turned and squashed. */
export interface Boulder {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly r: number;
  readonly yaw: number;
  readonly tilt: number;
  readonly squash: number;
  readonly shade: number;
}

/**
 * The rockslide in the Old North Pass: big, angular boulders heaped across
 * the cut, freshly broken grey, scree spilling down to its foot and over the
 * end of the cart road. Their own random stream, so nothing else in Oakvale
 * moves.
 */
function northPassSlide(ground: HeightField): Boulder[] {
  const rand = mulberry32(5521);
  const { line, half, slide } = NORTH_PASS;
  const out: Boulder[] = [];
  const at = (s: number): [number, number, number, number] => {
    // The point `s` m along the floor line, and the way across it.
    let left = s;
    for (let i = 0; i < line.length - 1; i++) {
      const [a, b] = [line[i], line[i + 1]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (left <= len || i === line.length - 2) {
        const t = Math.min(1, left / len);
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, -(b[1] - a[1]) / len, (b[0] - a[0]) / len];
      }
      left -= len;
    }
    return [line[0][0], line[0][1], 1, 0];
  };
  const rock = (s: number, across: number, r: number, heap: number) => {
    const [cx, cz, ax, az] = at(s);
    const x = cx + ax * across;
    const z = cz + az * across;
    // Heaped up in the middle of the slide, lower at its edges; each a little sunk.
    const y = ground.at(x, z) + heap - r * 0.3;
    out.push({ x, y, z, r, yaw: rand() * Math.PI * 2, tilt: (rand() - 0.5) * 0.8, squash: 0.6 + rand() * 0.35, shade: rand() });
  };
  for (let i = 0; i < slide.boulders; i++) {
    const t = rand();
    const across = (rand() - 0.5) * 2 * (half + 3);
    // The heap is highest a third of the way up, and in the cut's middle.
    const heap = 4 * Math.sin(Math.PI * Math.min(1, t * 1.4)) * (1 - Math.abs(across) / (half + 4));
    rock(lerp(slide.from, slide.to, t), across, 1.3 + rand() * 1.7, Math.max(0, heap));
  }
  for (let i = 0; i < slide.scree; i++) rock(rand() * slide.from, (rand() - 0.5) * 2 * (half + 1), 0.3 + rand() * 0.55, 0);
  return out;
}

/** `line` (running north) from where it first reaches `z`, starting exactly on that line. */
function upTo(line: P2[], z: number): P2[] {
  const k = line.findIndex(([, lz]) => lz <= z);
  if (k <= 0) return line;
  const [ax, az] = line[k - 1];
  const [bx, bz] = line[k];
  const t = (az - z) / (az - bz);
  const cut: P2 = [ax + (bx - ax) * t, z];
  // Drop a sample that would sit a hair past the cut.
  return Math.hypot(bx - cut[0], bz - cut[1]) < 0.3 ? [cut, ...line.slice(k + 1)] : [cut, ...line.slice(k)];
}

/**
 * A road's heights eased so no stretch between its start and sample `to` is
 * steeper than `grade`, its ends held: smoothed over that stretch until it holds.
 */
function easeGrade(line: readonly P2[], heights: number[], to: number, grade: number): number[] {
  const h = heights.slice();
  const steepest = () => {
    let most = 0;
    for (let i = 0; i < to; i++) most = Math.max(most, Math.abs(h[i + 1] - h[i]) / (Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]) || 1));
    return most;
  };
  for (let round = 0; round < 5000 && steepest() > grade; round++) {
    const was = h.slice();
    for (let i = 1; i < to; i++) h[i] = (was[i - 1] + was[i] + was[i + 1]) / 3;
  }
  return h;
}

// ------------------------------------------------------------------ helpers

function smoothMax(a: number, b: number, k: number): number {
  return 0.5 * (a + b + Math.sqrt((a - b) ** 2 + k * k));
}

function smooth(values: number[], radius: number): number[] {
  return values.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let k = Math.max(0, i - radius); k <= Math.min(values.length - 1, i + radius); k++) {
      sum += values[k];
      n++;
    }
    return sum / n;
  });
}

function flattenAlong(ground: HeightField, path: Path): void {
  const reach = path.width / 2 + 3.5;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of path.line) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  ground.each((x, z, k) => {
    if (x < minX - reach || x > maxX + reach || z < minZ - reach || z > maxZ + reach) return;
    const { d, i, t } = nearestOnPolyline(path.line, x, z);
    if (d > reach) return;
    const target = lerp(path.heights[i], path.heights[Math.min(i + 1, path.heights.length - 1)], t);
    ground.data[k] = lerp(ground.data[k], target, smoothstep(reach, path.width / 2 + 1.2, d));
  });
}

/**
 * Level the ground to `y` over a rectangle in `o`'s own frame (x from `x0` to `x1`,
 * z from `z0` to `z1`), easing back to the terrain over `ease` metres outside it.
 */
function levelRect(
  ground: HeightField,
  o: { x: number; z: number; yaw: number },
  y: number,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  ease: number,
): void {
  ground.each((x, z, k) => {
    const [lx, lz] = worldToLocal(o, x, z);
    const d = Math.hypot(Math.max(x0 - lx, 0, lx - x1), Math.max(z0 - lz, 0, lz - z1));
    if (d < ease) ground.data[k] = lerp(ground.data[k], y, smoothstep(ease, 0, d));
  });
}

/** The pond's shoreline radius in the direction of (x, z): a wobbly circle. */
export function pondRadius(x: number, z: number): number {
  const a = Math.atan2(z - POND.z, x - POND.x);
  return POND.r * (0.88 + 0.24 * valueNoise(Math.cos(a) * 1.6 + 5, Math.sin(a) * 1.6 + 5, 21));
}

export function worldToLocal(o: { x: number; z: number; yaw: number }, x: number, z: number): [number, number] {
  const dx = x - o.x;
  const dz = z - o.z;
  const c = Math.cos(o.yaw);
  const s = Math.sin(o.yaw);
  return [dx * c - dz * s, dx * s + dz * c];
}

export function localToWorld(o: { x: number; z: number; yaw: number }, lx: number, lz: number): [number, number] {
  const c = Math.cos(o.yaw);
  const s = Math.sin(o.yaw);
  return [o.x + lx * c + lz * s, o.z - lx * s + lz * c];
}

/** The ring of standing stones, as floor points. */
export function standingStones(s: { x: number; z: number }): P2[] {
  return Array.from({ length: 7 }, (_, i) => {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    return [s.x + Math.cos(a) * 5, s.z + Math.sin(a) * 5] as P2;
  });
}

/** Fences: around each field (with a gap facing the farmyard) and the village gardens. */
function buildFences(structures: Structure[]): P2[][] {
  const out: P2[][] = [];
  for (const f of FIELDS) {
    const m = 1.2;
    const corners: [number, number][] = [
      [-f.hw - m, -f.hd - m],
      [f.hw + m, -f.hd - m],
      [f.hw + m, f.hd + m],
      [-f.hw - m, f.hd + m],
    ];
    const w = corners.map(([lx, lz]) => localToWorld(f, lx, lz));
    // Leave a gate on the north side, towards the yard.
    const gateL = localToWorld(f, -1.2, -f.hd - m);
    const gateR = localToWorld(f, 1.2, -f.hd - m);
    out.push([gateR, w[1], w[2], w[3], w[0], gateL]);
  }
  // A garden fence behind two of the cottages.
  for (const s of structures.filter((st) => st.kind === 'house' && st.variant < 2)) {
    const pts: [number, number][] = [
      [-s.hw - 0.5, -s.hd],
      [-s.hw - 0.5, -s.hd - 4],
      [s.hw + 0.5, -s.hd - 4],
      [s.hw + 0.5, -s.hd],
    ];
    out.push(pts.map(([lx, lz]) => localToWorld(s, lx, lz)));
  }
  return out;
}

/** How tall each kind of tree stands, to its crown's top (scaled by the plant's scale): birds perch in it. */
const TREE_HEIGHT: Partial<Record<PlantKind, number>> = {
  oak: 5.5,
  goldOak: 5.5,
  pine: 7,
  young: 3,
};

/** Trunk radius for things you can't walk through (scaled by the plant's scale). */
const TRUNK_RADIUS: Partial<Record<PlantKind, number>> = {
  oak: 0.42,
  goldOak: 0.42,
  pine: 0.32,
  young: 0.18,
  rock: 0.7,
  stump: 0.42,
};

function placePlants(ground: HeightField, roads: DistanceField, streamField: DistanceField, structures: Structure[], built: Colliders): Plant[] {
  const { play, water } = FOREST;
  const stream = sampleCurve(STREAM, 2);
  const rand = mulberry32(1234);
  const plants: Plant[] = [];
  const pathDist = (x: number, z: number, margin: number) => roads.at(x, z) < margin;
  const inFootprint = (x: number, z: number, margin: number) =>
    structures.some((s) => {
      const [lx, lz] = worldToLocal(s, x, z);
      return Math.abs(lx) < s.hw + margin && Math.abs(lz) < s.hd + margin;
    }) ||
    FIELDS.some((f) => {
      const [lx, lz] = worldToLocal(f, x, z);
      return Math.abs(lx) < f.hw + margin + 1.2 && Math.abs(lz) < f.hd + margin + 1.2;
    });
  const inClearing = (x: number, z: number, scale = 1) =>
    CLEARINGS.some((c) => Math.hypot(x - c.x, z - c.z) < c.treeFree * scale);
  const streamDist = (x: number, z: number) => streamField.at(x, z);
  const pondDist = (x: number, z: number) => Math.hypot(x - POND.x, z - POND.z) - pondRadius(x, z);
  const woods = (x: number, z: number) => {
    const r = Math.sqrt(Math.sqrt(x ** 4 + z ** 4));
    const patch = 0.12 + 0.8 * smoothstep(0.44, 0.58, fbm(x * 0.025 + 3, z * 0.025 - 7, 5));
    return Math.max(patch, 0.95 * smoothstep(60, 80, r));
  };
  const add = (kind: PlantKind, x: number, z: number, scale: number, y = ground.at(x, z)) =>
    plants.push({ kind, x, y, z, yaw: rand() * Math.PI * 2, scale, seed: Math.floor(rand() * 1e6) });

  // Trees on a jittered grid, thinned by how wooded each spot is.
  const step = 4;
  for (let gz = -118; gz <= 118; gz += step) {
    for (let gx = -118; gx <= 118; gx += step) {
      const x = gx + (rand() - 0.5) * step * 0.9;
      const z = gz + (rand() - 0.5) * step * 0.9;
      const roll = rand();
      const beyond = Math.abs(x) > play + 4 || Math.abs(z) > play + 4;
      if (roll > woods(x, z) * (beyond ? 0.7 : 1)) continue;
      const h = ground.at(x, z);
      if (h < water + 0.3) continue;
      // Nothing grows out of a cliff.
      const grade = Math.hypot(ground.at(x + 1, z) - ground.at(x - 1, z), ground.at(x, z + 1) - ground.at(x, z - 1)) / 2;
      if (grade > (beyond ? 1.3 : 0.9)) continue;
      if (pathDist(x, z, 1.6) || streamDist(x, z) < STREAM_HALF + 1.4 || pondDist(x, z) < 2) continue;
      if (inClearing(x, z) || inFootprint(x, z, 2.2)) continue;
      const north = smoothstep(-20, -50, z);
      const outer = smoothstep(70, 90, Math.max(Math.abs(x), Math.abs(z)));
      const pick = rand();
      const pinePart = 0.2 + 0.5 * Math.max(north, outer);
      const kind: PlantKind =
        pick < pinePart ? 'pine' : pick < pinePart + 0.08 ? 'goldOak' : pick < pinePart + 0.15 ? 'young' : 'oak';
      add(kind, x, z, 0.8 + rand() * 0.45, h);
    }
  }

  const treeCells = new Map<number, Plant[]>();
  const cellOf = (x: number, z: number) => Math.floor(x / 4) * 1000 + Math.floor(z / 4);
  for (const t of plants) {
    const k = cellOf(t.x, t.z);
    treeCells.set(k, [...(treeCells.get(k) ?? []), t]);
  }
  const trees = plants.slice();
  const nearTree = (x: number, z: number, r: number) => {
    for (const dx of [-4, 0, 4]) {
      for (const dz of [-4, 0, 4]) {
        for (const t of treeCells.get(cellOf(x + dx, z + dz)) ?? []) if ((t.x - x) ** 2 + (t.z - z) ** 2 < r * r) return true;
      }
    }
    return false;
  };
  const open = (x: number, z: number, margin: number) =>
    !pathDist(x, z, margin) &&
    streamDist(x, z) > STREAM_HALF + 0.6 &&
    pondDist(x, z) > 0.8 &&
    !inFootprint(x, z, margin) &&
    !built.blocked(x, z, margin) &&
    !nearTree(x, z, 0.9);
  const scatter = (spacing: number, extent: number, fn: (x: number, z: number) => void) => {
    for (let gz = -extent; gz <= extent; gz += spacing) {
      for (let gx = -extent; gx <= extent; gx += spacing) fn(gx + (rand() - 0.5) * spacing, gz + (rand() - 0.5) * spacing);
    }
  };

  // Rocks, more of them on slopes and in the mountains.
  scatter(9, 116, (x, z) => {
    const slope = Math.abs(ground.at(x + 1, z) - ground.at(x - 1, z)) + Math.abs(ground.at(x, z + 1) - ground.at(x, z - 1));
    if (rand() > 0.1 + 0.35 * Math.min(1, slope)) return;
    if (!open(x, z, 0.8)) return;
    add('rock', x, z, 0.5 + rand() * (Math.abs(x) > play || Math.abs(z) > play ? 2.2 : 1.1));
  });
  // Bushes along the woods' edges.
  scatter(5, play, (x, z) => {
    const w = woods(x, z);
    if (rand() > 0.35 * (1 - Math.abs(w - 0.45) * 1.6)) return;
    if (!open(x, z, 0.8) || inClearing(x, z, 0.8)) return;
    add('bush', x, z, 0.7 + rand() * 0.6);
  });
  // Grass tufts and flower patches in the open.
  scatter(2.2, play, (x, z) => {
    if (rand() > 0.55 * (1.1 - woods(x, z))) return;
    if (!open(x, z, 0.3) || ground.at(x, z) < water + 0.25) return;
    add('grass', x, z, 0.7 + rand() * 0.7);
  });
  scatter(2.6, play, (x, z) => {
    if (valueNoise(x * 0.09, z * 0.09, 31) < 0.6 || rand() > 0.6 * (1.1 - woods(x, z))) return;
    if (!open(x, z, 0.4) || ground.at(x, z) < water + 0.3) return;
    add('flower', x, z, 0.8 + rand() * 0.5);
  });
  // Mushrooms and fallen logs in the woods.
  for (const t of trees) {
    if (Math.abs(t.x) > play || Math.abs(t.z) > play || t.kind === 'pine') continue;
    const r = rand();
    if (r < 0.05) {
      const a = rand() * Math.PI * 2;
      add('mushroom', t.x + Math.cos(a) * 1.1, t.z + Math.sin(a) * 1.1, 0.8 + rand() * 0.6);
    } else if (r < 0.075) {
      const a = rand() * Math.PI * 2;
      const x = t.x + Math.cos(a) * 3;
      const z = t.z + Math.sin(a) * 3;
      if (open(x, z, 2.2)) add('log', x, z, 0.8 + rand() * 0.4);
    }
  }
  // Stumps round the lumber camp, and a few loose in the woods.
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2;
    const d = 6 + rand() * 6;
    const x = -48 + Math.cos(a) * d;
    const z = -42 + Math.sin(a) * d;
    if (open(x, z, 0.8)) add('stump', x, z, 0.8 + rand() * 0.5);
  }
  // Reeds on the pond's shore and the stream's banks; lily pads on the pond.
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    const r = pondRadius(POND.x + Math.cos(a), POND.z + Math.sin(a)) - 0.8 + rand() * 1.6;
    const x = POND.x + Math.cos(a) * r;
    const z = POND.z + Math.sin(a) * r;
    if (!built.blocked(x, z, 0.3) && !inFootprint(x, z, 0.4)) add('reed', x, z, 0.8 + rand() * 0.5);
  }
  for (let i = 0; i < stream.length; i += 3) {
    if (rand() > 0.45) continue;
    const [x0, z0] = stream[i];
    const [x1, z1] = stream[Math.min(i + 1, stream.length - 1)];
    const len = Math.hypot(x1 - x0, z1 - z0) || 1;
    const side = rand() < 0.5 ? -1 : 1;
    const off = STREAM_HALF + (rand() - 0.3) * 1.2;
    const x = x0 + ((z1 - z0) / len) * off * side;
    const z = z0 - ((x1 - x0) / len) * off * side;
    if (Math.abs(x) < play && Math.abs(z) < play && !pathDist(x, z, 2)) add('reed', x, z, 0.8 + rand() * 0.4);
  }
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * (POND.r - 3.5);
    const x = POND.x + Math.cos(a) * r;
    const z = POND.z + Math.sin(a) * r;
    if (!inFootprint(x, z, 0.5)) add('lily', x, z, 0.7 + rand() * 0.6, water + 0.02);
  }
  return plants;
}
