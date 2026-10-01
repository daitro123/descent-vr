import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { MAPS } from '../src/maps/registry';
import type { PersonPlan, Zone } from '../src/maps/types';
import { CAST, type CastId, Wardrobe } from '../src/people/cast';
import { type Builder, type Placed, Population } from '../src/people/population';
import { strollFrom } from '../src/people/villagers';
import { WORKS } from '../src/people/work';
import { CHAINS, VILLAGERS } from '../src/quests';

// Who lives in each zone (people/population.ts): the villagers a zone places
// by data are built only while you're near them, the nearest few at most and
// a few a frame, and dropped again once you've gone on, as the chunks round
// you are; a dropped stroller walks on. And every zone's people and camps are
// placed where they can stand, under ids nothing else uses.

const P = CONFIG.population;
const DT = 1 / 72;

/** A stand-in body: where it is, what it said, and whether it's gone. */
class Body implements Placed {
  shown = true;
  said: (string | null)[] = [];
  gone = false;
  readonly at: { x: number; z: number };
  constructor(
    readonly plan: PersonPlan,
    readonly stroll: ReturnType<typeof strollFrom> | null,
  ) {
    this.at = { x: plan.x, z: plan.z };
  }
  update(dt: number) {
    if (!this.stroll) return;
    this.stroll.step(dt);
    const s = this.stroll.spot(0);
    this.at.x = s.x;
    this.at.z = s.z;
  }
  far(you: Vector3) {
    return Math.hypot(this.at.x - you.x, this.at.z - you.z);
  }
  say(line: string | null) {
    if (line !== (this.said.at(-1) ?? null)) this.said.push(line);
  }
}

/** A population of stand-in bodies, counting the builds. */
function population(people: PersonPlan[]) {
  const made: Body[] = [];
  const builder: Builder<Body> = {
    make: (plan, stroll) => {
      const b = new Body(plan, stroll);
      made.push(b);
      return b;
    },
    drop: (b) => {
      b.gone = true;
    },
  };
  const pop = new Population(builder);
  pop.add(people);
  const you = new Vector3();
  const step = (seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += DT) pop.update(DT, you);
  };
  const ids = () => pop.built.map((b) => b.plan.id).sort();
  return { pop, you, step, made, ids };
}

const person = (id: string, x: number, z: number, more: Partial<PersonPlan> = {}): PersonPlan => ({ id, cast: 'shepherd', x, z, yaw: 0, ...more });

