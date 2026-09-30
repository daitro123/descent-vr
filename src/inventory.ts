import { CONFIG } from './config';
import {
  type Buff,
  type BuffKind,
  buyPrice,
  type ClassId,
  GEAR_SLOTS,
  type GearItem,
  type GearSlot,
  type ItemDef,
  type ItemId,
  isPotion,
  itemOf,
  sellPrice,
  stackOf,
  type Worn,
  wornBy,
} from './items';

// One character's things, with no DOM, three.js or XR in it: the bag (16
// slots and the quest page), the seven gear slots, the belt's two slots,
// coins, the stash and the chests opened. It answers "can this go there" and
// applies moves; each operation returns its effects (a changed slot, a changed
// number, a refusal and why) for the view to show, as the adventure state does
// (.scratch/inventory/spec.md, "The inventory state").

/** Some of one item in one slot. */
export interface Stack {
  readonly id: ItemId;
  readonly count: number;
}

/** A place an item can be: a slot of the bag, its quest page, the gear, the belt or the stash, or the ground. */
export type Where =
  | { readonly in: 'bag' | 'quest' | 'belt' | 'stash'; readonly slot: number }
  | { readonly in: 'gear'; readonly slot: GearSlot }
  | { readonly in: 'ground' };

/** Why an operation was refused: the view shows each as the red slot and the strong buzz. */
export type Refusal =
  /** A weapon or off hand of another class. */
  | 'class'
  /** Gear above your level. */
  | 'level'
  /** A slot that doesn't take that kind of item. */
  | 'slot'
  /** No room for it. */
  | 'full'
  /** Too few coins. */
  | 'coins'
  /** A quest item leaving the bag's quest page. */
  | 'quest'
  /** Nothing there. */
  | 'empty'
  /** The belt's potions are dimmed after a drink. */
  | 'cooldown';

/** What an operation did, for the view to show. */
export type InventoryEffect =
  /** What a slot holds now. */
  | { readonly kind: 'slot'; readonly where: Where; readonly stack: Stack | null }
  /** Your coins now. */
  | { readonly kind: 'coins'; readonly coins: number }
  | { readonly kind: 'refused'; readonly reason: Refusal; readonly where?: Where }
  /** Let go of away from the panel: it lies on the ground, to pick up again with `take`. */
  | { readonly kind: 'dropped'; readonly stack: Stack }
  /** Taken in but with no room for it: it stays where it lay. */
  | { readonly kind: 'left'; readonly stack: Stack }
  /** A potion drunk: healing this share of your maximum health, giving this much rage, giving back this share of your mana. */
  | { readonly kind: 'drank'; readonly id: ItemId; readonly heal: number; readonly rage?: number; readonly mana?: number }
  /** A buff on you (a whetstone rubbed along the blade, an elixir drunk), replacing any of its kind, for `seconds`. */
  | { readonly kind: 'buff'; readonly id: ItemId; readonly buff: BuffKind; readonly damage: number; readonly seconds: number }
  /** A buff run out. */
  | { readonly kind: 'buffEnded'; readonly buff: BuffKind }
  /** The belt dims for this long. */
  | { readonly kind: 'cooldown'; readonly seconds: number }
  /** The vendor's Sold row now, newest first. */
  | { readonly kind: 'sold'; readonly row: readonly Sold[] }
  /** A chest opened for good. */
  | { readonly kind: 'chest'; readonly chest: string };

/** Something sold, waiting to be bought back at what it fetched. */
export interface Sold extends Stack {
  /** Coins it fetched, and so what it costs to buy back. */
  readonly price: number;
}

/** One character's things, as the save keeps them. */
export interface InventorySave {
  readonly bag: readonly (Stack | null)[];
  readonly quest: readonly ItemId[];
  readonly gear: Readonly<Record<GearSlot, ItemId | null>>;
  readonly belt: readonly (Stack | null)[];
  readonly coins: number;
  readonly stash: readonly (Stack | null)[];
  /** The chests opened, by id. */
  readonly chests: readonly string[];
  /** Seconds left before the belt's potions can be drunk again. */
  readonly cooldown: number;
}

