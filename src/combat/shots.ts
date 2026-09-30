import { type BufferGeometry, DynamicDrawUsage, InstancedMesh, Matrix4, type Object3D, Quaternion, Vector3 } from 'three';
import { CONFIG } from '../config';
import type { Enemy } from '../enemies/enemy';
import { sharedModelMaterial } from '../models/materials';
import { type BladeResult, bladeTarget, sweepBlade } from './strike';

// The ranger's arrows in flight (.scratch/abilities/spec.md, "The ranger"):
// loosed from the bow with damage and speed by the draw, falling under
// gravity, and meeting the first enemy along their way. A Power Shot passes
// through the first enemy it hits to hit one behind. One instanced mesh for
// them all. Combat lands the blows (ranger.ts); the flight is here, so the
// tests drive it with real enemies.

/** An arrow of the ranger's, flying or stuck. */
export interface Shot {
  readonly pos: Vector3;
  readonly prev: Vector3;
  readonly vel: Vector3;
  life: number;
  /** What it deals before a head hit's or an exposed enemy's multiplier: the draw's, times your damage (and Power Shot's). */
  readonly damage: number;
  /** Enemies it still passes through after hitting them (Power Shot's 1). */
  pierce: number;
  /** Enemies it has passed through, never hit twice. */
  readonly passed: Enemy[];
  /** A Power Shot. */
  readonly powered: boolean;
  /** s left stuck in a wall or the ground; 0 while it flies. */
  stuck: number;
}

/** What a loosed arrow carries, by how far the string was drawn (0 to 1): damage in level-1 terms, and speed in m/s. */
export function shotOf(draw: number): { damage: number; speed: number } {
  const A = CONFIG.ranger.arrow;
  const d = Math.max(0, Math.min(1, draw));
  return { damage: A.minDamage + (A.maxDamage - A.minDamage) * d, speed: A.minSpeed + (A.maxSpeed - A.minSpeed) * d };
}

/** What an arrow deals an enemy: a head hit at its own crit multiplier, an exposed enemy at the sword's. */
export function arrowDamage(damage: number, head: boolean, enemy: Pick<Enemy, 'exposed' | 'def'>): number {
  let d = damage;
  if (head) d *= enemy.def.critMultiplier;
  if (enemy.exposed > 0) d *= CONFIG.sword.exposedMultiplier;
  return Math.round(d);
}

/** What happens as an arrow meets things: Combat's to decide (ranger.ts). */
export interface ShotHooks {
  /** It hit `enemy`'s body or head at `at`: land the blow. */
  hit(shot: Shot, enemy: Enemy, head: boolean, at: Vector3): void;
  /** A raised guard stopped it. */
  guarded(shot: Shot, enemy: Enemy, at: Vector3): void;
  /** It met an enemy walking home, which takes nothing. */
  evaded(enemy: Enemy, at: Vector3): void;
  /** It struck a wall or the ground. */
  stuck(at: Vector3): void;
}

/** What a flying arrow can strike besides enemies. */
export interface ShotGround {
  arrowStops(p: Vector3): boolean;
}

const MAX = 24;
const _m = new Matrix4();
const _q = new Quaternion();
const _v = new Vector3();
const _one = new Vector3(1, 1, 1);
const _fwd = new Vector3(0, 0, 1);
const _blade: BladeResult = { zone: 'body', point: new Vector3() };
const _best: BladeResult = { zone: 'body', point: new Vector3() };
const _target = bladeTarget();

export class Shots {
  readonly flying: Shot[] = [];
  readonly mesh: InstancedMesh;

  constructor(parent: Object3D | null, geometry: BufferGeometry) {
    this.mesh = new InstancedMesh(geometry, sharedModelMaterial(), MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    parent?.add(this.mesh);
  }

  /**
   * Loose an arrow from `from` along `dir` (unit), drawn `draw` of the way,
   * its damage times `multiplier` (your damage, and Power Shot's), passing
   * through `pierce` enemies. The oldest arrow goes if there are too many.
   */
  loose(from: Vector3, dir: Vector3, draw: number, multiplier: number, pierce = 0, powered = false): Shot {
    const { damage, speed } = shotOf(draw);
    if (this.flying.length >= MAX) {
      const i = this.flying.findIndex((s) => s.stuck > 0);
      this.flying.splice(i >= 0 ? i : 0, 1);
    }
    const shot: Shot = {
      pos: from.clone(),
      prev: from.clone(),
      vel: dir.clone().normalize().multiplyScalar(speed),
      life: CONFIG.ranger.arrow.life,
      damage: damage * multiplier,
      pierce,
      passed: [],
      powered,
      stuck: 0,
    };
    this.flying.push(shot);
    return shot;
  }

  update(dt: number, enemies: readonly Enemy[], ground: ShotGround, hooks: ShotHooks): void {
    const A = CONFIG.ranger.arrow;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const s = this.flying[i];
      if (s.stuck > 0) {
        s.stuck -= dt;
        if (s.stuck <= 0) this.flying.splice(i, 1);
        continue;
      }
      s.life -= dt;
      s.prev.copy(s.pos);
      s.vel.y -= A.gravity * dt;
      s.pos.addScaledVector(s.vel, dt);
      if (this.strike(s, enemies, hooks)) {
        this.flying.splice(i, 1);
        continue;
      }
      if (ground.arrowStops(s.pos)) {
        s.stuck = A.stick;
        hooks.stuck(s.pos);
        continue;
      }
      if (s.life <= 0) this.flying.splice(i, 1);
    }
  }

  /**
   * The enemies this frame's flight meets, nearest first: each hit lands, and
   * the arrow stops at the first unless it still pierces. A raised guard
   * stops it. True once it has stopped.
   */
  private strike(s: Shot, enemies: readonly Enemy[], hooks: ShotHooks): boolean {
    for (;;) {
      let hit: Enemy | null = null;
      let near = Infinity;
      for (const enemy of enemies) {
        if ((!enemy.hittable && !enemy.evading) || s.passed.includes(enemy)) continue;
        const res = sweepBlade(s.prev, s.pos, s.prev, s.pos, CONFIG.ranger.arrow.radius, 1, enemy.bladeTarget(_target), _blade);
        if (!res) continue;
        const d = res.point.distanceToSquared(s.prev);
        if (d >= near) continue;
        near = d;
        hit = enemy;
        _best.zone = res.zone;
        _best.point.copy(res.point);
      }
      if (!hit) return false;
      const at = _best.point.clone();
      if (hit.evading) {
        hooks.evaded(hit, at);
        return true;
      }
      if (_best.zone === 'guard' || hit.guardCovers(at, s.vel)) {
        hooks.guarded(s, hit, at);
        return true;
      }
      hooks.hit(s, hit, _best.zone === 'head', at);
      if (s.pierce <= 0) return true;
      s.pierce--;
      s.passed.push(hit);
    }
  }

  /** Every arrow where it is, along its flight. */
  render(): void {
    let n = 0;
    for (const s of this.flying) {
      _v.copy(s.vel).normalize();
      _q.setFromUnitVectors(_fwd, _v);
      _m.compose(s.pos, _q, _one);
      this.mesh.setMatrixAt(n++, _m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.flying.length = 0;
    this.mesh.count = 0;
  }
}
