import { type Progress, type QuestProgress, STAGES } from '../adventureState';
import { CLASSES, type ClassId } from '../classes';
import { CONFIG } from '../config';
import { type InventorySave, type Stack, startingInventory } from '../inventory';
import { GEAR_SLOTS } from '../items';
import type { Spot } from '../maps/types';
import { GRADES, NO_PROFESSIONS, type ProfessionsSave } from '../professions/professions';

// The save's records: what the browser keeps of each character between
// visits, and of the roster that lists them, and how a record an older build
// wrote is brought up to date. A record is read with no trust in it: whatever
// doesn't fit is unreadable, and a newer build's record is left alone
// (.scratch/oakvale-starting-zone/spec.md, "Saving"; .scratch/abilities/spec.md,
// "Characters and the save").

/** A character's record's version: bump it, and add a migration from the one before, whenever its shape changes. */
export const SAVE_VERSION = 5;

/** Every building and the mine you can be inside. */
export const INTERIORS = ['inn', 'house', 'mine'] as const;

/** A building or the mine you're inside. */
export type Interior = (typeof INTERIORS)[number];

/** Who a character is: their class, fixed once made, and the name the page shows. */
export interface Who {
  readonly class: ClassId;
  readonly name: string;
}

/** Today's one character before the roster (version 3 and earlier): the first of the roster, until renamed. */
export const FIRST_CHARACTER: Who = { class: 'warrior', name: 'Warrior' };

/** One character, as saved. */
export interface SaveRecord extends Progress, Who {
  readonly version: typeof SAVE_VERSION;
  /** When it was written, in ms since 1970. */
  readonly savedAt: number;
  /**
   * Where you stood, in world metres on the ground plane; null for a character
   * made on the page who hasn't played yet, who starts at the starting zone's
   * start, facing Hale.
   */
  readonly position: { readonly x: number; readonly z: number } | null;
  /** Which way you faced, in radians about +Y (0 looks down −Z). */
  readonly facing: number;
  /** The building or mine you were in, or null outdoors. */
  readonly interior: Interior | null;
}

/** The record for the character `who` with `progress`, standing at `at`, inside `at.interior` if it says so. */
export function saveRecord(progress: Progress, at: Spot & { readonly interior?: Interior | null }, savedAt = Date.now(), who: Who = FIRST_CHARACTER): SaveRecord {
  return { version: SAVE_VERSION, savedAt, class: who.class, name: who.name, ...progress, position: { x: at.x, z: at.z }, facing: at.yaw, interior: at.interior ?? null };
}

/** Is `name` one a character can have: some letters, at most `CONFIG.save.name` of them, with nothing round them? */
export const isName = (name: unknown): name is string =>
  typeof name === 'string' && name.length > 0 && name.length <= CONFIG.save.name && name.trim() === name;

/** A record as some version wrote it: nothing is known of it but its version. */
export interface OlderRecord {
  readonly version: number;
  readonly [field: string]: unknown;
}

/** Brings a record written at version `from` up to the next version. */
export interface Migration {
  readonly from: number;
  up(record: OlderRecord): OlderRecord;
}

/**
 * Every migration, in order: each takes a record one version up.
 *
 * 1 → 2, the inventory (.scratch/inventory/spec.md, "Saving"): the sword in
 * your hand becomes the warrior's starting kit, wearing that sword (the plain
 * one, or Hale's old longsword), with three minor healing potions on the belt
 * and no coins. Nothing earned before is paid again.
 *
 * 2 → 3, professions (.scratch/professions/spec.md, "Saving"): none learned,
 * and nothing paid for what came before.
 *
 * 3 → 4, the roster (.scratch/abilities/spec.md, "Characters and the save"):
 * today's one character becomes the roster's first, a warrior named
 * "Warrior". The roster itself is its own record (`readRoster`).
 *
 * 4 → 5, talents (.scratch/abilities/issues/25-talents-and-the-warriors-trees.md):
 * no points spent, so every point the levels brought is there to spend.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    from: 1,
    up: ({ sword, ...rest }) => ({
      ...rest,
      inventory: startingInventory('warrior', sword === 'hale' ? { mainHand: 'hale-longsword' } : {}),
    }),
  },
  { from: 2, up: (record) => ({ ...record, professions: NO_PROFESSIONS }) },
  { from: 3, up: (record) => ({ ...record, ...FIRST_CHARACTER }) },
  { from: 4, up: (record) => ({ ...record, talents: {} }) },
];

/** What was found where the save is kept. */
export type Loaded =
  | { readonly kind: 'none' }
  | { readonly kind: 'saved'; readonly record: SaveRecord }
  /** Written by a newer build than this one, which can't read it and mustn't overwrite it. */
  | { readonly kind: 'newer'; readonly version: number }
  /** Not a record, or an older one with no way up. */
  | { readonly kind: 'unreadable' };

