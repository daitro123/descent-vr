import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { attackClip, type MutablePose } from '../src/inspector/clips';
import { buildCharacter, type EnemyKind, type Family } from '../src/models/characters';
import { buildLongsword } from '../src/models/gear';

// Blades should land edge first. These play each melee swing with the game's
// timings (via the inspector's clips) and compare the weapon's cutting side,
// the hand's -Z (see rig.ts), with the direction the blade is travelling. A
// pose that swings the flat into the player, a slap, fails here.

const WIELDERS: [string, EnemyKind, number, Family, string?][] = [
  ['grunt (sword)', 'grunt', 0, 'undead'],
  ['grunt (axe)', 'grunt', 1, 'undead'],
  ['brute', 'brute', 0, 'undead'],
  ['warden', 'warden', 0, 'undead'],
  ['bandit thug (sword)', 'grunt', 0, 'bandit'],
  ['bandit thug (hatchet)', 'grunt', 1, 'bandit'],
  ['bandit leader (felling axe)', 'brute', 0, 'bandit'],
  // A club has no edge, but swung the same way it lands its striking face first all the same.
  ['bailiff (cudgel)', 'grunt', 0, 'corvane'],
  ['bailiff (iron-bound club)', 'grunt', 1, 'corvane'],
  ['bailiff shieldman (mace)', 'brute', 0, 'corvane'],
  ['Lantern Man (cutlass)', 'grunt', 0, 'smuggler'],
  ['Lantern Man (boat hook)', 'grunt', 1, 'smuggler'],
  ['Lantern Men dredger (dredging hook)', 'brute', 0, 'smuggler'],
  ['Lantern Men dredger (beetle)', 'brute', 1, 'smuggler'],
  ['Lantern Men leader (boarding axe)', 'brute', 0, 'smuggler', 'leader'],
  ['Captain Crake (long cutlass)', 'brute', 0, 'smuggler', 'crake'],
  ['Undergate thief (long knife)', 'grunt', 0, 'undergate'],
  ['fen raider (eel spear, four tines)', 'grunt', 0, 'raider'],
  ['fen raider (eel spear, three tines)', 'grunt', 1, 'raider'],
  ['fen raider peat cutter (peat spade)', 'brute', 0, 'raider'],
  ['Abel Thatch (slasher)', 'brute', 0, 'raider', 'headman'],
];

/** Angles (degrees) between the cutting side and the blade's travel, across the swing. */
function edgeAngles(kind: EnemyKind, variant: number, family: Family, pose: string, named?: string): number[] {
  const attack = CONFIG.enemies[kind].attacks.find((a) => a.pose === pose)!;
  const clip = attackClip(kind, attack);
  const { rig, weapon } = buildCharacter(kind, { variant, family, named });
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

describe.each(WIELDERS)('%s', (_name, kind, variant, family, named) => {
  const poses = [...new Set(CONFIG.enemies[kind].attacks.filter((a) => a.kind === 'melee').map((a) => a.pose))];

  it.each(poses)('%s leads with the edge, not the flat', (pose) => {
    const angles = edgeAngles(kind, variant, family, pose, named);
    const mean = angles.reduce((s, a) => s + a, 0) / angles.length;
    // 0° is edge first, 90° is flat first.
    expect(mean).toBeLessThan(40);
    expect(Math.max(...angles)).toBeLessThan(60);
  });

  it('carries its striking end on the cutting side', () => {
    // An axe's bit, say: off the haft toward -Z, never behind it.
    expect(buildCharacter(kind, { variant, family, named }).weapon.tip[2]).toBeLessThanOrEqual(0);
  });
});

describe('player longsword', () => {
  it('has its edges and crossguard across the fist (grip ±Y), flats facing palm and back of hand (±X)', () => {
    const { bladeStart, bladeEnd, bladeHalfWidth } = CONFIG.sword;
    const pos = buildLongsword(bladeStart, bladeEnd, bladeHalfWidth).getAttribute('position');
    const blade = { x: 0, y: 0 };
    const guard = { x: 0, y: 0 };
    for (let i = 0; i < pos.count; i++) {
      const [x, y, z] = [Math.abs(pos.getX(i)), Math.abs(pos.getY(i)), pos.getZ(i)];
      const part = z < -bladeStart - 0.05 ? blade : Math.abs(z + bladeStart) < 0.04 ? guard : null;
      if (!part) continue;
      part.x = Math.max(part.x, x);
      part.y = Math.max(part.y, y);
    }
    expect(blade.y).toBeGreaterThan(blade.x * 3);
    expect(guard.y).toBeGreaterThan(guard.x * 3);
  });
});
