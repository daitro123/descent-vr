# 16: The herbalist and the alchemy bench

**What to build:** Alchemy in the house by the well, promoted from `?proto=brew` variant B. The bench against the house's back wall (mortar, pot over a burner, flasks on stands, hanging herbs, the pinned note listing the recipes you know). Stepping up swaps both hands for bare gloved hands, out of a fight. Herbs dropped in the mortar choose the recipe among those you know, and start it through the professions module. Grind by hand (3 turns, pounding counts), the bench tips the mortar, stir by hand (3 turns) while the colour changes, and the bench pours into the flask and corks it. The flask waits on its stand to belt or drink, and goes to the bag as you step away. "+1 Alchemy". The herbalist, a new friendly character in the human body, stands at the bench and is drawn only while the house is. They give no quests yet (ticket 18).

**Blocked by:** 11.

**Status:** resolved

Read [the spec](../spec.md) ("Stations" and "Trainers and quests") and [Brewing at the alchemy table](07-brewing-at-the-alchemy-table.md).

- [x] `.scratch/professions/checks/bench.mjs` walks into the house with 2 Hearthleaf and 2 Duskcap, brews a minor healing potion and (with the recipe taught by the debug handle) a rage draught, and sees them on the stand. It steps away and finds them in the bag, with Alchemy at 2.
- [x] Herbs for a recipe you don't know glide back to the tray and nothing is taken.
- [x] The herbalist is drawn inside the house and hidden from outdoors, and costs one draw call.
- [x] `?proto=brew` still runs.
- [x] `npm run typecheck`, `npm test` and `npm run build` pass.

## Answer

Built on 2026-09-30 by Claude **on Tom's behalf**: he asked for the build tickets to run without his input, taking the recommended option at every fork. Checked in headless Chromium with the emulator, not yet on the headset.

**What was built**

- `src/professions/bench/`: the bench (`bench.ts`), its props, sounds and pinned note, the brewing rules (`brew.ts`: `recipeFor` and `Turns`, pure and unit-tested), the herbalist (`herbalist.ts`) and `standInHouse`, which hangs both from the house's room in its frame (`index.ts`). The prototype's `?proto=brew` keeps its own copies and still runs.
- **Where:** against the house's right wall, the hearth behind it along the wall, as the prototype placed it (not the back wall the ticket names, which holds the shelf and a window). `HOUSE.bench` in `src/maps/forest/house.ts` places it and adds its collider. The note is pinned at its left end, clear of the window over its middle.
- **Hands:** within 1.3 m of the bench's front, facing it, alive and out of a fight, the sword, shield and fists hide and open hands (tinted like your fists) take their place. Past 2 m, or when a fight starts, they come back through `Adventure.dressHands`. This is the spec's one rule for hands at a station; the anvil (ticket 15) can follow the same pattern.
- **The herbs choose the recipe as the pestle goes in.** The tray lays out up to 3 Hearthleaf and 3 Duskcap, as many as the bag holds. Herbs dropped in the mortar (up to 3) are matched exactly against the bench recipes you know the moment the pestle's tip enters the mortar. A match calls `professions.start(id)`, which takes them from the bag. No match, or a refusal (not learned, too little proficiency, the stands all full), sends them gliding back to the tray with a strong buzz, and nothing is taken. Committing at the grind, not at the drop, is what lets 2 Hearthleaf wait for a Duskcap to become the elixir.
- **The acts:** grind (3 turns, a pound is a third of a turn), the bench tips the mortar (1.2 s), stir (3 turns, green to the potion's own colour from the bag's icon), the bench pours and corks (2 s). The cork calls `finish('bench')`, and the effects go through the new `Adventure.applyMade`, which saves, shows and passes each `made` event to `state.apply` so quests count it (ticket 12).
- **The flasks:** three stands. A corked flask waits on the next free one. `finish` has already put the potion in the bag, so the flask is its view. Let go within 18 cm of a hip (0.7 m under your head, 0.2 m aside), it moves one from the bag to that belt slot. Step away and every corked flask flies to the bag. One corked with the bag full (`made.left`) tries the bag again as you step away and stays on its stand if it's still full. A flask whose potion leaves the bag another way (sold, belted from the panel) leaves its stand.
- **"+1 Alchemy":** `Adventure.show` now floats any `proficiency` effect, small and white, where it was earned. `PROFESSION_NAMES` in `professions.ts` names them.
- **The herbalist:** `PEOPLE.herbalist` in `models/people.ts` (grey hair tied back, undyed linen, a green-stained apron, a satchel, a bundle of Hearthleaf) and a work loop in `people/work.ts` (reach for a sprig, tie it in, hold the bundle up). They stop and look at you like the villagers, stand in the World as a body, and are one mesh hung from the house's room. They aren't a `Villager` yet, so they have no barks or quests.
- **Debug:** `__descent.professions.teach(recipe)` buys a recipe with the coins given first (it still needs the proficiency). `__descent.adventure.bench` has `shown`, `grabPoint`, `spots` and `tipOf` for checks.
- Tunables are in `CONFIG.alchemyBench`.

**Checks**

- `npm run typecheck`, `npm test` (with `tests/bench.test.ts` and the bench's collider in `tests/world.test.ts`) and `npm run build` pass.
- `.scratch/professions/checks/bench.mjs` passes end to end. One difference from the box above: the rage draught needs 5 proficiency, so Alchemy can't be 2 after brewing it. The check brews the healing potion (Alchemy 1), sets proficiency to 5, teaches and brews the rage draught (6), and checks each brew adds one. It also belts a third potion and reloads.

**For later tickets**

- **10 (the belt in the Adventure):** drinking a flask straight off the stand isn't wired, since drinking, the heal and the cooldown's tick belong to the belt build. The stand's potion is already in the bag, so the belt's drink gesture could take a held bench flask by moving one to a slot first, or add an inventory drink from the bag. The bench uses its own hip points; swap them for the belt's once it has them.
- **15 (the anvil):** the hands rule here is self-contained in `AlchemyBench.stepUp/dressBare/stepAway`. The anvil can copy it or lift it into a shared helper.
- **17 (using what's made):** the potions made here are the catalogue's items, so their effects come with 17.
- **18 (trainers):** make the herbalist a villager (a `VillagerId`, barks, a giver). They stand at `HOUSE.bench.herbalist`. `Herbalist` can then go.

**On the headset:** step up to the bench in the house by the well with herbs in the bag (`__descent.professions.learn('herbalism')` and `.fill()` from the console) and try the grind, the stir and belting a flask.

