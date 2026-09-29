import { CONFIG, type EnemyConfig } from './config';
import type { CampId } from './maps/types';
import { CHAIN, CHAIN_DONE, type Item, type Objective, type QuestId, RETURN_TO_HALE, type Sword } from './quests';

// The rules of progress in the Adventure, with no three.js in it: events in,
// effects and answers out. The Adventure feeds it what happens in the world
// and turns its effects into floats, sounds, your numbers and what Hale and
// the tracker show; later the save stores it. Levels, XP and Marshal Hale's
// quest chain live here (.scratch/oakvale-starting-zone/spec.md, "The adventure state").

/** What you can use besides the sword, the shield and the dash, once your level brings it. */
export type Ability = 'warCry' | 'earthshaker';

/** What a slain enemy was, for the XP it pays. */
export type Role = 'ordinary' | 'leader' | 'deepBrute' | 'warden' | 'raised';

/** Every ability, in the order the levels bring them. */
export const ABILITIES = Object.keys(CONFIG.levels.unlocks) as Ability[];

/** Where a quest stands. Only one is ever offered, under way or ready at a time; none goes back a stage. */
export type Stage = 'locked' | 'offered' | 'active' | 'ready' | 'handedIn';

/** Something that happened in the world that progress may care about. */
export type AdventureEvent =
  | {
      readonly kind: 'kill';
      /** The id of the camp it belonged to, or null for none (the Warden, what it raises). */
      readonly camp: CampId | null;
      /** The enemy's own level. */
      readonly level: number;
      readonly role: Role;
    }
  /** "Accept" on Hale's board: take the quest on offer. */
  | { readonly kind: 'accept' }
  /** "Hand in" on Hale's board: give back the quest that's ready. */
  | { readonly kind: 'handIn' }
  /** Something picked up by hand (the leader's orders). */
  | { readonly kind: 'pickup'; readonly item: Item };

/** What an event did, for the Adventure to show. */
export type Effect =
  | { readonly kind: 'xp'; readonly amount: number }
  /** A level reached, with the abilities it brings. */
  | { readonly kind: 'level'; readonly level: number; readonly unlocks: readonly Ability[] }
  /** A quest moved on a stage: offered, taken (active), ready, or handed in. */
  | { readonly kind: 'quest'; readonly quest: QuestId; readonly stage: Stage }
  /** One of a quest's objectives counted one more: `count` of its need. */
  | { readonly kind: 'progress'; readonly quest: QuestId; readonly objective: number; readonly count: number }
  /** A new sword in your hand. */
  | { readonly kind: 'sword'; readonly sword: Sword };

/** A button on Hale's board: Accept, Not now, Hand in, Goodbye. */
export type Button = 'accept' | 'notNow' | 'handIn' | 'goodbye';

/** The stages Hale shows a quest in: the chain's first quest not handed in is always in one of them. */
type ShownStage = 'offered' | 'active' | 'ready';

/** What Marshal Hale shows you. */
export interface HaleShows {
  /**
   * The marker over their head, by the stage of the quest they have for you:
   * a gold "!" while it's offered, a grey "?" while it's under way, a gold "?"
   * once it's ready. None once the chain is done.
   */
  readonly marker: ShownStage | null;
  /** What they say on the board. */
  readonly line: string;
  readonly buttons: readonly Button[];
}

/** The quest you're on, as the tracker shows it. */
export interface Tracker {
  readonly title: string;
  /** One per objective with its count, or just "Return to Marshal Hale" once they're all done. */
  readonly lines: readonly string[];
}

const BUTTONS: Record<ShownStage, readonly Button[]> = {
  offered: ['accept', 'notNow'],
  active: ['goodbye'],
  ready: ['handIn'],
};

/** Your numbers at a level. */
export interface Stats {
  /** Full health. */
  readonly maxHp: number;
  /** Every blow you deal is multiplied by this. */
  readonly damage: number;
  readonly abilities: readonly Ability[];
}

/** The step a level brings, to your damage and to an enemy's health and damage: 1 at level 1. */
const stepAt = (level: number) => 1 + CONFIG.levels.step * (level - 1);

/** Your numbers at `level`. */
export function statsAt(level: number): Stats {
  const L = CONFIG.levels;
  return {
    maxHp: CONFIG.player.maxHp + L.health * (level - 1),
    damage: stepAt(level),
    abilities: ABILITIES.filter((a) => L.unlocks[a] <= level),
  };
}

/**
 * An enemy's numbers at `level`: its behaviour's health and every blow's
 * damage take the same step per level as yours, and a camp's members take
 * `CONFIG.camps.strength` on top. Level 1 out of a camp is the arena's.
 */
export function enemyNumbers(def: EnemyConfig, level: number, inCamp: boolean): EnemyConfig {
  const k = stepAt(level) * (inCamp ? CONFIG.camps.strength : 1);
  return { ...def, hp: Math.round(def.hp * k), attacks: def.attacks.map((a) => ({ ...a, damage: Math.round(a.damage * k) })) };
}

/** Does a kill count towards an objective? Only a kill objective's own camp, or its role. */
const credits = (o: Objective, camp: CampId | null, role: Role) =>
  o.kind === 'kill' && (o.camp === undefined || o.camp === camp) && (o.role === undefined || o.role === role);

