import { Vector3 } from 'three';
import type { Handedness } from '../../player/input';

// PROTOTYPE (The bag and the gear panel): reaching over your shoulder for the
// bag. A sphere over each shoulder, placed from the headset (its position and
// which way it faces, not its tilt). Squeeze the grip with the hand already
// inside its own shoulder's sphere, moving slower than the speed gate, and
// the bag comes round. The grip has to go down in there: a grip already held
// when the hand arrives doesn't count. So does an overhead swing, whose hand
// crosses the sphere fast, grip held or not. Throwaway.

export const REACH = {
  /** The sphere's centre from the eyes: out to the side, down and back (m). */
  side: 0.2,
  down: 0.14,
  back: 0.12,
  /** Its radius (m). */
  radius: 0.18,
  /** The hand must move slower than this (m/s) when the grip goes down. */
  speedGate: 1.5,
  /** How quickly the measured hand speed follows the hand (s). */
  speedLag: 0.03,
  /** The light buzz while a slow hand is in the zone: this strong, this long, this often. */
  zoneBuzz: { intensity: 0.15, ms: 25, every: 0.2 },
  /** The pulse as the bag opens, and as it closes. */
  openPulse: { intensity: 0.9, ms: 90 },
  closePulse: { intensity: 0.5, ms: 60 },
};

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
    _fwd.set(gaze.x, 0, gaze.z);
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
    _fwd.normalize();
    _right.crossVectors(_fwd, UP);
    for (const hand of ['left', 'right'] as const) {
      this.centre[hand]
        .copy(head)
        .addScaledVector(_right, hand === 'right' ? REACH.side : -REACH.side)
        .addScaledVector(UP, -REACH.down)
        .addScaledVector(_fwd, -REACH.back);
    }
  }

  /**
   * One frame, after `place`. Returns a grab (the grip went down in the zone,
   * slowly enough) or a refusal (it went down in the zone too fast), and calls
   * `buzz` for the light buzz while a slow hand is in its zone.
   */
  update(dt: number, hands: Record<Handedness, HandNow | null>, buzz: (hand: Handedness, intensity: number, ms: number) => void): ReachEvent | null {
    let event: ReachEvent | null = null;
    for (const hand of ['left', 'right'] as const) {
      const now = hands[hand];
      const inside = !!now && now.at.distanceTo(this.centre[hand]) < REACH.radius;
      this.inZone[hand] = inside;
      if (!now || !inside) {
        this.buzzIn[hand] = 0;
        continue;
      }
      const slow = now.speed < REACH.speedGate;
      if (slow) {
        this.buzzIn[hand] -= dt;
        if (this.buzzIn[hand] <= 0) {
          buzz(hand, REACH.zoneBuzz.intensity, REACH.zoneBuzz.ms);
          this.buzzIn[hand] = REACH.zoneBuzz.every;
        }
      }
      if (now.gripDown && !event) event = { hand, kind: slow ? 'grab' : 'tooFast', speed: now.speed };
    }
    return event;
  }
}
