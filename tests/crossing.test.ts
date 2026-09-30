import { Mesh, PerspectiveCamera } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { moorChunks } from '../src/maps/brackenmoor/chunks';
import { buildBrackenmoor } from '../src/maps/brackenmoor/moor';
import { MOOR_ATMOSPHERE, type MoorPlan, planBrackenmoor } from '../src/maps/brackenmoor/plan';
import { buildForest } from '../src/maps/forest/forest';
import { CREST, type ForestLayout, OAKVALE_ATMOSPHERE, planOakvale } from '../src/maps/forest/layout';
import type { MapInfo, StartingZone, Zone } from '../src/maps/types';
import { LoneCall } from '../src/world/ambience';
import { blendAtmospheres } from '../src/world/atmosphere';
import { type ChunkKey, chunkDistance, type Detail } from '../src/world/chunks';
import { mix } from '../src/world/mix';
import { airAt, crossings, currentZone, shares } from '../src/world/seams';
import { decide, reachTo } from '../src/world/streaming';
import { World } from '../src/world/world';

// Crossing the seam (ticket 37): over the 40 m either side of the crest the
// light, haze, sky and ambience blend by where you stand; 2 m past the line
// the current zone changes, both ways, which floats its name and saves; and
// walking the moor end to end takes Oakvale from full detail to stand-ins to
// unloaded, and back on the way home.

let oak: ForestLayout;
let moor: MoorPlan;
let oakvale: StartingZone;
let brackenmoor: Zone;
beforeAll(() => {
  oak = planOakvale();
  moor = planBrackenmoor(oak.seams[0]);
  oakvale = buildForest(oak);
  brackenmoor = buildBrackenmoor(moor);
}, 30000);

const { band, past } = CONFIG.world.crossing;
/** Where the road crosses the crest. */
const roadX = () => oak.seams[0].roads[0].x;

/** A World with both zones loaded, and a camera to walk it with at eye height along the road. */
function crossable() {
  const w = new World();
  w.add(brackenmoor);
  w.load(oakvale);
  const eye = new PerspectiveCamera();
  const changes: { id: string; z: number }[] = [];
  w.onZone = (zone) => changes.push({ id: zone.id, z: eye.position.z });
  const stand = (z: number) => {
    const x = roadX();
    eye.position.set(x, w.heightAt(x, z) + 1.6, z);
    eye.updateMatrixWorld();
  };
  /** Walk the road from `from` to `to` in 5 cm steps, a frame each. */
  const walk = (from: number, to: number) => {
    const n = Math.round(Math.abs(to - from) / 0.05);
    for (let i = 0; i <= n; i++) {
      stand(from + ((to - from) * i) / n);
      w.update(1 / 72, eye);
    }
  };
  return { w, eye, changes, stand, walk };
}

describe('the current zone', () => {
  it('changes to Brackenmoor only once you are 2 m past the crest, and back to Oakvale only 2 m back over it', () => {
    expect(past).toBe(2);
    const { w, changes, walk } = crossable();
    walk(CREST.z - 10, CREST.z + past - 0.05);
    expect(w.zone).toBe(oakvale);
    expect(changes).toEqual([]);
    walk(CREST.z + past - 0.05, CREST.z + 10);
    expect(w.zone).toBe(brackenmoor);
    expect(changes).toHaveLength(1);
    expect(changes[0].id).toBe('brackenmoor');
    expect(changes[0].z).toBeGreaterThan(CREST.z + past);
    expect(changes[0].z).toBeLessThanOrEqual(CREST.z + past + 0.05 + 1e-9);
    // Back over the line: still on the moor until 2 m into Oakvale.
    walk(CREST.z + 10, CREST.z - past + 0.05);
    expect(w.zone).toBe(brackenmoor);
    walk(CREST.z - past + 0.05, CREST.z - 10);
    expect(w.zone).toBe(oakvale);
    expect(changes.map((c) => c.id)).toEqual(['brackenmoor', 'forest']);
    expect(changes[1].z).toBeLessThan(CREST.z - past);
    expect(changes[1].z).toBeGreaterThanOrEqual(CREST.z - past - 0.05 - 1e-9);
  });

  it("never changes standing about on the crest, however you shuffle within 2 m of it", () => {
    const { w, changes, walk } = crossable();
    walk(CREST.z - 5, CREST.z);
    for (let i = 0; i < 20; i++) walk(CREST.z - past + 0.1, CREST.z + past - 0.1);
    expect(changes).toEqual([]);
    expect(w.zone).toBe(oakvale);
  });

  it('is the zone you arrive in when you load in or wake: a save made on the moor puts you in Brackenmoor, with no crossing', () => {
    const { w, changes } = crossable();
    w.fill(roadX(), 200);
    expect(w.zone).toBe(brackenmoor);
    expect(w.cues.zones).toEqual([
      { id: 'brackenmoor', share: 1 },
      { id: 'forest', share: 0 },
    ]);
    expect(w.fog.color.getHex()).toBe(MOOR_ATMOSPHERE.fog.color);
    // Arriving isn't crossing, but nothing's listening to a load; a wake elsewhere is heard.
    expect(changes.map((c) => c.id)).toEqual(['brackenmoor']);
    w.fill(0, 0);
    expect(w.zone).toBe(oakvale);
  });

  it('as a rule: the zone you were in until you are more than 2 m off its land, then the zone underfoot', () => {
    const zones = [oakvale, brackenmoor];
    expect(currentZone(oakvale, zones, 0, CREST.z + 1.99)).toBe(oakvale);
    expect(currentZone(oakvale, zones, 0, CREST.z + 2.01)).toBe(brackenmoor);
    expect(currentZone(brackenmoor, zones, 0, CREST.z - 1.99)).toBe(brackenmoor);
    expect(currentZone(brackenmoor, zones, 0, CREST.z - 2.01)).toBe(oakvale);
    expect(currentZone(brackenmoor, zones, 0, 0)).toBe(oakvale);
  });
});

