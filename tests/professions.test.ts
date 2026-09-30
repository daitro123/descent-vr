import { describe, expect, it } from 'vitest';
import { AdventureState } from '../src/adventureState';
import { CONFIG } from '../src/config';
import { Inventory, type Stack } from '../src/inventory';
import { itemOf } from '../src/items';
import { EVERY_MATERIAL, professionsDebug } from '../src/professions/debug';
import {
  capOf,
  NO_PROFESSIONS,
  type ProfessionEffect,
  type ProfessionsEffects,
  Professions,
  type ProfessionsSave,
  RECIPES,
  SPOT_KINDS,
} from '../src/professions/professions';

// The professions module at its seam, working against a real inventory:
// learn, gather, start, finish and buy in; what a player would notice out:
// what went into the bag, what proficiency became, what was refused and why,
// which recipes are known (.scratch/professions/spec.md, "The professions
// state" and Testing Decisions).

/** A new warrior's things and professions, with `stacks` in the bag and `coins` in the purse. */
function character(stacks: Stack[] = [], coins = 0, saved?: ProfessionsSave) {
  const inventory = new Inventory({ class: 'warrior', level: 1 });
  inventory.take(stacks, coins);
  return { inventory, professions: new Professions(inventory, saved) };
}

const refusals = (effects: ProfessionsEffects) => effects.flatMap((e) => (e.kind === 'refused' ? [e.reason] : []));
const of = <K extends ProfessionEffect['kind']>(effects: ProfessionsEffects, kind: K) =>
  effects.filter((e): e is Extract<ProfessionEffect, { kind: K }> => e.kind === kind);

/** Fill every bag slot with a single worn tunic. */
const fillBag = (inventory: Inventory) => inventory.take(Array.from({ length: CONFIG.bag.slots }, () => ({ id: 'worn-tunic', count: 1 })));

/** A snapshot of `inventory`'s bag, for checking nothing changed. */
const bagOf = (inventory: Inventory) => structuredClone(inventory.bag);

describe('learning', () => {
  it('teaches Mining with Smithing at Apprentice, with no proficiency, knowing the copper bar and the whetstone', () => {
    const { professions } = character();
    const effects = professions.learn('mining');
    expect(of(effects, 'learned').map((e) => e.profession)).toEqual(['mining', 'smithing']);
    expect(of(effects, 'recipe').map((e) => e.recipe)).toEqual(['copper-bar', 'whetstone']);
    expect(professions.learned).toEqual(['mining', 'smithing']);
    expect(professions.grade('mining')).toBe('apprentice');
    expect(professions.proficiency('smithing')).toBe(0);
    expect(professions.recipes).toEqual(['copper-bar', 'whetstone']);
  });

  it('teaches Herbalism with Alchemy, knowing the minor healing potion', () => {
    const { professions } = character();
    professions.learn('herbalism');
    expect(professions.learned).toEqual(['herbalism', 'alchemy']);
    expect(professions.recipes).toEqual(['minor-healing-potion']);
  });

  it('teaches the pair whichever of the two is named', () => {
    const { professions } = character();
    professions.learn('alchemy');
    expect(professions.learned).toEqual(['herbalism', 'alchemy']);
  });

  it('lets one character learn all four', () => {
    const { professions } = character();
    professions.learn('mining');
    professions.learn('herbalism');
    expect(professions.learned).toEqual(['mining', 'smithing', 'herbalism', 'alchemy']);
  });

  it('refuses to learn a pair twice, changing nothing', () => {
    const { professions } = character();
    professions.learn('mining');
    professions.setProficiency('mining', 7);
    expect(refusals(professions.learn('mining'))).toEqual(['learned']);
    expect(refusals(professions.learn('smithing'))).toEqual(['learned']);
    expect(professions.proficiency('mining')).toBe(7);
    expect(professions.recipes).toEqual(['copper-bar', 'whetstone']);
  });

  it('has nothing learned for a new character', () => {
    const { professions } = character();
    expect(professions.learned).toEqual([]);
    expect(professions.grade('mining')).toBeNull();
    expect(professions.snapshot()).toEqual(NO_PROFESSIONS);
  });
});

