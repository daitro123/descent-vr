# Saving in the Quest browser

_Research for [issue 05](../issues/05-saving-in-the-quest-browser.md), 2026-09-28. Sources are numbered and listed at the end._

## Bottom line

- Saving in the Quest Browser is reliable enough for a single-player game. In practice a save is lost when Tom clears the site's data, plays in a private window, or the headset runs almost out of space while our site is the least recently used one. [3][4][5]
- `localStorage` and IndexedDB are equally safe from eviction. They sit in the same per-origin bucket, and the browser clears that bucket whole. [1][3] Pick between them on write safety and API, not on eviction.
- **Use IndexedDB**: one database named `descent-vr`, one record, written with `durability: 'strict'`. IndexedDB tells you when the write has reached disk. Chromium's `localStorage` delays writing to disk by at least 5 seconds and allows at most 60 disk writes an hour. [8][11]
- Call `navigator.storage.persist()` once, and don't depend on the answer. Chromium grants it silently from engagement signals and never shows a prompt. Meta does not document what the Quest Browser does. [5][9]
- New deploys and browser updates keep the save, because storage is keyed by origin only. [1][10] The desktop emulator, `localhost` and the headset each have separate saves.
- `https://daitro123.github.io` is shared by every Pages repo of that user, so give every name a `descent-vr` prefix. [2][13]

## Findings

### Size

- `localStorage`: the Storage Standard recommends 5 MiB per origin. [1] Chromium allows 10 MiB per origin and counts 2 bytes per character, so about 5 million characters. [7] It stores strings only, and a write over the limit throws `QuotaExceededError`. [2][3]
- IndexedDB: Chromium lets the browser use up to 80% of the disk and one origin up to 60%. [3][6] On a Quest 3 that is many gigabytes.
- A save of level, XP, items, quest states and position is a few kilobytes of JSON (our estimate). Size does not decide the choice.

### Eviction, `persist()` and clearing

- By default, an origin's data is "best-effort". The browser may delete it under storage pressure, least recently used origin first, without asking. [1][3][4]
- In Chromium, eviction gets more aggressive as free disk space drops toward 2 GB or 10% of the disk, whichever is smaller. [6] A full Quest can reach that point, but a game played this week will be far from least recently used. Meta may tune these values in its build; Meta does not document it.
- Eviction deletes all of an origin's data at once: `localStorage`, IndexedDB and the rest together. [1][3] A `localStorage` copy therefore does not back up an IndexedDB save.
- "Persistent" data is kept under storage pressure. The browser may delete it only with the user's involvement. [1][3] `persist()` protects `localStorage` and IndexedDB alike. [5]
- Chrome's rule for `persist()`: grant it if the site is installed, or if it is among the user's 10 most important sites by engagement, bookmarks, home-screen launches or notification permission. Otherwise it returns `false` silently. [5][9] Chrome looks at the registrable domain, and `github.io` is on the Public Suffix List, so it scores `daitro123.github.io` as one site. [9][14] That code lives in Chrome's own layer, so the Quest Browser may do something else. Meta's docs don't cover `persist()`, and they say Quest Browser has no web push, which removes one of Chrome's signals (medium confidence). [17]
- Clearing browsing data wipes the save, and "persistent" storage does not protect against that. [3][5] The Quest Browser's Clear Browsing Data dialog has a "Cookies and site data" option (medium confidence; Meta's own help page was blocked, so this comes from a how-to guide). [18]
- Private browsing deletes its data when the session ends. [3] The Quest Browser has had a separate private-mode window since February 2026 (medium confidence). [16]

### Browser updates and new deploys

- A storage key is the origin: scheme, host and port. [1] A new build at `https://daitro123.github.io/descent-vr/` has the same origin, so it reads the same save. Only our own code can break it: a new save shape with no migration, or a renamed database or key.
- Moving the game to a custom domain would change the origin, and the old saves would stay behind on `daitro123.github.io`.
- Browser updates keep site data. No spec or Meta doc says so outright. Chromium moves stored data across its own format changes: in 2026 it is moving `localStorage` from LevelDB to SQLite, with an end-to-end browser test for the move. [10] The Quest Browser takes a new Chromium version every month or two (M142 in January 2026, M146 in April; medium confidence). [16]

### Separate storage per device, browser and origin

- Each browser on each device keeps its own storage, keyed by origin. [1] Nothing in the specs or Meta's docs syncs site storage between devices.
- This gives separate saves for:
  - the headset's Quest Browser at the live URL;
  - desktop Chrome with the IWER emulator at the live URL (a different browser on a different machine);
  - `npm run dev` at `http://localhost:5173`, a different origin (and a new one again if Vite moves to port 5174);
  - `npm run dev:quest` on the headset at `https://<LAN IP>:5173`, a different origin from the live site ([package.json](../../../package.json), [vite.config.ts](../../../vite.config.ts)).
