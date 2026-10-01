import { MeshLambertMaterial } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { Birds, Flock, surroundingsOf } from '../src/birds/birds';
import { birdGeometry, FlockMesh } from '../src/birds/flock';
import { Bird } from '../src/birds/mover';
import { perchesFor, perchSpots, type Surroundings, type You } from '../src/birds/ways';
import { CONFIG } from '../src/config';
import { BirdStand } from '../src/inspector/birds';
import { MAPS } from '../src/maps/registry';
import type { BirdFlockPlan, Zone } from '../src/maps/types';
import { BIRD_BONE_COUNT, BIRD_LOOKS, type BirdLookId } from '../src/models/bird';

// The birds (birds/): one small skeleton of ten bones, five families of looks
// built on it in code, a flock drawn as one mesh; and how each kind of flock
// lives: pigeons bursting up and settling on perches, grouse hidden until
// they whirr up and away, ravens off their perches and circling, ducks
// leaving the water as you wade in, herons flying on and coming home. And
// every zone's flocks are placed where their birds can be.

const LOOKS = Object.keys(BIRD_LOOKS) as BirdLookId[];
const material = new MeshLambertMaterial();
const DT = 1 / 72;

/**
 * A flat world to try flocks in: the ground at 0, a round pond at (30, 0)
 * 10 m across (water at 0, its bed sloping down to 0.6 m deep 3 m in), and
 * a wall at x = -40 nobody can stand past.
 */
const POND = { x: 30, z: 0, r: 10 };
const FLAT: Surroundings = {
  heightAt: (x, z) => {
    const d = Math.hypot(x - POND.x, z - POND.z);
    return d < POND.r ? -0.6 * Math.min(1, (POND.r - d) / 3) : 0;
  },
  waterAt: (x, z) => (Math.hypot(x - POND.x, z - POND.z) < POND.r ? 0 : NaN),
  clear: (x) => x > -40,
};

/** You at (x, z), wading if that's in the pond. */
const at = (x: number, z: number): You => ({ x, z, wading: Math.hypot(x - POND.x, z - POND.z) < POND.r });

/** Live `flock` for `seconds` with you at `you`; `each` sees every frame. */
function live(flock: Flock, seconds: number, you: You, each?: (t: number) => void): void {
  for (let t = 0; t < seconds; t += DT) {
    flock.update(DT, you);
    each?.(t);
  }
}

const flockOf = (plan: Omit<BirdFlockPlan, 'id'>, near = FLAT) => new Flock({ id: `test-${plan.ways}`, ...plan }, near, material, () => {});