/** Read what the store holds, upgrading an older record through `migrations`. */
export function readSave(stored: unknown, migrations: readonly Migration[] = MIGRATIONS): Loaded {
  if (stored === undefined || stored === null) return { kind: 'none' };
  if (!isObject(stored) || !Number.isInteger(stored.version)) return { kind: 'unreadable' };
  let record = stored as OlderRecord;
  if (record.version > SAVE_VERSION) return { kind: 'newer', version: record.version };
  while (record.version < SAVE_VERSION) {
    const step = migrations.find((m) => m.from === record.version);
    if (!step) return { kind: 'unreadable' };
    record = { ...step.up(record), version: record.version + 1 };
  }
  return isCurrent(record) ? { kind: 'saved', record } : { kind: 'unreadable' };
}

/** The roster record's version: bumped, with its own migrations, whenever its shape changes. */
export const ROSTER_VERSION = 1;

/** The roster: which characters there are, in the page's slot order, and the one played last. */
export interface RosterRecord {
  readonly version: typeof ROSTER_VERSION;
  /** Each character's key in the store, in slot order: at most `CONFIG.save.characters`. */
  readonly characters: readonly string[];
  /** The key of the one played (or picked) last, or null for none. */
  readonly last: string | null;
}

/** What was found where the roster is kept. */
export type LoadedRoster =
  | { readonly kind: 'none' }
  | { readonly kind: 'saved'; readonly roster: RosterRecord }
  | { readonly kind: 'newer'; readonly version: number }
  | { readonly kind: 'unreadable' };

/** Read the roster as the store holds it. */
export function readRoster(stored: unknown): LoadedRoster {
  if (stored === undefined || stored === null) return { kind: 'none' };
  if (!isObject(stored) || !Number.isInteger(stored.version)) return { kind: 'unreadable' };
  const version = stored.version as number;
  if (version > ROSTER_VERSION) return { kind: 'newer', version };
  const { characters, last } = stored;
  const ok =
    version === ROSTER_VERSION &&
    Array.isArray(characters) &&
    characters.length <= CONFIG.save.characters &&
    characters.every((k) => typeof k === 'string') &&
    new Set(characters).size === characters.length &&
    (last === null || typeof last === 'string');
  return ok ? { kind: 'saved', roster: stored as unknown as RosterRecord } : { kind: 'unreadable' };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isOneOf = <T>(list: readonly T[], v: unknown): v is T => list.includes(v as T);

/**
 * Does it hold everything a current record does, each of the right kind?
 * Quests it doesn't hold start afresh; talents and swaps are checked against
 * the trees on load (adventureState.ts), so one this build doesn't know
 * gives every point back rather than making the save unreadable.
 */
function isCurrent(r: OlderRecord): r is OlderRecord & SaveRecord {
  return (
    r.version === SAVE_VERSION &&
    isNumber(r.savedAt) &&
    isOneOf(CLASSES, r.class) &&
    isName(r.name) &&
    Number.isInteger(r.level) &&
    isNumber(r.xp) &&
    isObject(r.quests) &&
    Object.values(r.quests).every(isQuest) &&
    typeof r.wardenBeaten === 'boolean' &&
    isInventory(r.inventory) &&
    isProfessions(r.professions) &&
    isObject(r.talents) &&
    Object.values(r.talents).every(isNumber) &&
    (r.placed === undefined || isObject(r.placed)) &&
    (r.position === null || (isObject(r.position) && isNumber(r.position.x) && isNumber(r.position.z))) &&
    isNumber(r.facing) &&
    (r.interior === null || isOneOf(INTERIORS, r.interior))
  );
}

/**
 * Is it the inventory's shape? What it holds is checked on load
 * (inventory.ts): an item the catalogue no longer knows is dropped there,
 * not read as a broken save.
 */
function isInventory(v: unknown): v is InventorySave {
  return (
    isObject(v) &&
    isSlots(v.bag) &&
    Array.isArray(v.quest) &&
    v.quest.every((id) => typeof id === 'string') &&
    isGear(v.gear) &&
    isSlots(v.belt) &&
    isNumber(v.coins) &&
    isSlots(v.stash) &&
    Array.isArray(v.chests) &&
    v.chests.every((id) => typeof id === 'string') &&
    isNumber(v.cooldown)
  );
}

/**
 * Is it the professions' shape? What it holds is checked on load
 * (professions/professions.ts): a recipe the game no longer knows is dropped
 * there, and proficiency kept within its grade.
 */
function isProfessions(v: unknown): v is ProfessionsSave {
  return (
    isObject(v) &&
    isObject(v.learned) &&
    Object.values(v.learned).every((l) => isObject(l) && isNumber(l.proficiency) && isOneOf(GRADES, l.grade)) &&
    Array.isArray(v.recipes) &&
    v.recipes.every((id) => typeof id === 'string')
  );
}

const isGear = (v: unknown) => isObject(v) && GEAR_SLOTS.every((slot) => v[slot] === null || typeof v[slot] === 'string');

const isSlots = (v: unknown): v is (Stack | null)[] =>
  Array.isArray(v) && v.every((s) => s === null || (isObject(s) && typeof s.id === 'string' && isNumber(s.count)));

function isQuest(q: unknown): q is QuestProgress {
  return isObject(q) && isOneOf(STAGES, q.stage) && Array.isArray(q.counts) && q.counts.every(isNumber) && (q.taken === undefined || isNumber(q.taken));
}
