import { type BufferGeometry, Color, Matrix4, Quaternion, Vector3 } from 'three';
import { CONFIG } from '../../config';
import { type ChunkData, type ChunkKey, chunkBounds, chunkCoord, chunkKey, type Detail, sphereAround } from '../../world/chunks';
import { plantPrototypes, type Prototypes } from '../forest/nature';
import { EARTH } from '../forest/palette';
import { fbm, hash01, smoothstep, valueNoise } from '../forest/noise';
import { addRoads, addSkirt, faceUp, MeshBuffer, type Region } from '../forest/terrain';
import { recolourEach } from '../recolour';
import { buildDeck, buildFenStructure, deadTree, pollard, reedClump, roadLog } from './models';
import { type FenKind, PLACES, planSallows, SALLOWS, type SallowsPlan, UNDERGROWTH } from './plan';
import { FEN_GROUND, FEN_PLANTS } from './palette';

// The Sallows' chunk builder: one 40 m chunk of its plan at full detail or
// as a stand-in, as plain arrays, like Oakvale's and Brackenmoor's. Free of
// the DOM, so it runs in tests and in its worker. Its trees are Oakvale's
// shapes in the fens' colours on the one shared material; its reeds are a
// clump of their own, thinned and broadened in a stand-in, where the fog
// does the rest of the hiding.

const UP = new Vector3(0, 1, 0);

/** The Sallows' chunks, west to east along each row, north to south. */
export function sallowsChunks(): ChunkKey[] {
  const { land } = SALLOWS;
  const size = CONFIG.streaming.chunk;
  const keys: ChunkKey[] = [];
  for (let j = chunkCoord(land.minZ + size / 2); j <= chunkCoord(land.maxZ - size / 2); j++) {
    for (let i = chunkCoord(land.minX + size / 2); i <= chunkCoord(land.maxX - size / 2); i++) keys.push(chunkKey(i, j));
  }
  return keys;
}

let planned: SallowsPlan | null = null;

/** The Sallows' plan, made once: the zone and its worker each make their own. */
export function sallowsPlan(): SallowsPlan {
  return (planned ??= planSallows());
}

/** The Sallows' builder over its plan, made now: what its worker runs. */
export function sallowsBuilder(): (key: ChunkKey, detail: Detail) => ChunkData {
  const plan = sallowsPlan();
  return (key, detail) => buildSallowsChunk(plan, key, detail);
}

type FenPrototypes = Record<FenKind, BufferGeometry[]>;

let prototypes: { near: FenPrototypes; far: FenPrototypes } | null = null;

/** Every fen plant's models, near and far: Oakvale's shapes recoloured, and the fens' own reeds, pollards and dead trees. */
function plants(): { near: FenPrototypes; far: FenPrototypes } {
  return (prototypes ??= { near: fenPrototypes(plantPrototypes(), false), far: fenPrototypes(plantPrototypes(true), true) });
}

function fenPrototypes(oak: Prototypes, lite: boolean): FenPrototypes {
  const variants = (n: number, make: (v: number) => BufferGeometry) => Array.from({ length: n }, (_, v) => make(v));
  return {
    reed: variants(4, (v) => reedClump(v, lite)),
    sedge: recolourEach(oak.grass, FEN_PLANTS.sedge),
    willow: recolourEach(oak.oak, FEN_PLANTS.willow),
    alder: recolourEach(oak.oak, FEN_PLANTS.alder),
    pollard: variants(3, pollard),
    lily: recolourEach(oak.lily, [FEN_PLANTS.lily]),
    deadTree: variants(3, deadTree),
    juniper: recolourEach(oak.pine, FEN_PLANTS.juniper),
    samphire: [...recolourEach(oak.grass, FEN_PLANTS.samphire), ...recolourEach(oak.flower.slice(2, 3), [FEN_PLANTS.lavender])],
    cotton: [oak.flower[1]],
    rock: recolourEach(oak.rock, [FEN_PLANTS.lichen]),
    chalkRock: recolourEach(oak.rock, [0xdad6c4], true),
    rubble: recolourEach(oak.rock, [0x3e4a43, 0x56645a], true),
  };
}

