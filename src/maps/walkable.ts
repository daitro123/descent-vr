import type { Vector3 } from 'three';

// Where you can walk in a zone: a shape on the floor plane, the union of some
// convex areas (Oakvale's play square now; its pass's corridor and the moor
// later). A body is kept inside it with its whole radius; where two areas
// meet, their shared edges don't count, so you walk from one into the other.

type P2 = readonly [number, number];

/** A stretch of the shape's outline, and which way is in. */
interface Edge {
  readonly a: P2;
  readonly b: P2;
  /** Unit normal pointing into the shape. */
  readonly nx: number;
  readonly nz: number;
}

export class Walkable {
  /** The box round it all. */
  readonly bounds: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number };
  private readonly edges: Edge[] = [];

  /** `areas` are convex polygons, their corners in order either way round. */
  constructor(private readonly areas: readonly (readonly P2[])[]) {
    const xs = areas.flat().map((p) => p[0]);
    const zs = areas.flat().map((p) => p[1]);
    this.bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
    areas.forEach((area, k) => {
      const turn = Math.sign(signedArea(area));
      for (let i = 0; i < area.length; i++) {
        const a = area[i];
        const b = area[(i + 1) % area.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        // Counter-clockwise round (x east, z south), in is to the left of a→b.
        const nx = (-(b[1] - a[1]) / len) * turn;
        const nz = ((b[0] - a[0]) / len) * turn;
        for (const [s, t] of outside(a, b, areas.filter((_, m) => m !== k))) {
          const at = (u: number): P2 => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
          this.edges.push({ a: at(s), b: at(t), nx, nz });
        }
      }
    });
  }

  /** A rectangle, as the one area of a shape. */
  static rect(minX: number, maxX: number, minZ: number, maxZ: number): Walkable {
    return new Walkable([
      [
        [minX, minZ],
        [maxX, minZ],
        [maxX, maxZ],
        [minX, maxZ],
      ],
    ]);
  }

  /** Is (x, z) inside the shape? */
  contains(x: number, z: number): boolean {
    return this.areas.some((area) => inside(area, x, z));
  }

  /** How far (x, z) is outside the shape: 0 inside it. */
  distance(x: number, z: number): number {
    if (this.contains(x, z)) return 0;
    let best = Infinity;
    for (const e of this.edges) best = Math.min(best, Math.hypot(...offset(e, x, z)));
    return best;
  }

  /** Push a point on the floor plane back inside the shape with `radius` to spare. True if it moved. */
  keepInside(p: Vector3, radius: number): boolean {
    let moved = false;
    // A corner takes a push off each edge meeting there.
    for (let pass = 0; pass < 4; pass++) {
      if (!this.contains(p.x, p.z)) {
        // Outside: onto the nearest edge, then in off it.
        let nearest: { e: Edge; dx: number; dz: number } | null = null;
        for (const e of this.edges) {
          const [dx, dz] = offset(e, p.x, p.z);
          if (!nearest || Math.hypot(dx, dz) < Math.hypot(nearest.dx, nearest.dz)) nearest = { e, dx, dz };
        }
        if (!nearest) return moved;
        p.x += -nearest.dx + nearest.e.nx * radius;
        p.z += -nearest.dz + nearest.e.nz * radius;
        moved = true;
        continue;
      }
      // Inside: away from any edge nearer than `radius`.
      let pushed = false;
      for (const e of this.edges) {
        const [dx, dz] = offset(e, p.x, p.z);
        const d = Math.hypot(dx, dz);
        if (d >= radius - 1e-9) continue;
        const [ux, uz] = d > 1e-6 ? [dx / d, dz / d] : [e.nx, e.nz];
        p.x += ux * (radius - d);
        p.z += uz * (radius - d);
        pushed = moved = true;
      }
      if (!pushed) break;
    }
    return moved;
  }
}

/** From the nearest point of edge `e` to (x, z). */
function offset(e: Edge, x: number, z: number): [number, number] {
  const ex = e.b[0] - e.a[0];
  const ez = e.b[1] - e.a[1];
  const t = Math.max(0, Math.min(1, ((x - e.a[0]) * ex + (z - e.a[1]) * ez) / (ex * ex + ez * ez || 1)));
  return [x - (e.a[0] + ex * t), z - (e.a[1] + ez * t)];
}

function signedArea(area: readonly P2[]): number {
  let s = 0;
  for (let i = 0; i < area.length; i++) {
    const [x0, z0] = area[i];
    const [x1, z1] = area[(i + 1) % area.length];
    s += x0 * z1 - x1 * z0;
  }
  return s / 2;
}

/** Is (x, z) inside the convex `area` (its edges included)? */
function inside(area: readonly P2[], x: number, z: number): boolean {
  let sign = 0;
  for (let i = 0; i < area.length; i++) {
    const [x0, z0] = area[i];
    const [x1, z1] = area[(i + 1) % area.length];
    const cross = (x1 - x0) * (z - z0) - (z1 - z0) * (x - x0);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

/** The stretches of segment a→b (as fractions along it) that lie outside every one of `others`' interiors. */
function outside(a: P2, b: P2, others: readonly (readonly P2[])[]): [number, number][] {
  let spans: [number, number][] = [[0, 1]];
  for (const area of others) {
    const cut = clip(a, b, area);
    if (!cut) continue;
    const [s, t] = cut;
    spans = spans.flatMap(([u, v]): [number, number][] => {
      const out: [number, number][] = [];
      if (s > u) out.push([u, Math.min(v, s)]);
      if (t < v) out.push([Math.max(u, t), v]);
      return out.filter(([p, q]) => q - p > 1e-9);
    });
  }
  return spans;
}

/** The part of segment a→b strictly inside the convex `area`, as fractions along it; null if none. */
function clip(a: P2, b: P2, area: readonly P2[]): [number, number] | null {
  const turn = Math.sign(signedArea(area));
  let s = 0;
  let t = 1;
  for (let i = 0; i < area.length; i++) {
    const p = area[i];
    const q = area[(i + 1) % area.length];
    // Inward normal of the area's edge p→q, and how far in a and b are.
    const nx = -(q[1] - p[1]) * turn;
    const nz = (q[0] - p[0]) * turn;
    const da = (a[0] - p[0]) * nx + (a[1] - p[1]) * nz;
    const db = (b[0] - p[0]) * nx + (b[1] - p[1]) * nz;
    // Strictly inside: a segment lying along the area's edge is outside it.
    if (da <= 1e-9 && db <= 1e-9) return null;
    if (da < 0 || db < 0) {
      const u = da / (da - db);
      if (da < 0) s = Math.max(s, u);
      else t = Math.min(t, u);
    }
  }
  return t - s > 1e-9 ? [s, t] : null;
}
