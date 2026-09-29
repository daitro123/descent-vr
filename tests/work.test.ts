import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { BONES } from '../src/models/rig';
import { strikesBetween, workLoop } from '../src/people/work';
import { VILLAGERS } from '../src/quests';

// The villagers' working loops (people/work.ts): the smith's blows are events,
// struck in bursts, and every loop keeps moving and comes round smoothly.

const S = CONFIG.villagers.smith;

describe("the villagers' work", () => {
  it('strikes in bursts of a few blows, one blow apart, with the piece turned and the bellows pumped between', () => {
    const work = workLoop('smith', -1.8);
    const blows = S.bursts.reduce((a, b) => a + b, 0);
    expect(work.strikes).toHaveLength(blows);
    const gaps = work.strikes.slice(1).map((t, i) => t - work.strikes[i]);
    // Within a burst, a blow apart; between bursts, the turning of the piece too.
    expect(gaps.filter((g) => Math.abs(g - S.blow) < 1e-9)).toHaveLength(blows - S.bursts.length);
    expect(gaps.filter((g) => g > S.blow + 1e-9).every((g) => Math.abs(g - S.blow - S.turnPiece) < 1e-9)).toBe(true);
    // And round the loop, after the bellows.
    const round = work.duration - work.strikes[blows - 1] + work.strikes[0];
    expect(round).toBeCloseTo(S.blow + 2 * S.face + S.pumps * S.pump, 9);
  });

  it('counts the blows landing between two moments, round the loop and round again', () => {
    const work = workLoop('smith', -1.8);
    const n = work.strikes.length;
    expect(strikesBetween(work, 0, work.duration)).toBe(n);
    expect(strikesBetween(work, 0, 3 * work.duration)).toBe(3 * n);
    expect(strikesBetween(work, work.strikes[0] - 0.01, work.strikes[0] + 0.01)).toBe(1);
    expect(strikesBetween(work, work.strikes[0] + 0.01, work.strikes[1] - 0.01)).toBe(0);
    expect(strikesBetween(work, 5, 5)).toBe(0);
  });

  it('has the smith turn to the bellows and back, and nobody else turn', () => {
    const smith = workLoop('smith', -1.8);
    const turns = Array.from({ length: 400 }, (_, k) => smith.at((k / 400) * smith.duration).turn);
    expect(Math.min(...turns)).toBeCloseTo(-1.8, 6);
    expect(turns[0]).toBe(0);
    for (const id of ['innkeeper', 'farmer'] as const) {
      const work = workLoop(id);
      expect(Array.from({ length: 100 }, (_, k) => work.at((k / 100) * work.duration).turn).every((t) => t === 0)).toBe(true);
      expect(work.strikes).toEqual([]);
    }
  });

  it('keeps every villager moving and comes round the loop without a jump', () => {
    for (const id of VILLAGERS) {
      const work = workLoop(id, -1.8);
      const at = (t: number) => BONES.flatMap((b) => work.at(t).pose[b] ?? [0, 0, 0]);
      // No jump from one frame to the next, the loop's end into its start included.
      let worst = 0;
      for (let t = 0; t < work.duration + 1; t += 1 / 72) {
        const a = at(t);
        const b = at(t + 1 / 72);
        worst = Math.max(worst, ...a.map((v, i) => Math.abs(v - b[i])));
      }
      // The fastest is the hammer coming down on the anvil, about a radian in a tenth of a second.
      expect(worst, id).toBeLessThan(0.35);
      // And it isn't one pose all loop.
      const poses = new Set(Array.from({ length: 20 }, (_, k) => at((k / 20) * work.duration).map((v) => v.toFixed(2)).join()));
      expect(poses.size, id).toBeGreaterThan(5);
    }
  });
});
