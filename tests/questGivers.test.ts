import { describe, expect, it } from 'vitest';
import { type AdventureEvent, AdventureState, type Effect, type Role } from '../src/adventureState';
import type { CampId } from '../src/maps/types';
import type { ProfessionsEffects, RecipeId, SpotKind } from '../src/professions/professions';
import { type Chain, CHAINS, type GiverId } from '../src/quests';
import { readSave, saveRecord } from '../src/save/record';

// Quests from more than one giver, at the adventure-state seam: a chain per
// giver, up to three quests under way at once (one per giver), the gather and
// make objectives, the tracker listing every quest you're on (the newest last)
// and the quest arrow on the one taken most recently. The trainers' real
// chains come later (.scratch/professions/issues/18-trainers-and-intro-quests.md),
// so two made-up one-quest chains stand in for them here, opening as theirs
// will once Raiders in the Fields is handed in.

const kill = (camp: CampId | null, level: number, role: Role = 'ordinary'): AdventureEvent => ({ kind: 'kill', camp, level, role });
const accept = (giver?: GiverId): AdventureEvent => ({ kind: 'accept', giver });
const handIn = (giver?: GiverId): AdventureEvent => ({ kind: 'handIn', giver });
const gather = (spot: SpotKind): AdventureEvent => ({ kind: 'gathered', spot });
const make = (recipe: RecipeId): AdventureEvent => ({ kind: 'made', recipe });

const FARM = kill('farm', 1);
const THUG = kill('lumberCamp', 2);
const LEADER = kill('lumberCamp', 2, 'leader');
const ORDERS: AdventureEvent = { kind: 'pickup', item: 'orders' };
const WARDEN = kill(null, 5, 'warden');
const VEIN = gather('copperVein');
const LEAF = gather('hearthleaf');

const times = (n: number, event: AdventureEvent) => Array.from({ length: n }, () => event);
const RAIDERS = [accept(), ...times(3, FARM), handIn()];
const LUMBER = [accept(), ...times(4, THUG), LEADER, ORDERS, handIn()];

/** The smith's stand-in chain: break two veins (at the mine), then make a whetstone (at the lumber camp, so the two places differ). */
const SMITH: Chain = {
  giver: 'smith',
  after: 'raiders',
  quests: [
    {
      id: 'test-ore',
      title: 'Test Ore',
      objectives: [
        { kind: 'gather', text: 'Copper veins broken', need: 2, spot: 'copperVein' },
        { kind: 'make', text: 'Whetstone made', need: 1, recipe: 'whetstone', place: 'lumberCamp' },
      ],
      place: 'mine',
      xp: 20,
      says: { offered: 'Fetch me ore.', active: 'Still no ore?', ready: 'Good ore.' },
    },
  ],
  closed: 'Not now, the bandits come first.',
  done: 'Keep your edge sharp.',
  returnTo: 'Return to the smith',
};

/** The herbalist's stand-in chain: gather four leaves, then brew a potion, all at the farm. */
const HERBALIST: Chain = {
  giver: 'herbalist',
  after: 'raiders',
  quests: [
    {
      id: 'test-leaves',
      title: 'Test Leaves',
      objectives: [
        { kind: 'gather', text: 'Hearthleaf gathered', need: 4, spot: 'hearthleaf' },
        { kind: 'make', text: 'Minor healing potion brewed', need: 1, recipe: 'minor-healing-potion' },
      ],
      place: 'farm',
      xp: 20,
      says: { offered: 'Leaves, please.', active: 'Mind the stems.', ready: 'Lovely leaves.' },
    },
  ],
  done: 'Come back when you need more.',
  returnTo: 'Return to the herbalist',
};

const THREE = [...CHAINS, SMITH, HERBALIST];

/** A character in a world with the smith's and the herbalist's stand-in chains beside Hale's. */
const withGivers = (...events: AdventureEvent[]) => {
  const state = new AdventureState(undefined, THREE);
  play(state, ...events);
  return state;
};

