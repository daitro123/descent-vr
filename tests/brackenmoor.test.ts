import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { buildMoorChunk, moorBuilder, moorChunks } from '../src/maps/brackenmoor/chunks';
import { buildBrackenmoor, plumes } from '../src/maps/brackenmoor/moor';
import { MOOR, MOOR_ATMOSPHERE, type MoorPlan, type MoorStructureKind, planBrackenmoor } from '../src/maps/brackenmoor/plan';
import { FEN_ROAD, fenRoadHeight } from '../src/maps/fenRoad';
import { buildForest } from '../src/maps/forest/forest';
import { CREST, FOREST, type ForestLayout, OAKVALE_ATMOSPHERE, PASS, planOakvale } from '../src/maps/forest/layout';
import { nearestOnPolyline } from '../src/maps/forest/noise';
import { findMap, loadNeighbours } from '../src/maps/registry';
import { isStartingZone, type StartingZone, type Zone } from '../src/maps/types';
import { Walkable } from '../src/maps/walkable';
import { type ChunkData, type ChunkKey, chunkIndex, type Detail } from '../src/world/chunks';
import { type ChunkReply, type ChunkServerScope, serveChunks } from '../src/world/chunkWorker';
import { World } from '../src/world/world';

// The southern pass and Brackenmoor (ticket 36, then the full zone from its
// spec, /zones/brackenmoor.md in the project's files): the pass opens as a
// corridor up to the crest, and Brackenmoor lies over it, a zone like
// Oakvale, as big as a full zone: Cairnford, the beck, the Blackmire, the
// fells and the barrows, with no one in it yet. The World is the `Ground` for both: the zones' heights agree
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


/** The structures of `kinds` on the moor. */
const of = (...kinds: MoorStructureKind[]) => moor.structures.filter((s) => kinds.includes(s.kind));
/** A sample of the moor's chunks, every few along each row, Cairnford's and the crest's among them: building all 132 twice over takes a while. */
const sample = (): ChunkKey[] => {
  const keys = moorChunks();
  const keep = new Set(keys.filter((_, i) => i % 9 === 0));
  for (const k of ['0,4', '1,9', '1,10', '0,9'] as ChunkKey[]) if (keys.includes(k)) keep.add(k);
  return [...keep];
};

