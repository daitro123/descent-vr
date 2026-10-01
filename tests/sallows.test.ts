import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { moorChunks } from '../src/maps/brackenmoor/chunks';
import { MOOR_ATMOSPHERE } from '../src/maps/brackenmoor/plan';
import { FEN_ROAD, fenRoadHeight, fenRoadSeam } from '../src/maps/fenRoad';
import { oakvaleChunks } from '../src/maps/forest/chunks';
import { nearestOnPolyline } from '../src/maps/forest/noise';
import { findMap } from '../src/maps/registry';
import { buildSallowsChunk, sallowsBuilder, sallowsChunks } from '../src/maps/sallows/chunks';
import { buildSallows } from '../src/maps/sallows/fen';
import { CAUSEWAY, CROSSINGS, northEdgeHeight, planSallows, REEDHOLM, SALLOWS, SALLOWS_ATMOSPHERE, type SallowsPlan } from '../src/maps/sallows/plan';
import { isStartingZone, type Zone } from '../src/maps/types';
import { type ChunkData, chunkIndex, type Detail } from '../src/world/chunks';
import { type ChunkReply, type ChunkServerScope, serveChunks } from '../src/world/chunkWorker';

// The Sallows (the project's zones/sallows.md): the delta fens east of
// Brackenmoor and south of Aldhaven, built as land only: its water, roads,
// Reedholm on its piles, the landmarks, reeds and trees. Nothing lives
// there yet. The plan is the source of truth; the zone and its chunks are
// built from it.

let plan: SallowsPlan;
let sallows: Zone;
beforeAll(() => {
  plan = planSallows();
  sallows = buildSallows(plan);
}, 30000);

const r = CONFIG.player.bodyRadius;

/** Two chunks byte for byte (a deep equal over a million bytes takes seconds). */
function same(a: ChunkData, b: ChunkData): void {
  for (const k of ['position', 'normal', 'color', 'fx', 'uv'] as const) {
    const [x, y] = [new Uint8Array(a[k].buffer), new Uint8Array(b[k].buffer)];
    expect(y.length, `${a.key} ${a.detail} ${k}`).toBe(x.length);
    expect(x.findIndex((v, i) => v !== y[i]), `${a.key} ${a.detail} ${k}`).toBe(-1);
  }
  expect(a.sphere).toEqual(b.sphere);
}

/** Walk `line` as the zone keeps you: true if nothing ever pushed you off it. */
function walksFreely(line: readonly (readonly [number, number])[]): string | null {
  const p = new Vector3();
  for (const [x, z] of line) {
    p.set(x, 0, z);
    sallows.resolve(p, r);
    if (Math.hypot(p.x - x, p.z - z) > 1e-6) return `pushed at (${x.toFixed(1)}, ${z.toFixed(1)})`;
  }
  return null;
}

describe('the Sallows, as the registry lists it', () => {
  it('is a zone called the Sallows, beside Brackenmoor over the Fen road and Aldhaven over the causeway', () => {
    expect(findMap('sallows')).toMatchObject({ kind: 'zone', label: 'The Sallows', neighbours: ['brackenmoor', 'aldhaven'] });
  });

  it("spans 12 by 11 chunks east of Brackenmoor's Fen road and south of Aldhaven, none of them another zone's", () => {
    const keys = sallowsChunks();
    expect(keys).toHaveLength(132);
    const [is, js] = [keys.map((k) => chunkIndex(k)[0]), keys.map((k) => chunkIndex(k)[1])];
    expect([Math.min(...is), Math.max(...is), Math.min(...js), Math.max(...js)]).toEqual([7, 18, 13, 23]);
    expect(keys.filter((k) => oakvaleChunks().includes(k) || moorChunks().includes(k))).toEqual([]);
    expect(sallows.land).toEqual({ minX: 260, maxX: 740, minZ: 500, maxZ: 940 });
  });

  it('is empty and safe: nothing lives there and there is nowhere to wake', () => {
    expect([sallows.camps, sallows.villagers, sallows.pickups, sallows.interiors, sallows.chests, sallows.spots, sallows.mine]).toEqual([[], [], [], [], [], [], null]);
    expect(isStartingZone(sallows)).toBe(false);
  });

  it("has its own air under the same sun: a green-grey mist closing much nearer than the moor's", () => {
    const m = SALLOWS_ATMOSPHERE;
    expect(sallows.atmosphere).toBe(m);
    const rgb = (hex: number) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
    const [fr, fg, fb] = rgb(m.fog.color);
    // Greener than it is red or blue.
    expect(fg).toBeGreaterThan(fr);
    expect(fg).toBeGreaterThan(fb);
    expect(m.fog.near).toBeLessThan(MOOR_ATMOSPHERE.fog.near);
    expect(m.fog.far).toBeLessThan(MOOR_ATMOSPHERE.fog.far / 2);
    expect(m.farPlane).toBeGreaterThan(m.fog.far);
  });
});

