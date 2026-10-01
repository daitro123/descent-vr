import { lerp, nearestOnPolyline, type P2 } from '../forest/noise';
import type { HeightGrid } from '../heightGrid';
import { lengths, pointAlong } from '../lines';
import type { MoorRoad, MoorStructureKind } from './plan';

// Cairnford, the moor's market town (the zone spec's Hub): grey gritstone
// houses two storeys high in terraces down the market street (the pass road's
// last stretch) and along the Kingsroad, every front to its street; the
// walled square with the inn on its north side, the moot hall on its west and
// the smithy on its east corner by the Kingsroad; the beck between stone quays
// under the three-arched bridge; the mill on the south bank with its wheel in
// the water, Granny Mott's cottage and herb garden beside it; the chapel up on
// the north-west rise with its graveyard; the wagon yard by the east gate.
// Pure data, as plan.ts is: what stands where and which way it faces.

export const TOWN = {
  /** The market square: its middle and half sizes. */
  square: { x: 38, z: 372, hw: 14, hd: 11 },
  /** The bridge: its middle's x, where its deck starts and ends either side of the beck, its width and how far its middle rises. */
  bridge: { x: 46, from: 385, to: 402, width: 4.6, rise: 1.1 },
  /** Where the beck runs between quays (along x), its half width there, and how far the quays' tops stand over its water. */
  quays: { from: 4, to: 90, half: 5, rise: 1.2 },
  /** The chapel's middle on its rise, and how high the rise lifts it. */
  chapel: { x: 2, z: 342, rise: 2.6 },
  /** The east gate's pillars across the Kingsroad, at this x. */
  gate: 108,
  /** From a road's edge to the fronts of the houses along it: the paved footway. */
  set: 1.3,
} as const;

/** What Cairnford's layout needs from the plan: where to put a structure, the roads, the ground, the beck. */
export interface TownContext {
  add(kind: MoorStructureKind, x: number, z: number, yaw: number, w?: number, d?: number, h?: number, variant?: number, extra?: readonly number[]): void;
  road(id: string): MoorRoad;
  readonly ground: HeightGrid;
  /** The beck's centre line and its half width at a point along it (index + fraction). */
  readonly beck: { readonly line: readonly P2[]; half(at: number): number; level(at: number): number };
}

/**
 * A house's look, by its number: its door's paint and where along its front
 * it stands, a porch hood, a shop's window, window boxes, a lamp by the door,
 * a lean-to at the back (on its left, -1, or right, 1, or none, 0), its
 * stone, a band between its storeys, and which gable ends carry a chimney
 * (0 both, 1 its left, 2 its right). What the plan needs of it (the lean-to's
 * footprint) and what its model does both read it from here.
 */
export function houseLook(look: number) {
  return {
    door: look % 6,
    doorAt: [-0.5, 0.5, 0, -0.25, 0.3, 0.55, -0.55][look % 7],
    porch: look % 4 === 1,
    shop: look % 6 === 3,
    flowers: look % 5 === 2,
    outshut: look % 3 === 0 ? 0 : look % 3 === 1 ? -1 : 1,
    lamp: look % 4 === 3 || look % 7 === 0,
    stone: look % 5,
    band: look % 2 === 0,
    stacks: look % 3,
  } as const;
}

/** The yaw a model turns by to face from (x, z) toward (tx, tz). */
function facing(x: number, z: number, tx: number, tz: number): number {
  return Math.atan2(tx - x, tz - z);
}

/** Arc length along `line` to its nearest point to (x, z). */
function arcAt(line: readonly P2[], lens: readonly number[], x: number, z: number): number {
  const { i, t } = nearestOnPolyline(line, x, z);
  return lerp(lens[i], lens[Math.min(i + 1, lens.length - 1)], t);
}

/** One house in a row: its frontage along the street, its depth back from it, its storeys, and a look (door, chimney, lit windows). A frontage of 0 with a depth is a gap that long. */
type Lot = readonly [w: number, d: number, storeys: number, look: number];

/**
 * A row of houses along road `id`, on the side of it `from` lies, starting
 * where `from` falls on the road and going on along it: each turned square to
 * the street with its front `TOWN.set` back from the road's edge. A lot of
 * storeys 0 is a gap (a lane between houses). Returns where each lot stands.
 */
