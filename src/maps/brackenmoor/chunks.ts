import { BufferAttribute, type BufferGeometry, Color, Matrix4, Quaternion, Vector3 } from 'three';
import { CONFIG } from '../../config';
import { ModelBuilder } from '../../models/kit';
import { type ChunkData, type ChunkKey, chunkBounds, chunkCoord, chunkKey, type Detail, sphereAround } from '../../world/chunks';
import { standingStone } from '../forest/buildings';
import { planOakvale } from '../forest/layout';
import { plantPrototypes, type Prototypes } from '../forest/nature';
import { EARTH } from '../forest/palette';
import { hash01, smoothstep, valueNoise } from '../forest/noise';
import { addRoads, addSkirt, faceUp, MeshBuffer, type Region } from '../forest/terrain';
import { bracken, heather, MOOR, type MoorKind, type MoorPlan, planBrackenmoor } from './plan';
import { MOOR_GROUND, MOOR_PLANTS } from './palette';

// Brackenmoor's chunk builder: one 40 m chunk of its plan at full detail or
// as a stand-in, as plain arrays, like Oakvale's (forest/chunks.ts). Free of
// the DOM, so it runs in tests and in its worker. Its plants are Oakvale's
// own shapes with the moor's colours (the same shared material, so no new
// shader): bracken is Oakvale's grass grown tall and turned rust, heather its
// rocks' rounded shapes pressed low and purple, and its pines lean with the wind.

const UP = new Vector3(0, 1, 0);

/** Too small to see from a stand-in's distance. */
const UNDERGROWTH: ReadonlySet<MoorKind> = new Set(['bracken', 'heather']);

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
  const each = (from: BufferGeometry[], palette: readonly number[]) => from.map((g, v) => recolour(g, palette[v % palette.length]));
  return {
    // Each tuft shape twice, the second set's colours two on, so a shape isn't always the same colour.
    bracken: [...each(oak.grass, MOOR_PLANTS.bracken), ...each(oak.grass, MOOR_PLANTS.bracken.slice(2))],
    heather: oak.rock.map((g, v) => recolour(g, MOOR_PLANTS.heather[v % MOOR_PLANTS.heather.length], true)),
    bush: each(oak.bush, MOOR_PLANTS.bush),
    rock: each(oak.rock, [MOOR_PLANTS.lichen]),
    pine: each(oak.pine, MOOR_PLANTS.pine),
  };
}

const _c = new Color();
const _to = new Color();

/**
 * A copy of `g` with its greens (leaves, needles, blades, moss), or with
 * `all` its colours, turned to `hex`, each as much lighter or darker than the
 * rest as it was; bark, stone and berries otherwise as they were.
 */
function recolour(g: BufferGeometry, hex: number, all = false): BufferGeometry {
  const out = g.clone();
  const col = out.getAttribute('color');
  const green = (i: number) => all || col.getY(i) >= col.getX(i);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < col.count; i++) if (green(i)) [sum, n] = [sum + col.getY(i), n + 1];
  const mean = n ? sum / n : 1;
  _to.setHex(hex);
  const colors = new Float32Array(col.count * 3);
  for (let i = 0; i < col.count; i++) {
    _c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
    if (green(i)) _c.copy(_to).multiplyScalar(col.getY(i) / mean);
    colors.set([_c.r, _c.g, _c.b], i * 3);
  }
  out.setAttribute('color', new BufferAttribute(colors, 3));
  return out;
}

/** The border stone, modelled once. */
let stoneModel: BufferGeometry | null = null;

/** Chunk `key` of Brackenmoor's `plan`, at `detail`. The same arrays every time, whatever was built before. */
export function buildMoorChunk(plan: MoorPlan, key: ChunkKey, detail: Detail): ChunkData {
  if (!moorChunks().includes(key)) throw new Error(`Chunk ${key} isn't Brackenmoor's`);
  const full = detail === 'full';
  const bounds = chunkBounds(key);
  const region: Region = { ...bounds, owns: (x, z) => x >= bounds.minX && x < bounds.maxX && z >= bounds.minZ && z < bounds.maxZ };
  const raw = new MeshBuffer();
  addMoorGround(raw, plan, region, !full);
  if (full) addRoads(raw, plan.ground, [plan.road], region, MOOR_GROUND.grass);

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
    s.set(p.scale, p.kind === 'heather' ? p.scale * 0.45 : p.scale, p.scale);
    m.compose(new Vector3(p.x, p.y, p.z), q.setFromAxisAngle(UP, p.yaw), s);
    // Every pine leans the same way, bent by the wind.
    if (p.kind === 'pine') m.premultiply(new Matrix4().makeTranslation(-p.x, -p.y, -p.z)).premultiply(lean).premultiply(new Matrix4().makeTranslation(p.x, p.y, p.z));
    raw.stamp(variants[p.seed % variants.length], m.clone(), 0.92 + ((p.seed >> 4) % 17) / 100);
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
  const rust = new Color(MOOR_GROUND.bracken);
  const rustDark = new Color(MOOR_GROUND.brackenDark);
  const purple = new Color(MOOR_GROUND.heather);
  const purpleLight = new Color(MOOR_GROUND.heatherLight);
  const peat = new Color(MOOR_GROUND.peat);
  const rock = new Color(MOOR_GROUND.rock);
  const cliff = new Color(MOOR_GROUND.cliff);
  const top = new Color(MOOR_GROUND.hilltop);
  const dirt = new Color(EARTH.dirt);
  const verge = new Color(dirt).lerp(grass, 0.5);
  const color = new Color();
  const tint = new Color();

  const colourAt = (x: number, z: number, h: number, ny: number, road: number, jitter: number): Color => {
    color.copy(grass).lerp(dry, valueNoise(x * 0.08, z * 0.08, 141) * 0.7);
    color.lerp(tint.copy(rust).lerp(rustDark, valueNoise(x * 0.2, z * 0.2, 143)), bracken(x, z) * 0.85);
    color.lerp(tint.copy(purple).lerp(purpleLight, valueNoise(x * 0.25, z * 0.25, 145)), heather(x, z) * 0.85);
    color.lerp(top, smoothstep(MOOR.floor + 14, MOOR.floor + 30, h) * 0.5);
    color.lerp(peat, smoothstep(0.82, 0.62, ny) * 0.5);
    color.lerp(tint.copy(cliff).lerp(rock, valueNoise(x * 0.05, z * 0.05, 147)), smoothstep(0.6, 0.45, ny));
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