/** A buff on you now: what gave it, what it adds, and how long it has left. Not saved. */
export interface ActiveBuff {
  readonly kind: BuffKind;
  readonly id: ItemId;
  /** Your damage is this much more while it lasts: 0.05 for 5% more. */
  readonly damage: number;
  /** Seconds left. */
  readonly left: number;
}

/** Who wears the gear: their class decides the lock and the main attribute, and their level what they can wear. */
export interface Wearer {
  readonly class: ClassId;
  readonly level: number;
}

/** What a new character of each class wears, all white and item level 1, with three minor healing potions on the right hip. */
export const STARTING_KIT: Readonly<Record<ClassId, Partial<Record<GearSlot, ItemId>>>> = {
  warrior: { mainHand: 'plain-sword', offHand: 'round-shield', chest: 'worn-tunic', feet: 'worn-boots' },
  ranger: { mainHand: 'short-bow', offHand: 'quiver', chest: 'worn-tunic', feet: 'worn-boots' },
  mage: { mainHand: 'apprentice-wand', offHand: 'glass-focus', chest: 'worn-tunic', feet: 'worn-boots' },
};

/** The belt's slots: the left hip's, then the right's. */
export const RIGHT_HIP = 1;

/** A new character's things: the starting kit, potions on the belt, an empty bag and stash, and no coins. `gear` overrides the kit's. */
export function startingInventory(klass: ClassId, gear: Partial<Record<GearSlot, ItemId>> = {}): InventorySave {
  const kit = { ...STARTING_KIT[klass], ...gear };
  const belt: (Stack | null)[] = Array(CONFIG.belt.slots).fill(null);
  belt[RIGHT_HIP] = { id: 'minor-healing-potion', count: 3 };
  return {
    bag: Array(CONFIG.bag.slots).fill(null),
    quest: [],
    gear: Object.fromEntries(GEAR_SLOTS.map((s) => [s, kit[s] ?? null])) as Record<GearSlot, ItemId | null>,
    belt,
    coins: 0,
    stash: Array(CONFIG.bag.stash).fill(null),
    chests: [],
    cooldown: 0,
  };
}

/** A list of slots: bag, belt or stash. */
type Slots = (Stack | null)[];

const refuse = (reason: Refusal, where?: Where): InventoryEffect[] => [where ? { kind: 'refused', reason, where } : { kind: 'refused', reason }];

/** One character's things. */
export class Inventory {
  private readonly slots: Record<'bag' | 'belt' | 'stash', Slots>;
  private readonly questPage: ItemId[];
  private readonly worn: Record<GearSlot, ItemId | null>;
  private purse: number;
  private readonly opened: string[];
  private dim: number;
  private readonly soldRow: Sold[] = [];
  /** The buffs on you, one of each kind: they aren't saved, so a load starts with none. */
  private readonly on: ActiveBuff[] = [];

  /** A new character's things, or ones restored from a save. */
  constructor(
    private readonly wearer: Wearer,
    saved: InventorySave = startingInventory(wearer.class),
  ) {
    // A save is taken as best it fits: an item the catalogue no longer knows is
    // dropped, as is anything in a slot that can't hold it, and counts stay within a stack.
    const slots = (list: readonly (Stack | null)[], size: number, fits: (item: ItemDef) => boolean): Slots =>
      Array.from({ length: size }, (_, i) => {
        const s = list[i];
        const item = s ? itemOf(s.id) : undefined;
        if (!s || !item || !fits(item) || !(s.count >= 1)) return null;
        return { id: s.id, count: Math.min(Math.floor(s.count), stackOf(item)) };
      });
    const loose = (item: ItemDef) => item.kind !== 'quest';
    this.slots = {
      bag: slots(saved.bag, CONFIG.bag.slots, loose),
      belt: slots(saved.belt, CONFIG.belt.slots, onBelt),
      stash: slots(saved.stash, CONFIG.bag.stash, loose),
    };
    this.questPage = saved.quest.filter((id, i, all) => itemOf(id)?.kind === 'quest' && all.indexOf(id) === i);
    this.worn = Object.fromEntries(
      GEAR_SLOTS.map((slot) => {
        const id = saved.gear[slot];
        const item = id ? itemOf(id) : undefined;
        return [slot, item?.kind === 'gear' && item.slot === slot ? item.id : null];
      }),
    ) as Record<GearSlot, ItemId | null>;
    this.purse = Math.max(0, Math.floor(saved.coins));
    this.opened = [...new Set(saved.chests)];
    this.dim = Math.min(Math.max(saved.cooldown, 0), CONFIG.belt.cooldown);
  }

