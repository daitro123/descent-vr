import { describe, expect, it } from 'vitest';
import { Inventory, type InventoryEffect, type Stack, startingInventory, type Wearer, type Where } from '../src/inventory';
import type { ClassId } from '../src/items';

// The inventory module at its seam: moves and operations in, what a player
// would notice out: what's in a slot, what a number became, what was refused
// and why, what dropped, what a coin total is (.scratch/inventory/spec.md,
// "The inventory state" and Testing Decisions).

const warrior = (level = 1): Wearer => ({ class: 'warrior', level });
const bag = (slot: number): Where => ({ in: 'bag', slot });
const stash = (slot: number): Where => ({ in: 'stash', slot });
const belt = (slot: number): Where => ({ in: 'belt', slot });
const MAIN: Where = { in: 'gear', slot: 'mainHand' };
const CHEST: Where = { in: 'gear', slot: 'chest' };
const FEET: Where = { in: 'gear', slot: 'feet' };
const GROUND: Where = { in: 'ground' };
const LEFT_HIP = belt(0);
const RIGHT_HIP = belt(1);

const potions = (count: number): Stack => ({ id: 'minor-healing-potion', count });
const refusals = (effects: InventoryEffect[]) => effects.flatMap((e) => (e.kind === 'refused' ? [e.reason] : []));

/** A warrior of `level` whose bag holds `stacks`, from its first slot. */
function carrying(stacks: Stack[], level = 1): Inventory {
  const inv = new Inventory(warrior(level));
  inv.take(stacks);
  return inv;
}

/** Fill every bag slot with a single worn tunic. */
const fullBag = (inv: Inventory) => inv.take(Array.from({ length: 16 }, () => ({ id: 'worn-tunic', count: 1 })));

describe('a new character', () => {
  it('is a warrior in the starting kit, with three minor healing potions on the right hip', () => {
    const inv = new Inventory(warrior());
    expect(inv.gear).toEqual({
      mainHand: 'plain-sword',
      offHand: 'round-shield',
      head: null,
      chest: 'worn-tunic',
      hands: null,
      legs: null,
      feet: 'worn-boots',
    });
    expect(inv.belt).toEqual([null, potions(3)]);
    expect(inv.bag).toEqual(Array(16).fill(null));
    expect(inv.stash).toHaveLength(32);
    expect(inv.coins).toBe(0);
    expect(inv.quest).toEqual([]);
  });

  it.each([
    ['ranger', 'short-bow', 'quiver'],
    ['mage', 'apprentice-wand', 'glass-focus'],
  ] as [ClassId, string, string][])("starts a %s with their class's white weapon and off hand", (klass, weapon, offHand) => {
    const inv = new Inventory({ class: klass, level: 1 });
    expect(inv.gear).toMatchObject({ mainHand: weapon, offHand, chest: 'worn-tunic', feet: 'worn-boots' });
  });
});

describe('stacking and splitting', () => {
  it('stacks potions and junk to 10 a slot as they come in', () => {
    const inv = carrying([potions(25), { id: 'torn-cloth-1', count: 4 }]);
    expect(inv.bag.slice(0, 5)).toEqual([potions(10), potions(10), potions(5), { id: 'torn-cloth-1', count: 4 }, null]);
  });

  it('tops up a stack that has room before using an empty slot', () => {
    const inv = carrying([potions(4)]);
    inv.take([{ id: 'worn-tunic', count: 1 }, potions(8)]);
    expect(inv.bag.slice(0, 4)).toEqual([potions(10), { id: 'worn-tunic', count: 1 }, potions(2), null]);
  });

  it('splits part of a stack into an empty slot', () => {
    const inv = carrying([potions(7)]);
    inv.move(bag(0), bag(5), 3);
    expect(inv.at(bag(0))).toEqual(potions(4));
    expect(inv.at(bag(5))).toEqual(potions(3));
  });

  it('stacks onto the same item as far as a stack goes, leaving the rest', () => {
    const inv = carrying([potions(10), potions(6)]);
    inv.move(bag(0), bag(9), 2);
    inv.move(bag(1), bag(9));
    expect(inv.at(bag(9))).toEqual(potions(8));
    expect(inv.at(bag(1))).toBeNull();
    expect(inv.at(bag(0))).toEqual(potions(8));
    const effects = inv.move(bag(0), bag(9));
    expect(inv.at(bag(9))).toEqual(potions(10));
    expect(inv.at(bag(0))).toEqual(potions(6));
    expect(effects).toContainEqual({ kind: 'slot', where: bag(9), stack: potions(10) });
    expect(refusals(inv.move(bag(0), bag(9)))).toEqual(['full']);
  });

  it("won't split a stack onto another item", () => {
    const inv = carrying([potions(6), { id: 'torn-cloth-1', count: 2 }]);
    expect(refusals(inv.move(bag(0), bag(1), 2))).toEqual(['slot']);
    expect(inv.at(bag(0))).toEqual(potions(6));
  });
});

