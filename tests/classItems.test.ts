import { describe, expect, it } from 'vitest';
import { type AdventureEvent, AdventureState, type Effect, type Role } from '../src/adventureState';
import { Inventory, type InventoryEffect, STARTING_KIT, type Where } from '../src/inventory';
import { CATALOGUE, CLASS_MAIN, type ClassId, type GearItem, itemOf, LOOT_LEVELS, numbersOf } from '../src/items';
import { rollChest, rollLoot, seeded } from '../src/loot';
import { BOW_LOOKS, bowLookOf } from '../src/player/bow';
import { WAND_LOOKS, wandLookOf } from '../src/player/mage';
import { ITEM_CELLS, lookOf } from '../src/ui/bag/looks';
import { STOCK, waresFor } from '../src/vendors';

// The ranger's and mage's items: their kits, their weapons and off hands in
// loot and in the smith's stock, Hale's picks, and each bow's and staff's look
// (.scratch/inventory/issues/16-the-ranger-and-mage-in-the-inventory.md).

const CLASSES: readonly ClassId[] = ['warrior', 'ranger', 'mage'];
const OTHERS = ['ranger', 'mage'] as const;
const HANDS = new Set(['mainHand', 'offHand']);
const gearOf = (id: string) => itemOf(id) as GearItem;
const lootHands = (klass: ClassId) => Object.values(CATALOGUE).filter((i): i is GearItem => i.kind === 'gear' && i.loot === true && i.class === klass);
const refusals = (effects: InventoryEffect[]) => effects.flatMap((e) => (e.kind === 'refused' ? [e.reason] : []));
const bag = (slot: number): Where => ({ in: 'bag', slot });
const MAIN: Where = { in: 'gear', slot: 'mainHand' };
const OFF: Where = { in: 'gear', slot: 'offHand' };

describe("a new ranger's and mage's kit", () => {
  it('is their white weapon and off hand, the worn tunic and boots, and three potions, as the warrior', () => {
    const kit = {
      ranger: ['Short Bow', 'Quiver'],
      mage: ["Apprentice's Wand", 'Glass Focus'],
    };
    for (const klass of OTHERS) {
      const inv = new Inventory({ class: klass, level: 1 });
      const [main, off] = [gearOf(inv.gear.mainHand!), gearOf(inv.gear.offHand!)];
      expect([main.name, off.name], klass).toEqual(kit[klass]);
      expect([main.class, off.class, main.rarity, off.rarity, main.level, off.level]).toEqual([klass, klass, 'white', 'white', 1, 1]);
      expect(inv.gear.chest).toBe('worn-tunic');
      expect(inv.gear.feet).toBe('worn-boots');
      expect(inv.belt[1]).toEqual({ id: 'minor-healing-potion', count: 3 });
      expect(STARTING_KIT[klass]).toEqual({ ...STARTING_KIT.warrior, mainHand: inv.gear.mainHand, offHand: inv.gear.offHand });
    }
  });

  it("gives the quiver and the focus no armour, and each weapon a damage rating", () => {
    for (const klass of OTHERS) {
      const inv = new Inventory({ class: klass, level: 1 });
      expect(numbersOf(gearOf(inv.gear.offHand!)).armour, klass).toBe(0);
      expect(numbersOf(gearOf(inv.gear.mainHand!)).damage, klass).toBeGreaterThan(0);
    }
  });
});

describe("the ranger's and mage's loot weapons and off hands", () => {
  const expected = {
    ranger: ['Ash Longbow', 'Yew Longbow', 'Moonhorn Recurve', 'Hide Quiver', 'Tooled Quiver', 'Moonhide Quiver'],
    mage: ['Birch Wand', 'Rowan Staff', 'Moonwood Staff', 'Quartz Focus', 'Amethyst Focus', 'Moonstone Focus'],
  };

  it('come white, green and blue at every loot level, named and locked to their class', () => {
    for (const klass of OTHERS) {
      const items = lootHands(klass);
      expect(new Set(items.map((i) => i.name)), klass).toEqual(new Set(expected[klass]));
      for (const slot of ['mainHand', 'offHand'] as const)
        for (const rarity of ['white', 'green', 'blue'] as const)
          for (const level of LOOT_LEVELS) expect(items.filter((i) => i.slot === slot && i.rarity === rarity && i.level === level), `${klass} ${slot} ${rarity} ${level}`).toHaveLength(1);
    }
  });

  it("carry attributes from green up, your class's main one, and the quiver and focus no armour", () => {
    for (const klass of OTHERS) {
      for (const item of lootHands(klass)) {
        const n = numbersOf(item);
        if (item.slot === 'mainHand') expect(n.damage, item.id).toBeGreaterThan(0);
        else {
          expect(item.noArmour, item.id).toBe(true);
          expect(n.armour, item.id).toBe(0);
          expect(n.main?.attribute ?? null, item.id).toBe(item.rarity === 'white' ? null : CLASS_MAIN[klass]);
        }
      }
    }
  });

  it("better the rarer they are, as the warrior's are", () => {
    for (const klass of CLASSES) {
      const at = (rarity: string, slot: string) => lootHands(klass).find((i) => i.level === 3 && i.rarity === rarity && i.slot === slot)!;
      const damage = ['white', 'green', 'blue'].map((r) => numbersOf(at(r, 'mainHand')).damage);
      expect(damage[1], klass).toBeGreaterThan(damage[0]);
      expect(damage[2], klass).toBeGreaterThan(damage[1]);
    }
  });

  it("keep the warrior's loot ids, so old saves still hold them", () => {
    for (const id of ['iron-longsword-1', 'tempered-longsword-3', 'moonsteel-longsword-5', 'oak-heater-shield-2', 'moonsteel-kite-shield-4'])
      expect(gearOf(id)?.class, id).toBe('warrior');
  });
});

