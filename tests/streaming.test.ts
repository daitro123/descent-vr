import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PointLight, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { buildOakvaleChunk, oakvaleBuilder, oakvaleChunks } from '../src/maps/forest/chunks';
import { buildLayout, FOREST, type ForestLayout, OAKVALE_ATMOSPHERE } from '../src/maps/forest/layout';
import { MAPS } from '../src/maps/registry';
import { Walkable } from '../src/maps/walkable';
import { type ChunkData, type ChunkKey, chunkAt, chunkBounds, chunkDistance, type ChunkSource, chunkKey, type Detail } from '../src/world/chunks';
import { type ChunkPort, type ChunkReply, type ChunkRequest, type ChunkServerScope, ChunkWorker, serveChunks } from '../src/world/chunkWorker';
import { Stager } from '../src/world/staging';
import { Streamer } from '../src/world/streamer';
import { beyondFog, decide, detailFor, reachTo } from '../src/world/streaming';

// Oakvale in streamed chunks: a zone is a pure plan and a chunk builder, and
// what's loaded where is a pure decision from where you stand. The streamer
// acts on the decisions a chunk or so a frame.

let plan: ForestLayout;
beforeAll(() => {
  plan = buildLayout();
});

const { chunk, full, hysteresis } = CONFIG.streaming;
/** Oakvale's own reach: out to its fog's far edge. */
const reach = reachTo(OAKVALE_ATMOSPHERE.fog.far);
const keys = () => oakvaleChunks();

/** Walk the decisions along `path`, feeding each back in as what's loaded, as the streamer does. */
function walk(path: readonly [number, number][]): Map<ChunkKey, Detail>[] {
  let now = new Map<ChunkKey, Detail>();
  return path.map(([x, z]) => (now = decide(x, z, keys(), now, reach)));
}

/** Two chunks byte for byte, NaNs and all: the first byte that differs, if any (a deep equal over a million bytes takes seconds). */
function same(a: ChunkData, b: ChunkData): void {
  for (const k of ['position', 'normal', 'color', 'fx', 'uv'] as const) {
    const [x, y] = [new Uint8Array(a[k].buffer), new Uint8Array(b[k].buffer)];
    expect(y.length, `${a.key} ${a.detail} ${k}`).toBe(x.length);
    expect(x.findIndex((v, i) => v !== y[i]), `${a.key} ${a.detail} ${k}`).toBe(-1);
  }
  expect(a.sphere).toEqual(b.sphere);
}

/**
 * A worker in this thread: `serveChunks` over `build`, each reply passed on
 * as postMessage would, its arrays transferred. Requests wait for `answer`.
 */
function inThread(build: (key: ChunkKey, detail: Detail) => ChunkData) {
  const asked: ChunkRequest[] = [];
  const replies: { reply: ChunkReply; transfer: Transferable[] }[] = [];
  /** Each chunk as the worker built it, before it was sent. */
  const sent: ChunkData[] = [];
  const scope: ChunkServerScope = { onmessage: null, postMessage: (reply, transfer) => replies.push({ reply, transfer }) };
  serveChunks(scope, build);
  const port: ChunkPort & { terminated: boolean } = {
    onmessage: null,
    onerror: null,
    terminated: false,
    postMessage: (request: ChunkRequest) => asked.push(request),
    terminate: () => (port.terminated = true),
  };
  return {
    port,
    asked,
    sent,
    /** Build the first `n` asked for, in order, and hand each back. */
    answer(n = Infinity) {
      for (const request of asked.splice(0, n)) scope.onmessage!({ data: request });
      for (const { reply, transfer } of replies.splice(0)) {
        if ('data' in reply) sent.push(reply.data);
        port.onmessage?.({ data: structuredClone(reply, { transfer }) } as MessageEvent<ChunkReply>);
      }
    },
    fail: () => port.onerror?.({ message: 'lost' } as ErrorEvent),
  };
}

