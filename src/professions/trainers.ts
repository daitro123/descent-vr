import { itemOf } from '../items';
import { GRADES, type Gathering, type Making, PAIRS, type Profession, type ProfessionRefusal, type Professions, RECIPES, type Recipe, type RecipeId } from './professions';

// The trainers' Train list, with no three.js in it: which recipes each trainer
// sells, one row per lesson (the three copper gauntlets are one), with its
// price, the proficiency it needs and whether buying it now would go
// (.scratch/professions/spec.md, "Trainers and quests"). The talk board draws
// the rows; a press buys through the professions module.

/** The villagers who teach, each the gathering profession whose pair they teach. */
export const TRAINERS = { smith: 'mining', herbalist: 'herbalism' } as const satisfies Record<string, Gathering>;

export type TrainerId = keyof typeof TRAINERS;

export const isTrainer = (id: string): id is TrainerId => id in TRAINERS;

/** The pair a trainer teaches, gathering first. */
export function taughtBy(trainer: TrainerId): readonly [Gathering, Making] {
  const gathering = TRAINERS[trainer];
  return [gathering, PAIRS[gathering]];
}

/** One row of the Train list: a lesson, what it costs and needs, and why it can't be bought now (null if it can). */
export interface Lesson {
  /** The recipe a press buys (with the rest of its lesson). */
  readonly recipe: RecipeId;
  /** What the row says: the product's name, or the lesson's ("Copper Gauntlets"). */
  readonly name: string;
  readonly profession: Making;
  /** Coins. */
  readonly price: number;
  /** Proficiency it needs. */
  readonly needs: number;
  /** Why buying it now would be refused: grey while it isn't null. */
  readonly refused: ProfessionRefusal | null;
}

/** "copper-gauntlets" → "Copper Gauntlets". */
const titled = (id: string) => id.replace(/(^|-)(\w)/g, (_, dash: string, c: string) => `${dash ? ' ' : ''}${c.toUpperCase()}`);

/** A row's name: a lesson of several recipes by its lesson's name, one recipe by what it makes. */
const nameOf = (r: Recipe) => (r.lesson ? titled(r.lesson) : (itemOf(r.makes)?.name ?? titled(r.id)));

/**
 * What `trainer`'s Train list shows you: every recipe of their pair that's
 * bought (not taught with the profession) and of your grade, or Apprentice's
 * before you've learned it, one row per lesson in the recipes' order. A row
 * is grey whenever buying it would be refused: not learned, known, too little
 * proficiency, too few coins.
 */
export function lessonsFor(trainer: TrainerId, professions: Pick<Professions, 'buyRefusal' | 'grade'>): Lesson[] {
  const [, making] = taughtBy(trainer);
  const grade = professions.grade(making) ?? GRADES[0];
  const rows: Lesson[] = [];
  const seen = new Set<string>();
  for (const r of Object.values(RECIPES)) {
    if (r.profession !== making || r.price === null || r.grade !== grade) continue;
    const key = r.lesson ?? r.id;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ recipe: r.id, name: nameOf(r), profession: making, price: r.price, needs: r.needs, refused: professions.buyRefusal(r.id) });
  }
  return rows;
}

/** Has the character learned what `trainer` teaches: are they the trainer's student? */
export const studies = (trainer: TrainerId, professions: Pick<Professions, 'has'>): boolean => professions.has(TRAINERS[trainer] as Profession);
