import {
  type Ability,
  abilitiesAt,
  type ClassId,
  isShape,
  ABILITY,
  type MainAttribute,
  mainOf,
  type Placed,
  type Resource,
  resourceOf,
  type Shape,
  SHAPES,
  type Slots,
  slotsOf,
  swapped,
} from './classes';
import { CONFIG, type EnemyConfig } from './config';
import { Inventory, type InventoryEffect, type InventorySave, type Refusal, type Where } from './inventory';
import { type ProfessionEffect, Professions, type ProfessionsSave, type RecipeId, type SpotKind } from './professions/professions';
import { attributesAt, type ItemId, itemOf, type Worn, WORN_NOTHING } from './items';
import { chestSeed, type Loot, rollChest, rollLoot, seeded } from './loot';
import type { CampId } from './maps/types';
import type { Family } from './models/characters';
import { BARKS, type Chain, CHAINS, type GiverId, type Item, type Objective, type Place, type Quest, QUEST_ITEM, type QuestId, type Sword, SWORDS, type VillagerId } from './quests';
import { fits, type Knobs, knobsOf, pointsAt, refusal, type Spent, spentAll, spentIn, type Talent, TALENT, talentAbilities, type TalentRefusal, tierOpen, type Tree } from './talents';

// The rules of progress in the Adventure, with no three.js in it: events in,
// effects and answers out. The Adventure feeds it what happens in the world
// and turns its effects into floats, sounds, your numbers and what Hale and
// the tracker show; the save keeps its snapshot. Levels, XP and the quest
// givers' chains live here: Marshal Hale's, and the trainers' once they come
// (.scratch/oakvale-starting-zone/spec.md, "The adventure state";
// .scratch/professions/spec.md, "Trainers and quests"). So does the
// character's class, and what it makes of their level: attributes, health,
// damage, resource and abilities, and the talents they've spent points in
// (.scratch/abilities/spec.md, "The adventure state learns classes").

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
  /** The item picked at its hand-in, once handed in: Hale's sword stays at their hip unless it was theirs. */
  readonly picked?: ItemId;
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
  /** The shapes you've drawn an ability in at least once: none in an older record. */
  readonly drawn?: readonly Shape[];
  /** Points spent in each talent. */
  readonly talents: Spent;
  /** Where the gesture slots' swaps put abilities: none if you've never swapped. */
  readonly placed?: Placed;
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
  /**
   * Give back a giver's quest that's ready (Hale's without one): "Hand in" on
   * their board, or one of its picks carried from the board into the bag (into
   * bag slot `to`, or wherever it fits). Without a pick, the first on offer is taken.
   */
  | { readonly kind: 'handIn'; readonly giver?: GiverId; readonly pick?: ItemId; readonly to?: Where }
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
  | { readonly kind: 'made'; readonly recipe: RecipeId }
  /** A shape drawn and read, whatever came of it (cast, or not enough rage). */
  | { readonly kind: 'drawn'; readonly shape: Shape }
  /** A talent pressed on the talent page: a point in it, unless you're `fighting`. */
  | { readonly kind: 'spend'; readonly talent: Talent; readonly fighting: boolean }
  /** Reset on the talent page: every point back, unless you're `fighting`. */
  | { readonly kind: 'resetTalents'; readonly fighting: boolean }
  /** Two shapes pressed on the talent page: their slots swap, unless you're `fighting`. */
  | { readonly kind: 'swap'; readonly shapes: readonly [Shape, Shape]; readonly fighting: boolean };

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
  /** What happened to your things: a hand-in's pick put into the bag, say. */
  | InventoryEffect
  /** What happened to your professions: one learned, proficiency gained, a recipe known. */
  | ProfessionEffect
  /** The first time a shape holding an ability was drawn: its shape stops hanging in the air. */
  | { readonly kind: 'learned'; readonly shape: Shape }
  /** A point went in a talent: it has `points` now. */
  | { readonly kind: 'talent'; readonly talent: Talent; readonly points: number }
  /** Every talent point came back: `points` of them. */
  | { readonly kind: 'talentsReset'; readonly points: number }
  /** Two shapes' slots swapped. */
  | { readonly kind: 'swapped'; readonly shapes: readonly [Shape, Shape] }
  /** Nothing done on the talent page, and why: in a fight, no points, a full talent or a closed tier. */
  | { readonly kind: 'talentRefused'; readonly reason: TalentRefusal };

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
  /** The reward row at a hand-in: the items to pick from, fitting your class. Empty unless one is ready. */
  readonly picks: readonly ItemId[];
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
  /** Your class's base abilities your level has brought, in the order they came, then those your talents grant. */
  readonly abilities: readonly Ability[];
  /** What your talents add to your numbers, by name (talents.ts): 0 without talents. */
  readonly talents: Knobs;
  /** Your level's step, as an enemy's: 1 at level 1, `CONFIG.levels.step` more a level (Ice Barrier grows by it). */
  readonly step: number;
}

