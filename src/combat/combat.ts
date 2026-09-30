import { Matrix4, type Object3D, Vector3 } from 'three';
import { ABILITY, type Ability } from '../classes';
import { type AttackConfig, CONFIG } from '../config';
import type { Enemy, StrikeOutcome } from '../enemies/enemy';
import type { FloatingText } from '../fx/floatingText';
import type { Particles } from '../fx/particles';
import { sfx } from '../fx/sfx';
import type { Shockwaves } from '../fx/shockwave';
import { armourCut } from '../items';
import type { Player } from '../player/player';
import { clamp01, closestPointOnSegment, closestSegmentSegment, segmentIntersectsBox, type SegmentHit } from './geometry';
import { type Arrow, type ArrowContact, type ArrowResolver, Projectiles } from './projectiles';
import { ABILITY_COLOUR, blocked, type Refusal, sweptTo, throwTarget } from './abilities';
import { RangerKit } from './ranger';
import { type BladeResult, bladeTarget, type Defender, sweepBlade, sweepStrike, type SweepResult } from './strike';
import { ThrownAxes } from './thrownAxes';

export interface CombatEvents {
  onEnemyHit(enemy: Enemy, killed: boolean): void;
  onPlayerHurt(): void;
  hitStop(seconds: number): void;
}

/**
 * What came of using an ability: cast, or why not (still cooling down, not
 * enough of your class's bar, nobody in reach to throw at or nothing to use
 * it on, or an ability not built yet), in which case nothing was spent.
 */
export type Use = 'cast' | Refusal | 'no target' | 'unbuilt';

/** Where an ability is used from: the right hand, where it faces as the gesture ends, and where you look. */
export interface Aim {
  readonly from: Vector3;
  readonly hand: Vector3;
  readonly gaze: Vector3;
}

export interface CombatFx {
  text: FloatingText;
  particles: Particles;
  shockwaves: Shockwaves;
}

const _hit: SegmentHit = { distance: 0, pointA: new Vector3(), pointB: new Vector3() };
const _sweep: SweepResult = { contact: 'body', point: new Vector3() };
const _blade: BladeResult = { zone: 'body', point: new Vector3() };
const _target = bladeTarget();
const _prevBase = new Vector3();
const _prevTip = new Vector3();
const _curBase = new Vector3();
const _curTip = new Vector3();
const _sBase = new Vector3();
const _sTip = new Vector3();
const _capA = new Vector3();
const _capB = new Vector3();
const _push = new Vector3();
const _feet = new Vector3();
const _vel = new Vector3();
/** What flies from a bandit when a blow lands. */
const HUMAN_BLOOD = 0x7a1812;
const _to = new Vector3();
const _p = new Vector3();
const _a = new Vector3();
const _b = new Vector3();

/** Stats for the run summary, the debug overlay and automated tests. */
export const combatStats = {
  swings: 0,
  hits: 0,
  crits: 0,
  kills: 0,
  blocks: 0,
  parries: 0,
  hurts: 0,
  dodges: 0,
  bashes: 0,
  slams: 0,
  reflects: 0,
  /** Your swings an enemy's guard stopped. */
  guarded: 0,
  guardBreaks: 0,
  /** Heroic Throw's axes that landed. */
  throws: 0,
  /** Heavy blows Shield Wall held. */
  walled: 0,
  /** Second enemies Sweeping Strikes hit. */
  swept: 0,
};

export function resetCombatStats(): void {
  for (const k of Object.keys(combatStats) as (keyof typeof combatStats)[]) combatStats[k] = 0;
}

/** Sword damage before multipliers: scales with tip speed between the two thresholds. */
export function swingDamage(tipSpeed: number): { damage: number; power: number } {
  const S = CONFIG.sword;
  const power = clamp01((tipSpeed - S.minHitSpeed) / (S.fullDamageSpeed - S.minHitSpeed));
  return { damage: S.minDamage + (S.maxDamage - S.minDamage) * power, power };
}

/**
 * Everything that deals damage. The player's side (sword, bash, ground slam,
 * War Cry) runs from `update`; the enemy side is called by enemies through
 * EnemyContext (`sweep`, `slam`, `shoot`) and by arrows (ArrowResolver).
 */
export class Combat implements ArrowResolver {
  readonly projectiles: Projectiles;
  /** Heroic Throw's axes in flight. */
  readonly axes: ThrownAxes;
  /** The ranger's bow, arrows, ward and traps: a ranger's only. */
  readonly ranger: RangerKit | null;
  private swinging = false;
  private slamCooldown = 0;
  private readonly defender: Defender;
  private readonly shieldInverse = new Matrix4();
  private readonly swordBase = new Vector3();
  private enemies: Enemy[] = [];

