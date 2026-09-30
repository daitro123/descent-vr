import { type Camera, type Object3D, Quaternion, Vector3 } from 'three';

const _head = new Vector3();
const _want = new Vector3();
const _q = new Quaternion();

/** Where something floats in your view: its way from your eyes (x right, y up, −z ahead), how far out, and how quickly it catches up as you turn (per s). */
export interface FollowRules {
  readonly direction: readonly [number, number, number];
  readonly distance: number;
  readonly lag: number;
}

/**
 * Keeps something floating in your view, lagging your head a little so it
 * drifts rather than sticks, and facing you: the quest tracker, the zone's
 * name.
 */
export class HeadFollow {
  /** Where it floats from your eyes, lagging where it wants to be. */
  private readonly dir = new Vector3();
  private placed = false;

  constructor(private readonly rules: FollowRules) {}

  /** Put it straight where it wants to be the next time, with no drift: it's just come into view. */
  reset(): void {
    this.placed = false;
  }

  /** Move `object` on by `dt` towards where it wants to be in `camera`'s view. */
  place(object: Object3D, camera: Camera, dt: number): void {
    const { direction, distance, lag } = this.rules;
    camera.getWorldPosition(_head);
    _want.set(...direction).normalize().applyQuaternion(camera.getWorldQuaternion(_q));
    if (this.placed) this.dir.lerp(_want, Math.min(1, dt * lag)).normalize();
    else this.dir.copy(_want);
    this.placed = true;
    object.position.copy(_head).addScaledVector(this.dir, distance);
    object.lookAt(_head);
  }
}
