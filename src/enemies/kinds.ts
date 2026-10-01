import { Vector3 } from 'three';
import { enemyNumbers } from '../adventureState';
import { type AttackConfig, CONFIG, type EnemyConfig } from '../config';
import type { EnemyFamily, EnemyKind } from '../models/characters';
import {
  buildCrawler,
  CRAWLER_BONES,
  CRAWLER_LOOKS,
  type CrawlerBuild,
  type CrawlerKind,
  type CrawlerPose,
  type CrawlerStrike,
  crawlerLook,
  crawlerWeapon,
  crawlOffsets,
  crawlRate,
  crawlRise,
  curlPose,
  lungeAt,
  recoilPose,
  restPose,
  segmentLength,
  strikePoses,
  strikeReach,
} from '../models/crawler';
import { blendPoses } from '../models/rig';
import { gait } from '../animals/poses';
import { QUAD_BONES } from '../models/quadruped';
import type { Ground } from '../world/ground';
import { type BodyPose, Enemy, type EnemyContext } from './enemy';
import { buildWolf, WOLF_DEAD, WOLF_HEAD, WOLF_HEIGHT, WOLF_IDLE, WOLF_MIDDLE, WOLF_STAGGER, WOLF_STRIDE, WOLF_SWING, wolfBite, type WolfStrike, wolfStrike } from './wolf';

// Each enemy type exists to test the player in a different way:
//   grunt   directional melee: read the wind-up, block on the right side, or hit first
//   archer  ranged pressure: keep the shield up, close the gap, or bat arrows back
//   brute   armour and a slam you can't block: patience, then punish the stuck maul
//   warden  the boss: a three-hit combo to block in turn, a slam, and summoned help
//   biter   small and low (a leech, an adder): lunges at your legs, so you look down and block low
// and wolves fight as grunts do, taking turns, but on four legs (Wolf): they
// spring at you from a few metres out and snap at your legs up close.

const _dir = new Vector3();
const _scratch: Record<string, [number, number, number]> = {};

abstract class MeleeEnemy extends Enemy {
  private lastAttack: AttackConfig | null = null;
  private committed = 0;

  protected think(dt: number, ctx: EnemyContext, dist: number): void {
    const d = this.def;
    // Holding a token: close in and swing.
    if (this.holdsToken) {
      this.committed += dt;
      const attack = this.chooseAttack(dist);
      if (attack) {
        // In reach: swing once the last attacker's blow has had its moment.
        if (ctx.meleeTokens.tryStart(this)) this.startAttack(attack, ctx);
        else this.faceToward(ctx.playerFeet, dt);
        return;
      }
      if (this.committed > 3) {
        this.releaseTokens(); // couldn't reach: let someone else try
        this.cooldown = 1;
        return;
      }
      this.approach(ctx.playerFeet, this.closingSpeed(dist), dt, ctx);
      return;
    }
    if (this.cooldown <= 0 && dist < d.holdDistance + 1.2 && this.acquire(ctx.meleeTokens)) {
      this.committed = 0;
      return;
    }
    // Waiting for a turn: hold at a respectful distance and circle.
    if (dist > d.holdDistance + 0.6) this.approach(ctx.playerFeet, this.closingSpeed(dist), dt, ctx);
    else this.circle(ctx, d.holdDistance, dt);
  }

  /** The attack to start at this distance, or null to keep closing in. */
  protected chooseAttack(dist: number): AttackConfig | null {
    if (dist > this.def.attackRange) return null;
    return this.pick(this.def.attacks);
  }

  /** Weighted pick that avoids repeating the same attack twice. */
  protected pick(attacks: readonly AttackConfig[]): AttackConfig {
    const pool = attacks.filter((a) => a.weight > 0 && (a !== this.lastAttack || attacks.length === 1));
    const total = pool.reduce((s, a) => s + a.weight, 0);
    let r = Math.random() * total;
    for (const a of pool) {
      r -= a.weight;
      if (r <= 0) return (this.lastAttack = a);
    }
    return (this.lastAttack = pool[0]);
  }

  protected approach(target: Vector3, speed: number, dt: number, ctx: EnemyContext): void {
    _dir.subVectors(target, this.position).setY(0);
    if (_dir.lengthSq() > 1e-6) this.walk(_dir.normalize(), speed, dt, ctx);
    this.faceToward(target, dt);
  }
}