  constructor(
    private readonly player: Player,
    readonly fx: CombatFx,
    private readonly events: CombatEvents,
    parent: Object3D,
  ) {
    this.projectiles = new Projectiles(parent, player.ground);
    this.axes = new ThrownAxes(parent);
    this.ranger =
      player.class === 'ranger'
        ? new RangerKit(player, fx, { land: (e, d, head, at, push) => this.arrowLands(e, d, head, at, push), evade: (at) => this.evade(at), reflect: (a, label) => this.reflectArrow(a, label) }, parent)
        : null;
    const B = CONFIG.player.body;
    const S = CONFIG.shield;
    this.defender = {
      head: new Vector3(),
      headRadius: B.headRadius,
      torsoTop: new Vector3(),
      torsoBottom: new Vector3(),
      torsoRadius: B.torsoRadius,
      shieldInverse: null,
      shieldHalf: new Vector3(S.width / 2 + S.blockMargin, S.height / 2 + S.blockMargin, S.depth / 2 + S.blockMargin),
      swordBase: null,
      swordTip: new Vector3(),
      swordRadius: CONFIG.sword.bladeHalfWidth + CONFIG.sword.blockMargin,
    };
  }

  update(dt: number, enemies: Enemy[]): void {
    this.enemies = enemies;
    this.slamCooldown = Math.max(0, this.slamCooldown - dt);
    this.refreshDefender();
    this.updateSword(enemies);
    this.updateBash(enemies);
    this.updateGroundSlam(enemies);
    this.ranger?.update(dt, enemies);
    this.projectiles.update(dt, this);
    this.axes.update(dt, (enemy, at, dir, from) => this.axeLands(enemy, at, dir, from));
  }

  /** Snapshot the player's hurt volumes, shield and blade for this frame's enemy blows. */
  private refreshDefender(): void {
    const d = this.defender;
    const { player } = this;
    player.body(d.head, d.torsoTop, d.torsoBottom);
    const { shield, sword } = player;
    if (shield.canBlock && player.alive) {
      shield.board.updateWorldMatrix(true, false);
      d.shieldInverse = this.shieldInverse.copy(shield.board.matrixWorld).invert();
    } else d.shieldInverse = null;
    if (sword.tip.valid && player.alive) {
      d.swordBase = sword.base.worldNow(player.rig, this.swordBase);
      sword.tip.worldNow(player.rig, d.swordTip);
    } else d.swordBase = null;
  }

  // ================================================================ player → enemies

  /**
   * Sword vs enemies. The blade is a segment; between frames we sweep it
   * through a few interpolated sub-steps so a fast swing can't tunnel through
   * a body in one 72–90 Hz frame. Contact only counts during a committed
   * swing with the tip above a speed threshold (Sword.hot), and damage scales
   * with speed — you have to actually swing.
   * The head is its own sphere: hit it for a crit. A raised guard in the
   * blade's way stops it first.
   */
  private updateSword(enemies: Enemy[]): void {
    const { sword, rig } = this.player;
    if (!sword.tip.valid || !this.player.alive) return;
    const speed = sword.tipSpeed;
    const S = CONFIG.sword;
    const fast = sword.hot;
    if (fast && !this.swinging) {
      combatStats.swings++;
      sfx.whoosh(sword.tip.worldNow(rig, _p));
    }
    this.swinging = fast;
    if (!fast) return;

    sword.base.worldPrev(rig, _prevBase);
    sword.tip.worldPrev(rig, _prevTip);
    sword.base.worldNow(rig, _curBase);
    sword.tip.worldNow(rig, _curTip);

    for (const enemy of enemies) {
      if ((!enemy.hittable && !enemy.evading) || enemy.hitCooldown > 0) continue;
      const res = sweepBlade(_prevBase, _prevTip, _curBase, _curTip, S.bladeHalfWidth, S.sweepSamples, enemy.bladeTarget(_target), _blade);
      if (!res) continue;
      if (enemy.evading) {
        enemy.hitCooldown = S.perEnemyCooldown;
        this.evade(res.point);
        continue;
      }
      const { damage: base, power } = swingDamage(speed);
      _vel.copy(sword.tip.velocity).applyQuaternion(rig.quaternion);
      if (res.zone === 'guard' || enemy.guardCovers(res.point, _vel)) {
        this.guarded(enemy, power);
        continue;
      }
      _p.copy(res.point);
      const crit = res.zone === 'head';
      let damage = base * this.player.stats.damage;
      if (crit) damage *= enemy.def.critMultiplier;
      if (enemy.exposed > 0) damage *= S.exposedMultiplier;
      if (this.player.frenzy > 0) damage *= S.frenzyMultiplier;
      damage = Math.round(damage);

      // Push along the blade's horizontal travel (world space).
      _push.copy(sword.tip.velocity).applyQuaternion(rig.quaternion);
      _push.y = 0;
      if (_push.lengthSq() > 1e-6) _push.normalize().multiplyScalar(S.knockback * (0.4 + 0.6 * power));

      this.player.headPosition(_a);
      const killed = enemy.takeHit(damage, _push, { from: _a });
      combatStats.hits++;
      if (crit) combatStats.crits++;
      this.impactFx(enemy, _p, _push, crit || enemy.exposed > 0);
      this.fx.text.spawn(crit ? `${damage}!` : `${damage}`, _p, {
        color: crit ? '#ffd23a' : enemy.exposed > 0 ? '#9fd8ff' : '#ffffff',
        scale: crit ? 0.3 : 0.22,
      });
      sfx.hit(crit, _p);
      this.player.input.pulse('right', CONFIG.feel.hapticHit.intensity * (0.5 + 0.5 * power), CONFIG.feel.hapticHit.ms);
      this.player.addRage(CONFIG.rage.perHit);
      this.events.hitStop(CONFIG.feel.hitStop * (0.5 + power) * (crit ? 1.5 : 1));
      this.events.onEnemyHit(enemy, killed);
      if (killed) this.onKill(enemy);
      if (this.player.abilities.left('sweepingStrikes') > 0) this.sweepOn(enemy, damage, _push, enemies);
    }
  }

