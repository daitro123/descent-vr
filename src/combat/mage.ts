import { Vector3 } from 'three';
import { CONFIG } from '../config';
import type { Ground } from '../world/ground';

// The mage's rules, with nothing drawn (.scratch/abilities/spec.md, "The
// mage"): how a throw shapes the bolt and how long a charge makes it hurt,
// what the ward costs, how far a blink goes before a wall stops it, whom
// Frost Nova catches and whom a Fireball's burst reaches. Combat and the
// mage's hands (player/mage.ts) apply them; the tests drive them here.

/** A bolt's size and speed. */
export interface BoltShape {
  /** m/s. */
  readonly speed: number;
  /** m: what it touches with. */
  readonly radius: number;
}

/**
 * The bolt a throw makes, from the hand's speed as the trigger is let go
 * (m/s, in your own space): a gentle toss a big slow orb, a hard throw a small
 * fast bolt, and in between in step. Null for a hand too still to throw: a
 * fizzle, and nothing cast.
 */
export function boltShape(handSpeed: number): BoltShape | null {
  const T = CONFIG.mage.throw;
  if (handSpeed < T.minSpeed) return null;
  const t = Math.min(1, (handSpeed - T.minSpeed) / (T.fullSpeed - T.minSpeed));
  return { speed: T.slow.speed + (T.fast.speed - T.slow.speed) * t, radius: T.slow.radius + (T.fast.radius - T.slow.radius) * t };
}

/** How full a charge held `seconds` is: 0 to 1. */
export const chargeOf = (seconds: number) => Math.min(1, Math.max(0, seconds / CONFIG.mage.bolt.chargeTime));

/** Has a charge held `seconds` conjured anything? A tap sooner casts nothing. */
export const conjured = (seconds: number) => seconds >= CONFIG.mage.bolt.minHold;

/** A bolt's damage in level-1 terms, from how full its charge was: 7 a tap, 20 full. */
export function boltDamage(fraction: number): number {
  const B = CONFIG.mage.bolt;
  return B.minDamage + (B.maxDamage - B.minDamage) * Math.min(1, Math.max(0, fraction));
}

/** Does the ward rise with `mana` in the pool? Only with enough for a block. */
export const wardRises = (mana: number) => mana >= CONFIG.mage.ward.cost;

/** The pool after the ward stops a blow (a parry costs nothing). */
export const afterBlock = (mana: number) => Math.max(0, mana - CONFIG.mage.ward.cost);

const _to = new Vector3();
const _probe = new Vector3();

/**
 * Where a blink from `feet` along `dir` (flat, unit) lands, written to `out`:
 * `distance` m on, or as far as the way is clear, tried every `step` m. A
 * step is clear while the ground doesn't push a body there and the line from
 * `feet` to it (at chest height) is open, so a blink never passes a wall.
 * Returns how far it went.
 */
export function blinkTo(feet: Vector3, dir: Vector3, ground: Ground, out: Vector3, { distance, step } = CONFIG.mage.blink): number {
  const radius = CONFIG.player.bodyRadius;
  const chest = 1.1;
  out.copy(feet);
  let went = 0;
  for (let d = step; d <= distance + 1e-6; d += step) {
    _probe.set(feet.x + dir.x * d, 0, feet.z + dir.z * d);
    const x = _probe.x;
    const z = _probe.z;
    if (ground.resolve(_probe, radius) && Math.hypot(_probe.x - x, _probe.z - z) > 0.02) break;
    _probe.y = ground.heightAt(x, z) + chest;
    _to.set(feet.x, feet.y + chest, feet.z);
    if (!ground.lineOfSight(_to, _probe)) break;
    out.set(x, ground.heightAt(x, z), z);
    went = d;
  }
  return went;
}

/** What Frost Nova and a Fireball's burst need of an enemy. */
export interface Caught {
  readonly position: Vector3;
  readonly def: { readonly radius: number };
  readonly hittable: boolean;
}

/** The enemies a burst at `at` reaches: every one a blow can land on whose body is within `radius` m, but `not`. */
export function within<T extends Caught>(at: Vector3, radius: number, enemies: readonly T[], not: T | null = null): T[] {
  return enemies.filter((e) => e !== not && e.hittable && Math.hypot(e.position.x - at.x, e.position.z - at.z) - e.def.radius <= radius);
}
