import { type BufferGeometry, Group, type Material, Vector3 } from 'three';
import { CONFIG } from '../config';
import { mulberry32, type Rng } from '../maps/forest/noise';
import type { Crowd, DogPlan, FlockPlan, HerdPlan, TetherPlan } from '../maps/types';
import { ANIMALS, type AnimalId } from '../models/animals';
import { sharedModelMaterial } from '../models/materials';
import { QuadRig } from '../models/quadruped';
import type { Streets } from '../people/population';
import { Animal } from './animal';

// The animals every zone places by data (maps/types.ts `HerdPlan`): a flock
// grazing about its home, a dog, a horse at its tether. Built a herd at a time
// as you come near, the way its villagers are (people/population.ts): within
// the zone's crowd's `near` of you, the nearest CONFIG.animals.most animals at
// most, a few herds a frame, and dropped once you're CONFIG.population.hysteresis
// farther off. Bodies of one look share one geometry (the fold). What each
// does is its herd's mind here; carrying it out (walking, grazing, lying,
// turning its head) is the animal's (animal.ts).

const _centre = new Vector3();

/** What every animal of a look is built of, shared: the first body of a look builds it, the last to go takes it away. */
export class Fold {
  private readonly kept = new Map<AnimalId, { readonly geometry: BufferGeometry; bodies: number }>();

  /** A body of `id`'s look, at bind. */
  dress(id: AnimalId, material?: Material): QuadRig {
    const a = ANIMALS[id];
    const held = this.kept.get(id);
    if (held) {
      held.bodies++;
      return new QuadRig(a.proportions, held.geometry, material, a.seed);
    }
    const rig = new QuadRig(a.proportions, a.dress, material, a.seed);
    this.kept.set(id, { geometry: rig.mesh.geometry, bodies: 1 });
    return rig;
  }

  /** One of `id`'s bodies is gone. */
  undress(id: AnimalId): void {
    const held = this.kept.get(id);
    if (!held || --held.bodies > 0) return;
    held.geometry.dispose();
    this.kept.delete(id);
  }

  /** How many looks are built, for the checks. */
  get built(): number {
    return this.kept.size;
  }
}

/** One herd in the world, built: its animals, and its mind. */
export interface Herd {
  readonly plan: HerdPlan;
  readonly animals: readonly Animal[];
  /** One frame with your head at `you`; `herds` answers where another herd is (the flock a dog minds). */
  update(dt: number, you: Vector3, herds: Herds): void;
}

/** A number in [lo, hi). */
function between(rng: Rng, [lo, hi]: readonly [number, number]): number {
  return lo + (hi - lo) * rng();
}

/** A deterministic seed from `id`, so a herd does the same things each time it's built. */
function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---------------------------------------------------------------- the flock

/** What one sheep of a flock is doing. */
type Grazing = 'graze' | 'look' | 'lie' | 'walk' | 'flee' | 'wary';

interface Sheep {
  readonly animal: Animal;
  doing: Grazing;
  /** s until it does something else. */
  until: number;
  /** Which side of straight away from you it runs, so a flock fans out (rad). */
  readonly fan: number;
}

/**
 * Sheep about their home. Each grazes a while at one patch, then lifts its
 * head and looks round, lies down to chew, or walks a few metres to another
 * patch, keeping within the flock's roam and apart from the others; a lamb
 * keeps to the first ewe. A shy flock runs from you, every sheep straight away
 * and fanning out, the moment you're within `fear` of any; each stops once
 * it's `safe` off and stands watching you, then grazes where it is; they drift
 * home only once you've gone `clear` of it. A flock that isn't shy only steps
 * out of your way.
 */
export class Flock implements Herd {
  readonly animals: Animal[];
  private readonly sheep: Sheep[];
  /** Have they run from you, and not yet gone home? */
  scared = false;
  private readonly roam: number;

  constructor(
    readonly plan: FlockPlan,
    animals: Animal[],
    private readonly rng: Rng,
  ) {
    this.animals = animals;
    this.roam = plan.roam ?? CONFIG.animals.flock.roam;
    this.sheep = animals.map((animal, i) => {
      // Grazing from the start, each at its own point in it; a lamb may be lying by its mother.
      const lies = rng() < CONFIG.animals.flock.lie;
      animal.stance = lies ? 'lie' : 'graze';
      animal.snap();
      return { animal, doing: lies ? 'lie' : 'graze', until: between(rng, CONFIG.animals.flock.graze) * rng(), fan: ((i % 3) - 1) * 0.45 };
    });
  }

