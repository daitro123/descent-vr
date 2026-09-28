# 19: Saving

**What to build:** The game keeps itself. Take the headset off after handing in Raiders in the Fields, come back tomorrow, and you're level 2 where you stood, facing the way you faced, with The Lumber Camp on offer, at full health and with every camp full. `?newgame` starts over after you confirm it. In a private window, or wherever the browser won't store data, the game plays anyway and says on the page that progress won't be kept.

**Spec:** Implementation Decisions › Saving. User stories 5, 6, 10–14.

**Blocked by:** 18 (Marshal Hale and Raiders in the Fields).

**Status:** ready-for-agent

- [ ] A save store port with two adapters: IndexedDB in the browser (one database named `descent-vr`, one store, one record, each write in its own transaction with `durability: 'strict'`), and an in-memory store for tests and wherever IndexedDB fails to open, with a note on the page that progress won't be kept. `navigator.storage.persist()` is called once and its answer logged; nothing depends on it.
- [ ] The record, version 1: the version; when it was saved; level and XP; the sword; each quest's state with its counts and whether the orders were taken; whether the Warden is beaten; your position in world metres and your facing; and which interior you're in (none for now; the inn, the house and the mine arrive with their tickets).
- [ ] Older records upgrade through ordered migrations keyed on the version.
- [ ] The adventure state snapshots to the record and restores from it.
- [ ] A save controller writes on each quest change (taking one, a count going up, one becoming ready, a hand-in), each level-up, each new sword, each change of current zone, every 30 s, when the page is hidden, and when the VR session ends. One write is in flight at a time and the latest state wins.
- [ ] Loading puts you where you stood, facing the way you faced, with your level, XP, sword and quests, at full health, no rage and every camp full. Before VR, the page shows Oakvale from where the save stands.
- [ ] `?newgame` asks in a plain page dialog before VR; yes deletes the save and starts a new character, no carries on.
- [ ] The arena and `?map=<id>` never load or write the save.
- [ ] Tests at the save store's port: every older record version migrates to the current one (with a made-up version 0 to prove the chain); a save round-trips through the in-memory store; the controller writes on each trigger and every 30 s given a fake clock, and never has two writes in flight. Snapshot and restore give back the same answers from the adventure state.
- [ ] Checked in headless Chromium: the IndexedDB adapter keeps level, quests and position across a reload, and `?newgame` starts over.
- [ ] The README says how saving works and what `?newgame` does.
- [ ] Every new number is in the game's table of tunables.
