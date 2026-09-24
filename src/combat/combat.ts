import { Matrix4, Vector3 } from 'three';
import { CONFIG } from '../config';
import type { Enemy, StrikeResult } from '../enemies/enemy';
import type { FloatingText } from '../fx/floatingText';
import { sfx } from '../fx/sfx';
import type { Player } from '../player/player';
import { clamp01, closestSegmentSegment, segmentIntersectsBox, type SegmentHit } from './geometry';

export interface CombatEvents {
  onEnemyHit(enemy: Enemy, killed: boolean): void;
  onPlayerHurt(): void;
  hitStop(seconds: number): void;
}

const _hit: SegmentHit = { distance: 0, pointA: new Vector3(), pointB: new Vector3() };
const _prevBase = new Vector3();
const _prevTip = new Vector3();
const _curBase = new Vector3();
const _curTip = new Vector3();
const _sBase = new Vector3();
const _sTip = new Vector3();
const _capA = new Vector3();
const _capB = new Vector3();
const _push = new Vector3();
const _head = new Vector3();
const _origin = new Vector3();
const _target = new Vector3();
const _inv = new Matrix4();
const _half = new Vector3();
const _vel = new Vector3();
const _toEnemy = new Vector3();

/** Stats for the debug overlay / automated tests. */
export const combatStats = { swings: 0, hits: 0, crits: 0, blocks: 0, parries: 0, hurts: 0 };

export class Combat {
  private swinging = false;

  constructor(
    private readonly player: Player,
    private readonly text: FloatingText,
    private readonly events: CombatEvents,
  ) {}

  /**
   * Sword vs enemies. The blade is a segment; between frames we sweep it
   * through a few interpolated sub-steps so a fast swing can't tunnel through
   * a body in one 72–90 Hz frame. Contact only counts above a tip-speed
   * threshold, and damage scales with speed — you have to actually swing.
   */
  updateSword(enemies: Enemy[]): void {
    const { sword, rig } = this.player;
    if (!sword.tip.valid || !this.player.alive) return;
    const speed = sword.tipSpeed;
    const S = CONFIG.sword;
    const fast = speed >= S.minHitSpeed;
    if (fast && !this.swinging) combatStats.swings++;
    this.swinging = fast;
    if (!fast) return;

    sword.base.worldPrev(rig, _prevBase);
    sword.tip.worldPrev(rig, _prevTip);
    sword.base.worldNow(rig, _curBase);
    sword.tip.worldNow(rig, _curTip);
    const reach = CONFIG.enemy.radius + S.bladeHalfWidth;

    for (const enemy of enemies) {
      if (!enemy.hittable || enemy.hitCooldown > 0) continue;
      enemy.capsule(_capA, _capB);

      let contact = false;
      for (let i = 1; i <= S.sweepSamples && !contact; i++) {
        const t = i / S.sweepSamples;
        _sBase.lerpVectors(_prevBase, _curBase, t);
        _sTip.lerpVectors(_prevTip, _curTip, t);
        closestSegmentSegment(_sBase, _sTip, _capA, _capB, _hit);
        contact = _hit.distance <= reach;
      }
      if (!contact) continue;

      const power = clamp01((speed - S.minHitSpeed) / (S.fullDamageSpeed - S.minHitSpeed));
      const crit = _hit.pointB.y >= S.critHeight;
      const damage = Math.round(
        (S.minDamage + (S.maxDamage - S.minDamage) * power) * (crit ? S.critMultiplier : 1),
      );

      // Push along the blade's horizontal travel (world space).
      _push.copy(sword.tip.velocity).applyQuaternion(rig.quaternion);
      _push.y = 0;
      if (_push.lengthSq() > 1e-6) _push.normalize().multiplyScalar(S.knockback * (0.4 + 0.6 * power));

      const killed = enemy.takeHit(damage, _push);
      combatStats.hits++;
      if (crit) combatStats.crits++;
      this.text.spawn(crit ? `${damage}!` : `${damage}`, _hit.pointA, {
        color: crit ? '#ffd23a' : '#ffffff',
        scale: crit ? 0.3 : 0.22,
      });
      sfx.hit(crit);
      this.player.input.pulse('right', CONFIG.feel.hapticHit.intensity * (0.5 + 0.5 * power), CONFIG.feel.hapticHit.ms);
      this.player.addRage(CONFIG.rage.perHit);
      this.events.hitStop(CONFIG.feel.hitStop * (0.5 + power));
      this.events.onEnemyHit(enemy, killed);
    }
  }

