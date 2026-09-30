import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  type Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { CONFIG } from '../config';
import type { Enemy } from '../enemies/enemy';
import type { BurstKind, Particles } from '../fx/particles';
import type { Handedness } from '../player/input';
import type { Ground } from '../world/ground';
import { closestPointOnSegment, closestSegmentSegment, type SegmentHit } from './geometry';
import type { BoltCharge } from './mage';

// The mage's bolts in flight (.scratch/abilities/spec.md, "The mage"): one
// instanced mesh for all of them, a trail of motes behind each, bending a
// little toward what the aim assist locked on as they were thrown. The first
// enemy a bolt's step touches takes it (its head is a crit), or the floor, a
// wall or a prop stops it; Combat decides what that does.

export interface Bolt {
  readonly pos: Vector3;
  readonly prev: Vector3;
  readonly vel: Vector3;
  /** Where it was thrown from. */
  readonly from: Vector3;
  readonly radius: number;
  /** In level-1 terms, before your damage multiplies it. */
  readonly damage: number;
  life: number;
  readonly color: number;
  readonly hand: Handedness;
  /** What the aim assist locked on as it was thrown: it bends toward it in flight. */
  readonly target: Enemy | null;
  /**
   * What an ability made of it, if anything: a Fireball burns and bursts where
   * it lands, a Frostbolt slows the enemy it hits, Chain Lightning arcs on, a
   * Pyroblast hits hard and sets it burning.
   */
  readonly charge: BoltCharge | null;
}

/** What a bolt came to: an enemy's body or head, or (enemy null) the floor, a wall or a prop at `at`. */
export type BoltLands = (bolt: Bolt, enemy: Enemy | null, at: Vector3, crit: boolean) => void;

/** The motes a bolt leaves behind it: a Fireball's rise as embers, Chain Lightning's crackle as sparks. */
const TRAIL: Readonly<Record<BoltCharge | 'plain', BurstKind>> = { plain: 'magic', fireball: 'embers', frostbolt: 'magic', chainLightning: 'sparks', pyroblast: 'embers' };

/** At most this many in flight: a new one ends the oldest. */
const MAX = 16;
const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _c = new Color();
const _a = new Vector3();
const _b = new Vector3();
const _head = new Vector3();
const _p = new Vector3();
const _want = new Vector3();
const _hit: SegmentHit = { distance: 0, pointA: new Vector3(), pointB: new Vector3() };

/** Where a bolt aims on an enemy: high on the chest. */
export function chestOf(enemy: Enemy, out: Vector3): Vector3 {
  enemy.capsule(_a, _b);
  return out.lerpVectors(_a, _b, 0.7);
}

/**
 * The aim assist: of the enemies a blow can land on within `coneDeg` of `dir`
 * from `from` and the assist's range, the one nearest the line. `dir` bends
 * onto its chest. Null (and `dir` as it was) for none.
 */
export function assist(from: Vector3, dir: Vector3, enemies: readonly Enemy[], coneDeg: number): Enemy | null {
  let best: Enemy | null = null;
  let bestAngle = (coneDeg * Math.PI) / 180;
  for (const e of enemies) {
    if (!e.hittable) continue;
    chestOf(e, _p).sub(from);
    const d = _p.length();
    if (d > CONFIG.mage.bolt.assistRange || d < 0.3) continue;
    const angle = _p.angleTo(dir);
    if (angle < bestAngle) {
      bestAngle = angle;
      best = e;
    }
  }
  if (best) dir.copy(chestOf(best, _p).sub(from).normalize());
  return best;
}

export class Bolts {
  readonly mesh: InstancedMesh;
  readonly bolts: Bolt[] = [];

  constructor(parent: Object3D) {
    this.mesh = new InstancedMesh(
      new IcosahedronGeometry(1, 1),
      new MeshBasicMaterial({ blending: AdditiveBlending, transparent: true, depthWrite: false }),
      MAX,
    );
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(1, 1, 1)); // allocate the colour buffer
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    parent.add(this.mesh);
  }

  fire(bolt: Omit<Bolt, 'prev' | 'life' | 'from'>): Bolt {
    if (this.bolts.length >= MAX) this.bolts.shift();
    const b: Bolt = { ...bolt, prev: bolt.pos.clone(), from: bolt.pos.clone(), life: CONFIG.mage.bolt.life };
    this.bolts.push(b);
    return b;
  }

  update(dt: number, enemies: readonly Enemy[], ground: Ground, particles: Particles | null, lands: BoltLands): void {
    const B = CONFIG.mage.bolt;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      // Home in on the locked target, a little: a slow toss curves, a fast throw hardly needs it.
      if (b.target?.hittable) {
        const speed = b.vel.length();
        _want.copy(chestOf(b.target, _p)).sub(b.pos).normalize().multiplyScalar(speed);
        const turn = Math.min(1, ((B.homingDegPerSec * Math.PI) / 180) * dt / Math.max(1e-3, b.vel.angleTo(_want)));
        b.vel.lerp(_want, turn).setLength(speed);
      }
      b.prev.copy(b.pos);
      b.pos.addScaledVector(b.vel, dt);
      if (particles && Math.random() < 0.8) particles.burst(TRAIL[b.charge ?? 'plain'], b.pos, 1, undefined, b.color);
      if (this.strike(b, enemies, lands)) this.bolts.splice(i, 1);
      else if (ground.arrowStops(b.pos)) {
        lands(b, null, b.pos, false);
        this.bolts.splice(i, 1);
      } else if (b.life <= 0) {
        particles?.burst('magic', b.pos, 8, undefined, b.color);
        this.bolts.splice(i, 1);
      }
    }
    this.render();
  }

  /** The first enemy the bolt's step touches takes it: its head is a crit. */
  private strike(b: Bolt, enemies: readonly Enemy[], lands: BoltLands): boolean {
    for (const enemy of enemies) {
      if (!enemy.hittable && !enemy.evading) continue;
      const headR = enemy.headSphere(_head);
      closestPointOnSegment(_head, b.prev, b.pos, _p);
      const crit = _p.distanceTo(_head) <= headR + b.radius;
      if (!crit) {
        enemy.capsule(_a, _b);
        closestSegmentSegment(b.prev, b.pos, _a, _b, _hit);
        if (_hit.distance > enemy.def.radius + b.radius) continue;
        _p.copy(_hit.pointB);
      }
      lands(b, enemy, _p, crit);
      return true;
    }
    return false;
  }

  private render(): void {
    let n = 0;
    for (const b of this.bolts) {
      _s.setScalar(b.radius * 0.8);
      _m.compose(b.pos, _q, _s);
      this.mesh.setMatrixAt(n, _m);
      this.mesh.setColorAt(n++, _c.setHex(b.color));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.bolts.length = 0;
    this.mesh.count = 0;
  }
}
