import { type Matrix4, Vector3 } from 'three';
import { closestPointOnSegment, closestSegmentSegment, segmentIntersectsBox, type SegmentHit } from './geometry';

// Enemy blows are physical: each frame of a swing, the weapon segment is swept
// from where it was to where it is, and the first thing it touches decides the
// outcome: the shield (block), the sword (clash) or the body (hit). Where you
// hold the shield matters, and ducking or stepping back makes a blow whiff.

/** What an enemy weapon can touch on the player, in world space. */
export interface Defender {
  head: Vector3;
  headRadius: number;
  torsoTop: Vector3;
  torsoBottom: Vector3;
  torsoRadius: number;
  /** World → shield-board local, or null when the shield can't block (untracked, numb). */
  shieldInverse: Matrix4 | null;
  /** Half extents of the block box, forgiveness margin included. */
  shieldHalf: Vector3;
  /** Blade segment, or null when the sword isn't tracked. */
  swordBase: Vector3 | null;
  swordTip: Vector3;
  swordRadius: number;
}

export type Contact = 'shield' | 'sword' | 'body';

export interface SweepResult {
  contact: Contact;
  /** Where on the weapon it happened, world space. */
  point: Vector3;
}

const _b = new Vector3();
const _t = new Vector3();
const _lb = new Vector3();
const _lt = new Vector3();
const _half = new Vector3();
const _q = new Vector3();
const _hit: SegmentHit = { distance: 0, pointA: new Vector3(), pointB: new Vector3() };

/**
 * Sweep a weapon segment from (prevBase, prevTip) to (base, tip) in `samples`
 * sub-steps and return the first contact, or null if it touched nothing.
 * `blockable: false` sweeps straight through shield and sword.
 */
export function sweepStrike(
  prevBase: Vector3,
  prevTip: Vector3,
  base: Vector3,
  tip: Vector3,
  weaponRadius: number,
  samples: number,
  d: Defender,
  blockable: boolean,
  out: SweepResult = { contact: 'body', point: new Vector3() },
): SweepResult | null {
  _half.copy(d.shieldHalf).addScalar(weaponRadius);
  for (let i = 1; i <= samples; i++) {
    const s = i / samples;
    _b.lerpVectors(prevBase, base, s);
    _t.lerpVectors(prevTip, tip, s);

    if (blockable && d.shieldInverse) {
      _lb.copy(_b).applyMatrix4(d.shieldInverse);
      _lt.copy(_t).applyMatrix4(d.shieldInverse);
      if (segmentIntersectsBox(_lb, _lt, _half)) {
        out.contact = 'shield';
        closestPointOnSegment(d.torsoTop, _b, _t, out.point);
        return out;
      }
    }
    if (blockable && d.swordBase) {
      closestSegmentSegment(_b, _t, d.swordBase, d.swordTip, _hit);
      if (_hit.distance <= d.swordRadius + weaponRadius) {
        out.contact = 'sword';
        out.point.copy(_hit.pointA);
        return out;
      }
    }
    closestPointOnSegment(d.head, _b, _t, _q);
    if (_q.distanceTo(d.head) <= d.headRadius + weaponRadius) {
      out.contact = 'body';
      out.point.copy(_q);
      return out;
    }
    closestSegmentSegment(_b, _t, d.torsoTop, d.torsoBottom, _hit);
    if (_hit.distance <= d.torsoRadius + weaponRadius) {
      out.contact = 'body';
      out.point.copy(_hit.pointA);
      return out;
    }
  }
  return null;
}

// The player's blade against an enemy: the same sweep the other way round.
// A raised guard is tested first, so a blade that meets the enemy's weapon
// before its body is stopped there.

/** What the player's blade can touch on one enemy, in world space. */
export interface BladeTarget {
  head: Vector3;
  headRadius: number;
  /** Hurt capsule axis, feet to neck. */
  bottom: Vector3;
  top: Vector3;
  radius: number;
  /** Weapon up to block (Enemy.guarding): its segment and thickness. */
  guarding: boolean;
  guardBase: Vector3;
  guardTip: Vector3;
  guardRadius: number;
}

export type BladeZone = 'guard' | 'head' | 'body';

export interface BladeResult {
  zone: BladeZone;
  /** Where on the blade it happened, world space. */
  point: Vector3;
}

export function bladeTarget(): BladeTarget {
  return {
    head: new Vector3(),
    headRadius: 0,
    bottom: new Vector3(),
    top: new Vector3(),
    radius: 0,
    guarding: false,
    guardBase: new Vector3(),
    guardTip: new Vector3(),
    guardRadius: 0,
  };
}

/**
 * Sweep the player's blade from (prevBase, prevTip) to (base, tip) in
 * `samples` sub-steps and return what it met first: the guard, the head (a
 * crit) or the body; null if it touched nothing.
 */
export function sweepBlade(
  prevBase: Vector3,
  prevTip: Vector3,
  base: Vector3,
  tip: Vector3,
  bladeRadius: number,
  samples: number,
  t: BladeTarget,
  out: BladeResult = { zone: 'body', point: new Vector3() },
): BladeResult | null {
  for (let i = 1; i <= samples; i++) {
    const s = i / samples;
    _b.lerpVectors(prevBase, base, s);
    _t.lerpVectors(prevTip, tip, s);

    if (t.guarding) {
      closestSegmentSegment(_b, _t, t.guardBase, t.guardTip, _hit);
      if (_hit.distance <= bladeRadius + t.guardRadius) {
        out.zone = 'guard';
        out.point.copy(_hit.pointA);
        return out;
      }
    }
    closestPointOnSegment(t.head, _b, _t, out.point);
    if (out.point.distanceTo(t.head) <= t.headRadius + bladeRadius) {
      out.zone = 'head';
      return out;
    }
    closestSegmentSegment(_b, _t, t.bottom, t.top, _hit);
    if (_hit.distance <= t.radius + bladeRadius) {
      out.zone = 'body';
      out.point.copy(_hit.pointA);
      return out;
    }
  }
  return null;
}
