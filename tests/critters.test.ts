import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import type { CritterPlan } from '../src/maps/types';
import { CRITTER_LOOKS, type CritterFrame, type CritterLook, critterModel } from '../src/models/critters';
import { Critter, type CritterGround, Critters, hopAt } from '../src/world/critters';

// The critters (world/critters.ts): small creatures that don't fight, each a
// handful of still frames drawn instanced, living near you by simple rules.
// A hare bolts zig-zagging away and never towards you, a frog leaps into the
// water and is gone, a rat scurries along its wall into a gap; each comes
// back once you've been away a while.

const DT = 1 / 72;

/** Flat, open ground; water where `wet` says, at y 0 over a bed at -0.3. */
function ground(wet: (x: number, z: number) => boolean = () => false): CritterGround {
  return {
    heightAt: (x, z) => (wet(x, z) ? -0.3 : 0),
    resolve: () => false,
    waterAt: (x, z) => (wet(x, z) ? 0 : null),
  };
}

const plan = (look: CritterLook, x = 0, z = 0, yaw = 0): CritterPlan => ({ look, x, z, yaw });

/** Live `seconds` with you at `you` (or where `you(t)` puts you), calling `each` every frame. */
function live(c: Critter, seconds: number, you: { x: number; z: number } | ((t: number) => { x: number; z: number }), each?: () => void): void {
  for (let t = 0; t < seconds; t += DT) {
    c.update(DT, typeof you === 'function' ? you(t) : you);
    each?.();
  }
}

describe('the critter models', () => {
  const FRAMES: Record<string, CritterFrame[]> = {
    rabbit: ['sit', 'up', 'graze', 'leap'],
    frog: ['sit', 'puff', 'leap'],
    rat: ['sit', 'up', 'run', 'gather'],
  };

  it.each(CRITTER_LOOKS)('%s comes in each of its frames, a few hundred triangles each, ready for the shared material', (look) => {
    const model = critterModel(look);
    expect(Object.keys(model.frames).sort()).toEqual([...FRAMES[model.family]].sort());
    for (const [frame, g] of Object.entries(model.frames)) {
      const triangles = g!.getAttribute('position').count / 3;
      expect(triangles, frame).toBeLessThanOrEqual(360);
      for (const a of ['normal', 'color', 'fx', 'uv']) expect(g!.getAttribute(a), `${frame} ${a}`).toBeDefined();
      // Standing on the ground at its feet: its lowest point at y 0.
      g!.computeBoundingBox();
      expect(g!.boundingBox!.min.y, frame).toBeGreaterThan(-0.01);
      expect(g!.boundingBox!.min.y, frame).toBeLessThan(0.02);
    }
    expect(critterModel(look)).toBe(model); // made once
  });

  it('makes the hare bigger than the rabbit, and each the size it is', () => {
    expect(critterModel('hare').length).toBeGreaterThan(critterModel('rabbit').length * 1.2);
    expect(critterModel('hare').length).toBeGreaterThan(0.45);
    expect(critterModel('frog').length).toBeLessThan(0.15);
    // Its tail as long again as its body.
    expect(critterModel('rat').length).toBeLessThan(0.4);
  });

  it('hops in an arc: off the ground and back onto it, its height at the middle, nose up then down', () => {
    expect(hopAt(0, 0.2).lift).toBe(0);
    expect(hopAt(1, 0.2).lift).toBe(0);
    expect(hopAt(0.5, 0.2).lift).toBeCloseTo(0.2);
    expect(hopAt(0.2, 0.2).pitch).toBeGreaterThan(0);
    expect(hopAt(0.8, 0.2).pitch).toBeLessThan(0);
    expect(hopAt(0.5, 0.2).frame).toBe('leap');
    expect(hopAt(0, 0.2).frame).toBe('sit');
  });
});

describe('a hare', () => {
  const R = CONFIG.critters.rabbit;

  it('sits about its spot while you are far off, never far from it', () => {
    const c = new Critter(plan('hare', 0, 0), ground());
    let most = 0;
    live(c, 60, { x: 100, z: 0 }, () => (most = Math.max(most, Math.hypot(c.position.x, c.position.z))));
    expect(c.state).toBe('about');
    expect(most).toBeLessThan(R.wander + R.hop.near[1] * 2);
  });

  it('sits up and turns to watch you as you come near', () => {
    const c = new Critter(plan('hare', 0, 0, Math.PI), ground());
    live(c, 2, { x: (R.notice + R.flee) / 2, z: 0 });
    expect(c.state).toBe('watch');
    expect(c.frame).toBe('up');
    // Turned to you, on +X.
    expect(Math.sin(c.yaw)).toBeGreaterThan(0.9);
  });

  it('bolts from you in a zig-zag, every landing farther from you than the last, until it is well away', () => {
    const c = new Critter(plan('hare', 0, 0), ground());
    const you = { x: 0, z: -(R.flee - 2) };
    let last = Math.hypot(c.position.x - you.x, c.position.z - you.z);
    const turns: number[] = [];
    let was = c.frame;
    live(c, 6, you, () => {
      if (was === 'leap' && c.frame === 'sit') {
        const d = Math.hypot(c.position.x - you.x, c.position.z - you.z);
        expect(d).toBeGreaterThanOrEqual(last - 1e-6);
        last = d;
        turns.push(c.yaw);
      }
      was = c.frame;
    });
    expect(last).toBeGreaterThan(R.safe - 1);
    // Zig-zagging: its heading swings one way, then the other.
    const swings = turns.slice(1).map((y, i) => Math.sign(Math.sin(y - turns[i])));
    expect(swings.some((s, i) => i > 0 && s !== swings[i - 1])).toBe(true);
  });

  it('never bolts into water, even with water straight ahead of it', () => {
    const wet = (x: number) => x > 2;
    const c = new Critter(plan('hare', 0, 0, Math.PI / 2), ground(wet));
    live(c, 6, { x: -4, z: 0 }, () => expect(wet(c.position.x) && c.frame === 'sit').toBe(false));
    expect(c.position.x).toBeLessThanOrEqual(2.2);
  });
});