  /** Where the flock is: the middle of its sheep. */
  centre(out: Vector3): Vector3 {
    out.set(0, 0, 0);
    for (const a of this.animals) out.add(a.position);
    return out.divideScalar(Math.max(1, this.animals.length));
  }

  /** How far its farthest sheep is from `centre`. */
  spread(centre: Vector3): number {
    let most = 0;
    for (const a of this.animals) most = Math.max(most, a.distanceTo(centre.x, centre.z));
    return most;
  }

  update(dt: number, you: Vector3): void {
    const F = CONFIG.animals.flock;
    const { plan } = this;
    if (plan.shy) {
      let nearest = Infinity;
      for (const s of this.sheep) nearest = Math.min(nearest, s.animal.distanceTo(you.x, you.z));
      if (nearest < F.fear) this.scared = true;
      else if (this.scared && nearest > F.safe && Math.hypot(you.x - plan.x, you.z - plan.z) > F.clear) this.goHome();
    }
    for (const s of this.sheep) {
      const a = s.animal;
      a.update(dt);
      const d = a.distanceTo(you.x, you.z);
      if (this.scared) {
        if (d < F.safe) {
          this.flee(s, you, d);
          continue;
        }
        if (s.doing === 'flee') {
          a.stop();
          a.stance = 'alert';
          a.lookAt = you;
          s.doing = 'wary';
          s.until = between(this.rng, F.wary);
          continue;
        }
      } else if (!plan.shy && d < F.aside && s.doing !== 'walk') {
        // In your way: a few steps aside.
        const k = (F.aside + 0.8 - d) / Math.max(0.1, d);
        a.go(a.position.x + (a.position.x - you.x) * k, a.position.z + (a.position.z - you.z) * k);
        s.doing = 'walk';
        continue;
      }
      this.graze(s, dt);
    }
  }

  /** Run on, straight away from you and a little to its side, to `safe` off. */
  private flee(s: Sheep, you: Vector3, d: number): void {
    const a = s.animal;
    const away = Math.atan2(a.position.x - you.x, a.position.z - you.z) + s.fan;
    const run = CONFIG.animals.flock.safe - d + 2;
    a.lookAt = null;
    a.go(a.position.x + Math.sin(away) * run, a.position.z + Math.cos(away) * run, 'run');
    s.doing = 'flee';
  }

  /** You've gone: they drift back home, a sheep at a time. */
  private goHome(): void {
    this.scared = false;
    for (const s of this.sheep) {
      s.animal.lookAt = null;
      if (s.doing === 'flee' || s.doing === 'wary') {
        s.doing = 'look';
        s.until = between(this.rng, [0.5, 3]);
      }
    }
  }

  /** Calm (or settled where it ran to): graze, look up, lie, step to a new patch. */
  private graze(s: Sheep, dt: number): void {
    const a = s.animal;
    const F = CONFIG.animals.flock;
    s.until -= dt;
    if (s.doing === 'walk' || s.doing === 'flee') {
      if (!a.still) return;
      s.doing = 'graze';
      a.stance = 'graze';
      s.until = between(this.rng, F.graze);
      return;
    }
    if (s.until > 0) return;
    a.lookAt = null;
    if (this.scared) {
      // Settled where it ran to: it grazes there, looking up now and then, until you've gone.
      s.doing = s.doing === 'graze' ? 'look' : 'graze';
      a.stance = s.doing === 'look' ? 'alert' : 'graze';
      s.until = s.doing === 'look' ? between(this.rng, [1.5, 3]) : between(this.rng, F.graze);
      return;
    }
    const r = this.rng();
    if (s.doing === 'graze' && r < F.look) {
      s.doing = 'look';
      a.stance = 'alert';
      s.until = between(this.rng, [1.5, 3.5]);
    } else if (s.doing === 'graze' && r < F.look + F.lie) {
      s.doing = 'lie';
      a.stance = 'lie';
      s.until = between(this.rng, F.rest);
    } else {
      const [x, z] = this.patch(s);
      a.go(x, z);
      s.doing = 'walk';
    }
  }

