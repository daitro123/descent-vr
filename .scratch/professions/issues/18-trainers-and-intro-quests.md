# 18: Trainers and intro quests

**What to build:** the smith and the herbalist as trainers. Each gets a gold "!" once Raiders in the Fields is handed in, and the talk board with "Ore and Fire" or "Leaves for the Pot". Accepting teaches the pair of professions and hangs the tool on the loop. The objectives are break 2 copper veins and make a whetstone, or gather 4 Hearthleaf and brew a minor healing potion, and the hand-in pays XP as a level-2 quest and 5 coins. The "Train" button lists the Apprentice recipes with price and proficiency, grey until buyable, and buys through the professions module. The trainers' barks follow what you've learned. The bag panel shows a line per learned profession ("Mining: Apprentice 12/25"). The debug handle's shortcut for learning stays, for checks.

**Blocked by:** 12, 13, 14, 15, 16, and Inventory's ticket 09 (the bag in the Adventure).

**Status:** ready-for-agent

Read [the spec](../spec.md) ("Trainers and quests" and "The view in VR") and [Trainers and first lessons](09-trainers-and-first-lessons.md).

- [ ] The adventure state's tests: both intro quests open at Raiders in the Fields' hand-in, accepting teaches the pair, the objectives count, the hand-in pays.
- [ ] `.scratch/professions/checks/trainers.mjs` takes both intro quests from a fresh character after Raiders in the Fields, completes and hands them in, buys the rage draught from the herbalist, and sees three quests in the tracker while Hale's is also active.
- [ ] `npm run typecheck`, `npm test` and `npm run build` pass.
