import { type Ability, ABILITY, CLASSES, type ClassId, type TalentRow, unlockLine } from './classes';
import { CONFIG } from './config';

// Talents as data, with no three.js in it: each class's two trees, their
// tiers, and what a point in each talent does (.scratch/abilities/spec.md,
// "The adventure state learns classes"; issues/10-talent-tree-rules.md). The
// rules are the same for every class; the rows are CONFIG.talents.trees. The
// adventure state holds the points a character has spent and answers from
// here: points to spend, which tiers are open, which abilities talents grant,
// and your numbers with the talents applied.

type Trees = typeof CONFIG.talents.trees;

/** One of a class's two trees: the warrior's Arms and Protection. */
export type Tree = { [C in ClassId]: keyof Trees[C] & string }[ClassId];

/** A talent of some class's tree. */
export type Talent = { [C in ClassId]: { [T in keyof Trees[C]]: keyof Trees[C][T] & string }[keyof Trees[C]] }[ClassId];

/** A number talents add to, by the name Combat reads it by (0 without talents). */
export type Knob = TalentRow extends infer R ? (R extends { readonly adds: infer A } ? keyof A & string : never) : never;

/** Your numbers from talents: what every point you've spent adds, by name. */
export type Knobs = Readonly<Record<Knob, number>>;

/** Points spent in each talent: a talent with none isn't listed. */
export type Spent = Readonly<Partial<Record<Talent, number>>>;

/** Why a point can't go in a talent: in a fight, none left, the talent full, its tier not open, or another class's. */
export type TalentRefusal = 'fighting' | 'points' | 'max' | 'tier' | 'class';

/** One talent, as data. */
export interface TalentDef {
  readonly id: Talent;
  readonly class: ClassId;
  readonly tree: Tree;
  /** 1 to 5: the tier it's in, which opens at `CONFIG.talents.tier` points a tier above it in its tree. */
  readonly tier: number;
  /** The most points it takes. */
  readonly max: number;
  /** What each point adds to your numbers: nothing for one that grants an ability. */
  readonly adds: Readonly<Record<string, number>>;
  /** The ability it grants with its one point, or null. */
  readonly ability: Ability | null;
  /** What the talent page calls it. */
  readonly name: string;
  /** What it does, as the talent page says it. */
  readonly line: string;
}

/** What each talent and tree is called. Names are placeholders, cheap to change. */
const NAMES: Readonly<Record<Talent | Tree, string>> = {
  arms: 'Arms',
  deepCuts: 'Deep Cuts',
  bloodRage: 'Blood Rage',
  tactician: 'Tactician',
  heavySwing: 'Heavy Swing',
  mortalStrike: 'Mortal Strike',
  sweepingMastery: 'Sweeping Mastery',
  protection: 'Protection',
  toughness: 'Toughness',
  shieldSpikes: 'Shield Spikes',
  quickGuard: 'Quick Guard',
  ironArm: 'Iron Arm',
  shieldSlam: 'Shield Slam',
  unbreakable: 'Unbreakable',
};

/** What each talent that changes numbers does, as the talent page says it; one that grants an ability says how to use it. */
const LINES: Readonly<Partial<Record<Talent, string>>> = {
  deepCuts: 'A head hit deals +10 / 20 / 30% more.',
  bloodRage: 'A sword hit builds +2 / 4 more rage.',
  tactician: 'The War Cry costs 40 / 30 rage.',
  heavySwing: 'A swing at full speed deals +5 / 10 / 15% more.',
  mortalStrike: 'Your next sword hit within 3 s deals double damage, and the enemy can\'t heal for 10 s. 30 rage.',
  sweepingMastery: 'Sweeping Strikes lasts 10 / 12 s.',
  toughness: '+5 / 10 / 15% maximum health.',
  shieldSpikes: 'The shield bash deals +5 / 10 and builds +4 / 8 rage.',
  quickGuard: 'A parry comes 25 / 50% easier.',
  ironArm: 'A blocked heavy blow numbs the arm 33 / 66 / 100% less.',
  shieldSlam: 'Your next shield bash within 3 s stuns for 3 s and exposes, even a brute. 20 rage.',
  unbreakable: 'Shield Wall lasts 8 / 10 s.',
};

/** Every talent of every class, by id, each tree's in tier order. */
export const TALENT: Readonly<Record<Talent, TalentDef>> = Object.fromEntries(
  CLASSES.flatMap((klass) =>
    Object.entries(CONFIG.talents.trees[klass] as Readonly<Record<string, Readonly<Record<string, TalentRow>>>>).flatMap(([tree, rows]) =>
      Object.entries(rows)
        .map(([key, row]): [Talent, TalentDef] => {
          const id = key as Talent;
          const ability = 'use' in row ? (id as Ability) : null;
          const adds = 'adds' in row ? (row.adds as Readonly<Record<string, number>>) : {};
          const line = LINES[id] ?? '';
          return [id, { id, class: klass, tree: tree as Tree, tier: row.tier, max: row.max, adds, ability, name: NAMES[id], line: ability ? `${line} ${unlockLine(ability)}.` : line }];
        })
        .sort(([, a], [, b]) => a.tier - b.tier),
    ),
  ),
) as Record<Talent, TalentDef>;

