import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { Card, FONT, parchment } from '../../../ui/card';
import { type Bag, NAMES, type Recipe, RECIPES } from './pieces';

// PROTOTYPE (Hammering at the anvil), variant A: a board at the anvil like
// Marshal Hale's talk board, listing the recipes you know with what each
// takes and what's in your bag. Press one with the hammer, the tongs, a fist
// or the sword's tip and its materials come out of the bag onto the station.
// Throwaway.

const ORDER: readonly Recipe[] = ['bar', 'whetstone', 'gauntlets'];
const KEY = { w: 0.34, h: 0.075, d: 0.035 };
const REACH = { side: 0.02, front: 0.05, back: 0.06 };
const _local = new Vector3();

interface Key {
  readonly recipe: Recipe;
  readonly mesh: Mesh<BoxGeometry, MeshBasicMaterial>;
  readonly face: Card;
  pushed: number;
  readonly blocked: Set<number>;
}

export class RecipeBoard {
  readonly root = new Group();
  private readonly title = new Card(0.38, 0.07);
  private readonly keys: Key[] = [];
  private arming = 0;

  constructor() {
    this.root.name = 'anvil-prototype-board';
    this.title.paint('title', (c, w, h) => {
      parchment(c, w, h, 6);
      c.fillStyle = '#5a3212';
      c.font = `bold 44px ${FONT}`;
      c.textBaseline = 'middle';
      c.fillText('Smithing · Apprentice', 24, h / 2 + 2);
    });
    this.title.mesh.position.y = 0.13;
    this.root.add(this.title.mesh);
    ORDER.forEach((recipe, i) => {
      const face = new Card(KEY.w, KEY.h, { ppm: 1400 });
      const mesh = new Mesh(new BoxGeometry(KEY.w, KEY.h, KEY.d), new MeshBasicMaterial({ color: 0x3a2716 }));
      face.mesh.position.z = KEY.d / 2 + 0.001;
      mesh.add(face.mesh);
      mesh.position.set(0, 0.04 - i * 0.09, 0);
      this.root.add(mesh);
      this.keys.push({ recipe, mesh, face, pushed: 0, blocked: new Set() });
    });
  }

  /** Redraw what each recipe takes, greyed where the bag hasn't enough. */
  paint(bag: Bag): void {
    for (const key of this.keys) {
      const r = RECIPES[key.recipe];
      const have = bag[r.takes];
      const can = have >= r.n;
      key.face.paint(`${key.recipe}:${have}`, (c, w, h) => {
        c.fillStyle = can ? '#2f6a2a' : '#4a4038';
        c.fillRect(0, 0, w, h);
        c.fillStyle = can ? '#f4ead0' : '#a89c88';
        c.textBaseline = 'middle';
        c.font = `bold 36px ${FONT}`;
        c.fillText(r.label, 20, h * 0.34);
        c.font = `26px ${FONT}`;
        c.fillText(`${r.n} ${NAMES[r.takes][1]} (you have ${have}) · ${r.where}`, 20, h * 0.74);
      });
    }
  }

  /** A recipe pressed this frame: a probe arriving at its key. One resting there must leave first. */
  update(dt: number, probes: readonly (Vector3 | null)[]): Recipe | null {
    this.arming = Math.max(0, this.arming - dt);
    for (const key of this.keys) {
      key.pushed = Math.max(0, key.pushed - dt);
      key.mesh.position.z = -0.02 * Math.min(1, key.pushed * 4);
      key.mesh.material.color.setHex(key.pushed > 0 ? 0xf0c060 : 0x3a2716);
    }
    this.root.updateMatrixWorld(true);
    let pick: Recipe | null = null;
    for (const key of this.keys) {
      probes.forEach((at, i) => {
        if (!at || !inside(key, at)) key.blocked.delete(i);
        else if (!key.blocked.has(i)) {
          if (this.arming <= 0 && !pick) {
            pick = key.recipe;
            key.pushed = 0.35;
          }
          key.blocked.add(i);
        }
      });
    }
    if (pick) this.arming = 0.4;
    return pick;
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
