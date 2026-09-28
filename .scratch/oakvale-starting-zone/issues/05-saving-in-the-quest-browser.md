# Saving in the Quest browser

Type: research
Status: resolved
Blocked by: 

## Question

How reliably can a web game save a character and quest progress in the Quest 3 browser?

- Compare `localStorage` and IndexedDB: size limits, and whether the browser can evict the data (storage pressure, clearing browsing data, `navigator.storage.persist()`).
- Whether a save survives browser updates and a new build of the site.
- Whether anything is shared between the desktop emulator and the headset (not expected).

Recommend one, with the few fields a save needs and when to write it.

## Answer

Full findings with sources: [research/saving-in-the-quest-browser.md](../research/saving-in-the-quest-browser.md).

- **Saving is reliable enough for a single-player game.** A save is lost only when the site's data is cleared, in a private window, or when a nearly full headset evicts the least recently used site.
- **Use IndexedDB:** one database named `descent-vr`, one save record written with `durability: 'strict'`, so the game knows when it reached disk. `localStorage` is no safer from eviction and delays its disk writes by 5 s or more.
- **Call `navigator.storage.persist()` once** and don't depend on the answer. Meta doesn't document how the Quest Browser decides.
- **New deploys and browser updates keep the save**, since storage is keyed by origin. The headset, the desktop emulator and a local dev server each keep their own save. Every name gets a `descent-vr` prefix, because `daitro123.github.io` is shared by all of Tom's Pages sites.
- **A save holds** a version, the time, level, XP, items, equipped gear, each quest's state and the zone and position. It is written on each quest change, level-up, new item and zone change, every 30 to 60 s of play, and when the page is hidden or the VR session ends. Older saves are upgraded by ordered migrations keyed on the version.
- **To check on the headset:** whether `persist()` returns true, and whether a save survives quitting right after handing in a quest.
