import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { closestSegmentSegment, pushOutOfCircle, segmentIntersectsBox } from '../src/combat/geometry';

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

describe('closestSegmentSegment', () => {
  it('finds the gap between crossing perpendicular segments', () => {
    // Horizontal blade at y=1, z=0.5 sweeping across a vertical capsule axis at the origin.
    const hit = closestSegmentSegment(v(-1, 1, 0.5), v(1, 1, 0.5), v(0, 0, 0), v(0, 2, 0));
    expect(hit.distance).toBeCloseTo(0.5);
    expect(hit.pointA.toArray()).toEqual([0, 1, 0.5]);
    expect(hit.pointB.toArray()).toEqual([0, 1, 0]);
  });

  it('clamps to segment endpoints', () => {
    const hit = closestSegmentSegment(v(2, 3, 0), v(3, 3, 0), v(0, 0, 0), v(0, 2, 0));
    expect(hit.pointA.toArray()).toEqual([2, 3, 0]);
    expect(hit.pointB.toArray()).toEqual([0, 2, 0]);
    expect(hit.distance).toBeCloseTo(Math.hypot(2, 1));
  });

  it('handles parallel segments', () => {
    const hit = closestSegmentSegment(v(1, 0, 0), v(1, 1, 0), v(0, 0, 0), v(0, 2, 0));
    expect(hit.distance).toBeCloseTo(1);
  });

  it('handles degenerate (point) segments', () => {
    const hit = closestSegmentSegment(v(0, 5, 3), v(0, 5, 3), v(0, 0, 0), v(0, 2, 0));
    expect(hit.distance).toBeCloseTo(Math.hypot(3, 3));
  });
});

describe('segmentIntersectsBox', () => {
  const half = v(0.25, 0.3, 0.05);

  it('detects a blow passing through the board', () => {
    expect(segmentIntersectsBox(v(0, 0, -2), v(0, 0, 2), half)).toBe(true);
  });

  it('misses a blow passing beside the board', () => {
    expect(segmentIntersectsBox(v(0.5, 0, -2), v(0.5, 0, 2), half)).toBe(false);
  });

  it('misses when the segment stops short of the board', () => {
    expect(segmentIntersectsBox(v(0, 0, -2), v(0, 0, -0.5), half)).toBe(false);
  });

  it('handles axis-parallel segments inside the slab', () => {
    expect(segmentIntersectsBox(v(-1, 0.1, 0), v(1, 0.1, 0), half)).toBe(true);
    expect(segmentIntersectsBox(v(-1, 0.4, 0), v(1, 0.4, 0), half)).toBe(false);
  });
});

describe('pushOutOfCircle', () => {
  it('pushes an overlapping point to the rim', () => {
    const p = v(0.1, 0, 0);
    expect(pushOutOfCircle(p, 0, 0, 0.5)).toBe(true);
    expect(p.x).toBeCloseTo(0.5);
    expect(p.z).toBeCloseTo(0);
  });

  it('leaves outside points alone', () => {
    const p = v(1, 0, 0);
    expect(pushOutOfCircle(p, 0, 0, 0.5)).toBe(false);
    expect(p.x).toBe(1);
  });
});
