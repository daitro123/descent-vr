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
import { assist, type Bolt, Bolts } from './bolts';
import { afterBlock, BOLT_CHARGES, type BoltCharge, boltDamage, type BoltShape, chainFrom, within } from './mage';
import { Blizzard, blizzardAt } from './blizzard';
import { type DotKind, Dots } from './dots';
import { IceBarrier } from './iceBarrier';
import { RangerKit } from './ranger';
import { type BladeResult, bladeTarget, type Defender, sweepBlade, sweepStrike, type SweepResult } from './strike';
import { ThrownAxes } from './thrownAxes';
import type { Handedness } from '../player/input';

export interface CombatEvents {
  onEnemyHit(enemy: Enemy, killed: boolean): void;
  onPlayerHurt(): void;
  hitStop(seconds: number): void;
}

/**
 * What came of using an ability: cast, or why not (still cooling down, not
 * enough of your class's bar, nobody in reach to throw at or nothing to use
 * it on, already waiting on your next attack, or an ability not built yet),
 * in which case nothing was spent.
 */
export type Use = 'cast' | Refusal | 'no target' | 'waiting' | 'unbuilt';

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
/** The warrior's tier-3 talent abilities' numbers. */
const MORTAL_STRIKE = CONFIG.talents.trees.warrior.arms.mortalStrike;
const SHIELD_SLAM = CONFIG.talents.trees.warrior.protection.shieldSlam;
/** The ranger's and the mage's trees' numbers. */
const MARKSMANSHIP = CONFIG.talents.trees.ranger.marksmanship;
const FIRE = CONFIG.talents.trees.mage.fire;
const FROST = CONFIG.talents.trees.mage.frost;
/** What flies from a bandit when a blow lands. */
const HUMAN_BLOOD = 0x7a1812;
/** What flies from the living that aren't people: a leech's the blood it drank, darkened; an adder's. */
const CREATURE_BLOOD: Partial<Record<Enemy['family'], number>> = { leech: 0x3a0e0c, snake: 0x6a1410 };

