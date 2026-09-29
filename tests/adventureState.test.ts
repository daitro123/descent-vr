import { describe, expect, it } from 'vitest';
import { type AdventureEvent, AdventureState, type Effect, enemyNumbers, type Role, statsAt } from '../src/adventureState';
import { CONFIG } from '../src/config';
import type { CampId } from '../src/maps/types';

// The adventure state is the rules of progress with no three.js in it: the
// Adventure feeds it events and reads its answers and effects. These tests
// drive it the same way and check what a player would notice: XP, level,
// health, damage and what they can use.

const kill = (level: number, role: Role = 'ordinary', camp: CampId | null = 'farm'): AdventureEvent => ({ kind: 'kill', camp, level, role });

/** The XP one kill pays a new character. */
function paid(event: AdventureEvent): number {
  const state = new AdventureState();
  state.apply(event);
  return state.xp;
}

/** Earn `xp` from level-1 kills, 10 at a time; returns every effect. */
function earn(state: AdventureState, xp: number): Effect[] {
  const effects: Effect[] = [];
  for (let i = 0; i < xp / 10; i++) effects.push(...state.apply(kill(1)));
  return effects;
}

const levelUps = (effects: Effect[]) => effects.filter((e) => e.kind === 'level');

describe('a new character', () => {
  it('is level 1 with no XP, 100 to go, 100 health, plain damage and no abilities', () => {
    const state = new AdventureState();
    expect(state.level).toBe(1);
    expect(state.xp).toBe(0);
    expect(state.xpToNext).toBe(100);
    expect(state.stats.maxHp).toBe(100);
    expect(state.stats.damage).toBe(1);
    expect(state.stats.abilities).toEqual([]);
  });
});

describe('a kill', () => {
  it('pays 10 XP per enemy level, and says what it paid', () => {
    const state = new AdventureState();
    expect(state.apply(kill(1))).toEqual([{ kind: 'xp', amount: 10 }]);
    expect(state.apply(kill(2))).toEqual([{ kind: 'xp', amount: 20 }]);
    expect(state.xp).toBe(30);
    expect(state.xpToNext).toBe(70);
  });

  it('pays triple for the bandit leader, the deep brutes and the Warden', () => {
    expect(paid(kill(2, 'leader'))).toBe(60);
    expect(paid(kill(4, 'deepBrute'))).toBe(120);
    expect(paid(kill(5, 'warden'))).toBe(150);
  });

  it('pays nothing for the skeletons the Warden raises', () => {
    const state = new AdventureState();
    expect(state.apply(kill(5, 'raised', null))).toEqual([]);
    expect(state.xp).toBe(0);
  });
});

describe('levels', () => {
  it('come at 100, 300, 600 and 1,000 XP in all', () => {
    const state = new AdventureState();
    const seen: [number, number][] = [];
    for (const at of [90, 100, 290, 300, 590, 600, 990, 1000]) {
      earn(state, at - state.xp);
      seen.push([state.xp, state.level]);
    }
    expect(seen).toEqual([[90, 1], [100, 2], [290, 2], [300, 3], [590, 3], [600, 4], [990, 4], [1000, 5]]);
  });

  it('each add 20 health and 20% damage: 100 and plain at level 1, 180 and 1.8 times at 5', () => {
    const state = new AdventureState();
    const seen: [number, number, number][] = [];
    for (const at of [0, 100, 300, 600, 1000]) {
      earn(state, at - state.xp);
      seen.push([state.level, state.stats.maxHp, state.stats.damage]);
    }
    expect(seen.map(([level, hp]) => [level, hp])).toEqual([[1, 100], [2, 120], [3, 140], [4, 160], [5, 180]]);
    [1, 1.2, 1.4, 1.6, 1.8].forEach((damage, i) => expect(seen[i][2]).toBeCloseTo(damage));
  });

  it("measure how far you are through yours, for the belt's XP bar, full at the cap", () => {
    const state = new AdventureState();
    const seen: number[] = [];
    for (const at of [0, 50, 100, 200, 450, 900, 1000]) {
      earn(state, at - state.xp);
      seen.push(state.progress);
    }
    expect(seen).toEqual([0, 0.5, 0, 0.5, 0.5, 0.75, 1]);
  });

  it('are reported by the kill that reaches them, with how far the next one is', () => {
    const state = new AdventureState();
    earn(state, 90);
    expect(levelUps(earn(state, 10))).toEqual([{ kind: 'level', level: 2, unlocks: ['warCry'] }]);
    expect(state.xpToNext).toBe(200);
  });
});