function play(state: AdventureState, ...events: AdventureEvent[]): Effect[] {
  return events.flatMap((e) => state.apply(e));
}

/** The effects that aren't about the stand-in quests. */
const hales = (effects: readonly Effect[]) => effects.filter((e) => !('quest' in e) || !e.quest.startsWith('test-'));

const markers = (state: AdventureState) => ({ hale: state.hale.marker, smith: state.giver('smith').marker, herbalist: state.giver('herbalist').marker });

describe("Hale's chain beside the other givers'", () => {
  it('plays exactly as before, event by event, whatever the other chains do', () => {
    const route = [...RAIDERS, ...LUMBER, accept(), WARDEN, handIn()];
    const alone = new AdventureState();
    const beside = new AdventureState(undefined, THREE);
    for (const event of route) {
      expect(hales(beside.apply(event))).toEqual(alone.apply(event));
      expect(beside.hale).toEqual(alone.hale);
      expect(beside.tracker).toEqual(alone.tracker);
      expect(beside.arrow).toEqual(alone.arrow);
    }
    expect(beside.pickedAt('below')).toBe('hale-longsword');
    expect(beside.haleSwordAtHip).toBe(false);
  });

  it("goes on while the other givers' quests are under way", () => {
    const state = withGivers(...RAIDERS, accept('smith'), accept('herbalist'), accept());
    expect(state.hale.marker).toBe('active');
    const effects = play(state, ...times(4, THUG), LEADER, ORDERS);
    expect(effects).toContainEqual({ kind: 'quest', quest: 'lumber', stage: 'ready' });
    expect(play(state, handIn())).toContainEqual({ kind: 'quest', quest: 'below', stage: 'offered' });
    expect(markers(state)).toEqual({ hale: 'offered', smith: 'active', herbalist: 'active' });
  });
});

