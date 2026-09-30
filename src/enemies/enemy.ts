import { Color, Euler, Group, Quaternion, Vector3 } from 'three';
import { closestSegmentSegment, type SegmentHit } from '../combat/geometry';
import type { BladeTarget } from '../combat/strike';
import type { AttackConfig, EnemyConfig } from '../config';
import { CONFIG } from '../config';
import { buildCharacter, type EnemyKind, type Family, type WeaponSpec } from '../models/characters';
import { createModelMaterial, type ModelMaterial } from '../models/materials';
import { BONES, type BoneName, blendPoses, type Pose, type Rig } from '../models/rig';
import { HealthBar } from '../ui/healthBar';
import type { Ground } from '../world/ground';
import { ATTACK_POSES, GUARD, type GuardSide, IDLE, KNEEL, KNEEL_DROP, RISE, SEATED, STAGGER, walkOffsets } from './poses';
import type { AttackTokens } from './tokens';

export type EnemyState = 'rising' | 'move' | 'attack' | 'guard' | 'stagger' | 'kneel' | 'seated' | 'sitting' | 'frozen' | 'dead';
/**
 * What an ability can hold an enemy in, on top of what it's doing: _rooted_
 * (it can't walk, but strikes what's in reach), _frozen_ (it does nothing at
 * all until the time runs out or a hit breaks it; its state is 'frozen') and
 * _slowed_ (it walks and winds up slower by a fraction).
 */
export type Affliction = 'rooted' | 'frozen' | 'slowed';
export type AttackPhase = 'windup' | 'active' | 'recover';
/** What one frame of a swing did. `dodged` = the player was in dodge frames. */
export type StrikeOutcome = 'hit' | 'blocked' | 'parried' | 'dodged';

/** The player's blade as enemies see it: world segment and tip speed. */
export interface PlayerSword {
  base: Vector3;
  tip: Vector3;
  speed: number;
  /** Which swing this is (the player's SwingDetector count): a new swing gets a fresh read. */
  swing?: number;
}

/** The world as an enemy sees it, plus the hooks its attacks call. Game provides it. */
export interface EnemyContext {
  /** Player's head projected to the floor. */
  playerFeet: Vector3;
  playerHead: Vector3;
  /** Null when the sword isn't tracked or the player is down. Guards react to it. */
  playerSword: PlayerSword | null;
  /** The floor it walks on: the arena, or a zone. */
  ground: Ground;
  meleeTokens: AttackTokens;
  rangedTokens: AttackTokens;
  /** One frame of a melee swing: returns what the weapon struck, if anything. */
  sweep(enemy: Enemy, attack: AttackConfig, prevBase: Vector3, prevTip: Vector3, base: Vector3, tip: Vector3): StrikeOutcome | null;
  /** A slam lands at `at`. */
  slam(enemy: Enemy, attack: AttackConfig, at: Vector3): void;
  /** Loose an arrow from `from` at the player. */
  shoot(enemy: Enemy, from: Vector3, damage: number): void;
  /** Show an arrow on the string this frame, from nock to bow grip. */
  nock(enemy: Enemy, nock: Vector3, grip: Vector3): void;
  summon(enemy: Enemy, count: number): void;
  /** An attack's wind-up began (sound cue, threat indicator). */
  telegraph(enemy: Enemy, attack: AttackConfig): void;
}

type MutablePose = Record<string, [number, number, number]>;

/** What sets an enemy apart from others with its behaviour: its family and look, its numbers and level (createEnemy fills it in). */
export interface EnemyTraits {
  /** Who it is: the undead (the default) are skeletons; bandits wear the human body. */
  family?: Family;
  /** Which of its family's looks for its behaviour. */
  variant?: number;
  /** Its numbers, already made at its level. */
  def?: EnemyConfig;
  /** Its level, which `def`'s numbers were made at: what its kill pays for. */
  level?: number;
}

/** Where an enemy waits when it isn't fighting (see Enemy.post). */
export interface EnemyPost {
  x: number;
  z: number;
  /** Which way it faces while it waits. */
  yaw: number;
  /** Walking home after giving up a chase: it can't be hurt. */
  evading: boolean;
  /** m/s it walks after a post that moves on (a patrol's), rather than strolling back to it. */
  pace?: number;
}

/** A seat it sits on (the Warden's throne): where its feet go, the way it faces, and how high its hips are over the floor. */
export interface Seat {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly hip: number;
}

const RISE_DEPTH = 1.9;
const UP = new Vector3(0, 1, 0);
const _to = new Vector3();
const _v = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _e = new Euler(0, 0, 0, 'YXZ');
const _home = new Vector3();
const _way = new Vector3();
const _round = new Vector3();
const _hit: SegmentHit = { distance: 0, pointA: new Vector3(), pointB: new Vector3() };
const _telegraphBlock = new Color(1.0, 0.45, 0.05);
const _telegraphUnblock = new Color(1.0, 0.05, 0.02);
const _exposedGlow = new Color(0.15, 0.35, 0.6);
const _blockGlint = new Color(0.9, 0.95, 1.0);
const _plain = new Color(1, 1, 1);
const _frozenTint = new Color(0.62, 0.8, 1.0);
const _frozenGlow = new Color(0.07, 0.15, 0.26);
const _frostTint = new Color(0.84, 0.93, 1.0);
const _frostGlow = new Color(0.03, 0.06, 0.1);
/** The most a slow can take off its pace and wind-ups. */
const MAX_SLOW = 0.9;
/** s for its vines to grow in as a root takes hold, and to wither as it ends. */
const VINE_GROW = 0.25;

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}
function easeIn(t: number): number {
  return t * t;
}
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

/** Where a slash crosses the enemy's front, measured once per body (family and behaviour) at its bind proportions. */
interface AimCalibration {
  angle: number; // elevation of that crossing seen from the right shoulder
  shoulderY: number;
}
const aimCache = new Map<string, AimCalibration>();

/** The nocked arrow at full draw, facing +Z from the origin, measured once per body. */
interface DrawCalibration {
  nock: Vector3;
  yaw: number;
  pitch: number;
}
const drawCache = new Map<string, DrawCalibration>();
/** Nock (on the string hand) and arrow rest (on the bow grip), in their hands' space. */
const NOCK: [number, number, number] = [0, -0.06, 0.02];
const GRIP: [number, number, number] = [0, -0.06, 0];
/** How far the archer will twist and bend at the waist to track the player. */
const MAX_AIM_YAW = 0.6;
const MAX_AIM_PITCH = 0.5;

interface Shard {
  vel: Vector3;
  spin: Vector3;
}

/**
 * Shared machinery for every enemy: rising from the grave, locomotion and
 * steering, the attack timeline (wind-up → swing → recover) driven by pose
 * keyframes, stagger and exposure, deaths, and the hurt volumes the sword
 * tests against. Subclasses (kinds.ts) only decide where to go and what to do.
 */
