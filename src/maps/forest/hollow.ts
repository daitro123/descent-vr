// The open space dug out of the rock: a union of rectangles (rooms and
// lengths of tunnel), each with its floor and ceiling, in some frame of its
// own (x across, z along, as a building's frame). A floor is level, or
// slopes straight along one axis between level ends (a ramp), its ceiling
// keeping its height over it. Pieces meet by overlapping or edge to edge.
// From the pieces come the walls: every side of every piece, less where
// another piece opens off it. The walls are what you bump into and what you
// can't see through; nothing is solid but rock. Pure numbers, no meshes, so
// it runs in unit tests (mine.ts, mineModel.ts).

/** A side of a piece: north is −z, south +z, east +x, west −x. */
export type Side = 'north' | 'south' | 'east' | 'west';

/** Across (x) or along (z) the frame. */
export type Axis = 'x' | 'z';

/** A room or a length of tunnel. */
export interface Piece {
  /** Its extent: x from x0 to x1, z from z0 to z1. */
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  /** Its floor, over the frame's origin. */
  readonly floor: number;
  /** Floor to ceiling. */
  readonly height: number;
  /**
   * A ramp: the floor is `floor` up to `from` along `axis`, `floor + rise`
   * from `to` on, and straight between. Level where it meets its neighbours.
   */
  readonly slope?: Slope;
  /** Which part of the whole it belongs to, counting from 0 at the way in. */
  readonly part: number;
  /** Sides with no wall at all: the way in from outside. */
  readonly open?: readonly Side[];
}

/** How a piece's floor slopes: see `Piece.slope`. */
export interface Slope {
  readonly axis: Axis;
  readonly from: number;
  readonly to: number;
  readonly rise: number;
}

/** A piece's floor at (x, z), over the frame's origin. */
export function floorOf(p: Piece, x: number, z: number): number {
  const s = p.slope;
  if (!s) return p.floor;
  const t = ((s.axis === 'x' ? x : z) - s.from) / (s.to - s.from);
  return p.floor + s.rise * Math.max(0, Math.min(1, t));
}

/** Where a piece's floor bends along `axis` inside [a, b]: the ends of its slope. */
export function bends(p: Piece, axis: Axis, a: number, b: number): number[] {
  const s = p.slope;
  if (!s || s.axis !== axis) return [];
  return [s.from, s.to].filter((m) => m > Math.min(a, b) + EPS && m < Math.max(a, b) - EPS).sort((u, v) => (a < b ? u - v : v - u));
}

/** A stretch of wall: from a to b along a piece's side, facing into the open space. */
export interface Wall {
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
  /** Its normal, pointing into the open space. */
  readonly nx: number;
  readonly nz: number;
  /** The piece whose side it is. */
  readonly piece: number;
}

/** Where a piece's side opens onto another piece with a lower ceiling or a higher floor: the wall above or below the opening. */
export interface Lintel {
  readonly wall: Wall;
  /** From and to, over the frame's origin, at the wall's a end… */
  readonly a: readonly [number, number];
  /** …and at its b end (they differ where floors slope). */
  readonly b: readonly [number, number];
}

/** A rectangle x0..x1 by z0..z1. */
export interface Rect {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

const EPS = 1e-6;

export class Hollow {
  /** Every wall, for bumping into and seeing through. */
  readonly walls: readonly Wall[];
  /** The rock over or under each opening between pieces whose ceilings or floors differ. */
  readonly lintels: readonly Lintel[];

  constructor(readonly pieces: readonly Piece[]) {
    const walls: Wall[] = [];
    const lintels: Lintel[] = [];
    pieces.forEach((p, i) => {
      for (const side of ['north', 'south', 'east', 'west'] as const) {
        if (p.open?.includes(side)) continue;
        for (const w of sideWalls(pieces, i, side)) {
          if (w.by === null) walls.push(w.wall);
          else {
            const q = pieces[w.by];
            const { ax, az, bx, bz } = w.wall;
            // Floors and ceilings at each end of the opening, mine and theirs.
            const [mineA, mineB] = [floorOf(p, ax, az), floorOf(p, bx, bz)];
            const [theirsA, theirsB] = [floorOf(q, ax, az), floorOf(q, bx, bz)];
            const [topA, topB] = [mineA + p.height, mineB + p.height];
            const [lowA, lowB] = [theirsA + q.height, theirsB + q.height];
            if (lowA < topA - EPS || lowB < topB - EPS) lintels.push({ wall: w.wall, a: [Math.min(lowA, topA), topA], b: [Math.min(lowB, topB), topB] });
            if (theirsA > mineA + EPS || theirsB > mineB + EPS) lintels.push({ wall: w.wall, a: [mineA, Math.max(mineA, theirsA)], b: [mineB, Math.max(mineB, theirsB)] });
          }
        }
      }
    });
    this.walls = walls;
    this.lintels = lintels;
  }

  /** Is (x, z) in the open space? */
  contains(x: number, z: number): boolean {
    for (const p of this.pieces) if (within(p, x, z)) return true;
    return false;
  }