describe('the chunk grid', () => {
  it('centres a 40 m chunk on each multiple of 40 m, with keys the same whichever zone asks', () => {
    expect(chunk).toBe(40);
    expect(chunkAt(0, 0)).toBe('0,0');
    expect(chunkAt(19.9, -19.9)).toBe('0,0');
    expect(chunkAt(20, -20.1)).toBe('1,-1');
    expect(chunkBounds('3,-3')).toEqual({ minX: 100, maxX: 140, minZ: -140, maxZ: -100 });
    // Brackenmoor's first row starts at the crest, z = 140.
    expect(chunkBounds('0,4').minZ).toBe(140);
    expect(chunkDistance('0,0', 5, 5)).toBe(0);
    expect(chunkDistance('3,0', 0, 0)).toBe(100);
  });

  it("covers Oakvale's terrain with 7 by 7 chunks and nothing past it", () => {
    const all = keys();
    expect(all).toHaveLength(49);
    const b = all.map(chunkBounds);
    expect(Math.min(...b.map((c) => c.minX))).toBe(-FOREST.half);
    expect(Math.max(...b.map((c) => c.maxZ))).toBe(FOREST.half);
  });
});

describe("Oakvale's zone", () => {
  it('registers by folder as a zone called Oakvale, at the grid origin; the crypt stays a whole-build map', () => {
    const forest = MAPS.find((m) => m.id === 'forest')!;
    expect(forest).toMatchObject({ kind: 'zone', label: 'Oakvale', origin: { x: 0, z: 0 }, neighbours: ['brackenmoor'] });
    expect(MAPS.find((m) => m.id === 'crypt')!.kind).toBe('whole');
  });

  it('plans its atmosphere and its heights along the crest of the southern pass', () => {
    expect(plan.atmosphere).toBe(OAKVALE_ATMOSPHERE);
    const [crest] = plan.seams;
    expect(crest).toMatchObject({ z: 140, minX: -100, maxX: 100 });
    expect(crest.heights).toHaveLength((crest.maxX - crest.minX) / crest.step + 1);
    crest.heights.forEach((h, k) => expect(h).toBe(plan.ground.at(crest.minX + k * crest.step, crest.z)));
  });
});

describe("Oakvale's chunk builder", () => {
  it('builds a chunk the same every time, whatever was built before it and from a plan made afresh', () => {
    for (const detail of ['full', 'standIn'] as const) {
      const first = buildOakvaleChunk(plan, '0,0', detail);
      buildOakvaleChunk(plan, '1,0', detail);
      buildOakvaleChunk(plan, '-2,1', 'full');
      same(buildOakvaleChunk(plan, '0,0', detail), first);
      same(buildOakvaleChunk(buildLayout(), '0,0', detail), first);
    }
  }, 20000);

  it('builds the whole of Oakvale between its chunks, as the one mesh did: every building, field and tree once', () => {
    let triangles = 0;
    for (const key of keys()) triangles += buildOakvaleChunk(plan, key, 'full').position.length / 9;
    // Before streaming, the forest's 49 chunk meshes held 264,304 triangles between them;
    // the pass's rocks and pines, opened to the crest (ticket 36), added 2,238. The triangle
    // budget's cuts (ticket 38: the far trees deep in the woods, the edge's mountains thinned)
    // take that 266,542 down to 214,824, and clearing what grew where the copper veins stand
    // (professions ticket 13) to 214,310.
    expect(triangles).toBe(214310);
  }, 20000);

  it("cuts the budget's triangles in the woods and on the edge's mountains, and leaves the village as it was", () => {
    const triangles = (key: ChunkKey) => buildOakvaleChunk(plan, key, 'full').position.length / 9;
    // Before the cuts: the village's chunk 12,035, the woods north-west of it 8,493, the western mountains 2,062.
    expect(triangles('0,0')).toBe(12035);
    expect(triangles('-1,-1')).toBeLessThan(8493 * 0.97);
    expect(triangles('-3,0')).toBeLessThan(2062 * 0.75);
  }, 20000);

  it('makes stand-ins cheaper than full detail everywhere, and about half in the woods and the village', () => {
    let fullTotal = 0;
    let standInTotal = 0;
    for (const key of keys()) {
      const f = buildOakvaleChunk(plan, key, 'full').position.length;
      const s = buildOakvaleChunk(plan, key, 'standIn').position.length;
      expect(s, key).toBeLessThan(f);
      fullTotal += f;
      standInTotal += s;
    }
    expect(standInTotal / fullTotal).toBeLessThan(0.6);
  }, 20000);

  it('rounds each chunk with a sphere holding all it draws', () => {
    for (const key of ['0,0', '-3,3', '1,-2'] as const) {
      const c = buildOakvaleChunk(plan, key, 'full');
      const { x, y, z, r } = c.sphere;
      for (let i = 0; i < c.position.length; i += 3) {
        expect(Math.hypot(c.position[i] - x, c.position[i + 1] - y, c.position[i + 2] - z)).toBeLessThanOrEqual(r + 1e-3);
      }
    }
  });

  it("hangs a stand-in's skirt below every crack its coarse edge could open against full ground beside it", () => {
    const c = buildOakvaleChunk(plan, '-1,-2', 'standIn');
    const { minX } = chunkBounds('-1,-2');
    // Along its west edge, the lowest point drawn at each full-detail height sample is below the full ground there.
    const { cell } = FOREST;
    for (let z = -100; z <= -60; z += cell) {
      let lowest = Infinity;
      for (let i = 0; i < c.position.length; i += 3) {
        if (Math.abs(c.position[i] - minX) < 1e-4 && Math.abs(c.position[i + 2] - z) <= cell + 1e-4) lowest = Math.min(lowest, c.position[i + 1]);
      }
      expect(lowest, `z ${z}`).toBeLessThan(plan.ground.at(minX, z));
    }
  });

  it("won't build a chunk that isn't Oakvale's", () => {
    expect(() => buildOakvaleChunk(plan, '0,4', 'full')).toThrow();
  });
});

