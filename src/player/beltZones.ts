import { type Object3D, Vector3 } from 'three';
import { CONFIG } from '../config';

// Where the belt's zones hang, promoted from the belt prototype
// (player/beltPrototype.ts): a neck point below and behind the eyes, so
// looking down at your hips doesn't move them, and a heading that turns with
// you only once you've looked well away. Each zone is a name and an offset
// from the neck in the belt's own frame. The two hip slots are the potions';
// the Professions map's tool loop is a third zone of the same kind, behind the
// main-hand hip (.scratch/professions/spec.md, "Gathering spots and the tool
// loop"), placed and touched the same way.

/** A place on the belt a hand reaches for. */
export interface BeltZone {
  /** What it is, for the log and the checks: 'leftHip', 'rightHip', or a later build's ('toolLoop'). */
  readonly name: string;
  /** From the neck point in the belt's frame (m): down, out to your right (negative to your left), and ahead (negative behind). */
  readonly offset: { readonly down: number; readonly right: number; readonly ahead: number };
}

const { down, side, ahead } = CONFIG.belt.hip;

/** The potions' slots, in the belt's slot order: the left hip's, then the right's. */
export const HIPS: readonly BeltZone[] = [
  { name: 'leftHip', offset: { down, right: -side, ahead } },
  { name: 'rightHip', offset: { down, right: side, ahead } },
];

const UP = new Vector3(0, 1, 0);
const _fwd = new Vector3();
const _right = new Vector3();

/** The belt's frame this frame: the neck point, and the heading the zones hang from. */
export class BeltFrame {
  readonly neck = new Vector3();
  /** The belt's heading (rad), as `Math.atan2(x, z)` of the way it faces. NaN until first placed. */
  yaw = Number.NaN;

  /**
   * Follow a head (the camera, in world space) by `dt`: the neck moves with it
   * at once, and the heading only once the view has turned more than the dead
   * zone away from it. Looking straight down, the view's heading is noise, so
   * the last is kept.
   */
  update(head: Object3D, dt: number): void {
    const B = CONFIG.belt;
    head.updateMatrixWorld();
    head.localToWorld(this.neck.set(0, -B.neck.below, B.neck.behind));
    // Where the head looks: down its own −Z, a camera's or not.
    _fwd.set(0, 0, -1).transformDirection(head.matrixWorld);
    if (Math.hypot(_fwd.x, _fwd.z) > 0.3) {
      const target = Math.atan2(_fwd.x, _fwd.z);
      if (Number.isNaN(this.yaw)) this.yaw = target;
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) > B.yawDeadzone) this.yaw += (d - Math.sign(d) * B.yawDeadzone) * Math.min(1, dt * 6);
    }
    if (Number.isNaN(this.yaw)) this.yaw = 0;
  }

  /** Where `zone` hangs in the world now. */
  place(zone: BeltZone, out: Vector3): Vector3 {
    _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _right.crossVectors(_fwd, UP);
    const o = zone.offset;
    return out.copy(this.neck).addScaledVector(_fwd, o.ahead).addScaledVector(_right, o.right).addScaledVector(UP, -o.down);
  }

  /** The zone of `zones` nearest `at` within `within` (m) whose index `open` allows, or −1. */
  nearest(zones: readonly BeltZone[], at: Vector3, within: number, open: (i: number) => boolean = () => true): number {
    let best = -1;
    let bestD = within;
    zones.forEach((zone, i) => {
      if (!open(i)) return;
      const d = this.place(zone, _near).distanceTo(at);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }
}

const _near = new Vector3();
