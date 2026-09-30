import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { Inventory, type Stack } from '../src/inventory';
import { AnvilWork, gradeOf, MARKS } from '../src/professions/anvil/work';
import { type ProfessionEffect, Professions, type ProfessionsEffects } from '../src/professions/professions';
import { atStation, stationHands } from '../src/professions/stationHands';

// The make at the smith's anvil through its seam (work.ts), against a real
// professions module and inventory: the board's choice takes the materials,
// the strikes work the marks, the heat comes and goes, the quench finishes
// the gauntlets, and what's made lands in the bag or waits on the anvil. And
// the one rule for hands at a station (.scratch/professions/issues/15-the-smiths-anvil.md).

const A = CONFIG.professions.anvil;
const GOOD = (A.tapSpeed + A.greatSpeed) / 2;
const GREAT = A.greatSpeed + 0.5;
const TRAVEL = 0.25;

/** A new warrior who knows Smithing, with `stacks` in the bag and `coins`, working at an anvil. */
function smith(stacks: Stack[] = [], coins = 0) {
  const inventory = new Inventory({ class: 'warrior', level: 1 });
  inventory.take(stacks, coins);
  const professions = new Professions(inventory);
  professions.learn('smithing');
  return { inventory, professions, anvil: new AnvilWork(professions, inventory) };
}

const of = <K extends ProfessionEffect['kind']>(effects: ProfessionsEffects, kind: K) =>
  effects.filter((e): e is Extract<ProfessionEffect, { kind: K }> => e.kind === kind);

/** Strike every mark of the work on the anvil at `speed`, `times` each. */
function strikeMarks(anvil: AnvilWork, speed: number, times = 1): ProfessionsEffects {
  const effects: ProfessionsEffects = [];
  for (const m of [...anvil.piece!.marks]) {
    for (let i = 0; i < times; i++) effects.push(...anvil.strike(speed, TRAVEL, m.x, m.z).effects);
  }
  return effects;
}

/** Fill every free bag slot with a worn tunic. */
const fillBag = (inventory: Inventory) => inventory.take(Array.from({ length: CONFIG.bag.slots }, () => ({ id: 'worn-tunic', count: 1 })));

describe('choosing on the board', () => {
  it('takes a whetstone’s rough stone out of the bag and lays it on the anvil with 3 marks', () => {
    const { inventory, professions, anvil } = smith([{ id: 'rough-stone', count: 2 }]);
    const effects = anvil.choose('whetstone');
    expect('refused' in effects).toBe(false);
    expect(inventory.count('rough-stone')).toBe(1);
    expect(anvil.piece).toMatchObject({ form: 'whetstone', place: 'anvil' });
    expect(anvil.piece!.marks).toHaveLength(3);
    expect(professions.working('anvil')).toBe('whetstone');
  });

  it('puts two ore in the crucible for a bar, and four bars in the fire for the gauntlets, with 5 marks', () => {
    const { inventory, professions, anvil } = smith([{ id: 'copper-ore', count: 2 }, { id: 'copper-bar', count: 4 }], 25);
    anvil.choose('copper-bar');
    expect(anvil.piece).toMatchObject({ form: 'bar', place: 'crucible' });
    expect(inventory.count('copper-ore')).toBe(0);
    anvil.update(A.smelt + 0.1);
    professions.setProficiency('smithing', 15);
    professions.buy('copper-gauntlets-of-strength');
    anvil.choose('copper-gauntlets-of-strength');
    expect(anvil.piece).toMatchObject({ form: 'gauntlets', place: 'fire' });
    expect(anvil.piece!.marks).toHaveLength(5);
    expect(inventory.count('copper-bar')).toBe(1);
  });

  it('refuses a recipe you lack the materials for, taking nothing', () => {
    const { inventory, anvil } = smith([{ id: 'copper-ore', count: 1 }]);
    const effects = anvil.choose('copper-bar');
    expect(effects).toEqual({ refused: 'It takes 2 Copper Ore; you have 1.' });
    expect(inventory.count('copper-ore')).toBe(1);
    expect(anvil.piece).toBeNull();
  });

  it('refuses the gauntlets without the proficiency, and a second make while one is under way', () => {
    const { inventory, professions, anvil } = smith([{ id: 'copper-bar', count: 8 }, { id: 'rough-stone', count: 2 }], 25);
    professions.setProficiency('smithing', 15);
    professions.buy('copper-gauntlets-of-agility');
    professions.setProficiency('smithing', 3);
    expect(anvil.choose('copper-gauntlets-of-agility')).toEqual({ refused: 'It needs Smithing 15.' });
    expect(inventory.count('copper-bar')).toBe(8);
    anvil.choose('whetstone');
    expect(anvil.choose('whetstone')).toEqual({ refused: 'Finish what you started first.' });
    expect(inventory.count('rough-stone')).toBe(1);
  });

  it('refuses a recipe you don’t know', () => {
    const { anvil } = smith([{ id: 'copper-bar', count: 4 }]);
    expect('refused' in anvil.choose('copper-gauntlets-of-strength')).toBe(true);
  });
});

