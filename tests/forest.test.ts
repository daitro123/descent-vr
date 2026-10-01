import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { buildLayout, CHESTS, FOREST, type ForestLayout, HALE, HERBS, localToWorld, MAP_BOARD, POND, SIGNPOSTS, type StructureKind, TENT, VEINS, worldToLocal } from '../src/maps/forest/layout';
import { MINE, minePiece } from '../src/maps/forest/mine';
import type { CampPlan, ChestPlan } from '../src/maps/types';
import { nearestOnPolyline } from '../src/maps/forest/noise';
import { MAPS } from '../src/maps/registry';
import { INN } from '../src/maps/forest/inn';

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
    expect(MAPS.map((m) => m.id)).toEqual(['brackenmoor', 'crypt', 'forest', 'sallows']);
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
  const structure = (kind: StructureKind) => layout.structures.find((s) => s.kind === kind)!;

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
    for (const kind of ['logpile', 'campfire'] as const) {
      const s = structure(kind);
      expect(layout.colliders.blocked(s.x, s.z, r)).toBe(true);
    }
  });
});

describe("the lumber camp's patrol", () => {
  const patrol = () => layout.camps.find((c) => c.id === 'patrol')!;
  /** How far (x, z) is from a line. */
  const off = (line: readonly (readonly [number, number])[], x: number, z: number) => nearestOnPolyline(line, x, z).d;

  it('is two bandit thugs at level 2, walking a road', () => {
    const camp = patrol();
    expect(camp.level).toBe(2);
    expect(camp.posts.map((p) => `${p.family} ${p.behaviour} ${p.role ?? 'ordinary'}`)).toEqual(Array(2).fill('bandit grunt ordinary'));
    expect(camp.road?.length).toBeGreaterThan(1);
  });

  it('walks the camp road, between the main road and the lumber camp, over 10 m of it', () => {
    const road = patrol().road!;
    const camp = layout.paths.find((p) => p.id === 'camp')!.line;
    const main = layout.paths.find((p) => p.id === 'main')!.line;
    for (const p of road) expect(off(camp, p.x, p.z)).toBeLessThan(0.05);
    // One unbroken stretch of it, samples about a metre apart.
    for (let i = 1; i < road.length; i++) expect(flat(road[i], road[i - 1])).toBeLessThan(1.5);
    const [a, b] = [road[0], road.at(-1)!];
    expect(flat(a, b)).toBeGreaterThan(10);
    // It starts at the main road's end and heads for the lumber camp.
    const clearing = layout.clearings.find((c) => c.id === 'camp')!;
    expect(off(main, a.x, a.z)).toBeLessThan(off(main, b.x, b.z));
    expect(flat(b, clearing)).toBeLessThan(flat(a, clearing));
  });

  it('stands in file where its road starts, 1.8 m apart, facing along it', () => {
    const { posts, road } = patrol();
    const [a, b] = posts;
    expect(flat(a, b)).toBeCloseTo(CONFIG.camps.patrol.gap, 5);
    for (const p of posts) {
      expect(off(road!.map((q) => [q.x, q.z] as const), p.x, p.z)).toBeLessThan(0.05);
      expect(flat(p, road![0])).toBeLessThan(CONFIG.camps.patrol.gap + 0.01);
    }
    // Towards the lumber camp, the way it first walks.
    const clearing = layout.clearings.find((c) => c.id === 'camp')!;
    const toCamp = Math.atan2(clearing.x - a.x, clearing.z - a.z);
    expect(Math.cos(a.yaw - toCamp)).toBeGreaterThan(0.9);
  });

  it('keeps to clear ground you can walk', () => {
    for (const p of patrol().road!) {
      expect(layout.colliders.blocked(p.x, p.z, CONFIG.enemies.grunt.radius + 0.3), `(${p.x}, ${p.z})`).toBe(false);
      expect(layout.heightAt(p.x, p.z)).toBeGreaterThan(FOREST.water + 0.3);
      expect(onFoot(p.x, p.z)).toBe(true);
    }
  });

  it("never notices you on the main road, and is out of the lumber camp's notice at the camp's end", () => {
    const main = layout.paths.find((p) => p.id === 'main')!;
    const { notice } = CONFIG.camps;
    const lumber = layout.camps.find((c) => c.id === 'lumberCamp')!;
    for (const p of patrol().road!) {
      // From the main road's near edge, 2 m off its middle.
      expect(off(main.line, p.x, p.z) - main.width / 2).toBeGreaterThanOrEqual(notice);
      for (const q of lumber.posts) expect(flat(p, q)).toBeGreaterThan(notice);
    }
  });
});