describe('a frog', () => {
  const F = CONFIG.critters.frog;
  // It sits on the bank (z < 0.6) facing the water beyond.
  const wet = (_x: number, z: number) => z > 0.6;

  it('sits and puffs its throat while you keep your distance', () => {
    const c = new Critter(plan('frog', 0, 0, 0), ground(wet));
    const frames = new Set<string>();
    live(c, 20, { x: 0, z: -(F.flee + 2) }, () => frames.add(c.frame));
    expect(c.state).toBe('about');
    expect([...frames].sort()).toEqual(['puff', 'sit']);
  });

  it('leaps into the water as you come near, sinks out of sight, and is back on its stone once you have been away a while', () => {
    const c = new Critter(plan('frog', 0, 0, 0), ground(wet));
    live(c, 1.5, { x: 0, z: -(F.flee - 1) });
    expect(c.hidden).toBe(true);
    expect(wet(c.position.x, c.position.z)).toBe(true);
    // Not while you stand near.
    live(c, F.after + 2, { x: 0, z: -2 });
    expect(c.hidden).toBe(true);
    live(c, F.after + 1, { x: 0, z: -(F.away + 5) });
    expect(c.hidden).toBe(false);
    expect([c.position.x, c.position.z]).toEqual([0, 0]);
  });

  it('leaps aside, never at you, when you come at it from the water: back onto the bank, where it sits', () => {
    const c = new Critter(plan('frog', 0, 0, 0), ground(wet));
    const you = { x: 0, z: 2 };
    const before = Math.hypot(you.x, you.z);
    live(c, 1, you);
    expect(Math.hypot(c.position.x - you.x, c.position.z - you.z)).toBeGreaterThanOrEqual(before - 1e-6);
    expect(c.hidden).toBe(false);
    expect(wet(c.position.x, c.position.z)).toBe(false);
    // Home on its stone once you've gone.
    live(c, F.after + 1, { x: 0, z: F.away + 10 });
    expect([c.position.x, c.position.z]).toEqual([0, 0]);
  });
});

describe('a rat', () => {
  const R = CONFIG.critters.rat;

  it('shuffles along its wall about its spot, sniffing, while you are off', () => {
    const c = new Critter(plan('rat', 0, 0, Math.PI / 2), ground());
    live(c, 30, { x: 50, z: 0 }, () => {
      // Its wall runs along X: it never leaves it.
      expect(Math.abs(c.position.z)).toBeLessThan(1e-9);
      expect(Math.abs(c.position.x)).toBeLessThan(R.shuffle + 0.2);
    });
  });

  it('scurries along its wall away from you and is gone into a gap; back once you have been away a while', () => {
    const c = new Critter(plan('rat', 0, 0, Math.PI / 2), ground());
    // You come along the wall from its +X end.
    live(c, 0.5, { x: R.flee - 1, z: 0.5 });
    expect(c.state).toBe('flee');
    expect(c.position.x).toBeLessThan(0);
    live(c, 2, { x: R.flee - 1, z: 0.5 });
    expect(c.hidden).toBe(true);
    live(c, R.after + 1, { x: R.away + 10, z: 0 });
    expect(c.hidden).toBe(false);
  });
});

describe('the critter layer', () => {
  it('lives and draws only those near you, nearest first, one instanced draw for each look and frame showing', () => {
    const layer = new Critters(ground());
    const plans = [plan('hare', 0, 30), plan('hare', 0, 10), plan('frog', 5, 0, Math.PI), plan('rat', 0, 200, 0)];
    layer.add(plans);
    expect(layer.placed.length).toBe(4);
    const you = new Vector3(0, 1.6, 0);
    layer.update(DT, you);
    expect(layer.shown.map((c) => c.plan)).toEqual([plans[2], plans[1], plans[0]]);
    const { draws, triangles } = layer.cost;
    expect(draws).toBeLessThanOrEqual(3);
    expect(triangles).toBeLessThan(900);
    // The rat far off waited, untouched.
    const rat = layer.placed[3];
    expect(rat.time).toBe(0);
  });

  it(`draws the nearest ${CONFIG.critters.most} at most`, () => {
    const layer = new Critters(ground());
    layer.add(Array.from({ length: CONFIG.critters.most + 6 }, (_, i) => plan('frog', i * 0.5, 30, 0)));
    layer.update(DT, new Vector3(0, 1.6, 0));
    const drawn = layer.root.children.reduce((n, m) => n + ((m as unknown as { count?: number }).count ?? 0), 0);
    expect(drawn).toBe(CONFIG.critters.most);
    expect(layer.shown.length).toBe(CONFIG.critters.most);
    expect(Math.max(...layer.shown.map((c) => c.plan.x))).toBeLessThan(CONFIG.critters.most * 0.5);
  });
});
