import { type Ability, abilitiesAt, type ClassId, type MainAttribute, mainOf, type Resource, resourceOf } from './classes';
import { CONFIG, type EnemyConfig } from './config';
import { Inventory, type InventoryEffect, type InventorySave } from './inventory';
import { type ProfessionEffect, Professions, type ProfessionsSave, type RecipeId, type SpotKind } from './professions/professions';
import { attributesAt, itemOf, type Worn, WORN_NOTHING } from './items';
import { chestSeed, type Loot, rollChest, rollLoot, seeded } from './loot';
import type { CampId } from './maps/types';
import type { Family } from './models/characters';
import { BARKS, type Chain, CHAINS, type GiverId, type Item, type Objective, type Place, type Quest, type QuestId, type Sword, SWORDS, type VillagerId } from './quests';

// The rules of progress in the Adventure, with no three.js in it: events in,
// effects and answers out. The Adventure feeds it what happens in the world
// and turns its effects into floats, sounds, your numbers and what Hale and
// the tracker show; the save keeps its snapshot. Levels, XP and the quest
// givers' chains live here: Marshal Hale's, and the trainers' once they come
// (.scratch/oakvale-starting-zone/spec.md, "The adventure state";
// .scratch/professions/spec.md, "Trainers and quests"). So does the
// character's class, and what it makes of their level: attributes, health,
// damage, resource and abilities (.scratch/abilities/spec.md, "The adventure
// state learns classes").

export { ABILITIES, type Ability, type ClassId } from './classes';

/** What a slain enemy was, for the XP it pays. */
export type Role = 'ordinary' | 'leader' | 'deepBrute' | 'warden' | 'raised';

/** Every stage, in the order a quest goes through them. */
export const STAGES = ['locked', 'offered', 'active', 'ready', 'handedIn'] as const;

/** Where a quest stands. Only one of a chain's is ever offered, under way or ready at a time; none goes back a stage. */
export type Stage = (typeof STAGES)[number];

/** One quest, as the save keeps it. */
export interface QuestProgress {
  readonly stage: Stage;
  /** Each objective's count, in the quest's order: The Lumber Camp's second is its orders, 1 once taken. */
  readonly counts: readonly number[];
  /**
   * While it's under way or ready, its place in the order those were taken,
   * from 1: the tracker lists them in it. None otherwise, or in an older record.
   */
  readonly taken?: number;
}

/** One character's progress, as the save keeps it: a snapshot of the state, and what restores it. */
export interface Progress {
  readonly level: number;
  /** XP in all, since level 1. */
  readonly xp: number;
  /** Each quest of every chain, by id. */
  readonly quests: Readonly<Record<QuestId, QuestProgress>>;
  readonly wardenBeaten: boolean;
  /** The bag, gear, belt, coins, stash and chests opened. */
  readonly inventory: InventorySave;
  /** The professions learned, with their proficiency and grade, and the recipes known. */
  readonly professions: ProfessionsSave;
}

/** Something that happened in the world that progress may care about. */
export type AdventureEvent =
  | {
      readonly kind: 'kill';
      /** The id of the camp it belonged to, or null for none (the Warden, what it raises). */
      readonly camp: CampId | null;
      /** The enemy's own level. */
      readonly level: number;
      readonly role: Role;
      /** Who it was, for the junk it drops. */
      readonly family: Family;
      /** Its loot's seed: from the camp, the enemy and the time (loot.ts, lootSeed). */
      readonly seed: number;
    }
  /** "Accept" on a giver's board (Hale's without one): take the quest they have on offer. */
  | { readonly kind: 'accept'; readonly giver?: GiverId }
  /** "Hand in" on a giver's board (Hale's without one): give back the quest of theirs that's ready. */
  | { readonly kind: 'handIn'; readonly giver?: GiverId }
  /** Something picked up by hand (the leader's orders). */
  | { readonly kind: 'pickup'; readonly item: Item }
  /** A chest's lid touched: it opens for good, and what's inside comes out on the ground. */
  | {
      readonly kind: 'chest';
      /** Its id in the zone's plan, as the save keeps it. */
      readonly chest: string;
      /** Its area's level: what it holds goes by it. */
      readonly level: number;
    }
  /** A spot of a kind gathered: the professions module's own effect, passed straight in. */
  | { readonly kind: 'gathered'; readonly spot: SpotKind }
  /** A recipe made (into the bag or left on the station): the professions module's own effect, passed straight in. */
  | { readonly kind: 'made'; readonly recipe: RecipeId };