export class Grunt extends MeleeEnemy {}

export class Brute extends MeleeEnemy {
  protected chooseAttack(dist: number): AttackConfig | null {
    const [heavy, slam] = this.def.attacks;
    // The slam lands a maul-length away, so it's the answer to a player who keeps their distance.
    if (dist > 1.2 && dist < 2.3 && Math.random() < 0.5) return slam;
    return dist <= this.def.attackRange ? (Math.random() < 0.75 ? heavy : slam) : null;
  }
}

export class Archer extends Enemy {
  protected think(dt: number, ctx: EnemyContext, dist: number): void {
    const d = this.def;
    const clear = ctx.ground.lineOfSight(this.position, ctx.playerFeet);
    _dir.subVectors(ctx.playerFeet, this.position).setY(0).normalize();
    if (dist < 3.2) {
      // Too close: back-pedal.
      this.walk(_dir.negate(), d.speed * 0.8, dt, ctx);
    } else if (!clear) {
      // A pillar is in the way: side-step to find a shot.
      this.walk(_dir.set(-_dir.z * this.strafeSign, 0, _dir.x * this.strafeSign), d.speed * 0.7, dt, ctx);
    } else if (dist > d.holdDistance + 1.5) {
      this.walk(_dir, this.closingSpeed(dist), dt, ctx);
    } else {
      this.circle(ctx, d.holdDistance, dt);
    }
    this.faceToward(ctx.playerFeet, dt);
    if (this.cooldown <= 0 && clear && dist > 2 && dist <= d.attackRange && this.acquire(ctx.rangedTokens)) {
      if (ctx.rangedTokens.tryStart(this)) this.startAttack(d.attacks[0], ctx);
      else this.releaseTokens();
    }
  }

  protected rangedDone(): void {
    this.releaseTokens();
  }
}

/** The Warden's summon, cast at HP thresholds rather than picked from `attacks`. */
export const SUMMON_ATTACK: AttackConfig = {
  pose: 'summon',
  kind: 'summon',
  windup: 1.2,
  active: 0.35,
  recover: 0.7,
  damage: 0,
  blockable: true,
  weight: 0,
};

export class Warden extends Enemy {
  private summonsDone = 0;
  private summonPending = false;

  protected think(dt: number, ctx: EnemyContext, dist: number): void {
    const d = this.def;
    const W = CONFIG.warden;
    if (this.summonPending) {
      this.summonPending = false;
      this.startAttack(SUMMON_ATTACK, ctx);
      return;
    }
    const [combo, , , slam] = d.attacks;
    if (this.cooldown <= 0) {
      if (dist <= d.attackRange) {
        this.startAttack(dist > 1.4 && Math.random() < 0.3 ? slam : combo, ctx, this.windupScale());
        return;
      }
      if (dist < 2.8 && Math.random() < 0.02) {
        // Occasionally slam from mid range to punish a player hanging back.
        this.startAttack(slam, ctx, this.windupScale());
        return;
      }
    }
    _dir.subVectors(ctx.playerFeet, this.position).setY(0);
    if (dist > d.attackRange * 0.9 && _dir.lengthSq() > 1e-6) {
      this.walk(_dir.normalize(), d.speed * (this.hpFraction < W.enrageAt ? 1.25 : 1), dt, ctx);
    }
    this.faceToward(ctx.playerFeet, dt);
  }

  protected windupScale(): number {
    return this.hpFraction < CONFIG.warden.enrageAt ? CONFIG.warden.enrageWindup : 1;
  }

  /** Whole again, and every summon to cast again. */
  recover(): void {
    super.recover();
    this.summonsDone = 0;
    this.summonPending = false;
  }

  protected onDamaged(): void {
    const at = CONFIG.warden.summonAt;
    if (this.summonsDone < at.length && this.hpFraction < at[this.summonsDone]) {
      this.summonsDone++;
      this.summonPending = true;
    }
  }

  protected onBlocked(parried: boolean): void {
    // A parry drops it to one knee: head in reach, big crits.
    if (parried) this.kneel(CONFIG.warden.kneelTime);
    // A plain block doesn't interrupt a combo; it does stop the finisher.
    else if (this.attack?.next === undefined) this.stagger(this.def.blockStagger);
  }

