import { Vector3 } from 'three';
import { enemyNumbers } from '../adventureState';
import { type AttackConfig, CONFIG, type EnemyConfig } from '../config';
import type { EnemyKind, Family } from '../models/characters';
import { Enemy, type EnemyContext, numbersOf } from './enemy';

// Each enemy type exists to test the player in a different way:
//   grunt   directional melee: read the wind-up, block on the right side, or hit first
//   archer  ranged pressure: keep the shield up, close the gap, or bat arrows back
//   brute   armour and a slam you can't block: patience, then punish the stuck maul
//   warden  the boss: a three-hit combo to block in turn, a slam, and summoned help

const _dir = new Vector3();

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
    // The slam lands a maul-length away, so it's the answer to a player who
    // keeps their distance: that far for a brute's reach, further for a giant's.
    const k = this.def.attackRange / CONFIG.enemies.brute.attackRange;
    if (dist > 1.2 * k && dist < 2.3 * k && Math.random() < 0.5) return slam;
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
  /** Who it is: the undead (skeletons, the default) or the bandits (the human body). */
  family?: Family;
  /** Which of its family's looks for its behaviour. */
  variant?: number;
  /** One of its family's named fighters in place of its behaviour's (FamilyDef.named): a leader, a boss. */
  named?: string;
  /** Its behaviour's level-1 numbers, if not the usual ones (the `?duel` duelist). */
  def?: EnemyConfig;
}

/**
 * An enemy with the behaviour `kind` and its family's body, standing at (x, z),
 * at its level and in a camp or not. The arena's are undead, level 1 and in no
 * camp, so they play with the numbers in CONFIG as they are.
 */
export function createEnemy(kind: EnemyKind, x: number, z: number, options: EnemyOptions = {}): Enemy {
  const { level = 1, inCamp = false, family = 'undead', variant = 0, named } = options;
  const traits = { family, variant, named, level, def: enemyNumbers(options.def ?? numbersOf(kind, family, named), level, inCamp) };
  switch (kind) {
    case 'grunt':
      return new Grunt(kind, x, z, traits);
    case 'archer':
      return new Archer(kind, x, z, traits);
    case 'brute':
      return new Brute(kind, x, z, traits);
    case 'warden':
      return new Warden(kind, x, z, traits);
  }
}
