import { describe, expect, it } from 'vitest';
import { type AdventureEvent, AdventureState, type Effect, statsAt, xpToReach } from '../src/adventureState';
import { ABILITY, abilitiesOf, CLASSES, type ClassId, unlockLine } from '../src/classes';
import { CONFIG } from '../src/config';
import { startingInventory } from '../src/inventory';
import { CATALOGUE, type GearItem, type GearSlot, type ItemId, numbersOf, WORN_NOTHING, wornBy } from '../src/items';
import { CHAINS } from '../src/quests';

// The adventure state learns the character's class (abilities ticket 17):
// what their level makes of Stamina and the class's main attribute, the
// level curve past 5, grey enemies, and each class's resource and base
// abilities. Driven through the state's own seam: a character of a class at
// a level, and the kills it's fed.

const kill = (level: number): AdventureEvent => ({ kind: 'kill', camp: 'farm', level, role: 'ordinary' });

/** A new character of `klass`, with the level cap at `cap`. */
const fresh = (klass: ClassId, cap?: number) => new AdventureState(undefined, CHAINS, { class: klass, cap });

/** A character of `klass` at `level`, wearing their class's starting kit with `gear` over it. */
function character(klass: ClassId, level: number, gear: Partial<Record<GearSlot, ItemId>> = {}): AdventureState {
  const saved = { ...fresh(klass).snapshot(), level, xp: xpToReach(level), inventory: startingInventory(klass, gear) };
  return new AdventureState(saved, CHAINS, { class: klass, cap: 20 });
}

/** Earn `xp` from level-1 kills, 10 at a time; returns every effect. */
function earn(state: AdventureState, xp: number): Effect[] {
  const effects: Effect[] = [];
  for (let i = 0; i < xp / 10; i++) effects.push(...state.apply(kill(1)));
  return effects;
}

/** Climb to `level` on kills of your own level, ten a level; returns every effect. */
function climb(state: AdventureState, level: number): Effect[] {
  const effects: Effect[] = [];
  while (state.level < level) effects.push(...state.apply(kill(state.level)));
  return effects;
}

/** Wearing nothing at all. */
const NAKED: Partial<Record<GearSlot, ItemId>> = { mainHand: undefined, offHand: undefined, chest: undefined, feet: undefined };

/** The green gauntlets carrying each class's main attribute, and the Stamina and points they carry. */
const GAUNTLETS: Record<ClassId, ItemId> = { warrior: 'copper-gauntlets-of-strength', ranger: 'copper-gauntlets-of-agility', mage: 'copper-gauntlets-of-intellect' };
const GAUNTLET_POINTS = numbersOf(CATALOGUE[GAUNTLETS.ranger] as GearItem).stamina;

/** Each class's main hand's damage rating. */
const weapon = (klass: ClassId) => wornBy(klass, [CATALOGUE[startingInventory(klass).gear.mainHand!] as GearItem]).damage;

