import { Group, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Solid } from '../src/animals/animal';
import { animalsOn, Dog, Flock, Fold, Herds, Tethered } from '../src/animals/herds';
import { CONFIG } from '../src/config';
import { MAPS } from '../src/maps/registry';
import type { DogPlan, FlockPlan, HerdPlan, TetherPlan, Zone } from '../src/maps/types';
import { ANIMALS, type AnimalId, type Species } from '../src/models/animals';
import type { Streets } from '../src/people/population';
import { steerRound } from '../src/world/ground';

// The animals a zone places (animals/herds.ts): built a herd at a time as you
// come near and dropped as you go on, sharing a body per look; a shy flock
// runs from you and drifts home once you've gone, a tame one steps aside; a
// dog minds its flock and goes back to its bed; a horse stays at its tether.
// And every zone's animals stand where they can.

const A = CONFIG.animals;
const F = A.flock;
const DT = 1 / 30;

/** Somewhere to stand: flat open ground (or a zone's), where the animals' solids push each other apart as the World's do. */
function field(zone?: Zone): Streets & { readonly bodies: Solid[] } {
  const bodies: Solid[] = [];
  const resolve = (p: Vector3, radius: number): boolean => {
    let moved = zone ? zone.resolve(p, radius) : false;
    for (const b of bodies) {
      const dx = p.x - b.x;
      const dz = p.z - b.z;
      const min = b.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 1e-6;
      p.x = b.x + (dx / d) * min;
      p.z = b.z + (dz / d) * min;
      moved = true;
    }
    return moved;
  };
  return {
    bodies,
    heightAt: (x, z) => zone?.heightAt(x, z) ?? 0,
    resolve,
    lineOfSight: () => true,
    steer: (from, dir, radius) => steerRound(resolve, from, dir, radius),
    arrowStops: () => false,
    addBody: (b) => bodies.push(b as Solid),
    removeBody: (b) => {
      const i = bodies.indexOf(b as Solid);
      if (i >= 0) bodies.splice(i, 1);
    },
  };
}

/** Herds on `ground`, with you standing at `you`, counting what's built. */
function herds(plans: HerdPlan[], ground = field()) {
  const fold = new Fold();
  const root = new Group();
  const h = new Herds(animalsOn(ground, root, fold));
  h.add(plans);
  const you = new Vector3();
  const step = (seconds: number, each?: () => void) => {
    for (let t = 0; t < seconds - 1e-9; t += DT) {
      h.update(DT, you);
      each?.();
    }
  };
  return { h, you, step, fold, root, ground };
}

const flock = (id: string, x: number, z: number, more: Partial<FlockPlan> = {}): FlockPlan => ({ kind: 'flock', id, x, z, sheep: ['moorEwe', 'moorEwe', 'moorEwe', 'lamb'], shy: true, ...more });
const dog = (id: string, x: number, z: number, more: Partial<DogPlan> = {}): DogPlan => ({ kind: 'dog', id, x, z, yaw: 0, dog: 'sheepdog', ...more });
const horse = (id: string, x: number, z: number, more: Partial<TetherPlan> = {}): TetherPlan => ({ kind: 'tethered', id, x, z, yaw: 0, horse: 'cartHorse', ...more });

/** How far each of `herd`'s animals is from (x, z): the nearest and the farthest. */
function reach(animals: readonly { distanceTo(x: number, z: number): number }[], x: number, z: number) {
  const d = animals.map((a) => a.distanceTo(x, z));
  return { near: Math.min(...d), far: Math.max(...d) };
}

describe('the herds', () => {
  it('builds none until you come near, then the nearest a few herds a frame, and no more animals than the cap', () => {
    const near = CONFIG.population.near;
    const plans = Array.from({ length: 16 }, (_, i) => flock(`f${i}`, 10 + i * 4, 0));
    const { h, you, step } = herds(plans);
    you.set(-near - 60, 0, 0);
    step(0.2);
    expect(h.built).toEqual([]);
    you.set(0, 0, 0);
    h.update(DT, you);
    expect(h.built.map((b) => b.plan.id)).toEqual(['f0', 'f1'].slice(0, A.perFrame));
    step(2);
    const animals = h.built.reduce((n, b) => n + b.animals.length, 0);
    expect(animals).toBeLessThanOrEqual(A.most);
    expect(animals).toBeGreaterThan(A.most - 4);
    // The nearest are the ones built.
    expect(h.built.map((b) => b.plan.id)).toEqual(plans.slice(0, h.built.length).map((p) => p.id));
  });

  it('drops a herd only once you are well past, and stands its animals solid only while they are built', () => {
    const { h, you, step, ground, root } = herds([flock('f', 0, 0), horse('h', 6, 0)]);
    h.fill(you);
    expect(h.built).toHaveLength(2);
    // Four sheep, and a horse solid at both ends.
    expect(ground.bodies).toHaveLength(6);
    expect(root.children).toHaveLength(5);
    you.set(CONFIG.population.near + 10, 0, 0);
    step(0.2);
    expect(h.built).toHaveLength(2);
    you.set(CONFIG.population.near + CONFIG.population.hysteresis + 20, 0, 0);
    step(0.2);
    expect(h.built).toEqual([]);
    expect(ground.bodies).toEqual([]);
    expect(root.children).toEqual([]);
  });

  it('builds each look once and shares it, letting it go with the last body', () => {
    const { h, you, step, fold } = herds([flock('a', 0, 0), flock('b', 30, 0, { sheep: ['moorEwe', 'moorEwe'] })]);
    h.fill(you);
    // A moor ewe and a lamb: two looks for six bodies.
    expect(fold.built).toBe(2);
    const [a, b] = h.built;
    expect(a.animals[0].rig.mesh.geometry).toBe(b.animals[1].rig.mesh.geometry);
    you.set(-1000, 0, 0);
    step(0.1);
    expect(fold.built).toBe(0);
  });
});

