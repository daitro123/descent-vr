import { type BufferGeometry, Color, Matrix4, Quaternion, Vector3 } from 'three';
import { CONFIG } from '../../config';
import { ModelBuilder } from '../../models/kit';
import { type ChunkData, type ChunkKey, chunkBounds, chunkCoord, chunkKey, type Detail, sphereAround } from '../../world/chunks';
import type { Deck } from '../decks';
import { standingStone } from '../forest/buildings';
import { planOakvale } from '../forest/layout';
import { plantPrototypes, type Prototypes } from '../forest/nature';
import { EARTH } from '../forest/palette';
import { hash01, mulberry32, nearestOnPolyline, type P2, smoothstep, valueNoise } from '../forest/noise';
import { addRoads, addSkirt, faceUp, MeshBuffer, type Region } from '../forest/terrain';
import { FEN_ROAD } from '../fenRoad';
import { KINGSROAD } from '../kingsroad';
import type { WallLook } from '../props';
import { recolour, recolourEach } from '../recolour';
import { buildMoorStructure } from './buildings';
import { bracken, drySouth, heather, inBog, inEnclosure, inTown, MOOR, onHollowhill, type MoorKind, type MoorPlan, type MoorStructureKind, planBrackenmoor } from './plan';
import { MOOR_BUILD, MOOR_GROUND, MOOR_LAND, MOOR_PLANTS, MOOR_TREES } from './palette';

// Brackenmoor's chunk builder: one 40 m chunk of its plan at full detail or
// as a stand-in, as plain arrays, like Oakvale's (forest/chunks.ts). Free of
// the DOM, so it runs in tests and in its worker. Its plants are Oakvale's
// own shapes with the moor's colours (the same shared material, so no new
// shader): bracken is Oakvale's grass grown tall and turned rust, heather its
// rocks' rounded shapes pressed low and purple, and its pines lean with the wind;
// only the rim's gritstone crags and scree are the moor's own. Cairnford's
// setts, and the moor's dry stone walls, are laid here too.

const UP = new Vector3(0, 1, 0);

/** Too small to see from a stand-in's distance. */
const UNDERGROWTH: ReadonlySet<MoorKind> = new Set(['bracken', 'heather', 'cotton', 'reed', 'scree']);

/** Brackenmoor's chunks, west to east along each row, north to south. */
export function moorChunks(): ChunkKey[] {
  const { land } = MOOR;
  const size = CONFIG.streaming.chunk;
  const keys: ChunkKey[] = [];
  for (let j = chunkCoord(land.minZ + size / 2); j <= chunkCoord(land.maxZ - size / 2); j++) {
    for (let i = chunkCoord(land.minX + size / 2); i <= chunkCoord(land.maxX - size / 2); i++) keys.push(chunkKey(i, j));
  }
  return keys;
}

/** Its plan against Oakvale's crest: what the zone and its worker both build from. */
export function planMoor(): MoorPlan {
  return planBrackenmoor(planOakvale().seams[0]);
}

/** Brackenmoor's builder over its plan, made now: what its worker runs. */
export function moorBuilder(): (key: ChunkKey, detail: Detail) => ChunkData {
  const plan = planMoor();
  return (key, detail) => buildMoorChunk(plan, key, detail);
}

type MoorPrototypes = Record<MoorKind, BufferGeometry[]>;

let prototypes: { near: MoorPrototypes; far: MoorPrototypes } | null = null;

/** Every moor plant's models, near and far, built once from Oakvale's. */
function plants(): { near: MoorPrototypes; far: MoorPrototypes } {
  return (prototypes ??= { near: moorPrototypes(plantPrototypes(), false), far: moorPrototypes(plantPrototypes(true), true) });
}

