import type { BufferGeometry, Material } from 'three';
import { BOG_BODIES } from '../models/bogDead';
import { COMMONERS } from '../models/commoners';
import { FALLEN_DIGGERS } from '../models/diggers';
import { GUARDS } from '../models/guards';
import { BUILDS } from '../models/human';
import { PEOPLE, type Person } from '../models/people';
import { Rig } from '../models/rig';

const MEMBERS = {
  innkeeper: PEOPLE.innkeeper,
  smith: PEOPLE.smith,
  farmer: PEOPLE.farmer,
  herbalist: PEOPLE.herbalist,
  ...COMMONERS,
  ...GUARDS,
  ...FALLEN_DIGGERS,
  ...BOG_BODIES,
} satisfies Record<string, Person>;

/** One of the cast, by name. */
export type CastId = keyof typeof MEMBERS;

/**
 * Every friendly character a zone can place as a villager (maps/types.ts
 * `PersonPlan`), by name: Oakvale's four at their trades, the plain
 * villagers, the guards (models/guards.ts), and the dead who lie where they
 * fell (`fallen`: models/diggers.ts, models/bogDead.ts). Each is a body, its clothes,
 * the pose it stands in and its name over a bark; one of the cast can stand
 * in many places at once (two goodwives at a market). A model family adds its
 * looks here.
 */
export const CAST: Readonly<Record<CastId, Person>> = MEMBERS;

/**
 * The cast's bodies, each built once and shared by everyone wearing it while
 * anyone does: two goodwives cost one build and one upload, and each still
 * poses on their own skeleton.
 */
export class Wardrobe {
  private readonly worn = new Map<CastId, { readonly geometry: BufferGeometry; wearers: number }>();

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

  /** How many bodies are built (one per look worn), for the checks. */
  get built(): number {
    return this.worn.size;
  }
}
