import { describe, expect, it } from 'vitest';
import { type AdventureEvent, AdventureState, type Effect, type Role } from '../src/adventureState';
import type { CampId } from '../src/maps/types';

// Marshal Hale's quest chain, at the adventure-state seam: events in (accept,
// hand in, kills, the orders picked up), and what a player would notice out:
// what Hale shows (the marker over their head, the board's line and buttons),
// the tracker, XP, levels and the sword, the Warden on its throne and Hale's
// sword at their hip. Kills anywhere are events like any other.

const kill = (camp: CampId | null, level: number, role: Role = 'ordinary'): AdventureEvent => ({
  kind: 'kill',
  camp,
  level,
  role,
  family: camp === 'mine' || camp === null ? 'undead' : 'bandit',
  seed: 1,
});
const ACCEPT: AdventureEvent = { kind: 'accept' };
const HAND_IN: AdventureEvent = { kind: 'handIn' };
const ORDERS: AdventureEvent = { kind: 'pickup', item: 'orders' };

// The places' camps on the plain route (spec, "Camps" and "The adventure state").
const FARM = kill('farm', 1);
const THUG = kill('lumberCamp', 2);
const ARCHER = kill('lumberCamp', 2);
const LEADER = kill('lumberCamp', 2, 'leader');
const PATROL = kill('patrol', 2);
const MINE = kill('mine', 3);
const DIG_BRUTE = kill('mine', 4, 'deepBrute');
const WARDEN = kill(null, 5, 'warden');

/** Every effect of `events` but kills' drops (loot's own tests have those). */
function play(state: AdventureState, ...events: AdventureEvent[]): Effect[] {
  return events.flatMap((e) => state.apply(e)).filter((e) => e.kind !== 'loot');
}

const times = (n: number, event: AdventureEvent) => Array.from({ length: n }, () => event);

/** Take and finish Raiders in the Fields, then hand it in. */
const RAIDERS = [ACCEPT, ...times(3, FARM), HAND_IN];
/** Take and finish The Lumber Camp, then hand it in. */
const LUMBER = [ACCEPT, THUG, THUG, THUG, ARCHER, LEADER, ORDERS, HAND_IN];

const OFFERED = [
  'Bandits in red masks are raiding the farm east of the village. The farmer barely got out. Drive them off. Three of them down should send the rest a message.',
  'The same gang holds the lumber camp across the bridge. Clear them out, and bring me whatever their leader keeps in that tent.',
  'Something stirs under that hill. The dead are walking in the old mine. Go down, find what woke them, and put it back to rest.',
];

describe('a new character', () => {
  it('finds Hale offering Raiders in the Fields: a gold "!", their line, Accept and Not now', () => {
    const state = new AdventureState();
    expect(state.hale).toEqual({ marker: 'offered', line: OFFERED[0], buttons: ['accept', 'notNow'] });
  });

  it('has no quest to track', () => {
    expect(new AdventureState().tracker).toEqual([]);
  });
});

