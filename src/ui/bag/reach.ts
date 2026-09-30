import { Vector3 } from 'three';
import { CONFIG } from '../../config';
import type { Handedness } from '../../player/input';

// Reaching over your shoulder for the bag, promoted from the bag prototype
// (ui/bag-prototype/reach.ts). A sphere over each shoulder, placed from the
// headset (its position and which way it faces, not its tilt). Squeeze the
// grip with the hand already inside its own shoulder's sphere, moving slower
// than the speed gate, and the bag comes round. The grip has to go down in
// there: a grip already held when the hand arrives doesn't count, and nor does
// an overhead swing, whose hand crosses the sphere fast, grip held or not.

/** A hand this frame: where it is in the world, how fast it moves (m/s, relative to the rig), and its grip. */
export interface HandNow {
  readonly at: Vector3;
  readonly speed: number;
  readonly gripDown: boolean;
}

/** What the reach did this frame. */
export interface ReachEvent {
  readonly hand: Handedness;
  readonly kind: 'grab' | 'tooFast';
  readonly speed: number;
}

const UP = new Vector3(0, 1, 0);
const _fwd = new Vector3();
const _right = new Vector3();

/** Both shoulders' zones, and the buzz while a hand is in one. */
export class ShoulderReach {
  readonly centre: Record<Handedness, Vector3> = { left: new Vector3(), right: new Vector3() };
  readonly inZone: Record<Handedness, boolean> = { left: false, right: false };
  private readonly buzzIn: Record<Handedness, number> = { left: 0, right: 0 };

  /** Put the spheres over the shoulders of a head at `head` looking along `gaze`. */
  place(head: Vector3, gaze: Vector3): void {
    const R = CONFIG.bag.reach;
    _fwd.set(gaze.x, 0, gaze.z);
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
    _fwd.normalize();
    _right.crossVectors(_fwd, UP);
    for (const hand of ['left', 'right'] as const) {
      this.centre[hand]
        .copy(head)
        .addScaledVector(_right, hand === 'right' ? R.side : -R.side)
        .addScaledVector(UP, -R.down)
        .addScaledVector(_fwd, -R.back);
    }
  }

  /**
   * One frame, after `place`. Returns a grab (the grip went down in the zone,
   * slowly enough) or a refusal (it went down in the zone too fast), and calls
   * `buzz` for the light buzz while a slow hand is in its zone.
   */
  update(dt: number, hands: Record<Handedness, HandNow | null>, buzz: (hand: Handedness, intensity: number, ms: number) => void): ReachEvent | null {
    const R = CONFIG.bag.reach;
    let event: ReachEvent | null = null;
    for (const hand of ['left', 'right'] as const) {
      const now = hands[hand];
      const inside = !!now && now.at.distanceTo(this.centre[hand]) < R.radius;
      this.inZone[hand] = inside;
      if (!now || !inside) {
        this.buzzIn[hand] = 0;
        continue;
      }
      const slow = now.speed < R.speedGate;
      if (slow) {
        this.buzzIn[hand] -= dt;
        if (this.buzzIn[hand] <= 0) {
          buzz(hand, R.zoneBuzz.intensity, R.zoneBuzz.ms);
          this.buzzIn[hand] = R.zoneBuzz.every;
        }
      }
      if (now.gripDown && !event) event = { hand, kind: slow ? 'grab' : 'tooFast', speed: now.speed };
    }
    return event;
  }
}