/** What an event did, for the Adventure to show. */
export type Effect =
  | { readonly kind: 'xp'; readonly amount: number }
  /** A level reached, with the abilities it brings your class. */
  | { readonly kind: 'level'; readonly level: number; readonly unlocks: readonly Ability[] }
  /** A quest moved on a stage: offered, taken (active), ready, or handed in. */
  | { readonly kind: 'quest'; readonly quest: QuestId; readonly stage: Stage }
  /** One of a quest's objectives counted one more: `count` of its need. */
  | { readonly kind: 'progress'; readonly quest: QuestId; readonly objective: number; readonly count: number }
  /** A kill's or a chest's drop, lying on the ground: a pouch of coins and each item beside it. Not saved until taken. */
  | ({ readonly kind: 'loot' } & Loot)
  /** What happened to your things: a reward put straight into your hand, say. */
  | InventoryEffect
  /** What happened to your professions: one learned, proficiency gained, a recipe known. */
  | ProfessionEffect;

/** A button on a giver's board: Accept, Not now, Hand in, Goodbye. */
export type Button = 'accept' | 'notNow' | 'handIn' | 'goodbye';

/** The stages a giver shows a quest in: an open chain's first quest not handed in is always in one of them. */
type ShownStage = 'offered' | 'active' | 'ready';

/** What a quest giver shows you. */
export interface GiverShows {
  /**
   * The marker over their head, by the stage of the quest they have for you:
   * a gold "!" while it's offered, a grey "?" while it's under way, a gold "?"
   * once it's ready. None before their chain opens, or once it's done.
   */
  readonly marker: ShownStage | null;
  /** What they say on the board. */
  readonly line: string;
  readonly buttons: readonly Button[];
}

/** What Marshal Hale shows you: a giver's board and marker. */
export type HaleShows = GiverShows;

/** One quest you're on, as the tracker shows it. */
export interface Tracked {
  readonly title: string;
  /** One per objective with its count, or just "Return to Marshal Hale" (or its giver) once they're all done. */
  readonly lines: readonly string[];
}

/** What the quest arrow points at: the place of the quest you're on, or its giver once it's ready to hand in. */
export type ArrowTarget = Place | GiverId;

/** The quest arrow, as the adventure state answers it: always on the tracker's last quest, the one taken most recently. */
export interface Arrow {
  readonly target: ArrowTarget;
  /** That quest's line it sits beside: the first objective not yet done, or "Return to Marshal Hale". */
  readonly line: number;
}

const BUTTONS: Record<ShownStage, readonly Button[]> = {
  offered: ['accept', 'notNow'],
  active: ['goodbye'],
  ready: ['handIn'],
};

/** Your numbers at a level. */
export interface Stats {
  /** Stamina, your level's and your gear's: health. */
  readonly stamina: number;
  /** Which attribute is your class's main one: Strength, Agility or Intellect. */
  readonly attribute: MainAttribute;
  /** Your class's main attribute, your level's and your gear's: damage. */
  readonly main: number;
  /** Full health. */
  readonly maxHp: number;
  /** Every blow you deal is multiplied by this. */
  readonly damage: number;
  /** Cuts the blows you take (items.ts, armourCut). */
  readonly armour: number;
  /** Your class's rage, focus or mana. */
  readonly resource: Resource;
  /** Your class's base abilities your level has brought, in the order they came. */
  readonly abilities: readonly Ability[];
}

/** The step a level brings to an enemy's health and damage: 1 at level 1. */
const stepAt = (level: number) => 1 + CONFIG.levels.step * (level - 1);

/**
 * Your numbers at `level` as a `klass` (a warrior unless it says), wearing
 * gear that adds up to `worn`. Your level's attributes and your gear's add up
 * by one rule: every point of Stamina is 10 health, and every point of your
 * class's main attribute is a tenth of level 1's damage, so a character
 * without gear has 100 health and deals ×1 at level 1, 180 and ×1.8 at 5.
 * Your weapon's damage rating adds to your damage (Hale's old longsword adds
 * one level's step), and gear's armour cuts what you take.
 */
