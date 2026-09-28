import { HemisphereLight, DirectionalLight, type Light, type Object3D, PointLight, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { buildForest } from '../src/maps/forest/forest';
import { buildLayout, type ForestLayout, worldToLocal } from '../src/maps/forest/layout';
import type { Zone } from '../src/maps/types';
import { World } from '../src/world/world';

// The World as `Ground`: gameplay asks it about the ground wherever you stand,
// and it answers from the zone underfoot. Oakvale is built for real here, and
// its plan (the layout) is the independent source of truth.

let oakvale: Zone;
let plan: ForestLayout;
let world: World;
beforeAll(() => {
  const built = buildForest();
  if (built.kind !== 'zone') throw new Error('Oakvale should be a zone');
  oakvale = built;
  plan = buildLayout();
  world = new World();
  world.load(oakvale);
}, 20000);

function lights(root: Object3D): Light[] {
  const found: Light[] = [];
  root.traverse((o) => {
    if ((o as Light).isLight) found.push(o as Light);
  });
  return found;
}

describe('the World as Ground in Oakvale', () => {
  it("gives Oakvale's heights, on the ground, the bridge and the hills", () => {
    const samples: [number, number][] = [
      [0, 0],
      [13.4, -9.7],
      [-6, -31], // the bridge over the stream
      [40, -58], // the watchtower's hilltop
      [-50, 30], // the pond
      [56, 36],
      [-70, 75],
      [120, -130], // the mountains past the play area
    ];
    for (const [x, z] of samples) expect(world.heightAt(x, z)).toBe(plan.heightAt(x, z));
  });

  it("pushes a body out of the inn's walls", () => {
    const inn = plan.structures.find((s) => s.kind === 'inn')!;
    const r = CONFIG.player.bodyRadius;
    const p = new Vector3(inn.x + 1, 0, inn.z - 0.5);
    expect(world.resolve(p, r)).toBe(true);
    const [lx, lz] = worldToLocal(inn, p.x, p.z);
    const outside = Math.abs(lx) >= inn.hw + r - 1e-6 || Math.abs(lz) >= inn.hd + r - 1e-6;
    expect(outside).toBe(true);
    // Standing on the road outside, nothing moves you.
    expect(world.resolve(new Vector3(plan.spawn.x, 0, plan.spawn.z), r)).toBe(false);
  });

  it("blocks a sight line over the watchtower's hill", () => {
    const a = new Vector3(24, 0, -63.5);
    const b = new Vector3(56, 0, -63.5);
    // Nothing solid stands on the line: only the lie of the land is in the way.
    for (let t = 0; t <= 1; t += 0.02) {
      expect(plan.colliders.blocked(a.x + (b.x - a.x) * t, a.z, 0.1)).toBe(false);
    }
    expect(world.heightAt(40, -63.5)).toBeGreaterThan(plan.heightAt(a.x, a.z) + CONFIG.world.ground.eyeHeight + 1);
    expect(world.lineOfSight(a, b)).toBe(false);
    // Along the level road through the village, you see clear down it.
    expect(world.lineOfSight(new Vector3(0, 0, 3), new Vector3(1, 0, 12))).toBe(true);
  });

  it('stops an arrow in the ground, not in the air above it', () => {
    const top = world.heightAt(40, -52);
    expect(top).toBeGreaterThan(8); // up on the hill, well above sea level
    expect(world.arrowStops(new Vector3(40, top - 0.1, -52))).toBe(true);
    expect(world.arrowStops(new Vector3(40, top + 1.5, -52))).toBe(false);
  });

  it('bends a walker round a building rather than into it', () => {
    const inn = plan.structures.find((s) => s.kind === 'inn')!;
    // Walking straight at the inn's middle from 3 m off its front.
    const [fx, fz] = [inn.x + Math.sin(inn.yaw) * (inn.hd + 1.2), inn.z + Math.cos(inn.yaw) * (inn.hd + 1.2)];
    const from = new Vector3(fx, 0, fz);
    const dir = new Vector3(inn.x - fx, 0, inn.z - fz).normalize();
    const straight = dir.clone();
    world.steer(from, dir, 0.4);
    expect(dir.angleTo(straight)).toBeGreaterThan(0.3);
  });
});

describe("the World's light", () => {
  it('keeps one hemisphere light, one sun and a pool of exactly 4 point lights, dark outdoors', () => {
    const all = lights(world.root);
    expect(all.filter((l) => l instanceof HemisphereLight)).toHaveLength(1);
    expect(all.filter((l) => l instanceof DirectionalLight)).toHaveLength(1);
    const pool = all.filter((l) => l instanceof PointLight);
    expect(pool).toHaveLength(4);
    expect(pool.map((l) => l.intensity)).toEqual([0, 0, 0, 0]);
  });

  it('holds 4 point lights in the pool whether a place has fewer flames or more', () => {
    const fresh = new World();
    expect(lights(fresh.root).filter((l) => l instanceof PointLight)).toHaveLength(4);
    const flame = { x: 0, y: 1, z: 0 };
    for (const flames of [[flame], Array(6).fill(flame), []]) {
      fresh.apply({ ...oakvale.atmosphere, flames });
      const pool = lights(fresh.root).filter((l) => l instanceof PointLight);
      expect(pool).toHaveLength(4);
      expect(pool.filter((l) => l.intensity > 0)).toHaveLength(Math.min(4, flames.length));
    }
  });

  it("leaves Oakvale's own root without lights or sky", () => {
    expect(lights(oakvale.root)).toEqual([]);
    const names: string[] = [];
    oakvale.root.traverse((o) => names.push(o.name));
    expect(names.filter((n) => /sky/.test(n))).toEqual([]);
  });
});
