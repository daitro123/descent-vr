import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { swingDamage } from '../src/combat/combat';
import { CONFIG } from '../src/config';
import type { EnemyContext } from '../src/enemies/enemy';
import { Grunt } from '../src/enemies/kinds';
import { AttackTokens } from '../src/enemies/tokens';
import { waveRoster } from '../src/game';
import type { Arena } from '../src/world/arena';

describe('AttackTokens', () => {
  it('caps holders and hands tokens back', () => {
    const t = new AttackTokens(2);
    const [a, b, c] = [{}, {}, {}];
    expect(t.tryAcquire(a)).toBe(true);
    expect(t.tryAcquire(b)).toBe(true);
    expect(t.tryAcquire(c)).toBe(false);
    expect(t.tryAcquire(a)).toBe(true); // re-entrant for a holder
    t.release(a);
    expect(t.tryAcquire(c)).toBe(true);
    expect(t.inUse).toBe(2);
  });

  it('spaces out attack starts by the gap', () => {
    const t = new AttackTokens(2, 0.5);
    const [a, b, c] = [{}, {}, {}];
    t.tryAcquire(a);
    t.tryAcquire(b);
    expect(t.tryStart(c)).toBe(false); // no token, no swing
    expect(t.tryStart(a)).toBe(true);
    expect(t.tryStart(b)).toBe(false);
    t.update(0.3);
    expect(t.tryStart(b)).toBe(false);
    t.update(0.3);
    expect(t.tryStart(b)).toBe(true);
  });
});

describe('a crowd of grunts', () => {
  it('takes turns: never more attackers than tokens, and everyone gets a swing', () => {
    const ctx: EnemyContext = {
      playerFeet: new Vector3(0, 0, 0),
      playerHead: new Vector3(0, 1.6, 0),
      playerSword: null,
      arena: { resolve: () => false, lineOfSight: () => true } as unknown as Arena,
      meleeTokens: new AttackTokens(CONFIG.tokens.melee, CONFIG.tokens.meleeGap),
      rangedTokens: new AttackTokens(CONFIG.tokens.ranged, CONFIG.tokens.rangedGap),
      sweep: () => null,
      slam: () => {},
      shoot: () => {},
      nock: () => {},
      summon: () => {},
      telegraph: () => {},
    };
    const grunts = [0, 1, 2, 3, 4].map((i) => {
      const a = (i / 5) * Math.PI * 2;
      return new Grunt('grunt', Math.sin(a) * 3, Math.cos(a) * 3);
    });
    const attacked = new Set<Grunt>();
    let maxConcurrent = 0;
    let lastStart = -Infinity;
    let minGap = Infinity;
    for (let t = 0; t < 20; t += 1 / 72) {
      ctx.meleeTokens.update(1 / 72);
      const before = grunts.filter((g) => g.attacking).length;
      for (const g of grunts) g.update(1 / 72, ctx);
      if (grunts.filter((g) => g.attacking).length > before) {
        minGap = Math.min(minGap, t - lastStart);
        lastStart = t;
      }
      const attacking = grunts.filter((g) => g.attacking);
      attacking.forEach((g) => attacked.add(g));
      maxConcurrent = Math.max(maxConcurrent, attacking.length);
    }
    expect(maxConcurrent).toBeLessThanOrEqual(CONFIG.tokens.melee);
    expect(minGap).toBeGreaterThanOrEqual(CONFIG.tokens.meleeGap - 1e-6);
    expect(maxConcurrent).toBeGreaterThan(0);
    expect(attacked.size).toBe(grunts.length);
  });
});

describe('waveRoster', () => {
  it('leads with melee and interleaves the rest', () => {
    expect(waveRoster({ grunt: 2, archer: 2, brute: 1 })).toEqual(['grunt', 'brute', 'archer', 'grunt', 'archer']);
  });

  it('every configured wave spawns something, and the last is the Warden alone', () => {
    for (const w of CONFIG.waves.list) expect(waveRoster(w).length).toBeGreaterThan(0);
    expect(waveRoster(CONFIG.waves.list.at(-1)!)).toEqual(['warden']);
  });
});

describe('swingDamage', () => {
  const S = CONFIG.sword;
  it('scales from min to max damage between the speed thresholds', () => {
    expect(swingDamage(S.minHitSpeed).damage).toBe(S.minDamage);
    expect(swingDamage(S.fullDamageSpeed).damage).toBe(S.maxDamage);
    expect(swingDamage(S.fullDamageSpeed * 3).damage).toBe(S.maxDamage);
    const mid = swingDamage((S.minHitSpeed + S.fullDamageSpeed) / 2);
    expect(mid.power).toBeCloseTo(0.5);
  });
});
