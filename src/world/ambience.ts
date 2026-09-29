import { CONFIG } from '../config';
import type { Interior } from '../save/record';

// Oakvale's ambience, as a plan and two pure rules (spec, "Sound"): which of
// the ambient sounds near you play and which are placed by HRTF, and where
// the next bird calls from. No Web Audio here; fx/ambience.ts plays it.

/** A place that sounds where it is. */
export type PlaceId = 'stream' | 'dock' | 'windmill' | 'forge' | 'anvil' | 'hearth' | 'campfire' | 'mineMouth';

/** A place's sound, where it comes from in world metres, and the building it's in, if any. */
export interface PlaceSound {
  readonly id: PlaceId;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly interior: Interior | null;
}

/** An ambient sound that might play: a place's, or a bird's call (`place` false). */
export interface AmbientSource {
  readonly x: number;
  readonly z: number;
  readonly place: boolean;
}

/** How an ambient sound plays: not at all, panned cheaply, or placed by HRTF. */
export type Voicing = 'off' | 'cheap' | 'hrtf';

type Rules = { readonly most: number; readonly hrtf: number; readonly reach: number };

const _order: number[] = [];
const _dist: number[] = [];

/**
 * Which of `sources` play for you standing at (x, z), written into `out`: the
 * nearest first, at most `most` of them, none beyond `reach` m on the floor
 * plane. Of those, the nearest `hrtf` places' sounds are placed by HRTF; the
 * rest, and every bird, pan cheaply. Ties go to the earlier source.
 */
export function chooseAmbient(
  x: number,
  z: number,
  sources: readonly AmbientSource[],
  out: Voicing[] = [],
  rules: Rules = CONFIG.sound.ambient,
): Voicing[] {
  out.length = sources.length;
  _order.length = 0;
  _dist.length = sources.length;
  for (let i = 0; i < sources.length; i++) {
    out[i] = 'off';
    const d = Math.hypot(sources[i].x - x, sources[i].z - z);
    _dist[i] = d;
    if (d <= rules.reach) _order.push(i);
  }
  _order.sort((a, b) => _dist[a] - _dist[b] || a - b);
  let hrtf = 0;
  for (let k = 0; k < Math.min(_order.length, rules.most); k++) {
    const i = _order[k];
    out[i] = sources[i].place && hrtf < rules.hrtf ? 'hrtf' : 'cheap';
    if (out[i] === 'hrtf') hrtf++;
  }
  return out;
}

/** A tree a bird can call from: its foot, and how tall it stands. */
export interface Tree {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly height: number;
}

/** Where the zone's trees stand, in cells of `cell` m, to find one near a spot quickly. */
export class TreeCover {
  private readonly cells = new Map<number, Tree[]>();

  constructor(
    trees: readonly Tree[],
    private readonly cell = 8,
  ) {
    for (const t of trees) {
      const k = this.key(Math.floor(t.x / cell), Math.floor(t.z / cell));
      const list = this.cells.get(k);
      if (list) list.push(t);
      else this.cells.set(k, [t]);
    }
  }

  /** The nearest tree within `r` m of (x, z) on the floor plane (r no more than a cell), or null. */
  near(x: number, z: number, r: number): Tree | null {
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    let best: Tree | null = null;
    let bestD = r;
    for (let i = cx - 1; i <= cx + 1; i++) {
      for (let j = cz - 1; j <= cz + 1; j++) {
        for (const t of this.cells.get(this.key(i, j)) ?? []) {
          const d = Math.hypot(t.x - x, t.z - z);
          if (d <= bestD) {
            best = t;
            bestD = d;
          }
        }
      }
    }
    return best;
  }

  private key(i: number, j: number): number {
    return (i + 4096) * 8192 + (j + 4096);
  }
}

/** The calls Oakvale's birds make, each a sound by that name. */
export const BIRD_CALLS = ['trill', 'whistle', 'chirps', 'coo'] as const;
export type BirdCall = (typeof BIRD_CALLS)[number];

/** A bird calling: from where, and which call. */
export interface Birdcall {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly call: BirdCall;
}

type BirdRules = {
  readonly every: readonly [number, number];
  readonly near: number;
  readonly far: number;
  readonly tree: number;
  readonly perch: readonly [number, number];
};

/**
 * When and where the next bird calls. Every so often it tries a spot at
 * random, `near` to `far` m from you; a bird calls from the tree nearest it,
 * if one stands within `tree` m, perched up in it. Where the plan has few
 * trees, fewer tries find one, so fewer birds call.
 */
export class BirdSong {
  private wait: number;

  constructor(
    private readonly cover: TreeCover,
    private readonly rand: () => number = Math.random,
    private readonly rules: BirdRules = CONFIG.sound.birds,
  ) {
    this.wait = this.between(rules.every);
  }

  /** One frame with you at (x, z): the bird that calls now, if one does. */
  update(dt: number, x: number, z: number): Birdcall | null {
    this.wait -= dt;
    if (this.wait > 0) return null;
    const { near, far, tree, perch } = this.rules;
    this.wait += this.between(this.rules.every);
    const a = this.rand() * Math.PI * 2;
    // Evenly over the ring's area, not bunched at its inner edge.
    const r = Math.sqrt(near * near + this.rand() * (far * far - near * near));
    const t = this.cover.near(x + Math.sin(a) * r, z + Math.cos(a) * r, tree);
    if (!t) return null;
    const d = Math.hypot(t.x - x, t.z - z);
    if (d < near || d > far) return null;
    const call = BIRD_CALLS[Math.min(BIRD_CALLS.length - 1, Math.floor(this.rand() * BIRD_CALLS.length))];
    return { x: t.x, y: t.y + t.height * this.between(perch), z: t.z, call };
  }

  private between([lo, hi]: readonly [number, number]): number {
    return lo + (hi - lo) * this.rand();
  }
}