describe('the air over the seam', () => {
  it('finds the one crossing between the loaded zones, along the crest, Oakvale north and Brackenmoor south', () => {
    expect(crossings([oakvale, brackenmoor])).toEqual([{ z: CREST.z, minX: -100, maxX: 100, north: oakvale, south: brackenmoor }]);
    expect(crossings([brackenmoor, oakvale])).toHaveLength(1);
    expect(crossings([oakvale])).toEqual([]);
  });

  it('blends the light, haze and sky by where you stand across the 40 m either side of the crest: halfway on the line', () => {
    expect(band).toBe(40);
    const { w, eye, stand } = crossable();
    const at = (z: number) => {
      stand(z);
      w.update(1 / 72, eye);
      return { fog: w.fog.color.getHex(), near: w.fog.near, hemi: w.hemisphere.intensity, ground: w.hemisphere.groundColor.getHex(), bg: w.background.getHex() };
    };
    const want = (t: number) => {
      const a = blendAtmospheres(OAKVALE_ATMOSPHERE, MOOR_ATMOSPHERE, t);
      return { fog: a.fog.color, near: a.fog.near, hemi: a.hemisphere.intensity, ground: a.hemisphere.ground, bg: a.background };
    };
    // Oakvale's own up to the band, the moor's own past it, and each in between by where you are.
    expect(at(CREST.z - band - 5)).toEqual(want(0));
    expect(at(CREST.z - band)).toEqual(want(0));
    expect(at(CREST.z)).toEqual(want(0.5));
    expect(at(CREST.z + band)).toEqual(want(1));
    expect(at(CREST.z + band + 30)).toEqual(want(1));
    // And evenly on from one to the other, never back.
    let was = -1;
    for (let z = CREST.z - band; z <= CREST.z + band; z += 4) {
      const air = airAt([oakvale, brackenmoor], crossings([oakvale, brackenmoor]), roadX(), z)!;
      const moorShare = shares([oakvale, brackenmoor], air)[1];
      expect(at(z)).toEqual(want(moorShare));
      expect(moorShare).toBeGreaterThanOrEqual(was);
      was = moorShare;
    }
  });

  it('blends into one atmosphere reused as you walk, the same as a fresh blend', () => {
    const into = structuredClone(OAKVALE_ATMOSPHERE);
    for (const t of [0.2, 0.5, 0.9]) {
      expect(blendAtmospheres(OAKVALE_ATMOSPHERE, MOOR_ATMOSPHERE, t, into)).toBe(into);
      expect(into).toEqual(blendAtmospheres(OAKVALE_ATMOSPHERE, MOOR_ATMOSPHERE, t));
    }
    // Neither zone's own is written into.
    expect(blendAtmospheres(OAKVALE_ATMOSPHERE, MOOR_ATMOSPHERE, 0, into)).toBe(OAKVALE_ATMOSPHERE);
  });

  it('changes only values: the same lights, fog, sky and meshes whichever way you face or stand', () => {
    const { w, walk } = crossable();
    /** Everything in the World but the chunks streamed in and out. */
    const kids = () => {
      const out: object[] = [];
      w.root.traverse((o) => void (o instanceof Mesh && o.name.startsWith('chunk-') ? null : out.push(o)));
      return out;
    };
    const { fog, hemisphere, sun, pool } = w;
    walk(CREST.z - 60, CREST.z - 50);
    const before = kids();
    walk(CREST.z - 50, CREST.z + 60);
    expect([w.fog, w.hemisphere, w.sun, w.pool]).toEqual([fog, hemisphere, sun, pool]);
    expect(kids()).toEqual(before);
  });

  it("gives each zone its share of the air for the sound, and the mix crossfades their airs at equal power", () => {
    const { w, eye, stand } = crossable();
    const share = (z: number) => {
      stand(z);
      w.update(1 / 72, eye);
      return Object.fromEntries(w.cues.zones.map((c) => [c.id, c.share]));
    };
    expect(share(CREST.z - band - 1)).toEqual({ brackenmoor: 0, forest: 1 });
    expect(share(CREST.z)).toEqual({ brackenmoor: 0.5, forest: 0.5 });
    expect(share(CREST.z + band + 1)).toEqual({ brackenmoor: 1, forest: 0 });
    share(CREST.z + 12);
    const m = mix(w.cues, false);
    const [b, f] = w.cues.zones.map((c) => c.share);
    expect(b + f).toBeCloseTo(1, 12);
    expect(m.zones[0] ** 2 + m.zones[1] ** 2).toBeCloseTo(1, 12);
    expect(m.zones[0]).toBeGreaterThan(m.zones[1]);
    expect(shares([oakvale, brackenmoor], null)).toEqual([0, 0]);
  });
});

