import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { buildMoorChunk, moorBuilder, moorChunks } from '../src/maps/brackenmoor/chunks';
import { buildBrackenmoor } from '../src/maps/brackenmoor/moor';
import { MOOR, MOOR_ATMOSPHERE, type MoorPlan, planBrackenmoor } from '../src/maps/brackenmoor/plan';
import { buildForest } from '../src/maps/forest/forest';
import { CREST, FOREST, type ForestLayout, OAKVALE_ATMOSPHERE, PASS, planOakvale } from '../src/maps/forest/layout';
import { nearestOnPolyline } from '../src/maps/forest/noise';
import { findMap, loadNeighbours } from '../src/maps/registry';
import { isStartingZone, type StartingZone, type Zone } from '../src/maps/types';
import { Walkable } from '../src/maps/walkable';
import { type ChunkData, type ChunkKey, chunkIndex, type Detail } from '../src/world/chunks';
import { type ChunkReply, type ChunkServerScope, serveChunks } from '../src/world/chunkWorker';
import { World } from '../src/world/world';

// The southern pass and Brackenmoor's land (ticket 36): the pass opens as a
// corridor up to the crest, and Brackenmoor lies over it, a zone like
// Oakvale. The World is the `Ground` for both: the zones' heights agree
// along the seam, the corridor walks from the play area onto the moor, and
// its edges hold. Oakvale's plan is the source of truth for the crest.

let oak: ForestLayout;
let moor: MoorPlan;
let oakvale: StartingZone;
let brackenmoor: Zone;
let world: World;
beforeAll(() => {
  oak = planOakvale();
  moor = planBrackenmoor(oak.seams[0]);
  oakvale = buildForest(oak);
  brackenmoor = buildBrackenmoor(moor);
  world = new World();
  world.add(brackenmoor);
  world.load(oakvale);
}, 30000);

const r = CONFIG.player.bodyRadius;
/** Where you can walk in both zones, as the World keeps you. */
const walkable = () => Walkable.union([oakvale.walkable, brackenmoor.walkable]);
/** Where Oakvale's main road runs at `z`, up the pass. */
const roadX = (z: number) => {
  const line = z <= CREST.z ? oak.paths[0].line : moor.road.line;
  return line.reduce((best, p) => (Math.abs(p[1] - z) < Math.abs(best[1] - z) ? p : best))[0];
};

/** Two chunks byte for byte (a deep equal over a million bytes takes seconds). */
function same(a: ChunkData, b: ChunkData): void {
  for (const k of ['position', 'normal', 'color', 'fx', 'uv'] as const) {
    const [x, y] = [new Uint8Array(a[k].buffer), new Uint8Array(b[k].buffer)];
    expect(y.length, `${a.key} ${a.detail} ${k}`).toBe(x.length);
    expect(x.findIndex((v, i) => v !== y[i]), `${a.key} ${a.detail} ${k}`).toBe(-1);
  }
  expect(a.sphere).toEqual(b.sphere);
}

