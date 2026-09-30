import { BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, type Object3D, Vector3 } from 'three';
import type { Button } from '../adventureState';
import { CONFIG } from '../config';
import { itemOf, type ItemId } from '../items';
import { sharedModelMaterial } from '../models/materials';
import type { Handedness } from '../player/input';
import type { CardText } from './bag/cardLines';
import type { Reach } from './bag/layout';
import { modelOf, RARITY_COLOUR } from './bag/looks';
import { paintCard } from './bag/pieces';
import { Card, FONT, parchment, wrap } from './card';

// Talking to Marshal Hale, or to a vendor who has a quest for you: the talk
// prototype's variant A (in history at merge 19ce545), built plainly since Tom
// plans to overhaul this UI once Oakvale is built. Walk up to them looking
// their way and a parchment board unfolds beside them, on your right and
// turned to you, with their name, their line and chunky buttons you press with
// a fist or the sword's tip. A vendor's board has "Trade" beside the rest. At
// a hand-in it lays out the pick instead of a button: each item in a frame of
// its rarity's colour with its card under it, to carry into your bag
// (.scratch/inventory/issues/12-quest-items-and-hand-in-picks.md). A trainer's
// has "Train", which turns the board into their list of lessons, a row each
// with its price and the proficiency it needs, grey while you can't buy it
// (.scratch/professions/issues/18-trainers-and-intro-quests.md).

/** A button on a talk board: a giver's, a vendor's "Trade", a trainer's "Train", and "Back" off the Train list. */
export type TalkButton = Button | 'trade' | 'train' | 'back';

/** One row of a trainer's Train list, as the board shows it. */
export interface TrainRow {
  /** The recipe a press on it buys. */
  readonly recipe: string;
  readonly name: string;
  /** Its price and what it needs, or why it's grey ("Known"). */
  readonly detail: string;
  /** Can it be bought now? Grey if not. */
  readonly lit: boolean;
}

/** What a talk board shows: a line, the buttons under it, and a hand-in's pick (empty but at one). */
export interface TalkShows {
  readonly line: string;
  readonly buttons: readonly TalkButton[];
  readonly picks: readonly ItemId[];
}

const LABEL: Record<TalkButton, string> = {
  accept: 'Accept',
  notNow: 'Not now',
  handIn: 'Hand in',
  goodbye: 'Goodbye',
  trade: 'Trade',
  train: 'Train',
  back: 'Back',
};
/** The buttons that move the chain on are green; the ones that only end the talk (or trade, train) are brown. */
const MOVES_ON: readonly TalkButton[] = ['accept', 'handIn'];
/** A button's size, in metres: two share a row, three narrow to fit, and four narrower still. */
const KEY = { w: 0.24, h: 0.09, d: 0.04 };
const NARROW = { w: 0.18, pitch: 0.2 };
const NARROWER = { w: 0.14, pitch: 0.152 };
/** The Train list's rows, in metres: one under another from `top`, `pitch` apart, over the parchment. */
const ROW = { w: 0.56, h: 0.072, top: 0.15, pitch: 0.085 };
const WOOD = 0x3a2716;
const LIT = 0xf0c060;
/** A pick's frame and its card under it, in metres: the card is the bag panel's card's size. */
const PICK = { frame: 0.11, d: 0.02, x: 0.15, y: -0.14, card: { w: 0.28, h: 0.2, y: -0.31 } };

/** Something that can press a button: a fist or the sword's tip, where it is in the world, and the hand it's in. */
export interface Probe {
  readonly at: Vector3;
  readonly hand: Handedness;
}

/** A button pressed, and by which hand (to buzz it): a row of the Train list is `lesson`, with its recipe. */
export type Press =
  | { readonly button: TalkButton; readonly hand: Handedness }
  | { readonly button: 'lesson'; readonly recipe: string; readonly hand: Handedness };

interface Key {
  readonly mesh: Mesh<BoxGeometry, MeshBasicMaterial>;
  readonly face: Card;
  readonly button: TalkButton | 'lesson';
  /** A Train list row's recipe. */
  readonly recipe?: string;
  /** Its width and height, in metres. */
  readonly w: number;
  readonly h: number;
  /** Seconds left of looking pushed in. */
  pushed: number;
  /** Probes (by index) resting inside it, which must leave before they can press it. */
  readonly blocked: Set<number>;
}

const UP = new Vector3(0, 1, 0);
const _out = new Vector3();
const _right = new Vector3();
const _to = new Vector3();
const _local = new Vector3();
const _lit = new Color(LIT);

