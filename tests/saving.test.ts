import { describe, expect, it, vi } from 'vitest';
import { type AdventureEvent, AdventureState, type Effect, type Progress, xpToReach } from '../src/adventureState';
import { CONFIG } from '../src/config';
import { type RecordWriter, SaveController } from '../src/save/controller';
import { startingInventory } from '../src/inventory';
import { NO_PROFESSIONS } from '../src/professions/professions';
import { type Migration, MIGRATIONS, readSave, ROSTER_VERSION, SAVE_VERSION, type SaveRecord, saveRecord, type Who } from '../src/save/record';
import { CHAINS } from '../src/quests';
import { Characters, FIRST, MemoryStore, NAMES, newRecord, openCharacters, ROSTER } from '../src/save/store';

// Saving, at the save store's port: the record the adventure state snapshots
// to and restores from, older records upgrading through their migrations, a
// save round-tripping through the in-memory store, falling back to it where
// the browser won't store data, and the controller deciding when to write.
// The IndexedDB adapter is checked in headless Chromium (checks/saving.mjs).

const ACCEPT: AdventureEvent = { kind: 'accept' };
const HAND_IN: AdventureEvent = { kind: 'handIn' };
const ORDERS: AdventureEvent = { kind: 'pickup', item: 'orders' };
const FARM: AdventureEvent = { kind: 'kill', camp: 'farm', level: 1, role: 'ordinary', family: 'bandit', seed: 1 };
const LUMBER: AdventureEvent = { kind: 'kill', camp: 'lumberCamp', level: 2, role: 'ordinary', family: 'bandit', seed: 1 };
const LEADER: AdventureEvent = { kind: 'kill', camp: 'lumberCamp', level: 2, role: 'leader', family: 'bandit', seed: 1 };
const DIG_BRUTE: AdventureEvent = { kind: 'kill', camp: 'mine', level: 4, role: 'deepBrute', family: 'undead', seed: 1 };
const WARDEN: AdventureEvent = { kind: 'kill', camp: null, level: 5, role: 'warden', family: 'undead', seed: 1 };

/** The whole chain on the plain route, one event at a time. */
const ROUTE: AdventureEvent[] = [
  ACCEPT, FARM, FARM, FARM, HAND_IN,
  ACCEPT, LUMBER, LUMBER, ORDERS, LUMBER, LUMBER, LEADER, HAND_IN,
  ACCEPT, DIG_BRUTE, WARDEN, HAND_IN,
];

/** Everything the adventure state answers. */
const answers = (s: AdventureState) => ({
  level: s.level,
  xp: s.xp,
  xpToNext: s.xpToNext,
  progress: s.progress,
  stats: s.stats,
  sword: s.sword,
  inventory: s.inventory.snapshot(),
  professions: s.professions.snapshot(),
  hale: s.hale,
  tracker: s.tracker,
  wardenBeaten: s.wardenBeaten,
});

/** Through storage and back, as a structured clone (what IndexedDB keeps) would. */
const stored = <T>(value: T): T => structuredClone(value);

/** A character as version 3 wrote it, before the roster: coins, a potion stack in the bag, Mining learned. */
const V3 = {
  version: 3,
  savedAt: 11,
  level: 4,
  xp: 700,
  quests: { raiders: { stage: 'handedIn', counts: [3] }, lumber: { stage: 'handedIn', counts: [5, 1] }, below: { stage: 'active', counts: [0], taken: 1 } },
  wardenBeaten: false,
  inventory: { ...startingInventory('warrior'), coins: 42, bag: [{ id: 'minor-healing-potion', count: 4 }, ...startingInventory('warrior').bag.slice(1)] },
  professions: { learned: { mining: { proficiency: 6, grade: 'apprentice' } }, recipes: ['copper-bar', 'whetstone'] },
  position: { x: 30, z: -12 },
  facing: 2,
  interior: null,
};

/** A record for a character with `progress`, standing at the start. */
const recordOf = (progress: Progress, savedAt = 1): SaveRecord => saveRecord(progress, { x: 0.2, z: 1.5, yaw: 0 }, savedAt);

