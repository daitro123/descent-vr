import type { SaveStore } from './store';

// The save in the browser's IndexedDB: one database, one store, a record under
// each key (the roster's, and each character's). Every name starts with
// "descent-vr", since all of Tom's Pages sites share one origin. Each write is its own transaction with strict durability, so a
// write that reports done is on disk. Checked in headless Chromium
// (.scratch/oakvale-starting-zone/checks/saving.mjs), not in the unit tests.

const DATABASE = 'descent-vr';
const STORE = 'save';

/** Open the database, asking once for storage the browser won't clear on its own. Rejects if IndexedDB won't open. */
export function openIndexedDb(): Promise<SaveStore> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => {
      const db = request.result;
      // A newer build opening the database elsewhere shouldn't wait on this page.
      db.onversionchange = () => db.close();
      askToPersist();
      resolve(new IndexedDbStore(db));
    };
    request.onerror = () => reject(request.error);
  });
}

/** Logged for the headset check; nothing depends on the answer. */
function askToPersist(): void {
  navigator.storage
    ?.persist?.()
    .then((kept) => console.info(`Storage persisted: ${kept}`))
    .catch((e) => console.info('Storage persisted: no answer', e));
}

class IndexedDbStore implements SaveStore {
  constructor(private readonly db: IDBDatabase) {}

  read(key: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const request = this.db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  write(key: string, value: unknown): Promise<void> {
    return this.change((store) => store.put(value, key));
  }

  remove(key: string): Promise<void> {
    return this.change((store) => store.delete(key));
  }

  /** One change in its own strict transaction: done once it's on disk. */
  private change(what: (store: IDBObjectStore) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, 'readwrite', { durability: 'strict' });
      what(tx.objectStore(STORE));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('the save was aborted'));
    });
  }
}