describe('a shy flock', () => {
  it('grazes about its home, within its roam, until you come', () => {
    const { h, you, step } = herds([flock('f', 0, 0, { roam: 5 })]);
    you.set(60, 0, 0);
    h.fill(you);
    const stances = new Set<string>();
    let far = 0;
    step(240, () => {
      for (const a of h.built[0].animals) {
        stances.add(a.stance);
        far = Math.max(far, a.distanceTo(0, 0));
      }
    });
    expect(far).toBeLessThan(5 + 1);
    expect(stances).toContain('graze');
    expect(stances).toContain('alert');
  });

  it('runs from you, every sheep straight away, and stays off while you stand there', () => {
    const { h, you, step } = herds([flock('f', 0, 0)]);
    you.set(30, 0, 0);
    h.fill(you);
    step(1);
    // Walk up to the flock.
    for (let x = 30; x > F.fear - 1; x -= 1.4 * DT) {
      you.x = x;
      step(DT);
    }
    const herd = h.built[0] as Flock;
    expect(herd.scared).toBe(true);
    step(8);
    const { near } = reach(herd.animals, you.x, you.z);
    expect(near).toBeGreaterThan(F.safe - 1);
    // Away from you, not round you: all of them on the far side.
    for (const a of herd.animals) expect(a.position.x).toBeLessThan(you.x - 2);
    step(20);
    expect(reach(herd.animals, you.x, you.z).near).toBeGreaterThan(F.safe - 1);
  });

  it('drifts back home once you have gone', () => {
    const { h, you, step } = herds([flock('f', 0, 0, { roam: 4 })]);
    you.set(2, 0, 0);
    h.fill(you);
    step(10);
    const herd = h.built[0] as Flock;
    expect(reach(herd.animals, 0, 0).far).toBeGreaterThan(8);
    // Off along the road, well clear of their home.
    you.set(40, 0, 0);
    step(120);
    expect(herd.scared).toBe(false);
    expect(reach(herd.animals, 0, 0).far).toBeLessThan(4 + 1.5);
  });
});

describe('a tame flock', () => {
  it('only steps out of your way', () => {
    const { h, you, step } = herds([flock('f', 0, 0, { sheep: ['whiteSheep', 'whiteSheep', 'whiteSheep'], shy: false, roam: 5 })]);
    you.set(30, 0, 0);
    h.fill(you);
    const sheep = h.built[0].animals[1];
    // Stand right by one.
    you.set(sheep.position.x + 0.6, 0, sheep.position.z);
    step(6);
    expect(sheep.distanceTo(you.x, you.z)).toBeGreaterThan(F.aside);
    // None ran.
    expect(reach(h.built[0].animals, 0, 0).far).toBeLessThan(5 + 2);
    expect((h.built[0] as Flock).scared).toBe(false);
  });
});

describe('a dog', () => {
  it('lies on its bed and lifts its head to you', () => {
    const { h, you, step } = herds([dog('d', 0, 0, { dog: 'townDog' })]);
    you.set(20, 0, 0);
    h.fill(you);
    const d = h.built[0] as Dog;
    const a = d.animals[0];
    expect(a.stance).toBe('lie');
    expect(a.lookAt).toBeNull();
    you.set(A.notice - 2, 0, 0);
    step(0.5);
    expect(a.lookAt).toBe(you);
    step(120);
    // A dog minding nothing stays where it lies.
    expect(a.distanceTo(0, 0)).toBeLessThan(0.05);
    expect(d.minding).toBe('lie');
  });

  it('goes round the flock it minds, sniffing on the way, and back to its bed to lie down', () => {
    const fold = flock('fold', 0, 0, { roam: 3 });
    const { h, you, step } = herds([fold, dog('d', 8, 4, { minds: 'fold', ring: 7 })]);
    you.set(80, 0, 0);
    h.fill(you);
    const d = h.built.find((b) => b instanceof Dog) as Dog;
    const a = d.animals[0];
    const seen = new Set<string>();
    const sides = new Set<string>();
    step(A.follow.every[1] + 60, () => {
      seen.add(d.minding);
      if (d.minding === 'round' && a.distanceTo(0, 0) > 5) sides.add(`${Math.sign(Math.round(a.position.x / 4))},${Math.sign(Math.round(a.position.z / 4))}`);
    });
    expect([...seen]).toEqual(expect.arrayContaining(['lie', 'round', 'sniff', 'back']));
    // All the way round: on every side of the flock.
    expect(sides.size).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < 120 && d.minding !== 'lie'; i++) step(1);
    expect(a.distanceTo(8, 4)).toBeLessThan(0.5);
    step(2);
    expect(a.stance).toBe('lie');
  });

  it('follows its flock when it scatters, and goes home with it', () => {
    const fold = flock('fold', 0, 0, { roam: 3 });
    const { h, you, step } = herds([fold, dog('d', 8, 4, { minds: 'fold', ring: 7 })]);
    you.set(-4, 0, 0);
    h.fill(you);
    step(8);
    const d = h.built.find((b) => b instanceof Dog) as Dog;
    expect(d.minding).toBe('follow');
    const sheep = (h.built.find((b) => b instanceof Flock) as Flock).centre(new Vector3());
    expect(d.animals[0].distanceTo(sheep.x, sheep.z)).toBeLessThan(10);
    you.set(-60, 0, 0);
    step(150);
    expect(d.minding).not.toBe('follow');
  });
});

