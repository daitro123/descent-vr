import { describe, expect, it } from 'vitest';
import type { Role } from '../src/adventureState';
import { CATALOGUE, CLASS_MAIN, type ClassId, GEAR_SLOTS, type GearItem, itemOf, JUNK, LOOT_LEVELS, type Rarity } from '../src/items';
import { type Fallen, type Loot, lootSeed, rollLoot, seeded } from '../src/loot';
import type { Family } from '../src/models/characters';

// Loot, rolled from a seed: over many rolls each role lands the spec's rates
// (.scratch/inventory/issues/05-loot.md), the Warden always drops a blue and a
// green, what it raises drops nothing, and every drop is at the enemy's level
// and for your class.

const ROLLS = 20000;

/** `ROLLS` kills of `fallen`, one seed each. */
function many(fallen: Fallen, klass: ClassId = 'warrior'): Loot[] {
  return Array.from({ length: ROLLS }, (_, i) => rollLoot(fallen, klass, seeded(lootSeed('test', i))));
}

const kill = (role: Role, level = 2, family: Family = 'bandit'): Fallen => ({ role, level, family });

/** The items of `loot` of `kind` (junk or gear), with their catalogue entries. */
const itemsOf = (loot: Loot[], kind: 'junk' | 'gear') => loot.flatMap((l) => l.items.map((id) => itemOf(id)!).filter((i) => i.kind === kind));

/** The share of `loot` with any item of `kind`, and of each gear rarity. */
function rates(loot: Loot[]) {
  const share = (test: (l: Loot) => boolean) => loot.filter(test).length / loot.length;
  const has = (l: Loot, test: (id: string) => boolean) => l.items.some(test);
  const rarity = (r: Rarity) => share((l) => has(l, (id) => itemOf(id)!.kind === 'gear' && itemOf(id)!.rarity === r));
  return { junk: share((l) => has(l, (id) => itemOf(id)!.kind === 'junk')), white: rarity('white'), green: rarity('green'), blue: rarity('blue') };
}

describe('a roll', () => {
  it('is the same for the same seed, and differs across seeds', () => {
    const roll = (seed: number) => rollLoot(kill('leader'), 'warrior', seeded(seed));
    expect(roll(7)).toEqual(roll(7));
    expect(new Set(Array.from({ length: 50 }, (_, i) => JSON.stringify(roll(i)))).size).toBeGreaterThan(10);
  });

  it('seeds from the camp, the enemy and the time', () => {
    expect(lootSeed('farm', 0, 1200)).toBe(lootSeed('farm', 0, 1200));
    expect(lootSeed('farm', 0, 1200)).not.toBe(lootSeed('farm', 1, 1200));
    expect(lootSeed('farm', 0, 1200)).not.toBe(lootSeed('lumberCamp', 0, 1200));
    expect(lootSeed('farm', 0, 1200)).not.toBe(lootSeed('farm', 0, 1201));
  });
});

