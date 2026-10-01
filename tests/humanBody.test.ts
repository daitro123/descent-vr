import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { type Clip, clipsFor, type MutablePose } from '../src/inspector/clips';
import { buildCharacter, type EnemyKind, FAMILIES, type Family, proportionsOf } from '../src/models/characters';
import { GUARDS } from '../src/models/guards';
import { BUILDS, type BuildName, body, head, type Look, pommelOf } from '../src/models/human';
import { buildPerson, PEOPLE, type PersonId } from '../src/models/people';
import { BONES, Rig } from '../src/models/rig';
import { Wardrobe } from '../src/people/cast';

// The human body (models/human.ts) and everyone who wears it: the families of
// the living who fight you (the bandits, models/bandits.ts, and House
// Corvane's bailiffs, models/bailiffs.ts), the friendly characters
// (models/people.ts) and the guards (models/guards.ts).
// These check what a player would notice of a body: it stands on its soles at
// its height, it plays every enemy animation as the skeletons do, and each
// character stays inside the triangle budget.

const KINDS: EnemyKind[] = ['grunt', 'archer', 'brute', 'warden'];
const BUILD_NAMES = Object.keys(BUILDS) as BuildName[];

/** The body alone in `build`: a face and short hair, a shirt, trousers and boots. */
function plain(build: BuildName): Rig {
  const look: Look = { build, skin: 0xc08a66, hair: 0x3a281c, hairStyle: 'short', shirt: 0xcfc2a0, trousers: 0x38251a, boots: 0x38251a };
  return new Rig(BUILDS[build].proportions, (ctx) => {
    body(ctx, look);
    head(ctx, look);
  });
}

/** The families who wear the human body. */
const LIVING = (Object.keys(FAMILIES) as Family[]).filter((f) => FAMILIES[f].body === 'human');

/** Every fighter of the living, dressed: each look of each kind each family fields. */
const FIGHTERS: [string, Family, EnemyKind, number][] = LIVING.flatMap((family) =>
  (Object.entries(FAMILIES[family].fights) as [EnemyKind, { label: string; looks: number }][]).flatMap(([kind, f]) =>
    Array.from({ length: f.looks }, (_, v): [string, Family, EnemyKind, number] => [f.looks > 1 ? `${f.label} v${v}` : f.label, family, kind, v]),
  ),
);

/** Every character that wears the human body, as the game builds them. */
const HUMANS: [string, () => Rig][] = [
  ...FIGHTERS.map(([name, family, kind, variant]): [string, () => Rig] => [name, () => buildCharacter(kind, { family, variant }).rig]),
  ...(Object.keys(PEOPLE) as PersonId[]).map((id): [string, () => Rig] => [PEOPLE[id].label, () => buildPerson(id)]),
  ...(Object.keys(GUARDS) as (keyof typeof GUARDS)[]).map((id): [string, () => Rig] => [GUARDS[id].label, () => new Wardrobe().dress(id)]),
];

const _v = new Vector3();

/** The lowest and highest of the posed body's vertices, or of those on `bones` only. */
function extent(rig: Rig, bones?: readonly string[]): { low: number; high: number } {
  rig.mesh.updateMatrixWorld(true);
  const geo = rig.mesh.geometry;
  const skin = geo.getAttribute('skinIndex');
  const only = bones?.map((b) => BONES.indexOf(b as (typeof BONES)[number]));
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i < geo.getAttribute('position').count; i++) {
    if (only && !only.includes(skin.getX(i))) continue;
    rig.mesh.getVertexPosition(i, _v);
    low = Math.min(low, _v.y);
    high = Math.max(high, _v.y);
  }
  return { low, high };
}