function row(ctx: TownContext, id: string, from: P2, lots: readonly Lot[], gap = 0.15): { x: number; z: number; yaw: number }[] {
  const road = ctx.road(id);
  const lens = lengths(road.line);
  let s = arcAt(road.line, lens, ...from);
  const p0 = pointAlong(road.line, s);
  // Which side: left (+1) or right (−1) of the way the road runs.
  const side = Math.sign((from[0] - p0.x) * -p0.dz + (from[1] - p0.z) * p0.dx) || 1;
  const out: { x: number; z: number; yaw: number }[] = [];
  for (const [w, d, storeys, look] of lots) {
    s += w / 2;
    const p = pointAlong(road.line, s);
    const [nx, nz] = [-p.dz * side, p.dx * side];
    const off = road.width / 2 + TOWN.set + d / 2;
    const [x, z] = [p.x + nx * off, p.z + nz * off];
    const yaw = Math.atan2(-nx, -nz);
    if (storeys > 0) {
      ctx.add('house', x, z, yaw, w, d, storeys, look);
      // Its back yard, out from its back wall.
      ctx.add('yard', x - Math.sin(yaw) * (d / 2), z - Math.cos(yaw) * (d / 2), yaw, w, 4, 1, look);
    }
    out.push({ x, z, yaw });
    s += w / 2 + gap;
  }
  return out;
}

/** The market street's west side: where it starts, its houses, and which lot is the gap the chapel lane runs up. */
const MARKET_WEST = {
  from: [24, 323] as P2,
  lots: [
    [7, 6, 2, 0],
    [6.5, 6.2, 2, 4],
    [3.6, 0, 0, 0],
    [6, 6.5, 1, 9],
    [7, 6, 2, 2],
    [6.2, 7, 2, 7],
  ] as readonly Lot[],
  lane: 2,
};

/**
 * The chapel lane's points, off the pass road (`pass`, its line) through the
 * gap between the market street's houses, round behind them and up the rise
 * to the chapel's door.
 */
export function chapelLane(pass: readonly P2[]): P2[] {
  const lens = lengths(pass);
  const { from, lots, lane } = MARKET_WEST;
  let s = arcAt(pass, lens, ...from);
  for (let i = 0; i < lane; i++) s += lots[i][0] + 0.15;
  s += lots[lane][0] / 2;
  const p = pointAlong(pass, s);
  const side = Math.sign((from[0] - p.x) * -p.dz + (from[1] - p.z) * p.dx) || 1;
  const [nx, nz] = [-p.dz * side, p.dx * side];
  const at = (k: number): P2 => [p.x + nx * k, p.z + nz * k];
  const ch = TOWN.chapel;
  return [at(0), at(4), at(8.5), at(12), [ch.x + 11, ch.z + 0.4], [ch.x + 7.4, ch.z]];
}

