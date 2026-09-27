import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IDLE } from '../src/enemies/poses';
import { clipsFor, type MutablePose } from '../src/inspector/clips';
import type { EnemyKind } from '../src/models/characters';

const KINDS: EnemyKind[] = ['grunt', 'archer', 'brute', 'warden'];

describe('inspector clips', () => {
  it('cover idle, walk and every attack pose each kind uses', () => {
    for (const kind of KINDS) {
      const names = clipsFor(kind).map((c) => c.name);
      expect(names.slice(0, 2)).toEqual(['idle', 'walk']);
      for (const a of CONFIG.enemies[kind].attacks) expect(names).toContain(a.pose);
      expect(new Set(names).size).toBe(names.length);
    }
    expect(clipsFor('warden').map((c) => c.name)).toEqual(expect.arrayContaining(['summon', 'kneel']));
  });

  it('play attacks with the game timings, starting and ending at idle', () => {
    const draw = clipsFor('archer').find((c) => c.name === 'draw')!;
    const a = CONFIG.enemies.archer.attacks[0];
    expect(draw.duration).toBeCloseTo(0.5 + a.windup + a.active + a.recover + 0.5);
    const out: MutablePose = {};
    expect(draw.sample(0, out).pose).toEqual(IDLE.archer);
    expect(draw.sample(0.5 + a.windup / 2, out).phase).toBe('windup');
    expect(draw.sample(0.5 + a.windup + a.active / 2, out).phase).toBe('active');
    expect(draw.sample(draw.duration - 0.01, out).pose).toEqual(IDLE.archer);
  });

  it('telegraphs only during the wind-up and swing', () => {
    const chop = clipsFor('grunt').find((c) => c.name === 'chop')!;
    const out: MutablePose = {};
    const phases = Array.from({ length: 100 }, (_, i) => chop.sample((i / 100) * chop.duration, out));
    for (const f of phases) expect(f.telegraph > 0).toBe(f.phase === 'windup' || f.phase === 'active');
  });
});
