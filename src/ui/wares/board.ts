import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  type Camera,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  type Scene,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { CONFIG } from '../../config';
import type { Inventory, InventoryEffect, Refusal, Stack, Where } from '../../inventory';
import { buyPrice, itemOf, type ItemId } from '../../items';
import { PEOPLE } from '../../models/people';
import type { Handedness } from '../../player/input';
import { type VendorId, waresFor } from '../../vendors';
import type { Beside, BesideShows } from '../bag/bag';
import { cardText } from '../bag/cardLines';
import { BLANK_CELL, EMPTY_CELL, type IconAtlas, RARITY_COLOUR } from '../bag/looks';
import { coinsText, paintItemCard } from '../bag/panel';
import { Card, FONT, parchment, roundRect } from '../card';
import { type Probe, placeBeside } from '../talkBoard';
import { BOARD, CARD, FACE, isSold, overBoard, PRICE_UNDER, SELL_JUNK, sellJunkAt, SLOT, slotAt, SLOTS, slotXY, SOLD, TITLE, WARES } from './layout';

// A vendor's wares board: the talk board's parchment with the vendor's name, a
// grid of what they sell with each price under its slot, and a Sold row of the
// last six things you sold along the bottom, to buy back at what they fetched
// until you leave the zone. It unfolds beside the vendor as Hale's board does,
// and the bag panel opens beside it on its own. Buying is carrying a ware into
// a bag slot and selling is carrying something of yours onto the board, both
// through the bag's touch and carry (bag.ts, `Beside`). What you can't afford
// sits dimmed, and the grip on it refuses. "Sell junk", painted along the top,
// is pressed like the talk board's buttons. About three draws an eye: the
// board (title, button and prices painted on it), every slot's frame, and every
// icon from the bag's atlas; one more for the card
// (.scratch/inventory/issues/06-vendors-and-the-stash.md, 14-vendors.md).

const C = {
  empty: new Color(0x3a2a1a),
  hover: new Color(0xf0c060),
  refused: new Color(0xd03030),
};

/** A stack's count: two digits in the slot's lower right corner. */
const DIGIT = { size: 0.018, x: SLOT / 2 - 0.02, y: -SLOT / 2 + 0.011, gap: 0.011 };
/** A ware you can't afford is drawn this dark. */
const DIM = 0.3;

/** What a frame of the board did. */
export type WaresHappened = { readonly kind: 'unfolded' | 'folded' } | { readonly kind: 'sellJunk'; readonly hand: Handedness };

/** A vendor, where they stand: their feet, and their head for which way you look. */
export interface VendorAt {
  readonly id: VendorId;
  readonly feet: Vector3;
  readonly head: Vector3;
}

const _to = new Vector3();
const _local = new Vector3();
const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _p = new Vector3();
const _c = new Color();

export class WaresBoard implements Beside {
  readonly root = new Group();
  readonly card = new Card(CARD.w, CARD.h, { ppm: 1400 });
  readonly board = new Card(BOARD.right - BOARD.left, BOARD.top - BOARD.bottom, { ppm: 1100 });
  private readonly frames: InstancedMesh;
  private readonly icons: Mesh<BufferGeometry, MeshBasicMaterial>;
  private readonly uv: BufferAttribute;
  private readonly tint: BufferAttribute;
  /** The vendor whose wares these are, while it's unfolded or folding. */
  vendor: VendorId | null = null;
  private wares: readonly ItemId[] = [];
  private open = false;
  /** It folded, or a talk ended: it stays shut until you've walked away and come back. */
  private needLeave = false;
  /** 0 folded to 1 unfolded. */
  private unfolded = 0;
  private dirty = true;
  /** What the icons were last filled with. */
  private filled = '';
  /** What the bag's hands show on it this frame. */
  private shows: BesideShows = { hover: null, lifted: null, card: null, drop: null };
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
    this.board.mesh.position.set((BOARD.left + BOARD.right) / 2, (BOARD.top + BOARD.bottom) / 2, 0);
    this.root.add(this.board.mesh);