/** Oakvale's plant shapes in the moor's colours. */
function moorPrototypes(oak: Prototypes, far: boolean): MoorPrototypes {
  return {
    // Each tuft shape twice, the second set's colours two on, so a shape isn't always the same colour.
    bracken: [...recolourEach(oak.grass, MOOR_PLANTS.bracken), ...recolourEach(oak.grass, MOOR_PLANTS.bracken.slice(2))],
    heather: recolourEach(oak.rock, MOOR_PLANTS.heather, true),
    bush: recolourEach(oak.bush, MOOR_PLANTS.bush),
    // Gorse: a bush darker and spikier green, flecked with its yellow flowers.
    gorse: oak.bush.map((g, v) => fleck(recolour(g, MOOR_TREES.gorse[v % 2]), MOOR_TREES.gorseFlower, v)),
    rock: recolourEach(oak.rock, [MOOR_PLANTS.lichen]),
    pine: recolourEach(oak.pine, MOOR_PLANTS.pine),
    // Sunreach's cypresses, seen through the Rockfall Gap: Oakvale's pines drawn up tall and narrow, a dark warm green.
    cypress: recolourEach(oak.pine, MOOR_TREES.cypress),
    // The hawthorns and rowans are Oakvale's young trees, the rowans flecked with their berries.
    hawthorn: recolourEach(oak.young, MOOR_TREES.hawthorn),
    rowan: oak.young.map((g, v) => fleck(recolour(g, MOOR_TREES.rowan[v % 2]), MOOR_TREES.rowanBerry, v + 5)),
    reed: recolourEach(oak.reed, MOOR_TREES.reed),
    // Cotton grass: tufts of pale sedge, their tips the white cotton.
    cotton: oak.grass.map((g, v) => fleck(recolour(g, MOOR_TREES.cotton[v % 2], true), MOOR_TREES.cottonHead, v + 9, 0.3)),
    crag: [0, 1, 2, 3].map((v) => crag(v, far)),
    scree: [0, 1, 2].map((v) => scree(v)),
  };
}

/** Gritstone's weathered greys and browns, darkened by the weather, and the lichen on its tops. */
const GRIT = [0x6e685c, 0x625d53, 0x77705f, 0x56524a] as const;
const LICHEN = 0x8a8a5a;

/**
 * A gritstone edge, three units along its own X and a little over two
 * high: its beds of stone lying level, each a row of blocks broken by
 * joints, each a little set back from the one under it, their tops flat and
 * lichened; its foot sunk deep so it stands out of a steep slope, its front
 * (+Z) the face; a block fallen at its foot.
 */
function crag(v: number, far: boolean): BufferGeometry {
  const b = new ModelBuilder(900 + v);
  const rand = mulberry32(77 + v * 31);
  const beds = far ? 2 : 3;
  let y = -1.8;
  let span = 3.0;
  for (let k = 0; k < beds; k++) {
    const bh = (k === 0 ? 2.2 : 0.45) + rand() * 0.4;
    const n = far ? 2 : 3 - (k === beds - 1 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const w = (span / n) * (0.88 + rand() * 0.2);
      const x = -span / 2 + (i + 0.5) * (span / n) + (rand() - 0.5) * 0.2;
      const z = -k * 0.25 + (rand() - 0.5) * 0.16;
      b.box(w, bh, 1.0 - k * 0.12, { at: [x, y + bh / 2, z], rot: [0, (rand() - 0.5) * 0.14, (rand() - 0.5) * 0.05], color: GRIT[(i + k + v) % 4], jitter: 0.16 });
      if (!far && k === beds - 1) b.box(w * 0.7, 0.05, 0.5, { at: [x, y + bh + 0.01, z - 0.1], color: LICHEN, jitter: 0.2 });
    }
    y += bh - 0.02;
    span *= 0.72 + rand() * 0.12;
  }
  if (!far) b.box(0.7, 0.42, 0.55, { at: [(rand() - 0.5) * 1.6, 0.1, 0.9 + rand() * 0.4], rot: [rand() * 0.3, rand() * 3, rand() * 0.3], color: GRIT[v % 4], jitter: 0.15 });
  return b.build();
}