describe("the adventure state's snapshot", () => {
  it('restores to the same answers at every step of the chain', () => {
    const state = new AdventureState();
    for (const event of [null, ...ROUTE]) {
      if (event) state.apply(event);
      const restored = new AdventureState(stored(state.snapshot()));
      expect(answers(restored)).toEqual(answers(state));
    }
  });

  it('restores a character who carries on exactly as the original would', () => {
    for (let at = 0; at <= ROUTE.length; at++) {
      const original = new AdventureState();
      ROUTE.slice(0, at).forEach((e) => original.apply(e));
      const restored = new AdventureState(stored(original.snapshot()));
      for (const event of ROUTE.slice(at)) expect(restored.apply(event)).toEqual(original.apply(event));
      expect(answers(restored)).toEqual(answers(original));
    }
  });

  it('holds level and XP, each quest with its counts, whether the Warden is beaten, and your things', () => {
    const state = new AdventureState();
    [ACCEPT, FARM, FARM, FARM, HAND_IN, ACCEPT, LUMBER, ORDERS].forEach((e) => state.apply(e));
    expect(state.snapshot()).toEqual({
      level: 2,
      xp: 130,
      inventory: startingInventory('warrior'),
      quests: {
        raiders: { stage: 'handedIn', counts: [3] },
        // The Lumber Camp's second count is its orders: taken. It's the first (and only) quest under way.
        lumber: { stage: 'active', counts: [1, 1], taken: 1 },
        below: { stage: 'locked', counts: [0] },
      },
      wardenBeaten: false,
      professions: NO_PROFESSIONS,
    });
  });

  it("knows the Warden is beaten and Hale's sword is yours after the chain", () => {
    const state = new AdventureState();
    ROUTE.forEach((e) => state.apply(e));
    expect(state.snapshot()).toMatchObject({
      inventory: { gear: { mainHand: 'hale-longsword' } },
      wardenBeaten: true,
      quests: { below: { stage: 'handedIn', counts: [1] } },
    });
  });

  it("never loses a level it recorded, even if a new build's levels need more XP", () => {
    const state = new AdventureState();
    [ACCEPT, FARM, FARM, FARM, HAND_IN].forEach((e) => state.apply(e));
    const restored = new AdventureState({ ...state.snapshot(), xp: 60 });
    expect(restored.level).toBe(2);
    expect(restored.xp).toBe(xpToReach(2));
  });

  it("keeps the chain's rules whatever a record says", () => {
    const restored = new AdventureState({
      ...new AdventureState().snapshot(),
      xp: -50,
      quests: {
        raiders: { stage: 'active', counts: [2] },
        lumber: { stage: 'active', counts: [7, 3] },
        below: { stage: 'ready', counts: [1] },
      },
    });
    expect(restored.xp).toBe(0);
    expect(restored.tracker).toEqual([{ title: 'Raiders in the Fields', lines: ['Bandits defeated at the farm: 2/3'] }]);
    restored.apply(FARM);
    restored.apply(HAND_IN);
    // The Lumber Camp is offered afresh, as if the record had it locked.
    expect(restored.hale.marker).toBe('offered');
    restored.apply(ACCEPT);
    expect(restored.tracker[0]?.lines).toEqual(['Bandits defeated at the lumber camp: 0/5', "Leader's orders taken: 0/1"]);
  });

  it('makes a quest ready whose objectives a new build asks less of', () => {
    const state = new AdventureState();
    [ACCEPT, FARM, FARM].forEach((e) => state.apply(e));
    const snapshot = state.snapshot();
    const restored = new AdventureState({ ...snapshot, quests: { ...snapshot.quests, raiders: { stage: 'active', counts: [5] } } });
    expect(restored.hale.marker).toBe('ready');
    expect(restored.apply(HAND_IN)[0]).toEqual({ kind: 'quest', quest: 'raiders', stage: 'handedIn' });
  });

  it("offers a quest a new build adds after the ones you've handed in", () => {
    const state = new AdventureState();
    ROUTE.forEach((e) => state.apply(e));
    const snapshot = state.snapshot();
    // As a record from a build whose chain ended at The Lumber Camp would read.
    const { below: _, ...older } = snapshot.quests;
    const restored = new AdventureState({ ...snapshot, quests: older as Progress['quests'] });
    expect(restored.hale.marker).toBe('offered');
  });
});

