import { Group, Mesh, Vector3 } from 'three';
import { CONFIG } from '../config';
import type { Handedness } from '../player/input';
import type { Pickup } from '../maps/types';
import { ModelBuilder } from '../models/kit';
import { sharedModelMaterial } from '../models/materials';
import type { Item } from '../quests';
import type { Probe } from '../ui/talkBoard';

// What lies about a zone waiting to be picked up by hand for a quest (the
// leader's orders on the crates in their tent). Each shows while the adventure
// state says it lies there, and a touch with either fist takes it, as you'd
// touch an orb.

/** Something picked up, by which hand and where it lay. */
export interface Taken {
  readonly item: Item;
  readonly hand: Handedness;
  readonly at: Vector3;
}

/** Radius of the rolled parchment. */
const ROLL = 0.035;

/** A rolled parchment tied with a bandit's red cord, lying along its X on a surface at y 0. */
function orders(): Mesh {
  const b = new ModelBuilder(7);
  const paper = { color: 0xe6d8ae, glow: 0.2, jitter: 0.05 };
  b.cyl(ROLL, ROLL, 0.3, 8, { ...paper, at: [0, ROLL, 0], rot: [0, 0, Math.PI / 2] })
    .cyl(ROLL * 0.55, ROLL * 0.55, 0.305, 6, { color: 0xb8a878, at: [0, ROLL, 0], rot: [0, 0, Math.PI / 2] })
    .cyl(ROLL + 0.006, ROLL + 0.006, 0.02, 8, { color: 0x8a1810, at: [0.03, ROLL, 0], rot: [0, 0, Math.PI / 2] })
    .box(0.03, 0.012, 0.03, { color: 0x6e1410, at: [0.03, 2 * ROLL + 0.004, 0.005], jitter: 0 });
  return new Mesh(b.build(), sharedModelMaterial());
}

const MODELS: Record<Item, () => Mesh> = { orders };

/** The fist, if it's touching `at`, as close as you touch an orb. */
const touching = (fist: Probe | null, at: Vector3) => (fist && fist.at.distanceTo(at) < CONFIG.orb.pickupRadius ? fist : null);

export class Pickups {
  /** Everything lying about: add it to the scene. */
  readonly root = new Group();
  private readonly lying: { readonly item: Item; readonly mesh: Mesh; readonly at: Vector3 }[];

  constructor(pickups: readonly Pickup[]) {
    this.root.name = 'pickups';
    this.lying = pickups.map(({ item, x, y, z, yaw }) => {
      const mesh = MODELS[item]();
      mesh.position.set(x, y, z);
      mesh.rotation.y = yaw;
      mesh.visible = false;
      this.root.add(mesh);
      return { item, mesh, at: new Vector3(x, y + ROLL, z) };
    });
  }

  /**
   * Show what lies where it's found (`lies`), and take the first one either
   * fist touches: it's gone at once. Returns what was taken, if anything.
   */
  update(lies: (item: Item) => boolean, left: Probe | null, right: Probe | null): Taken | null {
    let taken: Taken | null = null;
    for (const { item, mesh, at } of this.lying) {
      mesh.visible = lies(item);
      if (!mesh.visible || taken) continue;
      const hand = touching(left, at) ?? touching(right, at);
      if (!hand) continue;
      mesh.visible = false;
      taken = { item, hand: hand.hand, at };
    }
    return taken;
  }
}
