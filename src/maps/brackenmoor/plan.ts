import { CONFIG } from '../../config';
import type { Tree } from '../../world/ambience';
import type { Atmosphere } from '../../world/atmosphere';
import { Colliders } from '../forest/colliders';
import { fbm, lerp, mulberry32, nearestOnPolyline, type P2, sampleCurve, smoothstep, valueNoise } from '../forest/noise';
import { HeightGrid } from '../heightGrid';
import type { Seam, Spot } from '../types';
import { Walkable } from '../walkable';
import { MOOR_LIGHT, MOOR_SKY } from './palette';

// Brackenmoor: an open moor over the crest of Oakvale's southern pass. From
// the crest the land falls into a shallow basin, bracken and heather in rust,
// olive and purple, ringed east, west and south by low, rounded hills. The
// road runs on from the crest across the moor to a gap in the south hills,
// where a rockfall closes it: the way on to a later zone. Nothing lives here.
//
// This file is the plan only: heights, the road, what stands where, what you
// bump into. No three.js meshes, so it runs in tests and in its worker. x is
// east, z is south, in world metres on the one chunk grid.

export const MOOR = {
  /** The land: 5 by 4 chunks south of the crest. */
  land: { minX: -100, maxX: 100, minZ: 140, maxZ: 300 },
  /** Height grid spacing, as Oakvale's, so the two meet vertex for vertex on the crest. */
  cell: 2,
  /** You walk within x ±`half`, from the crest to z = `south`. */
  walk: { half: 60, south: 260 },
  /** The pass carries on `corridor` m past the crest before the moor opens out, fully by `open`. */
  opening: { corridor: 22, open: 205 },
  /** The basin's floor, a few metres above Oakvale's valley, and how far it swells either way. */
  floor: 4.5,
  swell: 5,
  /** Over this first row of chunks the land blends to the crest's heights. */
  blend: 40,
  /**
   * The ring of hills, `low` to `high` m over the floor: rising from |x| =
   * `side[0]` to their tops by `side[1]` east and west, and from z = `south[0]`
   * to `south[1]`. They part `gap.half` m either side of the road's end.
   */
  hills: { low: 20, high: 35, side: [56, 96], south: [252, 296], gap: { half: 18, depth: 0.8 } },
  /** The road over the moor, the main road's width. */
  road: { width: 4 },
  /** The rockfall across the road where you can walk no farther: rocks this many m across. */
  rockfall: { count: 14, spread: 9, scale: [1.4, 3.2] },
  /** A lone pine's lean, downwind (to the north-east), as run over rise. */
  lean: 0.4,
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

/** What grows or lies on the moor. Bracken and heather are undergrowth, too small for a stand-in. */
export type MoorKind = 'bracken' | 'heather' | 'bush' | 'rock' | 'pine';

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
const TRUNK: Partial<Record<MoorKind, number>> = { pine: 0.32, rock: 0.7 };

/** How tall a pine stands, for birds to perch in (scaled by the plant's scale). */
const PINE_HEIGHT = 7;

export interface MoorPlan {
  /** Where you can walk: on from the crest's corridor, then the moor. */
  readonly walkable: Walkable;
  /** Its heights along the crest: Oakvale's own, which it meets exactly. */
  readonly seam: Seam;
  readonly ground: HeightGrid;
  /** The road's centre line, from the crest to the rockfall, about a metre between samples. */
  readonly road: { readonly line: readonly P2[]; readonly width: number };
  /** Distance to the road's edge at each ground vertex (negative on it). */
  readonly roadDistance: Float32Array;
  readonly plants: readonly MoorPlant[];
  /** The border stone by the road on the crest, and which way its face turns. */
  readonly stone: { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number; readonly h: number };
  readonly colliders: Colliders;
  /** Where `?map=brackenmoor` starts: on the road just over the crest, looking out over the moor. */
  readonly spawn: Spot;
  readonly landmarks: readonly { label: string; x: number; z: number }[];
  /** Its pines, for birds to call from. */
  readonly trees: readonly Tree[];
  heightAt(x: number, z: number): number;
}

/**
 * Plan Brackenmoor against Oakvale's `crest`: its heights there, which the
 * moor's land meets exactly, and the road crossing it, which runs on.
 */
export function planBrackenmoor(crest: Seam): MoorPlan {
  const { land, cell } = MOOR;
  if (crest.z !== land.minZ || crest.minX !== land.minX || crest.maxX !== land.maxX || crest.step !== cell) {
    throw new Error("Brackenmoor's land must meet the crest along its whole north edge, vertex for vertex");
  }
  const cols = Math.round((land.maxX - land.minX) / cell) + 1;
  const rows = Math.round((land.maxZ - land.minZ) / cell) + 1;
  const ground = new HeightGrid(land.minX, land.minZ, cols, rows, cell);
  const [crossing] = crest.roads;
  const road = planRoad(crossing);

  // 1. The moor's own lie of the land: a swelling basin ringed by hills.
  ground.each((x, z, k) => (ground.data[k] = moorHeight(x, z, road.end)));
  // 2. The road, eased into the land along a smoothed line of its heights.
  const heights = smoothed(road.line.map(([x, z]) => ground.at(x, z)));
  flattenAlong(ground, road.line, heights, road.width);
  // 3. Last, the first row of chunks blends to the crest's heights, so the
  // two zones agree exactly on the line.
  meetCrest(ground, crest.heights);

  const roadDistance = new Float32Array(ground.data.length);
  ground.each((x, z, k) => (roadDistance[k] = nearestOnPolyline(road.line, x, z).d - road.width / 2));

  const walkable = new Walkable(walkableAreas(crossing.x, road.line));
  const colliders = new Colliders(walkable);
  const heightAt = (x: number, z: number) => ground.at(x, z);

  const stoneAt: P2 = [crossing.x + crossing.width / 2 + 2.5, land.minZ + 1];
  const stone = { x: stoneAt[0], y: ground.at(...stoneAt), z: stoneAt[1], yaw: -Math.PI / 2, h: 2.9 };
  colliders.addCircle({ x: stone.x, z: stone.z, r: 0.55 });

  const plants = placePlants(ground, roadDistance, walkable, stone, road);
  for (const p of plants) {
    const r = TRUNK[p.kind];
    if (r && walkable.distance(p.x, p.z) <= 2) colliders.addCircle({ x: p.x, z: p.z, r: r * p.scale });
  }

  const at = (z: number): P2 => road.line.reduce((best, p) => (Math.abs(p[1] - z) < Math.abs(best[1] - z) ? p : best));
  const [sx, sz] = at(land.minZ + 6);
  const trees = plants.filter((p) => p.kind === 'pine').map((p) => ({ x: p.x, y: p.y, z: p.z, height: PINE_HEIGHT * p.scale }));
  return {
    walkable,
    seam: { ...crest, heights: Array.from({ length: cols }, (_, i) => ground.get(i, 0)) },
    ground,
    road: { line: road.line, width: road.width },
    roadDistance,
    plants,
    stone,
    colliders,
    spawn: { x: sx, z: sz, yaw: Math.PI },
    landmarks: [
      { label: 'The crest', x: stone.x - 2, z: stone.z },
      { label: 'The moor', x: at(205)[0] + 6, z: 205 },
      { label: 'The rockfall', x: road.end[0], z: MOOR.walk.south - 6 },
    ],
    trees,
    heightAt,
  };
}

/** The road's line: on from where Oakvale's crosses the crest, the way it was going, then winding south to the gap. */
function planRoad(crossing: Seam['roads'][number]): { line: P2[]; width: number; end: P2 } {
  const { x, dir } = crossing;
  const z = MOOR.land.minZ;
  const end: P2 = [-6, MOOR.walk.south + 6];
  const pts: P2[] = [[x, z], [x + dir[0] * 10, z + dir[1] * 10], [9, 172], [3, 196], [-8, 219], [-10, 240], end];
  return { line: sampleCurve(pts, 1), width: crossing.width, end };
}

/** The moor's own height at (x, z), before the road and the crest: a swelling floor, and hills round it but where the road leaves. */
function moorHeight(x: number, z: number, gapAt: P2): number {
  const { floor, swell, hills } = MOOR;
  let h = floor + (fbm(x * 0.014, z * 0.014, 101) - 0.5) * 2 * swell + (fbm(x * 0.06, z * 0.06, 103) - 0.5) * 0.8;
  // The ring: east and west, and south, rounded where they meet.
  const side = smoothstep(hills.side[0], hills.side[1], Math.abs(x));
  const south = smoothstep(hills.south[0], hills.south[1], z);
  const ring = 1 - (1 - side) * (1 - south);
  // Each hill its own height, `low` to `high`, and rounded: lumps along the ring.
  const tall = hills.low + (hills.high - hills.low) * smoothstep(0.3, 0.7, fbm(x * 0.018 + 7, z * 0.018 - 3, 107));
  const lump = 0.85 + 0.3 * valueNoise(x * 0.04, z * 0.04, 109);
  // The south hills part where the road runs out through them.
  const gap = smoothstep(hills.gap.half, hills.gap.half * 0.35, Math.abs(x - gapAt[0])) * south;
  h += ring * ring * (3 - 2 * ring) * tall * lump * (1 - hills.gap.depth * gap);
  return h;
}

/** Smooth a road's heights along it, its first held (it's the crest's). */
function smoothed(heights: number[]): number[] {
  let h = heights;
  for (let pass = 0; pass < 4; pass++) {
    h = h.map((_, i) => {
      if (i === 0) return h[0];
      let sum = 0;
      let n = 0;
      for (let k = Math.max(0, i - 5); k <= Math.min(h.length - 1, i + 5); k++) {
        sum += h[k];
        n++;
      }
      return sum / n;
    });
  }
  return h;
}

/** Ease the ground to the road's heights within a few metres of its line. */
function flattenAlong(ground: HeightGrid, line: readonly P2[], heights: readonly number[], width: number): void {
  const reach = width / 2 + 3.5;
  ground.each((x, z, k) => {
    const { d, i, t } = nearestOnPolyline(line, x, z);
    if (d > reach) return;
    const target = lerp(heights[i], heights[Math.min(i + 1, heights.length - 1)], t);
    ground.data[k] = lerp(ground.data[k], target, smoothstep(reach, width / 2 + 1.2, d));
  });
}

/** Blend the first MOOR.blend m of rows to the crest's heights: exactly them on the line, all the moor's own a chunk on. */
function meetCrest(ground: HeightGrid, crest: readonly number[]): void {
  for (let j = 0; j < ground.rows; j++) {
    const t = smoothstep(0, MOOR.blend, ground.z(j) - ground.z0);
    if (t >= 1) break;
    for (let i = 0; i < ground.cols; i++) {
      const k = j * ground.cols + i;
      ground.data[k] = j === 0 ? crest[i] : lerp(crest[i], ground.data[k], t);
    }
  }
}

/**
 * Where you can walk: the pass's corridor on over the crest from
 * CONFIG.world.ground.seam before it (overlapping Oakvale's), at the width it
 * has there, along the road to where the moor opens out, then the moor
 * itself, x within ±MOOR.walk.half to MOOR.walk.south. Convex areas that
 * overlap where they join.
 */
function walkableAreas(crossX: number, line: readonly P2[]): P2[][] {
  const { land, walk, opening } = MOOR;
  const half = 10;
  const top = land.minZ - CONFIG.world.ground.seam;
  const xAt = (z: number) => line.reduce((best, p) => (Math.abs(p[1] - z) < Math.abs(best[1] - z) ? p : best))[0];
  const mid = land.minZ + opening.corridor;
  const bx = xAt(mid);
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
    // The moor.
    [
      [bx - half, mid],
      [bx + half, mid],
      [walk.half, opening.open],
      [walk.half, walk.south],
      [-walk.half, walk.south],
      [-walk.half, opening.open],
    ],
  ];
}