describe('a drop', () => {
  const kill = (role: Role, level: number) => ({ role, level, family: 'bandit' as const });
  const drops = (klass: ClassId, rolls = 3000) =>
    (['ordinary', 'leader', 'deepBrute'] as const)
      .flatMap((role) => Array.from({ length: rolls }, (_, seed) => rollLoot(kill(role, 3), klass, seeded(seed + 1))))
      .flatMap((l) => l.items.map(itemOf))
      .filter((i): i is GearItem => i?.kind === 'gear');

  it("includes each class's weapons and off hands, white, green and blue", () => {
    for (const klass of CLASSES) {
      const hands = drops(klass).filter((i) => HANDS.has(i.slot));
      expect(new Set(hands.map((i) => `${i.slot} ${i.rarity}`)), klass).toEqual(
        new Set(['mainHand', 'offHand'].flatMap((s) => ['white', 'green', 'blue'].map((r) => `${s} ${r}`))),
      );
    }
  });

  it("never rolls another class's weapon or off hand for you", () => {
    for (const klass of CLASSES) {
      for (const item of drops(klass)) if (item.class) expect(item.class, item.id).toBe(klass);
      for (let seed = 1; seed < 500; seed++) for (const id of rollChest(3, klass, seeded(seed)).items) expect(gearOf(id).class ?? klass).toBe(klass);
    }
  });
});

describe("a dropped weapon of another class, in the bag", () => {
  it('is refused with the class refusal, in either hand', () => {
    for (const klass of CLASSES) {
      for (const other of CLASSES.filter((c) => c !== klass)) {
        const inv = new Inventory({ class: klass, level: 5 });
        const [main, off] = (['mainHand', 'offHand'] as const).map((slot) => lootHands(other).find((i) => i.slot === slot && i.level === 1)!.id);
        inv.take([
          { id: main, count: 1 },
          { id: off, count: 1 },
        ]);
        expect(refusals(inv.move(bag(0), MAIN)), `${klass} wearing ${main}`).toEqual(['class']);
        expect(refusals(inv.move(bag(1), OFF)), `${klass} wearing ${off}`).toEqual(['class']);
      }
    }
  });

  it("is worn when it's yours: a ranger's bow and quiver, a mage's staff and focus", () => {
    for (const klass of OTHERS) {
      const inv = new Inventory({ class: klass, level: 3 });
      const [main, off] = (['mainHand', 'offHand'] as const).map((slot) => lootHands(klass).find((i) => i.slot === slot && i.level === 3 && i.rarity === 'blue')!.id);
      inv.take([
        { id: main, count: 1 },
        { id: off, count: 1 },
      ]);
      expect(refusals(inv.move(bag(0), MAIN))).toEqual([]);
      expect(refusals(inv.move(bag(1), OFF))).toEqual([]);
      expect([inv.gear.mainHand, inv.gear.offHand]).toEqual([main, off]);
      expect(inv.numbers.main, klass).toBeGreaterThan(0);
    }
  });
});

describe("the smith's stock", () => {
  it("sells the ranger and the mage their white weapon and off hand at item levels 1, 3 and 5", () => {
    for (const klass of OTHERS) {
      const hands = waresFor('smith', klass).map(gearOf).filter((i) => HANDS.has(i.slot));
      expect(hands.map((i) => `${i.name} ${i.level}`), klass).toEqual(
        lootHands(klass)
          .filter((i) => i.rarity === 'white' && [1, 3, 5].includes(i.level))
          .sort((a, b) => (a.slot === b.slot ? a.level - b.level : a.slot === 'mainHand' ? -1 : 1))
          .map((i) => `${i.name} ${i.level}`),
      );
      expect(hands.every((i) => i.class === klass && i.rarity === 'white')).toBe(true);
      expect(waresFor('smith', klass)).toHaveLength(16);
      expect(STOCK.smith.filter((id) => gearOf(id).class === klass)).toHaveLength(6);
    }
  });
});

