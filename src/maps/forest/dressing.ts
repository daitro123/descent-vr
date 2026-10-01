import type { HeightGrid } from '../heightGrid';
import { type Path, type Plant, type PlantKind, type Structure, type StructureKind, localToWorld, worldToLocal } from './layout';
import { fbm, lerp, mulberry32, nearestOnPolyline, type P2, sampleCurve, smoothstep, valueNoise } from './noise';

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
  const s = nearest(structures, door);
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

// ------------------------------------------------------------------ what else grows

/** What the dressing's plants need to know of the zone round them. */
export interface Growing {
  /** Whether something `margin` m across can stand at (x, z): off the roads and paths, the water, the buildings, the fields, the camps and the spots. */
  clear(x: number, z: number, margin: number): boolean;
  /** How wooded (x, z) is, 0 to 1, as the trees were planted. */
  woods(x: number, z: number): number;
  /** Whether (x, z) is in an open clearing (the village, the farm, the camps' ground) that's kept clear of undergrowth. */
  open(x: number, z: number): boolean;
  /** Whether (x, z) is in the Old North Pass's cut or on its cart road, which are kept bare. */
  northPass(x: number, z: number): boolean;
}

/**
 * The forest floor's ferns (where the woods are thick), crags breaking out of
 * the mine's ridge and the southern pass's walls, and pines climbing those
 * walls. They're planted from their own random stream after everything else
 * grows, so nothing planted before them moves.
 */
export const DRESSING = {
  ferns: { spacing: 2.2, from: 0.3, full: 0.75, chance: 0.7, trunk: 0.75, grade: 0.55 },
  ridge: { minX: -58, maxX: 30, minZ: -114, maxZ: -70, spacing: 3, grade: 0.75, chance: 0.4, mouth: { half: 8, below: -88 } },
  pass: { minX: -70, maxX: 70, minZ: 86, maxZ: 139, spacing: 4, road: 4, crag: 0.16, pine: 0.3, tufts: 2.4 },
} as const;

export function dressPlants(ground: HeightGrid, grown: readonly Plant[], g: Growing, play: number, water: number, mine: Structure, passRoad: readonly P2[], passHalf: number): Plant[] {
  const rand = mulberry32(5150);
  const out: Plant[] = [];
  const add = (kind: PlantKind, x: number, z: number, scale: number, sink = 0) =>
    out.push({ kind, x, y: ground.at(x, z) - sink, z, yaw: rand() * Math.PI * 2, scale, seed: Math.floor(rand() * 1e6) });
  const grade = (x: number, z: number) => Math.hypot(ground.at(x + 1, z) - ground.at(x - 1, z), ground.at(x, z + 1) - ground.at(x, z - 1)) / 2;
  // What already stands, in 4 m cells: ferns keep off trunks and boulders.
  const cells = new Map<number, Plant[]>();
  const cellOf = (x: number, z: number) => Math.floor(x / 4) * 1000 + Math.floor(z / 4);
  for (const p of grown) if (!['grass', 'flower', 'mushroom', 'reed', 'lily'].includes(p.kind)) cells.set(cellOf(p.x, p.z), [...(cells.get(cellOf(p.x, p.z)) ?? []), p]);
  const crowded = (x: number, z: number, r: number) => {
    for (const dx of [-4, 0, 4]) for (const dz of [-4, 0, 4]) for (const p of cells.get(cellOf(x + dx, z + dz)) ?? []) if ((p.x - x) ** 2 + (p.z - z) ** 2 < (r * (p.kind === 'rock' || p.kind === 'bush' ? Math.max(1, p.scale) : 1)) ** 2) return true;
    return false;
  };

  // Ferns over the forest floor, thicker the thicker the woods.
  const F = DRESSING.ferns;
  for (let gz = -play; gz <= play; gz += F.spacing) {
    for (let gx = -play; gx <= play; gx += F.spacing) {
      const x = gx + (rand() - 0.5) * F.spacing;
      const z = gz + (rand() - 0.5) * F.spacing;
      const roll = rand();
      const size = 0.9 + rand() * 0.6;
      if (roll > F.chance * smoothstep(F.from, F.full, g.woods(x, z))) continue;
      if (ground.at(x, z) < water + 0.35 || grade(x, z) > F.grade || g.open(x, z) || g.northPass(x, z)) continue;
      if (!g.clear(x, z, 0.5) || crowded(x, z, F.trunk)) continue;
      add('fern', x, z, size);
    }
  }

  // Crags out of the mine's ridge, where it's steep, but not round its mouth or in the Old North Pass.
  const R = DRESSING.ridge;
  for (let gz = R.minZ; gz <= R.maxZ; gz += R.spacing) {
    for (let gx = R.minX; gx <= R.maxX; gx += R.spacing) {
      const x = gx + (rand() - 0.5) * R.spacing;
      const z = gz + (rand() - 0.5) * R.spacing;
      const roll = rand();
      const size = 0.8 + rand() * 1.4;
      if (roll > R.chance || grade(x, z) < R.grade) continue;
      if (Math.abs(x - mine.x) < R.mouth.half && z > R.mouth.below) continue;
      if (g.northPass(x, z) || g.open(x, z) || !g.clear(x, z, 1.5)) continue;
      // Sunk the deeper the steeper it is, so none sits perched on its slope.
      add('crag', x, z, size, size * (0.4 + 0.45 * Math.min(1.4, grade(x, z))));
    }
  }

  // Up the southern pass's walls: crags where they're steep, pines where they aren't, clear of the road and its edge.
  const P = DRESSING.pass;
  for (let gz = P.minZ; gz <= P.maxZ; gz += P.spacing) {
    for (let gx = P.minX; gx <= P.maxX; gx += P.spacing) {
      const x = gx + (rand() - 0.5) * P.spacing;
      const z = Math.min(gz + (rand() - 0.5) * P.spacing, P.maxZ);
      const roll = rand();
      const size = rand();
      if (nearestOnPolyline(passRoad, x, z).d < passHalf + P.road || !g.clear(x, z, 1)) continue;
      const steep = grade(x, z);
      if (steep > 0.5 && roll < P.crag) add('crag', x, z, 0.9 + size * 1.5, (0.9 + size * 1.5) * (0.4 + 0.45 * Math.min(1.4, steep)));
      else if (steep < 1 && roll > 1 - P.pine && !crowded(x, z, 2.5)) add('pine', x, z, 0.75 + size * 0.45);
    }
  }
  // And grass in tufts over the pass's floor either side of the road, thinning toward the crest's moor.
  for (let gz = P.minZ; gz <= P.maxZ; gz += P.tufts) {
    for (let gx = -passHalf - 12; gx <= passHalf + 12; gx += P.tufts) {
      const x = gx + (rand() - 0.5) * P.tufts + passRoad[nearestOnPolyline(passRoad, 0, gz).i][0];
      const z = Math.min(gz + (rand() - 0.5) * P.tufts, P.maxZ);
      const roll = rand();
      const size = 0.7 + rand() * 0.6;
      if (roll > 0.5 * smoothstep(P.maxZ, P.maxZ - 30, z) + 0.12 || !g.clear(x, z, 0.3)) continue;
      add(roll < 0.08 ? 'bush' : 'grass', x, z, size);
    }
  }
  return out;
}