describe('gathering', () => {
  it('breaks a copper vein into 3 copper ore and 1 rough stone in the bag, and 1 Mining', () => {
    const { inventory, professions } = character();
    professions.learn('mining');
    const effects = professions.gather('copperVein');
    expect(inventory.count('copper-ore')).toBe(3);
    expect(inventory.count('rough-stone')).toBe(1);
    expect(of(effects, 'proficiency')).toEqual([{ kind: 'proficiency', profession: 'mining', proficiency: 1, gained: 1 }]);
  });

  it.each([
    ['hearthleaf', 'hearthleaf'],
    ['duskcap', 'duskcap'],
  ] as const)('cuts a clump of %s into 2 herbs in the bag, and 1 Herbalism', (kind, herb) => {
    const { inventory, professions } = character();
    professions.learn('herbalism');
    professions.gather(kind);
    expect(inventory.count(herb)).toBe(2);
    expect(professions.proficiency('herbalism')).toBe(1);
  });

  it('refuses a spot whose profession you have not learned, taking nothing in', () => {
    const { inventory, professions } = character();
    professions.learn('herbalism');
    expect(refusals(professions.gather('copperVein'))).toEqual(['unlearned']);
    expect(inventory.count('copper-ore')).toBe(0);
  });

  it('counts every spot emptied, up to the grade cap and nothing past it', () => {
    const { professions } = character();
    professions.learn('mining');
    for (let i = 0; i < 24; i++) professions.gather('copperVein');
    expect(professions.proficiency('mining')).toBe(24);
    expect(of(professions.gather('copperVein'), 'proficiency')).toHaveLength(1);
    expect(professions.proficiency('mining')).toBe(capOf('apprentice'));
    const past = professions.gather('copperVein');
    expect(of(past, 'proficiency')).toEqual([]);
    // Still emptied, for a quest to count.
    expect(of(past, 'gathered')).toEqual([{ kind: 'gathered', spot: 'copperVein' }]);
    expect(professions.proficiency('mining')).toBe(25);
  });

  it('still takes the ore at the cap', () => {
    const { inventory, professions } = character();
    professions.learn('mining');
    professions.setProficiency('mining', 25);
    professions.gather('copperVein');
    expect(inventory.count('copper-ore')).toBe(3);
  });

  it('reports what the bag has no room for as left where it lay, and still counts', () => {
    const { inventory, professions } = character();
    professions.learn('mining');
    fillBag(inventory);
    const effects = professions.gather('copperVein');
    expect(effects.filter((e) => e.kind === 'left').map((e) => (e.kind === 'left' ? e.stack : null))).toEqual([
      { id: 'copper-ore', count: 3 },
      { id: 'rough-stone', count: 1 },
    ]);
    expect(professions.proficiency('mining')).toBe(1);
  });

  it('knows every kind of spot as data: its profession and yield', () => {
    expect(SPOT_KINDS.copperVein).toMatchObject({ profession: 'mining', gives: { 'copper-ore': 3, 'rough-stone': 1 }, gain: 1 });
    expect(SPOT_KINDS.hearthleaf).toMatchObject({ profession: 'herbalism', gives: { hearthleaf: 2 } });
    expect(SPOT_KINDS.duskcap).toMatchObject({ profession: 'herbalism', gives: { duskcap: 2 } });
    for (const spot of Object.values(SPOT_KINDS)) expect(spot.refill).toEqual({ after: 180, away: 30 });
  });
});

