import { Group, Mesh, type Object3D, Vector3 } from 'three';
import { CONFIG } from '../config';
import { INN } from '../maps/forest/inn';
import type { StashSpot } from '../maps/types';
import { ModelBuilder } from '../models/kit';
import { sharedModelMaterial } from '../models/materials';
import { PAL } from '../models/palette';
import type { Probe } from '../ui/talkBoard';

// The stash's chest by the inn's hearth: an iron-bound chest whose lid a fist
// or the weapon's tip touches to open the stash, as a WoW bank is opened at
// its banker. Its lid swings up while the stash is open, and shuts with it.
// It hangs from the inn's room, so it's drawn only while the room is: two
// draws, the chest and its lid (.scratch/inventory/issues/15-the-stash.md).

const { width: W, depth: D, height: H } = INN.stash;
/** The lid's thickness: the chest's body stands under it. */
const LID = 0.14;
const BODY = H - LID;

/** The chest's body, its front (+Z) facing you, standing on y 0. */
function body(): Mesh {
  const b = new ModelBuilder(41);
  const wood = { color: PAL.wood, jitter: 0.12 };
  const iron = { color: PAL.ironDark, jitter: 0.05 };
  b.box(W, BODY, D, { ...wood, at: [0, BODY / 2, 0] })
    .box(W + 0.02, 0.05, D + 0.02, { ...iron, at: [0, 0.025, 0] })
    .box(W + 0.01, 0.04, D + 0.01, { ...iron, at: [0, BODY - 0.02, 0] });
  for (const x of [-0.3, 0.3]) b.box(0.06, BODY, D + 0.02, { ...iron, at: [x * W, BODY / 2, 0] });
  // The lock's plate, under the lid's front edge.
  b.box(0.1, 0.1, 0.02, { color: PAL.gold, jitter: 0, at: [0, BODY - 0.07, D / 2 + 0.01] });
  return new Mesh(b.build(), sharedModelMaterial());
}

/** The lid, hinged along its back edge: the hinge at the origin, the lid reaching out along +Z. */
function lid(): Mesh {
  const b = new ModelBuilder(43);
  const iron = { color: PAL.ironDark, jitter: 0.05 };
  b.box(W + 0.02, LID, D + 0.02, { color: PAL.wood, jitter: 0.12, at: [0, LID / 2, D / 2] })
    .box(W + 0.03, 0.035, D + 0.03, { ...iron, at: [0, 0.0175, D / 2] });
  for (const x of [-0.3, 0.3]) b.box(0.06, LID + 0.01, D + 0.03, { ...iron, at: [x * W, LID / 2, D / 2] });
  b.box(0.08, 0.06, 0.02, { color: PAL.gold, jitter: 0, at: [0, 0.02, D + 0.015] });
  return new Mesh(b.build(), sharedModelMaterial());
}

const _l = new Vector3();

export class StashChest {
  /** The chest where it stands: hang it from its room. */
  readonly root = new Group();
  /** The lid's hinge, along the body's back top edge. */
  private readonly hinge = new Group();
  /** How far the lid has swung up: 0 shut, 1 open. */
  private swing = 0;
  /** Was each probe on the lid last frame? It must leave before it can open the stash again. */
  private readonly on: boolean[] = [];

  constructor(readonly spot: StashSpot) {
    this.root.name = 'stash-chest';
    this.root.position.set(spot.x, spot.y, spot.z);
    this.root.rotation.y = spot.yaw;
    this.hinge.position.set(0, BODY, -D / 2);
    const top = lid();
    top.name = 'stash-chest-lid';
    this.hinge.add(top);
    const chest = body();
    chest.name = 'stash-chest-body';
    this.root.add(chest, this.hinge);
  }

  /** Is it drawn: it and everything it hangs from visible? */
  get shown(): boolean {
    for (let p: Object3D | null = this.root; p; p = p.parent) if (!p.visible) return false;
    return true;
  }

  /** Is the lid up, or on its way? */
  get lidUp(): number {
    return this.swing;
  }

  /** The world point just over the shut lid's middle. */
  lidWorld(out: Vector3, over = 0.02): Vector3 {
    const { x, y, z } = this.spot;
    return out.set(x, y + H + over, z);
  }

  /** Is `world` on the shut lid, within the touch margin? */
  onLid(world: Vector3): boolean {
    const { x, y, z, yaw } = this.spot;
    const t = CONFIG.bag.stashChest.touch;
    // Into the chest's frame: undo its turn about its middle.
    const dx = world.x - x;
    const dz = world.z - z;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    _l.set(dx * c - dz * s, world.y - y, dx * s + dz * c);
    return Math.abs(_l.x) < W / 2 + t && Math.abs(_l.z) < D / 2 + t && _l.y > BODY - t && _l.y < H + t;
  }

  /**
   * One frame: the lid swings towards `open`. Returns the probe that has just
   * come onto the lid, while the chest is drawn and the stash shut; one that
   * rests there must leave before it counts again.
   */
  update(dt: number, open: boolean, probes: readonly (Probe | null)[]): Probe | null {
    const C = CONFIG.bag.stashChest;
    this.swing = Math.min(1, Math.max(0, this.swing + (open ? dt : -dt) / C.swing));
    const eased = this.swing * this.swing * (3 - 2 * this.swing);
    this.hinge.rotation.x = (-C.lid * Math.PI * eased) / 180;
    const shown = this.shown;
    let arrived: Probe | null = null;
    probes.forEach((p, i) => {
      const on = shown && !!p && this.onLid(p.at);
      if (on && !this.on[i] && !open && !arrived) arrived = p;
      this.on[i] = on;
    });
    return arrived;
  }
}