describe('wearing gear', () => {
  it("swaps what you wore back into the piece's old slot", () => {
    const inv = carrying([{ id: 'hale-longsword', count: 1 }], 5);
    const effects = inv.move(bag(0), MAIN);
    expect(inv.gear.mainHand).toBe('hale-longsword');
    expect(inv.at(bag(0))).toEqual({ id: 'plain-sword', count: 1 });
    expect(effects).toEqual([
      { kind: 'slot', where: MAIN, stack: { id: 'hale-longsword', count: 1 } },
      { kind: 'slot', where: bag(0), stack: { id: 'plain-sword', count: 1 } },
    ]);
  });

  it('takes a piece off into an empty bag slot', () => {
    const inv = new Inventory(warrior());
    inv.move(CHEST, bag(3));
    expect(inv.gear.chest).toBeNull();
    expect(inv.at(bag(3))).toEqual({ id: 'worn-tunic', count: 1 });
  });

  it('refuses gear above your level, until you reach it', () => {
    const you = { class: 'warrior' as const, level: 4 };
    const inv = new Inventory(you);
    inv.take([{ id: 'hale-longsword', count: 1 }]);
    expect(inv.move(bag(0), MAIN)).toEqual([{ kind: 'refused', reason: 'level', where: MAIN }]);
    expect(inv.gear.mainHand).toBe('plain-sword');
    you.level = 5;
    expect(refusals(inv.move(bag(0), MAIN))).toEqual([]);
    expect(inv.gear.mainHand).toBe('hale-longsword');
  });

  it("refuses a weapon or off hand of another class, but armour fits anyone", () => {
    const inv = carrying([{ id: 'short-bow', count: 1 }, { id: 'glass-focus', count: 1 }]);
    expect(refusals(inv.move(bag(0), MAIN))).toEqual(['class']);
    expect(refusals(inv.move(bag(1), { in: 'gear', slot: 'offHand' }))).toEqual(['class']);
    const ranger = new Inventory({ class: 'ranger', level: 1 });
    ranger.move(CHEST, bag(0));
    expect(refusals(ranger.move(bag(0), CHEST))).toEqual([]);
  });

  it('refuses a slot of the wrong kind', () => {
    const inv = carrying([{ id: 'worn-tunic', count: 1 }, potions(2), { id: 'torn-cloth-1', count: 1 }]);
    expect(refusals(inv.move(bag(0), FEET))).toEqual(['slot']);
    expect(refusals(inv.move(bag(1), CHEST))).toEqual(['slot']);
    expect(refusals(inv.move(bag(0), LEFT_HIP))).toEqual(['slot']);
    expect(refusals(inv.move(bag(2), LEFT_HIP))).toEqual(['slot']);
  });

  it("refuses a swap that would put what's there somewhere it can't go", () => {
    const inv = carrying([{ id: 'worn-tunic', count: 1 }]);
    // The potions on the belt onto the tunic: the tunic can't go on the belt.
    expect(refusals(inv.move(RIGHT_HIP, bag(0)))).toEqual(['slot']);
    expect(inv.at(RIGHT_HIP)).toEqual(potions(3));
  });

  it('adds up what you wear through the rule', () => {
    const inv = new Inventory(warrior(5));
    const kit = inv.numbers;
    expect(kit.armour).toBe(17); // round shield 5, worn tunic 8, worn boots 4
    expect(kit.stamina).toBe(0);
    inv.take([{ id: 'hale-longsword', count: 1 }]);
    inv.move(bag(0), MAIN);
    expect(inv.numbers.damage).toBeCloseTo(0.2, 9);
    inv.move(CHEST, bag(5));
    expect(inv.numbers.armour).toBe(9);
  });
});

