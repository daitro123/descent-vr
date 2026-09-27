import type { Vector3 } from 'three';

// Static collision for an outdoor map: circles (trunks, rocks, posts) and
// boxes turned about +Y (buildings, fences, railings), bucketed on a coarse
// grid so a push-out only tests what's nearby.

export interface Circle {
  x: number;
  z: number;
  r: number;
}

/** A box on the floor plane: half extents along its own X and Z, turned by `yaw` about +Y. */
export interface Box {
  x: number;
  z: number;
  hw: number;
  hd: number;
  yaw: number;
}

const CELL = 8;
/** Largest body radius a query may pass; shapes are bucketed with this much slack. */
const MAX_BODY = 1;

export class Colliders {
  private readonly buckets = new Map<number, { circles: Circle[]; boxes: Box[] }>();
  readonly circles: Circle[] = [];
  readonly boxes: Box[] = [];

  constructor(private readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number }) {}

  addCircle(c: Circle): void {
    this.circles.push(c);
    this.bucket(c.x, c.z, c.r, (b) => b.circles.push(c));
  }

  addBox(b: Box): void {
    this.boxes.push(b);
    this.bucket(b.x, b.z, Math.hypot(b.hw, b.hd), (k) => k.boxes.push(b));
  }

  /** Push a floor point out of every shape, then back inside the bounds. True if it moved. */
  resolve(p: Vector3, radius: number): boolean {
    let moved = false;
    const bucket = this.buckets.get(key(Math.floor(p.x / CELL), Math.floor(p.z / CELL)));
    if (bucket) {
      for (const c of bucket.circles) {
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const min = c.r + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 1e-6;
        p.x = c.x + (dx / d) * min;
        p.z = c.z + (dz / d) * min;
        moved = true;
      }
      for (const b of bucket.boxes) if (pushOutOfBox(p, b, radius)) moved = true;
    }
    const { minX, maxX, minZ, maxZ } = this.bounds;
    if (p.x < minX + radius) (p.x = minX + radius), (moved = true);
    if (p.x > maxX - radius) (p.x = maxX - radius), (moved = true);
    if (p.z < minZ + radius) (p.z = minZ + radius), (moved = true);
    if (p.z > maxZ - radius) (p.z = maxZ - radius), (moved = true);
    return moved;
  }

  /** Is this floor point inside any shape (grown by `radius`)? */
  blocked(x: number, z: number, radius: number): boolean {
    const bucket = this.buckets.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!bucket) return false;
    for (const c of bucket.circles) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + radius) ** 2) return true;
    for (const b of bucket.boxes) {
      const [lx, lz] = toLocal(b, x, z);
      if (Math.abs(lx) < b.hw + radius && Math.abs(lz) < b.hd + radius) return true;
    }
    return false;
  }

  private bucket(x: number, z: number, r: number, add: (b: { circles: Circle[]; boxes: Box[] }) => void): void {
    const reach = r + MAX_BODY;
    for (let i = Math.floor((x - reach) / CELL); i <= Math.floor((x + reach) / CELL); i++) {
      for (let j = Math.floor((z - reach) / CELL); j <= Math.floor((z + reach) / CELL); j++) {
        const k = key(i, j);
        let b = this.buckets.get(k);
        if (!b) this.buckets.set(k, (b = { circles: [], boxes: [] }));
        add(b);
      }
    }
  }
}

function key(i: number, j: number): number {
  return (i + 1000) * 4096 + (j + 1000);
}

/** World floor point → the box's own frame. */
export function toLocal(b: Box, x: number, z: number): [number, number] {
  const dx = x - b.x;
  const dz = z - b.z;
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  return [dx * c - dz * s, dx * s + dz * c];
}

function pushOutOfBox(p: Vector3, b: Box, radius: number): boolean {
  let [lx, lz] = toLocal(b, p.x, p.z);
  const ex = b.hw + radius;
  const ez = b.hd + radius;
  if (Math.abs(lx) >= ex || Math.abs(lz) >= ez) return false;
  if (ex - Math.abs(lx) < ez - Math.abs(lz)) lx = Math.sign(lx || 1) * ex;
  else lz = Math.sign(lz || 1) * ez;
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  p.x = b.x + lx * c + lz * s;
  p.z = b.z - lx * s + lz * c;
  return true;
}
