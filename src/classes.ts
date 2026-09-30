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
 * The classes a new character can be, and the arena's `&class=` plays: only
 * those that are built. The ranger joined with abilities ticket 21 and the
 * mage with ticket 23.
 */
export const PLAYABLE: readonly ClassId[] = ['warrior', 'ranger', 'mage'];

/** Is `name` a class that's built? */
export const playable = (name: string | undefined): name is ClassId => PLAYABLE.some((c) => c === name);

/** A class as the page before VR shows it: its name, and a line on how it fights. */
export const CLASS_CARD: Readonly<Record<ClassId, { readonly name: string; readonly line: string }>> = {
  warrior: { name: 'Warrior', line: 'Sword and shield up close. Blows given and taken build rage for the War Cry and Earthshaker.' },
  ranger: { name: 'Ranger', line: 'A bow drawn by hand. Arrows from range, traps and a mark, fed by focus.' },
  mage: { name: 'Mage', line: 'Spells cast from the hands. Frost holds them, fire finishes them, all on mana.' },
};

type Table = typeof CONFIG.classes;
type Trees = typeof CONFIG.talents.trees;

/** A base ability of some class: what a level brings besides your plain kit. */
export type BaseAbility = { [C in ClassId]: keyof Table[C]['abilities'] }[ClassId];

/** Every talent row of a class's trees, whatever tree it's in. */
type RowOf<C extends ClassId> = { [T in keyof Trees[C]]: Trees[C][T][keyof Trees[C][T]] }[keyof Trees[C]];
/** The talents of a class's trees that grant an ability: the ones with a `use`. */
type AbilityTalentOf<C extends ClassId> = {
  [T in keyof Trees[C]]: { [K in keyof Trees[C][T]]: Trees[C][T][K] extends { readonly use: string } ? K : never }[keyof Trees[C][T]];
}[keyof Trees[C]];

/** An ability a talent grants (talents.ts): the talent and its ability share an id. */
export type TalentAbility = { [C in ClassId]: AbilityTalentOf<C> }[ClassId] & string;

/** Any ability: a base one a level brings, or one a talent grants. */
export type Ability = BaseAbility | TalentAbility;

/** A talent row as the config holds it, of any class. */
export type TalentRow = { [C in ClassId]: RowOf<C> }[ClassId];

/** A shape drawn in the air with the right grip held: each gesture ability starts in one (player/gestures/). */
export type Shape = 'ring' | 'z' | 'v' | 'triangle' | 's';

/** Every shape, in the order the gesture slots are listed. */
export const SHAPES: readonly Shape[] = ['ring', 'z', 'v', 'triangle', 's'];

/**
 * How an ability is used: A / X, A / X while an arrow is drawn, the sword's
 * tip driven into the ground (the Earthshaker rule), or the shape it starts in.
 */
export type Use = 'button' | 'drawing' | 'earthshaker' | Shape;

/** The bar a class's abilities spend. */
export type ResourceKind = 'rage' | 'focus' | 'mana';

/** One ability, as data. */
export interface AbilityDef {
  readonly id: Ability;
  readonly class: ClassId;
  /** The level that brings it; for one a talent grants, the first level its tier can be open by. */
  readonly level: number;
  /** Granted by the talent of the same id, not by a level. */
  readonly byTalent: boolean;
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
  mortalStrike: 'Mortal Strike',
  shieldSlam: 'Shield Slam',
};

/** A shape as the level-up says it. */
const SHAPE_WORDS: Readonly<Record<Shape, string>> = { ring: 'a ring', z: 'a Z', v: 'a V', triangle: 'a triangle', s: 'an S' };

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
      return `hold the right grip, draw ${SHAPE_WORDS[use]}, let go`;
  }
}

/** The War Cry's and Earthshaker's costs and cooldowns are their own sections' (CONFIG.warCry, CONFIG.groundSlam). */
const OWN: Partial<Record<Ability, { readonly cost: number; readonly cooldown: number }>> = {
  warCry: { cost: CONFIG.warCry.cost, cooldown: 0 },
  earthshaker: { cost: CONFIG.groundSlam.cost, cooldown: CONFIG.groundSlam.cooldown },
};

/** The first level a talent in `tier` can be taken by: a point a level from `CONFIG.talents.from`, `CONFIG.talents.tier` a tier. */
const tierLevel = (tier: number) => CONFIG.talents.from + CONFIG.talents.tier * (tier - 1);