/** Scree: broken stones spilled down a slope along its own +Z, a unit long. */
function scree(v: number): BufferGeometry {
  const b = new ModelBuilder(950 + v);
  const rand = mulberry32(131 + v * 17);
  for (let i = 0; i < 11; i++) {
    const t = rand();
    const s = 0.12 + rand() * 0.22;
    b.box(s * 1.4, s, s * 1.1, { at: [(rand() - 0.5) * (0.4 + t * 1.4), s * 0.25, -0.6 + t * 1.6], rot: [rand(), rand() * 3, rand()], color: GRIT[(i + v) % 4], jitter: 0.15 });
  }
  return b.build();
}

/** `g` with about `share` of its leaves' triangles turned `hex`: flowers, berries, cotton heads. */
function fleck(g: BufferGeometry, hex: number, seed: number, share = 0.16): BufferGeometry {
  const col = g.getAttribute('color');
  const c = new Color(hex);
  for (let t = 0; t < col.count / 3; t++) {
    if (hash01(t, seed, 191) > share) continue;
    // Only the green ones: leaves, not bark.
    if (col.getY(t * 3) < col.getX(t * 3)) continue;
    for (let k = 0; k < 3; k++) col.setXYZ(t * 3 + k, c.r, c.g, c.b);
  }
  return g;
}

/** Too small to make out from a stand-in's distance, as structures go. */
const SMALL: ReadonlySet<MoorStructureKind> = new Set([
  'signpost', 'mapboard', 'crates', 'cart', 'grave', 'ragPole', 'ladder', 'stall', 'peatStack', 'garden', 'boat', 'cairn',
  'bench', 'barrels', 'postbox', 'woodpile', 'bollard', 'waymark', 'sundial', 'eelTraps', 'trough', 'campfire', 'rack',
  'blocks', 'graves', 'well', 'fieldGate', 'spoil', 'wagon', 'hedge',
]);

/** Each structure's model, made the first time a chunk needs it. */
const models = new WeakMap<object, BufferGeometry>();

function once<T extends object>(key: T, make: (key: T) => BufferGeometry): BufferGeometry {
  let g = models.get(key);
  if (!g) models.set(key, (g = make(key)));
  return g;
}

const ROUGH: WallLook = { height: 1.2, width: 0.75, stone: MOOR_BUILD.grit, dark: MOOR_BUILD.gritDark };
const DRESSED: WallLook = { height: 1.5, width: 0.6, stone: MOOR_BUILD.dressed, dark: MOOR_BUILD.dressedDark, dressed: true };

/** One boardwalk deck in its own frame: planks across on two stringers, a post at each corner going down into the peat. */
function deckModel(d: Deck): BufferGeometry {
  const b = new ModelBuilder(31);
  const len = d.hd * 2;
  const n = Math.max(1, Math.round(len / 0.32));
  for (let i = 0; i < n; i++) b.box(d.hw * 2, 0.07, len / n - 0.05, { at: [0, -0.035, -d.hd + (len / n) * (i + 0.5)], color: i % 3 ? MOOR_BUILD.timber : EARTH.dirtDark, jitter: 0.2 });
  for (const sx of [-1, 1]) {
    b.box(0.12, 0.14, len, { at: [sx * (d.hw - 0.15), -0.14, 0], color: MOOR_BUILD.timber });
    for (const sz of [-1, 1]) b.box(0.14, 1.2, 0.14, { at: [sx * (d.hw - 0.1), -0.65, sz * (d.hd - 0.2)], color: MOOR_BUILD.timber });
  }
  return b.build();
}

