// PROTOTYPE (abilities ticket 06, "How the mage fights"): throwaway code kept
// in the repo so Tom can try it on the headset at `?arena&class=mage-prototype`.
//
// Question: how does the mage fight before any ability? The plain attack, what
// each hand holds, how the mage survives a blow, and whether mana limits the
// plain attack. Each of those is an axis here; a kit is one pick on every axis.
// `?kit=A|B|C` picks a kit (A, the recommended one, by default), the right
// stick's click cycles kits in the headset, and `?cast=`, `?focus=`, `?move=`,
// `?mana=` override one axis for a side-by-side.

/** The plain attack. */
export type Cast =
  /** Hold the trigger to charge a bolt in the palm, then let go mid-throw: the throw aims it and its speed shapes it. */
  | 'throw'
  /** A wand in the hand: point it, hold the trigger to charge, let go to fire along the wand. */
  | 'wand'
  /** Hold the trigger to charge, then push the palm out as if against a wall: the bolt leaves on the push. */
  | 'push';

/** What the off hand's focus does. */
export type Focus =
  /** The grip raises a ward that blocks like the warrior's shield (a block spends mana), and the trigger casts too. */
  | 'ward'
  /** The grip raises the ward; the trigger does nothing. The focus is a shield and no more. */
  | 'wardOnly'
  /** No ward: the off hand is a second caster. */
  | 'caster';

/** B / Y. */
export type Move =
  /** The warrior's dash: a quick step. */
  | 'dash'
  /** A blink: gone and back a few metres away, in the stick's direction (backwards if neutral). */
  | 'blink';

/** Does the plain bolt cost mana? */
export type Mana = 'free' | 'spend';

export interface MageVariant {
  kit: string;
  cast: Cast;
  focus: Focus;
  move: Move;
  mana: Mana;
}

/** The three kits, most different from each other; A is the pick. */
export const KITS: Record<string, Omit<MageVariant, 'kit'>> = {
  A: { cast: 'throw', focus: 'ward', move: 'blink', mana: 'free' },
  B: { cast: 'wand', focus: 'wardOnly', move: 'dash', mana: 'spend' },
  C: { cast: 'push', focus: 'caster', move: 'blink', mana: 'spend' },
};

const CASTS: Cast[] = ['throw', 'wand', 'push'];
const FOCI: Focus[] = ['ward', 'wardOnly', 'caster'];
const MOVES: Move[] = ['dash', 'blink'];
const MANAS: Mana[] = ['free', 'spend'];

function pick<T extends string>(value: string | null, from: T[]): T | undefined {
  return from.find((v) => v === value);
}

/** The variant a query string asks for: its kit, then any single-axis overrides. */
export function readMageVariant(search: string): MageVariant {
  const params = new URLSearchParams(search);
  const kit = (params.get('kit') ?? 'A').toUpperCase();
  const base = KITS[kit] ?? KITS.A;
  return {
    kit: KITS[kit] ? kit : 'A',
    cast: pick(params.get('cast'), CASTS) ?? base.cast,
    focus: pick(params.get('focus'), FOCI) ?? base.focus,
    move: pick(params.get('move'), MOVES) ?? base.move,
    mana: pick(params.get('mana'), MANAS) ?? base.mana,
  };
}

/** The next kit round, as the right stick's click steps them (overrides dropped). */
export function nextKit(v: MageVariant): MageVariant {
  const keys = Object.keys(KITS);
  const kit = keys[(keys.indexOf(v.kit) + 1) % keys.length];
  return { kit, ...KITS[kit] };
}

/** One line for the banner and the wrist. */
export function describe(v: MageVariant): string {
  const focus = v.focus === 'wardOnly' ? 'ward only' : v.focus === 'caster' ? 'two casters' : 'ward + cast';
  return `${v.kit}: ${v.cast} / ${focus} / ${v.move} / bolt ${v.mana === 'free' ? 'free' : 'costs mana'}`;
}
