import { describe, expect, it } from 'vitest';
import {
  armourCut,
  attributesAt,
  buyPrice,
  CATALOGUE,
  GEAR_SLOTS,
  type GearItem,
  type GearSlot,
  itemOf,
  numbersOf,
  type Rarity,
  sellPrice,
  stackOf,
  wornBy,
} from '../src/items';

// The item rule: an item's numbers come from its slot, item level and rarity
// alone. Checked against the spec's targets ("The item catalogue and the
// rule"): the rarities in order, the Abilities map's budget for a green set,
// Hale's old longsword's +20%, and armour at about 10% and 15%.

/** A made-up piece of gear, as a line of catalogue data would be. */
const piece = (slot: GearSlot, level: number, rarity: Rarity, more: Partial<GearItem> = {}): GearItem => ({
  id: `${slot}-${level}-${rarity}`,
  name: 'Test piece',
  kind: 'gear',
  slot,
  level,
  rarity,
  model: 'test',
  ...(slot === 'mainHand' || slot === 'offHand' ? { class: 'warrior' as const } : { main: 'strength' as const }),
  ...more,
});

/** A full set of `rarity` at `level`, one piece in every slot. */
const set = (level: number, rarity: Rarity) => GEAR_SLOTS.map((slot) => piece(slot, level, rarity));

describe('the rule', () => {
  it('puts a white, a green and a blue of the same slot and level in order', () => {
    for (const slot of GEAR_SLOTS) {
      const [white, green, blue] = (['white', 'green', 'blue'] as const).map((r) => numbersOf(piece(slot, 3, r)));
      if (slot === 'mainHand') {
        expect(green.damage).toBeGreaterThan(white.damage);
        expect(blue.damage).toBeGreaterThan(green.damage);
      } else {
        expect(green.armour, slot).toBeGreaterThan(white.armour);
        expect(blue.armour, slot).toBeGreaterThan(green.armour);
        expect(white.stamina).toBe(0);
        // Attributes come in whole points, so at low levels a blue may carry no more than a green.
        expect(blue.stamina, slot).toBeGreaterThanOrEqual(green.stamina);
        expect(blue.main!.points, slot).toBeGreaterThanOrEqual(green.main!.points);
        expect(numbersOf(piece(slot, 10, 'blue')).stamina, slot).toBeGreaterThan(numbersOf(piece(slot, 10, 'green')).stamina);
      }
    }
  });

  it('gives whites only damage or armour, and greens Stamina and a main attribute too', () => {
    expect(numbersOf(piece('chest', 2, 'white'))).toEqual({ damage: 0, armour: 15, stamina: 0, main: null });
    expect(numbersOf(piece('chest', 2, 'green'))).toMatchObject({ damage: 0, stamina: 1, main: { attribute: 'strength', points: 1 } });
    expect(numbersOf(piece('mainHand', 2, 'green')).armour).toBe(0);
  });

  it('gives a full green set of your level about a third of your own attributes, at levels 5 and 10', () => {
    for (const level of [5, 10]) {
      const worn = wornBy('warrior', set(level, 'green'));
      expect(Math.abs(worn.stamina - attributesAt(level) / 3), `Stamina at ${level}`).toBeLessThanOrEqual(1.5);
      expect(Math.abs(worn.main - attributesAt(level) / 3), `Strength at ${level}`).toBeLessThanOrEqual(1.5);
    }
    // About 8 of each by level 10, as the Abilities map budgets.
    expect(wornBy('warrior', set(10, 'green')).stamina).toBe(8);
  });

  it('gives a blue about half again what a green carries', () => {
    const green = wornBy('warrior', set(10, 'green'));
    const blue = wornBy('warrior', set(10, 'blue'));
    expect(blue.stamina / green.stamina).toBeCloseTo(1.5, 0);
    expect(blue.armour / green.armour).toBeCloseTo(1.5, 1);
  });

  it("makes Hale's old longsword, a blue of item level 5, add today's 0.2 to your damage", () => {
    const hale = CATALOGUE['hale-longsword'] as GearItem;
    expect(hale).toMatchObject({ slot: 'mainHand', level: 5, rarity: 'blue', class: 'warrior' });
    expect(numbersOf(hale)).toEqual({ damage: expect.closeTo(0.2, 9), armour: 0, stamina: 0, main: null });
  });

  it('makes a white weapon of your level add only a little', () => {
    expect(numbersOf(CATALOGUE['plain-sword'] as GearItem).damage).toBeGreaterThan(0);
    expect(numbersOf(CATALOGUE['plain-sword'] as GearItem).damage).toBeLessThan(0.05);
  });

  it('cuts about 10% of the damage you take with a full white set of your level, and 15% with greens', () => {
    for (const level of [1, 3, 5, 10]) {
      const white = armourCut(wornBy('warrior', set(level, 'white')).armour, level);
      const green = armourCut(wornBy('warrior', set(level, 'green')).armour, level);
      expect(white, `white at ${level}`).toBeCloseTo(0.1, 1);
      expect(green, `green at ${level}`).toBeCloseTo(0.15, 1);
      expect(Math.abs(white - 0.1)).toBeLessThan(0.015);
      expect(Math.abs(green - 0.15)).toBeLessThan(0.015);
    }
    expect(armourCut(0, 3)).toBe(0);
  });

  it('cuts less against a stronger attacker', () => {
    const armour = wornBy('warrior', set(3, 'white')).armour;
    expect(armourCut(armour, 5)).toBeLessThan(armourCut(armour, 3));
  });

  it("gives a quiver and a focus no armour, and does nothing with a main attribute that isn't yours", () => {
    expect(numbersOf(CATALOGUE['quiver'] as GearItem).armour).toBe(0);
    const agile = piece('head', 5, 'green', { main: 'agility' });
    expect(wornBy('warrior', [agile]).main).toBe(0);
    expect(wornBy('ranger', [agile]).main).toBe(numbersOf(agile).main!.points);
    expect(wornBy('warrior', [agile]).stamina).toBe(numbersOf(agile).stamina);
  });
});