describe('Raiders in the Fields', () => {
  it('once accepted is under way: a grey "?", a reminder and Goodbye, and the tracker at 0/3', () => {
    const state = new AdventureState();
    expect(state.apply(ACCEPT)).toEqual([{ kind: 'quest', quest: 'raiders', stage: 'active' }]);
    expect(state.hale).toEqual({
      marker: 'active',
      line: "The farm's east along the road. Three of those bandits, then come back to me.",
      buttons: ['goodbye'],
    });
    expect(state.tracker).toEqual([{ title: 'Raiders in the Fields', lines: ['Bandits defeated at the farm: 0/3'] }]);
  });

  it("counts the farm's bandits as they fall", () => {
    const state = new AdventureState();
    play(state, ACCEPT);
    expect(play(state, FARM)).toEqual([
      { kind: 'xp', amount: 10 },
      { kind: 'progress', quest: 'raiders', objective: 0, count: 1 },
    ]);
    play(state, FARM);
    expect(state.tracker[0]?.lines).toEqual(['Bandits defeated at the farm: 2/3']);
  });

  it('is ready with the third: a gold "?", Hand in, and "Return to Marshal Hale"', () => {
    const state = new AdventureState();
    const effects = play(state, ACCEPT, FARM, FARM, FARM);
    expect(effects.slice(-2)).toEqual([
      { kind: 'progress', quest: 'raiders', objective: 0, count: 3 },
      { kind: 'quest', quest: 'raiders', stage: 'ready' },
    ]);
    expect(state.hale).toEqual({ marker: 'ready', line: "The farm's quieter already. Well done.", buttons: ['handIn'] });
    expect(state.tracker).toEqual([{ title: 'Raiders in the Fields', lines: ['Return to Marshal Hale'] }]);
  });

  it('counts no more once ready: a fourth bandit pays its XP and nothing else', () => {
    const state = new AdventureState();
    play(state, ACCEPT, FARM, FARM, FARM);
    expect(play(state, FARM)).toEqual([{ kind: 'xp', amount: 10 }]);
  });

  it('hands in for 80 XP and level 2, and Hale offers The Lumber Camp', () => {
    const state = new AdventureState();
    play(state, ACCEPT, FARM, FARM, FARM);
    expect(state.apply(HAND_IN)).toEqual([
      { kind: 'quest', quest: 'raiders', stage: 'handedIn' },
      { kind: 'xp', amount: 80 },
      { kind: 'level', level: 2, unlocks: ['warCry'] },
      { kind: 'quest', quest: 'lumber', stage: 'offered' },
    ]);
    expect(state.xp).toBe(110);
    expect(state.hale).toEqual({ marker: 'offered', line: OFFERED[1], buttons: ['accept', 'notNow'] });
    expect(state.tracker).toEqual([]);
  });
});

describe('kill credit', () => {
  it("doesn't count the farm's bandits killed before the quest was taken", () => {
    const state = new AdventureState();
    play(state, FARM, FARM, FARM, ACCEPT);
    expect(state.tracker[0]?.lines).toEqual(['Bandits defeated at the farm: 0/3']);
    expect(state.xp).toBe(30);
  });

  it("counts only the quest's own camp", () => {
    const state = new AdventureState();
    play(state, ACCEPT, THUG, PATROL, MINE, kill('watchtower', 2), WARDEN);
    expect(state.tracker[0]?.lines).toEqual(['Bandits defeated at the farm: 0/3']);
  });

  it("doesn't count the lumber camp's bandits for The Lumber Camp before it's taken", () => {
    const state = new AdventureState();
    play(state, ...RAIDERS, THUG, THUG, THUG, ARCHER, LEADER, ACCEPT);
    expect(state.tracker[0]?.lines).toEqual(['Bandits defeated at the lumber camp: 0/5', "Leader's orders taken: 0/1"]);
  });

  it("doesn't count the lumber camp's patrol, which is its own camp", () => {
    const state = new AdventureState();
    play(state, ...RAIDERS, ACCEPT, PATROL, PATROL, THUG);
    expect(state.tracker[0]?.lines[0]).toBe('Bandits defeated at the lumber camp: 1/5');
  });

  it("doesn't count the Warden before What Lies Below is taken", () => {
    const state = new AdventureState();
    play(state, ...RAIDERS, ...LUMBER, WARDEN, ACCEPT);
    expect(state.tracker[0]?.lines).toEqual(['What woke the dead defeated: 0/1']);
  });

  it("counts nothing for the skeletons the Warden raises", () => {
    const state = new AdventureState();
    play(state, ...RAIDERS, ...LUMBER, ACCEPT, kill(null, 5, 'raised'));
    expect(state.tracker[0]?.lines).toEqual(['What woke the dead defeated: 0/1']);
  });
});