describe('the bird skeleton', () => {
  it('builds every look in code on ten bones, under 150 triangles a bird', () => {
    for (const look of LOOKS) {
      const g = birdGeometry(look);
      const tris = g.getAttribute('position').count / 3;
      expect(tris, look).toBeLessThanOrEqual(150);
      expect(tris, look).toBeGreaterThan(40);
      const skin = g.getAttribute('skinIndex');
      for (let v = 0; v < skin.count; v++) expect(skin.getX(v), look).toBeLessThan(BIRD_BONE_COUNT);
    }
  });

  it('draws a flock as one mesh, one draw call, its birds’ bones side by side', () => {
    const looks: BirdLookId[] = ['pigeon', 'pigeon', 'crow', 'gull'];
    const flock = new FlockMesh(looks, material);
    const sum = looks.reduce((n, look) => n + birdGeometry(look).getAttribute('position').count / 3, 0);
    expect(flock.triangles).toBe(sum);
    expect(flock.mesh.skeleton.bones.length).toBe(looks.length * BIRD_BONE_COUNT);
    expect(flock.mesh.geometry.groups.length).toBeLessThanOrEqual(1);
    flock.dispose();
  });

  it('stands every look with its toes on the ground, and swims every water bird with the waterline across its body', () => {
    for (const look of LOOKS) {
      const bird = new Bird(look, 1, 1);
      const mesh = new FlockMesh([look], material);
      bird.standAt(0, 0, 0.3, FLAT);
      bird.update(DT, FLAT);
      mesh.pose(0, bird.at, bird.pose);
      let [lo, hi] = [Infinity, -Infinity];
      mesh.vertices((_x, y) => ([lo, hi] = [Math.min(lo, y), Math.max(hi, y)]));
      expect(lo, look).toBeCloseTo(0, 1);
      expect(Math.abs(lo), look).toBeLessThan(0.03);
      expect(hi, look).toBeGreaterThan(BIRD_LOOKS[look].body.leg);
      if (BIRD_LOOKS[look].family !== 'duck' && look !== 'gull') {
        mesh.dispose();
        continue;
      }
      bird.swimAt(POND.x, POND.z, 0, 0);
      bird.update(DT, FLAT);
      mesh.pose(0, bird.at, bird.pose);
      [lo, hi] = [Infinity, -Infinity];
      mesh.vertices((_x, y) => ([lo, hi] = [Math.min(lo, y), Math.max(hi, y)]));
      expect(lo, look).toBeLessThan(0);
      expect(hi, look).toBeGreaterThan(0.05);
      mesh.dispose();
    }
  });

  it('plays every inspector clip of every look with the bird whole and finite', () => {
    for (const look of LOOKS) {
      const stand = new BirdStand(look, material);
      expect(stand.clips.length, look).toBeGreaterThanOrEqual(8);
      for (const [i, clip] of stand.clips.entries()) {
        for (let k = 0; k <= 6; k++) {
          const f = stand.play(i, (k / 6) * clip.duration);
          expect(f.phase, `${look} ${clip.name}`).toBeTruthy();
          let [finite, reach] = [true, 0];
          stand.flock.vertices((x, y, z) => {
            finite &&= Number.isFinite(x + y + z);
            reach = Math.max(reach, Math.abs(x) + Math.abs(z));
          });
          expect(finite, `${look} ${clip.name}`).toBe(true);
          expect(reach, `${look} ${clip.name}`).toBeLessThan(3);
        }
      }
      stand.flock.dispose();
    }
  });

  it('spreads birds along a perch’s row, or one bird to a perch in turn', () => {
    const row = perchSpots([{ x: 0, y: 2, z: 0, yaw: 0, w: 2 }], 0.5, () => 0);
    expect(row.length).toBe(5);
    expect(row.map((s) => s.x)).toEqual([-1, -0.5, 0, 0.5, 1]);
    expect(row.every((s) => s.y === 2 && s.z === 0)).toBe(true);
    const each = perchesFor([{ x: 0, y: 1, z: 0 }, { x: 5, z: 0, yaw: Math.PI / 2, w: 2 }], 3, () => 0.5);
    expect(each.map((s) => [s.x, s.y])).toEqual([[0, 1], [5, 0.5], [0, 1]]);
  });
});