  /** Your things, for the save. */
  snapshot(): InventorySave {
    const copy = (list: Slots) => list.map((s) => (s ? { ...s } : null));
    return {
      bag: copy(this.slots.bag),
      quest: [...this.questPage],
      gear: { ...this.worn },
      belt: copy(this.slots.belt),
      coins: this.purse,
      stash: copy(this.slots.stash),
      chests: [...this.opened],
      cooldown: this.dim,
    };
  }

  get bag(): readonly (Stack | null)[] {
    return this.slots.bag;
  }

  /** The bag's quest page: quest items, taking no slot. */
  get quest(): readonly ItemId[] {
    return this.questPage;
  }

  get gear(): Readonly<Record<GearSlot, ItemId | null>> {
    return this.worn;
  }

  get belt(): readonly (Stack | null)[] {
    return this.slots.belt;
  }

  get stash(): readonly (Stack | null)[] {
    return this.slots.stash;
  }

  get coins(): number {
    return this.purse;
  }

  /** The last things sold, newest first, until you leave the zone. */
  get sold(): readonly Sold[] {
    return this.soldRow;
  }

  /** Seconds before the belt's potions can be drunk again. */
  get cooldown(): number {
    return this.dim;
  }

  /** The buffs on you now, one of each kind at most, in the order they were put on. */
  get buffs(): readonly ActiveBuff[] {
    return this.on;
  }

  /** How much more damage your buffs give: 0.15 for the elixir's 10% and the whetstone's 5% together. */
  get boost(): number {
    return this.on.reduce((n, b) => n + b.damage, 0);
  }

  /** The chests opened, by id. */
  get chests(): readonly string[] {
    return this.opened;
  }

  /** What your worn gear adds up to, for your class. */
  get numbers(): Worn {
    const items = GEAR_SLOTS.map((s) => itemOf(this.worn[s] ?? '')).filter((i): i is GearItem => i?.kind === 'gear');
    return wornBy(this.wearer.class, items);
  }

  /** What's at `where`: nothing on the ground, since what lies there is the world's. */
  at(where: Where): Stack | null {
    switch (where.in) {
      case 'ground':
        return null;
      case 'gear': {
        const id = this.worn[where.slot];
        return id ? { id, count: 1 } : null;
      }
      case 'quest': {
        const id = this.questPage[where.slot];
        return id ? { id, count: 1 } : null;
      }
      default:
        return this.slots[where.in][where.slot] ?? null;
    }
  }

  /**
   * Carry `count` (all, by default) of what's at `from` to `to`. Onto the same
   * item, it stacks as far as a stack goes; onto another, the two swap, so
   * wearing a piece puts what you wore into its old slot. Let go on the ground,
   * it's dropped. Quest items never leave their page.
   */
  move(from: Where, to: Where, count?: number): InventoryEffect[] {
    const no = this.check(from, to, count);
    if (no) return refuse(no, no === 'empty' ? from : to);
    const src = this.at(from)!;
    const n = Math.min(Math.max(1, Math.floor(count ?? src.count)), src.count);
    if (to.in === 'ground') {
      return [...this.remove(from, n), { kind: 'dropped', stack: { id: src.id, count: n } }];
    }
    if (same(from, to)) return [];
    const dst = this.at(to);
    if (!dst) return [...this.remove(from, n), ...this.put(to, { id: src.id, count: n })];
    if (dst.id === src.id) {
      const moved = Math.min(n, stackOf(itemOf(src.id)!) - dst.count);
      return [...this.remove(from, moved), ...this.put(to, { id: src.id, count: dst.count + moved })];
    }
    // Onto another item: the whole stack swaps with it.
    return [...this.put(to, src), ...this.put(from, dst)];
  }

