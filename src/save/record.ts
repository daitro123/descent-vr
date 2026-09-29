import { type Progress, type QuestProgress, STAGES } from '../adventureState';
import type { Spot } from '../maps/types';
import { SWORDS } from '../quests';

// The save record: what the browser keeps of one character between visits,
// and how a record an older build wrote is brought up to date. A record is
// read with no trust in it: whatever doesn't fit is unreadable, and a newer
// build's record is left alone (.scratch/oakvale-starting-zone/spec.md, "Saving").

/** The record's version: bump it, and add a migration from the one before, whenever its shape changes. */
export const SAVE_VERSION = 1;

/** Every building and the mine you can be inside. The inn and the house are built; the mine arrives with its ticket. */
export const INTERIORS = ['inn', 'house', 'mine'] as const;

/** A building or the mine you're inside. */
export type Interior = (typeof INTERIORS)[number];

/** One character, as saved. */
export interface SaveRecord extends Progress {
  readonly version: typeof SAVE_VERSION;
  /** When it was written, in ms since 1970. */
  readonly savedAt: number;
  /** Where you stood, in world metres on the ground plane. */
  readonly position: { readonly x: number; readonly z: number };
  /** Which way you faced, in radians about +Y (0 looks down −Z). */
  readonly facing: number;
  /** The building or mine you were in, or null outdoors. */
  readonly interior: Interior | null;
}

/** The record for a character with `progress`, standing at `at`, inside `at.interior` if it says so. */
export function saveRecord(progress: Progress, at: Spot & { readonly interior?: Interior | null }, savedAt = Date.now()): SaveRecord {
  return { version: SAVE_VERSION, savedAt, ...progress, position: { x: at.x, z: at.z }, facing: at.yaw, interior: at.interior ?? null };
}

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

/** Every migration, in order: each takes a record one version up. None yet, since version 1 is the first. */
export const MIGRATIONS: readonly Migration[] = [];

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

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isOneOf = <T>(list: readonly T[], v: unknown): v is T => list.includes(v as T);

/** Does it hold everything a current record does, each of the right kind? Quests it doesn't hold start afresh. */
function isCurrent(r: OlderRecord): r is OlderRecord & SaveRecord {
  return (
    r.version === SAVE_VERSION &&
    isNumber(r.savedAt) &&
    Number.isInteger(r.level) &&
    isNumber(r.xp) &&
    isOneOf(SWORDS, r.sword) &&
    isObject(r.quests) &&
    Object.values(r.quests).every(isQuest) &&
    typeof r.wardenBeaten === 'boolean' &&
    isObject(r.position) &&
    isNumber(r.position.x) &&
    isNumber(r.position.z) &&
    isNumber(r.facing) &&
    (r.interior === null || isOneOf(INTERIORS, r.interior))
  );
}

function isQuest(q: unknown): q is QuestProgress {
  return isObject(q) && isOneOf(STAGES, q.stage) && Array.isArray(q.counts) && q.counts.every(isNumber);
}
