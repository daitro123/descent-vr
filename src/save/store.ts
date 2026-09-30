import { AdventureState } from '../adventureState';
import type { ClassId } from '../classes';
import { CONFIG } from '../config';
import { CHAINS } from '../quests';
import { openIndexedDb } from './indexedDb';
import { isName, readRoster, readSave, ROSTER_VERSION, type RosterRecord, SAVE_VERSION, type SaveRecord, type Who } from './record';

// Where the save is kept: a port with two adapters. In the browser it's
// IndexedDB (indexedDb.ts); in tests, and wherever the browser's can't be
// used, it's kept in memory for as long as the page is open, and the page
// says progress won't be kept. The store keeps records by key: the roster
// under `ROSTER`, and each character under its own key, which the roster lists
// (.scratch/abilities/spec.md, "Characters and the save").

export interface SaveStore {
  /** The value kept under `key`, or undefined when there's none. */
  read(key: string): Promise<unknown>;
  write(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

/** The save kept in memory: gone when the page closes. */
export class MemoryStore implements SaveStore {
  private readonly kept = new Map<string, unknown>();

  /** Holding each of `inside`'s values under its key, as if they'd been written. */
  constructor(inside: Readonly<Record<string, unknown>> = {}) {
    for (const [key, value] of Object.entries(inside)) this.kept.set(key, structuredClone(value));
  }

  async read(key: string): Promise<unknown> {
    return structuredClone(this.kept.get(key));
  }

  async write(key: string, value: unknown): Promise<void> {
    this.kept.set(key, structuredClone(value));
  }

  async remove(key: string): Promise<void> {
    this.kept.delete(key);
  }

  /** Every key it holds. */
  keys(): string[] {
    return [...this.kept.keys()];
  }
}

/** The roster's key. */
export const ROSTER = 'roster';

/**
 * The key today's one character was kept under, before the roster: the first
 * character keeps it, so a page from an older build finds a newer record
 * there and leaves it alone.
 */
export const FIRST = 'character';

/** A character in one of the page's slots, as the store holds it. */
export type Slot =
  | { readonly key: string; readonly kind: 'saved'; readonly record: SaveRecord }
  /** Written by a newer build, or not a record this build can read: shown, never played or written over, but it can be deleted. */
  | { readonly key: string; readonly kind: 'newer' | 'unreadable' };

/** The character Enter VR plays, and where its progress goes. */
export interface Played {
  /** Its key in the store. */
  readonly key: string;
  /** Its record, or null for a new one that isn't saved yet. */
  readonly record: SaveRecord | null;
  /** Its class and name: the name can change on the page before VR. */
  readonly who: { readonly class: ClassId; name: string };
  /** Write its record, adding it to the roster the first time. */
  write(record: SaveRecord): Promise<void>;
}

const UNSAVED = "This browser won't store data for the game (a private window?), so it plays, but your progress won't be kept.";
const NEWER = "Your save is from a newer version of the game, so this page leaves it alone and your progress here won't be kept. Reload to get the new version.";
const UNREADABLE = "Your characters couldn't be read, so this page leaves them alone and your progress here won't be kept.";
const NO_ROOM = "Every slot holds a character this page can't read, so your progress here won't be kept. Delete one to make room.";

/** Names the page suggests for a new character: placeholders, cheap to change. */
export const NAMES = ['Aldric', 'Brenna', 'Corwin', 'Dara', 'Edric', 'Fenna', 'Garrick', 'Hilde', 'Ivo', 'Kestrel', 'Maren', 'Osric', 'Rowan', 'Sable', 'Tamsin', 'Wren'] as const;

/** A new character's record: level 1 in their class's starting kit, at the start. */
export function newRecord(who: Who, savedAt = Date.now()): SaveRecord {
  const progress = new AdventureState(undefined, CHAINS, { class: who.class }).snapshot();
  return { version: SAVE_VERSION, savedAt, class: who.class, name: who.name, ...progress, position: null, facing: 0, interior: null };
}

/**
 * Your characters: the roster and every character it lists, as the store
 * holds them, and what the page before VR does with them (pick, make, delete,
 * rename). Each change is written at once. Nothing is written just by opening
 * it, so a page left open before VR never overwrites a save made since in
 * another tab: a roster migrated from today's one record is written with the
 * first change to it or to a character.
 */
export class Characters {
  /** The keys in slot order, and the last played. */
  private roster: { characters: string[]; last: string | null };
  private list: Slot[];
  /** Is the roster in the store as it is here? */
  private stored: boolean;
  private playing: Played | null = null;

  private constructor(
    private readonly store: SaveStore,
    roster: RosterRecord | null,
    slots: Slot[],
    stored: boolean,
    /** What the page says about saving, or null when all is well. */
    public note: string | null,
  ) {
    this.roster = { characters: slots.map((s) => s.key), last: roster?.last ?? null };
    this.list = slots;
    this.stored = stored && slots.length === (roster?.characters.length ?? 0);
  }

  /**
   * Read the roster and every character in `store`. Without a roster, today's
   * one record (under `FIRST`) becomes the first character. A roster this
   * build can't read, or a record from before the roster that a newer build
   * wrote, leaves the whole store alone: the game plays in memory and says so.
   */
  static async read(store: SaveStore): Promise<Characters> {
    const found = readRoster(await store.read(ROSTER));
    switch (found.kind) {
      case 'newer':
        console.warn(`The roster is version ${found.version}, newer than this build: playing unsaved.`);
        return Characters.unsaved(NEWER);
      case 'unreadable':
        console.warn('The roster could not be read: playing unsaved.');
        return Characters.unsaved(UNREADABLE);
      case 'saved': {
        const slots: Slot[] = [];
        for (const key of found.roster.characters) {
          const slot = slotOf(key, await store.read(key));
          if (slot) slots.push(slot);
        }
        return new Characters(store, found.roster, slots, true, null);
      }
      case 'none': {
        const first = await store.read(FIRST);
        const slot = slotOf(FIRST, first);
        if (slot?.kind === 'newer') {
          console.warn('The save is newer than this build: playing unsaved.');
          return Characters.unsaved(NEWER);
        }
        const roster: RosterRecord = { version: ROSTER_VERSION, characters: slot ? [FIRST] : [], last: slot?.kind === 'saved' ? FIRST : null };
        return new Characters(store, roster, slot ? [slot] : [], false, null);
      }
    }
  }

  /** No characters, kept in memory, with `note` on the page. */
  static unsaved(note: string | null = null): Characters {
    return new Characters(new MemoryStore(), null, [], false, note);
  }

  /** Every character, in slot order. */
  get slots(): readonly Slot[] {
    return this.list;
  }

  /** Are all the slots taken? */
  get full(): boolean {
    return this.list.length >= CONFIG.save.characters;
  }

  /** The key of the character Enter VR plays: the last played, else the first that can be played, else null for a new one. */
  get picked(): string | null {
    const playable = this.list.filter((s) => s.kind === 'saved').map((s) => s.key);
    return playable.find((k) => k === this.roster.last) ?? playable[0] ?? null;
  }

  /**
   * The picked character, to play: the same one each time it's asked for.
   * With none picked, a new warrior with a suggested name, saved (and added
   * to the roster) with its first write, as a new character always was.
   */
  play(): Played {
    if (this.playing) return this.playing;
    const key = this.picked;
    const slot = this.list.find((s) => s.key === key);
    const record = slot?.kind === 'saved' ? slot.record : null;
    const who = record ? { class: record.class, name: record.name } : { class: 'warrior' as ClassId, name: this.suggestName() };
    const played: Played = { key: key ?? this.freeKey(), record, who, write: (r) => this.write(played.key, r) };
    if (!record && this.full) this.note = NO_ROOM;
    return (this.playing = played);
  }

  /** A name for a new character that none of yours has: one of `NAMES`, chosen by `random`. */
  suggestName(random: () => number = Math.random): string {
    const taken = new Set(this.list.map((s) => (s.kind === 'saved' ? s.record.name : '')));
    if (this.playing) taken.add(this.playing.who.name);
    const free = NAMES.filter((n) => !taken.has(n));
    const from = free.length ? free : NAMES;
    return from[Math.min(from.length - 1, Math.floor(random() * from.length))];
  }

  /** Make a character of `klass` named `name` in the next free slot, and pick it. Its key, or null with no slot free (or no name). */
  async make(klass: ClassId, name: string, savedAt = Date.now()): Promise<string | null> {
    if (this.full || !isName(name)) return null;
    const key = this.freeKey();
    const record = newRecord({ class: klass, name }, savedAt);
    await this.store.write(key, record);
    this.list.push({ key, kind: 'saved', record });
    this.roster.characters.push(key);
    this.roster.last = key;
    await this.writeRoster();
    return key;
  }

  /** Pick the character under `key` to play next: the roster's last played. */
  async pick(key: string): Promise<void> {
    if (!this.list.some((s) => s.key === key && s.kind === 'saved')) return;
    this.roster.last = key;
    await this.writeRoster();
  }

  /** Delete the character under `key`, for good. */
  async remove(key: string): Promise<void> {
    if (!this.list.some((s) => s.key === key)) return;
    this.list = this.list.filter((s) => s.key !== key);
    this.roster.characters = this.roster.characters.filter((k) => k !== key);
    if (this.roster.last === key) this.roster.last = null;
    await this.writeRoster();
    await this.store.remove(key);
  }

  /** Call the character under `key` `name`: the one being played (saved or not) keeps it in every write from now on. */
  async rename(key: string, name: string): Promise<void> {
    if (!isName(name)) return;
    if (this.playing?.key === key) this.playing.who.name = name;
    const at = this.list.findIndex((s) => s.key === key);
    const slot = this.list[at];
    if (slot?.kind !== 'saved') return;
    const record = { ...slot.record, name };
    this.list[at] = { ...slot, record };
    await this.store.write(key, record);
    if (!this.stored) await this.writeRoster();
  }

  /** The first key no character has: `FIRST`, then `character-2`, `character-3`… */
  private freeKey(): string {
    const used = new Set(this.roster.characters);
    if (!used.has(FIRST)) return FIRST;
    for (let n = 2; ; n++) if (!used.has(`${FIRST}-${n}`)) return `${FIRST}-${n}`;
  }

  /** The played character's write: into its slot, and into the roster the first time. */
  private async write(key: string, record: SaveRecord): Promise<void> {
    const at = this.list.findIndex((s) => s.key === key);
    if (at < 0) {
      if (this.full) return;
      this.list.push({ key, kind: 'saved', record });
      this.roster.characters.push(key);
      this.roster.last = key;
    } else {
      this.list[at] = { key, kind: 'saved', record };
    }
    await this.store.write(key, record);
    if (!this.stored || at < 0) await this.writeRoster();
  }

  private async writeRoster(): Promise<void> {
    const roster: RosterRecord = { version: ROSTER_VERSION, characters: [...this.roster.characters], last: this.roster.last };
    await this.store.write(ROSTER, roster);
    this.stored = true;
  }
}

/** A character's slot, from what the store holds under `key`: none if it holds nothing. */
function slotOf(key: string, stored: unknown): Slot | null {
  const loaded = readSave(stored);
  switch (loaded.kind) {
    case 'none':
      return null;
    case 'saved':
      return { key, kind: 'saved', record: loaded.record };
    case 'newer':
      console.warn(`The character under "${key}" is version ${loaded.version}, newer than this build: left alone.`);
      return { key, kind: 'newer' };
    case 'unreadable':
      console.warn(`The character under "${key}" could not be read: left alone.`);
      return { key, kind: 'unreadable' };
  }
}

/**
 * Open the browser's save (`open`) and read your characters. Where it won't
 * open, the game plays unsaved in memory and says so.
 */
export async function openCharacters(open: () => Promise<SaveStore> = openIndexedDb): Promise<Characters> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, fail) => {
    timer = setTimeout(() => fail(new Error('the save took too long to open')), CONFIG.save.openTimeout * 1000);
  });
  try {
    const browser = await Promise.race([open(), late]);
    return await Promise.race([Characters.read(browser), late]);
  } catch (e) {
    console.warn('Saving is off:', e);
    return Characters.unsaved(UNSAVED);
  } finally {
    clearTimeout(timer);
  }
}
