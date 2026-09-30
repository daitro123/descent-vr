import { describe, expect, it } from 'vitest';
import type { GiverShows } from '../src/adventureState';
import { buyPrice, CATALOGUE, type GearItem, itemOf } from '../src/items';
import { giverOf, opensWith, STOCK, vendorTalk, waresFor } from '../src/vendors';

// Who trades and what they sell, and what walking up to a vendor unfolds
// (.scratch/inventory/issues/14-vendors.md).

const gear = (id: string) => CATALOGUE[id] as GearItem;

describe("the smith's stock", () => {
  it("is each class's white weapon and off hand at item levels 1, 3 and 5, and white armour for every slot at 2 and 4", () => {
    const stock = STOCK.smith.map(gear);
    expect(stock.every((i) => i.kind === 'gear' && i.rarity === 'white')).toBe(true);
    const hands = stock.filter((i) => i.slot === 'mainHand' || i.slot === 'offHand');
    // Only the warrior's weapons exist until ticket 16.
    expect(hands.map((i) => `${i.slot} ${i.level} ${i.class}`)).toEqual([
      'mainHand 1 warrior',
      'mainHand 3 warrior',
      'mainHand 5 warrior',
      'offHand 1 warrior',
      'offHand 3 warrior',
      'offHand 5 warrior',
    ]);
    const armour = stock.filter((i) => !hands.includes(i));
    expect(armour.map((i) => `${i.slot} ${i.level}`)).toEqual(['head 2', 'head 4', 'chest 2', 'chest 4', 'hands 2', 'hands 4', 'legs 2', 'legs 4', 'feet 2', 'feet 4']);
    expect(armour.every((i) => !i.class)).toBe(true);
  });

  it('fits a class on one board of sixteen, at 4 times what the smith would pay', () => {
    expect(waresFor('smith', 'warrior')).toHaveLength(16);
    expect(waresFor('smith', 'ranger')).toHaveLength(10);
    expect(buyPrice(gear('iron-longsword-5'))).toBe(5 * 3 * 4);
    expect(buyPrice(gear('padded-jerkin-2'))).toBe(2 * 3 * 4);
  });
});

describe("the innkeeper's", () => {
  it('is the minor healing potion, at 8 coins', () => {
    expect(waresFor('innkeeper', 'mage')).toEqual(['minor-healing-potion']);
    expect(buyPrice(itemOf('minor-healing-potion')!)).toBe(8);
  });
});

describe('walking up to a vendor', () => {
  const shows = (marker: GiverShows['marker'], buttons: GiverShows['buttons']): GiverShows => ({ marker, line: 'Hello', buttons, picks: [] });

  it("unfolds the wares at once, unless they've a quest to offer or take back", () => {
    expect(opensWith(null)).toBe('wares');
    expect(opensWith(shows(null, ['goodbye']))).toBe('wares');
    expect(opensWith(shows('active', ['goodbye']))).toBe('wares');
    expect(opensWith(shows('offered', ['accept', 'notNow']))).toBe('talk');
    expect(opensWith(shows('ready', ['handIn']))).toBe('talk');
  });

  it('puts "Trade" beside the talk board\'s buttons', () => {
    expect(vendorTalk(shows('offered', ['accept', 'notNow'])).buttons).toEqual(['accept', 'notNow', 'trade']);
    expect(vendorTalk(shows('ready', ['handIn'])).buttons).toEqual(['handIn', 'trade']);
  });

  it('knows the smith gives quests and the innkeeper does not', () => {
    expect(giverOf('smith')).toBe('smith');
    expect(giverOf('innkeeper')).toBeNull();
  });
});

describe('the vendors buy what Professions gathers and makes', () => {
  it('at their fixed prices, and sell them at 4 times that', () => {
    const sells = (id: string) => buyPrice(itemOf(id)!) / 4;
    expect(['copper-ore', 'rough-stone', 'hearthleaf', 'duskcap'].map(sells)).toEqual([1, 1, 1, 1]);
    expect(sells('copper-bar')).toBe(3);
    // Ticket 06 had the elixir and the whetstone at 3; Professions' spec settled them at 4 and 2.
    expect(['rage-draught', 'minor-mana-potion', 'elixir-of-the-keen-eye', 'whetstone'].map(sells)).toEqual([3, 3, 4, 2]);
  });
});