/** Every building and set piece of Cairnford. */
export function placeCairnford(ctx: TownContext): void {
  const { add } = ctx;
  const sq = TOWN.square;
  const toSquare = (x: number, z: number) => facing(x, z, sq.x, sq.z);

  // The market street: the pass road's last stretch, terraced both sides down to the square.
  // West side, with the lane up to the chapel between the second and third houses.
  row(ctx, 'pass', MARKET_WEST.from, MARKET_WEST.lots);
  // East side, its last house a few steps short of the inn's gable.
  row(ctx, 'pass', [42, 326], [
    [6.5, 6, 2, 1],
    [7, 6.5, 2, 5],
    [6, 6, 2, 10],
  ]);

  // The square: the Ford Inn on its north side, the moot hall on its west, a house on its north-west corner.
  add('inn', 46.5, 355, 0, 12.5, 8, 2);
  add('mootHall', 19.5, 372, Math.PI / 2, 12, 8, 2);
  add('house', 19.5, 360.5, Math.PI / 2, 7, 7, 2, 3);
  // The market cross in the middle, the stalls round it, the well and its trough, the map board by the street's foot,
  // benches along the inn's front, its barrels and a cart by the inn's gable.
  add('marketCross', sq.x, sq.z, 0, 1, 1, 3.2);
  for (const [x, z, look] of [[30.5, 367.5, 0], [45.5, 367, 1], [30.5, 377, 2], [45.5, 377.5, 3]] as const) add('stall', x, z, toSquare(x, z), 3, 2, 1, look);
  add('well', 28, 364.5, 0.3, 1, 1, 1);
  add('trough', 31.6, 363.4, 0.3, 2.4, 0.8, 1);
  add('mapboard', 33.6, 362.6, toSquare(33.6, 362.6));
  for (const x of [43, 50]) add('bench', x, 360.4, 0, 1.8, 0.5, 1);
  add('barrels', 53.6, 357.8, 0.2, 1.4, 1.4, 1, 0);
  add('cart', 50.6, 380.6, 1.75, 2, 3.4, 1);
  // The postbox by the moot hall's door, as the spec has it for later.
  add('postbox', 24.6, 368.2, Math.PI / 2, 1, 1, 1);

  // The smithy on the square's east corner, its open front to the Kingsroad; its quench trough and woodpile.
  add('smithy', 58, 378, Math.PI, 7, 6, 1);
  add('trough', 62.8, 374.2, 0, 1.8, 0.7, 1);
  add('woodpile', 62.6, 379.6, Math.PI / 2, 2.4, 1, 1.2);

  // The Kingsroad east from the square: terraced both sides to the wagon yard and the east gate.
  row(ctx, 'kingsroad', [58, 358], [
    [7, 6.4, 2, 6],
    [6.5, 6, 2, 11],
    [6, 6.2, 1, 13],
    [7, 6.4, 2, 8],
    [6.5, 6, 2, 12],
  ]);
  row(ctx, 'kingsroad', [64.5, 376], [
    [7, 6.4, 2, 14],
    [6, 6, 2, 15],
    [7, 6.2, 2, 16],
    [6.5, 6, 1, 17],
  ]);
  // The wagon yard by the east gate: a cart shed along its back wall, a wagon, a cart and a hay rick.
  add('cartShed', 99, 351, 0, 10, 4, 1);
  add('wagon', 96.5, 357.2, 1.4, 2.2, 4.6, 1);
  add('cart', 102.4, 356.6, -1.2, 2, 3.4, 1);
  add('hayrick', 104.4, 352.4, 0, 2.6, 2.6, 2.4);
  // The east gate: two pillars either side of the Kingsroad where the town ends.
  const king = ctx.road('kingsroad');
  const gate = pointAlong(king.line, arcAt(king.line, lengths(king.line), TOWN.gate, 362));
  add('townGate', gate.x, gate.z, Math.atan2(gate.dx, gate.dz), king.width + 2.2, 1, 3.4);

  // Down by the beck: the travellers' cairn on the north bank by the bridge and the smaller one beside it for the
  // families that left, and the flat-boat to Reedholm moored at the quay.
  add('cairn', 52.6, 386.6, 0, 1, 1, 3.2, 0);
  add('cairn', 56, 387.4, 0, 1, 1, 1.4, 1);
  add('boat', 61, 392.4, Math.PI / 2 + 0.1, 1, 4.2, 1);
  add('bollard', 58.6, 389.4, 0, 1, 1, 1);
  add('barrels', 64.5, 389.4, 0, 1.4, 1.4, 1, 1);
  // West of the moot hall, two cottages along the Turfmoss track, facing the water.
  add('house', 7, 374.4, 0.12, 7, 5.6, 1, 18);
  add('house', -3.4, 370.4, 0.22, 6.5, 5.4, 1, 19);

  // The chapel up on its rise, its door east toward the town, its graveyard round it.
  const ch = TOWN.chapel;
  add('chapel', ch.x, ch.z, Math.PI / 2, 6, 13, 1);
  add('graves', ch.x - 1, ch.z + 7.5, Math.PI / 2, 4, 10, 1, 0);
  add('graves', ch.x - 1, ch.z - 7.5, Math.PI / 2, 4, 10, 1, 1);

  // The south bank: the mill at the water's edge, its wheel in the beck; Granny Mott's cottage and herb garden
  // along the mill lane; houses along the Sunreach and Fen roads where they part.
  add('mill', 22, 402.9, Math.PI, 8, 7, 2, 0, [ctx.beck.level(ctx.beck.line.findIndex((p) => p[0] >= 22))]);
  add('cottage', 8.6, 414.2, Math.PI, 6.5, 5, 1, 20);
  add('garden', 19.6, 415, 0, 8, 6, 1);
  add('peatStack', 3.4, 411.8, 0.4, 1.8, 1.0, 1.0);
  row(ctx, 'sunreach', [36, 413], [
    [7, 6, 2, 21],
    [6, 6, 1, 22],
  ]);
  row(ctx, 'fen', [60, 408], [
    [1.5, 0, 0, 0],
    [7, 6, 2, 23],
    [6.5, 6, 1, 24],
  ]);
  row(ctx, 'fen', [58, 424], [
    [4, 0, 0, 0],
    [7, 6, 2, 25],
    [6.5, 6, 2, 26],
  ]);
}
