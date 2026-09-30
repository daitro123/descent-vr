import { type Object3D, type PerspectiveCamera, Vector3 } from 'three';
import { gatherSfx } from './sound';

// PROTOTYPE (?proto=pick): what you gather flies over your left shoulder into
// the bag (Inventory's; here just two counts). Throwaway.

export type Material = 'ore' | 'herb';

export const NAMES: Record<Material, string> = { ore: 'Copper ore', herb: 'Hearthleaf' };

interface Flyer {
  object: Object3D;
  from: Vector3;
  t: number;
  delay: number;
  kind: Material;
  count: number;
}

/** Where the bag is: over the left shoulder, from the head (right, down, back). */
const SHOULDER = new Vector3(-0.22, -0.18, 0.12);
const FLIGHT = 0.45;
const Y = new Vector3(0, 1, 0);
const _to = new Vector3();
const _dir = new Vector3();

export class Bag {
  readonly counts: Record<Material, number> = { ore: 0, herb: 0 };
  private readonly flying: Flyer[] = [];
  /** Told as each thing lands. */
  onLand: ((kind: Material, count: number) => void) | null = null;

  constructor(private readonly camera: PerspectiveCamera) {}

  /** Send `object` (already in the scene) to the bag after `delay` s; it's removed when it lands. */
  send(object: Object3D, kind: Material, count: number, delay = 0): void {
    this.flying.push({ object, from: object.position.clone(), t: 0, delay, kind, count });
  }

  update(dt: number): void {
    this.camera.getWorldPosition(_to);
    this.camera.getWorldDirection(_dir);
    const yaw = Math.atan2(-_dir.x, -_dir.z);
    _to.add(SHOULDER.clone().applyAxisAngle(Y, yaw));
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      if (f.delay > 0) {
        f.delay -= dt;
        f.from.copy(f.object.position);
        continue;
      }
      f.t += dt / FLIGHT;
      const t = Math.min(1, f.t);
      const e = t * t * (3 - 2 * t);
      f.object.position.lerpVectors(f.from, _to, e);
      f.object.position.y += Math.sin(t * Math.PI) * 0.35; // an arc up and over
      f.object.scale.setScalar(1 - 0.6 * e);
      if (t >= 1) {
        f.object.removeFromParent();
        this.flying.splice(i, 1);
        this.counts[f.kind] += f.count;
        gatherSfx.bag();
        this.onLand?.(f.kind, f.count);
      }
    }
  }

  clear(): void {
    for (const f of this.flying) f.object.removeFromParent();
    this.flying.length = 0;
    this.counts.ore = this.counts.herb = 0;
  }
}