    // Every slot's frame: one draw.
    this.frames = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ fog: false }), SLOTS);
    for (let i = 0; i < SLOTS; i++) {
      const [x, y] = slotXY(i);
      this.frames.setMatrixAt(i, _m.compose(_p.set(x, y, FACE / 2), _q.identity(), _s.set(SLOT, SLOT, FACE)));
      this.frames.setColorAt(i, C.empty);
    }
    this.frames.frustumCulled = false;
    this.root.add(this.frames);

    // Every slot's icon and two digits for its count, from the bag's atlas, each dimmed by its vertex colour: one draw.
    const quads = SLOTS * 3;
    const pos = new Float32Array(quads * 4 * 3);
    const index: number[] = [];
    const quad = (q: number, x: number, y: number, half: number, z: number) => {
      pos.set([x - half, y - half, z, x + half, y - half, z, x + half, y + half, z, x - half, y + half, z], q * 12);
      index.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
    };
    for (let i = 0; i < SLOTS; i++) {
      const [x, y] = slotXY(i);
      quad(i, x, y, SLOT * 0.4, FACE + 0.001);
      for (let d = 0; d < 2; d++) quad(SLOTS + i * 2 + d, x + DIGIT.x - (1 - d) * DIGIT.gap, y + DIGIT.y, DIGIT.size / 2, FACE + 0.002);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(pos, 3));
    this.uv = new BufferAttribute(new Float32Array(quads * 4 * 2), 2);
    geometry.setAttribute('uv', this.uv);
    this.tint = new BufferAttribute(new Float32Array(quads * 4 * 3).fill(1), 3);
    geometry.setAttribute('color', this.tint);
    geometry.setIndex(index);
    this.icons = new Mesh(geometry, new MeshBasicMaterial({ map: atlas.texture, transparent: true, alphaTest: 0.05, fog: false, vertexColors: true }));
    this.icons.frustumCulled = false;
    this.root.add(this.icons);

    this.board.mesh.material.forceSinglePass = this.card.mesh.material.forceSinglePass = true;
    this.card.mesh.position.set(0, CARD.y, 0.01);
    this.card.mesh.visible = false;
    this.root.add(this.card.mesh);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Compile its shaders now: its first unfolding shouldn't stall a frame. */
  warm(renderer: WebGLRenderer, camera: Camera, scene: Scene): void {
    const { root, card } = this;
    root.visible = card.mesh.visible = true;
    renderer.compile(root, camera, scene);
    root.visible = this.open;
    card.mesh.visible = false;
  }

  /** Your things changed: prices dim or light, and the Sold row fills again. */
  changed(): void {
    this.dirty = true;
  }

  /**
   * One frame. If `approach` lets it, unfold when you're close to `vendor` and
   * looking at their head; fold once you've walked off. Returns what happened:
   * it unfolded or folded, or "Sell junk" was pressed, and by which hand.
   */
  update(
    dt: number,
    you: { readonly head: Vector3; readonly gaze: Vector3 },
    vendor: VendorAt | null,
    approach: boolean,
    probes: readonly (Probe | null)[],
  ): WaresHappened | null {
    const T = CONFIG.talk;
    let happened: WaresHappened | null = null;
    const d = vendor ? Math.hypot(you.head.x - vendor.feet.x, you.head.z - vendor.feet.z) : Infinity;
    if (d > T.close || (this.open && vendor?.id !== this.vendor)) {
      if (this.open) happened = { kind: 'folded' };
      this.open = false;
      this.needLeave = false;
    } else if (vendor && approach && !this.open && !this.needLeave && d < T.open) {
      const angle = (you.gaze.angleTo(_to.subVectors(vendor.head, you.head)) * 180) / Math.PI;
      if (angle < T.facing) {
        this.unfold(you.head, vendor);
        happened = { kind: 'unfolded' };
      }
    }
    this.unfolded = Math.max(0, Math.min(1, this.unfolded + (this.open ? dt : -dt) / T.unfold));
    this.root.scale.y = this.unfolded;
    this.root.visible = this.unfolded > 0;
    if (!this.root.visible) return happened;
    this.draw();
    this.shows = { hover: null, lifted: null, card: null, drop: null };
    if (!this.open) return happened;
    return this.press(dt, probes) ?? happened;
  }

  /** Unfold now, as "Trade" on the vendor's talk board asks. */
  unfold(head: Vector3, vendor: VendorAt): void {
    const { out, side, height } = CONFIG.vendors.board;
    placeBeside(this.root, head, vendor.feet, out, side, height);
    this.root.updateMatrixWorld(true);
    if (this.vendor !== vendor.id) this.dirty = true;
    this.vendor = vendor.id;
    this.wares = waresFor(vendor.id, this.inventory.wearing.class);
    this.open = true;
    this.needLeave = false;
    this.arming = CONFIG.vendors.arming;
    this.onButton.clear();
  }

  /** Stay shut until you've walked away and come back: a talk just ended beside it. */
  hold(): void {
    this.open = false;
    this.needLeave = true;
  }

  /** Where the bag panel opens beside it: on its right, turned to you. */
  bagSpot(out: Vector3, panelLeft: number): Vector3 {
    return this.root.localToWorld(out.set(BOARD.right + CONFIG.vendors.bagGap - panelLeft, 0, 0));
  }

  // The bag's side of it (`Beside`).

  get name(): string {
    return this.vendor ? `the ${PEOPLE[this.vendor].label.toLowerCase()}'s wares` : 'the wares';
  }

  slotAt(world: Vector3): number | null {
    return this.open ? slotAt(this.toLocal(world), CONFIG.vendors.touch, (i) => this.stackAt(i) !== null) : null;
  }

  over(world: Vector3): boolean {
    return this.open && overBoard(this.toLocal(world), CONFIG.vendors.over);
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

  show(shows: BesideShows): void {
    this.shows = shows;
  }

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

  /** A probe arriving on "Sell junk" presses it; one resting there must leave first, and nothing presses while it's arming. */
  private press(dt: number, probes: readonly (Probe | null)[]): WaresHappened | null {
    this.arming = Math.max(0, this.arming - dt);
    this.pushed = Math.max(0, this.pushed - dt);
    this.root.updateMatrixWorld(true);
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
    return { kind: 'sellJunk', hand: (pressed as Probe).hand };
  }

  /** Draw this frame: the slots' frames, icons and counts, the board and the card. */
  private draw(): void {
    const { shows } = this;
    this.fill(shows.lifted);
    for (let i = 0; i < SLOTS; i++) {
      const stack = i === shows.lifted ? null : this.stackAt(i);
      const item = stack && itemOf(stack.id);
      if (i === shows.hover) _c.copy(this.canLift(i) === 'coins' ? C.refused : C.hover);
      else if (item) _c.set(RARITY_COLOUR[item.rarity]).multiplyScalar(this.affordable(i) ? 0.8 : 0.8 * DIM);
      else _c.copy(C.empty);
      this.frames.setColorAt(i, _c);
    }
    this.frames.instanceColor!.needsUpdate = true;
    this.paintBoard();
    this.showCard();
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
    const uv = this.uv.array as Float32Array;
    const tint = this.tint.array as Float32Array;
    const set = (q: number, cell: number, k: number) => {
      const [u0, v0, u1, v1] = this.atlas.uv(cell);
      uv.set([u0, v0, u1, v0, u1, v1, u0, v1], q * 8);
      tint.fill(k, q * 12, q * 12 + 12);
    };
    for (let i = 0; i < SLOTS; i++) {
      const stack = i === lifted ? null : this.stackAt(i);
      const item = stack && itemOf(stack.id);
      const k = stack && !this.affordable(i) ? DIM : 1;
      set(i, item ? this.atlas.cellOf(item) : EMPTY_CELL, k);
      const count = stack && stack.count > 1 ? stack.count : 0;
      set(SLOTS + i * 2, count >= 10 ? this.atlas.digit(Math.floor(count / 10) % 10) : BLANK_CELL, k);
      set(SLOTS + i * 2 + 1, count ? this.atlas.digit(count % 10) : BLANK_CELL, k);
    }
    this.uv.needsUpdate = this.tint.needsUpdate = true;
  }

  /** The board: parchment, the vendor's name, "Sell junk", each price under its slot, and the Sold row's label. */
  private paintBoard(): void {
    const { shows } = this;
    const coins = this.inventory.coins;
    const prices = Array.from({ length: SLOTS }, (_, i) => (this.stackAt(i) ? this.priceAt(i) : 0));
    const pushed = this.pushed > 0;
    const key = `${this.vendor}|${coins}|${prices.join(',')}|${shows.drop}|${pushed}`;
    this.board.paint(key, (c, w, h) => {
      const k = w / (BOARD.right - BOARD.left);
      const px = (x: number) => (x - BOARD.left) * k;
      const py = (y: number) => (BOARD.top - y) * k;
      parchment(c, w, h);
      // Something of yours over the board: it lights green where it would sell, red where it can't.
      if (shows.drop !== null) {
        c.strokeStyle = shows.drop ? '#60ff60' : '#d03030';
        c.lineWidth = 12;
        roundRect(c, 6, 6, w - 12, h - 12, 18);
        c.stroke();
      }
      c.textBaseline = 'middle';
      c.fillStyle = '#5a3212';
      c.font = `bold ${Math.round(0.03 * k)}px ${FONT}`;
      c.fillText(this.vendor ? PEOPLE[this.vendor].label : '', px(TITLE.x), py(TITLE.y));
      // "Sell junk", as a talk board's brown button.
      const bx = px(SELL_JUNK.x - SELL_JUNK.w / 2);
      const by = py(SELL_JUNK.y + SELL_JUNK.h / 2);
      c.fillStyle = pushed ? '#f0c060' : '#5a4632';
      roundRect(c, bx, by, SELL_JUNK.w * k, SELL_JUNK.h * k, 10);
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
  private showCard(): void {
    const { card } = this.shows;
    const text = card && cardText(card.stack.id, card.stack.count, this.inventory.wearing, this.inventory.gear);
    this.card.mesh.visible = !!text;
    if (!card || !text) return;
    const x = slotXY(card.i)[0];
    this.card.mesh.position.x = Math.max(BOARD.left + CARD.w / 2, Math.min(BOARD.right - CARD.w / 2, x));
    const price = this.priceAt(card.i);
    const footer = {
      text: `${isSold(card.i) ? 'Buy back for' : 'Costs'} ${coinsText(price)}`,
      colour: price > this.inventory.coins ? '#ff5040' : '#e8b830',
    };
    const key = `${card.stack.id}|${card.stack.count}|${JSON.stringify(this.inventory.gear)}|${this.inventory.wearing.level}`;
    paintItemCard(this.card, text, key, footer);
  }
}
