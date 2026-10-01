import { Group, type Material, type Vector3 } from 'three';
import { CONFIG } from '../config';
import type { FileSpot, PatrolWalk } from '../enemies/patrol';
import type { PersonPlan } from '../maps/types';
import { sharedModelMaterial } from '../models/materials';
import type { Ground } from '../world/ground';
import { BarkRule } from './barks';
import { CAST, Wardrobe } from './cast';
import { strollFrom, Villager } from './villagers';
import { WORKS } from './work';

// The villagers every zone places by data (maps/types.ts `PersonPlan`), built
// as you come near them and dropped as you walk on, the way the chunks round
// you are: within CONFIG.population.near of you (or the fog's far edge, if
// that's nearer), the nearest CONFIG.population.most at most, a few a frame,
// and gone again once you're CONFIG.population.hysteresis farther off. So a town can hold as many as its
// streets want while only the crowd round you costs anything. A stroller's
// walk goes on while they're dropped, so you don't find everyone where you
// left them. Each says the next of their lines as you pass, by the barks'
// rule. Oakvale's own cast (people/villagers.ts `Villagers`) isn't here: the
// quests, the wares and the trainers know them by name, and they stand from
// the start.

const _spot: FileSpot = { x: 0, z: 0, yaw: 0 };

/** What the population asks of a villager it has built. */
export interface Placed {
  /** Are they drawn (not hidden with the outdoors)? */
  readonly shown: boolean;
  /** One frame with your head at `you`. */
  update(dt: number, you: Vector3): unknown;
  /** How far your head is from them, on the floor plane. */
  far(you: Vector3): number;
  /** Show `line` over their head, or hide it (null). */
  say(line: string | null): void;
}

/** How the population builds a villager, and takes one away. */
export interface Builder<P extends Placed> {
  /** Their body in the world at their spot, or where `stroll` has got to. */
  make(plan: PersonPlan, stroll: PatrolWalk | null): P;
  /** Out of the world, and whatever they were built of given back. */
  drop(person: P, plan: PersonPlan): void;
}

/** One placed villager, built or not. */
interface Slot<P> {
  readonly plan: PersonPlan;
  /** Their walk, if they stroll a route: on and on, built or not. */
  readonly stroll: PatrolWalk | null;
  /** Their body, while you're near; null while they're dropped. */
  person: P | null;
  /** Which of their lines they say next. */
  next: number;
  /** How far you are from them (from where they'd stand, while dropped). */
  far: number;
  /** How near they are for building: built ones count `hysteresis` nearer, so they're kept until you've gone well past. */
  rank: number;
}

/** Where `slot` is: where their walk has got to, or their spot. */
function whereIs<P>(slot: Slot<P>): { readonly x: number; readonly z: number } {
  return slot.stroll ? slot.stroll.spot(0, _spot) : slot.plan;
}

export class Population<P extends Placed = Villager<string>> {
  private readonly slots: Slot<P>[] = [];
  private readonly rule = new BarkRule(0);
  /** The slots by how near they are, sorted afresh each frame (kept to spare the garbage collector). */
  private readonly order: Slot<P>[] = [];
  private readonly fars: number[] = [];

  constructor(private readonly builder: Builder<P>) {}

  /** Take in a zone's villagers (as it's loaded): none is built until you come near. */
  add(people: readonly PersonPlan[]): void {
    for (const plan of people) {
      const stroll = plan.route?.length ? strollFrom(plan.x, plan.z, plan.route) : null;
      this.slots.push({ plan, stroll, person: null, next: 0, far: Infinity, rank: Infinity });
    }
    this.rule.grow(people.length);
  }

  /** Everyone placed, built or not, in the order they were added. */
  get placed(): readonly PersonPlan[] {
    return this.slots.map((s) => s.plan);
  }

  /** Those built, with their plans. */
  get built(): readonly { readonly plan: PersonPlan; readonly person: P }[] {
    return this.slots.flatMap((s) => (s.person ? [{ plan: s.plan, person: s.person }] : []));
  }

  /** `id`'s body, while it's built. */
  get(id: string): P | null {
    return this.slots.find((s) => s.plan.id === id)?.person ?? null;
  }

  /**
   * Build everyone wanted round `you` at once (loading in, waking after a
   * death), however many that is: those within `near` m, as `update`.
   */
  fill(you: Vector3, near: number = CONFIG.population.near): void {
    this.reckon(0, you);
    this.rebuild(Infinity, near);
  }

