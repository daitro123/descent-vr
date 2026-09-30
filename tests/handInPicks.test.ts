import { describe, expect, it } from 'vitest';
import { type AdventureEvent, AdventureState, type Effect, type Role } from '../src/adventureState';
import { CLASS_MAIN, type ClassId, type GearItem, itemOf, numbersOf } from '../src/items';
import type { CampId } from '../src/maps/types';

// Hale's hand-ins pay a pick of two items fitting your class, carried from
// their board into the bag, and the leader's orders ride on the bag's quest
// page from the tent to the hand-in (.scratch/inventory/issues/12-quest-items-and-hand-in-picks.md).
// Every character is a warrior until the Abilities roster lands, so the
// ranger's and mage's picks are tested through the state.

const kill = (camp: CampId | null, level: number, role: Role = 'ordinary'): AdventureEvent => ({ kind: 'kill', camp, level, role });
const ACCEPT: AdventureEvent = { kind: 'accept' };
const ORDERS: AdventureEvent = { kind: 'pickup', item: 'orders' };
const FARM = kill('farm', 1);
const THUG = kill('lumberCamp', 2);
const LEADER = kill('lumberCamp', 2, 'leader');
const WARDEN = kill(null, 5, 'warden');
const pick = (id: string, slot?: number): AdventureEvent => ({ kind: 'handIn', pick: id, ...(slot === undefined ? {} : { to: { in: 'bag', slot } }) });

const CLASSES: readonly ClassId[] = ['warrior', 'ranger', 'mage'];

function play(state: AdventureState, ...events: AdventureEvent[]): Effect[] {
  return events.flatMap((e) => state.apply(e));
}

/** Ready to hand in Raiders in the Fields. */
const raidersReady = (klass: ClassId = 'warrior') => {
  const state = new AdventureState(undefined, undefined, klass);
  play(state, ACCEPT, FARM, FARM, FARM);
  return state;
};
/** Ready to hand in The Lumber Camp, having picked the first of Raiders in the Fields. */
const lumberReady = (klass: ClassId = 'warrior') => {
  const state = raidersReady(klass);
  play(state, pick(state.hale.picks[0]), ACCEPT, THUG, THUG, THUG, THUG, LEADER, ORDERS);
  return state;
};
/** Ready to hand in What Lies Below, having picked the first of each hand-in before. */
const belowReady = (klass: ClassId = 'warrior') => {
  const state = lumberReady(klass);
  play(state, pick(state.hale.picks[0]), ACCEPT, WARDEN);
  return state;
};

describe("each hand-in's pick, for each class", () => {
  const picks = (state: AdventureState) => state.hale.picks.map((id) => itemOf(id)!);
  const seen = (state: AdventureState) => picks(state).map((i) => [i.name, i.rarity, i.level, i.kind === 'gear' ? i.slot : null]);

  it('Raiders in the Fields: the Farmstead Gloves or the Hedgerow Boots, greens of item level 2', () => {
    for (const klass of CLASSES) {
      expect(seen(raidersReady(klass)), klass).toEqual([
        ['Farmstead Gloves', 'green', 2, 'hands'],
        ['Hedgerow Boots', 'green', 2, 'feet'],
      ]);
    }
  });

  it("The Lumber Camp: the Timberline Leggings or the Marshal's Cap, greens of item level 3", () => {
    for (const klass of CLASSES) {
      expect(seen(lumberReady(klass)), klass).toEqual([
        ['Timberline Leggings', 'green', 3, 'legs'],
        ["Marshal's Cap", 'green', 3, 'head'],
      ]);
    }
  });

  it("What Lies Below: the class's blue weapon or the Warden's Mantle, blues of item level 5", () => {
    const weapon = { warrior: "Hale's Old Longsword", ranger: "Hale's Old Hunting Bow", mage: 'Crypt-Warded Staff' };
    for (const klass of CLASSES) {
      expect(seen(belowReady(klass)), klass).toEqual([
        [weapon[klass], 'blue', 5, 'mainHand'],
        ["Warden's Mantle", 'blue', 5, 'chest'],
      ]);
      const [sword] = picks(belowReady(klass)) as GearItem[];
      expect(sword.class, klass).toBe(klass);
    }
  });

  it("fits your class: the armour carries your class's main attribute and Stamina", () => {
    for (const klass of CLASSES) {
      for (const state of [raidersReady(klass), lumberReady(klass), belowReady(klass)]) {
        for (const item of picks(state) as GearItem[]) {
          if (item.slot === 'mainHand') continue;
          const n = numbersOf(item);
          expect(n.main?.attribute, `${klass}: ${item.name}`).toBe(CLASS_MAIN[klass]);
          expect(n.stamina).toBeGreaterThan(0);
        }
      }
    }
  });

  it('shows no pick until a quest is ready, and none once it is handed in', () => {
    const state = new AdventureState();
    expect(state.hale.picks).toEqual([]);
    play(state, ACCEPT, FARM, FARM);
    expect(state.hale.picks).toEqual([]);
    play(state, FARM);
    expect(state.hale.picks).toHaveLength(2);
    play(state, pick(state.hale.picks[1]));
    expect(state.hale.picks).toEqual([]);
  });
});