describe('striking', () => {
  it('grades a strike by the face’s speed: a tap under 1.2 m/s, good from 1.2, great from 2.2; a short one is a tap', () => {
    expect(gradeOf(1.1, TRAVEL)).toBe('tap');
    expect(gradeOf(1.2, TRAVEL)).toBe('good');
    expect(gradeOf(2.2, TRAVEL)).toBe('great');
    expect(gradeOf(3, A.minTravel - 0.01)).toBe('tap');
  });

  it('makes a whetstone with three great strikes on its marks: into the bag, +1 Smithing', () => {
    const { inventory, professions, anvil } = smith([{ id: 'rough-stone', count: 1 }]);
    anvil.choose('whetstone');
    const [m] = anvil.piece!.marks;
    expect(anvil.strike(1, TRAVEL, m.x, m.z).struck).toBe('idle');
    expect(anvil.strike(GREAT, TRAVEL, 0.2, 0.08).struck).toBe('miss');
    const effects = strikeMarks(anvil, GREAT);
    expect(of(effects, 'made')).toMatchObject([{ recipe: 'whetstone', left: false }]);
    expect(of(effects, 'proficiency')).toEqual([{ kind: 'proficiency', profession: 'smithing', proficiency: 1, gained: 1 }]);
    expect(inventory.count('whetstone')).toBe(1);
    expect(professions.proficiency('smithing')).toBe(1);
    expect(anvil.piece).toBeNull();
  });

  it('takes two good strikes to a mark', () => {
    const { inventory, anvil } = smith([{ id: 'rough-stone', count: 1 }]);
    anvil.choose('whetstone');
    strikeMarks(anvil, GOOD);
    expect(inventory.count('whetstone')).toBe(0);
    expect(anvil.worked).toBe(1.5);
    strikeMarks(anvil, GOOD);
    expect(inventory.count('whetstone')).toBe(1);
  });
});

describe('smelting', () => {
  it('turns two ore into a bar in the bag after 3 s, paying 1 Smithing', () => {
    const { inventory, professions, anvil } = smith([{ id: 'copper-ore', count: 3 }]);
    anvil.choose('copper-bar');
    expect(anvil.update(A.smelt - 0.1).made).toBeNull();
    expect(inventory.count('copper-bar')).toBe(0);
    const done = anvil.update(0.2);
    expect(done.made?.piece.place).toBe('mould');
    expect(inventory.count('copper-bar')).toBe(1);
    expect(inventory.count('copper-ore')).toBe(1);
    expect(professions.proficiency('smithing')).toBe(1);
    expect(anvil.piece).toBeNull();
  });

  it('can’t be taken out of the crucible while it smelts', () => {
    const { anvil } = smith([{ id: 'copper-ore', count: 2 }]);
    anvil.choose('copper-bar');
    expect(anvil.grab()).toBe(false);
  });
});

describe('the gauntlets', () => {
  function atTheFire() {
    const s = smith([{ id: 'copper-bar', count: 4 }], 25);
    s.professions.setProficiency('smithing', 15);
    s.professions.buy('copper-gauntlets-of-strength');
    s.anvil.choose('copper-gauntlets-of-strength');
    return s;
  }

  it('heat in the fire, go to the anvil in the tongs, take ten good strikes in one heat, and are made by the quench', () => {
    const { inventory, professions, anvil } = atTheFire();
    expect(anvil.workable).toBe(false);
    anvil.update(A.heatUp);
    expect(anvil.piece!.heat).toBe(1);
    expect(anvil.grab()).toBe(true);
    anvil.letGo('anvil');
    expect(anvil.piece!.place).toBe('anvil');
    for (const m of [...anvil.piece!.marks]) {
      for (let i = 0; i < 2; i++) {
        expect(anvil.strike(GOOD, TRAVEL, m.x, m.z).struck).toBe('worked');
        anvil.update(0.9); // a steady pace: ten strikes in 9 s of heat
      }
    }
    expect(anvil.shaped).toBe(true);
    expect(inventory.count('copper-gauntlets-of-strength')).toBe(0);
    expect(anvil.letGo('away').refused).toBeNull(); // not held
    anvil.grab();
    expect(anvil.letGo('away').refused).toBe('Quench it first, in the bucket by the anvil.');
    expect(anvil.piece!.place).toBe('anvil');
    anvil.grab();
    const quench = anvil.dunk();
    expect(quench.hissed).toBe(true);
    expect(of(quench.effects, 'made')).toMatchObject([{ recipe: 'copper-gauntlets-of-strength', left: false }]);
    expect(inventory.count('copper-gauntlets-of-strength')).toBe(1);
    expect(professions.proficiency('smithing')).toBe(18);
  });

  it('go cold about 10 s out of the fire, and cold metal stops working until it’s heated again', () => {
    const { anvil } = atTheFire();
    anvil.update(A.heatUp);
    anvil.grab();
    anvil.letGo('anvil');
    anvil.update(9.5);
    expect(anvil.workable).toBe(true);
    anvil.update(1);
    expect(anvil.workable).toBe(false);
    const [m] = anvil.piece!.marks;
    expect(anvil.strike(GREAT, TRAVEL, m.x, m.z).struck).toBe('cold');
    expect(anvil.worked).toBe(0);
    anvil.grab();
    anvil.letGo('fire');
    anvil.update(A.heatUp);
    anvil.grab();
    anvil.letGo('anvil');
    expect(anvil.strike(GREAT, TRAVEL, m.x, m.z).struck).toBe('worked');
  });

  it('can’t be struck in the fire, and a stone can’t go in it', () => {
    const { anvil } = atTheFire();
    anvil.update(A.heatUp);
    const [m] = anvil.piece!.marks;
    expect(anvil.strike(GREAT, TRAVEL, m.x, m.z).struck).toBe('idle');
    const stone = smith([{ id: 'rough-stone', count: 1 }]);
    stone.anvil.choose('whetstone');
    stone.anvil.grab();
    expect(stone.anvil.letGo('fire').refused).toBe("Stone isn't heated: lay it on the anvil.");
    expect(stone.anvil.piece!.place).toBe('anvil');
  });
});