export abstract class Enemy {
  readonly root = new Group();
  readonly position: Vector3; // feet, alias of root.position
  /** Who it is: undead or bandit. Its body, how it dies and what flies when it's hit. */
  readonly family: Family;
  readonly def: EnemyConfig;
  /** Its level, which `def`'s numbers were made at (createEnemy): what its kill pays for. */
  readonly level: number;
  readonly rig: Rig;
  readonly weapon: WeaponSpec;
  readonly material: ModelMaterial;
  readonly healthBar: HealthBar;
  hp: number;
  readonly maxHp: number;
  state: EnemyState = 'rising';
  stateTime = 0;
  /** Seconds until the sword can hit this enemy again. */
  hitCooldown = 0;
  bashCooldown = 0;
  readonly knockback = new Vector3();
  /** Seconds of bonus damage left (after a parry, a bash on its wind-up, a stuck weapon). */
  exposed = 0;

  attack: AttackConfig | null = null;
  phase: AttackPhase = 'windup';
  /** The guard it holds while in the 'guard' state. */
  guardSide: GuardSide = 'right';
  phaseTime = 0;
  /** Seconds until it may start another attack. */
  protected cooldown = rand(0.4, 1.2);
  protected strafeSign = Math.random() < 0.5 ? 1 : -1;
  protected strafeTimer = rand(1.5, 3);
  protected readonly visual = new Group();
  /**
   * Where it waits when it isn't fighting. The arena's enemies have none and
   * always fight; in a zone, the camp an enemy belongs to gives it a post and
   * decides when it fights (standDown).
   */
  post: EnemyPost | null = null;
  /**
   * m/s it runs at to catch up when the player is well out of reach, so a
   * zone's enemies don't lose anyone who simply walks off. 0 (the arena): it
   * never runs.
   */
  chaseSpeed = 0;

  private readonly pose: MutablePose = {};
  private readonly snapshot: MutablePose = {};
  private readonly windupPose: MutablePose = {};
  private readonly strikePose: MutablePose = {};
  private readonly scratch: MutablePose = {};
  private hipDrop = 0;
  private walkPhase = 0;
  private moveAmount = 0;
  private stride = 1; // walk-cycle speed-up while running
  private flash = 0;
  private flinch = 0;
  private staggerDuration = 0;
  private staggerSide = 1;
  private steady = 0; // s left in which blows can't stagger it (def.steadyTime)
  private readonly riseTime: number;
  private readonly prevBase = new Vector3();
  private readonly prevTip = new Vector3();
  private readonly base = new Vector3();
  private readonly tip = new Vector3();
  private struck = false; // this swing already connected
  private phaseDuration = 1;
  private releasePending = false; // loose the arrow on the next weapon sample
  private held: AttackTokens | null = null;
  private guardTimer = 0; // s left with the guard up
  private guardCooldown = 0;
  private guardRead = 0; // s until it looks again at which side your blade is on
  private swingSeen = false; // already decided whether to guard against this swing
  private lastSwing: number | undefined;
  private glint = 0; // weapon flash after a block
  private stuckFor = 0;
  /** Did it walk last frame? A stretch of walking one way ends when it stops. */
  private walked = false;
  /** Seconds of walking one way (`walkedWay`) since `walkedFrom`, 0 before a stretch starts: to tell steering that gets nowhere. */
  private walkedFor = 0;
  private readonly walkedFrom = new Vector3();
  private readonly walkedWay = new Vector3();
  private detour = 0;
  private readonly detourDir = new Vector3();
  private shards: Shard[] | null = null;
  /** The seat it sits on, is sitting down onto or standing up from; null otherwise. */
  private seat: Seat | null = null;
  /** Sitting down or standing up: from where, to where, over how long. */
  private readonly seatFrom = new Vector3();
  private readonly seatTo = new Vector3();
  private seatTime = 1;
  /** s left rooted, frozen and slowed, and how much slower (0 to MAX_SLOW) while slowed. */
  private rootedFor = 0;
  private frozenFor = 0;
  private slowedFor = 0;
  private slowBy = 0;
  /** s since the root took hold, for its vines to grow in. */
  private rootedTime = 0;
  /** s left that it can't heal (Mortal Strike's wound), walking home included. */
  woundedFor = 0;

  constructor(
    /** Its behaviour: how it fights. */
    readonly kind: EnemyKind,
    x: number,
    z: number,
    traits: EnemyTraits = {},
  ) {
    const { family = 'undead', variant = 0, def = CONFIG.enemies[kind], level = 1 } = traits;
    this.family = family;
    this.def = def;
    this.level = level;
    this.hp = this.maxHp = this.def.hp;
    this.material = createModelMaterial();
    const model = buildCharacter(kind, { material: this.material, family, variant });
    this.rig = model.rig;
    this.weapon = model.weapon;
    this.position = this.root.position;
    this.root.position.set(x, 0, z);
    this.root.add(this.visual);
    this.visual.add(this.rig.mesh);
    this.riseTime = kind === 'warden' ? 2.4 : 1.1;
    if (family === 'undead') {
      // The dead claw their way up out of the ground.
      this.visual.position.y = -RISE_DEPTH * this.heightScale;
      copyPose(RISE, this.pose); // copies: poses are shared constants, and this.pose is eased in place
    } else {
      // The living are simply there, standing.
      this.state = 'move';
      copyPose(IDLE[kind], this.pose);
    }

    const big = kind === 'warden';
    this.healthBar = big ? new HealthBar(1.4, 0.1, 0x6ad0ff, 'THE BONE WARDEN') : new HealthBar(0.5, 0.05, 0xc81e1e);
    this.healthBar.root.position.y = this.headTopY() + (big ? 0.5 : 0.28);
    this.root.add(this.healthBar.root);
  }

  // ------------------------------------------------------------ queries

  get alive(): boolean {
    return this.state !== 'dead';
  }

  /** Can the sword damage it right now? */
  get hittable(): boolean {
    return this.state !== 'dead' && this.state !== 'rising' && !this.seated && !this.post?.evading;
  }

  /** On its seat, sitting down onto it or standing up from it (not only `state` 'seated'): it stays where it's put, and nothing shoves it. */
  get seated(): boolean {
    return this.seat !== null;
  }

  /** Walking home after giving up a chase: blows do nothing ("Evade"). */
  get evading(): boolean {
    return this.state !== 'dead' && this.post?.evading === true;
  }

  get attacking(): boolean {
    return this.state === 'attack';
  }

  /** Weapon up to block: the player's blade stops on it (Combat, sweepBlade). */
  get guarding(): boolean {
    return this.state === 'guard';
  }

  get hpFraction(): number {
    return Math.max(0, this.hp / this.maxHp);
  }

  /** 1 for human-sized skeletons; the boss is ~1.5. */
  protected get heightScale(): number {
    return this.rig.proportions.hipY / 0.92;
  }

  private headTopY(): number {
    const p = this.rig.proportions;
    return p.hipY + 0.06 + p.neck + 0.26 * (p.head ?? 1);
  }

  /** Hurt capsule axis (feet to neck), world space. Follows lean and kneel. */
  capsule(outBottom: Vector3, outTop: Vector3): void {
    const r = this.def.radius;
    outBottom.set(this.position.x, this.position.y + r, this.position.z);
    this.rig.bones.head.getWorldPosition(outTop);
    outTop.y = Math.max(outBottom.y + 0.1, outTop.y - 0.05);
  }

