import type { Deck } from './forest/layout';

// Decks you walk on above the ground: a bridge's span, a boardwalk over a
// bog, a stilt town's walkways. A deck's centre line runs along its own Z;
// its height runs from `y0` at one end to `y1` at the other, arched by
// `rise` in the middle. Bucketed on a coarse grid, so a zone with hundreds of
// them still answers a height in a few tests.

export type { Deck };

const CELL = 8;

/** Floor point → the deck's own frame. */
function local(d: Deck, x: number, z: number): [number, number] {
  const dx = x - d.x;
  const dz = z - d.z;
  const c = Math.cos(d.yaw);
  const s = Math.sin(d.yaw);
  return [dx * c - dz * s, dx * s + dz * c];
}

export class Decks {
  private readonly buckets = new Map<number, Deck[]>();

  constructor(readonly list: readonly Deck[]) {
    for (const d of list) {
      const r = Math.hypot(d.hw, d.hd);
      for (let i = Math.floor((d.x - r) / CELL); i <= Math.floor((d.x + r) / CELL); i++) {
        for (let j = Math.floor((d.z - r) / CELL); j <= Math.floor((d.z + r) / CELL); j++) {
          const k = key(i, j);
          let b = this.buckets.get(k);
          if (!b) this.buckets.set(k, (b = []));
          b.push(d);
        }
      }
    }
  }

  /** The highest deck's floor over (x, z), or -Infinity where there's none. */
  at(x: number, z: number): number {
    const bucket = this.buckets.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    let h = -Infinity;
    if (!bucket) return h;
    for (const d of bucket) {
      const [lx, lz] = local(d, x, z);
      if (Math.abs(lx) > d.hw || Math.abs(lz) > d.hd) continue;
      const t = (lz + d.hd) / (2 * d.hd);
      h = Math.max(h, d.y0 + (d.y1 - d.y0) * t + d.rise * Math.sin(Math.PI * t));
    }
    return h;
  }

  /** Is (x, z) on a deck, `margin` m in from its sides? */
  on(x: number, z: number, margin = 0): boolean {
    const bucket = this.buckets.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    return !!bucket?.some((d) => {
      const [lx, lz] = local(d, x, z);
      return Math.abs(lx) <= d.hw + margin && Math.abs(lz) <= d.hd + margin;
    });
  }
}

function key(i: number, j: number): number {
  return (i + 1000) * 4096 + (j + 1000);
}

/** A deck along the floor from `a` to `b`, `width` across, its ends at heights `ya` and `yb`, arched by `rise`. */
export function deckBetween(a: readonly [number, number], b: readonly [number, number], width: number, ya: number, yb: number, rise = 0): Deck {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  // Its own +Z runs from a to b: the yaw a model turns by to face that way.
  return { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]), hw: width / 2, hd: len / 2, y0: ya, y1: yb, rise };
}