/** Every talent of every class. */
export const TALENTS = Object.keys(TALENT) as Talent[];

/** What a tree is called. */
export const treeName = (tree: Tree): string => NAMES[tree];

/** A class's two trees, in the order the talent page shows them. */
export const treesOf = (klass: ClassId): readonly Tree[] => Object.keys(CONFIG.talents.trees[klass]) as Tree[];

/** A tree's talents, in tier order. */
export const talentsIn = (tree: Tree): readonly Talent[] => TALENTS.filter((t) => TALENT[t].tree === tree);

/** The tiers a tree's talents are in, from 1. */
export const tiersOf = (tree: Tree): readonly number[] => [...new Set(talentsIn(tree).map((t) => TALENT[t].tier))].sort((a, b) => a - b);

/** Talent points a character of `level` has had in all: one a level from `CONFIG.talents.from`. */
export const pointsAt = (level: number): number => Math.max(0, level - CONFIG.talents.from + 1);

/** Points spent in a tree before its tier `tier` opens: tier 2 at 3, tier 3 at 6. */
export const tierOpensAt = (tier: number): number => CONFIG.talents.tier * (tier - 1);

/** What the level-up says from level 2. */
export const TALENT_POINT_LINE = 'Talent point: open your talents';

/** Points spent in `tree`. */
export const spentIn = (spent: Spent, tree: Tree): number => talentsIn(tree).reduce((n, t) => n + (spent[t] ?? 0), 0);

/** Points spent in all. */
export const spentAll = (spent: Spent): number => TALENTS.reduce((n, t) => n + (spent[t] ?? 0), 0);

/** Is `tree`'s `tier` open with `spent`? */
export const tierOpen = (spent: Spent, tree: Tree, tier: number): boolean => spentIn(spent, tree) >= tierOpensAt(tier);

/** Can a `klass` of `level` put a point in `talent` now? Null if so, or why not. */
export function refusal(spent: Spent, talent: Talent, klass: ClassId, level: number, fighting: boolean): TalentRefusal | null {
  const def = TALENT[talent];
  if (def.class !== klass) return 'class';
  if (fighting) return 'fighting';
  if ((spent[talent] ?? 0) >= def.max) return 'max';
  if (!tierOpen(spent, def.tree, def.tier)) return 'tier';
  if (spentAll(spent) >= pointsAt(level)) return 'points';
  return null;
}

/**
 * Could `spent` have been spent by a `klass` of `level`, a point at a time?
 * Every talent its class's and within its maximum, no more points than the
 * level has brought, and each tier open by the points in the tiers above it.
 */
export function fits(spent: Spent, klass: ClassId, level: number): boolean {
  if (spentAll(spent) > pointsAt(level)) return false;
  for (const t of TALENTS) {
    const n = spent[t] ?? 0;
    if (n === 0) continue;
    const def = TALENT[t];
    if (def.class !== klass || !Number.isInteger(n) || n < 0 || n > def.max) return false;
    // A tier's points count only once the tiers above it held enough to open it.
    const above = talentsIn(def.tree).reduce((sum, u) => sum + (TALENT[u].tier < def.tier ? (spent[u] ?? 0) : 0), 0);
    if (above < tierOpensAt(def.tier)) return false;
  }
  return true;
}

/** What every point in `spent` adds up to, by name: 0 for every number no point adds to. */
export function knobsOf(spent: Spent): Knobs {
  const knobs: Record<string, number> = Object.fromEntries(TALENTS.flatMap((t) => Object.keys(TALENT[t].adds)).map((k) => [k, 0]));
  for (const t of TALENTS) {
    const n = spent[t] ?? 0;
    for (const [k, per] of Object.entries(TALENT[t].adds)) knobs[k] += per * n;
  }
  return knobs as Knobs;
}

/** No talents: every number at 0. */
export const NO_KNOBS: Knobs = knobsOf({});

/** A number talents add to by a name built at run time (`cost:warCry`): 0 if none does. */
export const knob = (knobs: Knobs, name: string): number => (knobs as Readonly<Record<string, number>>)[name] ?? 0;

/** The abilities `spent` grants, in the order of their talents. */
export const talentAbilities = (spent: Spent): readonly Ability[] =>
  TALENTS.flatMap((t) => (TALENT[t].ability && (spent[t] ?? 0) > 0 ? [TALENT[t].ability] : []));

/** What `ability` costs with your talents. */
export const costWith = (ability: Ability, knobs: Knobs): number => Math.max(0, ABILITY[ability].cost + knob(knobs, `cost:${ability}`));

/** How long `ability`, lasting `base` s, lasts with your talents. */
export const lastsWith = (ability: Ability, base: number, knobs: Knobs): number => base + knob(knobs, `lasts:${ability}`);
