# 18: Characters: the roster and the page before VR

**What to build:** up to three characters. The page before VR lists the slots (name, class, level, zone), picks the last played, and offers New (a class card and a name, suggested), Delete (confirmed, naming the character) and Rename. Enter VR plays the picked character. The save becomes one record per character plus a roster; today's save migrates to the first character, a warrior named "Warrior". `?newgame` opens the new-character form. Class cards show only built classes, so only the warrior for now.

**Blocked by:** 17.

**Status:** done

Read [the spec](../spec.md) ("Characters and the save") and [Characters and choosing a class](03-characters-and-choosing-a-class.md).

- [x] Tests: the migration from the current record to a roster of one warrior (inventory included); characters round-tripping through the in-memory store; a newer record left alone; deleting and renaming.
- [x] A headless check makes a second warrior, plays it, and finds the first one unchanged; deletes it after the confirmation; and opens the form from `?newgame`.
- [x] The README's saving and URL-flag sections say what changed.
- [x] `npm run typecheck` and `npm test` pass.

## What was built

Built on 2026-09-30 **by Claude on Tom's behalf**, taking the recommended option at every fork.

- **The save is a roster plus one record per character** (`src/save/store.ts`, `src/save/record.ts`). The store is a key-value port (`read`, `write`, `remove` by key) with the IndexedDB and in-memory adapters, in the same database and object store as before. The roster is its own record under `roster`: `{ version: 1, characters: [keys in slot order], last }`. A character's record is today's plus `class` and `name`, at **version 4**; the 3 → 4 migration makes today's one character a warrior named "Warrior", everything else (inventory, professions, quests, where they stood) kept.
- **`Characters`** is the roster as the page uses it: `slots` (saved, or `newer` / `unreadable`, shown but never played or written over), `picked` (the last played, else the first playable), `play()` (the picked one's `Played`: its key, record, `who` and `write`), `make(class, name)`, `pick(key)`, `remove(key)`, `rename(key, name)`, `suggestName()`, `full`. Opening it writes nothing, so a page left open before VR never overwrites another tab's save: a roster migrated from today's record is written with the first change or the first write. `openCharacters()` opens the browser's store with the old fallbacks (unsaved in memory where it won't open; a newer or unreadable roster, or a newer record from before the roster, left alone with a note).
- **The Adventure plays a `Played`**: `new AdventureState(record, CHAINS, { class: who.class })`, and every write carries the character's class and name. A character made on the page who hasn't played has `position: null` and starts at the zone's start facing Hale.
- **The page before VR** (`src/ui/characterPage.ts`): three slots under the intro (name, "Level N warrior, Oakvale", the picked one marked ▶), Rename and Delete on each, "New character" in each empty slot. Delete asks first, naming the character ("Delete Aldric? Aldric, the level 3 warrior, will be deleted for good."). The new-character form shows a card per built class (`PLAYABLE` in `classes.ts`, only the warrior; `CLASS_CARD` holds each class's name and line) and a name (up to 16 letters, `CONFIG.save.name`) with a suggestion filled in. `?newgame` opens the form before Oakvale loads; with three characters (`CONFIG.save.characters`) it says so and points at Delete. `newGameDialog.ts` is gone.
- **The debug handle** has `characters`.
- **Tests:** `tests/saving.test.ts` gains a version-3 record in the every-older-version test and a "your characters" block (16 tests): the migration to a roster of one warrior with their inventory; nothing written until the first write; a new character of a class in its kit at the start; characters round-tripping through the in-memory store and kept apart; at most three; deleting (including today's record once the roster exists); renaming, saved and pending; a newer build's character, roster and pre-roster record left alone; an unreadable character shown beside a new one; the browser's store and its fallback; suggested names.
- **Checks:** `.scratch/abilities/checks/characters.mjs` (new, all passed) makes a second warrior from an empty slot, plays it, finds the first unchanged, picks back, renames, deletes after the confirmation, opens the form from `?newgame` (and the "three already" message), and loads a version-3 record as "Warrior". `.scratch/oakvale-starting-zone/checks/saving.mjs` is updated for the roster (its `?newgame` and unreadable-save steps, version 4, and its tracker line, a list since PR #79) and passes; `play-through.mjs` makes the suggested warrior from `?newgame`'s form.

**Calls made on Tom's behalf:**

- **A first visit doesn't stop at the form.** With no characters, the first slot is a new warrior with a suggested name, played by Enter VR and saved with its first write, as a new character always was. This keeps "nothing is written before VR" and every Oakvale check (each opens a fresh browser) working. Once the ranger is playable, a first visit might open the form instead (ticket 21's call).
- **Picking another slot loads the page again**, so Oakvale behind the intro shows from where that character stands. The Adventure is built for one character; rebuilding it in place wasn't worth it for a page you visit once per session.
- **The first character keeps today's key (`character`)**, so a page from an older build finds a version-4 record there and leaves it alone rather than starting a fresh character over it. Others are `character-2`, `character-3`, the first free.
- **Slots close up** when a character is deleted; empty slots are always last.
- **Rename is a button beside Delete** rather than pressing the name, since pressing a slot picks it.
- **The roster has its own version (1)**, so the character record's version only tracks the character's shape.
- **Talents and gesture slots aren't in the record yet**: nothing holds them until tickets 19 and 25, which add them with the next bump (4 → 5).
- **`?newgame` never deletes.** A save this page can't read is a slot saying so, with Delete; before, it blocked saving until `?newgame` deleted it. Only an unreadable roster (which no build writes) still plays unsaved.
- Suggested names come from a list of 16 placeholders (`NAMES` in `store.ts`), one none of your characters has.

**For later tickets:**

- **19 (gestures):** the gesture slots belong in the character record: add them to `SaveRecord` (and `isCurrent`), bump `SAVE_VERSION` to 5 with a migration giving the defaults, and put them in `newRecord`. Merge main first in case 25 or an Inventory ticket bumped it.
- **21 and 23 (the ranger, the mage):** add the class to `PLAYABLE` in `classes.ts` and its card appears in the form; `newRecord` already starts a character in its class's kit and the Adventure already makes the state of the record's class. The pending first-visit character is a warrior (`Characters.play()`); decide whether a first visit opens the form.
- **24 (the mage's abilities at 6, 8 and 10):** nothing here; the class comes from the record.
- **25 (talents):** points spent go in the character record with the same kind of bump.
- **Inventory 16 (the ranger and mage in the inventory):** each character's record already carries its own inventory (Inventory 08's shape, unchanged), so a ranger's bag is its own; `newRecord({ class, name })` gives a new character `startingInventory(class)`.

**On the headset:** the page before VR on the Quest browser: pick, make (the keyboard for the name), rename and delete, then Enter VR plays the picked character. Your current save should show as "Warrior", level and zone as you left them.
