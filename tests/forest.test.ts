import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { buildLayout, FOREST, type ForestLayout, HALE, localToWorld, TENT, worldToLocal } from '../src/maps/forest/layout';
import type { CampPlan } from '../src/maps/types';
import { MAPS } from '../src/maps/registry';

let layout: ForestLayout;
beforeAll(() => {
  layout = buildLayout();
});

// Walk the floor plane from the spawn, so no tree line, fence or building
// walls a place off. Computed once, on first use.
const STEP = 0.5;
let seen: Uint8Array | null = null;
function walkFromSpawn(): Uint8Array {
  const half = FOREST.play;
  const n = Math.round((2 * half) / STEP) + 1;
  const r = CONFIG.player.bodyRadius;
  const p = new Vector3();
  const free = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      p.set(-half + i * STEP, 0, -half + j * STEP);
      free[j * n + i] = layout.colliders.resolve(p, r) ? 0 : 1;
    }
  }
  const reached = new Uint8Array(n * n);
  const start = Math.round((layout.spawn.z + half) / STEP) * n + Math.round((layout.spawn.x + half) / STEP);
  const stack = [start];
  reached[start] = 1;
  while (stack.length) {
    const k = stack.pop()!;
    const i = k % n;
    const j = Math.floor(k / n);
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= n || b >= n) continue;
      const kk = b * n + a;
      if (free[kk] && !reached[kk]) {
        reached[kk] = 1;
        stack.push(kk);
      }
    }
  }
  return reached;
}

/** Can you walk from the spawn to within `near` metres of (x, z)? */
function onFoot(x: number, z: number, near = 0): boolean {
  seen ??= walkFromSpawn();
  const half = FOREST.play;
  const n = Math.round((2 * half) / STEP) + 1;
  const ci = Math.round((x + half) / STEP);
  const cj = Math.round((z + half) / STEP);
  const reach = Math.round(near / STEP);
  for (let dj = -reach; dj <= reach; dj++) {
    for (let di = -reach; di <= reach; di++) {
      const i = ci + di;
      const j = cj + dj;
      if (i >= 0 && j >= 0 && i < n && j < n && seen[j * n + i]) return true;
    }
  }
  return false;
}

describe('map registry', () => {
  it('finds every map folder', () => {
    expect(MAPS.map((m) => m.id)).toEqual(['crypt', 'forest']);
  });
});

