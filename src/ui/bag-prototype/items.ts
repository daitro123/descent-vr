// PROTOTYPE (The bag and the gear panel, .scratch/inventory/issues/03-…):
// placeholder items and the bag they sit in, all in memory. Made-up names and
// numbers; nothing here reaches the Adventure or the save.

export type Rarity = 'junk' | 'common' | 'uncommon' | 'rare';
export type GearSlot = 'mainHand' | 'offHand' | 'head' | 'chest' | 'hands' | 'legs' | 'feet';
export type Stat = 'damage' | 'armour' | 'block' | 'strength' | 'stamina';
/** How an item is drawn, as an icon or a small model. */
export type Look = 'sword' | 'shield' | 'helm' | 'chest' | 'gloves' | 'legs' | 'boots' | 'charm' | 'rope';

export interface Item {
  readonly id: string;
  readonly name: string;
  readonly rarity: Rarity;
  /** Where it's worn; null for junk. */
  readonly slot: GearSlot | null;
  readonly look: Look;
  /** Its main colour, for the icon, the model and the figure. */
  readonly tint: number;
  readonly stats: Partial<Record<Stat, number>>;
}

/** WoW's rarity colours: grey junk, white, green, blue. */
export const RARITY_COLOUR: Record<Rarity, string> = {
  junk: '#9d9d9d',
  common: '#ffffff',
  uncommon: '#1eff00',
  rare: '#0070dd',
};

export const GEAR_SLOTS: readonly GearSlot[] = ['head', 'chest', 'hands', 'legs', 'feet', 'mainHand', 'offHand'];
export const SLOT_NAME: Record<GearSlot, string> = {
  mainHand: 'Main hand',
  offHand: 'Off hand',
  head: 'Head',
  chest: 'Chest',
  hands: 'Hands',
  legs: 'Legs',
  feet: 'Feet',
};
export const STAT_NAME: Record<Stat, string> = {
  damage: 'Damage',
  armour: 'Armour',
  block: 'Block',
  strength: 'Strength',
  stamina: 'Stamina',
};
const STAT_ORDER: readonly Stat[] = ['damage', 'armour', 'block', 'strength', 'stamina'];

const item = (id: string, name: string, rarity: Rarity, slot: GearSlot | null, look: Look, tint: number, stats: Item['stats']): Item => ({
  id,
  name,
  rarity,
  slot,
  look,
  tint,
  stats,
});

/** What you wear at the start: plain kit. */
export const WORN: readonly Item[] = [
  item('recruit-sword', "Recruit's Longsword", 'common', 'mainHand', 'sword', 0x8a6a40, { damage: 10 }),
  item('oak-shield', 'Oak Heater Shield', 'common', 'offHand', 'shield', 0x7a5a34, { armour: 20, block: 5 }),
  item('padded-tunic', 'Padded Tunic', 'common', 'chest', 'chest', 0x8a7a5a, { armour: 8 }),
  item('leather-boots', 'Leather Boots', 'common', 'feet', 'boots', 0x5a3a24, { armour: 3 }),
];

/** What's in the bag at the start, in slot order. */
export const CARRIED: readonly Item[] = [
  item('steel-sword', 'Steel Longsword', 'uncommon', 'mainHand', 'sword', 0x3a5a8a, { damage: 14, strength: 2 }),
  item('militia-helm', 'Militia Helm', 'uncommon', 'head', 'helm', 0x9098a0, { armour: 9, stamina: 2 }),
  item('ironbark-greaves', 'Ironbark Greaves', 'rare', 'legs', 'legs', 0x4a5a3a, { armour: 18, strength: 4, stamina: 3 }),
  item('bandit-gloves', "Bandit's Gloves", 'common', 'hands', 'gloves', 0x6a4a2a, { armour: 4 }),
  item('bone-charm', 'Cracked Bone Charm', 'junk', null, 'charm', 0xd8d0b8, {}),
  item('warden-shield', "Warden's Kite Shield", 'rare', 'offHand', 'shield', 0x3a3a6a, { armour: 34, block: 9, stamina: 4 }),
  item('frayed-rope', 'Frayed Rope', 'junk', null, 'rope', 0xa08a5a, {}),
  item('chain-vest', 'Chain Vest', 'uncommon', 'chest', 'chest', 0xa0a8b0, { armour: 16, stamina: 2 }),
];