describe('a flock of', () => {
  it('pigeons feeds, bursts up all at once as you come through, settles on its perches, and drops back down once you’ve gone', () => {
    const flock = flockOf({ ways: 'flush', birds: Array(8).fill('pigeon'), x: 0, z: 0, r: 4, perches: [{ x: 0, y: 3, z: 10, yaw: Math.PI, w: 4 }] });
    live(flock, 6, at(60, 0));
    for (const b of flock.birds) {
      expect(b.flying).toBe(false);
      expect(Number.isNaN(b.perch)).toBe(true);
      expect(Math.hypot(b.at.x, b.at.z)).toBeLessThan(4.5);
    }
    live(flock, 1, at(1, 1));
    expect(flock.birds.every((b) => b.flying)).toBe(true);
    // You stand where they fed: they circle, then settle on the rail, out of your way.
    live(flock, 14, at(-6, 0));
    for (const b of flock.birds) {
      expect(b.doing).toBe('stand');
      expect(b.perch).toBe(3);
      expect(b.at.y).toBeCloseTo(3 + b.leg, 2);
      expect(Math.abs(b.at.z - 10)).toBeLessThan(0.01);
    }
    // You go, and they come back down to feed.
    live(flock, 40, at(80, 0));
    for (const b of flock.birds) {
      expect(b.flying).toBe(false);
      expect(Number.isNaN(b.perch)).toBe(true);
      expect(Math.hypot(b.at.x, b.at.z)).toBeLessThan(4.5);
    }
  });

  it('grouse stays hidden till you’re nearly on it, whirrs up and away from you, drops in out of sight, and is home again later', () => {
    const calls: string[] = [];
    const flock = new Flock({ id: 'test-covey', ways: 'covey', birds: ['grouse', 'grouse'], x: 0, z: 0, r: 1.5 }, FLAT, material, (call) => calls.push(call));
    live(flock, 3, at(-9, 0));
    expect(flock.birds.every((b) => b.doing === 'hidden')).toBe(true);
    live(flock, 0.6, at(-4, 0));
    expect(flock.birds.every((b) => b.flying)).toBe(true);
    expect(calls).toEqual(expect.arrayContaining(['whirr', 'goback']));
    // Low, fast, and well away from you.
    let high = 0;
    live(flock, 15, at(-4, 0), () => (high = Math.max(high, ...flock.birds.map((b) => b.at.y))));
    expect(high).toBeLessThan(6);
    for (const b of flock.birds) {
      expect(b.doing).toBe('hidden');
      const d = Math.hypot(b.at.x, b.at.z);
      expect(d).toBeGreaterThan(9);
      expect(d).toBeLessThan(65);
      expect(b.at.x).toBeGreaterThan(0);
    }
    live(flock, CONFIG.birds.away + 5, at(-120, 0));
    for (const b of flock.birds) {
      expect(b.doing).toBe('hidden');
      expect(Math.hypot(b.at.x, b.at.z)).toBeLessThan(2.5);
    }
  });

  it('ravens flies off its perches as you come near, circles overhead, and lands back on them once you’ve gone', () => {
    const flock = flockOf({ ways: 'perch', birds: ['raven', 'raven'], x: 2.5, z: 0, r: 8, perches: [{ x: 0, y: 3, z: 0 }, { x: 5, y: 2, z: 0 }] });
    live(flock, 4, at(-25, 0));
    expect(flock.birds.map((b) => b.perch)).toEqual([3, 2]);
    live(flock, 1, at(-8, 0));
    expect(flock.birds.every((b) => b.flying)).toBe(true);
    live(flock, 10, at(-8, 0), () => {
      for (const b of flock.birds) expect(Math.hypot(b.at.x - 2.5, b.at.z)).toBeLessThan(25);
    });
    expect(flock.birds.every((b) => b.flying && b.at.y > 6)).toBe(true);
    live(flock, 30, at(-60, 0));
    expect(flock.birds.map((b) => b.perch)).toEqual([3, 2]);
    expect(flock.birds.map((b) => [b.at.x, b.at.z])).toEqual([[0, 0], [5, 0]]);
  });

  it('mallards paddles about its water, takes off as you wade in, and comes back down onto it once you’ve gone', () => {
    const flock = flockOf({ ways: 'swim', birds: ['mallard', 'mallardDuck', 'mallard', 'mallardDuck'], x: POND.x, z: POND.z, r: 5 });
    const onWater = () => {
      for (const b of flock.birds) {
        expect(b.doing).toBe('swim');
        expect(Math.hypot(b.at.x - POND.x, b.at.z - POND.z)).toBeLessThan(POND.r);
        expect(Math.abs(b.at.y - (0 - b.sink))).toBeLessThan(0.01);
      }
    };
    // Standing on the bank, you don't trouble them.
    live(flock, 20, at(POND.x, POND.z - POND.r - 2), onWater);
    live(flock, 1.2, at(POND.x, POND.z - 6));
    expect(flock.birds.every((b) => b.flying)).toBe(true);
    live(flock, 45, at(-30, 0));
    onWater();
  });

  it('swans only paddles off from you, briskly, and never flies', () => {
    const flock = flockOf({ ways: 'swim', birds: ['swan', 'swan'], x: POND.x, z: POND.z, r: 6 });
    live(flock, 3, at(POND.x - 20, 0));
    const before = flock.birds.map((b) => Math.hypot(b.at.x - (POND.x - 5), b.at.z));
    live(flock, 8, at(POND.x - 5, 0), () => expect(flock.birds.some((b) => b.flying)).toBe(false));
    flock.birds.forEach((b, i) => expect(Math.hypot(b.at.x - (POND.x - 5), b.at.z)).toBeGreaterThanOrEqual(Math.min(before[i], 6)));
  });

  it('herons stands in the shallows, flies on 30–40 m as you come near, and comes home some while after you’ve gone', () => {
    const home = { x: POND.x + 9, z: 0 };
    const flock = flockOf({ ways: 'wade', birds: ['heron'], ...home, r: 2 });
    const [heron] = flock.birds;
    live(flock, 5, at(home.x + 40, 0));
    expect(heron.footing).toBe('water');
    expect(heron.at.y - heron.leg).toBeCloseTo(FLAT.heightAt(heron.at.x, heron.at.z), 2);
    live(flock, 1, at(home.x + 10, 0));
    expect(heron.flying).toBe(true);
    live(flock, 20, at(home.x + 10, 0));
    expect(heron.flying).toBe(false);
    const fled = Math.hypot(heron.at.x - home.x, heron.at.z - home.z);
    expect(fled).toBeGreaterThan(22);
    expect(fled).toBeLessThan(48);
    live(flock, CONFIG.birds.away + 30, at(home.x + 200, 0));
    expect(heron.flying).toBe(false);
    expect(Math.hypot(heron.at.x - home.x, heron.at.z - home.z)).toBeLessThan(2.5);
  });

  it('hens runs off from you with its wings out, and stays about its patch', () => {
    const flock = flockOf({ ways: 'peck', birds: ['cock', 'hen', 'hen'], x: 0, z: 0, r: 3 });
    live(flock, 5, at(30, 0));
    const you = at(0.5, 0.5);
    let ran = false;
    live(flock, 4, you, () => (ran ||= flock.birds.some((b) => b.running)));
    expect(ran).toBe(true);
    for (const b of flock.birds) {
      expect(Math.hypot(b.at.x - you.x, b.at.z - you.z)).toBeGreaterThan(2);
      expect(Math.hypot(b.at.x, b.at.z)).toBeLessThan(6.5);
    }
  });

  it('geese has one stand up to you and hiss while the rest waddle off', () => {
    const calls: string[] = [];
    const flock = new Flock({ id: 'test-graze', ways: 'graze', birds: ['goose', 'goose', 'goose'], x: 0, z: 0, r: 3 }, FLAT, material, (call) => calls.push(call));
    live(flock, 5, at(30, 0));
    let hissing = 0;
    live(flock, 3, at(-4.5, 0), () => (hissing = Math.max(hissing, flock.birds.filter((b) => b.act === 'hiss').length)));
    expect(hissing).toBe(1);
    expect(calls).toContain('hiss');
  });

  it('gulls over a harbour circles, rising and falling, and never lands', () => {
    const flock = flockOf({ ways: 'circle', birds: Array(6).fill('gull'), x: 0, z: 0, r: 20, high: [10, 20] });
    live(flock, 60, at(5, 5), () => {
      for (const b of flock.birds) {
        expect(b.doing).toBe('fly');
        expect(Math.hypot(b.at.x, b.at.z)).toBeLessThan(40);
        expect(b.at.y).toBeGreaterThan(5);
        expect(b.at.y).toBeLessThan(26);
      }
    });
  });
});

