import { type BufferGeometry, Color, Matrix4, Quaternion, Vector3 } from 'three';
import { CONFIG } from '../../config';
import { ModelBuilder } from '../../models/kit';
import { type ChunkData, type ChunkKey, chunkBounds, chunkCoord, chunkKey, type Detail, sphereAround } from '../../world/chunks';
import type { Deck } from '../decks';
import { standingStone } from '../forest/buildings';
import { planOakvale } from '../forest/layout';
import { plantPrototypes, type Prototypes } from '../forest/nature';
import { EARTH } from '../forest/palette';
import { hash01, smoothstep, valueNoise } from '../forest/noise';
import { addRoads, addSkirt, faceUp, MeshBuffer, type Region } from '../forest/terrain';
import { type WallLook, wallAlong } from '../props';
import { recolour, recolourEach } from '../recolour';
import { buildMoorStructure } from './buildings';
import { bracken, drySouth, heather, inBog, inEnclosure, MOOR, type MoorKind, type MoorPlan, type MoorStructureKind, planBrackenmoor } from './plan';
import { MOOR_BUILD, MOOR_GROUND, MOOR_LAND, MOOR_PLANTS, MOOR_TREES } from './palette';

// Brackenmoor's chunk builder: one 40 m chunk of its plan at full detail or
// as a stand-in, as plain arrays, like Oakvale's (forest/chunks.ts). Free of
// the DOM, so it runs in tests and in its worker. Its plants are Oakvale's
// own shapes with the moor's colours (the same shared material, so no new
// shader): bracken is Oakvale's grass grown tall and turned rust, heather its
// rocks' rounded shapes pressed low and purple, and its pines lean with the wind.

const UP = new Vector3(0, 1, 0);

/** Too small to see from a stand-in's distance. */
const UNDERGROWTH: ReadonlySet<MoorKind> = new Set(['bracken', 'heather', 'cotton', 'reed']);

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
  return (prototypes ??= { near: moorPrototypes(plantPrototypes()), far: moorPrototypes(plantPrototypes(true)) });
}

/** Oakvale's plant shapes in the moor's colours. */
function moorPrototypes(oak: Prototypes): MoorPrototypes {
  return {
    // Each tuft shape twice, the second set's colours two on, so a shape isn't always the same colour.
    bracken: [...recolourEach(oak.grass, MOOR_PLANTS.bracken), ...recolourEach(oak.grass, MOOR_PLANTS.bracken.slice(2))],
    heather: recolourEach(oak.rock, MOOR_PLANTS.heather, true),
    bush: recolourEach(oak.bush, MOOR_PLANTS.bush),
    // Gorse: a bush darker and spikier green, flecked with its yellow flowers.
    gorse: oak.bush.map((g, v) => fleck(recolour(g, MOOR_TREES.gorse[v % 2]), MOOR_TREES.gorseFlower, v)),
    rock: recolourEach(oak.rock, [MOOR_PLANTS.lichen]),
    pine: recolourEach(oak.pine, MOOR_PLANTS.pine),
    // The hawthorns and rowans are Oakvale's young trees, the rowans flecked with their berries.
    hawthorn: recolourEach(oak.young, MOOR_TREES.hawthorn),
    rowan: oak.young.map((g, v) => fleck(recolour(g, MOOR_TREES.rowan[v % 2]), MOOR_TREES.rowanBerry, v + 5)),
    reed: recolourEach(oak.reed, MOOR_TREES.reed),
    // Cotton grass: tufts of pale sedge, their tips the white cotton.
    cotton: oak.grass.map((g, v) => fleck(recolour(g, MOOR_TREES.cotton[v % 2], true), MOOR_TREES.cottonHead, v + 9, 0.3)),
  };
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
]);

/** Each structure's model, made the first time a chunk needs it. */
const models = new WeakMap<object, BufferGeometry>();

function once<T extends object>(key: T, make: (key: T) => BufferGeometry): BufferGeometry {
  let g = models.get(key);
  if (!g) models.set(key, (g = make(key)));
  return g;
}

const ROUGH: WallLook = { height: 1.15, width: 0.75, stone: MOOR_BUILD.grit, dark: MOOR_BUILD.gritDark };
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
  // The bridge's deck carries the road over the beck itself.
  const bridge = plan.decks[0];
  if (full) addRoads(raw, plan.ground, plan.roads, region, MOOR_GROUND.grass, (x, z) => Math.hypot(x - bridge.x, z - bridge.z) < bridge.hd - 0.6);

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
    s.set(p.scale, p.scale * (SQUASH[p.kind] ?? 1), p.scale);
    m.compose(new Vector3(p.x, p.y, p.z), q.setFromAxisAngle(UP, p.yaw), s);
    // Every pine leans the same way, bent by the wind.
    if (p.kind === 'pine') m.premultiply(new Matrix4().makeTranslation(-p.x, -p.y, -p.z)).premultiply(lean).premultiply(new Matrix4().makeTranslation(p.x, p.y, p.z));
    raw.stamp(variants[p.seed % variants.length], m.clone(), 0.92 + ((p.seed >> 4) % 17) / 100);
  }

  for (const st of plan.structures) {
    if (!region.owns(st.x, st.z) || (!full && SMALL.has(st.kind))) continue;
    raw.stamp(once(st, buildMoorStructure), new Matrix4().makeRotationY(st.yaw).setPosition(st.x, st.y, st.z));
  }
  // The walls, a stretch in the chunk its middle is in; a stand-in's without their caps.
  plan.walls.forEach((w, wi) => {
    const b = new ModelBuilder(500 + wi);
    let any = false;
    for (let i = 0; i < w.pts.length - 1; i++) {
      const [a, c] = [w.pts[i], w.pts[i + 1]];
      if (!region.owns((a[0] + c[0]) / 2, (a[1] + c[1]) / 2)) continue;
      wallAlong(b, [a, c], plan.heightAt, w.dressed ? DRESSED : ROUGH, wi * 1009 + i, !full);
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

/** How much flatter than it's wide a plant stands. */
const SQUASH: Partial<Record<MoorKind, number>> = { heather: 0.45, cotton: 0.7, gorse: 1.15 };

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
  const cobble = new Color(MOOR_LAND.cobble);
  const cobbleDark = new Color(MOOR_LAND.cobbleDark);
  const peat = new Color(MOOR_GROUND.peat);
  const rock = new Color(MOOR_GROUND.rock);
  const cliff = new Color(MOOR_GROUND.cliff);
  const top = new Color(MOOR_GROUND.hilltop);
  const dirt = new Color(EARTH.dirt);
  const verge = new Color(dirt).lerp(grass, 0.5);
  const color = new Color();
  const tint = new Color();
  const sq = MOOR.square;

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
    // Sedge and mud along the beck's banks, and its bed under the water.
    const level = plan.waterLevel(x, z);
    if (!Number.isNaN(level) && wet < 0.5) color.lerp(h < level ? peat : sedge, smoothstep(level + 0.9, level + 0.1, h));
    color.lerp(peat, smoothstep(0.82, 0.62, ny) * 0.5);
    color.lerp(tint.copy(cliff).lerp(rock, valueNoise(x * 0.05, z * 0.05, 147)), smoothstep(0.6, 0.45, ny));
    // Cairnford's cobbled square.
    if (Math.abs(x - sq.x) < sq.hw && Math.abs(z - sq.z) < sq.hd) color.copy(cobble).lerp(cobbleDark, hash01(Math.floor(x), Math.floor(z), 157));
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