describe("the streamer's decisions", () => {
  it('keeps chunks at full detail within 100 m, stand-ins out past the fog, and nothing beyond, a chunk of hysteresis on each', () => {
    expect([full, hysteresis, reach.far]).toEqual([100, 40, 200]);
    expect(detailFor(100, null, reach)).toBe('full');
    expect(detailFor(101, null, reach)).toBe('standIn');
    // Kept full a chunk late…
    expect(detailFor(140, 'full', reach)).toBe('full');
    expect(detailFor(141, 'full', reach)).toBe('standIn');
    // …fetched a chunk early, before the fog's far edge reaches it, and dropped a chunk late.
    expect(detailFor(240, null, reach)).toBe('standIn');
    expect(detailFor(241, null, reach)).toBe(null);
    expect(detailFor(280, 'standIn', reach)).toBe('standIn');
    expect(detailFor(280, 'full', reach)).toBe('standIn');
    expect(detailFor(281, 'standIn', reach)).toBe(null);
  });

  it('at the crossroads has all Oakvale in, the ring round its edge as stand-ins but for the middle of each side', () => {
    const at = decide(0, 0, keys(), new Map(), reach);
    expect(at.size).toBe(49);
    const standIns = [...at].filter(([, d]) => d === 'standIn').map(([k]) => k);
    expect(standIns).toHaveLength(20);
    for (const key of ['0,-3', '0,3', '-3,0', '3,0'] as const) expect(at.get(key)).toBe('full');
    for (const key of standIns) expect(chunkDistance(key, 0, 0)).toBeGreaterThan(full);
  });

  it('in front of the old mine has the south of Oakvale as stand-ins', () => {
    const at = decide(-14, -75, keys(), new Map(), reach);
    expect(at.size).toBe(49);
    for (const [key, detail] of at) {
      const d = chunkDistance(key, -14, -75);
      expect(detail, key).toBe(d <= full ? 'full' : 'standIn');
    }
    expect(at.get('0,3')).toBe('standIn');
    expect(at.get('0,2')).toBe('standIn');
    expect(at.get('0,1')).toBe('full');
  });

  it("at the play area's corner leaves the far corner unloaded", () => {
    const at = decide(84, 84, keys(), new Map(), reach);
    expect(at.has('-3,-3')).toBe(false);
    expect(at.get('3,3')).toBe('full');
    expect(at.get('-3,3')).toBe('standIn');
  });

  it('walking north to south and back swaps each chunk at most once each way, a chunk later than it came in', () => {
    const south: [number, number][] = [];
    for (let z = -80; z <= 84; z += 0.5) south.push([-6, z]);
    const there = walk(south);
    const back = walk([...south].reverse());
    for (const key of keys()) {
      const swaps = there.filter((m, i) => i > 0 && m.get(key) !== there[i - 1].get(key)).length;
      expect(swaps, key).toBeLessThanOrEqual(1);
    }
    // The ridge behind the mine went to a stand-in on the way south…
    const ridge: ChunkKey = '0,-3';
    const out = there.findIndex((m) => m.get(ridge) === 'standIn');
    expect(out).toBeGreaterThan(0);
    // …only once a chunk past 120 m from it, not the moment it passed 120 m.
    expect(chunkDistance(ridge, ...south[out])).toBeGreaterThan(full + hysteresis - 1);
    // On the way back it's full again as soon as it's back within 120 m.
    const north = [...south].reverse();
    const again = back.findIndex((m) => m.get(ridge) === 'full');
    expect(chunkDistance(ridge, ...north[again])).toBeLessThanOrEqual(full);
    expect(chunkDistance(ridge, ...north[again])).toBeGreaterThan(full - 1);
  });

  it('culls a chunk once its sphere is wholly past the fog', () => {
    expect(beyondFog(220, 30, 200)).toBe(false);
    expect(beyondFog(231, 30, 200)).toBe(true);
  });
});