describe('starting a make', () => {
  it('takes exactly its materials out of the bag, and says the station is working', () => {
    const { inventory, professions } = character([{ id: 'copper-ore', count: 5 }]);
    professions.learn('mining');
    const effects = professions.start('copper-bar');
    expect(inventory.count('copper-ore')).toBe(3);
    expect(of(effects, 'started')).toEqual([{ kind: 'started', station: 'anvil', recipe: 'copper-bar' }]);
    expect(professions.working('anvil')).toBe('copper-bar');
    expect(professions.working('bench')).toBeNull();
  });

  it('takes a recipe of two herbs, one of each', () => {
    const { inventory, professions } = character(
      [
        { id: 'hearthleaf', count: 3 },
        { id: 'duskcap', count: 2 },
      ],
      10,
    );
    professions.learn('herbalism');
    professions.setProficiency('alchemy', 5);
    professions.buy('minor-mana-potion');
    professions.start('minor-mana-potion');
    expect(inventory.count('hearthleaf')).toBe(2);
    expect(inventory.count('duskcap')).toBe(1);
  });

  it('takes from the last stacks in the bag first, so the first stay whole', () => {
    const { inventory, professions } = character([{ id: 'copper-bar', count: 22 }], 25);
    expect(inventory.bag.slice(0, 2)).toEqual([
      { id: 'copper-bar', count: 20 },
      { id: 'copper-bar', count: 2 },
    ]);
    professions.learn('mining');
    professions.setProficiency('smithing', 15);
    professions.buy('copper-gauntlets-of-strength');
    professions.start('copper-gauntlets-of-strength');
    expect(inventory.bag.slice(0, 2)).toEqual([{ id: 'copper-bar', count: 18 }, null]);
  });

  it.each([
    ['a recipe of a profession you have not learned', 'minor-healing-potion', 'unlearned'],
    ['a recipe the game does not know', 'sword-of-ages', 'unknown'],
  ] as const)('refuses %s, taking nothing', (_, recipe, reason) => {
    const { inventory, professions } = character([{ id: 'hearthleaf', count: 4 }]);
    professions.learn('mining');
    const before = bagOf(inventory);
    expect(refusals(professions.start(recipe))).toEqual([reason]);
    expect(inventory.bag).toEqual(before);
    expect(professions.working('bench')).toBeNull();
  });

  it('refuses a recipe of a learned profession you have not bought', () => {
    const { inventory, professions } = character([{ id: 'duskcap', count: 4 }]);
    professions.learn('herbalism');
    professions.setProficiency('alchemy', 5);
    expect(refusals(professions.start('rage-draught'))).toEqual(['unknown']);
    expect(inventory.count('duskcap')).toBe(4);
  });

  it('refuses with too little proficiency, taking nothing', () => {
    const { inventory, professions } = character([{ id: 'copper-bar', count: 4 }], 100);
    professions.learn('mining');
    professions.setProficiency('smithing', 15);
    professions.buy('copper-gauntlets-of-agility');
    professions.setProficiency('smithing', 14);
    expect(refusals(professions.start('copper-gauntlets-of-agility'))).toEqual(['proficiency']);
    expect(inventory.count('copper-bar')).toBe(4);
  });

  it('refuses with missing materials, taking nothing, not even what the bag does hold', () => {
    const { inventory, professions } = character([{ id: 'hearthleaf', count: 1 }]);
    professions.learn('herbalism');
    expect(refusals(professions.start('minor-healing-potion'))).toEqual(['materials']);
    expect(inventory.count('hearthleaf')).toBe(1);
    expect(professions.working('bench')).toBeNull();
  });

  it('refuses a second make at a working station, taking nothing', () => {
    const { inventory, professions } = character([{ id: 'copper-ore', count: 4 }]);
    professions.learn('mining');
    professions.start('copper-bar');
    expect(refusals(professions.start('copper-bar'))).toEqual(['busy']);
    expect(inventory.count('copper-ore')).toBe(2);
  });

  it('lets both stations work at once', () => {
    const { professions } = character([
      { id: 'rough-stone', count: 1 },
      { id: 'hearthleaf', count: 2 },
    ]);
    professions.learn('mining');
    professions.learn('herbalism');
    expect(refusals(professions.start('whetstone'))).toEqual([]);
    expect(refusals(professions.start('minor-healing-potion'))).toEqual([]);
  });
});

