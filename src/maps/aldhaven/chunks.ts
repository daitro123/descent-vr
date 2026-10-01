import { BufferAttribute, type BufferGeometry, Color, Matrix4, Quaternion, Vector3 } from 'three';
import { CONFIG } from '../../config';
import { type ChunkData, type ChunkKey, chunkBounds, chunkCoord, chunkKey, type Detail, sphereAround } from '../../world/chunks';
import { plantPrototypes, type Prototypes } from '../forest/nature';
import { hash01, smoothstep, valueNoise } from '../forest/noise';
import { addRoads, addSkirt, faceUp, MeshBuffer, type Region } from '../forest/terrain';
import { buildPiece } from './buildings';
import { CITY_GROUND, CITY_TREES } from './palette';
import { ALDHAVEN, type AldhavenPlan, type CityPlantKind, planAldhaven, SMALL, UNDERGROWTH } from './plan';

// Aldhaven's chunk builder: one 40 m chunk of its plan at full detail or as a
// stand-in, as plain arrays, like Oakvale's (forest/chunks.ts). Free of the
// DOM, so it runs in tests and in its worker. Everything goes in the chunk its
// middle is in. A stand-in keeps the city's skyline (the walls, the gates,
// the landmarks) as they are, turns every house to its body and roof, and
// drops the props and the undergrowth: from Westwatch the whole city is
// stand-ins but its landmarks (the spec's worst case).

const UP = new Vector3(0, 1, 0);

/** Aldhaven's chunks, west to east along each row, north to south. */
export function aldhavenChunks(): ChunkKey[] {
  const { land, at } = ALDHAVEN;
  const size = CONFIG.streaming.chunk;
  const keys: ChunkKey[] = [];
  for (let j = chunkCoord(land.minZ + at.z + size / 2); j <= chunkCoord(land.maxZ + at.z - size / 2); j++) {
    for (let i = chunkCoord(land.minX + at.x + size / 2); i <= chunkCoord(land.maxX + at.x - size / 2); i++) keys.push(chunkKey(i, j));
  }
  return keys;
}

/** Its plan, made now: what the zone and its worker both build from. */
export function aldhavenBuilder(): (key: ChunkKey, detail: Detail) => ChunkData {
  const plan = planAldhaven();
  return (key, detail) => buildAldhavenChunk(plan, key, detail);
}

type CityPrototypes = Record<CityPlantKind, BufferGeometry[]>;

let prototypes: { near: CityPrototypes; far: CityPrototypes } | null = null;

/** Every plant's models, near and far, from Oakvale's shapes in the city's colours. */
function plants(): { near: CityPrototypes; far: CityPrototypes } {
  return (prototypes ??= { near: cityPrototypes(plantPrototypes()), far: cityPrototypes(plantPrototypes(true)) });
}

function cityPrototypes(oak: Prototypes): CityPrototypes {
  const each = (from: BufferGeometry[], palette: readonly number[]) => from.map((g, v) => recolour(g, palette[v % palette.length]));
  return {
    plane: each(oak.oak, CITY_TREES.plane),
    oak: each(oak.oak, CITY_TREES.oak),
    pine: each(oak.pine, CITY_TREES.pine),
    orchard: each(oak.young, CITY_TREES.orchard),
    hedge: each(oak.bush, CITY_TREES.hedge),
    bush: each(oak.bush, [CITY_GROUND.gorse, ...CITY_TREES.hedge]),
    rock: oak.rock,
    reed: oak.reed,
    grass: oak.grass,
    flower: oak.flower,
  };
}

const _c = new Color();
const _to = new Color();

