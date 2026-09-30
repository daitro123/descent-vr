import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';
import { CONFIG } from '../config';
import type { ChunkPort } from './chunkWorker';

// One grid of square chunks over every zone, in world metres: chunk (i, j)
// is centred on (i, j) × CONFIG.streaming.chunk, so Oakvale's ±140 m is 7 by
// 7 of them. Keys are global, so a position needs no zone to find its chunk.
// A zone's chunk builder turns a key into plain arrays, free of the DOM, so it
// runs in tests and in a worker (world/chunkWorker.ts); the streamer makes
// them meshes.

/** A chunk's key: its grid indices, "i,j". */
export type ChunkKey = `${number},${number}`;

/** How a chunk is built: in full, or as a cheap stand-in for far off (far trees, coarse ground). */
export type Detail = 'full' | 'standIn';

export function chunkKey(i: number, j: number): ChunkKey {
  return `${i},${j}`;
}

/** A key's grid indices. */
export function chunkIndex(key: ChunkKey): [number, number] {
  const [i, j] = key.split(',');
  return [Number(i), Number(j)];
}

/** The index of the chunk holding world coordinate `v` along one axis. */
export function chunkCoord(v: number): number {
  const size = CONFIG.streaming.chunk;
  return Math.floor((v + size / 2) / size);
}

/** The chunk that holds the point (x, z). */
export function chunkAt(x: number, z: number): ChunkKey {
  return chunkKey(chunkCoord(x), chunkCoord(z));
}

/** A chunk's square on the floor plane. */
export function chunkBounds(key: ChunkKey): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const size = CONFIG.streaming.chunk;
  const [i, j] = chunkIndex(key);
  return { minX: i * size - size / 2, maxX: i * size + size / 2, minZ: j * size - size / 2, maxZ: j * size + size / 2 };
}

/** How far (x, z) is from the nearest point of the chunk's square, over the floor plane: 0 inside it. */
export function chunkDistance(key: ChunkKey, x: number, z: number): number {
  const b = chunkBounds(key);
  return Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));
}

/**
 * One chunk, built: its vertices in the model material's layout (position,
 * normal, colour, fx, uv), unindexed, and a sphere round them. Plain typed
 * arrays, so they can be handed between threads without copying.
 */
export interface ChunkData {
  readonly key: ChunkKey;
  readonly detail: Detail;
  readonly position: Float32Array;
  readonly normal: Float32Array;
  readonly color: Float32Array;
  readonly fx: Float32Array;
  readonly uv: Float32Array;
  readonly sphere: { readonly x: number; readonly y: number; readonly z: number; readonly r: number };
}

/** A zone's chunks: which it has, and how to build one. */
export interface ChunkSource {
  readonly keys: readonly ChunkKey[];
  build(key: ChunkKey, detail: Detail): ChunkData;
  /**
   * A worker that builds them off the main thread, as `build` does, byte for
   * byte (it runs world/chunkWorker.ts `serveChunks`). Without one, or where
   * workers can't run, the streamer builds on the main thread.
   */
  worker?(): ChunkPort;
}

/** A chunk's arrays as a geometry for the model material, its bounding sphere already known. */
export function chunkGeometry(data: ChunkData): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(data.position, 3));
  g.setAttribute('normal', new BufferAttribute(data.normal, 3));
  g.setAttribute('color', new BufferAttribute(data.color, 3));
  g.setAttribute('fx', new BufferAttribute(data.fx, 2));
  g.setAttribute('uv', new BufferAttribute(data.uv, 2));
  const { x, y, z, r } = data.sphere;
  g.boundingSphere = new Sphere(new Vector3(x, y, z), r);
  return g;
}

/** A sphere round some positions: the middle of their box, out to the farthest. */
export function sphereAround(position: Float32Array): ChunkData['sphere'] {
  if (position.length === 0) return { x: 0, y: 0, z: 0, r: 0 };
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < position.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = position[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  const [x, y, z] = [0, 1, 2].map((k) => (min[k] + max[k]) / 2);
  let r2 = 0;
  for (let i = 0; i < position.length; i += 3) {
    r2 = Math.max(r2, (position[i] - x) ** 2 + (position[i + 1] - y) ** 2 + (position[i + 2] - z) ** 2);
  }
  return { x, y, z, r: Math.sqrt(r2) };
}
