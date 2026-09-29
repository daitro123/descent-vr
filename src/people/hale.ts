import { Group, Vector3 } from 'three';
import type { HaleShows } from '../adventureState';
import { CONFIG } from '../config';
import type { Spot } from '../maps/types';
import { createModelMaterial } from '../models/materials';
import { buildPerson, PEOPLE } from '../models/people';
import type { Rig } from '../models/rig';
import { QuestMarker } from '../ui/questMarker';
import type { Ground } from '../world/ground';
import { friendlyPose } from './poses';

// Marshal Hale, the village's guard captain and Oakvale's quest giver, at the
// crossroads: the grey-haired captain in blue and gold on the human body, their
// old longsword sheathed at the left hip and their left hand on its pommel.

/** Turn `from` towards `to` (radians) by the shorter way, `k` of the way. */
function easeAngle(from: number, to: number, k: number): number {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + d * k;
}

/**
 * Hale stands at their spot facing the crossroads. They turn to face you as
 * you come near and wave as you walk up, with the marker for what they have
 * for you floating over their head. One draw call, and the marker.
 */
export class Hale {
  readonly root = new Group();
  readonly marker = new QuestMarker();
  /** The circle nothing walks through: stand it in the World. */
  readonly body: { readonly x: number; readonly z: number; readonly r: number };
  /** Head centre above their feet. */
  readonly headY: number;
  private readonly rig: Rig;
  /** Which way they face at rest: the crossroads' centre. */
  private readonly rest: number;
  /** Seconds of wave left; 0 while not waving. */
  private waving = 0;
  /** Whether they'll wave the next time you walk up. */
  private waveReady = true;
  private t = 0;

  /** At `spot` on `ground`, showing `marker`. */
  constructor(spot: Spot, ground: Ground, marker: HaleShows['marker']) {
    this.rig = buildPerson('hale', createModelMaterial());
    const p = this.rig.proportions;
    this.headY = p.hipY + 0.06 + p.neck + 0.12;
    this.root.name = 'hale';
    this.root.add(this.rig.mesh, this.marker.sprite);
    this.root.position.set(spot.x, ground.heightAt(spot.x, spot.z), spot.z);
    this.root.rotation.y = this.rest = spot.yaw;
    this.body = { x: spot.x, z: spot.z, r: CONFIG.hale.radius };
    this.rig.apply(PEOPLE.hale.stand);
    this.marker.update(0, marker, this.headY + CONFIG.hale.marker);
  }

  get position(): Vector3 {
    return this.root.position;
  }

  /** World position of their head's centre. */
  head(out: Vector3): Vector3 {
    return out.copy(this.root.position).setY(this.root.position.y + this.headY);
  }

  /** Face you when you're near, wave as you walk up, and show `marker` over their head. */
  update(dt: number, you: Vector3, marker: HaleShows['marker']): void {
    const H = CONFIG.hale;
    this.t += dt;
    const dx = you.x - this.root.position.x;
    const dz = you.z - this.root.position.z;
    const d = Math.hypot(dx, dz);
    const want = d < H.turnWithin ? Math.atan2(dx, dz) : this.rest;
    this.root.rotation.y = easeAngle(this.root.rotation.y, want, Math.min(1, dt * H.turnRate));

    if (d > H.waveAgain) this.waveReady = true;
    if (this.waveReady && d < H.waveWithin) {
      this.waveReady = false;
      this.waving = H.waveTime;
    }
    this.waving = Math.max(0, this.waving - dt);
    const wave = this.waving > 0 ? { t: H.waveTime - this.waving, duration: H.waveTime } : undefined;
    this.rig.apply(friendlyPose(PEOPLE.hale.stand, this.t, wave));

    this.marker.update(dt, marker, this.headY + H.marker);
  }
}