describe('a population', () => {
  it('builds no one until you come near, then the nearest first, a few a frame', () => {
    const people = [person('a', 0, 150), person('b', 0, 60), person('c', 0, 30), person('d', 0, 90)];
    const { pop, you, step, ids } = population(people);
    you.set(0, 0, -200);
    step(1);
    expect(ids()).toEqual([]);
    // Walking in to the origin: c, b, d come within reach, the nearest first.
    you.set(0, 0, 0);
    pop.update(DT, you);
    expect(ids()).toEqual(P.perFrame === 1 ? ['c'] : expect.arrayContaining(['c']));
    step(1);
    expect(ids()).toEqual(['b', 'c', 'd']);
    // a is past the near radius.
    expect(pop.get('a')).toBeNull();
  });

  it('builds no farther than the fog lets you see, where it closes in nearer', () => {
    const { pop, you, step, ids } = population([person('near', 0, 60), person('past', 0, 90)]);
    you.set(0, 0, 0);
    for (let t = 0; t < 1; t += DT) pop.update(DT, you, 75);
    expect(ids()).toEqual(['near']);
    step(1);
    expect(ids()).toEqual(['near', 'past']);
  });

  it('builds everyone in reach at once when you load in', () => {
    const people = Array.from({ length: 8 }, (_, i) => person(`p${i}`, i * 5, 10));
    const { pop, you, ids } = population(people);
    you.set(0, 0, 0);
    pop.fill(you);
    expect(ids()).toHaveLength(8);
  });

  it('drops someone only once you are well past the near radius', () => {
    const { pop, you, step, made } = population([person('a', 0, 0)]);
    pop.fill(you);
    expect(pop.get('a')).not.toBeNull();
    you.set(0, 0, P.near + P.hysteresis - 1);
    step(0.5);
    expect(pop.get('a')).not.toBeNull();
    you.set(0, 0, P.near + P.hysteresis + 1);
    step(0.1);
    expect(pop.get('a')).toBeNull();
    expect(made[0].gone).toBe(true);
    // And back: a fresh body.
    you.set(0, 0, 10);
    step(0.1);
    expect(made).toHaveLength(2);
    expect(made[1].gone).toBe(false);
  });

  it('keeps only the nearest few built, however crowded the street', () => {
    const crowd = Array.from({ length: P.most + 20 }, (_, i) => person(`p${i}`, (i % 10) * 3, Math.floor(i / 10) * 3));
    const { pop, you, step } = population(crowd);
    you.set(0, 0, 0);
    pop.fill(you);
    step(0.5);
    expect(pop.built).toHaveLength(P.most);
    const far = (p: PersonPlan) => Math.hypot(p.x, p.z);
    const built = pop.built.map((b) => far(b.plan));
    const left = crowd.filter((p) => !pop.get(p.id)).map(far);
    expect(Math.max(...built)).toBeLessThanOrEqual(Math.min(...left));
  });

  it('says each line in turn as you come close, and nothing without lines', () => {
    const { pop, you, step } = population([
      person('talker', 0, 0, { barks: ['One.', 'Two.'] }),
      person('quiet', 20, 0),
    ]);
    const B = CONFIG.villagers.bark;
    const visit = (x: number) => {
      you.set(x + B.rearm + 1, 0, 0);
      step(0.2);
      you.set(x + 1, 0, 0);
      step(0.2);
    };
    pop.fill(you);
    visit(0);
    visit(0);
    visit(0);
    visit(20);
    const talker = pop.get('talker') as Body;
    expect(talker.said.filter((l) => l !== null)).toEqual(['One.', 'Two.', 'One.']);
    expect((pop.get('quiet') as Body).said.filter((l) => l !== null)).toEqual([]);
  });

  it('walks a stroller on while they are dropped', () => {
    const { pop, you, step } = population([person('walker', 0, 0, { route: [{ x: 0, z: 40 }] })]);
    you.set(0, 0, 0);
    pop.fill(you);
    you.set(0, 0, -400);
    step(10);
    expect(pop.get('walker')).toBeNull();
    you.set(0, 0, 0);
    step(0.1);
    const walker = pop.get('walker') as Body;
    // Ten seconds on at a stroll, less the pause at the far end if they reached it.
    expect(walker.at.z).toBeGreaterThan(5);
  });
});

describe('a stroll', () => {
  it('walks from the start along the route and back at a walk, standing at each end', () => {
    const W = P.walk;
    const walk = strollFrom(0, 0, [{ x: 0, z: 10 }, { x: 10, z: 10 }]);
    expect(walk.length).toBeCloseTo(20);
    const at = () => walk.spot(0);
    expect(at()).toMatchObject({ x: 0, z: 0 });
    for (let t = 0; t < 5; t += DT) walk.step(DT);
    expect(at().z).toBeCloseTo(5 * W.speed, 1);
    // Facing the way they walk: +Z, yaw 0.
    expect(at().yaw).toBeCloseTo(0);
    // At the far end, a pause, then back along it.
    for (let t = 0; t < 20 / W.speed - 5 + 0.1; t += DT) walk.step(DT);
    expect(walk.pausing).toBe(true);
    for (let t = 0; t < W.pause + 2; t += DT) walk.step(DT);
    expect(walk.pausing).toBe(false);
    expect(at().x).toBeLessThan(10);
  });
});

