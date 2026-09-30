import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { ModelBuilder } from '../../models/kit';
import { sharedModelMaterial } from '../../models/materials';
import { Card, FONT, roundRect } from '../card';
import { buildAtlas, CELLS, cellOf, EMPTY_CELL, ghostCellOf, modelOf } from './looks';
import {
  BAG_SIZE,
  type Bag,
  compare,
  GEAR_SLOTS,
  type GearSlot,
  type Item,
  RARITY_COLOUR,
  sameSlot,
  SLOT_NAME,
  type SlotRef,
  STAT_NAME,
} from './items';

// PROTOTYPE (The bag and the gear panel): the panel that comes round when you
// reach for the bag. Sixteen bag slots on the right, the seven gear slots on
// the left round a small figure of you wearing them, and an item's card above
// when you touch one. Placed once, about 45 cm in front of the chest and a
// little below the eyes; it turns to you again only once you've turned more
// than about 60° away, and it closes when you walk off. Throwaway.

export const PANEL = {
  /** Out in front of the eyes, and down from them (m). */
  out: 0.45,
  down: 0.28,
  /** Turn further than this from it (°) and it comes round in front again. */
  turn: 60,
  /** Walk further than this from it (m, on the floor) and it closes. */
  walkAway: 1.5,
};

/** A slot's width, and the distance between slots' centres (m). */
const S = 0.06;
const P = 0.072;
const ROWS = [1.5 * P, 0.5 * P, -0.5 * P, -1.5 * P];
const BAG_X = [0.076, 0.076 + P, 0.076 + 2 * P, 0.076 + 3 * P];
const GEAR_AT: Record<GearSlot, [number, number]> = {
  head: [-0.27, ROWS[0]],
  chest: [-0.27, ROWS[1]],
  legs: [-0.27, ROWS[2]],
  feet: [-0.27, ROWS[3]],
  hands: [-0.05, ROWS[0]],
  mainHand: [-0.05, ROWS[1]],
  offHand: [-0.05, ROWS[2]],
};
const FIGURE = { x: -0.16, bottom: -0.135, height: 0.27, halfWidth: 0.055 };
const BOARD = { left: -0.315, right: 0.335, bottom: -0.225, top: 0.16 };
/** Variant B's drop key, under the bag. */
export const DROP_KEY = { x: 0.184, y: -0.19, w: 0.28, h: 0.04 };
const FACE = 0.006; // the slots stand this far off the board

/** Every slot, in instance order: the 16 bag slots, then the gear slots. */
export const ALL_SLOTS: readonly SlotRef[] = [
  ...Array.from({ length: BAG_SIZE }, (_, i) => ({ kind: 'bag', i }) as const),
  ...GEAR_SLOTS.map((slot) => ({ kind: 'gear', slot }) as const),
];
const DROP_INSTANCE = ALL_SLOTS.length;

function slotXY(ref: SlotRef): [number, number] {
  return ref.kind === 'bag' ? [BAG_X[ref.i % 4], ROWS[Math.floor(ref.i / 4)]] : GEAR_AT[ref.slot];
}

/** How close counts as touching: round a slot's face, in front of it and behind it (m). */
export interface Reach {
  readonly margin: number;
  readonly front: number;
  readonly back: number;
}
/** A fist or a tip touching a slot. */
export const TOUCH: Reach = { margin: 0.006, front: 0.035, back: 0.07 };
/** Let go this near a slot's centre (m), off its square, and it still goes there. */
const NEAR = 0.05;
/** Where something carried is let go: anywhere near the panel's face. */
export const RELEASE: Reach = { margin: 0.006, front: 0.12, back: 0.1 };

const C = {
  empty: new Color(0x3a2a1a),
  hover: new Color(0xf0c060),
  selected: new Color(0xfff0a0),
  compare: new Color(0x40c0ff),
  fits: new Color(0x60ff60),
  refused: new Color(0xd03030),
  dropKey: new Color(0x7a2a1a),
};

const UP = new Vector3(0, 1, 0);
const _fwd = new Vector3();
const _to = new Vector3();
const _local = new Vector3();
const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _p = new Vector3();
const _c = new Color();