  /** Sweeping Strikes: the blow that landed on `hit` also strikes the nearest other enemy beside it, for a share of it. */
  private sweepOn(hit: Enemy, damage: number, push: Vector3, enemies: Enemy[]): void {
    const S = CONFIG.classes.warrior.abilities.sweepingStrikes;
    const other = sweptTo(hit, enemies, S.reach);
    if (!other) return;
    const dealt = Math.max(1, Math.round(damage * S.share));
    this.player.headPosition(_a);
    other.capsule(_capA, _capB);
    const at = _capA.lerp(_capB, 0.6);
    const killed = other.takeHit(dealt, push, { from: _a });
    combatStats.swept++;
    this.impactFx(other, at, push, false);
    this.fx.particles.burst('embers', at, 8, undefined, ABILITY_COLOUR.sweepingStrikes);
    this.fx.text.spawn(`${dealt}`, at, { color: '#ff9070', scale: 0.2 });
    this.events.onEnemyHit(other, killed);
    if (killed) this.onKill(other);
  }

  /** The class's own attack has the right hand (an arrow nocked): no gesture arms. */
  get busy(): boolean {
    return this.ranger?.drawing ?? false;
  }

  /** Nothing in flight or lying about, nothing on the string: after death, or a new run. */
  clear(): void {
    this.projectiles.clear();
    this.axes.clear();
    this.ranger?.clear();
  }

  /**
   * A / X: your class's button ability. The warrior's War Cry; the ranger's
   * Power Shot while an arrow is drawn, which says over the bow what came of it.
   */
  primary(enemies: Enemy[]): void {
    const { player, ranger } = this;
    if (player.class === 'warrior') this.warCry(enemies);
    else if (ranger?.drawing && player.can('powerShot') && player.alive) ranger.say(this.use('powerShot'));
  }

  /**
   * Use an ability by gesture (aimed from the right hand) or by its button:
   * spend its cost from your class's bar and start its cooldown, or say why
   * not and spend nothing.
   */
  use(ability: Ability, aim?: Aim): Use {
    const { player } = this;
    const refused = player.abilities.refuses(ability, player.resource);
    if (refused) return refused;
    const W = CONFIG.classes.warrior.abilities;
    switch (ability) {
      case 'heroicThrow': {
        if (!aim) return 'no target';
        const target = throwTarget(aim.from, [aim.hand, aim.gaze], this.enemies, (a, b) => player.ground.lineOfSight(a, b), W.heroicThrow);
        if (!target) return 'no target';
        this.axes.throw(aim.from, target);
        sfx.heroicThrow(aim.from);
        player.abilities.used(ability);
        break;
      }
      case 'shieldWall':
        player.abilities.used(ability, W.shieldWall.time);
        player.shield.flash(ABILITY_COLOUR.shieldWall);
        sfx.shieldWall();
        player.input.pulse('left', 0.8, 120);
        break;
      case 'sweepingStrikes':
        player.abilities.used(ability, W.sweepingStrikes.time);
        sfx.sweepingStrikes();
        break;
      case 'powerShot':
      case 'snareTrap': {
        if (!this.ranger) return 'unbuilt';
        const used = ability === 'powerShot' ? this.ranger.powerShot() : this.ranger.snareTrap();
        if (used !== 'cast') return used;
        player.abilities.used(ability);
        break;
      }
      default:
        return 'unbuilt';
    }
    player.resource -= ABILITY[ability].cost;
    return 'cast';
  }