describe('finishing a make', () => {
  it('puts the thing in the bag, frees the station and adds the proficiency', () => {
    const { inventory, professions } = character([{ id: 'hearthleaf', count: 2 }]);
    professions.learn('herbalism');
    professions.start('minor-healing-potion');
    const effects = professions.finish('bench');
    expect(inventory.count('minor-healing-potion')).toBe(1);
    expect(of(effects, 'made')).toEqual([
      { kind: 'made', station: 'bench', recipe: 'minor-healing-potion', stack: { id: 'minor-healing-potion', count: 1 }, left: false },
    ]);
    expect(of(effects, 'proficiency')).toEqual([{ kind: 'proficiency', profession: 'alchemy', proficiency: 1, gained: 1 }]);
    expect(professions.working('bench')).toBeNull();
  });

  it('smelts two ore into a bar, and a bar is what the gauntlets take', () => {
    const { inventory, professions } = character([{ id: 'copper-ore', count: 2 }]);
    professions.learn('mining');
    professions.start('copper-bar');
    professions.finish('anvil');
    expect(inventory.count('copper-ore')).toBe(0);
    expect(inventory.count('copper-bar')).toBe(1);
    expect(professions.proficiency('smithing')).toBe(1);
  });

  it('pays 3 proficiency for the gauntlets, and makes the version chosen', () => {
    const { inventory, professions } = character([{ id: 'copper-bar', count: 4 }], 25);
    professions.learn('mining');
    professions.setProficiency('smithing', 15);
    professions.buy('copper-gauntlets-of-intellect');
    professions.start('copper-gauntlets-of-intellect');
    professions.finish('anvil');
    expect(inventory.count('copper-gauntlets-of-intellect')).toBe(1);
    expect(inventory.count('copper-bar')).toBe(0);
    expect(professions.proficiency('smithing')).toBe(18);
  });

  it('leaves the thing waiting on the station when the bag is full, and still counts it', () => {
    const { inventory, professions } = character([{ id: 'rough-stone', count: 1 }]);
    professions.learn('mining');
    professions.start('whetstone');
    fillBag(inventory);
    const effects = professions.finish('anvil');
    expect(of(effects, 'made')).toEqual([{ kind: 'made', station: 'anvil', recipe: 'whetstone', stack: { id: 'whetstone', count: 1 }, left: true }]);
    expect(effects.some((e) => e.kind === 'left')).toBe(false);
    expect(inventory.count('whetstone')).toBe(0);
    expect(professions.proficiency('smithing')).toBe(1);
    expect(professions.working('anvil')).toBeNull();
  });

  it('refuses at a station with nothing under way', () => {
    const { inventory, professions } = character();
    professions.learn('mining');
    expect(refusals(professions.finish('anvil'))).toEqual(['idle']);
    expect(inventory.bag.every((s) => s === null)).toBe(true);
  });

  it('stops paying at the cap', () => {
    const { professions } = character([{ id: 'copper-ore', count: 2 }]);
    professions.learn('mining');
    professions.setProficiency('smithing', 25);
    professions.start('copper-bar');
    expect(of(professions.finish('anvil'), 'proficiency')).toEqual([]);
    expect(professions.proficiency('smithing')).toBe(25);
  });
});

describe('buying a recipe', () => {
  it('spends the coins and teaches it', () => {
    const { inventory, professions } = character([], 30);
    professions.learn('herbalism');
    professions.setProficiency('alchemy', 5);
    const effects = professions.buy('rage-draught');
    expect(inventory.coins).toBe(20);
    expect(of(effects, 'recipe')).toEqual([{ kind: 'recipe', recipe: 'rage-draught' }]);
    expect(professions.knows('rage-draught')).toBe(true);
  });

  it('teaches every version of the gauntlets for one price', () => {
    const { inventory, professions } = character([], 30);
    professions.learn('mining');
    professions.setProficiency('smithing', 15);
    professions.buy('copper-gauntlets-of-agility');
    expect(inventory.coins).toBe(5);
    for (const main of ['strength', 'agility', 'intellect']) expect(professions.knows(`copper-gauntlets-of-${main}`)).toBe(true);
  });

  it('refuses with too few coins, spending nothing', () => {
    const { inventory, professions } = character([], 9);
    professions.learn('herbalism');
    professions.setProficiency('alchemy', 10);
    expect(refusals(professions.buy('elixir-of-the-keen-eye'))).toEqual(['coins']);
    expect(inventory.coins).toBe(9);
    expect(professions.knows('elixir-of-the-keen-eye')).toBe(false);
  });

  it('refuses a recipe already known, spending nothing', () => {
    const { inventory, professions } = character([], 50);
    professions.learn('herbalism');
    professions.setProficiency('alchemy', 5);
    professions.buy('minor-mana-potion');
    expect(refusals(professions.buy('minor-mana-potion'))).toEqual(['known']);
    expect(refusals(professions.buy('minor-healing-potion'))).toEqual(['known']);
    expect(inventory.coins).toBe(40);
  });

  it('refuses with too little proficiency, and a profession not learned', () => {
    const { inventory, professions } = character([], 50);
    professions.learn('herbalism');
    professions.setProficiency('alchemy', 9);
    expect(refusals(professions.buy('elixir-of-the-keen-eye'))).toEqual(['proficiency']);
    expect(refusals(professions.buy('copper-gauntlets-of-strength'))).toEqual(['unlearned']);
    expect(refusals(professions.buy('crown-of-nowhere'))).toEqual(['unknown']);
    expect(inventory.coins).toBe(50);
  });
});