describe('forest layout', () => {
  it('starts you on the road, on dry ground, clear of everything', () => {
    const { spawn } = layout;
    expect(layout.roadDistance.at(spawn.x, spawn.z)).toBeLessThan(0);
    expect(layout.heightAt(spawn.x, spawn.z)).toBeGreaterThan(FOREST.water + 0.3);
    expect(layout.colliders.blocked(spawn.x, spawn.z, CONFIG.player.bodyRadius)).toBe(false);
  });

  it("starts a new character at the crossroads, a few steps from Hale's spot and facing it", () => {
    const { spawn } = layout;
    expect(Math.hypot(spawn.x, spawn.z)).toBeLessThan(4);
    const dx = HALE.x - spawn.x;
    const dz = HALE.z - spawn.z;
    const d = Math.hypot(dx, dz);
    expect(d).toBeGreaterThan(3);
    expect(d).toBeLessThan(4);
    // Yaw 0 looks down −Z.
    const facing = (-Math.sin(spawn.yaw) * dx - Math.cos(spawn.yaw) * dz) / d;
    expect(facing).toBeGreaterThan(0.999);
    // Nothing stands between you and Hale, and there's room for them.
    const r = CONFIG.player.bodyRadius;
    for (let t = 0; t <= 1; t += 0.05) {
      expect(layout.colliders.blocked(spawn.x + dx * t, spawn.z + dz * t, r)).toBe(false);
    }
    expect(layout.roadDistance.at(HALE.x, HALE.z)).toBeLessThan(1);
  });

  it('keeps buildings off the roads', () => {
    const onRoad: string[] = [];
    for (const s of layout.structures) {
      if (!s.solid) continue;
      for (let u = -1; u <= 1; u += 0.25) {
        for (let v = -1; v <= 1; v += 0.25) {
          const [x, z] = localToWorld(s, u * s.hw, v * s.hd);
          if (layout.roadDistance.at(x, z) < 0.2) onRoad.push(`${s.kind} at (${s.x}, ${s.z})`);
        }
      }
    }
    expect([...new Set(onRoad)]).toEqual([]);
  });

  it('sets the watchtower and the mine on the ground, not hanging over it', () => {
    const gaps: string[] = [];
    const check = (what: string, x: number, z: number, y: number) => {
      const gap = y - layout.heightAt(x, z);
      if (Math.abs(gap) > 0.05) gaps.push(`${what} at (${x.toFixed(1)}, ${z.toFixed(1)}): ${gap.toFixed(2)} m`);
    };
    // All round the tower's base, out past its door step.
    const tower = layout.structures.find((s) => s.kind === 'tower')!;
    for (let a = 0; a < 2 * Math.PI; a += Math.PI / 16) {
      for (const r of [3.8, 4.2]) check('tower', tower.x + Math.sin(a) * r, tower.z + Math.cos(a) * r, tower.y);
    }
    // Along the mine's rails, from its mouth to where they end.
    const mine = layout.structures.find((s) => s.kind === 'mine')!;
    for (let lz = mine.hd; lz <= mine.hd + 6.6; lz += 0.5) {
      for (const lx of [-0.65, 0, 0.65]) check('mine rails', ...localToWorld(mine, lx, lz), mine.y);
    }
    expect(gaps).toEqual([]);
  });

  it('keeps every road above the water, except where the bridge carries it', () => {
    const wet: string[] = [];
    for (const path of layout.paths) {
      for (const [x, z] of path.line) {
        if (Math.abs(x) > FOREST.play || Math.abs(z) > FOREST.play) continue;
        if (layout.heightAt(x, z) < FOREST.water + 0.3) wet.push(`${path.id} (${x.toFixed(0)}, ${z.toFixed(0)})`);
      }
    }
    expect(wet.slice(0, 5)).toEqual([]);
  });

  it('lets you walk over the bridge without dropping into the stream', () => {
    const { bridge } = layout;
    for (let t = -1; t <= 1; t += 0.1) {
      const [x, z] = localToWorld(bridge, 0, t * bridge.hd);
      expect(layout.heightAt(x, z)).toBeGreaterThan(FOREST.water + 0.3);
    }
  });

  it('can reach every landmark on foot from the spawn', () => {
    // A landmark inside a building counts if you can walk up to within a few metres of it.
    const unreachable = layout.landmarks.filter(({ x, z }) => !onFoot(x, z, 6));
    expect(unreachable.map((l) => l.label)).toEqual([]);
  });

  it('puts every landmark inside the walkable bounds', () => {
    for (const l of layout.landmarks) {
      expect(Math.abs(l.x)).toBeLessThan(FOREST.play);
      expect(Math.abs(l.z)).toBeLessThan(FOREST.play);
    }
  });
});

const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** Posts that aren't on clear, dry, level ground you can walk to, and why. */
function badPosts(camp: CampPlan): string[] {
  const bad: string[] = [];
  for (const p of camp.posts) {
    const at = `(${p.x}, ${p.z})`;
    // Room to stand and turn: nothing within a metre.
    if (layout.colliders.blocked(p.x, p.z, 1)) bad.push(`${at} crowded`);
    if (layout.heightAt(p.x, p.z) < FOREST.water + 0.3) bad.push(`${at} wet`);
    const slope = Math.hypot(layout.heightAt(p.x + 1, p.z) - layout.heightAt(p.x - 1, p.z), layout.heightAt(p.x, p.z + 1) - layout.heightAt(p.x, p.z - 1)) / 2;
    if (slope > 0.1) bad.push(`${at} on a slope`);
    if (!onFoot(p.x, p.z)) bad.push(`${at} walled off`);
  }
  return bad;
}

