import { type BufferGeometry, Matrix4, Quaternion, Vector3 } from 'three';
import { CONFIG } from '../../config';
import { ModelBuilder } from '../../models/kit';
import { type ChunkData, type ChunkKey, chunkBounds, chunkCoord, chunkIndex, chunkKey, type Detail, sphereAround } from '../../world/chunks';
import { buildFence, buildField, buildStructure } from './buildings';
import { FOREST, type ForestLayout, type PlantKind, planOakvale } from './layout';
import { plantPrototypes, type Prototypes } from './nature';
import { addGround, addPaths, addYards, MeshBuffer, type Region } from './terrain';

// Oakvale's chunk builder: one 40 m chunk of its plan at full detail or as a
// stand-in, as plain arrays. Free of the DOM, so it runs in tests and in its
// worker (chunkWorker.ts). Everything in the plan goes in the chunk its origin is
// in: a tree, a building, a field, a fence's first post, a road's stretch.
//
// A stand-in is for far off, past CONFIG.streaming.full: coarse ground with
// the roads coloured in, the cheaper trees the mountains use, the buildings
// and fields as they are, and none of the undergrowth, fences or worn earth.
// At full detail the cheaper trees stand on the mountains and deep in the
// woods, and the chunks round the zone's edge have their mountains' trees
// thinned (the triangle budget's cuts, CONFIG.streaming.trees).

const UP = new Vector3(0, 1, 0);

/** Too small to see from a stand-in's distance. */
const UNDERGROWTH: ReadonlySet<PlantKind> = new Set(['grass', 'flower', 'mushroom', 'log', 'stump', 'reed', 'lily']);

/** Trees farther than this (m) from where you can walk are the mountains': the cheaper ones. */
const FAR_TREES = 6;

/**
 * Deep in the woods: off every road's verge (the plan's road distances reach
 * only that far) and clear of every clearing, where you only ever see a tree
 * past others, so the cheaper trees go unnoticed.
 */
function deepInWoods(plan: ForestLayout, x: number, z: number): boolean {
  const margin = CONFIG.streaming.trees.clearing;
  return !Number.isFinite(plan.roadDistance.at(x, z)) && plan.clearings.every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + margin);
}

/** The chunk grid's reach over Oakvale's terrain, ±FOREST.half: 7 by 7 chunks. */
const REACH = chunkCoord(FOREST.half - 1e-6);

/** Oakvale's chunks, west to east along each row, north to south. */
export function oakvaleChunks(): ChunkKey[] {
  const keys: ChunkKey[] = [];
  for (let j = -REACH; j <= REACH; j++) for (let i = -REACH; i <= REACH; i++) keys.push(chunkKey(i, j));
  return keys;
}

/** The chunk that owns (x, z): its own, or the nearest of Oakvale's for anything past the terrain's edge (the main road runs on south). */
function ownerOf(x: number, z: number): ChunkKey {
  const clamp = (v: number) => Math.max(-REACH, Math.min(REACH, chunkCoord(v)));
  return chunkKey(clamp(x), clamp(z));
}

let prototypes: { near: Prototypes; far: Prototypes } | null = null;

/** Every plant kind's models, near and far, built once. */
function plants(): { near: Prototypes; far: Prototypes } {
  return (prototypes ??= { near: plantPrototypes(), far: plantPrototypes(true) });
}

/** Each plan's buildings, fields and fences, modelled once: a chunk swapping detail stamps them again. */
const models = new WeakMap<ForestLayout, Map<object, BufferGeometry>>();

function once(plan: ForestLayout, thing: object, build: () => BufferGeometry): BufferGeometry {
  let built = models.get(plan);
  if (!built) models.set(plan, (built = new Map()));
  let g = built.get(thing);
  if (!g) built.set(thing, (g = build()));
  return g;
}

/** Oakvale's builder over its plan, made now if it isn't yet: what its worker runs. */
export function oakvaleBuilder(): (key: ChunkKey, detail: Detail) => ChunkData {
  const plan = planOakvale();
  return (key, detail) => buildOakvaleChunk(plan, key, detail);
}

/** Chunk `key` of Oakvale's `plan`, at `detail`. The same arrays every time, whatever was built before. */
export function buildOakvaleChunk(plan: ForestLayout, key: ChunkKey, detail: Detail): ChunkData {
  const [ci, cj] = chunkIndex(key);
  if (Math.abs(ci) > REACH || Math.abs(cj) > REACH) throw new Error(`Chunk ${key} isn't Oakvale's`);
  const full = detail === 'full';
  /** One of the ring of chunks round the zone's edge, mountains mostly. */
  const edge = Math.abs(ci) === REACH || Math.abs(cj) === REACH;
  const region: Region = { ...chunkBounds(key), owns: (x, z) => ownerOf(x, z) === key };
  const raw = new MeshBuffer();
  addGround(raw, plan, region, !full);
  if (full) {
    addPaths(raw, plan, region);
    addYards(raw, plan, region);
  }

  // Plants are stamped from prototypes; the mountains past where you can walk, deep in the woods and
  // every stand-in get cheaper trees, and the mountains round the edge are thinned.
  const { near, far } = plants();
  const m = new Matrix4();
  const q = new Quaternion();
  for (const p of plan.plants) {
    if (!region.owns(p.x, p.z)) continue;
    if (!full && UNDERGROWTH.has(p.kind)) continue;
    const outside = plan.walkable.distance(p.x, p.z) > FAR_TREES;
    if (edge && outside && p.seed % CONFIG.streaming.trees.thin !== 0) continue;
    const variants = (outside || !full || deepInWoods(plan, p.x, p.z) ? far : near)[p.kind];
    m.compose(new Vector3(p.x, p.y, p.z), q.setFromAxisAngle(UP, p.yaw), new Vector3(p.scale, p.scale, p.scale));
    raw.stamp(variants[p.seed % variants.length], m.clone(), 0.92 + ((p.seed >> 4) % 17) / 100);
  }
  const identity = new Matrix4();
  for (const f of plan.fields) {
    if (!region.owns(f.x, f.z)) continue;
    raw.stamp(
      once(plan, f, () => {
        const b = new ModelBuilder(3);
        buildField(b, f, plan.heightAt);
        return b.build();
      }),
      identity,
    );
  }
  if (full) {
    for (const fence of plan.fences) {
      if (!region.owns(fence[0][0], fence[0][1])) continue;
      raw.stamp(
        once(plan, fence, () => {
          const b = new ModelBuilder(4);
          buildFence(b, fence, plan.heightAt);
          return b.build();
        }),
        identity,
      );
    }
  }
  // Their glows and the windmill's sails are the zone's extras (forest.ts), built once.
  const ctx = { layout: plan, glow: () => {}, spinner: () => {} };
  for (const s of plan.structures) {
    if (!region.owns(s.x, s.z)) continue;
    const place = new Matrix4().makeRotationY(s.yaw).setPosition(s.x, s.y, s.z);
    raw.stamp(
      once(plan, s, () => buildStructure(s, ctx)),
      place,
    );
  }

  const arrays = raw.arrays();
  return { key, detail, ...arrays, sphere: sphereAround(arrays.position) };
}