/** A copy of `g` with its greens turned to `hex`, each as much lighter or darker than the rest as it was. */
function recolour(g: BufferGeometry, hex: number): BufferGeometry {
  const out = g.clone();
  const col = out.getAttribute('color');
  const green = (i: number) => col.getY(i) >= col.getX(i);
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

/** The chunk that owns (x, z): its own, or the nearest of Aldhaven's. */
function ownerOf(x: number, z: number, keys: readonly ChunkKey[]): ChunkKey {
  const key = chunkKey(chunkCoord(x), chunkCoord(z));
  if (keys.includes(key)) return key;
  const { land, at } = ALDHAVEN;
  const size = CONFIG.streaming.chunk;
  const cx = Math.min(land.maxX + at.x - size / 2, Math.max(land.minX + at.x + size / 2, x));
  const cz = Math.min(land.maxZ + at.z - size / 2, Math.max(land.minZ + at.z + size / 2, z));
  return chunkKey(chunkCoord(cx), chunkCoord(cz));
}

/** Chunk `key` of Aldhaven's `plan`, at `detail`. The same arrays every time, whatever was built before. */
export function buildAldhavenChunk(plan: AldhavenPlan, key: ChunkKey, detail: Detail): ChunkData {
  const keys = aldhavenChunks();
  if (!keys.includes(key)) throw new Error(`Chunk ${key} isn't Aldhaven's`);
  const full = detail === 'full';
  const bounds = chunkBounds(key);
  const region: Region = { ...bounds, owns: (x, z) => ownerOf(x, z, keys) === key };
  const raw = new MeshBuffer();
  addCityGround(raw, plan, region, !full);
  // The dirt roads outside the walls, but not over the bridges' decks: the stone shows there.
  if (full) addRoads(raw, plan.ground, plan.streets.filter((s) => s.dirt), region, CITY_GROUND.grass, (x, z) => plan.deckAt(x, z) !== null);

  const m = new Matrix4();
  for (const p of plan.pieces) {
    if (!region.owns(p.x, p.z)) continue;
    if (!full && SMALL.has(p.kind)) continue;
    raw.stamp(buildPiece(p, !full), new Matrix4().makeRotationY(p.yaw).setPosition(p.x, p.y, p.z));
  }

  const { near, far } = plants();
  const q = new Quaternion();
  const s = new Vector3();
  for (const p of plan.plants) {
    if (!region.owns(p.x, p.z)) continue;
    if (!full && UNDERGROWTH.has(p.kind)) continue;
    const variants = (full ? near : far)[p.kind];
    s.setScalar(p.scale);
    if (p.kind === 'hedge') s.set(p.scale * 1.1, p.scale * 0.9, p.scale * 1.1);
    m.compose(new Vector3(p.x, p.y, p.z), q.setFromAxisAngle(UP, p.yaw), s);
    raw.stamp(variants[p.seed % variants.length], m.clone(), 0.92 + ((p.seed >> 4) % 17) / 100);
  }

  const arrays = raw.arrays();
  return { key, detail, ...arrays, sphere: sphereAround(arrays.position) };
}

/**
 * The city's ground over `region`, one colour a triangle: pale limestone
 * setts inside the walls (Old Town's black basalt), the gardens' lawns, the
 * fields' green and gold in their strips outside, sand and mud down to the
 * water, the gorge's granite, and the river's and the sea's muddy beds.
 */
function addCityGround(raw: MeshBuffer, plan: AldhavenPlan, region: Region, coarse: boolean): void {
  const { ground } = plan;
  const step = coarse ? Math.round(CONFIG.streaming.standIn.cell / ground.cell) : 1;
  const [i0, i1, j0, j1] = [ground.col(region.minX), ground.col(region.maxX), ground.row(region.minZ), ground.row(region.maxZ)];
  if (i1 <= i0 || j1 <= j0) return;

  const c = (hex: number) => new Color(hex);
  const G = {
    setts: c(CITY_GROUND.setts),
    settsDark: c(CITY_GROUND.settsDark),
    settsLight: c(CITY_GROUND.settsLight),
    basalt: c(CITY_GROUND.basalt),
    basaltDark: c(CITY_GROUND.basaltDark),
    grass: c(CITY_GROUND.grass),
    grassLight: c(CITY_GROUND.grassLight),
    grassDry: c(CITY_GROUND.grassDry),
    field: c(CITY_GROUND.field),
    fieldGold: c(CITY_GROUND.fieldGold),
    sand: c(CITY_GROUND.sand),
    mud: c(CITY_GROUND.mud),
    granite: c(CITY_GROUND.granite),
    graniteDark: c(CITY_GROUND.graniteDark),
    yard: c(CITY_GROUND.yard),
    yardDark: c(CITY_GROUND.yardDark),
  };
  const color = new Color();
  const tint = new Color();
  const water = ALDHAVEN.water;

  const colourAt = (x: number, z: number, h: number, ny: number, jitter: number): Color => {
    const here = plan.surface(x, z);
    if (here.paved && h > water + 0.6) {
      if (here.basalt) color.copy(G.basalt).lerp(G.basaltDark, valueNoise(x * 0.6, z * 0.6, 301));
      else color.copy(G.setts).lerp(valueNoise(x * 0.5, z * 0.5, 303) < 0.5 ? G.settsDark : G.settsLight, valueNoise(x * 1.3, z * 1.3, 305) * 0.6);
      // The setts' courses: a faint check, a cell to a stone.
      color.multiplyScalar(0.96 + 0.06 * (((Math.floor(x / 2) + Math.floor(z / 2)) & 1) as number));
      // The streets' middles, worn darker by the wheels; the squares' and the quays' setts stay pale.
      if (here.street) color.lerp(here.basalt ? G.basaltDark : G.settsDark, 0.3).multiplyScalar(0.97);
    } else if (here.yard) {
      // A back yard: packed earth, grass coming through at its edges.
      color.copy(G.yard).lerp(G.yardDark, valueNoise(x * 0.7, z * 0.7, 321) * 0.7);
      color.lerp(G.grass, smoothstep(0.55, 0.8, valueNoise(x * 0.35, z * 0.35, 323)) * 0.7);
    } else if (here.field) {
      const strip = Math.floor((z + 2 * Math.floor(x / 22)) / 7) & 1;
      color.copy(strip ? G.field : G.fieldGold).lerp(G.grass, valueNoise(x * 0.1, z * 0.1, 307) * 0.4);
    } else {
      color.copy(G.grass).lerp(here.garden ? G.grassLight : G.grassDry, valueNoise(x * 0.08, z * 0.08, 309) * 0.6);
    }
    // Down to the water: sand, then mud; the beds under it mud.
    if (h < water + 1.0 && !here.paved) color.lerp(G.sand, smoothstep(water + 1.0, water + 0.2, h));
    if (h < water + 0.1) color.lerp(G.mud, smoothstep(water + 0.1, water - 0.8, h));
    // Steep ground is rock: the fells' and the escarpment's granite in its beds, the river's banks; grass holds on its ledges.
    tint.copy(G.granite).lerp(G.graniteDark, valueNoise(x * 0.05, z * 0.05, 311)).multiplyScalar(0.9 + 0.12 * Math.sin(h * 1.7 + valueNoise(x * 0.1, z * 0.1, 313) * 3));
    color.lerp(tint, smoothstep(0.78, 0.5, ny) * (0.55 + 0.45 * smoothstep(0.35, 0.6, valueNoise(x * 0.18, z * 0.18, 315))));
    return color.multiplyScalar(0.95 + jitter * 0.1);
  };
  const v = (i: number, j: number): [number, number, number] => [ground.x(i), ground.get(i, j), ground.z(j)];
  for (let j = j0; j < j1; j += step) {
    for (let i = i0; i < i1; i += step) {
      const a = v(i, j);
      const b = v(i + step, j);
      const cc = v(i, j + step);
      const d = v(i + step, j + step);
      // The same split as HeightGrid.at: a-b-c and b-d-c.
      for (const [p, q, r, t] of [
        [a, b, cc, 0],
        [b, d, cc, 1],
      ] as const) {
        const cx = (p[0] + q[0] + r[0]) / 3;
        const cz = (p[2] + q[2] + r[2]) / 3;
        const cy = (p[1] + q[1] + r[1]) / 3;
        raw.tri(p, q, r, colourAt(cx, cz, cy, faceUp(p, q, r), hash01(i, j, 377 + t + (coarse ? 2 : 0))));
      }
    }
  }
  if (coarse) addSkirt(raw, ground, [i0, i1, j0, j1], step, (x, z, y) => colourAt(x, z, y, 1, 0.5));
}