describe("another giver's quest", () => {
  it("isn't offered before Raiders in the Fields is handed in: no marker, their closed line, and Accept does nothing", () => {
    const state = withGivers(accept(), ...times(3, FARM));
    expect(state.giver('smith')).toEqual({ marker: null, line: 'Not now, the bandits come first.', buttons: ['goodbye'], picks: [] });
    expect(state.giver('herbalist')).toEqual({ marker: null, line: '', buttons: ['goodbye'], picks: [] });
    expect(state.apply(accept('smith'))).toEqual([]);
    expect(state.apply(VEIN)).toEqual([]);
  });

  it('is offered with The Lumber Camp at the hand-in of Raiders in the Fields', () => {
    const state = withGivers(accept(), ...times(3, FARM));
    expect(state.apply(handIn()).filter((e) => e.kind === 'quest')).toEqual([
      { kind: 'quest', quest: 'raiders', stage: 'handedIn' },
      { kind: 'quest', quest: 'lumber', stage: 'offered' },
      { kind: 'quest', quest: 'test-ore', stage: 'offered' },
      { kind: 'quest', quest: 'test-leaves', stage: 'offered' },
    ]);
    expect(state.giver('smith')).toEqual({ marker: 'offered', line: 'Fetch me ore.', buttons: ['accept', 'notNow'], picks: [] });
  });

  it("is taken on its giver's board, not Hale's", () => {
    const state = withGivers(...RAIDERS);
    expect(state.apply(accept('smith'))).toEqual([{ kind: 'quest', quest: 'test-ore', stage: 'active' }]);
    expect(markers(state)).toEqual({ hale: 'offered', smith: 'active', herbalist: 'offered' });
    expect(state.giver('smith')).toEqual({ marker: 'active', line: 'Still no ore?', buttons: ['goodbye'], picks: [] });
    expect(state.tracker).toEqual([{ title: 'Test Ore', lines: ['Copper veins broken: 0/2', 'Whetstone made: 0/1'] }]);
    expect(state.apply(accept('smith'))).toEqual([]);
  });

  it('counts gathering from its kind of spot, and making its recipe', () => {
    const state = withGivers(...RAIDERS, accept('smith'));
    expect(state.apply(VEIN)).toEqual([{ kind: 'progress', quest: 'test-ore', objective: 0, count: 1 }]);
    expect(state.apply(LEAF)).toEqual([]);
    expect(state.apply(make('copper-bar'))).toEqual([]);
    play(state, VEIN);
    expect(state.apply(VEIN)).toEqual([]);
    expect(state.tracker[0].lines).toEqual(['Copper veins broken: 2/2', 'Whetstone made: 0/1']);
    expect(state.apply(make('whetstone'))).toEqual([
      { kind: 'progress', quest: 'test-ore', objective: 1, count: 1 },
      { kind: 'quest', quest: 'test-ore', stage: 'ready' },
    ]);
    expect(state.tracker).toEqual([{ title: 'Test Ore', lines: ['Return to the smith'] }]);
    expect(state.giver('smith')).toEqual({ marker: 'ready', line: 'Good ore.', buttons: ['handIn'], picks: [] });
  });

  it("doesn't count gathering or making done before it's taken", () => {
    const state = withGivers(...RAIDERS, VEIN, VEIN, make('whetstone'), accept('smith'));
    expect(state.tracker[0].lines).toEqual(['Copper veins broken: 0/2', 'Whetstone made: 0/1']);
  });

  it("hands in on its giver's board for its XP, and the chain is done", () => {
    const state = withGivers(...RAIDERS, accept('smith'), VEIN, VEIN, make('whetstone'));
    expect(state.apply(handIn())).toEqual([]);
    expect(state.apply(handIn('smith'))).toEqual([
      { kind: 'quest', quest: 'test-ore', stage: 'handedIn' },
      { kind: 'xp', amount: 20 },
    ]);
    expect(state.giver('smith')).toEqual({ marker: null, line: 'Keep your edge sharp.', buttons: ['goodbye'], picks: [] });
    expect(state.tracker).toEqual([]);
    expect(state.apply(handIn('smith'))).toEqual([]);
  });
});

describe("the professions module's effects", () => {
  it('count the gather and make objectives when passed straight in, as the Adventure does', () => {
    const state = withGivers(...RAIDERS, accept('smith'));
    /** Pass on what the professions module says was gathered or made; the rest is for the view. */
    const told = (effects: ProfessionsEffects) => effects.flatMap((e) => (e.kind === 'gathered' || e.kind === 'made' ? state.apply(e) : []));
    state.professions.learn('mining');
    expect(told(state.professions.gather('copperVein'))).toEqual([{ kind: 'progress', quest: 'test-ore', objective: 0, count: 1 }]);
    told(state.professions.gather('copperVein'));
    expect(told(state.professions.start('whetstone'))).toEqual([]);
    expect(told(state.professions.finish('anvil'))).toEqual([
      { kind: 'progress', quest: 'test-ore', objective: 1, count: 1 },
      { kind: 'quest', quest: 'test-ore', stage: 'ready' },
    ]);
    // The whetstone made for it stays yours.
    expect(state.inventory.count('whetstone')).toBe(1);
  });
});