describe('the save record', () => {
  const current = recordOf(new AdventureState().snapshot());

  it('reads a current record back as it was written', () => {
    expect(readSave(stored(current))).toEqual({ kind: 'saved', record: current });
  });

  it('reads nothing saved as no save', () => {
    expect(readSave(undefined)).toEqual({ kind: 'none' });
  });

  it("reads garbage, or a record missing what it needs, as unreadable", () => {
    expect(readSave('level 5')).toEqual({ kind: 'unreadable' });
    expect(readSave({ version: SAVE_VERSION })).toEqual({ kind: 'unreadable' });
    expect(readSave({ ...current, xp: 'lots' })).toEqual({ kind: 'unreadable' });
    const { inventory: _, ...noThings } = current;
    expect(readSave(noThings)).toEqual({ kind: 'unreadable' });
    expect(readSave({ ...current, inventory: { ...current.inventory, bag: 'full' } })).toEqual({ kind: 'unreadable' });
    expect(readSave({ ...current, inventory: { ...current.inventory, gear: { ...current.inventory.gear, head: 7 } } })).toEqual({ kind: 'unreadable' });
    expect(readSave({ ...current, quests: { raiders: { stage: 'maybe', counts: [0] } } })).toEqual({ kind: 'unreadable' });
    const { professions: __, ...noProfessions } = current;
    expect(readSave(noProfessions)).toEqual({ kind: 'unreadable' });
    expect(readSave({ ...current, professions: { learned: { mining: { proficiency: 3, grade: 'grandmaster' } }, recipes: [] } })).toEqual({ kind: 'unreadable' });
    expect(readSave({ ...current, professions: { learned: {}, recipes: [7] } })).toEqual({ kind: 'unreadable' });
    expect(readSave({ ...current, position: { x: Number.NaN, z: 0 } })).toEqual({ kind: 'unreadable' });
    expect(readSave({ ...current, class: 'bard' })).toEqual({ kind: 'unreadable' });
    const { name: ____, ...noName } = current;
    expect(readSave(noName)).toEqual({ kind: 'unreadable' });
    for (const name of ['', ' Wren', 'A'.repeat(CONFIG.save.name + 1), 7]) expect(readSave({ ...current, name })).toEqual({ kind: 'unreadable' });
  });

  it("leaves a newer build's record alone, so an old cached page can't overwrite it", () => {
    expect(readSave({ ...current, version: SAVE_VERSION + 1 })).toEqual({ kind: 'newer', version: SAVE_VERSION + 1 });
  });

  /**
   * One record as each older version wrote it, for every version before the
   * current one: a new version adds its predecessor's here with its migration.
   */
  const OLDER: Record<number, object> = {
    // Before the inventory: the sword in your hand was all you owned.
    1: {
      version: 1,
      savedAt: 7,
      level: 5,
      xp: 1000,
      sword: 'hale',
      quests: { raiders: { stage: 'handedIn', counts: [3] }, lumber: { stage: 'handedIn', counts: [5, 1] }, below: { stage: 'handedIn', counts: [1] } },
      wardenBeaten: true,
      position: { x: 1, z: 2 },
      facing: 0.5,
      interior: 'inn',
    },
    // Before professions: the inventory, but nothing learned.
    2: {
      version: 2,
      savedAt: 9,
      level: 3,
      xp: 400,
      quests: { raiders: { stage: 'handedIn', counts: [3] }, lumber: { stage: 'active', counts: [2, 0] }, below: { stage: 'locked', counts: [0] } },
      wardenBeaten: false,
      inventory: { ...startingInventory('warrior'), coins: 17, bag: [{ id: 'torn-cloth-1', count: 2 }, ...startingInventory('warrior').bag.slice(1)] },
      position: { x: -4, z: 8 },
      facing: 1.5,
      interior: null,
    },
    // Before the roster: one character, with no class or name.
    3: V3,
  };

  it('upgrades a record of every older version to the current one', () => {
    for (let version = 1; version < SAVE_VERSION; version++) {
      expect(OLDER[version], `a record as version ${version} wrote it`).toBeDefined();
      const read = readSave(stored(OLDER[version]));
      expect(read.kind, `version ${version}`).toBe('saved');
    }
  });

  it("makes a version-1 character a warrior in the starting kit, wearing Hale's old longsword if they had it", () => {
    const read = readSave(stored(OLDER[1]));
    if (read.kind !== 'saved') throw new Error(read.kind);
    expect(read.record).not.toHaveProperty('sword');
    expect(read.record.inventory).toEqual(startingInventory('warrior', { mainHand: 'hale-longsword' }));
    expect(read.record).toMatchObject({ level: 5, xp: 1000, wardenBeaten: true, position: { x: 1, z: 2 }, interior: 'inn' });
    const state = new AdventureState(read.record);
    expect(state.sword).toBe('hale');
    expect(state.haleSwordAtHip).toBe(false);
    expect(state.stats.damage).toBeCloseTo(2.0, 9);
    expect(state.inventory.belt).toEqual([null, { id: 'minor-healing-potion', count: 3 }]);
    expect(state.inventory.coins).toBe(0);
    // Nothing earned before is paid again: the bag starts empty.
    expect(state.inventory.bag.every((s) => s === null)).toBe(true);
  });

  it('makes a version-1 character with the plain sword a warrior in the starting kit', () => {
    const read = readSave(stored({ ...OLDER[1], sword: 'plain', level: 2, xp: 130, wardenBeaten: false, quests: {} }));
    if (read.kind !== 'saved') throw new Error(read.kind);
    expect(read.record.inventory).toEqual(startingInventory('warrior'));
    const state = new AdventureState(read.record);
    expect(state.sword).toBe('plain');
    expect(state.haleSwordAtHip).toBe(true);
    expect(state.stats).toEqual(new AdventureState({ ...new AdventureState().snapshot(), level: 2, xp: 130 }).stats);
  });

  it("drops an item the catalogue doesn't know on load, rather than failing the read", () => {
    const record = recordOf(new AdventureState().snapshot());
    const bag = [{ id: 'axe-of-legends', count: 1 }, { id: 'torn-cloth-1', count: 2 }, ...record.inventory.bag.slice(2)];
    const odd = { ...record, inventory: { ...record.inventory, bag, gear: { ...record.inventory.gear, head: 'crown-of-nowhere' } } };
    const read = readSave(stored(odd));
    if (read.kind !== 'saved') throw new Error(read.kind);
    const state = new AdventureState(read.record);
    expect(state.inventory.bag.slice(0, 2)).toEqual([null, { id: 'torn-cloth-1', count: 2 }]);
    expect(state.inventory.gear.head).toBeNull();
  });

  it('loads a version-2 character with no professions learned, and everything else as it was', () => {
    const read = readSave(stored(OLDER[2]));
    if (read.kind !== 'saved') throw new Error(read.kind);
    expect(read.record.professions).toEqual(NO_PROFESSIONS);
    const { version: _, professions: __, class: ___c, name: ___n, ...kept } = read.record;
    const { version: ___, ...before } = OLDER[2] as SaveRecord;
    expect(kept).toEqual(before);
    const state = new AdventureState(read.record);
    expect(state.professions.learned).toEqual([]);
    expect(state.professions.recipes).toEqual([]);
    expect(state.inventory.coins).toBe(17);
    expect(state.level).toBe(3);
  });

  it('gives a version-1 character no professions either', () => {
    const read = readSave(stored(OLDER[1]));
    if (read.kind !== 'saved') throw new Error(read.kind);
    expect(read.record.professions).toEqual(NO_PROFESSIONS);
  });

  // A made-up version 0, written before there were quest stages, to prove the chain.
  const V0 = { version: 0, savedAt: 5, xp: 120, quest: 'lumber', x: 3, z: -4, yaw: 1 };
  const UP_FROM_0: Migration = {
    from: 0,
    up: (old) => ({
      version: 1,
      savedAt: old.savedAt,
      level: 2,
      xp: old.xp,
      sword: 'plain',
      quests: {
        raiders: { stage: 'handedIn', counts: [3] },
        lumber: { stage: 'offered', counts: [0, 0] },
        below: { stage: 'locked', counts: [0] },
      },
      wardenBeaten: false,
      position: { x: old.x, z: old.z },
      facing: old.yaw,
      interior: null,
    }),
  };

  it('upgrades an older record through its migrations, in order, to the current version', () => {
    const read = readSave(stored(V0), [UP_FROM_0, ...MIGRATIONS]);
    expect(read).toMatchObject({ kind: 'saved', record: { version: SAVE_VERSION, xp: 120, position: { x: 3, z: -4 }, facing: 1 } });
    if (read.kind !== 'saved') return;
    expect(new AdventureState(read.record).hale.marker).toBe('offered');
    expect(new AdventureState(read.record).level).toBe(2);
  });

  it('reads an older record with no way up as unreadable', () => {
    expect(readSave(stored(V0))).toEqual({ kind: 'unreadable' });
  });
});

