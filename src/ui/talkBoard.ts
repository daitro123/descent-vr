import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import type { Button, HaleShows } from '../adventureState';
import { CONFIG } from '../config';
import type { Handedness } from '../player/input';
import { Card, FONT, parchment, wrap } from './card';

// Talking to Marshal Hale: the talk prototype's variant A (in history at merge
// 19ce545), built plainly since Tom plans to overhaul this UI once Oakvale is
// built. Walk up to Hale looking their way and a parchment board unfolds
// beside them, on your right and turned to you, with their name, their line
// and chunky buttons you press with a fist or the sword's tip.

const LABEL: Record<Button, string> = { accept: 'Accept', notNow: 'Not now', handIn: 'Hand in', goodbye: 'Goodbye' };
/** The buttons that move the chain on are green; the ones that only end the talk are brown. */
const GO: readonly Button[] = ['accept', 'handIn'];
/** A button's size, in metres. */
const KEY = { w: 0.24, h: 0.09, d: 0.04 };
/** How far outside a button's face still counts as touching it (m): a fist is fat, a tip needn't be exact. */
const REACH = { side: 0.025, front: 0.03, back: 0.08 };
const WOOD = 0x3a2716;
const LIT = 0xf0c060;

/** Something that can press a button: a fist or the sword's tip, where it is in the world, and the hand it's in. */
export interface Probe {
  readonly at: Vector3;
  readonly hand: Handedness;
}

/** A button pressed, and by which hand (to buzz it). */
export interface Press {
  readonly button: Button;
  readonly hand: Handedness;
}

interface Key {
  readonly mesh: Mesh<BoxGeometry, MeshBasicMaterial>;
  readonly face: Card;
  readonly button: Button;
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

/** Hale's board: unfolds as you walk up, shows what they say, and takes your presses. */
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

  constructor() {
    this.root.name = 'talk-board';
    this.root.add(this.text.mesh);
    this.text.mesh.position.y = 0.1;
    this.root.visible = false;
  }

  get isOpen(): boolean {
    return this.open;
  }

  /**
   * One frame. Unfold when you're close and looking at Hale's head, showing
   * `shows`; fold when you've walked off. Returns a button pressed this frame.
   * `probes` keep their order from frame to frame; null for one not tracked.
   */
  update(
    dt: number,
    you: { readonly head: Vector3; readonly gaze: Vector3 },
    hale: { readonly feet: Vector3; readonly head: Vector3 },
    probes: readonly (Probe | null)[],
    shows: HaleShows,
  ): Press | null {
    const T = CONFIG.talk;
    const d = Math.hypot(you.head.x - hale.feet.x, you.head.z - hale.feet.z);
    if (d > T.close) {
      this.open = false;
      this.needLeave = false;
    } else if (!this.open && !this.needLeave && d < T.open) {
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
  show(shows: HaleShows): void {
    this.text.paint(shows.line, (c, w, h) => {
      parchment(c, w, h);
      c.fillStyle = '#5a3212';
      c.font = `bold 44px ${FONT}`;
      c.textBaseline = 'top';
      c.fillText('Marshal Hale', 34, 28);
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

  private unfold(head: Vector3, feet: Vector3, shows: HaleShows): void {
    const { out, side, height } = CONFIG.talk.board;
    // Beside Hale, on your right as you face them, turned to you.
    _out.set(head.x - feet.x, 0, head.z - feet.z).normalize(); // Hale → you
    _right.crossVectors(UP, _out);
    this.root.position.copy(feet).addScaledVector(_out, out).addScaledVector(_right, side);
    this.root.position.y = feet.y + height;
    this.root.lookAt(head);
    this.open = true;
    this.show(shows);
  }

  private layout(buttons: readonly Button[]): void {
    for (const key of this.keys) {
      this.root.remove(key.mesh);
      key.face.dispose();
      key.mesh.geometry.dispose();
      key.mesh.material.dispose();
    }
    this.keys.length = 0;
    buttons.forEach((button, i) => {
      const face = new Card(KEY.w, KEY.h, { ppm: 1400 });
      face.paint(button, (c, w, h) => {
        c.fillStyle = GO.includes(button) ? '#2f6a2a' : '#5a4632';
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#f4ead0';
        c.font = `bold 40px ${FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(LABEL[button], w / 2, h / 2 + 2);
      });
      const mesh = new Mesh(new BoxGeometry(KEY.w, KEY.h, KEY.d), new MeshBasicMaterial({ color: WOOD }));
      face.mesh.position.z = KEY.d / 2 + 0.001;
      mesh.add(face.mesh);
      const x = buttons.length === 1 ? 0 : (i === 0 ? -1 : 1) * 0.15;
      mesh.position.set(x, -0.15, KEY.d / 2);
      this.root.add(mesh);
      this.keys.push({ mesh, face, button, pushed: 0, blocked: new Set() });
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
  key.mesh.worldToLocal(_local.copy(at));
  return (
    Math.abs(_local.x) < KEY.w / 2 + REACH.side &&
    Math.abs(_local.y) < KEY.h / 2 + REACH.side &&
    _local.z < KEY.d / 2 + REACH.front &&
    _local.z > -REACH.back
  );
}
