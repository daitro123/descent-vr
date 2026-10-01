import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { movesOf } from '../src/animals/poses';
import { animalClips, type MutablePose } from '../src/inspector/clips';
import { ANIMALS, type AnimalId, dressWolf, muzzleOf, WOLF_BUILD } from '../src/models/animals';
import { QUAD_BONES, QuadRig } from '../src/models/quadruped';

// The animals on the four-legged skeleton (models/quadruped.ts, models/animals.ts):
// each look costs well under a person's triangles in one draw call, stands
// on its feet, and plays its animations with its muzzle reaching the grass.

const IDS = Object.keys(ANIMALS) as AnimalId[];
const _v = new Vector3();

function build(id: AnimalId): QuadRig {
  const a = ANIMALS[id];
  return new QuadRig(a.proportions, a.dress, undefined, a.seed);
}

/** The lowest and highest of the posed body's vertices. */
function extent(rig: QuadRig): { low: number; high: number } {
  rig.mesh.updateMatrixWorld(true);
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i < rig.mesh.geometry.getAttribute('position').count; i++) {
    rig.mesh.getVertexPosition(i, _v);
    low = Math.min(low, _v.y);
    high = Math.max(high, _v.y);
  }
  return { low, high };
}

/** Where the muzzle's tip is over the floor, with the rig in `pose` and its hips dropped by `drop`. */
function muzzleHeight(rig: QuadRig, id: AnimalId, pose: object, drop = 0): number {
  rig.resetBones();
  rig.apply(pose);
  rig.setHipOffset(0, -drop, 0);
  rig.mesh.updateMatrixWorld(true);
  const [x, y, z] = muzzleOf(ANIMALS[id].species, rig.proportions);
  return _v.set(x, y, z).applyMatrix4(rig.bones.head.matrixWorld).y;
}

describe('animals', () => {
  it('cost well under a person (630 to 860 triangles), in one draw call', () => {
    for (const id of IDS) {
      const rig = build(id);
      expect(rig.triangles, id).toBeLessThanOrEqual(ANIMALS[id].species === 'horse' ? 520 : 460);
      expect(Array.isArray(rig.mesh.material), id).toBe(false);
      expect(rig.mesh.geometry.groups.length, id).toBeLessThanOrEqual(1);
      expect(rig.boneNames).toEqual([...QUAD_BONES]);
    }
    const wolf = new QuadRig(WOLF_BUILD, dressWolf(0));
    expect(wolf.triangles).toBeLessThanOrEqual(460);
  });

  it('stand on their feet, at their height', () => {
    for (const id of IDS) {
      const rig = build(id);
      const { low, high } = extent(rig);
      expect(low, id).toBeCloseTo(0, 2);
      const p = rig.proportions;
      expect(high, id).toBeGreaterThan(Math.max(p.hipY, p.shoulderY));
      expect(high, id).toBeLessThan(Math.max(p.hipY, p.shoulderY) * 2.1);
    }
  });

  it('graze with the muzzle in the grass, and look up with it well clear', () => {
    for (const id of IDS) {
      const rig = build(id);
      const m = movesOf(id);
      const grazing = muzzleHeight(rig, id, m.graze);
      expect(grazing, id).toBeGreaterThan(-0.02);
      expect(grazing, id).toBeLessThan(0.09);
      expect(muzzleHeight(rig, id, m.alert), id).toBeGreaterThan(rig.proportions.shoulderY);
      // Lying down, the head stays up off the ground.
      expect(muzzleHeight(rig, id, m.lie, m.lieDrop), id).toBeGreaterThan(rig.proportions.shoulderY * 0.3);
    }
  });

  it('lie down with the body on the ground, not through it', () => {
    for (const id of IDS) {
      const rig = build(id);
      const m = movesOf(id);
      rig.apply(m.lie);
      rig.setHipOffset(0, -m.lieDrop, 0);
      const { low } = extent(rig);
      expect(low, id).toBeGreaterThan(-0.06);
      expect(low, id).toBeLessThan(0.05);
    }
  });

  it('play every clip with every bone finite, the feet near the floor as they walk', () => {
    const out: MutablePose = {};
    for (const id of IDS) {
      const rig = build(id);
      for (const clip of animalClips(id)) {
        for (let i = 0; i <= 12; i++) {
          const f = clip.sample((clip.duration * i) / 12, out);
          for (const r of Object.values(f.pose)) for (const v of r!) expect(Number.isFinite(v), `${id} ${clip.name}`).toBe(true);
          expect(Number.isFinite(f.hipY)).toBe(true);
          if (clip.name === 'walk' || clip.name === 'run') {
            rig.resetBones();
            rig.apply(f.pose);
            rig.setHipOffset(0, f.hipY, 0);
            const { low } = extent(rig);
            expect(low, `${id} ${clip.name}`).toBeGreaterThan(-0.06);
            expect(low, `${id} ${clip.name}`).toBeLessThan(0.06);
          }
        }
      }
    }
  });
});