  /** One of the ranger's arrows lands on `enemy` (ranger.ts): the blow as dealt, with the sword's feedback. */
  private arrowLands(enemy: Enemy, damage: number, head: boolean, at: Vector3, push: Vector3): boolean {
    this.player.headPosition(_a);
    const bright = head || enemy.exposed > 0;
    const exposed = enemy.exposed > 0;
    const killed = enemy.takeHit(damage, push, { from: _a });
    combatStats.hits++;
    if (head) combatStats.crits++;
    this.impactFx(enemy, at, push, bright);
    this.fx.text.spawn(head ? `${damage}!` : `${damage}`, at, { color: head ? '#ffd23a' : exposed ? '#9fd8ff' : '#ffffff', scale: head ? 0.3 : 0.22 });
    sfx.hit(head, at);
    if (head) this.events.hitStop(CONFIG.feel.hitStop * 1.2);
    this.events.onEnemyHit(enemy, killed);
    if (killed) this.onKill(enemy);
    return killed;
  }

  /** Heroic Throw's axe reaches the enemy it was thrown at: a blow, and a stagger. */
  private axeLands(enemy: Enemy, at: Vector3, dir: Vector3, from: Vector3): void {
    const T = CONFIG.classes.warrior.abilities.heroicThrow;
    const damage = Math.round(T.damage * this.player.stats.damage * (this.player.frenzy > 0 ? CONFIG.sword.frenzyMultiplier : 1));
    _push.copy(dir).setY(0);
    if (_push.lengthSq() > 1e-6) _push.normalize().multiplyScalar(2);
    const killed = enemy.takeHit(damage, _push, { from, ignorePoise: enemy.kind !== 'warden' });
    if (!killed) enemy.stagger(T.stagger);
    combatStats.throws++;
    this.impactFx(enemy, at, _push, true);
    this.fx.particles.burst('magic', at, 16, undefined, ABILITY_COLOUR.heroicThrow);
    this.fx.text.spawn(`${damage}`, at.clone().setY(at.y + 0.2), { color: '#80e0ff', scale: 0.24 });
    sfx.hit(false, at);
    this.events.hitStop(0.05);
    this.events.onEnemyHit(enemy, killed);
    if (killed) this.onKill(enemy);
  }

  /** Your blade met a raised guard: no damage, a clash on its weapon, and the guard gives a little. */
  private guarded(enemy: Enemy, power: number): void {
    const { sword, rig } = this.player;
    _push.copy(sword.tip.velocity).applyQuaternion(rig.quaternion).setY(0);
    if (_push.lengthSq() > 1e-6) _push.normalize().multiplyScalar(CONFIG.sword.guardKnockback * power);
    enemy.guardBlocked(_push);
    combatStats.guarded++;
    enemy.weaponSegment(_a, _b);
    closestSegmentSegment(_curBase, _curTip, _a, _b, _hit);
    const at = _hit.pointB;
    this.fx.particles.burst('sparks', at, 14, _vel.copy(_push).normalize().negate());
    this.fx.text.spawn('guarded', at.clone().setY(at.y + 0.2), { color: '#c0c0c0', scale: 0.15 });
    sfx.clash(at);
    const h = CONFIG.feel.hapticBlock;
    this.player.input.pulse('right', h.intensity, h.ms);
    this.events.hitStop(0.04);
  }

  /** A blow landed on an enemy walking home: nothing happens, and it says so. */
  private evade(at: Vector3): void {
    this.fx.text.spawn('Evade', at.clone().setY(at.y + 0.2), { color: '#c0c0c0', scale: 0.16 });
  }

  /** Red from bandits, dark ichor from the undead brute, bone chips from skeletons; sparks on crits. */
  private impactFx(enemy: Enemy, at: Vector3, dir: Vector3, bright: boolean): void {
    _vel.copy(dir).normalize();
    if (enemy.family === 'bandit') this.fx.particles.burst('blood', at, 8, _vel, HUMAN_BLOOD);
    else if (enemy.kind === 'brute') this.fx.particles.burst('blood', at, 10, _vel);
    else this.fx.particles.burst('bone', at, 6, _vel);
    if (bright) this.fx.particles.burst('sparks', at, 14, _vel);
  }

  /** A blow dealt outside Combat (a class prototype's spell) landed: the kill's count and effects, drops and hit-stop. */
  landed(enemy: Enemy, killed: boolean, hitStop = 0): void {
    if (hitStop > 0) this.events.hitStop(hitStop);
    this.events.onEnemyHit(enemy, killed);
    if (killed) this.onKill(enemy);
  }

