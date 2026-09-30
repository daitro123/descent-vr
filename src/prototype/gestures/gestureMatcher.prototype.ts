// PROTOTYPE (abilities ticket 07, "Using abilities by gesture"): throwaway code
// kept on main so Tom can try it at `?arena&class=<class>&gestures`.
//
// A small template matcher of our own on the method the research recommends
// (.scratch/abilities/research/recognising-gestures-in-the-browser.md), the one
// Jackknife and Penny Pincher publish: resample the stroke to 16 points, turn
// it into 15 unit direction vectors, and compare them with each template by
// dynamic time warping in a band of 2. Two correction factors (how far the
// stroke travels along each axis, and its bounding box) divide the score, so
// a stroke spread over different axes from the template scores worse. Each
// gesture has its own rejection threshold, and a gesture can ask for more:
// a flick must start at the chest, be short, fast and straight. No UCF code.
//
// Everything here is pure: points in, a verdict out. Points are in the body
// frame the recorder builds: metres from the eyes at the moment of arming,
// x to the right, y up and z forward.

export type Point = readonly [number, number, number];

/** A recorded stroke: points in the body frame, and the time of each (s from arming). */
export interface Stroke {
  points: Point[];
  times: number[];
}

/** What a stroke is made of, as the matcher compares it. */
export interface Features {
  /** 15 unit direction vectors, flattened (x, y, z, x, y, z…). */
  dirs: Float64Array;
  /** Distance travelled along each axis, as a unit vector. */
  travel: [number, number, number];
  /** The bounding box's extents, as a unit vector. */
  box: [number, number, number];
  /** Metres along the path. */
  length: number;
  /** Seconds from first point to last. */
  duration: number;
  /** Straight-line distance start to end over the path's length (1 is a straight line). */
  straightness: number;
  start: Point;
}

export type GestureKind = 'flick' | 'shape';

/** One gesture's templates and how strict it is. */
export interface GestureModel {
  id: string;
  kind: GestureKind;
  /** Accept a stroke scoring at most this. */
  threshold: number;
  templates: Features[];
}

export type Miss =
  /** Nothing scored under its threshold. */
  | 'no match'
  /** Two gestures scored too close to call. */
  | 'unsure'
  /** Shorter than any gesture. */
  | 'too small';

export interface Verdict {
  /** The gesture read, or null. */
  id: string | null;
  /** The best score of any gesture that passed its own gates (lower is closer). */
  score: number;
  /** The gesture that scored best, read or not. */
  nearest: string | null;
  miss?: Miss;
}

export const MATCH = {
  /** Points a stroke is resampled to. */
  points: 16,
  /** DTW's Sakoe–Chiba band: a point may warp this many steps. */
  band: 2,
  /** A correction factor's dot product is floored here, so a perpendicular stroke scores large, not infinite. */
  minDot: 0.1,
  /** The runner-up (another gesture) must score at least this many times the best, or it's "unsure". */
  margin: 1.2,
  /** Every stroke must travel this far (m) to be read at all. */
  minLength: 0.12,
  flick: {
    /** Where a flick starts: the chest, in front of the arming hand's side (body frame, m). */
    chest: [0.12, -0.42, 0.25] as Point,
    chestRadius: 0.28,
    maxLength: 0.6,
    maxDuration: 0.6,
    minStraightness: 0.75,
    threshold: 0.2,
  },
  shape: {
    minLength: 0.3,
    threshold: 0.3,
  },
};

const N = MATCH.points;

/** Resample to `n` points evenly spaced along the path. */
export function resample(points: readonly Point[], n = N): Point[] {
  if (points.length === 0) return [];
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  if (total <= 1e-9) return Array.from({ length: n }, () => points[0]);
  const step = total / (n - 1);
  const out: Point[] = [points[0]];
  let prev = points[0];
  let acc = 0;
  for (let i = 1; i < points.length && out.length < n; i++) {
    const cur = points[i];
    let d = dist(prev, cur);
    while (acc + d >= step && out.length < n) {
      const t = (step - acc) / d;
      const q: Point = [prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t, prev[2] + (cur[2] - prev[2]) * t];
      out.push(q);
      prev = q;
      d = dist(prev, cur);
      acc = 0;
    }
    acc += d;
    prev = cur;
  }
  while (out.length < n) out.push(points[points.length - 1]);
  return out;
}

