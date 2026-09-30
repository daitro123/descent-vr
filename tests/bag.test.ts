import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { Inventory, type Wearer, type Where } from '../src/inventory';
import { type ItemDef } from '../src/items';
import { cardText } from '../src/ui/bag/cardLines';
import { figureAt, FIGURE, nearestSpot, PAGES, spotAt, SPOTS, spotXY, tabAt, TABS } from '../src/ui/bag/layout';
import { lookOf } from '../src/ui/bag/looks';
import { ShoulderReach } from '../src/ui/bag/reach';

// The bag in the Adventure, at the seams that don't need a headset: what the
// inventory says before a carried item is let go (the slot turning red or
// green), what an item's card says, what a point on the panel touches, and
// the reach over the shoulder telling a slow grab from a swing
// (.scratch/inventory/issues/09-the-bag-in-the-adventure.md). The rest is the
// check script's, in the browser.

const warrior = (level = 1): Wearer => ({ class: 'warrior', level });
const bag = (slot: number): Where => ({ in: 'bag', slot });
const MAIN: Where = { in: 'gear', slot: 'mainHand' };

describe('what the panel shows before you let go', () => {
  const carrying = (ids: string[], level = 1) => {
    const inv = new Inventory(warrior(level));
    inv.take(ids.map((id) => ({ id, count: 1 })));
    return inv;
  };

  it('agrees with the move itself: refused for the wrong class, too high a level, or the wrong slot', () => {
    const inv = carrying(['short-bow', 'hale-longsword', 'worn-tunic']);
    const cases: [Where, Where][] = [
      [bag(0), MAIN],
      [bag(1), MAIN],
      [bag(2), MAIN],
      [bag(2), bag(5)],
      [MAIN, bag(2)],
      [bag(0), { in: 'ground' }],
    ];
    const said = cases.map(([from, to]) => inv.check(from, to));
    expect(said).toEqual(['class', 'level', 'slot', null, 'slot', null]);
    // Each check said what the move then does.
    cases.forEach(([from, to], i) => {
      const fresh = carrying(['short-bow', 'hale-longsword', 'worn-tunic']);
      const refused = fresh.move(from, to).find((e) => e.kind === 'refused');
      expect(refused?.kind === 'refused' ? refused.reason : null).toBe(said[i]);
    });
  });

  it('lets Hale\'s longsword into the main hand once you reach its level, the plain sword going where it came from', () => {
    const inv = carrying(['hale-longsword'], 5);
    expect(inv.check(bag(0), MAIN)).toBeNull();
    inv.move(bag(0), MAIN);
    expect(inv.gear.mainHand).toBe('hale-longsword');
    expect(inv.bag[0]).toEqual({ id: 'plain-sword', count: 1 });
  });

  it('refuses a quest item leaving its page, and a full stack', () => {
    const inv = new Inventory(warrior());
    inv.take([{ id: 'leaders-orders', count: 1 }, { id: 'torn-cloth', count: 10 }, { id: 'torn-cloth', count: 3 }]);
    expect(inv.check({ in: 'quest', slot: 0 }, bag(5))).toBe('quest');
    expect(inv.check(bag(1), bag(0))).toBe('full');
    expect(inv.check(bag(0), { in: 'quest', slot: 0 })).toBe('slot');
  });
});

describe("an item's card", () => {
  const worn = new Inventory(warrior()).gear;

  it("shows Hale's longsword locked to warriors, its level in red below it, and its damage against the plain sword", () => {
    const card = cardText('hale-longsword', 1, warrior(1), worn)!;
    expect(card.name).toBe("Hale's Old Longsword");
    expect(card.rarity).toBe('blue');
    expect(card.kind).toBe('Main hand');
    expect(card.lock).toEqual({ name: 'Warrior', yours: true });
    expect(card.level).toEqual({ value: 5, reached: false });
    expect(card.stats).toEqual([{ name: 'Damage', value: '+20%', diff: 18, yours: true }]);
    expect(cardText('hale-longsword', 1, warrior(5), worn)!.level).toEqual({ value: 5, reached: true });
  });

  it("shows another class's lock in red, and the worn piece without a comparison", () => {
    expect(cardText('short-bow', 1, warrior(), worn)!.lock).toEqual({ name: 'Ranger', yours: false });
    const tunic = cardText('worn-tunic', 1, warrior(), worn)!;
    expect(tunic.worn).toBe(true);
    expect(tunic.stats.every((s) => s.diff === null)).toBe(true);
  });

  it('says what a potion does, that junk only sells, and what a stack fetches', () => {
    const potions = cardText('minor-healing-potion', 3, warrior(), worn)!;
    expect(potions.kind).toBe('Potion');
    expect(potions.note).toBe('Heals 40% of your health');
    expect(potions.sells).toBe(6);
    expect(cardText('bone-charm', 1, warrior(), worn)!.kind).toBe('Junk: only to sell');
    expect(cardText('leaders-orders', 1, warrior(), worn)!.sells).toBe(0);
    expect(cardText('no-such-thing', 1, warrior(), worn)).toBeNull();
  });
});