- A save made while testing on the dev server will not appear on the live site, and the reverse.

### The shared `github.io` origin

- A project site is served at `https://<owner>.github.io/<repo>`, so every Pages repo of `daitro123`, and the user site, share one origin. [13]
- Web storage cannot be limited by path. The HTML spec warns that authors sharing a host share one `localStorage` and can read and overwrite each other's data. [2] The same goes for IndexedDB names, the 10 MiB `localStorage` limit, the quota, `persist()` and eviction: they cover the whole origin. [1][3][7]
- So name the database `descent-vr`. If `localStorage` is ever used, for settings for example, prefix its keys with `descent-vr:`. Clearing site data for `daitro123.github.io` wipes every one of those repos at once.

### Write safety

- Chromium's `localStorage` updates memory at once, then writes to disk in batches: at least 5 s after a change, at most 60 disk writes and 10 MiB an hour. [8] The page gets no signal that the data reached disk. If the browser process is killed in that window, the last save is lost.
- An IndexedDB transaction fires `complete` when it commits. With `durability: 'strict'`, the browser counts it as committed only once the data is on persistent storage. [11] It is also asynchronous, so it never blocks the frame. [4]
- `visibilitychange` to `hidden` is the last event a page can rely on seeing. [12] An asynchronous write started then may not finish, so it is a bonus and cannot be the main save.

## Recommendation

**IndexedDB, one record, strict writes.** Use a small hand-written promise wrapper of about 30 lines; no library is needed.

- Database `descent-vr`, IndexedDB version 1, object store `saves`, one record under the key `main`. Keep the IndexedDB version at 1. It versions the stores, not the save, and changes only if a store is added.
- Write with `db.transaction('saves', 'readwrite', { durability: 'strict' })`. Treat the save as done on `complete`, and catch `QuotaExceededError` and other errors. [3][11]
- After the first save succeeds, call `navigator.storage.persist()` once and log the result. Nothing depends on it.
- No `localStorage` mirror. It sits in the same bucket as IndexedDB, so eviction or clearing removes both. [1][3]

### What a save holds

```ts
interface SaveV1 {
  version: 1;          // save format; bump on any change of shape or meaning
  savedAt: string;     // ISO time, for debugging and a "last played" line
  character: {
    level: number;
    xp: number;
    items: string[];                             // item ids
    equipped: { weapon?: string; shield?: string };
  };
  quests: Record<string, { state: 'active' | 'ready' | 'done'; progress?: number }>; // by quest id; missing = not started
  place: { zone: string; x: number; y: number; z: number; yaw: number };
}
```

- Use stable string ids for items, quests and zones, such as `oakvale.missing-miner`. Never use array indices or display names: a later build may reorder or rename content.
- Leave out health and cooldowns, and restore them on load. Ticket 03 (death and respawn) may turn `place` into a safe spot or respawn point instead of the exact position.

### When to write

- When a quest's state changes: accept, objective progress, turn-in.
- On a level-up, an XP gain or a new item. These usually come with a turn-in, and one write covers them all.
- When the player crosses into another zone.
- Every 30 to 60 seconds of play, if the position has changed.
- When `visibilitychange` goes to `hidden` and when the XR session fires `end`, as a best effort. [12][19]
- Keep one save object in memory as the source of truth. Never run two writes at once: if a write is in progress, mark the save dirty and write again when it finishes.

### Saves from another build

- The code has a `CURRENT_VERSION` and a list of migrations: `migrations[n]` turns a version-n save into version n+1, as a pure function.
- On load:
  - **No record:** start a new character.
  - **Same version:** use it.
  - **Older version:** copy the raw record to the key `backup-v<n>`, run the migrations in order, check the result, and write it back.
  - **Newer version** (an older build is running, for example after a revert on `main`): load it only if it is safe, and never write over it. Log a warning.
  - **Unreadable or invalid:** keep it under `backup-corrupt`, start a new character, and log it.
- Give each migration a vitest test with a fixture of the old save. The repo already runs vitest in CI.

## To check on the headset

1. Whether `navigator.storage.persist()` returns `true` in the Quest Browser, once at first and again after a week of play. Also check the bookmarked site and the site added to the home screen or library. Log `navigator.storage.persisted()` and `navigator.storage.estimate()`.
2. Whether a save survives quitting the Browser from the Meta menu straight after a quest turn-in. Test IndexedDB `strict` against a plain `localStorage.setItem`, to see whether the Quest Browser flushes `localStorage` when it closes.
3. Whether the save survives the next Quest Browser update: note the Browser version before and after.
4. Which "Clear browsing data" options remove the save, and whether Horizon OS has a per-app "clear data" for the Browser that also wipes it.
5. Whether an installed PWA of the site, if we ever make one, shares storage with the Browser tab. Meta's PWA docs mention a "limited storage quota" for PWAs but give no figure (medium confidence). [17]

## Sources