  /**
   * Why `move(from, to, count)` would be refused, or null if it would go:
   * for the view to light a slot red under a carried item before it's let go.
   */
  check(from: Where, to: Where, count?: number): Refusal | null {
    if (from.in === 'quest') return 'quest';
    if (from.in === 'ground' || to.in === 'quest' || !this.exists(from) || !this.exists(to)) return 'slot';
    const src = this.at(from);
    if (!src) return 'empty';
    if (to.in === 'ground' || same(from, to)) return null;
    const item = itemOf(src.id)!;
    const no = this.refusal(to, item);
    if (no) return no;
    const dst = this.at(to);
    if (!dst) return null;
    if (dst.id === src.id) return dst.count < stackOf(item) ? null : 'full';
    // Onto another item: the whole stack swaps with it, if it may go back where this came from.
    const n = Math.min(Math.max(1, Math.floor(count ?? src.count)), src.count);
    if (n < src.count) return 'slot';
    return this.refusal(from, itemOf(dst.id)!);
  }

  /** Who wears the gear, for the card: their class and level. */
  get wearing(): Wearer {
    return this.wearer;
  }

  /**
   * Take loot or a reward in: coins always, quest items onto their page, and
   * the rest onto stacks of the same item in the bag, then into its empty
   * slots. Whatever doesn't fit is reported as left where it lay.
   */
  take(stacks: readonly Stack[], coins = 0): InventoryEffect[] {
    const effects: InventoryEffect[] = [];
    if (coins > 0) {
      this.purse += coins;
      effects.push({ kind: 'coins', coins: this.purse });
    }
    for (const stack of stacks) {
      const item = itemOf(stack.id);
      if (!item || stack.count < 1) continue;
      if (item.kind === 'quest') {
        if (this.questPage.includes(item.id)) continue;
        this.questPage.push(item.id);
        effects.push({ kind: 'slot', where: { in: 'quest', slot: this.questPage.length - 1 }, stack: { id: item.id, count: 1 } });
        continue;
      }
      const left = this.stow(stack.id, stack.count, effects);
      if (left > 0) effects.push({ kind: 'left', stack: { id: stack.id, count: left } });
    }
    return effects;
  }

  /**
   * Take `stack` in as a reward (a hand-in's pick), into bag slot `to` or
   * wherever it fits: refused, and left where it was offered, if there's no room.
   */
  receive(stack: Stack, to?: Where): InventoryEffect[] {
    const no = this.checkReceive(stack, to);
    if (no) return refuse(no, to);
    return this.stowAt(stack, to);
  }

  /** Why `receive(stack, to)` would be refused, or null if it would go. */
  checkReceive(stack: Stack, to?: Where): Refusal | null {
    const item = itemOf(stack.id);
    if (!item || item.kind === 'quest' || stack.count < 1) return 'slot';
    if (!to) return this.room(stack.id) < stack.count ? 'full' : null;
    if (to.in !== 'bag' || !this.exists(to)) return 'slot';
    const dst = this.at(to);
    return dst && (dst.id !== stack.id || dst.count + stack.count > stackOf(item)) ? 'full' : null;
  }

  /** Remove quest item `id` from the quest page, as a hand-in takes it. */
  giveUp(id: ItemId): InventoryEffect[] {
    const i = this.questPage.indexOf(id);
    if (i < 0) return [];
    this.questPage.splice(i, 1);
    return [{ kind: 'slot', where: { in: 'quest', slot: i }, stack: null }];
  }

  /** How many of `id` the bag holds. */
  count(id: ItemId): number {
    return this.slots.bag.reduce((n, s) => n + (s?.id === id ? s.count : 0), 0);
  }

