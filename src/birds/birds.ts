import { Group, type Material, Vector3 } from 'three';
import { CONFIG } from '../config';
import type { FlockPlan, Zone } from '../maps/types';
import { sharedModelMaterial } from '../models/materials';
import { FlockMesh } from './flock';
import { Bird } from './mover';
import { BRAINS, type BirdCall, type Brain, callOf, type Surroundings, type You } from './ways';

// The birds in the world: every zone's flocks (maps/types.ts `FlockPlan`),
// each one mesh and one draw call however many birds are in it. A flock is
// built as you come within CONFIG.birds.near of where it keeps and dropped
// once you've gone on, like the villagers (people/population.ts); when it's
// built again it's home and at peace. Each frame a built flock's brain
// (ways.ts) decides what its birds do, they get about (mover.ts), and, if
// the flock was drawn last frame, they're posed into its mesh (flock.ts).

/** Somewhere a bird calls from, and what it calls. */
export type Hear = (call: BirdCall, x: number, y: number, z: number) => void;

const _p = new Vector3();

/** What a zone's birds stand on, swim in and keep clear of: its ground, its water, and where you can walk clear of its walls, props and trees. */
export function surroundingsOf(zone: Zone): Surroundings {
  return {
    heightAt: (x, z) => zone.heightAt(x, z),
    waterAt: (x, z) => zone.waterAt(x, z),
    clear: (x, z) => zone.walkable.contains(x, z) && !zone.collide(_p.set(x, 0, z), 0.2),
  };
}

/** A deterministic number from `id`, to seed its birds by. */
function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** One flock, built: its birds, its brain and its mesh. */
export class Flock {
  readonly birds: readonly Bird[];
  readonly mesh: FlockMesh;
  readonly brain: Brain;
  /** s since it last called, so a flock doesn't call over itself. */
  private quiet = Infinity;
  private you: { x: number; z: number } = { x: 0, z: 0 };

  constructor(
    readonly plan: FlockPlan,
    readonly near: Surroundings,
    material: Material,
    private readonly hear: Hear,
  ) {
    const seed = seedOf(plan.id);
    // Each bird a little bigger or smaller than the next.
    let s = seed;
    const sizes = plan.birds.map(() => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return 0.92 + (s / 2 ** 32) * 0.16;
    });
    this.birds = plan.birds.map((look, i) => new Bird(look, sizes[i], seed + i * 7919));
    this.mesh = new FlockMesh(plan.birds, material, sizes);
    this.mesh.mesh.name = `flock:${plan.id}`;
    this.brain = BRAINS[plan.ways]({
      plan,
      birds: this.birds,
      near,
      call: (bird, call, always) => this.call(bird, call, always),
    });
    this.brain.home();
    this.mesh.drawn = true;
    this.pose();
  }

  /** One frame with you where you are. */
  update(dt: number, you: You): void {
    this.quiet += dt;
    this.you = you;
    this.brain.update(dt, you);
    for (const b of this.birds) b.update(dt, this.near);
    this.pose();
  }

  /** Bound the mesh round its birds; and, if it was drawn last frame, pose them into it. */
  private pose(): void {
    let [x0, y0, z0, x1, y1, z1] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const { at } of this.birds) {
      x0 = Math.min(x0, at.x);
      y0 = Math.min(y0, at.y);
      z0 = Math.min(z0, at.z);
      x1 = Math.max(x1, at.x);
      y1 = Math.max(y1, at.y);
      z1 = Math.max(z1, at.z);
    }
    this.mesh.bound(x0, y0, z0, x1, y1, z1);
    if (!this.mesh.drawn) return;
    this.birds.forEach((b, i) => {
      if (b.doing === 'hidden') this.mesh.hide(i, b.at.x, b.at.y, b.at.z);
      else this.mesh.pose(i, b.at, b.pose);
    });
    this.mesh.commit();
  }

  private call(bird: Bird, call: BirdCall | undefined, always = false): void {
    const sound = call ?? callOf(bird.look);
    if (!sound) return;
    if (!always && this.quiet < CONFIG.birds.call.gap) return;
    if (Math.hypot(bird.at.x - this.you.x, bird.at.z - this.you.z) > CONFIG.birds.call.reach) return;
    this.quiet = 0;
    this.hear(sound, bird.at.x, bird.at.y + bird.leg * 0.5, bird.at.z);
  }

  dispose(): void {
    this.mesh.dispose();
  }
}

