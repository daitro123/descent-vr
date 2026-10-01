import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { aldhavenBuilder, aldhavenChunks, buildAldhavenChunk } from '../src/maps/aldhaven/chunks';
import { buildAldhaven } from '../src/maps/aldhaven/city';
import { ALDHAVEN, type AldhavenPlan, planAldhaven } from '../src/maps/aldhaven/plan';
import { findMap } from '../src/maps/registry';
import type { Zone } from '../src/maps/types';
import type { ChunkData, Detail } from '../src/world/chunks';
import { type ChunkReply, type ChunkServerScope, serveChunks } from '../src/world/chunkWorker';

// Aldhaven, the capital, as scenery only: its walls, streets, buildings,
// harbour and trees, and nobody in it yet. Its chunks build the same
// everywhere, its walls hold but for the gates, and you can walk from the
// Kingsroad to every landmark. The Ald comes down out of the north-west gorge
// past the shut Gorgegate, under the Kingsbridge, into the city.

let plan: AldhavenPlan;
let city: Zone;
beforeAll(() => {
  plan = planAldhaven();
  city = buildAldhaven(plan);
}, 30000);

const r = CONFIG.player.bodyRadius;
const { at } = ALDHAVEN;

/** Two chunks byte for byte (a deep equal over a million bytes takes seconds). */
function same(a: ChunkData, b: ChunkData): void {
  for (const k of ['position', 'normal', 'color', 'fx', 'uv'] as const) {
    const [x, y] = [new Uint8Array(a[k].buffer), new Uint8Array(b[k].buffer)];
    expect(y.length, `${a.key} ${a.detail} ${k}`).toBe(x.length);
    expect(x.findIndex((v, i) => v !== y[i]), `${a.key} ${a.detail} ${k}`).toBe(-1);
  }
  expect(a.sphere).toEqual(b.sphere);
}

/** Whether you can stand at (x, z) (world): somewhere to walk, and clear of walls and props. */
const free = (x: number, z: number) => city.walkable.contains(x, z) && !city.collide(new Vector3(x, 0, z), r);

describe('Aldhaven, as the registry lists it', () => {
  it('is a zone called Aldhaven, joined to Brackenmoor over the Kingsroad and the Sallows over the causeway', () => {
    expect(findMap('aldhaven')).toMatchObject({ kind: 'zone', label: 'Aldhaven', neighbours: ['brackenmoor', 'sallows'] });
    expect(city).toMatchObject({ kind: 'zone', id: 'aldhaven', label: 'Aldhaven', seams: [plan.southSeam], sideSeams: [plan.westSeam] });
  });

  it('is scenery only: no camps, people, pickups, chests, wake spots, interiors or mine', () => {
    for (const k of ['camps', 'villagers', 'pickups', 'chests', 'spots', 'interiors'] as const) expect(city[k], k).toEqual([]);
    expect(city.mine).toBeNull();
  });

  it("sounds like a port: the harbour's air, and the river, the quays, the forge and the windmill where they are", () => {
    expect(city.ambience).toBe('harbour');
    const ids = new Set(city.sounds.map((s) => s.id));
    expect([...ids].sort()).toEqual(['dock', 'forge', 'stream', 'windmill']);
    for (const s of city.sounds) {
      expect(s.interior, s.id).toBeNull();
      expect(s.x >= city.land.minX && s.x <= city.land.maxX && s.z >= city.land.minZ && s.z <= city.land.maxZ, s.id).toBe(true);
    }
  });

  it('starts ?map=aldhaven on the Kingsroad, outside the Kingsgate, looking at it', () => {
    const { spawn } = city;
    expect(free(spawn.x, spawn.z)).toBe(true);
    expect(spawn.x - at.x).toBeLessThan(ALDHAVEN.wall.west);
    expect(Math.abs(spawn.z - at.z - ALDHAVEN.gates.kingsgate.z)).toBeLessThan(10);
    expect(-Math.sin(spawn.yaw)).toBeGreaterThan(0.9); // facing +X, east
    for (const l of city.landmarks) expect(city.walkable.contains(l.x, l.z), l.label).toBe(true);
  });
});

describe("Aldhaven's walls", () => {
  it('hold along their length and open at the gates', () => {
    const { wall, gates } = ALDHAVEN;
    // A stretch of each wall well clear of its gates and towers' gaps.
    expect(city.collide(new Vector3(at.x + wall.west, 0, at.z - 60), r)).toBe(true);
    expect(city.collide(new Vector3(at.x + wall.west, 0, at.z + 95), r)).toBe(true);
    expect(city.collide(new Vector3(at.x - 60, 0, at.z + wall.north), r)).toBe(true);
    expect(city.collide(new Vector3(at.x + 30, 0, at.z + wall.south), r)).toBe(true);
    for (const name of ['kingsgate', 'northGate', 'southGate'] as const) expect(free(at.x + gates[name].x, at.z + gates[name].z), name).toBe(true);
  });

  it('let you walk from the spawn through the gates to every landmark', () => {
    // A flood fill over a metre grid of where you can stand: the walls are
    // three metres thick, so no step can skip one.
    const { land } = city;
    const step = 1;
    const cols = Math.floor((land.maxX - land.minX) / step);
    const rows = Math.floor((land.maxZ - land.minZ) / step);
    const seen = new Uint8Array(cols * rows);
    const cell = (x: number, z: number) => [Math.round((x - land.minX) / step), Math.round((z - land.minZ) / step)];
    const [si, sj] = cell(city.spawn.x, city.spawn.z);
    const queue = [si + sj * cols];
    seen[queue[0]] = 1;
    while (queue.length) {
      const k = queue.pop()!;
      const [i, j] = [k % cols, Math.floor(k / cols)];
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const [ni, nj] = [i + di, j + dj];
        if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
        const n = ni + nj * cols;
        if (seen[n]) continue;
        seen[n] = 1;
        if (free(land.minX + ni * step, land.minZ + nj * step)) queue.push(n);
        else seen[n] = 2;
      }
    }
    const reached = (x: number, z: number) => {
      const [i, j] = cell(x, z);
      for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) if (seen[i + di + (j + dj) * cols] === 1) return true;
      return false;
    };
    for (const l of city.landmarks) expect(reached(l.x, l.z), l.label).toBe(true);
  }, 30000);
});

