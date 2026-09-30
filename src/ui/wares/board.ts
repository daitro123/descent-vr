import { type Camera, Color, Group, type Scene, Vector3, type WebGLRenderer } from 'three';
import { CONFIG } from '../../config';
import type { Inventory, InventoryEffect, Refusal, Stack, Where } from '../../inventory';
import { buyPrice, itemOf, type ItemId } from '../../items';
import { PEOPLE } from '../../models/people';
import type { Handedness } from '../../player/input';
import { type VendorId, waresFor } from '../../vendors';
import type { BesidePanel, BesideShows, Trade } from '../bag/bag';
import { cardText } from '../bag/cardLines';
import type { Reach } from '../bag/layout';
import { EMPTY_CELL, type IconAtlas, RARITY_COLOUR } from '../bag/looks';
import { cardKey, coinsText, paintCard, SlotMeshes } from '../bag/pieces';
import { Card, FONT, parchment, roundRect } from '../card';
import type { Probe } from '../talkBoard';
import { BOARD, CARD, FACE, isSold, overBoard, PRICE_UNDER, SELL_JUNK, sellJunkAt, SLOT, slotAt, SLOTS, slotXY, SOLD, TITLE, WARES, waresPlacement } from './layout';

// A vendor's wares board: the talk board's parchment with the vendor's name, a
// grid of what they sell with each price under its slot, and a Sold row of the
// last six things you sold along the bottom, to buy back at what they fetched
// until you leave the zone. It opens as a panel beside the bag's, as the
// stash's does (bag.ts, `BesidePanel`), but the bag's panel stands beside the
// vendor where Hale's board would, with the wares on its left, and its slots
// are traded rather than places in your things (`Trade`): carrying a ware into
// a bag slot buys it, and carrying something of yours onto the board sells
// it. What you can't afford sits dimmed, and the grip on it refuses. "Sell
// junk", painted along the top, is pressed like the talk board's buttons.
// About three draws an eye: the board (title, button and prices painted on
// it), every slot's frame, and every icon from the bag's atlas; one more for
// the card (.scratch/inventory/issues/06-vendors-and-the-stash.md, 14-vendors.md).

const C = {
  empty: new Color(0x3a2a1a),
  hover: new Color(0xf0c060),
  refused: new Color(0xd03030),
};
/** A ware you can't afford is drawn this dark. */
const DIM = 0.3;

/** A vendor, where they stand: their feet, and their head for which way you look. */
export interface VendorAt {
  readonly id: VendorId;
  readonly feet: Vector3;
  readonly head: Vector3;
}

const _local = new Vector3();
const _c = new Color();

export class WaresBoard implements BesidePanel, Trade {
  readonly root = new Group();
  readonly card = new Card(CARD.w, CARD.h, { ppm: 1400 });
  readonly board = new Card(BOARD.right - BOARD.left, BOARD.top - BOARD.bottom, { ppm: 1100 });
  readonly slots: SlotMeshes;
  /** Its slots are traded, not places in your things. */
  readonly trade: Trade = this;
  /** One page, with no tabs. */
  readonly page = 0;
  readonly pages = 1;
  /** The vendor whose wares these are. */
  vendor: VendorId | null = null;
  private wares: readonly ItemId[] = [];
  private open = false;
  /** It closed, or a talk ended: it stays shut until you've walked away and come back. */
  private needLeave = false;
  /** 0 folded to 1 unfolded. */
  private unfolded = 0;
  private dirty = true;
  /** What the icons were last filled with. */
  private filled = '';
  /** Seconds before "Sell junk" takes a press. */
  private arming = 0;
  /** Probes (by index) resting on "Sell junk", which must leave before they can press it. */
  private readonly onButton = new Set<number>();
  /** Seconds left of the button looking pushed. */
  private pushed = 0;

