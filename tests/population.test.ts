import { Box3, Group, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { MAPS } from '../src/maps/registry';
import type { PersonPlan, Zone } from '../src/maps/types';
import { BUILDS } from '../src/models/human';
import { CAST, type CastId, Wardrobe } from '../src/people/cast';
import { Fallen } from '../src/people/fallen';
import { type Builder, type Placed, Population, type Streets, villagersOn } from '../src/people/population';
import { strollFrom } from '../src/people/villagers';
import { WORKS } from '../src/people/work';
import { CHAINS, type QuestMoment, VILLAGERS } from '../src/quests';
import { NO_STORY, type Story } from '../src/story';

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

/** A story whose moments come as a test says: `come.add('quest:stage')`. */
function told() {
  const come = new Set<string>();
  const story: Story = { reached: (m) => come.has(`${m.quest}:${m.stage}`) };
  return { story, come };
}

/** A population of stand-in bodies, counting the builds. */
function population(people: PersonPlan[], story: Story = NO_STORY) {
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
  const pop = new Population(builder, story);
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
    for (let t = 0; t < 1; t += DT) pop.update(DT, you, { near: 75, most: P.most });
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

  it("keeps to the zone's own crowd: a city's nearer and thicker", () => {
    const city = { near: 50, most: 45 };
    const street = Array.from({ length: 60 }, (_, i) => person(`p${i}`, (i % 10) * 4, Math.floor(i / 10) * 4));
    const { pop, you } = population([...street, person('past', 0, 70)]);
    you.set(0, 0, 0);
    pop.fill(you, city);
    expect(pop.built).toHaveLength(45);
    expect(pop.get('past')).toBeNull();
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

  it('brings someone only from their moment of a quest on, and takes another away for good at theirs', () => {
    const { story, come } = told();
    const home: QuestMoment = { quest: 'northWind', stage: 'handedIn' };
    const left: QuestMoment = { quest: 'emptyOffice', stage: 'handedIn' };
    const { pop, you, step, ids, made } = population([person('son', 0, 5, { from: home }), person('hask', 5, 0, { until: left }), person('wife', 0, -5)], story);
    pop.fill(you);
    expect(ids()).toEqual(['hask', 'wife']);
    come.add('northWind:handedIn');
    step(0.1);
    expect(ids()).toEqual(['hask', 'son', 'wife']);
    come.add('emptyOffice:handedIn');
    step(0.1);
    expect(ids()).toEqual(['son', 'wife']);
    expect(made.find((b) => b.plan.id === 'hask')!.gone).toBe(true);
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

describe('the fallen', () => {
  /** Flat ground at 2 m, counting who's made solid on it. */
  const streets = () => {
    const bodies: unknown[] = [];
    const s: Streets = {
      heightAt: () => 2,
      resolve: () => false,
      lineOfSight: () => true,
      steer: () => {},
      arrowStops: () => false,
      addBody: (b) => bodies.push(b),
      removeBody: (b) => bodies.splice(bodies.indexOf(b), 1),
    };
    return { s, bodies };
  };

  it('lie face down along the way they faced, on the ground, still and not solid', () => {
    const { s, bodies } = streets();
    const root = new Group();
    const builder = villagersOn(s, root);
    const yaw = Math.PI / 2;
    // The goodwife: nothing long in her hands to stick out of the ground or up from it.
    const dead = builder.make({ id: 'digger', cast: 'goodwife', x: 10, z: 0, yaw, fallen: true }, null);
    expect(dead).toBeInstanceOf(Fallen);
    expect(bodies).toHaveLength(0);
    const body = new Box3().setFromObject((dead as Fallen).rig.mesh, true);
    // Low on the ground, a bent knee the highest of it, none of it far under.
    expect(body.max.y - 2).toBeLessThan(0.55);
    expect(body.min.y - 2).toBeGreaterThan(-0.15);
    // Long along +X, the way they faced, from their feet at their spot.
    expect(body.max.x - body.min.x).toBeGreaterThan(1.6);
    expect(body.min.x).toBeGreaterThan(9.4);
    expect(body.max.z - body.min.z).toBeLessThan(1.4);
    // Never stepped: nothing of it updates its matrix.
    let moving = 0;
    (dead as Fallen).root.traverse((o) => (moving += o.matrixAutoUpdate ? 1 : 0));
    expect(moving).toBe(0);
    builder.drop(dead, { id: 'digger', cast: 'goodwife', x: 10, z: 0, yaw, fallen: true });
    expect(root.children).toHaveLength(0);
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
        const p = CAST[id];
        const loop = make(p.stand, -1, { build: BUILDS[p.look.build], load: p.load?.pose });
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

  it('shows each zone a crowd no wider than the chunks drawn in full round you, and no bigger than the frame can carry', () => {
    for (const zone of zones) {
      expect(zone.crowd.near, zone.id).toBeGreaterThan(0);
      expect(zone.crowd.near, zone.id).toBeLessThanOrEqual(CONFIG.streaming.full);
      expect(zone.crowd.most, zone.id).toBeGreaterThan(0);
      // About 1.5k triangles and 2 draw calls each, both eyes, if all of them are in view.
      expect(zone.crowd.most, zone.id).toBeLessThanOrEqual(50);
    }
  });

  it('names a quest there is at every moment that brings or takes away someone or a camp, or turns a camp; and the fallen only lie there', () => {
    const quests = new Set(CHAINS.flatMap((c) => c.quests.map((q) => q.id)));
    for (const zone of zones) {
      for (const p of zone.people) {
        for (const m of [p.from, p.until]) if (m) expect(quests, `${p.id}: ${m.quest}`).toContain(m.quest);
        if (p.fallen) expect([p.work, p.route, p.barks], p.id).toEqual([undefined, undefined, undefined]);
      }
      for (const c of zone.camps) for (const m of [c.from, c.until, c.neutralUntil]) if (m) expect(quests, `${c.id}: ${m.quest}`).toContain(m.quest);
    }
  });

  it('keeps those on a prop or a seat where they are, and gives a stroller a start along their way', () => {
    for (const plan of zones.flatMap((z) => z.people)) {
      if (plan.deck !== undefined || plan.seat !== undefined || plan.hang) expect(plan.route, plan.id).toBeUndefined();
      if (plan.hang) expect(plan.seat, plan.id).toBeDefined();
      if (plan.start !== undefined) expect(plan.start >= 0 && plan.start < 1, plan.id).toBe(true);
      if (plan.cries) expect(plan.work && WORKS[plan.work](CAST[plan.cast].stand, 0, { build: BUILDS[CAST[plan.cast].look.build] }).cries?.length, plan.id).toBeTruthy();
    }
  });

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
        // On a prop's floor (a deck, the treadwheel) or sitting on an edge, they're off the ground you walk.
        const off = plan.deck !== undefined || plan.hang;
        for (const at of along(plan)) {
          const where = `${plan.id} at (${at.x.toFixed(1)}, ${at.z.toFixed(1)})`;
          if (!off) expect(zone.walkable.contains(at.x, at.z), where).toBe(true);
          const p = new Vector3(at.x, 0, at.z);
          if (!off) expect(zone.collide(p, r), where).toBe(false);
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