  /** Head sphere (crit zone), world space. */
  headSphere(outCentre: Vector3): number {
    const s = this.rig.proportions.head ?? 1;
    const head = this.rig.bones.head;
    outCentre.set(0, 0.14 * s, 0.02 * s).applyMatrix4(head.matrixWorld);
    return 0.13 * s;
  }

  /** Current weapon segment, world space. */
  weaponSegment(outBase: Vector3, outTip: Vector3): void {
    const bone = this.rig.bones[this.weapon.bone];
    outBase.set(...this.weapon.base).applyMatrix4(bone.matrixWorld);
    outTip.set(...this.weapon.tip).applyMatrix4(bone.matrixWorld);
  }

  /** What the player's blade can meet on it this frame, guard included (see sweepBlade). */
  bladeTarget(out: BladeTarget): BladeTarget {
    this.capsule(out.bottom, out.top);
    out.radius = this.def.radius;
    out.headRadius = this.headSphere(out.head);
    out.guarding = this.guarding;
    if (out.guarding) {
      this.weaponSegment(out.guardBase, out.guardTip);
      out.guardRadius = this.weapon.radius + CONFIG.guard.margin;
    }
    return out;
  }

  /** World position of a point in a bone's space. */
  bonePoint(bone: BoneName, x: number, y: number, z: number, out: Vector3): Vector3 {
    return out.set(x, y, z).applyMatrix4(this.rig.bones[bone].matrixWorld);
  }

  // ------------------------------------------------------------ taking hits

  /** Returns true if this blow killed it. `from` is where the blow came from (world). */
  takeHit(damage: number, push: Vector3, opts: { from?: Vector3; ignorePoise?: boolean } = {}): boolean {
    if (!this.hittable) return false;
    this.hp -= damage;
    this.flash = 0.12;
    this.knockback.addScaledVector(push, this.knockbackScale());
    this.hitCooldown = CONFIG.sword.perEnemyCooldown;
    if (this.hp <= 0) {
      this.die(push);
      return true;
    }
    // A hit breaks a freeze: it takes the blow as it would have unfrozen.
    if (this.state === 'frozen') this.thaw();
    this.onDamaged();
    if (opts.from) this.staggerSide = this.sideOf(opts.from);
    const breaks = damage >= this.def.poise || this.exposed > 0 || opts.ignorePoise;
    if (breaks && this.steady <= 0) this.stagger(this.def.staggerTime);
    else this.flinch = 0.25;
    return false;
  }

  /** How far pushes move it: heavy enemies barely budge. */
  protected knockbackScale(): number {
    return this.kind === 'brute' ? 0.35 : this.kind === 'warden' ? 0.15 : 1;
  }

  /** Hook: HP thresholds (the Warden's summons). */
  protected onDamaged(): void {}

  stagger(duration: number): void {
    if (!this.hittable || duration <= 0) return;
    if (this.state === 'kneel') return; // already down, and longer
    // Don't shorten a longer stagger (e.g. a parry) with a quick hit.
    if (this.state === 'stagger' && this.staggerDuration - this.stateTime > duration) return;
    this.endAttack();
    this.staggerDuration = duration;
    if (this.def.steadyTime !== undefined) this.steady = duration + this.def.steadyTime;
    this.enter('stagger');
  }

  // ------------------------------------------------------------ rooted, frozen and slowed

  /**
   * Root, freeze or slow it for `seconds`; a slow takes `by` (a fraction) off
   * its pace and wind-ups. Its behaviour decides how much of it takes
   * (`def.takes`: a brute half, the Warden no root or freeze), and one that
   * can't be hit takes none. Again while it lasts, the longer time and the
   * stronger slow hold. Returns the seconds it took, 0 if none.
   */
  afflict(what: Affliction, seconds: number, by = 0): number {
    if (!this.hittable || seconds <= 0) return 0;
    const takes = this.def.takes ?? { hold: 1, slow: 1 };
    if (what === 'slowed') {
      const k = Math.min(MAX_SLOW, by * takes.slow);
      if (k <= 0) return 0;
      this.slowBy = this.slowedFor > 0 ? Math.max(this.slowBy, k) : k;
      this.slowedFor = Math.max(this.slowedFor, seconds);
      return seconds;
    }
    const held = seconds * takes.hold;
    if (held <= 0) return 0;
    if (what === 'rooted') {
      if (this.rootedFor <= 0) this.rootedTime = 0;
      this.rootedFor = Math.max(this.rootedFor, held);
      return held;
    }
    // Frozen where it stands, mid-swing or not: its token goes back, so it doesn't count against the attackers' limit.
    this.endAttack();
    this.releaseTokens();
    this.frozenFor = Math.max(this.frozenFor, held);
    if (this.state !== 'frozen') this.enter('frozen');
    return held;
  }

  /** s left of `what`, 0 when it isn't. */
  afflictedFor(what: Affliction): number {
    return what === 'rooted' ? this.rootedFor : what === 'frozen' ? this.frozenFor : this.slowedFor;
  }

  /** How much slower it walks and winds up: 0 when it isn't slowed. */
  get slowness(): number {
    return this.slowedFor > 0 ? this.slowBy : 0;
  }

  /** How far its vines have grown, 0 to 1: up as a root takes hold, down as it ends, 0 unrooted. */
  get vineGrowth(): number {
    if (this.rootedFor <= 0) return 0;
    return Math.min(1, this.rootedTime / VINE_GROW, this.rootedFor / VINE_GROW);
  }

  /** Out of a freeze, back to what it was doing. */
  private thaw(): void {
    this.enter('move');
  }

  /** Rid of any root, freeze or slow: walking home, or dead. */
  private shakeOff(): void {
    this.rootedFor = this.slowedFor = this.slowBy = 0;
    if (this.state === 'frozen') this.thaw();
  }

  expose(seconds: number): void {
    this.exposed = Math.max(this.exposed, seconds);
  }

  /** It can't heal for `seconds`: walking home, it comes back as hurt as it left. */
  wound(seconds: number): void {
    if (this.alive) this.woundedFor = Math.max(this.woundedFor, seconds);
  }

  /** Can it heal: not while a wound holds. */
  get heals(): boolean {
    return this.woundedFor <= 0;
  }

  /** Back to full health, as it was before the fight, unless a wound holds. */
  recover(): void {
    if (this.heals) this.hp = this.maxHp;
    this.exposed = 0;
  }

  /** Fall apart where it stands, struck by nothing: what its master raised, once its master is gone. */
  crumble(): void {
    if (this.alive) this.die(_v.set(0, 0, 0));
  }

  /** Sit on `seat` at once: slumped there, still, and out of reach until it stands. */
  sit(seat: Seat): void {
    this.endAttack();
    this.releaseTokens();
    this.seat = seat;
    this.position.set(seat.x, this.position.y, seat.z);
    this.root.rotation.y = seat.yaw;
    this.visual.position.y = 0;
    this.hipDrop = this.seatDrop(seat);
    copyPose(SEATED, this.pose);
    this.enter('seated');
  }

  /** Sit down on `seat` from where it stands, over `seconds`. */
  sitDown(seat: Seat, seconds: number): void {
    this.endAttack();
    this.releaseTokens();
    this.seat = seat;
    this.seatFrom.copy(this.position);
    this.seatTo.set(seat.x, 0, seat.z);
    this.seatTime = seconds;
    this.enter('sitting');
  }

