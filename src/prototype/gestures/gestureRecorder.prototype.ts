// PROTOTYPE (abilities ticket 07): arming a gesture. A stroke is recorded
// while the arming hand's grip is held, and handed to the matcher once, on
// release (the research's recommendation). What it asks:
//
// - The grip goes down past 0.8 and comes up below 0.5 (hysteresis).
// - A grip that goes down in a place taken by something else (the bag at a
//   shoulder, a potion at a hip, the tool loop) never arms.
// - Every frame of the stroke is tracked; a stroke held past 1.6 s (a grip
//   held out of habit through a fight) is dropped, not read.
// - While the class's own attack is in the hand (an arrow nocked, a bolt
//   charging), the stroke is dropped: it's a shot, not a gesture.
//
// Points are kept in the body frame: from the eyes at the moment of arming,
// turned by the head's heading then, so "right" and "forward" mean the same
// wherever you face. Stick turns and walking move the rig, not these points.
// Pure: plain numbers in, events out.

import type { Point, Stroke } from './gestureMatcher.prototype';
import { takenPlace } from './gestureVocab.prototype';

export const ARM = {
  down: 0.8,
  up: 0.5,
  maxDuration: 1.6,
  /** The ring buffer's size: 1.6 s at 90 Hz, and some. */
  capacity: 160,
};

type Xyz = { x: number; y: number; z: number };

/** One frame of the arming hand, in rig space. */
export interface HandFrame {
  hand: Xyz;
  head: Xyz;
  /** Where the head looks, in rig space (only its heading is used). */
  gaze: Xyz;
  squeeze: number;
  tracked: boolean;
  /** The class's plain attack is in this hand (an arrow nocked, a bolt charging). */
  busy: boolean;
  dt: number;
}

export type RecorderEvent =
  | { kind: 'armed'; at: Point }
  /** The grip went down in a place that belongs to something else. */
  | { kind: 'taken'; place: string }
  | { kind: 'stroke'; stroke: Stroke }
  | { kind: 'dropped'; reason: 'lost tracking' | 'held too long' | 'busy' };

export class GestureRecorder {
  /** A stroke is being recorded. */
  armed = false;
  /** The grip is down (armed or not): it must come up before it can arm again. */
  private down = false;
  private spoilt: RecorderEvent | null = null;
  private readonly origin = { x: 0, y: 0, z: 0 };
  /** The body frame's right and forward, in rig space (flat). */
  private rx = 1;
  private rz = 0;
  private readonly xs = new Float32Array(ARM.capacity);
  private readonly ys = new Float32Array(ARM.capacity);
  private readonly zs = new Float32Array(ARM.capacity);
  private readonly ts = new Float32Array(ARM.capacity);
  count = 0;
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
    // Right is (rx, 0, rz), and forward (rz, 0, −rx).
    return [dx * this.rx + dz * this.rz, dy, dx * this.rz - dz * this.rx];
  }

  /** The body frame in rig space: its origin, and right as (rx, 0, rz). */
  frameOf(): { origin: Xyz; rx: number; rz: number } {
    return { origin: this.origin, rx: this.rx, rz: this.rz };
  }

  update(f: HandFrame): RecorderEvent | null {
    if (!this.down) {
      if (f.squeeze < ARM.down) return null;
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
    if (f.squeeze < ARM.up) {
      this.down = false;
      if (!this.armed) return null;
      this.armed = false;
      if (this.spoilt) return this.spoilt;
      return { kind: 'stroke', stroke: this.stroke() };
    }
    if (!this.armed || this.spoilt) return null;
    this.time += f.dt;
    if (!f.tracked) this.spoilt = { kind: 'dropped', reason: 'lost tracking' };
    else if (f.busy) this.spoilt = { kind: 'dropped', reason: 'busy' };
    else if (this.time > ARM.maxDuration || this.count >= ARM.capacity) this.spoilt = { kind: 'dropped', reason: 'held too long' };
    else this.push(this.toBody(f.hand));
    return null;
  }

  /** Stop recording without a verdict (the kit changed mode, or you died). */
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