  /**
   * Where a sheep grazes next: a few metres from where it is (a lamb, from its
   * mother), within the roam of home (back into it, if it's out), and of a
   * few tries the one farthest from the others.
   */
  private patch(s: Sheep): [number, number] {
    const { plan, roam, rng } = this;
    const a = s.animal;
    const mother = a.look === 'lamb' && this.animals[0] !== a ? this.animals[0] : null;
    const from = mother?.position ?? a.position;
    const outside = !mother && a.distanceTo(plan.x, plan.z) > roam;
    let best: [number, number] = [plan.x, plan.z];
    let room = -1;
    for (let i = 0; i < 4; i++) {
      const t = rng() * Math.PI * 2;
      let x: number;
      let z: number;
      if (outside) {
        const r = roam * 0.7 * Math.sqrt(rng());
        x = plan.x + Math.sin(t) * r;
        z = plan.z + Math.cos(t) * r;
      } else {
        const r = mother ? 0.8 + rng() : 1.5 + rng() * 2.5;
        x = from.x + Math.sin(t) * r;
        z = from.z + Math.cos(t) * r;
        const off = Math.hypot(x - plan.x, z - plan.z);
        if (off > roam) {
          x = plan.x + ((x - plan.x) / off) * roam;
          z = plan.z + ((z - plan.z) / off) * roam;
        }
      }
      let gap = Infinity;
      for (const o of this.animals) if (o !== a) gap = Math.min(gap, o.distanceTo(x, z));
      if (gap > room) {
        room = gap;
        best = [x, z];
      }
    }
    return best;
  }
}

// ---------------------------------------------------------------- the dog

type Minding = 'lie' | 'round' | 'sniff' | 'back' | 'follow';

/**
 * A dog lying on its bed, lifting its head to you as you come near. One that
 * minds a flock gets up every so often and trots round it, sniffing at a
 * couple of places on the way, then goes back to its bed and lies down; when
 * the flock scatters off its home it follows, keeping off its edge and
 * watching it, until the flock's home again.
 */
export class Dog implements Herd {
  readonly animals: Animal[];
  private doing: Minding = 'lie';
  private until: number;
  /** Its round's places, and which it's going to; which of them it sniffs at. */
  private readonly ring: [number, number][] = [];
  private next = 0;
  private readonly sniffs = new Set<number>();
  private readonly flock = new Vector3();

  constructor(
    readonly plan: DogPlan,
    private readonly animal: Animal,
    private readonly rng: Rng,
  ) {
    this.animals = [animal];
    animal.stance = 'lie';
    animal.snap();
    this.until = between(rng, CONFIG.animals.follow.every) * rng();
  }

  /** What it's doing, for the checks. */
  get minding(): Minding {
    return this.doing;
  }

  update(dt: number, you: Vector3, herds: Herds): void {
    const { animal: a, plan } = this;
    const A = CONFIG.animals;
    a.update(dt);
    const flock = plan.minds ? herds.flock(plan.minds) : null;
    const home = plan.minds ? herds.planOf(plan.minds) : null;
    // Whatever it's doing, a dog lying or sniffing lifts its head to you.
    const near = a.distanceTo(you.x, you.z) < A.notice;
    a.lookAt = near && (this.doing === 'lie' || this.doing === 'sniff') ? you : null;
    if (home?.kind === 'flock') {
      const roam = home.roam ?? A.flock.roam;
      const centre = flock ? flock.centre(this.flock) : this.flock.set(home.x, 0, home.z);
      const off = Math.hypot(centre.x - home.x, centre.z - home.z);
      // Scattered, or strayed off: it goes after them, until they're home and settled.
      if ((flock?.scared || off > roam + 3) && this.doing !== 'follow') this.doing = 'follow';
      if (this.doing === 'follow') {
        if (!flock?.scared && off < roam + 1) return this.goBack();
        // Off the flock's edge on its own side, watching it.
        const spread = flock ? flock.spread(centre) : roam;
        const t = Math.atan2(a.position.x - centre.x, a.position.z - centre.z);
        const r = spread + A.follow.round;
        const x = centre.x + Math.sin(t) * r;
        const z = centre.z + Math.cos(t) * r;
        const d = a.distanceTo(x, z);
        if (d > 1.5) a.go(x, z, d > 8 ? 'run' : 'walk');
        else if (a.still) {
          a.stance = 'alert';
          a.lookAt = centre;
        }
        return;
      }
    }
    switch (this.doing) {
      case 'lie':
        this.until -= dt;
        if (home?.kind === 'flock' && this.until <= 0) this.goRound(home);
        break;
      case 'round':
        if (!a.still) break;
        if (this.sniffs.has(this.next)) {
          this.sniffs.delete(this.next);
          this.doing = 'sniff';
          a.stance = 'graze';
          this.until = between(this.rng, A.sniff);
          break;
        }
        if (++this.next >= this.ring.length) this.goBack();
        else a.go(...this.ring[this.next]);
        break;
      case 'sniff':
        this.until -= dt;
        if (this.until > 0) break;
        a.stance = 'stand';
        this.doing = 'round';
        if (++this.next >= this.ring.length) this.goBack();
        else a.go(...this.ring[this.next]);
        break;
      case 'back':
        if (!a.still) break;
        a.face(plan.yaw);
        a.stance = 'lie';
        this.doing = 'lie';
        this.until = between(this.rng, A.follow.every);
        break;
    }
  }