  /**
   * One frame with your head at `you`: build those within `near` m (no
   * farther than you can see through the fog, in a fen) and drop those you've
   * gone past, step who's built, and bark.
   */
  update(dt: number, you: Vector3, near: number = CONFIG.population.near): void {
    this.reckon(dt, you);
    this.rebuild(CONFIG.population.perFrame, near);
    const { slots, fars } = this;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (s.person) {
        s.person.update(dt, you);
        s.far = s.person.far(you);
      }
      fars[i] = s.person?.shown && s.plan.barks?.length ? s.far : Infinity;
    }
    for (const i of this.rule.update(dt, fars)) {
      const s = slots[i];
      const lines = s.plan.barks!;
      s.person?.say(lines[s.next++ % lines.length]);
    }
    for (let i = 0; i < slots.length; i++) if (!this.rule.showing(i)) slots[i].person?.say(null);
  }

  /** How far you are from each, walking on those dropped who stroll. */
  private reckon(dt: number, you: Vector3): void {
    const { hysteresis } = CONFIG.population;
    for (const s of this.slots) {
      if (s.person) {
        s.far = s.person.far(you);
      } else {
        s.stroll?.step(dt);
        const at = whereIs(s);
        s.far = Math.hypot(at.x - you.x, at.z - you.z);
      }
      s.rank = s.person ? s.far - hysteresis : s.far;
    }
  }

  /** Drop those you've gone past, and build up to `budget` of those within `near`, nearest first. */
  private rebuild(budget: number, near: number): void {
    const { most } = CONFIG.population;
    const { order } = this;
    order.length = 0;
    for (const s of this.slots) if (s.rank < near) order.push(s);
    order.sort((a, b) => a.rank - b.rank);
    // Past the nearest `most`, nobody's wanted.
    for (let i = most; i < order.length; i++) this.drop(order[i]);
    order.length = Math.min(order.length, most);
    for (const s of this.slots) if (s.person && s.rank >= near) this.drop(s);
    for (const s of order) {
      if (s.person) continue;
      if (budget-- <= 0) break;
      s.person = this.builder.make(s.plan, s.stroll);
    }
  }

  private drop(s: Slot<P>): void {
    if (!s.person) return;
    this.builder.drop(s.person, s.plan);
    s.person = null;
  }
}

/** A deterministic 0 to 1 from `id`: where in their work a villager starts. */
function startOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 2 ** 32;
}

/** What villagers stand on and are solid in: the World. */
export interface Streets extends Ground {
  addBody(body: { readonly x: number; readonly z: number; readonly r: number }): void;
  removeBody(body: { readonly x: number; readonly z: number; readonly r: number }): void;
}

/**
 * The game's villagers for a `Population`: each hung from `root` (hidden with
 * the outdoors), standing on `streets` and solid in it, in a body from the
 * cast's `wardrobe` (shared by everyone dressed alike), culled out of view.
 */
export function villagersOn(
  streets: Streets,
  root: Group,
  wardrobe = new Wardrobe(),
  material: Material = sharedModelMaterial(),
): Builder<Villager<string>> {
  return {
    make(plan, stroll) {
      const person = CAST[plan.cast];
      const rig = wardrobe.dress(plan.cast, material);
      rig.cullOutside(CONFIG.population.pad);
      const turn = plan.turn ?? 0;
      const villager = new Villager(
        { id: plan.id, x: plan.x, z: plan.z, yaw: plan.yaw, interior: null, turn },
        { rig, label: plan.label ?? person.label, stand: person.stand, work: WORKS[plan.work ?? 'stand'](person.stand, turn), start: startOf(plan.id), gives: false },
        streets,
        stroll,
      );
      root.add(villager.root);
      streets.addBody(villager.body);
      return villager;
    },
    drop(villager, plan) {
      villager.dispose();
      streets.removeBody(villager.body);
      wardrobe.undress(plan.cast);
    },
  };
}

/** The villagers in the world: a population, and the group they hang from (hide it with the outdoors). */
export function worldPopulation(streets: Streets): { readonly population: Population; readonly root: Group } {
  const root = new Group();
  root.name = 'people';
  return { population: new Population(villagersOn(streets, root)), root };
}
