import { BufferGeometry, type Camera, Color, Group, Mesh, type Scene, Vector3, type WebGLRenderer } from 'three';
import { CONFIG } from '../../config';
import type { Inventory, Stack, Where } from '../../inventory';
import { itemOf, type ItemId } from '../../items';
import { ModelBuilder } from '../../models/kit';
import { sharedModelMaterial } from '../../models/materials';
import { Card, FONT, roundRect } from '../card';
import { cardText } from './cardLines';
import {
  type BagSpot,
  BOARD,
  CARD,
  COINS,
  FACE,
  FIGURE,
  figureAt,
  nearestSpot,
  overBoard,
  type Page,
  PAGE_NAME,
  PAGES,
  type Reach,
  sameSpot,
  SLOT,
  type Spot,
  spotAt,
  SPOTS,
  spotXY,
  tabAt,
  TABS,
} from './layout';
import { BLANK_CELL, EMPTY_CELL, type IconAtlas, lookOf, RARITY_COLOUR } from './looks';
import { cardKey, paintCard, SlotMeshes } from './pieces';
import { buttonAt, buttonXY, pageKey, paintPage, type TalentActs, type TalentButton } from './talentPage';
import type { Shape } from '../../classes';

// The bag panel in the Adventure, promoted from the bag prototype's variant A
// (ui/bag-prototype/panel.ts): it comes round when you reach for the bag.
// Sixteen slots on the right (the bag's, or the quest page's), the seven gear
// slots on the left round a small figure of you wearing them, the page tabs
// along the top, your coins under the slots, and an item's card over it when
// you touch one. Placed once, 45 cm in front and a little below the eyes; it
// turns to you again only once you've turned more than 60° away, and it closes
// when you walk off. About four draws an eye: the board (tabs and coins painted
// on it), every slot's frame, every icon from one atlas, and the figure; one
// more for the card and one for a carried item (.scratch/inventory/spec.md,
// "The view in VR").

/** What the panel shows this frame, beyond what's in the slots. */
export interface PanelShows {
  /** The slot a fist or the tip is touching. */
  hover: Spot | null;
  /** An item carried off its slot: the slot shows empty meanwhile. */
  lifted: Spot | null;
  /** Where the carried item would go if let go now, and whether it may. */
  target: { spot: Spot; fits: boolean } | null;
  /** The stack whose card shows, if any, and the slot it's over. */
  card: Stack | null;
  cardOver: Spot | null;
  /** The tab a fist or the tip is on. */
  tab: Page | null;
  /** The talent page's button a fist or the tip is on. */
  button: TalentButton | null;
}

export const nothingShown = (): PanelShows => ({ hover: null, lifted: null, target: null, card: null, cardOver: null, tab: null, button: null });

const C = {
  empty: new Color(0x3a2a1a),
  hover: new Color(0xf0c060),
  compare: new Color(0x40c0ff),
  fits: new Color(0x60ff60),
  refused: new Color(0xd03030),
};

const UP = new Vector3(0, 1, 0);
const _fwd = new Vector3();
const _to = new Vector3();
const _local = new Vector3();
const _c = new Color();

export class BagPanel {
  readonly root = new Group();
  readonly card = new Card(CARD.w, CARD.h, { ppm: 1400 });
  private readonly board = new Card(BOARD.right - BOARD.left, BOARD.top - BOARD.bottom, { ppm: 1100 });
  private readonly slots: SlotMeshes;
  private readonly figure: Mesh<BufferGeometry>;
  private open = false;
  /** Something in your things changed since the slots were last filled. */
  private dirty = true;
  private drawnLifted: Spot | null = null;
  private drawnPage: Page | null = null;
  page: Page = 'bag';
  /** The shape pressed first on the talent page, waiting for a second to swap with. */
  picked: Shape | null = null;