  /** Up, and round the flock: once round its home, from the side nearest, a place every eighth of the way. */
  private goRound(home: FlockPlan): void {
    const { animal: a, plan, rng } = this;
    const r = plan.ring ?? (home.roam ?? CONFIG.animals.flock.roam) + CONFIG.animals.follow.round;
    const t0 = Math.atan2(a.position.x - home.x, a.position.z - home.z);
    const way = rng() < 0.5 ? 1 : -1;
    this.ring.length = 0;
    for (let i = 0; i <= 8; i++) {
      const t = t0 + (way * i * Math.PI * 2) / 8;
      this.ring.push([home.x + Math.sin(t) * r, home.z + Math.cos(t) * r]);
    }
    this.sniffs.clear();
    this.sniffs.add(2 + Math.floor(rng() * 2));
    this.sniffs.add(5 + Math.floor(rng() * 2));
    this.next = 0;
    a.stance = 'stand';
    a.go(...this.ring[0]);
    this.doing = 'round';
  }

  /** Back to its bed. */
  private goBack(): void {
    this.animal.stance = 'stand';
    this.animal.go(this.plan.x, this.plan.z);
    this.doing = 'back';
  }
}

// ---------------------------------------------------------------- the tethered horse

/**
 * A horse at its tether: it stands, crops the grass, rests a hind leg, now
 * and then stamps, and lifts its head and turns it to you as you come near.
 * It never leaves its spot.
 */
export class Tethered implements Herd {
  readonly animals: Animal[];
  private until: number;

  constructor(
    readonly plan: TetherPlan,
    private readonly animal: Animal,
    private readonly rng: Rng,
  ) {
    this.animals = [animal];
    animal.stance = 'stand';
    animal.snap();
    this.until = between(rng, CONFIG.animals.tether.stand) * rng();
  }

  update(dt: number, you: Vector3): void {
    const { animal: a, rng } = this;
    const T = CONFIG.animals.tether;
    a.update(dt);
    const near = a.distanceTo(you.x, you.z) < CONFIG.animals.notice;
    a.lookAt = near ? you : null;
    // Its head up off the grass to look at you.
    if (near && a.stance === 'graze') a.stance = 'stand';
    this.until -= dt;
    if (this.until > 0) return;
    const r = rng();
    a.stance = r < 0.4 || near ? 'stand' : r < 0.75 ? 'graze' : 'rest';
    this.until = between(rng, T[a.stance === 'stand' ? 'stand' : a.stance === 'graze' ? 'graze' : 'rest']);
    if (rng() < T.stamp) a.stamp();
  }
}

// ---------------------------------------------------------------- the herds

/** How the herds build a herd, and take one away. */
export interface HerdBuilder {
  make(plan: HerdPlan): Herd;
  drop(herd: Herd): void;
}

/** How many animals a plan places. */
function headcount(plan: HerdPlan): number {
  return plan.kind === 'flock' ? plan.sheep.length : 1;
}

interface Slot {
  readonly plan: HerdPlan;
  herd: Herd | null;
  /** How near it is for building: a built one counts `hysteresis` nearer, so it's kept until you've gone well past. */
  rank: number;
}

export class Herds {
  private readonly slots: Slot[] = [];
  private readonly order: Slot[] = [];
  private readonly byId = new Map<string, Slot>();

  constructor(private readonly builder: HerdBuilder) {}

  /** Take in a zone's animals (as it's loaded): none is built until you come near. */
  add(plans: readonly HerdPlan[]): void {
    for (const plan of plans) {
      const slot = { plan, herd: null, rank: Infinity };
      this.slots.push(slot);
      this.byId.set(plan.id, slot);
    }
  }

  /** Every herd placed, built or not. */
  get placed(): readonly HerdPlan[] {
    return this.slots.map((s) => s.plan);
  }

  /** Those built. */
  get built(): readonly Herd[] {
    return this.slots.flatMap((s) => (s.herd ? [s.herd] : []));
  }

