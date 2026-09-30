# 13: The tool loop and Mining

**What to build:** Mining in Oakvale, end to end. The tool loop behind the main-hand hip, built from the belt's zone mechanics. The pick drawn within 3 m of a vein, the sword put away and the off hand untouched. The loop does nothing far from a spot or in a fight, and a pull puts the pick away. The 8 copper veins placed in Oakvale's plan and loaded with their chunks, and the mine's with the mine, as one instanced mesh. The glint, the committed-swing strike and the feedback, promoted from `?proto=pick` variant C. 3 copper ore and 1 rough stone to the bag through the professions module, "+1 Mining", the taken look, and the 180 s refill once you're 30 m off. Until ticket 18 a character learns Mining through the debug handle.

**Blocked by:** 11, and Inventory's ticket 10 (the belt in the Adventure), whose zone mechanics the loop reuses.

**Status:** resolved

Read [the spec](../spec.md) ("Gathering spots and the tool loop"), [Tools on the belt](02-tools-on-the-belt.md), [Swinging the pick and cutting herbs](05-swinging-the-pick-and-cutting-herbs.md) and [Gathering spots in Oakvale](10-gathering-spots-in-oakvale.md).

- [x] `.scratch/professions/checks/mining.mjs` draws the pick at a vein by the smithy, breaks it with 2 glint strikes and another with 5 plain ones, sees 6 ore and 2 rough stone in the bag and Mining at 2, sees the loop do nothing 10 m from any vein, and sees a pull put the pick away and the sword back.
- [x] A grip in the loop never arms a gesture (a test on the zone logic).
- [x] `?proto=pick` still runs.
- [x] `?perf` from the smithy's veins shows the veins as one draw call.
- [x] `npm run typecheck`, `npm test` and `npm run build` pass.

## Answer

Built on 2026-09-30 by Claude **on Tom's behalf**: he asked for the build tickets to run without his input, taking the recommended option at every fork.

**What was built**

- **The tool loop** (`src/professions/gathering/`): `TOOL_LOOP` is a third `BeltZone`, 0.2 m behind the right hip's potion slot, placed by the belt's own `BeltFrame`. It hangs once Mining is learned. `loop.ts` holds its rules as pure functions: a grip that goes down in the loop, the hand under 1.5 m/s, draws the pick within 3 m of a full vein and puts it back when drawn. Out of range, or while anything fights you, it does nothing. A drawn pick goes back on a pull, once you're 5 m from every vein, when you fall, or when a station takes your hands. Drawing sets `sword.away` and leaves the off hand as it is.
- **The pick and the glint strike**, promoted from `?proto=pick` variant C (`pick.ts`, `spots.ts`, `sound.ts`). A committed swing at 2.5 m/s or more counts 1 on the ore and 2.25 in the glint, out of 4.5. That's 2 strikes in the glint or 5 plain, one per swing. Slower swings are taps, and swings off the ore are stone. The vein cracks at a third and two thirds, and it flashes, buzzes and sounds on each strike.
- **8 copper veins** as an instanced mesh (`veins.ts`), each a grey boulder with copper and verdigris streaks. The 6 outdoors are one `InstancedMesh` that loads with the chunks. The mine's 2 are a second one, staged with the mine and shown by its drawn part. A per-instance attribute darkens a taken vein and flashes a struck one. Their places are in the plan: `VEINS` in `src/maps/forest/layout.ts` and `mineVeins` in `mine.ts`, reached as `Zone.spots`. Each vein has a collider, and plants and trees are cleared round it.
- **A broken vein** calls `state.professions.gather('copperVein')`. Its effects go through `Adventure.applyGathered`: a full bag drops what's left at the vein, and the rest goes through `applyThings`, plus a `{kind: 'gathered', spot}` for the quests. The ore flies over your left shoulder into the bag, and "+1 Mining" shows. A taken vein refills 180 s later, once you're 30 m away.

**Checks**

- `npm run typecheck`, `npm test` (1205 passed, after merging main's talents) and `npm run build` pass.
- `tests/gathering.test.ts` covers the loop's zone and rules, a strike's score, a vein's states and the gather. One test grips in the loop with the head turned up to ±0.45 rad off the belt, and no gesture arms. `tests/forest.test.ts` covers where the veins are placed and that each can be reached.
- `.scratch/professions/checks/mining.mjs` passed in headless Chromium, all 8 steps:
  - It draws the pick at the smithy's east vein.
  - It breaks that vein with 2 glint strikes and the south vein with 5 plain ones.
  - It sees 6 copper ore and 2 rough stone in the bag, and Mining at 2.
  - `?perf` counts 116 draw calls with the veins and 114 without, so the veins are one call per eye.
  - The loop does nothing 10 m from any vein.
  - A pull puts the pick away and the sword comes back.
  - A taken vein refills after 180 s at 30 m.
  - `?proto=pick&variant=C` still runs and breaks its vein.

**Calls made on Tom's behalf**

- **The loop glows and ticks only where a grip would act:** near a full vein, or with the pick drawn. Elsewhere it's still there, but a grip gets only a short "nothing" buzz.
- **A taken vein doesn't count for drawing.** It does count for how far you've walked off, so the pick stays out between two veins side by side.
- **The belt steps aside for the loop.** `BeltWorld.busy(hand)` keeps the right hand's belt slots quiet while the pick is out. The gestures host has a `taken()` hook, so a grip in the loop is marked taken wherever your head is turned, not only where the head-fixed place is.
- **The veins' places:** 2 east and south of the smithy, 2 on the ridge either side of the mine's mouth, 1 on the watchtower's hill, 1 in the rocks by the standing stones, and 2 on the west wall of the mine's upper gallery.
- **The veins' mesh is one draw call wherever you stand.** Its bounds span Oakvale, so it's never culled. At 6 instances that costs less than a second call.

**For later tickets**

- **14 (Herbalism):** add the knife to the loop's tool (`Gathering.drawn`), picking whichever tool's nearest spot is closer, as the prototype does. Keep one `SpotStates` over all the plan's `spots`, and give each spot kind its own `InstancedMesh`, as `veins.ts` does. The herb cuts' sounds are still only in the prototype's `gatherSfx`. Move them into `gathering/sound.ts`.
- **18 (trainers, intro quests):** learning Mining is all it takes to hang the loop. It reads `professions.learned` every frame.

**On the headset:** learn Mining (`__descent.professions.learn('mining')`) and walk to the rocks east of the smithy.
- Does the loop sit where your hand goes without looking?
- Does a real swing clear the 2.5 m/s gate without feeling forced?
- Can you see the ore streaks from the road?
- Is the glint easy to find once the pick is out?