describe('a tethered horse', () => {
  it('stays at its tether, shifts, crops and rests a leg, and turns its head to you', () => {
    const { h, you, step } = herds([horse('h', 0, 0, { yaw: 1 })]);
    you.set(30, 0, 0);
    h.fill(you);
    const t = h.built[0] as Tethered;
    const a = t.animals[0];
    const stances = new Set<string>();
    step(200, () => stances.add(a.stance));
    expect(a.distanceTo(0, 0)).toBeLessThan(0.01);
    expect(a.yaw).toBeCloseTo(1, 5);
    expect([...stances].sort()).toEqual(['graze', 'rest', 'stand']);
    you.set(3, 0, 2);
    step(0.5);
    expect(a.lookAt).toBe(you);
    expect(a.stance).not.toBe('graze');
    // Solid along its length: at both ends.
    expect(a.solids).toHaveLength(2);
    const [front, back] = a.solids;
    expect(Math.hypot(front.x - back.x, front.z - back.z)).toBeGreaterThan(0.8);
  });
});

describe("every zone's animals", () => {
  let zones: Zone[];
  beforeAll(async () => {
    zones = [];
    for (const info of MAPS) if (info.kind === 'zone') zones.push(await info.load());
  }, 60000);

  const species: Record<HerdPlan['kind'], Species> = { flock: 'sheep', dog: 'dog', tethered: 'horse' };
  const looks = (p: HerdPlan): AnimalId[] => (p.kind === 'flock' ? [...p.sheep] : [p.kind === 'dog' ? p.dog : p.horse]);

  it('places each herd under an id nobody else has, beginning with its zone id, in looks of its kind', () => {
    const ids = zones.flatMap((z) => z.animals.map((a) => a.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const zone of zones) {
      for (const p of zone.animals) {
        expect(p.id.startsWith(`${zone.id}-`), p.id).toBe(true);
        for (const look of looks(p)) expect(ANIMALS[look].species, `${p.id}: ${look}`).toBe(species[p.kind]);
        if (p.kind === 'dog' && p.minds) expect(zone.animals.find((f) => f.id === p.minds)?.kind, p.id).toBe('flock');
      }
    }
  });

  it('stands each where it can, clear of walls, props and trees, its sheep round its home and a horse along its length', () => {
    for (const zone of zones) {
      const ground = field();
      const root = new Group();
      const builder = animalsOn(ground, root);
      for (const plan of zone.animals) {
        const herd = builder.make(plan);
        for (const a of herd.animals) {
          for (const s of a.solids) {
            const where = `${plan.id} at (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`;
            expect(zone.walkable.contains(s.x, s.z), where).toBe(true);
            expect(zone.collide(new Vector3(s.x, 0, s.z), s.r), where).toBe(false);
          }
        }
        builder.drop(herd);
      }
    }
  });

  it("walks Wenna's dog round Hob's Fold on the moor itself, and back to its bed", () => {
    const moor = zones.find((z) => z.id === 'brackenmoor')!;
    const plans = moor.animals.filter((p) => p.id === 'brackenmoor-hobs-fold' || p.id === 'brackenmoor-wennas-dog');
    expect(plans).toHaveLength(2);
    const { h, you, step } = herds(plans, field(moor));
    you.set(-36, 0, 290);
    h.fill(you);
    const d = h.built.find((b) => b instanceof Dog) as Dog;
    const plan = plans[1] as DogPlan;
    let farthest = 0;
    let rounds = 0;
    let was = d.minding;
    step(A.follow.every[1] + 90, () => {
      farthest = Math.max(farthest, d.animals[0].distanceTo(plan.x, plan.z));
      if (was !== 'round' && d.minding === 'round') rounds++;
      was = d.minding;
    });
    expect(rounds).toBeGreaterThan(0);
    // Its bed is 17 m from the fold's middle: round the far side is well past that.
    expect(farthest).toBeGreaterThan(20);
    for (let i = 0; i < 120 && d.minding !== 'lie'; i++) step(1);
    expect(d.animals[0].distanceTo(plan.x, plan.z)).toBeLessThan(0.6);
  });
});