describe('the belt', () => {
  it('takes only potions, and puts them back in the bag', () => {
    const inv = carrying([potions(4)]);
    inv.move(bag(0), LEFT_HIP);
    expect(inv.belt).toEqual([potions(4), potions(3)]);
    inv.move(LEFT_HIP, bag(2), 1);
    expect(inv.at(bag(2))).toEqual(potions(1));
  });

  it('drinks a potion for 40% of your health and dims the whole belt for 60 s', () => {
    const inv = carrying([potions(4)]);
    inv.move(bag(0), LEFT_HIP);
    expect(inv.drink(1)).toEqual([
      { kind: 'drank', id: 'minor-healing-potion', heal: 0.4 },
      { kind: 'slot', where: RIGHT_HIP, stack: potions(2) },
      { kind: 'cooldown', seconds: 60 },
    ]);
    expect(inv.drink(0)).toEqual([{ kind: 'refused', reason: 'cooldown', where: LEFT_HIP }]);
    inv.tick(59);
    expect(refusals(inv.drink(1))).toEqual(['cooldown']);
    inv.tick(1);
    expect(inv.cooldown).toBe(0);
    expect(refusals(inv.drink(0))).toEqual([]);
    expect(inv.belt).toEqual([potions(3), potions(2)]);
  });

  it('refills a slot drunk empty from the bag', () => {
    const inv = carrying([{ id: 'torn-cloth-1', count: 1 }, potions(5)]);
    for (let i = 0; i < 2; i++) {
      inv.drink(1);
      inv.tick(60);
    }
    const effects = inv.drink(1);
    expect(effects).toContainEqual({ kind: 'slot', where: RIGHT_HIP, stack: potions(5) });
    expect(inv.at(RIGHT_HIP)).toEqual(potions(5));
    expect(inv.at(bag(1))).toBeNull();
  });

  it('stacks a potion carried onto a hip up to a stack, and says so before it is let go', () => {
    const inv = carrying([potions(9), { id: 'worn-tunic', count: 1 }]);
    expect(inv.check(bag(0), RIGHT_HIP)).toBeNull();
    inv.move(bag(0), RIGHT_HIP);
    expect(inv.at(RIGHT_HIP)).toEqual(potions(10));
    expect(inv.at(bag(0))).toEqual(potions(2));
    expect(inv.check(bag(0), RIGHT_HIP)).toBe('full');
    expect(inv.check(bag(1), LEFT_HIP)).toBe('slot');
    expect(inv.check(bag(0), LEFT_HIP)).toBeNull();
  });

  it('keeps the cooldown running through a drink from either hip, and refills from that potion only', () => {
    const inv = carrying([{ id: 'torn-cloth-1', count: 1 }, potions(2)]);
    inv.move(bag(1), LEFT_HIP, 1);
    expect(inv.drink(0).map((e) => e.kind)).toEqual(['drank', 'slot', 'cooldown', 'slot', 'slot']);
    expect(inv.at(LEFT_HIP)).toEqual(potions(1));
    expect(inv.at(bag(0))).toEqual({ id: 'torn-cloth-1', count: 1 });
    inv.tick(30);
    expect(inv.cooldown).toBe(30);
    expect(refusals(inv.drink(1))).toEqual(['cooldown']);
  });

  it('refuses to drink from an empty slot, and stays empty with none left in the bag', () => {
    const inv = new Inventory(warrior());
    expect(refusals(inv.drink(0))).toEqual(['empty']);
    for (let i = 0; i < 3; i++) {
      inv.drink(1);
      inv.tick(60);
    }
    expect(inv.belt).toEqual([null, null]);
    expect(refusals(inv.drink(1))).toEqual(['empty']);
  });
});

