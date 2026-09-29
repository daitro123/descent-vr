# 19: Saving

**What to build:** The game keeps itself. Take the headset off after handing in Raiders in the Fields, come back tomorrow, and you're level 2 where you stood, facing the way you faced, with The Lumber Camp on offer, at full health and with every camp full. `?newgame` starts over after you confirm it. In a private window, or wherever the browser won't store data, the game plays anyway and says on the page that progress won't be kept.

**Spec:** Implementation Decisions › Saving. User stories 5, 6, 10–14.

**Blocked by:** 18 (Marshal Hale and Raiders in the Fields).

**Status:** done

- [x] A save store port with two adapters: IndexedDB in the browser (one database named `descent-vr`, one store, one record, each write in its own transaction with `durability: 'strict'`), and an in-memory store for tests and wherever IndexedDB fails to open, with a note on the page that progress won't be kept. `navigator.storage.persist()` is called once and its answer logged; nothing depends on it.
- [x] The record, version 1: the version; when it was saved; level and XP; the sword; each quest's state with its counts and whether the orders were taken; whether the Warden is beaten; your position in world metres and your facing; and which interior you're in (none for now; the inn, the house and the mine arrive with their tickets).
- [x] Older records upgrade through ordered migrations keyed on the version.
- [x] The adventure state snapshots to the record and restores from it.
- [x] A save controller writes on each quest change (taking one, a count going up, one becoming ready, a hand-in), each level-up, each new sword, each change of current zone, every 30 s, when the page is hidden, and when the VR session ends. One write is in flight at a time and the latest state wins. _(The controller takes zone changes; the World's current zone that feeds it arrives with ticket 37.)_
- [x] Loading puts you where you stood, facing the way you faced, with your level, XP, sword and quests, at full health, no rage and every camp full. Before VR, the page shows Oakvale from where the save stands.
- [x] `?newgame` asks in a plain page dialog before VR; yes deletes the save and starts a new character, no carries on.
- [x] The arena and `?map=<id>` never load or write the save.
- [x] Tests at the save store's port: every older record version migrates to the current one (with a made-up version 0 to prove the chain); a save round-trips through the in-memory store; the controller writes on each trigger and every 30 s given a fake clock, and never has two writes in flight. Snapshot and restore give back the same answers from the adventure state.
- [x] Checked in headless Chromium: the IndexedDB adapter keeps level, quests and position across a reload, and `?newgame` starts over.
- [x] The README says how saving works and what `?newgame` does.
- [x] Every new number is in the game's table of tunables.

## Built

Built on 2026-09-29 by Claude, in autonomous mode (Tom asked for the rest of Oakvale to run without his input).

- **The store** (`src/save/store.ts`, `src/save/indexedDb.ts`): a `SaveStore` port (`read`, `write`, `clear`) with two adapters. `openIndexedDb` opens the database `descent-vr` with one store (`save`) holding one record (key `character`), and runs each write and delete in its own `readwrite` transaction with `durability: 'strict'`, done on `complete`. It asks `navigator.storage.persist()` once and logs `Storage persisted: <answer>`. `MemoryStore` keeps a structured clone. `openSave` opens the browser's store and reads the character. Where the store won't open (or takes over `CONFIG.save.openTimeout`, 5 s), the game plays in memory and the page says progress won't be kept.
- **The record** (`src/save/record.ts`), version 1: `version`, `savedAt`, `level`, `xp`, `sword`, `quests` (each quest by id with its `stage` and `counts` in objective order, The Lumber Camp's second being the orders, 0 or 1), `wardenBeaten`, `position` {x, z} in world metres, `facing` (0 looks down −Z) and `interior` (null; `inn`, `house` and `mine` are ready for their tickets). `readSave` upgrades an older record through `MIGRATIONS`, an ordered list of `{ from, up }` (empty until version 2), then checks every field's kind. It answers `saved`, `none`, `newer` or `unreadable`.
- **Snapshot and restore** (`src/adventureState.ts`): `snapshot()` gives the record's progress part (`Progress`), and `new AdventureState(progress)` restores it. A new `wardenBeaten` answer is set by the Warden's kill, ready for 28.
- **The controller** (`src/save/controller.ts`): `onEffects` writes for any effect but XP alone (a quest taken, a count, ready, handed in, a level, a sword); `onZone` writes when the zone changes; `update(dt)` writes after 30 s of play without a write (`CONFIG.save.every`); `onLeaving` writes on the page hidden, VR ended, or the XR session no longer visible. One write is in flight at a time; asking meanwhile writes once more when it lands, with the state as it is then.
- **The Adventure** loads the record: your progress, and you placed where you stood facing the same way, at full health with no rage and every camp fresh. The page before VR looks out from there. It keeps where you stand each frame (your head, and the heading you look along; the respawn point while you're down) and hands the controller its effects and play time. `main.ts` wires the page and XR events, and the debug handle has `saved()`.
- **`?newgame`** (`src/route.ts`, `src/ui/newGameDialog.ts`): the route carries `newGame`, and only the Adventure reads it, so the arena and `?map=` never open the save. When a character is held, a page dialog asks "Start a new character?" with their level and the quest they're on. **Start over** deletes it and saves the new character from then on; **Carry on** (the default) loads it. `forgetNewGame` drops the flag from the address.
- **The page**: the intro no longer says nothing fights you, mentions saving, and the nav has a "New game" link. The note about progress not being kept sits above the links.
- **Tests:** `tests/saving.test.ts` (38) at the port:
  - Snapshot and restore give the same answers, and the same effects from then on, at every step of the chain.
  - What the record holds.
  - Restoring keeps the chain's rules.
  - Reading a current record, nothing, garbage, a newer version, and every older version (a fixture per version, none yet).
  - A made-up version 0 upgrading through an injected migration, and one with no way up.
  - The in-memory store's round trip.
  - Opening: loaded, new, unsaved, newer, unreadable, and starting over.
  - The controller writes on each trigger and every 30 s of play given the time. It writes nothing for XP alone, and nothing on leaving before the game has run. It never has two writes in flight, the latest state wins, and it carries on after a failed write.
  - `tests/route.test.ts` gained `?newgame` and `forgetNewGame`.
- **Checks:** `checks/saving.mjs` in headless Chromium with the emulator, all 39 passing. See its header for the list. Screenshots are in the project's files under `saving/`. The adventure, farm camp, Hale, levels and world checks still pass. The farm camp check's control swing was once guarded (enemies guard by chance) and passed on a re-run.

Calls **taken on Tom's behalf**, to revisit:

- **"Every 30 s" counts play time since the last write of any kind**, and only while the game runs in VR. A save is never more than 30 s behind where you stand.
- **Facing is the way you look**, your head's heading. It loads as the way you face on entering VR.
- **While you're down, the save puts you at the respawn point**, where you'd wake anyway.
- **Also saved when the headset stops showing the page** (put down, or the system menu opened): the XR session's `visibilitychange`, beside the page hidden and VR ended. On a Quest, taking the headset off may not end the session.
- **Leaving before the game has run writes nothing.** A page left open before VR never overwrites a save made since in another tab.
- **A record this build can't read is left alone.** This covers a newer build's record (a stale cached page) and one it can't make sense of. The game plays unsaved, and the page says so and points to `?newgame`. A deploy or a stale page never wipes a character.
- **Restoring is forgiving of other builds' records:**
  - A recorded level is kept even if levels come to need more XP.
  - Counts stay within their objectives.
  - A quest under way whose objectives are all met is ready.
  - A quest added after the ones handed in is offered.
  - Only the first quest not handed in can be past _locked_, with nothing counted before it's taken.
- **`?newgame` asks only when a character is held.** With nothing saved it just starts. "Carry on" is the default (focused, and Escape). The flag leaves the address, so a reload doesn't ask again.
- **The IndexedDB open gives up after 5 s** and plays unsaved, so a stuck database never stops the game.
- **Migrations are `{ from, up }` steps.** The test takes a made-up version 0 through an injected migration, and asks for a fixture for every real older version, of which there are none yet.
- **The Warden's being beaten is its own flag**, set by its kill (story 103), not worked out from the quest.
- **Names:** store `save`, key `character`.

Left for later:

- Current zone: ticket 37 brings it, with its 2 m margin, and should call the controller's `onZone` from the World's zone change. Nothing calls it yet, since Oakvale is the only zone.
- Interiors: a save inside one loads inside it once they're built (23, 24, 25), which is when `interior` gets set.
- The Warden's answers from `wardenBeaten` are ticket 28.
- On the headset: whether `persist()` returns true, and whether a save survives quitting straight after a hand-in (spec, Further Notes).

