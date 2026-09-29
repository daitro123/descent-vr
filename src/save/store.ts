import { CONFIG } from '../config';
import { openIndexedDb } from './indexedDb';
import { type Loaded, readSave, type SaveRecord } from './record';

// Where the save is kept: a port with two adapters. In the browser it's
// IndexedDB (indexedDb.ts); in tests, and wherever the browser's can't be
// used, it's kept in memory for as long as the page is open, and the page
// says progress won't be kept.

export interface SaveStore {
  /** The record as kept, or undefined when there's none. */
  read(): Promise<unknown>;
  write(record: SaveRecord): Promise<void>;
  clear(): Promise<void>;
}

/** The save kept in memory: gone when the page closes. */
export class MemoryStore implements SaveStore {
  private kept: unknown;

  /** Holding `inside`, as if it had been written. */
  constructor(inside?: unknown) {
    this.kept = structuredClone(inside);
  }

  async read(): Promise<unknown> {
    return structuredClone(this.kept);
  }

  async write(record: SaveRecord): Promise<void> {
    this.kept = structuredClone(record);
  }

  async clear(): Promise<void> {
    this.kept = undefined;
  }
}

/** The save as the Adventure opens it. */
export interface Save {
  /** Where the Adventure writes: the browser's store, or memory when that can't be used. */
  readonly store: SaveStore;
  /** The character to load, or null for a new one. */
  readonly record: SaveRecord | null;
  /** Does the browser hold a character, readable here or not? `?newgame` asks before deleting it. */
  readonly held: boolean;
  /** What the page says about saving, or null when all is well. */
  readonly note: string | null;
  /** Delete what the browser holds, and save a new character there from now on. */
  startOver(): Promise<Save>;
}

const UNSAVED = "This browser won't store data for the game (a private window?), so it plays, but your progress won't be kept.";
const NEWER = "Your save is from a newer version of the game, so this page leaves it alone and your progress here won't be kept. Reload to get the new version.";
const UNREADABLE = "Your save couldn't be read, so this page leaves it alone and your progress here won't be kept. Open ?newgame to start over.";

/**
 * Open the browser's save (`open`) and read the character in it. Where it
 * won't open, the game plays unsaved in memory and says so. A record this
 * build can't read (a newer build's, or one it can't make sense of) is left
 * alone in the same way, so a deploy or a stale page never wipes a character.
 */
export async function openSave(open: () => Promise<SaveStore> = openIndexedDb): Promise<Save> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, fail) => {
    timer = setTimeout(() => fail(new Error('the save took too long to open')), CONFIG.save.openTimeout * 1000);
  });
  let browser: SaveStore;
  let loaded: Loaded;
  try {
    browser = await Promise.race([open(), late]);
    loaded = readSave(await Promise.race([browser.read(), late]));
  } catch (e) {
    console.warn('Saving is off:', e);
    const unsaved: Save = { store: new MemoryStore(), record: null, held: false, note: UNSAVED, startOver: async () => unsaved };
    return unsaved;
  } finally {
    clearTimeout(timer);
  }
  const startOver = async (): Promise<Save> => {
    await browser.clear();
    return { store: browser, record: null, held: false, note: null, startOver };
  };
  const unsaved = (note: string): Save => ({ store: new MemoryStore(), record: null, held: true, note, startOver });
  switch (loaded.kind) {
    case 'saved':
      return { store: browser, record: loaded.record, held: true, note: null, startOver };
    case 'none':
      return { store: browser, record: null, held: false, note: null, startOver };
    case 'newer':
      console.warn(`The save is version ${loaded.version}, newer than this build: playing unsaved.`);
      return unsaved(NEWER);
    case 'unreadable':
      console.warn('The save could not be read: playing unsaved.');
      return unsaved(UNREADABLE);
  }
}