  private onKill(enemy: Enemy): void {
    combatStats.kills++;
    enemy.capsule(_a, _b);
    _a.lerp(_b, 0.5);
    const bandit = enemy.family === 'bandit';
    sfx.death(_a, { big: enemy.kind === 'warden' || enemy.kind === 'brute', bones: !bandit });
    if (bandit) this.fx.particles.burst('blood', _a, 12, undefined, HUMAN_BLOOD);
    else if (enemy.kind === 'brute') this.fx.particles.burst('blood', _a, 24);
    else this.fx.particles.burst('bone', _a, enemy.kind === 'warden' ? 40 : 14);
    if (enemy.kind === 'warden') {
      this.fx.particles.burst('magic', _a, 60);
      this.fx.shockwaves.trigger(enemy.position, 5, 0x6ad0ff, 0.9);
    }
    this.fx.particles.burst('dust', enemy.position, 8);
  }

  /**
   * Shield bash: punch the shield into an enemy. Staggers anything but the
   * Warden; catching an enemy mid wind-up also leaves it exposed.
   */
  private updateBash(enemies: Enemy[]): void {
    const { shield, rig } = this.player;
    if (!shield.tracked || !this.player.alive) return;
    const S = CONFIG.shield;
    _vel.copy(shield.centre.velocity).applyQuaternion(rig.quaternion);
    if (_vel.length() < S.bashSpeed) return;
    shield.centre.worldNow(rig, _p);
    for (const enemy of enemies) {
      if ((!enemy.hittable && !enemy.evading) || enemy.bashCooldown > 0) continue;
      enemy.capsule(_capA, _capB);
      closestPointOnSegment(_p, _capA, _capB, _a);
      const d = _a.distanceTo(_p);
      if (d > enemy.def.radius + S.bashReach) continue;
      _to.subVectors(_a, _p).setY(0).normalize();
      if (_vel.dot(_to) < S.bashSpeed) continue;

      enemy.bashCooldown = S.bashCooldown;
      if (enemy.evading) {
        this.evade(_a);
        continue;
      }
      const windingUp = enemy.attacking && enemy.phase === 'windup';
      // Bashing a raised guard knocks it aside and leaves the enemy open, even the Warden.
      const broke = enemy.guarding;
      if (broke) {
        enemy.dropGuard();
        combatStats.guardBreaks++;
      }
      _push.copy(_to).multiplyScalar(S.bashKnockback);
      const killed = enemy.takeHit(Math.round(S.bashDamage * this.player.stats.damage), _push, { from: _p, ignorePoise: enemy.kind !== 'warden' });
      // A steady brute (just out of a stagger) shrugs the bash off and keeps swinging.
      const interrupted = windingUp && !killed && !enemy.attacking;
      if (!killed && broke) enemy.expose(enemy.def.exposedTime * 0.7);
      else if (interrupted && enemy.kind !== 'warden') enemy.expose(enemy.def.exposedTime * 0.7);
      combatStats.bashes++;
      const label = broke ? 'GUARD BREAK' : interrupted ? 'INTERRUPT' : 'BASH';
      this.fx.text.spawn(label, _a.clone().setY(_a.y + 0.3), { color: '#ffb060', scale: 0.16 });
      this.fx.particles.burst('dust', _a, 6);
      sfx.bash(_a);
      this.player.input.pulse('left', 1, 80);
      this.player.addRage(CONFIG.rage.perBash);
      this.events.hitStop(0.05);
      this.events.onEnemyHit(enemy, killed);
      if (killed) this.onKill(enemy);
    }
  }

  /** Earthshaker: drive the sword tip into the floor, fast, with enough rage, once your level has brought it. */
  private updateGroundSlam(enemies: Enemy[]): void {
    const G = CONFIG.groundSlam;
    const { sword, rig } = this.player;
    if (!this.player.can('earthshaker') || !sword.tip.valid || !this.player.alive || this.slamCooldown > 0 || this.player.rage < G.cost) return;
    sword.tip.worldNow(rig, _p);
    _vel.copy(sword.tip.velocity).applyQuaternion(rig.quaternion);
    const floor = this.player.ground.heightAt(_p.x, _p.z);
    if (_p.y - floor > G.floorY || _vel.y > -G.minDownSpeed) return;

    this.slamCooldown = G.cooldown;
    this.player.rage -= G.cost;
    combatStats.slams++;
    _p.y = floor;
    for (const enemy of enemies) {
      if (!enemy.hittable && !enemy.evading) continue;
      _push.subVectors(enemy.position, _p).setY(0);
      const d = _push.length();
      if (d > G.radius + enemy.def.radius) continue;
      if (enemy.evading) {
        this.evade(_a.copy(enemy.position).setY(enemy.position.y + 1.5));
        continue;
      }
      const falloff = 1 - 0.5 * Math.min(1, d / G.radius);
      _push.normalize().multiplyScalar(G.knockback * falloff);
      const damage = Math.round(G.damage * falloff * this.player.stats.damage * (this.player.frenzy > 0 ? CONFIG.sword.frenzyMultiplier : 1));
      const killed = enemy.takeHit(damage, _push, { from: _p, ignorePoise: enemy.kind !== 'warden' });
      if (!killed) enemy.stagger(G.stagger);
      this.fx.text.spawn(`${damage}`, enemy.position.clone().setY(enemy.position.y + 1.7), { color: '#ffb020' });
      this.events.onEnemyHit(enemy, killed);
      if (killed) this.onKill(enemy);
    }
    this.fx.shockwaves.trigger(_p, G.radius, 0xff9a30, 0.35);
    this.fx.particles.burst('dust', _p, 18);
    this.fx.particles.burst('embers', _p, 24);
    this.fx.particles.burst('sparks', _p.clone().setY(_p.y + 0.05), 16);
    this.fx.text.spawn('EARTHSHAKER', _p.clone().setY(_p.y + 1.2), { color: '#ffb020', scale: 0.2 });
    sfx.groundSlam(_p);
    this.player.input.pulse('right', 1, 220);
    this.events.hitStop(0.1);
  }