describe('attributes', () => {
  it('give every class 10 Stamina and 10 of its main attribute at level 1, and 2 more of each a level', () => {
    const seen = CLASSES.map((klass) => [1, 5, 10].map((level) => {
      const { stamina, main, attribute } = statsAt(level, WORN_NOTHING, klass);
      return [attribute, stamina, main];
    }));
    expect(seen).toEqual([
      [['strength', 10, 10], ['strength', 18, 18], ['strength', 28, 28]],
      [['agility', 10, 10], ['agility', 18, 18], ['agility', 28, 28]],
      [['intellect', 10, 10], ['intellect', 18, 18], ['intellect', 28, 28]],
    ]);
  });

  it('make 100 health and ×1 damage at level 1, 180 and ×1.8 at 5, 280 and ×2.8 at 10, for every class without gear', () => {
    for (const klass of CLASSES) {
      const seen = [1, 5, 10].map((level) => character(klass, level, NAKED).stats);
      expect(seen.map((s) => s.maxHp)).toEqual([100, 180, 280]);
      [1, 1.8, 2.8].forEach((damage, i) => expect(seen[i].damage).toBeCloseTo(damage, 9));
    }
  });

  it("add gear's Stamina and main attribute through the same rule, with the weapon's damage rating on top", () => {
    for (const klass of CLASSES) {
      for (const level of [1, 5, 10]) {
        const { stats } = character(klass, level, { hands: GAUNTLETS[klass] });
        const own = 10 + 2 * (level - 1);
        expect(stats.stamina).toBe(own + GAUNTLET_POINTS);
        expect(stats.main).toBe(own + GAUNTLET_POINTS);
        expect(stats.maxHp).toBe(10 * (own + GAUNTLET_POINTS));
        expect(stats.damage).toBeCloseTo(0.1 * (own + GAUNTLET_POINTS) + weapon(klass), 9);
      }
    }
  });

  it("count only your own class's main attribute: gauntlets of Agility give a warrior their Stamina and nothing else", () => {
    const agile = character('warrior', 5, { hands: GAUNTLETS.ranger }).stats;
    const strong = character('warrior', 5, { hands: GAUNTLETS.warrior }).stats;
    expect(agile.maxHp).toBe(strong.maxHp);
    expect(agile.main).toBe(18);
    expect(strong.main).toBe(18 + GAUNTLET_POINTS);
    expect(strong.damage - agile.damage).toBeCloseTo(0.1 * GAUNTLET_POINTS, 9);
  });

  it("give the warrior today's numbers at every level to 20: 20 health and 20% damage a level, gear on top", () => {
    const kits = [
      WORN_NOTHING,
      wornBy('warrior', ['plain-sword', 'round-shield', 'worn-tunic', 'worn-boots'].map((id) => CATALOGUE[id] as GearItem)),
      wornBy('warrior', ['hale-longsword', 'copper-gauntlets-of-strength'].map((id) => CATALOGUE[id] as GearItem)),
    ];
    for (const worn of kits) {
      for (let level = 1; level <= 20; level++) {
        const stats = statsAt(level, worn, 'warrior');
        // Before attributes: 100 health and 20 a level, ×1 and 0.2 a level, with gear's attributes worth 10 health and 0.1 a point.
        expect(stats.maxHp).toBe(100 + 20 * (level - 1) + 10 * worn.stamina);
        expect(stats.damage).toBeCloseTo(1 + 0.2 * (level - 1) + worn.damage + 0.1 * worn.main, 9);
        expect(stats.armour).toBe(worn.armour);
      }
    }
    expect(statsAt(3)).toEqual(statsAt(3, WORN_NOTHING, 'warrior'));
  });

  it("are in the state's numbers as you climb", () => {
    const state = fresh('mage', 10);
    for (const level of [1, 2, 5, 10]) {
      climb(state, level);
      expect(state.stats).toEqual(statsAt(state.level, state.inventory.numbers, 'mage'));
    }
    expect(state.level).toBe(10);
    expect(state.stats.maxHp).toBe(280);
  });
});

describe('the level curve', () => {
  it('needs 100 × (L − 1) more XP for each level L, to 20', () => {
    const totals = Array.from({ length: 20 }, (_, i) => xpToReach(i + 1));
    expect(totals).toEqual([0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500, 6600, 7800, 9100, 10500, 12000, 13600, 15300, 17100, 19000]);
  });

  it('is climbed one level at each of those totals once the content lets it, ten even kills a level', () => {
    const state = fresh('warrior', 20);
    for (let level = 2; level <= 20; level++) {
      const from = state.level;
      let kills = 0;
      for (; state.level < level; kills++) state.apply(kill(from));
      expect([state.level, state.xp, kills]).toEqual([level, xpToReach(level), 10]);
    }
    expect(state.xpToNext).toBe(0);
    expect(state.progress).toBe(1);
  });

  it("stops at the content's cap, still 5: XP past 1,000 is dropped", () => {
    expect(CONFIG.levels.cap).toBe(5);
    const state = fresh('ranger');
    earn(state, 990);
    expect(state.apply(kill(5))).toEqual([
      { kind: 'xp', amount: 10 },
      { kind: 'level', level: 5, unlocks: [] },
    ]);
    expect(state.apply(kill(5))).toEqual([]);
    expect(state.xp).toBe(1000);
    expect(state.level).toBe(5);
    expect(state.xpToNext).toBe(0);
  });

  it('keeps a restored level within the cap', () => {
    const saved = { ...fresh('warrior').snapshot(), level: 9, xp: 3600 };
    const state = new AdventureState(saved);
    expect(state.level).toBe(5);
    expect(state.xp).toBe(1000);
    expect(new AdventureState(saved, CHAINS, { cap: 10 }).level).toBe(9);
  });
});