describe("the Sallows' seams", () => {
  it("meets the Fen road seam's heights exactly along x = 260, and lists that seam", () => {
    for (let z = FEN_ROAD.minZ; z <= FEN_ROAD.maxZ; z += FEN_ROAD.step) expect(plan.ground.at(FEN_ROAD.x, z), `z ${z}`).toBeCloseTo(fenRoadHeight(z), 5);
    expect(sallows.sideSeams).toEqual([fenRoadSeam()]);
  });

  it("gives Aldhaven its north edge to meet: low fen, the causeway's bank and the Great Channel", () => {
    const [north] = sallows.seams;
    expect(north).toMatchObject({ z: SALLOWS.land.minZ, minX: SALLOWS.land.minX, maxX: SALLOWS.land.maxX, step: SALLOWS.cell });
    north.heights.forEach((h, i) => expect(h, `x ${SALLOWS.land.minX + i * 2}`).toBeCloseTo(i === 0 ? fenRoadHeight(FEN_ROAD.minZ) : northEdgeHeight(SALLOWS.land.minX + i * SALLOWS.cell), 6));
    expect(north.roads).toEqual([{ x: CAUSEWAY.x, width: CAUSEWAY.width, dir: [0, -1] }]);
    expect(plan.heightAt(CAUSEWAY.x, SALLOWS.land.minZ)).toBeCloseTo(CAUSEWAY.y, 1);
  });

  it('carries the Fen road and the causeway on over their seams, where you can walk', () => {
    const fen = plan.roads.find((r) => r.id === 'fen')!;
    expect(fen.line[0]).toEqual([FEN_ROAD.x, FEN_ROAD.road.z]);
    expect(fen.heights[0]).toBe(FEN_ROAD.road.y);
    expect(sallows.walkable.contains(FEN_ROAD.x - CONFIG.world.ground.seam + 0.01, FEN_ROAD.road.z)).toBe(true);
    const causeway = plan.roads.find((r) => r.id === 'causeway')!;
    expect(causeway.line[0]).toEqual([CAUSEWAY.x, SALLOWS.land.minZ]);
    expect(sallows.walkable.contains(CAUSEWAY.x, SALLOWS.land.minZ - CONFIG.world.ground.seam + 0.01)).toBe(true);
  });
});