/** Chunk `key` of Brackenmoor's `plan`, at `detail`. The same arrays every time, whatever was built before. */
export function buildMoorChunk(plan: MoorPlan, key: ChunkKey, detail: Detail): ChunkData {
  if (!moorChunks().includes(key)) throw new Error(`Chunk ${key} isn't Brackenmoor's`);
  const full = detail === 'full';
  const bounds = chunkBounds(key);
  const region: Region = { ...bounds, owns: (x, z) => x >= bounds.minX && x < bounds.maxX && z >= bounds.minZ && z < bounds.maxZ };
  const raw = new MeshBuffer();
  addMoorGround(raw, plan, region, !full);
  // The bridge's deck carries the road over the beck itself, and Cairnford's setts its streets.
  const bridge = plan.decks[0];
  const paved = pavedAt(plan);
  if (full) {
    addRoads(raw, plan.ground, plan.roads, region, MOOR_GROUND.grass, (x, z) => Math.hypot(x - bridge.x, z - bridge.z) < bridge.hd - 0.6 || paved(x, z) !== null);
    addPaving(raw, plan, region, paved);
  }

  const { near, far } = plants();
  const m = new Matrix4();
  const q = new Quaternion();
  const s = new Vector3();
  const lean = new Matrix4().set(1, MOOR.lean * 0.7, 0, 0, 0, 1, 0, 0, 0, -MOOR.lean * 0.7, 1, 0, 0, 0, 0, 1);
  for (const p of plan.plants) {
    if (!region.owns(p.x, p.z)) continue;
    if (!full && UNDERGROWTH.has(p.kind)) continue;
    const variants = (full ? near : far)[p.kind];
    // Bracken is Oakvale's grass grown tall; heather its rocks' shapes, purple, low and rounded.
    const thin = p.kind === 'cypress' ? 0.4 : 1;
    s.set(p.scale * thin, p.scale * thin * (SQUASH[p.kind] ?? 1), p.scale * thin);
    m.compose(new Vector3(p.x, p.y, p.z), q.setFromAxisAngle(UP, p.yaw), s);
    // Every pine leans the same way, bent by the wind.
    if (p.kind === 'pine') m.premultiply(new Matrix4().makeTranslation(-p.x, -p.y, -p.z)).premultiply(lean).premultiply(new Matrix4().makeTranslation(p.x, p.y, p.z));
    raw.stamp(variants[p.seed % variants.length], m.clone(), 0.92 + ((p.seed >> 4) % 17) / 100);
  }


  for (const st of plan.structures) {
    if (!region.owns(st.x, st.z) || (!full && SMALL.has(st.kind))) continue;
    raw.stamp(once(st, buildMoorStructure), new Matrix4().makeRotationY(st.yaw).setPosition(st.x, st.y, st.z));
  }
  // The walls, a stretch in the chunk its middle is in; a stand-in's plain.
  plan.walls.forEach((w, wi) => {
    const b = new ModelBuilder(500 + wi);
    let any = false;
    for (let i = 0; i < w.pts.length - 1; i++) {
      const [a, c] = [w.pts[i], w.pts[i + 1]];
      if (!region.owns((a[0] + c[0]) / 2, (a[1] + c[1]) / 2)) continue;
      drystone(b, a, c, plan.heightAt, w.dressed ? DRESSED : ROUGH, wi * 1009 + i, !full);
      any = true;
    }
    if (any) raw.stamp(b.build(), new Matrix4());
  });
  // The boardwalk (the bridge is a structure of its own).
  for (const d of plan.decks.slice(1)) {
    if (!region.owns(d.x, d.z) || !full) continue;
    const len = d.hd * 2;
    const pitch = -Math.atan2(d.y1 - d.y0, len);
    raw.stamp(once(d, deckModel), new Matrix4().makeRotationY(d.yaw).multiply(new Matrix4().makeRotationX(pitch)).setPosition(d.x, (d.y0 + d.y1) / 2, d.z));
  }
  const { stone } = plan;
  if (region.owns(stone.x, stone.z)) {
    stoneModel ??= (() => {
      const b = new ModelBuilder(140);
      standingStone(b, [0, 0, 0], stone.h, 0, [0.05, -0.04], false);
      return b.build();
    })();
    raw.stamp(stoneModel, new Matrix4().makeRotationY(stone.yaw).setPosition(stone.x, stone.y, stone.z));
  }

  const arrays = raw.arrays();
  return { key, detail, ...arrays, sphere: sphereAround(arrays.position) };
}