/** A zone of `n` by `n` chunks round the origin, each a box, counting what's built. */
function boxes(n: number): ChunkSource & { built: string[] } {
  const keys: ChunkKey[] = [];
  const r = (n - 1) / 2;
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) keys.push(chunkKey(i, j));
  const built: string[] = [];
  return {
    keys,
    built,
    build(key, detail) {
      built.push(`${key} ${detail}`);
      const g = new BoxGeometry(detail === 'full' ? 4 : 2, 1, 1);
      const position = new Float32Array(g.getAttribute('position').array);
      const count = position.length / 3;
      const b = chunkBounds(key);
      for (let i = 0; i < position.length; i += 3) (position[i] += (b.minX + b.maxX) / 2), (position[i + 2] += (b.minZ + b.maxZ) / 2);
      return {
        key,
        detail,
        position,
        normal: new Float32Array(count * 3),
        color: new Float32Array(count * 3),
        fx: new Float32Array(count * 2),
        uv: new Float32Array(count * 2),
        sphere: { x: (b.minX + b.maxX) / 2, y: 0, z: (b.minZ + b.maxZ) / 2, r: 3 },
      };
    },
  };
}

/** The chunk a streamed mesh is, from its name. */
const keyOf = (m: { name: string }) => m.name.match(/^chunk-(.+)-(full|standIn)$/)![1] as ChunkKey;

