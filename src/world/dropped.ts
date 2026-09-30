import { type Camera, CircleGeometry, Group, Mesh, MeshBasicMaterial, type Scene, Vector3, type WebGLRenderer } from 'three';
import { CONFIG } from '../config';
import type { Stack } from '../inventory';
import { itemOf, type Rarity } from '../items';
import { sharedModelMaterial } from '../models/materials';
import { modelOf, RARITY_COLOUR } from '../ui/bag/looks';
import type { Ground } from './ground';

// What you let go of off the bag panel: it falls from your hand, lies on the
// ground as its model on a faint disc in its rarity's colour, and a hand
// touching it takes it back into the bag. It isn't saved, as loot on the
// ground isn't; the oldest goes past the most that may lie at once, and each
// goes after a while (.scratch/inventory/spec.md, "The view in VR").

/** Something lying on the ground. */
export interface Lying {
  stack: Stack;
  readonly group: Group;
  readonly velocity: Vector3;
  age: number;
  landed: boolean;
}

const _p = new Vector3();
/** One disc and one material per rarity, shared by everything lying in it. */
const DISC = new CircleGeometry(0.16, 16);
const discs = new Map<Rarity, MeshBasicMaterial>();
const discOf = (rarity: Rarity) => {
  let m = discs.get(rarity);
  if (!m) discs.set(rarity, (m = new MeshBasicMaterial({ color: RARITY_COLOUR[rarity], transparent: true, opacity: 0.45, depthWrite: false })));
  return m;
};

export class Dropped {
  readonly root = new Group();
  readonly items: Lying[] = [];

  constructor(private readonly ground: Ground) {
    this.root.name = 'dropped';
  }

  /** Compile the disc's shader now, rather than when the first thing is dropped. */
  warm(renderer: WebGLRenderer, camera: Camera, scene: Scene): void {
    const disc = new Mesh(DISC, discOf('white'));
    this.root.add(disc);
    renderer.compile(disc, camera, scene);
    this.root.remove(disc);
  }

  /** `stack` falls from `at`, thrown with the hand's `velocity`. */
  drop(stack: Stack, at: Vector3, velocity?: Vector3): void {
    const item = itemOf(stack.id);
    if (!item) return;
    const group = new Group();
    const model = new Mesh(modelOf(item), sharedModelMaterial());
    model.scale.setScalar(0.22);
    model.rotation.set(Math.PI / 2, 0, Math.random() * Math.PI * 2);
    group.add(model);
    const glow = new Mesh(DISC, discOf(item.rarity));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.03;
    group.add(glow);
    group.position.copy(at);
    this.root.add(group);
    this.items.push({ stack, group, velocity: (velocity?.clone() ?? new Vector3()).clampLength(0, 3), age: 0, landed: false });
    while (this.items.length > CONFIG.bag.dropped.most) this.remove(0);
  }

  /**
   * Fall and settle, and go once they've lain long enough. A hand touching
   * one that has settled offers it to `take`, which returns what didn't fit
   * (the bag full): that stays lying there. Returns what was taken, and where.
   */
  update(dt: number, hands: readonly (Vector3 | null)[], take: (stack: Stack) => Stack | null): { stack: Stack; at: Vector3; hand: number } | null {
    const D = CONFIG.bag.dropped;
    let taken: { stack: Stack; at: Vector3; hand: number } | null = null;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const d = this.items[i];
      d.age += dt;
      if (d.age > D.lasts) {
        this.remove(i);
        continue;
      }
      const p = d.group.position;
      if (!d.landed) {
        d.velocity.y -= 9.8 * dt;
        p.addScaledVector(d.velocity, dt);
        const floor = this.ground.heightAt(p.x, p.z) + 0.04;
        if (p.y <= floor) {
          p.y = floor;
          d.landed = true;
        }
        continue;
      }
      if (taken || d.age < D.settle) continue;
      const hand = hands.findIndex((h) => h && h.distanceTo(_p.copy(p)) < D.take);
      if (hand < 0) continue;
      const left = take(d.stack);
      if (left && left.count === d.stack.count) continue;
      taken = { stack: { id: d.stack.id, count: d.stack.count - (left?.count ?? 0) }, at: p.clone(), hand };
      if (left) d.stack = left;
      else this.remove(i);
    }
    return taken;
  }

  private remove(i: number): void {
    this.root.remove(this.items[i].group);
    this.items.splice(i, 1);
  }
}