describe('taking loot in', () => {
  it('always takes the coins, and puts quest items on their page, taking no slot', () => {
    const inv = new Inventory(warrior());
    fullBag(inv);
    const effects = inv.take([{ id: 'leaders-orders', count: 1 }, { id: 'torn-cloth-1', count: 2 }], 7);
    expect(inv.coins).toBe(7);
    expect(inv.quest).toEqual(['leaders-orders']);
    expect(effects).toContainEqual({ kind: 'coins', coins: 7 });
    expect(effects).toContainEqual({ kind: 'left', stack: { id: 'torn-cloth-1', count: 2 } });
  });

  it("reports what didn't fit, having filled what it could", () => {
    const inv = new Inventory(warrior());
    inv.take(Array.from({ length: 15 }, () => ({ id: 'worn-tunic', count: 1 })));
    const effects = inv.take([potions(14)]);
    expect(inv.at(bag(15))).toEqual(potions(10));
    expect(effects.filter((e) => e.kind === 'left')).toEqual([{ kind: 'left', stack: potions(4) }]);
  });

  it('opens a chest once, taking its coins and items', () => {
    const inv = new Inventory(warrior());
    const first = inv.openChest('watchtower', [{ id: 'worn-boots', count: 1 }], 10);
    expect(first[0]).toEqual({ kind: 'chest', chest: 'watchtower' });
    expect(inv.coins).toBe(10);
    expect(inv.isOpened('watchtower')).toBe(true);
    expect(inv.openChest('watchtower', [{ id: 'worn-boots', count: 1 }], 10)).toEqual([]);
    expect(inv.coins).toBe(10);
    expect(inv.chests).toEqual(['watchtower']);
  });
});

describe('dropping', () => {
  it('lets go of an item on the ground, emptying its slot', () => {
    const inv = carrying([potions(6)]);
    expect(inv.move(bag(0), GROUND, 2)).toEqual([
      { kind: 'slot', where: bag(0), stack: potions(4) },
      { kind: 'dropped', stack: potions(2) },
    ]);
    inv.move(CHEST, GROUND);
    expect(inv.gear.chest).toBeNull();
  });

  it('never drops, sells or stashes a quest item', () => {
    const inv = carrying([{ id: 'leaders-orders', count: 1 }]);
    const orders: Where = { in: 'quest', slot: 0 };
    expect(refusals(inv.move(orders, GROUND))).toEqual(['quest']);
    expect(refusals(inv.move(orders, stash(0)))).toEqual(['quest']);
    expect(refusals(inv.move(orders, bag(0)))).toEqual(['quest']);
    expect(refusals(inv.sell(orders))).toEqual(['quest']);
    expect(inv.quest).toEqual(['leaders-orders']);
  });

  it('gives a quest item up at its hand-in', () => {
    const inv = carrying([{ id: 'leaders-orders', count: 1 }]);
    expect(inv.giveUp('leaders-orders')).toEqual([{ kind: 'slot', where: { in: 'quest', slot: 0 }, stack: null }]);
    expect(inv.quest).toEqual([]);
  });

  it('refuses to move from an empty slot, or into a slot there isn\'t', () => {
    const inv = new Inventory(warrior());
    expect(refusals(inv.move(bag(4), bag(5)))).toEqual(['empty']);
    expect(refusals(inv.move(CHEST, bag(16)))).toEqual(['slot']);
    expect(refusals(inv.move(RIGHT_HIP, belt(2)))).toEqual(['slot']);
  });
});

