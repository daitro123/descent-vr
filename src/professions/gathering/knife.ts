import { BoxGeometry, ConeGeometry, Mesh, type Object3D, Vector3 } from 'three';
import { CONFIG } from '../../config';
import { ModelBuilder } from '../../models/kit';
import { sharedModelMaterial } from '../../models/materials';
import { PAL } from '../../models/palette';
import { Gate, Tracked } from './pick';

// The herb knife in the hand, promoted from ?proto=pick (prototypes/pick/
// tools.ts, which keeps its own copy): a short blade straight out of the fist
// along the grip's −Z, points along its edge from base to tip, and the
// sword's swing gate with the knife's lighter numbers.

export class Knife {
  /** Held in the main hand's grip while drawn. */
  readonly model: Mesh;
  readonly hand = new Tracked(new Vector3());
  /** Points along the edge, base to tip. */
  readonly points: readonly Tracked[];
  readonly gate: Gate;

  constructor() {
    const { bladeStart, bladeEnd, travel, handSpeed } = CONFIG.professions.knife;
    const blade = bladeEnd - bladeStart;
    const tip = new ConeGeometry(0.018, 0.04, 4);
    tip.scale(0.35, 1, 1);
    const b = new ModelBuilder(53)
      .cyl(0.016, 0.018, 0.12, 6, { color: PAL.leather, at: [0, 0, -0.01], rot: [Math.PI / 2, 0, 0], jitter: 0.1 })
      .box(0.03, 0.045, 0.012, { color: PAL.iron, at: [0, 0, -bladeStart + 0.03] })
      .shape(new BoxGeometry(0.006, 0.035, blade), { color: PAL.steel, at: [0, 0, -(bladeStart + bladeEnd) / 2], jitter: 0.04 })
      .shape(tip, { color: PAL.steel, at: [0, 0, -bladeEnd - 0.02], rot: [-Math.PI / 2, 0, 0], jitter: 0.04 });
    this.model = new Mesh(b.build(), sharedModelMaterial());
    this.model.name = 'herb knife';
    this.points = [0, 0.33, 0.66, 1].map((t) => new Tracked(new Vector3(0, 0, -(bladeStart + blade * t))));
    this.gate = new Gate(travel, handSpeed);
  }

  /** The blade's tip, whose speed says whether a cut is hot. */
  get tip(): Tracked {
    return this.points[this.points.length - 1];
  }

  /** One frame of the knife in the hand: its edge and the swing. */
  update(rig: Object3D, dt: number): void {
    this.model.updateWorldMatrix(true, false);
    this.hand.sample(this.model, rig, dt);
    for (const p of this.points) p.sample(this.model, rig, dt);
    this.gate.update(this.hand.rigPos, this.hand.velocity, dt);
  }

  /** Just drawn: nothing it did before counts as a swing now. */
  reset(): void {
    this.hand.valid = false;
    for (const p of this.points) p.valid = false;
  }
}