/** Every ability of every class, by id: the base ones, then those talents grant. */
export const ABILITY: Readonly<Record<Ability, AbilityDef>> = Object.fromEntries(
  CLASSES.flatMap((klass) => [
    ...Object.entries(CONFIG.classes[klass].abilities).map(([key, row]) => {
      const id = key as Ability;
      const r = row as { readonly level: number; readonly use: Use; readonly cost?: number; readonly cooldown?: number };
      const def: AbilityDef = { id, class: klass, level: r.level, byTalent: false, use: r.use, cost: r.cost ?? 0, cooldown: r.cooldown ?? 0, name: NAMES[id], ...OWN[id] };
      return [id, def];
    }),
    ...Object.values(CONFIG.talents.trees[klass] as Readonly<Record<string, Readonly<Record<string, object>>>>).flatMap((tree) =>
      Object.entries(tree)
        .filter(([, row]) => 'use' in row)
        .map(([key, row]) => {
          const id = key as Ability;
          const r = row as { readonly tier: number; readonly use: Use; readonly cost?: number; readonly cooldown?: number };
          const def: AbilityDef = { id, class: klass, level: tierLevel(r.tier), byTalent: true, use: r.use, cost: r.cost ?? 0, cooldown: r.cooldown ?? 0, name: NAMES[id] };
          return [id, def];
        }),
    ),
  ]),
) as Record<Ability, AbilityDef>;

/** Every ability of every class, base and granted by talents. */
export const ABILITIES = Object.keys(ABILITY) as Ability[];

/** A class's base abilities, in the order the levels bring them: none a talent grants. */
export const abilitiesOf = (klass: ClassId): readonly Ability[] =>
  ABILITIES.filter((a) => ABILITY[a].class === klass && !ABILITY[a].byTalent).sort((a, b) => ABILITY[a].level - ABILITY[b].level);

/** A class's base abilities a character of `level` has. */
export const abilitiesAt = (klass: ClassId, level: number): readonly Ability[] => abilitiesOf(klass).filter((a) => ABILITY[a].level <= level);

/** Is an ability used by drawing a shape? */
export const isShape = (use: Use): use is Shape => (SHAPES as readonly string[]).includes(use);

/** Which ability each shape holds: none, until one of `abilities` is drawn in it. */
export type Slots = Readonly<Record<Shape, Ability | null>>;

/** Where the gesture slots' swaps have put abilities: the shape each ability moved is in now. */
export type Placed = Readonly<Partial<Record<Ability, Shape>>>;

/**
 * The gesture slots of a character with `abilities` (base ones in the order
 * the levels brought them, then those talents grant), after the swaps that
 * `placed` them (.scratch/abilities/spec.md, "The adventure state learns
 * classes"): each ability a swap put somewhere is there, if it's free; the
 * rest are in the shape they start in (a base ability's own, a tier-3 talent
 * ability's the triangle) if it's free, else in the next free shape. Each
 * shape always casts what its slot holds, so the shapes you know never change
 * meaning; with no shape free, an ability has none.
 */
export function slotsOf(abilities: readonly Ability[], placed: Placed = {}): Slots {
  const slots = Object.fromEntries(SHAPES.map((s) => [s, null])) as Record<Shape, Ability | null>;
  const gestures = abilities.filter((a) => isShape(ABILITY[a].use));
  const unplaced: Ability[] = [];
  for (const a of gestures) {
    const at = placed[a];
    if (at && slots[at] === null) slots[at] = a;
    else unplaced.push(a);
  }
  const later: Ability[] = [];
  for (const a of unplaced) {
    const use = ABILITY[a].use as Shape;
    if (slots[use] === null) slots[use] = a;
    else later.push(a);
  }
  for (const a of later) {
    const free = SHAPES.find((s) => slots[s] === null);
    if (free) slots[free] = a;
  }
  return slots;
}

/**
 * Where abilities are placed once the slots in shapes `a` and `b` swap:
 * `placed` with the ability each held moved to the other. Swapping with an
 * empty shape moves the one ability there.
 */
export function swapped(slots: Slots, a: Shape, b: Shape, placed: Placed = {}): Placed {
  const moved: Partial<Record<Ability, Shape>> = { ...placed };
  const inA = slots[a];
  const inB = slots[b];
  if (inA) moved[inA] = b;
  if (inB) moved[inB] = a;
  return moved;
}

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