describe("the watchtower's camp", () => {
  const tower = () => layout.camps.find((c) => c.id === 'watchtower')!;
  const structure = (kind: StructureKind) => layout.structures.find((s) => s.kind === kind)!;

  it('holds two thugs and an archer at level 2, on the flat top of the tower\'s hill', () => {
    const camp = tower();
    expect(camp.level).toBe(2);
    expect(camp.posts.map((p) => `${p.family} ${p.behaviour}`)).toEqual(['bandit grunt', 'bandit archer', 'bandit grunt']);
    const clearing = layout.clearings.find((c) => c.id === 'towerTop')!;
    expect(camp.place).toEqual({ x: clearing.x, z: clearing.z, r: clearing.r });
    const top = structure('tower');
    for (const p of camp.posts) {
      expect(flat(p, clearing)).toBeLessThan(clearing.r);
      // Up on the hill with the tower, not down its slopes.
      expect(Math.abs(layout.heightAt(p.x, p.z) - top.y)).toBeLessThan(0.3);
    }
  });

  it('puts a thug at the door where the road comes up, facing down it', () => {
    const [door] = tower().posts;
    const road = layout.paths.find((p) => p.id === 'tower')!.line;
    const [ex, ez] = road[road.length - 1];
    expect(Math.hypot(door.x - ex, door.z - ez)).toBeLessThan(2.5);
    const [dx, dz] = road[road.length - 8];
    const downRoad = Math.atan2(dx - door.x, dz - door.z);
    expect(Math.cos(door.yaw - downRoad)).toBeGreaterThan(0.8);
  });

  it('stands every post on clear, dry, level ground you can walk to', () => {
    expect(badPosts(tower())).toEqual([]);
  });

  it('spreads the posts 5 to 18 m apart, so the door and the archer come as a pair', () => {
    const [door, archer, back] = tower().posts;
    const { pull } = CONFIG.camps;
    for (const [a, b] of [[door, archer], [door, back], [archer, back]]) {
      expect(flat(a, b)).toBeGreaterThanOrEqual(5);
      expect(flat(a, b)).toBeLessThanOrEqual(18);
    }
    expect(flat(door, archer)).toBeLessThan(pull);
    expect(flat(door, back)).toBeGreaterThan(pull);
    expect(flat(archer, back)).toBeGreaterThan(pull);
  });
});