  /** The piece holding (x, z) that belongs to the deepest part, or the nearest piece if none holds it. */
  pieceAt(x: number, z: number): Piece {
    let best: Piece | null = null;
    for (const p of this.pieces) if (within(p, x, z) && (!best || p.part > best.part)) best = p;
    if (best) return best;
    let gap = Infinity;
    for (const p of this.pieces) {
      const d = distanceTo(p, x, z);
      if (d < gap) {
        best = p;
        gap = d;
      }
    }
    return best!;
  }

  /** The floor at (x, z): the deepest part's there, or the nearest piece's. */
  floorAt(x: number, z: number): number {
    return floorOf(this.pieceAt(x, z), x, z);
  }

  /** How far (x, z) is from the open space: 0 inside it. */
  distance(x: number, z: number): number {
    let d = Infinity;
    for (const p of this.pieces) d = Math.min(d, distanceTo(p, x, z));
    return d;
  }

  /**
   * Keep a body of `radius` at `p` in the open space, `radius` off every
   * wall: out of the rock onto the nearest wall's open side, then off each
   * wall it's too close to. True if it moved.
   */
  resolve(p: { x: number; z: number }, radius: number): boolean {
    let moved = false;
    for (let pass = 0; pass < 4; pass++) {
      const inside = this.contains(p.x, p.z);
      let best: Wall | null = null;
      let bestD2 = Infinity;
      let cx = 0;
      let cz = 0;
      for (const w of this.walls) {
        closestOn(w, p.x, p.z);
        const d2 = (p.x - _on.x) ** 2 + (p.z - _on.z) ** 2;
        if (d2 < bestD2) {
          best = w;
          bestD2 = d2;
          cx = _on.x;
          cz = _on.z;
        }
      }
      if (!best) return moved;
      if (inside) {
        if (bestD2 >= radius * radius - EPS) return moved;
        const d = Math.sqrt(bestD2);
        p.x = cx + (d > 1e-6 ? (p.x - cx) / d : best.nx) * radius;
        p.z = cz + (d > 1e-6 ? (p.z - cz) / d : best.nz) * radius;
      } else {
        p.x = cx + best.nx * radius;
        p.z = cz + best.nz * radius;
      }
      moved = true;
    }
    return moved;
  }

  /** Is the straight line from a to b clear of rock? */
  sees(ax: number, az: number, bx: number, bz: number): boolean {
    for (const w of this.walls) if (crosses(ax, az, bx, bz, w.ax, w.az, w.bx, w.bz)) return false;
    return true;
  }

  /** Each piece's floor, less where an earlier piece's already is: no two floors are laid over each other. */
  floors(): { piece: number; rect: Rect }[] {
    return this.pieces.flatMap((p, i) => minus(p, this.pieces.filter((_, j) => j < i)).map((rect) => ({ piece: i, rect })));
  }

