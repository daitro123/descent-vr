// PROTOTYPE (Brewing at the alchemy table): the three ways to brew a minor
// healing potion, which differ in how many of the five acts your hands do.
// Every variant ends the same way: a corked flask on its stand, which you put
// on your belt or drink. Throwaway.

/** An act at the table: done by your hands, done by itself (animated), or not part of this way at all. */
export type Mode = 'hand' | 'auto' | 'skip';

export type Step = 'load' | 'grind' | 'tip' | 'stir' | 'pour' | 'take';

export interface BrewVariant {
  readonly key: string;
  readonly name: string;
  /** One line on how it works, for the board and the page. */
  readonly how: string;
  /** Where the Hearthleaf goes: the mortar, or straight in the pot. */
  readonly load: 'mortar' | 'pot';
  readonly grind: Mode;
  readonly tip: Mode;
  readonly stir: Mode;
  readonly pour: Mode;
}

export const VARIANTS: readonly BrewVariant[] = [
  {
    key: 'A',
    name: 'Every step by hand',
    how: 'Drop 2 Hearthleaf in the mortar, grind them, tip the powder into the pot, stir it, then pick the pot up by its handle and pour into the flask.',
    load: 'mortar',
    grind: 'hand',
    tip: 'hand',
    stir: 'hand',
    pour: 'hand',
  },
  {
    key: 'B',
    name: 'Grind and stir',
    how: 'Drop 2 Hearthleaf in the mortar and grind them; the mortar tips itself into the pot. Stir it; the pot pours itself into the flask.',
    load: 'mortar',
    grind: 'hand',
    tip: 'auto',
    stir: 'hand',
    pour: 'auto',
  },
  {
    key: 'C',
    name: 'Drop in and watch',
    how: 'Drop 2 Hearthleaf straight in the pot. The spoon stirs by itself and the pot pours itself into the flask.',
    load: 'pot',
    grind: 'skip',
    tip: 'skip',
    stir: 'auto',
    pour: 'auto',
  },
];

/** The acts a variant goes through, in order. */
export function stepsOf(v: BrewVariant): Step[] {
  const steps: Step[] = ['load'];
  if (v.grind !== 'skip') steps.push('grind');
  if (v.tip !== 'skip') steps.push('tip');
  steps.push('stir', 'pour', 'take');
  return steps;
}

/** How each act is done in a variant: loading and taking are always by hand. */
export function modeOf(v: BrewVariant, step: Step): Mode {
  if (step === 'load' || step === 'take') return 'hand';
  return v[step];
}

/** Full turns of the pestle, and of the spoon, that finish grinding and stirring. */
export const TURNS = { grind: 3, stir: 3 };
/** Hearthleaf in a minor healing potion (Oakvale's first tier). */
export const LEAVES = 2;