describe('Brackenmoor, as the registry lists it', () => {
  it("is a zone called Brackenmoor, across the pass's seam from Oakvale, each the other's neighbour", async () => {
    expect(findMap('brackenmoor')).toMatchObject({ kind: 'zone', label: 'Brackenmoor', neighbours: ['forest'] });
    expect(findMap('forest')).toMatchObject({ neighbours: ['brackenmoor'] });
    const loaded = await loadNeighbours(oakvale, async (info) => (info.id === 'brackenmoor' ? brackenmoor : oakvale));
    expect(loaded).toEqual([brackenmoor]);
  });

  it('spans 5 by 4 chunks south of the crest, none of them Oakvale’s', () => {
    const keys = moorChunks();
    expect(keys).toHaveLength(20);
    const [is, js] = [keys.map((k) => chunkIndex(k)[0]), keys.map((k) => chunkIndex(k)[1])];
    expect([Math.min(...is), Math.max(...is), Math.min(...js), Math.max(...js)]).toEqual([-2, 2, 4, 7]);
    expect(keys.filter((k) => oakvale.chunks.keys.includes(k))).toEqual([]);
    expect(brackenmoor.land).toEqual({ minX: -100, maxX: 100, minZ: 140, maxZ: 300 });
  });

  it('is empty and safe: nothing lives there and there is nowhere to wake, so nothing can hurt you', () => {
    expect([brackenmoor.camps, brackenmoor.villagers, brackenmoor.pickups, brackenmoor.interiors, brackenmoor.mine]).toEqual([[], [], [], [], null]);
    expect(isStartingZone(brackenmoor)).toBe(false);
    expect(isStartingZone(oakvale)).toBe(true);
  });

  it('has its own atmosphere under the same sun: a paler, cooler haze, a whiter sky and a rust-brown ground light', () => {
    const [o, m] = [OAKVALE_ATMOSPHERE, MOOR_ATMOSPHERE];
    expect(brackenmoor.atmosphere).toBe(m);
    const rgb = (hex: number) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
    const sum = (hex: number) => rgb(hex).reduce((a, b) => a + b, 0);
    // Paler.
    expect(sum(m.fog.color)).toBeGreaterThan(sum(o.fog.color));
    expect(sum(m.sky.zenith)).toBeGreaterThan(sum(o.sky.zenith));
    // Cooler: no less blue than red, and bluer for its red than Oakvale's.
    const [fr, , fb] = rgb(m.fog.color);
    const [or, , ob] = rgb(o.fog.color);
    expect(fb / fr).toBeGreaterThanOrEqual(ob / or);
    // Rust-brown ground light: red over green over blue.
    const [gr, gg, gb] = rgb(m.hemisphere.ground);
    expect(gr > gg && gg > gb).toBe(true);
    // The same sun; the streamer keeps its distances either side of the crest.
    expect([m.sun, m.fog.far, m.farPlane]).toEqual([o.sun, o.fog.far, o.farPlane]);
  });
});

