import { Vector3 } from 'three';
import { CONFIG } from '../config';

// The ranger's ward (.scratch/abilities/spec.md, "The ranger"): squeeze the
// bow hand's grip and a disc stands just past the bow hand, facing away from
// you. It lasts while held, up to its hold, then needs its cooldown to come
// back. It stops enemy arrows, and in its first moments sends them back (the
// warrior's reflect). It doesn't stop blows. The disc's look is the kit's
// (ranger.ts); the rule is here.

/** What an arrow's flight meets at the ward: sent back while it's fresh, stopped after. */
export type WardMeets = 'reflect' | 'stop';

const _a = new Vector3();
const _b = new Vector3();
const _p = new Vector3();

export class Ward {
  up = false;
  /** s since it rose. */
  age = 0;
  /** s before it can rise again. */
  cooldown = 0;
  /** The disc's centre and which way it faces, world, while it's up. */
  readonly centre = new Vector3();
  readonly normal = new Vector3(0, 0, -1);

  /**
   * One frame: `squeezing` the bow hand's grip raises it when it's ready and
   * `able` (the bow in a tracked hand, you standing, your hands your own).
   * 'raised' as it rises, 'dropped' as it falls, else null.
   */
  update(dt: number, squeezing: boolean, able: boolean): 'raised' | 'dropped' | null {
    const W = CONFIG.ranger.ward;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.up) {
      if (!able || !squeezing || this.cooldown > 0) return null;
      this.up = true;
      this.age = 0;
      return 'raised';
    }
    this.age += dt;
    if (able && squeezing && this.age < W.hold) return null;
    this.up = false;
    this.cooldown = W.cooldown;
    return 'dropped';
  }

  /** Stand the disc `reach` m past the bow hand at `grip`, facing away from `head`. */
  place(grip: Vector3, head: Vector3): void {
    this.normal.subVectors(grip, head);
    if (this.normal.lengthSq() < 1e-8) this.normal.set(0, 0, -1);
    this.normal.normalize();
    this.centre.copy(grip).addScaledVector(this.normal, CONFIG.ranger.ward.reach);
  }

  /** In its first moments it sends arrows back. */
  get fresh(): boolean {
    return this.up && this.age <= CONFIG.ranger.ward.reflect;
  }

  /** Does an arrow flying from `prev` to `pos` this frame cross the disc? What it does, or null. */
  meets(prev: Vector3, pos: Vector3): WardMeets | null {
    if (!this.up) return null;
    const W = CONFIG.ranger.ward;
    const d0 = _a.subVectors(prev, this.centre).dot(this.normal);
    const d1 = _b.subVectors(pos, this.centre).dot(this.normal);
    if (d0 * d1 > 0 || d0 === d1) return null;
    _p.lerpVectors(prev, pos, d0 / (d0 - d1));
    if (_p.distanceTo(this.centre) > W.radius + W.margin) return null;
    return this.fresh ? 'reflect' : 'stop';
  }

  /** Down, and ready: after death, or a new run. */
  clear(): void {
    this.up = false;
    this.age = this.cooldown = 0;
  }
}
