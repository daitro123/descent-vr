import { Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { AdventureState, type Effect } from '../src/adventureState';
import { CONFIG } from '../src/config';
import { CLASS_MAIN, type GearItem, itemOf } from '../src/items';
import { chestSeed, type Loot, rollChest, seeded } from '../src/loot';
import type { ChestPlan } from '../src/maps/types';
import { SaveController } from '../src/save/controller';
import { readSave, saveRecord } from '../src/save/record';
import { MemoryStore } from '../src/save/store';
import type { Probe } from '../src/ui/talkBoard';
import { Chests } from '../src/world/chests';

// Chests (.scratch/inventory/issues/13-oakvales-chests.md): what one holds,
// rolled once from the chest and the character and remembered across a save;
// and a chest in the world, shut until a touch of its lid, open for good after.

const ROLLS = 20000;

describe("a chest's roll", () => {
  const many = (level: number): Loot[] => Array.from({ length: ROLLS }, (_, i) => rollChest(level, 'warrior', seeded(chestSeed(`chest-${i}`, 'warrior'))));

  it('holds 5 × its level in coins and one green, a blue about 20% of the time, for your class at its level', () => {
    for (const level of [2, 4]) {
      const rolls = many(level);
      expect(rolls.every((r) => r.coins === 5 * level)).toBe(true);
      expect(rolls.every((r) => r.items.length === 1)).toBe(true);
      const gear = rolls.map((r) => itemOf(r.items[0]) as GearItem);
      expect(gear.every((g) => g.kind === 'gear' && g.level === level)).toBe(true);
      expect(gear.every((g) => (g.class ? g.class === 'warrior' : g.main === CLASS_MAIN.warrior))).toBe(true);
      const blue = gear.filter((g) => g.rarity === 'blue').length / ROLLS;
      expect(gear.every((g) => g.rarity === 'green' || g.rarity === 'blue')).toBe(true);
      expect(blue).toBeGreaterThan(0.19);
      expect(blue).toBeLessThan(0.21);
    }
    expect(CONFIG.loot.chest.gear).toEqual({ green: 0.8, blue: 0.2 });
  });

  it('is the same for the same chest and character, and differs across chests', () => {
    const roll = (chest: string) => rollChest(2, 'warrior', seeded(chestSeed(chest, 'warrior')));
    expect(roll('oakvale-watchtower')).toEqual(roll('oakvale-watchtower'));
    expect(chestSeed('oakvale-watchtower', 'warrior')).not.toBe(chestSeed('oakvale-leaders-tent', 'warrior'));
    expect(chestSeed('oakvale-watchtower', 'warrior')).not.toBe(chestSeed('oakvale-watchtower', 'mage'));
  });

  it('keeps its gear within the loot levels', () => {
    const r = rollChest(9, 'warrior', seeded(3));
    expect(r.coins).toBe(45);
    expect(itemOf(r.items[0])!.level).toBe(CONFIG.loot.levels);
  });
});

describe('opening a chest', () => {
  const open = (state: AdventureState, chest = 'oakvale-watchtower', level = 2) => state.apply({ kind: 'chest', chest, level });
  const lootOf = (effects: Effect[]) => effects.find((e): e is Extract<Effect, { kind: 'loot' }> => e.kind === 'loot');

  it('records it open and lets what it held out as a drop, not into the bag', () => {
    const state = new AdventureState();
    const bag = JSON.stringify(state.inventory.bag);
    const effects = open(state);
    expect(effects[0]).toEqual({ kind: 'chest', chest: 'oakvale-watchtower' });
    const loot = lootOf(effects)!;
    expect(loot).toEqual({ kind: 'loot', ...rollChest(2, 'warrior', seeded(chestSeed('oakvale-watchtower', 'warrior'))) });
    expect(loot.coins).toBe(10);
    expect(state.inventory.coins).toBe(0);
    expect(JSON.stringify(state.inventory.bag)).toBe(bag);
    expect(state.inventory.chests).toEqual(['oakvale-watchtower']);
  });

  it('rolls once: a second touch does nothing, and a new character of the same class rolls the same (no roster yet)', () => {
    const state = new AdventureState();
    const first = lootOf(open(state));
    expect(open(state)).toEqual([]);
    expect(lootOf(open(new AdventureState()))).toEqual(first);
  });

  it('is written to the save at once, and after a round trip it is still open, with nothing more to give', async () => {
    const state = new AdventureState();
    const store = new MemoryStore();
    const saves = new SaveController(store, () => saveRecord(state.snapshot(), { x: 0, z: 0, yaw: 0 }));
    const write = vi.spyOn(store, 'write');
    saves.onEffects(open(state, 'oakvale-strongbox', 4));
    expect(write).toHaveBeenCalledTimes(1);
    await saves.settled();
    const read = readSave(await store.read());
    expect(read.kind).toBe('saved');
    if (read.kind !== 'saved') return;
    expect(read.record.inventory.chests).toEqual(['oakvale-strongbox']);
    const restored = new AdventureState(read.record);
    expect(restored.inventory.isOpened('oakvale-strongbox')).toBe(true);
    expect(open(restored, 'oakvale-strongbox', 4)).toEqual([]);
    // The others are still shut.
    expect(lootOf(open(restored, 'oakvale-leaders-tent'))?.coins).toBe(10);
  });
});

describe('a chest in the world', () => {
  const PLAN: ChestPlan = { id: 'test', level: 2, look: 'chest', x: 3, y: 1, z: -4, yaw: 0.6, interior: null, drop: { x: 4, y: 1, z: -4 } };
  const { h, lid } = CONFIG.chests.looks.chest;
  /** A point on the lid's top, `forward` m from its middle towards its front. */
  const onLid = (forward = 0) => new Vector3(PLAN.x + Math.sin(PLAN.yaw) * forward, PLAN.y + h + lid, PLAN.z + Math.cos(PLAN.yaw) * forward);
  const fist = (at: Vector3, hand: 'left' | 'right' = 'left'): Probe => ({ at, hand });

  it('stands shut until a fist touches its lid, and says which hand did', () => {
    const chests = new Chests([PLAN], () => false);
    expect(chests.lids).toEqual({ test: 0 });
    expect(chests.update(1 / 72, [fist(new Vector3(PLAN.x, PLAN.y + 1.6, PLAN.z)), null, null], () => false)).toBeNull();
    expect(chests.update(1 / 72, [null, fist(onLid(0.15), 'right'), null], () => false)).toEqual({ chest: PLAN, hand: 'right' });
    // The lid's front edge, just past it.
    expect(chests.update(1 / 72, [fist(onLid(CONFIG.chests.looks.chest.d / 2 + 0.05)), null, null], () => false)?.hand).toBe('left');
  });

  it('swings its lid back over its time once it is open, and no touch lifts it again', () => {
    const chests = new Chests([PLAN], () => false);
    const opened = () => true;
    expect(chests.update(CONFIG.chests.open.seconds / 2, [fist(onLid())], opened)).toBeNull();
    expect(chests.lids.test).toBeCloseTo(0.5);
    chests.update(CONFIG.chests.open.seconds, [], opened);
    expect(chests.lids.test).toBe(1);
  });

  it('shows open from the start if it was opened before', () => {
    const chests = new Chests([PLAN], (id) => id === 'test');
    expect(chests.lids.test).toBe(1);
    expect(chests.update(1 / 72, [fist(onLid())], () => true)).toBeNull();
  });

  it("can't be opened where it isn't drawn", () => {
    const chests = new Chests([PLAN], () => false);
    chests.outdoors.visible = false;
    expect(chests.update(1 / 72, [fist(onLid())], () => false)).toBeNull();
  });

  it('keeps the mine\'s chests apart, for the mine to show', () => {
    const chests = new Chests([PLAN, { ...PLAN, id: 'deep', interior: 'mine' }], () => false);
    expect(chests.outdoors.children.length).toBe(1);
    expect(chests.mine.children.length).toBe(1);
  });
});