describe('the in-memory store', () => {
  it('round-trips a save', async () => {
    const state = new AdventureState();
    [ACCEPT, FARM, FARM].forEach((e) => state.apply(e));
    const record = { ...recordOf(state.snapshot(), 1234), position: { x: 12.5, z: -30 }, facing: 2.1 };
    const store = new MemoryStore();
    await store.write(FIRST, record);
    const read = readSave(await store.read(FIRST));
    expect(read).toEqual({ kind: 'saved', record });
    if (read.kind !== 'saved') return;
    expect(answers(new AdventureState(read.record))).toEqual(answers(state));
  });

  it('round-trips everything you own: bag, quest page, gear, belt, coins, stash, chests and the cooldown', async () => {
    const state = new AdventureState();
    ROUTE.forEach((e) => state.apply(e));
    const { inventory } = state;
    inventory.take([{ id: 'torn-cloth-1', count: 3 }, { id: 'minor-healing-potion', count: 12 }, { id: 'leaders-orders', count: 1 }], 42);
    // The plain sword Hale's replaced is in the bag's first slot, the cloth in its second.
    inventory.move({ in: 'bag', slot: 3 }, { in: 'stash', slot: 20 });
    inventory.move({ in: 'bag', slot: 2 }, { in: 'belt', slot: 0 });
    inventory.drink(1);
    inventory.tick(15);
    inventory.openChest('watchtower', [{ id: 'worn-boots', count: 1 }], 10);
    const record = recordOf(state.snapshot(), 55);
    const store = new MemoryStore();
    await store.write(FIRST, record);
    const read = readSave(await store.read(FIRST));
    expect(read).toEqual({ kind: 'saved', record });
    if (read.kind !== 'saved') return;
    const restored = new AdventureState(read.record);
    expect(answers(restored)).toEqual(answers(state));
    expect(restored.inventory.snapshot()).toMatchObject({
      coins: 52,
      chests: ['watchtower'],
      cooldown: 45,
      quest: ['leaders-orders'],
      gear: { mainHand: 'hale-longsword' },
    });
    expect(restored.inventory.stash[20]).toEqual({ id: 'minor-healing-potion', count: 2 });
  });

  it('round-trips your professions: each learned with its proficiency and grade, and the recipes known', async () => {
    const state = new AdventureState();
    state.inventory.take([], 20);
    state.professions.learn('mining');
    state.professions.learn('herbalism');
    state.professions.setProficiency('alchemy', 5);
    state.professions.buy('rage-draught');
    for (let i = 0; i < 3; i++) state.professions.gather('copperVein');
    state.professions.train('herbalism', 'journeyman');
    const record = recordOf(state.snapshot(), 77);
    const store = new MemoryStore();
    await store.write(FIRST, record);
    const read = readSave(await store.read(FIRST));
    expect(read).toEqual({ kind: 'saved', record });
    if (read.kind !== 'saved') return;
    const restored = new AdventureState(read.record);
    expect(answers(restored)).toEqual(answers(state));
    expect(restored.professions.snapshot()).toEqual({
      learned: {
        mining: { proficiency: 3, grade: 'apprentice' },
        smithing: { proficiency: 0, grade: 'apprentice' },
        herbalism: { proficiency: 0, grade: 'journeyman' },
        alchemy: { proficiency: 5, grade: 'apprentice' },
      },
      recipes: ['copper-bar', 'whetstone', 'minor-healing-potion', 'rage-draught'],
    });
  });

  it('round-trips a save made inside the inn, with the inn as its interior', async () => {
    const state = new AdventureState();
    const record = saveRecord(state.snapshot(), { x: 16.05, z: -13.29, yaw: 1.78, interior: 'inn' }, 99);
    expect(record.interior).toBe('inn');
    const store = new MemoryStore();
    await store.write(FIRST, record);
    const read = readSave(await store.read(FIRST));
    expect(read).toEqual({ kind: 'saved', record });
    // Outdoors, a record has no interior; one naming a building that isn't one is unreadable.
    expect(recordOf(state.snapshot()).interior).toBe(null);
    expect(readSave(stored({ ...record, interior: 'cellar' }))).toEqual({ kind: 'unreadable' });
  });

  it('round-trips a save made inside the house by the well, with the house as its interior', async () => {
    const record = saveRecord(new AdventureState().snapshot(), { x: -12.4, z: -11.6, yaw: 0.9, interior: 'house' }, 99);
    const store = new MemoryStore();
    await store.write(FIRST, record);
    expect(readSave(await store.read(FIRST))).toEqual({ kind: 'saved', record });
  });

  it('round-trips a save made in the old mine, with the mine as its interior', async () => {
    // In the gallery, well past the adit's bend, under 20 m of hillside.
    const record = saveRecord(new AdventureState().snapshot(), { x: -29.5, z: -105, yaw: 0.2, interior: 'mine' }, 99);
    expect(record.interior).toBe('mine');
    const store = new MemoryStore();
    await store.write(FIRST, record);
    expect(readSave(await store.read(FIRST))).toEqual({ kind: 'saved', record });
  });

  it('keeps what was written, not the object it was given', async () => {
    const record = recordOf(new AdventureState().snapshot());
    const store = new MemoryStore();
    await store.write(FIRST, record);
    (record.position as { x: number }).x = 99;
    expect(await store.read(FIRST)).toMatchObject({ position: { x: 0.2 } });
  });

  it('holds nothing once a key is removed', async () => {
    const store = new MemoryStore();
    await store.write(FIRST, recordOf(new AdventureState().snapshot()));
    await store.remove(FIRST);
    expect(readSave(await store.read(FIRST))).toEqual({ kind: 'none' });
  });
});