describe('the World as Ground across the seam', () => {
  it("gives Oakvale's heights and Brackenmoor's exactly the same all along the crest", () => {
    for (let x = CREST.minX; x <= CREST.maxX; x += 0.25) {
      // The same line between the same heights: to the last bit or so of rounding.
      expect(moor.heightAt(x, CREST.z), `x ${x}`).toBeCloseTo(oak.heightAt(x, CREST.z), 9);
      expect(world.heightAt(x, CREST.z)).toBeCloseTo(oak.heightAt(x, CREST.z), 9);
    }
    // Brackenmoor's seam is Oakvale's crest, vertex for vertex.
    expect(moor.seam.heights).toEqual(oak.seams[0].heights);
    expect(brackenmoor.seams[0].heights).toEqual(oakvale.seams[0].heights);
  });

  it('answers from the zone underfoot either side of the line, with no step across it', () => {
    for (let x = -60; x <= 60; x += 0.5) {
      const north = world.heightAt(x, CREST.z - 0.05);
      const south = world.heightAt(x, CREST.z + 0.05);
      expect(Math.abs(north - south), `x ${x}`).toBeLessThan(0.1);
    }
    expect(world.heightAt(0, 120)).toBe(oak.heightAt(0, 120));
    expect(world.heightAt(0, 200)).toBe(moor.heightAt(0, 200));
    expect(world.zoneAt(0, 139)).toBe(oakvale);
    expect(world.zoneAt(0, 141)).toBe(brackenmoor);
  });

  it('lets you walk the road from the play area up the pass, over the crest and across the moor to the rockfall', () => {
    const p = new Vector3();
    const line = [...oak.paths[0].line.filter(([, z]) => z > FOREST.play - 10).reverse(), ...moor.road.line.slice(1)];
    let farthest = 0;
    for (const [x, z] of line) {
      if (z > MOOR.walk.south - 1) break;
      p.set(x, 0, z);
      world.resolve(p, r);
      // On the road, nothing pushes you anywhere.
      expect(Math.hypot(p.x - x, p.z - z), `(${x.toFixed(1)}, ${z.toFixed(1)})`).toBeLessThan(1e-9);
      farthest = z;
    }
    expect(farthest).toBeGreaterThan(MOOR.walk.south - 2);
    // The rockfall closes the road at the walkable edge.
    p.set(moor.road.line.at(-1)![0], 0, MOOR.walk.south + 3);
    world.resolve(p, r);
    expect(p.z).toBeLessThanOrEqual(MOOR.walk.south - r + 1e-6);
  });

  it('is walkable from the play area to every spot of the pass and the moor a body can stand on (no pockets), for every body radius', () => {
    const step = 0.5;
    const [x0, x1, z0, z1] = [-70, 70, 70, 262];
    const nx = Math.round((x1 - x0) / step) + 1;
    const nz = Math.round((z1 - z0) / step) + 1;
    const p = new Vector3();
    for (const radius of [r, ...Object.values(CONFIG.enemies).map((e) => e.radius)].filter((v, i, a) => a.indexOf(v) === i)) {
      const free = new Uint8Array(nx * nz);
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          const x = x0 + i * step;
          const z = z0 + j * step;
          // Only the pass and the moor: the play square has its own flood fill (forest.test.ts).
          if (z < FOREST.play && Math.abs(x - roadX(FOREST.play)) > PASS.half) continue;
          free[i * nz + j] = world.resolve(p.set(x, 0, z), radius) ? 0 : 1;
        }
      }
      const seen = new Uint8Array(nx * nz);
      const start = Math.round((roadX(76) - x0) / step) * nz + Math.round((76 - z0) / step);
      expect(free[start]).toBe(1);
      const stack = [start];
      seen[start] = 1;
      while (stack.length) {
        const k = stack.pop()!;
        const [i, j] = [Math.floor(k / nz), k % nz];
        for (const [a, b] of [
          [i + 1, j],
          [i - 1, j],
          [i, j + 1],
          [i, j - 1],
        ]) {
          if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
          const kk = a * nz + b;
          if (free[kk] && !seen[kk]) {
            seen[kk] = 1;
            stack.push(kk);
          }
        }
      }
      const pockets: string[] = [];
      for (let k = 0; k < nx * nz; k++) if (free[k] && !seen[k]) pockets.push(`(${x0 + Math.floor(k / nz) * step}, ${z0 + (k % nz) * step})`);
      expect(pockets, `radius ${radius}`).toEqual([]);
      // And it reaches the moor's far side.
      expect(seen[Math.round((0 - x0) / step) * nz + Math.round((250 - z0) / step)], `radius ${radius}`).toBe(1);
    }
  }, 60000);

  it("keeps you in the pass's corridor, about 10 m either side of the road, and off its walls", () => {
    const p = new Vector3();
    for (const z of [90, 100, 110, 120, 130, 138, 142, 150]) {
      const x = roadX(z);
      for (const side of [-1, 1]) {
        // Well inside the corridor, you walk freely (but for a rock or pine at its edge).
        const inside = walkable().contains(x + side * (PASS.half - 2), z);
        expect(inside, `z ${z} side ${side}`).toBe(true);
        // Past its edge, you're pushed back in.
        p.set(x + side * (PASS.half + 4), 0, z);
        world.resolve(p, r);
        expect(Math.abs(p.x - x), `z ${z} side ${side}`).toBeLessThanOrEqual(PASS.half + 0.6);
        expect(walkable().contains(x + side * (PASS.half + 1.5), z), `z ${z} side ${side}`).toBe(false);
      }
    }
  });

  it("stands rocks and pines along the corridor's edges, where the walls climb", () => {
    const edge = oak.plants.filter((p) => p.z > FOREST.play + 3 && p.z < CREST.z && Math.abs(Math.abs(p.x - roadX(p.z)) - PASS.half - 1.75) <= 0.8);
    expect(edge.filter((p) => p.kind === 'pine').length).toBeGreaterThan(8);
    expect(edge.filter((p) => p.kind === 'rock').length).toBeGreaterThan(4);
    // Each side, one about every few metres all the way up.
    for (const side of [-1, 1]) {
      const zs = edge.filter((p) => Math.sign(p.x - roadX(p.z)) === side).map((p) => p.z).sort((a, b) => a - b);
      for (let i = 1; i < zs.length; i++) expect(zs[i] - zs[i - 1]).toBeLessThan(PASS.every * 2);
      expect(zs.at(-1)!).toBeGreaterThan(CREST.z - 6);
    }
  });

  it('regrades the road up the pass to no steeper than 1 in 5, and carries it on over the crest', () => {
    const main = oak.paths[0];
    for (let i = 1; i < main.line.length && main.line[i - 1][1] > FOREST.play; i++) {
      const run = Math.hypot(main.line[i][0] - main.line[i - 1][0], main.line[i][1] - main.line[i - 1][1]);
      expect(Math.abs(main.heights[i] - main.heights[i - 1]) / run, `z ${main.line[i][1].toFixed(1)}`).toBeLessThanOrEqual(PASS.grade + 1e-6);
    }
    // Oakvale's road ends on the crest, where Brackenmoor's starts, going the same way.
    expect(main.line[0][1]).toBe(CREST.z);
    expect(moor.road.line[0]).toEqual(main.line[0]);
    const [a, b] = moor.road.line;
    const [c, d] = main.line;
    expect(Math.atan2(b[0] - a[0], b[1] - a[1])).toBeCloseTo(Math.atan2(c[0] - d[0], c[1] - d[1]), 1);
  });

  it("keeps every camp's leash out of the pass", () => {
    for (const camp of oakvale.camps) {
      if (camp.interior) continue;
      for (const post of camp.posts) {
        for (let z = FOREST.play; z <= CREST.z; z += 2) {
          const x = roadX(z);
          expect(Math.hypot(post.x - x, post.z - z) - PASS.half, `${camp.id}`).toBeGreaterThan(CONFIG.camps.leash);
        }
      }
    }
  });
});

