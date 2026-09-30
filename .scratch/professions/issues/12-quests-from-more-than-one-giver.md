# 12: Quests from more than one giver

**What to build:** the adventure state grows from Marshal Hale's one chain to a list of chains, each with its quest giver, with up to three quests active at once (one per giver), and two new objective kinds: gather from a kind of spot N times, and make a recipe N times. The tracker lists every active quest with its lines, newest at the bottom, and the quest arrow sits beside the first unfinished objective of the quest taken most recently. Hale's chain plays exactly as before. A test-only second giver with a one-quest chain proves it; the real trainers come in ticket 18.

**Blocked by:** None (can start immediately). Inventory's ticket 12 (quest items and hand-in picks) also changes Hale's board and the hand-in; whichever lands second merges `main` in and keeps both.

**Status:** ready-for-agent

Read [the spec](../spec.md) ("Trainers and quests") and [Trainers and first lessons](09-trainers-and-first-lessons.md) for why.

- [ ] The adventure state's and quest chain's tests: Hale's chain unchanged; a second giver's quest offered, taken and handed in alongside Hale's; three active at once; gather and make objectives counting from events; markers per giver.
- [ ] The save round-trips a second giver's quests, keyed by quest id as today; an older record loads with them locked.
- [ ] The quest arrow's tests cover the most-recent rule.
- [ ] `.scratch/oakvale-starting-zone/checks/hale.mjs` still passes.
- [ ] `npm run typecheck`, `npm test` and `npm run build` pass.
