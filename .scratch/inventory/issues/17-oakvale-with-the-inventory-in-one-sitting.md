# 17: Oakvale with the inventory, in one sitting

**What to build:** a whole run of Oakvale as a warrior with the inventory: loot, a vendor, the stash, the three chests, the belt in a fight and each hand-in's pick. Measure the budget where it's worst (the dig with drops lying and the panel open), tune anything that falls outside it, and check the plain route's coins land in the spec's 300 to 400.

**Blocked by:** 10, 13, 14, 15.

**Status:** resolved

Read [the spec](../spec.md) and `.scratch/oakvale-starting-zone/issues/38-the-whole-zone-in-one-sitting.md` as prior art.

- [x] `.scratch/inventory/checks/whole-zone.mjs` plays the chain through with the inventory and records coins, drops and draw calls.
- [x] The ticket's answer lists what Tom should check on the headset.
- [x] `npm run typecheck` and `npm test` pass.

## Answer

Built on 2026-09-30 by Claude **on Tom's behalf** (he asked for the build tickets to run without his input, taking the recommended option at every fork). This was the last inventory build ticket: every one of them is now merged.

**What was built**

- `checks/whole-zone.mjs` plays a new warrior through Oakvale with the whole inventory in headless Chromium with the IWER emulator (about 17 minutes). It reuses the Oakvale play-through's fighter: game time is stepped, and every fight goes through the real combat, with the script's sword and shield where a player's hands would be and nobody healed by the script. On top of that it:
  - fights every camp (the farm's four, the lumber camp's five, the patrol's two, the watchtower's three, the mine's seven and the Warden) and walks over every drop to take it;
  - opens the three chests with a fist on the lid;
  - drinks a potion from the right hip mid-fight at the lumber camp;
  - takes each hand-in's first pick and wears whatever beats what it has on;
  - reaches over the shoulder for the bag at the dig and measures the budget there with the mine's drops lying;
  - at the smith, measures the budget with the wares board and the bag open, presses "Sell junk", sells the gear it has outgrown and buys a white piece;
  - buys a potion from the innkeeper, hands in What Lies Below for Hale's longsword and wears it;
  - carries the plain sword into the stash, reloads, and carries it back out.
  It records coins by stage, every drop, and the draw calls, and with an output folder writes screenshots and `whole-zone.json`.
- **Coins tuned:** `CONFIG.loot.coins` is now `[1, 4]` (it was `[1, 3]`). With 1 to 3 the plain route (every camp, the Warden and the three chests) paid **about 275 coins** on average, under the spec's 300 to 400. With 1 to 4 it pays **about 333**. The prices and the role table's multipliers are unchanged. A new test in `tests/loot.test.ts` rolls the route 2,000 times from the zone's plan and checks the average lands in 300 to 400. The loot tests now read the coin range from the config. The spec's role table says 1 to 4, with a note under Further Notes.
- **The saving check** (`oakvale-starting-zone/checks/saving.mjs`): the tracker failure ticket 10 found was already fixed by ticket 13. It then stopped at step 8, waiting for the "progress won't be kept" note when IndexedDB won't open. The note is on the page (a direct read finds it, and the game is right). It was Playwright's `locator(...).innerText()` wait on that second page that never saw it, so the check now reads the note with `evaluate`. The whole saving check passes.

**Checks**

All on this branch after merging `main` (with talents, the ranger's and mage's trees, Herbalism and using what professions make):

- `whole-zone.mjs`: **all passed**, 0 deaths, 151 of 306 swings landed. Coins by stage: the farm +12, the lumber camp +29, the patrol +7, the tent's chest +10, the watchtower +17, its chest +10, the cart hall +19, the gallery +16, and the dig, the strongbox, the antechamber and the Warden +213 (taken together, since the mine's drops are left lying for the budget). **333 before spending**, the route's expected total (earlier runs paid 314, 321 and 378). 25 drops. The drink at the lumber camp took 0.72 s at the mouth and healed 40% (67 to 119 of 130), leaving two on the hip and the belt dim for 60 s. At the smith, "Sell junk" paid 56 and the outgrown gear 150; the Iron Longsword (white, 60 coins) was bought and worn; then a potion from the innkeeper (8). Hale's longsword was worn at the last hand-in, and the plain sword went into the stash and was still there after a reload. 471 coins at the end.
- **The budget:** at the dig with the mine's drops lying (4 drops, 4 beams) and the bag open, **58 draw calls** at the worst of 8 headings, 13k triangles, 4 point lights. At the smith with the wares board and the bag open, **118 draw calls**, 234k triangles, 4 point lights. Both are well under 300 calls and the 4-light cap, so nothing was tuned.
- The other inventory checks: `bag-adventure` (31), `belt-adventure` (28), `loot` (24), `chests` (15), `hand-in-picks` (31), `vendors` (22), `stash` (24) and `classes` (42) all pass. `loot.mjs` now reads the coin range from the config, since it had 1 to 3 written in.
- `oakvale-starting-zone/checks/saving.mjs`: all passed.
- `npm run typecheck` clean, `npm test` 60 files and 1,281 tests pass, `npm run build` ok.

**Calls made on Tom's behalf**