  /**
   * Take `stacks` out of the bag and `coins` from your purse, all or nothing:
   * what a make at a station uses up, or a trainer's price. The last stacks in
   * the bag go first, so the first stay whole.
   */
  spend(stacks: readonly Stack[], coins = 0): InventoryEffect[] {
    if (coins > this.purse) return refuse('coins');
    const need = new Map<ItemId, number>();
    for (const s of stacks) need.set(s.id, (need.get(s.id) ?? 0) + s.count);
    if ([...need].some(([id, n]) => this.count(id) < n)) return refuse('empty');
    const effects: InventoryEffect[] = [];
    for (const stack of stacks) {
      let left = stack.count;
      for (let slot = this.slots.bag.length - 1; slot >= 0 && left > 0; slot--) {
        const s = this.slots.bag[slot];
        if (s?.id !== stack.id) continue;
        const n = Math.min(left, s.count);
        left -= n;
        effects.push(...this.remove({ in: 'bag', slot }, n));
      }
    }
    if (coins > 0) {
      this.purse -= coins;
      effects.push({ kind: 'coins', coins: this.purse });
    }
    return effects;
  }

  /** Buy `count` of `id` from a vendor, into bag slot `to` or wherever it fits. */
  buy(id: ItemId, count = 1, to?: Where): InventoryEffect[] {
    const item = itemOf(id);
    if (!item || item.kind === 'quest') return refuse('slot', to);
    return this.purchase({ id, count }, buyPrice(item) * count, to);
  }

  /** Why `buy(id, count, to)` would be refused, or null if it would go: for the view to light a slot under a carried ware. */
  checkBuy(id: ItemId, count = 1, to?: Where): Refusal | null {
    const item = itemOf(id);
    if (!item || item.kind === 'quest') return 'slot';
    return this.checkPurchase({ id, count }, buyPrice(item) * count, to);
  }

  /** Why `buyBack(index, to)` would be refused, or null if it would go. */
  checkBuyBack(index: number, to?: Where): Refusal | null {
    const sold = this.soldRow[index];
    return sold ? this.checkPurchase(sold, sold.price, to) : 'empty';
  }

  /** Why `sell(from)` would be refused, or null if it would go. */
  checkSell(from: Where): Refusal | null {
    if (from.in === 'quest') return 'quest';
    if (from.in === 'ground' || !this.exists(from)) return 'slot';
    return this.at(from) ? null : 'empty';
  }

  /** Buy back the Sold row's `index`th, at what it fetched. */
  buyBack(index: number, to?: Where): InventoryEffect[] {
    const sold = this.soldRow[index];
    if (!sold) return refuse('empty');
    const effects = this.purchase(sold, sold.price, to);
    if (effects.some((e) => e.kind === 'refused')) return effects;
    this.soldRow.splice(index, 1);
    return [...effects, { kind: 'sold', row: [...this.soldRow] }];
  }

  /** Sell `count` (all, by default) of what's at `from` to a vendor. Quest items can't be sold. */
  sell(from: Where, count?: number): InventoryEffect[] {
    const no = this.checkSell(from);
    if (no) return refuse(no, from);
    const src = this.at(from)!;
    const n = Math.min(Math.max(1, Math.floor(count ?? src.count)), src.count);
    const price = sellPrice(itemOf(src.id)!) * n;
    this.purse += price;
    this.soldRow.unshift({ id: src.id, count: n, price });
    this.soldRow.length = Math.min(this.soldRow.length, CONFIG.bag.buyback);
    return [...this.remove(from, n), { kind: 'coins', coins: this.purse }, { kind: 'sold', row: [...this.soldRow] }];
  }

  /** Sell every grey in the bag at once. */
  sellJunk(): InventoryEffect[] {
    return this.slots.bag.flatMap((s, slot) => (s && itemOf(s.id)?.kind === 'junk' ? this.sell({ in: 'bag', slot }) : []));
  }

