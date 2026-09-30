import { describe, expect, it } from 'vitest';
import { HERBS, MORTAR_HOLDS, recipeFor, Turns } from '../src/professions/bench/brew';
import { RECIPES, type RecipeId } from '../src/professions/professions';

// The alchemy bench's rules: the herbs dropped in the mortar choose the recipe
// among those you know, and the pestle's and spoon's turns count however the
// hand goes round (.scratch/professions/issues/16-the-herbalist-and-the-alchemy-bench.md).

const knowsAll = () => true;
const knowsOnly =
  (...ids: RecipeId[]) =>
  (id: RecipeId) =>
    ids.includes(id);

describe('the herbs in the mortar', () => {
  it('choose the recipe whose herbs they are, exactly', () => {
    expect(recipeFor({ hearthleaf: 2 }, knowsAll)).toBe('minor-healing-potion');
    expect(recipeFor({ duskcap: 2 }, knowsAll)).toBe('rage-draught');
    expect(recipeFor({ hearthleaf: 1, duskcap: 1 }, knowsAll)).toBe('minor-mana-potion');
    expect(recipeFor({ hearthleaf: 2, duskcap: 1 }, knowsAll)).toBe('elixir-of-the-keen-eye');
  });

  it('choose nothing for a recipe you don\'t know, so the herbs go back and nothing is taken', () => {
    const newAlchemist = knowsOnly('minor-healing-potion');
    expect(recipeFor({ hearthleaf: 2 }, newAlchemist)).toBe('minor-healing-potion');
    expect(recipeFor({ duskcap: 2 }, newAlchemist)).toBeNull();
    expect(recipeFor({ hearthleaf: 2, duskcap: 1 }, newAlchemist)).toBeNull();
  });

  it('choose nothing for a mix no recipe takes, or none at all', () => {
    expect(recipeFor({ hearthleaf: 1 }, knowsAll)).toBeNull();
    expect(recipeFor({ hearthleaf: 3 }, knowsAll)).toBeNull();
    expect(recipeFor({ duskcap: 1 }, knowsAll)).toBeNull();
    expect(recipeFor({}, knowsAll)).toBeNull();
    expect(recipeFor({ hearthleaf: 0, duskcap: 0 }, knowsAll)).toBeNull();
  });

  it('never choose a recipe made at the anvil', () => {
    expect(recipeFor({ 'copper-ore': 2 }, knowsAll)).toBeNull();
    expect(recipeFor({ 'rough-stone': 1 }, knowsAll)).toBeNull();
  });

  it('fit the mortar and the tray: every bench recipe takes only the bench\'s herbs, and no more than the mortar holds', () => {
    for (const r of Object.values(RECIPES).filter((r) => r.station === 'bench')) {
      expect(Object.keys(r.takes).every((id) => HERBS.includes(id))).toBe(true);
      expect(Object.values(r.takes).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(MORTAR_HOLDS);
    }
  });
});

describe('turns of the pestle and the spoon', () => {
  /** Go round `turns` times at radius `r`, `steps` points a turn; returns the half turns counted. */
  const circle = (t: Turns, turns: number, r = 0.03, steps = 24, dir = 1) => {
    let halves = 0;
    for (let i = 0; i <= turns * steps; i++) {
      const a = (dir * i * 2 * Math.PI) / steps;
      halves += t.feed(Math.cos(a) * r, Math.sin(a) * r);
    }
    return halves;
  };

  it('count half turns as the hand goes round, either way', () => {
    const t = new Turns();
    expect(circle(t, 3)).toBe(6);
    expect(t.acc / (2 * Math.PI)).toBeCloseTo(3, 5);
    const back = new Turns();
    expect(circle(back, 2, 0.03, 24, -1)).toBe(4);
  });

  it('don\'t count jitter at the very centre, or a jump across it', () => {
    const t = new Turns();
    for (let i = 0; i < 50; i++) t.feed((Math.random() - 0.5) * 0.01, (Math.random() - 0.5) * 0.01);
    expect(t.acc).toBe(0);
    t.feed(0.03, 0);
    t.feed(-0.03, 0);
    expect(t.acc).toBeLessThanOrEqual(0.6);
  });

  it('count a pound as a share of a turn, and start afresh when lifted out', () => {
    const t = new Turns();
    expect(t.add((2 * Math.PI) / 3)).toBe(0);
    expect(t.add((2 * Math.PI) / 3)).toBe(1);
    t.feed(0.03, 0);
    t.lift();
    // Back in on the far side: no jump is counted.
    t.feed(-0.03, 0.001);
    expect(t.acc).toBeCloseTo((4 * Math.PI) / 3, 5);
  });
});