describe('The Lumber Camp', () => {
  it('asks for the five bandits of the lumber camp and the leader\'s orders', () => {
    const state = new AdventureState();
    play(state, ...RAIDERS);
    expect(state.apply(ACCEPT)).toEqual([{ kind: 'quest', quest: 'lumber', stage: 'active' }]);
    expect(state.hale).toEqual({
      marker: 'active',
      line: 'The lumber camp is west off the north road, past the bridge. Mind their leader.',
      buttons: ['goodbye'],
    });
    expect(state.tracker).toEqual([{
      title: 'The Lumber Camp',
      lines: ['Bandits defeated at the lumber camp: 0/5', "Leader's orders taken: 0/1"],
    }]);
  });

  it('takes the orders only while it is under way', () => {
    const state = new AdventureState();
    expect(state.apply(ORDERS)).toEqual([]);
    play(state, ACCEPT);
    expect(state.apply(ORDERS)).toEqual([]);
    play(state, FARM, FARM, FARM, HAND_IN);
    expect(state.apply(ORDERS)).toEqual([]);
    play(state, ACCEPT);
    expect(state.apply(ORDERS)).toEqual([{ kind: 'progress', quest: 'lumber', objective: 1, count: 1 }]);
    expect(state.tracker[0]?.lines[1]).toBe("Leader's orders taken: 1/1");
  });

  it('takes the orders once: they are gone for good', () => {
    const state = new AdventureState();
    play(state, ...RAIDERS, ACCEPT, ORDERS);
    expect(state.apply(ORDERS)).toEqual([]);
  });

  it("lays the orders in the tent from when it's taken until they're picked up, and never again", () => {
    const state = new AdventureState();
    const lie: [string, boolean][] = [];
    const at = (when: string, ...events: AdventureEvent[]) => {
      play(state, ...events);
      lie.push([when, state.lies('orders')]);
    };
    at('a new character');
    at('Raiders in the Fields under way', ACCEPT);
    at('Raiders in the Fields ready', FARM, FARM, FARM);
    at('The Lumber Camp offered', HAND_IN);
    at('The Lumber Camp taken', ACCEPT);
    at('the camp cleared', THUG, THUG, THUG, ARCHER, LEADER);
    at('the orders picked up', ORDERS);
    at('The Lumber Camp handed in', HAND_IN);
    at('What Lies Below under way', ACCEPT);
    at('What Lies Below ready', WARDEN);
    at('the chain done', HAND_IN);
    expect(lie).toEqual([
      ['a new character', false],
      ['Raiders in the Fields under way', false],
      ['Raiders in the Fields ready', false],
      ['The Lumber Camp offered', false],
      ['The Lumber Camp taken', true],
      ['the camp cleared', true],
      ['the orders picked up', false],
      ['The Lumber Camp handed in', false],
      ['What Lies Below under way', false],
      ['What Lies Below ready', false],
      ['the chain done', false],
    ]);
  });

  it('keeps the orders in the tent across a save until they are picked up', () => {
    const taken = new AdventureState();
    play(taken, ...RAIDERS, ACCEPT, THUG);
    expect(new AdventureState(taken.snapshot()).lies('orders')).toBe(true);
    play(taken, ORDERS);
    expect(new AdventureState(taken.snapshot()).lies('orders')).toBe(false);
  });

  it('is ready with the bandits first and the orders last', () => {
    const state = new AdventureState();
    play(state, ...RAIDERS, ACCEPT, THUG, THUG, THUG, ARCHER, LEADER);
    expect(state.hale.marker).toBe('active');
    expect(state.tracker[0]?.lines).toEqual(['Bandits defeated at the lumber camp: 5/5', "Leader's orders taken: 0/1"]);
    expect(state.apply(ORDERS)).toEqual([
      { kind: 'progress', quest: 'lumber', objective: 1, count: 1 },
      { kind: 'quest', quest: 'lumber', stage: 'ready' },
    ]);
    expect(state.tracker[0]?.lines).toEqual(['Return to Marshal Hale']);
  });

  it('is ready with the orders first and the bandits last', () => {
    const state = new AdventureState();
    play(state, ...RAIDERS, ACCEPT, ORDERS, THUG, THUG, THUG, ARCHER);
    expect(state.hale.marker).toBe('active');
    expect(state.apply(LEADER).slice(-2)).toEqual([
      { kind: 'progress', quest: 'lumber', objective: 0, count: 5 },
      { kind: 'quest', quest: 'lumber', stage: 'ready' },
    ]);
    expect(state.hale).toEqual({
      marker: 'ready',
      line: "Orders... they're digging for silver in the old mine. Fools. That hill was left alone for a reason.",
      buttons: ['handIn'],
    });
  });

  it('hands in for 120 XP, and Hale offers What Lies Below', () => {
    const state = new AdventureState();
    play(state, ...RAIDERS, ACCEPT, THUG, THUG, THUG, ARCHER, LEADER, ORDERS);
    expect(state.apply(HAND_IN)).toEqual([
      { kind: 'quest', quest: 'lumber', stage: 'handedIn' },
      { kind: 'xp', amount: 120 },
      { kind: 'level', level: 3, unlocks: ['earthshaker'] },
      { kind: 'quest', quest: 'below', stage: 'offered' },
    ]);
    expect(state.hale).toEqual({ marker: 'offered', line: OFFERED[2], buttons: ['accept', 'notNow'] });
  });
});

