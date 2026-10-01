import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BUILDS, type BuildName, body, head, type Look } from '../src/models/human';
import { BONES, type BoneName, Rig } from '../src/models/rig';
import { CAST, type CastId } from '../src/people/cast';
import { cyclesOver, type MutablePose, STANCE, walkFrame, walkOver } from '../src/people/walk';

// The friendly walk (people/walk.ts) on every build of the human body, and on
// everyone a zone can place. These check what a player would notice of a
// walk: the feet land on the floor and stay put while they bear the weight,
// nothing sinks through the ground (a skirt's hem, a robe's), the loop has no
// seam and no jolt, and the feet keep pace with the ground walked.

const BUILD_NAMES = Object.keys(BUILDS) as BuildName[];
const FRAMES = 96;
const _v = new Vector3();

/** The body alone in `build`: a face and short hair, a shirt, trousers and boots. */
function plain(build: BuildName): Rig {
  const look: Look = { build, skin: 0xc08a66, hair: 0x3a281c, hairStyle: 'short', shirt: 0xcfc2a0, trousers: 0x38251a, boots: 0x38251a };
  return new Rig(BUILDS[build].proportions, (ctx) => {
    body(ctx, look);
    head(ctx, look);
  });
}

/** Pose `rig` at walk `u` over `stand` (bind if none), as the villagers do. */
function walkAt(rig: Rig, build: BuildName, u: number, stand: MutablePose = {}): void {
  const pose: MutablePose = {};
  for (const [bone, r] of Object.entries(stand)) pose[bone] = [r[0], r[1], r[2]];
  const hip = walkOver(pose, walkFrame(u, BUILDS[build]), 1);
  rig.apply(pose);
  rig.setHipOffset(hip[0], hip[1], hip[2]);
  rig.mesh.updateMatrixWorld(true);
}

/** The lowest vertex on each of `bones` (skinned to it first), indexed alike; Infinity where none. */
function lowest(rig: Rig, bones: readonly BoneName[]): number[] {
  const geo = rig.mesh.geometry;
  const skin = geo.getAttribute('skinIndex');
  const index = bones.map((b) => BONES.indexOf(b));
  const low = bones.map(() => Infinity);
  for (let i = 0; i < geo.getAttribute('position').count; i++) {
    const at = index.indexOf(skin.getX(i));
    if (at < 0) continue;
    rig.mesh.getVertexPosition(i, _v);
    low[at] = Math.min(low[at], _v.y);
  }
  return low;
}

describe('the walk', () => {
  describe.each(BUILD_NAMES)('in the %s build', (build) => {
    it('keeps a sole on the floor all the way round, and never sinks one through it', () => {
      const rig = plain(build);
      for (let i = 0; i < FRAMES; i++) {
        walkAt(rig, build, i / FRAMES);
        const [left, right] = lowest(rig, ['footL', 'footR']);
        expect(Math.min(left, right), `sunk at ${i}/${FRAMES}`).toBeGreaterThan(-0.01);
        expect(Math.min(left, right), `floating at ${i}/${FRAMES}`).toBeLessThan(0.01);
      }
    });

    it('holds the planted foot still on the ground while it bears the weight', () => {
      const rig = plain(build);
      const stride = 2 * BUILDS[build].gait.step;
      const along: number[] = [];
      // From the foot's flat to its heel lifting: the body walks on over it at the gait's step.
      for (let i = 0; i <= 24; i++) {
        const u = STANCE * (0.15 + (0.4 * i) / 24);
        walkAt(rig, build, u);
        along.push(_v.set(0, 0, 0).applyMatrix4(rig.bones.footL.matrixWorld).z + u * stride);
      }
      expect(Math.max(...along) - Math.min(...along)).toBeLessThan(0.01);
    });

    it('loops without a seam or a jolt, every bone finite', () => {
      const b = BUILDS[build];
      const seam = walkFrame(1 - 1e-6, b);
      const start = walkFrame(0, b);
      for (const [bone, r] of Object.entries(start.pose)) {
        for (let k = 0; k < 3; k++) expect(Math.abs(r[k] - seam.pose[bone][k]), `${bone} at the seam`).toBeLessThan(0.01);
      }
      // Sampled 120 times round the cycle (more often than a quick child's
      // steps are drawn at 90 Hz), no bone turns more than 0.1 rad between two.
      const frames = 120;
      let last = walkFrame(0, b);
      for (let i = 1; i <= frames; i++) {
        const next = walkFrame(i / frames, b);
        for (const [bone, r] of Object.entries(next.pose)) {
          for (let k = 0; k < 3; k++) {
            expect(Number.isFinite(r[k]), bone).toBe(true);
            expect(Math.abs(r[k] - last.pose[bone][k]), `${bone} at ${i}/${frames}`).toBeLessThan(0.1);
          }
        }
        last = next;
      }
    });
  });

  it('takes as many steps as the ground walked needs: two to a cycle', () => {
    for (const build of BUILD_NAMES) expect(cyclesOver(2 * BUILDS[build].gait.step, BUILDS[build])).toBeCloseTo(1, 6);
  });
});

describe('everyone a zone can place', () => {
  // Hands are left out: what's held (a stick, a basket) swings with the arm.
  const BODY: BoneName[] = BONES.filter((b) => !b.startsWith('hand'));

  it.each(Object.keys(CAST) as CastId[])('%s walks from their stand with the soles on the floor and nothing through it', (id) => {
    const person = CAST[id];
    const rig = new Rig(BUILDS[person.look.build].proportions, (ctx) => person.dress(ctx, person.look), undefined, person.seed);
    for (let i = 0; i < 24; i++) {
      walkAt(rig, person.look.build, i / 24, person.stand as MutablePose);
      const low = lowest(rig, BODY);
      const feet = Math.min(low[BODY.indexOf('footL')], low[BODY.indexOf('footR')]);
      expect(Math.min(...low), `sunk at ${i}/24`).toBeGreaterThan(-0.01);
      expect(feet, `floating at ${i}/24`).toBeLessThan(0.01);
    }
  });
});
