import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import type { RecipeId } from '../professions';
import { Card, FONT, parchment } from '../../ui/card';

// The recipe board beside the anvil, in the talk board's frame: a key per
// recipe you know, with what it takes and what you have, greyed when you're
// short. Press one with the hammer's face, the tongs' jaws or a fist and it
// starts. Promoted from ?proto=anvil (prototypes/anvil/board.ts).

const KEY = { w: 0.46, h: 0.075, d: 0.035, gap: 0.09 };
const TITLE = { w: 0.46, h: 0.07 };
/** How far round a key a probe counts as pressing it (m): to its sides, in front and behind. */
const REACH = { side: 0.02, front: 0.05, back: 0.06 };
/** Seconds after a press before another counts. */
const ARMING = 0.4;
const _local = new Vector3();

/** One recipe on the board. */
export interface BoardRow {
  readonly id: RecipeId;
  readonly name: string;
  /** What it takes and what you have, in words. */
  readonly line: string;
  /** You can make it now: known, proficient, and the bag holds what it takes. */
  readonly ready: boolean;
}

interface Key {
  readonly id: RecipeId;
  readonly mesh: Mesh<BoxGeometry, MeshBasicMaterial>;
  readonly face: Card;
  pushed: number;
  /** The probes resting on it: each must leave before it presses again. */
  readonly resting: Set<number>;
}

export class RecipeBoard {
  readonly root = new Group();
  private readonly title = new Card(TITLE.w, TITLE.h);
  private keys: Key[] = [];
  private arming = 0;

  constructor() {
    this.root.name = 'anvil-board';
    this.root.add(this.title.mesh);
  }

  /** The recipes' ids, top to bottom. */
  get ids(): readonly RecipeId[] {
    return this.keys.map((k) => k.id);
  }

  /** A key's world position, for scripted checks. */
  keyAt(id: RecipeId, out: Vector3): Vector3 | null {
    const key = this.keys.find((k) => k.id === id);
    return key ? key.mesh.getWorldPosition(out) : null;
  }

  /** Draw the title and a key per row, greyed where you can't make it; keys come and go with the recipes you know. */
  paint(title: string, rows: readonly BoardRow[]): void {
    if (rows.map((r) => r.id).join() !== this.ids.join()) this.rebuild(rows);
    this.title.paint(title, (c, w, h) => {
      parchment(c, w, h, 6);
      c.fillStyle = '#5a3212';
      c.font = `bold 44px ${FONT}`;
      c.textBaseline = 'middle';
      c.fillText(title, 24, h / 2 + 2, w - 48);
    });
    rows.forEach((row, i) => {
      const key = this.keys[i];
      key.face.paint(`${row.name}|${row.line}|${row.ready}`, (c, w, h) => {
        c.fillStyle = row.ready ? '#2f6a2a' : '#4a4038';
        c.fillRect(0, 0, w, h);
        c.fillStyle = row.ready ? '#f4ead0' : '#a89c88';
        c.textBaseline = 'middle';
        c.font = `bold 34px ${FONT}`;
        c.fillText(row.name, 20, h * 0.34, w - 40);
        c.font = `24px ${FONT}`;
        c.fillText(row.line, 20, h * 0.74, w - 40);
      });
    });
  }

  /** The recipe pressed this frame, if any: a probe arriving at its key. One resting there must leave first. */
  update(dt: number, probes: readonly (Vector3 | null)[]): RecipeId | null {
    this.arming = Math.max(0, this.arming - dt);
    for (const key of this.keys) {
      key.pushed = Math.max(0, key.pushed - dt);
      key.mesh.position.z = -0.02 * Math.min(1, key.pushed * 4);
      key.mesh.material.color.setHex(key.pushed > 0 ? 0xf0c060 : 0x3a2716);
    }
    if (!this.root.visible) return null;
    this.root.updateMatrixWorld(true);
    let pick: RecipeId | null = null;
    for (const key of this.keys) {
      probes.forEach((at, i) => {
        if (!at || !inside(key, at)) key.resting.delete(i);
        else if (!key.resting.has(i)) {
          if (this.arming <= 0 && !pick) {
            pick = key.id;
            key.pushed = 0.35;
          }
          key.resting.add(i);
        }
      });
    }
    if (pick) this.arming = ARMING;
    return pick;
  }

  private rebuild(rows: readonly BoardRow[]): void {
    for (const key of this.keys) {
      key.mesh.removeFromParent();
      key.mesh.geometry.dispose();
      key.mesh.material.dispose();
      key.face.dispose();
    }
    // The title over the keys, the whole board centred on the root.
    const height = TITLE.h + rows.length * KEY.gap;
    this.title.mesh.position.y = height / 2 - TITLE.h / 2;
    this.keys = rows.map((row, i) => {
      const face = new Card(KEY.w, KEY.h, { ppm: 1400 });
      const mesh = new Mesh(new BoxGeometry(KEY.w, KEY.h, KEY.d), new MeshBasicMaterial({ color: 0x3a2716 }));
      face.mesh.position.z = KEY.d / 2 + 0.001;
      mesh.add(face.mesh);
      mesh.position.set(0, height / 2 - TITLE.h - KEY.gap * (i + 0.5), 0);
      this.root.add(mesh);
      return { id: row.id, mesh, face, pushed: 0, resting: new Set<number>() };
    });
  }
}

function inside(key: Key, at: Vector3): boolean {
  key.mesh.worldToLocal(_local.copy(at));
  return (
    Math.abs(_local.x) < KEY.w / 2 + REACH.side &&
    Math.abs(_local.y) < KEY.h / 2 + REACH.side &&
    _local.z < KEY.d / 2 + REACH.front &&
    _local.z > -REACH.back
  );
}
