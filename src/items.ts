import { CONFIG } from './config';
import type { Family } from './models/characters';

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
  /** How it's drawn: its model, and its cell in the icon atlas. For a warrior's sword, which blade (weapons.ts); a bow's or wand's look in the hand (player/bow.ts, player/mage.ts). */
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
  /** Dropped by kills (loot.ts), at every loot level. */
  readonly loot?: true;
}

export interface ConsumableItem extends Common {
  readonly kind: 'consumable';
  /** Coins a vendor pays for one. */
  readonly price: number;
  /** The share of your maximum health drinking one heals. */
  readonly heal: number;
  /** Rage drinking one gives. */
  readonly rage?: number;
  /** The share of your maximum mana drinking one gives back. */
  readonly mana?: number;
  /**
   * A timed buff: not a potion, so off the belt's shared cooldown. One of each
   * kind is on you at a time, and a new one replaces the old.
   */
  readonly buff?: Buff;
  /** Never goes on the belt (the whetstone, rubbed along your blade from the bag). */
  readonly belt?: false;
}

/** The kinds of buff: one of each is on you at a time. */
export type BuffKind = 'whetstone' | 'elixir';

/** A timed buff a consumable puts on you. */
export interface Buff {
  /** One of each kind at a time. */
  readonly kind: BuffKind;
  /** Your damage is this much more while it lasts (0.05 for 5% more); buffs on you together add up. */
  readonly damage: number;
  readonly seconds: number;
  /** The classes it's for; anyone's if missing. */
  readonly for?: readonly ClassId[];
}

/** Is it a potion, on the belt's shared cooldown? Every consumable but a buff is. */
export const isPotion = (item: ItemDef): boolean => item.kind === 'consumable' && !item.buff;

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

/** Loot's item levels, 1 to `CONFIG.loot.levels`. */
export const LOOT_LEVELS: readonly number[] = Array.from({ length: CONFIG.loot.levels }, (_, i) => i + 1);

/** An item that comes at every loot level has one id per level: its base id and the level. */
export const levelled = (base: string, level: number): ItemId => `${base}-${level}`;

/** Junk, by the enemy family that drops it: the base id, its name and its model. */
export const JUNK = {
  bandit: [
    ['worn-trinket', 'Worn Trinket', 'trinket'],
    ['torn-cloth', 'Torn Cloth', 'cloth'],
  ],
  undead: [
    ['bone-charm', 'Bone Charm', 'charm'],
    ['grave-dust', 'Grave Dust', 'dust'],
  ],
  drowned: [
    ['corroded-deep-coin', 'Corroded Deepking Coin', 'deep-coin'],
    ['silted-knucklebone', 'Silted Knucklebone', 'silted-bone'],
  ],
  bog: [
    ['marsh-gas-bladder', 'Marsh-Gas Bladder', 'gas-bladder'],
    ['clod-of-peat', 'Clod of Peat', 'peat'],
  ],
} as const satisfies Record<Family, readonly (readonly [string, string, string])[]>;

/** Junk at every loot level: sold only, and worth its item level × `CONFIG.items.sell.grey`. */
const junk = (): JunkItem[] =>
  Object.values(JUNK).flatMap((kinds) =>
    kinds.flatMap(([base, name, model]) => LOOT_LEVELS.map((level): JunkItem => ({ id: levelled(base, level), name, kind: 'junk', level, rarity: 'grey', model }))),
  );

/** Loot's armour, for each slot a white, a green and a blue, anyone's to wear. Green and blue armour comes once for each main attribute, so a drop can carry yours. */
const LOOT_ARMOUR: Readonly<Record<Exclude<GearSlot, Hand>, readonly [white: string, green: string, blue: string]>> = {
  head: ['Leather Cap', 'Studded Coif', 'Chain Coif'],
  chest: ['Padded Jerkin', 'Studded Jerkin', 'Chain Hauberk'],
  hands: ['Leather Gloves', 'Studded Gloves', 'Chain Gauntlets'],
  legs: ['Leather Trousers', 'Studded Leggings', 'Chain Leggings'],
  feet: ['Leather Boots', 'Studded Boots', 'Chain Boots'],
};

/** The hands' slots: what they hold is locked to a class. */
type Hand = 'mainHand' | 'offHand';

/** A loot piece for the hands: its name and its model. */
type HandPiece = readonly [name: string, model: string];

/**
 * Loot's weapons and off hands, by class and slot: a white, a green and a
 * blue, named in the warrior's way (a plain material, a better one, and
 * moon-something for the blue). The ranger's main hand is a bow, its off hand
 * a quiver; the mage's a wand or staff, and a focus. The model is the look:
 * a warrior's blade is the plain sword's and its shield the round shield's;
 * each bow and wand or staff has its own (player/bow.ts, player/mage.ts), and
 * quivers and focuses are only ever drawn in the bag and on the ground.
 */