describe('grades', () => {
  it('cap proficiency at Apprentice 25 until the next grade is taught, which lifts it', () => {
    const { professions } = character();
    professions.learn('mining');
    professions.setProficiency('mining', 99);
    expect(professions.proficiency('mining')).toBe(25);
    expect(of(professions.train('mining', 'journeyman'), 'grade')).toEqual([{ kind: 'grade', profession: 'mining', grade: 'journeyman' }]);
    professions.gather('copperVein');
    // An Apprentice vein pays nothing once you're a Journeyman.
    expect(professions.proficiency('mining')).toBe(25);
    professions.setProficiency('mining', 99);
    expect(professions.proficiency('mining')).toBe(50);
  });

  it('are taught one at a time, and only for a profession learned', () => {
    const { professions } = character();
    expect(refusals(professions.train('mining', 'journeyman'))).toEqual(['unlearned']);
    professions.learn('mining');
    expect(refusals(professions.train('mining', 'expert'))).toEqual(['grade']);
    expect(refusals(professions.train('mining', 'apprentice'))).toEqual(['grade']);
    expect(professions.grade('mining')).toBe('apprentice');
  });

  it('run Apprentice 25, Journeyman 50, Expert 75, Artisan 100', () => {
    expect([capOf('apprentice'), capOf('journeyman'), capOf('expert'), capOf('artisan')]).toEqual([25, 50, 75, 100]);
  });
});

describe('the Apprentice recipes', () => {
  it('are data: what each takes, makes, needs, pays and costs', () => {
    const row = (id: string) => {
      const r = RECIPES[id];
      return [r.profession, r.station, r.takes, r.makes, r.needs, r.gain, r.price];
    };
    expect(row('copper-bar')).toEqual(['smithing', 'anvil', { 'copper-ore': 2 }, 'copper-bar', 0, 1, null]);
    expect(row('whetstone')).toEqual(['smithing', 'anvil', { 'rough-stone': 1 }, 'whetstone', 0, 1, null]);
    for (const main of ['strength', 'agility', 'intellect']) {
      expect(row(`copper-gauntlets-of-${main}`)).toEqual(['smithing', 'anvil', { 'copper-bar': 4 }, `copper-gauntlets-of-${main}`, 15, 3, 25]);
    }
    expect(row('minor-healing-potion')).toEqual(['alchemy', 'bench', { hearthleaf: 2 }, 'minor-healing-potion', 0, 1, null]);
    expect(row('rage-draught')).toEqual(['alchemy', 'bench', { duskcap: 2 }, 'rage-draught', 3, 1, 10]);
    expect(row('minor-mana-potion')).toEqual(['alchemy', 'bench', { hearthleaf: 1, duskcap: 1 }, 'minor-mana-potion', 3, 1, 10]);
    expect(row('elixir-of-the-keen-eye')).toEqual(['alchemy', 'bench', { hearthleaf: 2, duskcap: 1 }, 'elixir-of-the-keen-eye', 10, 1, 10]);
  });

  it('take and make only items the catalogue knows', () => {
    for (const r of Object.values(RECIPES)) {
      expect(itemOf(r.makes), r.id).toBeDefined();
      for (const id of Object.keys(r.takes)) expect(itemOf(id), `${r.id} takes ${id}`).toBeDefined();
    }
    for (const spot of Object.values(SPOT_KINDS)) for (const id of Object.keys(spot.gives)) expect(itemOf(id)).toBeDefined();
  });
});

