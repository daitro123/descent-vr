import type { AdventureState, Effect } from '../adventureState';
import type { ItemId } from '../items';
import { type Profession, PROFESSIONS } from './professions';

// The debug handle's professions helpers, so scripted checks reach any state
// fast: teach a pair, set proficiency, and fill the bag with materials. Each
// returns what it did, and hands it to `saved` so it's written as play would.

/** One full stack of each of Oakvale's materials. */
export const EVERY_MATERIAL: Readonly<Record<ItemId, number>> = {
  'copper-ore': 20,
  'rough-stone': 20,
  'copper-bar': 20,
  hearthleaf: 20,
  duskcap: 20,
};

/** The helpers, over `state`, writing through `saved`. */
export function professionsDebug(state: AdventureState, saved: (effects: readonly Effect[]) => void = () => {}) {
  const done = (effects: Effect[]) => {
    saved(effects);
    return effects;
  };
  return {
    /** Learn `profession` with its pair, as its intro quest will: `learn('mining')`, or every profession with `learn()`. */
    learn: (profession?: Profession) =>
      done(profession ? state.professions.learn(profession) : PROFESSIONS.flatMap((p) => (state.professions.has(p) ? [] : state.professions.learn(p)))),
    /** Set `profession`'s proficiency, within its grade. */
    proficiency: (profession: Profession, proficiency: number) => done(state.professions.setProficiency(profession, proficiency)),
    /** Put `items` (id to count) in the bag: a full stack of every material by default. */
    fill: (items: Readonly<Record<ItemId, number>> = EVERY_MATERIAL) =>
      done(state.inventory.take(Object.entries(items).map(([id, count]) => ({ id, count })))),
  };
}
