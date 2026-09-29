import { Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../src/config';
import { type Camp, type CampHooks, Camps, type You } from '../src/enemies/camps';
import { Hollow, type Piece } from '../src/maps/forest/hollow';
import { MINE, mineCamp, planMine } from '../src/maps/forest/mine';
import { mulberry32 } from '../src/maps/forest/noise';
import type { CampPlan, PostPlan } from '../src/maps/types';
import type { Interior } from '../src/save/record';
import { MineGround, type Underground } from '../src/world/mineGround';

// The mine's undead, through `EnemyContext`: real enemies on the mine's own
// ground, against a simulated player. Rock blocks their noticing you and
// bringing each other; one that can't see you follows the route's centre line
// towards you, and home the same way; the mouth ends every chase; and the
// mine refills only once you've left it. The hairpin and the switchback are
// the tunnel-steering check's (.scratch/oakvale-starting-zone/checks/
// tunnel-steering.mjs), where steering alone stuck for good.

const DT = 1 / 72;
const C = CONFIG.camps;
const { hw, height } = MINE.tunnel;

/** Enemy blows and arrows land nowhere: these tests are about where they go. */
const hooks: CampHooks = { sweep: () => null, slam: () => {}, shoot: () => {}, nock: () => {}, telegraph: () => {} };

/** A level tunnel `hw` either side of the line a→b (a room where it's wider), part 0. */
function tunnel(ax: number, az: number, bx: number, bz: number, open?: Piece['open']): Piece {
  return { x0: Math.min(ax, bx) - hw, x1: Math.max(ax, bx) + hw, z0: Math.min(az, bz) - hw, z1: Math.max(az, bz) + hw, floor: 0, height, part: 0, open };
}

/** Tunnels round a centre line, as the mine gives its undead: its sight test, floor and walls, and no say over arrows. */
function tunnels(route: readonly (readonly [number, number])[], pieces = route.slice(1).map(([bx, bz], i) => tunnel(route[i][0], route[i][1], bx, bz))): Underground {
  const hollow = new Hollow(pieces);
  return {
    route: route.map(([x, z]) => ({ x, z })),
    sees: (ax, az, bx, bz) => hollow.sees(ax, az, bx, bz),
    groundAt: (x, z) => (hollow.distance(x, z) <= MINE.rock ? hollow.floorAt(x, z) : null),
    resolve: (p, r) => hollow.resolve(p, r),
    arrowStops: () => null,
  };
}

const post = (behaviour: PostPlan['behaviour'], x: number, z: number): PostPlan => ({ behaviour, family: 'undead', x, z, yaw: 0 });

/** The mine's one camp, with these posts, its place the mouth at (0, 0). */
const undead = (...posts: PostPlan[]): CampPlan => ({ id: 'mine', place: { x: 0, z: 0, r: 0 }, level: 3, posts, interior: 'mine' });

/** A mine of camps on `ground`, and you in it at (x, z). */
function mine(plans: CampPlan[], ground: MineGround, x: number, z: number, where: Interior | null = 'mine') {
  const camps = new Camps(plans, ground, hooks);
  const you: You = { feet: new Vector3(), head: new Vector3(), sword: null, alive: true, interior: where };
  const stand = (nx: number, nz: number) => {
    you.feet.set(nx, ground.heightAt(nx, nz), nz);
    you.head.copy(you.feet).setY(you.feet.y + 1.6);
  };
  stand(x, z);
  const step = (seconds: number, each?: () => void) => {
    for (let t = 0; t < seconds - 1e-9; t += DT) {
      each?.();
      camps.update(DT, you);
    }
  };
  // Let the dead rise at their posts.
  step(2);
  return { camps, you, stand, step };
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

/** Down 15 m, across 6 and back up: 2.5 m of rock between the two legs. */
const HAIRPIN = [
  [0, 0],
  [0, -15],
  [6, -15],
  [6, 0],
] as const;

/** Three rows 12 m long joined at alternate ends, 2.5 m of rock between each. */
const SWITCHBACK = [
  [0, 0],
  [12, 0],
  [12, -6],
  [0, -6],
  [0, -12],
  [12, -12],
] as const;

describe('seeing through rock', () => {
  it("doesn't notice you through rock, however close, but does once you come round into sight", () => {
    const ground = new MineGround(tunnels(HAIRPIN));
    // You in the far leg of the hairpin, 6 m from it across the rock.
    const { camps, stand, step } = mine([undead(post('grunt', 0, -2))], ground, 6, -2);
    const [dead] = camps.camps;
    step(3);
    expect(minds(dead)).toEqual(['idle']);
    // Round the bend and up its own leg, into sight and within 8 m.
    stand(0, -9);
    step(DT);
    expect(minds(dead)).toEqual(['fight']);
  });

  it('brings only those it can see, however close the rest stand', () => {
    const ground = new MineGround(tunnels(HAIRPIN));
    // One in each leg, 6 m apart across the rock: within a pull, out of sight.
    const { camps, stand, step } = mine([undead(post('grunt', 0, -2), post('grunt', 6, -2), post('grunt', 0, -8))], ground, 0, -20);
    const [dead] = camps.camps;
    stand(0, -14);
    step(DT);
    expect(minds(dead)).toEqual(['fight', 'idle', 'fight']);
  });
});

describe('finding the way', () => {
  /** Hurt the camp's only member and let it chase you where you stand; where it went, and how near it got. */
  function chase(route: readonly (readonly [number, number])[], from: readonly [number, number], you: readonly [number, number], seconds: number) {
    const ground = new MineGround(tunnels(route));
    const { camps, step } = mine([undead(post('grunt', ...from))], ground, ...you);
    const [dead] = camps.camps;
    const enemy = dead.members[0].enemy;
    hit(dead, 0);
    const path: { x: number; z: number }[] = [];
    step(seconds, () => path.push({ x: enemy.position.x, z: enemy.position.z }));
    return { camps, dead, enemy, path, ground, near: flat(enemy.position, { x: you[0], z: you[1] }) };
  }

  it('follows the centre line round a hairpin to you, and walks home the same way', () => {
    const { dead, enemy, path, near, camps } = chase(HAIRPIN, [0, -2], [6, -2], 25);
    expect(minds(dead)).toEqual(['fight']);
    expect(near).toBeLessThan(2);
    // Round the bottom of the hairpin, not through the rock.
    expect(Math.min(...path.map((p) => p.z))).toBeLessThan(-13);
    // You go: it walks home, round the bend again, and stands at its post.
    const you = { feet: new Vector3(6, 0, -2), head: new Vector3(6, 1.6, -2), sword: null, alive: true, interior: null };
    const home: { x: number; z: number }[] = [];
    for (let t = 0; t < 25; t += DT) {
      camps.update(DT, you);
      home.push({ x: enemy.position.x, z: enemy.position.z });
    }
    expect(minds(dead)).toEqual(['idle']);
    expect(flat(enemy.position, dead.members[0].post)).toBeLessThan(C.home);
    expect(Math.min(...home.map((p) => p.z))).toBeLessThan(-13);
  });

  it('follows the centre line through a switchback to you, where steering alone sticks', () => {
    const { near, path } = chase(SWITCHBACK, [1, 0], [11, -12], 40);
    expect(near).toBeLessThan(2);
    // Along every row: out to the first bend's end and back to the second's.
    expect(Math.max(...path.filter((p) => p.z > -2).map((p) => p.x))).toBeGreaterThan(10);
    expect(Math.min(...path.filter((p) => p.z < -4 && p.z > -8).map((p) => p.x))).toBeLessThan(2);
  });

  it('walks straight at you once it can see you', () => {
    const ground = new MineGround(tunnels(HAIRPIN));
    const way = new Vector3();
    // Down the same leg: nothing to go round.
    expect(ground.wayRound(new Vector3(0, 0, -2), new Vector3(0, 0, -12), way)).toBe(false);
    // Across the rock: on down its own leg, towards the bend.
    expect(ground.wayRound(new Vector3(0, 0, -2), new Vector3(6, 0, -2), way)).toBe(true);
    expect(way.x).toBeCloseTo(0, 5);
    expect(way.z).toBeLessThan(-2);
  });
});

describe('the mouth', () => {
  it('ends every chase: out through it, they give up and walk home, and none ever leaves the mine', () => {
    // A straight tunnel north from a mouth at z = 0, open to the south.
    const ground = new MineGround(tunnels([[0, 0], [0, -20]], [tunnel(0, 0, 0, -20, ['south'])]));
    const { camps, you, stand, step } = mine([undead(post('grunt', 0, -12), post('archer', 1, -14))], ground, 0, -6);
    const [dead] = camps.camps;
    expect(minds(dead)).toEqual(['fight', 'fight']);
    // Back out through the mouth at a walk, the dead after you.
    let z = -6;
    let furthest = -Infinity;
    const track = () => {
      for (const m of dead.members) furthest = Math.max(furthest, m.enemy.position.z);
    };
    step(-z / CONFIG.player.moveSpeed, () => {
      stand(0, (z += CONFIG.player.moveSpeed * DT));
      track();
    });
    expect(minds(dead)).toEqual(['fight', 'fight']);
    // Over the mouth's line: you're out, and they turn for home at once.
    you.interior = null;
    stand(0, 0.5);
    step(DT);
    expect(minds(dead)).toEqual(['home', 'home']);
    step(15, () => {
      for (const m of dead.members) furthest = Math.max(furthest, m.enemy.position.z);
    });
    expect(minds(dead)).toEqual(['idle', 'idle']);
    // Never past the mouth's timbers: the tunnel's end, a metre out.
    expect(furthest).toBeLessThan(1);
  });

  it('keeps them from noticing you standing outside, close as you are', () => {
    const ground = new MineGround(tunnels([[0, 0], [0, -20]], [tunnel(0, 0, 0, -20, ['south'])]));
    const { camps, step } = mine([undead(post('grunt', 0, -3))], ground, 0, 2, null);
    step(3);
    expect(minds(camps.camps[0])).toEqual(['idle']);
  });
});

describe("the mine's refill", () => {
  it('fills again 3 minutes after the last falls, and only once you have left it and are 30 m from its mouth', () => {
    const ground = new MineGround(tunnels([[0, 0], [0, -40]], [tunnel(0, 0, 0, -40, ['south'])]));
    const { camps, you, stand, step } = mine([undead(post('grunt', 0, -12), post('grunt', 0, -30))], ground, 0, -35);
    const [dead] = camps.camps;
    for (const i of [0, 1]) hit(dead, i, 1000);
    step(DT);
    expect(minds(dead)).toEqual(['dead', 'dead']);
    // Deep inside, 35 m from the mouth, long past the 3 minutes: still empty.
    step(C.refillTime + 5);
    expect(minds(dead)).toEqual(['dead', 'dead']);
    // Out through the mouth, but short of 30 m from it: still empty.
    you.interior = null;
    stand(0, C.refillAway - 2);
    step(1);
    expect(minds(dead)).toEqual(['dead', 'dead']);
    // 30 m out: the dead rise again.
    stand(0, C.refillAway + 1);
    step(DT);
    expect(minds(dead)).toEqual(['idle', 'idle']);
  });

  it('waits the 3 minutes even once you are out and away', () => {
    const ground = new MineGround(tunnels([[0, 0], [0, -40]], [tunnel(0, 0, 0, -40, ['south'])]));
    const { camps, you, stand, step } = mine([undead(post('grunt', 0, -12))], ground, 0, -6);
    const [dead] = camps.camps;
    hit(dead, 0, 1000);
    you.interior = null;
    stand(0, C.refillAway + 5);
    step(C.refillTime - 5);
    expect(minds(dead)).toEqual(['dead']);
    step(6);
    expect(minds(dead)).toEqual(['idle']);
  });
});

describe('arrows in the mine', () => {
  const plan = planMine({ x: 0, z: 0, yaw: 0, y: 0 });
  const ground = new MineGround(plan);
  const at = (x: number, y: number, z: number) => new Vector3(x, y, z);

  it('fly down a tunnel, but stop in its walls, its floor and its ceiling', () => {
    // Down the adit, 1.5 m up.
    expect(ground.arrowStops(at(0, 1.5, -5))).toBe(false);
    // Into its wall…
    expect(ground.arrowStops(at(hw + 0.2, 1.5, -5))).toBe(true);
    // …its ceiling, 3 m up…
    expect(ground.arrowStops(at(0, height - 0.01, -5))).toBe(true);
    // …and its floor.
    expect(ground.arrowStops(at(0, 0.01, -5))).toBe(true);
  });

  it('stop in the ceiling well above head height, wherever it is', () => {
    const { x0, x1, z0, z1, height: tall } = MINE.pieces.find((p) => p.name === 'gallery')!;
    const [x, z] = [(x0 + x1) / 2, (z0 + z1) / 2];
    // The gallery's ceiling is 6 m up: an arrow at 4 m flies on, at 6 m it's in the rock.
    expect(ground.arrowStops(at(x, 4, z))).toBe(false);
    expect(ground.arrowStops(at(x, tall, z))).toBe(true);
  });

  it('leave the outdoors to say out past the mouth', () => {
    expect(plan.arrowStops(at(0, 1.5, 3))).toBeNull();
  });
});

describe("the mine's camp", () => {
  const frame = { x: 0, z: 0, yaw: 0, y: 0 };
  const plan = planMine(frame);
  const camp = mineCamp(frame);
  const hollow = new Hollow(MINE.pieces);
  const partOf = (p: { x: number; z: number }) => MINE.parts[hollow.pieceAt(p.x, p.z).part];

  it('holds two grunts and an archer in the cart hall and a grunt and an archer in the gallery at level 3, and a brute in the dig and another in the antechamber at level 4, paying triple', () => {
    expect(camp.interior).toBe('mine');
    expect(camp.level).toBe(3);
    const posts = camp.posts.map((p) => `${p.behaviour} in the ${partOf(p)}, level ${p.level ?? camp.level}${p.role ? `, ${p.role}` : ''}`);
    expect(posts).toEqual([
      'grunt in the cart hall, level 3',
      'grunt in the cart hall, level 3',
      'archer in the cart hall, level 3',
      'grunt in the gallery, level 3',
      'archer in the gallery, level 3',
      'brute in the dig, level 4, deepBrute',
      'brute in the antechamber, level 4, deepBrute',
    ]);
    expect(CONFIG.levels.roles.deepBrute).toBe(3);
    expect(camp.posts.every((p) => p.family === 'undead')).toBe(true);
  });

  it('stands each clear of the walls and props, with the gallery\'s pair at its far end', () => {
    for (const p of camp.posts) {
      const r = CONFIG.enemies[p.behaviour].radius;
      expect(plan.resolve(new Vector3(p.x, 0, p.z), r), `${p.behaviour} at (${p.x}, ${p.z})`).toBe(false);
    }
    const gallery = MINE.pieces.find((p) => p.name === 'gallery')!;
    for (const p of camp.posts.filter((q) => partOf(q) === 'gallery')) expect(p.z).toBeLessThan((gallery.z0 + gallery.z1) / 2);
  });

  it('makes each chamber its own pull: none can see another chamber\'s member within a pull of it', () => {
    for (const a of camp.posts) {
      for (const b of camp.posts) {
        if (partOf(a) === partOf(b)) continue;
        const close = flat(a, b) < C.pull;
        expect(close && plan.sees(a.x, a.z, b.x, b.z), `${partOf(a)} and ${partOf(b)}`).toBe(false);
      }
    }
  });

  it("refills only once you're a leash from its mouth", () => {
    expect(camp.place).toEqual({ x: frame.x, z: frame.z, r: 0 });
  });
});