describe('What Lies Below, for a ranger and a mage', () => {
  const kill = (camp: 'farm' | 'lumberCamp' | null, level: number, role: Role = 'ordinary'): AdventureEvent => ({
    kind: 'kill',
    camp,
    level,
    role,
    family: role === 'warden' ? 'undead' : 'bandit',
    seed: 1,
  });
  const play = (state: AdventureState, ...events: AdventureEvent[]): Effect[] => events.flatMap((e) => state.apply(e));
  const pick = (id: string): AdventureEvent => ({ kind: 'handIn', pick: id });
  const ACCEPT: AdventureEvent = { kind: 'accept' };
  const FARM = kill('farm', 1);
  const THUG = kill('lumberCamp', 2);
  const belowReady = (klass: ClassId) => {
    const state = new AdventureState(undefined, undefined, { class: klass });
    play(state, ACCEPT, FARM, FARM, FARM);
    play(state, pick(state.hale.picks[0]), ACCEPT, THUG, THUG, THUG, THUG, kill('lumberCamp', 2, 'leader'), { kind: 'pickup', item: 'orders' });
    play(state, pick(state.hale.picks[0]), ACCEPT, kill(null, 5, 'warden'));
    return state;
  };

  it("offers Hale's Old Hunting Bow or the Crypt-Warded Staff beside the Warden's Mantle, and never the longsword", () => {
    const weapon = { ranger: "Hale's Old Hunting Bow", mage: 'Crypt-Warded Staff' };
    for (const klass of OTHERS) {
      const state = belowReady(klass);
      expect(state.hale.picks.map((id) => itemOf(id)!.name), klass).toEqual([weapon[klass], "Warden's Mantle"]);
      expect(state.hale.picks).not.toContain('hale-longsword');
      expect(state.pickRefusal('hale-longsword')).not.toBeNull();
      play(state, pick(state.hale.picks[0]));
      expect(state.pickedAt('below'), klass).toBe(klass === 'ranger' ? 'hale-hunting-bow' : 'crypt-warded-staff');
      expect(state.inventory.bag.map((s) => s?.id)).toContain(state.pickedAt('below'));
      expect(state.haleSwordAtHip).toBe(true);
    }
  });

  it("keeps Hale's sword at his hip for a ranger or mage saved before picks", () => {
    for (const klass of OTHERS) {
      const state = belowReady(klass);
      play(state, pick(state.hale.picks[0]));
      const saved = state.snapshot();
      const older = { ...saved, quests: { ...saved.quests, below: { stage: 'handedIn' as const, counts: [1] } } };
      const restored = new AdventureState(older, undefined, { class: klass });
      expect(restored.haleSwordAtHip, klass).toBe(true);
      expect(restored.pickedAt('below')).toBeUndefined();
    }
  });
});

describe('how the ranger and mage weapons look', () => {
  const mains = (klass: ClassId) => [...new Set([...lootHands(klass), ...Object.values(STARTING_KIT[klass]).map(gearOf)].filter((i) => i.slot === 'mainHand').map((i) => i.model))];

  it('gives every bow a look of its own, and Hale\'s its own again', () => {
    const models = [...mains('ranger'), 'hunting-bow'];
    for (const m of models) expect(BOW_LOOKS[m], m).toBeDefined();
    expect(new Set(models.map((m) => bowLookOf(m))).size).toBe(models.length);
    expect(bowLookOf('nothing-known')).toBe(BOW_LOOKS['short-bow']);
  });

  it('gives every wand and staff a look of its own, a staff a staff\'s length', () => {
    const models = [...mains('mage'), 'crypt-staff'];
    for (const m of models) expect(WAND_LOOKS[m], m).toBeDefined();
    expect(new Set(models.map((m) => wandLookOf(m))).size).toBe(models.length);
    expect(wandLookOf('crypt-staff').kind).toBe('staff');
    expect(wandLookOf('wand').kind).toBe('wand');
    for (const item of lootHands('mage').filter((i) => i.slot === 'mainHand')) expect(wandLookOf(item.model).kind, item.name).toBe(item.name.endsWith('Staff') ? 'staff' : 'wand');
  });

  it('draws each rarity differently in the bag, and fits every look in the icon atlas', () => {
    for (const klass of OTHERS)
      for (const slot of ['mainHand', 'offHand'] as const) {
        const tints = new Set(['white', 'green', 'blue'].map((r) => lookOf(lootHands(klass).find((i) => i.slot === slot && i.rarity === r)!).tint));
        expect(tints.size, `${klass} ${slot}`).toBe(3);
      }
    const looks = new Set(Object.values(CATALOGUE).map((i) => `${lookOf(i).look}:${lookOf(i).tint}`));
    expect(looks.size).toBeLessThanOrEqual(ITEM_CELLS);
  });
});