  /**
   * An enemy's club lands. Out of reach → whiff (stepping back is a defence).
   * Otherwise the blow travels shoulder → player's chest; if that line passes
   * through the shield box it is blocked, and a shield moving *into* the blow
   * is a parry.
   */
  resolveStrike(enemy: Enemy): StrikeResult {
    const E = CONFIG.enemy;
    const player = this.player;
    if (!player.alive) return 'miss';

    player.headPosition(_head);
    const dx = _head.x - enemy.position.x;
    const dz = _head.z - enemy.position.z;
    if (Math.hypot(dx, dz) > E.attackRange + E.reachBonus) {
      const at = _head.clone().lerp(enemy.position, 0.5).setY(_head.y - 0.2);
      this.text.spawn('miss', at, { color: '#9a9a9a', scale: 0.15 });
      return 'miss';
    }

    enemy.strikeOrigin(_origin);
    _target.copy(_head);
    _target.y -= 0.25; // aim between head and chest

    const { shield } = player;
    if (shield.tracked) {
      const board = shield.board;
      board.updateWorldMatrix(true, false);
      _inv.copy(board.matrixWorld).invert();
      const a = _origin.clone().applyMatrix4(_inv);
      const b = _target.clone().applyMatrix4(_inv);
      const S = CONFIG.shield;
      _half.set(S.width / 2 + S.blockMargin, S.height / 2 + S.blockMargin, S.depth / 2 + S.blockMargin);

      if (segmentIntersectsBox(a, b, _half)) {
        // Shield velocity toward the attacker, world space.
        _vel.copy(shield.centre.velocity).applyQuaternion(player.rig.quaternion);
        _toEnemy.subVectors(_origin, _head).setY(0).normalize();
        const parry = _vel.dot(_toEnemy) >= S.parrySpeed;
        const at = board.getWorldPosition(new Vector3());
        at.y += 0.3;
        shield.flash();
        if (parry) {
          combatStats.parries++;
          this.text.spawn('PARRY', at, { color: '#7fd4ff', scale: 0.2 });
          sfx.parry();
          player.addRage(CONFIG.rage.perParry);
          this.events.hitStop(0.1);
        } else {
          combatStats.blocks++;
          this.text.spawn('block', at, { color: '#c0c0c0', scale: 0.15 });
          sfx.block();
          player.addRage(CONFIG.rage.perBlock);
        }
        const h = CONFIG.feel.hapticBlock;
        player.input.pulse('left', h.intensity, h.ms);
        return parry ? 'parried' : 'blocked';
      }
    }

    combatStats.hurts++;
    player.damage(E.damage);
    sfx.hurt();
    this.events.onPlayerHurt();
    return 'hit';
  }

  /** War Cry: spend rage, blast nearby enemies back and stagger them. */
  warCry(enemies: Enemy[]): boolean {
    const A = CONFIG.ability;
    const player = this.player;
    if (!player.alive || player.rage < A.cost) return false;
    player.rage -= A.cost;
    player.feetPosition(_head);
    for (const enemy of enemies) {
      if (!enemy.hittable) continue;
      _push.subVectors(enemy.position, _head).setY(0);
      const d = _push.length();
      if (d > A.radius) continue;
      _push.normalize().multiplyScalar(A.knockback * (1 - (d / A.radius) * 0.5));
      const killed = enemy.takeHit(A.damage, _push);
      if (!killed) enemy.stagger(A.stagger);
      this.text.spawn(`${A.damage}`, enemy.position.clone().setY(1.7), { color: '#ffb020' });
      this.events.onEnemyHit(enemy, killed);
    }
    sfx.warCry();
    player.input.pulse('left', 1, 200);
    player.input.pulse('right', 1, 200);
    return true;
  }
}