  /** `id`'s herd, while it's built. */
  get(id: string): Herd | null {
    return this.byId.get(id)?.herd ?? null;
  }

  /** `id`'s flock, while it's built. */
  flock(id: string): Flock | null {
    const herd = this.get(id);
    return herd instanceof Flock ? herd : null;
  }

  /** `id`'s plan, built or not. */
  planOf(id: string): HerdPlan | null {
    return this.byId.get(id)?.plan ?? null;
  }

  /** Build every herd wanted round `you` at once (loading in, waking after a death). */
  fill(you: Vector3, crowd: Pick<Crowd, 'near'> = CONFIG.population): void {
    this.reckon(you);
    this.rebuild(Infinity, crowd.near);
  }

  /** One frame with your head at `you`: build those near (a few herds a frame), drop those you've gone past, and step the built. */
  update(dt: number, you: Vector3, crowd: Pick<Crowd, 'near'> = CONFIG.population): void {
    this.reckon(you);
    this.rebuild(CONFIG.animals.perFrame, crowd.near);
    for (const s of this.slots) s.herd?.update(dt, you, this);
  }

  /** How near each is: from its home, or a built flock's middle. */
  private reckon(you: Vector3): void {
    const { hysteresis } = CONFIG.population;
    for (const s of this.slots) {
      const at = s.herd instanceof Flock ? s.herd.centre(_centre) : s.herd ? s.herd.animals[0].position : s.plan;
      const far = Math.hypot(at.x - you.x, at.z - you.z);
      s.rank = s.herd ? far - hysteresis : far;
    }
  }

  /** Drop those you've gone past, and build up to `budget` herds within `near`, nearest first, to CONFIG.animals.most animals. */
  private rebuild(budget: number, near: number): void {
    const { order } = this;
    order.length = 0;
    for (const s of this.slots) {
      if (s.rank < near) order.push(s);
      else if (s.herd) this.drop(s);
    }
    order.sort((a, b) => a.rank - b.rank);
    let count = 0;
    for (const s of order) {
      count += headcount(s.plan);
      if (count > CONFIG.animals.most) this.drop(s);
      else if (!s.herd && budget-- > 0) s.herd = this.builder.make(s.plan);
    }
  }

  private drop(s: Slot): void {
    if (!s.herd) return;
    this.builder.drop(s.herd);
    s.herd = null;
  }
}

/**
 * The game's animals for `Herds`: each hung from `root` (hidden with the
 * outdoors), standing on `streets` and solid in it, in a body from the `fold`
 * (shared by every animal of a look), culled out of view.
 */
export function animalsOn(streets: Streets, root: Group, fold = new Fold(), material: Material = sharedModelMaterial()): HerdBuilder {
  const body = (look: AnimalId, x: number, z: number, yaw: number, start: number): Animal => {
    const rig = fold.dress(look, material);
    rig.cullOutside(CONFIG.animals.pad);
    const animal = new Animal(look, rig, x, z, yaw, streets, start);
    root.add(animal.root);
    for (const s of animal.solids) streets.addBody(s);
    return animal;
  };
  return {
    make(plan) {
      const rng = mulberry32(seedOf(plan.id));
      switch (plan.kind) {
        case 'flock': {
          // Stood round home, each a little farther out, facing every way.
          const sheep = plan.sheep.map((look, i) => {
            const t = i * 2.4;
            const r = i === 0 ? 0 : 0.9 + 0.75 * Math.sqrt(i);
            return body(look, plan.x + Math.sin(t) * r, plan.z + Math.cos(t) * r, rng() * Math.PI * 2, rng() * 10);
          });
          return new Flock(plan, sheep, rng);
        }
        case 'dog':
          return new Dog(plan, body(plan.dog, plan.x, plan.z, plan.yaw, rng() * 10), rng);
        case 'tethered':
          return new Tethered(plan, body(plan.horse, plan.x, plan.z, plan.yaw, rng() * 10), rng);
      }
    },
    drop(herd) {
      for (const animal of herd.animals) {
        animal.dispose();
        for (const s of animal.solids) streets.removeBody(s);
        fold.undress(animal.look);
      }
    },
  };
}

/** The animals in the world: the herds, and the group they hang from (hide it with the outdoors). */
export function worldHerds(streets: Streets): { readonly herds: Herds; readonly root: Group } {
  const root = new Group();
  root.name = 'animals';
  return { herds: new Herds(animalsOn(streets, root)), root };
}
