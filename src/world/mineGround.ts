import type { Vector3 } from 'three';
import { CONFIG } from '../config';
import { type Ground, steerRound } from './ground';
import type { MinePlan } from './mine';

// The mine's ground for those who live in it: its undead. The World answers
// for wherever you stand, and gives you the mine's ground only once you've
// come in by its mouth; the undead never leave it, so theirs is always the
// mine's. Rock blocks their sight, and one that can't see you finds its way
// along the route's centre line, which runs from the mouth through every
// chamber (.scratch/oakvale-starting-zone/spec.md, "Camps"). No navmesh.

/** What the mine's ground needs of it: its route, its sight test through rock, its floor, walls and props. */
export type Underground = Pick<MinePlan, 'route' | 'sees' | 'groundAt' | 'resolve' | 'arrowStops'>;

export class MineGround implements Ground {
  /** How far along the route each of its points is. */
  private readonly along: readonly number[];
  /** Per route segment, while finding the nearest point that can be seen: how far away, and how far along. */
  private readonly gaps: Float64Array;
  private readonly spots: Float64Array;
  private readonly resolveFn = (p: Vector3, radius: number) => this.resolve(p, radius);

  constructor(
    private readonly plan: Underground,
    /** Who answers out past the mouth (the World); without it, the floor is level at 0 there and nothing stops an arrow. */
    private readonly outside?: Ground,
  ) {
    const { route } = plan;
    const along = [0];
    for (let i = 1; i < route.length; i++) along.push(along[i - 1] + Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z));
    this.along = along;
    this.gaps = new Float64Array(Math.max(0, route.length - 1));
    this.spots = new Float64Array(Math.max(0, route.length - 1));
  }

  heightAt(x: number, z: number): number {
    return this.plan.groundAt(x, z) ?? this.outside?.heightAt(x, z) ?? 0;
  }

  resolve(p: Vector3, radius: number): boolean {
    return this.plan.resolve(p, radius);
  }

  /** Only rock blocks it. */
  lineOfSight(a: Vector3, b: Vector3): boolean {
    return this.plan.sees(a.x, a.z, b.x, b.z);
  }

  steer(from: Vector3, dir: Vector3, radius: number): void {
    steerRound(this.resolveFn, from, dir, radius);
  }

  arrowStops(p: Vector3): boolean {
    return this.plan.arrowStops(p) ?? this.outside?.arrowStops(p) ?? false;
  }

  /**
   * With rock between, head on along the centre line from where `from`
   * meets it towards where `to` does: for the farthest point up to
   * `ahead` m on that `from` can see.
   */
  wayRound(from: Vector3, to: Vector3, out: Vector3): boolean {
    const { plan } = this;
    if (plan.sees(from.x, from.z, to.x, to.z)) return false;
    const a = this.meets(from.x, from.z);
    const b = this.meets(to.x, to.z);
    if (a === null || b === null || Math.abs(b - a) < 1e-3) return false;
    const { ahead, step } = CONFIG.mine.way;
    const way = Math.sign(b - a);
    let d = Math.min(Math.abs(b - a), ahead);
    for (; d > step; d -= step) {
      this.pointAt(a + way * d, out);
      if (plan.sees(from.x, from.z, out.x, out.z)) return true;
    }
    // Right at a corner: a step on round it, and let steering do the rest.
    this.pointAt(a + way * Math.min(Math.abs(b - a), step), out);
    return true;
  }

  /**
   * How far along the route is the nearest point of it that (x, z) can see?
   * Null if it sees none (it's in the rock). The nearest point of all may be
   * behind rock, where the line runs through the next chamber over.
   */
  meets(x: number, z: number): number | null {
    const { route } = this.plan;
    const { gaps, spots } = this;
    for (let i = 1; i < route.length; i++) {
      const ax = route[i - 1].x;
      const az = route[i - 1].z;
      const dx = route[i].x - ax;
      const dz = route[i].z - az;
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
      gaps[i - 1] = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      spots[i - 1] = this.along[i - 1] + t * Math.sqrt(len2);
    }
    // Nearest first, until one can be seen.
    for (;;) {
      let best = -1;
      for (let i = 0; i < gaps.length; i++) if (gaps[i] !== Infinity && (best < 0 || gaps[i] < gaps[best])) best = i;
      if (best < 0) return null;
      const s = spots[best];
      const p = this.pointAt(s, _at);
      if (this.plan.sees(x, z, p.x, p.z)) return s;
      gaps[best] = Infinity;
    }
  }

  /** The route's point `s` metres along it (held to its ends). */
  pointAt(s: number, out: { x: number; z: number }): { x: number; z: number } {
    const { route } = this.plan;
    const { along } = this;
    let i = 1;
    while (i < route.length - 1 && along[i] < s) i++;
    const a = route[i - 1];
    const b = route[i];
    const len = along[i] - along[i - 1];
    const t = len > 0 ? Math.max(0, Math.min(1, (s - along[i - 1]) / len)) : 0;
    out.x = a.x + (b.x - a.x) * t;
    out.z = a.z + (b.z - a.z) * t;
    return out;
  }
}

const _at = { x: 0, z: 0 };