describe('What Lies Below', () => {
  it('asks for whatever woke the dead', () => {
    const state = new AdventureState();
    play(state, ...RAIDERS, ...LUMBER, ACCEPT);
    expect(state.hale).toEqual({
      marker: 'active',
      line: "The mine's at the end of the north road. Whatever's down there, end it.",
      buttons: ['goodbye'],
    });
    expect(state.tracker).toEqual([{ title: 'What Lies Below', lines: ['What woke the dead defeated: 0/1'] }]);
  });

  it('is ready once the Warden falls', () => {
    const state = new AdventureState();
    play(state, ...RAIDERS, ...LUMBER, ACCEPT);
    expect(state.apply(WARDEN).slice(-2)).toEqual([
      { kind: 'progress', quest: 'below', objective: 0, count: 1 },
      { kind: 'quest', quest: 'below', stage: 'ready' },
    ]);
    expect(state.hale).toEqual({
      marker: 'ready',
      line: "So it's done. Take my old sword. It served me well; it'll serve you better.",
      buttons: ['handIn'],
    });
    expect(state.tracker).toEqual([{ title: 'What Lies Below', lines: ['Return to Marshal Hale'] }]);
  });

  it("hands in for 300 XP and Hale's old longsword, and ends the chain", () => {
    const state = new AdventureState();
    play(state, ...RAIDERS, ...LUMBER, ACCEPT, WARDEN);
    expect(state.sword).toBe('plain');
    const effects = state.apply(HAND_IN);
    expect(effects[0]).toEqual({ kind: 'quest', quest: 'below', stage: 'handedIn' });
    // Straight into your hand, as the main hand's item, with the plain sword going into the bag.
    expect(effects).toContainEqual({ kind: 'slot', where: { in: 'gear', slot: 'mainHand' }, stack: { id: 'hale-longsword', count: 1 } });
    expect(effects.some((e) => e.kind === 'quest' && e.stage === 'offered')).toBe(false);
    expect(state.sword).toBe('hale');
    expect(state.inventory.gear.mainHand).toBe('hale-longsword');
    expect(state.inventory.bag[0]).toEqual({ id: 'plain-sword', count: 1 });
  });
});

describe('the Warden on its throne, and the swords', () => {
  /** What the state answers: does the Warden sit on its throne, which sword you carry, and does Hale's hang at their hip? */
  const answers = (state: AdventureState) => [state.wardenSeated, state.sword, state.haleSwordAtHip];

  it('answers for every stage of the chain', () => {
    const state = new AdventureState();
    const seen: Record<string, unknown[]> = {};
    const at = (name: string) => (seen[name] = answers(state));
    at('new');
    play(state, ...RAIDERS);
    at('lumber offered');
    play(state, ...LUMBER);
    at('below offered');
    play(state, ACCEPT);
    at('below under way');
    play(state, WARDEN);
    at('Warden beaten');
    play(state, HAND_IN);
    at('chain done');
    expect(seen).toEqual({
      new: [false, 'plain', true],
      'lumber offered': [false, 'plain', true],
      'below offered': [false, 'plain', true],
      'below under way': [true, 'plain', true],
      'Warden beaten': [false, 'plain', true],
      'chain done': [false, 'hale', false],
    });
  });

  it("doesn't seat the Warden again once beaten, reloads included", () => {
    const state = new AdventureState();
    play(state, ...RAIDERS, ...LUMBER, ACCEPT, WARDEN);
    const reloaded = new AdventureState(state.snapshot());
    expect(answers(reloaded)).toEqual([false, 'plain', true]);
    play(reloaded, HAND_IN);
    expect(answers(new AdventureState(reloaded.snapshot()))).toEqual([false, 'hale', false]);
  });

  it('keeps the Warden seated across a reload while the quest is under way', () => {
    const state = new AdventureState();
    play(state, ...RAIDERS, ...LUMBER, ACCEPT, kill('mine', 3));
    expect(new AdventureState(state.snapshot()).wardenSeated).toBe(true);
  });
});