/** Each structure's and deck's model, built once (by its place in the plan) and stamped wherever its chunk is built. */
const structureModels = new Map<number, BufferGeometry>();
const deckModels = new Map<number, BufferGeometry>();
let logModels: BufferGeometry[] | null = null;

/** Chunk `key` of the Sallows' `plan`, at `detail`. The same arrays every time, whatever was built before. */
export function buildSallowsChunk(plan: SallowsPlan, key: ChunkKey, detail: Detail): ChunkData {
  if (!sallowsChunks().includes(key)) throw new Error(`Chunk ${key} isn't the Sallows'`);
  const full = detail === 'full';
  const bounds = chunkBounds(key);
  const region: Region = { ...bounds, owns: (x, z) => x >= bounds.minX && x < bounds.maxX && z >= bounds.minZ && z < bounds.maxZ };
  const raw = new MeshBuffer();
  addFenGround(raw, plan, region, !full);
  if (full) addRoads(raw, plan.ground, plan.roads, region, FEN_GROUND.sedge);

  const m = new Matrix4();
  const q = new Quaternion();
  const s = new Vector3();
  const p = new Vector3();
  const { near, far } = plants();
  let reeds = 0;
  for (const pl of plan.plants) {
    if (!region.owns(pl.x, pl.z)) continue;
    if (!full && UNDERGROWTH.has(pl.kind)) continue;
    // A stand-in keeps one reed clump in three, broader.
    if (!full && pl.kind === 'reed' && reeds++ % 3 !== 0) continue;
    const variants = (full ? near : far)[pl.kind];
    const wide = !full && pl.kind === 'reed' ? 1.7 : 1;
    // Juniper squat, willows broad and low.
    const sy = pl.kind === 'juniper' ? 0.6 : pl.kind === 'willow' ? 0.85 : 1;
    s.set(pl.scale * wide, pl.scale * sy, pl.scale * wide);
    m.compose(p.set(pl.x, pl.y, pl.z), q.setFromAxisAngle(UP, pl.yaw), s);
    raw.stamp(variants[pl.seed % variants.length], m.clone(), 0.92 + ((pl.seed >> 4) % 17) / 100);
  }

  plan.structures.forEach((st, i) => {
    if (!region.owns(st.x, st.z)) return;
    // Graves, decoys and eel traps are too small for a stand-in.
    if (!full && (st.kind === 'grave' || st.kind === 'decoys' || st.kind === 'eelTraps' || st.kind === 'crates')) return;
    let g = structureModels.get(i);
    if (!g) structureModels.set(i, (g = buildFenStructure(st)));
    raw.stamp(g, new Matrix4().makeRotationY(st.yaw).setPosition(st.x, st.y, st.z));
  });
  plan.decks.forEach((d, i) => {
    if (!region.owns(d.x, d.z)) return;
    let g = deckModels.get(i);
    if (!g) deckModels.set(i, (g = buildDeck(d)));
    raw.stamp(g, new Matrix4().makeRotationY(d.yaw).setPosition(d.x, 0, d.z));
  });
  if (full) addLogs(raw, plan, region);

  const arrays = raw.arrays();
  return { key, detail, ...arrays, sphere: sphereAround(arrays.position) };
}

/** The Fen road's corduroy: logs laid across it over the bog, the ground's colour showing between. */
function addLogs(raw: MeshBuffer, plan: SallowsPlan, region: Region): void {
  logModels ??= [0, 1, 2].map((v) => roadLog(3.6, v + 1));
  const road = plan.roads.find((r) => r.logs);
  if (!road) return;
  const { line, heights } = road;
  for (let i = 1; i < line.length - 1; i++) {
    const [x, z] = line[i];
    if (!region.owns(x, z)) continue;
    const [px, pz] = line[i - 1];
    const [nx, nz] = line[i + 1];
    const yaw = Math.atan2(nx - px, nz - pz);
    for (const t of [0, 0.5]) {
      const lx = x + (nx - x) * t;
      const lz = z + (nz - z) * t;
      const y = heights[i] + (heights[i + 1] - heights[i]) * t + 0.16;
      const k = Math.floor(hash01(i, t * 2, 41) * 3);
      raw.stamp(logModels[k], new Matrix4().makeRotationY(yaw + (hash01(i, t * 2, 43) - 0.5) * 0.08).setPosition(lx, y, lz));
    }
  }
}