describe('a save', () => {
  it('round-trips professions, proficiency, grade and recipes', () => {
    const { professions, inventory } = character([], 30);
    professions.learn('mining');
    professions.learn('herbalism');
    professions.setProficiency('mining', 12);
    professions.setProficiency('alchemy', 5);
    professions.buy('rage-draught');
    professions.train('mining', 'journeyman');
    const restored = new Professions(inventory, structuredClone(professions.snapshot()));
    expect(restored.snapshot()).toEqual(professions.snapshot());
    expect(restored.proficiency('mining')).toBe(12);
    expect(restored.grade('mining')).toBe('journeyman');
    expect(restored.knows('rage-draught')).toBe(true);
  });

  it('never saves work on a station: loading finds every station empty', () => {
    const { professions, inventory } = character([{ id: 'copper-ore', count: 2 }]);
    professions.learn('mining');
    professions.start('copper-bar');
    const restored = new Professions(inventory, structuredClone(professions.snapshot()));
    expect(restored.working('anvil')).toBeNull();
  });

  it('is taken as best it fits: an unknown recipe dropped, proficiency kept within its grade, taught recipes known', () => {
    const { professions } = character([], 0, {
      learned: { mining: { proficiency: 40, grade: 'apprentice' }, smithing: { proficiency: -3, grade: 'apprentice' } },
      recipes: ['sword-of-ages', 'copper-gauntlets-of-strength', 'rage-draught'],
    });
    expect(professions.proficiency('mining')).toBe(25);
    expect(professions.proficiency('smithing')).toBe(0);
    // Alchemy isn't learned, so its recipe goes; the taught ones come with Smithing.
    expect(professions.recipes).toEqual(['copper-gauntlets-of-strength', 'copper-bar', 'whetstone']);
  });
});

describe('the adventure state', () => {
  it('keeps your professions in its snapshot, and restores them', () => {
    const state = new AdventureState();
    state.professions.learn('mining');
    state.professions.gather('copperVein');
    const snapshot = state.snapshot();
    expect(snapshot.professions).toEqual({
      learned: { mining: { proficiency: 1, grade: 'apprentice' }, smithing: { proficiency: 0, grade: 'apprentice' } },
      recipes: ['copper-bar', 'whetstone'],
    });
    const restored = new AdventureState(structuredClone(snapshot));
    expect(restored.professions.proficiency('mining')).toBe(1);
    expect(restored.inventory.count('copper-ore')).toBe(3);
  });
});

describe('the debug handle', () => {
  it('teaches a pair, or every profession, and writes it', () => {
    const state = new AdventureState();
    const writes: unknown[] = [];
    const debug = professionsDebug(state, (e) => writes.push(e));
    debug.learn('herbalism');
    expect(state.professions.learned).toEqual(['herbalism', 'alchemy']);
    debug.learn();
    expect(state.professions.learned).toEqual(['mining', 'smithing', 'herbalism', 'alchemy']);
    expect(writes).toHaveLength(2);
  });

  it('sets proficiency within the grade', () => {
    const state = new AdventureState();
    const debug = professionsDebug(state);
    debug.learn('mining');
    debug.proficiency('smithing', 15);
    expect(state.professions.proficiency('smithing')).toBe(15);
    debug.proficiency('smithing', 60);
    expect(state.professions.proficiency('smithing')).toBe(25);
  });

  it('fills the bag with a stack of every material, or with what it is given', () => {
    const state = new AdventureState();
    const debug = professionsDebug(state);
    debug.fill();
    for (const [id, count] of Object.entries(EVERY_MATERIAL)) expect(state.inventory.count(id)).toBe(count);
    debug.fill({ duskcap: 3 });
    expect(state.inventory.count('duskcap')).toBe(23);
  });
});