// ------------------------------------------------------------------ the clutter of lived-in places

/** The small things left about where people live and work, each modelled in buildings.ts. */
export type ClutterKind =
  | 'bench' | 'barrels' | 'butt' | 'crates' | 'woodpile' | 'sawhorse' | 'chopblock' | 'planks'
  | 'timbers' | 'ore' | 'sacks' | 'coop' | 'wagon' | 'vegbed' | 'rack' | 'leanto';

/** Each kind's footprint (half width and depth, in its own frame) and whether you walk into it. */
export const CLUTTER_SIZE: Record<ClutterKind, readonly [number, number, boolean]> = {
  bench: [0.9, 0.25, true],
  barrels: [0.8, 0.6, true],
  butt: [0.4, 0.4, true],
  crates: [0.75, 0.6, true],
  woodpile: [1.35, 0.4, true],
  sawhorse: [1.0, 0.35, true],
  chopblock: [0.45, 0.45, true],
  planks: [1.5, 0.45, true],
  timbers: [1.4, 0.5, true],
  ore: [1.2, 0.8, true],
  sacks: [0.6, 0.45, true],
  coop: [0.85, 0.65, true],
  wagon: [1.0, 1.9, true],
  vegbed: [1.4, 0.7, false],
  rack: [0.8, 0.3, true],
  leanto: [1.35, 1.1, true],
};

/** Where a piece of clutter stands: in the world, or by a structure (in its frame, turned by `turn` from it). */
type ClutterSpot = { at: P2; face?: P2; yaw?: number } | { by: { kind: StructureKind; variant?: number; near?: P2 }; at: P2; turn?: number };

/**
 * The village's benches, woodpiles against the cottages, vegetable beds in
 * their gardens and the inn's yard stores; the farm's hay wagon, hen coop,
 * sacks and woodpile; the lumber camp's sawhorse, chopping block, planks and
 * lean-to; the pit props, ore heap and crates at the mine's mouth; the
 * watchtower's stores and spear rack. All clear of the roads, paths, doors,
 * camps and spots (the forest tests hold them to it).
 */
