# 15: The smith's anvil

**What to build:** Smithing at the smithy, promoted from `?proto=anvil` variant A. Stepping up to the anvil swaps both hands for the smith's hammer and tongs (out of a fight), and stepping back swaps them back. The recipe board beside the anvil lists the recipes you know, what each takes and what you have. Pressing one starts it through the professions module, taking its materials from the bag. Smelting in the crucible, heating a blank in the fire, and the glowing marks (3 for the whetstone, 5 for the gauntlets) with tap, good and great strikes. About 10 s of heat, the new quench bucket beside the anvil, and the product flying to the bag, or waiting on the anvil with a full bag. "+1 Smithing". Walking off leaves the work where it stands. The smith steps aside from the anvil while you work.

**Blocked by:** 11.

**Status:** ready-for-agent

Read [the spec](../spec.md) ("Stations") and [Hammering at the anvil](06-hammering-at-the-anvil.md).

- [ ] `.scratch/professions/checks/anvil-adventure.mjs` (from the prototype's `checks/anvil.mjs`) walks into the smithy with ore and rough stone in the bag and sees the hands swap. It makes 2 bars, a whetstone with great strikes and a pair of gauntlets of Strength with good strikes and a quench, finds them in the bag, and sees Smithing rise and the hands swap back 2 m away.
- [ ] A recipe you lack materials for is greyed, and pressing it is refused with nothing taken.
- [ ] `?proto=anvil` still runs.
- [ ] `npm run typecheck`, `npm test` and `npm run build` pass.