describe('Brackenmoor, as the registry lists it', () => {
  it("is a zone called Brackenmoor, across the pass's seam from Oakvale, the Fen road's from the Sallows and the Kingsroad's from Aldhaven", async () => {
    expect(findMap('brackenmoor')).toMatchObject({ kind: 'zone', label: 'Brackenmoor', neighbours: ['forest', 'sallows', 'aldhaven'] });
    expect(findMap('forest')).toMatchObject({ neighbours: ['brackenmoor'] });
    const loaded = await loadNeighbours(oakvale, async (info) => (info.id === 'brackenmoor' ? brackenmoor : oakvale));
    expect(loaded).toEqual([brackenmoor]);
  });

  it('spans 12 by 11 chunks south of the crest, about 480 by 440 m, none of them Oakvale’s', () => {
    const keys = moorChunks();
    expect(keys).toHaveLength(132);
    const [is, js] = [keys.map((k) => chunkIndex(k)[0]), keys.map((k) => chunkIndex(k)[1])];
    expect([Math.min(...is), Math.max(...is), Math.min(...js), Math.max(...js)]).toEqual([-5, 6, 4, 14]);
    expect(keys.filter((k) => oakvale.chunks.keys.includes(k))).toEqual([]);
    expect(brackenmoor.land).toEqual({ minX: -220, maxX: 260, minZ: 140, maxZ: 580 });
  });

  it('is empty and safe: nothing lives there and there is nowhere to wake, so nothing can hurt you', () => {
    expect([brackenmoor.camps, brackenmoor.villagers, brackenmoor.pickups, brackenmoor.interiors, brackenmoor.mine, brackenmoor.chests, brackenmoor.spots]).toEqual([[], [], [], [], null, [], []]);
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
    for (let x = CREST.minX; x <= CREST.maxX; x += 0.5) {
      const north = world.heightAt(x, CREST.z - 0.05);
      const south = world.heightAt(x, CREST.z + 0.05);
      expect(Math.abs(north - south), `x ${x}`).toBeLessThan(0.1);
    }
    expect(world.heightAt(0, 120)).toBe(oak.heightAt(0, 120));
    expect(world.heightAt(0, 200)).toBe(moor.heightAt(0, 200));
    expect(world.zoneAt(0, 139)).toBe(oakvale);
    expect(world.zoneAt(0, 141)).toBe(brackenmoor);
  });

  it("lets you walk the road from the play area up the pass, over the crest and across the moor to Cairnford's square", () => {
    const p = new Vector3();
    const line = [...oak.paths[0].line.filter(([, z]) => z > FOREST.play - 10).reverse(), ...moor.road.line.slice(1)];
    for (const [x, z] of line) {
      p.set(x, 0, z);
      world.resolve(p, r);
      // On the road, nothing pushes you anywhere.
      expect(Math.hypot(p.x - x, p.z - z), `(${x.toFixed(1)}, ${z.toFixed(1)})`).toBeLessThan(1e-9);
    }
    const [ex, ez] = moor.road.line.at(-1)!;
    expect(Math.hypot(ex - MOOR.square.x, ez - MOOR.square.z)).toBeLessThan(MOOR.square.hd);
  });

  it('walks every road and track clear end to end, through the tollgate standing open on the Kingsroad, but for the rockfall that ends the Sunreach road', () => {
    const p = new Vector3();
    const [gate] = of('tollgate');
    expect(moor.roads.map((road) => road.id)).toEqual(['pass', 'kingsroad', 'fen', 'sunreach', 'hob', 'oldFold', 'scar', 'turfmoss', 'fells', 'hall', 'chapel', 'mill', 'beckFoot']);
    for (const road of moor.roads) {
      for (const [x, z] of road.line) {
        // Where you walk, a body's width in from its edge.
        if (![[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => moor.walkable.contains(x + dx, z + dz))) continue;
        p.set(x, 0, z);
        world.resolve(p, r);
        expect(Math.hypot(p.x - x, p.z - z), `${road.id} (${x.toFixed(1)}, ${z.toFixed(1)})`).toBeLessThan(1e-9);
      }
    }
    // The gate's bar is raised: you walk through it east to Aldhaven.
    p.set(gate.x, 0, gate.z);
    expect(world.resolve(p, r)).toBe(false);
    // The Sunreach road runs out at the walkable edge, under the rocks that fill the gap.
    const [ex, ez] = moor.rockfall;
    p.set(ex, 0, ez + 4);
    world.resolve(p, r);
    expect(p.z).toBeLessThan(ez);
  });

  it('is walkable from the play area to every spot of the pass and the moor a body can stand on (no pockets), for every body radius', () => {
    const step = 0.5;
    const [x0, x1, z0, z1] = [-212, 262, 70, 560];
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
          if (z < CREST.z && Math.abs(x - roadX(Math.max(z, FOREST.play))) > PASS.half) continue;
          free[i * nz + j] = world.resolve(p.set(x, 0, z), radius) ? 0 : 1;
        }
      }
      const seen = new Uint8Array(nx * nz);
      const fill = (start: number) => {
        const stack = [start];
        seen[start] = 1;
        let n = 1;
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
              n++;
              stack.push(kk);
            }
          }
        }
        return n;
      };
      const start = Math.round((roadX(76) - x0) / step) * nz + Math.round((76 - z0) / step);
      expect(free[start]).toBe(1);
      fill(start);
      // A pocket is somewhere a body could stand: the sliver in the crease where two rocks or stones meet,
      // narrower than the grid, is a sampling's leftover, not a place.
      const pockets: string[] = [];
      for (let k = 0; k < nx * nz; k++) if (free[k] && !seen[k] && fill(k) > 2) pockets.push(`(${x0 + Math.floor(k / nz) * step}, ${z0 + (k % nz) * step})`);
      expect(pockets, `radius ${radius}`).toEqual([]);
      // And it reaches every landmark.
      for (const l of moor.landmarks) {
        const [i, j] = [Math.round((l.x - x0) / step), Math.round((l.z - z0) / step)];
        let reached = false;
        for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) reached ||= seen[(i + a) * nz + j + b] === 1;
        expect(reached, `${l.label}, radius ${radius}`).toBe(true);
      }
    }
  }, 120000);

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

  it('keeps every road over the moor no steeper than 1 in 5, and every track than 1 in 3', () => {
    for (const road of moor.roads) {
      const grade = road.width >= MOOR.road.track ? MOOR.road.grade : MOOR.road.trackGrade;
      for (let i = 1; i < road.line.length; i++) {
        if (!moor.walkable.contains(...road.line[i])) continue;
        const run = Math.hypot(road.line[i][0] - road.line[i - 1][0], road.line[i][1] - road.line[i - 1][1]);
        expect(Math.abs(road.heights[i] - road.heights[i - 1]) / run, `${road.id} at (${road.line[i].map((v) => v.toFixed(0)).join(', ')})`).toBeLessThanOrEqual(grade + 1e-6);
      }
    }
    expect(MOOR.road.grade).toBe(PASS.grade);
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

describe('the Fen road seam, where the Sallows will meet the moor', () => {
  it("lies on the moor's east edge, its heights there the seam's own, vertex for vertex", () => {
    expect(FEN_ROAD.x).toBe(MOOR.land.maxX);
    const [seam] = brackenmoor.sideSeams!;
    expect(seam).toBe(moor.fenSeam);
    expect(seam).toMatchObject({ x: FEN_ROAD.x, minZ: FEN_ROAD.minZ, maxZ: FEN_ROAD.maxZ, step: MOOR.cell });
    seam.heights.forEach((h, k) => expect(h, `z ${FEN_ROAD.minZ + k * seam.step}`).toBeCloseTo(fenRoadHeight(FEN_ROAD.minZ + k * seam.step), 5));
    // Between its vertices the line runs straight from one to the next, as it will on the Sallows' side.
    for (let z = FEN_ROAD.minZ; z < FEN_ROAD.maxZ; z += 0.5) {
      const z0 = FEN_ROAD.minZ + Math.floor((z - FEN_ROAD.minZ) / FEN_ROAD.step) * FEN_ROAD.step;
      const t = (z - z0) / FEN_ROAD.step;
      expect(moor.heightAt(FEN_ROAD.x, z), `z ${z}`).toBeCloseTo(fenRoadHeight(z0) * (1 - t) + fenRoadHeight(z0 + FEN_ROAD.step) * t, 4);
    }
  });

  it('carries the Fen road over the line on its bank, walkable out past it', () => {
    const fen = moor.roads.find((road) => road.id === 'fen')!;
    const [x, z] = fen.line.at(-1)!;
    expect(x).toBeGreaterThan(FEN_ROAD.x);
    expect(z).toBeCloseTo(FEN_ROAD.road.z, 0);
    expect(fen.heights.at(-1)).toBe(FEN_ROAD.road.y);
    expect(moor.walkable.contains(FEN_ROAD.x + CONFIG.world.ground.seam - 0.1, FEN_ROAD.road.z)).toBe(true);
    expect(seamRoad()).toEqual({ z: FEN_ROAD.road.z, width: FEN_ROAD.road.width, dir: [1, 0] });
  });
});

/** The road the Fen road seam lists. */
const seamRoad = () => moor.fenSeam.roads[0];

describe("Brackenmoor's land", () => {
  it('falls from the crest into Passfoot’s basin, a few metres above Oakvale’s valley floor', () => {
    const floor = [];
    for (let z = 185; z <= 240; z += 5) for (let x = -40; x <= 40; x += 5) floor.push(moor.heightAt(x, z));
    const mean = floor.reduce((a, b) => a + b, 0) / floor.length;
    expect(mean).toBeGreaterThan(oak.heightAt(0, 0) + 1.5);
    expect(mean).toBeLessThan(oak.heightAt(0, 0) + 8);
    expect(mean).toBeLessThan(moor.heightAt(roadX(CREST.z), CREST.z));
  });

  it('tilts from the high fells round Raven Scar in the north-west down to Beck’s Foot in the south-east', () => {
    expect(moor.heightAt(-180, 260)).toBeGreaterThan(25);
    expect(moor.heightAt(185, 205)).toBeGreaterThan(moor.heightAt(MOOR.square.x, MOOR.square.z) + 10);
    expect(moor.heightAt(222, 512)).toBeLessThan(3);
    expect(moor.heightAt(MOOR.square.x, MOOR.square.z)).toBeLessThan(moor.heightAt(-180, 260) - 15);
  });

  it('runs the Brack Beck from the Blackmire through Cairnford to the fens, its water never rising downstream', () => {
    const { line, levels } = moor.beck;
    expect(Math.hypot(line[0][0] - MOOR.bog.x, line[0][1] - MOOR.bog.z)).toBeLessThan(MOOR.bog.rx);
    expect(line.at(-1)![0]).toBeGreaterThanOrEqual(FEN_ROAD.x);
    expect(levels[0]).toBeLessThanOrEqual(MOOR.bog.level);
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeLessThanOrEqual(levels[i - 1]);
    expect(levels.at(-1)).toBe(FEN_ROAD.beck.water);
    // Water stands in its channel all the way: its bed under it.
    line.forEach(([x, z], i) => {
      if (x < MOOR.land.maxX - 2) expect(moor.ground.at(x, z), `(${x.toFixed(0)}, ${z.toFixed(0)})`).toBeLessThan(levels[i]);
    });
  });

  it("crosses the beck at Cairnford by its bridge, the deck well over the water, and leaves the Blackmire's pools under its boardwalk", () => {
    const [bridge] = of('bridge');
    const water = moor.waterLevel(bridge.x, bridge.z);
    expect(moor.heightAt(bridge.x, bridge.z)).toBeGreaterThan(water + 1);
    expect(Math.hypot(bridge.x - MOOR.square.x, bridge.z - MOOR.square.z)).toBeLessThan(40);
    // The boardwalk: decks over the bog, above its pools' level.
    const walk = moor.decks.slice(1);
    expect(walk.length).toBeGreaterThanOrEqual(4);
    for (const d of walk) expect(Math.min(d.y0, d.y1)).toBeGreaterThan(MOOR.bog.level);
  });

  it('closes the Sunreach road in the Rockfall Gap, a notch in the south ridge with Sunreach’s cypresses beyond', () => {
    const [ex, ez] = moor.rockfall;
    expect(ez).toBeGreaterThan(550);
    // The notch: the ridge either side stands well above the gap's floor.
    for (const z of [565, 575]) {
      expect(moor.heightAt(ex, z), `z ${z}`).toBeLessThan(moor.heightAt(ex - 30, z) - 10);
      expect(moor.heightAt(ex, z), `z ${z}`).toBeLessThan(moor.heightAt(ex + 30, z) - 10);
    }
    const fall = moor.plants.filter((p) => p.kind === 'rock' && p.z > ez && Math.abs(p.x - ex) < MOOR.rockfall.spread + 1 && p.scale >= MOOR.rockfall.scale[0]);
    expect(fall.length).toBeGreaterThanOrEqual(MOOR.rockfall.count);
    expect(fall.some((p) => Math.abs(p.x - ex) < 2)).toBe(true);
    const cypresses = moor.plants.filter((p) => p.kind === 'cypress');
    expect(cypresses.length).toBeGreaterThanOrEqual(2);
    for (const c of cypresses) expect(c.z).toBeGreaterThan(Math.max(...fall.map((p) => p.z)) - 2);
  });

  it('grows bracken, heather, moor grass, bushes and gorse, cotton grass and reeds, few trees, and none of it on a road', () => {
    const count = (kind: string) => moor.plants.filter((p) => p.kind === kind).length;
    expect(count('bracken')).toBeGreaterThan(3000);
    expect(count('heather')).toBeGreaterThan(800);
    expect(count('tussock')).toBeGreaterThan(1000);
    expect(count('bush') + count('gorse')).toBeGreaterThan(300);
    expect(count('gorse')).toBeGreaterThan(50);
    expect(count('rock')).toBeGreaterThan(300);
    expect(count('cotton')).toBeGreaterThan(200);
    expect(count('reed')).toBeGreaterThan(200);
    // Almost no trees: lone pines, a stand of hawthorns at the Long Stones, a rowan or two by the beck.
    expect(count('pine')).toBeGreaterThanOrEqual(20);
    expect(count('pine')).toBeLessThanOrEqual(100);
    expect(count('hawthorn')).toBeGreaterThanOrEqual(5);
    expect(count('rowan')).toBeGreaterThanOrEqual(4);
    for (const p of moor.plants) {
      if (!moor.walkable.contains(p.x, p.z)) continue;
      for (const road of moor.roads) expect(nearestOnPolyline(road.line, p.x, p.z).d, `${p.kind} by the ${road.id} road (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`).toBeGreaterThan(road.width / 2);
    }
  }, 30000);

  it('builds Cairnford round its square at the bridge: the inn, the moot hall, the smithy, the chapel, the mill and a score of buildings', () => {
    const sq = MOOR.square;
    for (const kind of ['inn', 'mootHall', 'smithy', 'chapel', 'mill', 'marketCross', 'bridge'] as const) expect(of(kind), kind).toHaveLength(1);
    const town = of('house', 'inn', 'mootHall', 'smithy', 'chapel', 'mill', 'cottage').filter((s) => Math.hypot(s.x - sq.x, s.z - sq.z) < 75);
    expect(town.length).toBeGreaterThanOrEqual(18);
    // Two cairns on the bank by the bridge: the travellers' and the smaller one for the families that left.
    const cairns = of('cairn').filter((c) => Math.hypot(c.x - of('bridge')[0].x, c.z - of('bridge')[0].z) < 15);
    expect(cairns.map((c) => c.h > 2)).toEqual([true, false]);
    // The flat-boat at the bridge's foot floats on the beck.
    const boat = of('boat').find((b) => Math.hypot(b.x - sq.x, b.z - sq.z) < 40)!;
    expect(boat.y).toBeCloseTo(moor.waterLevel(boat.x, boat.z) - 0.08, 5);
  });

  it('stands the landmarks the spec names: the Long Stones, the barrows and Hollowhill, Fellgate Hall in its walled enclosure, Raven Scar’s pit', () => {
    // Nine Long Stones in a row along the ridge, above Cairnford.
    const stones = of('longStone');
    expect(stones).toHaveLength(9);
    for (const s of stones) expect(s.y).toBeGreaterThan(moor.heightAt(MOOR.square.x, MOOR.square.z) + 3);
    // Seven barrows and Hollowhill crowning the High Fells.
    expect(of('barrow')).toHaveLength(7);
    expect(of('barrow').filter((b) => b.variant === 1).length).toBeGreaterThanOrEqual(2);
    const [door] = of('hollowhill');
    expect(Math.hypot(door.x - MOOR.hollowhill.x, door.z - MOOR.hollowhill.z)).toBeLessThan(MOOR.hollowhill.r);
    expect(moor.heightAt(MOOR.hollowhill.x, MOOR.hollowhill.z)).toBeGreaterThan(Math.max(...of('barrow').map((b) => b.y)));
    // Fellgate Hall and its flag inside the enclosure, the only dressed stone on the moor.
    const [hall] = of('hall');
    expect(of('flag').some((f) => Math.hypot(f.x - hall.x, f.z - hall.z) < 20)).toBe(true);
    const dressed = moor.walls.filter((w) => w.dressed).flatMap((w) => w.pts);
    expect(Math.min(...dressed.map((p) => p[0]))).toBeLessThan(hall.x - hall.w / 2);
    expect(Math.max(...dressed.map((p) => p[0]))).toBeGreaterThan(hall.x + hall.w / 2);
    expect(moor.walls.filter((w) => !w.dressed).length).toBeGreaterThan(5);
    // Raven Scar: its floor cut well below its lip, its tents in the pit and the ladder up the scar.
    const { scar } = MOOR;
    expect(moor.heightAt(scar.x, scar.z)).toBeLessThan(moor.heightAt(scar.x, scar.z - scar.hd - 6) - 6);
    expect(of('tent').filter((t) => Math.hypot(t.x - scar.x, t.z - scar.z) < scar.hw)).toHaveLength(3);
    expect(of('ladder')).toHaveLength(1);
    // The three abandoned crofts, Turfmoss's lived-in ones, and the tollhouse with its gate on the Kingsroad.
    expect(of('croft').filter((c) => c.variant === 1)).toHaveLength(3);
    expect(of('croft').filter((c) => c.variant === 0).length).toBeGreaterThanOrEqual(4);
    expect(of('tollhouse', 'tollgate')).toHaveLength(2);
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

  it("smokes from the chimneys of the houses people live in, and sounds of the beck under Cairnford's bridge", () => {
    const smoke = plumes(moor.structures);
    expect(smoke.length).toBeGreaterThan(8);
    // None from an abandoned croft.
    for (const c of of('croft').filter((s) => s.variant === 1)) expect(smoke.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < c.w)).toBe(false);
    expect(brackenmoor.sounds.map((s) => s.id)).toContain('stream');
  });
});

describe("Brackenmoor's chunks", () => {
  it('builds each chunk the same every time, whatever was built before', () => {
    const keys = sample();
    const first = new Map<string, ChunkData>();
    for (const detail of ['full', 'standIn'] as const) for (const key of keys) first.set(`${key} ${detail}`, buildMoorChunk(moor, key, detail));
    // Again, the other way round and from a plan made afresh.
    const again = planBrackenmoor(oak.seams[0]);
    for (const detail of ['standIn', 'full'] as const) for (const key of [...keys].reverse()) same(buildMoorChunk(again, key, detail), first.get(`${key} ${detail}`)!);
  }, 60000);

  it('builds chunks byte for byte in its worker as on the main thread, and hands each back without copying', () => {
    const replies: { reply: ChunkReply; transfer: Transferable[] }[] = [];
    const scope: ChunkServerScope = { onmessage: null, postMessage: (reply, transfer) => replies.push({ reply, transfer }) };
    serveChunks(scope, moorBuilder());
    let id = 0;
    for (const detail of ['full', 'standIn'] as Detail[]) {
      for (const key of sample()) {
        scope.onmessage!({ data: { id: id++, key, detail } });
        const { reply, transfer } = replies.pop()!;
        if (!('data' in reply)) throw new Error(reply.error);
        const got = structuredClone(reply, { transfer }) as { data: ChunkData };
        same(got.data, buildMoorChunk(moor, key, detail));
        expect(reply.data.position.buffer.byteLength).toBe(0);
      }
    }
  }, 60000);

  it("makes stand-ins cheaper than full detail, and keeps every full chunk within the chunk budget's triangles", () => {
    for (const key of moorChunks()) {
      const full = buildMoorChunk(moor, key, 'full').position.length;
      expect(buildMoorChunk(moor, key, 'standIn').position.length, key).toBeLessThan(full);
      expect(full / 9, key).toBeLessThan(CONFIG.streaming.budget.chunk);
    }
  }, 60000);

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
