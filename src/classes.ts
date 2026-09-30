import { CONFIG } from './config';
import { CLASS_MAIN, type ClassId, type MainAttribute } from './items';

// The classes as data, with no three.js in it: each class's main attribute,
// its resource and its base abilities by level. The adventure state reads a
// character's from here by their class (.scratch/abilities/spec.md, "The
// adventure state learns classes"); the numbers are CONFIG.classes and
// CONFIG.resources.

export type { ClassId, MainAttribute };

/** Every class, in the order the page before VR lists their cards. */
export const CLASSES = ['warrior', 'ranger', 'mage'] as const satisfies readonly ClassId[];

/**
 * The classes a new character can be: only those that are built. The ranger
 * joins with abilities ticket 21 and the mage with 23.
 */
export const PLAYABLE: readonly ClassId[] = ['warrior'];

/** A class as the page before VR shows it: its name, and a line on how it fights. */
export const CLASS_CARD: Readonly<Record<ClassId, { readonly name: string; readonly line: string }>> = {
  warrior: { name: 'Warrior', line: 'Sword and shield up close. Blows given and taken build rage for the War Cry and Earthshaker.' },
  ranger: { name: 'Ranger', line: 'A bow drawn by hand. Arrows from range, traps and a mark, fed by focus.' },
  mage: { name: 'Mage', line: 'Spells cast from the hands. Frost holds them, fire finishes them, all on mana.' },
};

type Table = typeof CONFIG.classes;

/** A base ability of some class: what a level brings besides your plain kit. */
export type Ability = { [C in ClassId]: keyof Table[C]['abilities'] }[ClassId];

/** A shape drawn in the air with the right grip held: each gesture ability starts in one (ticket 19 reads them). */
export type Shape = 'ring' | 'z' | 'v' | 'triangle' | 's';

/**
 * How an ability is used: A / X, A / X while an arrow is drawn, the sword's
 * tip driven into the ground (the Earthshaker rule), or the shape it starts in.
 */
export type Use = 'button' | 'drawing' | 'earthshaker' | Shape;

/** The bar a class's abilities spend. */
export type ResourceKind = 'rage' | 'focus' | 'mana';

/** One base ability, as data. */
export interface AbilityDef {
  readonly id: Ability;
  readonly class: ClassId;
  /** The level that brings it. */
  readonly level: number;
  readonly use: Use;
  /** What it spends of the class's resource. */
  readonly cost: number;
  /** s before it can be used again: 0 for none. */
  readonly cooldown: number;
  /** What the level-up and the belt call it. */
  readonly name: string;
}

/** Each ability's name. Names are placeholders, cheap to change. */
const NAMES: Readonly<Record<Ability, string>> = {
  warCry: 'War Cry',
  earthshaker: 'Earthshaker',
  heroicThrow: 'Heroic Throw',
  shieldWall: 'Shield Wall',
  sweepingStrikes: 'Sweeping Strikes',
  powerShot: 'Power Shot',
  snareTrap: 'Snare Trap',
  volley: 'Volley',
  scatter: 'Scatter',
  huntersMark: "Hunter's Mark",
  frostNova: 'Frost Nova',
  fireball: 'Fireball',
  frostbolt: 'Frostbolt',
  chainLightning: 'Chain Lightning',
  blizzard: 'Blizzard',
};

/** A shape as the level-up says it. */
const SHAPES: Readonly<Record<Shape, string>> = { ring: 'a ring', z: 'a Z', v: 'a V', triangle: 'a triangle', s: 'an S' };

/** How to use an ability, as the level-up says it. */
function how(use: Use): string {
  switch (use) {
    case 'button':
      return 'press A or X';
    case 'drawing':
      return 'press A or X while drawing';
    case 'earthshaker':
      return "drive your sword's tip into the ground";
    default:
      return `hold the right grip, draw ${SHAPES[use]}, let go`;
  }
}

/** The War Cry's and Earthshaker's costs and cooldowns are their own sections' (CONFIG.warCry, CONFIG.groundSlam). */
const OWN: Partial<Record<Ability, { readonly cost: number; readonly cooldown: number }>> = {
  warCry: { cost: CONFIG.warCry.cost, cooldown: 0 },
  earthshaker: { cost: CONFIG.groundSlam.cost, cooldown: CONFIG.groundSlam.cooldown },
};

/** Every base ability of every class, by id. */
export const ABILITY: Readonly<Record<Ability, AbilityDef>> = Object.fromEntries(
  CLASSES.flatMap((klass) =>
    Object.entries(CONFIG.classes[klass].abilities).map(([key, row]) => {
      const id = key as Ability;
      const r = row as { readonly level: number; readonly use: Use; readonly cost?: number; readonly cooldown?: number };
      const def: AbilityDef = { id, class: klass, level: r.level, use: r.use, cost: r.cost ?? 0, cooldown: r.cooldown ?? 0, name: NAMES[id], ...OWN[id] };
      return [id, def];
    }),
  ),
) as Record<Ability, AbilityDef>;

/** Every base ability of every class. */
export const ABILITIES = Object.keys(ABILITY) as Ability[];

/** A class's base abilities, in the order the levels bring them. */
export const abilitiesOf = (klass: ClassId): readonly Ability[] =>
  ABILITIES.filter((a) => ABILITY[a].class === klass).sort((a, b) => ABILITY[a].level - ABILITY[b].level);

/** A class's base abilities a character of `level` has. */
export const abilitiesAt = (klass: ClassId, level: number): readonly Ability[] => abilitiesOf(klass).filter((a) => ABILITY[a].level <= level);

/** What the level-up says about an ability it brings: its name, and how to use it. */
export const unlockLine = (ability: Ability): string => `${ABILITY[ability].name}: ${how(ABILITY[ability].use)}`;

/** The attribute that makes a class's damage (and, for the mage, sizes the mana pool). */
export const mainOf = (klass: ClassId): MainAttribute => CLASS_MAIN[klass];

/** A class's resource at some main attribute. */
export interface Resource {
  readonly kind: ResourceKind;
  /** The bar's size. */
  readonly size: number;
  /** What it holds after death or loading. */
  readonly start: number;
  /** What it gains a second (a drain is negative): while anything fights you, and once nothing does. */
  readonly refill: { readonly fighting: number; readonly calm: number };
}

/** The resource of a character of `klass` with `main` points of their main attribute (levels and gear together). */
export function resourceOf(klass: ClassId, main: number): Resource {
  const R = CONFIG.resources;
  const kind: ResourceKind = CONFIG.classes[klass].resource;
  switch (kind) {
    case 'rage': {
      const drain = -CONFIG.player.rageDecayPerSec;
      return { kind, size: CONFIG.player.maxRage, start: R.rage.start, refill: { fighting: drain, calm: drain } };
    }
    case 'focus':
      return { kind, size: R.focus.size, start: R.focus.size * R.focus.start, refill: { fighting: R.focus.refill, calm: R.focus.refill } };
    case 'mana': {
      const M = R.mana;
      const size = M.size + M.perIntellect * Math.max(0, main - M.from);
      return { kind, size, start: size * M.start, refill: M.refill };
    }
  }
}