describe("Brackenmoor's land", () => {
  it('falls from the crest into a shallow basin a few metres above Oakvale’s valley floor', () => {
    const floor = [];
    for (let z = 185; z <= 240; z += 5) for (let x = -40; x <= 40; x += 5) floor.push(moor.heightAt(x, z));
    const mean = floor.reduce((a, b) => a + b, 0) / floor.length;
    expect(mean).toBeGreaterThan(oak.heightAt(0, 0) + 1.5);
    expect(mean).toBeLessThan(oak.heightAt(0, 0) + 8);
    expect(mean).toBeLessThan(moor.heightAt(roadX(CREST.z), CREST.z) - 2);
  });

  it('is ringed east, west and south by low, rounded hills of 20 to 35 m', () => {
    const tops: number[] = [];
    const floor = MOOR.floor;
    for (let z = 190; z <= 280; z += 10) for (const x of [-92, 92]) tops.push(moor.heightAt(x, z) - floor);
    for (let x = -80; x <= 80; x += 10) if (Math.abs(x - moor.road.line.at(-1)![0]) > 25) tops.push(moor.heightAt(x, 292) - floor);
    for (const h of tops) {
      // The hill itself, give or take the floor's swell under it.
      expect(h).toBeGreaterThan(MOOR.hills.low - MOOR.swell - 1);
      expect(h).toBeLessThan(MOOR.hills.high + MOOR.swell + 1);
    }
  });

  it('runs its road south to a gap in the hills, closed by a rockfall where you can walk no farther', () => {
    const [ex, ez] = moor.road.line.at(-1)!;
    expect(ez).toBeGreaterThanOrEqual(MOOR.walk.south);
    // The gap: the hills either side stand well above the road's way through.
    expect(moor.heightAt(ex, 290)).toBeLessThan(moor.heightAt(ex - 30, 290) - 10);
    expect(moor.heightAt(ex, 290)).toBeLessThan(moor.heightAt(ex + 30, 290) - 10);
    const fall = moor.plants.filter((p) => p.kind === 'rock' && p.z > MOOR.walk.south && Math.abs(p.x - ex) < MOOR.rockfall.spread + 1 && p.scale >= MOOR.rockfall.scale[0]);
    expect(fall.length).toBeGreaterThanOrEqual(MOOR.rockfall.count);
    expect(fall.some((p) => nearestOnPolyline(moor.road.line, p.x, p.z).d < 2)).toBe(true);
  });

  it('grows bracken, heather, low bushes, grey rocks and a few lone pines, and none on the road', () => {
    const count = (kind: string) => moor.plants.filter((p) => p.kind === kind).length;
    expect(count('bracken')).toBeGreaterThan(200);
    expect(count('heather')).toBeGreaterThan(100);
    expect(count('bush')).toBeGreaterThan(30);
    expect(count('rock')).toBeGreaterThan(50);
    expect(count('pine')).toBeGreaterThanOrEqual(4);
    expect(count('pine')).toBeLessThanOrEqual(20);
    for (const p of moor.plants) {
      if (p.z > MOOR.walk.south) continue;
      expect(nearestOnPolyline(moor.road.line, p.x, p.z).d, `${p.kind} (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`).toBeGreaterThan(moor.road.width / 2);
    }
  });

  it("stands the border stone by the road on the crest, and you can't walk through it", () => {
    const { stone } = moor;
    expect(stone.z - CREST.z).toBeLessThan(2);
    const d = nearestOnPolyline(moor.road.line, stone.x, stone.z).d;
    expect(d).toBeGreaterThan(moor.road.width / 2);
    expect(d).toBeLessThan(moor.road.width / 2 + 4);
    const p = new Vector3(stone.x - 0.1, 0, stone.z);
    expect(world.resolve(p, r)).toBe(true);
    expect(Math.hypot(p.x - stone.x, p.z - stone.z)).toBeGreaterThanOrEqual(0.55 + r - 1e-6);
  });

  it('starts ?map=brackenmoor on the road just over the crest, looking out over the moor', () => {
    const { spawn } = brackenmoor;
    expect(spawn.z).toBeGreaterThan(CREST.z);
    expect(spawn.z).toBeLessThan(CREST.z + 10);
    expect(nearestOnPolyline(moor.road.line, spawn.x, spawn.z).d).toBeLessThan(0.5);
    expect(Math.cos(spawn.yaw)).toBeCloseTo(-1); // facing +Z, south
    for (const l of brackenmoor.landmarks) expect(brackenmoor.walkable.contains(l.x, l.z), l.label).toBe(true);
  });
});