- **Coins: the low end stays at 1 × level and the top goes to 4**, rather than raising both ends or the multipliers. That moves the route's average to the middle of the range, and a kill still pays at least what it did.
- **The coin target is checked on the average, not one run.** The Warden alone pays 50 to 200 coins, so one run swings by about ±60. The check fails if the route's expected total leaves 300 to 400, and it records the run's own total beside it.
- **"The plain route" means every camp, the Warden and the three chests**, before any junk is sold. The quests alone (without the patrol and the watchtower) average about 305.
- **The route visits the smith and the innkeeper before the last hand-in.** By the end of the mine the bag is full of what was outgrown (15 of 16 slots in the passing run; an earlier run filled all 16 and left one drop flashing "Bag full"), so Hale's longsword wouldn't fit until the old gear was sold. That's what a player would do too. The coins before spending are counted as you arrive at the smith.
- **The script wears whatever beats what it has on** (an empty slot, a better rarity, or the same rarity at a higher level), and sells the rest except the plain sword, which goes to the stash.
- **The white piece bought is the one that beats what you wear, else the dearest for your level.** Which one depends on the run's drops: the Iron Longsword (60 coins) in the last run, worn; the Padded Jerkin (48 coins) in an earlier one, carried but not worn, since every slot held a green or blue.
- **A bandit left standing at its post gets walked over to.** After the talents merge, one lumber camp bandit walked home out of the fight and stood 28 m off, beyond the fighter's reach. The check now walks over to whoever is still up, as a player would. Nothing in the game was wrong.
- **A sword swung near a chest lifts its lid.** In one run, the fight with the dig's brute opened the strongbox beside it. The check accepts that and says so. It fits the spec ("a fist or the sword's tip") and felt right to leave.
- **fps isn't measured in the emulator** (swiftshader renders in software). Draw calls, triangles and point lights are, both eyes at the Quest's 96° field. 72 fps is for `?perf` on the headset, below.

**For later**

- Abilities 27 (every class through Oakvale) can build on `whole-zone.mjs`: the fighter, `collect`, `openChest`, `drink`, `openBag`, `carry` and the budget are all here. Only the fighting and the class checks differ.
- The bag fills by the end of the mine if you sell nothing. That's the spec's 16 slots doing their job, but if it feels tight on the headset, a vendor trip between the Lumber Camp and the mine is the fix, not a bigger bag.

**On the headset** (Quest 3, plain URL, a new warrior, `?perf` on)

This is every inventory ticket's list in one pass, shortest path first:

1. **The belt** (ticket 10), at the start: reach down to each hip without looking. Do your hands land on the slots, and do the glow and tick find them? Take a flask with the sword hand, then the shield hand. Does the fading weapon read clearly, and does it come back when you let go?
2. **The bag** (ticket 09), anywhere: reach over each shoulder and squeeze. Does the bag open where your hand goes, and does an overhead chop leave it shut? Carry things with each fist and the sword's tip. Is the card readable, and does the slot turning red or green read clearly? Look at the new gloved fists round the sword's grip and the shield's bar. Drop something off the panel and pick it up off the ground. Press the Quests and Talents tabs. With `?perf`, the bag should cost about 4 draws an eye.
3. **The belt again**: carry a potion from the bag onto the figure's belt slot, then one down to your real hip.
4. **Loot** (ticket 11), at the farm: kill the bandits and walk over what they drop. Are the pouch and items easy to see and reach? Does a green's beam read from across the camp without being too bright?
5. **Hand-in picks** (ticket 12), back at Hale: are the two items and their cards readable, and does the board read as "take one"? Grip the gloves with the bag shut. Does the bag swinging round with the gloves in hand feel right?
6. **A drink mid-fight** (ticket 10), at the lumber camp: drink between a bandit's blows. Is 0.7 s at the mouth right? Watch the ring drain, and try a flask while it's dim.
7. **Chests** (ticket 13): the leader's tent's chest (its lid from the doorway, bending a little), then the watchtower's on the hilltop, then the strongbox in the dig. Is each lid easy to reach? Do the creak and buzz feel like opening something? Is the drop beside it easy to see and take?
8. **The worst of the budget** (this ticket), at the dig after the Warden: leave the mine's drops lying, stand by the strongbox, open the bag, and read `?perf`. The emulator shows 58 draw calls and 13k triangles there, and 4 point lights. Keep 72 fps.
9. **Vendors** (ticket 14), at the smith: do the wares board and the bag sit where you can reach both without stepping sideways? Do the prices read? Does carrying a ware into the bag, and something of yours onto the board, feel like sorting? Is "Sell junk" easy to hit? Read `?perf` here too: the emulator shows 118 draw calls and 234k triangles. Then buy a potion from the innkeeper.
10. **The stash** (ticket 15), in the Golden Tankard: find the chest between the hearth and the barrels. Is its lid easy to reach? Do both panels come up where you can read them, and does the lid swing open? Carry things between the bag and both stash pages, then walk off. Do both panels close and the lid shut?
11. **Each class's weapon looks** (ticket 16), with a new ranger, then a new mage: pick up a dropped bow or staff and wear it. Does it read as better than the kit's at a glance? Hold Hale's Old Hunting Bow and draw it. Does the longer bow still sit right, with the string easy to find? Wear the Crypt-Warded Staff. Does the bolt gathering 0.75 m out feel right for throwing?