/**
 * One stretch of dry stone wall from `a` to `c` (world floor points),
 * following the ground. Rough walls: two battered courses of rubble in
 * mottled shades, through-stones jutting from their sides, a cope of upright
 * stones along the top. The landlord's: square courses of dressed stone under
 * a flat coping. A stand-in's: one plain battered course.
 */
function drystone(b: ModelBuilder, a: P2, c: P2, heightAt: (x: number, z: number) => number, look: WallLook, seed: number, lite: boolean): void {
  const rand = mulberry32(seed);
  const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
  if (len < 0.05) return;
  const yaw = Math.atan2(c[0] - a[0], c[1] - a[1]);
  const [mx, mz] = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
  const y = Math.min(heightAt(...a), heightAt(...c), heightAt(mx, mz));
  const h = look.height * (look.dressed ? 1 : 0.9 + rand() * 0.2);
  const shade = () => (rand() < 0.5 ? look.stone : look.dark);
  const at = (k: number): readonly [number, number, number] => [mx, y + k, mz];
  const rot = (x = 0): readonly [number, number, number] => [x, yaw, 0];
  const L = len + 0.04;
  if (lite) {
    b.taper(look.width, L, look.width * 0.7, L, h + 0.5, { at: at(-0.5), rot: rot(), color: shade(), jitter: 0.1 });
    return;
  }
  if (look.dressed) {
    const courses = 3;
    const ch = (h + 0.5) / courses;
    for (let k = 0; k < courses; k++) b.box(look.width - k * 0.04, ch + 0.01, L, { at: at(-0.5 + ch * (k + 0.5)), rot: rot(), color: k % 2 ? look.stone : look.dark, jitter: 0.05 });
    b.box(look.width + 0.1, 0.14, L + 0.02, { at: at(h + 0.07), rot: rot(), color: look.dark, jitter: 0.04 });
    return;
  }
  const w = look.width;
  b.taper(w, L, w * 0.84, L, 0.5 + h * 0.5, { at: at(-0.5), rot: rot(), color: shade(), jitter: 0.18 });
  b.taper(w * 0.84, L, w * 0.6, L, h * 0.5, { at: at(h * 0.5), rot: rot(), color: shade(), jitter: 0.18 });
  if (rand() < 0.6) b.box(w * 1.3, 0.12, 0.3, { at: at(h * 0.47), rot: [0, yaw, (rand() - 0.5) * 0.1], color: look.dark, jitter: 0.12 });
  // The cope: stones set on edge across the top, leaning a little.
  const n = Math.max(2, Math.round(len / 0.42));
  const [dx, dz] = [(c[0] - a[0]) / len, (c[1] - a[1]) / len];
  for (let k = 0; k < n; k++) {
    const u = -len / 2 + (k + 0.5) * (len / n);
    const ch = 0.24 + rand() * 0.1;
    b.box(w * 0.55, ch, len / n - 0.03, { at: [mx + dx * u, y + h + ch / 2 - 0.04, mz + dz * u], rot: [(rand() - 0.5) * 0.3, yaw, (rand() - 0.5) * 0.1], color: shade(), jitter: 0.2 });
  }
}

/** Which of Cairnford's setts (if any) cover (x, z): the streets' and the square's setts, a kerb, the footways' flags. */
type Paved = 'sett' | 'kerb' | 'flag' | 'ring' | null;