describe("Brackenmoor's chunks", () => {
  it('builds each chunk the same every time, whatever was built before', () => {
    const keys = moorChunks();
    const first = new Map<string, ChunkData>();
    for (const detail of ['full', 'standIn'] as const) for (const key of keys) first.set(`${key} ${detail}`, buildMoorChunk(moor, key, detail));
    // Again, the other way round and from a plan made afresh.
    const again = planBrackenmoor(oak.seams[0]);
    for (const detail of ['standIn', 'full'] as const) for (const key of [...keys].reverse()) same(buildMoorChunk(again, key, detail), first.get(`${key} ${detail}`)!);
  }, 60000);

  it("builds every chunk byte for byte in its worker as on the main thread, and hands each back without copying", () => {
    const replies: { reply: ChunkReply; transfer: Transferable[] }[] = [];
    const scope: ChunkServerScope = { onmessage: null, postMessage: (reply, transfer) => replies.push({ reply, transfer }) };
    serveChunks(scope, moorBuilder());
    let id = 0;
    for (const detail of ['full', 'standIn'] as Detail[]) {
      for (const key of moorChunks()) {
        scope.onmessage!({ data: { id: id++, key, detail } });
        const { reply, transfer } = replies.pop()!;
        if (!('data' in reply)) throw new Error(reply.error);
        const got = structuredClone(reply, { transfer }) as { data: ChunkData };
        same(got.data, buildMoorChunk(moor, key, detail));
        expect(reply.data.position.buffer.byteLength).toBe(0);
      }
    }
  }, 60000);

  it('makes stand-ins cheaper than full detail, and leaves out the bracken and heather', () => {
    for (const key of moorChunks()) {
      expect(buildMoorChunk(moor, key, 'standIn').position.length, key).toBeLessThan(buildMoorChunk(moor, key, 'full').position.length);
    }
  }, 30000);

  it("draws the border stone in the crest's chunk, and refuses a chunk that isn't Brackenmoor's", () => {
    const at = moorChunks().find((k: ChunkKey) => {
      const [i, j] = chunkIndex(k);
      return i === 0 && j === 4;
    })!;
    const c = buildMoorChunk(moor, at, 'full');
    let tallest = -Infinity;
    for (let i = 0; i < c.position.length; i += 3) {
      if (Math.hypot(c.position[i] - moor.stone.x, c.position[i + 2] - moor.stone.z) < 1) tallest = Math.max(tallest, c.position[i + 1]);
    }
    expect(tallest - moor.stone.y).toBeGreaterThan(moor.stone.h * 0.8);
    expect(() => buildMoorChunk(moor, '0,0', 'full')).toThrow();
  });
});
