# 18: Characters: the roster and the page before VR

**What to build:** up to three characters. The page before VR lists the slots (name, class, level, zone), picks the last played, and offers New (a class card and a name, suggested), Delete (confirmed, naming the character) and Rename. Enter VR plays the picked character. The save becomes one record per character plus a roster; today's save migrates to the first character, a warrior named "Warrior". `?newgame` opens the new-character form. Class cards show only built classes, so only the warrior for now.

**Blocked by:** 17.

**Status:** ready-for-agent

Read [the spec](../spec.md) ("Characters and the save") and [Characters and choosing a class](03-characters-and-choosing-a-class.md).

- [ ] Tests: the migration from the current record to a roster of one warrior (inventory included); characters round-tripping through the in-memory store; a newer record left alone; deleting and renaming.
- [ ] A headless check makes a second warrior, plays it, and finds the first one unchanged; deletes it after the confirmation; and opens the form from `?newgame`.
- [ ] The README's saving and URL-flag sections say what changed.
- [ ] `npm run typecheck` and `npm test` pass.