export function statsAt(level: number, worn: Worn = WORN_NOTHING, klass: ClassId = 'warrior'): Stats {
  const A = CONFIG.items.attribute;
  const stamina = attributesAt(level) + worn.stamina;
  const main = attributesAt(level) + worn.main;
  return {
    stamina,
    attribute: mainOf(klass),
    main,
    maxHp: A.health * stamina,
    damage: A.damage * main + worn.damage,
    armour: worn.armour,
    resource: resourceOf(klass, main),
    abilities: abilitiesAt(klass, level),
  };
}

/** XP in all, since level 1, to reach `level`: level L needs 100 × (L − 1) more than the one before. */
export const xpToReach = (level: number) => (CONFIG.levels.xp * (level - 1) * level) / 2;

/** Does an enemy of `level` pay you XP at yours? Not once it's five or more levels below you. */
export const paysXp = (level: number, yours: number) => yours - level < CONFIG.levels.grey;

/**
 * An enemy's numbers at `level`: its behaviour's health and every blow's
 * damage take the same step per level as yours, and a camp's members take
 * `CONFIG.camps.strength` on top. Level 1 out of a camp is the arena's.
 */
export function enemyNumbers(def: EnemyConfig, level: number, inCamp: boolean): EnemyConfig {
  const k = stepAt(level) * (inCamp ? CONFIG.camps.strength : 1);
  return { ...def, hp: Math.round(def.hp * k), attacks: def.attacks.map((a) => ({ ...a, damage: Math.round(a.damage * k) })) };
}

/** Is it the quest whose objective is the Warden? While it's under way, the Warden sits on its throne. */
const wardenQuest = (q: Quest) => q.objectives.some((o) => o.kind === 'kill' && o.role === 'warden');

/** One quest, as the state holds it. */
interface Held {
  readonly quest: Quest;
  readonly chain: Chain;
  stage: Stage;
  /** Its objectives' counts. */
  readonly counts: number[];
  /** While it's under way or ready, its place in the order those were taken, from 1; 0 otherwise. */
  taken: number;
}

/** Are all of a quest's objectives done? */
const done = (h: Held) => h.quest.objectives.every((o, k) => h.counts[k] >= o.need);

/** Does a kill count towards an objective? Only a kill objective's own camp, or its role. */
const credits = (o: Objective, camp: CampId | null, role: Role) =>
  o.kind === 'kill' && (o.camp === undefined || o.camp === camp) && (o.role === undefined || o.role === role);

/** One character's progress. */
export class AdventureState {
  /** XP in all. */
  private total = 0;
  /** Every giver's chain. */
  private readonly chains: readonly Chain[];
  /** Every quest of every chain, in the chains' order: an open chain's first is on offer from the start. */
  private readonly held: Held[];
  private beaten = false;
  /** Your class: every character is a warrior until the roster (abilities ticket 18) makes others. */
  readonly class: ClassId;
  /** The top level: the content's (CONFIG.levels.cap), unless a test brings its own. */
  readonly cap: number;
  /** Your things, for your class. */
  readonly inventory: Inventory;
  /** Your professions, working on your things. */
  readonly professions: Professions;

  /**
   * A new character, or one restored from a snapshot, with the givers'
   * `chains` (every one in the game, unless a test brings its own), of
   * `options.class` (a warrior unless it says).
   */
  constructor(saved?: Progress, chains: readonly Chain[] = CHAINS, options: { readonly class?: ClassId; readonly cap?: number } = {}) {
    this.class = options.class ?? 'warrior';
    this.cap = options.cap ?? CONFIG.levels.cap;
    const you = this;
    const wearer = { class: this.class, get level() { return you.level; } };
    this.inventory = new Inventory(wearer, saved?.inventory);
    this.professions = new Professions(this.inventory, saved?.professions);
    this.chains = chains;
    this.held = chains.flatMap((chain) => chain.quests.map((quest) => ({ quest, chain, stage: 'locked' as Stage, counts: quest.objectives.map(() => 0), taken: 0 })));
    for (const chain of chains) {
      const first = this.current(chain);
      if (first) first.stage = 'offered';
    }
    if (saved) this.restore(saved);
  }

