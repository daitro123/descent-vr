import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { EnemyContext } from '../src/enemies/enemy';
import { createEnemy } from '../src/enemies/kinds';
import { AttackTokens } from '../src/enemies/tokens';
import { BANDIT_BUILDS } from '../src/models/bandits';
import { BAILIFF_BUILDS } from '../src/models/bailiffs';
import { type EnemyKind, FAMILIES, type Family } from '../src/models/characters';
import { DIGGER_BUILDS, LAMP_CREW_BUILDS } from '../src/models/diggers';
import { BUILDS } from '../src/models/human';
import { MOOR_BANDIT_BUILDS } from '../src/models/moorBandits';
import { Arena } from '../src/world/arena';
import type { Ground } from '../src/world/ground';

// An enemy's family decides its body: the bandits and House Corvane's
// bailiffs wear the human body, the undead are skeletons. These check what a
// player would see of the difference: the dead claw up out of the ground and
// fall to pieces, the living are simply standing there and fall whole.

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

/** The build each family of the living makes each of its fighters in. */
const BUILT: Partial<Record<Family, Partial<Record<EnemyKind, keyof typeof BUILDS>>>> = {
  bandit: BANDIT_BUILDS,
  corvane: BAILIFF_BUILDS,
  moorBandit: MOOR_BANDIT_BUILDS,
  digger: DIGGER_BUILDS,
  lampCrew: LAMP_CREW_BUILDS,
};

/** Every fighter of every family of the living. */
const LIVING: [Family, EnemyKind][] = (Object.keys(FAMILIES) as Family[])
  .filter((f) => FAMILIES[f].body === 'human')
  .flatMap((family) => (Object.keys(FAMILIES[family].fights) as EnemyKind[]).map((kind): [Family, EnemyKind] => [family, kind]));

it('the bandits and House Corvane’s bailiffs each field a grunt, an archer and a brute', () => {
  expect(LIVING.map(([f, k]) => `${f} ${k}`)).toEqual(expect.arrayContaining(['bandit grunt', 'bandit archer', 'bandit brute', 'corvane grunt', 'corvane archer', 'corvane brute']));
});

describe.each(LIVING)('a %s %s', (family, kind) => {
  it('wears the human body, not a skeleton', () => {
    const human = BUILDS[BUILT[family]![kind]!].proportions;
    expect(createEnemy(kind, 0, 0, { family }).rig.proportions).toEqual(human);
    expect(createEnemy(kind, 0, 0).rig.proportions).not.toEqual(human);
  });

  it('is standing where it is made, and can be hit at once, where the undead rise from the ground', () => {
    const living = createEnemy(kind, 0, 0, { family });
    const undead = createEnemy(kind, 0, 0);
    living.update(DT, far());
    undead.update(DT, far());
    expect(living.hittable).toBe(true);
    expect(hipsY(living)).toBeCloseTo(living.rig.proportions.hipY, 1);
    expect(undead.hittable).toBe(false);
    expect(hipsY(undead)).toBeLessThan(0);
  });

  it('falls whole when killed', () => {
    const living = createEnemy(kind, 0, 0, { family });
    living.update(DT, far());
    const gap = () => living.rig.bones.head.getWorldPosition(new Vector3()).distanceTo(living.rig.bones.hips.getWorldPosition(new Vector3()));
    const standing = gap();
    living.takeHit(10_000, new Vector3(0, 0, -1));
    for (let t = 0; t < 1; t += DT) living.update(DT, far());
    expect(living.alive).toBe(false);
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

// The bog dead are bodies, not bones: they claw up out of the peat as the
// dead do, but what falls when they're killed is a body, whole.
describe.each(['grunt', 'brute'] as EnemyKind[])('a bog dead %s', (kind) => {
  it('rises out of the ground, and can’t be hit until it has', () => {
    const e = createEnemy(kind, 0, 0, { family: 'bogDead' });
    e.update(DT, far());
    expect(e.hittable).toBe(false);
    expect(hipsY(e)).toBeLessThan(0);
    for (let t = 0; t < 3; t += DT) e.update(DT, far());
    expect(e.hittable).toBe(true);
    expect(hipsY(e)).toBeCloseTo(e.rig.proportions.hipY, 1);
  });

  it('falls whole when killed', () => {
    const e = createEnemy(kind, 0, 0, { family: 'bogDead' });
    for (let t = 0; t < 3; t += DT) e.update(DT, far());
    const gap = () => e.rig.bones.head.getWorldPosition(new Vector3()).distanceTo(e.rig.bones.hips.getWorldPosition(new Vector3()));
    const standing = gap();
    e.takeHit(10_000, new Vector3(0, 0, -1));
    for (let t = 0; t < 1; t += DT) e.update(DT, far());
    expect(e.alive).toBe(false);
    expect(gap()).toBeCloseTo(standing, 2);
  });
});

it('the Warden is only ever undead', () => {
  expect(() => createEnemy('warden', 0, 0, { family: 'bandit' })).toThrow();
});