  protected onStuck(): void {
    this.kneel(CONFIG.warden.kneelTime);
  }
}

/** The ?duel practice enemy: a grunt with a guard that stops most swings (CONFIG.duelist). */
export const DUELIST: EnemyConfig = { ...CONFIG.enemies.grunt, ...CONFIG.duelist };

/** How an enemy is made, besides its behaviour and where it stands. */
export interface EnemyOptions {
  /** Its level: health and damage take a step per level above 1. */
  level?: number;
  /** In a camp, it's stronger again (`CONFIG.camps.strength`). */
  inCamp?: boolean;
  /** Who it is: the undead (skeletons, the default), a family in the human body, a crawler's (leeches, adders: biters only), or the wolves (grunts only). */
  family?: EnemyFamily;
  /** Which of its family's looks for its behaviour. */
  variant?: number;
  /** One of its family's named fighters in place of its behaviour's (FamilyDef.named): a leader, a boss. */
  named?: string;
  /** Its behaviour's level-1 numbers, if not the usual ones (the `?duel` duelist). */
  def?: EnemyConfig;
  /** Lie hidden where it stands until you come near or it's called to fight (EnemyTraits.lurks). */
  lurks?: boolean;
}

// ---------------------------------------------------------------- biters

/** A crawler's poses, made once for each kind of body. */
interface CrawlerPoses {
  rest: CrawlerPose;
  recoil: CrawlerPose;
  curl: CrawlerPose;
  strike: CrawlerStrike;
}
/** m inside its full reach a biter starts its lunge from, so a lunge at someone standing still lands. */
const BITE_MARGIN = 0.08;
/** How much of its height a biter swimming keeps under the surface: it rides on the water, its back well clear, so you see it coming. */
const AWASH = 0.25;

const CRAWLER_POSES: Record<CrawlerKind, CrawlerPoses> = {
  leech: { rest: restPose('leech'), recoil: recoilPose('leech'), curl: curlPose('leech'), strike: strikePoses('leech') },
  snake: { rest: restPose('snake'), recoil: recoilPose('snake'), curl: curlPose('snake'), strike: strikePoses('snake') },
};

/**
 * A small fighter on the ground, in the crawler body (models/crawler.ts): a
 * leech or an adder. It closes in and takes its turn as a grunt does, but
 * lunges low, at your legs (a `low` attack): look down, and block with the
 * shield or the blade held low, or step back out of its reach. It swims on
 * water, its back awash; struck dead, it curls up and rolls belly up.
 */
export class Biter extends MeleeEnemy {
  /** m its middle is thrown forward (or drawn back) by its lunge, eased home when a stagger cuts it short. */
  private thrown = 0;

  /** Its body's look: the leeches' by variant, or the adder. */
  private get dress() {
    return CRAWLER_LOOKS[crawlerLook(this.family === 'snake' ? 'snake' : 'leech', this.variant)];
  }

  private get build(): CrawlerBuild {
    return this.dress.build;
  }

  private get poses(): CrawlerPoses {
    return CRAWLER_POSES[this.dress.kind];
  }

  protected barHeight(): number {
    return this.build.height + 0.35;
  }

  protected idlePose(): BodyPose {
    return this.poses.rest;
  }

  protected staggerPose(): BodyPose {
    return this.poses.recoil;
  }

  protected attackPoses(): CrawlerStrike {
    return this.poses.strike;
  }

  protected walkOffsets(phase: number, amount: number, out: Record<string, [number, number, number]>): void {
    crawlOffsets(this.dress.kind, phase, amount, out);
  }

  protected strideRate(): number {
    return crawlRate(this.dress.kind, this.build, this.def.speed);
  }

  /** A blow that doesn't stagger it jerks its front up. */
  protected flinchBy(amount: number): void {
    this.rig.bones.fore1.rotation.x -= amount * 1.2;
  }

  /** Its lunge throws its middle along its length; a leech's ripple lifts it a little as it crawls. */
  protected placeRoot(_bob: number, dt: number): void {
    if (this.state === 'attack' && this.attack) this.thrown = lungeAt(this.poses.strike, this.phase, this.phaseProgress) * this.build.length;
    else this.thrown *= Math.exp(-10 * dt);
    this.rig.setHipOffset(0, crawlRise(this.dress.kind, this.build) * this.pace, this.thrown);
  }

