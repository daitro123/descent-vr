import { CONFIG } from '../config';
import type { Inventory, InventoryEffect, Stack } from '../inventory';
import type { ItemId } from '../items';

// One character's professions, with no DOM, three.js or XR in it: which are
// learned, each one's proficiency and grade, and the recipes known. It learns
// a pair, gathers from a spot, starts and finishes a make at a station and
// buys a recipe from a trainer, working on your things through the inventory
// module. Each operation returns its effects (proficiency gained, a grade
// reached, a recipe learned, a refusal and why) for the view to show, as the
// adventure state and the inventory do (.scratch/professions/spec.md, "The
// professions state"). The recipes and kinds of spot are data, in
// CONFIG.professions.

/** The gathering professions, each with the making one it's learned with. */
export const PAIRS = { mining: 'smithing', herbalism: 'alchemy' } as const;

export type Gathering = keyof typeof PAIRS;
export type Making = (typeof PAIRS)[Gathering];
export type Profession = Gathering | Making;

/** Every profession, gathering before making within each pair. */
export const PROFESSIONS: readonly Profession[] = ['mining', 'smithing', 'herbalism', 'alchemy'];

/** The steps of proficiency, in order, each capped until a trainer teaches the next. */
export const GRADES = ['apprentice', 'journeyman', 'expert', 'artisan'] as const;

export type Grade = (typeof GRADES)[number];

/** Where a making profession is done: the smithy's anvil (and its forge), or the alchemy bench. */
export type Station = 'anvil' | 'bench';

/** A kind of gathering spot, as CONFIG.professions.spots holds it. */
export interface SpotKindRow {
  readonly profession: Gathering;
  /** The grade its material belongs to: a grade past it, it pays nothing. */
  readonly grade: Grade;
  /** Proficiency it needs. */
  readonly needs: number;
  /** What emptying it puts in the bag, by item. */
  readonly gives: Readonly<Record<ItemId, number>>;
  /** Proficiency emptying it pays. */
  readonly gain: number;
  /** It refills `after` s once taken, once you're `away` m from it (the world's, not the save's). */
  readonly refill: { readonly after: number; readonly away: number };
}

/** A recipe, as CONFIG.professions.recipes holds it. */
export interface RecipeRow {
  readonly profession: Making;
  readonly station: Station;
  /** The grade it belongs to: a grade past it, it pays nothing. */
  readonly grade: Grade;
  /** What a make takes out of the bag as it starts, by item. */
  readonly takes: Readonly<Record<ItemId, number>>;
  /** The item one make gives. */
  readonly makes: ItemId;
  /** Proficiency it needs, to buy or to make. */
  readonly needs: number;
  /** Proficiency one make pays. */
  readonly gain: number;
  /** Coins its trainer asks, or null for one taught with the profession. */
  readonly price: number | null;
  /** Recipes with the same lesson are bought together, for one price. */
  readonly lesson?: string;
}

export type SpotKind = keyof typeof CONFIG.professions.spots;

/** A recipe's id. Kept as a string, since a save may hold one a later build no longer knows. */
export type RecipeId = string;

export interface Recipe extends RecipeRow {
  readonly id: RecipeId;
}

/** Every recipe the game knows, by id. */
export const RECIPES: Readonly<Record<RecipeId, Recipe>> = Object.fromEntries(
  Object.entries(CONFIG.professions.recipes as Readonly<Record<RecipeId, RecipeRow>>).map(([id, row]) => [id, { id, ...row }]),
);

/** Every kind of gathering spot. */
export const SPOT_KINDS: Readonly<Record<SpotKind, SpotKindRow>> = CONFIG.professions.spots;

/** The recipe with `id`, or undefined if the game doesn't know it. */
export const recipeOf = (id: RecipeId): Recipe | undefined => RECIPES[id];

/** The proficiency `grade` stops at. */
export const capOf = (grade: Grade): number => CONFIG.professions.grades[grade];