describe('vendors', () => {
  it('sell at the rule, and buy at 4 times it', () => {
    const inv = carrying([{ id: 'torn-cloth-1', count: 3 }]);
    expect(inv.sell(bag(0))).toContainEqual({ kind: 'coins', coins: 6 });
    expect(inv.buy('minor-healing-potion')).toEqual([{ kind: 'refused', reason: 'coins' }]);
    expect(inv.coins).toBe(6);
    inv.take([], 2);
    inv.buy('minor-healing-potion');
    expect(inv.coins).toBe(0);
    expect(inv.at(bag(0))).toEqual(potions(1));
  });

  it('buys into the bag slot you carry it to, stacking onto the same item', () => {
    const inv = carrying([potions(2)]);
    inv.take([], 100);
    inv.buy('minor-healing-potion', 1, bag(0));
    expect(inv.at(bag(0))).toEqual(potions(3));
    inv.buy('worn-boots', 1, bag(7));
    expect(inv.at(bag(7))).toEqual({ id: 'worn-boots', count: 1 });
    expect(inv.coins).toBe(100 - 8 - 12);
    expect(refusals(inv.buy('worn-tunic', 1, bag(7)))).toEqual(['full']);
    expect(refusals(inv.buy('worn-tunic', 1, CHEST))).toEqual(['slot']);
    expect(inv.coins).toBe(80);
  });

  it('refuses a purchase with no room in the bag, keeping your coins', () => {
    const inv = new Inventory(warrior());
    fullBag(inv);
    inv.take([], 50);
    expect(refusals(inv.buy('minor-healing-potion'))).toEqual(['full']);
    expect(inv.coins).toBe(50);
  });

  it('keeps the last six things sold, newest first, to buy back at what they fetched', () => {
    const inv = carrying(Array.from({ length: 7 }, () => ({ id: 'worn-tunic', count: 1 })));
    for (let slot = 0; slot < 7; slot++) inv.sell(bag(slot));
    expect(inv.coins).toBe(21);
    expect(inv.sold).toHaveLength(6);
    expect(inv.sold[0]).toEqual({ id: 'worn-tunic', count: 1, price: 3 });
    const effects = inv.buyBack(0);
    expect(inv.coins).toBe(18);
    expect(inv.at(bag(0))).toEqual({ id: 'worn-tunic', count: 1 });
    expect(inv.sold).toHaveLength(5);
    expect(effects).toContainEqual({ kind: 'sold', row: inv.sold });
  });

  it('refuses a buyback you can\'t afford, and clears the Sold row when you leave the zone', () => {
    const inv = carrying([{ id: 'torn-cloth-1', count: 5 }]);
    inv.sell(bag(0), 2);
    expect(inv.at(bag(0))).toEqual({ id: 'torn-cloth-1', count: 3 });
    inv.sell(FEET);
    expect(inv.sold).toEqual([
      { id: 'worn-boots', count: 1, price: 3 },
      { id: 'torn-cloth-1', count: 2, price: 4 },
    ]);
    inv.take([], 1);
    inv.buy('minor-healing-potion');
    expect(inv.coins).toBe(0);
    expect(inv.buyBack(1)).toEqual([{ kind: 'refused', reason: 'coins' }]);
    expect(inv.sold).toHaveLength(2);
    expect(inv.leaveZone()).toEqual([{ kind: 'sold', row: [] }]);
    expect(inv.sold).toEqual([]);
    expect(refusals(inv.buyBack(0))).toEqual(['empty']);
  });

  it('sells every grey in the bag at once, and nothing else', () => {
    const inv = carrying([{ id: 'torn-cloth-1', count: 3 }, potions(2), { id: 'bone-charm-1', count: 1 }, { id: 'worn-tunic', count: 1 }]);
    inv.sellJunk();
    expect(inv.coins).toBe(8);
    expect(inv.bag.slice(0, 4)).toEqual([null, potions(2), null, { id: 'worn-tunic', count: 1 }]);
    expect(inv.sellJunk()).toEqual([]);
  });

  it("says before you let go whether a purchase, a buyback or a sale would go, and why not", () => {
    const inv = carrying([{ id: 'torn-cloth-1', count: 3 }, potions(9)]);
    expect(inv.checkBuy('minor-healing-potion', 1, bag(1))).toBe('coins');
    inv.take([], 20);
    expect(inv.checkBuy('minor-healing-potion', 1, bag(1))).toBeNull();
    expect(inv.checkBuy('minor-healing-potion', 2, bag(1))).toBe('full');
    expect(inv.checkBuy('iron-longsword-1', 1, bag(0))).toBe('full');
    expect(inv.checkBuy('iron-longsword-1', 1, MAIN)).toBe('slot');
    expect(inv.checkBuy('iron-longsword-1', 1, bag(2))).toBeNull();
    expect(inv.checkBuy('leaders-orders', 1, bag(2))).toBe('slot');
    expect(inv.coins).toBe(20);

    expect(inv.checkSell(bag(0))).toBeNull();
    expect(inv.checkSell(bag(5))).toBe('empty');
    expect(inv.checkSell(GROUND)).toBe('slot');
    inv.take([{ id: 'leaders-orders', count: 1 }]);
    expect(inv.checkSell({ in: 'quest', slot: 0 })).toBe('quest');
    expect(refusals(inv.sell({ in: 'quest', slot: 0 }))).toEqual(['quest']);
    expect(inv.quest).toEqual(['leaders-orders']);

    expect(inv.checkBuyBack(0, bag(2))).toBe('empty');
    inv.sell(bag(0));
    expect(inv.checkBuyBack(0, bag(0))).toBeNull();
    expect(inv.checkBuyBack(0, bag(1))).toBe('full');
    inv.spend([], inv.coins);
    expect(inv.checkBuyBack(0, bag(0))).toBe('coins');
  });

  it('sells what you wear, carried off the figure', () => {
    const inv = new Inventory(warrior());
    expect(inv.sell(CHEST)).toContainEqual({ kind: 'coins', coins: 3 });
    expect(inv.gear.chest).toBeNull();
    expect(inv.sold[0]).toEqual({ id: 'worn-tunic', count: 1, price: 3 });
  });
});