describe("the villagers' barks", () => {
  const FARMER = ["Those red-masked thieves took my farm. The marshal's the one to see.", "You ran them off my fields! I'll be home by harvest."];
  const SMITH = ["Bandits in the lumber camp, and not a plank to be had. Mind their leader's axe.", "Timber's coming down the road again. Good work at the camp."];
  const INNKEEPER = [
    'Welcome to the Golden Tankard. Sit by the fire a while.',
    "The old mine? Folk say there's a tomb under that hill. Come back in one piece.",
    "They say you put the dead back to rest. Your ale's on the house.",
  ];
  const barks = (state: AdventureState) => [state.bark('farmer'), state.bark('smith'), state.bark('innkeeper')];

  it('answer every villager for every stage of the chain, as the spec\'s barks table says', () => {
    const state = new AdventureState();
    const seen: Record<string, string[]> = {};
    const at = (name: string) => (seen[name] = barks(state));
    at('Raiders offered');
    play(state, ACCEPT);
    at('Raiders under way');
    play(state, ...times(3, FARM));
    at('Raiders ready');
    play(state, HAND_IN);
    at('Lumber offered');
    play(state, ACCEPT);
    at('Lumber under way');
    play(state, THUG, THUG, THUG, ARCHER, LEADER, ORDERS);
    at('Lumber ready');
    play(state, HAND_IN);
    at('Below offered');
    play(state, ACCEPT);
    at('Below under way');
    play(state, WARDEN);
    at('Warden beaten');
    play(state, HAND_IN);
    at('chain done');
    expect(seen).toEqual({
      'Raiders offered': [FARMER[0], SMITH[0], INNKEEPER[0]],
      'Raiders under way': [FARMER[0], SMITH[0], INNKEEPER[0]],
      'Raiders ready': [FARMER[0], SMITH[0], INNKEEPER[0]],
      'Lumber offered': [FARMER[1], SMITH[0], INNKEEPER[0]],
      'Lumber under way': [FARMER[1], SMITH[0], INNKEEPER[0]],
      'Lumber ready': [FARMER[1], SMITH[0], INNKEEPER[0]],
      'Below offered': [FARMER[1], SMITH[1], INNKEEPER[0]],
      'Below under way': [FARMER[1], SMITH[1], INNKEEPER[1]],
      'Warden beaten': [FARMER[1], SMITH[1], INNKEEPER[2]],
      'chain done': [FARMER[1], SMITH[1], INNKEEPER[2]],
    });
  });

  it('say the same after a reload', () => {
    const state = new AdventureState();
    for (const events of [RAIDERS, LUMBER, [ACCEPT], [WARDEN]]) {
      play(state, ...events);
      expect(barks(new AdventureState(state.snapshot()))).toEqual(barks(state));
    }
  });
});

describe('after the chain', () => {
  const done = () => {
    const state = new AdventureState();
    play(state, ...RAIDERS, ...LUMBER, ACCEPT, WARDEN, HAND_IN);
    return state;
  };

  it('Hale shows no marker, points you south to Brackenmoor, and says goodbye', () => {
    expect(done().hale).toEqual({
      marker: null,
      line: "Oakvale's safe, thanks to you. There's more of the world south through the pass: Brackenmoor, and the roads beyond it.",
      buttons: ['goodbye'],
    });
  });

  it('there is nothing to track, take or hand in: kills pay their XP and nothing more', () => {
    const state = done();
    expect(state.tracker).toEqual([]);
    expect(play(state, ACCEPT, HAND_IN, ORDERS, WARDEN, FARM)).toEqual([
      { kind: 'xp', amount: 150 },
      { kind: 'xp', amount: 10 },
    ]);
  });
});

describe('the chain moves one way', () => {
  it('takes one quest at a time: accepting again does nothing', () => {
    const state = new AdventureState();
    play(state, ACCEPT);
    expect(state.apply(ACCEPT)).toEqual([]);
    expect(state.tracker[0]?.title).toBe('Raiders in the Fields');
  });

  it("won't hand in a quest that isn't ready, or with nothing taken", () => {
    const state = new AdventureState();
    expect(state.apply(HAND_IN)).toEqual([]);
    play(state, ACCEPT, FARM, FARM);
    expect(state.apply(HAND_IN)).toEqual([]);
    expect(state.hale.marker).toBe('active');
    expect(state.xp).toBe(20);
  });

  it("hands each in once: a second hand-in doesn't pay again or repeat it", () => {
    const state = new AdventureState();
    play(state, ...RAIDERS);
    expect(state.apply(HAND_IN)).toEqual([]);
    expect(state.xp).toBe(110);
    expect(state.hale.line).toBe(OFFERED[1]);
  });

  it('offers each quest in turn, only once the one before is handed in', () => {
    const state = new AdventureState();
    const offered: string[] = [];
    for (const event of [...RAIDERS, ...LUMBER, ACCEPT, WARDEN, HAND_IN]) {
      for (const e of state.apply(event)) if (e.kind === 'quest' && e.stage === 'offered') offered.push(e.quest);
    }
    expect(offered).toEqual(['lumber', 'below']);
  });
});