export function features(stroke: Stroke): Features {
  const { points, times } = stroke;
  const r = resample(points);
  const dirs = new Float64Array((N - 1) * 3);
  for (let i = 0; i < N - 1; i++) {
    const dx = r[i + 1][0] - r[i][0];
    const dy = r[i + 1][1] - r[i][1];
    const dz = r[i + 1][2] - r[i][2];
    const l = Math.hypot(dx, dy, dz) || 1;
    dirs[i * 3] = dx / l;
    dirs[i * 3 + 1] = dy / l;
    dirs[i * 3 + 2] = dz / l;
  }
  const travel: [number, number, number] = [0, 0, 0];
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  let length = 0;
  for (let i = 0; i < points.length; i++) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], points[i][k]);
      hi[k] = Math.max(hi[k], points[i][k]);
      if (i > 0) travel[k] += Math.abs(points[i][k] - points[i - 1][k]);
    }
    if (i > 0) length += dist(points[i - 1], points[i]);
  }
  const box: [number, number, number] = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const ends = points.length ? dist(points[0], points[points.length - 1]) : 0;
  return {
    dirs,
    travel: unit(travel),
    box: unit(box),
    length,
    duration: times.length ? times[times.length - 1] - times[0] : 0,
    straightness: length > 1e-9 ? ends / length : 0,
    start: points[0] ?? [0, 0, 0],
  };
}

/** Banded DTW over direction vectors, cost 1 − cos, as a mean per step (0 is identical, 2 opposite). */
export function warp(a: Float64Array, b: Float64Array): number {
  const n = a.length / 3;
  const R = MATCH.band;
  const cost = new Float64Array((n + 1) * (n + 1)).fill(Infinity);
  const at = (i: number, j: number) => i * (n + 1) + j;
  cost[at(0, 0)] = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = Math.max(1, i - R); j <= Math.min(n, i + R); j++) {
      const d = 1 - (a[(i - 1) * 3] * b[(j - 1) * 3] + a[(i - 1) * 3 + 1] * b[(j - 1) * 3 + 1] + a[(i - 1) * 3 + 2] * b[(j - 1) * 3 + 2]);
      cost[at(i, j)] = d + Math.min(cost[at(i - 1, j)], cost[at(i, j - 1)], cost[at(i - 1, j - 1)]);
    }
  }
  return cost[at(n, n)] / n;
}

/** How far a stroke is from a template: the warp, divided by the two correction factors. */
export function score(s: Features, t: Features): number {
  const travel = Math.max(MATCH.minDot, dot(s.travel, t.travel));
  const box = Math.max(MATCH.minDot, dot(s.box, t.box));
  return warp(s.dirs, t.dirs) / (travel * box);
}

/** Does the stroke pass the gesture's own gates (a flick's place, length, speed and line)? */
export function fits(s: Features, kind: GestureKind): boolean {
  if (kind === 'shape') return s.length >= MATCH.shape.minLength;
  const F = MATCH.flick;
  return (
    dist(s.start, F.chest) <= F.chestRadius &&
    s.length <= F.maxLength &&
    s.duration <= F.maxDuration &&
    s.straightness >= F.minStraightness
  );
}

/** Read a stroke against a set of gestures. */
export function classify(stroke: Stroke | Features, models: readonly GestureModel[]): Verdict {
  const s = 'dirs' in stroke ? stroke : features(stroke);
  if (s.length < MATCH.minLength) return { id: null, score: Infinity, nearest: null, miss: 'too small' };
  let best = Infinity;
  let bestId: string | null = null;
  let second = Infinity;
  let passed = false;
  for (const m of models) {
    if (!fits(s, m.kind)) continue;
    passed = true;
    let d = Infinity;
    for (const t of m.templates) d = Math.min(d, score(s, t) / m.threshold);
    // Scores are compared as a share of each gesture's own threshold, so a strict gesture isn't crowded out by a loose one.
    if (d < best) {
      second = best;
      best = d;
      bestId = m.id;
    } else if (d < second) second = d;
  }
  if (!passed) return { id: null, score: Infinity, nearest: null, miss: 'too small' };
  if (best > 1) return { id: null, score: best, nearest: bestId, miss: 'no match' };
  if (second < best * MATCH.margin) return { id: null, score: best, nearest: bestId, miss: 'unsure' };
  return { id: bestId, score: best, nearest: bestId };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function dot(a: readonly number[], b: readonly number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function unit(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 1e-9 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 0];
}
