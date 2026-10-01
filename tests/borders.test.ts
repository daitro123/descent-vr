import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { buildAldhaven } from '../src/maps/aldhaven/city';
import { ALDHAVEN, type AldhavenPlan, planAldhaven } from '../src/maps/aldhaven/plan';
import { buildBrackenmoor } from '../src/maps/brackenmoor/moor';
import { MOOR, type MoorPlan, planBrackenmoor } from '../src/maps/brackenmoor/plan';
import { FEN_ROAD, fenRoadHeight } from '../src/maps/fenRoad';
import { buildForest } from '../src/maps/forest/forest';
import { CREST, planOakvale } from '../src/maps/forest/layout';
import { KINGSROAD, kingsroadHeight } from '../src/maps/kingsroad';
import { findMap } from '../src/maps/registry';
import { buildSallows } from '../src/maps/sallows/fen';
import { CAUSEWAY, northEdgeHeight, planSallows, SALLOWS, type SallowsPlan } from '../src/maps/sallows/plan';
import type { Zone } from '../src/maps/types';
import { crossings } from '../src/world/seams';
import { World } from '../src/world/world';

// The four built zones joined at their borders: Oakvale over the pass to
// Brackenmoor; Brackenmoor east to Aldhaven over the Kingsroad's cutting and
// to the Sallows over the Fen road; Aldhaven south to the Sallows over the
// causeway. Each pair agrees on its heights along its seam, vertex for
// vertex, and you can walk each road over its line.

let moor: MoorPlan;
let city: AldhavenPlan;
let fen: SallowsPlan;
let oakvale: Zone;
let brackenmoor: Zone;
let aldhaven: Zone;
let sallows: Zone;
let world: World;
beforeAll(() => {
  const oak = planOakvale();
  moor = planBrackenmoor(oak.seams[0]);
  city = planAldhaven();
  fen = planSallows();
  oakvale = buildForest(oak);
  brackenmoor = buildBrackenmoor(moor);
  aldhaven = buildAldhaven(city);
  sallows = buildSallows(fen);
  world = new World();
  for (const z of [brackenmoor, aldhaven, sallows]) world.add(z);
  world.load(oakvale);
}, 60000);

const r = CONFIG.player.bodyRadius;

/** Walk `line` through the World: null if nothing ever pushed you off it, else where it did. */
function walksFreely(line: readonly (readonly [number, number])[]): string | null {
  const p = new Vector3();
  for (const [x, z] of line) {
    p.set(x, 0, z);
    world.resolve(p, r);
    if (Math.hypot(p.x - x, p.z - z) > 1e-6) return `pushed at (${x.toFixed(1)}, ${z.toFixed(1)})`;
  }
  return null;
}

describe('the zones as the registry lists them', () => {
  it('names each neighbour both ways', () => {
    const ids = ['forest', 'brackenmoor', 'aldhaven', 'sallows'];
    for (const id of ids) {
      const info = findMap(id);
      if (info?.kind !== 'zone') throw new Error(id);
      for (const n of info.neighbours) {
        const other = findMap(n);
        expect(other?.kind === 'zone' && other.neighbours.includes(id), `${id} → ${n}`).toBe(true);
      }
    }
    expect(findMap('aldhaven')).toMatchObject({ neighbours: ['brackenmoor', 'sallows'] });
  });

  it('lays them side by side on the chunk grid, no chunk claimed twice', () => {
    const keys = [oakvale, brackenmoor, aldhaven, sallows].flatMap((z) => z.chunks.keys);
    expect(new Set(keys).size).toBe(keys.length);
    expect(aldhaven.land).toEqual({ minX: MOOR.land.maxX, maxX: 580, minZ: KINGSROAD.minZ, maxZ: SALLOWS.land.minZ });
  });

  it('finds the four places they meet, each over the stretch both lie along', () => {
    const meets = crossings([oakvale, brackenmoor, aldhaven, sallows]);
    expect(meets).toHaveLength(4);
    expect(meets).toContainEqual({ z: CREST.z, minX: CREST.minX, maxX: CREST.maxX, north: oakvale, south: brackenmoor });
    expect(meets).toContainEqual({ x: FEN_ROAD.x, minZ: FEN_ROAD.minZ, maxZ: FEN_ROAD.maxZ, west: brackenmoor, east: sallows });
    expect(meets).toContainEqual({ x: KINGSROAD.x, minZ: KINGSROAD.minZ, maxZ: KINGSROAD.maxZ, west: brackenmoor, east: aldhaven });
    expect(meets).toContainEqual({ z: SALLOWS.land.minZ, minX: aldhaven.land.minX, maxX: aldhaven.land.maxX, north: aldhaven, south: sallows });
  });
});

