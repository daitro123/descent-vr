import { Vector3 } from 'three';
import { CONFIG } from '../config';

/** The hand turning back further than this from its travel starts a new swing. */
const TURN_BACK = Math.cos((100 * Math.PI) / 180);

const _dir = new Vector3();

/**
 * Tells a committed swing from a wiggle. A wrist flick can whip a metre of
 * blade past the damage speed while the hand barely moves; a real swing
 * carries the hand with it. So a swing counts once the hand has travelled
 * `minSwingTravel` in one direction at `swingHandSpeed` or more. Turning back
 * starts over from zero, so shaking the sword never adds up to a hit.
 */
export class SwingDetector {
  /** This swing has carried the hand far enough to hurt. */
  committed = false;
  private active = false;
  private slow = 0; // s the hand has been below swing speed
  private readonly start = new Vector3();
  private readonly dir = new Vector3();

  /** Feed the hand's position and velocity (rig space) once a frame. */
  update(hand: Vector3, velocity: Vector3, dt: number): void {
    const S = CONFIG.sword;
    const speed = velocity.length();
    if (speed < S.swingHandSpeed) {
      this.slow += dt;
      if (this.slow > S.swingGrace) this.reset();
      return;
    }
    this.slow = 0;
    _dir.copy(velocity).divideScalar(speed);
    if (!this.active || _dir.dot(this.dir) < TURN_BACK) {
      // A new swing, or the hand turned back: count from where it was last frame.
      this.active = true;
      this.committed = false;
      this.start.copy(hand).addScaledVector(velocity, -dt);
      this.dir.copy(_dir);
    } else {
      this.dir.lerp(_dir, 0.25).normalize(); // follow the arc as it curves
    }
    if (hand.distanceTo(this.start) >= S.minSwingTravel) this.committed = true;
  }

  reset(): void {
    this.active = this.committed = false;
    this.slow = 0;
  }
}
