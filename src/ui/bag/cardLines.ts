import type { Wearer } from '../../inventory';
import { CLASS_MAIN, type ClassId, type GearItem, type GearSlot, type ItemDef, itemOf, type ItemId, type MainAttribute, numbersOf, sellPrice } from '../../items';

// What an item's card says, with no canvas in it: its name, what it is, the
// class it's locked to and its item level (each in red when it isn't for you
// yet), its numbers and + or − against what you wear in its slot, and what a
// vendor pays (.scratch/inventory/issues/03-the-bag-and-the-gear-panel.md,
// 02-what-an-item-is.md).

export const SLOT_NAME: Readonly<Record<GearSlot, string>> = {
  mainHand: 'Main hand',
  offHand: 'Off hand',
  head: 'Head',
  chest: 'Chest',
  hands: 'Hands',
  legs: 'Legs',
  feet: 'Feet',
};

const CLASS_NAME: Readonly<Record<ClassId, string>> = { warrior: 'Warrior', ranger: 'Ranger', mage: 'Mage' };
const ATTRIBUTE_NAME: Readonly<Record<MainAttribute, string>> = { strength: 'Strength', agility: 'Agility', intellect: 'Intellect' };

/** One of a piece's numbers: its value, and how it compares with what's worn in that slot. */
export interface CardStat {
  readonly name: string;
  /** As shown: "+20%" for a weapon's damage, a whole number otherwise. */
  readonly value: string;
  /** Against the piece worn in that slot, in the same units; null for the worn piece itself. */
  readonly diff: number | null;
  /** False for a main attribute that isn't your class's: it does nothing for you, and shows greyed. */
  readonly yours: boolean;
}

export interface CardText {
  readonly name: string;
  readonly rarity: ItemDef['rarity'];
  /** "Main hand", "Chest", "Potion", "Quest item", "Junk: only to sell". */
  readonly kind: string;
  /** The class a weapon or off hand is locked to, and whether it's yours. */
  readonly lock: { readonly name: string; readonly yours: boolean } | null;
  /** Gear's item level, and whether you've reached it. */
  readonly level: { readonly value: number; readonly reached: boolean } | null;
  /** Is it the piece you wear? */
  readonly worn: boolean;
  readonly stats: readonly CardStat[];
  /** A line under the numbers: what a potion does. */
  readonly note: string | null;
  /** How many in the stack. */
  readonly count: number;
  /** Coins a vendor pays for the stack; 0 for a quest item. */
  readonly sells: number;
}

/** A piece's numbers by name, damage as whole percent. */
function statsOf(item: GearItem): Map<string, { value: number; attribute?: MainAttribute }> {
  const n = numbersOf(item);
  const out = new Map<string, { value: number; attribute?: MainAttribute }>();
  if (n.damage) out.set('Damage', { value: Math.round(n.damage * 100) });
  if (n.armour) out.set('Armour', { value: n.armour });
  if (n.stamina) out.set('Stamina', { value: n.stamina });
  if (n.main) out.set(ATTRIBUTE_NAME[n.main.attribute], { value: n.main.points, attribute: n.main.attribute });
  return out;
}

/** What the card of `count` of `id` says, to `wearer` wearing `gear`. */
export function cardText(id: ItemId, count: number, wearer: Wearer, gear: Readonly<Record<GearSlot, ItemId | null>>): CardText | null {
  const item = itemOf(id);
  if (!item) return null;
  const base = { name: item.name, rarity: item.rarity, count, sells: sellPrice(item) * count, note: null, lock: null, level: null, worn: false, stats: [] };
  switch (item.kind) {
    case 'consumable':
      return { ...base, kind: 'Potion', note: `Heals ${Math.round(item.heal * 100)}% of your health` };
    case 'material':
      return { ...base, kind: 'Material' };
    case 'quest':
      return { ...base, kind: 'Quest item' };
    case 'junk':
      return { ...base, kind: 'Junk: only to sell' };
    case 'gear':
      break;
  }
  const wornId = gear[item.slot];
  const worn = wornId === item.id;
  const other = !worn && wornId ? itemOf(wornId) : undefined;
  const mine = statsOf(item);
  const theirs = other?.kind === 'gear' ? statsOf(other) : new Map<string, { value: number }>();
  const names = [...mine.keys(), ...[...theirs.keys()].filter((k) => !mine.has(k))];
  const yourMain = CLASS_MAIN[wearer.class];
  const stats: CardStat[] = names.map((name) => {
    const s = mine.get(name);
    const value = s?.value ?? 0;
    return {
      name,
      value: name === 'Damage' ? `+${value}%` : String(value),
      diff: worn ? null : value - (theirs.get(name)?.value ?? 0),
      yours: !s?.attribute || s.attribute === yourMain,
    };
  });
  return {
    ...base,
    kind: SLOT_NAME[item.slot],
    lock: item.class ? { name: CLASS_NAME[item.class], yours: item.class === wearer.class } : null,
    level: { value: item.level, reached: item.level <= wearer.level },
    worn,
    stats,
  };
}
