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
import type { Inventory, Stack, Where } from '../../inventory';
import { itemOf, type ItemId, stackOf } from '../../items';
import { ModelBuilder } from '../../models/kit';
import { sharedModelMaterial } from '../../models/materials';
import { Card, FONT, roundRect } from '../card';
import { cardText } from './cardLines';
import {
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
}

export const nothingShown = (): PanelShows => ({ hover: null, lifted: null, target: null, card: null, cardOver: null, tab: null });

const C = {
  empty: new Color(0x3a2a1a),
  hover: new Color(0xf0c060),
  compare: new Color(0x40c0ff),
  fits: new Color(0x60ff60),
  refused: new Color(0xd03030),
};

/** A stack's count: two digits in the slot's lower right corner. */
const DIGIT = { size: 0.018, x: SLOT / 2 - 0.02, y: -SLOT / 2 + 0.011, gap: 0.011 };

const UP = new Vector3(0, 1, 0);
const _fwd = new Vector3();
const _to = new Vector3();
const _local = new Vector3();
const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _p = new Vector3();
const _c = new Color();

export class BagPanel {
  readonly root = new Group();
  readonly card = new Card(CARD.w, CARD.h, { ppm: 1400 });
  private readonly board = new Card(BOARD.right - BOARD.left, BOARD.top - BOARD.bottom, { ppm: 1100 });
  private readonly frames: InstancedMesh;
  private readonly icons: Mesh<BufferGeometry, MeshBasicMaterial>;
  private readonly uv: BufferAttribute;
  private readonly figure: Mesh;
  private open = false;
  /** Something in your things changed since the slots were last filled. */
  private dirty = true;
  private drawnLifted: Spot | null = null;
  private drawnPage: Page | null = null;
  page: Page = 'bag';