const LOOT_HANDS: Readonly<Record<ClassId, Readonly<Record<Hand, readonly [white: HandPiece, green: HandPiece, blue: HandPiece]>>>> = {
  warrior: {
    mainHand: [
      ['Iron Longsword', 'plain'],
      ['Tempered Longsword', 'plain'],
      ['Moonsteel Longsword', 'plain'],
    ],
    offHand: [
      ['Oak Heater Shield', 'round-shield'],
      ['Banded Heater Shield', 'round-shield'],
      ['Moonsteel Kite Shield', 'round-shield'],
    ],
  },
  ranger: {
    mainHand: [
      ['Ash Longbow', 'ash-bow'],
      ['Yew Longbow', 'yew-bow'],
      ['Moonhorn Recurve', 'horn-bow'],
    ],
    offHand: [
      ['Hide Quiver', 'hide-quiver'],
      ['Tooled Quiver', 'tooled-quiver'],
      ['Moonhide Quiver', 'moonhide-quiver'],
    ],
  },
  mage: {
    mainHand: [
      ['Birch Wand', 'birch-wand'],
      ['Rowan Staff', 'rowan-staff'],
      ['Moonwood Staff', 'moonwood-staff'],
    ],
    offHand: [
      ['Quartz Focus', 'quartz-focus'],
      ['Amethyst Focus', 'amethyst-focus'],
      ['Moonstone Focus', 'moonstone-focus'],
    ],
  },
};

/** A green or blue armour piece's name ends in its main attribute's. */
const OF_THE: Readonly<Record<MainAttribute, string>> = { strength: 'Bear', agility: 'Fox', intellect: 'Owl' };

/** How a loot armour piece is drawn: by its slot. */
const ARMOUR_MODEL: Readonly<Record<Exclude<GearSlot, Hand>, string>> = { head: 'helm', chest: 'chest', hands: 'gloves', legs: 'legs', feet: 'boots' };

const slug = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, '-');

const RARITIES = ['white', 'green', 'blue'] as const;

function lootGear(): GearItem[] {
  const out: GearItem[] = [];
  for (const klass of ['warrior', 'ranger', 'mage'] as const)
    for (const slot of ['mainHand', 'offHand'] as const)
      RARITIES.forEach((rarity, r) => {
        const [name, model] = LOOT_HANDS[klass][slot][r];
        const noArmour = slot === 'offHand' && klass !== 'warrior' ? { noArmour: true as const } : {};
        for (const level of LOOT_LEVELS) out.push(gear(levelled(slug(name), level), name, slot, level, rarity, model, { loot: true, class: klass, ...noArmour }));
      });
  for (const slot of GEAR_SLOTS) {
    if (slot === 'mainHand' || slot === 'offHand') continue;
    RARITIES.forEach((rarity, r) => {
      const name = LOOT_ARMOUR[slot][r];
      const mains: (MainAttribute | null)[] = rarity === 'white' ? [null] : ['strength', 'agility', 'intellect'];
      for (const main of mains)
        for (const level of LOOT_LEVELS) {
          const full = main ? `${name} of the ${OF_THE[main]}` : name;
          out.push(gear(levelled(slug(full), level), full, slot, level, rarity, ARMOUR_MODEL[slot], { loot: true, ...(main ? { main } : {}) }));
        }
    });
  }
  return out;
}

const MAINS = Object.values(CLASS_MAIN);

/** An armour piece made once for each main attribute, so it can fit any class: `pickFor(id, klass)` names each. */
const forEveryClass = (id: ItemId, name: string, slot: GearSlot, level: number, rarity: Rarity, model: string): GearItem[] =>
  MAINS.map((main) => gear(`${id}-${main}`, name, slot, level, rarity, model, { main }));

/** The one of an armour piece made for every class that carries `klass`'s main attribute. */
export const pickFor = (id: ItemId, klass: ClassId): ItemId => `${id}-${CLASS_MAIN[klass]}`;

const potion = CONFIG.items.minorHealingPotion;
const made = CONFIG.professions.items;

const material = (id: ItemId, name: string, model: string, price: number): MaterialItem => ({ id, name, kind: 'material', level: 1, rarity: 'white', model, price });

const consumable = (id: ItemId, name: string, model: string, more: Omit<ConsumableItem, keyof Common | 'kind' | 'heal'>): ConsumableItem => ({
  id,
  name,
  kind: 'consumable',
  level: 1,
  rarity: 'white',
  model,
  heal: 0,
  ...more,
});

/** Copper gauntlets in one version: armour anyone can wear, carrying Stamina and `main`. */
const gauntlets = (main: MainAttribute, of: string): GearItem =>
  gear(`copper-gauntlets-of-${main}`, `Copper Gauntlets of ${of}`, 'hands', made.copperGauntlets.level, made.copperGauntlets.rarity, 'copper-gauntlets', { main });