/** The step a level brings to an enemy's health and damage: 1 at level 1. */
const stepAt = (level: number) => 1 + CONFIG.levels.step * (level - 1);

/**
 * Your numbers at `level` as a `klass` (a warrior unless it says), wearing
 * gear that adds up to `worn`, with points `spent` in talents. Your level's
 * attributes and your gear's add up by one rule: every point of Stamina is 10
 * health, and every point of your class's main attribute is a tenth of level
 * 1's damage, so a character without gear has 100 health and deals ×1 at
 * level 1, 180 and ×1.8 at 5. Your weapon's damage rating adds to your damage
 * (Hale's old longsword adds one level's step), and gear's armour cuts what
 * you take. Talents add their abilities, a share of health (Toughness), and
 * the numbers Combat reads (`talents`).
 */
export function statsAt(level: number, worn: Worn = WORN_NOTHING, klass: ClassId = 'warrior', spent: Spent = {}): Stats {
  const A = CONFIG.items.attribute;
  const stamina = attributesAt(level) + worn.stamina;
  const main = attributesAt(level) + worn.main;
  const talents = knobsOf(spent);
  return {
    stamina,
    attribute: mainOf(klass),
    main,
    maxHp: Math.round(A.health * stamina * (1 + talents.health)),
    damage: A.damage * main + worn.damage,
    armour: worn.armour,
    resource: resourceOf(klass, main),
    abilities: [...abilitiesAt(klass, level), ...talentAbilities(spent)],
    talents,
    step: stepAt(level),
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
  /** The item picked at its hand-in, once handed in. */
  picked?: ItemId;
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
  /** The shapes you've drawn an ability in at least once. */
  private readonly drawn = new Set<Shape>();
  /** Points spent in each talent. */
  private spent: Partial<Record<Talent, number>> = {};
  /** Where the gesture slots' swaps put abilities. */
  private placed: Placed = {};
  /** Your class: a warrior unless the character's record says otherwise. */
  readonly class: ClassId;
  /** Which character you are: their key in the save (the roster's), or your class where there's none (tests, a new state). */
  readonly character: string;
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
  constructor(saved?: Progress, chains: readonly Chain[] = CHAINS, options: { readonly class?: ClassId; readonly cap?: number; readonly character?: string } = {}) {
    this.class = options.class ?? 'warrior';
    this.character = options.character ?? this.class;
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
    this.carryQuestItems();
  }

  /** Your progress, for the save. */
  snapshot(): Progress {
    const quests: Record<QuestId, QuestProgress> = {};
    for (const h of this.held) {
      quests[h.quest.id] = { stage: h.stage, counts: [...h.counts], ...(h.taken ? { taken: h.taken } : {}), ...(h.picked ? { picked: h.picked } : {}) };
    }
    return {
      level: this.level,
      xp: this.total,
      quests,
      wardenBeaten: this.beaten,
      inventory: this.inventory.snapshot(),
      professions: this.professions.snapshot(),
      ...(this.drawn.size ? { drawn: SHAPES.filter((s) => this.drawn.has(s)) } : {}),
      talents: { ...this.spent },
      ...(Object.keys(this.placed).length ? { placed: { ...this.placed } } : {}),
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
    for (const shape of Array.isArray(saved.drawn) ? saved.drawn : []) if (SHAPES.includes(shape)) this.drawn.add(shape);
    this.restoreTalents(saved);
    for (const h of this.held) {
      const kept = saved.quests[h.quest.id] as QuestProgress | undefined;
      if (!kept) continue;
      h.stage = kept.stage;
      h.taken = kept.taken ?? 0;
      // A warrior's record from before hand-ins had picks was paid what the quest paid then (What Lies Below's
      // longsword); a ranger's or mage's took nothing that was theirs, so Hale keeps his sword at his hip.
      h.picked = typeof kept.picked === 'string' ? kept.picked : this.class === 'warrior' ? h.quest.paid : undefined;
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
      if (h.stage !== 'handedIn') h.picked = undefined;
    }
    this.renumber();
  }

  /**
   * Take up the talents a snapshot spent and the swaps it made. Points that
   * couldn't have been spent at the level kept (a talent another build doesn't
   * know, one past its maximum or in a tier not open, more points than the
   * level brings) all come back, as a free reset would; swaps of abilities
   * this build doesn't know, or to no shape, are dropped.
   */
  private restoreTalents(saved: Progress): void {
    const spent: Partial<Record<Talent, number>> = {};
    let known = true;
    for (const [t, n] of Object.entries(saved.talents ?? {})) {
      if (!(t in TALENT)) known = false;
      else if (typeof n === 'number' && n !== 0) spent[t as Talent] = n;
    }
    this.spent = known && fits(spent, this.class, this.level) ? spent : {};
    const placed: Partial<Record<Ability, Shape>> = {};
    for (const [a, shape] of Object.entries(saved.placed ?? {})) {
      if (a in ABILITY && isShape(shape as Shape)) placed[a as Ability] = shape as Shape;
    }
    this.placed = placed;
  }

  /**
   * What the quests you're on have had you pick up is on the quest page: a
   * record from before the orders went on it gains them here.
   */
  private carryQuestItems(): void {
    for (const h of this.held) {
      if (h.stage === 'handedIn') continue;
      h.quest.objectives.forEach((o, k) => {
        const id = o.kind === 'pickup' ? QUEST_ITEM[o.item] : null;
        if (id && h.counts[k] > 0 && !this.inventory.quest.includes(id)) this.inventory.take([{ id, count: 1 }]);
      });
    }
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
    return statsAt(this.level, this.inventory.numbers, this.class, this.spent);
  }

  /**
   * Which ability each shape holds: your class's base gesture abilities in
   * their own shapes and a tier-3 talent's in the triangle (or the next free
   * shape), wherever the talent page's swaps put them.
   */
  get slots(): Slots {
    return slotsOf([...abilitiesAt(this.class, this.level), ...talentAbilities(this.spent)], this.placed);
  }

  /** Points spent in `talent`. */
  spentOn(talent: Talent): number {
    return this.spent[talent] ?? 0;
  }

  /** Points spent in `tree`. */
  spentIn(tree: Tree): number {
    return spentIn(this.spent, tree);
  }

  /** Every point spent, by talent. */
  get talents(): Spent {
    return this.spent;
  }

  /** Talent points spent in all. */
  get pointsSpent(): number {
    return spentAll(this.spent);
  }

  /** Talent points to spend: one a level from 2, less those spent. */
  get pointsLeft(): number {
    return pointsAt(this.level) - spentAll(this.spent);
  }

  /** Is `tree`'s `tier` open: enough points spent in the tiers above it? */
  opens(tree: Tree, tier: number): boolean {
    return tierOpen(this.spent, tree, tier);
  }

  /** Can a point go in `talent` now? Null if so, or why not. */
  refuses(talent: Talent, fighting = false): TalentRefusal | null {
    return refusal(this.spent, talent, this.class, this.level, fighting);
  }

  /**
   * The shapes holding an ability that you've never drawn, in the slots'
   * order: the first hangs in the air in front of you until you draw it.
   */
  get unlearned(): readonly Shape[] {
    const slots = this.slots;
    return SHAPES.filter((s) => slots[s] !== null && !this.drawn.has(s));
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

  /** Does Hale's old longsword still hang at their hip? Until a warrior picks it at the hand-in that offers it. */
  get haleSwordAtHip(): boolean {
    return !this.held.some((h) => h.picked === 'hale-longsword');
  }

  /** The item picked at quest `id`'s hand-in, once it's handed in. */
  pickedAt(id: QuestId): ItemId | undefined {
    return this.find(id)?.picked;
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
    if (!chain || !this.open(chain)) return { marker: null, line: chain?.closed ?? '', buttons: ['goodbye'], picks: [] };
    const h = this.current(chain);
    if (!h) return { marker: null, line: chain.done, buttons: ['goodbye'], picks: [] };
    const stage = h.stage as ShownStage;
    const picks = stage === 'ready' ? this.picksOf(h) : [];
    // A pick carried into the bag hands the quest in, so there's no button for it.
    return { marker: stage, line: h.quest.says[stage], buttons: picks.length ? [] : BUTTONS[stage], picks };
  }

  /** What a quest offers you to pick from at its hand-in. */
  private picksOf(h: Held): readonly ItemId[] {
    return h.quest.picks?.[this.class] ?? [];
  }

  /**
   * Why carrying `pick` from `giver`'s board into bag slot `to` (or anywhere)
   * wouldn't hand their quest in, or null if it would: for the view to light
   * the slot under it red or green.
   */
  pickRefusal(pick: ItemId, to?: Where, giver: GiverId = 'hale'): Refusal | null {
    const h = this.offeredBy(giver);
    if (h?.stage !== 'ready' || !this.picksOf(h).includes(pick)) return 'empty';
    return this.inventory.checkReceive({ id: pick, count: 1 }, to);
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
      case 'pickup': {
        // Picked up for a quest, it goes on the bag's quest page.
        const counted = this.count((o) => o.kind === 'pickup' && o.item === event.item);
        return counted.length ? [...counted, ...this.inventory.take([{ id: QUEST_ITEM[event.item], count: 1 }])] : counted;
      }
      case 'chest':
        return this.openChest(event.chest, event.level);
      case 'gathered':
        return this.count((o) => o.kind === 'gather' && o.spot === event.spot);
      case 'made':
        return this.count((o) => o.kind === 'make' && o.recipe === event.recipe);
      case 'drawn':
        if (this.slots[event.shape] === null || this.drawn.has(event.shape)) return [];
        this.drawn.add(event.shape);
        return [{ kind: 'learned', shape: event.shape }];
      case 'spend':
        return this.spend(event.talent, event.fighting);
      case 'resetTalents':
        return this.resetTalents(event.fighting);
      case 'swap':
        return this.swap(event.shapes, event.fighting);
      case 'accept':
        return this.accept(event.giver ?? 'hale');
      case 'handIn':
        return this.handIn(event.giver ?? 'hale', event.pick, event.to);
    }
  }

  /** A point in `talent`, if one can go there now. */
  private spend(talent: Talent, fighting: boolean): Effect[] {
    const reason = refusal(this.spent, talent, this.class, this.level, fighting);
    if (reason) return [{ kind: 'talentRefused', reason }];
    const points = (this.spent[talent] ?? 0) + 1;
    this.spent = { ...this.spent, [talent]: points };
    return [{ kind: 'talent', talent, points }];
  }

  /** Every point back, free, out of a fight: the abilities talents granted go with them. */
  private resetTalents(fighting: boolean): Effect[] {
    if (fighting) return [{ kind: 'talentRefused', reason: 'fighting' }];
    const points = spentAll(this.spent);
    if (points === 0) return [];
    this.spent = {};
    return [{ kind: 'talentsReset', points }];
  }

  /** The slots of two shapes swap, out of a fight: nothing for a shape with itself, or two empty ones. */
  private swap([a, b]: readonly [Shape, Shape], fighting: boolean): Effect[] {
    if (fighting) return [{ kind: 'talentRefused', reason: 'fighting' }];
    const slots = this.slots;
    if (a === b || (slots[a] === null && slots[b] === null)) return [];
    this.placed = swapped(slots, a, b, this.placed);
    return [{ kind: 'swapped', shapes: [a, b] }];
  }

  /**
   * Open chest `id` at `level`, once per character: it's recorded open, and
   * what it holds, rolled from the chest and the character, comes out as a
   * drop, seeded by the chest and which character you are.
   */
  private openChest(id: string, level: number): Effect[] {
    if (this.inventory.isOpened(id)) return [];
    const loot = rollChest(level, this.class, seeded(chestSeed(id, this.character)));
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
   * Give back `giver`'s quest that's ready: the pick into your bag, what it
   * had you pick up off the quest page, its XP, the next quest of their chain
   * on offer, and the first of every chain it opens. With no room for the
   * pick, it's refused, and the pick and the quest wait on the board.
   */
  private handIn(giver: GiverId, pick?: ItemId, to?: Where): Effect[] {
    const h = this.offeredBy(giver);
    if (h?.stage !== 'ready') return [];
    const { quest } = h;
    const picks = this.picksOf(h);
    const chosen = pick ?? picks[0];
    let got: InventoryEffect[] = [];
    if (picks.length) {
      if (!picks.includes(chosen)) return [{ kind: 'refused', reason: 'empty', ...(to ? { where: to } : {}) }];
      got = this.inventory.receive({ id: chosen, count: 1 }, to);
      if (got.some((e) => e.kind === 'refused')) return got;
      h.picked = chosen;
    }
    h.stage = 'handedIn';
    h.taken = 0;
    this.renumber();
    const effects: Effect[] = [{ kind: 'quest', quest: quest.id, stage: 'handedIn' }, ...got];
    for (const o of quest.objectives) if (o.kind === 'pickup') effects.push(...this.inventory.giveUp(QUEST_ITEM[o.item]));
    effects.push(...this.earn(quest.xp));
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
