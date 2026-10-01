import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BONES, blendPoses, HUMANOID, Rig, SkeletonRig, type SkeletonDef } from '../src/models/rig';
import { buildCharacter } from '../src/models/characters';

// The general rig (models/rig.ts): any skeleton given as data builds into one
// rigidly skinned mesh, and the humanoid is just one such skeleton.

type Stick = 'base' | 'arm' | 'tip';

/** A toy skeleton: a post with an arm sticking forward off its top, and a tip on the arm. */
const STICK: SkeletonDef<Stick, { h: number; reach: number }> = {
  name: 'stick',
  bones: ['base', 'arm', 'tip'],
  parent: { base: null, arm: 'base', tip: 'arm' },
  offsets: (p) => ({ base: [0, 0, 0], arm: [0, p.h, 0], tip: [0, 0, p.reach] }),
  shadeTo: (p) => p.h,
};

function stick(): SkeletonRig<Stick, { h: number; reach: number }> {
  return new SkeletonRig(STICK, { h: 1, reach: 0.5 }, (ctx) => {
    ctx.on('base').box(0.1, 1, 0.1, { at: [0, 0.5, 0], color: 0x808080 });
    ctx.on('arm').box(0.1, 0.1, 0.5, { at: [0, 0, 0.25], color: 0x808080 });
    ctx.on('tip').box(0.1, 0.1, 0.1, { color: 0xff0000 });
  });
}

const _v = new Vector3();

describe('the general rig', () => {
  it('builds any skeleton into one skinned mesh, a bone per entry, parts on their bones', () => {
    const rig = stick();
    expect(rig.boneNames).toEqual(['base', 'arm', 'tip']);
    expect(rig.mesh.skeleton.bones.map((b) => b.name)).toEqual(['base', 'arm', 'tip']);
    expect(rig.triangles).toBe(36);
    const skin = rig.mesh.geometry.getAttribute('skinIndex');
    const used = new Set<number>();
    for (let i = 0; i < skin.count; i++) used.add(skin.getX(i));
    expect([...used].sort()).toEqual([0, 1, 2]);
  });

  it('turns bones by a pose, moves the root by the hip offset, and returns to bind', () => {
    const rig = stick();
    rig.apply({ arm: [Math.PI / 2, 0, 0] }); // x > 0 pitches a forward-pointing bone down
    rig.mesh.updateMatrixWorld(true);
    rig.bones.tip.getWorldPosition(_v);
    expect(_v.y).toBeCloseTo(0.5);
    expect(_v.z).toBeCloseTo(0);
    rig.setHipOffset(0, 0.2, 0);
    rig.mesh.updateMatrixWorld(true);
    expect(rig.bones.tip.getWorldPosition(_v).y).toBeCloseTo(0.7);
    rig.resetBones();
    rig.mesh.updateMatrixWorld(true);
    rig.bones.tip.getWorldPosition(_v);
    expect([_v.y, _v.z]).toEqual([1, 0.5]);
  });

  it('wears another rig’s geometry instead of building its own', () => {
    const first = stick();
    const second = new SkeletonRig(STICK, { h: 1, reach: 0.5 }, first.mesh.geometry);
    expect(second.mesh.geometry).toBe(first.mesh.geometry);
    expect(second.bones.tip).not.toBe(first.bones.tip);
  });

  it('blends poses over any skeleton’s bones', () => {
    const out: Record<string, [number, number, number]> = { stale: [1, 1, 1] };
    const pose = blendPoses<Stick>({ arm: [1, 0, 0] }, { arm: [0, 0, 0], tip: [0, 2, 0] }, 0.5, out, STICK.bones);
    expect(pose.arm).toEqual([0.5, 0, 0]);
    expect(pose.tip).toEqual([0, 1, 0]);
    expect(pose.base).toBeUndefined();
  });

  it('keeps the humanoid as it was: the same bones, in the same order, from the same proportions', () => {
    const grunt = buildCharacter('grunt').rig;
    expect(grunt).toBeInstanceOf(Rig);
    expect(grunt.skeleton).toBe(HUMANOID);
    expect(grunt.boneNames).toEqual([...BONES]);
    grunt.mesh.updateMatrixWorld(true);
    expect(grunt.bones.hips.getWorldPosition(_v).y).toBeCloseTo(grunt.proportions.hipY);
  });
});