describe("the farm's camp", () => {
  const farm = () => layout.camps.find((c) => c.id === 'farm')!;

  it('holds four bandit thugs at level 1, in the farm clearing', () => {
    const camp = farm();
    expect(camp.level).toBe(1);
    expect(camp.posts.map((p) => `${p.family} ${p.behaviour}`)).toEqual(Array(4).fill('bandit grunt'));
    const clearing = layout.clearings.find((c) => c.id === 'farm')!;
    expect(camp.place).toEqual({ x: clearing.x, z: clearing.z, r: clearing.r });
    for (const p of camp.posts) expect(flat(p, clearing)).toBeLessThan(clearing.r);
  });

  it('stands every post on clear, dry, level ground you can walk to', () => {
    expect(badPosts(farm())).toEqual([]);
  });

  it('spreads the posts 5 to 18 m apart, in two pairs you can pull one at a time', () => {
    const { posts } = farm();
    const { pull } = CONFIG.camps;
    for (const a of posts) {
      const others = posts.filter((b) => b !== a).map((b) => flat(a, b));
      for (const d of others) {
        expect(d).toBeGreaterThanOrEqual(5);
        expect(d).toBeLessThanOrEqual(18);
      }
      // Exactly one other post is within a pull of it: its partner.
      expect(others.filter((d) => d < pull)).toHaveLength(1);
    }
  });

  it('keeps the farm out of reach from the east road until you come into the yard', () => {
    const east = layout.paths.find((p) => p.id === 'east')!;
    const { notice } = CONFIG.camps;
    // Walking the road to its end, you're never within notice of a post before the last few metres.
    const early = east.line.slice(0, -4).filter(([x, z]) => farm().posts.some((p) => Math.hypot(p.x - x, p.z - z) < notice));
    expect(early).toEqual([]);
  });
});

describe("the lumber camp's camp", () => {
  const lumber = () => layout.camps.find((c) => c.id === 'lumberCamp')!;
  const structure = (kind: string) => layout.structures.find((s) => s.kind === kind)!;

  it('holds three thugs, an archer and their leader at level 2, in the camp clearing', () => {
    const camp = lumber();
    expect(camp.level).toBe(2);
    expect(camp.posts.map((p) => `${p.family} ${p.behaviour} ${p.role ?? 'ordinary'}`)).toEqual([
      ...Array(3).fill('bandit grunt ordinary'),
      'bandit archer ordinary',
      'bandit brute leader',
    ]);
    const clearing = layout.clearings.find((c) => c.id === 'camp')!;
    expect(camp.place).toEqual({ x: clearing.x, z: clearing.z, r: clearing.r });
    for (const p of camp.posts) expect(flat(p, clearing)).toBeLessThan(clearing.r);
  });

  it('puts a thug where the camp road comes in, one at the fire, one at the log pile, the archer to the north and the leader before the tent', () => {
    const [road, fire, logs, archer, leader] = lumber().posts;
    const campRoad = layout.paths.find((p) => p.id === 'camp')!.line;
    const [ex, ez] = campRoad[campRoad.length - 1];
    expect(Math.hypot(road.x - ex, road.z - ez)).toBeLessThan(5);
    expect(flat(fire, structure('campfire'))).toBeLessThan(3);
    expect(flat(logs, structure('logpile'))).toBeLessThan(4);
    const clearing = lumber().place;
    expect(clearing.z - archer.z).toBeGreaterThan(5); // north is −z
    // Before the tent's door, and facing out of it.
    const tent = structure('tent');
    const [lx, lz] = worldToLocal(tent, leader.x, leader.z);
    expect(Math.abs(lx)).toBeLessThan(1);
    expect(lz).toBeGreaterThan(TENT.hd);
    expect(lz).toBeLessThan(TENT.hd + 2);
    expect(Math.cos(leader.yaw - tent.yaw)).toBeGreaterThan(0.5);
  });

  it('stands every post on clear, dry, level ground you can walk to', () => {
    expect(badPosts(lumber())).toEqual([]);
  });

  it('spreads the posts 5 to 18 m apart, so no one pull brings the whole camp', () => {
    const { posts } = lumber();
    for (const a of posts) {
      const others = posts.filter((b) => b !== a).map((b) => flat(a, b));
      for (const d of others) {
        expect(d).toBeGreaterThanOrEqual(5);
        expect(d).toBeLessThanOrEqual(18);
      }
      expect(others.filter((d) => d < CONFIG.camps.pull).length).toBeLessThan(posts.length - 1);
    }
  });

  it('sleeps while you walk the main road past it', () => {
    const main = layout.paths.find((p) => p.id === 'main')!;
    const woken = main.line.filter(([x, z]) => lumber().posts.some((p) => Math.hypot(p.x - x, p.z - z) < CONFIG.camps.notice));
    expect(woken).toEqual([]);
  });

  it('has a tent, a log pile and a fire that nothing walks through', () => {
    const tent = structure('tent');
    const r = CONFIG.enemies.grunt.radius;
    for (const [lx, lz] of [[0, 0], [-1.2, 0], [1.2, 0], [0, -1.6], [0, 1.6]]) {
      const [x, z] = localToWorld(tent, lx, lz);
      expect(layout.colliders.blocked(x, z, r), `(${lx}, ${lz}) in the tent`).toBe(true);
    }
    for (const kind of ['logpile', 'campfire']) {
      const s = structure(kind);
      expect(layout.colliders.blocked(s.x, s.z, r)).toBe(true);
    }
  });
});