describe("the streamer's decisions over the pass", () => {
  const reach = reachTo(200);
  const oakKeys = () => oakvale.chunks.keys;
  const all = () => [...oakKeys(), ...moorChunks()];
  const of = (at: ReadonlyMap<ChunkKey, Detail>, keys: readonly ChunkKey[]) => {
    const n = { full: 0, standIn: 0, none: 0 };
    for (const k of keys) n[at.get(k) ?? 'none']++;
    return n;
  };
  /** Walk `path` metre by metre, deciding at each step from the last. */
  const walk = (path: readonly number[], start = new Map<ChunkKey, Detail>()) => {
    let now: ReadonlyMap<ChunkKey, Detail> = start;
    const steps: ReadonlyMap<ChunkKey, Detail>[] = [];
    for (const z of path) {
      now = decide(roadX(), z, all(), now, reach);
      steps.push(now);
    }
    return steps;
  };

  it('keeps the same distances either side of the crest: the moor’s fog reaches as far as Oakvale’s', () => {
    expect(MOOR_ATMOSPHERE.fog.far).toBe(OAKVALE_ATMOSPHERE.fog.far);
  });

  it("at the crest has all of the moor in and Oakvale's south at full detail", () => {
    const at = decide(roadX(), CREST.z, all(), new Map(), reach);
    expect(of(at, moorChunks()).none).toBe(0);
    expect(of(at, moorChunks()).full).toBeGreaterThan(0);
    expect(at.get('0,3')).toBe('full');
    expect(of(at, oakKeys()).full).toBeGreaterThan(0);
  });

  it("at z = 200 has Oakvale's south full, its middle as stand-ins, and its far north unloaded", () => {
    const at = decide(roadX(), 200, all(), new Map(), reach);
    const n = of(at, oakKeys());
    expect(n.full).toBeGreaterThan(0);
    expect(n.standIn).toBeGreaterThan(0);
    expect(n.none).toBeGreaterThan(0);
    expect(at.has('0,-3')).toBe(false);
    expect(at.get('0,3')).toBe('full');
  });

  it('at z = 260, by the rockfall, has most of Oakvale unloaded and the rest stand-ins but for the row on the crest', () => {
    const at = decide(roadX(), 260, all(), new Map(), reach);
    const n = of(at, oakKeys());
    expect(n.none).toBeGreaterThan(oakKeys().length / 2);
    // Oakvale's nearest row is 120 m off here, the full radius itself: only what's right on it is full.
    for (const k of oakKeys()) if (at.get(k) === 'full') expect(chunkDistance(k, roadX(), 260)).toBe(CONFIG.streaming.full);
    expect(n.full).toBeLessThanOrEqual(1);
  });

  it('walking the moor end to end takes Oakvale from full detail to stand-ins to unloaded, and back on the way home', () => {
    const out: number[] = [];
    for (let z = 90; z <= 260; z++) out.push(z);
    const there = walk(out);
    const back = walk([...out].reverse(), new Map(there.at(-1)));
    const first = of(there[0], oakKeys());
    const last = of(there.at(-1)!, oakKeys());
    expect(first.none).toBe(0);
    // Walking in, a chunk's dropped a chunk late, so a few more are held than loading in there.
    expect(last.none).toBeGreaterThanOrEqual(20);
    expect(last.full).toBeLessThan(first.full);
    // Every chunk that ends up unloaded went through a stand-in on the way.
    for (const k of oakKeys()) {
      const seq = there.map((m) => m.get(k) ?? null).filter((d, i, a) => i === 0 || d !== a[i - 1]);
      if (seq.at(-1) === null && seq[0] === 'full') expect(seq, k).toEqual(['full', 'standIn', null]);
      // At most one change each way at each radius.
      expect(seq.length, k).toBeLessThanOrEqual(3);
    }
    // Home again: all of Oakvale back in, as it was at the start.
    expect(of(back.at(-1)!, oakKeys())).toEqual(first);
  });

  it("puts every chunk's stand-in in place, whichever zone it's in, before it comes within the fog's far edge", () => {
    const there: number[] = [];
    for (let z = 0; z <= 260; z++) there.push(z);
    const path = [...there, ...[...there].reverse()];
    let now: ReadonlyMap<ChunkKey, Detail> = new Map();
    let prev = -Infinity;
    for (const z of path) {
      // Whatever you can see from here was already in at the last step.
      for (const k of all()) if (chunkDistance(k, roadX(), z) <= reach.far && Number.isFinite(prev)) expect(now.has(k), `${k} at z ${z}`).toBe(true);
      now = decide(roadX(), z, all(), now, reach);
      prev = z;
    }
  });
});

