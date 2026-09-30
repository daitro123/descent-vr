import { describe, expect, it } from 'vitest';
import { type AdventureEvent, AdventureState, type Effect, type Role } from '../src/adventureState';
import type { CampId } from '../src/maps/types';
import type { ProfessionsEffects } from '../src/professions/professions';
import { lessonsFor, studies } from '../src/professions/trainers';
import type { GiverId } from '../src/quests';
import { ledgerLines } from '../src/ui/bag/panel';
import { opensWith, trainerTalk, vendorTalk } from '../src/vendors';

// The trainers and their intro quests, at the adventure state's seam: the
// smith's "Ore and Fire" and the herbalist's "Leaves for the Pot" open at
// Raiders in the Fields' hand-in, accepting one teaches its pair, the gather
// and make objectives count from the professions module's own effects, and
// the hand-in pays XP as a level-2 quest and 5 coins. The Train list's rows,
// the talk boards' buttons, the trainers' barks and the bag panel's lines
// (.scratch/professions/issues/18-trainers-and-intro-quests.md).

const kill = (camp: CampId | null, level: number, role: Role = 'ordinary'): AdventureEvent => ({
  kind: 'kill',
  camp,
  level,
  role,
  family: 'bandit',
  seed: 1,
});
const accept = (giver?: GiverId): AdventureEvent => ({ kind: 'accept', giver });
const handIn = (giver?: GiverId): AdventureEvent => ({ kind: 'handIn', giver });
const FARM = kill('farm', 1);
const RAIDERS = [accept(), FARM, FARM, FARM, handIn()];

/** Every effect of `events` but kills' drops. */
function play(state: AdventureState, ...events: AdventureEvent[]): Effect[] {
  return events.flatMap((e) => state.apply(e)).filter((e) => e.kind !== 'loot');
}

/** What the professions module did, passed on to the adventure state as the Adventure does: its gathered and made effects count. */
function practise(state: AdventureState, effects: ProfessionsEffects): Effect[] {
  return effects.flatMap((e) =>
    e.kind === 'gathered' ? state.apply({ kind: 'gathered', spot: e.spot }) : e.kind === 'made' ? state.apply({ kind: 'made', recipe: e.recipe }) : [],
  );
}

/** Break a copper vein, cut a clump of Hearthleaf, or make a recipe at its station, through the professions module. */
const vein = (state: AdventureState) => practise(state, state.professions.gather('copperVein'));
const clump = (state: AdventureState) => practise(state, state.professions.gather('hearthleaf'));
const make = (state: AdventureState, recipe: string, station: 'anvil' | 'bench') => {
  const started = state.professions.start(recipe);
  expect(started.some((e) => e.kind === 'refused')).toBe(false);
  return practise(state, state.professions.finish(station));
};

const markers = (state: AdventureState) => ({ hale: state.hale.marker, smith: state.giver('smith').marker, herbalist: state.giver('herbalist').marker });
const quests = (effects: readonly Effect[]) => effects.filter((e) => e.kind === 'quest');

describe('the intro quests opening', () => {
  it("are closed before Raiders in the Fields is handed in: no marker, each trainer's closed line, and Accept does nothing", () => {
    const state = new AdventureState();
    play(state, accept(), FARM, FARM, FARM);
    expect(markers(state)).toEqual({ hale: 'ready', smith: null, herbalist: null });
    expect(state.giver('smith').line).toMatch(/bandits/);
    expect(state.giver('herbalist').line).toMatch(/bandits/);
    expect(state.apply(accept('smith'))).toEqual([]);
    expect(state.professions.learned).toEqual([]);
  });

  it("both open at Raiders in the Fields' hand-in, with a gold \"!\" over each trainer, beside The Lumber Camp", () => {
    const state = new AdventureState();
    const effects = play(state, ...RAIDERS);
    expect(quests(effects).filter((e) => e.stage === 'offered')).toEqual([
      { kind: 'quest', quest: 'lumber', stage: 'offered' },
      { kind: 'quest', quest: 'ore-and-fire', stage: 'offered' },
      { kind: 'quest', quest: 'leaves-for-the-pot', stage: 'offered' },
    ]);
    expect(markers(state)).toEqual({ hale: 'offered', smith: 'offered', herbalist: 'offered' });
    expect(state.giver('smith')).toMatchObject({ buttons: ['accept', 'notNow'], picks: [] });
  });
});

describe('accepting an intro quest', () => {
  it("teaches the smith's pair, Mining and Smithing, with their first recipes", () => {
    const state = new AdventureState();
    play(state, ...RAIDERS);
    const effects = state.apply(accept('smith'));
    expect(effects).toEqual([
      { kind: 'quest', quest: 'ore-and-fire', stage: 'active' },
      { kind: 'learned', profession: 'mining' },
      { kind: 'learned', profession: 'smithing' },
      { kind: 'recipe', recipe: 'copper-bar' },
      { kind: 'recipe', recipe: 'whetstone' },
    ]);
    expect(state.professions.learned).toEqual(['mining', 'smithing']);
    expect(studies('smith', state.professions)).toBe(true);
    expect(studies('herbalist', state.professions)).toBe(false);
  });

  it("teaches the herbalist's pair, Herbalism and Alchemy", () => {
    const state = new AdventureState();
    play(state, ...RAIDERS, accept('herbalist'));
    expect(state.professions.learned).toEqual(['herbalism', 'alchemy']);
    expect(state.professions.recipes).toEqual(['minor-healing-potion']);
  });

  it('teaches nothing more to someone who has learned the pair already', () => {
    const state = new AdventureState();
    play(state, ...RAIDERS);
    state.professions.learn('mining');
    expect(state.apply(accept('smith'))).toEqual([{ kind: 'quest', quest: 'ore-and-fire', stage: 'active' }]);
  });
});

