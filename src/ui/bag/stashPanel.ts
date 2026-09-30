import { type Camera, Color, Group, type Scene, Vector3, type WebGLRenderer } from 'three';
import { CONFIG } from '../../config';
import type { Inventory, Stack, Where } from '../../inventory';
import { itemOf } from '../../items';
import { Card, FONT, roundRect } from '../card';
import type { BesidePanel, BesideShows } from './bag';
import { cardText } from './cardLines';
import { FACE, type Reach, SLOT } from './layout';
import { EMPTY_CELL, type IconAtlas, RARITY_COLOUR } from './looks';
import { cardKey, paintCard, SlotMeshes } from './pieces';
import {
  overStash,
  PER_PAGE,
  STASH_BOARD as BOARD,
  STASH_CAPTION,
  STASH_CARD as CARD,
  STASH_PAGES,
  STASH_TABS as TABS,
  stashNearest,
  stashPlacement,
  stashSpotAt,
  stashTabAt,
  stashWhere,
  stashXY,
} from './stashLayout';

// The stash panel: the stash's 32 slots in two pages of sixteen, opened with
// the bag's panel by touching the lid of the chest by the inn's hearth, and
// standing on its left, turned in towards you. Built from the bag panel's
// pieces: a board with the page tabs painted on it, every slot's frame in one
// draw and its icon and count from the bag's atlas in another, and an item's
// card over it while you touch one. It hangs from the bag panel, so it turns
// round in front of you with it and closes with it (.scratch/inventory/spec.md,
// "The stash panel").

const C = {
  empty: new Color(0x3a2a1a),
  hover: new Color(0xf0c060),
  fits: new Color(0x60ff60),
  refused: new Color(0xd03030),
};

const _local = new Vector3();
const _c = new Color();

export class StashPanel implements BesidePanel {
  readonly root = new Group();
  readonly card = new Card(CARD.w, CARD.h, { ppm: 1400 });
  private readonly board = new Card(BOARD.right - BOARD.left, BOARD.top - BOARD.bottom, { ppm: 1100 });
  private readonly slots: SlotMeshes;
  private open = false;
  /** Something in your things changed since the slots were last filled. */
  private dirty = true;
  private drawnLifted: number | null = null;
  private drawnPage = -1;
  page = 0;