/** A paving lookup over the plan's paving: by strip, its road's half width telling the carriageway from the footway. */
function pavedAt(plan: MoorPlan): (x: number, z: number) => Paved {
  const { paving } = plan;
  const sq = MOOR.square;
  const strips = paving.strips
    .filter((st) => st.line.length > 1)
    .map((st) => {
      const xs = st.line.map((p) => p[0]);
      const zs = st.line.map((p) => p[1]);
      const road = plan.roads.find((r) => nearestOnPolyline(r.line, ...st.line[1]).d < 0.01) ?? plan.road;
      return { ...st, road: road.width / 2, minX: Math.min(...xs) - st.half, maxX: Math.max(...xs) + st.half, minZ: Math.min(...zs) - st.half, maxZ: Math.max(...zs) + st.half };
    });
  return (x, z) => {
    for (const r of paving.rects) {
      if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
      // The square: a border of paler setts, and a ring of them round the market cross.
      const rim = Math.min(x - r.minX, r.maxX - x, z - r.minZ, r.maxZ - z);
      const ring = Math.abs(Math.hypot(x - sq.x, z - sq.z) - 3.4);
      return rim < 0.6 || ring < 0.3 ? 'ring' : 'sett';
    }
    for (const st of strips) {
      if (x < st.minX || x > st.maxX || z < st.minZ || z > st.maxZ) continue;
      const d = nearestOnPolyline(st.line, x, z).d;
      if (d > st.half) continue;
      return d < st.road ? 'sett' : d < st.road + 0.35 ? 'kerb' : 'flag';
    }
    return null;
  };
}

/**
 * Cairnford's setts over `region`: half-metre cells laid on the ground a
 * little over it, each split as the ground's own cells are so it lies flat on
 * them; the setts mottled, the kerbs pale, the flags a metre square.
 */
function addPaving(raw: MeshBuffer, plan: MoorPlan, region: Region, paved: (x: number, z: number) => Paved): void {
  const { ground } = plan;
  const { rects, strips } = plan.paving;
  const near = [...rects, ...strips.flatMap((st) => st.line.map(([x, z]) => ({ minX: x - st.half, maxX: x + st.half, minZ: z - st.half, maxZ: z + st.half })))].some(
    (r) => r.maxX > region.minX && r.minX < region.maxX && r.maxZ > region.minZ && r.minZ < region.maxZ,
  );
  if (!near) return;
  const setts = MOOR_LAND.sett.map((c) => new Color(c));
  const flags = MOOR_LAND.flag.map((c) => new Color(c));
  const kerb = new Color(MOOR_BUILD.sill);
  const col = new Color();
  const cell = 0.5;
  const v = (x: number, z: number): [number, number, number] => [x, ground.at(x, z) + 0.05, z];
  for (let z = region.minZ; z < region.maxZ; z += cell) {
    for (let x = region.minX; x < region.maxX; x += cell) {
      const kind = paved(x + cell / 2, z + cell / 2);
      if (kind === null) continue;
      if (kind === 'flag') col.copy(flags[Math.floor(hash01(Math.floor(x), Math.floor(z), 401) * flags.length)]);
      else if (kind === 'kerb') col.copy(kerb).multiplyScalar(0.92 + hash01(Math.floor(x), Math.floor(z), 403) * 0.1);
      else if (kind === 'ring') col.copy(flags[Math.floor(hash01(x * 2, z * 2, 405) * flags.length)]).multiplyScalar(0.94);
      else col.copy(setts[Math.floor(hash01(x * 2, z * 2, 407) * setts.length)]);
      col.multiplyScalar(0.95 + hash01(x * 2, z * 2, 409) * 0.08);
      const [a, b, c, d] = [v(x, z), v(x + cell, z), v(x, z + cell), v(x + cell, z + cell)];
      raw.tri(a, b, c, col);
      raw.tri(b, d, c, col);
    }
  }
  // The kerbs: dressed stones along both edges of each street's carriageway, but where another street's crosses.
  const k = new ModelBuilder(611);
  let any = false;
  plan.paving.strips.forEach((st, si) => {
    const road = plan.roads.find((r) => st.line.length > 1 && nearestOnPolyline(r.line, ...st.line[1]).d < 0.01);
    if (!road) return;
    const others = plan.paving.strips.filter((_, oi) => oi !== si);
    for (let i = 0; i < st.line.length - 1; i++) {
      const [p, q] = [st.line[i], st.line[i + 1]];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len < 0.05) continue;
      const [dx, dz] = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
      for (const side of [-1, 1]) {
        const off = road.width / 2 + 0.14;
        const [x, z] = [(p[0] + q[0]) / 2 - dz * off * side, (p[1] + q[1]) / 2 + dx * off * side];
        if (!region.owns(x, z)) continue;
        if (others.some((o) => o.line.length > 1 && nearestOnPolyline(o.line, x, z).d < o.half - 0.3)) continue;
        if (plan.paving.rects.some((r) => x > r.minX - 0.3 && x < r.maxX + 0.3 && z > r.minZ - 0.3 && z < r.maxZ + 0.3)) continue;
        k.box(0.3, 0.3, len + 0.02, { at: [x, ground.at(x, z) - 0.04, z], rot: [0, Math.atan2(dx, dz), 0], color: hash01(i, side, 413) < 0.5 ? MOOR_BUILD.sill : MOOR_BUILD.gritLight, jitter: 0.06 });
        any = true;
      }
    }
  });
  if (any) raw.stamp(k.build(), new Matrix4());
}