  constructor(
    private readonly inventory: Inventory,
    private readonly atlas: IconAtlas,
  ) {
    this.root.name = 'bag-panel';
    this.root.visible = false;
    this.board.mesh.position.set((BOARD.left + BOARD.right) / 2, (BOARD.top + BOARD.bottom) / 2, 0);
    this.root.add(this.board.mesh);

    // Every slot's frame: one draw.
    this.frames = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ fog: false }), SPOTS.length);
    SPOTS.forEach((spot, i) => {
      const [x, y] = spotXY(spot);
      this.frames.setMatrixAt(i, _m.compose(_p.set(x, y, FACE / 2), _q.identity(), _s.set(SLOT, SLOT, FACE)));
      this.frames.setColorAt(i, C.empty);
    });
    this.frames.frustumCulled = false;
    this.root.add(this.frames);

    // Every slot's icon, and two digits for each of the page's slots and the belt's, from one atlas: one draw.
    const counted = SPOTS.filter((s) => s.in !== 'gear');
    const quads = SPOTS.length + counted.length * 2;
    const pos = new Float32Array(quads * 4 * 3);
    const index: number[] = [];
    const quad = (q: number, x: number, y: number, half: number, z: number) => {
      pos.set([x - half, y - half, z, x + half, y - half, z, x + half, y + half, z, x - half, y + half, z], q * 12);
      index.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
    };
    SPOTS.forEach((spot, i) => {
      const [x, y] = spotXY(spot);
      quad(i, x, y, SLOT * 0.4, FACE + 0.001);
    });
    counted.forEach((spot, k) => {
      const [x, y] = spotXY(spot);
      for (let d = 0; d < 2; d++) quad(SPOTS.length + k * 2 + d, x + DIGIT.x - (1 - d) * DIGIT.gap, y + DIGIT.y, DIGIT.size / 2, FACE + 0.002);
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(pos, 3));
    this.uv = new BufferAttribute(new Float32Array(quads * 4 * 2), 2);
    geometry.setAttribute('uv', this.uv);
    geometry.setIndex(index);
    this.icons = new Mesh(geometry, new MeshBasicMaterial({ map: atlas.texture, transparent: true, alphaTest: 0.05, fog: false }));
    this.icons.frustumCulled = false;
    this.root.add(this.icons);

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

  close(): void {
    this.open = false;
    this.root.visible = false;
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
  }

  /** The place in your things a slot of the panel is: the talent page's grid is none. */
  where(spot: Spot): Where | null {
    if (spot.in === 'gear') return { in: 'gear', slot: spot.slot };
    if (spot.in === 'belt') return { in: 'belt', slot: spot.slot };
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

  /** The slot `world` touches, if any. */
  spotAt(world: Vector3, reach: Reach): Spot | null {
    return this.open ? spotAt(this.toLocal(world), reach, this.grid) : null;
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
   * slot when over the figure (a potion: the figure's belt), or else the
   * nearest slot within a few centimetres, since a carried item is aimed by
   * eye, not by the hand.
   */
  targetAt(world: Vector3, id: ItemId, reach: Reach & { near: number }): Spot | null {
    if (!this.open) return null;
    const l = this.toLocal(world);
    const spot = spotAt(l, reach, this.grid);
    if (spot) return spot;
    const item = itemOf(id);
    if (item?.kind === 'gear' && figureAt(l, reach)) return { in: 'gear', slot: item.slot };
    if (item?.kind === 'consumable' && figureAt(l, reach)) return { in: 'belt', slot: this.beltSlotFor(id) };
    return nearestSpot(l, reach, this.grid, reach.near);
  }

  /** The world point just off a slot's face. */
  slotWorld(spot: Spot, out: Vector3, off = 0.02): Vector3 {
    const [x, y] = spotXY(spot);
    return this.root.localToWorld(out.set(x, y, FACE + off));
  }

  /**
   * The belt slot a potion let go over the figure goes to: one holding the
   * same potion with room, else an empty one, else the right hip.
   */
  private beltSlotFor(id: ItemId): number {
    const belt = this.inventory.belt;
    const item = itemOf(id);
    const room = belt.findIndex((s) => s?.id === id && !!item && s.count < stackOf(item));
    if (room >= 0) return room;
    const empty = belt.findIndex((s) => !s);
    return empty >= 0 ? empty : belt.length - 1;
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
      this.frames.setColorAt(i, _c);
    });
    this.frames.instanceColor!.needsUpdate = true;
    this.frames.count = this.grid ? SPOTS.length : SPOTS.length - CONFIG.bag.slots;
    this.paintBoard(shows.tab);
    this.showCard(shows.card, shows.cardOver);
    void dt;
  }

  /** Point each icon at its item's cell (and each count at its digits), and dress the figure. */
  private fill(lifted: Spot | null): void {
    this.dirty = false;
    this.drawnLifted = lifted;
    this.drawnPage = this.page;
    const uv = this.uv.array as Float32Array;
    const set = (q: number, cell: number) => {
      const [u0, v0, u1, v1] = this.atlas.uv(cell);
      uv.set([u0, v0, u1, v0, u1, v1, u0, v1], q * 8);
    };
    let k = 0;
    SPOTS.forEach((spot, i) => {
      const stack = sameSpot(spot, lifted) ? null : this.stackAt(spot);
      const item = stack && itemOf(stack.id);
      const grid = spot.in === 'grid';
      set(i, item ? this.atlas.cellOf(item) : grid ? (this.grid ? EMPTY_CELL : BLANK_CELL) : this.atlas.ghostOf(spot.in === 'belt' ? 'belt' : spot.slot));
      if (spot.in === 'gear') return;
      const count = stack && stack.count > 1 ? stack.count : 0;
      const q = SPOTS.length + k++ * 2;
      set(q, count >= 10 ? this.atlas.digit(Math.floor(count / 10) % 10) : BLANK_CELL);
      set(q + 1, count ? this.atlas.digit(count % 10) : BLANK_CELL);
    });
    this.uv.needsUpdate = true;
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
    // The belt at its waist, with a flask at each hip that has one (its left hip on your right).
    m.box(0.44, 0.07, 0.26, { at: [0, 0.92, 0], color: 0x4a2e1c });
    this.inventory.belt.forEach((s, i) => {
      const potion = s && itemOf(s.id);
      if (potion) m.box(0.09, 0.14, 0.09, { at: [(i === 0 ? 1 : -1) * 0.17, 0.86, 0.15], color: lookOf(potion).tint });
    });
    this.figure.geometry.dispose();
    this.figure.geometry = m.build();
  }

  /** The board: its ground, the page tabs (yours lit), your coins, and what the talent page says. */
  private paintBoard(lit: Page | null): void {
    const coins = this.inventory.coins;
    const { page } = this;
    this.board.paint(`${page}|${lit}|${coins}`, (c, w, h) => {
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
    const text = stack && cardText(stack.id, stack.count, this.inventory.wearing, this.inventory.gear);
    this.card.mesh.visible = !!text;
    if (!text) return;
    const x = over ? spotXY(over)[0] : 0;
    this.card.mesh.position.x = Math.max(BOARD.left + CARD.w / 2, Math.min(BOARD.right - CARD.w / 2, x));
    const key = `${stack.id}|${stack.count}|${JSON.stringify(this.inventory.gear)}|${this.inventory.wearing.level}`;
    this.card.paint(key, (c, w, h) => {
      const colour = RARITY_COLOUR[text.rarity];
      c.fillStyle = 'rgba(12, 10, 16, 0.94)';
      roundRect(c, 0, 0, w, h, 18);
      c.fill();
      c.strokeStyle = colour;
      c.lineWidth = 4;
      roundRect(c, 3, 3, w - 6, h - 6, 16);
      c.stroke();
      c.textBaseline = 'top';
      c.fillStyle = colour;
      c.font = `bold 32px ${FONT}`;
      c.fillText(text.count > 1 ? `${text.name} ×${text.count}` : text.name, 20, 14, w - 40);
      c.font = `24px ${FONT}`;
      let y = 54;
      // What it is, and the class it's locked to (red if it isn't yours).
      c.fillStyle = '#a89c80';
      const kind = text.worn ? `${text.kind} · worn` : text.kind;
      c.fillText(kind, 20, y);
      if (text.lock) {
        c.fillStyle = text.lock.yours ? '#a89c80' : '#ff5040';
        c.textAlign = 'right';
        c.fillText(text.lock.name, w - 20, y);
        c.textAlign = 'left';
      }
      y += 30;
      if (text.level) {
        c.fillStyle = text.level.reached ? '#a89c80' : '#ff5040';
        c.fillText(`Item level ${text.level.value}`, 20, y);
        y += 32;
      }
      c.font = `26px ${FONT}`;
      for (const s of text.stats) {
        c.fillStyle = s.yours ? '#ece6d6' : '#6a6458';
        c.fillText(`${s.name} ${s.value}`, 20, y);
        if (s.diff) {
          c.fillStyle = s.diff > 0 ? '#40e040' : '#ff5040';
          c.fillText(`${s.diff > 0 ? '+' : '−'}${Math.abs(s.diff)}${s.name === 'Damage' ? '%' : ''}`, 270, y);
        }
        y += 30;
      }
      if (text.note) {
        c.fillStyle = '#ece6d6';
        c.fillText(text.note, 20, y, w - 40);
      }
      if (text.sells) {
        c.fillStyle = '#a89c80';
        c.font = `20px ${FONT}`;
        c.textAlign = 'right';
        c.fillText(`Sells for ${text.sells} ${text.sells === 1 ? 'coin' : 'coins'}`, w - 20, h - 32);
        c.textAlign = 'left';
      }
    });
  }
}