  /** Your progress, for the save. */
  snapshot(): Progress {
    const quests: Record<QuestId, QuestProgress> = {};
    for (const h of this.held) quests[h.quest.id] = { stage: h.stage, counts: [...h.counts], ...(h.taken ? { taken: h.taken } : {}) };
    return {
      level: this.level,
      xp: this.total,
      quests,
      wardenBeaten: this.beaten,
      inventory: this.inventory.snapshot(),
      professions: this.professions.snapshot(),
    };
  }

  /**
   * Take up a snapshot, keeping the chains' rules whatever it says. A record
   * from another build is taken as best it fits: a level it reached is kept
   * even if levels now need more XP, counts stay within their objectives, a
   * quest under way with every objective done is ready, a quest added after
   * the ones handed in is offered (a chain's first once the chain is open),
   * only an open chain's first quest not handed in can be offered, under way
   * or ready, with nothing counted before it's taken, and the quests under way
   * keep the order they were taken in (the chains' order where it doesn't say).
   */
  private restore(saved: Progress): void {
    const levelNeeds = xpToReach(Math.max(1, Math.min(saved.level, this.cap)));
    this.total = Math.min(Math.max(saved.xp, levelNeeds, 0), xpToReach(this.cap));
    this.beaten = saved.wardenBeaten;
    for (const h of this.held) {
      const kept = saved.quests[h.quest.id] as QuestProgress | undefined;
      if (!kept) continue;
      h.stage = kept.stage;
      h.taken = kept.taken ?? 0;
      h.quest.objectives.forEach((o, k) => (h.counts[k] = Math.max(0, Math.min(o.need, Math.floor(kept.counts[k] ?? 0)))));
    }
    // In the chains' order, so a chain opened by an earlier one's quest sees it as it now stands.
    for (const chain of this.chains) {
      const quests = this.of(chain);
      if (!this.open(chain)) {
        quests.forEach((h) => (h.stage = 'locked'));
        continue;
      }
      const i = quests.findIndex((h) => h.stage !== 'handedIn');
      if (i < 0) continue;
      const h = quests[i];
      if (h.stage === 'locked') h.stage = 'offered';
      if (h.stage === 'active' && done(h)) h.stage = 'ready';
      for (let k = i + 1; k < quests.length; k++) quests[k].stage = 'locked';
    }
    for (const h of this.held) {
      if (h.stage === 'locked' || h.stage === 'offered') h.counts.fill(0);
      if (h.stage !== 'active' && h.stage !== 'ready') h.taken = 0;
    }
    this.renumber();
  }

  get level(): number {
    let level = 1;
    while (level < this.cap && xpToReach(level + 1) <= this.total) level++;
    return level;
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
    const from = xpToReach(this.level);
    return (this.total - from) / (next - from);
  }

  /** The XP total of the next level, or undefined at the cap. */
  private get next(): number | undefined {
    return this.level < this.cap ? xpToReach(this.level + 1) : undefined;
  }

  get stats(): Stats {
    return statsAt(this.level, this.inventory.numbers, this.class);
  }

  /** The sword in your hand, as the main hand's item draws it: null for none. */
  get sword(): Sword | null {
    const id = this.inventory.gear.mainHand;
    const model = id ? itemOf(id)?.model : undefined;
    return SWORDS.find((s) => s === model) ?? null;
  }

  /** Has the Warden fallen? It stays beaten for good. */
  get wardenBeaten(): boolean {
    return this.beaten;
  }

  /** Does the Warden sit on its throne? Only while What Lies Below is under way and it stands: before, and once beaten, the throne is empty. */
  get wardenSeated(): boolean {
    return !this.beaten && this.held.some((h) => wardenQuest(h.quest) && h.stage === 'active');
  }

  /** Does Hale's old longsword still hang at their hip? Until they hand it to you, with the quest that pays it. */
  get haleSwordAtHip(): boolean {
    return this.held.every((h) => h.quest.reward !== 'hale-longsword' || h.stage !== 'handedIn');
  }

  /** A chain's quests, in order. */
  private of(chain: Chain): Held[] {
    return this.held.filter((h) => h.chain === chain);
  }