describe('the birds in the world', () => {
  const plans = (n: number): BirdFlockPlan[] => Array.from({ length: n }, (_, i) => ({ id: `test-${i}`, ways: 'perch', birds: ['crow', 'crow'], x: i * 50, z: 0, r: 5, perches: [{ x: i * 50, y: 2, z: 0 }] }));

  it('builds no flock until you come near, then the nearest first, one a frame, one mesh each; and drops it once you’ve gone on', () => {
    const birds = new Birds(() => {}, material);
    birds.add(plans(6), FLAT);
    const you = { x: -500, y: 1.7, z: 0 } as never as import('three').Vector3;
    birds.update(DT, you);
    expect(birds.built.length).toBe(0);
    Object.assign(you, { x: 0 });
    birds.update(DT, you);
    expect(birds.built.map((f) => f.plan.id)).toEqual(['test-0']);
    for (let i = 0; i < 5; i++) birds.update(DT, you);
    const near = CONFIG.birds.near;
    expect(birds.built.length).toBe(plans(6).filter((p) => Math.max(0, Math.abs(p.x) - p.r) < near).length);
    expect(birds.root.children.length).toBe(birds.built.length);
    expect(birds.cost.calls).toBe(birds.built.length);
    Object.assign(you, { x: -near - CONFIG.birds.hysteresis - 10 });
    birds.update(DT, you);
    expect(birds.built.length).toBe(0);
    expect(birds.root.children.length).toBe(0);
  });

  it('asks the zone’s water (dear on the moor) only when a flock wants to know if you’re wading', () => {
    let asked = 0;
    const near: Surroundings = { ...FLAT, waterAt: (x, z) => (asked++, FLAT.waterAt(x, z)) };
    const birds = new Birds(() => {}, material);
    birds.add(plans(3), near);
    const you = { x: 60, y: 1.7, z: 30 } as never as import('three').Vector3;
    birds.fill(you);
    asked = 0;
    for (let i = 0; i < 20; i++) birds.update(DT, you);
    expect(asked).toBe(0);
  });

  it('builds every flock round you at once as you load in', () => {
    const birds = new Birds(() => {}, material);
    birds.add(plans(4), FLAT);
    birds.fill({ x: 75, y: 0, z: 0 } as never);
    expect(birds.built.length).toBe(4);
  });
});