  /** Leaving the zone: the Sold row is gone. */
  leaveZone(): InventoryEffect[] {
    if (!this.soldRow.length) return [];
    this.soldRow.length = 0;
    return [{ kind: 'sold', row: [] }];
  }

  /**
   * Drink one from belt slot `slot`: every potion on the belt dims for the
   * cooldown, and a slot drunk empty refills from the first stack of the
   * same potion in the bag.
   */
  drink(slot: number): InventoryEffect[] {
    return this.use({ in: 'belt', slot });
  }

  /**
   * Use one of what's at `from`, a bag or belt slot: drink a potion, drink
   * the elixir or rub the whetstone along your blade. A potion (the healing
   * potion, the rage draught, the mana potion) is on the shared cooldown and
   * starts it; a buff isn't, and replaces any buff of its kind, refused for a
   * class it isn't for. A belt slot used up refills from the same item's first
   * stack in the bag.
   */
  use(from: Where): InventoryEffect[] {
    if ((from.in !== 'bag' && from.in !== 'belt') || !this.exists(from)) return refuse('slot', from);
    const s = this.at(from);
    const item = s && itemOf(s.id);
    if (!s || item?.kind !== 'consumable') return refuse('empty', from);
    const effects: InventoryEffect[] = [];
    if (item.buff) {
      if (item.buff.for && !item.buff.for.includes(this.wearer.class)) return refuse('class', from);
      effects.push(this.putOn(s.id, item.buff), ...this.remove(from, 1));
    } else {
      if (isPotion(item) && this.dim > 0) return refuse('cooldown', from);
      this.dim = CONFIG.belt.cooldown;
      const drank: InventoryEffect = { kind: 'drank', id: s.id, heal: item.heal, ...(item.rage ? { rage: item.rage } : {}), ...(item.mana ? { mana: item.mana } : {}) };
      effects.push(drank, ...this.remove(from, 1), { kind: 'cooldown', seconds: this.dim });
    }
    if (from.in === 'belt' && s.count === 1) {
      const bagSlot = this.slots.bag.findIndex((b) => b?.id === s.id);
      if (bagSlot >= 0) effects.push(...this.move({ in: 'bag', slot: bagSlot }, from));
    }
    return effects;
  }

  /** Time passing: the belt's cooldown runs down, and so do your buffs, each reporting as it runs out. */
  tick(dt: number): InventoryEffect[] {
    this.dim = Math.max(0, this.dim - dt);
    if (!this.on.length) return [];
    const ended: InventoryEffect[] = [];
    for (let i = this.on.length - 1; i >= 0; i--) {
      const b = this.on[i];
      const left = b.left - dt;
      if (left > 0) this.on[i] = { ...b, left };
      else {
        this.on.splice(i, 1);
        ended.unshift({ kind: 'buffEnded', buff: b.kind });
      }
    }
    return ended;
  }

  /** Open chest `id` once, taking what's in it (nothing, for a chest whose contents come out on the ground). */
  openChest(id: string, stacks: readonly Stack[] = [], coins = 0): InventoryEffect[] {
    if (this.opened.includes(id)) return [];
    this.opened.push(id);
    return [{ kind: 'chest', chest: id }, ...this.take(stacks, coins)];
  }

  /** Is the chest with `id` open for good? */
  isOpened(id: string): boolean {
    return this.opened.includes(id);
  }

  /** Why `item` can't go at `where`, or null if it can. */
  private refusal(where: Where, item: ItemDef): Refusal | null {
    switch (where.in) {
      case 'gear':
        if (item.kind !== 'gear' || item.slot !== where.slot) return 'slot';
        if (item.class && item.class !== this.wearer.class) return 'class';
        if (item.level > this.wearer.level) return 'level';
        return null;
      case 'belt':
        return onBelt(item) ? null : 'slot';
      case 'quest':
        return item.kind === 'quest' ? null : 'slot';
      case 'ground':
        return item.kind === 'quest' ? 'quest' : null;
      default:
        return item.kind === 'quest' ? 'quest' : null;
    }
  }

