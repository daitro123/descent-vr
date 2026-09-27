import { type Mesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { attackClip, type MutablePose } from '../src/inspector/clips';
import { buildCharacter, type EnemyKind } from '../src/models/characters';
import { Sword } from '../src/player/weapons';

// Blades should land edge first. These play each melee swing with the game's
// timings (via the inspector's clips) and compare the weapon's cutting side,
// the hand's -Z (see rig.ts), with the direction the blade is travelling. A
// pose that swings the flat into the player, a slap, fails here.

const WIELDERS: [string, EnemyKind, number][] = [
  ['grunt (sword)', 'grunt', 0],
  ['grunt (axe)', 'grunt', 1],
  ['brute', 'brute', 0],
  ['warden', 'warden', 0],
];

/** Angles (degrees) between the cutting side and the blade's travel, across the swing. */
function edgeAngles(kind: EnemyKind, variant: number, pose: string): number[] {
  const attack = CONFIG.enemies[kind].attacks.find((a) => a.pose === pose)!;
  const clip = attackClip(kind, attack);
  const { rig, weapon } = buildCharacter(kind, { variant });
  const bone = rig.bones[weapon.bone];
  const out: MutablePose = {};
  const mid = new Vector3();
  const prev = new Vector3();
  const edge = new Vector3();
  const angles: number[] = [];
  const start = 0.5 + attack.windup; // clips rest 0.5 s before the wind-up
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    rig.apply(clip.sample(start + (attack.active * i) / steps, out).pose);
    rig.mesh.updateMatrixWorld(true);
    // Halfway down the business end, and the hand's -Z there.
    mid.set(...weapon.base).lerp(new Vector3(...weapon.tip), 0.5).applyMatrix4(bone.matrixWorld);
    edge.setFromMatrixColumn(bone.matrixWorld, 2).negate();
    if (i > 0) angles.push((edge.angleTo(mid.clone().sub(prev)) * 180) / Math.PI);
    prev.copy(mid);
  }
  return angles;
}

describe.each(WIELDERS)('%s', (_name, kind, variant) => {
  const poses = [...new Set(CONFIG.enemies[kind].attacks.filter((a) => a.kind === 'melee').map((a) => a.pose))];

  it.each(poses)('%s leads with the edge, not the flat', (pose) => {
    const angles = edgeAngles(kind, variant, pose);
    const mean = angles.reduce((s, a) => s + a, 0) / angles.length;
    // 0° is edge first, 90° is flat first.
    expect(mean).toBeLessThan(40);
    expect(Math.max(...angles)).toBeLessThan(60);
  });

  it('carries its striking end on the cutting side', () => {
    // An axe's bit, say: off the haft toward -Z, never behind it.
    expect(buildCharacter(kind, { variant }).weapon.tip[2]).toBeLessThanOrEqual(0);
  });
});

describe('player longsword', () => {
  it('is held with its edges toward palm and back of the hand, so a thumb-up side-to-side swing cuts', () => {
    // Grip space: X is out of the back of the hand. A slash across the body
    // with the thumb up moves the blade along ±X, so the edges (and the
    // crossguard, which runs with them) belong there, whatever the pitch.
    const { bladeStart } = CONFIG.sword;
    const pivot = new Sword().model.children[0];
    const across = new Vector3(0, 1, 0).applyAxisAngle(new Vector3(1, 0, 0), pivot.rotation.x);
    const pos = (pivot.children[0] as Mesh).geometry.getAttribute('position');
    const v = new Vector3();
    const blade = { x: 0, y: 0 };
    const guard = { x: 0, y: 0 };
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const part = v.z < -bladeStart - 0.05 ? blade : Math.abs(v.z + bladeStart) < 0.04 ? guard : null;
      if (!part) continue;
      v.applyQuaternion(pivot.quaternion);
      part.x = Math.max(part.x, Math.abs(v.x));
      part.y = Math.max(part.y, Math.abs(v.dot(across)));
    }
    expect(blade.x).toBeGreaterThan(blade.y * 3);
    expect(guard.x).toBeGreaterThan(guard.y * 3);
  });
});