describe("the panel's layout", () => {
  const at = (x: number, y: number, z = 0.01) => new Vector3(x, y, z);
  const touch = CONFIG.bag.touch;

  it('finds every slot at its centre, and none off the face', () => {
    for (const spot of SPOTS) {
      const [x, y] = spotXY(spot);
      expect(spotAt(at(x, y), touch, true)).toEqual(spot);
      expect(spotAt(at(x, y, 0.2), touch, true)).toBeNull();
    }
  });

  it('has no page slots on the talent page, and the gear slots on every page', () => {
    const [x, y] = spotXY({ in: 'grid', i: 5 });
    expect(spotAt(at(x, y), touch, false)).toBeNull();
    const [gx, gy] = spotXY({ in: 'gear', slot: 'head' });
    expect(spotAt(at(gx, gy), touch, false)).toEqual({ in: 'gear', slot: 'head' });
  });

  it('finds each tab, the figure, and the nearest slot within a few centimetres', () => {
    PAGES.forEach((page, i) => expect(tabAt(at(TABS.x[i], TABS.y), touch)).toBe(page));
    expect(figureAt(at(FIGURE.x, FIGURE.bottom + FIGURE.height / 2), touch)).toBe(true);
    const [x, y] = spotXY({ in: 'grid', i: 0 });
    const near = CONFIG.bag.release.near;
    expect(nearestSpot(at(x + 0.035, y + 0.02), CONFIG.bag.release, true, near)).toEqual({ in: 'grid', i: 0 });
  });
});

describe('the reach over the shoulder', () => {
  const head = new Vector3(0, 1.6, 0);
  const gaze = new Vector3(0, 0, -1);
  const reach = new ShoulderReach();
  reach.place(head, gaze);
  const R = CONFIG.bag.reach;
  const shoulder = new Vector3(R.side, 1.6 - R.down, R.back);

  it('sits over the right shoulder, behind the eyes', () => {
    expect(reach.centre.right.distanceTo(shoulder)).toBeLessThan(1e-9);
  });

  it('opens on a slow grip in the zone, refuses a fast one, and ignores a grip outside it', () => {
    const buzzes: number[] = [];
    const buzz = (_: string, intensity: number) => buzzes.push(intensity);
    const hand = (at: Vector3, speed: number, gripDown = true) => ({ left: null, right: { at, speed, gripDown } });
    expect(reach.update(1 / 72, hand(shoulder, 0.5), buzz)).toMatchObject({ hand: 'right', kind: 'grab' });
    expect(buzzes).toContain(R.zoneBuzz.intensity);
    expect(reach.update(1 / 72, hand(shoulder, R.speedGate + 1), buzz)).toMatchObject({ kind: 'tooFast' });
    expect(reach.update(1 / 72, hand(new Vector3(0.3, 1.0, -0.3), 0.2), buzz)).toBeNull();
  });
});

describe('how an item is drawn', () => {
  it("draws a model it doesn't know yet by its slot, in its rarity's colour", () => {
    const helm: ItemDef = { id: 'x', name: 'X', kind: 'gear', slot: 'head', level: 3, rarity: 'green', model: 'helm-green-3' };
    const blue: ItemDef = { ...helm, rarity: 'blue' };
    expect(lookOf(helm).look).toBe('helm');
    expect(lookOf(blue).tint).not.toBe(lookOf(helm).tint);
    expect(lookOf({ id: 'y', name: 'Y', kind: 'gear', slot: 'mainHand', level: 1, rarity: 'white', model: 'x', class: 'warrior' }).look).toBe('sword');
  });
});
