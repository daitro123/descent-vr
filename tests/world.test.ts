import { HemisphereLight, DirectionalLight, type Light, type Object3D, PerspectiveCamera, PointLight, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { Camps, type You } from '../src/enemies/camps';
import { buildForest } from '../src/maps/forest/forest';
import { INN } from '../src/maps/forest/inn';
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
    const radii = new Set([CONFIG.player.bodyRadius, ...Object.values(CONFIG.enemies).map((e) => e.radius)]);
    const step = 0.1;
    const { hw, hd } = INN.room;
    const nx = Math.round((2 * hw) / step) + 1;
    const nz = Math.round((2 * hd + 1.5) / step) + 1;
    const p = new Vector3();
    for (const radius of radii) {
      const spot = (i: number, j: number) => at(-hw + i * step, -hd + j * step);
      const free = new Uint8Array(nx * nz);
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          const q = spot(i, j);
          p.copy(q);
          free[i * nz + j] = world.resolve(p, radius) ? 0 : 1;
        }
      }
      // Flood fill from just outside the door.
      const seen = new Uint8Array(nx * nz);
      const start = Math.round(hw / step) * nz + (nz - 1);
      expect(free[start], `radius ${radius}: outside the door is clear`).toBe(1);
      const stack = [start];
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
        if (free[k] && !seen[k]) pockets.push(`(${(-hw + Math.floor(k / nz) * step).toFixed(1)}, ${(-hd + (k % nz) * step).toFixed(1)})`);
      }
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