export const ALL_ITEMS: readonly Item[] = [...WORN, ...CARRIED];

/** Where an item can sit: one of the bag's slots, or a gear slot. */
export type SlotRef = { readonly kind: 'bag'; readonly i: number } | { readonly kind: 'gear'; readonly slot: GearSlot };

export const BAG_SIZE = 16;

export function sameSlot(a: SlotRef | null, b: SlotRef | null): boolean {
  if (!a || !b) return a === b;
  return a.kind === 'bag' ? b.kind === 'bag' && a.i === b.i : b.kind === 'gear' && a.slot === b.slot;
}

export function slotLabel(ref: SlotRef): string {
  return ref.kind === 'bag' ? `bag ${ref.i + 1}` : SLOT_NAME[ref.slot].toLowerCase();
}

/** What a move did. */
export type MoveResult = 'moved' | 'swapped' | 'equipped' | 'refused' | 'same';

/** The 16 bag slots and the seven gear slots. */
export class Bag {
  readonly slots: (Item | null)[] = Array.from({ length: BAG_SIZE }, () => null);
  readonly gear: Record<GearSlot, Item | null> = { mainHand: null, offHand: null, head: null, chest: null, hands: null, legs: null, feet: null };
  /** Bumped on every change, so the panel knows to redraw. */
  version = 0;

  constructor() {
    for (const it of WORN) if (it.slot) this.gear[it.slot] = it;
    CARRIED.forEach((it, i) => (this.slots[i] = it));
  }

  at(ref: SlotRef): Item | null {
    return ref.kind === 'bag' ? this.slots[ref.i] : this.gear[ref.slot];
  }

  private put(ref: SlotRef, it: Item | null): void {
    if (ref.kind === 'bag') this.slots[ref.i] = it;
    else this.gear[ref.slot] = it;
  }

  /** Can `it` sit at `ref`? Anything fits a bag slot; a gear slot takes only what's worn there. */
  fits(it: Item, ref: SlotRef): boolean {
    return ref.kind === 'bag' || it.slot === ref.slot;
  }

  /** Move what's at `from` to `to`, swapping with what's there if it fits back where this came from. */
  move(from: SlotRef, to: SlotRef): MoveResult {
    const a = this.at(from);
    if (!a) return 'refused';
    if (sameSlot(from, to)) return 'same';
    const b = this.at(to);
    if (!this.fits(a, to) || (b && !this.fits(b, from))) return 'refused';
    this.put(to, a);
    this.put(from, b);
    this.version++;
    if (to.kind === 'gear') return 'equipped';
    return b ? 'swapped' : 'moved';
  }

  /** Take what's at `ref` out (to drop it). */
  take(ref: SlotRef): Item | null {
    const it = this.at(ref);
    if (it) {
      this.put(ref, null);
      this.version++;
    }
    return it;
  }

  /** Put `it` in the first free bag slot; false if the bag is full. */
  add(it: Item): boolean {
    const i = this.slots.indexOf(null);
    if (i < 0) return false;
    this.slots[i] = it;
    this.version++;
    return true;
  }
}

/** One line of an item's numbers: the stat, its value, and how it compares with what's worn in that slot. */
export interface StatLine {
  readonly stat: Stat;
  readonly value: number;
  /** Against the item worn in its slot: 0 for the worn item itself, all of it when nothing is worn there. */
  readonly diff: number;
}

/** An item's numbers against `worn` (what's worn in its slot), every stat either has. */
export function compare(it: Item, worn: Item | null): StatLine[] {
  const out: StatLine[] = [];
  for (const stat of STAT_ORDER) {
    const value = it.stats[stat] ?? 0;
    const was = worn === it ? value : (worn?.stats[stat] ?? 0);
    if (value || was) out.push({ stat, value, diff: value - was });
  }
  return out;
}