describe('carrying a pick into the bag', () => {
  it('hands the quest in, with the pick in the slot it was let go over', () => {
    const state = raidersReady();
    const boots = state.hale.picks[1];
    const effects = state.apply(pick(boots, 6));
    expect(effects.slice(0, 2)).toEqual([
      { kind: 'quest', quest: 'raiders', stage: 'handedIn' },
      { kind: 'slot', where: { in: 'bag', slot: 6 }, stack: { id: boots, count: 1 } },
    ]);
    expect(effects).toContainEqual({ kind: 'xp', amount: 80 });
    expect(state.inventory.bag[6]).toEqual({ id: boots, count: 1 });
    expect(state.pickedAt('raiders')).toBe(boots);
    expect(state.hale.marker).toBe('offered');
  });

  it("won't take an item that isn't on offer, or hand in a quest that isn't ready", () => {
    const state = raidersReady();
    expect(state.pickRefusal('hale-longsword')).toBe('empty');
    expect(state.apply(pick('hale-longsword'))).toEqual([{ kind: 'refused', reason: 'empty' }]);
    expect(state.hale.marker).toBe('ready');
    const early = new AdventureState();
    play(early, ACCEPT, FARM);
    expect(early.apply(pick('farmstead-gloves-strength'))).toEqual([]);
  });

  it('is refused onto a slot that holds something else, and says so before it is let go', () => {
    const state = raidersReady();
    state.inventory.take([{ id: 'torn-cloth', count: 1 }]);
    const gloves = state.hale.picks[0];
    expect(state.pickRefusal(gloves, { in: 'bag', slot: 0 })).toBe('full');
    expect(state.pickRefusal(gloves, { in: 'bag', slot: 1 })).toBeNull();
    expect(state.pickRefusal(gloves, { in: 'gear', slot: 'hands' })).toBe('slot');
    expect(state.apply(pick(gloves, 0))).toEqual([{ kind: 'refused', reason: 'full', where: { in: 'bag', slot: 0 } }]);
    expect(state.hale.marker).toBe('ready');
  });
});

describe('a full bag', () => {
  const full = () => {
    const state = raidersReady();
    state.inventory.take(Array.from({ length: 16 }, () => ({ id: 'worn-tunic', count: 1 })));
    return state;
  };

  it('makes the pick wait on the board, and the quest with it', () => {
    const state = full();
    const gloves = state.hale.picks[0];
    expect(state.pickRefusal(gloves)).toBe('full');
    expect(state.apply(pick(gloves))).toEqual([{ kind: 'refused', reason: 'full' }]);
    expect(state.hale).toMatchObject({ marker: 'ready', picks: ['farmstead-gloves-strength', 'hedgerow-boots-strength'] });
    expect(state.tracker.map((t) => t.lines)).toEqual([['Return to Marshal Hale']]);
    expect(state.xp).toBe(30);
  });

  it('hands in once there is room', () => {
    const state = full();
    state.inventory.move({ in: 'bag', slot: 9 }, { in: 'ground' });
    expect(state.apply(pick(state.hale.picks[0]))[0]).toEqual({ kind: 'quest', quest: 'raiders', stage: 'handedIn' });
    expect(state.inventory.bag[9]).toEqual({ id: 'farmstead-gloves-strength', count: 1 });
  });
});

describe("the leader's orders", () => {
  it('go on the quest page when touched in the tent, and are gone at the hand-in', () => {
    const state = raidersReady();
    play(state, pick(state.hale.picks[0]), ACCEPT, THUG);
    expect(state.inventory.quest).toEqual([]);
    expect(state.apply(ORDERS)).toContainEqual({ kind: 'slot', where: { in: 'quest', slot: 0 }, stack: { id: 'leaders-orders', count: 1 } });
    expect(state.inventory.quest).toEqual(['leaders-orders']);
    play(state, THUG, THUG, THUG, LEADER);
    expect(new AdventureState(state.snapshot()).inventory.quest).toEqual(['leaders-orders']);
    expect(state.apply(pick(state.hale.picks[1]))).toContainEqual({ kind: 'slot', where: { in: 'quest', slot: 0 }, stack: null });
    expect(state.inventory.quest).toEqual([]);
  });

  it("stay on the page while the bag is too full for the pick", () => {
    const state = lumberReady();
    state.inventory.take(Array.from({ length: 16 }, () => ({ id: 'worn-tunic', count: 1 })));
    play(state, pick(state.hale.picks[0]));
    expect(state.inventory.quest).toEqual(['leaders-orders']);
  });

  it('are put on the page for a character saved with them taken before they went there', () => {
    const state = raidersReady();
    play(state, pick(state.hale.picks[0]), ACCEPT, ORDERS);
    const before = state.snapshot();
    const restored = new AdventureState({ ...before, inventory: { ...before.inventory, quest: [] } });
    expect(restored.inventory.quest).toEqual(['leaders-orders']);
  });
});

describe("Hale's sword at their hip", () => {
  const at = (state: AdventureState) => [state.haleSwordAtHip, new AdventureState(state.snapshot(), undefined, state.klass).haleSwordAtHip];

  it('leaves it only when a warrior takes it', () => {
    const warrior = belowReady('warrior');
    expect(at(warrior)).toEqual([true, true]);
    play(warrior, pick('hale-longsword'));
    expect(at(warrior)).toEqual([false, false]);
  });

  it("stays when a warrior takes the Warden's Mantle", () => {
    const warrior = belowReady('warrior');
    play(warrior, pick('wardens-mantle-strength'));
    expect(at(warrior)).toEqual([true, true]);
  });

  it('stays for a ranger or a mage, whichever they pick', () => {
    for (const klass of ['ranger', 'mage'] as const) {
      for (const which of [0, 1]) {
        const state = belowReady(klass);
        play(state, pick(state.hale.picks[which]));
        expect(at(state), `${klass} picking ${state.pickedAt('below')}`).toEqual([true, true]);
      }
    }
  });

  it('is gone for a character saved before picks, who was handed it at What Lies Below', () => {
    const state = belowReady('warrior');
    play(state, pick('hale-longsword'));
    const saved = state.snapshot();
    const older = { ...saved, quests: { ...saved.quests, below: { stage: 'handedIn' as const, counts: [1] } } };
    expect(new AdventureState(older).haleSwordAtHip).toBe(false);
  });
});