describe('three quests at once', () => {
  it('are under way together, one per giver, listed in the order taken with the newest last', () => {
    const state = withGivers(...RAIDERS, accept('herbalist'), accept(), accept('smith'));
    expect(markers(state)).toEqual({ hale: 'active', smith: 'active', herbalist: 'active' });
    expect(state.tracker.map((q) => q.title)).toEqual(['Test Leaves', 'The Lumber Camp', 'Test Ore']);
  });

  it("each count only their own objectives, and each is handed in to its own giver", () => {
    const state = withGivers(...RAIDERS, accept(), accept('smith'), accept('herbalist'));
    expect(play(state, THUG, VEIN, LEAF, make('whetstone'))).toEqual([
      { kind: 'xp', amount: 20 },
      { kind: 'progress', quest: 'lumber', objective: 0, count: 1 },
      { kind: 'progress', quest: 'test-ore', objective: 0, count: 1 },
      { kind: 'progress', quest: 'test-leaves', objective: 0, count: 1 },
      { kind: 'progress', quest: 'test-ore', objective: 1, count: 1 },
    ]);
    play(state, VEIN, ...times(3, LEAF), make('minor-healing-potion'));
    expect(state.tracker).toEqual([
      { title: 'The Lumber Camp', lines: ['Bandits defeated at the lumber camp: 1/5', "Leader's orders taken: 0/1"] },
      { title: 'Test Ore', lines: ['Return to the smith'] },
      { title: 'Test Leaves', lines: ['Return to the herbalist'] },
    ]);
    play(state, handIn('herbalist'));
    expect(state.tracker.map((q) => q.title)).toEqual(['The Lumber Camp', 'Test Ore']);
    expect(markers(state)).toEqual({ hale: 'active', smith: 'ready', herbalist: null });
  });

  it("show each giver's marker for their own quest, at every step", () => {
    const state = withGivers();
    const seen: Record<string, unknown> = {};
    const at = (name: string, ...events: AdventureEvent[]) => {
      play(state, ...events);
      seen[name] = markers(state);
    };
    at('new');
    at('raiders handed in', ...RAIDERS);
    at('smith taken', accept('smith'));
    at('lumber taken', accept());
    at('smith ready', VEIN, VEIN, make('whetstone'));
    at('herbalist taken', accept('herbalist'));
    at('smith handed in', handIn('smith'));
    at('lumber ready', ...times(4, THUG), LEADER, ORDERS);
    expect(seen).toEqual({
      new: { hale: 'offered', smith: null, herbalist: null },
      'raiders handed in': { hale: 'offered', smith: 'offered', herbalist: 'offered' },
      'smith taken': { hale: 'offered', smith: 'active', herbalist: 'offered' },
      'lumber taken': { hale: 'active', smith: 'active', herbalist: 'offered' },
      'smith ready': { hale: 'active', smith: 'ready', herbalist: 'offered' },
      'herbalist taken': { hale: 'active', smith: 'ready', herbalist: 'active' },
      'smith handed in': { hale: 'active', smith: null, herbalist: 'active' },
      'lumber ready': { hale: 'ready', smith: null, herbalist: 'active' },
    });
  });
});

describe('the quest arrow', () => {
  it('sits beside the first unfinished objective of the quest taken most recently, pointing at its place or its giver', () => {
    const state = withGivers(...RAIDERS);
    const seen: Record<string, unknown> = {};
    const at = (name: string, ...events: AdventureEvent[]) => {
      play(state, ...events);
      seen[name] = state.arrow;
    };
    at('lumber taken', accept());
    at('smith taken after', accept('smith'));
    at('veins broken', VEIN, VEIN);
    at('lumber bandits done', ...times(4, THUG), LEADER);
    at('whetstone made', make('whetstone'));
    at('herbalist taken last', accept('herbalist'));
    at('smith handed in', handIn('smith'));
    at('herbalist handed in', ...times(4, LEAF), make('minor-healing-potion'), handIn('herbalist'));
    expect(seen).toEqual({
      'lumber taken': { target: 'lumberCamp', line: 0 },
      // The newest is the smith's, at the bottom: its veins, at the quest's place.
      'smith taken after': { target: 'mine', line: 0 },
      // Its whetstone, at the objective's own place.
      'veins broken': { target: 'lumberCamp', line: 1 },
      // Hale's quest moving on doesn't take the arrow.
      'lumber bandits done': { target: 'lumberCamp', line: 1 },
      'whetstone made': { target: 'smith', line: 0 },
      'herbalist taken last': { target: 'farm', line: 0 },
      // The herbalist's is still the newest.
      'smith handed in': { target: 'farm', line: 0 },
      // Back to Hale's, the only one left: its orders.
      'herbalist handed in': { target: 'lumberCamp', line: 1 },
    });
  });
});