/** How much flatter than it's wide a plant stands. */
const SQUASH: Partial<Record<MoorKind, number>> = { heather: 0.45, cotton: 0.7, gorse: 1.15, cypress: 3.2, crag: 0.85 };

/** The border stone, modelled once. */
let stoneModel: BufferGeometry | null = null;

/**
 * The moor's ground over `region`: every height-grid cell at full detail, or
 * at a stand-in's coarser spacing with the road coloured in and a skirt round
 * its edge, one colour a triangle: olive and dry grass, rust bracken and
 * purple heather in their patches, peat and rock on the slopes.
 */
function addMoorGround(raw: MeshBuffer, plan: MoorPlan, region: Region, coarse: boolean): void {
  const { ground, roadDistance } = plan;
  const step = coarse ? Math.round(CONFIG.streaming.standIn.cell / ground.cell) : 1;
  const [i0, i1, j0, j1] = [ground.col(region.minX), ground.col(region.maxX), ground.row(region.minZ), ground.row(region.maxZ)];
  if (i1 <= i0 || j1 <= j0) return;

  const grass = new Color(MOOR_GROUND.grass);
  const dry = new Color(MOOR_GROUND.grassDry);
  const straw = new Color(MOOR_LAND.straw);
  const improved = new Color(MOOR_LAND.improved);
  const improvedLight = new Color(MOOR_LAND.improvedLight);
  const rust = new Color(MOOR_GROUND.bracken);
  const rustDark = new Color(MOOR_GROUND.brackenDark);
  const purple = new Color(MOOR_GROUND.heather);
  const purpleLight = new Color(MOOR_GROUND.heatherLight);
  const bog = new Color(MOOR_LAND.bog);
  const bogWet = new Color(MOOR_LAND.bogWet);
  const cotton = new Color(MOOR_LAND.cotton);
  const sedge = new Color(MOOR_LAND.sedge);
  const worn = new Color(MOOR_LAND.worn);
  const aldhaven = new Color(MOOR_LAND.aldhaven);
  const fens = new Color(MOOR_LAND.fens);
  const peat = new Color(MOOR_GROUND.peat);
  const rock = new Color(MOOR_GROUND.rock);
  const cliff = new Color(MOOR_GROUND.cliff);
  const top = new Color(MOOR_GROUND.hilltop);
  const dirt = new Color(EARTH.dirt);
  const verge = new Color(dirt).lerp(grass, 0.5);
  const color = new Color();
  const tint = new Color();
  // The east edge's seams: Aldhaven's along the Kingsroad's stretch, the fens' along the Fen road's.
  const seam = (x: number, z: number) => {
    const east = smoothstep(212, 258, x);
    if (east <= 0) return { kings: 0, fen: 0 };
    return {
      kings: east * smoothstep(KINGSROAD.minZ - 30, KINGSROAD.minZ, z) * smoothstep(KINGSROAD.maxZ + 8, KINGSROAD.maxZ - 8, z),
      fen: east * smoothstep(FEN_ROAD.minZ - 8, FEN_ROAD.minZ + 8, z) * smoothstep(FEN_ROAD.maxZ + 30, FEN_ROAD.maxZ, z),
    };
  };

  const colourAt = (x: number, z: number, h: number, ny: number, road: number, jitter: number): Color => {
    color.copy(grass).lerp(dry, valueNoise(x * 0.08, z * 0.08, 141) * 0.7);
    color.lerp(straw, drySouth(x, z) * 0.6);
    color.lerp(tint.copy(rust).lerp(rustDark, valueNoise(x * 0.2, z * 0.2, 143)), bracken(x, z) * 0.85);
    color.lerp(tint.copy(purple).lerp(purpleLight, valueNoise(x * 0.25, z * 0.25, 145)), heather(x, z) * 0.85);
    // The landlord's fields: limed and sown, a green nothing else on the moor is.
    color.lerp(tint.copy(improved).lerp(improvedLight, valueNoise(x * 0.1, z * 0.1, 149)), inEnclosure(x, z) * 0.9);
    // The Blackmire: dark wet peat, paler where the cotton grass grows.
    const wet = inBog(x, z);
    if (wet > 0) color.lerp(tint.copy(bog).lerp(cotton, valueNoise(x * 0.15, z * 0.15, 153) * 0.5).lerp(bogWet, smoothstep(MOOR.bog.level + 0.4, MOOR.bog.level, h)), wet);
    color.lerp(top, smoothstep(20, 36, h) * 0.5);
    // Round Cairnford the grass is grazed and trodden short; toward the seams it greens to the neighbours' own.
    color.lerp(worn, inTown(x, z) * 0.7);
    const sm = seam(x, z);
    if (sm.kings > 0) color.lerp(tint.copy(aldhaven).lerp(dry, valueNoise(x * 0.08, z * 0.08, 159) * 0.4), sm.kings * 0.75);
    if (sm.fen > 0) color.lerp(fens, sm.fen * 0.7);
    // Sedge and mud along the beck's banks, and its bed under the water.
    const level = plan.waterLevel(x, z);
    if (!Number.isNaN(level) && wet < 0.5) color.lerp(h < level ? peat : sedge, smoothstep(level + 0.9, level + 0.1, h));
    color.lerp(peat, smoothstep(0.82, 0.62, ny) * 0.5);
    color.lerp(tint.copy(cliff).lerp(rock, valueNoise(x * 0.05, z * 0.05, 147)), smoothstep(0.6, 0.45, ny) * (1 - onHollowhill(x, z)));
    if (road < 2) color.lerp(verge, smoothstep(2, 0, road) * 0.5);
    // A stand-in has no ribbon, so its ground is the road.
    if (coarse && road < 0) color.lerp(dirt, 0.85);
    return color.multiplyScalar(0.95 + jitter * 0.1);
  };
  const v = (i: number, j: number): [number, number, number] => [ground.x(i), ground.get(i, j), ground.z(j)];
  const k = (i: number, j: number) => j * ground.cols + i;
  for (let j = j0; j < j1; j += step) {
    for (let i = i0; i < i1; i += step) {
      const a = v(i, j);
      const b = v(i + step, j);
      const c = v(i, j + step);
      const d = v(i + step, j + step);
      // The same split as HeightGrid.at: a-b-c and b-d-c.
      for (const [p, q, r, ks, t] of [
        [a, b, c, [k(i, j), k(i + step, j), k(i, j + step)], 0],
        [b, d, c, [k(i + step, j), k(i + step, j + step), k(i, j + step)], 1],
      ] as const) {
        const cx = (p[0] + q[0] + r[0]) / 3;
        const cz = (p[2] + q[2] + r[2]) / 3;
        const cy = (p[1] + q[1] + r[1]) / 3;
        const road = Math.min(roadDistance[ks[0]], roadDistance[ks[1]], roadDistance[ks[2]]);
        raw.tri(p, q, r, colourAt(cx, cz, cy, faceUp(p, q, r), road, hash01(i, j, 177 + t + (coarse ? 2 : 0))));
      }
    }
  }
  if (coarse) addSkirt(raw, ground, [i0, i1, j0, j1], step, (x, z, y) => colourAt(x, z, y, 1, Infinity, 0.5));
}

