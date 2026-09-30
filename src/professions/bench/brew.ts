import type { ItemId } from '../../items';
import { RECIPES, type RecipeId } from '../professions';

// The alchemy bench's rules, with no three.js in them: which recipe the herbs
// in the mortar make, and the turns of the pestle and the spoon, however the
// hand goes round (.scratch/professions/spec.md, "Stations"; promoted from
// `?proto=brew` variant B, grind and stir).

/** The herbs the bench takes, in the order they lie on the tray (front row first). */
export const HERBS: readonly ItemId[] = ['hearthleaf', 'duskcap'];

/** The most herbs the mortar holds: the largest Apprentice recipe's. */
export const MORTAR_HOLDS = 3;

/** How many of each herb lie in the mortar. */
export type Herbs = Readonly<Record<ItemId, number>>;

/**
 * The bench recipe whose herbs are exactly `herbs`, among those you know, or
 * null: none known makes that mix. What you drop chooses the recipe; there's
 * no menu to press.
 */
export function recipeFor(herbs: Herbs, knows: (id: RecipeId) => boolean): RecipeId | null {
  const mix = Object.entries(herbs).filter(([, n]) => n > 0);
  if (!mix.length) return null;
  for (const r of Object.values(RECIPES)) {
    if (r.station !== 'bench' || !knows(r.id)) continue;
    const takes = Object.entries(r.takes);
    if (takes.length === mix.length && takes.every(([id, n]) => herbs[id] === n)) return r.id;
  }
  return null;
}

/** Turns of a point round a centre, however the hand goes round: for grinding and stirring. */
export class Turns {
  /** Radians gone round so far. */
  acc = 0;
  private prev: number | null = null;
  private halves = 0;

  /** Feed the point's offset from the centre; returns how many half turns it just completed. */
  feed(dx: number, dz: number): number {
    if (Math.hypot(dx, dz) < 0.008) return 0; // at the very centre the angle is noise
    const a = Math.atan2(dz, dx);
    if (this.prev !== null) {
      let d = a - this.prev;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      // A jump this big between frames is the hand passing over the centre, not a turn.
      this.acc += Math.min(0.6, Math.abs(d));
    }
    this.prev = a;
    return this.count();
  }

  /** Count `radians` more (a pound of the pestle is a third of a turn); returns the half turns it completed. */
  add(radians: number): number {
    this.acc += radians;
    return this.count();
  }

  /** The point left the bowl: the next feed starts afresh. */
  lift(): void {
    this.prev = null;
  }

  /** Back to none. */
  reset(): void {
    this.acc = 0;
    this.halves = 0;
    this.prev = null;
  }

  private count(): number {
    const h = Math.floor(this.acc / Math.PI);
    const n = h - this.halves;
    this.halves = h;
    return n;
  }
}