/** What a make takes, as stacks. */
export const takesOf = (recipe: RecipeRow): Stack[] => Object.entries(recipe.takes).map(([id, count]) => ({ id, count }));

/** Every recipe bought with `recipe`, itself included. */
export const lessonOf = (recipe: Recipe): Recipe[] =>
  recipe.lesson ? Object.values(RECIPES).filter((r) => r.lesson === recipe.lesson) : [recipe];

/** One profession learned. */
export interface Learned {
  readonly proficiency: number;
  readonly grade: Grade;
}

/** One character's professions, as the save keeps them. */
export interface ProfessionsSave {
  /** Each profession learned. */
  readonly learned: Readonly<Partial<Record<Profession, Learned>>>;
  /** The recipes known, by id, in the order learned. */
  readonly recipes: readonly RecipeId[];
}

/** A character who has learned nothing. */
export const NO_PROFESSIONS: ProfessionsSave = { learned: {}, recipes: [] };

/** Why an operation was refused. */
export type ProfessionRefusal =
  /** Learning a profession already learned. */
  | 'learned'
  /** Its profession isn't learned. */
  | 'unlearned'
  /** A recipe the game doesn't know, one you don't know, or one no trainer sells. */
  | 'unknown'
  /** Buying a recipe you already know. */
  | 'known'
  /** Too little proficiency. */
  | 'proficiency'
  /** A grade you haven't reached, or one that isn't the next. */
  | 'grade'
  /** The bag doesn't hold what it takes. */
  | 'materials'
  /** Too few coins. */
  | 'coins'
  /** Work already under way at the station. */
  | 'busy'
  /** No work at the station to finish. */
  | 'idle';

/** What an operation did, for the view to show. The inventory's own effects come alongside. */
export type ProfessionEffect =
  | { readonly kind: 'learned'; readonly profession: Profession }
  | { readonly kind: 'recipe'; readonly recipe: RecipeId }
  /** A profession's proficiency now, and how much it moved ("+1 Mining"). */
  | { readonly kind: 'proficiency'; readonly profession: Profession; readonly proficiency: number; readonly gained: number }
  /** A new grade ("Mining: Journeyman"). */
  | { readonly kind: 'grade'; readonly profession: Profession; readonly grade: Grade }
  /** A spot of `spot`'s kind emptied, whatever it paid. */
  | { readonly kind: 'gathered'; readonly spot: SpotKind }
  /** A make under way at a station: its materials have left the bag. */
  | { readonly kind: 'started'; readonly station: Station; readonly recipe: RecipeId }
  /** A make done: into the bag, or `left` waiting on the station with the bag full. */
  | { readonly kind: 'made'; readonly station: Station; readonly recipe: RecipeId; readonly stack: Stack; readonly left: boolean }
  | { readonly kind: 'refused'; readonly reason: ProfessionRefusal };

export type ProfessionsEffects = (ProfessionEffect | InventoryEffect)[];

const refuse = (reason: ProfessionRefusal): ProfessionsEffects => [{ kind: 'refused', reason }];

const isGrade = (g: unknown): g is Grade => GRADES.includes(g as Grade);

/** One character's professions. */
export class Professions {
  private readonly known = new Map<Profession, { proficiency: number; grade: Grade }>();
  private readonly book: RecipeId[] = [];
  /** The make under way at each station: not saved, so loading finds every station empty. */
  private readonly work = new Map<Station, RecipeId>();

  /** A character's professions, new or restored from a save, working on `inventory`. */
  constructor(
    private readonly inventory: Inventory,
    saved: ProfessionsSave = NO_PROFESSIONS,
  ) {
    // A save is taken as best it fits: a profession or recipe the game no
    // longer knows is dropped, proficiency stays within its grade, and a
    // profession learned knows every recipe taught with its grade and those before.
    for (const p of PROFESSIONS) {
      const l = saved.learned[p];
      if (!l || !isGrade(l.grade)) continue;
      this.known.set(p, { grade: l.grade, proficiency: Math.min(Math.max(Math.floor(l.proficiency) || 0, 0), capOf(l.grade)) });
    }
    for (const id of saved.recipes) {
      const r = recipeOf(id);
      if (r && this.known.has(r.profession) && !this.book.includes(id)) this.book.push(id);
    }
    for (const p of this.known.keys()) this.teachGrade(p, []);
  }

