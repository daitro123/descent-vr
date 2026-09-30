import { BoxGeometry, Group, Mesh, MeshBasicMaterial, type Object3D, Vector3 } from 'three';
import type { Button } from '../adventureState';
import { CONFIG } from '../config';
import type { Handedness } from '../player/input';
import { Card, FONT, parchment, wrap } from './card';

// Talking to Marshal Hale, or to a vendor who has a quest for you: the talk
// prototype's variant A (in history at merge 19ce545), built plainly since Tom
// plans to overhaul this UI once Oakvale is built. Walk up to them looking
// their way and a parchment board unfolds beside them, on your right and
// turned to you, with their name, their line and chunky buttons you press with
// a fist or the sword's tip. A vendor's board has "Trade" beside the rest.

/** A button on a talk board: a giver's, or a vendor's "Trade". */
export type TalkButton = Button | 'trade';

/** What a talk board shows: a line, and the buttons under it. */
export interface TalkShows {
  readonly line: string;
  readonly buttons: readonly TalkButton[];
}

const LABEL: Record<TalkButton, string> = { accept: 'Accept', notNow: 'Not now', handIn: 'Hand in', goodbye: 'Goodbye', trade: 'Trade' };
/** The buttons that move the chain on are green; the ones that only end the talk (or trade) are brown. */
const MOVES_ON: readonly TalkButton[] = ['accept', 'handIn'];
/** A button's size, in metres: two share a row, and three narrow to fit. */
const KEY = { w: 0.24, h: 0.09, d: 0.04 };
const NARROW = { w: 0.18, pitch: 0.2 };
const WOOD = 0x3a2716;
const LIT = 0xf0c060;

/** Something that can press a button: a fist or the sword's tip, where it is in the world, and the hand it's in. */
export interface Probe {
  readonly at: Vector3;
  readonly hand: Handedness;
}

/** A button pressed, and by which hand (to buzz it). */
export interface Press {
  readonly button: TalkButton;
  readonly hand: Handedness;
}

interface Key {
  readonly mesh: Mesh<BoxGeometry, MeshBasicMaterial>;
  readonly face: Card;
  readonly button: TalkButton;
  /** Its width, in metres. */
  readonly w: number;
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

/** A talk board: unfolds as you walk up, shows what they say, and takes your presses. */
export class TalkBoard {
  readonly root = new Group();
  private readonly text = new Card(0.62, 0.36);
  private readonly keys: Key[] = [];
  private open = false;
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
    this.text.paint(`${this.name}|${shows.line}`, (c, w, h) => {
      parchment(c, w, h);
      c.fillStyle = '#5a3212';
      c.font = `bold 44px ${FONT}`;
      c.textBaseline = 'top';
      c.fillText(this.name, 34, 28);
      c.fillStyle = '#2a1c10';
      c.font = `37px ${FONT}`;
      wrap(c, shows.line, w - 68).forEach((line, i) => c.fillText(line, 34, 90 + i * 44));
    });
    this.layout(shows.buttons);
    this.arming = Math.max(this.arming, CONFIG.talk.arming);
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

  private layout(buttons: readonly TalkButton[]): void {
    for (const key of this.keys) {
      this.root.remove(key.mesh);
      key.face.dispose();
      key.mesh.geometry.dispose();
      key.mesh.material.dispose();
    }
    this.keys.length = 0;
    const w = buttons.length > 2 ? NARROW.w : KEY.w;
    const pitch = buttons.length > 2 ? NARROW.pitch : 0.3;
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
      mesh.position.set(x, -0.15, KEY.d / 2);
      this.root.add(mesh);
      this.keys.push({ mesh, face, button, w, pushed: 0, blocked: new Set() });
    });
    this.root.updateMatrixWorld(true);
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
            pick = { button: key.button, hand: probe.hand };
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
    Math.abs(_local.y) < KEY.h / 2 + reach.side &&
    _local.z < KEY.d / 2 + reach.front &&
    _local.z > -reach.back
  );
}