/** What the panel shows this frame, beyond the bag's contents. */
export interface PanelShows {
  /** The slot a fist, tip or hand is touching. */
  hover: SlotRef | null;
  /** Variant B's picked item. */
  selected: SlotRef | null;
  /** An item carried off its slot: the slot shows empty meanwhile. */
  lifted: SlotRef | null;
  /** Where the carried item would go if let go now, and whether it fits there. */
  target: { ref: SlotRef; fits: boolean } | null;
  /** The item whose card shows, if any. */
  card: Item | null;
  /** Variant B's drop key shows, lit when `dropLit`. */
  dropKey: boolean;
  dropLit: boolean;
}

export type Mode = 'icons' | 'models';

export class GearPanel {
  readonly root = new Group();
  private readonly frames: InstancedMesh;
  private readonly icons: Mesh<BufferGeometry, MeshBasicMaterial>;
  private readonly uv: BufferAttribute;
  private readonly models: Mesh[] = [];
  private readonly models3d = new Group();
  private readonly figure: Mesh;
  readonly card = new Card(0.26, 0.15, { ppm: 1400 });
  private readonly dropLabel = new Card(DROP_KEY.w, DROP_KEY.h, { ppm: 1400 });
  private drawn = -1;
  private drawnLifted: SlotRef | null = null;
  private dressed = -1;
  private open = false;
  mode: Mode = 'icons';