describe("the Sallows' land and water", () => {
  it('is almost flat: nearly all of where you walk lies within a few metres of the water, a third of it under it', () => {
    let n = 0;
    let wet = 0;
    let low = 0;
    for (let z = SALLOWS.walk.minZ; z <= SALLOWS.walk.maxZ; z += 4) {
      for (let x = SALLOWS.walk.minX + 30; x <= SALLOWS.walk.maxX; x += 4) {
        const h = plan.ground.at(x, z);
        n++;
        if (h < SALLOWS.water) wet++;
        if (h > -3 && h < 4) low++;
      }
    }
    expect(low / n).toBeGreaterThan(0.97);
    expect(wet / n).toBeGreaterThan(0.2);
    expect(wet / n).toBeLessThan(0.5);
  });

  it('runs every road on a bank above the water', () => {
    for (const road of plan.roads) {
      road.line.forEach(([x, z], i) => {
        if (!sallows.walkable.contains(x, z)) return;
        expect(plan.heightAt(x, z), `${road.id} at ${i}`).toBeGreaterThan(SALLOWS.water + 0.4);
      });
    }
  });

  it('lets you walk every road and track end to end, and the walkways over Reedholm’s pool', () => {
    for (const road of plan.roads) {
      const inside = road.line.filter(([x, z]) => sallows.walkable.contains(x, z) && sallows.walkable.contains(x + 1, z) && sallows.walkable.contains(x - 1, z));
      expect(walksFreely(inside), road.id).toBeNull();
    }
    // From the landing along the main walkway, over the square, to the moot hall's island.
    const { landing, square, moot } = REEDHOLM;
    const walk: [number, number][] = [];
    for (let x = landing.x + 2; x <= moot.x - 5; x += 0.25) walk.push([x, square.z]);
    expect(walksFreely(walk)).toBeNull();
    for (const [x, z] of walk.filter(([x]) => x > landing.x + 8 && x < moot.x - 7)) expect(plan.heightAt(x, z), `x ${x}`).toBeCloseTo(SALLOWS.deck, 6);
  });

  it("keeps you out of the Great Channel, which is deep, but over its crossings: the old bridge open, the sluice's walkway chained shut", () => {
    const p = new Vector3();
    // Wading east into it from the west bank, you're held at the bank.
    for (const z of [560, 640, 760]) {
      const [cx] = plan.channel.reduce((best, q) => (Math.abs(q[1] - z) < Math.abs(best[1] - z) ? q : best));
      p.set(cx - SALLOWS.channel.half - 14, 0, z);
      for (let i = 0; i < 150; i++) {
        p.x += 0.2;
        sallows.resolve(p, r);
      }
      // Slid along the bank, perhaps, but never in.
      expect(nearestOnPolyline(plan.channel, p.x, p.z).d, `z ${z}`).toBeGreaterThan(SALLOWS.channel.half);
      expect(p.x, `z ${z}`).toBeLessThan(cx);
    }
    // Over the old bridge, end to end, nothing stops you.
    const [bw, be] = CROSSINGS.bridge;
    const line: [number, number][] = [];
    for (let t = 0; t <= 1; t += 0.01) line.push([bw[0] + (be[0] - bw[0]) * t, bw[1] + (be[1] - bw[1]) * t]);
    expect(walksFreely(line)).toBeNull();
    for (const [x, z] of line) expect(plan.heightAt(x, z)).toBeGreaterThan(SALLOWS.water + 0.5);
    // Over the sluice's walkway, the gate at its east end stops you.
    const [sw, se] = CROSSINGS.sluice;
    p.set(sw[0], 0, sw[1]);
    // A step at a time, as you'd walk, heading for its east end.
    for (let i = 0; i < 400; i++) {
      const [dx, dz] = [se[0] - p.x, se[1] - p.z];
      const d = Math.hypot(dx, dz) || 1;
      p.x += (dx / d) * Math.min(0.1, d);
      p.z += (dz / d) * Math.min(0.1, d);
      sallows.resolve(p, r);
    }
    expect(Math.hypot(p.x - se[0], p.z - se[1])).toBeGreaterThan(1.5);
  });

  it('is walkable from the Fen road to every spot a body can stand on, but for the far bank beyond the Great Channel, reached by the old bridge', () => {
    const step = 1;
    const { minX, maxX, minZ, maxZ } = SALLOWS.walk;
    const nx = Math.round((maxX - minX) / step) + 1;
    const nz = Math.round((maxZ - minZ) / step) + 1;
    const p = new Vector3();
    const free = new Uint8Array(nx * nz);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) free[i * nz + j] = sallows.resolve(p.set(minX + i * step, 0, minZ + j * step), r) ? 0 : 1;
    const seen = new Uint8Array(nx * nz);
    const start = Math.round((280 - minX) / step) * nz + Math.round((FEN_ROAD.road.z - minZ) / step);
    expect(free[start]).toBe(1);
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      const [i, j] = [Math.floor(k / nz), k % nz];
      for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
        if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const kk = a * nz + b;
        if (free[kk] && !seen[kk]) {
          seen[kk] = 1;
          stack.push(kk);
        }
      }
    }
    let pockets = 0;
    let total = 0;
    for (let k = 0; k < nx * nz; k++) {
      // The Great Channel itself is no one's to stand in.
      if (!free[k] || nearestOnPolyline(plan.channel, minX + Math.floor(k / nz) * step, minZ + (k % nz) * step).d < SALLOWS.channel.half + 1) continue;
      total++;
      if (!seen[k]) pockets++;
    }
    // A cell or two can be boxed in between a building and its neighbours; the land itself is all one.
    expect(pockets / total).toBeLessThan(0.002);
    const reach = (x: number, z: number) => seen[Math.round((x - minX) / step) * nz + Math.round((z - minZ) / step)];
    for (const l of sallows.landmarks) expect(reach(Math.round(l.x), Math.round(l.z)), l.label).toBe(1);
  }, 60000);
});