describe('the stash', () => {
  it('holds 32 slots across its two pages, carried to and from the bag', () => {
    const inv = carrying([potions(10), { id: 'worn-tunic', count: 1 }]);
    inv.move(bag(0), stash(3));
    inv.move(bag(1), stash(20));
    expect(inv.at(stash(3))).toEqual(potions(10));
    expect(inv.at(stash(20))).toEqual({ id: 'worn-tunic', count: 1 });
    expect(inv.bag.every((s) => s === null)).toBe(true);
    inv.move(stash(20), CHEST);
    expect(inv.at(stash(20))).toEqual({ id: 'worn-tunic', count: 1 });
    inv.move(stash(3), bag(15), 4);
    expect(inv.at(bag(15))).toEqual(potions(4));
    expect(refusals(inv.move(stash(31), bag(0)))).toEqual(['empty']);
    expect(refusals(inv.move(bag(15), stash(32)))).toEqual(['slot']);
  });
});

describe('its snapshot', () => {
  it('restores to the same things', () => {
    const inv = carrying([potions(12), { id: 'torn-cloth-1', count: 2 }, { id: 'leaders-orders', count: 1 }]);
    inv.take([], 33);
    inv.move(bag(1), stash(17));
    inv.drink(1);
    inv.tick(20);
    inv.openChest('tent', [], 5);
    const restored = new Inventory(warrior(), structuredClone(inv.snapshot()));
    expect(restored.snapshot()).toEqual(inv.snapshot());
    expect(restored.cooldown).toBe(40);
    expect(restored.coins).toBe(38);
  });

  it("drops an item the catalogue doesn't know, and anything in a slot that can't hold it", () => {
    const kit = startingInventory('warrior');
    const odd = {
      ...kit,
      bag: [{ id: 'axe-of-legends', count: 1 }, potions(40), { id: 'leaders-orders', count: 1 }, potions(0), ...kit.bag.slice(4)],
      belt: [{ id: 'worn-tunic', count: 1 }, potions(3)],
      gear: { ...kit.gear, head: 'worn-boots', offHand: 'mystery-shield' },
      quest: ['leaders-orders', 'worn-tunic', 'ghost-letter'],
    };
    const inv = new Inventory(warrior(), odd);
    expect(inv.bag.slice(0, 4)).toEqual([null, potions(10), null, null]);
    expect(inv.belt).toEqual([null, potions(3)]);
    expect(inv.gear).toMatchObject({ head: null, offHand: null, mainHand: 'plain-sword' });
    expect(inv.quest).toEqual(['leaders-orders']);
  });
});