/** One character's progress. */
export class AdventureState {
  /** XP in all. */
  private total = 0;
  /** Each quest of the chain's stage: the first is on offer from the start. */
  private readonly stages: Stage[] = CHAIN.map((_, i) => (i === 0 ? 'offered' : 'locked'));
  /** Each quest's objectives' counts. */
  private readonly counts: number[][] = CHAIN.map((q) => q.objectives.map(() => 0));
  private held: Sword = 'plain';

  get level(): number {
    return 1 + this.reached.length;
  }

  /** XP in all, since level 1. */
  get xp(): number {
    return this.total;
  }

  /** XP still needed for the next level: 0 at the cap. */
  get xpToNext(): number {
    const next = this.next;
    return next === undefined ? 0 : next - this.total;
  }

  /** How far through this level you are, 0 to 1: full at the cap. */
  get progress(): number {
    const next = this.next;
    if (next === undefined) return 1;
    const from = this.reached.at(-1) ?? 0;
    return (this.total - from) / (next - from);
  }

  /** The XP totals of the levels you've reached above 1. */
  private get reached(): readonly number[] {
    return CONFIG.levels.xp.filter((at) => at <= this.total);
  }

  /** The XP total of the next level, or undefined at the cap. */
  private get next(): number | undefined {
    return CONFIG.levels.xp.find((at) => at > this.total);
  }

  get stats(): Stats {
    return statsAt(this.level);
  }

  /** The sword in your hand. */
  get sword(): Sword {
    return this.held;
  }

  /** The chain's quest Hale has for you (on offer, under way or ready), or -1 once it's all handed in. */
  private get current(): number {
    return this.stages.findIndex((s) => s !== 'handedIn');
  }

  /** The marker over Hale, and their line and buttons on the board. */
  get hale(): HaleShows {
    const i = this.current;
    if (i < 0) return { marker: null, line: CHAIN_DONE, buttons: ['goodbye'] };
    const stage = this.stages[i] as ShownStage;
    return { marker: stage, line: CHAIN[i].says[stage], buttons: BUTTONS[stage] };
  }

  /** The quest you're on, or null while you have none. */
  get tracker(): Tracker | null {
    const i = this.current;
    const stage = this.stages[i];
    if (stage !== 'active' && stage !== 'ready') return null;
    const quest = CHAIN[i];
    const lines = stage === 'ready' ? [RETURN_TO_HALE] : quest.objectives.map((o, k) => `${o.text}: ${this.counts[i][k]}/${o.need}`);
    return { title: quest.title, lines };
  }

  /** Take in what happened; returns what it did. */
  apply(event: AdventureEvent): Effect[] {
    switch (event.kind) {
      case 'kill': {
        const L = CONFIG.levels;
        const xp = this.earn(L.killXp * event.level * L.roles[event.role]);
        return [...xp, ...this.count((o) => credits(o, event.camp, event.role))];
      }
      case 'pickup':
        return this.count((o) => o.kind === 'pickup' && o.item === event.item);
      case 'accept':
        return this.accept();
      case 'handIn':
        return this.handIn();
    }
  }

  /** Take the quest on offer. */
  private accept(): Effect[] {
    const i = this.current;
    if (this.stages[i] !== 'offered') return [];
    this.stages[i] = 'active';
    return [{ kind: 'quest', quest: CHAIN[i].id, stage: 'active' }];
  }

  /** Give back the quest that's ready: its XP, any sword, and the next quest on offer. */
  private handIn(): Effect[] {
    const i = this.current;
    if (this.stages[i] !== 'ready') return [];
    const quest = CHAIN[i];
    this.stages[i] = 'handedIn';
    const effects: Effect[] = [{ kind: 'quest', quest: quest.id, stage: 'handedIn' }, ...this.earn(quest.xp)];
    if (quest.sword) {
      this.held = quest.sword;
      effects.push({ kind: 'sword', sword: quest.sword });
    }
    const next = CHAIN[i + 1];
    if (next) {
      this.stages[i + 1] = 'offered';
      effects.push({ kind: 'quest', quest: next.id, stage: 'offered' });
    }
    return effects;
  }

  /**
   * One more on each objective of the quest under way that `matches` and isn't
   * done yet; the quest is ready once they all are. Nothing counts for a
   * quest not yet taken, or one already ready.
   */
  private count(matches: (o: Objective) => boolean): Effect[] {
    const i = this.current;
    if (this.stages[i] !== 'active') return [];
    const quest = CHAIN[i];
    const have = this.counts[i];
    const effects: Effect[] = [];
    quest.objectives.forEach((o, k) => {
      if (!matches(o) || have[k] >= o.need) return;
      have[k]++;
      effects.push({ kind: 'progress', quest: quest.id, objective: k, count: have[k] });
    });
    if (effects.length && quest.objectives.every((o, k) => have[k] >= o.need)) {
      this.stages[i] = 'ready';
      effects.push({ kind: 'quest', quest: quest.id, stage: 'ready' });
    }
    return effects;
  }

  /** Gain XP, up to the cap: the XP kept, then each level it reaches. */
  private earn(xp: number): Effect[] {
    const L = CONFIG.levels;
    // Past the cap, XP is dropped.
    const cap = L.xp[L.xp.length - 1];
    const amount = Math.min(xp, cap - this.total);
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
