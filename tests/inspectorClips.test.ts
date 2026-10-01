import { describe, expect, it } from 'vitest';
import { CONFIG, type EnemyConfig } from '../src/config';
import { IDLE } from '../src/enemies/poses';
import { castClips, clipsFor, type MutablePose, personClips } from '../src/inspector/clips';
import type { EnemyKind } from '../src/models/characters';
import { PEOPLE, type PersonId } from '../src/models/people';
import { BONES } from '../src/models/rig';
import { CAST, type CastId } from '../src/people/cast';

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

  it('show the guards of the kinds that block', () => {
    const guards = ['guard high', 'guard left', 'guard right'];
    for (const kind of KINDS) {
      const names = clipsFor(kind).map((c) => c.name);
      const def: EnemyConfig = CONFIG.enemies[kind];
      if (def.guard) expect(names).toEqual(expect.arrayContaining(guards));
      else for (const g of guards) expect(names).not.toContain(g);
    }
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

  it('play the same animations on bandits, bar rising from the ground', () => {
    for (const kind of ['grunt', 'archer', 'brute'] as const) {
      const undead = clipsFor(kind).map((c) => c.name);
      expect(clipsFor(kind, 'bandit').map((c) => c.name)).toEqual(undead.filter((n) => n !== 'rise'));
    }
  });

  it('show friendly characters standing at ease, Hale waving and the villagers at work', () => {
    for (const id of Object.keys(PEOPLE) as PersonId[]) {
      const names = personClips(id).map((c) => c.name);
      expect(names).toEqual(id === 'hale' ? ['stand', 'wave'] : ['stand', 'work']);
    }
  });

  it('bring Hale’s hand up to wave and back down to rest on their sword', () => {
    const wave = personClips('hale').find((c) => c.name === 'wave')!;
    const out: MutablePose = {};
    const armUp = (t: number) => -(wave.sample(t, out).pose.upperArmR?.[2] ?? 0);
    expect(armUp(0)).toBeLessThan(0.2);
    expect(armUp(wave.duration / 3)).toBeGreaterThan(2);
    expect(wave.sample(wave.duration - 0.01, out).pose.upperArmL).toEqual(PEOPLE.hale.stand.upperArmL);
    expect(armUp(wave.duration - 0.01)).toBeLessThan(0.2);
  });

  it("show the cast zones place standing at ease, standing about and walking, each looping round without a jump", () => {
    for (const id of Object.keys(CAST) as CastId[]) {
      const clips = castClips(id);
      expect(clips.map((c) => c.name)).toEqual(['stand', 'stand about', 'walk']);
      const out: MutablePose = {};
      const flat = (pose: Partial<Record<string, readonly number[]>>) => BONES.flatMap((b) => pose[b] ?? [0, 0, 0]);
      for (const clip of clips.slice(1)) {
        const start = flat({ ...clip.sample(0, out).pose });
        const end = flat({ ...clip.sample(clip.duration - 1e-6, out).pose });
        // Breathing aside (it keeps its own time), round to where it began.
        start.forEach((v, i) => expect(Math.abs(v - end[i]), `${id} ${clip.name}`).toBeLessThan(0.05));
      }
    }
  });
});
