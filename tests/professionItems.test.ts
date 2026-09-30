import { describe, expect, it } from 'vitest';
import { Inventory } from '../src/inventory';
import { buyPrice, CATALOGUE, type ConsumableItem, type GearItem, isPotion, numbersOf, sellPrice, stackOf } from '../src/items';

// Oakvale's professions items in the catalogue (.scratch/professions/spec.md,
// "Items added to the catalogue"): five materials, four consumables and the
// three copper gauntlets, and what the inventory does with them: stacking,
// selling, the belt, and spending what a make takes.

const MATERIALS = { 'copper-ore': 1, 'rough-stone': 1, 'copper-bar': 3, hearthleaf: 1, duskcap: 1 };
const CONSUMABLES = { 'rage-draught': 3, 'minor-mana-potion': 3, 'elixir-of-the-keen-eye': 4, whetstone: 2 };
const GAUNTLETS = ['strength', 'agility', 'intellect'] as const;

describe('the materials', () => {
  it.each(Object.entries(MATERIALS))('%s stacks to 20 and sells for %i', (id, price) => {
    const item = CATALOGUE[id];
    expect(item.kind).toBe('material');
    expect(stackOf(item)).toBe(20);
    expect(sellPrice(item)).toBe(price);
  });
});

describe('the consumables', () => {
  it.each(Object.entries(CONSUMABLES))('%s stacks to 10 and sells for %i', (id, price) => {
    const item = CATALOGUE[id];
    expect(item.kind).toBe('consumable');
    expect(stackOf(item)).toBe(10);
    expect(sellPrice(item)).toBe(price);
    expect(buyPrice(item)).toBe(price * 4);
  });

  it('carry their numbers: 30 rage, 40% of mana, +10% damage for 5 minutes, +5% for 10', () => {
    const c = (id: string) => CATALOGUE[id] as ConsumableItem;
    expect(c('rage-draught').rage).toBe(30);
    expect(c('minor-mana-potion').mana).toBe(0.4);
    expect(c('elixir-of-the-keen-eye').buff).toEqual({ kind: 'elixir', damage: 0.1, seconds: 300 });
    expect(c('whetstone').buff).toEqual({ kind: 'whetstone', damage: 0.05, seconds: 600, for: ['warrior', 'ranger'] });
    // None of them heals: the minor healing potion is still the one that does.
    for (const id of Object.keys(CONSUMABLES)) expect(c(id).heal).toBe(0);
    expect(c('minor-healing-potion').heal).toBe(0.4);
  });

  it('are potions, on the shared cooldown, except the two buffs', () => {
    expect(isPotion(CATALOGUE['minor-healing-potion'])).toBe(true);
    expect(isPotion(CATALOGUE['rage-draught'])).toBe(true);
    expect(isPotion(CATALOGUE['minor-mana-potion'])).toBe(true);
    expect(isPotion(CATALOGUE['elixir-of-the-keen-eye'])).toBe(false);
    expect(isPotion(CATALOGUE.whetstone)).toBe(false);
    expect(isPotion(CATALOGUE['copper-ore'])).toBe(false);
  });

  it('go on the belt, but never the whetstone', () => {
    const inv = new Inventory({ class: 'warrior', level: 1 });
    inv.take([
      { id: 'rage-draught', count: 1 },
      { id: 'whetstone', count: 1 },
    ]);
    expect(inv.move({ in: 'bag', slot: 1 }, { in: 'belt', slot: 0 }).some((e) => e.kind === 'refused')).toBe(true);
    expect(inv.belt[0]).toBeNull();
    expect(inv.move({ in: 'bag', slot: 0 }, { in: 'belt', slot: 0 }).some((e) => e.kind === 'refused')).toBe(false);
    expect(inv.belt[0]).toEqual({ id: 'rage-draught', count: 1 });
  });
});

describe('the copper gauntlets', () => {
  /** A green pair of gloves of item level 5, as a drop would be. */
  const drop = (main: GearItem['main']): GearItem => ({ id: 'drop', name: 'Drop', kind: 'gear', slot: 'hands', level: 5, rarity: 'green', model: 'test', main });

  it.each(GAUNTLETS)('of %s are a green of item level 5 for the hands, as good as a green drop', (main) => {
    const item = CATALOGUE[`copper-gauntlets-of-${main}`] as GearItem;
    expect(item).toMatchObject({ kind: 'gear', slot: 'hands', level: 5, rarity: 'green', main });
    expect(item.class).toBeUndefined();
    expect(stackOf(item)).toBe(1);
    expect(numbersOf(item)).toEqual(numbersOf(drop(main)));
  });

  it('carry the rule\'s numbers at item level 5: 30 armour, 1 Stamina and 1 of their attribute, selling for 40', () => {
    for (const main of GAUNTLETS) {
      const item = CATALOGUE[`copper-gauntlets-of-${main}`] as GearItem;
      expect(numbersOf(item)).toEqual({ damage: 0, armour: 30, stamina: 1, main: { attribute: main, points: 1 } });
      expect(sellPrice(item)).toBe(40);
    }
  });

  it('are worn in the hands at level 5, not before', () => {
    const inv = new Inventory({ class: 'mage', level: 4 });
    inv.take([{ id: 'copper-gauntlets-of-intellect', count: 1 }]);
    const hands = { in: 'gear', slot: 'hands' } as const;
    expect(inv.move({ in: 'bag', slot: 0 }, hands)).toContainEqual({ kind: 'refused', reason: 'level', where: hands });
    const five = new Inventory({ class: 'mage', level: 5 });
    five.take([{ id: 'copper-gauntlets-of-intellect', count: 1 }]);
    five.move({ in: 'bag', slot: 0 }, hands);
    expect(five.gear.hands).toBe('copper-gauntlets-of-intellect');
  });
});

describe("the inventory's spending", () => {
  it('counts what the bag holds of an item, across its stacks', () => {
    const inv = new Inventory({ class: 'warrior', level: 1 });
    inv.take([{ id: 'hearthleaf', count: 25 }]);
    expect(inv.count('hearthleaf')).toBe(25);
    expect(inv.count('duskcap')).toBe(0);
  });

  it('takes items and coins out, all or nothing', () => {
    const inv = new Inventory({ class: 'warrior', level: 1 });
    inv.take([{ id: 'hearthleaf', count: 3 }], 10);
    expect(inv.spend([{ id: 'hearthleaf', count: 4 }])).toEqual([{ kind: 'refused', reason: 'empty' }]);
    expect(inv.spend([{ id: 'hearthleaf', count: 1 }], 11)).toEqual([{ kind: 'refused', reason: 'coins' }]);
    expect(inv.count('hearthleaf')).toBe(3);
    expect(inv.coins).toBe(10);
    inv.spend([{ id: 'hearthleaf', count: 3 }], 10);
    expect(inv.bag[0]).toBeNull();
    expect(inv.coins).toBe(0);
  });

  it('adds up an item named twice before checking there is enough', () => {
    const inv = new Inventory({ class: 'warrior', level: 1 });
    inv.take([{ id: 'duskcap', count: 3 }]);
    const twice = [
      { id: 'duskcap', count: 2 },
      { id: 'duskcap', count: 2 },
    ];
    expect(inv.spend(twice)).toEqual([{ kind: 'refused', reason: 'empty' }]);
    expect(inv.count('duskcap')).toBe(3);
  });
});
