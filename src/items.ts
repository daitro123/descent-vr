import { CONFIG } from './config';

// The item catalogue, as data, and the one rule that gives an item its
// numbers from its item level and rarity. Nothing here is hand-tuned per item:
// a new item is a line of data, and balance lives in CONFIG.items. The names
// are placeholders, cheap to change (.scratch/inventory/spec.md, "The item
// catalogue and the rule"; .scratch/inventory/issues/07-oakvales-items.md).

/** What kind of fighter a character is. */
export type ClassId = 'warrior' | 'ranger' | 'mage';

/** The attribute that gives each class its damage (the Abilities map). */
export type MainAttribute = 'strength' | 'agility' | 'intellect';

export const CLASS_MAIN: Readonly<Record<ClassId, MainAttribute>> = { warrior: 'strength', ranger: 'agility', mage: 'intellect' };

/** Grey is junk; white, green and blue gear is better the rarer it is. */
export type Rarity = 'grey' | 'white' | 'green' | 'blue';

/** Gear never stacks; consumables, materials and junk stack; quest items go on the bag's quest page. */
export type ItemKind = 'gear' | 'consumable' | 'material' | 'quest' | 'junk';

/** The seven places gear is worn. */
export const GEAR_SLOTS = ['mainHand', 'offHand', 'head', 'chest', 'hands', 'legs', 'feet'] as const;

export type GearSlot = (typeof GEAR_SLOTS)[number];

/** An item's id in the catalogue. Kept as a string, since a save may hold one a later build no longer knows. */
export type ItemId = string;

interface Common {
  readonly id: ItemId;
  readonly name: string;
  readonly level: number;
  readonly rarity: Rarity;
  /** How it's drawn: its model, and its cell in the icon atlas. For a warrior's sword, which blade (weapons.ts). */
  readonly model: string;
}

export interface GearItem extends Common {
  readonly kind: 'gear';
  readonly slot: GearSlot;
  /** The class it's locked to: weapons and off hands only. Armour anyone can wear. */
  readonly class?: ClassId;
  /** The main attribute a green or blue armour piece carries besides Stamina. A weapon's or off hand's is its class's. */
  readonly main?: MainAttribute;
  /** An off hand with no armour: the quiver and the focus. */
  readonly noArmour?: true;
}

export interface ConsumableItem extends Common {
  readonly kind: 'consumable';
  /** Coins a vendor pays for one. */
  readonly price: number;
  /** The share of your maximum health drinking one heals. */
  readonly heal: number;
}

export interface MaterialItem extends Common {
  readonly kind: 'material';
  readonly price: number;
}

export interface QuestItem extends Common {
  readonly kind: 'quest';
}

export interface JunkItem extends Common {
  readonly kind: 'junk';
}

export type ItemDef = GearItem | ConsumableItem | MaterialItem | QuestItem | JunkItem;

const gear = (id: ItemId, name: string, slot: GearSlot, level: number, rarity: Rarity, model: string, more: Partial<GearItem> = {}): GearItem => ({
  id,
  name,
  kind: 'gear',
  slot,
  level,
  rarity,
  model,
  ...more,
});

const junk = (id: ItemId, name: string, model: string): JunkItem => ({ id, name, kind: 'junk', level: 1, rarity: 'grey', model });

const potion = CONFIG.items.minorHealingPotion;

/** Every item the game knows, by id. Later tickets add Oakvale's picks, the smith's stock, loot and Professions' items. */
export const CATALOGUE: Readonly<Record<ItemId, ItemDef>> = Object.fromEntries(
  ([
    // The warrior's starting kit, as today: the plain sword and the round shield.
    gear('plain-sword', 'Plain Longsword', 'mainHand', 1, 'white', 'plain', { class: 'warrior' }),
    gear('round-shield', 'Round Shield', 'offHand', 1, 'white', 'round-shield', { class: 'warrior' }),
    // The ranger's and mage's (placeholders until the Abilities map settles how they fight).
    gear('short-bow', 'Short Bow', 'mainHand', 1, 'white', 'short-bow', { class: 'ranger' }),
    gear('quiver', 'Quiver', 'offHand', 1, 'white', 'quiver', { class: 'ranger', noArmour: true }),
    gear('apprentice-wand', "Apprentice's Wand", 'mainHand', 1, 'white', 'wand', { class: 'mage' }),
    gear('glass-focus', 'Glass Focus', 'offHand', 1, 'white', 'focus', { class: 'mage', noArmour: true }),
    // Everyone's.
    gear('worn-tunic', 'Worn Tunic', 'chest', 1, 'white', 'tunic'),
    gear('worn-boots', 'Worn Boots', 'feet', 1, 'white', 'boots'),
    // What Lies Below's reward for a warrior: darker-bladed, with a gilded guard.
    gear('hale-longsword', "Hale's Old Longsword", 'mainHand', 5, 'blue', 'hale', { class: 'warrior' }),
    { id: 'minor-healing-potion', name: 'Minor Healing Potion', kind: 'consumable', level: 1, rarity: 'white', model: 'flask-red', ...potion },
    { id: 'leaders-orders', name: "Leader's Orders", kind: 'quest', level: 2, rarity: 'white', model: 'scroll' },
    junk('worn-trinket', 'Worn Trinket', 'trinket'),
    junk('torn-cloth', 'Torn Cloth', 'cloth'),
    junk('bone-charm', 'Bone Charm', 'charm'),
    junk('grave-dust', 'Grave Dust', 'dust'),
  ] satisfies ItemDef[]).map((item) => [item.id, item]),
);