  /** Each piece's ceiling, less where a higher one is (or an earlier one as high), judged where the two overlap. */
  ceilings(): { piece: number; rect: Rect }[] {
    return this.pieces.flatMap((p, i) =>
      minus(
        p,
        this.pieces.filter((q, j) => {
          if (j === i) return false;
          const x = (Math.max(p.x0, q.x0) + Math.min(p.x1, q.x1)) / 2;
          const z = (Math.max(p.z0, q.z0) + Math.min(p.z1, q.z1)) / 2;
          const mine = floorOf(p, x, z) + p.height;
          const theirs = floorOf(q, x, z) + q.height;
          return theirs > mine + EPS || (Math.abs(theirs - mine) <= EPS && j < i);
        }),
      ).map((rect) => ({ piece: i, rect })),
    );
  }
}

function within(p: Rect, x: number, z: number): boolean {
  return x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1;
}

function distanceTo(p: Rect, x: number, z: number): number {
  return Math.hypot(Math.max(p.x0 - x, 0, x - p.x1), Math.max(p.z0 - z, 0, z - p.z1));
}

/**
 * One side of piece `i`, as stretches of wall (`by` null) and openings onto
 * another piece (`by` its index). A stretch that lies inside another piece,
 * or on another piece's side from the far side, opens onto it; a stretch on
 * an earlier piece's side from the same side is that piece's wall already.
 */
function sideWalls(pieces: readonly Piece[], i: number, side: Side): { wall: Wall; by: number | null }[] {
  const p = pieces[i];
  // The side as a line at `at` (x for east and west, z for north and south), running `from` to `to` along the other axis.
  const alongX = side === 'north' || side === 'south';
  const at = side === 'north' ? p.z0 : side === 'south' ? p.z1 : side === 'west' ? p.x0 : p.x1;
  const [from, to] = alongX ? [p.x0, p.x1] : [p.z0, p.z1];
  // Which way the open space lies from the line: +1 towards larger coordinates.
  const inward = side === 'north' || side === 'west' ? 1 : -1;
  const cuts: { a: number; b: number; by: number; opening: boolean }[] = [];
  pieces.forEach((q, j) => {
    if (j === i) return;
    const [lo, hi] = alongX ? [q.z0, q.z1] : [q.x0, q.x1];
    const [qa, qb] = alongX ? [q.x0, q.x1] : [q.z0, q.z1];
    const a = Math.max(from, qa);
    const b = Math.min(to, qb);
    if (b - a <= EPS) return;
    if (at > lo + EPS && at < hi - EPS) cuts.push({ a, b, by: j, opening: true });
    else if (Math.abs(at - lo) <= EPS || Math.abs(at - hi) <= EPS) {
      // On q's side: from the far side it's an opening; from the same side, the earlier piece keeps the wall.
      const qInward = Math.abs(at - lo) <= EPS ? 1 : -1;
      if (qInward !== inward) cuts.push({ a, b, by: j, opening: true });
      else if (j < i) cuts.push({ a, b, by: j, opening: false });
    }
  });
  // Split [from, to] at every cut's ends, and give each stretch to whoever takes it.
  const marks = [...new Set([from, to, ...cuts.flatMap((c) => [c.a, c.b])])].filter((m) => m >= from && m <= to).sort((u, v) => u - v);
  const out: { wall: Wall; by: number | null }[] = [];
  for (let k = 0; k < marks.length - 1; k++) {
    const a = marks[k];
    const b = marks[k + 1];
    if (b - a <= EPS) continue;
    const mid = (a + b) / 2;
    const cut = cuts.find((c) => c.a <= mid && c.b >= mid);
    if (cut && !cut.opening) continue;
    const wall: Wall = alongX
      ? { ax: a, az: at, bx: b, bz: at, nx: 0, nz: inward, piece: i }
      : { ax: at, az: a, bx: at, bz: b, nx: inward, nz: 0, piece: i };
    const last = out[out.length - 1];
    const by = cut ? cut.by : null;
    // Join a stretch onto the last one when nothing changes between them.
    if (last && last.by === by && (alongX ? last.wall.bx : last.wall.bz) === a) {
      out[out.length - 1] = { wall: alongX ? { ...last.wall, bx: b } : { ...last.wall, bz: b }, by };
    } else out.push({ wall, by });
  }
  return out;
}

/** The point on wall `w` nearest (x, z). */
/** The closest point on a wall to (x, z), written to `_on` (it runs for every body every frame: no garbage). */
const _on = { x: 0, z: 0 };
function closestOn(w: Wall, x: number, z: number): void {
  const dx = w.bx - w.ax;
  const dz = w.bz - w.az;
  const t = Math.max(0, Math.min(1, ((x - w.ax) * dx + (z - w.az) * dz) / (dx * dx + dz * dz || 1)));
  _on.x = w.ax + dx * t;
  _on.z = w.az + dz * t;
}

/** Do segments ab and cd meet (touching counts)? */
function crosses(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): boolean {
  const d1 = orient(cx, cz, dx, dz, ax, az);
  const d2 = orient(cx, cz, dx, dz, bx, bz);
  const d3 = orient(ax, az, bx, bz, cx, cz);
  const d4 = orient(ax, az, bx, bz, dx, dz);
  if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) return true;
  const on = (o: number, px: number, pz: number, qx: number, qz: number, rx: number, rz: number) =>
    Math.abs(o) <= EPS && rx >= Math.min(px, qx) - EPS && rx <= Math.max(px, qx) + EPS && rz >= Math.min(pz, qz) - EPS && rz <= Math.max(pz, qz) + EPS;
  return on(d1, cx, cz, dx, dz, ax, az) || on(d2, cx, cz, dx, dz, bx, bz) || on(d3, ax, az, bx, bz, cx, cz) || on(d4, ax, az, bx, bz, dx, dz);
}

function orient(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  return (bx - ax) * (pz - az) - (bz - az) * (px - ax);
}

/** `r` less every rectangle in `cut`, as rectangles. */
export function minus(r: Rect, cut: readonly Rect[]): Rect[] {
  let left: Rect[] = [{ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 }];
  for (const c of cut) {
    const next: Rect[] = [];
    for (const a of left) {
      const x0 = Math.max(a.x0, c.x0);
      const x1 = Math.min(a.x1, c.x1);
      const z0 = Math.max(a.z0, c.z0);
      const z1 = Math.min(a.z1, c.z1);
      if (x1 - x0 <= EPS || z1 - z0 <= EPS) {
        next.push(a);
        continue;
      }
      if (z0 - a.z0 > EPS) next.push({ x0: a.x0, x1: a.x1, z0: a.z0, z1: z0 });
      if (a.z1 - z1 > EPS) next.push({ x0: a.x0, x1: a.x1, z0: z1, z1: a.z1 });
      if (x0 - a.x0 > EPS) next.push({ x0: a.x0, x1: x0, z0, z1 });
      if (a.x1 - x1 > EPS) next.push({ x0: x1, x1: a.x1, z0, z1 });
    }
    left = next;
  }
  return left;
}