/** Every item the game knows, by id. A later ticket adds the smith's stock. */
export const CATALOGUE: Readonly<Record<ItemId, ItemDef>> = Object.fromEntries(
  ([
    // The warrior's starting kit, as today: the plain sword and the round shield.
    gear('plain-sword', 'Plain Longsword', 'mainHand', 1, 'white', 'plain', { class: 'warrior' }),
    gear('round-shield', 'Round Shield', 'offHand', 1, 'white', 'round-shield', { class: 'warrior' }),
    // The ranger's and mage's.
    gear('short-bow', 'Short Bow', 'mainHand', 1, 'white', 'short-bow', { class: 'ranger' }),
    gear('quiver', 'Quiver', 'offHand', 1, 'white', 'quiver', { class: 'ranger', noArmour: true }),
    gear('apprentice-wand', "Apprentice's Wand", 'mainHand', 1, 'white', 'wand', { class: 'mage' }),
    gear('glass-focus', 'Glass Focus', 'offHand', 1, 'white', 'focus', { class: 'mage', noArmour: true }),
    // Everyone's.
    gear('worn-tunic', 'Worn Tunic', 'chest', 1, 'white', 'tunic'),
    gear('worn-boots', 'Worn Boots', 'feet', 1, 'white', 'boots'),
    // Hale's hand-ins' picks (07-oakvales-items.md): two greens for Raiders in the Fields, two for
    // The Lumber Camp, and for What Lies Below your class's blue weapon or the Warden's Mantle.
    ...forEveryClass('farmstead-gloves', 'Farmstead Gloves', 'hands', 2, 'green', 'farmstead-gloves'),
    ...forEveryClass('hedgerow-boots', 'Hedgerow Boots', 'feet', 2, 'green', 'hedgerow-boots'),
    ...forEveryClass('timberline-leggings', 'Timberline Leggings', 'legs', 3, 'green', 'timberline-leggings'),
    ...forEveryClass('marshals-cap', "Marshal's Cap", 'head', 3, 'green', 'marshals-cap'),
    ...forEveryClass('wardens-mantle', "Warden's Mantle", 'chest', 5, 'blue', 'wardens-mantle'),
    // The warrior's: darker-bladed, with a gilded guard. The ranger's a long hunting bow bound in gold, the mage's a bone-pale staff with a warded stone.
    gear('hale-longsword', "Hale's Old Longsword", 'mainHand', 5, 'blue', 'hale', { class: 'warrior' }),
    gear('hale-hunting-bow', "Hale's Old Hunting Bow", 'mainHand', 5, 'blue', 'hunting-bow', { class: 'ranger' }),
    gear('crypt-warded-staff', 'Crypt-Warded Staff', 'mainHand', 5, 'blue', 'crypt-staff', { class: 'mage' }),
    { id: 'minor-healing-potion', name: 'Minor Healing Potion', kind: 'consumable', level: 1, rarity: 'white', model: 'flask-red', ...potion },
    { id: 'leaders-orders', name: "Leader's Orders", kind: 'quest', level: 2, rarity: 'white', model: 'scroll' },
    ...junk(),
    ...lootGear(),
    // Professions' materials, gathered and smelted in Oakvale.
    material('copper-ore', 'Copper Ore', 'ore-copper', made.copperOre.price),
    material('rough-stone', 'Rough Stone', 'stone-rough', made.roughStone.price),
    material('copper-bar', 'Copper Bar', 'bar-copper', made.copperBar.price),
    material('hearthleaf', 'Hearthleaf', 'herb-hearthleaf', made.hearthleaf.price),
    material('duskcap', 'Duskcap', 'herb-duskcap', made.duskcap.price),
    // What Alchemy and Smithing make (the minor healing potion is the innkeeper's, above).
    consumable('rage-draught', 'Rage Draught', 'flask-orange', { price: made.rageDraught.price, rage: made.rageDraught.rage }),
    consumable('minor-mana-potion', 'Minor Mana Potion', 'flask-blue', { price: made.minorManaPotion.price, mana: made.minorManaPotion.mana }),
    consumable('elixir-of-the-keen-eye', 'Elixir of the Keen Eye', 'flask-green', {
      price: made.elixirOfTheKeenEye.price,
      buff: { kind: 'elixir', damage: made.elixirOfTheKeenEye.damage, seconds: made.elixirOfTheKeenEye.seconds },
    }),
    consumable('whetstone', 'Whetstone', 'whetstone', {
      price: made.whetstone.price,
      buff: { kind: 'whetstone', damage: made.whetstone.damage, seconds: made.whetstone.seconds, for: ['warrior', 'ranger'] },
      belt: false,
    }),
    gauntlets('strength', 'Strength'),
    gauntlets('agility', 'Agility'),
    gauntlets('intellect', 'Intellect'),
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