  constructor(
    private readonly inventory: Inventory,
    private readonly atlas: IconAtlas,
  ) {
    this.root.name = 'wares-board';
    this.root.visible = false;
    const at = waresPlacement();
    this.root.position.set(at.x, 0, at.z);
    this.root.rotation.y = at.yaw;
    this.board.mesh.position.set((BOARD.left + BOARD.right) / 2, (BOARD.top + BOARD.bottom) / 2, 0);
    this.slots = new SlotMeshes(
      Array.from({ length: SLOTS }, (_, i) => {
        const [x, y] = slotXY(i);
        return { x, y, counts: true };
      }),
      SLOT,
      atlas,
      true,
    );
    for (let i = 0; i < SLOTS; i++) this.slots.colour(i, C.empty);
    // Double-sided and see-through, each would draw twice (back faces, then front) without this.
    this.board.mesh.material.forceSinglePass = this.card.mesh.material.forceSinglePass = true;
    this.card.mesh.position.set(0, CARD.y, 0.01);
    this.card.mesh.visible = false;
    this.root.add(this.board.mesh, this.slots.frames, this.slots.icons, this.card.mesh);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Shut since it closed or a talk ended, until you've walked away and come back. */
  get held(): boolean {
    return this.needLeave;
  }

  /** Compile its shaders now: its first opening shouldn't stall a frame. */
  warm(renderer: WebGLRenderer, camera: Camera, scene: Scene): void {
    const { root, card } = this;
    root.visible = card.mesh.visible = true;
    renderer.compile(root, camera, scene);
    root.visible = this.open;
    card.mesh.visible = false;
  }

  /** Stock the board with `vendor`'s wares for a character of your class, to open next. */
  stock(vendor: VendorId): void {
    if (this.vendor !== vendor) this.dirty = true;
    this.vendor = vendor;
    this.wares = waresFor(vendor, this.inventory.wearing.class);
  }

  /** Open: it unfolds, and "Sell junk" arms. */
  show(): void {
    this.open = true;
    this.needLeave = false;
    this.root.visible = true;
    this.dirty = true;
    this.unfolded = 0;
    this.root.scale.y = 0.001;
    this.arming = CONFIG.vendors.arming;
    this.onButton.clear();
  }

  /** Close with the bag's panel: it stays shut until you've walked away and come back. */
  close(): void {
    this.open = false;
    this.root.visible = false;
    this.needLeave = true;
    this.card.mesh.visible = false;
  }

  /** Stay shut until you've walked away and come back: a talk just ended beside it. */
  hold(): void {
    this.needLeave = true;
  }

  /** You've walked away: it may open again when you come back. */
  walkedAway(): void {
    this.needLeave = false;
  }

  /** Your things changed: prices dim or light, and the Sold row fills again. */
  changed(): void {
    this.dirty = true;
  }

  setPage(): void {}

  /** Its slots are wares, not places in your things. */
  where(): null {
    return null;
  }

  spotAt(world: Vector3, reach: Reach): number | null {
    return this.open ? slotAt(this.toLocal(world), reach, (i) => this.stackAt(i) !== null) : null;
  }

  /** Letting go over one of its slots: it's that slot (the bag sells what's yours anywhere on the board). */
  targetAt(world: Vector3, reach: Reach): number | null {
    return this.spotAt(world, reach);
  }

  tabAt(): null {
    return null;
  }

  over(world: Vector3, reach: Reach): boolean {
    return this.open && overBoard(this.toLocal(world), reach);
  }

  // Trading (`Trade`).

  get name(): string {
    return this.vendor ? `the ${PEOPLE[this.vendor].label.toLowerCase()}'s wares` : 'the wares';
  }

  /** What's in slot `i`: a ware, one at a time (the stock never runs out), or something sold, as it was sold. */
  stackAt(i: number): Stack | null {
    if (isSold(i)) return this.inventory.sold[i - WARES] ?? null;
    const id = this.wares[i];
    return id ? { id, count: 1 } : null;
  }

  /** What slot `i` costs: the ware's price, or what it fetched. */
  priceAt(i: number): number {
    if (isSold(i)) return this.inventory.sold[i - WARES]?.price ?? 0;
    const item = itemOf(this.wares[i] ?? '');
    return item ? buyPrice(item) : 0;
  }

  canLift(i: number): Refusal | null {
    if (!this.stackAt(i)) return 'empty';
    return this.priceAt(i) > this.inventory.coins ? 'coins' : null;
  }

  checkTake(i: number, to: Where): Refusal | null {
    if (isSold(i)) return this.inventory.checkBuyBack(i - WARES, to);
    return this.inventory.checkBuy(this.wares[i] ?? '', 1, to);
  }

  take(i: number, to: Where): InventoryEffect[] {
    if (isSold(i)) return this.inventory.buyBack(i - WARES, to);
    return this.inventory.buy(this.wares[i] ?? '', 1, to);
  }

  takes(i: number): string {
    return isSold(i) ? 'bought back' : 'bought';
  }

  checkGive(from: Where): Refusal | null {
    return this.inventory.checkSell(from);
  }

  give(from: Where): InventoryEffect[] {
    return this.inventory.sell(from);
  }

  readonly gives = 'sold';

  /** The world point just off slot `i`'s face (a ware's, or the Sold row's from `WARES`). */
  slotWorld(i: number, out: Vector3, off = 0.02): Vector3 {
    const [x, y] = slotXY(i);
    return this.root.localToWorld(out.set(x, y, FACE + off));
  }

  /** The world point just off the "Sell junk" button. */
  sellJunkWorld(out: Vector3, off = 0.015): Vector3 {
    return this.root.localToWorld(out.set(SELL_JUNK.x, SELL_JUNK.y, off));
  }

  private toLocal(world: Vector3): Vector3 {
    return this.root.worldToLocal(_local.copy(world));
  }

  /**
   * One frame of "Sell junk": a probe arriving on it presses it, returning the
   * hand; one resting there must leave first, and nothing presses while it's arming.
   */
  press(dt: number, probes: readonly (Probe | null)[]): Handedness | null {
    if (!this.open) return null;
    this.arming = Math.max(0, this.arming - dt);
    this.pushed = Math.max(0, this.pushed - dt);
    let pressed: Probe | null = null;
    probes.forEach((probe, i) => {
      if (!probe || !sellJunkAt(this.toLocal(probe.at), CONFIG.vendors.button)) {
        this.onButton.delete(i);
        return;
      }
      if (this.onButton.has(i)) return;
      this.onButton.add(i);
      if (this.arming <= 0 && !pressed) pressed = probe;
    });
    if (!pressed) return null;
    this.arming = CONFIG.vendors.rearm;
    this.pushed = 0.35;
    return (pressed as Probe).hand;
  }

  /** Draw this frame: it unfolds, the slots' frames, icons and counts, the board and the card. */
  update(dt: number, shows: BesideShows): void {
    if (!this.open) return;
    this.unfolded = Math.min(1, this.unfolded + dt / CONFIG.talk.unfold);
    this.root.scale.y = Math.max(0.001, this.unfolded);
    this.fill(shows.lifted);
    for (let i = 0; i < SLOTS; i++) {
      const stack = i === shows.lifted ? null : this.stackAt(i);
      const item = stack && itemOf(stack.id);
      if (i === shows.hover) _c.copy(this.canLift(i) === 'coins' ? C.refused : C.hover);
      else if (item) _c.set(RARITY_COLOUR[item.rarity]).multiplyScalar(this.affordable(i) ? 0.8 : 0.8 * DIM);
      else _c.copy(C.empty);
      this.slots.colour(i, _c);
    }
    this.slots.coloured();
    this.paintBoard(shows.target ? shows.target.fits : null);
    this.showCard(shows.card, shows.cardOver);
  }

  private affordable(i: number): boolean {
    return this.priceAt(i) <= this.inventory.coins;
  }

  /** Point each icon at its item's cell and each count at its digits, dimming what you can't afford. */
  private fill(lifted: number | null): void {
    const key = `${this.inventory.coins}|${lifted}|${this.inventory.sold.map((s) => `${s.id}×${s.count}`).join(',')}|${this.wares.join(',')}`;
    if (!this.dirty && key === this.filled) return;
    this.dirty = false;
    this.filled = key;
    for (let i = 0; i < SLOTS; i++) {
      const stack = i === lifted ? null : this.stackAt(i);
      const item = stack && itemOf(stack.id);
      this.slots.icon(i, item ? this.atlas.cellOf(item) : EMPTY_CELL);
      this.slots.count(i, stack?.count ?? 0);
      this.slots.dim(i, stack && !this.affordable(i) ? DIM : 1);
    }
    this.slots.painted();
  }

  /**
   * The board: parchment, the vendor's name, "Sell junk", each price under its
   * slot, and the Sold row's label; lit round its edge while something of
   * yours is over it, green where it would sell (`drop`) and red where it can't.
   */
  private paintBoard(drop: boolean | null): void {
    const coins = this.inventory.coins;
    const prices = Array.from({ length: SLOTS }, (_, i) => (this.stackAt(i) ? this.priceAt(i) : 0));
    const pushed = this.pushed > 0;
    const key = `${this.vendor}|${coins}|${prices.join(',')}|${drop}|${pushed}`;
    this.board.paint(key, (c, w, h) => {
      const k = w / (BOARD.right - BOARD.left);
      const px = (x: number) => (x - BOARD.left) * k;
      const py = (y: number) => (BOARD.top - y) * k;
      parchment(c, w, h);
      if (drop !== null) {
        c.strokeStyle = drop ? '#60ff60' : '#d03030';
        c.lineWidth = 12;
        roundRect(c, 6, 6, w - 12, h - 12, 18);
        c.stroke();
      }
      c.textBaseline = 'middle';
      c.fillStyle = '#5a3212';
      c.font = `bold ${Math.round(0.03 * k)}px ${FONT}`;
      c.fillText(this.vendor ? PEOPLE[this.vendor].label : '', px(TITLE.x), py(TITLE.y));
      // "Sell junk", as a talk board's brown button.
      c.fillStyle = pushed ? '#f0c060' : '#5a4632';
      roundRect(c, px(SELL_JUNK.x - SELL_JUNK.w / 2), py(SELL_JUNK.y + SELL_JUNK.h / 2), SELL_JUNK.w * k, SELL_JUNK.h * k, 10);
      c.fill();
      c.fillStyle = pushed ? '#2a1c10' : '#f4ead0';
      c.font = `bold ${Math.round(0.019 * k)}px ${FONT}`;
      c.textAlign = 'center';
      c.fillText('Sell junk', px(SELL_JUNK.x), py(SELL_JUNK.y) + 1);
      // Each price under its slot, red when you can't afford it.
      c.font = `bold ${Math.round(0.014 * k)}px ${FONT}`;
      prices.forEach((price, i) => {
        if (!price) return;
        const [x, y] = slotXY(i);
        c.fillStyle = price > coins ? '#b02818' : '#6a4a1a';
        c.fillText(coinsText(price), px(x), py(y - PRICE_UNDER));
      });
      c.textAlign = 'left';
      c.fillStyle = '#5a3212';
      c.font = `bold ${Math.round(0.016 * k)}px ${FONT}`;
      c.fillText(this.inventory.sold.length ? 'Sold: buy back' : 'Sold', px(slotXY(WARES)[0] - SLOT / 2), py(SOLD.label));
    });
  }

  /** The card of what's touched or carried off the board: what it costs, in red when you can't afford it. */
  private showCard(stack: Stack | null, over: number | null): void {
    const { inventory } = this;
    const text = stack && over !== null && over >= 0 ? cardText(stack.id, stack.count, inventory.wearing, inventory.gear) : null;
    this.card.mesh.visible = !!text;
    if (!stack || !text || over === null) return;
    this.card.mesh.position.x = Math.max(BOARD.left + CARD.w / 2, Math.min(BOARD.right - CARD.w / 2, slotXY(over)[0]));
    const price = this.priceAt(over);
    const footer = {
      text: `${isSold(over) ? 'Buy back for' : 'Costs'} ${coinsText(price)}`,
      colour: price > inventory.coins ? '#ff5040' : '#e8b830',
    };
    paintCard(this.card, text, cardKey(stack, inventory.gear, inventory.wearing.level), footer);
  }
}