  /** The quest with id `id`, if some chain has it. */
  private find(id: QuestId): Held | undefined {
    return this.held.find((h) => h.quest.id === id);
  }

  /** Is the chain open: from the start, or once the quest it follows is handed in? */
  private open(chain: Chain): boolean {
    return chain.after === undefined || this.find(chain.after)?.stage === 'handedIn';
  }

  /** The chain's quest its giver has for you (on offer, under way or ready): none while it's closed, or once it's all handed in. */
  private current(chain: Chain): Held | undefined {
    return this.open(chain) ? this.of(chain).find((h) => h.stage !== 'handedIn') : undefined;
  }

  /** The quests under way or ready, in the order they were taken: one per giver at most. */
  private get underWay(): Held[] {
    return this.held.filter((h) => h.stage === 'active' || h.stage === 'ready').sort((a, b) => a.taken - b.taken);
  }

  /** Number the quests under way 1, 2, 3 in the order they were taken. */
  private renumber(): void {
    this.underWay.forEach((h, k) => (h.taken = k + 1));
  }

  /** The marker over `giver`, and their line and buttons on the board. */
  giver(giver: GiverId): GiverShows {
    const chain = this.chains.find((c) => c.giver === giver);
    if (!chain || !this.open(chain)) return { marker: null, line: chain?.closed ?? '', buttons: ['goodbye'] };
    const h = this.current(chain);
    if (!h) return { marker: null, line: chain.done, buttons: ['goodbye'] };
    const stage = h.stage as ShownStage;
    return { marker: stage, line: h.quest.says[stage], buttons: BUTTONS[stage] };
  }

  /** The marker over Marshal Hale, and their line and buttons on the board. */
  get hale(): GiverShows {
    return this.giver('hale');
  }

  /** Every quest you're on, in the order you took them (the newest last): none while you have none. */
  get tracker(): readonly Tracked[] {
    return this.underWay.map((h) => ({
      title: h.quest.title,
      lines: h.stage === 'ready' ? [h.chain.returnTo] : h.quest.objectives.map((o, k) => `${o.text}: ${h.counts[k]}/${o.need}`),
    }));
  }

  /**
   * Where the quest arrow points, and beside which of the tracker's last
   * quest's lines: that's the one you took most recently. Its first objective
   * not yet done's place (the quest's own, unless the objective has one)
   * while it's under way, its giver once it's ready; nothing while you have
   * no quest.
   */
  get arrow(): Arrow | null {
    const h = this.underWay.at(-1);
    if (!h) return null;
    if (h.stage === 'ready') return { target: h.chain.giver, line: 0 };
    const line = h.quest.objectives.findIndex((o, k) => h.counts[k] < o.need);
    return { target: h.quest.objectives[line].place ?? h.quest.place, line };
  }

  /** The line `villager` barks as you pass, for where the chain stands. */
  bark(villager: VillagerId): string {
    const reached = (quest: QuestId, stage: Stage) => {
      const h = this.find(quest);
      return h !== undefined && STAGES.indexOf(h.stage) >= STAGES.indexOf(stage);
    };
    let line = '';
    for (const b of BARKS[villager]) if (!b.from || reached(b.from.quest, b.from.stage)) line = b.line;
    return line;
  }

  /**
   * Does `item` lie where it's found, waiting to be picked up (the leader's
   * orders in their tent)? From when its quest is taken until it's picked up,
   * then gone for good.
   */
  lies(item: Item): boolean {
    return this.held.some(
      (h) => h.stage === 'active' && h.quest.objectives.some((o, k) => o.kind === 'pickup' && o.item === item && h.counts[k] < o.need),
    );
  }

  /** Take in what happened; returns what it did. */
  apply(event: AdventureEvent): Effect[] {
    switch (event.kind) {
      case 'kill': {
        if (event.role === 'warden') this.beaten = true;
        const L = CONFIG.levels;
        // A grey enemy, five or more levels below you, pays no XP, but still drops loot and counts for your quests.
        const xp = paysXp(event.level, this.level) ? this.earn(L.killXp * event.level * L.roles[event.role]) : [];
        const loot = rollLoot(event, this.class, seeded(event.seed));
        const drop: Effect[] = loot.coins > 0 || loot.items.length ? [{ kind: 'loot', ...loot }] : [];
        return [...drop, ...xp, ...this.count((o) => credits(o, event.camp, event.role))];
      }
      case 'pickup':
        return this.count((o) => o.kind === 'pickup' && o.item === event.item);
      case 'chest':
        return this.openChest(event.chest, event.level);
      case 'gathered':
        return this.count((o) => o.kind === 'gather' && o.spot === event.spot);
      case 'made':
        return this.count((o) => o.kind === 'make' && o.recipe === event.recipe);
      case 'accept':
        return this.accept(event.giver ?? 'hale');
      case 'handIn':
        return this.handIn(event.giver ?? 'hale');
    }
  }