describe('the streamer', () => {
  const material = new MeshBasicMaterial();
  const setup = () => {
    const source = boxes(9);
    const root = new Group();
    const stager = new Stager();
    const streamer = new Streamer(stager, material);
    streamer.add(source, root);
    return { source, root, stager, streamer };
  };
  const eye = (x: number, z: number) => new Vector3(x, 1.6, z);
  /** A frame: what the World does round the render. */
  const frame = (s: ReturnType<typeof setup>, at: Vector3, far = 100) => {
    s.stager.restore();
    s.streamer.update(at, reachTo(far));
    // The render: what's staged is staged until the next frame puts it back.
    s.stager.apply();
  };

  it('fills round you at once on loading in, then builds at most one chunk a frame as you walk, nearest first', () => {
    const s = setup();
    s.streamer.fill(0, 0, reachTo(100));
    const filled = s.source.built.length;
    expect(filled).toBe(s.root.children.length);
    expect(s.streamer.counts.full).toBeGreaterThan(0);
    expect(s.streamer.counts.standIn).toBeGreaterThan(0);
    // Walk 60 m east: a few frames, one build each, till nothing's left to do.
    let frames = 0;
    let last = filled;
    while (frames < 200) {
      frame(s, eye(60, 0));
      frames++;
      expect(s.source.built.length - last).toBeLessThanOrEqual(CONFIG.streaming.perFrame);
      last = s.source.built.length;
      if (s.streamer.pending === 0) break;
    }
    expect(s.streamer.pending).toBe(0);
    const walked = s.source.built.slice(filled);
    expect(walked.length).toBeGreaterThan(3);
    // Nearest first.
    const distances = walked.map((b) => chunkDistance(b.split(' ')[0] as ChunkKey, 60, 0));
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it('stages a new chunk unseen for a frame, and swaps it for what was there only the frame after', () => {
    const s = setup();
    s.streamer.fill(0, 0, reachTo(100));
    frame(s, eye(0, 0));
    // Step east far enough that chunks change.
    frame(s, eye(100, 0));
    const staged = s.root.children.find((m) => (m as Mesh).material !== material) as Mesh;
    expect(staged).toBeDefined();
    expect(staged.frustumCulled).toBe(false);
    expect((staged.material as MeshBasicMaterial).visible).toBe(false);
    // What it replaces still draws this frame…
    const key = keyOf(staged);
    const was = s.root.children.filter((m) => m !== staged && keyOf(m) === key);
    expect(was.every((m) => (m as Mesh).material === material)).toBe(true);
    // …and is gone the next, when the new one draws.
    frame(s, eye(100, 0));
    expect(staged.material).toBe(material);
    expect(staged.frustumCulled).toBe(true);
    expect(s.root.children.filter((m) => keyOf(m) === key)).toEqual([staged]);
  });

  it('drops what goes out of reach, and counts what it has by detail', () => {
    const s = setup();
    s.streamer.fill(0, 0, reachTo(30));
    const near = s.streamer.counts;
    s.streamer.fill(160, 160, reachTo(30));
    const { full: f, standIn } = s.streamer.counts;
    expect(f + standIn).toBe(s.root.children.length);
    expect(s.root.children.map((m) => [m.name, chunkDistance(keyOf(m), 160, 160)]).filter(([, d]) => (d as number) > 30 + 2 * hysteresis)).toEqual([]);
    expect(f + standIn).toBeLessThan(near.full + near.standIn);
  });

  it('culls chunks past the fog, and builds nothing while told to wait', () => {
    const s = setup();
    s.streamer.fill(0, 0, reachTo(100));
    frame(s, eye(0, 0), 50);
    // All but the one staged this frame, which draws nothing.
    for (const m of s.root.children.filter((c) => (c as Mesh).material === material)) {
      const sphere = (m as Mesh).geometry.boundingSphere!;
      expect(m.visible, m.name).toBe(!beyondFog(sphere.center.distanceTo(eye(0, 0)), sphere.radius, 50));
    }
    const built = s.source.built.length;
    s.streamer.update(eye(150, 0), reachTo(100), false);
    expect(s.source.built.length).toBe(built);
  });
});

describe("Oakvale's chunk worker", () => {
  it('builds every chunk byte for byte as the main thread does, from a plan of its own, and hands each back without copying', () => {
    const worker = inThread(oakvaleBuilder());
    const back: ChunkData[] = [];
    const client = new ChunkWorker(worker.port, (data) => back.push(data));
    for (const detail of ['full', 'standIn'] as const) {
      for (const key of keys()) client.request(key, detail);
      expect(client.inFlight).toBe(keys().length);
      expect(client.has('0,0', detail)).toBe(true);
      worker.answer();
      expect(client.inFlight).toBe(0);
    }
    expect(back.map((c) => `${c.key} ${c.detail}`)).toEqual(['full', 'standIn'].flatMap((d) => keys().map((k) => `${k} ${d}`)));
    for (const chunk of back) same(chunk, buildOakvaleChunk(plan, chunk.key, chunk.detail));
    // Transferred: what the worker built is left with nothing, every array of it.
    expect(worker.sent.flatMap((c) => [c.position, c.normal, c.color, c.fx, c.uv]).every((a) => a.buffer.byteLength === 0)).toBe(true);
  }, 60000);

  it('passes on why a chunk failed, and is shut', () => {
    const worker = inThread(() => {
      throw new Error('no such chunk');
    });
    const client = new ChunkWorker(worker.port, () => {});
    client.request('9,9', 'full');
    worker.answer();
    expect([client.failed, client.inFlight, worker.port.terminated]).toEqual([true, 0, true]);
  });
});

describe('the streamer, with a worker', () => {
  const material = new MeshBasicMaterial();
  const setup = () => {
    const source = boxes(9);
    // The worker builds the same boxes, counted apart from the main thread's.
    const off = boxes(9);
    const worker = inThread(off.build.bind(off));
    const root = new Group();
    const stager = new Stager();
    const streamer = new Streamer(stager, material);
    streamer.add({ ...source, build: source.build.bind(source), worker: () => worker.port }, root);
    return { source, off, worker, root, stager, streamer };
  };
  const eye = (x: number, z: number) => new Vector3(x, 1.6, z);
  /** A frame round the render, as the World runs it: the chunks staged at its render. */
  const frame = (s: ReturnType<typeof setup>, at: Vector3, far = 200) => {
    s.stager.restore();
    s.streamer.update(at, reachTo(far));
    s.stager.apply();
    return s.root.children.filter((m) => (m as Mesh).material !== material).map(keyOf);
  };

  it('asks its worker for the nearest chunks a few at a time, and uploads at most one a frame of what comes back', () => {
    const s = setup();
    s.streamer.fill(0, 0, reachTo(200));
    const filled = s.source.built.length;
    expect(s.streamer.offThread).toBe(true);
    const staged: ChunkKey[] = [];
    for (let frames = 0; frames < 200 && (frames === 0 || s.streamer.pending > 0); frames++) {
      const now = frame(s, eye(100, 0));
      expect(now.length).toBeLessThanOrEqual(CONFIG.streaming.perFrame);
      staged.push(...now);
      expect(s.worker.asked.length).toBeLessThanOrEqual(CONFIG.streaming.inFlight);
      s.worker.answer();
    }
    expect(s.streamer.pending).toBe(0);
    // Nothing more built here: all of it in the worker, asked for nearest first, and uploaded in that order.
    expect(s.source.built.length).toBe(filled);
    expect(staged.length).toBeGreaterThan(3);
    expect(s.off.built).toEqual(staged.map((k) => s.off.built.find((b) => b.startsWith(`${k} `))));
    const distances = staged.map((k) => chunkDistance(k, 100, 0));
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it("forgets a chunk that comes back once it's no longer wanted", () => {
    const s = setup();
    s.streamer.fill(0, 0, reachTo(200));
    frame(s, eye(100, 0));
    frame(s, eye(100, 0));
    expect(s.worker.asked.length).toBeGreaterThan(0);
    // Back where it was filled before anything comes back: all that was asked for is wanted no more.
    frame(s, eye(0, 0));
    s.worker.answer();
    expect([frame(s, eye(0, 0)), frame(s, eye(0, 0)), s.streamer.pending]).toEqual([[], [], 0]);
  });

  it("builds on the main thread once its worker fails, what it had asked for too, still one a frame", () => {
    const s = setup();
    s.streamer.fill(0, 0, reachTo(200));
    frame(s, eye(100, 0));
    frame(s, eye(100, 0));
    const asked = s.worker.asked.map(({ key, detail }) => `${key} ${detail}`);
    expect(asked.length).toBeGreaterThan(0);
    s.worker.fail();
    expect([s.worker.port.terminated, s.streamer.offThread]).toEqual([true, false]);
    const filled = s.source.built.length;
    for (let frames = 0; frames < 200 && s.streamer.pending > 0; frames++) {
      const before = s.source.built.length;
      expect(frame(s, eye(100, 0)).length).toBeLessThanOrEqual(1);
      expect(s.source.built.length - before).toBeLessThanOrEqual(1);
    }
    expect(s.streamer.pending).toBe(0);
    expect(s.source.built.slice(filled)).toEqual(expect.arrayContaining(asked));
  });
});

describe('staging', () => {
  it("uploads a hidden room's meshes at the render without drawing them, draws what shows as it would, and puts all back", () => {
    const stager = new Stager();
    const lit = new MeshBasicMaterial();
    const room = new Group();
    const inside = new Mesh(new BoxGeometry(), lit);
    const lamp = new PointLight();
    room.add(inside, lamp);
    room.visible = false;
    lamp.visible = false;
    const door = new Mesh(new BoxGeometry(), lit);
    const root = new Group();
    root.add(room, door);
    stager.stage(root);
    // Nothing changes until the render.
    expect([room.visible, stager.busy]).toEqual([false, true]);
    stager.apply();
    expect(room.visible).toBe(true);
    expect((inside.material as MeshBasicMaterial).visible).toBe(false);
    expect(inside.frustumCulled).toBe(false);
    // The door already draws, and uploads out of view too; a light never comes on for it.
    expect([door.material, door.frustumCulled]).toEqual([lit, false]);
    expect(lamp.visible).toBe(false);
    stager.restore();
    expect([room.visible, inside.material, inside.frustumCulled, door.frustumCulled, stager.busy]).toEqual([false, lit, true, true, false]);
    // Staged twice over in one render (the room with its building, and again on its own): put back as it was all the same.
    stager.stage(root);
    stager.stage(room, true);
    stager.stage(door, true);
    stager.apply();
    expect([(door.material as MeshBasicMaterial).visible, lamp.visible]).toEqual([false, false]);
    stager.restore();
    expect([room.visible, inside.material, inside.frustumCulled, door.material, door.frustumCulled]).toEqual([false, lit, true, lit, true]);
  });
});

describe('the walkable area', () => {
  const r = CONFIG.player.bodyRadius;
  const push = (w: Walkable, x: number, z: number) => {
    const p = new Vector3(x, 0, z);
    w.keepInside(p, r);
    return [p.x, p.z];
  };

  it("keeps you inside Oakvale's play square with your body's width to spare", () => {
    const { play } = FOREST;
    const w = plan.walkable;
    // The square, and the pass's corridor on south to the crest and a metre over it.
    expect(w.bounds).toEqual({ minX: -play, maxX: play, minZ: -play, maxZ: 140 + CONFIG.world.ground.seam });
    expect(push(w, 10, 10)).toEqual([10, 10]);
    expect(push(w, play + 5, 3)[0]).toBeCloseTo(play - r);
    expect(push(w, play - 0.05, 3)[0]).toBeCloseTo(play - r);
    const corner = push(w, play + 3, -play - 3);
    expect(corner[0]).toBeCloseTo(play - r);
    expect(corner[1]).toBeCloseTo(-play + r);
    expect(w.distance(0, 0)).toBe(0);
    expect(w.distance(play + 3, 0)).toBeCloseTo(3);
  });

  it('lets you walk from one area into another where they meet, as the pass will join the play square', () => {
    const w = new Walkable([
      [
        [-84, -84],
        [84, -84],
        [84, 84],
        [-84, 84],
      ],
      [
        [-10, 80],
        [10, 80],
        [10, 140],
        [-10, 140],
      ],
    ]);
    // Across the join, nothing pushes you back.
    for (let z = 70; z <= 120; z += 0.25) expect(push(w, 0, z)).toEqual([0, z]);
    // Beside the corridor, the square's edge still holds.
    expect(push(w, 30, 90)[1]).toBeCloseTo(84 - r);
    // In the corridor its walls hold, and at the corner where it leaves the square you're kept off it.
    expect(push(w, 9.9, 110)[0]).toBeCloseTo(10 - r);
    const [cx, cz] = push(w, 10.05, 84.05);
    expect(Math.hypot(cx - 10, cz - 84)).toBeGreaterThanOrEqual(r - 1e-6);
    expect(w.contains(cx, cz)).toBe(true);
  });
});
