# 16: The herbalist and the alchemy bench

**What to build:** Alchemy in the house by the well, promoted from `?proto=brew` variant B. The bench against the house's back wall (mortar, pot over a burner, flasks on stands, hanging herbs, the pinned note listing the recipes you know). Stepping up swaps both hands for bare gloved hands, out of a fight. Herbs dropped in the mortar choose the recipe among those you know, and start it through the professions module. Grind by hand (3 turns, pounding counts), the bench tips the mortar, stir by hand (3 turns) while the colour changes, and the bench pours into the flask and corks it. The flask waits on its stand to belt or drink, and goes to the bag as you step away. "+1 Alchemy". The herbalist, a new friendly character in the human body, stands at the bench and is drawn only while the house is. They give no quests yet (ticket 18).

**Blocked by:** 11.

**Status:** ready-for-agent

Read [the spec](../spec.md) ("Stations" and "Trainers and quests") and [Brewing at the alchemy table](07-brewing-at-the-alchemy-table.md).

- [ ] `.scratch/professions/checks/bench.mjs` walks into the house with 2 Hearthleaf and 2 Duskcap, brews a minor healing potion and (with the recipe taught by the debug handle) a rage draught, and sees them on the stand. It steps away and finds them in the bag, with Alchemy at 2.
- [ ] Herbs for a recipe you don't know glide back to the tray and nothing is taken.
- [ ] The herbalist is drawn inside the house and hidden from outdoors, and costs one draw call.
- [ ] `?proto=brew` still runs.
- [ ] `npm run typecheck`, `npm test` and `npm run build` pass.