describe('the safe places', () => {
  /** How far (x, z) is from the village, the bridge, the pond's shore and the standing stones, whichever is nearest. */
  function fromSafety(x: number, z: number): number {
    const places = ['village', 'pondShore', 'stones'].map((id) => layout.clearings.find((c) => c.id === id)!);
    let d = Math.min(...places.map((c) => Math.hypot(x - c.x, z - c.z) - c.r));
    const { bridge } = layout;
    const [lx, lz] = worldToLocal(bridge, x, z);
    d = Math.min(d, Math.hypot(Math.max(0, Math.abs(lx) - bridge.hw), Math.max(0, Math.abs(lz) - bridge.hd)));
    return d;
  }

  it('have no camp in them, nor a patrol walking through: nothing notices you there', () => {
    const { notice } = CONFIG.camps;
    for (const camp of layout.camps) {
      for (const p of [...camp.posts, ...(camp.road ?? [])]) {
        expect(fromSafety(p.x, p.z), `${camp.id} at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`).toBeGreaterThan(notice);
      }
    }
  });

  it("are Oakvale's every camp: the farm, the lumber camp, the watchtower, the lumber camp's patrol and the mine's undead", () => {
    expect(layout.camps.map((c) => c.id)).toEqual(['farm', 'lumberCamp', 'watchtower', 'patrol', 'mine']);
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

describe("Oakvale's copper veins", () => {
  const at = (kind: StructureKind) => layout.structures.find((s) => s.kind === kind)!;
  const away = (v: { x: number; z: number }, p: { x: number; z: number }) => Math.hypot(v.x - p.x, v.z - p.z);
  /** Where you stand to work it: before its ore, a body's width off its rock. */
  const standBefore = (v: (typeof layout.spots)[number]): [number, number] =>
    localToWorld(v, 0, CONFIG.professions.vein.body + CONFIG.player.bodyRadius + 0.1);

  it('are 8: two by the smithy, two either side of the mine’s front, two in its gallery, one on the watchtower’s hill and one by the standing stones', () => {
    const veins = layout.spots.filter((s) => s.kind === 'copperVein');
    expect(veins.map((v) => `${v.id}, ${v.interior ?? 'outdoors'}`)).toEqual([
      'smithy-east, outdoors',
      'smithy-south, outdoors',
      'mine-ridge-west, outdoors',
      'mine-ridge-east, outdoors',
      'watchtower, outdoors',
      'standing-stones, outdoors',
      'mine-gallery-1, mine',
      'mine-gallery-2, mine',
    ]);
    const [smithyEast, smithySouth, west, east, tower, stones, g1, g2] = veins;
    // Behind the smithy at the village's edge, a short walk from the anvil.
    for (const v of [smithyEast, smithySouth]) expect(away(v, at('smithy'))).toBeLessThan(15);
    for (const v of [west, east]) expect(away(v, layout.places.mine)).toBeLessThan(9);
    expect(away(tower, at('tower'))).toBeLessThan(8);
    expect(away(stones, at('stones'))).toBeLessThan(11);
    // The gallery's two, on its floor, in its part of the mine: the old miners' timbered upper workings.
    for (const v of [g1, g2]) {
      expect(layout.mine.partAt(v.x, v.z)).toBe(MINE.parts.indexOf('gallery'));
      expect(v.y).toBeCloseTo(layout.mine.mouth.y + minePiece('gallery').floor);
    }
    // Each stands on its ground, its ore towards where you'd come at it from.
    for (const v of veins.filter((v) => v.interior === null)) {
      expect(v.y, v.id).toBeCloseTo(layout.heightAt(v.x, v.z));
      const plan = VEINS.outdoors.find((o) => o.id === v.id)!;
      const [fx, fz] = localToWorld(v, 0, 1);
      expect(away({ x: fx, z: fz }, { x: plan.face[0], z: plan.face[1] }), v.id).toBeLessThan(away(v, { x: plan.face[0], z: plan.face[1] }));
    }
  });

  it('stand where you can walk up to their ore, clear of trees, rocks and bushes', () => {
    const r = CONFIG.player.bodyRadius;
    for (const v of layout.spots.filter((s) => s.kind === 'copperVein')) {
      const [sx, sz] = standBefore(v);
      if (v.interior === 'mine') {
        expect(layout.mine.groundAt(sx, sz), v.id).not.toBeNull();
        expect(layout.mine.resolve(new Vector3(sx, 0, sz), r), `${v.id}: standing before it`).toBe(false);
        // Its rock is solid in the mine.
        expect(layout.mine.resolve(new Vector3(v.x + 0.3, 0, v.z), r), v.id).toBe(true);
        continue;
      }
      expect(layout.colliders.resolve(new Vector3(sx, 0, sz), r), `${v.id}: standing before it`).toBe(false);
      expect(onFoot(sx, sz, 0.5), v.id).toBe(true);
      expect(layout.colliders.resolve(new Vector3(v.x + 0.3, 0, v.z), r), `${v.id}: its rock`).toBe(true);
      const growing = layout.plants.filter((p) => p.kind !== 'grass' && p.kind !== 'flower' && away(v, p) < VEINS.clear.plant);
      expect(growing.map((p) => p.kind), v.id).toEqual([]);
    }
  });
});

describe("Oakvale's clumps of herbs", () => {
  const at = (kind: StructureKind) => layout.structures.find((s) => s.kind === kind)!;
  const away = (v: { x: number; z: number }, p: { x: number; z: number }) => Math.hypot(v.x - p.x, v.z - p.z);
  const C = CONFIG.professions.clump;
  const of = (kind: 'hearthleaf' | 'duskcap') => layout.spots.filter((s) => s.kind === kind);

  it('are 8 Hearthleaf and 6 Duskcap, where the gathering spots ticket put them', () => {
    const [west, north, cabbages, road, bridge, pondEast, pondWest, stones] = of('hearthleaf');
    expect(of('hearthleaf').map((c) => `${c.id}, ${c.interior ?? 'outdoors'}`)).toEqual(HERBS.hearthleaf.map((h) => `hearthleaf-${h.id}, outdoors`));
    expect(of('duskcap').map((c) => `${c.id}, ${c.interior ?? 'outdoors'}`)).toEqual([
      ...HERBS.duskcap.map((h) => `duskcap-${h.id}, outdoors`),
      'duskcap-mine-gallery-1, mine',
      'duskcap-mine-gallery-2, mine',
    ]);
    // Three by the farm's fields, among its raiders until they're cleared.
    const raiders = layout.camps.find((c) => c.id === 'farm')!.posts;
    for (const c of [west, north, cabbages]) expect(away(c, { x: 56, z: 36 }), c.id).toBeLessThan(30);
    expect(Math.min(...raiders.map((p) => away(north, p)))).toBeLessThan(8);
    // By the road south, by the bridge, on the pond's shore, and in the meadow by the stones.
    const main = layout.paths.find((p) => p.id === 'main')!;
    expect(Math.min(...main.line.filter(([, z]) => z > 50).map(([x, z]) => away(road, { x, z })))).toBeLessThan(6);
    expect(away(bridge, layout.bridge)).toBeLessThan(8);
    for (const c of [pondEast, pondWest]) expect(away(c, POND), c.id).toBeLessThan(POND.r + 5);
    expect(away(stones, at('stones'))).toBeLessThan(11);
    // Duskcap in the woods west of the main road, round the lumber camp, and in the mine's gallery.
    const [woodsNorth, woodsSouth, campWest, campNorth, g1, g2] = of('duskcap');
    for (const c of [woodsNorth, woodsSouth]) expect(c.x, c.id).toBeLessThan(-25);
    for (const c of [campWest, campNorth]) expect(away(c, at('campfire')), c.id).toBeLessThan(18);
    for (const c of [g1, g2]) {
      expect(layout.mine.partAt(c.x, c.z)).toBe(MINE.parts.indexOf('gallery'));
      expect(c.y).toBeCloseTo(layout.mine.mouth.y + minePiece('gallery').floor);
    }
  });

  it('each stand on dry ground you can walk up to, clear of trees and bushes, and you bump into its rise', () => {
    const r = CONFIG.player.bodyRadius;
    for (const c of [...of('hearthleaf'), ...of('duskcap')]) {
      // Somewhere round it a body's width off its rise, you can stand to cut it.
      const round = Array.from({ length: 12 }, (_, k) => {
        const a = (k / 12) * Math.PI * 2;
        const d = C.body + r + 0.15;
        return [c.x + Math.sin(a) * d, c.z + Math.cos(a) * d] as const;
      });
      if (c.interior === 'mine') {
        expect(round.some(([x, z]) => layout.mine.groundAt(x, z) !== null && !layout.mine.resolve(new Vector3(x, 0, z), r)), c.id).toBe(true);
        expect(layout.mine.resolve(new Vector3(c.x + 0.2, 0, c.z), r), c.id).toBe(true);
        continue;
      }
      expect(c.y, c.id).toBeCloseTo(layout.heightAt(c.x, c.z));
      expect(c.y - FOREST.water, `${c.id}: out of the water`).toBeGreaterThan(0.5);
      expect(round.filter(([x, z]) => !layout.colliders.resolve(new Vector3(x, 0, z), r) && onFoot(x, z)).length, c.id).toBeGreaterThanOrEqual(6);
      expect(layout.colliders.resolve(new Vector3(c.x + 0.2, 0, c.z), r), `${c.id}: its rise`).toBe(true);
      const growing = layout.plants.filter((p) => p.kind !== 'grass' && p.kind !== 'flower' && away(c, p) < C.clear.plant);
      expect(growing.map((p) => p.kind), c.id).toEqual([]);
    }
  });
});

describe("Oakvale's chests", () => {
  const chest = (id: string) => layout.chests.find((c) => c.id === id)!;
  const size = (c: ChestPlan) => CONFIG.chests.looks[c.look];
  /** Where you stand to lift its lid: before its front, a body's width off it, facing it. */
  const standBefore = (c: ChestPlan): [number, number] => localToWorld(c, 0, size(c).d / 2 + CONFIG.player.bodyRadius + 0.05);
  /** The distance over the floor plane from (x, z) to the chest's footprint. */
  const offFoot = (c: ChestPlan, x: number, z: number) => {
    const [lx, lz] = worldToLocal(c, x, z);
    const { w, d } = size(c);
    return Math.hypot(Math.max(0, Math.abs(lx) - w / 2), Math.max(0, Math.abs(lz) - d / 2));
  };

  it('stand at the top of the watchtower and in the leader\'s tent (level 2), and the bandits\' strongbox in the dig (level 4)', () => {
    expect(layout.chests.map((c) => `${c.id}: ${c.look}, level ${c.level}, ${c.interior ?? 'outdoors'}`)).toEqual([
      'oakvale-watchtower: chest, level 2, outdoors',
      'oakvale-leaders-tent: chest, level 2, outdoors',
      'oakvale-strongbox: strongbox, level 4, mine',
    ]);
    // On the tower's hilltop, its back to the tower's wall and facing away from it.
    const tower = layout.structures.find((s) => s.kind === 'tower')!;
    const top = chest(CHESTS.watchtower.id);
    const [lx, lz] = worldToLocal(tower, top.x, top.z);
    expect(Math.hypot(lx, lz)).toBeLessThan(4.5);
    expect(Math.abs(top.y - tower.y)).toBeLessThan(0.05);
    const [fx, fz] = localToWorld(top, 0, 1);
    expect(Math.hypot(fx - tower.x, fz - tower.z)).toBeGreaterThan(Math.hypot(top.x - tower.x, top.z - tower.z) + 0.9);
    // In the tent, beside the crates, its front on the door's line.
    const tent = layout.structures.find((s) => s.kind === 'tent')!;
    const inTent = chest(CHESTS.tent.id);
    const [tx, tz] = worldToLocal(tent, inTent.x, inTent.z);
    expect(Math.abs(tx)).toBeGreaterThan(TENT.crates.half + size(inTent).w / 2);
    expect(Math.abs(tx) + size(inTent).w / 2).toBeLessThan(TENT.hw - 0.4);
    expect(tz + size(inTent).d / 2).toBeLessThan(TENT.hd);
    expect(tz + size(inTent).d / 2).toBeGreaterThan(TENT.hd - 0.05);
    expect(Math.cos(inTent.yaw - tent.yaw)).toBeCloseTo(1);
    // The bandits' strongbox, on the dig's floor.
    const box = chest('oakvale-strongbox');
    const [mx, mz] = worldToLocal(layout.mine.mouth, box.x, box.z);
    const { strongbox } = MINE.dig;
    expect(mx).toBeCloseTo((strongbox.x0 + strongbox.x1) / 2);
    expect(mz).toBeCloseTo((strongbox.z0 + strongbox.z1) / 2);
    expect(box.y).toBeCloseTo(layout.mine.mouth.y + minePiece('dig').floor);
    expect(size(box).w).toBeCloseTo(strongbox.x1 - strongbox.x0);
    expect(size(box).d).toBeCloseTo(strongbox.z1 - strongbox.z0);
  });

  it("stay clear of every camp's posts and of the leader's orders", () => {
    for (const c of layout.chests) {
      for (const camp of layout.camps) {
        for (const p of camp.posts) expect(offFoot(c, p.x, p.z), `${c.id} and ${camp.id}'s ${p.behaviour} at (${p.x}, ${p.z})`).toBeGreaterThan(1);
      }
    }
    const orders = layout.pickups.find((p) => p.item === 'orders')!;
    const inTent = chest(CHESTS.tent.id);
    // Reaching for the orders doesn't lift the lid, nor the lid the orders.
    expect(offFoot(inTent, orders.x, orders.z)).toBeGreaterThan(CONFIG.chests.reach + CONFIG.orb.pickupRadius);
    expect(orders.y - inTent.y).toBeGreaterThan(size(inTent).h + size(inTent).lid + CONFIG.chests.reach);
  });

  it('stand where you can walk up to them, their lids in reach of a hand from where you stand', () => {
    const r = CONFIG.player.bodyRadius;
    for (const c of layout.chests) {
      const [sx, sz] = standBefore(c);
      if (c.interior === 'mine') {
        expect(layout.mine.groundAt(sx, sz), c.id).not.toBeNull();
        expect(layout.mine.resolve(new Vector3(sx, 0, sz), r), `${c.id}: standing before it`).toBe(false);
      } else {
        expect(layout.colliders.resolve(new Vector3(sx, 0, sz), r), `${c.id}: standing before it`).toBe(false);
        expect(onFoot(sx, sz, 0.5), c.id).toBe(true);
      }
      // A hand's reach from your head, which is over your feet, to the lid's front.
      expect(offFoot(c, sx, sz), c.id).toBeLessThan(0.55);
      // You can't walk into it: its footprint's middle is blocked.
      const blocked = c.interior === 'mine' ? layout.mine.resolve(new Vector3(c.x, 0, c.z), 0.05) : layout.colliders.blocked(c.x, c.z, 0);
      expect(blocked, `${c.id} is solid`).toBe(true);
    }
  });

  it("let what's inside come out beside them, on open ground but out of your feet's way as you stand to open them", () => {
    const { ring, size: item } = CONFIG.loot;
    for (const c of layout.chests) {
      const { drop } = c;
      const [sx, sz] = standBefore(c);
      expect(Math.hypot(drop.x - sx, drop.z - sz) - ring - item / 2, `${c.id}: out of your feet's way`).toBeGreaterThan(CONFIG.orb.walkRadius);
      expect(offFoot(c, drop.x, drop.z), `${c.id}: at the chest`).toBeLessThan(2.5);
      expect(offFoot(c, drop.x, drop.z), `${c.id}: clear of it`).toBeGreaterThan(ring);
      if (c.interior === 'mine') {
        expect(drop.y).toBeCloseTo(c.y);
        expect(layout.mine.resolve(new Vector3(drop.x, 0, drop.z), r0), `${c.id}: its drop on open floor`).toBe(false);
      } else {
        expect(drop.y).toBeCloseTo(layout.heightAt(drop.x, drop.z));
        expect(layout.colliders.resolve(new Vector3(drop.x, 0, drop.z), r0), `${c.id}: its drop on open ground`).toBe(false);
        expect(onFoot(drop.x, drop.z, 0.5), c.id).toBe(true);
      }
    }
  });
});

/** Room round a drop's pouch for you to walk up to it. */
const r0 = CONFIG.player.bodyRadius;

describe('the village respawn point', () => {
  it("is by the inn's hearth, inside with the door shut, standing clear and facing the door", () => {
    const { village } = layout.respawns;
    expect(village.interior).toBe('inn');
    const inn = layout.structures.find((s) => s.kind === 'inn')!;
    const [lx, lz] = worldToLocal(inn, village.x, village.z);
    expect(Math.abs(lx - INN.wake.x) + Math.abs(lz - INN.wake.z)).toBeLessThan(1e-9);
    // Well in past the door's line, where the door shuts behind you.
    expect(inn.hd - lz).toBeGreaterThan(CONFIG.interiors.shut + 1);
    // An arm's length from the hearth, which is against the right wall.
    const hearthFront = INN.room.hw - INN.hearth.depth;
    expect(hearthFront - lx).toBeGreaterThan(CONFIG.player.bodyRadius);
    expect(hearthFront - lx).toBeLessThan(1.5);
    expect(Math.abs(lz - INN.hearth.z)).toBeLessThan(INN.hearth.width / 2);
    // Nothing of the taproom's in the way. Yaw 0 looks down −Z, turned with the inn.
    const [innInterior] = layout.interiors;
    expect(innInterior.resolve(new Vector3(village.x, 0, village.z), CONFIG.player.bodyRadius + 0.3)).toBe(false);
    const [dx, dz] = localToWorld(inn, 0, inn.hd);
    const d = Math.hypot(dx - village.x, dz - village.z);
    const facing = (-Math.sin(village.yaw) * (dx - village.x) - Math.cos(village.yaw) * (dz - village.z)) / d;
    expect(facing).toBeGreaterThan(0.999);
  });

  it('is in the village, well out of every camp', () => {
    const { village } = layout.respawns;
    for (const camp of layout.camps) {
      expect(Math.hypot(village.x - camp.place.x, village.z - camp.place.z) - camp.place.r).toBeGreaterThan(CONFIG.camps.refillAway);
    }
  });
});

describe('finding the way', () => {
  const signposts = () => layout.structures.filter((s) => s.kind === 'signpost');
  const onRoad = (x: number, z: number) => layout.roadDistance.at(x, z) < 0.2;
  /** Is (x, z) off every road, the whole footprint of `s` round it? */
  const offRoads = (s: { x: number; z: number; yaw: number; hw: number; hd: number }) => {
    for (let u = -1; u <= 1; u += 0.25) for (let v = -1; v <= 1; v += 0.25) if (onRoad(...localToWorld(s, u * s.hw, v * s.hd))) return false;
    return true;
  };
  const main = () => layout.paths.find((p) => p.id === 'main')!;
  const leaves = (id: string) => layout.paths.find((p) => p.id === id)!.line[0];

  it("names the crossroads signpost's roads: Old Mine and Lumber Camp north, Farm east, Pond west, Brackenmoor south", () => {
    const [crossroads] = signposts();
    expect(Math.hypot(crossroads.x, crossroads.z)).toBeLessThan(7);
    const way = (a: number) => (Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) < 0 ? 'north' : 'south') : Math.sin(a) > 0 ? 'east' : 'west');
    expect(SIGNPOSTS[crossroads.variant].boards.map((b) => [b.name, way(b.a)])).toEqual([
      ['Old Mine', 'north'],
      ['Lumber Camp', 'north'],
      ['Farm', 'east'],
      ['Pond', 'west'],
      ['Brackenmoor', 'south'],
    ]);
  });

  it('stands a second, smaller signpost north of the bridge, between where the watchtower and lumber camp roads leave the main road, off every road', () => {
    const posts = signposts();
    expect(posts).toHaveLength(2);
    const fork = posts[1];
    const [crossroads] = posts;
    expect(SIGNPOSTS[fork.variant].post).toBeLessThan(SIGNPOSTS[crossroads.variant].post);
    expect(SIGNPOSTS[fork.variant].length).toBeLessThan(SIGNPOSTS[crossroads.variant].length);
    expect(fork.z).toBeLessThan(layout.bridge.z - layout.bridge.hd);
    const [, towerZ] = leaves('tower');
    const [, campZ] = leaves('camp');
    expect(fork.z).toBeLessThan(towerZ);
    expect(fork.z).toBeGreaterThan(campZ);
    expect(offRoads(fork)).toBe(true);
    // Beside the main road, where you'd see it walking up it.
    const { d } = nearestOnPolyline(main().line, fork.x, fork.z);
    expect(d - main().width / 2).toBeLessThan(2.5);
    expect(SIGNPOSTS[fork.variant].boards.map((b) => b.name)).toEqual(['Old Mine', 'Lumber Camp', 'Watchtower', 'Village']);
    // Each board points down its road as it leaves: the watchtower's east, the lumber camp's west, the mine's north, the village's south.
    const along = (id: string, name: string) => {
      const b = SIGNPOSTS[fork.variant].boards.find((b) => b.name === name)!;
      const [x0, z0] = leaves(id);
      const [x1, z1] = layout.paths.find((p) => p.id === id)!.line[8];
      return Math.sin(b.a) * (x1 - x0) + Math.cos(b.a) * (z1 - z0) > 0.9 * Math.hypot(x1 - x0, z1 - z0);
    };
    expect(along('tower', 'Watchtower')).toBe(true);
    expect(along('camp', 'Lumber Camp')).toBe(true);
    const north = SIGNPOSTS[fork.variant].boards.find((b) => b.name === 'Old Mine')!;
    const south = SIGNPOSTS[fork.variant].boards.find((b) => b.name === 'Village')!;
    expect(Math.cos(north.a)).toBeLessThan(-0.9);
    expect(Math.cos(south.a)).toBeGreaterThan(0.9);
  });

  it('keeps every board of both signposts clear of the rest, one above another, under the post\'s top', () => {
    for (const plan of SIGNPOSTS) {
      const ys = plan.boards.map((b) => b.y).sort((a, b) => b - a);
      for (let i = 1; i < ys.length; i++) expect(ys[i - 1] - ys[i]).toBeGreaterThanOrEqual(plan.height + 0.04);
      expect(ys[0] + plan.height / 2).toBeLessThan(plan.post);
    }
  });

  it('stands the map board about 2.5 m east of the crossroads signpost, south of the farm road, facing west over the crossroads, off the roads', () => {
    const [crossroads] = signposts();
    const board = layout.structures.find((s) => s.kind === 'mapboard')!;
    expect(board.x - crossroads.x).toBeCloseTo(2.5, 0);
    expect(Math.abs(board.z - crossroads.z)).toBeLessThan(0.5);
    const east = layout.paths.find((p) => p.id === 'east')!;
    const { i, t } = nearestOnPolyline(east.line, board.x, board.z);
    const roadZ = east.line[i][1] + (east.line[i + 1][1] - east.line[i][1]) * t;
    expect(board.z).toBeGreaterThan(roadZ);
    // Its face (+Z) looks west.
    expect(Math.sin(board.yaw)).toBeCloseTo(-1, 6);
    expect(offRoads(board)).toBe(true);
    expect(layout.colliders.blocked(board.x, board.z, 0.1)).toBe(true);
    // Across the signpost from Hale, so it never overlaps their board.
    expect(board.x).toBeGreaterThan(crossroads.x);
    expect(HALE.x).toBeLessThan(crossroads.x);
  });

  it('is about 1.2 by 0.9 m, its top a little below eye height, and shows the whole zone you can walk', () => {
    expect([MAP_BOARD.w, MAP_BOARD.h]).toEqual([1.2, 0.9]);
    expect(MAP_BOARD.top).toBeGreaterThan(1.3);
    expect(MAP_BOARD.top).toBeLessThan(1.6);
    const { minX, maxX, minZ, maxZ } = MAP_BOARD.shows;
    for (const s of layout.structures) {
      if (Math.abs(s.x) > FOREST.play || Math.abs(s.z) > FOREST.play) continue;
      expect(s.x).toBeGreaterThan(minX);
      expect(s.x).toBeLessThan(maxX);
      expect(s.z).toBeGreaterThan(minZ);
      expect(s.z).toBeLessThan(maxZ);
    }
  });

  it('sends each quest to its camp: the farm, the lumber camp, and the old mine\'s mouth with its front', () => {
    const { places } = layout;
    const camp = (id: string) => layout.camps.find((c) => c.id === id)!.place;
    expect(places.farm.clearing).toEqual(camp('farm'));
    expect(places.lumberCamp.clearing).toEqual(camp('lumberCamp'));
    const front = layout.clearings.find((c) => c.id === 'mineFront')!;
    expect(places.mine.clearing).toEqual({ x: front.x, z: front.z, r: front.r });
    // It points at the mouth, inside the front.
    const mine = layout.structures.find((s) => s.kind === 'mine')!;
    expect(Math.abs(places.mine.x - mine.x)).toBeLessThan(0.5);
    expect(places.mine.z).toBeGreaterThan(mine.z);
    expect(Math.hypot(places.mine.x - front.x, places.mine.z - front.z)).toBeLessThan(front.r);
    // You start out of every place.
    for (const p of Object.values(places)) expect(Math.hypot(layout.spawn.x - p.clearing.x, layout.spawn.z - p.clearing.z)).toBeGreaterThan(p.clearing.r);
  });

  it("raises smoke from the inn's two chimneys, the two cottages that have one, the smithy's forge and the lumber camp's fire, not the farmhouse", () => {
    const from = layout.smoke.map((p) => {
      const s = layout.structures.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a));
      return `${s.kind}${s.kind === 'house' ? s.variant : ''}${p.fire ? ' fire' : ''}`;
    });
    expect(from.sort()).toEqual(['campfire fire', 'house0', 'house2', 'inn', 'inn', 'smithy']);
    // Each rises from its chimney's top, over the roof, and the fire's from the fire.
    for (const p of layout.smoke) {
      const ground = layout.heightAt(p.x, p.z);
      if (p.fire) expect(p.y - ground).toBeLessThan(1);
      else expect(p.y - ground).toBeGreaterThan(5);
    }
  });
});
