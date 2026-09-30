// PROTOTYPE (abilities ticket 06): the mage's bolts in flight. See mageKit.prototype.ts.

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
import { combatStats, type Combat } from '../../combat/combat';
import { closestPointOnSegment, closestSegmentSegment, type SegmentHit } from '../../combat/geometry';
import type { Enemy } from '../../enemies/enemy';
import { sfx } from '../../fx/sfx';
import type { Handedness } from '../../player/input';
import type { Player } from '../../player/player';
import { MAGE } from './mageNumbers.prototype';

export interface Bolt {
  pos: Vector3;
  prev: Vector3;
  vel: Vector3;
  from: Vector3;
  radius: number;
  damage: number;
  life: number;
  color: number;
  hand: Handedness;
  /** What the aim assist locked on at launch; the bolt bends toward it in flight. */
  target: Enemy | null;
}

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
const _push = new Vector3();
const _hit: SegmentHit = { distance: 0, pointA: new Vector3(), pointB: new Vector3() };

/** Where a bolt aims on an enemy: high on the chest. */
export function chestOf(enemy: Enemy, out: Vector3): Vector3 {
  enemy.capsule(_a, _b);
  return out.lerpVectors(_a, _b, 0.7);
}

/**
 * The aim assist: of the enemies within `coneDeg` of `dir` from `from`, the
 * one nearest the line. `dir` bends onto its chest. Null (and `dir` as it was)
 * if none.
 */
export function assist(from: Vector3, dir: Vector3, enemies: readonly Enemy[], coneDeg: number): Enemy | null {
  let best: Enemy | null = null;
  let bestAngle = (coneDeg * Math.PI) / 180;
  for (const e of enemies) {
    if (!e.hittable) continue;
    chestOf(e, _p).sub(from);
    const d = _p.length();
    if (d > MAGE.bolt.assistRange || d < 0.3) continue;
    const angle = _p.angleTo(dir);
    if (angle < bestAngle) {
      bestAngle = angle;
      best = e;
    }
  }
  if (best) dir.copy(chestOf(best, _p).sub(from).normalize());
  return best;
}

/** Bolts in flight: one draw call for all of them, a trail of motes behind each. */
export class MageBolts {
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

  fire(bolt: Omit<Bolt, 'prev' | 'life' | 'from'>): void {
    if (this.bolts.length >= MAX) this.bolts.shift();
    this.bolts.push({ ...bolt, prev: bolt.pos.clone(), from: bolt.pos.clone(), life: MAGE.bolt.life });
  }

  update(dt: number, enemies: readonly Enemy[], player: Player, combat: Combat): void {
    const B = MAGE.bolt;
    const { particles, text } = combat.fx;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      // Home in on the locked target, a little: a slow toss curves, a fast throw hardly needs it.
      if (b.target?.hittable) {
        const speed = b.vel.length();
        _want.copy(chestOf(b.target, _p)).sub(b.pos).normalize().multiplyScalar(speed);
        const turn = Math.min(1, (B.homingDegPerSec * Math.PI) / 180 * dt / Math.max(1e-3, b.vel.angleTo(_want)));
        b.vel.lerp(_want, turn).setLength(speed);
      }
      b.prev.copy(b.pos);
      b.pos.addScaledVector(b.vel, dt);
      if (Math.random() < 0.8) particles.burst('magic', b.pos, 1, undefined, b.color);

      const hit = this.strike(b, enemies, player, combat, text);
      if (hit || player.ground.arrowStops(b.pos) || b.life <= 0) {
        if (!hit) particles.burst('magic', b.pos, 8, undefined, b.color);
        this.bolts.splice(i, 1);
      }
    }
    this.render();
  }

  /** The first enemy the bolt's step touches takes it: a head is a crit. */
  private strike(b: Bolt, enemies: readonly Enemy[], player: Player, combat: Combat, text: Combat['fx']['text']): boolean {
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
      if (enemy.evading) {
        text.spawn('Evade', _p.clone().setY(_p.y + 0.2), { color: '#c0c0c0', scale: 0.16 });
        return true;
      }
      let damage = b.damage * player.stats.damage;
      if (crit) damage *= enemy.def.critMultiplier;
      if (enemy.exposed > 0) damage *= MAGE.bolt.exposedMultiplier;
      damage = Math.round(damage);
      _push.copy(b.vel).setY(0);
      if (_push.lengthSq() > 1e-6) _push.normalize().multiplyScalar(MAGE.bolt.knockback);
      const killed = enemy.takeHit(damage, _push, { from: b.from });
      combatStats.hits++;
      if (crit) combatStats.crits++;
      combat.fx.particles.burst('magic', _p, 16, undefined, b.color);
      if (crit) combat.fx.particles.burst('sparks', _p, 12, undefined, 0xbfe8ff);
      text.spawn(crit ? `${damage}!` : `${damage}`, _p, { color: crit ? '#ffd23a' : '#bcdcff', scale: crit ? 0.3 : 0.22 });
      sfx.hit(crit, _p);
      const h = MAGE.haptics.hit;
      player.input.pulse(b.hand, h.intensity, h.ms);
      combat.landed(enemy, killed, 0.03);
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