describe('the plain route', () => {
  it('lands level 2 at the first hand-in, 3 at the second, 4 at the dig\'s brute, and 5 with the sword at the last', () => {
    const state = new AdventureState();
    const seen: Record<string, [number, number]> = {};
    const at = (name: string) => (seen[name] = [state.xp, state.level]);

    play(state, ACCEPT, FARM, FARM, FARM);
    at('farm');
    play(state, HAND_IN);
    at('first hand-in');
    play(state, ACCEPT, THUG, THUG, THUG, ARCHER, LEADER, ORDERS);
    at('lumber camp');
    play(state, HAND_IN);
    at('second hand-in');
    play(state, ACCEPT, ...times(5, MINE));
    at('cart hall and gallery');
    play(state, DIG_BRUTE);
    at("dig's brute");
    play(state, DIG_BRUTE, WARDEN);
    at('Warden');
    play(state, HAND_IN);
    at('last hand-in');

    expect(seen).toEqual({
      farm: [30, 1],
      'first hand-in': [110, 2],
      'lumber camp': [250, 2],
      'second hand-in': [370, 3],
      'cart hall and gallery': [520, 3],
      "dig's brute": [640, 4],
      Warden: [910, 4],
      'last hand-in': [1000, 5],
    });
    expect(state.sword).toBe('hale');
    expect(state.stats.damage).toBeCloseTo(2.0, 9);
  });
});

describe('the quest arrow', () => {
  it('points at each quest\'s place while it\'s under way and at Hale once it\'s ready, beside the line you\'re working on, for every stage of the chain', () => {
    const state = new AdventureState();
    const seen: Record<string, unknown> = {};
    const at = (name: string) => (seen[name] = state.arrow);
    at('new');
    play(state, ACCEPT);
    at('raiders taken');
    play(state, FARM, FARM);
    at('raiders 2/3');
    play(state, FARM);
    at('raiders ready');
    play(state, HAND_IN);
    at('lumber offered');
    play(state, ACCEPT);
    at('lumber taken');
    play(state, THUG, THUG, THUG, ARCHER, LEADER);
    at('lumber bandits done');
    play(state, ORDERS);
    at('lumber ready');
    play(state, HAND_IN);
    at('below offered');
    play(state, ACCEPT, ...times(5, MINE));
    at('below under way');
    play(state, WARDEN);
    at('below ready');
    play(state, HAND_IN);
    at('chain done');
    expect(seen).toEqual({
      new: null,
      'raiders taken': { target: 'farm', line: 0 },
      'raiders 2/3': { target: 'farm', line: 0 },
      'raiders ready': { target: 'hale', line: 0 },
      'lumber offered': null,
      'lumber taken': { target: 'lumberCamp', line: 0 },
      'lumber bandits done': { target: 'lumberCamp', line: 1 },
      'lumber ready': { target: 'hale', line: 0 },
      'below offered': null,
      'below under way': { target: 'mine', line: 0 },
      'below ready': { target: 'hale', line: 0 },
      'chain done': null,
    });
  });

  it("stays beside the bandits' line when the orders are taken first", () => {
    const state = new AdventureState();
    play(state, ...RAIDERS, ACCEPT, ORDERS, THUG);
    expect(state.arrow).toEqual({ target: 'lumberCamp', line: 0 });
  });

  it('comes back as it was across a reload', () => {
    const state = new AdventureState();
    play(state, ...RAIDERS, ACCEPT, THUG, THUG, THUG, ARCHER, LEADER);
    expect(new AdventureState(state.snapshot()).arrow).toEqual({ target: 'lumberCamp', line: 1 });
    play(state, ORDERS);
    expect(new AdventureState(state.snapshot()).arrow).toEqual({ target: 'hale', line: 0 });
  });
});