describe('abilities', () => {
  it('arrive with the War Cry at level 2 and Earthshaker at 3; levels 4 and 5 bring only health and damage', () => {
    const state = new AdventureState();
    const reached = levelUps(earn(state, 1000));
    expect(reached).toEqual([
      { kind: 'level', level: 2, unlocks: ['warCry'] },
      { kind: 'level', level: 3, unlocks: ['earthshaker'] },
      { kind: 'level', level: 4, unlocks: [] },
      { kind: 'level', level: 5, unlocks: [] },
    ]);
  });

  it('stay unlocked as you climb', () => {
    const state = new AdventureState();
    const seen: (readonly string[])[] = [];
    for (const at of [0, 100, 300, 600, 1000]) {
      earn(state, at - state.xp);
      seen.push(state.stats.abilities);
    }
    expect(seen).toEqual([[], ['warCry'], ['warCry', 'earthshaker'], ['warCry', 'earthshaker'], ['warCry', 'earthshaker']]);
  });

  it('come together when one kill passes two levels', () => {
    const state = new AdventureState();
    expect(state.apply(kill(10, 'warden', null))).toEqual([
      { kind: 'xp', amount: 300 },
      { kind: 'level', level: 2, unlocks: ['warCry'] },
      { kind: 'level', level: 3, unlocks: ['earthshaker'] },
    ]);
  });
});

describe('the level cap', () => {
  it('keeps only the XP up to 1,000, and says so', () => {
    const state = new AdventureState();
    earn(state, 990);
    expect(state.apply(kill(2))).toEqual([
      { kind: 'xp', amount: 10 },
      { kind: 'level', level: 5, unlocks: [] },
    ]);
    expect(state.xp).toBe(1000);
    expect(state.xpToNext).toBe(0);
  });

  it('drops every kill past it', () => {
    const state = new AdventureState();
    earn(state, 1000);
    expect(state.apply(kill(5, 'warden', null))).toEqual([]);
    expect(state.xp).toBe(1000);
    expect(state.level).toBe(5);
  });
});

describe("Hale's old longsword", () => {
  it('adds 0.2 to your damage multiplier, one level\'s step, and nothing to your health', () => {
    const plain = statsAt(5);
    const hale = statsAt(5, 'hale');
    expect(plain.damage).toBeCloseTo(1.8, 9);
    expect(hale.damage).toBeCloseTo(2.0, 9);
    expect(hale.maxHp).toBe(plain.maxHp);
    expect(hale.abilities).toEqual(plain.abilities);
    expect(statsAt(1, 'hale').damage).toBeCloseTo(statsAt(2).damage, 9);
  });

  it('is in your numbers once it is in your hand', () => {
    const state = new AdventureState({
      level: 5,
      xp: 1000,
      sword: 'hale',
      quests: { raiders: { stage: 'handedIn', counts: [3] }, lumber: { stage: 'handedIn', counts: [5, 1] }, below: { stage: 'handedIn', counts: [1] } },
      wardenBeaten: true,
    });
    expect(state.stats.damage).toBeCloseTo(2.0, 9);
    expect(new AdventureState().stats.damage).toBe(1);
  });
});

describe("an enemy's numbers", () => {
  const { grunt, archer, brute, warden } = CONFIG.enemies;
  const blows = (def: { attacks: readonly { damage: number }[] }) => def.attacks.map((a) => a.damage);

  it("at level 1 and out of a camp are the arena's, unchanged", () => {
    for (const def of [grunt, archer, brute, warden]) expect(enemyNumbers(def, 1, false)).toEqual(def);
  });

  it('take the same 20% step per level as yours, in health and every blow', () => {
    const at3 = enemyNumbers(grunt, 3, false);
    expect(at3.hp).toBe(63); // 45
    expect(blows(at3)).toEqual([20, 17, 17]); // 14, 12, 12
    const at5 = enemyNumbers(grunt, 5, false);
    expect(at5.hp).toBe(81);
    expect(blows(at5)).toEqual([25, 22, 22]);
    expect(enemyNumbers(archer, 2, false).hp).toBe(34); // 28
  });

  it('in a camp take 1.4 times on top of their level', () => {
    const farm = enemyNumbers(grunt, 1, true);
    expect(farm.hp).toBe(63);
    expect(blows(farm)).toEqual([20, 17, 17]);
    const lumber = enemyNumbers(grunt, 2, true);
    expect(lumber.hp).toBe(76); // 45 × 1.2 × 1.4 = 75.6
    expect(blows(lumber)).toEqual([24, 20, 20]);
    const dig = enemyNumbers(brute, 4, true);
    expect(dig.hp).toBe(381); // 170 × 1.6 × 1.4 = 380.8
    expect(blows(dig)).toEqual([49, 67]); // 22, 30
  });

  it('keep everything else about how it fights', () => {
    const { hp: _hp, attacks: _attacks, ...rest } = enemyNumbers(brute, 4, true);
    const { hp: _h, attacks: _a, ...today } = brute;
    expect(rest).toEqual(today);
    expect(enemyNumbers(brute, 4, true).attacks.map(({ damage: _d, ...a }) => a)).toEqual(brute.attacks.map(({ damage: _d, ...a }) => a));
  });
});