  /** Your professions, for the save. */
  snapshot(): ProfessionsSave {
    const learned: Partial<Record<Profession, Learned>> = {};
    for (const p of PROFESSIONS) {
      const l = this.known.get(p);
      if (l) learned[p] = { ...l };
    }
    return { learned, recipes: [...this.book] };
  }

  /** The professions learned, gathering before making within each pair. */
  get learned(): readonly Profession[] {
    return PROFESSIONS.filter((p) => this.known.has(p));
  }

  /** The recipes known, in the order learned. */
  get recipes(): readonly RecipeId[] {
    return this.book;
  }

  /** Has `profession` been learned? */
  has(profession: Profession): boolean {
    return this.known.has(profession);
  }

  /** `profession`'s proficiency: 0 if it isn't learned. */
  proficiency(profession: Profession): number {
    return this.known.get(profession)?.proficiency ?? 0;
  }

  /** `profession`'s grade, or null if it isn't learned. */
  grade(profession: Profession): Grade | null {
    return this.known.get(profession)?.grade ?? null;
  }

  /** Do you know `recipe`? */
  knows(recipe: RecipeId): boolean {
    return this.book.includes(recipe);
  }

  /** The make under way at `station`, or null. */
  working(station: Station): RecipeId | null {
    return this.work.get(station) ?? null;
  }

  /**
   * Learn `profession` with its pair (Mining with Smithing, Herbalism with
   * Alchemy), each at Apprentice with no proficiency, knowing the recipes
   * Apprentice teaches.
   */
  learn(profession: Profession): ProfessionsEffects {
    const gathering = (Object.keys(PAIRS) as Gathering[]).find((g) => g === profession || PAIRS[g] === profession)!;
    const pair = [gathering, PAIRS[gathering]] as const;
    if (pair.some((p) => this.known.has(p))) return refuse('learned');
    const effects: ProfessionsEffects = [];
    for (const p of pair) {
      this.known.set(p, { proficiency: 0, grade: GRADES[0] });
      effects.push({ kind: 'learned', profession: p });
    }
    for (const p of pair) this.teachGrade(p, effects);
    return effects;
  }

  /** Empty a spot of `kind`: what it gives goes to the bag (or is left where it lay), and its profession gains. */
  gather(kind: SpotKind): ProfessionsEffects {
    const spot = SPOT_KINDS[kind];
    if (!spot) return refuse('unknown');
    if (!this.known.has(spot.profession)) return refuse('unlearned');
    if (this.proficiency(spot.profession) < spot.needs) return refuse('proficiency');
    const gives = Object.entries(spot.gives).map(([id, count]) => ({ id, count }));
    return [...this.inventory.take(gives), { kind: 'gathered', spot: kind }, ...this.gain(spot.profession, spot.gain, spot.grade)];
  }

  /**
   * Start `recipe` at its station: its materials leave the bag now. Refused,
   * it takes nothing: a recipe you don't know, too little proficiency, the
   * station already working, or too little in the bag.
   */
  start(id: RecipeId): ProfessionsEffects {
    const recipe = recipeOf(id);
    if (!recipe) return refuse('unknown');
    if (!this.known.has(recipe.profession)) return refuse('unlearned');
    if (!this.knows(id)) return refuse('unknown');
    if (this.proficiency(recipe.profession) < recipe.needs) return refuse('proficiency');
    if (this.work.has(recipe.station)) return refuse('busy');
    const takes = takesOf(recipe);
    if (takes.some((s) => this.inventory.count(s.id) < s.count)) return refuse('materials');
    this.work.set(recipe.station, id);
    return [...this.inventory.spend(takes), { kind: 'started', station: recipe.station, recipe: id }];
  }

