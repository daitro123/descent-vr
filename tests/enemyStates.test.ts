import { Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../src/config';
import { type CampHooks, Camps, type You } from '../src/enemies/camps';
import type { Enemy, EnemyContext } from '../src/enemies/enemy';
import { createEnemy } from '../src/enemies/kinds';
import { AttackTokens } from '../src/enemies/tokens';
import { Vines } from '../src/fx/vines';
import type { EnemyKind } from '../src/models/characters';
import { mulberry32 } from '../src/maps/forest/noise';
import type { CampPlan } from '../src/maps/types';
import { Arena } from '../src/world/arena';
import type { Ground } from '../src/world/ground';

// Rooted, frozen and slowed at the enemy seam: real enemies (their rigs,
// think, tokens and attack timelines) stepped through an EnemyContext, the
// states put on them through `afflict`, as an ability will. The tests check
// what a player would see: where it stands, whether it swings, how fast.

const DT = 1 / 72;

const flatGround: Ground = { resolve: () => false, lineOfSight: () => true, heightAt: () => 0, steer: Arena.prototype.steer, arrowStops: () => false };

/** A world with you standing `dist` m south of the origin, where its enemies stand. */
function context(dist: number): EnemyContext {
  return {
    playerFeet: new Vector3(0, 0, dist),
    playerHead: new Vector3(0, 1.6, dist),
    playerSword: null,
    ground: flatGround,
    meleeTokens: new AttackTokens(CONFIG.tokens.melee, CONFIG.tokens.meleeGap),
    rangedTokens: new AttackTokens(CONFIG.tokens.ranged, CONFIG.tokens.rangedGap),
    sweep: () => null,
    slam: () => {},
    shoot: () => {},
    nock: () => {},
    summon: () => {},
    telegraph: () => {},
  };
}

/** Step `enemies` for `seconds`, calling `each` every frame first; stops early once `until` holds. */
function step(ctx: EnemyContext, enemies: Enemy[], seconds: number, until?: () => boolean): number {
  let t = 0;
  for (; t < seconds - 1e-9; t += DT) {
    if (until?.()) break;
    ctx.meleeTokens.update(DT);
    ctx.rangedTokens.update(DT);
    for (const e of enemies) e.update(DT, ctx);
  }
  return t;
}

/** An arena enemy of `kind` at the origin, risen and on its feet. */
function ready(kind: EnemyKind, ctx: EnemyContext): Enemy {
  const e = createEnemy(kind, 0, 0);
  step(ctx, [e], 3, () => e.state === 'move');
  expect(e.state).toBe('move');
  return e;
}

const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

beforeEach(() => void vi.spyOn(Math, 'random').mockImplementation(mulberry32(11)));
afterEach(() => void vi.restoreAllMocks());

describe('rooted', () => {
  it("can't walk while it lasts, then comes on as before", () => {
    const ctx = context(8);
    const e = ready('grunt', ctx);
    ctx.playerFeet.set(0, 0, e.position.z + 8);
    const at = e.position.clone();
    expect(e.afflict('rooted', 3)).toBe(3);
    step(ctx, [e], 2.5);
    expect(flat(e.position, at)).toBeLessThan(1e-6);
    expect(e.afflictedFor('rooted')).toBeGreaterThan(0);
    expect(e.vineGrowth).toBe(1);
    step(ctx, [e], 0.45);
    expect(flat(e.position, at)).toBeLessThan(1e-6);
    expect(e.vineGrowth).toBeLessThan(1); // withering as it ends
    // It ends: the vines are gone and it walks on at you.
    step(ctx, [e], 1.05);
    expect(e.afflictedFor('rooted')).toBe(0);
    expect(e.vineGrowth).toBe(0);
    expect(flat(e.position, at)).toBeGreaterThan(0.5);
  });

  it('still strikes you in reach', () => {
    const ctx = context(0.9);
    const e = ready('grunt', ctx);
    ctx.playerFeet.set(e.position.x, 0, e.position.z + 0.9);
    ctx.playerHead.set(e.position.x, 1.6, e.position.z + 0.9);
    const at = e.position.clone();
    e.afflict('rooted', 6);
    let blows = 0;
    let was = false;
    step(ctx, [e], 5.5, () => {
      const active = e.attacking && e.phase === 'active';
      if (active && !was) blows++;
      was = active;
      return false;
    });
    expect(blows).toBeGreaterThanOrEqual(1);
    expect(flat(e.position, at)).toBeLessThan(1e-6);
  });
});

describe('frozen', () => {
  it('stops mid-swing and does nothing, held still, until it ends; then it fights on', () => {
    const ctx = context(0.9);
    const e = ready('grunt', ctx);
    ctx.playerFeet.set(e.position.x, 0, e.position.z + 0.9);
    step(ctx, [e], 6, () => e.attacking && e.phase === 'windup');
    expect(e.attacking).toBe(true);
    expect(e.afflict('frozen', 2)).toBe(2);
    expect(e.state).toBe('frozen');
    expect(e.attacking).toBe(false);
    const at = e.position.clone();
    const arm = e.rig.bones.upperArmR.rotation.clone();
    const yaw = e.root.rotation.y;
    // Walk round it: it doesn't turn to follow, swing, or stir.
    ctx.playerFeet.set(e.position.x + 0.9, 0, e.position.z);
    let acted = false;
    step(ctx, [e], 1.9, () => ((acted ||= e.attacking || e.state !== 'frozen'), false));
    expect(acted).toBe(false);
    expect(flat(e.position, at)).toBeLessThan(1e-6);
    expect(e.root.rotation.y).toBe(yaw);
    expect(e.rig.bones.upperArmR.rotation.equals(arm)).toBe(true);
    // Thawed, it turns on you and swings again.
    step(ctx, [e], 0.2);
    expect(e.state).not.toBe('frozen');
    step(ctx, [e], 5, () => e.attacking);
    expect(e.attacking).toBe(true);
  });

  it('breaks on a hit, which lands as it would have', () => {
    const ctx = context(3);
    const e = ready('grunt', ctx);
    e.afflict('frozen', 5);
    expect(e.takeHit(5, new Vector3(), { from: ctx.playerHead })).toBe(false);
    expect(e.hp).toBe(e.maxHp - 5);
    expect(e.state).toBe('stagger'); // a grunt has no poise: any blow staggers it
    expect(e.afflictedFor('frozen')).toBe(0);
  });

  it("doesn't count against the attackers' limit", () => {
    const ctx = context(1);
    const grunts = [-0.9, 0, 0.9].map((x) => createEnemy('grunt', x, 0));
    step(ctx, grunts, 3, () => grunts.every((g) => g.state === 'move'));
    // Two of the three hold the arena's two tokens, the third waits its turn.
    step(ctx, grunts, 4, () => ctx.meleeTokens.inUse === CONFIG.tokens.melee);
    expect(ctx.meleeTokens.inUse).toBe(2);
    const holder = grunts.find((g) => ctx.meleeTokens.has(g))!;
    const waiting = grunts.find((g) => !ctx.meleeTokens.has(g))!;
    holder.afflict('frozen', 6);
    expect(ctx.meleeTokens.has(holder)).toBe(false);
    expect(ctx.meleeTokens.inUse).toBe(1);
    // The one waiting takes its turn while it stands frozen, and it takes none back.
    step(ctx, grunts, 4, () => ctx.meleeTokens.has(waiting));
    expect(ctx.meleeTokens.has(waiting)).toBe(true);
    step(ctx, grunts, 1);
    expect(holder.state).toBe('frozen');
    expect(ctx.meleeTokens.has(holder)).toBe(false);
  });
});

describe('slowed', () => {
  it('walks slower by the fraction while it lasts', () => {
    const walked = (by: number) => {
      const ctx = context(12);
      const e = ready('grunt', ctx);
      ctx.playerFeet.set(0, 0, e.position.z + 12);
      if (by) e.afflict('slowed', 5, by);
      step(ctx, [e], 0.5); // up to pace
      const from = e.position.clone();
      step(ctx, [e], 2);
      return flat(e.position, from);
    };
    const plain = walked(0);
    expect(plain).toBeGreaterThan(2);
    expect(walked(0.5) / plain).toBeCloseTo(0.5, 1);
    expect(walked(0.3) / plain).toBeCloseTo(0.7, 1);
  });

  it('winds up slower by the fraction, and the blow comes as fast', () => {
    const windup = (by: number) => {
      const ctx = context(0.9);
      const e = ready('grunt', ctx);
      ctx.playerFeet.set(e.position.x, 0, e.position.z + 0.9);
      if (by) e.afflict('slowed', 20, by);
      step(ctx, [e], 6, () => e.attacking);
      const attack = e.attack!;
      const t = step(ctx, [e], 6, () => e.phase === 'active');
      return t / attack.windup;
    };
    expect(windup(0)).toBeCloseTo(1, 1);
    expect(windup(0.5)).toBeCloseTo(2, 1);
  });

  it('ends, and it walks at its pace again', () => {
    const ctx = context(12);
    const e = ready('grunt', ctx);
    e.afflict('slowed', 1, 0.5);
    expect(e.slowness).toBe(0.5);
    step(ctx, [e], 1.05);
    expect(e.slowness).toBe(0);
    expect(e.afflictedFor('slowed')).toBe(0);
  });

  it('keeps the stronger slow and the longer time when slowed again', () => {
    const ctx = context(12);
    const e = ready('grunt', ctx);
    e.afflict('slowed', 4, 0.5);
    e.afflict('slowed', 1, 0.2);
    expect(e.slowness).toBe(0.5);
    expect(e.afflictedFor('slowed')).toBe(4);
    e.afflict('slowed', 2, 0.7);
    expect(e.slowness).toBe(0.7);
    expect(e.afflictedFor('slowed')).toBe(4);
  });
});

describe('the brute and the Warden', () => {
  it('a brute takes roots and freezes at half length and slows at half strength', () => {
    const ctx = context(8);
    const b = ready('brute', ctx);
    expect(b.afflict('rooted', 4)).toBe(2);
    expect(b.afflictedFor('rooted')).toBe(2);
    expect(b.afflict('slowed', 4, 0.6)).toBe(4);
    expect(b.slowness).toBeCloseTo(0.3);
    expect(b.afflict('frozen', 4)).toBe(2);
    expect(b.state).toBe('frozen');
    step(ctx, [b], 2.05);
    expect(b.state).not.toBe('frozen');
  });

  it('the Warden ignores roots and freezes, and takes slows at half', () => {
    const ctx = context(8);
    const w = ready('warden', ctx);
    ctx.playerFeet.set(0, 0, w.position.z + 8);
    expect(w.afflict('rooted', 4)).toBe(0);
    expect(w.afflict('frozen', 4)).toBe(0);
    expect(w.state).toBe('move');
    expect(w.afflict('slowed', 4, 0.6)).toBe(4);
    expect(w.slowness).toBeCloseTo(0.3);
    // It walks at you, slowed but neither rooted nor frozen.
    const from = w.position.clone();
    step(ctx, [w], 1);
    expect(flat(w.position, from)).toBeGreaterThan(0.5);
    expect(w.vineGrowth).toBe(0);
  });

  it('nothing takes hold of one that can’t be hit', () => {
    const e = createEnemy('grunt', 0, 0); // still rising from its grave
    expect(e.afflict('rooted', 4)).toBe(0);
    expect(e.afflict('frozen', 4)).toBe(0);
    expect(e.afflict('slowed', 4, 0.5)).toBe(0);
    expect(e.state).toBe('rising');
  });
});

describe('the leash', () => {
  const hooks: CampHooks = { sweep: () => null, slam: () => {}, shoot: () => {}, nock: () => {}, telegraph: () => {} };
  const farm: CampPlan = { id: 'farm', place: { x: 0, z: 0, r: 8 }, level: 1, posts: [{ behaviour: 'grunt', family: 'bandit', x: 0, z: 0, yaw: 0 }] };

  /** One bandit at its post at the origin, fighting you, led off north until it's `out` m from its post. */
  function ledOut(out: number) {
    const camps = new Camps([farm], flatGround, hooks);
    const you: You = { feet: new Vector3(0, 0, -5), head: new Vector3(0, 1.6, -5), sword: null, alive: true, interior: null };
    const tick = () => camps.update(DT, you);
    const member = camps.camps[0].members[0];
    const enemy = member.enemy;
    enemy.takeHit(5, new Vector3());
    tick();
    expect(member.mind).toBe('fight');
    for (let t = 0; t < 40 && flat(enemy.position, member.post) < out; t += DT) {
      you.feet.z -= 2.4 * DT;
      you.head.z = you.feet.z;
      tick();
    }
    return { camps, you, tick, member, enemy };
  }

  it('turns a rooted enemy home once a blow shoves it past its leash, and it walks home free', () => {
    const { tick, member, enemy } = ledOut(CONFIG.camps.leash - 1.5);
    expect(member.mind).toBe('fight');
    enemy.afflict('rooted', 20);
    enemy.takeHit(1, new Vector3(0, 0, -30)); // knocked 30/8 m on, north
    for (let t = 0; t < 1 && member.mind === 'fight'; t += DT) tick();
    expect(member.mind).toBe('home');
    expect(enemy.afflictedFor('rooted')).toBe(0);
    for (let t = 0; t < 40 && member.mind === 'home'; t += DT) tick();
    expect(member.mind).toBe('idle');
    expect(flat(enemy.position, member.post)).toBeLessThan(CONFIG.camps.home);
  });

  it('turns a frozen enemy home as it slides past its leash, thawed', () => {
    const { tick, member, enemy } = ledOut(CONFIG.camps.leash - 1.5);
    enemy.takeHit(1, new Vector3(0, 0, -30));
    enemy.afflict('frozen', 20);
    expect(enemy.state).toBe('frozen');
    for (let t = 0; t < 1 && member.mind === 'fight'; t += DT) tick();
    expect(member.mind).toBe('home');
    expect(enemy.state).not.toBe('frozen');
    for (let t = 0; t < 40 && member.mind === 'home'; t += DT) tick();
    expect(member.mind).toBe('idle');
  });

  it('turns a rooted enemy home once you leave for somewhere it can’t follow', () => {
    const { you, tick, member, enemy } = ledOut(5);
    enemy.afflict('rooted', 20);
    you.interior = 'inn';
    tick();
    expect(member.mind).toBe('home');
    expect(enemy.afflictedFor('rooted')).toBe(0);
  });
});

describe('the looks', () => {
  it('tint a frozen or slowed enemy on its own material, adding nothing to draw', () => {
    const ctx = context(8);
    const e = ready('grunt', ctx);
    const children = e.root.children.length;
    step(ctx, [e], DT);
    expect(e.material.color.getHex()).toBe(0xffffff);
    e.afflict('slowed', 4, 0.5);
    step(ctx, [e], DT);
    const frost = e.material.color.clone();
    expect(frost.b).toBeGreaterThan(frost.r);
    e.afflict('frozen', 4);
    step(ctx, [e], DT);
    expect(e.material.color.b).toBeGreaterThan(e.material.color.r);
    expect(e.material.color.r).toBeLessThan(frost.r); // paler blue than the frost
    expect(e.root.children.length).toBe(children);
  });

  it('draw every rooted enemy’s vines in one draw call, within 500 triangles apiece', () => {
    const ctx = context(8);
    const grunts = [-2, 0, 2].map((x) => createEnemy('grunt', x, 0));
    step(ctx, grunts, 3, () => grunts.every((g) => g.state === 'move'));
    const vines = new Vines();
    vines.place(grunts);
    expect(vines.count).toBe(0);
    expect(vines.mesh.visible).toBe(false);
    for (const g of grunts) g.afflict('rooted', 3);
    step(ctx, grunts, 0.5);
    vines.place(grunts);
    expect(vines.count).toBe(3);
    expect(vines.mesh.visible).toBe(true);
    const triangles = vines.mesh.geometry.index ? vines.mesh.geometry.index.count / 3 : vines.mesh.geometry.getAttribute('position').count / 3;
    expect(triangles).toBeLessThanOrEqual(500);
    step(ctx, grunts, 3);
    vines.place(grunts);
    expect(vines.count).toBe(0);
  });
});