describe('each role', () => {
  it('an ordinary enemy: 1 to 3 × its level in coins, junk 40%, a white 8% and a green 3%', () => {
    const loot = many(kill('ordinary', 2));
    const coins = loot.map((l) => l.coins);
    expect(Math.min(...coins)).toBe(2);
    expect(Math.max(...coins)).toBe(6);
    // Every whole number in between, about evenly.
    for (let c = 2; c <= 6; c++) expect(coins.filter((n) => n === c).length / ROLLS).toBeCloseTo(0.2, 1);
    const r = rates(loot);
    expect(r.junk).toBeCloseTo(0.4, 1);
    expect(Math.abs(r.white - 0.08)).toBeLessThan(0.01);
    expect(Math.abs(r.green - 0.03)).toBeLessThan(0.01);
    expect(r.blue).toBe(0);
    // At most one piece of gear.
    expect(loot.every((l) => itemsOf([l], 'gear').length <= 1)).toBe(true);
  });

  for (const role of ['leader', 'deepBrute'] as const) {
    it(`a ${role}: three times the coins, junk 60%, and always one piece, 75% green and 25% blue`, () => {
      const loot = many(kill(role, 4, role === 'leader' ? 'bandit' : 'undead'));
      const coins = loot.map((l) => l.coins);
      expect(Math.min(...coins)).toBe(12);
      expect(Math.max(...coins)).toBe(36);
      const r = rates(loot);
      expect(Math.abs(r.junk - 0.6)).toBeLessThan(0.02);
      expect(Math.abs(r.green - 0.75)).toBeLessThan(0.02);
      expect(Math.abs(r.blue - 0.25)).toBeLessThan(0.02);
      expect(r.white).toBe(0);
      expect(loot.every((l) => itemsOf([l], 'gear').length === 1)).toBe(true);
    });
  }

  it('the Warden: ten times the coins, no junk, and a blue and a green every time', () => {
    const loot = many(kill('warden', 5, 'undead'));
    const coins = loot.map((l) => l.coins);
    expect(Math.min(...coins)).toBe(50);
    expect(Math.max(...coins)).toBe(150);
    for (const l of loot) {
      expect(itemsOf([l], 'junk')).toEqual([]);
      expect(itemsOf([l], 'gear').map((i) => i.rarity)).toEqual(['blue', 'green']);
    }
  });

  it('what the Warden raises: nothing at all', () => {
    for (const l of many(kill('raised', 5, 'undead'))) expect(l).toEqual({ coins: 0, items: [] });
  });
});

describe('what drops', () => {
  it("is the enemy's family's junk: bandits' trinkets and cloth, the undead's charms and dust", () => {
    const bases = (family: Family) => new Set(itemsOf(many(kill('leader', 3, family)), 'junk').map((i) => i.id.replace(/-\d+$/, '')));
    expect(bases('bandit')).toEqual(new Set(['worn-trinket', 'torn-cloth']));
    expect(bases('undead')).toEqual(new Set(['bone-charm', 'grave-dust']));
  });

  it("is at the enemy's level, up to the loot levels", () => {
    for (const level of [1, 2, 3, 4, 5]) {
      const items = many(kill('leader', level)).flatMap((l) => l.items.map((id) => itemOf(id)!));
      expect(new Set(items.map((i) => i.level))).toEqual(new Set([level]));
    }
    const past = many(kill('leader', 9)).flatMap((l) => l.items.map((id) => itemOf(id)!.level));
    expect(new Set(past)).toEqual(new Set([LOOT_LEVELS.at(-1)]));
  });

  it("is always gear your class can use: its weapons and off hands, and armour carrying its main attribute", () => {
    for (const klass of ['warrior', 'ranger', 'mage'] as const) {
      const gear = itemsOf(many(kill('leader', 3), klass), 'gear') as GearItem[];
      expect(gear.length).toBe(ROLLS);
      for (const item of gear) {
        if (item.class) expect(item.class).toBe(klass);
        else expect(item.main).toBe(CLASS_MAIN[klass]);
      }
    }
  });

  it('comes in every slot for every class', () => {
    const slots = (klass: ClassId) => new Set((itemsOf(many(kill('leader', 3), klass), 'gear') as GearItem[]).map((i) => i.slot));
    for (const klass of ['warrior', 'ranger', 'mage'] as const) expect(slots(klass), klass).toEqual(new Set(GEAR_SLOTS));
  });
});

describe('the catalogue', () => {
  it('has a white, a green and a blue for every slot at every loot level', () => {
    for (const level of LOOT_LEVELS)
      for (const slot of GEAR_SLOTS)
        for (const rarity of ['white', 'green', 'blue'] as const)
          expect(
            Object.values(CATALOGUE).some((i) => i.kind === 'gear' && i.loot && i.slot === slot && i.level === level && i.rarity === rarity),
            `${slot} ${rarity} ${level}`,
          ).toBe(true);
  });

  it("has each family's junk at every loot level, grey and worth its level × 2", () => {
    for (const kinds of Object.values(JUNK))
      for (const [base, name] of kinds)
        for (const level of LOOT_LEVELS) expect(itemOf(`${base}-${level}`)).toMatchObject({ kind: 'junk', rarity: 'grey', level, name });
  });
});