/** One flock placed, built or not. */
interface Slot {
  readonly plan: FlockPlan;
  readonly near: Surroundings;
  flock: Flock | null;
  /** How far you are from where it keeps (its reach taken off), and from it for building: a built one counts `hysteresis` nearer. */
  far: number;
  rank: number;
}

export class Birds {
  /** Every built flock's mesh hangs from it: hide it with the outdoors. */
  readonly root = new Group();
  private readonly slots: Slot[] = [];
  private readonly order: Slot[] = [];
  private readonly you = { x: 0, z: 0, wading: false };

  constructor(
    private readonly hear: Hear = () => {},
    private readonly material: Material = sharedModelMaterial(),
  ) {
    this.root.name = 'birds';
  }

  /** Take in a zone's flocks (as it's loaded), each living in `near`: none is built until you come near. */
  add(flocks: readonly FlockPlan[], near: Surroundings): void {
    for (const plan of flocks) this.slots.push({ plan, near, flock: null, far: Infinity, rank: Infinity });
  }

  /** Every flock placed, built or not. */
  get placed(): readonly FlockPlan[] {
    return this.slots.map((s) => s.plan);
  }

  /** The flocks built. */
  get built(): readonly Flock[] {
    return this.slots.flatMap((s) => (s.flock ? [s.flock] : []));
  }

  /** `id`'s flock, while it's built. */
  get(id: string): Flock | null {
    return this.slots.find((s) => s.plan.id === id)?.flock ?? null;
  }

  /** What every built flock costs to draw (each eye), in triangles and draw calls. */
  get cost(): { triangles: number; calls: number } {
    let triangles = 0;
    for (const f of this.built) triangles += f.mesh.triangles;
    return { triangles, calls: this.built.length };
  }

  /** Build every flock wanted round `you` at once (loading in, waking after a death), home and at peace. */
  fill(you: Vector3, near: number = CONFIG.birds.near): void {
    this.reckon(you);
    this.rebuild(Infinity, near);
  }

  /** One frame with your head at `you`: build those within `near` m, drop those you've gone past, and live. */
  update(dt: number, you: Vector3, near: number = CONFIG.birds.near): void {
    this.reckon(you);
    this.rebuild(CONFIG.birds.perFrame, near);
    for (const s of this.slots) {
      if (!s.flock) continue;
      const water = s.near.waterAt(you.x, you.z);
      this.you.x = you.x;
      this.you.z = you.z;
      this.you.wading = !Number.isNaN(water) && water > s.near.heightAt(you.x, you.z) + 0.05;
      s.flock.update(dt, this.you);
    }
  }

  private reckon(you: Vector3): void {
    const { hysteresis } = CONFIG.birds;
    for (const s of this.slots) {
      s.far = Math.max(0, Math.hypot(s.plan.x - you.x, s.plan.z - you.z) - s.plan.r);
      s.rank = s.flock ? s.far - hysteresis : s.far;
    }
  }

  private rebuild(budget: number, near: number): void {
    const { order } = this;
    order.length = 0;
    for (const s of this.slots) {
      if (s.rank < near) order.push(s);
      else if (s.flock) this.drop(s);
    }
    order.sort((a, b) => a.rank - b.rank);
    for (const s of order) {
      if (s.flock) continue;
      if (budget-- <= 0) break;
      s.flock = new Flock(s.plan, s.near, this.material, this.hear);
      this.root.add(s.flock.mesh.mesh);
    }
  }

  private drop(s: Slot): void {
    s.flock?.dispose();
    s.flock = null;
  }

  dispose(): void {
    for (const s of this.slots) this.drop(s);
  }
}