describe('prices', () => {
  it('sell by item level times 2, 3, 8 or 20 coins by rarity, and buy at 4 times that', () => {
    expect(sellPrice(piece('chest', 3, 'white'))).toBe(9);
    expect(sellPrice(piece('chest', 3, 'green'))).toBe(24);
    expect(sellPrice(CATALOGUE['hale-longsword'])).toBe(100);
    expect(sellPrice(CATALOGUE['torn-cloth'])).toBe(2);
    expect(buyPrice(piece('chest', 3, 'white'))).toBe(36);
  });

  it('are fixed for consumables: the minor healing potion sells for 2 and costs 8', () => {
    expect(sellPrice(CATALOGUE['minor-healing-potion'])).toBe(2);
    expect(buyPrice(CATALOGUE['minor-healing-potion'])).toBe(8);
  });
});

describe('the catalogue', () => {
  it('stacks potions and junk to 10 and gear and quest items not at all', () => {
    expect(stackOf(CATALOGUE['minor-healing-potion'])).toBe(10);
    expect(stackOf(CATALOGUE['grave-dust'])).toBe(10);
    expect(stackOf(CATALOGUE['worn-tunic'])).toBe(1);
    expect(stackOf(CATALOGUE['leaders-orders'])).toBe(1);
  });

  it('knows every item by its own id, and nothing it was never given', () => {
    for (const [id, item] of Object.entries(CATALOGUE)) expect(item.id).toBe(id);
    expect(itemOf('axe-of-legends')).toBeUndefined();
  });

  it('locks every weapon and off hand to a class, and no armour', () => {
    for (const item of Object.values(CATALOGUE)) {
      if (item.kind !== 'gear') continue;
      expect(item.class !== undefined, item.id).toBe(item.slot === 'mainHand' || item.slot === 'offHand');
    }
  });
});
