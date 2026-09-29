import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { BarkRule } from '../src/people/barks';

// When the villagers bark (spec, "Friendly characters"): within 4 m, for about
// 4 s, not again until you've been 10 m away, and at most two at once.

const { within, time, rearm, most } = CONFIG.villagers.bark;
const DT = 1 / 30;

/** Step `rule` for `seconds` with you at `far` from each, returning each start as [villager, seconds in]. */
function run(rule: BarkRule, seconds: number, far: readonly number[], from = 0): [number, number][] {
  const started: [number, number][] = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) for (const i of rule.update(DT, far)) started.push([i, from + t]);
  return started;
}

describe('the bark rule', () => {
  it('uses the spec\'s numbers', () => {
    expect({ within, time, rearm, most }).toEqual({ within: 4, time: 4, rearm: 10, most: 2 });
  });

  it('barks as you come within 4 m, and not from further off', () => {
    const rule = new BarkRule(1);
    expect(run(rule, 2, [4.2])).toEqual([]);
    expect(run(rule, DT, [3.9])).toEqual([[0, 0]]);
    expect(rule.showing(0)).toBe(true);
  });

  it('shows for about 4 s', () => {
    const rule = new BarkRule(1);
    run(rule, DT, [3]);
    run(rule, time - 0.1, [3]);
    expect(rule.showing(0)).toBe(true);
    run(rule, 0.2, [3]);
    expect(rule.showing(0)).toBe(false);
  });

  it("doesn't bark again while you stay, or until you've been 10 m away", () => {
    const rule = new BarkRule(1);
    run(rule, DT, [3]);
    expect(run(rule, 10, [3])).toEqual([]);
    // Off to 9 m and back: nothing.
    run(rule, 2, [9]);
    expect(run(rule, 2, [3])).toEqual([]);
    // Off past 10 m and back: again.
    run(rule, DT, [rearm + 0.1]);
    expect(run(rule, DT, [3])).toHaveLength(1);
  });

  it('keeps its bark showing for its time even as you walk off', () => {
    const rule = new BarkRule(1);
    run(rule, DT, [3]);
    run(rule, 1, [20]);
    expect(rule.showing(0)).toBe(true);
  });

  it('shows at most two at once, nearest first; the third waits while you stay close', () => {
    const rule = new BarkRule(3);
    expect(run(rule, DT, [3, 2, 1]).map(([i]) => i)).toEqual([2, 1]);
    expect([0, 1, 2].map((i) => rule.showing(i))).toEqual([false, true, true]);
    // Once the first two end, the third, still close, takes its turn.
    const later = run(rule, time + 0.1, [3, 2, 1]);
    expect(later.map(([i]) => i)).toEqual([0]);
    expect(later[0][1]).toBeGreaterThan(time - 0.1);
  });

  it('forgets a villager who wasn’t there to hear you walk off: one not drawn is as far as can be', () => {
    const rule = new BarkRule(1);
    run(rule, DT, [3]);
    run(rule, time + 1, [Infinity]);
    expect(run(rule, DT, [3])).toHaveLength(1);
  });
});