describe('what stands in the Sallows', () => {
  it('builds Reedholm: the moot hall, the inn, the forge, a market of stilt houses, the landing with its map board and signpost', () => {
    const count = (kind: string) => plan.structures.filter((s) => s.kind === kind).length;
    for (const kind of ['mootHall', 'inn', 'forge', 'herbHut', 'tollHouse', 'sluice', 'sluiceTower', 'drownedTower', 'bellTower', 'gibbet', 'chapel', 'kiln', 'cog', 'smokehouse', 'lastStone']) {
      expect(count(kind), kind).toBeGreaterThanOrEqual(1);
    }
    expect(count('stiltHouse')).toBeGreaterThanOrEqual(20);
    expect(count('mapboard')).toBe(2);
    expect(count('sunkCottage')).toBeGreaterThanOrEqual(5);
  });

  it('stands nothing solid on a road or a walkway', () => {
    const inside = (x: number, z: number) => sallows.walkable.contains(x, z) && sallows.walkable.contains(x + 1, z) && sallows.walkable.contains(x - 1, z);
    for (const s of plan.structures) {
      if (!s.solid || s.kind === 'sluiceGate') continue;
      for (const road of plan.roads) {
        const d = Math.min(...road.line.filter(([x, z]) => inside(x, z)).map(([x, z]) => Math.hypot(x - s.x, z - s.z)));
        expect(d - road.width / 2, `${s.kind} at (${s.x.toFixed(1)}, ${s.z.toFixed(1)}) by ${road.id}`).toBeGreaterThan(Math.min(s.w, s.d) / 2);
      }
      // The forge stands on its own stone footing, the lanterns on the walkways' edges, the market's stalls, crates and tables round the square's edges.
      const square = plan.decks.find((d) => d.x === REEDHOLM.square.x && d.z === REEDHOLM.square.z);
      for (const deck of s.kind === 'forge' || s.kind === 'lanternPost' ? [] : plan.decks) {
        const dx = s.x - deck.x;
        const dz = s.z - deck.z;
        const lx = dx * Math.cos(deck.yaw) - dz * Math.sin(deck.yaw);
        const lz = dx * Math.sin(deck.yaw) + dz * Math.cos(deck.yaw);
        const on = Math.abs(lx) < deck.hw && Math.abs(lz) < deck.hd;
        // Well off the main walkway across the square's middle.
        if ((s.kind === 'stall' || s.kind === 'crates' || s.kind === 'trestle') && deck === square) expect(on && Math.abs(s.z - REEDHOLM.square.z) < 4, `${s.kind} at (${s.x.toFixed(1)}, ${s.z.toFixed(1)}) in the square's way`).toBe(false);
        else expect(on, `${s.kind} at (${s.x.toFixed(1)}, ${s.z.toFixed(1)}) on a deck`).toBe(false);
      }
    }
  });

  it('grows reed beds taller than you, willow and alder carr, sedge and lilies, and none on a road', () => {
    const count = (kind: string) => plan.plants.filter((p) => p.kind === kind).length;
    expect(count('reed')).toBeGreaterThan(5000);
    expect(count('willow') + count('alder')).toBeGreaterThan(150);
    expect(count('pollard')).toBeGreaterThan(15);
    expect(count('sedge')).toBeGreaterThan(1000);
    expect(count('lily')).toBeGreaterThan(100);
    for (const p of plan.plants) {
      for (const road of plan.roads) {
        if (!sallows.walkable.contains(p.x, p.z)) continue;
        expect(nearestOnPolyline(road.line, p.x, p.z).d, `${p.kind} (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) on ${road.id}`).toBeGreaterThan(road.width / 2);
      }
    }
  }, 60000);

  it('starts ?map=sallows on the Fen road by the Last Stone, looking east, and every landmark is somewhere you can walk', () => {
    const { spawn } = sallows;
    expect(spawn.x - FEN_ROAD.x).toBeLessThan(12);
    expect(nearestOnPolyline(plan.roads[0].line, spawn.x, spawn.z).d).toBeLessThan(0.5);
    expect(Math.sin(spawn.yaw)).toBeCloseTo(-1); // facing +X, east
    for (const l of sallows.landmarks) expect(sallows.walkable.contains(l.x, l.z), l.label).toBe(true);
  });
});