  constructor(private readonly bag: Bag) {
    this.root.name = 'gear-panel';
    this.root.visible = false;
    const board = new Mesh(
      new BoxGeometry(BOARD.right - BOARD.left, BOARD.top - BOARD.bottom, 0.012),
      new MeshBasicMaterial({ color: 0x1c140c, fog: false }),
    );
    board.position.set((BOARD.left + BOARD.right) / 2, (BOARD.top + BOARD.bottom) / 2, -0.006);
    this.root.add(board);

    // Every slot's frame, and the drop key: one draw.
    this.frames = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ fog: false }), ALL_SLOTS.length + 1);
    ALL_SLOTS.forEach((ref, i) => {
      const [x, y] = slotXY(ref);
      this.frames.setMatrixAt(i, _m.compose(_p.set(x, y, FACE / 2), _q.identity(), _s.set(S, S, FACE)));
      this.frames.setColorAt(i, C.empty);
    });
    this.frames.setMatrixAt(DROP_INSTANCE, _m.compose(_p.set(DROP_KEY.x, DROP_KEY.y, FACE / 2), _q.identity(), _s.set(DROP_KEY.w, DROP_KEY.h, FACE)));
    this.frames.setColorAt(DROP_INSTANCE, C.dropKey);
    this.frames.frustumCulled = false;
    this.root.add(this.frames);

    // Every slot's icon, from one atlas: one draw.
    const n = ALL_SLOTS.length;
    const pos = new Float32Array(n * 4 * 3);
    const index: number[] = [];
    const half = S * 0.4;
    ALL_SLOTS.forEach((ref, i) => {
      const [x, y] = slotXY(ref);
      const z = FACE + 0.001;
      pos.set([x - half, y - half, z, x + half, y - half, z, x + half, y + half, z, x - half, y + half, z], i * 12);
      index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(pos, 3));
    this.uv = new BufferAttribute(new Float32Array(n * 4 * 2), 2);
    geometry.setAttribute('uv', this.uv);
    geometry.setIndex(index);
    this.icons = new Mesh(geometry, new MeshBasicMaterial({ map: buildAtlas(), transparent: true, alphaTest: 0.05, fog: false }));
    this.icons.frustumCulled = false;
    this.root.add(this.icons);

    // Or a small model in each slot: one draw per item.
    for (const ref of ALL_SLOTS) {
      const [x, y] = slotXY(ref);
      const mesh = new Mesh(new BufferGeometry(), sharedModelMaterial());
      mesh.position.set(x, y, FACE + 0.025);
      mesh.scale.setScalar(S * 0.72);
      this.models.push(mesh);
      this.models3d.add(mesh);
    }
    this.models3d.visible = false;
    this.root.add(this.models3d);

    this.figure = new Mesh(new BufferGeometry(), sharedModelMaterial());
    this.figure.position.set(FIGURE.x, FIGURE.bottom, FACE + 0.02);
    this.figure.scale.setScalar(FIGURE.height / 1.8);
    this.root.add(this.figure);

    this.card.mesh.position.set(0, BOARD.top + 0.085, 0.01);
    this.card.mesh.visible = false;
    this.root.add(this.card.mesh);

    this.dropLabel.paint('drop', (c, w, h) => {
      c.fillStyle = '#f4ead0';
      c.font = `bold ${Math.round(h * 0.62)}px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('Drop', w / 2, h / 2 + 2);
    });
    this.dropLabel.mesh.position.set(DROP_KEY.x, DROP_KEY.y, FACE + 0.002);
    this.root.add(this.dropLabel.mesh);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Bring it round in front of a head at `head` looking along `gaze`. */
  place(head: Vector3, gaze: Vector3): void {
    _fwd.set(gaze.x, 0, gaze.z);
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
    _fwd.normalize();
    this.root.position.copy(head).addScaledVector(_fwd, PANEL.out).addScaledVector(UP, -PANEL.down);
    this.root.lookAt(head);
    this.root.updateMatrixWorld(true);
    this.open = true;
    this.root.visible = true;
  }

  close(): void {
    this.open = false;
    this.root.visible = false;
  }

  /**
   * Keep it where it was put, unless you've turned more than PANEL.turn away
   * (it comes round in front again: 'turned') or walked off ('walkedAway',
   * and it closes).
   */
  follow(head: Vector3, gaze: Vector3): 'turned' | 'walkedAway' | null {
    if (!this.open) return null;
    _to.subVectors(this.root.position, head);
    if (Math.hypot(_to.x, _to.z) > PANEL.walkAway) {
      this.close();
      return 'walkedAway';
    }
    _to.y = 0;
    _fwd.set(gaze.x, 0, gaze.z);
    if (_to.lengthSq() > 1e-6 && _fwd.lengthSq() > 1e-6 && (_fwd.angleTo(_to) * 180) / Math.PI > PANEL.turn) {
      this.place(head, gaze);
      return 'turned';
    }
    return null;
  }

  private toLocal(world: Vector3): Vector3 {
    return this.root.worldToLocal(_local.copy(world));
  }

  /** The slot `world` touches, if any: within `reach` of its face. */
  slotAt(world: Vector3, reach: Reach): SlotRef | null {
    if (!this.open) return null;
    const l = this.toLocal(world);
    if (l.z > FACE + reach.front || l.z < -reach.back) return null;
    for (const ref of ALL_SLOTS) {
      const [x, y] = slotXY(ref);
      if (Math.abs(l.x - x) < S / 2 + reach.margin && Math.abs(l.y - y) < S / 2 + reach.margin) return ref;
    }
    return null;
  }

  /** Is `world` over the figure of you? Letting an item go there wears it. */
  figureAt(world: Vector3, reach: Reach): boolean {
    if (!this.open) return false;
    const l = this.toLocal(world);
    return (
      l.z < FACE + reach.front &&
      l.z > -reach.back &&
      Math.abs(l.x - FIGURE.x) < FIGURE.halfWidth &&
      l.y > FIGURE.bottom &&
      l.y < FIGURE.bottom + FIGURE.height
    );
  }

  /**
   * Where letting `item` go at `world` puts it: the slot it's over, its own
   * gear slot when over the figure, or else the nearest slot within a few
   * centimetres, since a carried item is aimed by eye, not by the hand.
   */
  targetAt(world: Vector3, item: Item, reach: Reach): SlotRef | null {
    const slot = this.slotAt(world, reach);
    if (slot) return slot;
    if (item.slot && this.figureAt(world, reach)) return { kind: 'gear', slot: item.slot };
    const l = this.toLocal(world);
    if (l.z > FACE + reach.front || l.z < -reach.back) return null;
    let best: SlotRef | null = null;
    let bestD = NEAR;
    for (const ref of ALL_SLOTS) {
      const [x, y] = slotXY(ref);
      const d = Math.hypot(l.x - x, l.y - y);
      if (d < bestD) {
        best = ref;
        bestD = d;
      }
    }
    return best;
  }

  /** Is `world` over the panel (within its board, near its face)? Letting go anywhere else drops the item. */
  over(world: Vector3, reach: Reach): boolean {
    if (!this.open) return false;
    const l = this.toLocal(world);
    const m = 0.03;
    return (
      l.z < FACE + reach.front &&
      l.z > -reach.back &&
      l.x > BOARD.left - m &&
      l.x < BOARD.right + m &&
      l.y > BOARD.bottom - m &&
      l.y < BOARD.top + m
    );
  }

  /** Is `world` pressing variant B's drop key? */
  dropKeyAt(world: Vector3, reach: Reach): boolean {
    if (!this.open) return false;
    const l = this.toLocal(world);
    return (
      l.z < FACE + reach.front &&
      l.z > -reach.back &&
      Math.abs(l.x - DROP_KEY.x) < DROP_KEY.w / 2 + reach.margin &&
      Math.abs(l.y - DROP_KEY.y) < DROP_KEY.h / 2 + reach.margin
    );
  }

  /** The world point just off a slot's face. */
  slotWorld(ref: SlotRef, out: Vector3, off = 0.02): Vector3 {
    const [x, y] = slotXY(ref);
    return this.root.localToWorld(out.set(x, y, FACE + off));
  }

  /** The world point just off the drop key's face. */
  dropKeyWorld(out: Vector3, off = 0.02): Vector3 {
    return this.root.localToWorld(out.set(DROP_KEY.x, DROP_KEY.y, FACE + off));
  }

  /** The world point just off the figure's chest. */
  figureWorld(out: Vector3, off = 0.03): Vector3 {
    return this.root.localToWorld(out.set(FIGURE.x, FIGURE.bottom + FIGURE.height * 0.6, FACE + off));
  }

  setMode(mode: Mode): void {
    this.mode = mode;
    this.models3d.visible = mode === 'models';
    this.drawn = -1;
  }

  /** Draw this frame: frames lit for what's touched, picked and aimed at; icons or models; the card; the figure. */
  update(dt: number, shows: PanelShows): void {
    if (!this.open) return;
    if (this.drawn !== this.bag.version || !sameSlot(this.drawnLifted, shows.lifted)) {
      this.drawn = this.bag.version;
      this.drawnLifted = shows.lifted;
      this.fill(shows.lifted);
    }
    if (this.dressed !== this.bag.version) {
      this.dressed = this.bag.version;
      this.dress();
    }
    const compareSlot = shows.card?.slot ?? null;
    ALL_SLOTS.forEach((ref, i) => {
      const it = sameSlot(ref, shows.lifted) ? null : this.bag.at(ref);
      if (shows.target && sameSlot(ref, shows.target.ref)) _c.copy(shows.target.fits ? C.fits : C.refused);
      else if (sameSlot(ref, shows.selected)) _c.copy(C.selected);
      else if (sameSlot(ref, shows.hover)) _c.copy(C.hover);
      else if (ref.kind === 'gear' && ref.slot === compareSlot) _c.copy(C.compare);
      else if (it) _c.set(RARITY_COLOUR[it.rarity]).multiplyScalar(0.8);
      else _c.copy(C.empty);
      this.frames.setColorAt(i, _c);
    });
    this.frames.setColorAt(DROP_INSTANCE, shows.dropLit ? C.hover : C.dropKey);
    this.frames.instanceColor!.needsUpdate = true;
    this.frames.count = shows.dropKey ? ALL_SLOTS.length + 1 : ALL_SLOTS.length;
    this.dropLabel.mesh.visible = shows.dropKey;
    for (const m of this.models) m.rotation.y += dt * 0.8;
    this.showCard(shows.card, shows.hover ?? shows.selected);
  }

  /** Point each icon at its item's cell, and give each slot its model. */
  private fill(lifted: SlotRef | null): void {
    const uv = this.uv.array as Float32Array;
    ALL_SLOTS.forEach((ref, i) => {
      const it = sameSlot(ref, lifted) ? null : this.bag.at(ref);
      // With models showing, an item's slot keeps only the icon's dark ground.
      const cell = it ? (this.mode === 'models' ? EMPTY_CELL : cellOf(it)) : ref.kind === 'gear' ? ghostCellOf(ref.slot) : EMPTY_CELL;
      const u0 = (cell % CELLS) / CELLS;
      const u1 = u0 + 1 / CELLS;
      const v1 = 1 - Math.floor(cell / CELLS) / CELLS;
      const v0 = v1 - 1 / CELLS;
      uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
      const model = this.models[i];
      model.visible = !!it;
      if (it) model.geometry = modelOf(it);
    });
    this.uv.needsUpdate = true;
  }

  /** The figure of you, in what you wear. */
  private dress(): void {
    const g = this.bag.gear;
    const skin = 0xd8a880;
    const m = new ModelBuilder(3);
    m.box(0.2, 0.24, 0.22, { at: [0, 1.62, 0], color: skin });
    if (g.head) m.box(0.27, 0.18, 0.28, { at: [0, 1.72, 0], color: g.head.tint });
    const shirt = g.chest?.tint ?? 0xc8b890;
    m.box(0.42, 0.6, 0.24, { at: [0, 1.2, 0], color: shirt });
    for (const side of [-1, 1]) {
      m.box(0.12, 0.56, 0.12, { at: [side * 0.29, 1.2, 0], color: g.chest ? shirt : skin });
      m.box(0.13, 0.13, 0.13, { at: [side * 0.29, 0.86, 0], color: g.hands?.tint ?? skin });
      m.box(0.16, 0.8, 0.18, { at: [side * 0.11, 0.5, 0], color: g.legs?.tint ?? 0x6a5a48 });
      m.box(0.16, 0.12, 0.28, { at: [side * 0.11, 0.06, 0.04], color: g.feet?.tint ?? skin });
    }
    // The figure faces you, so its right hand is on your left.
    if (g.mainHand) {
      m.box(0.05, 0.8, 0.02, { at: [-0.29, 1.2, 0.12], color: 0xc8d0d8 });
      m.box(0.22, 0.05, 0.05, { at: [-0.29, 0.8, 0.12], color: g.mainHand.tint });
    }
    if (g.offHand) m.box(0.3, 0.44, 0.05, { at: [0.33, 1.05, 0.12], color: g.offHand.tint });
    this.figure.geometry.dispose();
    this.figure.geometry = m.build();
  }

  /** The card: name in its rarity's colour, what it is, and its numbers against what's worn in its slot. */
  private showCard(it: Item | null, near: SlotRef | null): void {
    this.card.mesh.visible = !!it;
    if (!it) return;
    const worn = it.slot ? this.bag.gear[it.slot] : null;
    const lines = compare(it, worn);
    const isWorn = worn === it;
    // Over the slot it's in, kept within the board.
    const x = near ? slotXY(near)[0] : 0;
    this.card.mesh.position.x = Math.max(BOARD.left + 0.13, Math.min(BOARD.right - 0.13, x));
    this.card.paint(`${it.id} ${worn?.id} ${this.bag.version}`, (c, w, h) => {
      c.fillStyle = 'rgba(12, 10, 16, 0.94)';
      roundRect(c, 0, 0, w, h, 18);
      c.fill();
      c.strokeStyle = RARITY_COLOUR[it.rarity];
      c.lineWidth = 4;
      roundRect(c, 3, 3, w - 6, h - 6, 16);
      c.stroke();
      c.textBaseline = 'top';
      c.fillStyle = RARITY_COLOUR[it.rarity];
      c.font = `bold 34px ${FONT}`;
      c.fillText(it.name, 20, 16, w - 40);
      c.fillStyle = '#a89c80';
      c.font = `24px ${FONT}`;
      const kind = it.slot ? SLOT_NAME[it.slot] : 'Junk: only to sell';
      c.fillText(isWorn ? `${kind} · worn` : kind, 20, 58);
      c.font = `28px ${FONT}`;
      lines.forEach((l, i) => {
        const y = 92 + i * 32;
        c.fillStyle = '#ece6d6';
        c.fillText(`${STAT_NAME[l.stat]} ${l.value}`, 20, y);
        if (!isWorn && l.diff) {
          c.fillStyle = l.diff > 0 ? '#40e040' : '#ff5040';
          c.fillText(`${l.diff > 0 ? '+' : '−'}${Math.abs(l.diff)}`, 250, y);
        }
      });
    });
  }
}