describe("the smith's Ore and Fire", () => {
  it('counts two veins broken and a whetstone made, then pays 120 XP and 5 coins at the smith, and the whetstone stays yours', () => {
    const state = new AdventureState();
    play(state, ...RAIDERS, accept('smith'));
    expect(state.tracker.at(-1)).toEqual({ title: 'Ore and Fire', lines: ['Copper veins broken: 0/2', 'Whetstone made at the anvil: 0/1'] });
    expect(state.arrow).toEqual({ target: 'veins', line: 0 });
    expect(vein(state)).toEqual([{ kind: 'progress', quest: 'ore-and-fire', objective: 0, count: 1 }]);
    vein(state);
    expect(state.arrow).toEqual({ target: 'anvil', line: 1 });
    expect(make(state, 'whetstone', 'anvil')).toEqual([
      { kind: 'progress', quest: 'ore-and-fire', objective: 1, count: 1 },
      { kind: 'quest', quest: 'ore-and-fire', stage: 'ready' },
    ]);
    expect(state.giver('smith')).toMatchObject({ marker: 'ready', buttons: ['handIn'], picks: [] });
    expect(state.arrow).toEqual({ target: 'smith', line: 0 });
    expect(state.tracker.at(-1)?.lines).toEqual(['Return to the smith']);
    const xp = state.xp;
    const coins = state.inventory.coins;
    const effects = state.apply(handIn('smith'));
    expect(effects).toContainEqual({ kind: 'quest', quest: 'ore-and-fire', stage: 'handedIn' });
    expect(effects).toContainEqual({ kind: 'xp', amount: 120 });
    expect(effects).toContainEqual({ kind: 'coins', coins: coins + 5 });
    expect(state.xp).toBe(xp + 120);
    expect(state.inventory.coins).toBe(coins + 5);
    expect(state.inventory.count('whetstone')).toBe(1);
    expect(state.giver('smith')).toMatchObject({ marker: null, buttons: ['goodbye'] });
  });

  it("doesn't count veins broken before it's taken", () => {
    const state = new AdventureState();
    play(state, ...RAIDERS);
    state.professions.learn('mining');
    expect(vein(state)).toEqual([]);
    play(state, accept('smith'));
    expect(state.tracker.at(-1)?.lines[0]).toBe('Copper veins broken: 0/2');
  });
});

describe("the herbalist's Leaves for the Pot", () => {
  it('counts two clumps of Hearthleaf and a minor healing potion brewed, then pays 120 XP and 5 coins, and the potion stays yours', () => {
    const state = new AdventureState();
    play(state, ...RAIDERS, accept('herbalist'));
    expect(state.arrow).toEqual({ target: 'fields', line: 0 });
    clump(state);
    clump(state);
    expect(state.inventory.count('hearthleaf')).toBe(4);
    expect(state.arrow).toEqual({ target: 'bench', line: 1 });
    make(state, 'minor-healing-potion', 'bench');
    expect(state.giver('herbalist').marker).toBe('ready');
    const potions = state.inventory.count('minor-healing-potion');
    const effects = state.apply(handIn('herbalist'));
    expect(effects).toContainEqual({ kind: 'xp', amount: 120 });
    expect(state.inventory.coins).toBe(5);
    expect(state.inventory.count('minor-healing-potion')).toBe(potions);
    expect(state.giver('herbalist')).toMatchObject({ marker: null, buttons: ['goodbye'] });
  });
});

describe('three quests at once', () => {
  it("lists Hale's with both intro quests, the newest last, and the arrow on the newest", () => {
    const state = new AdventureState();
    play(state, ...RAIDERS, accept('smith'), accept(), accept('herbalist'));
    expect(state.tracker.map((t) => t.title)).toEqual(['Ore and Fire', 'The Lumber Camp', 'Leaves for the Pot']);
    expect(state.arrow).toEqual({ target: 'fields', line: 0 });
    expect(markers(state)).toEqual({ hale: 'active', smith: 'active', herbalist: 'active' });
  });

  it('keep their progress over a reload, keyed by quest id', () => {
    const state = new AdventureState();
    play(state, ...RAIDERS, accept('smith'), accept('herbalist'));
    vein(state);
    const loaded = new AdventureState(JSON.parse(JSON.stringify(state.snapshot())));
    expect(loaded.snapshot().quests['ore-and-fire']).toEqual({ stage: 'active', counts: [1, 0], taken: 1 });
    expect(loaded.tracker).toEqual(state.tracker);
    expect(loaded.professions.learned).toEqual(['mining', 'smithing', 'herbalism', 'alchemy']);
  });
});