  constructor(
    private readonly inventory: Inventory,
    private readonly atlas: IconAtlas,
    /** Your talents and gesture slots, for the talent page: without them it says there are none. */
    private readonly talents: TalentActs | null = null,
  ) {
    this.root.name = 'bag-panel';
    this.root.visible = false;
    this.board.mesh.position.set((BOARD.left + BOARD.right) / 2, (BOARD.top + BOARD.bottom) / 2, 0);
    this.root.add(this.board.mesh);

    // Every slot's frame in one draw, and its icon (and the page's slots' counts) from one atlas in another.
    this.slots = new SlotMeshes(
      SPOTS.map((spot) => {
        const [x, y] = spotXY(spot);
        return { x, y, counts: spot.in === 'grid' };
      }),
      SLOT,
      atlas,
    );
    SPOTS.forEach((_, i) => this.slots.colour(i, C.empty));
    this.root.add(this.slots.frames, this.slots.icons);

    this.figure = new Mesh(new BufferGeometry(), sharedModelMaterial());
    this.figure.position.set(FIGURE.x, FIGURE.bottom, FACE + 0.02);
    this.figure.scale.setScalar(FIGURE.height / 1.8);
    this.root.add(this.figure);

    // Double-sided and see-through, each would draw twice (back faces, then front) without this.
    this.board.mesh.material.forceSinglePass = this.card.mesh.material.forceSinglePass = true;
    this.card.mesh.position.set(0, CARD.y, 0.01);
    this.card.mesh.visible = false;
    this.root.add(this.card.mesh);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Compile its shaders now: its first opening shouldn't stall a frame. */
  warm(renderer: WebGLRenderer, camera: Camera, scene: Scene): void {
    const { root, card } = this;
    root.visible = card.mesh.visible = true;
    this.fill(null);
    renderer.compile(root, camera, scene);
    root.visible = this.open;
    card.mesh.visible = false;
  }

  /** Bring it round in front of a head at `head` looking along `gaze`. */
  place(head: Vector3, gaze: Vector3): void {
    const P = CONFIG.bag.panel;
    _fwd.set(gaze.x, 0, gaze.z);
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
    _fwd.normalize();
    this.root.position.copy(head).addScaledVector(_fwd, P.out).addScaledVector(UP, -P.down);
    this.root.lookAt(head);
    this.root.updateMatrixWorld(true);
    this.open = true;
    this.root.visible = true;
    this.dirty = true;
  }

  /** Put it at `at`, turned to a head at `head`: beside a vendor, with their wares on its left. */
  placeAt(at: Vector3, head: Vector3): void {
    this.root.position.copy(at);
    this.root.lookAt(head);
    this.root.updateMatrixWorld(true);
    this.open = true;
    this.root.visible = true;
    this.dirty = true;
  }

  close(): void {
    this.open = false;
    this.root.visible = false;
    this.picked = null;
  }

  /**
   * Keep it where it was put, unless you've turned more than the panel's turn
   * away (it comes round in front again: 'turned') or walked off
   * ('walkedAway', and it closes).
   */
  follow(head: Vector3, gaze: Vector3): 'turned' | 'walkedAway' | null {
    if (!this.open) return null;
    const P = CONFIG.bag.panel;
    _to.subVectors(this.root.position, head);
    if (Math.hypot(_to.x, _to.z) > P.walkAway) {
      this.close();
      return 'walkedAway';
    }
    _to.y = 0;
    _fwd.set(gaze.x, 0, gaze.z);
    if (_to.lengthSq() > 1e-6 && _fwd.lengthSq() > 1e-6 && (_fwd.angleTo(_to) * 180) / Math.PI > P.turn) {
      this.place(head, gaze);
      return 'turned';
    }
    return null;
  }

  /** Your things changed: fill the slots again. */
  changed(): void {
    this.dirty = true;
  }

  setPage(page: Page): void {
    this.page = page;
    this.picked = null;
  }

  /** Is the talent page showing, with talents to show? It takes the whole board. */
  private get talentPage(): TalentActs | null {
    return this.page === 'talents' ? this.talents : null;
  }

  /** The place in your things a slot of the panel is: the talent page's grid is none. */
  where(spot: Spot): Where | null {
    if (spot.in === 'beside') return null;
    if (spot.in === 'gear') return { in: 'gear', slot: spot.slot };
    if (this.page === 'bag') return { in: 'bag', slot: spot.i };
    if (this.page === 'quest') return { in: 'quest', slot: spot.i };
    return null;
  }

  /** What's in a slot of the panel. */
  stackAt(spot: Spot): Stack | null {
    const where = this.where(spot);
    return where ? this.inventory.at(where) : null;
  }

  private toLocal(world: Vector3): Vector3 {
    return this.root.worldToLocal(_local.copy(world));
  }

  private get grid(): boolean {
    return this.page !== 'talents';
  }

  /** The slot `world` touches, if any: none on the talent page. */
  spotAt(world: Vector3, reach: Reach): BagSpot | null {
    return this.open && !this.talentPage ? spotAt(this.toLocal(world), reach, this.grid) : null;
  }

  /** The talent page's button `world` touches, if any. */
  buttonAt(world: Vector3, reach: Reach): TalentButton | null {
    const talents = this.open ? this.talentPage : null;
    return talents ? buttonAt(this.toLocal(world), reach, talents.state.class) : null;
  }

  /** The world point just off a talent page button's face, or null for one the page doesn't have. */
  buttonWorld(button: TalentButton, out: Vector3, off = 0.02): Vector3 | null {
    const at = this.talents && buttonXY(button, this.talents.state.class);
    return at ? this.root.localToWorld(out.set(at[0], at[1], off)) : null;
  }

  /** The tab `world` touches, if any. */
  tabAt(world: Vector3, reach: Reach): Page | null {
    return this.open ? tabAt(this.toLocal(world), reach) : null;
  }

  /** Is `world` over the panel? */
  over(world: Vector3, reach: Reach): boolean {
    return this.open && overBoard(this.toLocal(world), reach);
  }

  /**
   * Where letting `id` go at `world` puts it: the slot it's over, its own gear
   * slot when over the figure, or else the nearest slot within a few
   * centimetres, since a carried item is aimed by eye, not by the hand.
   */
  targetAt(world: Vector3, id: ItemId, reach: Reach & { near: number }): BagSpot | null {
    if (!this.open || this.talentPage) return null;
    const l = this.toLocal(world);
    const spot = spotAt(l, reach, this.grid);
    if (spot) return spot;
    const item = itemOf(id);
    if (item?.kind === 'gear' && figureAt(l, reach)) return { in: 'gear', slot: item.slot };
    return nearestSpot(l, reach, this.grid, reach.near);
  }

  /** The world point just off a slot's face. */
  slotWorld(spot: BagSpot, out: Vector3, off = 0.02): Vector3 {
    const [x, y] = spotXY(spot);
    return this.root.localToWorld(out.set(x, y, FACE + off));
  }

  /** The world point just off the figure's chest. */
  figureWorld(out: Vector3, off = 0.03): Vector3 {
    return this.root.localToWorld(out.set(FIGURE.x, FIGURE.bottom + FIGURE.height * 0.6, FACE + off));
  }

  /** The world point just off a tab's face. */
  tabWorld(page: Page, out: Vector3, off = 0.02): Vector3 {
    return this.root.localToWorld(out.set(TABS.x[PAGES.indexOf(page)], TABS.y, off));
  }

  /** Draw this frame: frames lit for what's touched and aimed at, the icons, the figure, the board and the card. */
  update(dt: number, shows: PanelShows): void {
    if (!this.open) return;
    if (this.dirty || this.drawnPage !== this.page || !sameSpot(this.drawnLifted, shows.lifted)) this.fill(shows.lifted);
    const cardItem = shows.card ? itemOf(shows.card.id) : undefined;
    const compare = cardItem?.kind === 'gear' ? cardItem.slot : null;
    SPOTS.forEach((spot, i) => {
      const stack = sameSpot(spot, shows.lifted) ? null : this.stackAt(spot);
      const item = stack && itemOf(stack.id);
      if (shows.target && sameSpot(spot, shows.target.spot)) _c.copy(shows.target.fits ? C.fits : C.refused);
      else if (sameSpot(spot, shows.hover)) _c.copy(C.hover);
      else if (spot.in === 'gear' && spot.slot === compare) _c.copy(C.compare);
      else if (item) _c.set(RARITY_COLOUR[item.rarity]).multiplyScalar(0.8);
      else _c.copy(C.empty);
      this.slots.colour(i, _c);
    });
    this.slots.coloured();
    this.slots.shown = this.talentPage ? 0 : this.grid ? SPOTS.length : SPOTS.length - CONFIG.bag.slots;
    this.slots.icons.visible = this.figure.visible = !this.talentPage;
    this.paintBoard(shows.tab, shows.button);
    this.showCard(shows.card, shows.cardOver);
    void dt;
  }

  /** Point each icon at its item's cell (and each count at its digits), and dress the figure. */
  private fill(lifted: Spot | null): void {
    this.dirty = false;
    this.drawnLifted = lifted;
    this.drawnPage = this.page;
    SPOTS.forEach((spot, i) => {
      const stack = sameSpot(spot, lifted) ? null : this.stackAt(spot);
      const item = stack && itemOf(stack.id);
      const grid = spot.in === 'grid';
      this.slots.icon(i, item ? this.atlas.cellOf(item) : grid ? (this.grid ? EMPTY_CELL : BLANK_CELL) : this.atlas.ghostOf(spot.slot));
      this.slots.count(i, stack?.count ?? 0);
    });
    this.slots.painted();
    this.dress();
  }

  /** The figure of you, in what you wear. */
  private dress(): void {
    const tint = (slot: keyof Inventory['gear']): number | null => {
      const item = itemOf(this.inventory.gear[slot] ?? '');
      return item ? lookOf(item).tint : null;
    };
    const skin = 0xd8a880;
    const m = new ModelBuilder(3);
    m.box(0.2, 0.24, 0.22, { at: [0, 1.62, 0], color: skin });
    const head = tint('head');
    if (head !== null) m.box(0.27, 0.18, 0.28, { at: [0, 1.72, 0], color: head });
    const chest = tint('chest');
    const shirt = chest ?? 0xc8b890;
    m.box(0.42, 0.6, 0.24, { at: [0, 1.2, 0], color: shirt });
    for (const side of [-1, 1]) {
      m.box(0.12, 0.56, 0.12, { at: [side * 0.29, 1.2, 0], color: chest !== null ? shirt : skin });
      m.box(0.13, 0.13, 0.13, { at: [side * 0.29, 0.86, 0], color: tint('hands') ?? skin });
      m.box(0.16, 0.8, 0.18, { at: [side * 0.11, 0.5, 0], color: tint('legs') ?? 0x6a5a48 });
      m.box(0.16, 0.12, 0.28, { at: [side * 0.11, 0.06, 0.04], color: tint('feet') ?? skin });
    }
    // The figure faces you, so its right hand is on your left.
    const main = tint('mainHand');
    if (main !== null) {
      m.box(0.05, 0.8, 0.02, { at: [-0.29, 1.2, 0.12], color: 0xc8d0d8 });
      m.box(0.22, 0.05, 0.05, { at: [-0.29, 0.8, 0.12], color: main });
    }
    const off = tint('offHand');
    if (off !== null) m.box(0.3, 0.44, 0.05, { at: [0.33, 1.05, 0.12], color: off });
    this.figure.geometry.dispose();
    this.figure.geometry = m.build();
  }

  /** The board: its ground, the page tabs (yours lit), and your coins, or the talent page. */
  private paintBoard(lit: Page | null, button: TalentButton | null): void {
    const coins = this.inventory.coins;
    const { page } = this;
    const talents = this.talentPage;
    const shows = talents && { lit: button, picked: this.picked, fighting: talents.fighting() };
    const talentKey = talents && shows ? pageKey(talents.state, shows) : '';
    this.board.paint(`${page}|${lit}|${coins}|${talentKey}`, (c, w, h) => {
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
      PAGES.forEach((p, i) => {
        const x = px(TABS.x[i] - TABS.w / 2);
        const y = py(TABS.y + TABS.h / 2);
        c.fillStyle = p === page ? '#1c140c' : p === lit ? '#6a4a24' : '#3a2716';
        roundRect(c, x, y, TABS.w * k, TABS.h * k + (p === page ? 4 : 0), 10);
        c.fill();
        c.strokeStyle = p === lit ? '#f0c060' : '#5a4632';
        c.lineWidth = 3;
        c.stroke();
        c.fillStyle = p === page ? '#ffd23a' : '#d8ccb0';
        c.fillText(PAGE_NAME[p], px(TABS.x[i]), py(TABS.y) + 1);
      });
      if (talents && shows) {
        paintPage(c, px, py, k, talents.state, shows);
        return;
      }
      // Your coins, under the slots.
      c.font = `bold ${Math.round(0.024 * k)}px ${FONT}`;
      const text = `${coins} ${coins === 1 ? 'coin' : 'coins'}`;
      const tw = c.measureText(text).width;
      const r = 0.009 * k;
      const cx = px(COINS.x) - tw / 2 - r;
      c.fillStyle = '#e8b830';
      c.beginPath();
      c.arc(cx, py(COINS.y), r, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#8a6010';
      c.stroke();
      c.fillStyle = '#f0e0b0';
      c.fillText(text, px(COINS.x) + r, py(COINS.y) + 1);
      if (page === 'talents') {
        c.fillStyle = '#a89c80';
        c.font = `${Math.round(0.02 * k)}px ${FONT}`;
        c.fillText('No talents yet', px(COINS.x), py(0));
      } else if (page === 'quest' && !this.inventory.quest.length) {
        c.fillStyle = '#a89c80';
        c.font = `${Math.round(0.016 * k)}px ${FONT}`;
        c.fillText("A quest's things go here", px(COINS.x), py(-0.155));
      }
    });
  }

  /** The card: over the slot it's for, kept within the board. */
  private showCard(stack: Stack | null, over: Spot | null): void {
    const { inventory } = this;
    const text = stack && cardText(stack.id, stack.count, inventory.wearing, inventory.gear);
    this.card.mesh.visible = !!text;
    if (!text) return;
    const x = over && over.in !== 'beside' ? spotXY(over)[0] : 0;
    this.card.mesh.position.x = Math.max(BOARD.left + CARD.w / 2, Math.min(BOARD.right - CARD.w / 2, x));
    paintCard(this.card, text, cardKey(stack, inventory.gear, inventory.wearing.level));
  }
}