  /** War Cry: spend rage, blast nearby enemies back and stagger them, then fight in a frenzy. Once your level has brought it. */
  warCry(enemies: Enemy[]): boolean {
    const A = CONFIG.warCry;
    const player = this.player;
    if (!player.can('warCry') || !player.alive || player.rage < A.cost) return false;
    const damage = Math.round(A.damage * player.stats.damage);
    player.rage -= A.cost;
    player.frenzy = A.frenzyTime;
    player.feetPosition(_feet);
    for (const enemy of enemies) {
      if (!enemy.hittable && !enemy.evading) continue;
      _push.subVectors(enemy.position, _feet).setY(0);
      const d = _push.length();
      if (d > A.radius) continue;
      if (enemy.evading) {
        this.evade(_a.copy(enemy.position).setY(enemy.position.y + 1.5));
        continue;
      }
      _push.normalize().multiplyScalar(A.knockback * (1 - (d / A.radius) * 0.5));
      const killed = enemy.takeHit(damage, _push, { from: _feet });
      if (!killed) enemy.stagger(A.stagger);
      this.fx.text.spawn(`${damage}`, enemy.position.clone().setY(enemy.position.y + 1.7), { color: '#ffb020' });
      this.events.onEnemyHit(enemy, killed);
      if (killed) this.onKill(enemy);
    }
    this.fx.shockwaves.trigger(_feet, A.radius, 0xffb020);
    this.fx.particles.burst('embers', _feet, 30);
    sfx.warCry();
    player.input.pulse('left', 1, 200);
    player.input.pulse('right', 1, 200);
    return true;
  }

  // ================================================================ enemies → player