  /** Stand up off its seat and step out to `to` over `seconds`, then fight (or go to its post). */
  standUp(to: { x: number; z: number }, seconds: number): void {
    if (!this.seat) return;
    this.seatFrom.copy(this.position);
    this.seatTo.set(to.x, 0, to.z);
    this.seatTime = seconds;
    this.enter('rising');
  }

  /** The hip drop that sits its hips at `seat`'s height, as a share of its hip height. */
  private seatDrop(seat: Seat): number {
    return 1 - seat.hip / this.rig.proportions.hipY;
  }

  /** A block or parry stopped its blow. Subclasses can react differently (the Warden kneels). */
  protected onBlocked(parried: boolean): void {
    if (parried) {
      this.stagger(this.def.parryStagger);
      this.expose(this.def.exposedTime);
    } else {
      this.stagger(this.def.blockStagger);
    }
  }

  /** Down on one knee, head in reach: the Warden's punish window. */
  protected kneel(seconds: number): void {
    this.endAttack();
    this.staggerDuration = seconds;
    this.expose(seconds);
    this.enter('kneel');
  }

  private sideOf(from: Vector3): number {
    // +1 if the blow came from its left (+X local), -1 from its right.
    return this.localX(from) >= 0 ? 1 : -1;
  }

  /** How far a world point is to its left (+) or right (-). */
  private localX(p: Vector3): number {
    const yaw = this.root.rotation.y;
    return (p.x - this.position.x) * Math.cos(yaw) - (p.z - this.position.z) * Math.sin(yaw);
  }

  /** How far a world point is in front of it (+) or behind (-). */
  private localZ(p: Vector3): number {
    const yaw = this.root.rotation.y;
    return (p.x - this.position.x) * Math.sin(yaw) + (p.z - this.position.z) * Math.cos(yaw);
  }

