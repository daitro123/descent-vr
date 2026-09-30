import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ABILITY } from '../src/classes';
import { AbilityClock, blocked, CHEST, sweptTo, type Target, throwTarget } from '../src/combat/abilities';
import { type AttackConfig, CONFIG } from '../src/config';

// The warrior's gesture abilities (abilities ticket 19), at the rules Combat
// applies: each one's cooldown and how long it lasts, whom Heroic Throw flies
// at, what a heavy blow does to a block behind Shield Wall, and whom Sweeping
// Strikes also hits.

const W = CONFIG.classes.warrior.abilities;
const HEAVY = (CONFIG.enemies.brute.attacks as readonly AttackConfig[]).find((a) => a.guardBreak)!;
const PLAIN = (CONFIG.enemies.grunt.attacks as readonly AttackConfig[]).find((a) => a.kind === 'melee' && !a.guardBreak)!;

/** An enemy standing at (x, z), `radius` wide. */
const at = (x: number, z: number, radius = 0.35, hittable = true): Target => ({ position: new Vector3(x, 0, z), def: { radius }, hittable });

describe('the ability clock', () => {
  it('refuses an ability you can’t pay for, then one cooling down, and counts its cooldown down', () => {
    const clock = new AbilityClock();
    expect(clock.refuses('heroicThrow', 14)).toBe('poor');
    expect(clock.refuses('heroicThrow', 15)).toBeNull();
    clock.used('heroicThrow');
    expect(clock.refuses('heroicThrow', 100)).toBe('cooling');
    expect(clock.cooldown('heroicThrow')).toBe(W.heroicThrow.cooldown);
    clock.tick(W.heroicThrow.cooldown - 0.1);
    expect(clock.refuses('heroicThrow', 100)).toBe('cooling');
    clock.tick(0.2);
    expect(clock.refuses('heroicThrow', 100)).toBeNull();
  });

  it('keeps Shield Wall up for its time and Sweeping Strikes for theirs, each on its own cooldown', () => {
    const clock = new AbilityClock();
    clock.used('shieldWall', W.shieldWall.time);
    clock.used('sweepingStrikes', W.sweepingStrikes.time);
    clock.tick(W.shieldWall.time - 0.1);
    expect(clock.left('shieldWall')).toBeGreaterThan(0);
    clock.tick(0.2);
    expect(clock.left('shieldWall')).toBe(0);
    expect(clock.left('sweepingStrikes')).toBeGreaterThan(0);
    expect(clock.cooldown('shieldWall')).toBeCloseTo(W.shieldWall.cooldown - W.shieldWall.time - 0.1);
    clock.tick(W.sweepingStrikes.time);
    expect(clock.left('sweepingStrikes')).toBe(0);
    clock.clear();
    expect(clock.refuses('shieldWall', 100)).toBeNull();
  });

  it("costs what the warrior's ticket says, and the War Cry and Earthshaker have no gesture cooldown", () => {
    expect([ABILITY.heroicThrow.cost, ABILITY.shieldWall.cost, ABILITY.sweepingStrikes.cost]).toEqual([15, 25, 30]);
    expect([ABILITY.heroicThrow.cooldown, ABILITY.shieldWall.cooldown, ABILITY.sweepingStrikes.cooldown]).toEqual([6, 30, 20]);
    const clock = new AbilityClock();
    expect(clock.refuses('warCry', 50)).toBeNull();
    expect(clock.refuses('warCry', 49)).toBe('poor');
  });
});

describe("the warrior's tier-3 talent abilities", () => {
  it('arm the next blow for their window, which landing ends early, each on its own cooldown', () => {
    const T = CONFIG.talents.trees.warrior;
    const clock = new AbilityClock();
    expect(clock.refuses('mortalStrike', 29)).toBe('poor');
    expect(clock.refuses('mortalStrike', 29, 25)).toBeNull();
    clock.used('mortalStrike', T.arms.mortalStrike.window);
    clock.used('shieldSlam', T.protection.shieldSlam.window);
    clock.tick(1);
    expect(clock.left('mortalStrike')).toBeCloseTo(2);
    clock.end('mortalStrike');
    expect(clock.left('mortalStrike')).toBe(0);
    expect(clock.cooldown('mortalStrike')).toBeCloseTo(T.arms.mortalStrike.cooldown - 1);
    clock.tick(2.1);
    // Not spent within its window, the charge lapses.
    expect(clock.left('shieldSlam')).toBe(0);
    expect(clock.cooldown('shieldSlam')).toBeCloseTo(T.protection.shieldSlam.cooldown - 3.1);
  });
});

describe('Heroic Throw', () => {
  const from = new Vector3(0, 1.3, 0);
  const ahead = new Vector3(0, 0, -1);
  const clear = () => true;

  it('flies at the nearest enemy within 15° of where the hand faces, up to 20 m', () => {
    const near = at(0.5, -6);
    const far = at(0, -12);
    expect(throwTarget(from, [ahead], [far, near], clear)).toBe(near);
    // 20° off to the side is outside the aim.
    expect(throwTarget(from, [ahead], [at(Math.tan((20 * Math.PI) / 180) * 8, -8)], clear)).toBeNull();
    expect(throwTarget(from, [ahead], [at(0, -(W.heroicThrow.range + 1))], clear)).toBeNull();
  });

  it('falls back to where you look when the hand faces no one, and needs a clear line', () => {
    const left = at(-6, 0);
    const gaze = new Vector3(-1, 0, 0);
    expect(throwTarget(from, [ahead, gaze], [left], clear)).toBe(left);
    expect(throwTarget(from, [ahead, gaze], [left], () => false)).toBeNull();
  });

  it('never flies at one it can’t hit (dead, rising or walking home)', () => {
    expect(throwTarget(from, [ahead], [at(0, -5, 0.35, false)], clear)).toBeNull();
  });

  it("aims at the chest", () => {
    const seen: Vector3[] = [];
    throwTarget(from, [ahead], [at(0, -5)], (_, to) => (seen.push(to.clone()), true));
    expect(seen[0].toArray()).toEqual([0, CHEST, -5]);
  });
});

describe('Shield Wall', () => {
  it('takes a heavy blow on the block with nothing through and the arm not numbed', () => {
    expect(blocked(HEAVY, false)).toEqual({ breaks: true, chip: Math.round(HEAVY.damage * CONFIG.shield.guardBreakChip) });
    expect(blocked(HEAVY, true)).toEqual({ breaks: false, chip: 0 });
  });

  it('changes nothing for a plain blow, which a block always stopped', () => {
    expect(blocked(PLAIN, false)).toEqual({ breaks: false, chip: 0 });
    expect(blocked(PLAIN, true)).toEqual({ breaks: false, chip: 0 });
  });
});

describe('Sweeping Strikes', () => {
  it('also strikes the nearest other enemy within 1.5 m of the one hit', () => {
    const hit = at(0, 0);
    const close = at(1.2, 0); // bodies 0.5 m apart
    const closer = at(0, 1); // 0.3 m apart
    expect(sweptTo(hit, [hit, close, closer])).toBe(closer);
    expect(sweptTo(hit, [hit, close])).toBe(close);
  });

  it('strikes no one past 1.5 m, nor one it can’t hit, nor the one hit again', () => {
    const hit = at(0, 0);
    expect(sweptTo(hit, [hit, at(0, 2.3)])).toBeNull(); // 1.6 m between bodies
    expect(sweptTo(hit, [hit, at(0, 1, 0.35, false)])).toBeNull();
    expect(sweptTo(hit, [hit])).toBeNull();
  });
});
