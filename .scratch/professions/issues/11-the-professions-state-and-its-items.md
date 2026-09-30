# 11: The professions state and its items

**What to build:** the pure professions module (learn, gather, start, finish, buy, with effects and refusals out), the recipe and spot-kind table for Apprentice, Oakvale's new items in the catalogue (five materials, four consumables, the three copper gauntlets), and professions in the save's next version with its migration. The debug handle can teach a profession, set proficiency and put materials in the bag, so later tickets' checks reach any state fast. Nothing in the world changes yet.

**Blocked by:** None (can start immediately). The inventory module and the save's version 2 are on `main` (Inventory's ticket 08).

**Status:** ready-for-agent

Read [the spec](../spec.md) ("The professions state", "Items added to the catalogue", "Recipes (Apprentice)" and "Saving").

- [ ] The professions module's tests cover learning (the pair and its first recipes, learning twice refused), gathering each spot kind (yield and 1 proficiency, nothing past the cap), starting a recipe (every refusal takes nothing; a start takes exactly its materials), finishing (into the bag, or left on the station with a full bag), buying (coins spent, refusals), and the grade cap.
- [ ] The items' tests cover the new stacks and fixed sell prices, and the gauntlets' numbers by the rule at item level 5, green.
- [ ] The saving tests load a record from the version before with no professions, and round-trip professions, proficiency and recipes.
- [ ] Every new number is in the one table of tunables, in a professions group.
- [ ] `npm run typecheck`, `npm test` and `npm run build` pass.