describe('the wardrobe', () => {
  it('builds each look once, shares it between everyone wearing it, and lets it go with the last', () => {
    const w = new Wardrobe();
    const a = w.dress('shepherd');
    const b = w.dress('shepherd');
    const c = w.dress('goodwife');
    expect(w.built).toBe(2);
    expect(b.mesh.geometry).toBe(a.mesh.geometry);
    expect(c.mesh.geometry).not.toBe(a.mesh.geometry);
    // Each poses on its own skeleton.
    expect(b.bones.head).not.toBe(a.bones.head);
    let disposed = 0;
    a.mesh.geometry.addEventListener('dispose', () => disposed++);
    w.undress('shepherd');
    expect(disposed).toBe(0);
    w.undress('shepherd');
    expect(disposed).toBe(1);
    expect(w.built).toBe(1);
  });

  it('dresses every one of the cast under the human body cap, culled by a sphere round their whole body', () => {
    const w = new Wardrobe();
    for (const id of Object.keys(CAST) as CastId[]) {
      const rig = w.dress(id);
      expect(rig.triangles, id).toBeLessThan(900);
      rig.cullOutside(P.pad);
      expect(rig.mesh.frustumCulled).toBe(true);
      // Boots to a hand raised high over their head inside it.
      const s = rig.mesh.boundingSphere!;
      const p = rig.proportions;
      const reach = p.hipY + 0.06 + p.spine + p.upperArm + p.forearm + 0.1;
      expect(s.containsPoint(new Vector3(0, 0, 0)), id).toBe(true);
      expect(s.containsPoint(new Vector3(0, reach, 0)), id).toBe(true);
    }
  });

  it('gives every work loop to anyone of the cast', () => {
    for (const id of Object.keys(CAST) as CastId[]) {
      for (const [name, make] of Object.entries(WORKS)) {
        const loop = make(CAST[id].stand, -1);
        expect(loop.duration, `${id} ${name}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("every zone's people and camps", () => {
  let zones: Zone[];
  beforeAll(async () => {
    zones = [];
    for (const info of MAPS) {
      if (info.kind !== 'zone') continue;
      zones.push(await info.load());
    }
  }, 60000);

  /** Points along `plan`'s stroll, every metre, or just their spot. */
  const along = (plan: PersonPlan): { x: number; z: number }[] => {
    if (!plan.route?.length) return [plan];
    const walk = strollFrom(plan.x, plan.z, plan.route);
    return Array.from({ length: Math.ceil(walk.length) + 1 }, (_, i) => {
      walk.reset(i);
      return walk.spot(0);
    });
  };

  it('places each villager under an id nobody else has, one of the cast at a work there is', () => {
    const ids = zones.flatMap((z) => z.people.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(VILLAGERS as readonly string[]).not.toContain(id);
    for (const p of zones.flatMap((z) => z.people)) {
      expect(CAST[p.cast], p.id).toBeDefined();
      if (p.work) expect(WORKS[p.work], p.id).toBeDefined();
    }
  });

  it("stands each villager in their own zone, where you can walk, clear of walls, props and trees, along all their stroll", () => {
    const r = CONFIG.villagers.radius;
    for (const zone of zones) {
      for (const plan of zone.people) {
        for (const at of along(plan)) {
          const where = `${plan.id} at (${at.x.toFixed(1)}, ${at.z.toFixed(1)})`;
          expect(zone.walkable.contains(at.x, at.z), where).toBe(true);
          const p = new Vector3(at.x, 0, at.z);
          expect(zone.collide(p, r), where).toBe(false);
          const { land } = zone;
          expect(at.x >= land.minX && at.x <= land.maxX && at.z >= land.minZ && at.z <= land.maxZ, where).toBe(true);
        }
      }
    }
  });

  it('gives each camp an id nobody else has, beginning with its zone id outside the starting zone, and every kill a quest asks a camp that is there', () => {
    const ids = zones.flatMap((z) => z.camps.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const zone of zones) {
      if ('hale' in zone) continue;
      for (const c of zone.camps) expect(c.id.startsWith(`${zone.id}-`), c.id).toBe(true);
    }
    for (const chain of CHAINS) {
      for (const q of chain.quests) {
        for (const o of q.objectives) if (o.kind === 'kill' && o.camp) expect(ids, `${q.id}: ${o.camp}`).toContain(o.camp);
      }
    }
  });

  it('wakes you where you can walk in the zone you fell in', () => {
    for (const zone of zones) {
      for (const r of zone.respawnPoints) {
        expect(zone.walkable.contains(r.x, r.z), zone.id).toBe(true);
        expect(zone.collide(new Vector3(r.x, 0, r.z), 0.3), zone.id).toBe(false);
      }
    }
  });
});