/**
 * The moor's plants: bracken and heather in their patches over where you
 * walk, low bushes, grey rocks (more on slopes and the hills), a few lone
 * pines, and the rockfall across the road's end. Seeded, so the same every time.
 */
function placePlants(
  ground: HeightGrid,
  roadDistance: Float32Array,
  walkable: Walkable,
  stone: { x: number; z: number },
  road: { line: readonly P2[]; end: P2 },
): MoorPlant[] {
  const rand = mulberry32(4711);
  const { land, rockfall } = MOOR;
  const plants: MoorPlant[] = [];
  const offRoad = (x: number, z: number, margin: number) => roadDistance[ground.row(z) * ground.cols + ground.col(x)] > margin;
  const onLand = (x: number, z: number) => x > land.minX + 1 && x < land.maxX - 1 && z > land.minZ + 0.5 && z < land.maxZ - 1;
  const clear = (x: number, z: number, margin: number) => onLand(x, z) && offRoad(x, z, margin) && Math.hypot(x - stone.x, z - stone.z) > 1.5 + margin;
  const grade = (x: number, z: number) => Math.hypot(ground.at(x + 1, z) - ground.at(x - 1, z), ground.at(x, z + 1) - ground.at(x, z - 1)) / 2;
  const add = (kind: MoorKind, x: number, z: number, scale: number) =>
    plants.push({ kind, x, y: ground.at(x, z), z, yaw: rand() * Math.PI * 2, scale, seed: Math.floor(rand() * 1e6) });
  const scatter = (spacing: number, fn: (x: number, z: number) => void) => {
    for (let gz = land.minZ + spacing / 2; gz < land.maxZ; gz += spacing) {
      for (let gx = land.minX + spacing / 2; gx < land.maxX; gx += spacing) fn(gx + (rand() - 0.5) * spacing, gz + (rand() - 0.5) * spacing);
    }
  };
  const near = (x: number, z: number, m: number) => walkable.distance(x, z) < m;

  // A few lone pines, bent by the wind, the fewer the higher.
  scatter(16, (x, z) => {
    if (rand() > 0.16 || !clear(x, z, 3) || grade(x, z) > 0.5 || z < land.minZ + 12) return;
    add('pine', x, z, 0.75 + rand() * 0.45);
  });
  // Grey rocks, more on slopes and the hills, bigger away from where you walk.
  scatter(8, (x, z) => {
    if (rand() > 0.1 + 0.4 * Math.min(1, grade(x, z) * 1.5) || !clear(x, z, 1)) return;
    add('rock', x, z, 0.5 + rand() * (near(x, z, 4) ? 1 : 2.2));
  });
  // Low bushes, scattered.
  scatter(7, (x, z) => {
    if (rand() > 0.22 || !clear(x, z, 0.8) || !near(x, z, 30)) return;
    add('bush', x, z, 0.6 + rand() * 0.4);
  });
  // Bracken and heather in their patches, where you walk and a little past.
  scatter(2.4, (x, z) => {
    if (!near(x, z, 12) || !clear(x, z, 0.4)) return;
    const b = bracken(x, z);
    const h = heather(x, z);
    const roll = rand();
    if (roll < 0.8 * b) add('bracken', x, z, 1.4 + rand() * 0.9);
    else if (roll < 0.8 * b + 0.3 * h) add('heather', x, z, 0.5 + rand() * 0.35);
  });
  // The rockfall: big rocks piled across the road's end and the gap either side.
  const [ex] = road.end;
  for (let i = 0; i < rockfall.count; i++) {
    const x = ex + (rand() - 0.5) * 2 * rockfall.spread;
    const z = MOOR.walk.south + 1 + rand() * 7;
    add('rock', x, z, rockfall.scale[0] + rand() * (rockfall.scale[1] - rockfall.scale[0]));
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
