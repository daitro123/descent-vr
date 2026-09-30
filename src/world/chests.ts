import { type BufferGeometry, Group, Mesh, type Vector3 } from 'three';
import { CONFIG } from '../config';
import type { ChestLook, ChestPlan } from '../maps/types';
import { ModelBuilder } from '../models/kit';
import { sharedModelMaterial } from '../models/materials';
import { PAL } from '../models/palette';
import type { Handedness } from '../player/input';
import type { Probe } from '../ui/talkBoard';

// A zone's chests (.scratch/inventory/spec.md, "Chests"): a wooden chest or
// the bandits' iron-bound strongbox, each standing shut until a fist or the
// sword's tip touches its lid. Then it swings open, for good: what it held
// comes out on the ground beside it (the Adventure's to show), and a chest
// opened before shows open and empty from the moment it's built.

/** A shut chest's lid touched: which chest, and by which hand. */
export interface Lifted {
  readonly chest: ChestPlan;
  readonly hand: Handedness;
}

interface Built {
  readonly plan: ChestPlan;
  /** Stands at the chest's foot, turned as it faces. */
  readonly root: Group;
  /** Turns about the hinge along the body's back top edge. */
  readonly lid: Group;
  /** How far open: 0 shut, 1 thrown back. */
  open: number;
}

/** The look's colours: wood, its bands and its lock. */
const COLOURS: Record<ChestLook, { wood: number; band: number; lock: number }> = {
  chest: { wood: PAL.wood, band: PAL.ironDark, lock: PAL.gold },
  strongbox: { wood: PAL.woodDark, band: PAL.ironDark, lock: PAL.iron },
};

const bodies = new Map<ChestLook, BufferGeometry>();
/**
 * A chest's body, standing on y 0 with its front to +Z: a floor and four
 * walls round a dark, empty inside, banded in iron, with the lock's plate on
 * its front.
 */
function bodyGeometry(look: ChestLook): BufferGeometry {
  let g = bodies.get(look);
  if (g) return g;
  const { w, d, h } = CONFIG.chests.looks[look];
  const { wood, band, lock } = COLOURS[look];
  const t = 0.03;
  const b = new ModelBuilder(13);
  b.box(w, t, d, { color: PAL.woodDark, jitter: 0.1, at: [0, t / 2, 0] })
    .box(t, h, d, { color: wood, jitter: 0.1, at: [-(w - t) / 2, h / 2, 0] })
    .box(t, h, d, { color: wood, jitter: 0.1, at: [(w - t) / 2, h / 2, 0] })
    .box(w, h, t, { color: wood, jitter: 0.1, at: [0, h / 2, -(d - t) / 2] })
    .box(w, h, t, { color: wood, jitter: 0.1, at: [0, h / 2, (d - t) / 2] })
    // The inside's floor, darker, so an open chest reads as empty.
    .box(w - 2 * t, 0.005, d - 2 * t, { color: 0x2e1c0e, jitter: 0, at: [0, t + 0.003, 0] });
  for (const y of [0.18, 0.82]) b.box(w + 0.02, 0.04, d + 0.02, { color: band, jitter: 0.05, at: [0, h * y, 0] });
  b.box(0.1, 0.12, 0.02, { color: lock, jitter: 0, at: [0, h - 0.07, d / 2 + 0.01] });
  g = b.build();
  bodies.set(look, g);
  return g;
}

const lids = new Map<ChestLook, BufferGeometry>();
/** A chest's lid in its hinge's frame: lying from the hinge (at the origin) forward to +Z, its hasp hanging over the front. */
function lidGeometry(look: ChestLook): BufferGeometry {
  let g = lids.get(look);
  if (g) return g;
  const { w, d, lid } = CONFIG.chests.looks[look];
  const { wood, band, lock } = COLOURS[look];
  const b = new ModelBuilder(17);
  b.box(w + 0.02, lid, d + 0.02, { color: wood, jitter: 0.1, at: [0, lid / 2, d / 2] });
  for (const x of [-0.32, 0.32]) b.box(0.05, lid + 0.02, d + 0.04, { color: band, jitter: 0.05, at: [x * w, lid / 2, d / 2] });
  b.box(0.06, 0.1, 0.02, { color: lock, jitter: 0, at: [0, 0, d + 0.02] });
  g = b.build();
  lids.set(look, g);
  return g;
}

export class Chests {
  /** The chests out of doors: add it to the scene, drawn with the outdoors. */
  readonly outdoors = new Group();
  /** The chests in the mine: each child stands at its chest, for the mine to show by the part it's in. */
  readonly mine = new Group();
  private readonly built: Built[];

  /** Build `plans`, each open already if `isOpen` says it was opened before. */
  constructor(plans: readonly ChestPlan[], isOpen: (id: string) => boolean) {
    this.outdoors.name = 'chests';
    this.mine.name = 'chests in the mine';
    const material = sharedModelMaterial();
    this.built = plans.map((plan) => {
      const { h, d } = CONFIG.chests.looks[plan.look];
      const root = new Group();
      root.position.set(plan.x, plan.y, plan.z);
      root.rotation.y = plan.yaw;
      root.add(new Mesh(bodyGeometry(plan.look), material));
      const lid = new Group();
      lid.position.set(0, h, -d / 2);
      lid.add(new Mesh(lidGeometry(plan.look), material));
      root.add(lid);
      const home = plan.interior === null ? this.outdoors : plan.interior === 'mine' ? this.mine : null;
      if (!home) throw new Error(`No chests in the ${plan.interior} yet`);
      home.add(root);
      const built = { plan, root, lid, open: isOpen(plan.id) ? 1 : 0 };
      this.pose(built);
      return built;
    });
  }

  /** Each chest's lid, 0 shut to 1 thrown back, by id: for checks. */
  get lids(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.built.map((c) => [c.plan.id, c.open]));
  }

  /**
   * Lids swing open on chests `isOpen` says are open, and a fist or the
   * sword's tip touching a shut one's lid, where it's drawn, lifts it: that's
   * returned, for the Adventure to open it.
   */
  update(dt: number, probes: readonly (Probe | null)[], isOpen: (id: string) => boolean): Lifted | null {
    const { seconds } = CONFIG.chests.open;
    let lifted: Lifted | null = null;
    for (const c of this.built) {
      if (isOpen(c.plan.id)) {
        if (c.open < 1) {
          c.open = Math.min(1, c.open + dt / seconds);
          this.pose(c);
        }
        continue;
      }
      if (lifted || !c.root.visible || !c.root.parent?.visible) continue;
      for (const p of probes) {
        if (!p || !this.onLid(c, p.at)) continue;
        lifted = { chest: c.plan, hand: p.hand };
        break;
      }
    }
    return lifted;
  }

  /** Is `at` on the shut lid of `c`, or within reach round it? */
  private onLid(c: Built, at: Vector3): boolean {
    const { w, d, h, lid } = CONFIG.chests.looks[c.plan.look];
    const r = CONFIG.chests.reach;
    const { x, y, z, yaw } = c.plan;
    const dx = at.x - x;
    const dz = at.z - z;
    const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    const lz = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const ly = at.y - y;
    return Math.abs(lx) < w / 2 + r && Math.abs(lz) < d / 2 + r && ly > h - r && ly < h + lid + r;
  }

  /** The lid as far open as `c.open`, easing out as it swings back. */
  private pose(c: Built): void {
    const t = 1 - (1 - c.open) ** 3;
    c.lid.rotation.x = -CONFIG.chests.open.angle * t;
  }
}
