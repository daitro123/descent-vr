import { Vector3 } from 'three';

export interface SegmentHit {
  distance: number;
  /** Closest point on the first segment. */
  pointA: Vector3;
  /** Closest point on the second segment. */
  pointB: Vector3;
}

const d1 = new Vector3();
const d2 = new Vector3();
const r = new Vector3();

/**
 * Closest points between segments p1→q1 and p2→q2
 * (Ericson, Real-Time Collision Detection §5.1.9).
 */
export function closestSegmentSegment(
  p1: Vector3,
  q1: Vector3,
  p2: Vector3,
  q2: Vector3,
  out: SegmentHit = { distance: 0, pointA: new Vector3(), pointB: new Vector3() },
): SegmentHit {
  const EPS = 1e-9;
  d1.subVectors(q1, p1);
  d2.subVectors(q2, p2);
  r.subVectors(p1, p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  let s: number;
  let t: number;

  if (a <= EPS && e <= EPS) {
    s = t = 0;
  } else if (a <= EPS) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = d1.dot(r);
    if (e <= EPS) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      s = denom > EPS ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }

  out.pointA.copy(p1).addScaledVector(d1, s);
  out.pointB.copy(p2).addScaledVector(d2, t);
  out.distance = out.pointA.distanceTo(out.pointB);
  return out;
}

/** Closest point to `p` on segment a→b. */
export function closestPointOnSegment(p: Vector3, a: Vector3, b: Vector3, out: Vector3): Vector3 {
  d1.subVectors(b, a);
  const len2 = d1.lengthSq();
  const t = len2 > 1e-12 ? clamp01(r.subVectors(p, a).dot(d1) / len2) : 0;
  return out.copy(a).addScaledVector(d1, t);
}

/**
 * Does segment a→b intersect the axis-aligned box [-half, +half]?
 * Callers transform the segment into the box's local space first (OBB test).
 */
export function segmentIntersectsBox(a: Vector3, b: Vector3, half: Vector3): boolean {
  let tMin = 0;
  let tMax = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const start = a[axis];
    const dir = b[axis] - start;
    const h = half[axis];
    if (Math.abs(dir) < 1e-9) {
      if (start < -h || start > h) return false;
      continue;
    }
    let t1 = (-h - start) / dir;
    let t2 = (h - start) / dir;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return true;
}

/** Push a point on the XZ plane out of a circle. Returns true if it moved. */
export function pushOutOfCircle(p: Vector3, cx: number, cz: number, radius: number): boolean {
  const dx = p.x - cx;
  const dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return false;
  const d = Math.sqrt(d2) || 1e-6;
  const nx = d2 > 0 ? dx / d : 1;
  const nz = d2 > 0 ? dz / d : 0;
  p.x = cx + nx * radius;
  p.z = cz + nz * radius;
  return true;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