  /**
   * One frame of an enemy's swing (EnemyContext.sweep). The weapon's motion is
   * swept against shield, sword and body; the first contact decides it.
   * Shield or sword moving *into* the blow at impact turns a block into a parry.
   */
  sweep(enemy: Enemy, attack: AttackConfig, prevBase: Vector3, prevTip: Vector3, base: Vector3, tip: Vector3): StrikeOutcome | null {
    const player = this.player;
    if (!player.alive) return null;
    const res = sweepStrike(prevBase, prevTip, base, tip, enemy.weapon.radius, 6, this.defender, attack.blockable, _sweep);
    if (!res) return null;

    if (res.contact === 'body') {
      if (player.invulnerable) {
        combatStats.dodges++;
        this.fx.text.spawn('dodge', res.point, { color: '#9a9a9a', scale: 0.14 });
        return 'dodged';
      }
      this.hurtPlayer(attack.damage, enemy);
      this.fx.particles.burst('sparks', res.point, 6, undefined, 0xff4020);
      return 'hit';
    }

    // Blocked with the shield or the sword. Parry if it moved into the blow:
    // toward the attacker, or against the blade's travel (whichever is more).
    const onShield = res.contact === 'shield';
    enemy.capsule(_a, _b);
    _to.subVectors(_a, this.defender.torsoTop).setY(0).normalize();
    let parry: boolean;
    if (onShield) {
      _vel.copy(player.shield.centre.velocity).applyQuaternion(player.rig.quaternion);
      _p.subVectors(tip, prevTip).normalize();
      parry = Math.max(_vel.dot(_to), -_vel.dot(_p)) >= CONFIG.shield.parrySpeed;
    } else {
      parry = player.sword.tipSpeed >= CONFIG.sword.parrySpeed;
    }
    const at = res.point;
    if (parry) {
      combatStats.parries++;
      this.fx.text.spawn('PARRY', at.clone().setY(at.y + 0.25), { color: '#7fd4ff', scale: 0.2 });
      this.fx.particles.burst('sparks', at, 26, _to.negate(), 0xbfe8ff);
      sfx.parry();
      player.addRage(CONFIG.rage.perParry);
      this.events.hitStop(0.12);
      if (onShield) player.shield.flash(0x9fdcff);
      player.input.pulse(onShield ? 'left' : 'right', 1, 120);
      return 'parried';
    }
    combatStats.blocks++;
    this.fx.particles.burst('sparks', at, 12, _to.negate());
    player.addRage(CONFIG.rage.perBlock);
    const h = CONFIG.feel.hapticBlock;
    player.input.pulse(onShield ? 'left' : 'right', h.intensity, h.ms);
    const walled = player.abilities.left('shieldWall') > 0;
    const held = blocked(attack, walled);
    if (held.breaks) {
      // A heavy blow: blocking beats taking it full, but it still hurts and numbs the arm.
      this.fx.text.spawn('GUARD BREAK', at.clone().setY(at.y + 0.25), { color: '#ff8040', scale: 0.17 });
      sfx.guardBreak();
      if (onShield) {
        player.shield.numb = CONFIG.shield.numbTime;
        player.shield.flash(0xff6030);
      }
      this.hurtPlayer(held.chip, enemy, false);
      return 'hit';
    }
    if (walled && attack.guardBreak) {
      // Shield Wall holds even a heavy blow: nothing through, and the arm stays up.
      combatStats.walled++;
      this.fx.text.spawn('SHIELD WALL', at.clone().setY(at.y + 0.25), { color: '#ffc84a', scale: 0.17 });
      if (onShield) player.shield.flash(ABILITY_COLOUR.shieldWall);
      sfx.block(at);
      return 'blocked';
    }
    this.fx.text.spawn('block', at.clone().setY(at.y + 0.2), { color: '#c0c0c0', scale: 0.15 });
    if (onShield) {
      player.shield.flash();
      sfx.block(at);
    } else sfx.clash(at);
    return 'blocked';
  }

  /** A slam lands (EnemyContext.slam): unblockable, so only distance (or a dash) saves you. */
  slam(enemy: Enemy, attack: AttackConfig, at: Vector3): void {
    const r = attack.radius ?? 1.5;
    this.fx.shockwaves.trigger(at, r, 0xff3a10, 0.45);
    this.fx.particles.burst('dust', at, 22, undefined, 0x5a5048);
    this.fx.particles.burst('sparks', at.clone().setY(at.y + 0.1), 10, undefined, 0xff6020);
    sfx.slam(at);
    const player = this.player;
    player.feetPosition(_feet);
    const d = _feet.distanceTo(at);
    if (d < 5) {
      // You feel it through the floor either way.
      const k = 1 - d / 5;
      player.input.pulse('left', 0.4 + 0.6 * k, 150);
      player.input.pulse('right', 0.4 + 0.6 * k, 150);
    }
    if (!player.alive || d > r) return;
    if (player.invulnerable) {
      combatStats.dodges++;
      this.fx.text.spawn('dodge', _feet.clone().setY(_feet.y + 1.2), { color: '#9a9a9a', scale: 0.14 });
      return;
    }
    this.hurtPlayer(attack.damage, enemy);
  }

  /** An archer looses (EnemyContext.shoot): aimed at the chest where the player is now. */
  shoot(enemy: Enemy, from: Vector3, damage: number): void {
    this.player.headPosition(_p);
    _p.y -= CONFIG.arrow.aimBelowHead;
    this.projectiles.fire(enemy, from, _p, damage);
    sfx.arrowLoose(from);
  }

  /** A blow from `from` lands on you: your armour cuts it by its share against the attacker's level. */
  private hurtPlayer(amount: number, from: Enemy | null, flinch = true): void {
    combatStats.hurts++;
    this.player.damage(Math.round(amount * (1 - armourCut(this.player.stats.armour, from?.level ?? 1))));
    sfx.hurt();
    if (flinch) this.events.onPlayerHurt();
  }

  // ================================================================ arrows (ArrowResolver)