describe("the trainers' barks", () => {
  it('follow what you have learned', () => {
    const state = new AdventureState();
    expect(state.bark('herbalist')).toBe("Mind where you step, there's Hearthleaf by that road.");
    const smithBefore = state.bark('smith');
    play(state, ...RAIDERS, accept('smith'));
    expect(state.bark('smith')).toBe('Keep your pick sharp and your fire hot.');
    expect(smithBefore).not.toBe(state.bark('smith'));
    expect(state.bark('herbalist')).toBe("Mind where you step, there's Hearthleaf by that road.");
    play(state, accept('herbalist'));
    expect(state.bark('herbalist')).toBe("Bring me Duskcap from the old mine and I'll show you something stronger.");
  });
});

describe('the Train list', () => {
  const learned = () => {
    const state = new AdventureState();
    play(state, ...RAIDERS, accept('herbalist'), accept('smith'));
    return state;
  };

  it("is the herbalist's three bought recipes, grey until they can be bought", () => {
    const state = new AdventureState();
    const rows = lessonsFor('herbalist', state.professions);
    expect(rows.map((r) => [r.name, r.price, r.needs, r.refused])).toEqual([
      ['Rage Draught', 10, 5, 'unlearned'],
      ['Minor Mana Potion', 10, 5, 'unlearned'],
      ['Elixir of the Keen Eye', 10, 10, 'unlearned'],
    ]);
  });

  it("is the smith's one lesson for all three copper gauntlets", () => {
    const rows = lessonsFor('smith', learned().professions);
    expect(rows).toEqual([{ recipe: 'copper-gauntlets-of-strength', name: 'Copper Gauntlets', profession: 'smithing', price: 25, needs: 15, refused: 'proficiency' }]);
  });

  it('lights a row once the proficiency and the coins are there, and a bought one is known', () => {
    const state = learned();
    const refused = () => lessonsFor('herbalist', state.professions).map((r) => r.refused);
    expect(refused()).toEqual(['proficiency', 'proficiency', 'proficiency']);
    state.professions.setProficiency('alchemy', 5);
    expect(refused()).toEqual(['coins', 'coins', 'proficiency']);
    state.inventory.take([], 10);
    expect(refused()).toEqual([null, null, 'proficiency']);
    // Every row that's lit buys; a grey one is refused as it says.
    expect(state.professions.buy('elixir-of-the-keen-eye')).toEqual([{ kind: 'refused', reason: 'proficiency' }]);
    const bought = state.professions.buy('rage-draught');
    expect(bought).toContainEqual({ kind: 'recipe', recipe: 'rage-draught' });
    expect(state.inventory.coins).toBe(0);
    expect(refused()).toEqual(['known', 'coins', 'proficiency']);
  });

  it('says why buying would be refused exactly as buying does', () => {
    const state = learned();
    for (const id of ['rage-draught', 'copper-gauntlets-of-agility', 'minor-healing-potion', 'nothing']) {
      const reason = state.professions.buyRefusal(id);
      const bought = state.professions.buy(id);
      expect(bought.find((e) => e.kind === 'refused')).toEqual(reason ? { kind: 'refused', reason } : undefined);
    }
  });
});

describe("the trainers' talk boards", () => {
  it('the smith talks first while they have a quest for you, or once they are your trainer, with "Train" beside "Trade"', () => {
    const state = new AdventureState();
    expect(opensWith(state.giver('smith'), studies('smith', state.professions))).toBe('wares');
    play(state, ...RAIDERS);
    expect(opensWith(state.giver('smith'), studies('smith', state.professions))).toBe('talk');
    expect(vendorTalk(state.giver('smith'), false).buttons).toEqual(['accept', 'notNow', 'trade']);
    play(state, accept('smith'));
    const trains = studies('smith', state.professions);
    expect(opensWith(state.giver('smith'), trains)).toBe('talk');
    expect(vendorTalk(state.giver('smith'), trains).buttons).toEqual(['goodbye', 'trade', 'train']);
  });

  it('the herbalist has "Train" once they are your trainer', () => {
    const state = new AdventureState();
    play(state, ...RAIDERS);
    expect(trainerTalk(state.giver('herbalist'), studies('herbalist', state.professions)).buttons).toEqual(['accept', 'notNow']);
    play(state, accept('herbalist'));
    expect(trainerTalk(state.giver('herbalist'), studies('herbalist', state.professions)).buttons).toEqual(['goodbye', 'train']);
  });
});

describe("the bag panel's lines", () => {
  it('shows a line per profession learned, with its grade and proficiency out of the cap', () => {
    const state = new AdventureState();
    expect(ledgerLines(state.professions)).toEqual([]);
    play(state, ...RAIDERS, accept('smith'));
    state.professions.setProficiency('mining', 12);
    expect(ledgerLines(state.professions)).toEqual(['Mining: Apprentice 12/25', 'Smithing: Apprentice 0/25']);
  });
});
