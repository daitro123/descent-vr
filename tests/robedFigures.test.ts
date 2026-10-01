import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { type MutablePose, strollClip } from '../src/inspector/clips';
import { CLERGY } from '../src/models/clergy';
import { GENTRY } from '../src/models/gentry';
import { BUILDS, body, head, type Look, robed } from '../src/models/human';
import type { Person } from '../src/models/people';
import { BONES, type BoneName, Rig } from '../src/models/rig';
import { ARMS_FOLDED, BEHIND, READING, WRITING } from '../src/models/stands';
import { TRAINERS } from '../src/models/trainers';
import { CAST, type CastId, Wardrobe } from '../src/people/cast';
import { WORKS } from '../src/people/work';

// The robed and named figures (models/clergy.ts, gentry.ts, trainers.ts): the
// `priest`, `scholar`, `noble`, `merchant` and `class trainer` families, and
// the two villagers who stand with them. These check what a player would
// notice standing beside one: nothing they carry goes through the floor, a
// staff or a sword rests at it, hands said to be behind the back are, and a
// book is held up in front where it can be read.

const FIGURES = [...Object.keys(CLERGY), ...Object.keys(GENTRY), ...Object.keys(TRAINERS)] as CastId[];
const wardrobe = new Wardrobe();
const _v = new Vector3();

/** `id` dressed and standing at ease, ready to measure. */
function standing(id: CastId): Rig {
  const rig = wardrobe.dress(id);
  rig.apply(CAST[id].stand);
  rig.mesh.updateMatrixWorld(true);
  return rig;
}

/** The lowest vertex of the posed body, or of what's on `bone` only. */
function lowest(rig: Rig, bone?: BoneName): number {
  const geo = rig.mesh.geometry;
  const skin = geo.getAttribute('skinIndex');
  const only = bone ? BONES.indexOf(bone) : -1;
  let low = Infinity;
  for (let i = 0; i < geo.getAttribute('position').count; i++) {
    if (only >= 0 && skin.getX(i) !== only) continue;
    rig.mesh.getVertexPosition(i, _v);
    low = Math.min(low, _v.y);
  }
  return low;
}

/** Where a bone's joint is in the world. */
function joint(rig: Rig, bone: BoneName): Vector3 {
  return new Vector3().setFromMatrixPosition(rig.bones[bone].matrixWorld);
}

describe('the robed and named figures', () => {
  it('are all of the cast, each at works there are', () => {
    expect(FIGURES.length).toBe(26);
    for (const id of FIGURES) {
      expect(CAST[id], id).toBeDefined();
      for (const work of (CAST[id] as Person).works ?? []) expect(WORKS[work], `${id} ${work}`).toBeDefined();
    }
  });

  it('build no body a long robe hides: no upper arms or thighs, fewer triangles', () => {
    const look: Look = { build: 'average', skin: 0xc08a66, hair: 0x3a281c, hairStyle: 'short', shirt: 0xcfc2a0, trousers: 0x38251a, boots: 0x38251a };
    const make = (covered?: ReturnType<typeof robed>) =>
      new Rig(BUILDS.average.proportions, (ctx) => {
        body(ctx, look, covered);
        head(ctx, look);
      });
    const bare = make();
    const robe = make(robed());
    expect(robe.triangles).toBeLessThan(bare.triangles);
    const skin = robe.mesh.geometry.getAttribute('skinIndex');
    const hidden = (['upperArmL', 'upperArmR', 'thighL', 'thighR'] as const).map((b) => BONES.indexOf(b));
    for (let i = 0; i < skin.count; i++) expect(hidden).not.toContain(skin.getX(i));
    // A short gown shows the thighs below it, so it keeps them.
    expect(robed(0.3).thighs).toBe(true);
    expect(robed(0.45).thighs).toBe(false);
  });

  it('stand with nothing they carry through the floor', () => {
    for (const id of FIGURES) expect(lowest(standing(id)), id).toBeGreaterThan(-0.02);
  });

  it('rest a staff, a spade or a sword at the floor', () => {
    const resting: [CastId, BoneName][] = [
      ['magisterQuill', 'handR'],
      ['brotherAnsgar', 'handL'],
      ['sergeantRook', 'handR'],
      ['warriorTrainer', 'handR'],
    ];
    for (const [id, hand] of resting) {
      const foot = lowest(standing(id), hand);
      expect(foot, id).toBeGreaterThan(-0.02);
      expect(foot, id).toBeLessThan(0.12);
    }
  });

  it('walk with nothing they carry through the floor', () => {
    const feet = ['footL', 'footR'].map((b) => BONES.indexOf(b as BoneName));
    const out: MutablePose = {};
    const sunk: string[] = [];
    for (const id of FIGURES) {
      const person = CAST[id] as Person;
      const rig = wardrobe.dress(id);
      const clip = strollClip(person.stand, person.look.build, person.carry);
      const skin = rig.mesh.geometry.getAttribute('skinIndex');
      let low = Infinity;
      for (let k = 0; k < 24; k++) {
        const frame = clip.sample((clip.duration * k) / 24, out);
        rig.apply(frame.pose);
        rig.setHipOffset(...(frame.hip ?? [0, frame.hipY, 0]));
        rig.mesh.updateMatrixWorld(true);
        for (let i = 0; i < skin.count; i++) {
          if (feet.includes(skin.getX(i))) continue;
          rig.mesh.getVertexPosition(i, _v);
          low = Math.min(low, _v.y);
        }
      }
      if (low < -0.02) sunk.push(`${id} ${low.toFixed(2)} m`);
    }
    expect(sunk).toEqual([]);
  });

  it('keep hands behind the back behind it, folded arms and a book in front', () => {
    for (const id of FIGURES) {
      const stand = CAST[id].stand;
      const rig = standing(id);
      const spine = joint(rig, 'spine');
      const hands = [joint(rig, 'handL'), joint(rig, 'handR')];
      const height = rig.proportions.hipY + rig.proportions.neck;
      if (stand === BEHIND) for (const h of hands) expect(h.z - spine.z, id).toBeLessThan(-0.08);
      if (stand === ARMS_FOLDED) for (const h of hands) expect(h.z - spine.z, id).toBeGreaterThan(0.1);
      if (stand === READING || stand === WRITING) {
        for (const h of hands) {
          expect(h.z - spine.z, id).toBeGreaterThan(0.15);
          // Held up at the chest, under the eyes.
          expect(h.y / height, id).toBeGreaterThan(0.5);
          expect(h.y / height, id).toBeLessThan(0.85);
        }
      }
    }
  });
});