  playerContact(prev: Vector3, pos: Vector3, arrow: Arrow): ArrowContact | null {
    const player = this.player;
    const d = this.defender;
    if (!player.alive) return null;
    const R = CONFIG.arrow.hitRadius;
    const warded = this.ranger?.arrowContact(prev, pos, arrow);
    if (warded) return warded;

    if (d.shieldInverse) {
      _a.copy(prev).applyMatrix4(d.shieldInverse);
      _b.copy(pos).applyMatrix4(d.shieldInverse);
      _p.copy(d.shieldHalf).addScalar(R);
      if (segmentIntersectsBox(_a, _b, _p)) {
        _vel.copy(player.shield.centre.velocity).applyQuaternion(player.rig.quaternion);
        _to.copy(arrow.vel).normalize().negate();
        if (_vel.dot(_to) >= CONFIG.shield.parrySpeed) {
          this.reflectArrow(arrow, 'PARRY');
          player.input.pulse('left', 1, 90);
          return 'parried';
        }
        combatStats.blocks++;
        this.projectiles.attach(arrow, player.shield.board);
        player.shield.flash();
        player.addRage(CONFIG.rage.perBlock * 0.5);
        player.input.pulse('left', 0.7, 60);
        sfx.arrowThunk(pos);
        return 'blocked';
      }
    }
    if (d.swordBase && player.sword.tipSpeed < CONFIG.sword.minHitSpeed) {
      // A blade held still across the arrow's path stops it, but only a swipe sends it back.
      closestSegmentSegment(prev, pos, d.swordBase, d.swordTip, _hit);
      if (_hit.distance <= d.swordRadius + R) {
        combatStats.blocks++;
        this.fx.particles.burst('sparks', _hit.pointB, 10);
        sfx.clash(_hit.pointB);
        player.addRage(CONFIG.rage.perBlock * 0.5);
        player.input.pulse('right', 0.7, 60);
        return 'glanced';
      }
    } else if (d.swordBase) {
      // Both blade and arrow move several cm a frame: step them through the
      // frame together so a well-timed swipe can't tunnel past the arrow.
      const { sword, rig } = player;
      sword.base.worldPrev(rig, _prevBase);
      sword.tip.worldPrev(rig, _prevTip);
      for (let i = 1; i <= 5; i++) {
        const t = i / 5;
        _sBase.lerpVectors(_prevBase, d.swordBase, t);
        _sTip.lerpVectors(_prevTip, d.swordTip, t);
        _a.lerpVectors(prev, pos, t);
        closestPointOnSegment(_a, _sBase, _sTip, _b);
        if (_b.distanceTo(_a) <= d.swordRadius + R + 0.06) {
          this.reflectArrow(arrow, 'DEFLECT');
          player.input.pulse('right', 0.8, 60);
          return 'deflected';
        }
      }
    }
    closestPointOnSegment(d.head, prev, pos, _p);
    const headHit = _p.distanceTo(d.head) <= d.headRadius + R;
    closestSegmentSegment(prev, pos, d.torsoTop, d.torsoBottom, _hit);
    if (headHit || _hit.distance <= d.torsoRadius + R) {
      if (player.invulnerable) return 'dodged';
      this.hurtPlayer(arrow.damage, arrow.owner);
      sfx.arrowThunk();
      return 'hit';
    }
    return null;
  }

  private reflectArrow(arrow: Arrow, label: string): void {
    combatStats.reflects++;
    combatStats.parries++;
    const owner = arrow.owner && arrow.owner.alive ? arrow.owner : null;
    if (owner) owner.capsule(_a, _b);
    this.projectiles.reflect(arrow, owner ? _a.lerp(_b, 0.6) : null);
    this.fx.text.spawn(label, arrow.pos.clone().setY(arrow.pos.y + 0.2), { color: '#7fd4ff', scale: 0.17 });
    this.fx.particles.burst('sparks', arrow.pos, 12, undefined, 0xbfe8ff);
    sfx.clash(arrow.pos);
    this.player.addRage(CONFIG.rage.perParry * 0.5);
  }

  enemyContact(prev: Vector3, pos: Vector3): Enemy | null {
    for (const enemy of this.enemies) {
      if (!enemy.hittable && !enemy.evading) continue;
      enemy.capsule(_a, _b);
      closestSegmentSegment(prev, pos, _a, _b, _hit);
      if (_hit.distance > enemy.def.radius + CONFIG.arrow.hitRadius) continue;
      if (enemy.evading) {
        this.evade(_hit.pointB);
        return enemy;
      }
      _push.subVectors(pos, prev).setY(0).normalize().multiplyScalar(2);
      const damage = Math.round(CONFIG.arrow.reflectDamage * this.player.stats.damage);
      const killed = enemy.takeHit(damage, _push, { from: prev, ignorePoise: enemy.kind !== 'warden' });
      if (!killed) enemy.expose(enemy.def.exposedTime);
      this.fx.text.spawn(`${damage}!`, _hit.pointB, { color: '#7fd4ff', scale: 0.26 });
      this.impactFx(enemy, _hit.pointB, _push, true);
      sfx.hit(true, _hit.pointB);
      this.events.onEnemyHit(enemy, killed);
      if (killed) this.onKill(enemy);
      return enemy;
    }
    return null;
  }
}
