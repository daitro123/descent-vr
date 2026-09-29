import { HemisphereLight, DirectionalLight, type Light, type Object3D, PerspectiveCamera, PointLight, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { Camps, type You } from '../src/enemies/camps';
import { buildForest } from '../src/maps/forest/forest';
import { HOUSE } from '../src/maps/forest/house';
import { INN } from '../src/maps/forest/inn';
import { SMITHY } from '../src/maps/forest/smithy';
import { buildLayout, type ForestLayout, localToWorld, worldToLocal } from '../src/maps/forest/layout';
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

/** Every body radius: yours and each enemy's. */
const RADII = [...new Set([CONFIG.player.bodyRadius, ...Object.values(CONFIG.enemies).map((e) => e.radius)])];

/**
 * Flood fill a grid of 0.1 m over the rectangle (in a building's frame, placed
 * by `at`) from `seed`, through every spot a body of `radius` can stand on.
 * Whatever free spot it doesn't reach is a pocket: somewhere a body could be
 * knocked into and never walk out of.
 */
function flood(
  at: (lx: number, lz: number) => Vector3,
  rect: { x0: number; x1: number; z0: number; z1: number },
  seed: readonly [number, number],
  radius: number,
): { seedFree: boolean; pockets: string[] } {
  const step = 0.1;
  const nx = Math.round((rect.x1 - rect.x0) / step) + 1;
  const nz = Math.round((rect.z1 - rect.z0) / step) + 1;
  const free = new Uint8Array(nx * nz);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) free[i * nz + j] = world.resolve(at(rect.x0 + i * step, rect.z0 + j * step), radius) ? 0 : 1;
  const seen = new Uint8Array(nx * nz);
  const start = Math.round((seed[0] - rect.x0) / step) * nz + Math.round((seed[1] - rect.z0) / step);
  const stack = free[start] ? [start] : [];
  seen[start] = 1;
  while (stack.length) {
    const k = stack.pop()!;
    const i = Math.floor(k / nz);
    const j = k % nz;
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
  for (let k = 0; k < nx * nz; k++) {
    if (free[k] && !seen[k]) pockets.push(`(${(rect.x0 + Math.floor(k / nz) * step).toFixed(1)}, ${(rect.z0 + (k % nz) * step).toFixed(1)})`);
  }
  return { seedFree: free[start] === 1, pockets };
}

describe('the World as Ground in Oakvale', () => {
  it("gives Oakvale's heights, on the ground, the bridge and the hills", () => {
    const samples: [number, number][] = [
      [0, 0],
      [8.5, -6.5], // the crossroads' corner before the inn
      [-6, -31], // the bridge over the stream
      [40, -58], // the watchtower's hilltop
      [-50, 30], // the pond
      [56, 36],
      [-70, 75],
      [120, -130], // the mountains past the play area
    ];
    for (const [x, z] of samples) expect(world.heightAt(x, z)).toBe(plan.heightAt(x, z));
  });

  it("pushes a body out of the inn's walls from outside, as its old solid footprint did", () => {
    const inn = plan.structures.find((s) => s.kind === 'inn')!;
    const r = CONFIG.player.bodyRadius;
    for (const [lx0, lz0] of [
      [1, -inn.hd - 0.1], // the back wall
      [inn.hw + 0.1, 1], // a side wall
      [-3, inn.hd + 0.1], // the front, beside the door
    ]) {
      const [x, z] = localToWorld(inn, lx0, lz0);
      const p = new Vector3(x, 0, z);
      expect(world.resolve(p, r)).toBe(true);
      const [lx, lz] = worldToLocal(inn, p.x, p.z);
      const outside = Math.abs(lx) >= inn.hw + r - 1e-6 || Math.abs(lz) >= inn.hd + r - 1e-6;
      expect(outside).toBe(true);
    }
    // Standing on the road outside, nothing moves you.
    expect(world.resolve(new Vector3(plan.spawn.x, 0, plan.spawn.z), r)).toBe(false);
  });

  it('keeps a body out of someone standing in it, as it does from walls', () => {
    const peopled = new World();
    peopled.load(oakvale);
    peopled.addBody({ x: plan.hale.x, z: plan.hale.z, r: 0.3 });
    const r = CONFIG.player.bodyRadius;
    const p = new Vector3(plan.hale.x + 0.2, 0, plan.hale.z + 0.1);
    expect(peopled.resolve(p, r)).toBe(true);
    expect(Math.hypot(p.x - plan.hale.x, p.z - plan.hale.z)).toBeCloseTo(0.3 + r, 6);
    // A step away, nothing moves you; and the World with nobody in it lets you stand there.
    expect(peopled.resolve(new Vector3(plan.hale.x + 1, 0, plan.hale.z), r)).toBe(false);
    expect(world.resolve(new Vector3(plan.hale.x + 0.2, 0, plan.hale.z + 0.1), r)).toBe(false);
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
    // Walking straight at the inn's front wall, beside its door, from 1.2 m off it.
    const [fx, fz] = localToWorld(inn, -3.2, inn.hd + 1.2);
    const [tx, tz] = localToWorld(inn, -3.2, 0);
    const from = new Vector3(fx, 0, fz);
    const dir = new Vector3(tx - fx, 0, tz - fz).normalize();
    const straight = dir.clone();
    world.steer(from, dir, 0.4);
    expect(dir.angleTo(straight)).toBeGreaterThan(0.3);
  });
});

describe("the lumber camp's tent", () => {
  it('is no trap: the leader before its door comes round it and swings at you standing square behind it', () => {
    const lumber = oakvale.camps.find((c) => c.id === 'lumberCamp')!;
    const camps = new Camps([lumber], world, { sweep: () => null, slam: () => {}, shoot: () => {}, nock: () => {}, telegraph: () => {} });
    const tent = plan.structures.find((s) => s.kind === 'tent')!;
    const [x, z] = localToWorld(tent, 0, -tent.hd - 2.5);
    const feet = new Vector3(x, world.heightAt(x, z), z);
    const you: You = { feet, head: feet.clone().setY(feet.y + 1.6), sword: null, alive: true };
    const leader = camps.camps[0].members.find((m) => m.plan.role === 'leader')!.enemy;
    let took = Infinity;
    for (let t = 0; t < 15 && took === Infinity; t += 1 / 72) {
      camps.update(1 / 72, you);
      if (leader.attacking) took = t;
    }
    expect(took).toBeLessThan(8);
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
    const eye = new PerspectiveCamera();
    expect(lights(fresh.root).filter((l) => l instanceof PointLight)).toHaveLength(4);
    const flameAt = (i: number) => ({ x: i, y: 1, z: 0 });
    for (const flames of [[flameAt(0)], Array.from({ length: 6 }, (_, i) => flameAt(i)), []]) {
      fresh.apply({ ...oakvale.atmosphere, flames });
      for (let t = 0; t < 1; t += 1 / 72) fresh.update(1 / 72, eye);
      const pool = lights(fresh.root).filter((l) => l instanceof PointLight);
      expect(pool).toHaveLength(4);
      expect(pool.filter((l) => l.intensity > 0)).toHaveLength(Math.min(4, flames.length));
      // With more flames than lights, the pool sits on the nearest ones.
      if (flames.length > 4) expect(pool.map((l) => l.position.x).sort()).toEqual([0, 1, 2, 3]);
    }
  });

  it('fades a light out of a flame before it moves, and in on its new one, flickering by intensity', () => {
    const fresh = new World();
    const eye = new PerspectiveCamera();
    const near = { x: 0, y: 1, z: 0 };
    const far = { x: 30, y: 1, z: 0 };
    const step = (seconds: number) => {
      for (let t = 0; t < seconds - 1e-9; t += 1 / 72) fresh.update(1 / 72, eye);
    };
    fresh.apply({ ...oakvale.atmosphere, flames: [near] });
    const lit = () => fresh.pool.filter((l) => l.intensity > 0);
    step(CONFIG.world.pool.fade / 2);
    const halfway = lit()[0].intensity;
    expect(halfway).toBeLessThan(CONFIG.world.pool.intensity * 0.7);
    step(CONFIG.world.pool.fade);
    const levels = new Set<number>();
    for (let i = 0; i < 20; i++) {
      step(0.05);
      levels.add(Math.round(lit()[0].intensity * 100));
    }
    expect(levels.size).toBeGreaterThan(5); // it flickers
    // Swapped to a flame far off: the light fades where it was before it moves.
    fresh.apply({ ...oakvale.atmosphere, flames: [far] });
    step(CONFIG.world.pool.fade / 2);
    const [moving] = lit();
    expect(moving.position.x).toBe(0);
    step(CONFIG.world.pool.fade * 2);
    expect(lit().map((l) => l.position.x)).toEqual([30]);
  });

  it("leaves Oakvale's own root without lights or sky", () => {
    expect(lights(oakvale.root)).toEqual([]);
    const names: string[] = [];
    oakvale.root.traverse((o) => names.push(o.name));
    expect(names.filter((n) => /sky/.test(n))).toEqual([]);
  });
});

describe('the inn, the Golden Tankard', () => {
  const innAt = () => plan.structures.find((s) => s.kind === 'inn')!;
  const at = (lx: number, lz: number) => {
    const [x, z] = localToWorld(innAt(), lx, lz);
    return new Vector3(x, 0, z);
  };

  it("gives the inn's floor inside its footprint, and steps down from its door to the ground", () => {
    const inn = innAt();
    const floor = inn.y + INN.floor;
    for (const [lx, lz] of [
      [0, 0],
      [-5, -3.5],
      [4.5, 3],
      [0, inn.hd - 0.01],
    ]) {
      const p = at(lx, lz);
      expect(world.heightAt(p.x, p.z)).toBeCloseTo(floor, 9);
    }
    // Down the steps: from the floor at the door's line to the ground at their foot.
    let last = floor;
    for (let lz = inn.hd + 0.1; lz < inn.hd + INN.steps.out; lz += 0.2) {
      const p = at(0, lz);
      const h = world.heightAt(p.x, p.z);
      expect(h).toBeLessThan(last);
      last = h;
    }
    const foot = at(0, inn.hd + INN.steps.out + 0.1);
    expect(world.heightAt(foot.x, foot.z)).toBeCloseTo(plan.heightAt(foot.x, foot.z), 9);
    expect(Math.abs(plan.heightAt(foot.x, foot.z) - inn.y)).toBeLessThan(0.02);
  });

  it("keeps you in by the taproom's walls and out of its hearth, bar and tables, and lets you through the door", () => {
    const r = CONFIG.player.bodyRadius;
    const { room, hearth, bar, tables } = INN;
    const pushed = (lx: number, lz: number) => world.resolve(at(lx, lz), r);
    expect(pushed(0, -room.hd + 0.1)).toBe(true); // the back wall, from inside
    expect(pushed(-room.hw + 0.1, 0.2)).toBe(true); // the left wall
    expect(pushed(room.hw - hearth.depth / 2, hearth.z)).toBe(true); // in the hearth
    expect(pushed((bar.x0 + bar.x1) / 2, bar.z - 0.2)).toBe(true); // in the bar
    for (const [x, z] of tables) expect(pushed(x, z)).toBe(true);
    // The doorway is open, in and out; the middle of the floor is clear.
    for (const lz of [INN.hd + 0.5, INN.hd, INN.hd - 0.3, room.hd - 0.5]) expect(pushed(0, lz)).toBe(false);
    expect(pushed(0, -0.5)).toBe(false);
  });

  it('is walkable from the door to every spot a body can stand on, for every body radius (no pockets)', () => {
    const { hw, hd } = INN.room;
    for (const radius of RADII) {
      const { seedFree, pockets } = flood(at, { x0: -hw, x1: hw, z0: -hd, z1: hd + 1.5 }, [0, hd + 1.5], radius);
      expect(seedFree, `radius ${radius}: outside the door is clear`).toBe(true);
      expect(pockets.slice(0, 5), `radius ${radius}`).toEqual([]);
    }
  });

  it("wakes you on the hearth's clear floor", () => {
    const { village } = oakvale.respawns;
    const p = new Vector3(village.x, 0, village.z);
    expect(world.resolve(p, CONFIG.player.bodyRadius)).toBe(false);
    expect(world.heightAt(village.x, village.z)).toBeCloseTo(innAt().y + INN.floor, 9);
  });

  it('keeps every camp and patrol a leash and more from its walls, so no enemy comes indoors', () => {
    const inn = innAt();
    const spots = oakvale.camps.flatMap((c) => [...c.posts, ...(c.road ?? [])]);
    for (const s of spots) {
      const [lx, lz] = worldToLocal(inn, s.x, s.z);
      const off = Math.hypot(Math.max(Math.abs(lx) - inn.hw, 0), Math.max(Math.abs(lz) - inn.hd, 0));
      expect(off).toBeGreaterThan(CONFIG.camps.leash + CONFIG.camps.notice);
    }
  });
});

describe('walking into the inn and out again', () => {
  /** A World with Oakvale in it, and a camera to walk it with at eye height. */
  function walkable() {
    const w = new World();
    w.load(oakvale);
    const eye = new PerspectiveCamera();
    const inn = plan.structures.find((s) => s.kind === 'inn')!;
    const stand = (lx: number, lz: number) => {
      const [x, z] = localToWorld(inn, lx, lz);
      eye.position.set(x, w.heightAt(x, z) + 1.6, z);
      eye.updateMatrixWorld();
    };
    /** Walk the door's middle line from `from` to `to` (in the inn's frame) at walking pace. */
    const walk = (from: number, to: number) => {
      const dt = 1 / 72;
      const n = Math.ceil(Math.abs(to - from) / (CONFIG.player.moveSpeed * dt));
      for (let i = 1; i <= n; i++) {
        stand(0, from + ((to - from) * i) / n);
        w.update(dt, eye);
      }
    };
    const hold = (seconds: number) => {
      for (let t = 0; t < seconds; t += 1 / 72) w.update(1 / 72, eye);
    };
    const room = oakvale.interiors[0];
    return { w, eye, walk, hold, stand, room, inn };
  }

  it('shows the room lit by its flames through the open door, under the sun', () => {
    const { w, walk, hold, room, inn } = walkable();
    walk(inn.hd + 8, inn.hd + 1);
    hold(1);
    expect(room.room.visible).toBe(true);
    expect(w.sun.intensity).toBe(oakvale.atmosphere.sun.intensity);
    expect(oakvale.root.visible).toBe(true);
    expect(w.outdoorsShown).toBe(true);
    // The pool sits on the room's four flames.
    const onFlames = w.pool.filter((l) => l.intensity > 0 && room.flames.some((f) => l.position.distanceTo(new Vector3(f.x, f.y, f.z)) < 1e-6));
    expect(onFlames).toHaveLength(4);
    expect(w.interior).toBe(null);
  });

  it("swaps to the room's light once the door shuts behind you, hiding the outdoors, and back as you walk out", () => {
    const { w, walk, hold, room, inn } = walkable();
    walk(inn.hd + 8, inn.hd - 3);
    hold(1);
    expect(w.interior).toBe('inn');
    expect(w.sun.intensity).toBe(0);
    expect(w.hemisphere.intensity).toBeCloseTo(room.atmosphere.hemisphere.intensity, 9);
    expect(oakvale.root.visible).toBe(false);
    expect(w.outdoorsShown).toBe(false);
    expect(room.room.visible).toBe(true);
    expect(w.pool.filter((l) => l.intensity > 0)).toHaveLength(4);
    // Back out the door and off down the road: the sun's up, the room's gone and the pool is dark.
    walk(inn.hd - 3, inn.hd + 8);
    hold(1);
    expect(w.interior).toBe(null);
    expect(w.sun.intensity).toBe(oakvale.atmosphere.sun.intensity);
    expect(oakvale.root.visible).toBe(true);
    expect(room.room.visible).toBe(false);
    expect(w.pool.every((l) => l.intensity === 0)).toBe(true);
  });

  it('settles inside at once, door shut and the room lit, for a save or a wake by the hearth', () => {
    const { w, eye, stand, room } = walkable();
    const { village } = oakvale.respawns;
    const inn = plan.structures.find((s) => s.kind === 'inn')!;
    const [lx, lz] = worldToLocal(inn, village.x, village.z);
    stand(lx, lz);
    w.settle('inn');
    w.update(1 / 72, eye);
    expect(w.interior).toBe('inn');
    expect(w.sun.intensity).toBe(0);
    expect(room.room.visible).toBe(true);
    expect(oakvale.root.visible).toBe(false);
    // The room's flames are lit at once, with no fade in.
    expect(w.pool.filter((l) => l.intensity > CONFIG.world.pool.intensity * 0.6)).toHaveLength(4);
  });
});

describe('the house by the well', () => {
  const houseAt = () => plan.structures.find((s) => s.kind === 'house' && s.variant === 0)!;
  const at = (lx: number, lz: number) => {
    const [x, z] = localToWorld(houseAt(), lx, lz);
    return new Vector3(x, 0, z);
  };

  it('is the slate-roofed house facing the crossroads, with the lantern at its door', () => {
    const house = houseAt();
    // Its front faces the crossroads' middle.
    const [lx, lz] = worldToLocal(house, 0, 0);
    expect(Math.abs(Math.atan2(lx, lz))).toBeLessThan(0.35);
    // The house nearest the well.
    const well = plan.structures.find((s) => s.kind === 'well')!;
    const houses = plan.structures.filter((s) => s.kind === 'house');
    const nearest = houses.reduce((a, b) => (Math.hypot(a.x - well.x, a.z - well.z) < Math.hypot(b.x - well.x, b.z - well.z) ? a : b));
    expect(nearest).toBe(house);
    expect(oakvale.interiors.map((i) => i.id)).toEqual(['inn', 'house']);
  });

  it("gives the house's floor inside its footprint, and steps down from its door to the ground", () => {
    const house = houseAt();
    const floor = house.y + HOUSE.floor;
    for (const [lx, lz] of [
      [0, 0],
      [-3, -2.5],
      [3, 2.5],
      [HOUSE.door.x, house.hd - 0.01],
    ]) {
      const p = at(lx, lz);
      expect(world.heightAt(p.x, p.z)).toBeCloseTo(floor, 9);
    }
    let last = floor;
    for (let lz = house.hd + 0.1; lz < house.hd + HOUSE.steps.out; lz += 0.2) {
      const p = at(HOUSE.door.x, lz);
      const h = world.heightAt(p.x, p.z);
      expect(h).toBeLessThan(last);
      last = h;
    }
    const foot = at(HOUSE.door.x, house.hd + HOUSE.steps.out + 0.1);
    expect(world.heightAt(foot.x, foot.z)).toBeCloseTo(plan.heightAt(foot.x, foot.z), 9);
    expect(Math.abs(plan.heightAt(foot.x, foot.z) - house.y)).toBeLessThan(0.02);
  });

  it('keeps you in by its walls and out of its hearth, bed, chest, table and shelf, and lets you through the door', () => {
    const r = CONFIG.player.bodyRadius;
    const { room, hearth, bed, chest, table, shelf, door } = HOUSE;
    const pushed = (lx: number, lz: number) => world.resolve(at(lx, lz), r);
    expect(pushed(0, -room.hd + 0.1)).toBe(true); // the back wall, from inside
    expect(pushed(-room.hw + 0.1, 1.5)).toBe(true); // the left wall
    expect(pushed(-1, room.hd - 0.1)).toBe(true); // the front wall, beside the door
    expect(pushed(room.hw - hearth.depth / 2, hearth.z)).toBe(true);
    expect(pushed(bed.x, bed.z)).toBe(true);
    expect(pushed(chest.x, chest.z)).toBe(true);
    expect(pushed(table.x, table.z)).toBe(true);
    expect(pushed(shelf.x, -room.hd + 0.3)).toBe(true);
    // The doorway is open, in and out; the middle of the floor is clear.
    for (const lz of [HOUSE.hd + 0.5, HOUSE.hd, HOUSE.hd - 0.3, room.hd - 0.5]) expect(pushed(door.x, lz)).toBe(false);
    expect(pushed(0.8, -0.5)).toBe(false);
  });

  it('pushes a body out of its walls from outside, as its old solid footprint did', () => {
    const house = houseAt();
    const r = CONFIG.player.bodyRadius;
    for (const [lx0, lz0] of [
      [1, -house.hd - 0.1],
      [house.hw + 0.1, 1],
      [-house.hw - 0.1, -1],
      [-1.5, house.hd + 0.1],
    ]) {
      const p = at(lx0, lz0);
      expect(world.resolve(p, r)).toBe(true);
      const [lx, lz] = worldToLocal(house, p.x, p.z);
      expect(Math.abs(lx) >= house.hw + r - 1e-6 || Math.abs(lz) >= house.hd + r - 1e-6).toBe(true);
    }
  });

  it('is walkable from the door to every spot a body can stand on, for every body radius (no pockets)', () => {
    const { hw, hd } = HOUSE.room;
    for (const radius of RADII) {
      const { seedFree, pockets } = flood(at, { x0: -hw, x1: hw, z0: -hd, z1: hd + 1.5 }, [HOUSE.door.x, hd + 1.5], radius);
      expect(seedFree, `radius ${radius}: outside the door is clear`).toBe(true);
      expect(pockets.slice(0, 5), `radius ${radius}`).toEqual([]);
    }
  });

  it('keeps every camp and patrol more than a leash from its doorway, the only way in, so no enemy comes indoors', () => {
    // The patrol's road passes behind it: a member jumped there chases you no more than a leash from where it was jumped.
    const house = houseAt();
    const door = at(HOUSE.door.x, house.hd);
    const reach = CONFIG.camps.leash + CONFIG.camps.patrol.keepUp + Math.max(...RADII);
    const spots = oakvale.camps.flatMap((c) => [...c.posts, ...(c.road ?? [])]);
    for (const s of spots) expect(Math.hypot(s.x - door.x, s.z - door.z)).toBeGreaterThan(reach);
  });
});

describe('walking into the house and out again', () => {
  function walkable() {
    const w = new World();
    w.load(oakvale);
    const eye = new PerspectiveCamera();
    const house = plan.structures.find((s) => s.kind === 'house' && s.variant === 0)!;
    const stand = (lx: number, lz: number) => {
      const [x, z] = localToWorld(house, lx, lz);
      eye.position.set(x, w.heightAt(x, z) + 1.6, z);
      eye.updateMatrixWorld();
    };
    /** Walk the door's middle line from `from` to `to` (in the house's frame) at walking pace. */
    const walk = (from: number, to: number) => {
      const dt = 1 / 72;
      const n = Math.ceil(Math.abs(to - from) / (CONFIG.player.moveSpeed * dt));
      for (let i = 1; i <= n; i++) {
        stand(HOUSE.door.x, from + ((to - from) * i) / n);
        w.update(dt, eye);
      }
    };
    const hold = (seconds: number) => {
      for (let t = 0; t < seconds; t += 1 / 72) w.update(1 / 72, eye);
    };
    const room = oakvale.interiors.find((i) => i.id === 'house')!;
    return { w, eye, walk, hold, stand, room, house };
  }

  it('opens its door as you walk up to it, off the front\'s middle, and shows the room lit by the hearth and the candle', () => {
    const { w, walk, hold, room, house } = walkable();
    walk(house.hd + 8, house.hd + 1);
    hold(1);
    expect(room.room.visible).toBe(true);
    expect(w.outdoorsShown).toBe(true);
    const lit = w.pool.filter((l) => l.intensity > 0 && room.flames.some((f) => l.position.distanceTo(new Vector3(f.x, f.y, f.z)) < 1e-6));
    expect(lit).toHaveLength(2);
    expect(w.interior).toBe(null);
  });

  it("swaps to the room's light once the door shuts behind you, hiding the outdoors, and back as you walk out", () => {
    const { w, walk, hold, room, house } = walkable();
    walk(house.hd + 8, house.hd - 3);
    hold(1);
    expect(w.interior).toBe('house');
    expect(w.sun.intensity).toBe(0);
    expect(w.hemisphere.intensity).toBeCloseTo(room.atmosphere.hemisphere.intensity, 9);
    expect(oakvale.root.visible).toBe(false);
    expect(room.room.visible).toBe(true);
    walk(house.hd - 3, house.hd + 8);
    hold(1);
    expect(w.interior).toBe(null);
    expect(w.sun.intensity).toBe(oakvale.atmosphere.sun.intensity);
    expect(oakvale.root.visible).toBe(true);
    expect(room.room.visible).toBe(false);
  });

  it('settles inside at once, door shut and the room lit, for a save made inside', () => {
    const { w, eye, stand, room } = walkable();
    stand(0.5, -0.5);
    w.settle('house');
    w.update(1 / 72, eye);
    expect(w.interior).toBe('house');
    expect(w.sun.intensity).toBe(0);
    expect(room.room.visible).toBe(true);
    expect(oakvale.root.visible).toBe(false);
    expect(w.pool.filter((l) => l.intensity > CONFIG.world.pool.intensity * 0.6)).toHaveLength(2);
  });
});

describe('the smithy', () => {
  const smithyAt = () => plan.structures.find((s) => s.kind === 'smithy')!;
  const at = (lx: number, lz: number) => {
    const [x, z] = localToWorld(smithyAt(), lx, lz);
    return new Vector3(x, 0, z);
  };

  it('is level ground under its roof, flush with its flagstones, and no interior', () => {
    const smithy = smithyAt();
    for (let lx = -SMITHY.hw; lx <= SMITHY.hw; lx += 0.5) {
      for (let lz = -SMITHY.hd; lz <= SMITHY.hd; lz += 0.5) {
        const p = at(lx, lz);
        expect(Math.abs(world.heightAt(p.x, p.z) - smithy.y)).toBeLessThan(0.02);
        for (const i of oakvale.interiors) expect(i.groundAt(p.x, p.z)).toBe(null);
      }
    }
  });

  it('keeps you out of its back wall, low side wall, forge, anvil, barrel and grindstone, and lets you in under its roof', () => {
    const r = CONFIG.player.bodyRadius;
    const { hd, hw, back, side, forge, anvil, barrel, grindstone } = SMITHY;
    const pushed = (lx: number, lz: number) => world.resolve(at(lx, lz), r);
    expect(pushed(0, -hd + back / 2)).toBe(true);
    expect(pushed(-hw + side / 2, 0.5)).toBe(true);
    expect(pushed(forge.x, forge.z)).toBe(true);
    expect(pushed(anvil.x, anvil.z)).toBe(true);
    expect(pushed(barrel.x, barrel.z)).toBe(true);
    expect(pushed(grindstone.x, grindstone.z)).toBe(true);
    // Stand at the forge and at the anvil, under the roof.
    expect(pushed(forge.x, forge.z + forge.hd + r + 0.05)).toBe(false);
    expect(pushed(anvil.x - anvil.r - r - 0.05, anvil.z)).toBe(false);
    expect(pushed(-1, -0.5)).toBe(false);
    expect(pushed(-1, hd + 0.5)).toBe(false); // out front
  });

  it('is walkable from out front to every spot a body can stand on under its roof, for every body radius (no pockets)', () => {
    const { hw, hd } = SMITHY;
    for (const radius of RADII) {
      const { seedFree, pockets } = flood(at, { x0: -hw, x1: hw + 1.5, z0: -hd, z1: hd + 1.5 }, [-1, hd + 1.5], radius);
      expect(seedFree, `radius ${radius}: out front is clear`).toBe(true);
      expect(pockets.slice(0, 5), `radius ${radius}`).toEqual([]);
    }
  });

  it('has no door and no switch: walking in leaves you outdoors, in the sun', () => {
    const w = new World();
    w.load(oakvale);
    const eye = new PerspectiveCamera();
    for (const [lx, lz] of [
      [-1, SMITHY.hd + 4],
      [-1, 0],
      [SMITHY.anvil.x - 0.9, SMITHY.anvil.z],
    ]) {
      const p = at(lx, lz);
      eye.position.set(p.x, w.heightAt(p.x, p.z) + 1.6, p.z);
      eye.updateMatrixWorld();
      for (let i = 0; i < 72; i++) w.update(1 / 72, eye);
      expect(w.interior).toBe(null);
      expect(w.outdoorsShown).toBe(true);
      expect(w.sun.intensity).toBe(oakvale.atmosphere.sun.intensity);
    }
  });
});