describe('the Kingsroad seam, Brackenmoor to Aldhaven', () => {
  it("meets the seam's heights exactly from both sides, vertex for vertex, and between them", () => {
    for (let z = KINGSROAD.minZ; z <= KINGSROAD.maxZ; z += KINGSROAD.step) {
      expect(moor.heightAt(KINGSROAD.x, z), `moor z ${z}`).toBeCloseTo(kingsroadHeight(z), 5);
      expect(city.heightAt(KINGSROAD.x, z), `city z ${z}`).toBeCloseTo(kingsroadHeight(z), 5);
    }
    for (let z = KINGSROAD.minZ; z < KINGSROAD.maxZ; z += 0.5) expect(moor.heightAt(KINGSROAD.x, z), `z ${z}`).toBeCloseTo(city.heightAt(KINGSROAD.x, z), 4);
    expect(brackenmoor.sideSeams![1].heights).toEqual(aldhaven.sideSeams![0].heights);
  });

  it('has no step underfoot crossing it anywhere', () => {
    for (let z = KINGSROAD.minZ + 1; z < KINGSROAD.maxZ; z += 1) {
      expect(Math.abs(world.heightAt(KINGSROAD.x - 0.05, z) - world.heightAt(KINGSROAD.x + 0.05, z)), `z ${z}`).toBeLessThan(0.15);
    }
    expect(world.zoneAt(KINGSROAD.x - 1, KINGSROAD.road.z)).toBe(brackenmoor);
    expect(world.zoneAt(KINGSROAD.x + 1, KINGSROAD.road.z)).toBe(aldhaven);
  });

  it('runs the ridge along the line, and the road over it in a cutting below the ridge', () => {
    const { road, ridge } = KINGSROAD;
    expect(kingsroadHeight(road.z)).toBeCloseTo(road.y, 6);
    expect(kingsroadHeight(road.z + 24)).toBeGreaterThan(ridge - 5);
    expect(kingsroadHeight(road.z - 24)).toBeGreaterThan(ridge - 5);
    // The corners agree with the Fen road's seam to the south.
    expect(kingsroadHeight(KINGSROAD.maxZ)).toBeCloseTo(fenRoadHeight(FEN_ROAD.minZ), 9);
  });

  it("walks the Kingsroad from Fellgate Hall through the open tollgate and the cutting, over the line, to Aldhaven's Kingsgate", () => {
    const kings = moor.roads.find((road) => road.id === 'kingsroad')!;
    expect(kings.line.at(-1)).toEqual([KINGSROAD.x, KINGSROAD.road.z]);
    expect(kings.heights.at(-1)).toBe(KINGSROAD.road.y);
    const west = kings.line.filter(([x]) => x > 200 && x <= KINGSROAD.x);
    const east = city.streets[0].line.filter(([x]) => x >= KINGSROAD.x && x < ALDHAVEN.at.x + ALDHAVEN.gates.kingsgate.x - 6);
    expect(east.length).toBeGreaterThan(30);
    expect(walksFreely([...west, ...east])).toBeNull();
    // Climbing no steeper than 1 in 3 anywhere, the line included.
    const line = [...west, ...east];
    for (let i = 1; i < line.length; i++) {
      const [ax, az] = line[i - 1];
      const [bx, bz] = line[i];
      const run = Math.hypot(bx - ax, bz - az);
      if (run < 0.2) continue;
      expect(Math.abs(world.heightAt(bx, bz) - world.heightAt(ax, az)) / run, `(${bx.toFixed(1)}, ${bz.toFixed(1)})`).toBeLessThan(1 / 3);
    }
  });
});

describe('the causeway seam, Aldhaven to the Sallows', () => {
  it("meets the Sallows' north edge exactly along Aldhaven's south edge", () => {
    for (let x = aldhaven.land.minX; x <= aldhaven.land.maxX; x += SALLOWS.cell) {
      const want = x === SALLOWS.land.minX ? fenRoadHeight(FEN_ROAD.minZ) : northEdgeHeight(x);
      expect(city.heightAt(x, SALLOWS.land.minZ), `city x ${x}`).toBeCloseTo(want, 5);
      expect(fen.heightAt(x, SALLOWS.land.minZ), `fen x ${x}`).toBeCloseTo(want, 5);
    }
    // The corner where all three meet: the Fen road seam's north hill.
    expect(moor.heightAt(KINGSROAD.x, KINGSROAD.maxZ)).toBeCloseTo(city.heightAt(KINGSROAD.x, KINGSROAD.maxZ), 5);
    expect(aldhaven.seams[0].roads).toEqual([{ x: CAUSEWAY.x, width: CAUSEWAY.width, dir: [0, 1] }]);
  });

  it('has no step underfoot crossing it where both lie', () => {
    for (let x = aldhaven.land.minX + 1; x < aldhaven.land.maxX; x += 1) {
      expect(Math.abs(world.heightAt(x, SALLOWS.land.minZ - 0.05) - world.heightAt(x, SALLOWS.land.minZ + 0.05)), `x ${x}`).toBeLessThan(0.15);
    }
  });

  it("walks the causeway from Aldhaven's south gate over the tidal flats, over the line, to the Sallows' toll house", () => {
    const street = city.streets.find((s) => s.line.at(-1)![1] > SALLOWS.land.minZ)!;
    expect(street.line.at(-1)![0]).toBeCloseTo(CAUSEWAY.x, 6);
    const north = street.line.filter(([, z]) => z <= SALLOWS.land.minZ);
    const south = fen.roads.find((road) => road.id === 'causeway')!.line;
    expect(walksFreely([...north, ...south])).toBeNull();
  });
});
