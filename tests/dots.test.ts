import { describe, expect, it } from 'vitest';
import { DOT_EVERY, type DotKind, Dots, type Sufferer } from '../src/combat/dots';

// Damage over time (abilities ticket 26: Serrated Tips' bleed, Ignite's and
// Pyroblast's burns) as a rule: what an enemy takes a tick, a tick a second,
// and what happens when another bleed or burn lands on one still going.

const foe = (): Sufferer & { alive: boolean; hittable: boolean } => ({ alive: true, hittable: true });

/** Step `dots` `seconds` a frame at a time; every tick it deals, in order. */
function run(dots: Dots, seconds: number): { kind: DotKind; damage: number }[] {
  const ticks: { kind: DotKind; damage: number }[] = [];
  for (let t = 0; t < seconds - 1e-9; t += 1 / 72) dots.update(1 / 72, (_e, kind, damage) => ticks.push({ kind, damage }));
  return ticks;
}

describe('a bleed or a burn', () => {
  it('deals its damage over its time, a tick a second, in whole points', () => {
    const dots = new Dots();
    const e = foe();
    dots.add(e, 'bleed', 6, 4);
    expect(DOT_EVERY).toBe(1);
    expect(run(dots, 0.9)).toEqual([]);
    const ticks = run(dots, 3.2);
    expect(ticks.map((t) => t.damage).reduce((a, b) => a + b, 0)).toBe(6);
    expect(ticks).toHaveLength(4);
    expect(dots.on).toHaveLength(0);
  });

  it('keeps fractions of a point for the next tick, so nothing is lost', () => {
    const dots = new Dots();
    dots.add(foe(), 'burn', 3, 4);
    const ticks = run(dots, 4.1);
    expect(ticks.reduce((n, t) => n + t.damage, 0)).toBe(3);
    expect(ticks.every((t) => t.damage >= 1)).toBe(true);
  });

  it('adds another of its kind to what is still to come, and runs its time again', () => {
    const dots = new Dots();
    const e = foe();
    dots.add(e, 'bleed', 4, 4);
    const first = run(dots, 2.05);
    expect(first.reduce((n, t) => n + t.damage, 0)).toBe(2);
    dots.add(e, 'bleed', 4, 4);
    expect(dots.of(e, 'bleed')).toBeCloseTo(6);
    const rest = run(dots, 5);
    expect(rest.reduce((n, t) => n + t.damage, 0)).toBe(6);
    // A burn and a bleed on one enemy are two.
    dots.add(e, 'bleed', 2, 4);
    dots.add(e, 'burn', 2, 4);
    expect(dots.on).toHaveLength(2);
  });

  it('ends when the enemy dies or walks home (a blow can no longer land), and never starts on one', () => {
    const dots = new Dots();
    const e = foe();
    dots.add(e, 'burn', 10, 4);
    e.hittable = false;
    expect(run(dots, 2)).toEqual([]);
    expect(dots.on).toHaveLength(0);
    dots.add(e, 'burn', 10, 4);
    expect(dots.on).toHaveLength(0);
    const f = foe();
    dots.add(f, 'burn', 10, 4);
    f.alive = false;
    expect(run(dots, 2)).toEqual([]);
  });
});