  /**
   * Finish the make under way at `station`: the thing goes to the bag, or
   * waits on the station if the bag is full, and its profession gains.
   */
  finish(station: Station): ProfessionsEffects {
    const id = this.work.get(station);
    const recipe = id && recipeOf(id);
    if (!id || !recipe) return refuse('idle');
    this.work.delete(station);
    const stack = { id: recipe.makes, count: 1 };
    const took = this.inventory.take([stack]);
    const left = took.some((e) => e.kind === 'left');
    return [
      ...took.filter((e) => e.kind !== 'left'),
      { kind: 'made', station, recipe: id, stack, left },
      ...this.gain(recipe.profession, recipe.gain, recipe.grade),
    ];
  }

  /** Buy `recipe` from its trainer, with every recipe of its lesson, for its price. */
  buy(id: RecipeId): ProfessionsEffects {
    const recipe = recipeOf(id);
    if (!recipe) return refuse('unknown');
    if (!this.known.has(recipe.profession)) return refuse('unlearned');
    const lesson = lessonOf(recipe).filter((r) => !this.knows(r.id));
    if (!lesson.length) return refuse('known');
    if (recipe.price === null) return refuse('unknown');
    if (GRADES.indexOf(recipe.grade) > GRADES.indexOf(this.grade(recipe.profession)!)) return refuse('grade');
    if (this.proficiency(recipe.profession) < recipe.needs) return refuse('proficiency');
    if (this.inventory.coins < recipe.price) return refuse('coins');
    const effects: ProfessionsEffects = this.inventory.spend([], recipe.price);
    for (const r of lesson) {
      this.book.push(r.id);
      effects.push({ kind: 'recipe', recipe: r.id });
    }
    return effects;
  }

  /** A trainer teaches `profession` its next grade, `grade`: its cap lifts, and it knows what that grade teaches. */
  train(profession: Profession, grade: Grade): ProfessionsEffects {
    const l = this.known.get(profession);
    if (!l) return refuse('unlearned');
    if (GRADES.indexOf(grade) !== GRADES.indexOf(l.grade) + 1) return refuse('grade');
    l.grade = grade;
    const effects: ProfessionsEffects = [{ kind: 'grade', profession, grade }];
    this.teachGrade(profession, effects);
    return effects;
  }

  /** Set `profession`'s proficiency, within its grade: for the debug handle and scripted checks. */
  setProficiency(profession: Profession, proficiency: number): ProfessionsEffects {
    const l = this.known.get(profession);
    if (!l) return refuse('unlearned');
    const was = l.proficiency;
    l.proficiency = Math.min(Math.max(Math.floor(proficiency), 0), capOf(l.grade));
    return l.proficiency === was ? [] : [{ kind: 'proficiency', profession, proficiency: l.proficiency, gained: l.proficiency - was }];
  }

  /** `amount` proficiency for practising something of `grade`, up to the cap; nothing for a grade you're past. */
  private gain(profession: Profession, amount: number, grade: Grade): ProfessionEffect[] {
    const l = this.known.get(profession)!;
    if (GRADES.indexOf(grade) < GRADES.indexOf(l.grade)) return [];
    const was = l.proficiency;
    l.proficiency = Math.min(was + amount, capOf(l.grade));
    return l.proficiency === was ? [] : [{ kind: 'proficiency', profession, proficiency: l.proficiency, gained: l.proficiency - was }];
  }

  /** Know every recipe `profession`'s grade and those before it teach, adding what's new to `effects`. */
  private teachGrade(profession: Profession, effects: ProfessionsEffects): void {
    const reached = GRADES.indexOf(this.known.get(profession)!.grade);
    for (const r of Object.values(RECIPES)) {
      if (r.profession !== profession || r.price !== null || GRADES.indexOf(r.grade) > reached || this.knows(r.id)) continue;
      this.book.push(r.id);
      effects.push({ kind: 'recipe', recipe: r.id });
    }
  }
}
