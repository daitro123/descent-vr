import { CONFIG } from '../config';

// A patrol is a camp that walks, as in WoW: its members follow a road end to
// end in single file, pause at each end looking on, then turn and walk back,
// the last in the file leading. This is only where each of them should be
// (their post); the camp sends them there, and holds the file while any of
// them fights or falls behind (camps.ts). No three.js, so the zone's plan can
// place the file where it starts.

/** A point on the floor plane. */
export interface RoadPoint {
  readonly x: number;
  readonly z: number;
}

/** Where one member of the file should be, and which way it faces (as a model turns: 0 faces +Z). */
export interface FileSpot {
  x: number;
  z: number;
  yaw: number;
}

export class PatrolWalk {
  /** The road's length, end to end. */
  readonly length: number;
  /** Metres along the road of the file's middle. */
  private middle = 0;
  /** +1 walking from the road's first point to its last, −1 back. */
  private heading = 1;
  /** Seconds left standing at the end it reached; 0 while walking. */
  private resting = 0;

  constructor(
    readonly road: readonly RoadPoint[],
    /** How many walk in the file. */
    readonly count: number,
  ) {
    let length = 0;
    for (let i = 1; i < road.length; i++) length += Math.hypot(road[i].x - road[i - 1].x, road[i].z - road[i - 1].z);
    this.length = length;
    this.reset();
  }

  /** Is the file standing at an end? */
  get pausing(): boolean {
    return this.resting > 0;
  }

  /** Back to the road's first end, the file's head just leaving it. */
  reset(): void {
    this.middle = this.half;
    this.heading = 1;
    this.resting = 0;
  }

  /**
   * Walk on `dt` s at the patrol's pace; at an end, stand a while, then turn
   * back. `standing` says which members still stand: the file walks until
   * the first of them standing reaches the road's start, or the last its end.
   */
  step(dt: number, standing?: readonly boolean[]): void {
    const { speed, pause, gap } = CONFIG.camps.patrol;
    if (this.resting > 0) {
      this.resting = Math.max(0, this.resting - dt);
      if (this.resting === 0) this.heading = -this.heading;
      return;
    }
    const first = standing ? Math.max(0, standing.indexOf(true)) : 0;
    const last = standing ? Math.max(first, standing.lastIndexOf(true)) : this.count - 1;
    const mid = (this.count - 1) / 2;
    const lo = (mid - first) * gap;
    const hi = Math.max(lo, this.length - (last - mid) * gap);
    this.middle = Math.max(lo, Math.min(hi, this.middle + this.heading * speed * dt));
    if (this.heading > 0 ? this.middle >= hi : this.middle <= lo) this.resting = pause;
  }

  /**
   * Where member `i` should be. The file keeps its order along the road, so
   * the last member leads out and the first leads back. It faces the way it
   * walks, and while it stands at an end it keeps looking on past it.
   */
  spot(i: number, out: FileSpot = { x: 0, z: 0, yaw: 0 }): FileSpot {
    const at = this.middle + (i - (this.count - 1) / 2) * CONFIG.camps.patrol.gap;
    alongRoad(this.road, at, out);
    if (this.heading < 0) out.yaw += Math.PI;
    return out;
  }

  /** Half the file's length: how far its head and tail are from its middle. */
  private get half(): number {
    return ((this.count - 1) * CONFIG.camps.patrol.gap) / 2;
  }
}

/** The point `d` metres along `road` (held to its ends), facing on along it. */
function alongRoad(road: readonly RoadPoint[], d: number, out: FileSpot): void {
  let left = Math.max(0, d);
  for (let i = 1; i < road.length; i++) {
    const a = road[i - 1];
    const b = road[i];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= seg || i === road.length - 1) {
      const t = seg > 0 ? Math.min(1, left / seg) : 0;
      out.x = a.x + (b.x - a.x) * t;
      out.z = a.z + (b.z - a.z) * t;
      out.yaw = Math.atan2(b.x - a.x, b.z - a.z);
      return;
    }
    left -= seg;
  }
  out.x = road[0].x;
  out.z = road[0].z;
  out.yaw = 0;
}

/** How far (x, z) is from the nearest point of `road`. */
export function fromRoad(road: readonly RoadPoint[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < road.length - 1; i++) {
    const a = road[i];
    const dx = road[i + 1].x - a.x;
    const dz = road[i + 1].z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(a.x + dx * t - x, a.z + dz * t - z));
  }
  return road.length === 1 ? Math.hypot(road[0].x - x, road[0].z - z) : best;
}