/**
 * Put `root` beside someone standing at `feet`, on the right of a head at
 * `head` facing them, `out` m from them towards it and `side` m to its right,
 * its middle `height` m up, turned to the head.
 */
export function placeBeside(root: Object3D, head: Vector3, feet: Vector3, out: number, side: number, height: number): void {
  _out.set(head.x - feet.x, 0, head.z - feet.z).normalize(); // them → you
  _right.crossVectors(UP, _out);
  root.position.copy(feet).addScaledVector(_out, out).addScaledVector(_right, side);
  root.position.y = feet.y + height;
  root.lookAt(head);
}

/** One item of a hand-in's pick, laid out on the board. */
interface PickSlot {
  readonly id: ItemId;
  readonly frame: Mesh<BoxGeometry, MeshBasicMaterial>;
  readonly model: Mesh;
  readonly card: Card;
  readonly colour: Color;
}

/** A talk board: unfolds as you walk up, shows what they say and a hand-in's pick, and takes your presses. */
export class TalkBoard {
  readonly root = new Group();
  private readonly text = new Card(0.62, 0.36);
  private readonly keys: Key[] = [];
  private readonly pickSlots: PickSlot[] = [];
  /** What a pick's card says, for you: the Adventure's, from your class, level and gear. */
  describe: ((id: ItemId) => CardText | null) | null = null;
  private open = false;
  /** Showing the Train list, not the talk. */
  private training = false;
  /** The talk ended: it stays shut until you've walked away and come back. */
  private needLeave = false;
  /** Seconds before a button takes a press. */
  private arming = 0;
  /** 0 folded to 1 unfolded. */
  private unfolded = 0;