describe('the Ald above the city', () => {
  const { ald, kingsbridge, gorge, land, water } = ALDHAVEN;
  // The ground, not a deck over it.
  const h = (x: number, z: number) => plan.ground.at(x + at.x, z + at.z);

  it('comes out of the gorge in the north-west and runs down past the west wall to the water gate', () => {
    // Under water all the way down its line, from the north edge to the bend into the water gate.
    for (let z = land.minZ; z < 50; z += 2) {
      const n = ald.line.findIndex(([, lz]) => lz > z);
      const [[ax, az], [bx, bz]] = [ald.line[n - 1], ald.line[n]];
      const x = ax + ((bx - ax) * (z - az)) / (bz - az);
      expect(h(x, z), `z ${z}`).toBeLessThan(water - 1);
    }
    // Not out of the west any more: the land along the west edge is dry from end to end.
    for (let z = land.minZ + 2; z < ALDHAVEN.wall.south; z += 2) expect(h(land.minX + 1, z), `z ${z}`).toBeGreaterThan(water + 1);
  });

  it('carries the Kingsroad over it on the Kingsbridge, the deck under your feet as built', () => {
    const z = kingsbridge.z + at.z;
    for (let x = kingsbridge.x0 + 0.5; x < kingsbridge.x1; x += 0.5) {
      const deck = plan.deckAt(x + at.x, z);
      expect(deck, `x ${x}`).not.toBeNull();
      expect(plan.heightAt(x + at.x, z)).toBe(deck);
      expect(deck!).toBeGreaterThan(water + 3);
      expect(free(x + at.x, z), `x ${x}`).toBe(true);
    }
    // And the water's under it.
    expect(plan.ground.at(-123 + at.x, z)).toBeLessThan(water - 1);
  });

  it('stops you at the shut Gorgegate, the valley road open up to it', () => {
    expect(free(gorge.road + at.x, gorge.gate + 4 + at.z)).toBe(true);
    expect(free(gorge.road + at.x, gorge.gate - 3 + at.z)).toBe(false);
  });
});

describe("Aldhaven's chunks", () => {
  it('builds each chunk the same every time, whatever was built before', () => {
    const keys = aldhavenChunks();
    const first = new Map<string, ChunkData>();
    for (const detail of ['full', 'standIn'] as const) for (const key of keys) first.set(`${key} ${detail}`, buildAldhavenChunk(plan, key, detail));
    const again = planAldhaven();
    for (const detail of ['standIn', 'full'] as const) for (const key of [...keys].reverse()) same(buildAldhavenChunk(again, key, detail), first.get(`${key} ${detail}`)!);
  }, 60000);

  it('builds every chunk byte for byte in its worker as on the main thread, and hands each back without copying', () => {
    const replies: { reply: ChunkReply; transfer: Transferable[] }[] = [];
    const scope: ChunkServerScope = { onmessage: null, postMessage: (reply, transfer) => replies.push({ reply, transfer }) };
    serveChunks(scope, aldhavenBuilder());
    let id = 0;
    for (const detail of ['full', 'standIn'] as Detail[]) {
      for (const key of aldhavenChunks()) {
        scope.onmessage!({ data: { id: id++, key, detail } });
        const { reply, transfer } = replies.pop()!;
        if (!('data' in reply)) throw new Error(reply.error);
        const got = structuredClone(reply, { transfer }) as { data: ChunkData };
        same(got.data, buildAldhavenChunk(plan, key, detail));
        expect(reply.data.position.buffer.byteLength).toBe(0);
      }
    }
  }, 60000);

  it("makes stand-ins cheaper than full detail, and keeps every full chunk within the chunk budget's triangles", () => {
    for (const key of aldhavenChunks()) {
      const full = buildAldhavenChunk(plan, key, 'full').position.length;
      expect(buildAldhavenChunk(plan, key, 'standIn').position.length, key).toBeLessThan(full);
      expect(full / 9, key).toBeLessThan(CONFIG.streaming.budget.chunk);
    }
  }, 30000);

  it("refuses a chunk that isn't Aldhaven's", () => {
    expect(() => buildAldhavenChunk(plan, '0,0', 'full')).toThrow();
  });
});
