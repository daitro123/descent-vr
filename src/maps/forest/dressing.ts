import type { HeightGrid } from '../heightGrid';
import { type Path, type Structure, type StructureKind, localToWorld, worldToLocal } from './layout';
import { fbm, lerp, nearestOnPolyline, type P2, sampleCurve, smoothstep, valueNoise } from './noise';

// Oakvale's finishing touches, planned after the zone itself so nothing laid
// out before them moves: the trodden footpaths from the roads to every door
// and gate, the worn earth of its yards, and the ground reshaped where the
// first pass left it looking built rather than grown (the watchtower's
// square terrace, the mine's boxy ridge, the bank the rails stand on).

/** A patch of worn earth where people gather: its middle and its radius. */
export interface Yard {
  readonly x: number;
  readonly z: number;
  readonly r: number;
}

/**
 * The yards: the village square at the crossroads, the farmyard where the
 * farm road ends, the lumber camp, the watchtower's hilltop, the mine's front
 * and the middle of the standing stones. The roads that end in one wear away
 * into it; the footpaths that leave one start under it.
 */
export const YARDS: readonly Yard[] = [
  { x: 0.4, z: 1.2, r: 8.5 },
  { x: 55, z: 27.5, r: 8 },
  { x: -48, z: -42, r: 6.5 },
  { x: 39, z: -58, r: 6.5 },
  { x: -14, z: -73.5, r: 5 },
  { x: -30, z: 52, r: 3 },
];

/** How a footpath's mouth splays where it leaves a road, and how much lower than the roads it's laid. */
export const FOOTPATH = { width: 1.3, flare: { extra: 1.6, length: 3.5 }, lift: 0.03, step: 0.002 } as const;

/**
 * How many of a footpath's last samples (about a metre apart) aren't counted
 * as road where things are kept off roads: its last stretch runs up to a door
 * or a gate, which stands on it.
 */
export const DOORSTEP = 3;

/** Where a footpath ends: in front of a structure's door, in its own frame (front +Z). */
interface Door {
  readonly kind: StructureKind;
  readonly variant?: number;
  /** Which of its kind, by its position: the one nearest here. */
  readonly near?: P2;
  readonly at: P2;
}

/**
 * The footpaths: each leaves a road (its first point is snapped onto that
 * road's centre line, so its mouth opens out of it) or starts in a yard,
 * bends through its waypoints and ends at a door's step or a field's gate.
 * The inn and the house by the well share their mouth off the main road; the
 * cottages leave the pond road; the smithy's leaves the farm road; at the farm
 * every door and gate is reached from the farmyard; the standing stones' path
 * leaves the main road south of the village.
 */
const FOOTPATHS: readonly { id: string; from: string; via: P2[]; to: Door | P2; width?: number }[] = [
  { id: 'inn', from: 'main', via: [[-1.6, -9.6], [3.5, -10.6]], to: { kind: 'inn', at: [0, 5.5] }, width: 1.6 },
  { id: 'house', from: 'main', via: [[-1.6, -9.6], [-5.6, -9.9]], to: { kind: 'house', variant: 0, at: [0.9, 4.25] } },
  { id: 'cottage', from: 'west', via: [[-11.4, 4.6], [-12.3, 8.4]], to: { kind: 'house', variant: 1, at: [0.9, 3.75] } },
  { id: 'cottage-west', from: 'west', via: [[-17.2, 5.9], [-19.4, 1.8]], to: { kind: 'house', variant: 2, at: [0.9, 3.55] } },
  { id: 'smithy', from: 'east', via: [[8.6, -1.7], [9.6, 3.6]], to: { kind: 'smithy', at: [0, 4.6] }, width: 1.5 },
  { id: 'farmhouse', from: 'yard', via: [[51.6, 29.6], [49.9, 31.6]], to: { kind: 'farmhouse', at: [-0.6, 5.0] } },
  { id: 'barn', from: 'yard', via: [[57.5, 25.6], [60.2, 23.9]], to: { kind: 'barn', at: [0, 5.6] }, width: 2.2 },
  { id: 'windmill', from: 'yard', via: [[58.2, 30.6], [64, 34.2]], to: { kind: 'windmill', at: [0, 3.3] } },
  { id: 'wheat', from: 'yard', via: [[55.6, 31.5], [56.6, 36.5]], to: [57.4, 41.4] },
  { id: 'pumpkins', from: 'wheat', via: [[56.4, 37.6], [50.5, 41.2], [45.2, 44]], to: [40.9, 45.5] },
  { id: 'cabbages', from: 'windmill', via: [[65.3, 35.2], [67.6, 41.6]], to: [69.9, 47.5] },
  { id: 'stones', from: 'main', via: [[-4.6, 60.5], [-12.5, 59.4], [-19.8, 55.8]], to: [-24.9, 53.4] },
];

/**
 * Oakvale's footpaths over `ground`, off its `roads` (by id) and to its
 * `structures`' doors: each sampled about every metre and laid on the ground
 * as it is (nothing's flattened for them), its mouth splayed where it leaves a
 * road or another footpath.
 */