describe("the Sallows' chunks", () => {
  it('builds each chunk the same every time, whatever was built before', () => {
    const keys = sallowsChunks();
    const first = new Map<string, ChunkData>();
    for (const detail of ['full', 'standIn'] as const) for (const key of keys) first.set(`${key} ${detail}`, buildSallowsChunk(plan, key, detail));
    // Again, the other way round and from a plan made afresh.
    const again = planSallows();
    for (const detail of ['standIn', 'full'] as const) for (const key of [...keys].reverse()) same(buildSallowsChunk(again, key, detail), first.get(`${key} ${detail}`)!);
  }, 60000);

  it('builds every chunk byte for byte in its worker as on the main thread', () => {
    const replies: { reply: ChunkReply; transfer: Transferable[] }[] = [];
    const scope: ChunkServerScope = { onmessage: null, postMessage: (reply, transfer) => replies.push({ reply, transfer }) };
    serveChunks(scope, sallowsBuilder());
    let id = 0;
    for (const detail of ['full', 'standIn'] as Detail[]) {
      for (const key of sallowsChunks().filter((_, i) => i % 7 === 0)) {
        scope.onmessage!({ data: { id: id++, key, detail } });
        const { reply, transfer } = replies.pop()!;
        if (!('data' in reply)) throw new Error(reply.error);
        const got = structuredClone(reply, { transfer }) as { data: ChunkData };
        same(got.data, buildSallowsChunk(plan, key, detail));
      }
    }
  }, 60000);

  it("keeps within the headset's budget: no full chunk over the chunk budget's triangles, stand-ins cheaper still", () => {
    for (const key of sallowsChunks()) {
      const full = buildSallowsChunk(plan, key, 'full').position.length / 9;
      const standIn = buildSallowsChunk(plan, key, 'standIn').position.length / 9;
      expect(full, key).toBeLessThan(CONFIG.streaming.budget.chunk);
      expect(standIn, key).toBeLessThan(full);
    }
  }, 60000);

  it("refuses a chunk that isn't the Sallows'", () => {
    expect(() => buildSallowsChunk(plan, '0,0', 'full')).toThrow();
  });
});
