import { CONFIG } from '../../config';
import type { Point, Stroke } from './matcher';

// Arming a gesture, promoted from the prototype (ticket 07). A stroke is
// recorded while the right grip is held, and handed to the matcher once, on
// release:
//
// - The grip goes down past `arm.down` and comes up below `arm.up` (hysteresis).
// - A grip that goes down in a place taken by something else (the bag at a
//   shoulder, a potion at a hip, the tool loop) never arms, until it's let go.
// - Every frame of the stroke is tracked; a stroke held past `arm.maxDuration`
//   (a grip held out of habit through a fight) is dropped, not read.
// - While the class's own attack is in the hand (an arrow nocked, a bolt
//   charging), the stroke is dropped: it's a shot, not a gesture.
//
// Points are kept in the body frame: from the eyes at the moment of arming,
// turned by the head's heading then, so "right" and "forward" mean the same
// wherever you face. Stick turns and walking move the rig, not these points.
// Pure: plain numbers in, events out.

/** The ring buffer's size: the longest stroke at 90 Hz, and some. */
const CAPACITY = Math.ceil(CONFIG.gestures.arm.maxDuration * 100);

type Xyz = { readonly x: number; readonly y: number; readonly z: number };

/** One frame of the right hand, in rig space. */
export interface HandFrame {
  readonly hand: Xyz;
  readonly head: Xyz;
  /** Where the head looks, in rig space (only its heading is used). */
  readonly gaze: Xyz;
  readonly squeeze: number;
  readonly tracked: boolean;
  /** The class's plain attack is in this hand (an arrow nocked, a bolt charging). */
  readonly busy: boolean;
  readonly dt: number;
}

export type RecorderEvent =
  | { readonly kind: 'armed'; readonly at: Point }
  /** The grip went down in a place that belongs to something else. */
  | { readonly kind: 'taken'; readonly place: string }
  | { readonly kind: 'stroke'; readonly stroke: Stroke }
  | { readonly kind: 'dropped'; readonly reason: 'lost tracking' | 'held too long' | 'busy' };

/** Which taken place, if any, a grip at `p` (body frame) is in. */
export function takenPlace(p: Point): string | null {
  for (const z of CONFIG.gestures.taken) {
    if (Math.hypot(p[0] - z.at[0], p[1] - z.at[1], p[2] - z.at[2]) <= z.radius) return z.name;
  }
  return null;
}

export class GestureRecorder {
  /** A stroke is being recorded. */
  armed = false;
  /** Points recorded so far. */
  count = 0;
  /** The grip is down (armed or not): it must come up before it can arm again. */
  private down = false;
  private spoilt: RecorderEvent | null = null;
  private readonly origin = { x: 0, y: 0, z: 0 };
  /** The body frame's right, in rig space (flat): forward is (rz, 0, −rx). */
  private rx = 1;
  private rz = 0;
  private readonly xs = new Float32Array(CAPACITY);
  private readonly ys = new Float32Array(CAPACITY);
  private readonly zs = new Float32Array(CAPACITY);
  private readonly ts = new Float32Array(CAPACITY);
  private time = 0;

  /** The body-frame point `i` of the stroke so far. */
  point(i: number): Point {
    return [this.xs[i], this.ys[i], this.zs[i]];
  }

  /** Where a rig-space point sits in the current body frame. */
  toBody(p: Xyz): Point {
    const dx = p.x - this.origin.x;
    const dy = p.y - this.origin.y;
    const dz = p.z - this.origin.z;
    return [dx * this.rx + dz * this.rz, dy, dx * this.rz - dz * this.rx];
  }

  /** Where a body-frame point sits in rig space (the inverse of `toBody`). */
  toRig(x: number, y: number, z: number): Xyz {
    const o = this.origin;
    return { x: o.x + x * this.rx + z * this.rz, y: o.y + y, z: o.z + x * this.rz - z * this.rx };
  }

  update(f: HandFrame): RecorderEvent | null {
    const A = CONFIG.gestures.arm;
    if (!this.down) {
      if (f.squeeze < A.down) return null;
      this.down = true;
      this.frame(f);
      const at = this.toBody(f.hand);
      const place = takenPlace(at);
      if (place) return { kind: 'taken', place };
      if (!f.tracked) return null;
      this.armed = true;
      this.spoilt = null;
      this.count = 0;
      this.time = 0;
      this.push(at);
      return { kind: 'armed', at };
    }
    if (f.squeeze < A.up) {
      this.down = false;
      if (!this.armed) return null;
      this.armed = false;
      return this.spoilt ?? { kind: 'stroke', stroke: this.stroke() };
    }
    if (!this.armed || this.spoilt) return null;
    this.time += f.dt;
    if (!f.tracked) this.spoilt = { kind: 'dropped', reason: 'lost tracking' };
    else if (f.busy) this.spoilt = { kind: 'dropped', reason: 'busy' };
    else if (this.time > A.maxDuration || this.count >= CAPACITY) this.spoilt = { kind: 'dropped', reason: 'held too long' };
    else this.push(this.toBody(f.hand));
    return null;
  }

  /** Stop recording without a verdict (you died, or gestures were put away); the grip must come up before it arms again. */
  cancel(): void {
    this.armed = false;
    this.spoilt = null;
  }

  /** Fix the body frame from this frame's head. */
  private frame(f: HandFrame): void {
    this.origin.x = f.head.x;
    this.origin.y = f.head.y;
    this.origin.z = f.head.z;
    const l = Math.hypot(f.gaze.x, f.gaze.z);
    // Forward (fx, fz) = gaze flattened; right = forward × up = (−fz, fx).
    const fx = l > 1e-6 ? f.gaze.x / l : 0;
    const fz = l > 1e-6 ? f.gaze.z / l : -1;
    this.rx = -fz;
    this.rz = fx;
  }

  private push(p: Point): void {
    const i = this.count++;
    this.xs[i] = p[0];
    this.ys[i] = p[1];
    this.zs[i] = p[2];
    this.ts[i] = this.time;
  }

  private stroke(): Stroke {
    const points: Point[] = [];
    const times: number[] = [];
    for (let i = 0; i < this.count; i++) {
      points.push(this.point(i));
      times.push(this.ts[i]);
    }
    return { points, times };
  }
}