export function planFootpaths(ground: HeightGrid, roads: readonly Path[], structures: readonly Structure[]): Path[] {
  const out: Path[] = [];
  FOOTPATHS.forEach((spec, k) => {
    const pts = spec.via.map((p) => [...p] as P2);
    const parent = spec.from === 'yard' ? null : [...roads, ...out].find((r) => r.id === spec.from || r.id === `foot:${spec.from}`);
    if (spec.from !== 'yard' && !parent) throw new Error(`No road ${spec.from} for the footpath to the ${spec.id}`);
    if (parent) {
      // Its mouth on the road's centre line, where the road comes nearest its first waypoint.
      const { i, t } = nearestOnPolyline(parent.line, pts[0][0], pts[0][1]);
      const [a, b] = [parent.line[i], parent.line[Math.min(i + 1, parent.line.length - 1)]];
      pts.unshift([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
    }
    pts.push(Array.isArray(spec.to) ? (spec.to as P2) : doorOf(structures, spec.to as Door));
    const line = sampleCurve(pts, 1);
    out.push({
      id: `foot:${spec.id}`,
      width: spec.width ?? FOOTPATH.width,
      line,
      heights: line.map(([x, z]) => ground.at(x, z)),
      foot: true,
      flare: parent ? FOOTPATH.flare : undefined,
      lift: FOOTPATH.lift - k * FOOTPATH.step,
    });
  });
  return out;
}

/** The world point at `door.at` in front of the structure it names. */
function doorOf(structures: readonly Structure[], door: Door): P2 {
  const near = door.near ?? [0, 0];
  const s = structures
    .filter((st) => st.kind === door.kind && (door.variant === undefined || st.variant === door.variant))
    .sort((a, b) => Math.hypot(a.x - near[0], a.z - near[1]) - Math.hypot(b.x - near[0], b.z - near[1]))[0];
  if (!s) throw new Error(`No ${door.kind} for a footpath to end at`);
  return localToWorld(s, door.at[0], door.at[1]);
}

// ------------------------------------------------------------------ the ground, reshaped

/**
 * The watchtower's hilltop, round instead of square: level with the tower's
 * base out to `flat` m from its middle, easing back to the hill as it was
 * before the first pass levelled it (`unlevelled`) over `ease` m more.
 */
export const TOWER_HILL = { flat: 7.6, ease: 7 } as const;

export function roundTowerHill(ground: HeightGrid, unlevelled: Float32Array, tower: Structure): void {
  const { flat, ease } = TOWER_HILL;
  ground.each((x, z, k) => {
    // Out past the old square's corners, where the first pass's levelling reached.
    const d = Math.hypot(x - tower.x, z - tower.z);
    if (d > Math.max(flat + ease, 10.5 * Math.SQRT2) + 1) return;
    ground.data[k] = lerp(unlevelled[k], tower.y, smoothstep(flat + ease, flat, d));
  });
}

/**
 * The bank the mine's rails run out on: as level as the first pass made it
 * along the rails (`half` m either side of the mine's middle), but easing down
 * to the ground as it was before (`unlevelled`) over `ease` m, not three, so
 * it reads as a spoil bank and not a step.
 */
export const RAIL_BANK = { half: 2.8, from: -0.3, to: 9, ease: 6.5 } as const;

export function easeRailBank(ground: HeightGrid, unlevelled: Float32Array, mine: Structure): void {
  const { half, from, to, ease } = RAIL_BANK;
  const [z0, z1] = [mine.hd + from, mine.hd + to];
  ground.each((x, z, k) => {
    const [lx, lz] = worldToLocal(mine, x, z);
    // Only out in front: behind the bank's start is the hill the mouth is cut into.
    if (lz < z0) return;
    const d = Math.hypot(Math.max(-half - lx, 0, lx - half), Math.max(0, lz - z1));
    if (d === 0 || d > ease + 3) return;
    ground.data[k] = lerp(unlevelled[k], mine.y, smoothstep(ease, 0, d));
  });
}

/**
 * The ridge behind the mine, broken up: the first pass raised it as a box
 * (12 m, with a straight cliff along z −76..−83 and a flat top). Away from
 * the mine's front (`keep` m either side of its middle, which stays exactly
 * as it was, mouth and all) its foot wanders in and out, its face runs from
 * a crag to a steep broken slope, and crags stand up along its top; above
 * the mouth only the skyline behind the cliff's top changes.
 */
export const RIDGE = { keep: 7, blend: 6, crags: 6 } as const;

export function breakUpRidge(ground: HeightGrid, mine: Structure): void {
  const { keep, blend, crags } = RIDGE;
  const boxy = (x: number, z: number) => 12 * smoothstep(-76, -83, z) * smoothstep(34, 14, Math.abs(x + 14));
  ground.each((x, z, k) => {
    if (z > -70 || z < -112 || x < -56 || x > 28) return;
    const off = Math.abs(x - mine.x);
    const away = smoothstep(keep, keep + blend, off);
    // Its foot wanders by up to 3 m, its face spreads from 7 m to 15 m across in places, and its ends taper
    // unevenly near the face (farther back, under the ring's mountains, they're as they were).
    const toe = -76 + (valueNoise(x * 0.07, 3.1, 71) - 0.5) * 6;
    const run = 7 + 8 * smoothstep(0.45, 0.8, valueNoise(x * 0.05, 8.7, 73));
    const ends = 34 + (valueNoise(z * 0.06, 1.3, 75) - 0.5) * 12 * smoothstep(-100, -86, z);
    const broken = 12 * smoothstep(toe, toe - run, z) * smoothstep(ends, ends - 22, Math.abs(x + 14));
    // Crags along its top, behind the face: above the mouth too, but only past the cliff's top.
    const behind = smoothstep(-82, -88, z) * smoothstep(-112, -100, z);
    const crag = crags * Math.max(0, fbm(x * 0.09, z * 0.09, 77) - 0.42) * 2.2 * behind * smoothstep(40, 22, Math.abs(x + 14));
    ground.data[k] += (broken - boxy(x, z)) * away + crag;
  });
}