/** The lower ankle's height, as a share of the hip's, with `rig` in a clip's frame of `kind`. */
function ankles(rig: Rig, kind: EnemyKind, frame: { pose: object; hipY: number }): number {
  rig.apply(frame.pose);
  // The clip's hip drop (a kneel, the walk's bob) is sized for its own behaviour's body.
  rig.setHipOffset(0, (frame.hipY * rig.proportions.hipY) / proportionsOf(kind).hipY, 0);
  rig.mesh.updateMatrixWorld(true);
  const shin = rig.proportions.shin;
  const left = _v.set(0, -shin, 0).applyMatrix4(rig.bones.shinL.matrixWorld).y;
  const right = _v.set(0, -shin, 0).applyMatrix4(rig.bones.shinR.matrixWorld).y;
  return Math.min(left, right) / rig.proportions.hipY;
}

/** Plays `clips` on `human` and on a skeleton grunt: every bone stays finite and the feet go where the skeleton's do, scaled. */
function playsLikeASkeleton(human: Rig, kind: EnemyKind, clips: Clip[]): void {
  const grunt = buildCharacter('grunt').rig;
  const out: MutablePose = {};
  for (const clip of clips) {
    for (let i = 0; i <= 24; i++) {
      const frame = clip.sample((clip.duration * i) / 24, out);
      const feet = ankles(human, kind, frame);
      const skeletonFeet = ankles(grunt, kind, frame);
      for (const name of BONES) {
        human.bones[name].getWorldPosition(_v);
        expect(Number.isFinite(_v.x + _v.y + _v.z), `${clip.name}: ${name}`).toBe(true);
      }
      expect(Math.abs(feet - skeletonFeet) * human.proportions.hipY, `${clip.name} at ${i}/24`).toBeLessThan(0.02);
    }
  }
}

describe('the human body', () => {
  it.each(BUILD_NAMES)('stands on its soles in the %s build', (build) => {
    expect(Math.abs(extent(plain(build)).low)).toBeLessThan(0.01);
  });

  it('stands about 1.78 m, and about 1.97 m in the big build', () => {
    expect(extent(plain('average')).high).toBeCloseTo(1.78, 1);
    expect(extent(plain('big')).high).toBeCloseTo(1.97, 1);
  });

  // Poses are angles, so the same pose on longer bones is the same move, bigger.
  // On the human body, every enemy animation should put the ankles where it
  // puts a skeleton grunt's (which the poses were made on), scaled to size.
  describe.each(BUILD_NAMES)('in the %s build', (build) => {
    it.each(KINDS)('plays every %s animation with its feet where a skeleton grunt has them', (kind) => {
      playsLikeASkeleton(plain(build), kind, clipsFor(kind));
    });
  });
});

describe('every fighter of the living', () => {
  it('counts the bandits and House Corvane’s bailiffs among them', () => {
    expect(LIVING).toEqual(expect.arrayContaining(['bandit', 'corvane']));
  });

  it.each(FIGHTERS)('%s plays each of its animations dressed, feet where a skeleton’s go', (_name, family, kind, variant) => {
    playsLikeASkeleton(buildCharacter(kind, { family, variant }).rig, kind, clipsFor(kind, family));
  });
});

describe('every human character', () => {
  it.each(HUMANS)('%s is one body under 900 triangles', (_name, build) => {
    const rig = build();
    expect(rig.triangles).toBeLessThan(900);
    expect(Array.isArray(rig.mesh.material)).toBe(false);
  });

  it.each(HUMANS)('%s stands with their soles on the floor', (_name, build) => {
    expect(Math.abs(extent(build(), ['footL', 'footR']).low)).toBeLessThan(0.01);
  });
});

it('Marshal Hale stands with the left hand on their sword’s pommel', () => {
  const hale = PEOPLE.hale;
  const rig = buildPerson('hale');
  rig.apply(hale.stand);
  rig.mesh.updateMatrixWorld(true);
  const pommel = new Vector3(...pommelOf(hale.look)).applyMatrix4(rig.bones.hips.matrixWorld);
  const palm = new Vector3(0, -0.045, 0).applyMatrix4(rig.bones.handL.matrixWorld);
  expect(palm.distanceTo(pommel)).toBeLessThan(0.06);
  expect(palm.y).toBeGreaterThan(pommel.y);
});