  /** On the bottom, or swimming where the water's over it, its back awash. */
  protected standY(ground: Ground, x: number, z: number): number {
    const bed = ground.heightAt(x, z);
    const water = ground.waterAt?.(x, z) ?? null;
    return water === null ? bed : Math.max(bed, water - this.build.height * AWASH);
  }

  /** Light: blows knock it about. */
  protected knockbackScale(): number {
    return 1.3;
  }

  /** Its hurt capsule lies along it, from the root of its tail to its snout, a body's radius round. */
  capsule(outBottom: Vector3, outTop: Vector3): void {
    const { height } = this.build;
    const l = segmentLength(this.build);
    outBottom.set(0, height * 0.5, 0).applyMatrix4(this.rig.bones.aft3.matrixWorld);
    outTop.set(0, height * 0.5, l * 0.6).applyMatrix4(this.rig.bones.head.matrixWorld);
  }

  /** Its head, for a crit. */
  headSphere(outCentre: Vector3): number {
    const l = segmentLength(this.build);
    outCentre.set(0, this.build.height * 0.5, l * 0.6).applyMatrix4(this.rig.bones.head.matrixWorld);
    return Math.max(0.07, this.build.width * 0.7);
  }

  /** Curled up tight as it dies, then rolled belly up, then gone into the ground. */
  protected updateDeath(dt: number): boolean {
    const t = this.stateTime;
    this.material.emissive.setRGB(0, 0, 0);
    this.material.telegraph.setRGB(0, 0, 0);
    this.healthBar.root.visible = false;
    this.rig.apply(blendPoses(this.pose, this.poses.curl, 1 - Math.exp(-8 * dt), _scratch, CRAWLER_BONES));
    for (const [bone, turn] of Object.entries(_scratch)) this.pose[bone] = [...turn];
    this.thrown *= Math.exp(-10 * dt);
    this.rig.setHipOffset(0, 0, this.thrown);
    // Over onto its back about its length, lifted by its own height as it goes so it stays on the ground.
    const u = Math.min(1, Math.max(0, (t - 0.3) / 0.5));
    const roll = u * u * (3 - 2 * u);
    const h = this.build.height;
    this.visual.rotation.z = Math.PI * roll;
    this.visual.position.y = h * roll + h * 0.8 * Math.sin(Math.PI * roll) - (t > 1.8 ? (t - 1.8) * 0.12 : 0);
    return t < 3.2;
  }
}

// ---------------------------------------------------------------- wolves

const easeIn = (t: number) => t * t;

/**
 * A wolf (CONFIG.wolf), on the four-legged body (enemies/wolf.ts): a grunt's
 * turn-taking, but each of its attacks starts from its own distance, the
 * spring from a few metres out (`from` to `reach`) and the bite up close, and
 * in between it closes in. The spring carries it at you (its `surge`, in
 * Enemy) and up off the ground (`leap`, here). Struck dead, it rolls onto its side.
 */
export class Wolf extends MeleeEnemy {
  /** m it's up off the ground, mid-spring. */
  private lift = 0;

  protected chooseAttack(dist: number): AttackConfig | null {
    const fits = this.def.attacks.filter((a) => dist >= (a.from ?? 0) && dist <= (a.reach ?? this.def.attackRange));
    return fits.length ? this.pick(fits) : null;
  }

  protected barHeight(): number {
    return WOLF_HEIGHT + 0.28;
  }

  protected idlePose(): BodyPose {
    return WOLF_IDLE;
  }

  protected staggerPose(): BodyPose {
    return WOLF_STAGGER;
  }

  protected attackPoses(attack: AttackConfig): WolfStrike {
    return wolfStrike(attack);
  }

  /** It trots: diagonal pairs of legs together. */
  protected walkOffsets(phase: number, amount: number, out: Record<string, [number, number, number]>): void {
    gait(phase, amount, WOLF_SWING, 1, out);
  }

  protected strideRate(): number {
    return (2 * Math.PI * this.def.speed) / WOLF_STRIDE;
  }

  /** A blow that doesn't stagger it throws its head up. */
  protected flinchBy(amount: number): void {
    this.rig.bones.neck.rotation.x -= amount * 1.2;
  }

