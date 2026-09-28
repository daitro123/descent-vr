import { CONFIG, type EnemyConfig } from './config';

// The rules of progress in the Adventure, with no three.js in it: events in,
// effects and answers out. The Adventure feeds it what happens in the world
// and turns its effects into floats, sounds and your numbers; later the save
// stores it. Levels and XP live here; quests join it next
// (.scratch/oakvale-starting-zone/spec.md, "The adventure state").

/** What you can use besides the sword, the shield and the dash, once your level brings it. */
export type Ability = 'warCry' | 'earthshaker';

/** What a slain enemy was, for the XP it pays. */
export type Role = 'ordinary' | 'leader' | 'deepBrute' | 'warden' | 'raised';

/** Something that happened in the world that progress may care about. */
export type AdventureEvent = {
  readonly kind: 'kill';
  /** The camp it belonged to, or null for none (the Warden, what it raises). */
  readonly camp: string | null;
  readonly level: number;
  readonly role: Role;
};

/** What an event did, for the Adventure to show. */
export type Effect =
  | { readonly kind: 'xp'; readonly amount: number }
  /** A level reached, with the abilities it brings. */
  | { readonly kind: 'level'; readonly level: number; readonly unlocks: readonly Ability[] };

/** Your numbers at a level. */
export interface Stats {
  /** Full health. */
  readonly maxHp: number;
  /** Every blow you deal is multiplied by this. */
  readonly damage: number;
  readonly abilities: readonly Ability[];
}

/** Your numbers at `level`. */
export function statsAt(level: number): Stats {
  const L = CONFIG.levels;
  const above = level - 1;
  return {
    maxHp: CONFIG.player.maxHp + L.health * above,
    damage: 1 + L.step * above,
    abilities: (Object.keys(L.unlocks) as Ability[]).filter((a) => L.unlocks[a] <= level),
  };
}

/**
 * An enemy's numbers at `level`: its behaviour's health and every blow's
 * damage take the same step per level as yours, and a camp's members take
 * `CONFIG.camps.strength` on top. Level 1 out of a camp is the arena's.
 */
export function enemyNumbers(def: EnemyConfig, level: number, camp: boolean): EnemyConfig {
  const k = (1 + CONFIG.levels.step * (level - 1)) * (camp ? CONFIG.camps.strength : 1);
  return { ...def, hp: Math.round(def.hp * k), attacks: def.attacks.map((a) => ({ ...a, damage: Math.round(a.damage * k) })) };
}

/** One character's progress. */
export class AdventureState {
  /** XP in all. */
  private total = 0;

  get level(): number {
    return 1 + CONFIG.levels.xp.filter((at) => at <= this.total).length;
  }

  /** XP in all, since level 1. */
  get xp(): number {
    return this.total;
  }

  /** XP still needed for the next level: 0 at the cap. */
  get xpToNext(): number {
    const next = CONFIG.levels.xp.find((at) => at > this.total);
    return next === undefined ? 0 : next - this.total;
  }

  /** How far through this level you are, 0 to 1: full at the cap. */
  get progress(): number {
    const L = CONFIG.levels.xp;
    const next = L.find((at) => at > this.total);
    if (next === undefined) return 1;
    const from = L.filter((at) => at <= this.total).pop() ?? 0;
    return (this.total - from) / (next - from);
  }

  get stats(): Stats {
    return statsAt(this.level);
  }

  /** Take in what happened; returns what it did. */
  apply(event: AdventureEvent): Effect[] {
    const L = CONFIG.levels;
    // Past the cap, XP is dropped.
    const cap = L.xp[L.xp.length - 1];
    const amount = Math.min(L.killXp * event.level * L.roles[event.role], cap - this.total);
    if (amount <= 0) return [];
    const was = this.level;
    this.total += amount;
    const effects: Effect[] = [{ kind: 'xp', amount }];
    for (let level = was + 1; level <= this.level; level++) {
      const unlocks = statsAt(level).abilities.filter((a) => !statsAt(level - 1).abilities.includes(a));
      effects.push({ kind: 'level', level, unlocks });
    }
    return effects;
  }
}