const CLUTTER: readonly ({ kind: ClutterKind } & ClutterSpot)[] = [
  // The village.
  { kind: 'vegbed', by: { kind: 'house', variant: 0 }, at: [0, -5.1] },
  { kind: 'vegbed', by: { kind: 'house', variant: 1 }, at: [0, -4.9] },
  { kind: 'woodpile', by: { kind: 'house', variant: 1 }, at: [-3.65, -0.4], turn: -Math.PI / 2 },
  { kind: 'bench', by: { kind: 'house', variant: 1 }, at: [-1.8, 3.45] },
  { kind: 'woodpile', by: { kind: 'house', variant: 2 }, at: [3.45, -0.4], turn: Math.PI / 2 },
  { kind: 'butt', by: { kind: 'house', variant: 2 }, at: [-3.45, 2.0] },
  { kind: 'butt', by: { kind: 'house', variant: 0 }, at: [3.95, 2.3] },
  { kind: 'bench', at: [-8.9, -4.4], face: [-5.5, -5.5] },
  { kind: 'woodpile', by: { kind: 'inn' }, at: [-2.4, -4.45], turn: Math.PI },
  { kind: 'crates', by: { kind: 'inn' }, at: [6.4, -2.2], turn: Math.PI / 2 },
  { kind: 'barrels', by: { kind: 'inn' }, at: [6.35, 3.3], turn: Math.PI / 2 },
  { kind: 'butt', by: { kind: 'smithy' }, at: [-3.95, -2.2] },
  // The farm.
  { kind: 'wagon', at: [56.4, 19.2], yaw: 2.3 },
  { kind: 'woodpile', by: { kind: 'farmhouse' }, at: [4.45, -0.6], turn: Math.PI / 2 },
  { kind: 'butt', by: { kind: 'farmhouse' }, at: [3.6, 3.45] },
  { kind: 'coop', at: [39.2, 31.6], face: [46, 27] },
  { kind: 'sacks', by: { kind: 'barn' }, at: [3.0, 4.6] },
  { kind: 'barrels', by: { kind: 'barn' }, at: [-3.2, 4.65] },
  { kind: 'sacks', by: { kind: 'windmill' }, at: [1.7, 3.1] },
  { kind: 'barrels', at: [48.3, 27.4], yaw: 0.5 },
  // The lumber camp.
  { kind: 'sawhorse', at: [-43.4, -37.6], yaw: 0.3 },
  { kind: 'chopblock', at: [-45.6, -35.6], yaw: 1.1 },
  { kind: 'planks', at: [-58.4, -43.4], yaw: 1.45 },
  { kind: 'leanto', at: [-42.4, -51.2], face: [-48, -41] },
  // Not behind the tent, where its leader must come round to you (world.test.ts).
  { kind: 'barrels', at: [-58.6, -40.2], yaw: 1.2 },
  { kind: 'crates', at: [-40.2, -49.4], yaw: 0.7 },
  // The old mine's mouth.
  { kind: 'timbers', at: [-19.3, -70.2], yaw: 1.3 },
  { kind: 'ore', at: [-8.0, -70.0], yaw: -0.4 },
  { kind: 'crates', at: [-19.6, -76.2], yaw: 0.3 },
  { kind: 'barrels', at: [-8.6, -76.4], yaw: -0.3 },
  // The watchtower.
  // Off the sight line over the hill along z = −63.5 (world.test.ts), clear of its watchers.
  { kind: 'crates', at: [42.3, -65.5], yaw: 0.2 },
  { kind: 'barrels', at: [39.5, -66.0], yaw: 0 },
  { kind: 'rack', at: [45.2, -65.8], face: [50, -71] },
  { kind: 'woodpile', at: [33.4, -55.0], face: [26, -52] },
];

/** The clutter, as structures standing on `heightAt`, placed by `structures` where it stands by one. */
export function placeClutter(structures: readonly Structure[], heightAt: (x: number, z: number) => number): Structure[] {
  return CLUTTER.map((c) => {
    let x: number;
    let z: number;
    let yaw: number;
    if ('by' in c) {
      const s = nearest(structures, c.by);
      [x, z] = localToWorld(s, c.at[0], c.at[1]);
      yaw = s.yaw + (c.turn ?? 0);
    } else {
      [x, z] = c.at;
      yaw = c.face ? Math.atan2(c.face[0] - x, c.face[1] - z) : (c.yaw ?? 0);
    }
    const [hw, hd, solid] = CLUTTER_SIZE[c.kind];
    return { kind: c.kind, x, z, yaw, y: heightAt(x, z), hw, hd, solid, variant: 0 };
  });
}

/** The structure `by` names: of its kind (and variant), the one nearest its `near`. */
function nearest(structures: readonly Structure[], by: { kind: StructureKind; variant?: number; near?: P2 }): Structure {
  const near = by.near ?? [0, 0];
  const s = structures
    .filter((st) => st.kind === by.kind && (by.variant === undefined || st.variant === by.variant))
    .sort((a, b) => Math.hypot(a.x - near[0], a.z - near[1]) - Math.hypot(b.x - near[0], b.z - near[1]))[0];
  if (!s) throw new Error(`No ${by.kind} in Oakvale`);
  return s;
}