/** The blood that flies from `enemy`, or null for the dead, who are bones (bar the brute's dark ichor, the default). */
function bloodOf(enemy: Enemy): number | undefined | null {
  if (enemy.body === 'human') return HUMAN_BLOOD;
  if (enemy.body === 'crawler') return CREATURE_BLOOD[enemy.family];
  return enemy.kind === 'brute' ? undefined : null;
}
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
  /** Sword hits Mortal Strike doubled. */
  mortalStrikes: 0,
  /** Shield bashes Shield Slam turned into a stun. */
  shieldSlams: 0,
  /** The mage's bolts thrown, and those that landed on an enemy. */
  bolts: 0,
  boltHits: 0,
  /** Enemies Frost Nova froze. */
  frozen: 0,
  /** Enemies a Fireball's burst reached besides the one it hit. */
  burnt: 0,
  /** Enemies a Frostbolt slowed. */
  chilled: 0,
  /** Enemies Chain Lightning arced on to. */
  arcs: 0,
  /** Blows Blizzard's ice dealt, one an enemy a tick. */
  blizzardHits: 0,
  /** Ticks of a bleed or a burn, and the damage they dealt. */
  dotTicks: 0,
  dotDamage: 0,
  /** Pyroblasts thrown, and those that landed on an enemy. */
  pyroblasts: 0,
  pyroblastHits: 0,
  /** Enemies Frostbite froze. */
  frostbitten: 0,
  /** Damage Ice Barrier took for you. */
  absorbed: 0,
  /** Attackers Frozen Ward slowed. */
  wardSlowed: 0,
  /** Mana Master of Elements gave back. */
  manaBack: 0,
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
  /** The mage's bolts in flight. */
  readonly bolts: Bolts;
  /** The mage's Blizzard, falling or not. */
  readonly blizzard: Blizzard;
  /** The ranger's bow, arrows, ward and traps: a ranger's only. */
  readonly ranger: RangerKit | null;
  /** Bleeds and burns on enemies (Serrated Tips, Ignite, Pyroblast). */
  readonly dots = new Dots<Enemy>();
  /** Ice Barrier's shell round you, up or not. */
  readonly barrier: IceBarrier;
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
    this.bolts = new Bolts(parent);
    this.blizzard = new Blizzard(parent);
    this.barrier = new IceBarrier(parent);
    this.ranger =
      player.klass === 'ranger'
        ? new RangerKit(
            player,
            fx,
            {
              land: (e, d, head, at, push) => this.arrowLands(e, d, head, at, push),
              bleed: (e, d, s) => this.dots.add(e, 'bleed', d, s),
              evade: (at) => this.evade(at),
              reflect: (a, label) => this.reflectArrow(a, label),
            },
            parent,
          )
        : null;
    const B = CONFIG.player.body;
    const S = CONFIG.shield;
    this.defender = {
      head: new Vector3(),
      headRadius: B.headRadius,
      torsoTop: new Vector3(),
      torsoBottom: new Vector3(),
      torsoRadius: B.torsoRadius,
      legsBottom: new Vector3(),
      legsRadius: B.legsRadius,
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
    this.bolts.update(dt, enemies, this.player.ground, this.fx.particles, (bolt, enemy, at, crit) => this.boltLands(bolt, enemy, at, crit));
    this.blizzard.update(dt, enemies, (caught) => this.blizzardTick(caught), this.fx.particles);
    this.dots.update(dt, (enemy, kind, dealt) => this.dotTick(enemy, kind, dealt));
    this.barrier.update(dt, this.player.feetPosition(_feet));
  }

  /** Snapshot the player's hurt volumes, shield and blade for this frame's enemy blows. */
  private refreshDefender(): void {
    const d = this.defender;
    const { player } = this;
    player.body(d.head, d.torsoTop, d.torsoBottom);
    player.feetPosition(d.legsBottom).y += CONFIG.player.body.ankles;
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
      const talents = this.player.stats.talents;
      // Mortal Strike armed: this blow deals double, and the enemy can't heal for a while.
      const mortal = this.player.abilities.left('mortalStrike') > 0;
      let damage = base * this.player.stats.damage;
      if (crit) damage *= enemy.def.critMultiplier * (1 + talents.headHit);
      if (power >= 1) damage *= 1 + talents.fullSwing;
      if (enemy.exposed > 0) damage *= S.exposedMultiplier;
      if (this.player.frenzy > 0) damage *= S.frenzyMultiplier;
      if (mortal) damage *= MORTAL_STRIKE.multiplier;
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
      if (mortal) this.mortalStrike(enemy, _p, killed);
      this.player.input.pulse('right', CONFIG.feel.hapticHit.intensity * (0.5 + 0.5 * power), CONFIG.feel.hapticHit.ms);
      this.player.addRage(CONFIG.rage.perHit + talents.hitRage);
      this.events.hitStop(CONFIG.feel.hitStop * (0.5 + power) * (crit ? 1.5 : 1));
      this.events.onEnemyHit(enemy, killed);
      if (killed) this.onKill(enemy);
      if (this.player.abilities.left('sweepingStrikes') > 0) this.sweepOn(enemy, damage, _push, enemies);
    }
  }

  /** Mortal Strike's blow landed on `enemy` at `at`: the charge is spent, and it can't heal for a while. */
  private mortalStrike(enemy: Enemy, at: Vector3, killed: boolean): void {
    this.player.abilities.end('mortalStrike');
    combatStats.mortalStrikes++;
    if (!killed) enemy.wound(MORTAL_STRIKE.noHeal);
    this.fx.particles.burst('blood', at, 14, undefined, ABILITY_COLOUR.mortalStrike);
    this.fx.text.spawn('MORTAL STRIKE', at.clone().setY(at.y + 0.3), { color: '#ff6070', scale: 0.16 });
    sfx.mortalHit(at);
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
    this.bolts.clear();
    this.blizzard.clear();
    this.dots.clear();
    this.barrier.clear();
    this.ranger?.clear();
  }

  /**
   * A / X: the War Cry, or Frost Nova, whichever your class's level has
   * brought (neither, before level 2). Frost Nova says why it can't be used
   * over your hands, with a dull buzz, as a gesture does. The ranger's is
   * Power Shot while an arrow is drawn, which says over the bow what came of it.
   */
  press(enemies: Enemy[]): void {
    const { player, ranger } = this;
    if (ranger) {
      if (ranger.drawing && player.can('powerShot') && player.alive) ranger.say(this.use('powerShot'));
      return;
    }
    if (!player.can('frostNova')) {
      this.warCry(enemies);
      return;
    }
    if (!player.alive) return;
    const use = this.use('frostNova');
    if (use === 'cast') return;
    const why = use === 'poor' ? `not enough ${player.bar.kind}` : `ready in ${Math.ceil(player.abilities.cooldown('frostNova'))} s`;
    player.headPosition(_p);
    player.camera.getWorldDirection(_to);
    _p.addScaledVector(_to.setY(0).normalize(), 0.6).setY(_p.y - 0.35);
    this.fx.text.spawn(`${ABILITY.frostNova.name}: ${why}`, _p, { color: '#8090a0', scale: 0.08, life: 1.6 });
    const B = CONFIG.gestures.buzz.dull;
    player.input.pulse('left', B.intensity, B.ms);
    player.input.pulse('right', B.intensity, B.ms);
    sfx.gestureDull();
  }

  /**
   * Use an ability, aimed from the right hand where it points somewhere:
   * spend its cost from your class's bar and start its cooldown, or say why
   * not and spend nothing.
   */
  use(ability: Ability, aim?: Aim): Use {
    const { player } = this;
    const cost = player.costOf(ability);
    const refused = player.abilities.refuses(ability, player.resource, cost);
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
        player.abilities.used(ability, player.lastsOf(ability, W.shieldWall.time));
        player.shield.flash(ABILITY_COLOUR.shieldWall);
        sfx.shieldWall();
        player.input.pulse('left', 0.8, 120);
        break;
      case 'sweepingStrikes':
        player.abilities.used(ability, player.lastsOf(ability, W.sweepingStrikes.time));
        sfx.sweepingStrikes();
        break;
      // The warrior's tier-3 talents arm the next sword hit or shield bash, which spends the charge within its window.
      case 'mortalStrike':
        player.abilities.used(ability, MORTAL_STRIKE.window);
        sfx.mortalStrike();
        player.input.pulse('right', 0.8, 120);
        break;
      case 'shieldSlam':
        player.abilities.used(ability, SHIELD_SLAM.window);
        player.shield.flash(ABILITY_COLOUR.shieldSlam);
        sfx.shieldSlam();
        player.input.pulse('left', 0.8, 120);
        break;
      case 'frostNova':
        this.frostNova();
        player.abilities.used(ability);
        break;
      case 'fireball':
      case 'frostbolt':
      case 'chainLightning':
      case 'pyroblast':
        // The next bolt you charge takes it, until it's thrown. One waits at a time.
        if (player.abilities.waitingOn(BOLT_CHARGES)) return 'waiting';
        player.abilities.prime(ability);
        player.abilities.used(ability);
        if (ability === 'fireball') sfx.fireballReady();
        else if (ability === 'frostbolt') sfx.frostboltReady();
        else if (ability === 'chainLightning') sfx.chainLightningReady();
        else sfx.pyroblastReady();
        break;
      case 'iceBarrier':
        this.iceBarrier();
        player.abilities.used(ability, FROST.iceBarrier.time);
        break;
      case 'blizzard':
        // Ice falls where the right hand points, over a wider circle with Arctic Reach.
        if (!aim) return 'no target';
        blizzardAt(aim.from, aim.hand, this.enemies, player.ground, _p);
        this.blizzard.start(_p, this.fx.particles, CONFIG.classes.mage.abilities.blizzard.radius + player.stats.talents.frostReach);
        player.abilities.used(ability);
        sfx.blizzard(_p);
        this.fx.text.spawn('BLIZZARD', _a.copy(_p).setY(_p.y + 1.4), { color: '#e4f4ff', scale: 0.18 });
        break;
      case 'powerShot':
      case 'snareTrap':
      case 'volley':
      case 'scatter':
      case 'huntersMark':
      case 'trueshot':
      case 'explosiveTrap': {
        const { ranger } = this;
        if (!ranger) return 'unbuilt';
        let used: Use;
        if (ability === 'powerShot') used = ranger.powerShot();
        else if (ability === 'snareTrap') used = ranger.snareTrap();
        else if (ability === 'volley') used = ranger.volley();
        else if (ability === 'scatter') used = ranger.scatter(this.enemies, aim ? aim.gaze : player.camera.getWorldDirection(_to));
        else if (ability === 'trueshot') used = ranger.trueshot();
        else if (ability === 'explosiveTrap') used = ranger.explosiveTrap();
        else used = aim ? ranger.huntersMark(aim, this.enemies, (a, b) => player.ground.lineOfSight(a, b)) : 'no target';
        if (used !== 'cast') return used;
        // Trueshot lasts: every arrow loosed while it does bends.
        player.abilities.used(ability, ability === 'trueshot' ? MARKSMANSHIP.trueshot.time : 0);
        break;
      }
      default:
        return 'unbuilt';
    }
    player.resource -= cost;
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

  /**
   * Frost Nova: frost bursts from you, and every enemy within reach takes a
   * little and is frozen. The blow lands first, since any hit breaks a freeze.
   */
  private frostNova(): void {
    const N = CONFIG.classes.mage.abilities.frostNova;
    const { player } = this;
    player.feetPosition(_feet);
    const colour = ABILITY_COLOUR.frostNova!;
    // Arctic Reach: further.
    const radius = N.radius + player.stats.talents.frostReach;
    for (const enemy of within(_feet, radius, this.enemies)) {
      const killed = enemy.takeHit(Math.round(N.damage * player.stats.damage), _push.set(0, 0, 0), { from: _feet });
      enemy.capsule(_a, _b);
      _a.lerp(_b, 0.5);
      if (!killed && enemy.afflict('frozen', N.freeze) > 0) combatStats.frozen++;
      this.fx.particles.burst('magic', _a, 14, undefined, colour);
      this.events.onEnemyHit(enemy, killed);
      if (killed) this.onKill(enemy);
    }
    for (const enemy of this.enemies) {
      if (enemy.evading && Math.hypot(enemy.position.x - _feet.x, enemy.position.z - _feet.z) <= radius) this.evade(_a.copy(enemy.position).setY(enemy.position.y + 1.5));
    }
    this.fx.shockwaves.trigger(_feet, radius, colour, 0.4);
    this.fx.particles.burst('magic', _p.copy(_feet).setY(_feet.y + 0.3), 40, undefined, colour);
    this.fx.text.spawn('FROST NOVA', _p.copy(_feet).setY(_feet.y + 1.2), { color: '#bfe8ff', scale: 0.18 });
    sfx.frostNova();
    player.input.pulse('left', 0.9, 160);
    player.input.pulse('right', 0.9, 160);
  }

  /**
   * A bolt leaves your `hand` from `from` along `dir` (bent onto the chest of
   * whoever the aim assist finds), shaped by the throw and as strong as its
   * charge was full. A Fireball, Frostbolt, Chain Lightning or Pyroblast
   * waiting on it goes with it: a Pyroblast is a huge slow orb whatever the
   * throw, as strong as its own charge was full.
   */
  castBolt(hand: Handedness, from: Vector3, dir: Vector3, shape: BoltShape, fraction: number, colour: number): Bolt {
    const target = assist(from, dir, this.enemies, CONFIG.mage.throw.assistDeg);
    const charge = this.player.abilities.waitingOn(BOLT_CHARGES) as BoltCharge | null;
    if (charge) this.player.abilities.spend(charge);
    const fire = charge === 'fireball';
    const pyro = charge === 'pyroblast';
    const F = CONFIG.classes.mage.abilities.fireball;
    const P = FIRE.pyroblast;
    const talents = this.player.stats.talents;
    combatStats.bolts++;
    combatStats.swings++;
    sfx.whoosh(from);
    if (fire) sfx.fireball(from);
    else if (charge === 'frostbolt') sfx.frostbolt(from);
    else if (charge === 'chainLightning') sfx.chainLightningLoose(from);
    else if (pyro) sfx.pyroblast(from);
    else sfx.arrowLoose(from);
    let damage = boltDamage(fraction);
    if (fire) damage *= F.multiplier;
    // Ice Shards: a Frostbolt deals more.
    if (charge === 'frostbolt') damage *= 1 + talents.frostDamage;
    if (pyro) {
      damage *= P.damage / CONFIG.mage.bolt.maxDamage;
      combatStats.pyroblasts++;
    }
    return this.bolts.fire({
      pos: from.clone(),
      vel: dir.clone().multiplyScalar(pyro ? P.speed : shape.speed),
      radius: pyro ? P.radius : shape.radius * (fire ? 1.3 : 1),
      damage,
      color: charge ? ABILITY_COLOUR[charge]! : colour,
      hand,
      target,
      charge,
    });
  }

  /**
   * A bolt lands on an enemy (its head a crit, more with Critical Mass), or
   * on nothing; a Fireball bursts either way. A Frostbolt slows the enemy it
   * hits once the blow has landed (and with Frostbite may freeze it); Chain
   * Lightning arcs on from it; a Pyroblast sets it burning. A fire hit burns
   * with Ignite, and a fire head hit gives mana back with Master of Elements.
   */
  private boltLands(bolt: Bolt, enemy: Enemy | null, at: Vector3, crit: boolean): void {
    const { player } = this;
    const talents = player.stats.talents;
    const fire = bolt.charge === 'fireball' || bolt.charge === 'pyroblast';
    if (enemy?.evading) {
      this.evade(at);
      return;
    }
    if (enemy) {
      const wasSlowed = enemy.slowness > 0;
      let damage = bolt.damage * player.stats.damage;
      if (crit) damage *= enemy.def.critMultiplier + talents.headMultiplier;
      if (enemy.exposed > 0) damage *= CONFIG.mage.bolt.exposedMultiplier;
      damage = Math.round(damage);
      _push.copy(bolt.vel).setY(0);
      if (_push.lengthSq() > 1e-6) _push.normalize().multiplyScalar(CONFIG.mage.bolt.knockback);
      const killed = enemy.takeHit(damage, _push, { from: bolt.from });
      combatStats.hits++;
      combatStats.boltHits++;
      if (crit) combatStats.crits++;
      this.fx.particles.burst('magic', at, 16, undefined, bolt.color);
      if (crit) this.fx.particles.burst('sparks', at, 12, undefined, 0xbfe8ff);
      const colour = fire ? '#ffb070' : bolt.charge === 'frostbolt' ? '#8fd0ff' : bolt.charge === 'chainLightning' ? '#d8c8ff' : '#bcdcff';
      this.fx.text.spawn(crit ? `${damage}!` : `${damage}`, at, { color: crit ? '#ffd23a' : colour, scale: crit ? 0.3 : 0.22 });
      sfx.hit(crit, at);
      const h = CONFIG.mage.haptics.hit;
      player.input.pulse(bolt.hand, h.intensity, h.ms);
      this.landed(enemy, killed, 0.03);
      if (bolt.charge === 'pyroblast') combatStats.pyroblastHits++;
      if (fire && crit) this.masterOfElements(at);
      if (!killed && fire) this.ignite(enemy, damage);
      if (!killed && bolt.charge === 'pyroblast') this.dots.add(enemy, 'burn', FIRE.pyroblast.burn * player.stats.damage, FIRE.pyroblast.burnTime);
      if (bolt.charge === 'frostbolt' && !killed) this.chill(enemy, at, wasSlowed);
      if (bolt.charge === 'chainLightning') this.arc(enemy, bolt.damage, at);
    } else this.fx.particles.burst('magic', at, 8, undefined, bolt.color);
    if (bolt.charge === 'fireball') this.burst(at, enemy);
    if (bolt.charge === 'pyroblast') this.blast(at, enemy !== null);
  }

  /** Your slows with Permafrost: `seconds` long and `by` strong, as the talent makes them. */
  private slowOf(seconds: number, by: number): readonly [number, number] {
    const t = this.player.stats.talents;
    return [seconds + t.slowLonger, by * (1 + t.slowStronger)];
  }

  /**
   * A Frostbolt landed on `enemy`: it's slowed, and frost clings to it. With
   * Frostbite, one that was already slowed may freeze, after the blow.
   */
  private chill(enemy: Enemy, at: Vector3, wasSlowed: boolean): void {
    const F = CONFIG.classes.mage.abilities.frostbolt;
    if (enemy.afflict('slowed', ...this.slowOf(F.time, F.slow)) > 0) combatStats.chilled++;
    this.fx.particles.burst('magic', at, 12, undefined, ABILITY_COLOUR.frostbolt);
    sfx.frostboltHit(at);
    const chance = this.player.stats.talents.frostbite;
    if (!wasSlowed || chance <= 0 || Math.random() >= chance) return;
    if (enemy.afflict('frozen', FROST.frostbite.freeze) <= 0) return;
    combatStats.frostbitten++;
    this.fx.text.spawn('FROSTBITE', at.clone().setY(at.y + 0.3), { color: '#bfe8ff', scale: 0.14 });
    this.fx.particles.burst('magic', at, 16, undefined, ABILITY_COLOUR.frostNova);
  }

  /** Ignite: a fire hit of `dealt` on `enemy` burns it for a share more, over a while. */
  private ignite(enemy: Enemy, dealt: number): void {
    const share = this.player.stats.talents.ignite;
    if (share > 0) this.dots.add(enemy, 'burn', dealt * share, FIRE.ignite.time);
  }

  /** Master of Elements: a fire head hit gives mana back. */
  private masterOfElements(at: Vector3): void {
    const { player } = this;
    const back = Math.min(player.stats.talents.fireHeadMana, player.bar.size - player.resource);
    if (back <= 0) return;
    player.resource += back;
    combatStats.manaBack += back;
    this.fx.text.spawn(`+${Math.round(back)} mana`, at.clone().setY(at.y + 0.35), { color: '#7ab8ff', scale: 0.1 });
  }

  /** A Pyroblast's orb breaks at `at`, on an enemy (`struck`) or not: a great burst of flame, nobody else hurt. */
  private blast(at: Vector3, struck: boolean): void {
    const colour = ABILITY_COLOUR.pyroblast!;
    this.fx.shockwaves.trigger(at, struck ? 1.6 : 1, colour, 0.45);
    this.fx.particles.burst('embers', at, struck ? 40 : 20, undefined, colour);
    this.fx.particles.burst('magic', at, struck ? 20 : 10, undefined, ABILITY_COLOUR.fireball);
    if (struck) this.fx.text.spawn('PYROBLAST', at.clone().setY(at.y + 0.5), { color: '#ff8a50', scale: 0.18 });
    sfx.pyroblastHit(at);
  }

  /** A tick of a bleed or a burn on `enemy`: no blow, but it hurts, and a camp notices. */
  private dotTick(enemy: Enemy, kind: DotKind, dealt: number): void {
    const killed = enemy.suffer(dealt);
    combatStats.dotTicks++;
    combatStats.dotDamage += dealt;
    enemy.capsule(_a, _b);
    _a.lerp(_b, 0.75);
    const burn = kind === 'burn';
    if (burn) this.fx.particles.burst('embers', _a, 6, undefined, ABILITY_COLOUR.fireball);
    else this.fx.particles.burst('blood', _a, 4, undefined, bloodOf(enemy) ?? undefined);
    this.fx.text.spawn(`${dealt}`, _a, { color: burn ? '#ff9a50' : '#d05050', scale: 0.13 });
    this.events.onEnemyHit(enemy, killed);
    if (killed) this.onKill(enemy);
  }

  /** Ice Barrier: a shell of ice round you, taking the next blows up to what it holds (more with your level). */
  private iceBarrier(): void {
    const B = FROST.iceBarrier;
    const { player } = this;
    this.barrier.raise(Math.round(B.absorb * player.stats.step), B.time);
    player.feetPosition(_feet);
    this.fx.particles.burst('magic', _p.copy(_feet).setY(_feet.y + 1), 30, undefined, ABILITY_COLOUR.iceBarrier);
    this.fx.text.spawn('ICE BARRIER', _p.copy(_feet).setY(_feet.y + 1.3), { color: '#bfe8ff', scale: 0.14 });
    sfx.iceBarrier();
    player.input.pulse('left', 0.6, 100);
    player.input.pulse('right', 0.6, 100);
  }

  /**
   * Chain Lightning's bolt struck `struck`: it arcs on to the next enemies
   * within reach, one after another, each taking a share of the bolt (`damage`,
   * in level-1 terms; no crit or exposed bonus rides the arcs).
   */
  private arc(struck: Enemy, damage: number, at: Vector3): void {
    const C = CONFIG.classes.mage.abilities.chainLightning;
    const colour = ABILITY_COLOUR.chainLightning!;
    const dealt = Math.max(1, Math.round(damage * C.share * this.player.stats.damage));
    _a.copy(at);
    for (const enemy of chainFrom(struck, this.enemies, C.jumps, C.reach)) {
      enemy.capsule(_b, _p);
      _b.lerp(_p, 0.6);
      this.lightning(_a, _b, colour);
      _push.subVectors(_b, _a).setY(0);
      if (_push.lengthSq() > 1e-6) _push.normalize().multiplyScalar(1);
      const killed = enemy.takeHit(dealt, _push, { from: _a });
      combatStats.arcs++;
      this.fx.particles.burst('sparks', _b, 10, undefined, colour);
      this.fx.text.spawn(`${dealt}`, _b, { color: '#d8c8ff', scale: 0.2 });
      sfx.chainLightning(_b);
      this.events.onEnemyHit(enemy, killed);
      if (killed) this.onKill(enemy);
      _a.copy(_b);
    }
  }

  /** A crackling line of sparks from `a` to `b`, jagged, through the shared particles (no draw call of its own). */
  private lightning(a: Vector3, b: Vector3, colour: number): void {
    const steps = 8;
    for (let i = 1; i < steps; i++) {
      _to.lerpVectors(a, b, i / steps);
      _to.x += (Math.random() - 0.5) * 0.25;
      _to.y += (Math.random() - 0.5) * 0.25;
      _to.z += (Math.random() - 0.5) * 0.25;
      this.fx.particles.burst('sparks', _to, 2, undefined, colour);
    }
  }

  /** One of Blizzard's ticks: every enemy in its circle takes a little and is slowed while it stands there. */
  private blizzardTick(caught: Enemy[]): void {
    const B = CONFIG.classes.mage.abilities.blizzard;
    const { centre } = this.blizzard;
    const damage = Math.round(B.damage * this.player.stats.damage);
    for (const enemy of caught) {
      const killed = enemy.takeHit(damage, _push.set(0, 0, 0), { from: centre });
      combatStats.blizzardHits++;
      if (!killed) enemy.afflict('slowed', ...this.slowOf(B.linger, B.slow));
      enemy.capsule(_a, _b);
      _a.lerp(_b, 0.8);
      this.fx.text.spawn(`${damage}`, _a, { color: '#e4f4ff', scale: 0.16 });
      this.events.onEnemyHit(enemy, killed);
      if (killed) this.onKill(enemy);
    }
    if (caught.length) sfx.blizzardTick(centre);
  }

  /** A Fireball bursts at `at`: every other enemy within reach burns for the burst. */
  private burst(at: Vector3, struck: Enemy | null): void {
    const F = CONFIG.classes.mage.abilities.fireball;
    const colour = ABILITY_COLOUR.fireball!;
    const damage = Math.round(F.burst * this.player.stats.damage);
    // Improved Fireball: it reaches further.
    const radius = F.radius + this.player.stats.talents.fireballRadius;
    for (const enemy of within(at, radius, this.enemies, struck)) {
      _push.subVectors(enemy.position, at).setY(0);
      if (_push.lengthSq() > 1e-6) _push.normalize().multiplyScalar(2);
      const killed = enemy.takeHit(damage, _push, { from: at });
      combatStats.burnt++;
      enemy.capsule(_a, _b);
      _a.lerp(_b, 0.6);
      this.fx.particles.burst('embers', _a, 10, undefined, colour);
      this.fx.text.spawn(`${damage}`, _a, { color: '#ffb070', scale: 0.2 });
      if (!killed) this.ignite(enemy, damage);
      this.events.onEnemyHit(enemy, killed);
      if (killed) this.onKill(enemy);
    }
    this.fx.shockwaves.trigger(at, radius, colour, 0.35);
    this.fx.particles.burst('embers', at, 30, undefined, colour);
    sfx.fireballBurst(at);
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

  /** Red from the living, leeches and adders, dark ichor from the undead brute, bone chips from skeletons; sparks on crits. */
  private impactFx(enemy: Enemy, at: Vector3, dir: Vector3, bright: boolean): void {
    _vel.copy(dir).normalize();
    const blood = bloodOf(enemy);
    if (blood === null) this.fx.particles.burst('bone', at, 6, _vel);
    else this.fx.particles.burst('blood', at, enemy.kind === 'brute' ? 10 : 8, _vel, blood);
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
    const blood = bloodOf(enemy);
    sfx.death(_a, { big: enemy.kind === 'warden' || enemy.kind === 'brute', bones: enemy.body === 'skeleton' });
    if (blood === null) this.fx.particles.burst('bone', _a, enemy.kind === 'warden' ? 40 : 14);
    else this.fx.particles.burst('blood', _a, enemy.kind === 'brute' ? 24 : enemy.kind === 'biter' ? 8 : 12, undefined, blood);
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
      const talents = this.player.stats.talents;
      const bash = (S.bashDamage + talents.bashDamage) * this.player.stats.damage;
      const killed = enemy.takeHit(Math.round(bash), _push, { from: _p, ignorePoise: enemy.kind !== 'warden' });
      // A steady brute (just out of a stagger) shrugs the bash off and keeps swinging.
      const interrupted = windingUp && !killed && !enemy.attacking;
      if (!killed && broke) enemy.expose(enemy.def.exposedTime * 0.7);
      else if (interrupted && enemy.kind !== 'warden') enemy.expose(enemy.def.exposedTime * 0.7);
      // Shield Slam armed: this bash stuns and exposes, even a brute fresh out of a stagger; the Warden is only exposed.
      const slam = this.player.abilities.left('shieldSlam') > 0;
      if (slam) this.shieldSlam(enemy, killed);
      combatStats.bashes++;
      const label = slam ? 'SHIELD SLAM' : broke ? 'GUARD BREAK' : interrupted ? 'INTERRUPT' : 'BASH';
      this.fx.text.spawn(label, _a.clone().setY(_a.y + 0.3), { color: slam ? '#e0e8f0' : '#ffb060', scale: 0.16 });
      this.fx.particles.burst('dust', _a, 6);
      if (slam) {
        this.fx.particles.burst('sparks', _a, 20, undefined, ABILITY_COLOUR.shieldSlam);
        sfx.shieldSlamHit(_a);
      } else sfx.bash(_a);
      this.player.input.pulse('left', 1, slam ? 160 : 80);
      this.player.addRage(CONFIG.rage.perBash + talents.bashRage);
      this.events.hitStop(0.05);
      this.events.onEnemyHit(enemy, killed);
      if (killed) this.onKill(enemy);
    }
  }

  /** Shield Slam's bash landed on `enemy`: the charge is spent, and it's stunned and exposed. */
  private shieldSlam(enemy: Enemy, killed: boolean): void {
    this.player.abilities.end('shieldSlam');
    combatStats.shieldSlams++;
    if (killed) return;
    const { stun } = SHIELD_SLAM;
    if (enemy.kind !== 'warden') enemy.stagger(stun);
    enemy.expose(stun);
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
    const cost = player.costOf('warCry');
    if (!player.can('warCry') || !player.alive || player.rage < cost) return false;
    const damage = Math.round(A.damage * player.stats.damage);
    player.rage -= cost;
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
    const res = sweepStrike(prevBase, prevTip, base, tip, enemy.weapon.radius, 6, this.defender, attack.blockable, attack.low, _sweep);
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
    // Quick Guard: the parry comes easier, at a slower move into the blow.
    const ease = 1 + player.stats.talents.parry;
    let parry: boolean;
    if (onShield) {
      _vel.copy(player.shield.centre.velocity).applyQuaternion(player.rig.quaternion);
      _p.subVectors(tip, prevTip).normalize();
      parry = Math.max(_vel.dot(_to), -_vel.dot(_p)) >= CONFIG.shield.parrySpeed / ease;
    } else {
      parry = player.sword.tipSpeed >= CONFIG.sword.parrySpeed / ease;
    }
    const at = res.point;
    if (onShield) this.frozenWard(enemy);
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
    if (onShield) this.warded();
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
        // Iron Arm numbs it less, and at its fullest not at all.
        player.shield.numb = CONFIG.shield.numbTime * Math.max(0, 1 - player.stats.talents.numbLess);
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

  /** Frozen Ward: a blow the mage's ward stopped, blocked or parried, slows its attacker. */
  private frozenWard(enemy: Enemy): void {
    const { player } = this;
    const by = player.stats.talents.wardSlow;
    if (player.klass !== 'mage' || by <= 0) return;
    if (enemy.afflict('slowed', ...this.slowOf(FROST.frozenWard.time, by)) > 0) combatStats.wardSlowed++;
    enemy.capsule(_a, _b);
    this.fx.particles.burst('magic', _a.lerp(_b, 0.6), 10, undefined, ABILITY_COLOUR.frostbolt);
  }

  /** The shield stopped a blow or an arrow: the mage's ward pays for it in mana (a parry is free). */
  private warded(): void {
    const { player } = this;
    if (player.klass === 'mage') player.resource = afterBlock(player.resource);
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

  /**
   * A blow from `from` lands on you: your armour cuts it by its share against
   * the attacker's level, and Ice Barrier, if it's up, takes what it can hold
   * of the rest.
   */
  private hurtPlayer(amount: number, from: Enemy | null, flinch = true): void {
    let dealt = Math.round(amount * (1 - armourCut(this.player.stats.armour, from?.level ?? 1)));
    if (this.barrier.up) {
      const through = this.barrier.take(dealt);
      combatStats.absorbed += dealt - through;
      this.player.headPosition(_p);
      this.player.camera.getWorldDirection(_to);
      _p.addScaledVector(_to.setY(0).normalize(), 0.5).setY(_p.y - 0.5);
      this.fx.particles.burst('magic', _p, 12, undefined, ABILITY_COLOUR.iceBarrier);
      if (this.barrier.up) sfx.barrierAbsorb();
      else sfx.barrierBreak();
      dealt = through;
      if (dealt <= 0) return;
    }
    combatStats.hurts++;
    this.player.damage(dealt);
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
        this.warded();
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
      // Sent back by your parry or ward, it's your blow: Hunter's Mark adds to it.
      const damage = Math.round(CONFIG.arrow.reflectDamage * this.player.stats.damage * (this.ranger?.mark.of(enemy) ?? 1));
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