  constructor(
    private readonly inventory: Inventory,
    private readonly atlas: IconAtlas,
  ) {
    this.root.name = 'stash-panel';
    this.root.visible = false;
    const at = stashPlacement();
    this.root.position.set(at.x, 0, at.z);
    this.root.rotation.y = at.yaw;
    this.board.mesh.position.set((BOARD.left + BOARD.right) / 2, (BOARD.top + BOARD.bottom) / 2, 0);
    this.slots = new SlotMeshes(
      Array.from({ length: PER_PAGE }, (_, i) => {
        const [x, y] = stashXY(i);
        return { x, y, counts: true };
      }),
      SLOT,
      atlas,
    );
    for (let i = 0; i < PER_PAGE; i++) this.slots.colour(i, C.empty);
    // Double-sided and see-through, each would draw twice (back faces, then front) without this.
    this.board.mesh.material.forceSinglePass = this.card.mesh.material.forceSinglePass = true;
    this.card.mesh.position.set(0, CARD.y, 0.01);
    this.card.mesh.visible = false;
    this.root.add(this.board.mesh, this.slots.frames, this.slots.icons, this.card.mesh);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Compile its shaders now: its first opening shouldn't stall a frame. */
  warm(renderer: WebGLRenderer, camera: Camera, scene: Scene): void {
    const { root, card } = this;
    root.visible = card.mesh.visible = true;
    this.fill(null);
    this.paintBoard(null);
    renderer.compile(root, camera, scene);
    root.visible = this.open;
    card.mesh.visible = false;
  }

  /** Open on its first page. */
  show(): void {
    this.open = true;
    this.root.visible = true;
    this.dirty = true;
    this.page = 0;
  }

  close(): void {
    this.open = false;
    this.root.visible = false;
  }

  /** Your things changed: fill the slots again. */
  changed(): void {
    this.dirty = true;
  }

  setPage(page: number): void {
    this.page = Math.max(0, Math.min(STASH_PAGES - 1, page));
  }

  get pages(): number {
    return STASH_PAGES;
  }

  /** The place in your things slot `i` of the page showing is. */
  where(i: number): Where {
    return stashWhere(this.page, i);
  }

  private toLocal(world: Vector3): Vector3 {
    return this.root.worldToLocal(_local.copy(world));
  }

  spotAt(world: Vector3, reach: Reach): number | null {
    return this.open ? stashSpotAt(this.toLocal(world), reach) : null;
  }

  /** The slot `world` is over, or else the nearest within a few centimetres: a carried item is aimed by eye. */
  targetAt(world: Vector3, reach: Reach & { near: number }): number | null {
    if (!this.open) return null;
    const l = this.toLocal(world);
    return stashSpotAt(l, reach) ?? stashNearest(l, reach, reach.near);
  }

  tabAt(world: Vector3, reach: Reach): number | null {
    return this.open ? stashTabAt(this.toLocal(world), reach) : null;
  }

  over(world: Vector3, reach: Reach): boolean {
    return this.open && overStash(this.toLocal(world), reach);
  }

  /** The world point just off slot `i`'s face. */
  slotWorld(i: number, out: Vector3, off = 0.02): Vector3 {
    const [x, y] = stashXY(i);
    return this.root.localToWorld(out.set(x, y, FACE + off));
  }

  /** The world point just off page `page`'s tab. */
  tabWorld(page: number, out: Vector3, off = 0.02): Vector3 {
    return this.root.localToWorld(out.set(TABS.x[page], TABS.y, off));
  }

  /** Draw this frame: frames lit for what's touched and aimed at, the icons, the board and the card. */
  update(dt: number, shows: BesideShows): void {
    if (!this.open) return;
    if (this.dirty || this.drawnPage !== this.page || this.drawnLifted !== shows.lifted) this.fill(shows.lifted);
    for (let i = 0; i < PER_PAGE; i++) {
      const stack = i === shows.lifted ? null : this.inventory.at(this.where(i));
      const item = stack && itemOf(stack.id);
      if (shows.target?.i === i) _c.copy(shows.target.fits ? C.fits : C.refused);
      else if (shows.hover === i) _c.copy(C.hover);
      else if (item) _c.set(RARITY_COLOUR[item.rarity]).multiplyScalar(0.8);
      else _c.copy(C.empty);
      this.slots.colour(i, _c);
    }
    this.slots.coloured();
    this.paintBoard(shows.tab);
    this.showCard(shows.card, shows.cardOver);
    void dt;
  }

  /** Point each icon at its item's cell, and each count at its digits. */
  private fill(lifted: number | null): void {
    this.dirty = false;
    this.drawnLifted = lifted;
    this.drawnPage = this.page;
    for (let i = 0; i < PER_PAGE; i++) {
      const stack = i === lifted ? null : this.inventory.at(this.where(i));
      const item = stack && itemOf(stack.id);
      this.slots.icon(i, item ? this.atlas.cellOf(item) : EMPTY_CELL);
      this.slots.count(i, stack?.count ?? 0);
    }
    this.slots.painted();
  }

  /** The board: its ground, the page tabs (the one showing lit), and the stash's name and how full it is. */
  private paintBoard(lit: number | null): void {
    const used = this.inventory.stash.filter(Boolean).length;
    const { page } = this;
    this.board.paint(`${page}|${lit}|${used}`, (c, w, h) => {
      const k = w / (BOARD.right - BOARD.left);
      const px = (x: number) => (x - BOARD.left) * k;
      const py = (y: number) => (BOARD.top - y) * k;
      const tabBottom = py(TABS.y - TABS.h / 2);
      c.fillStyle = '#1c140c';
      roundRect(c, 0, tabBottom, w, h - tabBottom, 14);
      c.fill();
      c.font = `bold ${Math.round(TABS.h * k * 0.5)}px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      TABS.x.forEach((tx, p) => {
        const x = px(tx - TABS.w / 2);
        const y = py(TABS.y + TABS.h / 2);
        c.fillStyle = p === page ? '#1c140c' : p === lit ? '#6a4a24' : '#3a2716';
        roundRect(c, x, y, TABS.w * k, TABS.h * k + (p === page ? 4 : 0), 10);
        c.fill();
        c.strokeStyle = p === lit ? '#f0c060' : '#5a4632';
        c.lineWidth = 3;
        c.stroke();
        c.fillStyle = p === page ? '#ffd23a' : '#d8ccb0';
        c.fillText(`Page ${p + 1}`, px(tx), py(TABS.y) + 1);
      });
      c.font = `bold ${Math.round(0.022 * k)}px ${FONT}`;
      c.fillStyle = '#f0e0b0';
      c.fillText('Stash', px(STASH_CAPTION.x), py(STASH_CAPTION.y) + 1);
      c.font = `${Math.round(0.016 * k)}px ${FONT}`;
      c.fillStyle = '#a89c80';
      c.fillText(`${used} of ${CONFIG.bag.stash} slots`, px(STASH_CAPTION.x), py(STASH_CAPTION.y - 0.022) + 1);
    });
  }

  /** The card: over the slot it's for, kept within the board. */
  private showCard(stack: Stack | null, over: number | null): void {
    const { inventory } = this;
    const text = stack && cardText(stack.id, stack.count, inventory.wearing, inventory.gear);
    this.card.mesh.visible = !!text;
    if (!text) return;
    const x = over !== null ? stashXY(over)[0] : 0;
    this.card.mesh.position.x = Math.max(BOARD.left + CARD.w / 2, Math.min(BOARD.right - CARD.w / 2, x));
    paintCard(this.card, text, cardKey(stack, inventory.gear, inventory.wearing.level));
  }
}
