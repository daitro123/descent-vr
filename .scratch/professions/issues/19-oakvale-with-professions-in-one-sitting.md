# 19: Oakvale with professions, in one sitting

**What to build:** nothing new. Play Oakvale from a new character through Hale's chain with both professions pairs: learn both, reach Apprentice's cap in all four along the way, make a pair of gauntlets and a stack of potions, and sell the spare. Measure the budget with every spot, the herbalist and the stations in view, as the Oakvale map's last ticket did. Tune the numbers the play-through shows are off (yields, refill, recipe needs, prices), and record the tuning and the measurements under this ticket.

**Blocked by:** 17, 18.

**Status:** ready-for-agent

Read [the spec](../spec.md) and the Oakvale map's [The whole zone in one sitting](../../oakvale-starting-zone/issues/38-the-whole-zone-in-one-sitting.md).

- [ ] `.scratch/professions/checks/oakvale-professions.mjs` plays the route above in the emulator and prints the time to Apprentice 25 in each profession, the coins earned from selling, and the draw calls and triangles from the village, the smithy, the house and the mine's upper galleries.
- [ ] The results and every tuned number are written under this ticket.
- [ ] `npm run typecheck`, `npm test` and `npm run build` pass.
