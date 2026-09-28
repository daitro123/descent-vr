import type { CampPlan, PostPlan, Spot } from '../types';
import { Colliders } from './colliders';
import { fbm, lerp, mulberry32, nearestOnPolyline, type P2, sampleCurve, smoothstep, valueNoise } from './noise';

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

// ------------------------------------------------------------------ plan

const MAIN_ROAD: P2[] = [
  [6, 150], [3, 110], [-3, 86], [-6, 66], [1, 46], [4, 28], [1, 12], [0, 0],
  [-2, -12], [-5, -22], [-6, -31], [-5, -40], [-8, -52], [-12, -64], [-14, -73],
];

const PATHS: { id: string; width: number; pts: P2[] }[] = [
  { id: 'main', width: 4, pts: MAIN_ROAD },
  { id: 'east', width: 3.4, pts: [[1, -1], [12, -2], [26, 3], [38, 12], [47, 20], [54, 26]] },
  { id: 'west', width: 2.4, pts: [[-1, 3], [-14, 5], [-26, 12], [-34, 19], [-39, 24]] },
  { id: 'tower', width: 2.2, pts: [[-5, -43], [6, -49], [18, -54], [28, -57], [35, -58]] },
  { id: 'camp', width: 2.2, pts: [[-7, -50], [-20, -47], [-32, -44], [-42, -42]] },
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

/** Where a new character starts: on the road about 3.5 m from Hale, facing them. */
const START: P2 = [0.2, 1.5];

/**
 * The camps, each at a clearing. The farm's raiders stand in two pairs: one
 * in the yard eyeing the farmhouse, a few steps past where the road comes in
 * (and clear of the hay bales, which trap anyone walking home through them),
 * and one by the windmill at the wheat field's corner. Each pair is within a
 * pull of itself and out of the other's, so you can take them a pair at a time.
 */
const CAMPS: {
  id: string;
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
];

/**
 * Where you wake after dying outside the mine: in front of the inn's door,
 * facing the crossroads, until the inn opens and its hearth takes over
 * (ticket 23). Metres out from the door along the inn's front.
 */
const INN_DOOR_STEP = 2;

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
  | 'logpile' | 'stones' | 'dock' | 'boat' | 'bridge';

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
  { kind: 'inn', x: 13, z: -15, yaw: facing(13, -15, 2, -3), hw: 5.5, hd: 4 },
  { kind: 'house', x: -13, z: -12, yaw: facing(-13, -12, -2, -3), hw: 3.5, hd: 3 },
  { kind: 'house', x: -15, z: 15, yaw: facing(-15, 15, -2, 5), hw: 3.2, hd: 2.8, variant: 1 },
  { kind: 'house', x: -24, z: -3, yaw: facing(-24, -3, -10, 3), hw: 3, hd: 2.6, variant: 2 },
  { kind: 'smithy', x: 13, z: 12, yaw: facing(13, 12, 3, 3), hw: 3.5, hd: 3 },
  { kind: 'well', x: -5.5, z: -5.5, yaw: 0.3, hw: 1, hd: 1 },
  { kind: 'signpost', x: 3.8, z: 4.4, yaw: 0, hw: 0.2, hd: 0.2 },
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
  { kind: 'haybale', x: 59, z: 30, yaw: 2.2, hw: 0.9, hd: 0.6 },
  { kind: 'trough', x: 50, z: 31, yaw: 0.6, hw: 1.1, hd: 0.45 },
  { kind: 'scarecrow', x: 58, z: 47, yaw: facing(58, 47, 56, 36), hw: 0.3, hd: 0.3 },
  // Watchtower on its hill, lumber camp, the old mine, the standing stones.
  { kind: 'tower', x: 40, z: -58, yaw: facing(40, -58, 34, -58), hw: 3.4, hd: 3.4 },
  { kind: 'tent', x: -51.5, z: -46, yaw: facing(-51.5, -46, -48, -41), hw: 1.7, hd: 1.9 },
  { kind: 'campfire', x: -48, z: -41, yaw: 0, hw: 0.6, hd: 0.6 },
  { kind: 'logpile', x: -55, z: -38, yaw: 0.35, hw: 2.1, hd: 1 },
  { kind: 'mine', x: -14, z: -80.5, yaw: 0, hw: 4.5, hd: 2.5 },
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

/** Heights on a square grid, read back exactly as the terrain mesh draws them. */
export class HeightField {
  readonly n: number;
  readonly data: Float32Array;

  constructor(
    readonly half: number,
    readonly cell: number,
  ) {
    this.n = Math.round((2 * half) / cell) + 1;
    this.data = new Float32Array(this.n * this.n);
  }

  get(i: number, j: number): number {
    return this.data[j * this.n + i];
  }

  /**
   * Height on the terrain's triangles. Each cell splits along the diagonal
   * from (i+1, j) to (i, j+1), the same as the mesh.
   */
  at(x: number, z: number): number {
    const gx = Math.min(this.n - 1.0001, Math.max(0, (x + this.half) / this.cell));
    const gz = Math.min(this.n - 1.0001, Math.max(0, (z + this.half) / this.cell));
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const fx = gx - i;
    const fz = gz - j;
    const a = this.get(i, j);
    const b = this.get(i + 1, j);
    const c = this.get(i, j + 1);
    const d = this.get(i + 1, j + 1);
    if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
    return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }

  /** Visit every vertex with its world position. */
  each(fn: (x: number, z: number, k: number) => void): void {
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) fn(-this.half + i * this.cell, -this.half + j * this.cell, j * this.n + i);
    }
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
  /** Where you wake after a death (yaw as `spawn`'s). */
  respawns: { village: Spot };
  /** Where Marshal Hale stands, facing the crossroads' centre (yaw as a model turns: 0 faces +Z). */
  hale: Spot;
  camps: CampPlan[];
  landmarks: { label: string; x: number; z: number }[];
  /** Ground height, including the bridge and dock decks. */
  heightAt(x: number, z: number): number;
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
    const line = sampleCurve(spec.pts, 1);
    let heights = line.map(([x, z]) => ground.at(x, z));
    for (let pass = 0; pass < 4; pass++) heights = smooth(heights, 5);
    heights = heights.map((h) => Math.max(h, water + 0.5));
    const path = { id: spec.id, width: spec.width, line, heights };
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
  // Level a bed for the rails out of the mouth, so they don't hang over the dip in front.
  levelRect(ground, mine, mine.y, -2.8, 2.8, mine.hd - 0.3, mine.hd + 9, 3);
  // The watchtower's hilltop is levelled to its base, so the road climbs to its door
  // instead of the door hanging over a cutting.
  const tower = structures.find((s) => s.kind === 'tower')!;
  levelRect(ground, tower, tower.y, -6.5, 6.5, -6.5, 6.5, 4);

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
  const colliders = new Colliders({ minX: -play, maxX: play, minZ: -play, maxZ: play });
  for (const s of structures) {
    if (!s.solid) continue;
    if (['well', 'windmill', 'tower', 'campfire', 'signpost', 'lamp', 'scarecrow'].includes(s.kind)) {
      colliders.addCircle({ x: s.x, z: s.z, r: Math.max(s.hw, s.hd) });
    } else colliders.addBox({ x: s.x, z: s.z, hw: s.hw, hd: s.hd, yaw: s.yaw });
  }
  const stones = structures.find((s) => s.kind === 'stones')!;
  for (const [x, z] of standingStones(stones)) colliders.addCircle({ x, z, r: 0.55 });
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

  const roadDistance = new DistanceField(half);
  for (const p of paths) roadDistance.stamp(p.line, p.width / 2 + 6, p.width / 2);
  const plants = placePlants(ground, roadDistance, streamField, structures, colliders);
  for (const p of plants) {
    if (Math.abs(p.x) > play + 2 || Math.abs(p.z) > play + 2) continue;
    const r = TRUNK_RADIUS[p.kind];
    if (r) colliders.addCircle({ x: p.x, z: p.z, r: r * p.scale });
  }

  // A new character starts at the crossroads, looking at Hale.
  const [sx, sz] = START;
  const spawn = { x: sx, z: sz, yaw: Math.atan2(-(HALE.x - sx), -(HALE.z - sz)) };
  const south = main.line[main.line.findIndex(([, z]) => z < 70)];

  const at = (kind: StructureKind) => structures.find((st) => st.kind === kind)!;
  const inn = at('inn');
  const [rx, rz] = localToWorld(inn, 0, inn.hd + INN_DOOR_STEP);
  const respawns = { village: { x: rx, z: rz, yaw: Math.atan2(rx, rz) } };
  const hale = { ...HALE, yaw: facing(HALE.x, HALE.z, 0, 0) };
  const camps: CampPlan[] = CAMPS.map((c) => {
    const clearing = CLEARINGS.find((cl) => cl.id === c.clearing)!;
    return {
      id: c.id,
      place: { x: clearing.x, z: clearing.z, r: clearing.r },
      level: c.level,
      posts: c.posts.map(({ face, ...p }) => ({ ...p, yaw: facing(p.x, p.z, face[0], face[1]) })),
    };
  });
  const landmarks = [
    { label: 'Southern road', x: south[0], z: south[1] },
    { label: 'Inn', x: at('inn').x, z: at('inn').z },
    { label: 'Stone bridge', x: bridge.x, z: bridge.z },
    { label: 'Farm', x: 54, z: 28 },
    { label: 'Pond', x: dock.x, z: dock.z },
    { label: 'Standing stones', x: stones.x, z: stones.z },
    { label: 'Lumber camp', x: -48, z: -42 },
    { label: 'Watchtower', x: at('tower').x, z: at('tower').z },
    { label: 'Old mine', x: -14, z: -74 },
  ];

  return {
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
    hale,
    camps,
    landmarks,
    heightAt,
  };
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