Most sites were blocked by the network proxy. The specs, MDN and web.dev were read from their source repositories on GitHub, and Chromium from its GitHub mirror (`main`, read 2026-09-28). Meta's pages were blocked and are cited from search-engine extracts, marked medium confidence.

1. WHATWG Storage Standard: [storage endpoints](https://storage.spec.whatwg.org/#storage-endpoints), [storage keys](https://storage.spec.whatwg.org/#storage-keys), [persistence](https://storage.spec.whatwg.org/#persistence), [usage and quota](https://storage.spec.whatwg.org/#usage-and-quota), [management](https://storage.spec.whatwg.org/#management), [storage pressure](https://storage.spec.whatwg.org/#storage-pressure). Source: `whatwg/storage` `storage.bs`.
2. WHATWG HTML Standard, Web storage: [the API](https://html.spec.whatwg.org/multipage/webstorage.html#storage), [privacy, "Expiring stored data"](https://html.spec.whatwg.org/multipage/webstorage.html) (the section has no anchor), [security (cross-directory attacks)](https://html.spec.whatwg.org/multipage/webstorage.html#security-storage). Source: `whatwg/html` `source`.
3. MDN, [Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria). Source: `mdn/content`.
4. web.dev, [Storage for the web](https://web.dev/articles/storage-for-the-web) (updated 2022-03-08). Source: `GoogleChrome/web.dev`.
5. web.dev, [Persistent storage](https://web.dev/articles/persistent-storage). Source: `GoogleChrome/web.dev`.
6. Chromium, [`storage/browser/quota/quota_settings.cc`](https://source.chromium.org/chromium/chromium/src/+/main:storage/browser/quota/quota_settings.cc), [`quota_features.cc`](https://source.chromium.org/chromium/chromium/src/+/main:storage/browser/quota/quota_features.cc) and [`quota_settings.h`](https://source.chromium.org/chromium/chromium/src/+/main:storage/browser/quota/quota_settings.h): pool is 80% of the disk, one origin gets 75% of the pool (60% of the disk), and eviction gets more aggressive below min(2 GB, 10% of the disk) free.
7. Chromium, [`storage_area.mojom`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/public/mojom/dom_storage/storage_area.mojom) (`kPerStorageAreaQuota = 10485760; // 10 MiB`) and [`storage_area_map.cc`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/modules/storage/storage_area_map.cc) (`s.length() * sizeof(UChar)`).
8. Chromium, [`local_storage_impl.cc`](https://source.chromium.org/chromium/chromium/src/+/main:components/services/storage/dom_storage/local_storage_impl.cc) (`kCommitDefaultDelaySecs = 5`, `kMaxCommitsPerHour = 60`) and [`storage_area_impl.cc`](https://source.chromium.org/chromium/chromium/src/+/main:components/services/storage/dom_storage/storage_area_impl.cc).
9. Chromium, [`persistent_storage_permission_context.cc`](https://source.chromium.org/chromium/chromium/src/+/main:chrome/browser/storage/persistent_storage_permission_context.cc) and [`important_sites_util.cc`](https://source.chromium.org/chromium/chromium/src/+/main:chrome/browser/engagement/important_sites_util.cc).
10. Chromium, [`dom_storage_migration_browsertest.cc`](https://source.chromium.org/chromium/chromium/src/+/main:chrome/browser/storage/dom_storage_migration_browsertest.cc) ("Exercises LevelDB to SQLite migration end-to-end").
11. MDN, [IDBTransaction: durability](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/durability) and [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API). Source: `mdn/content`.
12. MDN, [Document: visibilitychange event](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event). Source: `mdn/content`.
13. GitHub Docs, [What is GitHub Pages?](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) (a project site lives at `http(s)://<owner>.github.io/<repositoryname>`). Source: `github/docs`.
14. [Public Suffix List](https://publicsuffix.org/list/public_suffix_list.dat): `github.io` is listed under "GitHub, Inc.".
15. Meta, [Meta Quest Browser overview](https://developers.meta.com/horizon/documentation/web/): "powered by the Chromium rendering engine" (search extract, medium confidence).
16. Meta, [Browser release notes](https://developers.meta.com/horizon/documentation/web/browser-release-notes/): Chromium M142 (2026-01-26), M144 (2026-03-02), M146 (2026-04-21); a private-mode window (2026-02-18) (search extract, medium confidence).
17. Meta, [Progressive Web Apps](https://developers.meta.com/horizon/documentation/web/pwa-overview/): Cache API and IndexedDB supported, "limited storage quota", no web push (search extract, medium confidence).
18. MakeUseOf, [How to Clear the Browser History on Oculus Quest 2](https://www.makeuseof.com/clear-oculus-quest-2-browser-history/): the "Cookies and site data" option (secondary source, medium confidence).
19. MDN, [XRSession: end event](https://developer.mozilla.org/en-US/docs/Web/API/XRSession/end_event). Source: `mdn/content`.