describe("every zone's birds", () => {
  let zones: Zone[];
  beforeAll(async () => {
    zones = [];
    for (const info of MAPS) {
      if (info.kind !== 'zone') continue;
      zones.push(await info.load());
    }
  }, 60000);

  it('are placed under ids nobody else has, each beginning with its zone, of looks there are', () => {
    const ids = zones.flatMap((z) => z.birds.map((f) => f.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const zone of zones) {
      for (const f of zone.birds) {
        expect(f.id.startsWith(`${zone.id}-`), f.id).toBe(true);
        expect(f.birds.length, f.id).toBeGreaterThan(0);
        for (const look of f.birds) expect(BIRD_LOOKS[look], `${f.id}: ${look}`).toBeDefined();
      }
    }
  });

  it('live where their birds can: feeders on dry, clear ground, swimmers on water, waders in the shallows or on the bank, perchers on perches over the ground', () => {
    for (const zone of zones) {
      const near = surroundingsOf(zone);
      const dry = (x: number, z: number) => {
        const w = near.waterAt(x, z);
        return Number.isNaN(w) || w < near.heightAt(x, z) + 0.02;
      };
      for (const f of zone.birds) {
        const where = `${f.id} at (${f.x}, ${f.z})`;
        const { land } = zone;
        expect(f.x >= land.minX && f.x <= land.maxX && f.z >= land.minZ && f.z <= land.maxZ, where).toBe(true);
        switch (f.ways) {
          case 'peck':
          case 'graze':
          case 'flush':
          case 'covey':
            expect(near.clear(f.x, f.z) && dry(f.x, f.z), where).toBe(true);
            break;
          case 'swim': {
            const w = near.waterAt(f.x, f.z);
            expect(w - near.heightAt(f.x, f.z), where).toBeGreaterThan(0.3);
            break;
          }
          case 'wade': {
            const w = near.waterAt(f.x, f.z);
            const depth = Number.isNaN(w) ? 0 : w - near.heightAt(f.x, f.z);
            expect(depth, where).toBeLessThan(CONFIG.birds.shallows);
            if (depth <= 0.03) expect(near.clear(f.x, f.z), where).toBe(true);
            break;
          }
          case 'perch':
            expect(f.perches?.length, where).toBeGreaterThan(0);
            break;
          case 'circle':
            expect(f.high, where).toBeDefined();
            break;
        }
        for (const p of f.perches ?? []) {
          const ground = zone.heightAt(p.x, p.z);
          const y = p.y ?? ground;
          expect(y, `${where}: a perch at (${p.x}, ${p.z})`).toBeGreaterThanOrEqual(ground - 0.05);
          expect(y - ground, `${where}: a perch at (${p.x}, ${p.z})`).toBeLessThan(30);
          if (p.y === undefined) expect(dry(p.x, p.z), `${where}: a perch on the ground at (${p.x}, ${p.z})`).toBe(true);
        }
      }
    }
  });

  it('cost little to draw: every flock in a zone built at once is under 10k triangles and one draw call a flock', () => {
    for (const zone of zones) {
      const birds = new Birds(() => {}, material);
      birds.add(zone.birds, surroundingsOf(zone));
      birds.fill({ x: 0, y: 0, z: 0 } as never, Infinity);
      const { triangles, calls } = birds.cost;
      expect(calls, zone.id).toBe(zone.birds.length);
      expect(triangles, zone.id).toBeLessThan(10000);
      birds.dispose();
    }
  });

  it('settle in their zones and live a minute there without anything going wrong', () => {
    for (const zone of zones) {
      const near = surroundingsOf(zone);
      for (const plan of zone.birds) {
        const flock = new Flock(plan, near, material, () => {});
        // You walk up to it from 40 m off, stand in its middle a while, and walk away.
        for (let t = 0; t < 60; t += DT) {
          const k = t < 15 ? 1 - t / 15 : t < 30 ? 0 : (t - 30) / 10;
          flock.update(DT, { x: plan.x - 40 * k, z: plan.z, wading: false });
          for (const b of flock.birds) {
            expect(Number.isFinite(b.at.x + b.at.y + b.at.z), plan.id).toBe(true);
            if (!b.flying && b.doing !== 'hidden') expect(b.at.y, plan.id).toBeGreaterThan(near.heightAt(b.at.x, b.at.z) - 1);
          }
        }
        flock.dispose();
      }
    }
  }, 30000);
});