  /** Bobbing as it trots, and up off the ground at the height of its spring. */
  protected placeRoot(bob: number, dt: number): void {
    const a = this.attack;
    if (this.state === 'attack' && a?.leap && this.phase === 'active') this.lift = a.leap * Math.sin(Math.PI * this.phaseProgress);
    else this.lift *= Math.exp(-14 * dt);
    this.rig.setHipOffset(0, bob + this.lift, 0);
  }

  /** Light: blows knock it about. */
  protected knockbackScale(): number {
    return 1.2;
  }

  /** Its hurt capsule runs along its back, from its hips to its head. */
  capsule(outBottom: Vector3, outTop: Vector3): void {
    this.rig.bones.hips.getWorldPosition(outBottom);
    this.rig.bones.head.getWorldPosition(outTop);
  }

  /** Its head, for a crit. */
  headSphere(outCentre: Vector3): number {
    outCentre.set(...WOLF_HEAD.centre).applyMatrix4(this.rig.bones.head.matrixWorld);
    return WOLF_HEAD.radius;
  }

  /** Rolled over onto its side, legs loose, then gone into the ground. */
  protected updateDeath(dt: number): boolean {
    const t = this.stateTime;
    this.material.emissive.setRGB(0, 0, 0);
    this.material.telegraph.setRGB(0, 0, 0);
    this.healthBar.root.visible = false;
    this.rig.apply(blendPoses(this.pose, WOLF_DEAD, 1 - Math.exp(-6 * dt), _scratch, QUAD_BONES));
    for (const [bone, turn] of Object.entries(_scratch)) this.pose[bone] = [...turn];
    this.lift *= Math.exp(-14 * dt);
    this.rig.setHipOffset(0, this.lift, 0);
    // Over about its length, slid back under where it stood, its middle kept a little off the ground as it lies.
    const roll = (Math.PI / 2) * 0.95 * easeIn(Math.min(1, t / 0.8));
    this.visual.rotation.z = roll;
    this.visual.position.x = WOLF_MIDDLE * Math.sin(roll);
    this.visual.position.y = 0.1 * Math.sin(roll) - (t > 1.6 ? (t - 1.6) * 0.5 : 0);
    return t < 3.4;
  }
}

/**
 * An enemy with the behaviour `kind` and its family's body, standing at (x, z),
 * at its level and in a camp or not. The arena's are undead, level 1 and in no
 * camp, so they play with the numbers in CONFIG as they are.
 */
export function createEnemy(kind: EnemyKind, x: number, z: number, options: EnemyOptions = {}): Enemy {
  const { level = 1, inCamp = false, family = 'undead', variant = 0, named, lurks } = options;
  if (family === 'wolf') {
    // Wolves fight as grunts, with their own numbers, in one of their coats.
    if (kind !== 'grunt') throw new Error(`Wolves fight as grunts, not as a ${kind}`);
    const def = enemyNumbers(options.def ?? CONFIG.wolf, level, inCamp);
    return new Wolf(kind, x, z, { family, variant, level, def, model: (material) => ({ rig: buildWolf(variant, material), weapon: wolfBite() }) });
  }
  const traits = { family, variant, named, lurks, level, def: enemyNumbers(options.def ?? CONFIG.enemies[kind], level, inCamp) };
  switch (kind) {
    case 'grunt':
      return new Grunt(kind, x, z, traits);
    case 'archer':
      return new Archer(kind, x, z, traits);
    case 'brute':
      return new Brute(kind, x, z, traits);
    case 'warden':
      return new Warden(kind, x, z, traits);
    case 'biter': {
      // Biters are crawlers: leeches, unless they're adders. Each strikes from as far as its own lunge reaches your legs.
      const crawler = family === 'snake' ? 'snake' : 'leech';
      const look = crawlerLook(crawler, variant);
      const weapon = crawlerWeapon(look);
      const attackRange = strikeReach(look) + CONFIG.player.body.legsRadius + weapon.radius - BITE_MARGIN;
      return new Biter(kind, x, z, {
        ...traits,
        family: crawler,
        def: { ...traits.def, attackRange },
        model: (material) => ({ rig: buildCrawler(look, material), weapon }),
      });
    }
  }
}