describe('saving the givers’ quests', () => {
  /** Through the save record and storage and back, with the same chains. */
  const reload = (state: AdventureState, chains = THREE) => {
    const loaded = readSave(structuredClone(saveRecord(state.snapshot(), { x: 0, z: 0, yaw: 0 })));
    if (loaded.kind !== 'saved') throw new Error(`the record should read back, not ${loaded.kind}`);
    return new AdventureState(loaded.record, chains);
  };
  const answers = (s: AdventureState) => ({ markers: markers(s), tracker: s.tracker, arrow: s.arrow, xp: s.xp });

  it("keeps each giver's quest by its id, with its counts and the order they were taken in", () => {
    const state = withGivers(...RAIDERS, accept('smith'), VEIN, accept(), THUG, accept('herbalist'), LEAF, LEAF);
    expect(state.snapshot().quests).toMatchObject({
      'test-ore': { stage: 'active', counts: [1, 0], taken: 1 },
      lumber: { stage: 'active', counts: [1, 0], taken: 2 },
      'test-leaves': { stage: 'active', counts: [2, 0], taken: 3 },
    });
    const restored = reload(state);
    expect(answers(restored)).toEqual(answers(state));
    expect(restored.tracker.map((q) => q.title)).toEqual(['Test Ore', 'The Lumber Camp', 'Test Leaves']);
  });

  it('restores a character who carries on exactly as the original would, at every step', () => {
    const route = [...RAIDERS, accept('smith'), VEIN, accept('herbalist'), VEIN, accept(), ...times(4, LEAF), make('whetstone'), handIn('smith'), make('minor-healing-potion'), handIn('herbalist'), ...times(4, THUG), LEADER, ORDERS, handIn()];
    for (let at = 0; at <= route.length; at++) {
      const original = withGivers(...route.slice(0, at));
      const restored = reload(original);
      for (const event of route.slice(at)) expect(restored.apply(event)).toEqual(original.apply(event));
      expect(answers(restored)).toEqual(answers(original));
    }
  });

  it('loads an older record, which never had them, with them locked until Raiders in the Fields is handed in', () => {
    const older = new AdventureState();
    play(older, accept(), FARM);
    const loaded = reload(older);
    expect(loaded.snapshot().quests).toMatchObject({ 'test-ore': { stage: 'locked', counts: [0, 0] }, 'test-leaves': { stage: 'locked', counts: [0, 0] } });
    expect(markers(loaded)).toEqual({ hale: 'active', smith: null, herbalist: null });
    play(loaded, FARM, FARM);
    expect(play(loaded, handIn())).toContainEqual({ kind: 'quest', quest: 'test-ore', stage: 'offered' });
  });

  it("offers them on loading an older record that's past Raiders in the Fields", () => {
    const older = new AdventureState();
    play(older, ...RAIDERS, accept());
    expect(markers(reload(older))).toEqual({ hale: 'active', smith: 'offered', herbalist: 'offered' });
  });

  it("keeps the chains' rules whatever a record says: nothing of a closed chain, one quest per giver", () => {
    const snapshot = withGivers().snapshot();
    const claimed = new AdventureState({ ...snapshot, quests: { ...snapshot.quests, 'test-ore': { stage: 'active', counts: [2, 1], taken: 1 } } }, THREE);
    expect(markers(claimed)).toEqual({ hale: 'offered', smith: null, herbalist: null });
    expect(claimed.tracker).toEqual([]);
    expect(claimed.snapshot().quests['test-ore']).toEqual({ stage: 'locked', counts: [0, 0] });
  });
});