describe('grey enemies', () => {
  it('pay nothing once they are five or more levels below you', () => {
    const state = character('warrior', 6);
    expect(state.apply(kill(1))).toEqual([]);
    expect(state.apply(kill(2))).toEqual([{ kind: 'xp', amount: 20 }]);
    const ten = character('mage', 10);
    expect(ten.apply(kill(5))).toEqual([]);
    expect(ten.apply(kill(6))).toEqual([{ kind: 'xp', amount: 60 }]);
  });

  it("never turn up on Oakvale's own route: the farm's level 1 still pays at level 5", () => {
    const state = fresh('warrior');
    earn(state, 1000 - 10);
    expect(state.level).toBe(4);
    expect(state.apply(kill(1))).toEqual([{ kind: 'xp', amount: 10 }, { kind: 'level', level: 5, unlocks: [] }]);
  });

  it('still count for a quest', () => {
    const state = character('warrior', 6);
    state.apply({ kind: 'accept' });
    expect(state.apply(kill(1))).toEqual([{ kind: 'progress', quest: 'raiders', objective: 0, count: 1 }]);
  });
});

describe("each class's abilities", () => {
  it('arrive at levels 2, 3, 6, 8 and 10', () => {
    const by = (klass: ClassId) => abilitiesOf(klass).map((a) => [ABILITY[a].level, a]);
    expect(by('warrior')).toEqual([[2, 'warCry'], [3, 'earthshaker'], [6, 'heroicThrow'], [8, 'shieldWall'], [10, 'sweepingStrikes']]);
    expect(by('ranger')).toEqual([[2, 'powerShot'], [3, 'snareTrap'], [6, 'volley'], [8, 'scatter'], [10, 'huntersMark']]);
    expect(by('mage')).toEqual([[2, 'frostNova'], [3, 'fireball'], [6, 'frostbolt'], [8, 'chainLightning'], [10, 'blizzard']]);
  });

  it("are in a character's numbers by level, and only their own class's", () => {
    const seen = (klass: ClassId) => [1, 2, 3, 5, 6, 8, 10].map((level) => character(klass, level).stats.abilities);
    expect(seen('ranger')).toEqual([
      [],
      ['powerShot'],
      ['powerShot', 'snareTrap'],
      ['powerShot', 'snareTrap'],
      ['powerShot', 'snareTrap', 'volley'],
      ['powerShot', 'snareTrap', 'volley', 'scatter'],
      ['powerShot', 'snareTrap', 'volley', 'scatter', 'huntersMark'],
    ]);
    expect(seen('warrior').at(-1)).toEqual(['warCry', 'earthshaker', 'heroicThrow', 'shieldWall', 'sweepingStrikes']);
    expect(seen('mage').at(-1)).toEqual(['frostNova', 'fireball', 'frostbolt', 'chainLightning', 'blizzard']);
  });

  it('are named by the level-up that brings them, for your class', () => {
    const ups = (klass: ClassId) =>
      climb(fresh(klass, 10), 10)
        .filter((e) => e.kind === 'level')
        .map((e) => e.kind === 'level' && [e.level, ...e.unlocks]);
    expect(ups('warrior')).toEqual([[2, 'warCry'], [3, 'earthshaker'], [4], [5], [6, 'heroicThrow'], [7], [8, 'shieldWall'], [9], [10, 'sweepingStrikes']]);
    expect(ups('ranger')).toEqual([[2, 'powerShot'], [3, 'snareTrap'], [4], [5], [6, 'volley'], [7], [8, 'scatter'], [9], [10, 'huntersMark']]);
    expect(ups('mage')).toEqual([[2, 'frostNova'], [3, 'fireball'], [4], [5], [6, 'frostbolt'], [7], [8, 'chainLightning'], [9], [10, 'blizzard']]);
  });

  it('come with a line on how to use them', () => {
    expect(unlockLine('warCry')).toBe('War Cry: press A or X');
    expect(unlockLine('earthshaker')).toBe("Earthshaker: drive your sword's tip into the ground");
    expect(unlockLine('powerShot')).toBe('Power Shot: press A or X while drawing');
    expect(unlockLine('snareTrap')).toBe('Snare Trap: hold the right grip, draw a ring, let go');
    expect(unlockLine('huntersMark')).toBe("Hunter's Mark: hold the right grip, draw an S, let go");
    expect(unlockLine('frostNova')).toBe('Frost Nova: press A or X');
    expect(unlockLine('chainLightning')).toBe('Chain Lightning: hold the right grip, draw a V, let go');
  });

  it("cost and cool down as the class tickets set, the War Cry's and Earthshaker's as today", () => {
    const rows = Object.values(ABILITY).map((a) => [a.id, a.use, a.cost, a.cooldown]);
    expect(rows).toEqual([
      ['warCry', 'button', CONFIG.warCry.cost, 0],
      ['earthshaker', 'earthshaker', CONFIG.groundSlam.cost, CONFIG.groundSlam.cooldown],
      ['heroicThrow', 'ring', 15, 6],
      ['shieldWall', 'z', 25, 30],
      ['sweepingStrikes', 'v', 30, 20],
      ['powerShot', 'drawing', 20, 4],
      ['snareTrap', 'ring', 20, 10],
      ['volley', 'z', 35, 12],
      ['scatter', 'v', 25, 15],
      ['huntersMark', 's', 20, 1],
      ['frostNova', 'button', 30, 20],
      ['fireball', 'ring', 15, 0],
      ['frostbolt', 'z', 15, 0],
      ['chainLightning', 'v', 30, 8],
      ['blizzard', 's', 40, 30],
    ]);
    expect([CONFIG.warCry.cost, CONFIG.groundSlam.cost]).toEqual([50, 35]);
  });

  it('never put two of one class in the same shape', () => {
    for (const klass of CLASSES) {
      const shapes = abilitiesOf(klass).map((a) => ABILITY[a].use).filter((u) => !['button', 'drawing', 'earthshaker'].includes(u));
      expect(new Set(shapes).size).toBe(shapes.length);
    }
  });
});