  private die(push: Vector3): void {
    this.endAttack();
    this.shakeOff();
    this.enter('dead');
    this.releaseTokens();
    this.root.updateMatrixWorld(true);
    if (this.family === 'undead' && this.def.death === 'shatter') {
      // Rigid skinning means every bone can fly free: the skeleton collapses
      // into a pile of its own parts, still in one draw call.
      this.shards = [];
      _v.copy(push).setY(0).applyAxisAngle(UP, -this.root.rotation.y);
      for (const name of BONES) {
        const bone = this.rig.bones[name];
        this.rig.mesh.attach(bone);
        const out = bone.position.clone().setY(0).normalize();
        this.shards.push({
          vel: new Vector3(out.x * rand(0.5, 1.6), rand(0.5, 2.4), out.z * rand(0.5, 1.6)).addScaledVector(_v, 0.35),
          spin: new Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)),
        });
      }
    }
  }

  // ------------------------------------------------------------ attacking

  /** Begin an attack (the caller has already secured a token if it needs one). */
  protected startAttack(attack: AttackConfig, ctx: EnemyContext, windupScale = 1): void {
    this.attack = attack;
    this.phase = 'windup';
    this.phaseTime = 0;
    this.phaseDuration = attack.windup * windupScale;
    this.struck = false;
    copyPose(this.pose, this.snapshot);
    const poses = ATTACK_POSES[attack.pose];
    copyPose(poses.windup, this.windupPose);
    copyPose(poses.strike, this.strikePose);
    if (attack.aim) this.aimAt(attack, ctx);
    if (attack.kind === 'shot') this.aimBow(ctx);
    this.enter('attack');
    ctx.telegraph(this, attack);
  }

  /** Tilt a horizontal slash so its arc crosses at the player's chest height (duck it!). */
  private aimAt(attack: AttackConfig, ctx: EnemyContext): void {
    const cal = this.calibrate(attack);
    const dist = Math.max(0.4, _to.subVectors(ctx.playerFeet, this.position).setY(0).length());
    const targetY = ctx.playerHead.y - 0.25;
    const wanted = Math.atan2(targetY - this.position.y - cal.shoulderY, dist);
    const delta = Math.max(-0.6, Math.min(1.0, cal.angle - wanted));
    for (const p of [this.windupPose, this.strikePose]) {
      const arm = p.upperArmR;
      if (arm) arm[0] += delta;
    }
  }

  private calibrate(attack: AttackConfig): AimCalibration {
    const key = `${this.family}:${this.kind}:${attack.pose}`;
    const hit = aimCache.get(key);
    if (hit) return hit;
    // Sample the arc at bind proportions, facing +Z from the origin, and find
    // where the tip crosses straight ahead.
    const cal = this.atOrigin(() => {
      const poses = ATTACK_POSES[attack.pose];
      let best = { x: Infinity, y: 0, z: 0, shoulderY: 0, shoulderZ: 0 };
      for (let t = 0; t <= 1.0001; t += 0.02) {
        this.rig.apply(blendPoses(poses.windup, poses.strike, t, this.scratch));
        this.root.updateMatrixWorld(true);
        this.weaponSegment(_a, _b);
        if (_b.z > 0.3 && Math.abs(_b.x) < Math.abs(best.x)) {
          this.rig.bones.upperArmR.getWorldPosition(_a);
          best = { x: _b.x, y: _b.y, z: _b.z, shoulderY: _a.y, shoulderZ: _a.z };
        }
      }
      return { angle: Math.atan2(best.y - best.shoulderY, best.z - best.shoulderZ), shoulderY: best.shoulderY };
    });
    aimCache.set(key, cal);
    return cal;
  }

  /**
   * Turn and bend the archer at the waist so the nocked arrow points at the
   * player's chest. Called when the draw starts and every frame of it, so the
   * draw tracks a moving player; the release keeps the last aim.
   */
  private aimBow(ctx: EnemyContext): void {
    const cal = this.calibrateDraw();
    // The target in the root's frame (facing +Z), relative to the nock.
    const yaw = this.root.rotation.y;
    const dx = ctx.playerHead.x - this.position.x;
    const dz = ctx.playerHead.z - this.position.z;
    const x = dx * Math.cos(yaw) - dz * Math.sin(yaw) - cal.nock.x;
    const z = dx * Math.sin(yaw) + dz * Math.cos(yaw) - cal.nock.z;
    const y = ctx.playerHead.y - CONFIG.arrow.aimBelowHead - this.position.y - cal.nock.y;
    const wantYaw = Math.atan2(x, z);
    const wantPitch = Math.atan2(y, Math.hypot(x, z));
    let turn = wantYaw - cal.yaw;
    turn = Math.max(-MAX_AIM_YAW, Math.min(MAX_AIM_YAW, Math.atan2(Math.sin(turn), Math.cos(turn))));
    const bend = Math.max(-MAX_AIM_PITCH, Math.min(MAX_AIM_PITCH, cal.pitch - wantPitch)); // > 0 aims down
    // Twist about the vertical, then tip about the horizontal axis across the
    // shot, so the arrow's pitch changes by exactly `bend` whatever the stance.
    _q2.setFromAxisAngle(_v.set(Math.cos(cal.yaw + turn), 0, -Math.sin(cal.yaw + turn)), bend);
    const poses = ATTACK_POSES[this.attack!.pose];
    for (const [base, out] of [
      [poses.windup, this.windupPose],
      [poses.strike, this.strikePose],
    ] as const) {
      const s = base.spine ?? [0, 0, 0];
      _q.setFromEuler(_e.set(s[0], s[1] + turn, s[2]));
      _e.setFromQuaternion(_q.premultiply(_q2), 'YXZ');
      out.spine = [_e.x, _e.y, _e.z];
    }
  }

  private calibrateDraw(): DrawCalibration {
    const pose = this.attack!.pose;
    const key = `${this.family}:${this.kind}:${pose}`;
    const hit = drawCache.get(key);
    if (hit) return hit;
    const cal = this.atOrigin(() => {
      this.rig.apply(ATTACK_POSES[pose].windup);
      this.root.updateMatrixWorld(true);
      const nock = this.bonePoint('handR', ...NOCK, new Vector3());
      const dir = this.bonePoint('handL', ...GRIP, _a).sub(nock).normalize();
      return { nock, yaw: Math.atan2(dir.x, dir.z), pitch: Math.asin(dir.y) };
    });
    drawCache.set(key, cal);
    return cal;
  }

  /** Run `measure` with the rig at the origin facing +Z, standing tall, then put everything back. */
  private atOrigin<T>(measure: () => T): T {
    const saved = this.root.position.clone();
    const savedYaw = this.root.rotation.y;
    const savedY = this.visual.position.y;
    this.root.position.set(0, 0, 0);
    this.root.rotation.y = 0;
    this.visual.position.y = 0;
    this.rig.setHipOffset(0, 0, 0); // update() sets it again every frame
    const result = measure();
    this.rig.apply(this.pose);
    this.root.position.copy(saved);
    this.root.rotation.y = savedYaw;
    this.visual.position.y = savedY;
    this.root.updateMatrixWorld(true);
    return result;
  }

  /** Stop attacking and give the token back. */
  protected endAttack(): void {
    if (!this.attack) return;
    this.attack = null;
    this.releaseTokens();
  }

  /** Take a token from `pool` (melee or ranged). */
  protected acquire(pool: AttackTokens): boolean {
    if (!pool.tryAcquire(this)) return false;
    this.held = pool;
    return true;
  }

  protected releaseTokens(): void {
    this.held?.release(this);
    this.held = null;
  }

  protected get holdsToken(): boolean {
    return this.held !== null;
  }

  private updateAttack(dt: number, ctx: EnemyContext): void {
    const a = this.attack!;
    // Slowed, it winds up slower; the blow itself comes as fast.
    this.phaseTime += this.phase === 'windup' ? dt * (1 - this.slowness) : dt;
    const k = Math.min(1, this.phaseTime / this.phaseDuration);

    if (this.phase === 'windup') {
      this.faceToward(ctx.playerFeet, dt);
      if (a.kind === 'shot') this.aimBow(ctx);
      blendPoses(this.snapshot, this.windupPose, easeOut(k), this.pose);
      if (a.kind === 'shot') this.nock(ctx);
      if (k >= 1) this.nextPhase('active', a.active);
      return;
    }
    if (this.phase === 'active') {
      blendPoses(this.windupPose, this.strikePose, easeIn(k), this.pose);
      if (k >= 1) {
        this.finishSwing(ctx);
        if (this.attack) this.nextPhase('recover', a.recover);
      }
      return;
    }
    // Recover.
    const idle = IDLE[this.kind];
    blendPoses(this.strikePose, idle, smooth(k), this.pose);
    if (k >= 1) {
      const next = a.next !== undefined ? this.def.attacks[a.next] : undefined;
      this.endAttack();
      if (next) this.startAttack(next, ctx, this.windupScale());
      else {
        this.cooldown = rand(...this.def.attackCooldown);
        this.enter('move');
      }
    }
  }

  /** Enraged bosses wind up faster. */
  protected windupScale(): number {
    return 1;
  }

  private nextPhase(phase: AttackPhase, duration: number): void {
    this.phase = phase;
    this.phaseTime = 0;
    this.phaseDuration = Math.max(0.01, duration);
    if (phase === 'active') {
      // Release the arrow at full draw.
      this.releasePending = this.attack?.kind === 'shot';
    }
    if (phase === 'recover' && this.attack?.exposeOnRecover) this.onStuck();
  }

  /** Weapon buried in the floor after a slam. The Warden kneels instead. */
  protected onStuck(): void {
    this.expose(this.attack!.recover);
  }

  /** Called every frame after the pose is applied, while attacking. */
  private sampleWeapon(ctx: EnemyContext): void {
    const a = this.attack;
    if (!a) return;
    this.weaponSegment(this.base, this.tip);
    if (this.phase === 'active' && a.kind === 'melee' && !this.struck) {
      const outcome = ctx.sweep(this, a, this.prevBase, this.prevTip, this.base, this.tip);
      if (outcome === 'hit' || outcome === 'dodged') this.struck = true;
      else if (outcome === 'blocked' || outcome === 'parried') {
        this.struck = true;
        this.onBlocked(outcome === 'parried');
      }
    }
    if (this.releasePending && this.attack) {
      this.releasePending = false;
      this.bonePoint('handR', ...NOCK, _a);
      ctx.shoot(this, _a, a.damage);
      this.rangedDone();
    }
    this.prevBase.copy(this.base);
    this.prevTip.copy(this.tip);
  }

  /** Archers give the ranged token back as soon as the arrow flies. */
  protected rangedDone(): void {}

  private finishSwing(ctx: EnemyContext): void {
    const a = this.attack!;
    if (a.kind === 'slam') {
      this.weaponSegment(_a, _b);
      _b.y = ctx.ground.heightAt(_b.x, _b.z);
      ctx.slam(this, a, _b);
    } else if (a.kind === 'summon') {
      ctx.summon(this, CONFIG.warden.summonCount);
    }
  }

  private nock(ctx: EnemyContext): void {
    this.bonePoint('handR', ...NOCK, _a);
    this.bonePoint('handL', ...GRIP, _b);
    ctx.nock(this, _a, _b);
  }

  // ------------------------------------------------------------ guarding

  /**
   * Raise the guard if the player's blade is coming at it. Rolled once per
   * swing (while the tip is moving fast), so a kind's `chance` is how often it
   * reads a swing in time. Returns true if it did.
   */
  private considerGuard(ctx: EnemyContext): boolean {
    const g = this.def.guard;
    const blade = ctx.playerSword;
    if (!g || !blade || this.swingSeen || this.guardCooldown > 0) return false;
    if (this.exposed > 0) return false; // knocked open (a parry, a guard break): no guard until it recovers
    if (blade.speed < CONFIG.guard.threatSpeed) return false;
    this.capsule(_a, _b);
    closestSegmentSegment(blade.base, blade.tip, _a, _b, _hit);
    if (_hit.distance > this.def.radius + CONFIG.guard.threatReach) return false;
    this.swingSeen = true;
    if (Math.random() >= g.chance) return false;
    // It gives up its attack (breaksOff) and its token while it defends.
    if (this.attack) {
      this.endAttack();
      this.cooldown = rand(...this.def.attackCooldown);
    }
    this.releaseTokens();
    this.guardSide = this.sideFacing(blade);
    this.guardTimer = rand(...g.hold);
    this.guardRead = g.reaction;
    this.enter('guard');
    return true;
  }

  /** Hold the guard, re-reading which side your blade is on a reaction time behind. */
  private updateGuard(dt: number, ctx: EnemyContext): void {
    this.faceToward(ctx.playerFeet, dt);
    this.guardTimer -= dt;
    this.guardRead -= dt;
    if (this.guardRead <= 0 && ctx.playerSword) {
      this.guardSide = this.sideFacing(ctx.playerSword);
      this.guardRead = this.def.guard!.reaction;
    }
    if (this.guardTimer <= 0) this.dropGuard();
  }

  /** Lower the guard (time's up, or a shield bash knocked it aside). */
  dropGuard(): void {
    if (this.state !== 'guard') return;
    this.guardCooldown = this.def.guard!.cooldown;
    this.swingSeen = false; // once it has cooled down, it reads the swing in progress afresh
    this.enter('move');
  }

  /** Its guard took a blow: the weapon glints and it is shoved back a little. */
  guardBlocked(push: Vector3): void {
    this.glint = 0.15;
    this.hitCooldown = CONFIG.sword.perEnemyCooldown; // the rest of that swing can't slip through
    this.knockback.addScaledVector(push, this.knockbackScale());
  }

  /**
   * The guard that meets the blade where it is now: over its head if the
   * blade is raised above it, else wherever the point is: at its legs, or on
   * its left or right. The point, not the hilt: a stab from your right hand
   * at its right side comes from its left, but lands on its right.
   */
  private sideFacing(blade: PlayerSword): GuardSide {
    _v.addVectors(blade.base, blade.tip).multiplyScalar(0.5);
    const headR = this.headSphere(_a);
    if (_v.y > _a.y + headR) return 'high';
    if (blade.tip.y < this.rig.bones.hips.getWorldPosition(_a).y) return 'low';
    return this.localX(blade.tip) >= 0 ? 'left' : 'right';
  }

  /**
   * Does the raised guard cover a blow landing at `point` (world) from a blade
   * moving along `motion`? The high guard takes chops at the head and
   * shoulders; the low guard anything at the legs, from either side; a side
   * guard anything else on its half of the body, down past the hips, where
   * the low guard takes over. So: chop past a side guard, slash under or round
   * a high one, go high over a low one, or go for the open side.
   */
  guardCovers(point: Vector3, motion: Vector3): boolean {
    if (!this.guarding || this.localZ(point) < 0) return false; // from behind: wide open
    if (this.guardSide === 'low') return point.y < this.rig.bones.hips.getWorldPosition(_a).y + 0.1 * this.heightScale;
    const chop = motion.y < -0.7 * motion.length();
    if (this.guardSide === 'high') return chop && point.y >= this.rig.bones.upperArmR.getWorldPosition(_a).y - 0.1;
    if (chop) return false;
    // Down to the guard's lower end or the hips, whichever is lower: the side
    // and low guards overlap, so there is no gap at the belt.
    this.weaponSegment(_a, _b);
    const hips = this.rig.bones.hips.getWorldPosition(_v).y;
    if (point.y < Math.min(_a.y, _b.y, hips) - 0.1 * this.heightScale) return false;
    // The halves overlap a little, so a thrust at the middle is still covered.
    const x = this.localX(point);
    const overlap = 0.08 * this.heightScale;
    return this.guardSide === 'left' ? x > -overlap : x < overlap;
  }

  // ------------------------------------------------------------ moving

  /** Walk along `dir` (unit, XZ) at `speed`, steering round pillars and props. */
  protected walk(dir: Vector3, speed: number, dt: number, ctx: EnemyContext): void {
    if (this.rootedFor > 0) return; // held by the vines: it can still turn and strike
    speed *= 1 - this.slowness;
    _v.copy(dir);
    if (this.detour > 0) {
      // Stuck: side-step along the detour for a moment instead.
      this.detour -= dt;
      _v.copy(this.detourDir);
    } else ctx.ground.steer(this.position, _v, this.def.radius);
    _a.copy(this.position);
    this.position.addScaledVector(_v, speed * dt);
    ctx.ground.resolve(this.position, this.def.radius);
    this.moveAmount = Math.min(1, speed / this.def.speed);
    this.stride = Math.max(1, speed / this.def.speed);

    // Safety net for local traps (walls, props, other enemies): if we keep
    // trying to walk but barely move, detour sideways for a second.
    const { time, headway, sameWay, detour } = CONFIG.unstick;
    const moved = _a.distanceTo(this.position);
    this.stuckFor = moved < speed * dt * headway ? this.stuckFor + dt : Math.max(0, this.stuckFor - dt);
    let stuck = this.stuckFor > time;
    // Steering can also flip-flop against a wall met square on, with the way
    // on straight through it: moving every frame, getting nowhere, while it
    // means to go one way (unlike circling, whose drift turns about).
    this.walked = true;
    if (this.walkedFor === 0 || dir.dot(this.walkedWay) < sameWay) {
      this.walkedFor = 0;
      this.walkedFrom.copy(_a);
      this.walkedWay.copy(dir);
    }
    this.walkedFor += dt;
    if (this.walkedFor >= time) {
      stuck ||= this.walkedFrom.distanceTo(this.position) < speed * time * headway;
      this.walkedFor = 0;
    }
    if (stuck && this.detour <= 0) {
      this.stuckFor = 0;
      this.detour = detour;
      const side = Math.random() < 0.5 ? 1 : -1;
      this.detourDir.set(-dir.z * side, 0, dir.x * side).addScaledVector(dir, -0.3).normalize();
    }
  }

  /** Between where it stood and where it's going, on and off its seat: `k` of the way. */
  private slideSeat(k: number): void {
    this.position.x = this.seatFrom.x + (this.seatTo.x - this.seatFrom.x) * k;
    this.position.z = this.seatFrom.z + (this.seatTo.z - this.seatFrom.z) * k;
  }

  /** Turn towards facing `yaw`, at its turning speed times `rate`. */
  private faceYaw(yaw: number, dt: number, rate = 1): void {
    const delta = Math.atan2(Math.sin(yaw - this.root.rotation.y), Math.cos(yaw - this.root.rotation.y));
    const maxStep = this.def.turnSpeed * rate * dt;
    this.root.rotation.y += Math.max(-maxStep, Math.min(maxStep, delta));
  }

  protected faceToward(target: Vector3, dt: number, rate = 1): void {
    _to.subVectors(target, this.position).setY(0);
    if (_to.lengthSq() < 1e-6) return;
    this.faceYaw(Math.atan2(_to.x, _to.z), dt, rate);
  }

  /** How fast to close in from `dist` away: its walk, or a run (chaseSpeed) when far behind. */
  protected closingSpeed(dist: number): number {
    return dist > this.def.holdDistance + 2.5 ? Math.max(this.def.speed, this.chaseSpeed) : this.def.speed;
  }

  /** Stop fighting and go to `post` (see `post`); null sends it back into the fight. */
  standDown(post: EnemyPost | null): void {
    this.post = post;
    if (!post) return;
    this.endAttack();
    this.releaseTokens();
    // Its leash ran out whatever held it: it shakes it off and walks home.
    this.shakeOff();
    if (this.state === 'attack' || this.state === 'guard') this.enter('move');
  }

  /** Not fighting: walk back to the post (round the rock, in the mine), then stand there facing its way. */
  private holdPost(dt: number, ctx: EnemyContext): void {
    const p = this.post!;
    _home.set(p.x, 0, p.z);
    const d = Math.hypot(p.x - this.position.x, p.z - this.position.z);
    if (d > 0.3) {
      const speed = p.evading ? Math.max(this.def.speed, this.chaseSpeed) : (p.pace ?? this.def.speed * 0.6);
      this.headFor(ctx.ground.wayRound?.(this.position, _home, _round) ? _round : _home, speed * Math.min(1, 0.3 + d), dt, ctx);
    } else this.faceToward(this.postFacing(_home), dt, 0.5);
  }

  /** Walk towards `goal` at `speed`, facing it. */
  private headFor(goal: Vector3, speed: number, dt: number, ctx: EnemyContext): void {
    _way.subVectors(goal, this.position).setY(0);
    const d = _way.length();
    if (d < 1e-6) return;
    this.walk(_way.divideScalar(d), speed, dt, ctx);
    this.faceToward(goal, dt);
  }

  /** A point straight ahead of the post, the way it faces. */
  private postFacing(out: Vector3): Vector3 {
    const p = this.post!;
    return out.set(this.position.x + Math.sin(p.yaw), 0, this.position.z + Math.cos(p.yaw));
  }

  /** Circle the player at `radius`, drifting sideways; returns the direction walked. */
  protected circle(ctx: EnemyContext, radius: number, dt: number): void {
    _to.subVectors(ctx.playerFeet, this.position).setY(0);
    const d = _to.length() || 1;
    _to.divideScalar(d);
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeSign *= -1;
      this.strafeTimer = rand(1.5, 3.5);
    }
    // Radial correction toward the ring, plus a tangential drift.
    const radial = Math.max(-1, Math.min(1, (d - radius) * 1.5));
    _a.set(-_to.z * this.strafeSign, 0, _to.x * this.strafeSign);
    _v.copy(_to).multiplyScalar(radial).addScaledVector(_a, 0.6);
    const len = _v.length();
    if (len > 0.05) this.walk(_v.divideScalar(len), this.def.speed * 0.55 * Math.min(1, len), dt, ctx);
    this.faceToward(ctx.playerFeet, dt);
  }

  // ------------------------------------------------------------ per frame

  /** Decide what to do while in the 'move' state. */
  protected abstract think(dt: number, ctx: EnemyContext, dist: number): void;

  /** Returns false once it has finished dying and should be removed. */
  update(dt: number, ctx: EnemyContext): boolean {
    this.stateTime += dt;
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    this.bashCooldown = Math.max(0, this.bashCooldown - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.flinch = Math.max(0, this.flinch - dt);
    this.exposed = Math.max(0, this.exposed - dt);
    this.steady = Math.max(0, this.steady - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.guardCooldown = Math.max(0, this.guardCooldown - dt);
    this.glint = Math.max(0, this.glint - dt);
    if (this.rootedFor > 0) this.rootedTime += dt;
    this.rootedFor = Math.max(0, this.rootedFor - dt);
    this.frozenFor = Math.max(0, this.frozenFor - dt);
    this.slowedFor = Math.max(0, this.slowedFor - dt);
    this.woundedFor = Math.max(0, this.woundedFor - dt);
    const blade = ctx.playerSword;
    if (!blade || blade.speed < CONFIG.guard.threatSpeed || blade.swing !== this.lastSwing) this.swingSeen = false;
    this.lastSwing = blade?.swing;
    this.moveAmount = Math.max(0, this.moveAmount - dt * 4);
    if (!this.walked) this.walkedFor = 0;
    this.walked = false;

    if (this.state !== 'dead' && !this.seated) {
      // Knockback slides the body; decays quickly.
      this.position.addScaledVector(this.knockback, dt);
      this.knockback.multiplyScalar(Math.exp(-8 * dt));
      ctx.ground.resolve(this.position, this.def.radius);
    }

    const dist = _to.subVectors(ctx.playerFeet, this.position).setY(0).length();
    const idle = IDLE[this.kind];
    let target: Pose = idle;
    let snap = false; // attacks drive the pose exactly (the arc is the hitbox)

    switch (this.state) {
      case 'rising': {
        if (this.seat) {
          // Up off its seat: the pose straightens and the hips come up as it steps out.
          const k = Math.min(1, this.stateTime / this.seatTime);
          this.slideSeat(smooth(k));
          this.hipDrop = this.seatDrop(this.seat) * (1 - smooth(Math.min(1, k * 1.4)));
          target = k < 0.35 ? SEATED : idle;
          if (k >= 1) {
            this.seat = null;
            this.enter('move');
          }
          break;
        }
        const k = Math.min(1, this.stateTime / this.riseTime);
        this.visual.position.y = -RISE_DEPTH * this.heightScale * (1 - easeOut(k));
        this.faceToward(this.post ? this.postFacing(_home) : ctx.playerFeet, dt, 0.5);
        target = k < 0.7 ? RISE : idle;
        if (k >= 1) this.enter('move');
        break;
      }
      case 'move':
        if (this.post) {
          this.holdPost(dt, ctx);
          break;
        }
        if (this.considerGuard(ctx)) {
          target = GUARD[this.guardSide];
          break;
        }
        // Rock between you (the mine): it finds its way round to you instead.
        if (ctx.ground.wayRound?.(this.position, ctx.playerFeet, _round)) {
          this.headFor(_round, Math.max(this.def.speed, this.chaseSpeed), dt, ctx);
          break;
        }
        this.think(dt, ctx, dist);
        // think() may have started an attack (TS narrows `state` too eagerly here).
        if ((this.state as EnemyState) === 'attack') snap = true;
        break;
      case 'guard':
        this.updateGuard(dt, ctx);
        if (this.guarding) target = GUARD[this.guardSide];
        break;
      case 'attack':
        if (this.phase !== 'active' && this.def.guard?.breaksOff && this.considerGuard(ctx)) {
          target = GUARD[this.guardSide];
          break;
        }
        this.updateAttack(dt, ctx);
        snap = this.state === 'attack';
        break;
      case 'stagger': {
        const k = Math.min(1, this.stateTime / this.staggerDuration);
        target = k < 0.6 ? STAGGER : idle;
        if (k >= 1) this.enter('move');
        break;
      }
      case 'seated':
        target = SEATED;
        break;
      case 'frozen':
        // Stock still, held in the pose it was caught in.
        snap = true;
        if (this.frozenFor <= 0) this.thaw();
        break;
      case 'sitting': {
        // Back onto its seat, turning to face out from it; the hips go down as it gets there.
        const seat = this.seat!;
        const k = Math.min(1, this.stateTime / this.seatTime);
        this.slideSeat(smooth(k));
        this.faceYaw(seat.yaw, dt);
        this.hipDrop = this.seatDrop(seat) * smooth(Math.max(0, k * 1.4 - 0.4));
        target = k > 0.3 ? SEATED : idle;
        if (k >= 1) this.sit(seat);
        break;
      }
      case 'kneel': {
        target = KNEEL;
        this.hipDrop += (KNEEL_DROP - this.hipDrop) * Math.min(1, dt * 8);
        if (this.stateTime >= this.staggerDuration) this.enter('move');
        break;
      }
      case 'dead':
        return this.updateDeath(dt);
    }
    if (this.state !== 'kneel' && this.state !== 'frozen' && !this.seated) this.hipDrop += (0 - this.hipDrop) * Math.min(1, dt * 5);

    if (!snap) {
      // Everything outside an attack eases toward its target pose.
      const walkPose = this.scratch;
      for (const k of Object.keys(walkPose)) delete walkPose[k];
      if (this.moveAmount > 0.01 && (this.state === 'move' || this.state === 'rising')) {
        this.walkPhase += dt * 7 * this.moveAmount * this.stride * (this.def.speed / Math.max(0.8, this.heightScale));
        walkOffsets(this.walkPhase, this.moveAmount, walkPose);
      }
      const ease = this.state === 'stagger' ? 18 : this.state === 'guard' ? CONFIG.guard.raiseRate : 10;
      const rate = 1 - Math.exp(-ease * dt);
      for (const name of BONES) {
        const t = target[name];
        const w = walkPose[name];
        const cur = (this.pose[name] ??= [0, 0, 0]);
        for (let i = 0; i < 3; i++) {
          let goal = (t?.[i] ?? 0) + (w?.[i] ?? 0);
          if (name === 'spine' && i === 2 && this.state === 'stagger') goal *= this.staggerSide;
          cur[i] += (goal - cur[i]) * rate;
        }
      }
    }

    this.position.y = ctx.ground.heightAt(this.position.x, this.position.z);
    this.rig.apply(this.pose);
    if (this.flinch > 0) this.rig.bones.spine.rotation.x -= this.flinch * 0.6;
    const bob = this.state === 'move' ? -Math.abs(Math.sin(this.walkPhase)) * 0.03 * this.moveAmount : 0;
    this.rig.setHipOffset(0, bob - this.hipDrop * this.rig.proportions.hipY, 0);
    this.root.updateMatrixWorld(true);
    if (this.state === 'attack') this.sampleWeapon(ctx);
    else {
      this.weaponSegment(this.prevBase, this.prevTip);
    }

    this.updateGlow();
    this.healthBar.update(dt, this.hpFraction, ctx.playerHead, this.kind === 'warden' && !this.seated);
    return true;
  }

  private updateGlow(): void {
    // Weapon telegraph: orange for blockable, red for "get out of the way".
    const a = this.attack;
    const tele = this.material.telegraph;
    if (a && this.state === 'attack' && a.kind !== 'summon') {
      const k = this.phase === 'windup' ? Math.min(1, this.phaseTime / this.phaseDuration) : this.phase === 'active' ? 1 : 0;
      tele.copy(a.blockable ? _telegraphBlock : _telegraphUnblock).multiplyScalar(0.3 + 1.2 * k * k);
      if (this.phase === 'recover') tele.setRGB(0, 0, 0);
    } else if (this.glint > 0) tele.copy(_blockGlint).multiplyScalar(this.glint * 8);
    else tele.setRGB(0, 0, 0);
    // Body: pale blue while frozen, a faint frost while slowed; a white hit
    // flash, or a cold pulse while exposed.
    const frozen = this.state === 'frozen';
    this.material.color.copy(frozen ? _frozenTint : this.slowedFor > 0 ? _frostTint : _plain);
    const e = this.material.emissive;
    if (this.flash > 0) e.setRGB(1, 1, 1);
    else if (frozen) e.copy(_frozenGlow);
    else if (this.exposed > 0) e.copy(_exposedGlow).multiplyScalar(0.6 + 0.4 * Math.sin(this.stateTime * 12));
    else if (a && this.phase === 'windup' && a.kind !== 'summon') {
      // The whole body warms up too, so an overhead wind-up (weapon hidden
      // behind the head) still reads from the front.
      const k = Math.min(1, this.phaseTime / this.phaseDuration);
      if (a.blockable) e.setRGB(0.4 * k, 0.16 * k, 0);
      else e.setRGB(0.45 * k, 0, 0);
    } else if (this.slowedFor > 0) e.copy(_frostGlow);
    else e.setRGB(0, 0, 0);
  }

  private updateDeath(dt: number): boolean {
    const t = this.stateTime;
    this.material.emissive.setRGB(0, 0, 0);
    this.material.telegraph.setRGB(0, 0, 0);
    this.healthBar.root.visible = false;
    if (this.shards) {
      const settle = t > 1.6;
      BONES.forEach((name, i) => {
        const bone = this.rig.bones[name];
        const s = this.shards![i];
        if (!settle) {
          s.vel.y -= 9.8 * dt;
          bone.position.addScaledVector(s.vel, dt);
          _q.setFromAxisAngle(_v.copy(s.spin).normalize(), s.spin.length() * dt);
          bone.quaternion.premultiply(_q);
          if (bone.position.y < 0.04) {
            bone.position.y = 0.04;
            s.vel.y = Math.abs(s.vel.y) * 0.3;
            s.vel.x *= 0.5;
            s.vel.z *= 0.5;
            s.spin.multiplyScalar(0.5);
          }
        }
      });
      if (settle) this.visual.position.y = -(t - 1.6) * 0.4;
      return t < 2.6;
    }
    // Topple forward, then sink.
    const k = Math.min(1, t / 0.8);
    this.visual.rotation.x = (Math.PI / 2) * easeIn(k) * 0.95;
    this.visual.position.y = t > 1.6 ? -(t - 1.6) * 0.5 : 0;
    return t < 3.4;
  }

  protected enter(state: EnemyState): void {
    if (state !== 'frozen') this.frozenFor = 0; // whatever takes it out of a freeze ends it
    this.state = state;
    this.stateTime = 0;
  }
}

/** Keep enemies apart, out of walls and props, and out of the player's face (feet at `feet`). */
export function keepApart(enemies: readonly Enemy[], feet: Vector3, ground: Ground): void {
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (!a.alive || a.seated) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (!b.alive || b.seated) continue;
      _v.subVectors(a.position, b.position).setY(0);
      const d = _v.length();
      const min = a.def.radius + b.def.radius + 0.15;
      if (d >= min || d < 1e-6) continue;
      _v.multiplyScalar((min - d) / d / 2);
      a.position.add(_v);
      b.position.sub(_v);
    }
    _v.subVectors(a.position, feet).setY(0);
    const d = _v.length();
    const minD = a.def.radius + CONFIG.player.bodyRadius;
    if (d < minD && d > 1e-6) a.position.addScaledVector(_v, (minD - d) / d);
    ground.resolve(a.position, a.def.radius);
  }
}

function copyPose(src: Pose, out: MutablePose): void {
  for (const k of Object.keys(out)) delete out[k];
  for (const [k, v] of Object.entries(src)) out[k] = [v![0], v![1], v![2]];
}
