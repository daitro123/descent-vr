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

describe('using what professions make', () => {
  const bag = (slot: number) => ({ in: 'bag', slot }) as const;
  const belt = (slot: number) => ({ in: 'belt', slot }) as const;
  const refusals = (effects: ReturnType<Inventory['use']>) => effects.flatMap((e) => (e.kind === 'refused' ? [e.reason] : []));
  /** A `klass` of level 1 carrying `ids`, one of each, from the bag's first slot. */
  const carrying = (ids: string[], klass: 'warrior' | 'ranger' | 'mage' = 'warrior') => {
    const inv = new Inventory({ class: klass, level: 1 });
    inv.take(ids.map((id) => ({ id, count: 1 })));
    return inv;
  };

  it('drinks the rage draught for 30 rage and the mana potion for 40% of mana', () => {
    const inv = carrying(['rage-draught', 'minor-mana-potion']);
    expect(inv.use(bag(0))).toContainEqual({ kind: 'drank', id: 'rage-draught', heal: 0, rage: 30 });
    inv.tick(60);
    expect(inv.use(bag(1))).toContainEqual({ kind: 'drank', id: 'minor-mana-potion', heal: 0, mana: 0.4 });
    expect(inv.bag.slice(0, 2)).toEqual([null, null]);
  });

  it('shares the 60 s cooldown between the rage draught, the mana potion and the healing potion', () => {
    const inv = carrying(['rage-draught', 'minor-mana-potion']);
    inv.move(bag(0), belt(0));
    // The healing potions on the right hip, the rage draught on the left, the mana potion in the bag.
    expect(inv.drink(0)).toContainEqual({ kind: 'cooldown', seconds: 60 });
    expect(refusals(inv.drink(1))).toEqual(['cooldown']);
    expect(refusals(inv.use(bag(1)))).toEqual(['cooldown']);
    inv.tick(60);
    expect(refusals(inv.drink(1))).toEqual([]);
    expect(refusals(inv.use(bag(1)))).toEqual(['cooldown']);
  });

  it('puts on the elixir and the whetstone off the cooldown, each reporting its buff', () => {
    const inv = carrying(['elixir-of-the-keen-eye', 'whetstone']);
    inv.drink(1);
    expect(inv.use(bag(0))).toEqual([
      { kind: 'buff', id: 'elixir-of-the-keen-eye', buff: 'elixir', damage: 0.1, seconds: 300 },
      { kind: 'slot', where: bag(0), stack: null },
    ]);
    expect(inv.use(bag(1))).toContainEqual({ kind: 'buff', id: 'whetstone', buff: 'whetstone', damage: 0.05, seconds: 600 });
    expect(inv.cooldown).toBe(60);
    expect(inv.buffs.map((b) => [b.kind, b.left])).toEqual([
      ['elixir', 300],
      ['whetstone', 600],
    ]);
    expect(inv.boost).toBeCloseTo(0.15, 9);
  });

  it('replaces a buff with a second of its kind, for its whole time again', () => {
    const inv = new Inventory({ class: 'ranger', level: 1 });
    inv.take([{ id: 'whetstone', count: 2 }]);
    inv.use(bag(0));
    inv.tick(400);
    expect(inv.buffs).toEqual([{ kind: 'whetstone', id: 'whetstone', damage: 0.05, left: 200 }]);
    inv.use(bag(0));
    expect(inv.buffs).toEqual([{ kind: 'whetstone', id: 'whetstone', damage: 0.05, left: 600 }]);
    expect(inv.boost).toBe(0.05);
  });

  it('runs a buff out, reporting it as it ends', () => {
    const inv = carrying(['elixir-of-the-keen-eye']);
    inv.use(bag(0));
    expect(inv.tick(299)).toEqual([]);
    expect(inv.tick(1)).toEqual([{ kind: 'buffEnded', buff: 'elixir' }]);
    expect(inv.buffs).toEqual([]);
    expect(inv.boost).toBe(0);
  });

  it('drinks the elixir from the belt without dimming it', () => {
    const inv = carrying(['elixir-of-the-keen-eye']);
    inv.move(bag(0), belt(0));
    inv.drink(1);
    expect(refusals(inv.drink(0))).toEqual([]);
    expect(inv.buffs.map((b) => b.kind)).toEqual(['elixir']);
    expect(inv.cooldown).toBe(60);
  });

  it("refuses the whetstone to the mage, who has no blade, and keeps it", () => {
    const inv = carrying(['whetstone'], 'mage');
    expect(refusals(inv.use(bag(0)))).toEqual(['class']);
    expect(inv.bag[0]).toEqual({ id: 'whetstone', count: 1 });
    expect(inv.buffs).toEqual([]);
  });

  it('uses only a consumable, from the bag or the belt', () => {
    const inv = carrying(['copper-ore']);
    expect(refusals(inv.use(bag(0)))).toEqual(['empty']);
    expect(refusals(inv.use(bag(5)))).toEqual(['empty']);
    expect(refusals(inv.use({ in: 'stash', slot: 0 }))).toEqual(['slot']);
  });

  it('keeps no buff in the save', () => {
    const inv = carrying(['whetstone']);
    inv.use(bag(0));
    expect(new Inventory({ class: 'warrior', level: 1 }, inv.snapshot()).buffs).toEqual([]);
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
