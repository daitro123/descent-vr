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
