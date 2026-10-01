import { Mesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { type Emergence, type Enemy, type EnemyContext } from '../src/enemies/enemy';
import { createEnemy } from '../src/enemies/kinds';
import { AttackTokens } from '../src/enemies/tokens';
import { clipsFor } from '../src/inspector/clips';
import { MIRE_KING } from '../src/models/bog';
import { buildCharacter, type EnemyKind, FAMILIES, fighterOf, proportionsOf } from '../src/models/characters';
import { Arena } from '../src/world/arena';
import type { Ground } from '../src/world/ground';

// The drowned (the dead of Vellmar, skeletons) and the bog's beasts (mud):
// what they're made of, what they cost to draw, and how they lie in wait and
// come up when you near them, out of the ground, the water or the mud.

const DT = 1 / 72;
const WAKE = CONFIG.camps.lurk.wake;

/** Open, flat ground, with water `water` m deep over all of it if any. */
function ground(water = 0): Ground {
  return {
    resolve: () => false,
    lineOfSight: () => true,
    heightAt: () => 0,
    waterAt: () => (water > 0 ? water : null),
    steer: Arena.prototype.steer,
    arrowStops: () => false,
  };
}

/** You, standing `away` m off, and what came up where. */
function you(away: number, g: Ground = ground()): EnemyContext & { emerged: Emergence[] } {
  const emerged: Emergence[] = [];
  return {
    emerged,
    playerFeet: new Vector3(0, 0, away),
    playerHead: new Vector3(0, 1.6, away),
    playerSword: null,
    ground: g,
    meleeTokens: new AttackTokens(9),
    rangedTokens: new AttackTokens(9),
    sweep: () => null,
    slam: () => {},
    shoot: () => {},
    nock: () => {},
    summon: () => {},
    telegraph: () => {},
    emerge: (_e, from) => emerged.push(from),
  };
}

const run = (e: Enemy, seconds: number, ctx: EnemyContext) => {
  for (let t = 0; t < seconds; t += DT) e.update(DT, ctx);
};
const top = (e: Enemy, bone: 'head' | 'spine' | 'hips') => e.rig.bones[bone].getWorldPosition(new Vector3()).y;
/** A camp's member, at its post facing south, lying in wait. */
function lurker(kind: EnemyKind, family: 'drowned' | 'bog', named?: string): Enemy {
  const e = createEnemy(kind, 0, 0, { family, named, lurks: true, inCamp: true });
  e.post = { x: 0, z: 0, yaw: 0, evading: false };
  return e;
}

describe('the drowned and the bog’s beasts as families', () => {
  it('the drowned are skeletons fielding all four behaviours, the Reeve their Warden; the bog’s beasts are mud, the lurker a brute', () => {
    expect(FAMILIES.drowned.body).toBe('skeleton');
    expect(Object.keys(FAMILIES.drowned.fights).sort()).toEqual(['archer', 'brute', 'grunt', 'warden']);
    expect(fighterOf('warden', 'drowned').title).toBe('The Drowned Reeve');
    expect(FAMILIES.bog.body).toBe('mud');
    expect(Object.keys(FAMILIES.bog.fights)).toEqual(['brute']);
    expect(() => createEnemy('grunt', 0, 0, { family: 'bog' })).toThrow();
  });

  it('both lie in wait; the undead and the living don’t', () => {
    expect(FAMILIES.drowned.lurks).toBe(true);
    expect(FAMILIES.bog.lurks).toBe(true);
    expect(FAMILIES.undead.lurks).toBeFalsy();
    expect(FAMILIES.bandit.lurks).toBeFalsy();
  });

  it('their named ones fight as the behaviour they’re made for, and no other', () => {
    expect(fighterOf('grunt', 'drowned', 'oldLanternMan').label).toBe('The Old Lantern Man');
    expect(fighterOf('brute', 'bog', 'mireKing').title).toBe('The Mire King');
    expect(() => fighterOf('grunt', 'bog', 'mireKing')).toThrow(/fights as a brute/);
    expect(() => fighterOf('brute', 'bog', 'nobody')).toThrow();
    // Half again a lurker's size.
    expect(proportionsOf('brute', 'bog', 'mireKing')).toEqual(MIRE_KING);
    expect(MIRE_KING.hipY).toBeCloseTo(proportionsOf('brute', 'bog').hipY * 1.5, 5);
    expect(createEnemy('brute', 0, 0, { family: 'bog', named: 'mireKing' }).named).toBe('mireKing');
  });
});

/** Every drowned and bog body, with its cap: a drowned is a skeleton's, the big ones and the Reeve more, the lurkers less (they are lumps). */
const BODIES: [string, EnemyKind, 'drowned' | 'bog', number, string | undefined, number][] = [
  ...[0, 1, 2, 3, 4, 5].map((v): [string, EnemyKind, 'drowned', number, undefined, number] => [`drowned v${v}`, 'grunt', 'drowned', v, undefined, 1400]),
  ['drowned archer', 'archer', 'drowned', 0, undefined, 1400],
  ['drowned lock-warden', 'brute', 'drowned', 0, undefined, 1700],
  ['Drowned Reeve', 'warden', 'drowned', 0, undefined, 2000],
  ['Old Lantern Man', 'grunt', 'drowned', 0, 'oldLanternMan', 1400],
  ['bog lurker v0', 'brute', 'bog', 0, undefined, 900],
  ['bog lurker v1', 'brute', 'bog', 1, undefined, 900],
  ['Mire King', 'brute', 'bog', 0, 'mireKing', 1300],
  ['sewer beast', 'brute', 'bog', 0, 'sewerBeast', 900],
];

describe.each(BODIES)('the %s', (_name, kind, family, variant, named, cap) => {
  it(`is one body, one draw call, under ${cap} triangles`, () => {
    const { rig } = buildCharacter(kind, { family, variant, named });
    expect(rig.mesh).toBeInstanceOf(Mesh);
    expect(Array.isArray(rig.mesh.material)).toBe(false);
    expect(rig.triangles).toBeLessThan(cap);
  });
});

describe('lying in wait', () => {
  it('a drowned lies under the ground, out of reach, however long you stay away', () => {
    const e = lurker('grunt', 'drowned');
    const ctx = you(WAKE + 5);
    run(e, 10, ctx);
    expect(e.lurking).toBe(true);
    expect(e.state).toBe('rising');
    expect(e.hittable).toBe(false);
    expect(top(e, 'head') + 0.35).toBeLessThan(0);
    expect(ctx.emerged).toEqual([]);
  });

  it('it claws up out of the ground once you come near, and stands to fight', () => {
    const e = lurker('grunt', 'drowned');
    const ctx = you(WAKE + 5);
    run(e, 2, ctx);
    ctx.playerFeet.z = ctx.playerHead.z = WAKE - 1;
    run(e, 0.3, ctx);
    expect(e.lurking).toBe(false);
    expect(ctx.emerged).toEqual(['ground']);
    run(e, 2, ctx);
    expect(e.state).not.toBe('rising');
    expect(e.hittable).toBe(true);
    expect(top(e, 'hips')).toBeCloseTo(e.rig.proportions.hipY, 1);
  });

  it('its camp going to fight wakes it wherever you are', () => {
    const e = lurker('archer', 'drowned');
    const ctx = you(60);
    run(e, 1, ctx);
    e.standDown(null);
    run(e, 0.1, ctx);
    expect(e.lurking).toBe(false);
    expect(ctx.emerged).toEqual(['ground']);
  });

  it('in water it stands under the surface, and comes up out of it more slowly than out of the ground', () => {
    const water = 0.7;
    const wet = lurker('grunt', 'drowned');
    const dry = lurker('grunt', 'drowned');
    const inWater = you(WAKE + 5, ground(water));
    const onLand = you(WAKE + 5);
    run(wet, 1, inWater);
    // Its helm's crown, over its head bone, under the water.
    expect(top(wet, 'head') + 0.3).toBeLessThan(water);
    expect(top(wet, 'head')).toBeGreaterThan(top(dry, 'head') - 0.01);
    inWater.playerFeet.z = onLand.playerFeet.z = WAKE - 1;
    run(wet, 1.2, inWater);
    run(dry, 1.2, onLand);
    expect(inWater.emerged).toEqual(['water']);
    expect(dry.state).not.toBe('rising');
    expect(wet.state).toBe('rising');
    run(wet, 1, inWater);
    expect(wet.state).not.toBe('rising');
  });

  it('a bog lurker lies sunk in the mud as a mound: its back shows, its head is under', () => {
    for (const named of [undefined, 'mireKing']) {
      const e = lurker('brute', 'bog', named);
      const ctx = you(WAKE + 5);
      run(e, 2, ctx);
      expect(e.lurking).toBe(true);
      expect(top(e, 'hips')).toBeLessThan(0);
      // The top of its spine (the hump with the reeds) is over the mud, but not by much.
      const back = e.rig.bones.spine.localToWorld(new Vector3(0, e.rig.proportions.spine, 0)).y;
      expect(back).toBeGreaterThan(0);
      expect(back).toBeLessThan(0.6 * (named ? 1.5 : 1));
    }
  });

  it('and heaves up out of it as you come near', () => {
    const e = lurker('brute', 'bog');
    const ctx = you(WAKE + 5);
    run(e, 1, ctx);
    ctx.playerFeet.z = WAKE - 1;
    run(e, 3, ctx);
    expect(ctx.emerged).toEqual(['mud']);
    expect(e.state).not.toBe('rising');
    expect(top(e, 'hips')).toBeCloseTo(e.rig.proportions.hipY, 1);
  });

  it('one not raised in a camp comes up at once, as the undead do', () => {
    const e = createEnemy('grunt', 0, 0, { family: 'drowned' });
    const ctx = you(40);
    run(e, 0.1, ctx);
    expect(e.lurking).toBe(false);
    run(e, 2, ctx);
    expect(e.state).not.toBe('rising');
  });
});

describe('falling', () => {
  const gapAfterDeath = (e: Enemy) => {
    const ctx = you(40);
    run(e, 3, ctx);
    const gap = () => e.rig.bones.head.getWorldPosition(new Vector3()).distanceTo(e.rig.bones.hips.getWorldPosition(new Vector3()));
    const standing = gap();
    e.takeHit(10_000, new Vector3(0, 0, -1));
    run(e, 1, ctx);
    expect(e.alive).toBe(false);
    return Math.abs(gap() - standing);
  };


  it('a drowned grunt falls to pieces, as a skeleton does', () => {
    const e = createEnemy('grunt', 0, 0, { family: 'drowned' });
    const ctx = you(40);
    run(e, 2, ctx);
    const gaps = () => {
      const hips = e.rig.bones.hips.getWorldPosition(new Vector3());
      return Object.values(e.rig.bones).map((b) => b.getWorldPosition(new Vector3()).distanceTo(hips));
    };
    const standing = gaps();
    e.takeHit(10_000, new Vector3(0, 0, -1));
    run(e, 1, ctx);
    expect(Math.max(...gaps().map((d, i) => Math.abs(d - standing[i])))).toBeGreaterThan(0.1);
  });

  it('a bog lurker falls whole', () => {
    expect(gapAfterDeath(createEnemy('brute', 0, 0, { family: 'bog' }))).toBeLessThan(0.05);
  });
});

describe('in the model inspector', () => {
  it('the drowned rise out of the ground or the water; the bog’s beasts heave up out of the mud', () => {
    for (const kind of ['grunt', 'archer', 'brute', 'warden'] as const) {
      const names = clipsFor(kind, 'drowned').map((c) => c.name);
      expect(names).toEqual(expect.arrayContaining(['rise', 'surface']));
      expect(names).not.toContain('mound');
    }
    for (const named of [undefined, 'mireKing', 'sewerBeast']) {
      const names = clipsFor('brute', 'bog', named).map((c) => c.name);
      expect(names).toContain('mound');
      expect(names).not.toContain('rise');
    }
  });
});