describe('walking off and a full bag', () => {
  it('puts what’s in the tongs back where it lay, and the work waits', () => {
    const { anvil, professions } = smith([{ id: 'rough-stone', count: 1 }]);
    anvil.choose('whetstone');
    strikeMarks(anvil, GOOD);
    anvil.grab();
    anvil.walkOff();
    expect(anvil.piece!.place).toBe('anvil');
    expect(anvil.worked).toBe(1.5);
    expect(professions.working('anvil')).toBe('whetstone');
  });

  it('leaves a thing made with the bag full waiting on the anvil, and bags it once there’s room', () => {
    const { inventory, professions, anvil } = smith([{ id: 'rough-stone', count: 1 }]);
    anvil.choose('whetstone');
    fillBag(inventory);
    const effects = strikeMarks(anvil, GREAT);
    expect(of(effects, 'made')).toMatchObject([{ recipe: 'whetstone', left: true }]);
    expect(professions.proficiency('smithing')).toBe(1);
    expect(inventory.count('whetstone')).toBe(0);
    expect(anvil.piece).toMatchObject({ waiting: true, place: 'anvil' });
    expect(anvil.choose('whetstone')).toEqual({ refused: 'Make room in your bag for what you made first.' });
    expect(anvil.retry().bagged).toBeNull();
    inventory.move({ in: 'bag', slot: 0 }, { in: 'ground' });
    const bagged = anvil.retry();
    expect(bagged.bagged?.recipe.id).toBe('whetstone');
    expect(inventory.count('whetstone')).toBe(1);
    expect(anvil.piece).toBeNull();
  });
});

describe('hands at a station', () => {
  const S = CONFIG.professions.station;

  it('become the station’s within 1.3 m, facing it, out of a fight', () => {
    expect(stationHands(false, { distance: S.near - 0.1, facing: 0.2, fighting: false })).toBe(true);
    expect(stationHands(false, { distance: S.near + 0.1, facing: 0, fighting: false })).toBe(false);
    expect(stationHands(false, { distance: 0.8, facing: Math.PI / 2, fighting: false })).toBe(false);
    expect(stationHands(false, { distance: 0.8, facing: 0, fighting: true })).toBe(false);
  });

  it('stay the station’s turned away, until you step back past 2 m or a fight starts', () => {
    expect(stationHands(true, { distance: 1.8, facing: Math.PI, fighting: false })).toBe(true);
    expect(stationHands(true, { distance: S.far + 0.1, facing: 0, fighting: false })).toBe(false);
    expect(stationHands(true, { distance: 0.8, facing: 0, fighting: true })).toBe(false);
  });

  it('measures the distance and the turn over the ground', () => {
    const at = atStation(0, -1, 0, 0, 0, -1, false);
    expect(at.distance).toBeCloseTo(1);
    expect(at.facing).toBeCloseTo(0);
    expect(atStation(0, -1, 0, 0, 1, 0, false).facing).toBeCloseTo(Math.PI / 2);
  });
});

describe('the marks', () => {
  it('are 3 on the whetstone and 5 on the gauntlets', () => {
    expect(MARKS.whetstone).toHaveLength(3);
    expect(MARKS.gauntlets).toHaveLength(5);
  });
});