describe('neighbours load early', () => {
  /** A registry listing Oakvale and Brackenmoor as each other's neighbours, loading the zones built here, counting loads. */
  const registry = () => {
    const loads: string[] = [];
    const info = (zone: Zone, neighbours: string[]): MapInfo => ({
      kind: 'zone',
      id: zone.id,
      label: zone.label,
      origin: { x: 0, z: 0 },
      neighbours,
      load: async () => (loads.push(zone.id), zone),
    });
    const maps = [info(oakvale, ['brackenmoor']), info(brackenmoor, ['forest'])];
    return { loads, find: (id: string) => maps.find((m) => m.id === id) };
  };

  it("fetches a zone's neighbours as it becomes current, and tells whoever plays their sound", async () => {
    const { loads, find } = registry();
    const w = new World(find);
    const added: string[] = [];
    w.onAdd = (zone) => added.push(zone.id);
    w.load(oakvale);
    expect(w.neighboursPending).toBe(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(w.holds('brackenmoor')).toBe(true);
    expect(w.neighboursPending).toBe(0);
    expect(loads).toEqual(['brackenmoor']);
    expect(added).toEqual(['forest', 'brackenmoor']);
    // Crossing into the moor fetches nothing more: its neighbour is loaded.
    w.fill(roadX(), 200);
    expect(w.zone).toBe(brackenmoor);
    await new Promise((r) => setTimeout(r, 0));
    expect(loads).toEqual(['brackenmoor']);
  });

  it("fetches nothing it holds already, and nothing at all without a registry", () => {
    const { loads, find } = registry();
    const w = new World(find);
    w.add(brackenmoor);
    w.load(oakvale);
    expect(w.neighboursPending).toBe(0);
    expect(loads).toEqual([]);
    const bare = new World();
    bare.load(oakvale);
    expect(bare.neighboursPending).toBe(0);
  });

  it('keeps the zone it loaded first by an id: loading another built by that id makes the first current', () => {
    const w = new World();
    w.add(brackenmoor);
    w.load(oakvale);
    w.fill(roadX(), 200);
    w.load(buildForest(oak));
    expect(w.zone).toBe(oakvale);
    expect(w.cues.zones.map((z) => z.id)).toEqual(['brackenmoor', 'forest']);
  });
});

describe("the moor's lone bird", () => {
  it('calls now and then, from out over the moor and up on the wing', () => {
    const { every, near, far, height } = CONFIG.sound.moor.call;
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const lone = new LoneCall(rand);
    const at: number[] = [];
    const calls = [];
    for (let t = 0; t < 600; t += 0.1) {
      const c = lone.update(0.1, 10, 200, 6);
      if (!c) continue;
      at.push(t);
      calls.push(c);
    }
    expect(calls.length).toBeGreaterThan(600 / every[1] - 2);
    expect(calls.length).toBeLessThan(600 / every[0] + 2);
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(every[0] - 0.11);
    for (const c of calls) {
      const d = Math.hypot(c.x - 10, c.z - 200);
      expect(d).toBeGreaterThanOrEqual(near - 1e-9);
      expect(d).toBeLessThanOrEqual(far + 1e-9);
      expect(c.y - 6).toBeGreaterThanOrEqual(height[0]);
      expect(c.y - 6).toBeLessThanOrEqual(height[1]);
      expect(c.call).toBe('curlew');
    }
  });
});
