import type { Button, GiverShows } from './adventureState';
import { CONFIG } from './config';
import { CATALOGUE, type ClassId, GEAR_SLOTS, type GearItem, type ItemId } from './items';
import { GIVERS, type GiverId, type VillagerId } from './quests';

// Who trades in Oakvale and what they sell, as data, with no three.js in it.
// The smith sells white gear (each class's weapon and off hand at item levels
// 1, 3 and 5, and armour for every slot at 2 and 4), the innkeeper the minor
// healing potion, and their stock never runs out. Both buy anything but a
// quest item, at the rule's prices (items.ts, sellPrice and buyPrice). A
// vendor who also gives quests talks first while they have one to offer or
// take back (.scratch/inventory/issues/06-vendors-and-the-stash.md, 07-oakvales-items.md, 14-vendors.md).

/** The villagers who trade. */
export const VENDORS = ['smith', 'innkeeper'] as const satisfies readonly VillagerId[];

export type VendorId = (typeof VENDORS)[number];

export const isVendor = (id: string): id is VendorId => (VENDORS as readonly string[]).includes(id);

/** The classes, in the order the smith lays out their weapons. */
const CLASSES: readonly ClassId[] = ['warrior', 'ranger', 'mage'];

/**
 * The smith's white stock from the catalogue: the loot table's white weapons
 * and off hands of every class at `hands`' item levels, and its white armour
 * at `armour`'s, each slot's in the gear panel's order.
 */
function smithStock(): ItemId[] {
  const { hands, armour } = CONFIG.vendors.smith;
  const whites = Object.values(CATALOGUE).filter((i): i is GearItem => i.kind === 'gear' && i.loot === true && i.rarity === 'white');
  const out: ItemId[] = [];
  for (const klass of CLASSES)
    for (const slot of ['mainHand', 'offHand'] as const)
      for (const level of hands) out.push(...whites.filter((i) => i.class === klass && i.slot === slot && i.level === level).map((i) => i.id));
  for (const slot of GEAR_SLOTS.filter((s) => s !== 'mainHand' && s !== 'offHand'))
    for (const level of armour) out.push(...whites.filter((i) => !i.class && i.slot === slot && i.level === level).map((i) => i.id));
  return out;
}

/** What each vendor sells, in the order their board lays it out. */
export const STOCK: Readonly<Record<VendorId, readonly ItemId[]>> = {
  smith: smithStock(),
  innkeeper: ['minor-healing-potion'],
};

/**
 * What `vendor`'s board shows a character of `klass`: their stock, less other
 * classes' weapons and off hands, which a class can never wear. The smith's
 * board holds sixteen, a class's six hand pieces and the ten of armour.
 */
export function waresFor(vendor: VendorId, klass: ClassId): readonly ItemId[] {
  return STOCK[vendor].filter((id) => {
    const item = CATALOGUE[id];
    return item.kind !== 'gear' || !item.class || item.class === klass;
  });
}

/** The quest giver a vendor also is, if they are one: the smith, once the trainers' chains come. */
export function giverOf(vendor: VendorId): GiverId | null {
  return (GIVERS as readonly string[]).includes(vendor) ? (vendor as GiverId) : null;
}

/**
 * What walking up to a vendor unfolds: their talk board while they have a
 * quest to offer or to take back (a gold "!" or "?"), with "Trade" beside its
 * buttons; otherwise their wares, straight away.
 */
export function opensWith(giver: GiverShows | null): 'talk' | 'wares' {
  return giver?.marker === 'offered' || giver?.marker === 'ready' ? 'talk' : 'wares';
}

/** A button on a vendor's talk board: the giver's, and "Trade". */
export type VendorButton = Button | 'trade';

/** A vendor's talk board: the giver's line and pick, and their buttons with "Trade" beside them. */
export function vendorTalk(giver: GiverShows): { readonly line: string; readonly buttons: readonly VendorButton[]; readonly picks: readonly ItemId[] } {
  return { line: giver.line, buttons: [...giver.buttons, 'trade'], picks: giver.picks };
}
