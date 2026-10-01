import { Group, type Vector3 } from 'three';
import type { Pose, Rig } from '../models/rig';
import type { Ground } from '../world/ground';

// One who lies dead where they fell (maps/types.ts `PersonPlan.fallen`): the
// diggers by the open barrow. Posed once, face down, and never stepped again:
// no breath, no bark, nothing solid to bump into. Built and dropped by the
// population like any villager, so a field of them costs only those near you.

/**
 * Face down: the right arm flung out past the head, the left along the side,
 * the head turned to the left, the left leg drawn out and the right knee bent.
 * The rig's axes as rig.ts has them, the body lying along its own +Y.
 */
export const FALLEN: Pose = {
  spine: [0.05, 0, 0.04],
  head: [-0.25, 0.95, 0],
  jaw: [0.15, 0, 0],
  upperArmR: [-2.75, 0, -0.35],
  forearmR: [-0.25, 0, 0],
  handR: [0.2, 0, 0],
  upperArmL: [0.15, 0, 0.3],
  forearmL: [-0.35, 0, 0],
  thighL: [0.05, 0, 0.35],
  shinL: [0.25, 0, 0],
  thighR: [0.1, 0, -0.08],
  shinR: [0.5, 0, 0],
};

/** How high over the ground the spine lies: the front of the body at bind, within a lean body's and a stout one's. */
const lift = (rig: Rig) => {
  const geometry = rig.mesh.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  return Math.min(0.2, Math.max(0.1, geometry.boundingBox!.max.z * 0.8));
};

export class Fallen {
  readonly root = new Group();

  constructor(
    readonly id: string,
    readonly rig: Rig,
    spot: { readonly x: number; readonly z: number; readonly yaw: number },
    ground: Ground,
  ) {
    this.root.name = id;
    rig.apply(FALLEN);
    // Feet at the spot, the head a body's length the way they faced, the body along the slope between.
    const { proportions: p } = rig;
    const long = p.hipY + p.spine + p.neck;
    const feet = ground.heightAt(spot.x, spot.z);
    const head = ground.heightAt(spot.x + Math.sin(spot.yaw) * long, spot.z + Math.cos(spot.yaw) * long);
    this.root.position.set(spot.x, feet + lift(rig), spot.z);
    this.root.rotation.order = 'YXZ';
    this.root.rotation.set(Math.PI / 2 - Math.atan2(head - feet, long), spot.yaw, 0);
    this.root.add(rig.mesh);
    // Never moves again: its matrices are worked out once, here.
    this.root.updateMatrixWorld(true);
    this.root.matrixAutoUpdate = false;
    rig.mesh.traverse((o) => (o.matrixAutoUpdate = false));
  }

  /** Never drawn for the barks: they say nothing. */
  readonly shown = false;

  /** Nothing to step. */
  update(): void {}

  far(you: Vector3): number {
    return Math.hypot(you.x - this.root.position.x, you.z - this.root.position.z);
  }

  say(): void {}

  dispose(): void {
    this.root.removeFromParent();
  }
}
