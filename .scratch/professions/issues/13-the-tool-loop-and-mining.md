# 13: The tool loop and Mining

**What to build:** Mining in Oakvale, end to end. The tool loop behind the main-hand hip, built from the belt's zone mechanics. The pick drawn within 3 m of a vein, the sword put away and the off hand untouched. The loop does nothing far from a spot or in a fight, and a pull puts the pick away. The 8 copper veins placed in Oakvale's plan and loaded with their chunks, and the mine's with the mine, as one instanced mesh. The glint, the committed-swing strike and the feedback, promoted from `?proto=pick` variant C. 3 copper ore and 1 rough stone to the bag through the professions module, "+1 Mining", the taken look, and the 180 s refill once you're 30 m off. Until ticket 18 a character learns Mining through the debug handle.

**Blocked by:** 11, and Inventory's ticket 10 (the belt in the Adventure), whose zone mechanics the loop reuses.

**Status:** ready-for-agent

Read [the spec](../spec.md) ("Gathering spots and the tool loop"), [Tools on the belt](02-tools-on-the-belt.md), [Swinging the pick and cutting herbs](05-swinging-the-pick-and-cutting-herbs.md) and [Gathering spots in Oakvale](10-gathering-spots-in-oakvale.md).

- [ ] `.scratch/professions/checks/mining.mjs` draws the pick at a vein by the smithy, breaks it with 2 glint strikes and another with 5 plain ones, sees 6 ore and 2 rough stone in the bag and Mining at 2, sees the loop do nothing 10 m from any vein, and sees a pull put the pick away and the sword back.
- [ ] A grip in the loop never arms a gesture (a test on the zone logic).
- [ ] `?proto=pick` still runs.
- [ ] `?perf` from the smithy's veins shows the veins as one draw call.
- [ ] `npm run typecheck`, `npm test` and `npm run build` pass.