  constructor(
    /** Whose board it is, over their line: Marshal Hale's, or the vendor's it's shown for. */
    public name = 'Marshal Hale',
  ) {
    this.root.name = 'talk-board';
    this.root.add(this.text.mesh);
    this.text.mesh.position.y = 0.1;
    this.root.visible = false;
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Is it showing a trainer's Train list? */
  get isTraining(): boolean {
    return this.open && this.training;
  }

  /** The items of the pick laid out on it, while it's open. */
  get picks(): readonly ItemId[] {
    return this.open ? this.pickSlots.map((p) => p.id) : [];
  }

  /** The pick `at` (world) touches, by its index, if any: its frame, or the item standing in it. */
  pickAt(at: Vector3, reach: Reach): number | null {
    if (!this.open || this.unfolded < 1) return null;
    const half = PICK.frame / 2 + reach.margin;
    const i = this.pickSlots.findIndex((p) => {
      p.frame.worldToLocal(_local.copy(at));
      return Math.abs(_local.x) < half && Math.abs(_local.y) < half && _local.z < PICK.d / 2 + reach.front && _local.z > -reach.back;
    });
    return i < 0 ? null : i;
  }

  /** Light the pick a fist or the tip touches, and empty the frame of one carried off. */
  highlight(hover: number | null, lifted: number | null): void {
    this.pickSlots.forEach((p, i) => {
      p.frame.material.color.copy(i === hover ? _lit : p.colour);
      p.model.visible = i !== lifted;
    });
  }

  /** Your gear or level changed: each pick's card compares it again. */
  repaintPicks(): void {
    for (const p of this.pickSlots) this.paintPick(p);
  }

  /**
   * One frame. Unfold when you're close and looking at their head, showing
   * `shows`, if `approach` lets it; fold when you've walked off. Returns a
   * button pressed this frame. `probes` keep their order from frame to frame;
   * null for one not tracked.
   */
  update(
    dt: number,
    you: { readonly head: Vector3; readonly gaze: Vector3 },
    hale: { readonly feet: Vector3; readonly head: Vector3 },
    probes: readonly (Probe | null)[],
    shows: TalkShows,
    approach = true,
  ): Press | null {
    const T = CONFIG.talk;
    const d = Math.hypot(you.head.x - hale.feet.x, you.head.z - hale.feet.z);
    if (d > T.close) {
      this.open = false;
      this.needLeave = false;
    } else if (approach && !this.open && !this.needLeave && d < T.open) {
      const angle = (you.gaze.angleTo(_to.subVectors(hale.head, you.head)) * 180) / Math.PI;
      if (angle < T.facing) this.unfold(you.head, hale.feet, shows);
    }
    this.unfolded = Math.max(0, Math.min(1, this.unfolded + (this.open ? dt : -dt) / T.unfold));
    this.root.scale.y = this.unfolded;
    this.root.visible = this.unfolded > 0;
    if (!this.open) return null;
    this.arming = Math.max(0, this.arming - dt);
    return this.press(dt, probes);
  }

  /** Put new lines and buttons on it: the talk goes on (Hale offers the next quest after a hand-in). */
  show(shows: TalkShows): void {
    this.training = false;
    this.text.paint(`${this.name}|${shows.line}|${shows.picks.length > 0}`, (c, w, h) => {
      parchment(c, w, h);
      c.fillStyle = '#5a3212';
      c.font = `bold 44px ${FONT}`;
      c.textBaseline = 'top';
      c.fillText(this.name, 34, 28);
      c.fillStyle = '#2a1c10';
      c.font = `37px ${FONT}`;
      wrap(c, shows.line, w - 68).forEach((line, i) => c.fillText(line, 34, 90 + i * 44));
      if (!shows.picks.length) return;
      c.fillStyle = '#5a3212';
      c.font = `italic 32px ${FONT}`;
      c.fillText('Carry one into your bag.', 34, h - 64);
    });
    this.layout(shows.buttons);
    this.layPicks(shows.picks);
    this.arming = Math.max(this.arming, CONFIG.talk.arming);
  }

  /**
   * Show a trainer's Train list in the board's frame: their name and "Train"
   * over a row per lesson, each with its price and the proficiency it needs
   * (grey while you can't buy it), and "Back" under them.
   */
  showTrain(rows: readonly TrainRow[]): void {
    this.training = true;
    this.text.paint(`${this.name}|train`, (c, w, h) => {
      parchment(c, w, h);
      c.fillStyle = '#5a3212';
      c.font = `bold 44px ${FONT}`;
      c.textBaseline = 'top';
      c.fillText(`${this.name}: Train`, 34, 28);
    });
    this.layout(['back'], Math.min(-0.15, ROW.top - rows.length * ROW.pitch - 0.02));
    rows.forEach((row, i) => this.addRow(row, ROW.top - i * ROW.pitch));
    this.layPicks([]);
    this.arming = Math.max(this.arming, CONFIG.talk.arming);
  }

  /** One row of the Train list, `y` m up the board: a wide key with the lesson's name, and its price and needs. */
  private addRow(row: TrainRow, y: number): void {
    const face = new Card(ROW.w, ROW.h, { ppm: 1400 });
    face.paint(`${row.recipe}|${row.detail}|${row.lit}`, (c, w, h) => {
      c.fillStyle = row.lit ? '#2f6a2a' : '#4a4640';
      c.fillRect(0, 0, w, h);
      c.textBaseline = 'middle';
      c.fillStyle = row.lit ? '#e8f0d0' : '#a8a090';
      c.font = `30px ${FONT}`;
      c.textAlign = 'right';
      c.fillText(row.detail, w - 24, h / 2 + 2);
      c.fillStyle = row.lit ? '#f4ead0' : '#b8b0a0';
      c.font = `bold 36px ${FONT}`;
      c.textAlign = 'left';
      c.fillText(row.name, 24, h / 2 + 2);
    });
    const mesh = new Mesh(new BoxGeometry(ROW.w, ROW.h, KEY.d), new MeshBasicMaterial({ color: WOOD }));
    face.mesh.position.z = KEY.d / 2 + 0.001;
    mesh.add(face.mesh);
    mesh.position.set(0, y, KEY.d / 2);
    this.root.add(mesh);
    this.keys.push({ mesh, face, button: 'lesson', recipe: row.recipe, w: ROW.w, h: ROW.h, pushed: 0, blocked: new Set() });
    this.root.updateMatrixWorld(true);
  }

  /** The talk has ended: fold, and stay shut until you've walked away and come back. */
  fold(): void {
    this.open = false;
    this.needLeave = true;
  }

  private unfold(head: Vector3, feet: Vector3, shows: TalkShows): void {
    const { out, side, height } = CONFIG.talk.board;
    // Beside them, on your right as you face them, turned to you.
    placeBeside(this.root, head, feet, out, side, height);
    this.open = true;
    this.show(shows);
  }

  private layout(buttons: readonly TalkButton[], y = -0.15): void {
    for (const key of this.keys) {
      this.root.remove(key.mesh);
      key.face.dispose();
      key.mesh.geometry.dispose();
      key.mesh.material.dispose();
    }
    this.keys.length = 0;
    const size = buttons.length > 3 ? NARROWER : buttons.length > 2 ? NARROW : { w: KEY.w, pitch: 0.3 };
    const { w, pitch } = size;
    buttons.forEach((button, i) => {
      const face = new Card(w, KEY.h, { ppm: 1400 });
      face.paint(button, (c, w, h) => {
        c.fillStyle = MOVES_ON.includes(button) ? '#2f6a2a' : '#5a4632';
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#f4ead0';
        c.font = `bold 40px ${FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(LABEL[button], w / 2, h / 2 + 2);
      });
      const mesh = new Mesh(new BoxGeometry(w, KEY.h, KEY.d), new MeshBasicMaterial({ color: WOOD }));
      face.mesh.position.z = KEY.d / 2 + 0.001;
      mesh.add(face.mesh);
      const x = (i - (buttons.length - 1) / 2) * pitch;
      mesh.position.set(x, y, KEY.d / 2);
      this.root.add(mesh);
      this.keys.push({ mesh, face, button, w, h: KEY.h, pushed: 0, blocked: new Set() });
    });
    this.root.updateMatrixWorld(true);
  }

  /** Lay out a hand-in's pick where the buttons go: each item in its frame, its card under it. */
  private layPicks(picks: readonly ItemId[]): void {
    for (const p of this.pickSlots) {
      this.root.remove(p.frame, p.card.mesh);
      p.frame.geometry.dispose();
      p.frame.material.dispose();
      p.card.dispose();
    }
    this.pickSlots.length = 0;
    picks.forEach((id, i) => {
      const item = itemOf(id);
      if (!item) return;
      const x = picks.length === 1 ? 0 : (i === 0 ? -1 : 1) * PICK.x;
      const colour = new Color(RARITY_COLOUR[item.rarity]).multiplyScalar(0.8);
      const frame = new Mesh(new BoxGeometry(PICK.frame, PICK.frame, PICK.d), new MeshBasicMaterial({ color: colour, fog: false }));
      frame.position.set(x, PICK.y, PICK.d / 2);
      const model = new Mesh(modelOf(item), sharedModelMaterial());
      model.scale.setScalar(PICK.frame * 0.75);
      model.position.z = PICK.d / 2 + 0.03;
      frame.add(model);
      const card = new Card(PICK.card.w, PICK.card.h, { ppm: 1400 });
      card.mesh.material.forceSinglePass = true;
      card.mesh.position.set(x, PICK.card.y, 0.005);
      this.root.add(frame, card.mesh);
      const slot = { id, frame, model, card, colour };
      this.paintPick(slot);
      this.pickSlots.push(slot);
    });
    this.root.updateMatrixWorld(true);
  }

  private paintPick(p: PickSlot): void {
    const text = this.describe?.(p.id);
    p.card.mesh.visible = !!text;
    if (text) paintCard(p.card, text, JSON.stringify(text));
  }

  /**
   * A press is a probe arriving at a button. One already resting there (as
   * the board unfolds, or after a press) must leave it first, and nothing
   * presses while the board is arming.
   */
  private press(dt: number, probes: readonly (Probe | null)[]): Press | null {
    for (const key of this.keys) {
      key.pushed = Math.max(0, key.pushed - dt);
      key.mesh.position.z = KEY.d / 2 - 0.025 * Math.min(1, key.pushed * 4);
      key.mesh.material.color.setHex(key.pushed > 0 ? LIT : WOOD);
    }
    this.root.updateMatrixWorld(true);
    let pick: Press | null = null;
    for (const key of this.keys) {
      for (let i = 0; i < probes.length; i++) {
        const probe = probes[i];
        if (!probe || !inside(key, probe.at)) key.blocked.delete(i);
        else if (!key.blocked.has(i)) {
          if (this.arming <= 0 && !pick) {
            pick = key.button === 'lesson' ? { button: 'lesson', recipe: key.recipe!, hand: probe.hand } : { button: key.button, hand: probe.hand };
            key.pushed = 0.35;
          }
          key.blocked.add(i);
        }
      }
    }
    if (pick) this.arming = CONFIG.talk.rearm;
    return pick;
  }
}

/** Is `at` (world) touching the button's face? */
function inside(key: Key, at: Vector3): boolean {
  const reach = CONFIG.talk.reach;
  key.mesh.worldToLocal(_local.copy(at));
  return (
    Math.abs(_local.x) < key.w / 2 + reach.side &&
    Math.abs(_local.y) < key.h / 2 + reach.side &&
    _local.z < KEY.d / 2 + reach.front &&
    _local.z > -reach.back
  );
}
