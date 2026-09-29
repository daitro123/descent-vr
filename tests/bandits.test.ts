import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { EnemyContext } from '../src/enemies/enemy';
import { createEnemy } from '../src/enemies/kinds';
import { AttackTokens } from '../src/enemies/tokens';
import { BANDIT_BUILDS } from '../src/models/bandits';
import { BUILDS } from '../src/models/human';
import { Arena } from '../src/world/arena';
import type { Ground } from '../src/world/ground';

// An enemy's family decides its body: bandits wear the human body, the undead
// are skeletons. These check what a player would see of the difference: the
// dead claw up out of the ground and fall to pieces, the living are simply
// standing there and fall whole.

const DT = 1 / 72;
const openGround: Ground = { resolve: () => false, lineOfSight: () => true, heightAt: () => 0, steer: Arena.prototype.steer, arrowStops: () => false };

/** You, far off and paying no attention. */
function far(): EnemyContext {
  return {
    playerFeet: new Vector3(0, 0, 40),
    playerHead: new Vector3(0, 1.6, 40),
    playerSword: null,
    ground: openGround,
    meleeTokens: new AttackTokens(9),
    rangedTokens: new AttackTokens(9),
    sweep: () => null,
    slam: () => {},
    shoot: () => {},
    nock: () => {},
    summon: () => {},
    telegraph: () => {},
  };
}

const hipsY = (e: ReturnType<typeof createEnemy>) => e.rig.bones.hips.getWorldPosition(new Vector3()).y;

describe.each(['grunt', 'archer', 'brute'] as const)('a bandit %s', (kind) => {
  it('wears the human body, not a skeleton', () => {
    const human = BUILDS[BANDIT_BUILDS[kind]].proportions;
    expect(createEnemy(kind, 0, 0, { family: 'bandit' }).rig.proportions).toEqual(human);
    expect(createEnemy(kind, 0, 0).rig.proportions).not.toEqual(human);
  });

  it('is standing where it is made, and can be hit at once, where the undead rise from the ground', () => {
    const bandit = createEnemy(kind, 0, 0, { family: 'bandit' });
    const undead = createEnemy(kind, 0, 0);
    bandit.update(DT, far());
    undead.update(DT, far());
    expect(bandit.hittable).toBe(true);
    expect(hipsY(bandit)).toBeCloseTo(bandit.rig.proportions.hipY, 1);
    expect(undead.hittable).toBe(false);
    expect(hipsY(undead)).toBeLessThan(0);
  });

  it('falls whole when killed', () => {
    const bandit = createEnemy(kind, 0, 0, { family: 'bandit' });
    bandit.update(DT, far());
    const gap = () => bandit.rig.bones.head.getWorldPosition(new Vector3()).distanceTo(bandit.rig.bones.hips.getWorldPosition(new Vector3()));
    const standing = gap();
    bandit.takeHit(10_000, new Vector3(0, 0, -1));
    for (let t = 0; t < 1; t += DT) bandit.update(DT, far());
    expect(bandit.alive).toBe(false);
    expect(gap()).toBeCloseTo(standing, 2);
  });
});

it('a skeleton grunt falls to pieces when killed', () => {
  const g = createEnemy('grunt', 0, 0);
  for (let t = 0; t < 2; t += DT) g.update(DT, far());
  // Each bone's distance from the hips: the pieces fly apart at random, so any
  // one pair can land as far apart as it stood, but not the whole skeleton.
  const gaps = () => {
    const hips = g.rig.bones.hips.getWorldPosition(new Vector3());
    return Object.values(g.rig.bones).map((b) => b.getWorldPosition(new Vector3()).distanceTo(hips));
  };
  const standing = gaps();
  g.takeHit(10_000, new Vector3(0, 0, -1));
  for (let t = 0; t < 1; t += DT) g.update(DT, far());
  const moved = gaps().map((d, i) => Math.abs(d - standing[i]));
  expect(Math.max(...moved)).toBeGreaterThan(0.1);
});

it('the Warden is only ever undead', () => {
  expect(() => createEnemy('warden', 0, 0, { family: 'bandit' })).toThrow();
});