/** The item with `id`, or undefined if the catalogue doesn't know it. */
export const itemOf = (id: ItemId): ItemDef | undefined => CATALOGUE[id];

/** How many of `item` one slot holds. */
export function stackOf(item: ItemDef): number {
  return item.kind === 'gear' || item.kind === 'quest' ? 1 : CONFIG.items.stack[item.kind];
}

/** What a piece of gear carries. */
export interface GearNumbers {
  /** Added to your damage multiplier (weapons only). */
  readonly damage: number;
  /** Cuts the damage you take (armour and shields). */
  readonly armour: number;
  readonly stamina: number;
  /** The main attribute it carries, with its points; null for a white. */
  readonly main: { readonly attribute: MainAttribute; readonly points: number } | null;
}

const NOTHING: GearNumbers = { damage: 0, armour: 0, stamina: 0, main: null };

/** A level's own Stamina, and its own main attribute: the Abilities map's. */
export const attributesAt = (level: number) => CONFIG.items.attribute.atLevel1 + CONFIG.items.attribute.perLevel * (level - 1);

/**
 * The rule: what a piece carries, from its slot, item level and rarity alone.
 * A weapon carries a damage rating; every other slot a share of a set's
 * armour and, from green up, of a set's attributes (at least one point each).
 */
export function numbersOf(item: GearItem): GearNumbers {
  const I = CONFIG.items;
  const scale = I.rarity[item.rarity];
  if (item.slot === 'mainHand') return { ...NOTHING, damage: I.weapon * item.level * scale };
  const share = I.share[item.slot];
  const armour = item.noArmour ? 0 : Math.round(I.armour * item.level * scale * share);
  if (item.rarity === 'grey' || item.rarity === 'white') return { ...NOTHING, armour };
  const points = Math.max(1, Math.round(I.attributes * attributesAt(item.level) * (scale / I.rarity.green) * share));
  const attribute = item.class ? CLASS_MAIN[item.class] : (item.main ?? 'strength');
  return { damage: 0, armour, stamina: points, main: { attribute, points } };
}

/** What your worn gear adds up to for a character of `klass`: a main attribute that isn't theirs does nothing. */
export interface Worn {
  readonly damage: number;
  readonly armour: number;
  readonly stamina: number;
  /** Points of your class's main attribute. */
  readonly main: number;
}

export const WORN_NOTHING: Worn = { damage: 0, armour: 0, stamina: 0, main: 0 };

/** Add up the numbers of `items` as `klass` wears them. */
export function wornBy(klass: ClassId, items: readonly GearItem[]): Worn {
  const mine = CLASS_MAIN[klass];
  let damage = 0;
  let armour = 0;
  let stamina = 0;
  let main = 0;
  for (const item of items) {
    const n = numbersOf(item);
    damage += n.damage;
    armour += n.armour;
    stamina += n.stamina;
    if (n.main?.attribute === mine) main += n.main.points;
  }
  return { damage, armour, stamina, main };
}

/** The share of a blow `armour` cuts, from an attacker of `level`. */
export function armourCut(armour: number, level: number): number {
  return armour <= 0 ? 0 : armour / (armour + CONFIG.items.armourVsLevel * Math.max(1, level));
}

/** Coins a vendor pays for one of `item`: quest items can't be sold. */
export function sellPrice(item: ItemDef): number {
  if (item.kind === 'quest') return 0;
  if (item.kind === 'consumable' || item.kind === 'material') return item.price;
  return item.level * CONFIG.items.sell[item.rarity];
}

/** Coins a vendor asks for one of `item`. */
export const buyPrice = (item: ItemDef): number => sellPrice(item) * CONFIG.items.buy;
