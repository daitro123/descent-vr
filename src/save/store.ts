import { CONFIG } from '../config';
import { openIndexedDb } from './indexedDb';
import { readSave, type SaveRecord } from './record';

// Where the save is kept: a port with two adapters. In the browser it's
// IndexedDB (indexedDb.ts); in tests, and wherever the browser won't store
// data, it's kept in memory for as long as the page is open, and the page
// says progress won't be kept.

export interface SaveStore {
  /** Kept between visits: false for the in-memory store. */
  readonly lasting: boolean;
  /** The record as kept, or undefined when there's none. */
  read(): Promise<unknown>;
  write(record: SaveRecord): Promise<void>;
  clear(): Promise<void>;
}

/** The save kept in memory: gone when the page closes. */
export class MemoryStore implements SaveStore {
  readonly lasting: boolean = false;
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
  readonly store: SaveStore;
  /** The character to load, or null for a new one. */
  readonly record: SaveRecord | null;
  /** What the page says about saving, or null when all is well. */
  readonly note: string | null;
}

const UNSAVED = "This browser won't store data for the game (a private window?), so it plays, but your progress won't be kept.";
const NEWER = "Your save is from a newer version of the game, so this page leaves it alone and your progress here won't be kept. Reload to get the new version.";

/**
 * Open the browser's save (`open`) and read the character in it. Where it
 * won't open, or holds a newer build's record, the game plays unsaved in
 * memory and says so. An unreadable record starts a new character over it.
 */
export async function openSave(open: () => Promise<SaveStore> = openIndexedDb): Promise<Save> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, fail) => {
    timer = setTimeout(() => fail(new Error('the save took too long to open')), CONFIG.save.openTimeout * 1000);
  });
  try {
    const store = await Promise.race([open(), late]);
    const loaded = readSave(await Promise.race([store.read(), late]));
    switch (loaded.kind) {
      case 'saved':
        return { store, record: loaded.record, note: null };
      case 'newer':
        console.warn(`The save is version ${loaded.version}, newer than this build: playing unsaved.`);
        return { store: new MemoryStore(), record: null, note: NEWER };
      case 'unreadable':
        console.warn('The save could not be read: starting a new character.');
        return { store, record: null, note: null };
      case 'none':
        return { store, record: null, note: null };
    }
  } catch (e) {
    console.warn('Saving is off:', e);
    return { store: new MemoryStore(), record: null, note: UNSAVED };
  } finally {
    clearTimeout(timer);
  }
}
