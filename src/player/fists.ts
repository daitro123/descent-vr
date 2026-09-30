import { Mesh } from 'three';
import { ModelBuilder } from '../models/kit';
import { createModelMaterial } from '../models/materials';

// Your hands, closed on what they hold: a fist round the sword's grip or the
// shield's bar, or on nothing when the hand is empty. Bare, or tinted by the
// gloves you wear (.scratch/inventory/spec.md, "Hands show their gear").
//
// Built in grip space as the weapons are (models/gear.ts): -Z runs through the
// fist from the little finger to the thumb, the forearm runs along +Y, and the
// back of the hand faces ±X.

/** A bare hand's colour. */
export const SKIN = 0xd8a880;

export class Fist {
  readonly mesh: Mesh;
  private readonly material = createModelMaterial();

  constructor() {
    const m = new ModelBuilder(11);
    const pale = 0xf0f0f0;
    m.box(0.05, 0.06, 0.09, { at: [0, -0.005, 0.005], color: pale, jitter: 0.08 }) // the curled fingers
      .box(0.046, 0.05, 0.085, { at: [0, 0.04, 0], color: pale, jitter: 0.08 }) // the back of the hand
      .box(0.03, 0.032, 0.035, { at: [0, 0.005, -0.05], color: pale, jitter: 0.08 }) // the thumb
      .box(0.058, 0.05, 0.07, { at: [0, 0.085, 0], color: 0xc8c8c8, jitter: 0.08 }); // the wrist, or a glove's cuff
    this.mesh = new Mesh(m.build(), this.material);
    this.mesh.name = 'fist';
    this.tint(null);
  }

  /** Bare (null), or in gloves of `colour`. */
  tint(colour: number | null): void {
    this.material.color.setHex(colour ?? SKIN);
  }

  get colour(): number {
    return this.material.color.getHex();
  }
}
