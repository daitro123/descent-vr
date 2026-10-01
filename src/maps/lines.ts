import { lerp, type P2, smoothstep } from './forest/noise';
import type { HeightGrid } from './heightGrid';

// Lines laid over a zone's height grid (roads, tracks, a beck, a dyke): how
// far each ground vertex is from one, and where along it, found segment by
// segment over only the vertices within reach, so a zone of half a million
// square metres and a dozen roads plans in a blink. Free of three.js.

/** Each ground vertex's distance from a line's centre (Infinity past `reach`), and where along it the nearest point is: index + fraction. */
export interface LineField {
  readonly d: Float32Array;
  readonly at: Float32Array;
}

/** How far each vertex of `ground` is from `line`, out to `reach` m. */
export function lineField(ground: HeightGrid, line: readonly P2[], reach: number): LineField {
  const d = new Float32Array(ground.data.length).fill(Infinity);
  const at = new Float32Array(ground.data.length);
  for (let s = 0; s < line.length - 1; s++) {
    const [ax, az] = line[s];
    const [bx, bz] = line[s + 1];
    const ex = bx - ax;
    const ez = bz - az;
    const len2 = ex * ex + ez * ez || 1;
    const [i0, i1] = [ground.col(Math.min(ax, bx) - reach), ground.col(Math.max(ax, bx) + reach)];
    const [j0, j1] = [ground.row(Math.min(az, bz) - reach), ground.row(Math.max(az, bz) + reach)];
    for (let j = j0; j <= j1; j++) {
      const z = ground.z(j);
      for (let i = i0; i <= i1; i++) {
        const x = ground.x(i);
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / len2));
        const dist = Math.hypot(x - (ax + ex * t), z - (az + ez * t));
        const k = j * ground.cols + i;
        if (dist < d[k] && dist <= reach) {
          d[k] = dist;
          at[k] = s + t;
        }
      }
    }
  }
  return { d, at };
}

/** `values` (one per line point) read at a fractional index. */
export function along(values: readonly number[], at: number): number {
  const i = Math.min(values.length - 1, Math.floor(at));
  return lerp(values[i], values[Math.min(i + 1, values.length - 1)], at - i);
}

/**
 * Heights along a line, smoothed (`passes` times over ±`window` samples)
 * with its first and last held, if `hold` says so.
 */
export function smoothHeights(heights: readonly number[], window = 5, passes = 4, hold: { first?: boolean; last?: boolean } = { first: true }): number[] {
  let h = [...heights];
  for (let pass = 0; pass < passes; pass++) {
    h = h.map((_, i) => {
      if ((hold.first && i === 0) || (hold.last && i === h.length - 1)) return h[i];
      let sum = 0;
      let n = 0;
      for (let k = Math.max(0, i - window); k <= Math.min(h.length - 1, i + window); k++) {
        sum += h[k];
        n++;
      }
      return sum / n;
    });
  }
  return h;
}

/**
 * Ease the ground to a line's `heights` within `half` m of its centre and
 * blend back to the land by `half + shoulder` m: a road's bed or a dyke's top.
 */
export function flattenTo(ground: HeightGrid, field: LineField, heights: readonly number[], half: number, shoulder: number): void {
  for (let k = 0; k < ground.data.length; k++) {
    const d = field.d[k];
    if (d > half + shoulder) continue;
    ground.data[k] = lerp(ground.data[k], along(heights, field.at[k]), smoothstep(half + shoulder, half, d));
  }
}

/** Ground heights sampled along `line`. */
export function heightsAlong(ground: HeightGrid, line: readonly P2[]): number[] {
  return line.map(([x, z]) => ground.at(x, z));
}

/** A line's length up to each of its points. */
export function lengths(line: readonly P2[]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i++) out.push(out[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  return out;
}

/** The point `s` m along `line`, and the way it runs there (a unit vector). */
export function pointAlong(line: readonly P2[], s: number): { x: number; z: number; dx: number; dz: number } {
  let left = s;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i];
    const [bx, bz] = line[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (left <= len || i === line.length - 2) {
      const t = len ? Math.min(1, left / len) : 0;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / (len || 1), dz: (bz - az) / (len || 1) };
    }
    left -= len;
  }
  const [x, z] = line[0];
  return { x, z, dx: 0, dz: 1 };
}