  /** Put `buff` on you from `id`, for its whole time, in place of any of its kind. */
  private putOn(id: ItemId, buff: Buff): InventoryEffect {
    const i = this.on.findIndex((b) => b.kind === buff.kind);
    if (i >= 0) this.on.splice(i, 1);
    this.on.push({ kind: buff.kind, id, damage: buff.damage, left: buff.seconds });
    return { kind: 'buff', id, buff: buff.kind, damage: buff.damage, seconds: buff.seconds };
  }

  /** Is `where` one of the slots there are? */
  private exists(where: Where): boolean {
    switch (where.in) {
      case 'ground':
        return true;
      case 'gear':
        return GEAR_SLOTS.includes(where.slot);
      case 'quest':
        return where.slot >= 0 && where.slot < this.questPage.length;
      default:
        return Number.isInteger(where.slot) && where.slot >= 0 && where.slot < this.slots[where.in].length;
    }
  }

  /** Set what `where` holds. */
  private put(where: Where, stack: Stack | null): InventoryEffect[] {
    if (where.in === 'gear') this.worn[where.slot] = stack?.id ?? null;
    else if (where.in === 'bag' || where.in === 'belt' || where.in === 'stash') this.slots[where.in][where.slot] = stack;
    return [{ kind: 'slot', where, stack }];
  }

  /** Take `n` from what's at `where`. */
  private remove(where: Where, n: number): InventoryEffect[] {
    const s = this.at(where)!;
    return this.put(where, s.count > n ? { id: s.id, count: s.count - n } : null);
  }

  /** Room in the bag for how many of `id`. */
  private room(id: ItemId): number {
    const max = stackOf(itemOf(id)!);
    return this.slots.bag.reduce((room, s) => room + (!s ? max : s.id === id ? max - s.count : 0), 0);
  }

  /** Put `count` of `id` onto its stacks in the bag, then into empty slots; returns how many didn't fit. */
  private stow(id: ItemId, count: number, effects: InventoryEffect[]): number {
    const max = stackOf(itemOf(id)!);
    const bag = this.slots.bag;
    let left = count;
    for (const pass of ['stacks', 'empty'] as const) {
      for (let slot = 0; slot < bag.length && left > 0; slot++) {
        const s = bag[slot];
        if (pass === 'stacks' ? s?.id !== id || s.count >= max : s) continue;
        const has = s?.count ?? 0;
        const add = Math.min(left, max - has);
        left -= add;
        effects.push(...this.put({ in: 'bag', slot }, { id, count: has + add }));
      }
    }
    return left;
  }

  /** Pay `price` for `stack`, into bag slot `to` or wherever it fits. */
  private purchase(stack: Stack, price: number, to?: Where): InventoryEffect[] {
    const no = this.checkPurchase(stack, price, to);
    if (no) return refuse(no, to);
    const effects = this.stowAt(stack, to);
    this.purse -= price;
    return [...effects, { kind: 'coins', coins: this.purse }];
  }

  /** Why paying `price` for `stack` into bag slot `to` (or wherever it fits) would be refused, or null. */
  private checkPurchase(stack: Stack, price: number, to?: Where): Refusal | null {
    return price > this.purse ? 'coins' : this.checkReceive(stack, to);
  }

  /** Put `stack`, which has room, into bag slot `to` or wherever it fits. */
  private stowAt(stack: Stack, to?: Where): InventoryEffect[] {
    const effects: InventoryEffect[] = [];
    if (to) effects.push(...this.put(to, { id: stack.id, count: (this.at(to)?.count ?? 0) + stack.count }));
    else this.stow(stack.id, stack.count, effects);
    return effects;
  }
}

/** Can it go on the belt? Every consumable but one that says never (the whetstone). */
const onBelt = (item: ItemDef) => item.kind === 'consumable' && item.belt !== false;

const same = (a: Where, b: Where) => a.in === b.in && (a.in === 'ground' || (b.in !== 'ground' && a.slot === b.slot));
