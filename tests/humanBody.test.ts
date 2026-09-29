import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { clipsFor, type MutablePose } from '../src/inspector/clips';
import { buildCharacter, type EnemyKind, proportionsOf } from '../src/models/characters';
import { BUILDS, type BuildName, body, head, type Look } from '../src/models/human';
import { buildPerson, PEOPLE, type PersonId } from '../src/models/people';
import { BONES, Rig } from '../src/models/rig';

// The human body (models/human.ts) and everyone who wears it (models/people.ts).
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

/** Every character that wears the human body, as the game builds them. */
const HUMANS: [string, () => Rig][] = [
  ...[0, 1, 2, 3, 4, 5].map((v): [string, () => Rig] => [`thug v${v}`, () => buildCharacter('grunt', { family: 'bandit', variant: v }).rig]),
  ['bandit archer', () => buildCharacter('archer', { family: 'bandit' }).rig],
  ['bandit leader', () => buildCharacter('brute', { family: 'bandit' }).rig],
  ...(Object.keys(PEOPLE) as PersonId[]).map((id): [string, () => Rig] => [PEOPLE[id].label, () => buildPerson(id)]),
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
      const human = plain(build);
      const grunt = buildCharacter('grunt').rig;
      const out: MutablePose = {};
      /** The lower ankle's height, as a share of the hip's. */
      const ankles = (rig: Rig, frame: { pose: object; hipY: number }) => {
        rig.apply(frame.pose);
        // The clip's hip drop (a kneel, the walk's bob) is in its own kind's size.
        rig.setHipOffset(0, (frame.hipY * rig.proportions.hipY) / proportionsOf(kind).hipY, 0);
        rig.mesh.updateMatrixWorld(true);
        const shin = rig.proportions.shin;
        const left = _v.set(0, -shin, 0).applyMatrix4(rig.bones.shinL.matrixWorld).y;
        const right = _v.set(0, -shin, 0).applyMatrix4(rig.bones.shinR.matrixWorld).y;
        return Math.min(left, right) / rig.proportions.hipY;
      };
      for (const clip of clipsFor(kind)) {
        for (let i = 0; i <= 24; i++) {
          const frame = clip.sample((clip.duration * i) / 24, out);
          const feet = ankles(human, frame);
          const skeletonFeet = ankles(grunt, frame);
          for (const name of BONES) {
            human.bones[name].getWorldPosition(_v);
            expect(Number.isFinite(_v.x + _v.y + _v.z), `${clip.name}: ${name}`).toBe(true);
          }
          expect(Math.abs(feet - skeletonFeet) * human.proportions.hipY, `${clip.name} at ${i}/24`).toBeLessThan(0.02);
        }
      }
    });
  });
});

describe('every human character', () => {
  it.each(HUMANS)('%s is one body under 900 triangles', (_name, build) => {
    const rig = build();
    const triangles = rig.mesh.geometry.getAttribute('position').count / 3;
    expect(triangles).toBeLessThan(900);
    expect(Array.isArray(rig.mesh.material)).toBe(false);
  });

  it.each(HUMANS)('%s stands with their soles on the floor', (_name, build) => {
    expect(Math.abs(extent(build(), ['shinL', 'shinR']).low)).toBeLessThan(0.01);
  });
});
