import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PointLight, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { buildOakvaleChunk, oakvaleChunks } from '../src/maps/forest/chunks';
import { buildLayout, FOREST, type ForestLayout, OAKVALE_ATMOSPHERE } from '../src/maps/forest/layout';
import { MAPS } from '../src/maps/registry';
import { Walkable } from '../src/maps/walkable';
import { type ChunkData, type ChunkKey, chunkAt, chunkBounds, chunkDistance, type ChunkSource, chunkKey, type Detail } from '../src/world/chunks';
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
    expect(forest).toMatchObject({ kind: 'zone', label: 'Oakvale', origin: { x: 0, z: 0 }, neighbours: [] });
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
  const same = (a: ChunkData, b: ChunkData) => {
    // Byte for byte, NaNs and all.
    for (const k of ['position', 'normal', 'color', 'fx', 'uv'] as const) expect(new Uint8Array(a[k].buffer), k).toEqual(new Uint8Array(b[k].buffer));
    expect(a.sphere).toEqual(b.sphere);
  };

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
    // Before streaming, the forest's 49 chunk meshes held 264,304 triangles between them.
    expect(triangles).toBe(264304);
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
  it('keeps chunks at full detail within 120 m, stand-ins out past the fog, and nothing beyond, a chunk of hysteresis on each', () => {
    expect([full, hysteresis, reach.far]).toEqual([120, 40, 200]);
    expect(detailFor(120, null, reach)).toBe('full');
    expect(detailFor(121, null, reach)).toBe('standIn');
    // Kept full a chunk late…
    expect(detailFor(160, 'full', reach)).toBe('full');
    expect(detailFor(161, 'full', reach)).toBe('standIn');
    // …fetched a chunk early, before the fog's far edge reaches it, and dropped a chunk late.
    expect(detailFor(240, null, reach)).toBe('standIn');
    expect(detailFor(241, null, reach)).toBe(null);
    expect(detailFor(280, 'standIn', reach)).toBe('standIn');
    expect(detailFor(280, 'full', reach)).toBe('standIn');
    expect(detailFor(281, 'standIn', reach)).toBe(null);
  });

  it('at the crossroads has all Oakvale in but its far corners at full detail', () => {
    const at = decide(0, 0, keys(), new Map(), reach);
    expect(at.size).toBe(49);
    const standIns = [...at].filter(([, d]) => d === 'standIn').map(([k]) => k);
    expect(standIns.sort()).toEqual(['-3,-3', '-3,3', '3,-3', '3,3']);
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

describe('staging', () => {
  it("uploads a hidden room's meshes without drawing them, leaves what shows alone, and puts all back", () => {
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
    expect(room.visible).toBe(true);
    expect((inside.material as MeshBasicMaterial).visible).toBe(false);
    expect(inside.frustumCulled).toBe(false);
    // The door already draws; a light never comes on for it.
    expect(door.material).toBe(lit);
    expect(lamp.visible).toBe(false);
    stager.restore();
    expect([room.visible, inside.material, inside.frustumCulled]).toEqual([false, lit, true]);
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
    expect(w.bounds).toEqual({ minX: -play, maxX: play, minZ: -play, maxZ: play });
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