  /**
   * Open chest `id` at `level`, once per character: it's recorded open, and
   * what it holds, rolled from the chest and the character, comes out as a
   * drop. Every character is a warrior for now, so the class stands for the
   * character in the seed until the roster brings each its own id.
   */
  private openChest(id: string, level: number): Effect[] {
    if (this.inventory.isOpened(id)) return [];
    const loot = rollChest(level, this.class, seeded(chestSeed(id, this.class)));
    return [...this.inventory.openChest(id), { kind: 'loot', ...loot }];
  }

  /** The chain's quest `giver` has for you, if they have a chain. */
  private offeredBy(giver: GiverId): Held | undefined {
    const chain = this.chains.find((c) => c.giver === giver);
    return chain && this.current(chain);
  }

  /** Take the quest `giver` has on offer: it goes to the bottom of the tracker. */
  private accept(giver: GiverId): Effect[] {
    const h = this.offeredBy(giver);
    if (h?.stage !== 'offered') return [];
    h.stage = 'active';
    h.taken = this.underWay.length;
    return [{ kind: 'quest', quest: h.quest.id, stage: 'active' }];
  }

  /**
   * Give back `giver`'s quest that's ready: its XP, any reward (straight into
   * your hand), the next quest of their chain on offer, and the first of every
   * chain it opens.
   */
  private handIn(giver: GiverId): Effect[] {
    const h = this.offeredBy(giver);
    if (h?.stage !== 'ready') return [];
    const { quest } = h;
    h.stage = 'handedIn';
    h.taken = 0;
    this.renumber();
    const effects: Effect[] = [{ kind: 'quest', quest: quest.id, stage: 'handedIn' }, ...this.earn(quest.xp)];
    if (quest.reward) effects.push(...this.inventory.wear(quest.reward));
    const opened = [h.chain, ...this.chains.filter((c) => c.after === quest.id)];
    for (const next of opened.map((c) => this.current(c))) {
      if (next?.stage !== 'locked') continue;
      next.stage = 'offered';
      effects.push({ kind: 'quest', quest: next.quest.id, stage: 'offered' });
    }
    return effects;
  }

  /**
   * One more on each objective of every quest under way that `matches` and
   * isn't done yet; a quest is ready once they all are. Nothing counts for a
   * quest not yet taken, or one already ready.
   */
  private count(matches: (o: Objective) => boolean): Effect[] {
    const effects: Effect[] = [];
    for (const h of this.held) {
      if (h.stage !== 'active') continue;
      const counted = effects.length;
      h.quest.objectives.forEach((o, k) => {
        if (!matches(o) || h.counts[k] >= o.need) return;
        h.counts[k]++;
        effects.push({ kind: 'progress', quest: h.quest.id, objective: k, count: h.counts[k] });
      });
      if (effects.length > counted && done(h)) {
        h.stage = 'ready';
        effects.push({ kind: 'quest', quest: h.quest.id, stage: 'ready' });
      }
    }
    return effects;
  }

  /** Gain XP, up to the cap: the XP kept, then each level it reaches. */
  private earn(xp: number): Effect[] {
    // Past the cap, XP is dropped.
    const amount = Math.min(xp, xpToReach(this.cap) - this.total);
    if (amount <= 0) return [];
    const was = this.level;
    this.total += amount;
    const effects: Effect[] = [{ kind: 'xp', amount }];
    for (let level = was + 1; level <= this.level; level++) {
      const unlocks = abilitiesAt(this.class, level).filter((a) => !abilitiesAt(this.class, level - 1).includes(a));
      effects.push({ kind: 'level', level, unlocks });
    }
    return effects;
  }
}