/**
 * The fens' ground over `region`: every height-grid cell at full detail, or
 * at a stand-in's coarser spacing with the roads coloured in and a skirt
 * round its edge, one colour a triangle: black peat and grey silt at the
 * water's edge, sedge green and reed straw over the holms, pale shell banks
 * on the eastern flats, rust bog-iron seeps in the Mire, chalk at Kiln Edge
 * and heath on the western hills.
 */
function addFenGround(raw: MeshBuffer, plan: SallowsPlan, region: Region, coarse: boolean): void {
  const { ground, roadDistance } = plan;
  const step = coarse ? Math.round(CONFIG.streaming.standIn.cell / ground.cell) : 1;
  const [i0, i1, j0, j1] = [ground.col(region.minX), ground.col(region.maxX), ground.row(region.minZ), ground.row(region.maxZ)];
  if (i1 <= i0 || j1 <= j0) return;

  const peat = new Color(FEN_GROUND.peat);
  const peatDark = new Color(FEN_GROUND.peatDark);
  const silt = new Color(FEN_GROUND.silt);
  const sedge = new Color(FEN_GROUND.sedge);
  const sedgeDry = new Color(FEN_GROUND.sedgeDry);
  const straw = new Color(FEN_GROUND.straw);
  const shell = new Color(FEN_GROUND.shell);
  const mud = new Color(FEN_GROUND.mud);
  const rust = new Color(FEN_GROUND.rust);
  const chalk = new Color(FEN_GROUND.chalk);
  const chalkGrass = new Color(FEN_GROUND.chalkGrass);
  const heath = new Color(FEN_GROUND.heath);
  const dirt = new Color(EARTH.dirt);
  const verge = new Color(dirt).lerp(sedge, 0.5);
  const color = new Color();
  const tint = new Color();

  const colourAt = (x: number, z: number, h: number, ny: number, road: number, jitter: number): Color => {
    // Over the holms, sedge and reed straw in patches.
    color.copy(sedge).lerp(sedgeDry, valueNoise(x * 0.07, z * 0.07, 241) * 0.8);
    color.lerp(straw, smoothstep(0.45, 0.65, fbm(x * 0.03, z * 0.03, 243)) * 0.6);
    // Down to the water: wet peat, then silt and mud below it.
    color.lerp(tint.copy(peat).lerp(peatDark, valueNoise(x * 0.2, z * 0.2, 245)), smoothstep(0.45, 0.15, h));
    color.lerp(tint.copy(silt).lerp(mud, valueNoise(x * 0.15, z * 0.15, 247)), smoothstep(0.05, -0.3, h));
    // Shell banks on the eastern flats.
    color.lerp(shell, smoothstep(640, 660, x) * smoothstep(-0.1, 0.25, h) * 0.75);
    // Rust seeps in the Mire.
    color.lerp(rust, smoothstep(40, 24, Math.hypot(x - PLACES.mire.x, z - PLACES.mire.z)) * smoothstep(0.62, 0.72, valueNoise(x * 0.12, z * 0.12, 249)) * 0.8);
    // Chalk at Kiln Edge, heath on the rim hills.
    const ch = smoothstep(350, 320, x) * smoothstep(850, 880, z);
    color.lerp(tint.copy(chalkGrass).lerp(chalk, smoothstep(0.75, 0.55, ny) + valueNoise(x * 0.3, z * 0.3, 251) * 0.3), ch * 0.85);
    color.lerp(heath, smoothstep(2.5, 6, h) * (1 - ch) * 0.7);
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
        raw.tri(p, q, r, colourAt(cx, cz, cy, faceUp(p, q, r), road, hash01(i, j, 277 + t + (coarse ? 2 : 0))));
      }
    }
  }
  if (coarse) addSkirt(raw, ground, [i0, i1, j0, j1], step, (x, z, y) => colourAt(x, z, y, 1, Infinity, 0.5));
}
