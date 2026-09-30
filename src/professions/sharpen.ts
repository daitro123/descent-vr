import type { Vector3 } from 'three';
import { CONFIG } from '../config';

// Rubbing the whetstone along an edge, with no three.js scene in it: the
// stone's point and the edge's two ends in, what the rub did out. Carried from
// the bag, the whetstone is rubbed along the blade in the other hand (the
// ranger's along the bow, for the arrowheads); back and forth along it, half a
// metre of travel in all sharpens it (.scratch/professions/issues/17-using-what-professions-make.md).

/** What a frame of rubbing did. */
export type Rubbed =
  /** The stone isn't on the edge. */
  | 'off'
  /** On the edge. */
  | 'on'
  /** On it, and another stroke's worth along it: a scrape. */
  | 'stroke'
  /** Rubbed along it enough: sharpened. */
  | 'done';

export class Sharpen {
  /** Metres rubbed along the edge so far. */
  travel = 0;
  private sinceStroke = 0;
  /** How far along the edge the stone was last frame, or null off it. */
  private last: number | null = null;

  /** One frame: the stone at `stone`, the edge from `base` to `tip` (none: no blade in the other hand). */
  update(stone: Vector3, edge: { readonly base: Vector3; readonly tip: Vector3 } | null): Rubbed {
    const S = CONFIG.professions.sharpen;
    const along = edge && alongEdge(stone, edge.base, edge.tip, S.reach);
    if (along === null || along === undefined) {
      this.last = null;
      return 'off';
    }
    const moved = this.last === null ? 0 : Math.abs(along - this.last);
    this.last = along;
    this.travel += moved;
    this.sinceStroke += moved;
    if (this.travel >= S.travel) return 'done';
    if (this.sinceStroke < S.stroke) return 'on';
    this.sinceStroke = 0;
    return 'stroke';
  }

  /** Start again: the stone let go, or used. */
  reset(): void {
    this.travel = this.sinceStroke = 0;
    this.last = null;
  }
}

/** How far along the edge from `base` (m) the point nearest `p` is, if `p` is within `reach` of it; null otherwise. */
function alongEdge(p: Vector3, base: Vector3, tip: Vector3, reach: number): number | null {
  const ex = tip.x - base.x;
  const ey = tip.y - base.y;
  const ez = tip.z - base.z;
  const len = Math.hypot(ex, ey, ez);
  if (len < 1e-6) return null;
  const t = ((p.x - base.x) * ex + (p.y - base.y) * ey + (p.z - base.z) * ez) / len;
  if (t < -reach || t > len + reach) return null;
  const k = Math.min(Math.max(t, 0), len) / len;
  const d = Math.hypot(p.x - (base.x + ex * k), p.y - (base.y + ey * k), p.z - (base.z + ez * k));
  return d <= reach ? Math.min(Math.max(t, 0), len) : null;
}
