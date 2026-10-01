import type { BufferGeometry, Material } from 'three';
import { CITY_CAST } from '../models/cityCast';
import { COMMONERS } from '../models/commoners';
import { GUARDS } from '../models/guards';
import { BUILDS } from '../models/human';
import { PEOPLE, type Person } from '../models/people';
import { Rig } from '../models/rig';
import { SMUGGLERS } from '../models/smugglers';

const MEMBERS = {
  innkeeper: PEOPLE.innkeeper,
  smith: PEOPLE.smith,
  farmer: PEOPLE.farmer,
  herbalist: PEOPLE.herbalist,
  ...COMMONERS,
  ...CITY_CAST,
  ...GUARDS,
  ...SMUGGLERS,
} satisfies Record<string, Person>;

/** One of the cast, by name. */
export type CastId = keyof typeof MEMBERS;

/**
 * Every friendly character a zone can place as a villager (maps/types.ts
 * `PersonPlan`), by name: Oakvale's four at their trades, the plain
 * villagers, the city's people (models/cityCast.ts), the guards
 * (models/guards.ts) and the smugglers at ease (models/smugglers.ts). Each
 * is a body, its clothes, the pose it stands in and its name over a bark;
 * one of the cast can stand in many places at once (two goodwives at a
 * market). A model family adds its looks here.
 */
export const CAST: Readonly<Record<CastId, Person>> = MEMBERS;

/**
 * The cast's bodies, each built once and shared by everyone wearing it while
 * anyone does: two goodwives cost one build and one upload, and each still
 * poses on their own skeleton. A carrier's body with their load on (a sack
 * on the shoulder) is another, shared the same way, worn while it's in their
 * hands.
 */
export class Wardrobe {
  private readonly worn = new Map<CastId, { readonly geometry: BufferGeometry; wearers: number }>();
  private readonly laden = new Map<CastId, { readonly geometry: BufferGeometry; wearers: number }>();

  /** A body for one of `id`, standing at bind (apply their `stand`): the first builds it, the rest share it. */
  dress(id: CastId, material?: Material): Rig {
    const person: Person = CAST[id];
    const { proportions } = BUILDS[person.look.build];
    const held = this.worn.get(id);
    if (held) {
      held.wearers++;
      return new Rig(proportions, held.geometry, material, person.seed);
    }
    const rig = new Rig(proportions, (ctx) => person.dress(ctx, person.look), material, person.seed);
    this.worn.set(id, { geometry: rig.mesh.geometry, wearers: 1 });
    return rig;
  }

  /** One of `id`'s bodies is gone: the last to go takes the geometry with it. */
  undress(id: CastId): void {
    const held = this.worn.get(id);
    if (!held || --held.wearers > 0) return;
    held.geometry.dispose();
    this.worn.delete(id);
  }

  /**
   * `id`'s body with their load on (models/people.ts `Person.load`), for a
   * rig dressed as `id` to wear while they carry it: the first builds it,
   * the rest share it. Null for one with no load.
   */
  burden(id: CastId): BufferGeometry | null {
    const person: Person = CAST[id];
    const { load } = person;
    if (!load) return null;
    const held = this.laden.get(id);
    if (held) {
      held.wearers++;
      return held.geometry;
    }
    const { proportions } = BUILDS[person.look.build];
    // The same dress in the same order from the same seed, so it matches their body to the stitch, and the load over it.
    const rig = new Rig(
      proportions,
      (ctx) => {
        person.dress(ctx, person.look);
        load.dress(ctx, person.look);
      },
      undefined,
      person.seed,
    );
    this.laden.set(id, { geometry: rig.mesh.geometry, wearers: 1 });
    return rig.mesh.geometry;
  }

  /** One of `id`'s laden bodies is gone: the last to go takes it with it. */
  unburden(id: CastId): void {
    const held = this.laden.get(id);
    if (!held || --held.wearers > 0) return;
    held.geometry.dispose();
    this.laden.delete(id);
  }

  /** How many bodies are built (one per look worn, and one per load carried), for the checks. */
  get built(): number {
    return this.worn.size + this.laden.size;
  }
}