describe("each class's resource", () => {
  it('is rage for the warrior: a bar of 100, empty to start, draining 2 a second', () => {
    expect(character('warrior', 1).stats.resource).toEqual({ kind: 'rage', size: 100, start: 0, refill: { fighting: -2, calm: -2 } });
    expect(character('warrior', 10, { hands: GAUNTLETS.mage }).stats.resource.size).toBe(100);
  });

  it('is focus for the ranger: a bar of 100, full to start, refilling 10 a second in a fight or out', () => {
    expect(character('ranger', 1).stats.resource).toEqual({ kind: 'focus', size: 100, start: 100, refill: { fighting: 10, calm: 10 } });
    expect(character('ranger', 10).stats.resource.size).toBe(100);
  });

  it('is mana for the mage: 100 plus 2 a point of Intellect over 10, full to start, 2 a second in a fight and 30 out', () => {
    expect(character('mage', 1).stats.resource).toEqual({ kind: 'mana', size: 100, start: 100, refill: { fighting: 2, calm: 30 } });
    expect(character('mage', 5).stats.resource.size).toBe(116);
    expect(character('mage', 10).stats.resource.size).toBe(136);
    // Intellect on gear grows the pool too; Strength doesn't.
    expect(character('mage', 10, { hands: GAUNTLETS.mage }).stats.resource).toMatchObject({ size: 136 + 2 * GAUNTLET_POINTS, start: 136 + 2 * GAUNTLET_POINTS });
    expect(character('mage', 10, { hands: GAUNTLETS.warrior }).stats.resource.size).toBe(136);
  });
});

describe('a character', () => {
  it('is a warrior unless it says, and Oakvale plays as it did', () => {
    const state = new AdventureState();
    expect(state.class).toBe('warrior');
    expect(state.cap).toBe(5);
    expect(state.inventory.snapshot().gear.mainHand).toBe('plain-sword');
    expect(state.stats.abilities).toEqual([]);
  });

  it("of another class wears that class's starting kit", () => {
    expect(fresh('ranger').inventory.snapshot().gear.mainHand).toBe('short-bow');
    expect(fresh('mage').inventory.snapshot().gear.mainHand).toBe('apprentice-wand');
  });
});