describe("the leader's orders", () => {
  const orders = () => layout.pickups.find((p) => p.item === 'orders')!;
  const tent = () => layout.structures.find((s) => s.kind === 'tent')!;

  it("lie on the crates just inside the tent's door, at about the height of your hands", () => {
    const o = orders();
    const [lx, lz] = worldToLocal(tent(), o.x, o.z);
    expect(Math.abs(lx)).toBeLessThan(0.2);
    expect(lz).toBeLessThan(TENT.hd);
    expect(lz).toBeGreaterThan(TENT.hd - 0.3);
    // You can't stand where they are: they're on the crates, in the tent.
    expect(layout.colliders.blocked(o.x, o.z, 0)).toBe(true);
    const lift = o.y - layout.heightAt(o.x, o.z);
    expect(lift).toBeGreaterThan(0.8);
    expect(lift).toBeLessThan(1.2);
  });

  it("are in reach from the doorway, walking up to the tent's door", () => {
    const o = orders();
    const r = CONFIG.player.bodyRadius;
    // Walk at the door along the tent's axis until the tent stops you.
    let lz = TENT.hd + 2;
    const p = new Vector3();
    while (lz > 0) {
      const [x, z] = localToWorld(tent(), 0, lz - 0.02);
      if (layout.colliders.resolve(p.set(x, 0, z), r)) break;
      lz -= 0.02;
    }
    const [sx, sz] = localToWorld(tent(), 0, lz);
    expect(onFoot(sx, sz, 0.5)).toBe(true);
    // A hand's reach from your head, which is over your feet.
    expect(Math.hypot(o.x - sx, o.z - sz)).toBeLessThan(0.55);
  });
});

describe('the village respawn point', () => {
  it("stands clear and dry in front of the inn's door, facing the crossroads", () => {
    const { village } = layout.respawns;
    expect(layout.colliders.blocked(village.x, village.z, CONFIG.player.bodyRadius + 0.5)).toBe(false);
    expect(layout.heightAt(village.x, village.z)).toBeGreaterThan(FOREST.water + 0.3);
    expect(onFoot(village.x, village.z)).toBe(true);
    const inn = layout.structures.find((s) => s.kind === 'inn')!;
    const [, lz] = worldToLocal(inn, village.x, village.z);
    expect(lz).toBeGreaterThan(inn.hd); // out past the front wall
    expect(lz).toBeLessThan(inn.hd + 3);
    // Yaw 0 looks down −Z.
    const d = Math.hypot(village.x, village.z);
    const facing = (-Math.sin(village.yaw) * -village.x - Math.cos(village.yaw) * -village.z) / d;
    expect(facing).toBeGreaterThan(0.999);
  });

  it('is in the village, well out of every camp', () => {
    const { village } = layout.respawns;
    for (const camp of layout.camps) {
      expect(Math.hypot(village.x - camp.place.x, village.z - camp.place.z) - camp.place.r).toBeGreaterThan(CONFIG.camps.refillAway);
    }
  });
});