describe('your characters', () => {
  /** The record `who` would write after `events`, standing at (x, z). */
  const played = (record: SaveRecord | null, who: Who, events: AdventureEvent[] = [], x = 1, z = 2) => {
    const state = new AdventureState(record ?? undefined, CHAINS, { class: who.class });
    events.forEach((e) => state.apply(e));
    return { state, record: saveRecord(state.snapshot(), { x, z, yaw: 0.5 }, 99, who) };
  };
  const saved = (c: Characters) => c.slots.map((s) => (s.kind === 'saved' ? `${s.key}: ${s.record.name}, level ${s.record.level}` : `${s.key}: ${s.kind}`));

  it("makes today's one record the first character, a warrior named Warrior, with their things and everything else they had", async () => {
    const store = new MemoryStore({ [FIRST]: V3 });
    const characters = await Characters.read(store);
    expect(saved(characters)).toEqual(['character: Warrior, level 4']);
    const slot = characters.slots[0];
    if (slot.kind !== 'saved') throw new Error(slot.kind);
    const { version: _, class: klass, name, ...kept } = slot.record;
    expect({ klass, name }).toEqual({ klass: 'warrior', name: 'Warrior' });
    const { version: __, ...before } = V3;
    expect(kept).toEqual(before);
    expect(characters.picked).toBe(FIRST);
    const you = characters.play();
    expect(you).toMatchObject({ key: FIRST, record: slot.record, who: { class: 'warrior', name: 'Warrior' } });
    const state = new AdventureState(you.record!, CHAINS, { class: you.who.class });
    expect(state.inventory.coins).toBe(42);
    expect(state.inventory.bag[0]).toEqual({ id: 'minor-healing-potion', count: 4 });
    expect(state.professions.learned).toEqual(['mining']);
    // Nothing is written just by opening it: a page left before VR never overwrites another tab's save.
    expect(store.keys()).toEqual([FIRST]);
    expect(await store.read(FIRST)).toEqual(V3);
    // The first write keeps the character under today's key, and writes the roster.
    await you.write(played(you.record, you.who).record);
    expect(await store.read(ROSTER)).toEqual({ version: ROSTER_VERSION, characters: [FIRST], last: FIRST });
    expect(readSave(await store.read(FIRST))).toMatchObject({ kind: 'saved', record: { version: SAVE_VERSION, name: 'Warrior', inventory: V3.inventory } });
    expect(saved(await Characters.read(store))).toEqual(['character: Warrior, level 4']);
  });

  it('brings a record of any older version into the roster the same way', async () => {
    const characters = await Characters.read(new MemoryStore({ [FIRST]: { version: 1, savedAt: 7, level: 5, xp: 1000, sword: 'hale', quests: {}, wardenBeaten: true, position: { x: 1, z: 2 }, facing: 0, interior: null } }));
    expect(characters.slots[0]).toMatchObject({ kind: 'saved', record: { class: 'warrior', name: 'Warrior', level: 5, inventory: { gear: { mainHand: 'hale-longsword' } } } });
  });

  it('has none where nothing is saved: Enter VR plays a new warrior with a suggested name, saved with its first write', async () => {
    const store = new MemoryStore();
    const characters = await Characters.read(store);
    expect(characters.slots).toEqual([]);
    expect(characters.picked).toBeNull();
    const you = characters.play();
    expect(you).toMatchObject({ key: FIRST, record: null, who: { class: 'warrior' } });
    expect(NAMES).toContain(you.who.name);
    expect(characters.play()).toBe(you);
    expect(store.keys()).toEqual([]);
    await you.write(played(null, you.who, [ACCEPT]).record);
    expect(await store.read(ROSTER)).toEqual({ version: ROSTER_VERSION, characters: [FIRST], last: FIRST });
    expect(saved(await Characters.read(store))).toEqual([`character: ${you.who.name}, level 1`]);
  });

  it("makes a character of a class at level 1 in that class's kit, standing at the start", async () => {
    const store = new MemoryStore();
    const characters = await Characters.read(store);
    expect(await characters.make('ranger', 'Wren', 3)).toBe(FIRST);
    const read = readSave(await store.read(FIRST));
    expect(read).toEqual({ kind: 'saved', record: newRecord({ class: 'ranger', name: 'Wren' }, 3) });
    if (read.kind !== 'saved') return;
    expect(read.record).toMatchObject({ level: 1, xp: 0, position: null, interior: null, inventory: startingInventory('ranger') });
    expect(new AdventureState(read.record, CHAINS, { class: 'ranger' }).hale.marker).toBe('offered');
  });

  it('round-trips characters through the in-memory store, each played on its own and kept apart', async () => {
    const store = new MemoryStore();
    const first = await Characters.read(store);
    await first.make('warrior', 'Aldric', 1);
    expect(await first.make('warrior', 'Brenna', 2)).toBe('character-2');
    expect(first.picked).toBe('character-2');

    // Brenna, picked when she was made, plays a while.
    const second = await Characters.read(store);
    const brenna = second.play();
    expect(brenna).toMatchObject({ key: 'character-2', record: { name: 'Brenna', level: 1, position: null } });
    const { state, record } = played(brenna.record, brenna.who, ROUTE.slice(0, 5), 3, 4);
    await brenna.write(record);

    const third = await Characters.read(store);
    expect(saved(third)).toEqual(['character: Aldric, level 1', 'character-2: Brenna, level 2']);
    expect(third.slots[0]).toEqual({ key: FIRST, kind: 'saved', record: newRecord({ class: 'warrior', name: 'Aldric' }, 1) });
    const back = third.slots[1];
    if (back.kind !== 'saved') throw new Error(back.kind);
    expect(back.record).toEqual(record);
    expect(answers(new AdventureState(back.record, CHAINS, { class: back.record.class }))).toEqual(answers(state));

    // Picking Aldric plays him next time, as he was made.
    await third.pick(FIRST);
    const fourth = await Characters.read(store);
    expect(fourth.picked).toBe(FIRST);
    expect(fourth.play().record).toEqual(newRecord({ class: 'warrior', name: 'Aldric' }, 1));
  });

  it("keeps the shapes each character has drawn: today's record's through the migration, and each character's apart", async () => {
    const store = new MemoryStore({ [FIRST]: { ...V3, drawn: ['ring'] } });
    const characters = await Characters.read(store);
    const you = characters.play();
    expect(you.record?.drawn).toEqual(['ring']);
    await you.write(played(you.record, you.who).record);
    await characters.make('warrior', 'Garrick', 5);
    const again = await Characters.read(store);
    expect(again.slots.map((s) => (s.kind === 'saved' ? s.record.drawn : 'none'))).toEqual([['ring'], undefined]);
  });

  it('keeps at most three', async () => {
    const characters = await Characters.read(new MemoryStore());
    for (const name of ['Aldric', 'Brenna', 'Corwin']) expect(await characters.make('warrior', name)).not.toBeNull();
    expect(characters.full).toBe(true);
    expect(await characters.make('warrior', 'Dara')).toBeNull();
    expect(characters.slots).toHaveLength(CONFIG.save.characters);
  });

  it('deletes a character for good, freeing its slot, and picks another', async () => {
    const store = new MemoryStore();
    const characters = await Characters.read(store);
    await characters.make('warrior', 'Aldric', 1);
    await characters.make('warrior', 'Brenna', 2);
    await characters.remove('character-2');
    expect(await store.read('character-2')).toBeUndefined();
    expect(await store.read(ROSTER)).toEqual({ version: ROSTER_VERSION, characters: [FIRST], last: null });
    const again = await Characters.read(store);
    expect(saved(again)).toEqual(['character: Aldric, level 1']);
    expect(again.picked).toBe(FIRST);
    await again.remove(FIRST);
    const none = await Characters.read(store);
    expect(none.slots).toEqual([]);
    expect(store.keys()).toEqual([ROSTER]);
    expect(none.play().record).toBeNull();
  });

  it("deletes today's one record for good once the roster is written, rather than bringing it back", async () => {
    const store = new MemoryStore({ [FIRST]: V3 });
    await (await Characters.read(store)).remove(FIRST);
    expect((await Characters.read(store)).slots).toEqual([]);
    expect(store.keys()).toEqual([ROSTER]);
  });

  it('renames a character at once, and the one being played keeps the new name in every write', async () => {
    const store = new MemoryStore();
    await (await Characters.read(store)).make('warrior', 'Aldric', 1);
    const characters = await Characters.read(store);
    const you = characters.play();
    await characters.rename(FIRST, 'Corwin');
    expect(await store.read(FIRST)).toMatchObject({ name: 'Corwin', level: 1 });
    expect(you.who.name).toBe('Corwin');
    await you.write(played(you.record, you.who, [ACCEPT]).record);
    expect(await store.read(FIRST)).toMatchObject({ name: 'Corwin', quests: { raiders: { stage: 'active' } } });
    // A name must have letters, at most 16, with nothing round them.
    for (const bad of ['', ' Corwin', 'Corwin ', 'A'.repeat(CONFIG.save.name + 1)]) await characters.rename(FIRST, bad);
    expect(await store.read(FIRST)).toMatchObject({ name: 'Corwin' });
    expect(await characters.make('warrior', '')).toBeNull();
  });

  it("renames a new character before it's saved, writing nothing until it plays", async () => {
    const store = new MemoryStore();
    const characters = await Characters.read(store);
    const you = characters.play();
    await characters.rename(you.key, 'Dara');
    expect(you.who.name).toBe('Dara');
    expect(store.keys()).toEqual([]);
    await you.write(played(null, you.who, [ACCEPT]).record);
    expect(await store.read(FIRST)).toMatchObject({ name: 'Dara' });
  });

  it("leaves a newer build's character alone: shown, never played or written over, but it can be deleted", async () => {
    const newer = { ...played(null, { class: 'mage', name: 'Sable' }).record, version: SAVE_VERSION + 1 };
    const store = new MemoryStore({
      [ROSTER]: { version: ROSTER_VERSION, characters: [FIRST, 'character-2'], last: FIRST },
      [FIRST]: newer,
      'character-2': newRecord({ class: 'warrior', name: 'Ivo' }, 4),
    });
    const characters = await Characters.read(store);
    expect(saved(characters)).toEqual(['character: newer', 'character-2: Ivo, level 1']);
    expect(characters.picked).toBe('character-2');
    const you = characters.play();
    await you.write(played(you.record, you.who, [ACCEPT]).record);
    expect(await store.read(FIRST)).toEqual(newer);
    await characters.remove(FIRST);
    expect(await store.read(FIRST)).toBeUndefined();
  });

  it("shows a character it can't read, to delete, and plays a new one beside it", async () => {
    const unreadable = { version: SAVE_VERSION, level: 'five' };
    const store = new MemoryStore({ [FIRST]: unreadable });
    const characters = await Characters.read(store);
    expect(saved(characters)).toEqual(['character: unreadable']);
    const you = characters.play();
    expect(you).toMatchObject({ key: 'character-2', record: null });
    await you.write(played(null, you.who, [ACCEPT]).record);
    expect(await store.read(FIRST)).toEqual(unreadable);
    expect(await store.read(ROSTER)).toEqual({ version: ROSTER_VERSION, characters: [FIRST, 'character-2'], last: 'character-2' });
  });

  it("leaves a newer build's roster, or its one record from before the roster, alone and plays unsaved, saying so", async () => {
    const insides = [
      { [ROSTER]: { version: ROSTER_VERSION + 1, characters: [] }, [FIRST]: newRecord({ class: 'warrior', name: 'Osric' }) },
      { [FIRST]: { ...V3, version: SAVE_VERSION + 1 } },
    ];
    for (const inside of insides) {
      const store = new MemoryStore(inside);
      const characters = await Characters.read(store);
      expect(characters.note).toMatch(/newer/);
      expect(characters.slots).toEqual([]);
      const you = characters.play();
      await you.write(played(null, you.who, [ACCEPT]).record);
      await characters.make('warrior', 'Rowan');
      for (const [key, value] of Object.entries(inside)) expect(await store.read(key)).toEqual(value);
    }
  });

  it("plays unsaved over a roster it can't read, leaving it alone, and says so", async () => {
    const store = new MemoryStore({ [ROSTER]: { version: ROSTER_VERSION, characters: 'all of them' } });
    const characters = await Characters.read(store);
    expect(characters.note).toMatch(/couldn't be read/);
    await characters.play().write(played(null, characters.play().who, [ACCEPT]).record);
    expect(store.keys()).toEqual([ROSTER]);
  });

  it("opens the browser's store, or plays unsaved where the browser won't store data, and says so", async () => {
    const kept = new MemoryStore({ [FIRST]: V3 });
    const opened = await openCharacters(async () => kept);
    expect(opened.note).toBeNull();
    expect(saved(opened)).toEqual(['character: Warrior, level 4']);
    const unsaved = await openCharacters(async () => {
      throw new Error('IndexedDB is not available');
    });
    expect(unsaved.note).toMatch(/won't be kept/);
    expect(unsaved.slots).toEqual([]);
    expect(unsaved.play().record).toBeNull();
  });

  it('suggests a name none of your characters has', async () => {
    const characters = await Characters.read(new MemoryStore());
    await characters.make('warrior', NAMES[0]);
    await characters.make('warrior', NAMES[1]);
    expect(characters.suggestName(() => 0)).toBe(NAMES[2]);
    expect(characters.suggestName(() => 0.999)).toBe(NAMES.at(-1));
  });
});
/** A store whose writes finish only when told to, counting how many are in flight at once. */
class SlowStore implements RecordWriter {
  readonly writes: SaveRecord[] = [];
  private readonly waiting: (() => void)[] = [];
  inFlight = 0;
  mostInFlight = 0;

  write(record: SaveRecord): Promise<void> {
    this.writes.push(structuredClone(record));
    this.mostInFlight = Math.max(this.mostInFlight, ++this.inFlight);
    return new Promise((done) =>
      this.waiting.push(() => {
        this.inFlight--;
        done();
      }),
    );
  }

  /** Let the oldest write in flight finish, and whatever it sets off start. */
  async finish(): Promise<void> {
    this.waiting.shift()?.();
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }

  async finishAll(): Promise<void> {
    while (this.waiting.length) await this.finish();
  }
}

describe('the save controller', () => {
  /** A controller over a slow store, snapshotting a character whose XP the test sets. */
  function saving() {
    const store = new SlowStore();
    const you = { xp: 0 };
    const controller = new SaveController(store, () => ({ ...recordOf(new AdventureState().snapshot()), xp: you.xp }));
    return { store, you, controller };
  }

  const effects: Record<string, Effect[]> = {
    'taking a quest': [{ kind: 'quest', quest: 'raiders', stage: 'active' }],
    'a count going up': [{ kind: 'xp', amount: 10 }, { kind: 'progress', quest: 'raiders', objective: 0, count: 1 }],
    'a quest becoming ready': [{ kind: 'quest', quest: 'raiders', stage: 'ready' }],
    'a hand-in': [{ kind: 'quest', quest: 'raiders', stage: 'handedIn' }, { kind: 'xp', amount: 80 }],
    'a level-up': [{ kind: 'xp', amount: 10 }, { kind: 'level', level: 2, unlocks: ['warCry'] }],
    'a reward worn at once': [{ kind: 'slot', where: { in: 'gear', slot: 'mainHand' }, stack: { id: 'hale-longsword', count: 1 } }],
    'loot taken': [{ kind: 'coins', coins: 5 }, { kind: 'slot', where: { in: 'bag', slot: 0 }, stack: { id: 'torn-cloth-1', count: 1 } }],
    'a potion drunk': [{ kind: 'drank', id: 'minor-healing-potion', heal: 0.4 }],
    'a chest opened': [{ kind: 'chest', chest: 'watchtower' }],
    'a profession learned': [{ kind: 'learned', profession: 'mining' }, { kind: 'recipe', recipe: 'copper-bar' }],
    'a recipe bought': [{ kind: 'coins', coins: 5 }, { kind: 'recipe', recipe: 'rage-draught' }],
    'proficiency gained': [{ kind: 'proficiency', profession: 'mining', proficiency: 4, gained: 1 }],
    'a grade reached': [{ kind: 'grade', profession: 'mining', grade: 'journeyman' }],
  };

  for (const [what, list] of Object.entries(effects)) {
    it(`writes on ${what}`, async () => {
      const { store, controller } = saving();
      controller.onEffects(list);
      expect(store.writes).toHaveLength(1);
    });
  }

  it("doesn't write for XP alone, a refusal, a drop lying on the ground, loot left there, or nothing", () => {
    const { store, controller } = saving();
    controller.onEffects([{ kind: 'xp', amount: 10 }]);
    controller.onEffects([{ kind: 'refused', reason: 'level' }]);
    controller.onEffects([{ kind: 'loot', coins: 4, items: ['torn-cloth-1'] }, { kind: 'xp', amount: 10 }]);
    controller.onEffects([{ kind: 'left', stack: { id: 'iron-longsword-2', count: 1 } }]);
    controller.onEffects([{ kind: 'refused', reason: 'proficiency' }]);
    controller.onEffects([]);
    expect(store.writes).toHaveLength(0);
  });

  it('writes once for everything one event did', () => {
    const { store, controller } = saving();
    const state = new AdventureState();
    [ACCEPT, FARM, FARM].forEach((e) => state.apply(e));
    // The third bandit: its XP, a count and the quest ready.
    const third = state.apply(FARM);
    expect(third.map((e) => e.kind)).toEqual(['loot', 'xp', 'progress', 'quest']);
    controller.onEffects(third);
    expect(store.writes).toHaveLength(1);
  });

  it('writes on each change of current zone, not on the first it hears of', () => {
    const { store, controller } = saving();
    controller.onZone('forest');
    controller.onZone('forest');
    expect(store.writes).toHaveLength(0);
    controller.onZone('brackenmoor');
    expect(store.writes).toHaveLength(1);
  });

  it('writes every 30 s of play, counted from the last write', async () => {
    const { store, controller } = saving();
    controller.update(CONFIG.save.every - 0.1);
    expect(store.writes).toHaveLength(0);
    controller.update(0.1);
    expect(store.writes).toHaveLength(1);
    await store.finishAll();
    controller.update(CONFIG.save.every / 2);
    controller.onEffects([{ kind: 'quest', quest: 'raiders', stage: 'active' }]);
    await store.finishAll();
    controller.update(CONFIG.save.every - 0.1);
    expect(store.writes).toHaveLength(2);
    controller.update(0.1);
    expect(store.writes).toHaveLength(3);
  });

  it('writes when the page is hidden or VR ends, once the game has run', () => {
    const { store, controller } = saving();
    controller.update(1 / 72);
    controller.onLeaving();
    expect(store.writes).toHaveLength(1);
  });

  it("doesn't write when a page left before VR is hidden, so it never overwrites a save from elsewhere", () => {
    const { store, controller } = saving();
    controller.onLeaving();
    expect(store.writes).toHaveLength(0);
  });

  it('never has two writes in flight, and the latest state wins', async () => {
    const { store, you, controller } = saving();
    controller.update(1 / 72);
    you.xp = 10;
    controller.onLeaving();
    you.xp = 20;
    controller.onLeaving();
    you.xp = 30;
    controller.onLeaving();
    expect(store.writes.map((r) => r.xp)).toEqual([10]);
    await store.finish();
    expect(store.writes.map((r) => r.xp)).toEqual([10, 30]);
    await store.finishAll();
    expect(store.writes.map((r) => r.xp)).toEqual([10, 30]);
    expect(store.mostInFlight).toBe(1);
  });

  it('carries on after a write fails', async () => {
    const failing: RecordWriter = { write: () => Promise.reject(new Error('quota')) };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const controller = new SaveController(failing, () => recordOf(new AdventureState().snapshot()));
    controller.update(CONFIG.save.every);
    await controller.settled();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    const writes: SaveRecord[] = [];
    failing.write = async (r) => void writes.push(r);
    controller.update(CONFIG.save.every);
    await controller.settled();
    expect(writes).toHaveLength(1);
  });
});
