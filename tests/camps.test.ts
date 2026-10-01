import { Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../src/config';
import { type Camp, type CampHooks, Camps, type You } from '../src/enemies/camps';
import { mulberry32 } from '../src/maps/forest/noise';
import type { CampId, CampPlan, PostPlan } from '../src/maps/types';
import type { Ground } from '../src/world/ground';

// Camps drive real enemies (their rigs, steering and attack timelines)
// through `EnemyContext`, against a simulated player who walks about on a
// test hillside. The tests check what a player would notice: who's fighting
// you, who's walking home, their health, where they stand.

const DT = 1 / 72;
const C = CONFIG.camps;

/** A hillside rising 0.1 m per metre east, with nothing on it. */
const hill: Ground = {
  heightAt: (x) => 0.1 * x,
  resolve: () => false,
  lineOfSight: () => true,
  steer: () => {},
  arrowStops: () => false,
};

/** Enemy blows and arrows land nowhere: these tests are about who fights, not who wins. */
const hooks: CampHooks = { sweep: () => null, slam: () => {}, shoot: () => {}, nock: () => {}, telegraph: () => {} };

const thug = (x: number, z: number): PostPlan => ({ behaviour: 'grunt', family: 'bandit', x, z, yaw: 0 });
const archer = (x: number, z: number): PostPlan => ({ behaviour: 'archer', family: 'bandit', x, z, yaw: 0 });

function camp(id: CampId, posts: PostPlan[], r = 8): CampPlan {
  const x = posts.reduce((s, p) => s + p.x, 0) / posts.length;
  const z = posts.reduce((s, p) => s + p.z, 0) / posts.length;
  return { id, place: { x, z, r }, level: 1, posts };
}

/** A world of camps and you in it, on the hill (or `ground`). */
function world(plans: CampPlan[], x: number, z: number, ground = hill) {
  const kills: string[] = [];
  const camps = new Camps(plans, ground, hooks, { onKill: (c) => kills.push(c.plan.id) });
  const you: You = { feet: new Vector3(), head: new Vector3(), sword: null, alive: true, interior: null };
  const stand = (nx: number, nz: number) => {
    you.feet.set(nx, hill.heightAt(nx, nz), nz);
    you.head.copy(you.feet).setY(you.feet.y + 1.6);
  };
  stand(x, z);
  const step = (seconds: number, each?: () => void) => {
    for (let t = 0; t < seconds - 1e-9; t += DT) {
      each?.();
      camps.update(DT, you);
    }
  };
  // Let everyone settle at their posts.
  step(2);
  return { camps, you, stand, step, kills };
}

const minds = (c: Camp) => c.members.map((m) => m.mind);
const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const hit = (c: Camp, i: number, damage = 5) => c.members[i].enemy.takeHit(damage, new Vector3());

beforeEach(() => {
  vi.spyOn(Math, 'random').mockImplementation(mulberry32(7));
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('pulling', () => {
  it('an idle member fights you once you come within 8 m, bringing its camp within 10 m of it', () => {
    // In a line north to south, 8 m apart: the southern two are within a pull of each other.
    const { camps, stand, step } = world([camp('farm', [thug(0, -4), thug(0, 4), thug(0, 12)])], 0, 30);
    const [farm] = camps.camps;
    expect(minds(farm)).toEqual(['idle', 'idle', 'idle']);
    // Walk in from the south: at 8.5 m from the nearest, nobody stirs.
    stand(0, 12 + C.notice + 0.5);
    step(0.5);
    expect(minds(farm)).toEqual(['idle', 'idle', 'idle']);
    expect(camps.fighting).toBe(false);
    // A step closer: the nearest comes, and brings the one 8 m behind it but not the one 16 m behind.
    stand(0, 12 + C.notice - 0.5);
    step(DT);
    expect(minds(farm)).toEqual(['idle', 'fight', 'fight']);
    expect(camps.fighting).toBe(true);
  });

  it('a member you hurt fights you from anywhere, bringing its camp within 10 m of it', () => {
    const { camps, step } = world([camp('farm', [thug(0, -4), thug(0, 4), thug(0, 12)])], 0, 60);
    const [farm] = camps.camps;
    hit(farm, 0);
    step(DT);
    expect(minds(farm)).toEqual(['fight', 'fight', 'idle']);
  });

  it("brings only its own camp, however close another camp's members stand", () => {
    const { camps, step } = world([camp('farm', [thug(0, 0), thug(0, 6)]), camp('watchtower', [thug(4, 0)])], 0, 60);
    const [farm, mill] = camps.camps;
    hit(farm, 0);
    step(DT);
    expect(minds(farm)).toEqual(['fight', 'fight']);
    expect(minds(mill)).toEqual(['idle']);
  });
});

describe('chasing', () => {
  it('runs at your walking pace when well out of reach, so walking away never loses it', () => {
    const { camps, stand, step } = world([camp('farm', [thug(0, 0)])], 0, 60);
    const [farm] = camps.camps;
    hit(farm, 0);
    step(DT);
    // You walk off north at 2.2 m/s from 7 m away; it keeps up.
    const enemy = farm.members[0].enemy;
    let z = enemy.position.z - 7;
    stand(0, z);
    step(1, () => stand(0, (z -= CONFIG.player.moveSpeed * DT)));
    const from = enemy.position.clone();
    step(2, () => stand(0, (z -= CONFIG.player.moveSpeed * DT)));
    expect(flat(enemy.position, from) / 2).toBeCloseTo(C.chaseSpeed, 1);
    expect(flat(enemy.position, { x: 0, z })).toBeLessThan(8);
  });

  it('walks, not runs, once it is close', () => {
    const { camps, stand, step } = world([camp('farm', [thug(0, 0)])], 0, 60);
    const [farm] = camps.camps;
    const enemy = farm.members[0].enemy;
    stand(0, -3.5);
    step(DT);
    expect(minds(farm)).toEqual(['fight']);
    const from = enemy.position.clone();
    step(0.25);
    expect(flat(enemy.position, from) / 0.25).toBeLessThanOrEqual(CONFIG.enemies.grunt.speed + 1e-6);
  });
});

describe('the leash', () => {
  it('gives up 30 m from its post, walks home untouchable, and heals to full there', () => {
    const { camps, stand, step } = world([camp('farm', [thug(0, 0)])], 0, 60);
    const [farm] = camps.camps;
    const member = farm.members[0];
    const enemy = member.enemy;
    hit(farm, 0, 20);
    step(DT);
    expect(enemy.hp).toBe(enemy.maxHp - 20);
    // Lead it off north at a run it can't quite match, until it gives up.
    let z = -5;
    let gaveUpAt: number | null = null;
    step(30, () => {
      stand(0, (z -= 2.4 * DT));
      if (gaveUpAt === null && member.mind === 'home') gaveUpAt = flat(enemy.position, member.post);
    });
    expect(gaveUpAt).not.toBeNull();
    // (Measured after its first step back.)
    expect(gaveUpAt!).toBeGreaterThan(C.leash - 0.1);
    expect(gaveUpAt!).toBeLessThan(C.leash + 0.1);
    // Home by now, and whole again.
    expect(member.mind).toBe('idle');
    expect(flat(enemy.position, member.post)).toBeLessThan(C.home);
    expect(enemy.hp).toBe(enemy.maxHp);
    expect(camps.fighting).toBe(false);
  });

  it("can't be hurt on the way home, and doesn't turn on you", () => {
    const { camps, stand, step } = world([camp('farm', [thug(0, 0)])], 0, 60);
    const [farm] = camps.camps;
    const member = farm.members[0];
    const enemy = member.enemy;
    hit(farm, 0, 20);
    let z = -5;
    for (let t = 0; t < 30 && member.mind !== 'home'; t += DT) step(DT, () => stand(0, (z -= 2.4 * DT)));
    // It has given up; walk after it and hit it as it goes.
    stand(enemy.position.x, enemy.position.z - 2);
    step(0.5);
    expect(member.mind).toBe('home');
    const hp = enemy.hp;
    expect(enemy.hittable).toBe(false);
    expect(enemy.takeHit(30, new Vector3())).toBe(false);
    expect(enemy.hp).toBe(hp);
    // Walking right beside it doesn't pull it back into the fight either.
    step(0.5, () => stand(enemy.position.x + 2, enemy.position.z));
    expect(member.mind).toBe('home');
  });
});

describe('going indoors', () => {
  it('sends everyone fighting you home as you go in, and nobody notices or comes for you in there', () => {
    // A building or the mine: their ground and walls are yours alone, so no camp outdoors follows you in.
    const { camps, you, stand, step } = world([camp('farm', [thug(0, 0), thug(0, 5)])], 0, 60);
    const [farm] = camps.camps;
    hit(farm, 0);
    step(DT);
    expect(minds(farm)).toEqual(['fight', 'fight']);
    step(1);
    you.interior = 'inn';
    step(DT);
    expect(minds(farm)).toEqual(['home', 'home']);
    step(10);
    expect(minds(farm)).toEqual(['idle', 'idle']);
    // Standing right beside one, or hurting it, stirs nobody while you're in.
    stand(0, 1.5);
    hit(farm, 1);
    step(1);
    expect(minds(farm)).toEqual(['idle', 'idle']);
    // Out again, and the nearest notices you.
    you.interior = null;
    step(DT);
    expect(camps.fighting).toBe(true);
  });
});

describe('dying', () => {
  it('sends everyone fighting you home, and nobody notices you while you lie there', () => {
    const { camps, you, step } = world([camp('farm', [thug(0, 0), thug(0, 5)])], 0, 60);
    const [farm] = camps.camps;
    hit(farm, 0);
    step(DT);
    expect(minds(farm)).toEqual(['fight', 'fight']);
    step(3);
    you.alive = false;
    step(DT);
    expect(minds(farm)).toEqual(['home', 'home']);
    expect(camps.fighting).toBe(false);
    step(10);
    expect(minds(farm)).toEqual(['idle', 'idle']);
    for (const m of farm.members) expect(flat(m.enemy.position, m.post)).toBeLessThan(C.home);
  });
});

describe('kills and refilling', () => {
  it('reports each kill with its camp', () => {
    const { camps, step, kills } = world([camp('farm', [thug(0, 0)]), camp('watchtower', [thug(30, 0)])], 0, 60);
    const [farm, mill] = camps.camps;
    hit(mill, 0, 999);
    step(DT);
    hit(farm, 0, 999);
    step(DT);
    expect(kills).toEqual(['watchtower', 'farm']);
    expect(minds(farm)).toEqual(['dead']);
  });

  it('refills whole 3 minutes after the last falls, only once you are 30 m from its clearing', () => {
    // A camp whose clearing reaches 8 m round its middle, (0, 3).
    const { camps, stand, step } = world([camp('farm', [thug(0, 0), thug(0, 6)])], 0, 60);
    const [farm] = camps.camps;
    const edge = 3 + 8; // the clearing's southern edge
    hit(farm, 0, 999);
    // One still stands: however long you wait, nobody comes back.
    stand(0, edge + 40);
    step(C.refillTime + 10);
    expect(minds(farm)).toEqual(['dead', 'idle']);
    // Cleared: you wait just inside 30 m of the clearing.
    hit(farm, 1, 999);
    stand(0, edge + C.refillAway - 1);
    step(C.refillTime + 5);
    expect(minds(farm)).toEqual(['dead', 'dead']);
    // Step back past 30 m and it fills.
    stand(0, edge + C.refillAway + 1);
    step(DT);
    expect(minds(farm)).toEqual(['idle', 'idle']);
    step(2); // they settle at their posts
    for (const m of farm.members) {
      expect(m.enemy.alive).toBe(true);
      expect(m.enemy.hp).toBe(m.enemy.maxHp);
      expect(flat(m.enemy.position, m.post)).toBeLessThan(C.home);
    }
  });

  it("doesn't refill before 3 minutes are up, however far away you are", () => {
    const { camps, step } = world([camp('farm', [thug(0, 0)])], 0, 200);
    const [farm] = camps.camps;
    hit(farm, 0, 999);
    step(C.refillTime - 1);
    expect(minds(farm)).toEqual(['dead']);
    step(1.1);
    expect(minds(farm)).toEqual(['idle']);
  });
});

describe('the pools', () => {
  it('lets three swing and two shoot at once, across every camp you pull', () => {
    // Two camps flanking you, each with two thugs and an archer.
    const { camps, step } = world(
      [camp('lumberCamp', [thug(-4, -1), thug(-4, 1), archer(-8, 0)]), camp('watchtower', [thug(4, -1), thug(4, 1), archer(8, 0)])],
      0,
      0,
    );
    let swing = 0;
    let shoot = 0;
    step(20, () => {
      swing = Math.max(swing, camps.meleeTokens.inUse);
      shoot = Math.max(shoot, camps.rangedTokens.inUse);
    });
    expect(minds(camps.camps[0])).toEqual(['fight', 'fight', 'fight']);
    expect(minds(camps.camps[1])).toEqual(['fight', 'fight', 'fight']);
    expect(swing).toBe(3);
    expect(shoot).toBe(2);
  });
});

describe('camp enemies', () => {
  it('have 1.4 times the health and damage of the same behaviour in the arena at level 1', () => {
    const { camps } = world([camp('farm', [thug(0, 0), archer(5, 0), { ...thug(10, 0), behaviour: 'brute' }])], 0, 60);
    const [grunt, bowman, brute] = camps.camps[0].members.map((m) => m.enemy);
    expect(grunt.maxHp).toBe(63); // 45
    expect(grunt.def.attacks.map((a) => a.damage)).toEqual([20, 17, 17]); // 14, 12, 12
    expect(bowman.maxHp).toBe(39); // 28
    expect(bowman.def.attacks[0].damage).toBe(14); // 10
    expect(brute.maxHp).toBe(238); // 170
    expect(brute.def.attacks.map((a) => a.damage)).toEqual([31, 42]); // 22, 30
  });

  it("take their camp's level on top: a level-2 camp's are 1.2 times stronger again", () => {
    const { camps } = world([{ ...camp('lumberCamp', [thug(0, 0), archer(5, 0)]), level: 2 }], 0, 60);
    const [grunt, bowman] = camps.camps[0].members.map((m) => m.enemy);
    expect([grunt.level, bowman.level]).toEqual([2, 2]);
    expect(grunt.maxHp).toBe(76); // 45 × 1.2 × 1.4 = 75.6
    expect(grunt.def.attacks.map((a) => a.damage)).toEqual([24, 20, 20]);
    expect(bowman.maxHp).toBe(47); // 28 × 1.68 = 47.04
    expect(bowman.def.attacks[0].damage).toBe(17); // 10 × 1.68
  });

  it("stand and chase at the ground's real height", () => {
    const { camps, stand, step } = world([camp('farm', [thug(10, 0)])], 30, 0);
    const enemy = camps.camps[0].members[0].enemy;
    expect(enemy.position.y).toBeCloseTo(hill.heightAt(10, 0));
    stand(17, 0);
    step(3);
    expect(enemy.position.x).toBeGreaterThan(12);
    expect(enemy.position.y).toBeCloseTo(hill.heightAt(enemy.position.x, enemy.position.z));
  });
});

describe('getting home', () => {
  it("is put back at its post, whole, if it can't find its way there, once you're well away from it", () => {
    // Once it has given up, a wall no body can pass goes up between it and home.
    let walled = false;
    const ground: Ground = {
      ...hill,
      // A slab from z = −10 to −8, as wide as the world.
      resolve: (p) => {
        if (!walled || p.z <= -10 || p.z >= -8) return false;
        p.z = p.z < -9 ? -10 : -8;
        return true;
      },
    };
    const { camps, stand, step } = world([camp('farm', [thug(0, 0)])], 0, -5, ground);
    const [farm] = camps.camps;
    const member = farm.members[0];
    hit(farm, 0, 20);
    let z = -5;
    for (let t = 0; t < 30 && member.mind !== 'home'; t += DT) step(DT, () => stand(0, (z -= 2.4 * DT)));
    expect(member.mind).toBe('home');
    // It walks up to the wall, some 20 m on, and stops there.
    walled = true;
    step(10);
    expect(member.mind).toBe('home');
    expect(member.enemy.position.z).toBeCloseTo(-10, 0);
    // Stand by it at the wall: it stays stuck there in front of you.
    stand(2, -12);
    step(C.stuck.time + 0.5);
    expect(member.mind).toBe('home');
    expect(member.enemy.position.z).toBeCloseTo(-10, 0);
    // Walk off, and it's gone home.
    stand(2, -12 - C.stuck.away - 1);
    step(DT);
    expect(member.mind).toBe('idle');
    expect(flat(member.enemy.position, member.post)).toBeLessThan(C.home);
    expect(member.enemy.hp).toBe(member.enemy.maxHp);
  });
});

describe('the patrol', () => {
  const P = C.patrol;
  /** Two thugs walking a straight road 20 m north from (0, 0), level along the hill. */
  const ROAD = [
    { x: 0, z: 0 },
    { x: 0, z: -20 },
  ];
  function patrol(road = ROAD, place = { x: 0, z: -10, r: 10 }): CampPlan {
    return { id: 'patrol', place, level: 2, posts: [thug(0, 0), thug(0, 0)], road };
  }
  const along = (p: { z: number }) => -p.z;

  it('walks its road in single file at 0.8 m/s, 1.8 m apart, each on the road and facing the way it walks', () => {
    const { camps, step } = world([patrol()], 60, -10);
    const [walkers] = camps.camps;
    const [a, b] = walkers.members.map((m) => m.enemy);
    const from = [along(a.position), along(b.position)];
    step(5);
    for (const [i, e] of [a, b].entries()) {
      expect((along(e.position) - from[i]) / 5).toBeCloseTo(P.speed, 1);
      expect(Math.abs(e.position.x)).toBeLessThan(0.1);
      // Facing north (−z), the way it walks.
      expect(-Math.cos(e.root.rotation.y)).toBeGreaterThan(0.95);
    }
    // The second of the pair leads; the first follows in its steps.
    expect(along(b.position) - along(a.position)).toBeCloseTo(P.gap, 0);
    expect(minds(walkers)).toEqual(['idle', 'idle']);
    expect(camps.fighting).toBe(false);
  });

  it('pauses 3 s at each end, then walks back with the last in the file leading', () => {
    const { camps, step } = world([patrol()], 60, -10);
    const [walkers] = camps.camps;
    const walk = walkers.patrol!;
    const lead = walkers.members[1];
    // Walk to the far end: the leader's place in the file stops at the road's end.
    let t = 0;
    while (!walk.pausing && t < 40) {
      step(DT);
      t += DT;
    }
    expect(walk.pausing).toBe(true);
    expect(along(lead.post)).toBeCloseTo(20, 1);
    // Both stand there, looking on past the end, for 3 s.
    let paused = 0;
    while (walk.pausing && paused < 10) {
      step(DT);
      paused += DT;
    }
    expect(paused).toBeCloseTo(P.pause, 1);
    for (const m of walkers.members) {
      expect(flat(m.enemy.position, m.post)).toBeLessThan(0.4);
    }
    // Then back south, the first of the pair leading now.
    step(4);
    const [a, b] = walkers.members.map((m) => m.enemy);
    expect(along(a.position)).toBeLessThan(along(b.position));
    expect(along(b.position) - along(a.position)).toBeCloseTo(P.gap, 0);
    expect(Math.cos(a.root.rotation.y)).toBeGreaterThan(0.95); // facing south (+z)
    // And all the way to the near end, and round again.
    t = 0;
    while (!walk.pausing && t < 40) {
      step(DT);
      t += DT;
    }
    expect(along(walkers.members[0].post)).toBeCloseTo(0, 1);
  });

  it('measures a jumped patrol’s leash from where it was jumped, walks home there and walks on from it', () => {
    const { camps, stand, step } = world([patrol()], 60, -10);
    const [walkers] = camps.camps;
    const [first, second] = walkers.members;
    step(6);
    // Hurt the second as it walks by, 6 m or so along the road.
    const jumped = { x: second.enemy.position.x, z: second.enemy.position.z };
    expect(along(jumped)).toBeGreaterThan(5);
    hit(walkers, 1, 20);
    step(DT);
    expect(minds(walkers)).toEqual(['fight', 'fight']);
    // Lead them off east, faster than they run, until they give up.
    let x = second.enemy.position.x + 5;
    let gaveUpAt: number | null = null;
    for (let t = 0; t < 30 && gaveUpAt === null; t += DT) {
      step(DT, () => stand((x += 2.4 * DT), jumped.z));
      if (second.mind === 'home') gaveUpAt = flat(second.enemy.position, jumped);
    }
    // 30 m from where it was jumped (not from the road's start, 6 m further off).
    expect(gaveUpAt).not.toBeNull();
    expect(gaveUpAt!).toBeGreaterThan(C.leash - 0.1);
    expect(gaveUpAt!).toBeLessThan(C.leash + 0.1);
    // Home: back where it was jumped, whole, and nobody walked on meanwhile.
    for (let t = 0; t < 30 && minds(walkers).some((m) => m !== 'idle'); t += DT) step(DT);
    expect(minds(walkers)).toEqual(['idle', 'idle']);
    expect(flat(second.enemy.position, jumped)).toBeLessThan(C.home);
    expect(second.enemy.hp).toBe(second.enemy.maxHp);
    // Then the file walks on from there.
    const from = along(first.enemy.position);
    step(3);
    expect(along(first.enemy.position) - from).toBeGreaterThan(1.5);
  });

  it('walks on alone once one of it falls, still to the ends of its road', () => {
    const { camps, step } = world([patrol()], 60, -10);
    const [walkers] = camps.camps;
    hit(walkers, 0);
    step(DT);
    hit(walkers, 0, 999);
    step(DT);
    expect(minds(walkers)).toEqual(['dead', 'fight']);
    // The survivor fights on, loses you (60 m off) and goes back to walking.
    const survivor = walkers.members[1];
    step(60);
    expect(survivor.mind).toBe('idle');
    const from = along(survivor.enemy.position);
    step(2);
    expect(Math.abs(along(survivor.enemy.position) - from)).toBeGreaterThan(1);
    // It pauses at each end of the road itself, not where its place in the pair would stop.
    const walk = walkers.patrol!;
    const ends: number[] = [];
    for (let t = 0; t < 80 && ends.length < 2; t += DT) {
      const was = walk.pausing;
      step(DT);
      if (walk.pausing && !was) ends.push(along(survivor.post));
    }
    expect(ends.map((e) => Math.round(e) + 0).sort((a, b) => a - b)).toEqual([0, 20]);
  });

  it('refills only while you are at least 30 m from its road, wherever its place is', () => {
    // A long road, with its place set at the road's south end.
    const road = [
      { x: 0, z: 0 },
      { x: 0, z: -40 },
    ];
    const { camps, stand, step } = world([patrol(road, { x: 0, z: 0, r: 0 })], 60, -10);
    const [walkers] = camps.camps;
    hit(walkers, 0, 999);
    hit(walkers, 1, 999);
    // By the road's north end: over 30 m from its place, but 25 m from the road.
    stand(25, -40);
    step(C.refillTime + 5);
    expect(minds(walkers)).toEqual(['dead', 'dead']);
    stand(C.refillAway + 1, -40);
    step(DT);
    expect(minds(walkers)).toEqual(['idle', 'idle']);
    // Freshly raised in file at the road's start.
    step(1);
    for (const m of walkers.members) expect(along(m.enemy.position)).toBeLessThan(P.gap + 1.5);
  });
});

describe("another zone's camps", () => {
  const N = CONFIG.population;

  /** `plans` added lazily, as a zone's beyond the starting zone, with you at (x, z). */
  function zoneWorld(plans: CampPlan[], x: number, z: number) {
    const camps = new Camps([], hill, hooks);
    camps.add(plans, hill, true);
    const you: You = { feet: new Vector3(), head: new Vector3(), sword: null, alive: true, interior: null };
    const stand = (nx: number, nz: number) => {
      you.feet.set(nx, hill.heightAt(nx, nz), nz);
      you.head.copy(you.feet).setY(you.feet.y + 1.6);
    };
    stand(x, z);
    const step = (seconds: number) => {
      for (let t = 0; t < seconds - 1e-9; t += DT) camps.update(DT, you);
    };
    return { camps, you, stand, step };
  }

  it('sleep with no bodies while you are far off, and are raised a member a frame as you come near', () => {
    const { camps, stand, step } = zoneWorld([camp('brackenmoor-scar', [thug(0, 0), thug(3, 0), archer(0, 3)])], 0, N.near + 30);
    const [scar] = camps.camps;
    step(2);
    expect(scar.awake).toBe(false);
    expect(camps.enemies).toHaveLength(0);
    stand(0, N.near - 10);
    const counts: number[] = [];
    for (let i = 0; i < 4; i++) {
      step(DT);
      counts.push(camps.enemies.length);
    }
    expect(counts).toEqual(N.perFrame === 1 ? [1, 2, 3, 3] : expect.arrayContaining([3]));
    expect(minds(scar)).toEqual(['idle', 'idle', 'idle']);
  });

  it('fight as any camp does once raised', () => {
    const { camps, stand, step } = zoneWorld([camp('brackenmoor-scar', [thug(0, 0), thug(3, 0)])], 0, 40);
    step(1);
    stand(0, C.notice - 1);
    step(0.5);
    expect(camps.fighting).toBe(true);
  });

  it('are laid to rest once you are well past and they are calm, not while they fight', () => {
    const { camps, stand, step } = zoneWorld([camp('brackenmoor-scar', [thug(0, 0), thug(3, 0)])], 0, 20);
    const [scar] = camps.camps;
    step(1);
    // Just short of the far edge: they stand.
    stand(0, N.near + N.hysteresis - 1 + 8);
    step(1);
    expect(scar.awake).toBe(true);
    stand(0, N.near + N.hysteresis + 9);
    step(DT);
    expect(scar.awake).toBe(false);
    expect(camps.enemies).toHaveLength(0);
    expect(scar.members).toHaveLength(0);
    // A fight goes on however far it's dragged; the leash ends it first.
    stand(0, 20);
    step(1);
    stand(0, C.notice - 1);
    step(0.5);
    expect(camps.fighting).toBe(true);
    stand(0, N.near + N.hysteresis + 20);
    step(DT);
    expect(scar.awake).toBe(true);
  });

  it('stay cleared while they sleep, and refill once the refill time has run, asleep or awake', () => {
    const { camps, stand, step } = zoneWorld([camp('brackenmoor-scar', [thug(0, 0), thug(3, 0)])], 0, 20);
    const [scar] = camps.camps;
    step(1);
    hit(scar, 0, 999);
    hit(scar, 1, 999);
    step(3);
    expect(minds(scar)).toEqual(['dead', 'dead']);
    // Away to sleep, and back before the refill time: still cleared.
    stand(0, N.near + N.hysteresis + 20);
    step(DT);
    expect(scar.awake).toBe(false);
    step(C.refillTime / 2);
    stand(0, 50);
    step(1);
    expect(minds(scar)).toEqual(['dead', 'dead']);
    // Off again past the refill time, then back: whole.
    stand(0, N.near + N.hysteresis + 20);
    step(C.refillTime / 2 + 5);
    stand(0, 50);
    step(1);
    expect(minds(scar)).toEqual(['idle', 'idle']);
    expect(camps.enemies).toHaveLength(2);
  });

  it('are raised whole at once round where you load in', () => {
    const { camps, you } = zoneWorld([camp('brackenmoor-scar', [thug(0, 0), thug(3, 0), thug(6, 0)]), camp('brackenmoor-far', [thug(400, 0)])], 0, 30);
    camps.fill(you.feet);
    expect(camps.enemies).toHaveLength(3);
  });

  it("leave the starting zone's camps standing however far you go", () => {
    const { camps, stand, step } = world([camp('farm', [thug(0, 0), thug(3, 0)])], 0, 30);
    stand(0, 1000);
    step(1);
    expect(camps.camps[0].awake).toBe(true);
    expect(camps.enemies).toHaveLength(2);
  });
});
