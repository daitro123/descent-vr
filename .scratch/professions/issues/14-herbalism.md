# 14: Herbalism

**What to build:** Herbalism in Oakvale, end to end. The knife from the tool loop within 3 m of a clump. The one low slice through the stems takes the clump (2 herbs to the bag), and a slice through the leaves trims one and says "cut lower". "+1 Herbalism", short stems while it's taken, and the refill. The 8 Hearthleaf and 6 Duskcap clumps placed in Oakvale's plan, two instanced meshes, and Duskcap's faint glow in the mine. Until ticket 18 a character learns Herbalism through the debug handle.

**Blocked by:** 13.

**Status:** resolved

Read [the spec](../spec.md) ("Gathering spots and the tool loop") and [Gathering spots in Oakvale](10-gathering-spots-in-oakvale.md).

- [x] `.scratch/professions/checks/herbalism.mjs` cuts a Hearthleaf clump in the farm's fields and a Duskcap clump in the mine, sees 2 of each in the bag and Herbalism at 2, and sees a leaves-only slice trim without taking the clump.
- [x] With both Mining and Herbalism learned, the loop gives the pick at a vein and the knife at a clump.
- [x] `npm run typecheck`, `npm test` and `npm run build` pass.

## Answer

Built on 2026-09-30 by Claude **on Tom's behalf**: he asked for the build tickets to run without his input, taking the recommended option at every fork.

**What was built**

- **The knife on the tool loop** (`src/professions/gathering/knife.ts`), promoted from `?proto=pick` variant C: a short blade out of the fist, four points along its edge, and the lighter gate (0.1 m of hand travel at 0.6 m/s, the tip over 1.4 m/s; `CONFIG.professions.knife`). Its hilt hangs in the loop beside the pick's handle once Herbalism is learned. `Gathering.drawn` is now `'pick' | 'knife'`. With both gathering professions learned, a grip draws whichever tool's nearest full spot is closer, the pick on a tie (`toolFor` and `TOOL_OF` in `loop.ts`). A drawn tool goes back once you're 5 m from every spot *it* works.
- **The cut** (`bandAt` and `scoreCut` in `spots.ts`, `Gathering.cuts`/`cut`). The edge's path each frame is sampled against the clump's two bands, measured from its foot on top of its rise. The stems are the bottom 10 cm within 0.1 m of the middle; the leaves run from there up to 0.34 m, within 0.17 m. A hot pass that touches the stems takes the clump, even if it caught leaves too. One that only touches the leaves trims a leaf, down to three left, and floats "Cut lower" over it. A slow pass only brushes it: it sways and rustles. Each counts once a swing.
- **A taken clump** calls `state.professions.gather('hearthleaf' | 'duskcap')` through `Adventure.applyGathered`, as a vein does. So 2 herbs go to the bag (or the ground, with it full), "+1 Herbalism" floats, and `{kind: 'gathered', spot}` goes to `state.apply` for the quests. The herbs fly over your left shoulder into the bag. The clump stands in short stubs until it grows back, 180 s on and once you're 30 m off.
- **One `SpotStates` over every spot.** `Gathering.spots` lists the veins first, then the clumps, as the plan does. `Gathering.spot(id)` finds one for the checks. A spot remembers the last swing that counted on it, so the pick's swing count never hides the knife's.
- **The clumps, drawn** (`clumps.ts`). Hearthleaf is 6 bright leaves and 3 small gold flowers on an earthen bank. Duskcap is 5 dark purple caps on an old stump. Each rise is 0.45 m, so nobody kneels. That's 108 triangles a Hearthleaf clump and about 110 a Duskcap. There's one `InstancedMesh` per kind and place: Hearthleaf out of doors, Duskcap out of doors, and Duskcap in the mine. So out of doors it's 3 draw calls with the veins, and 2 in the mine. A per-instance attribute cuts a clump to stubs, grows it back, trims its leaves one by one, and sways it. **Duskcap glows in the mine only**: the mine's mesh lights its caps at full strength, and the outdoor one not at all.
- **Where they grow**, in the plan: `HERBS` in `src/maps/forest/layout.ts` and `MINE.duskcap`/`mineClumps` in `mine.ts`, reached as `Zone.spots`. Each rise is solid (a circle of 0.42 m), and trees and bushes are cleared round it (`CONFIG.professions.clump`).
- **The knife's sounds** (rustle, and the slice through leaves or stems) moved from the prototype into `gathering/sound.ts`. `?proto=pick` plays them from there and keeps its own pick and pull sounds.
- `Gathering.meshes` lists every spot mesh with where it's staged, so the Adventure stages and shows the veins and clumps in one loop.

**Checks**

- `npm run typecheck`, `npm test` (1280 passed, after merging main's ticket 17 and abilities 26) and `npm run build` pass.
- `tests/gathering.test.ts` covers which tool the loop draws, the knife's bands and a cut's score, a clump's state from full through trimmed and taken to grown back, and the herbs through the professions module. `tests/forest.test.ts` covers where the 14 clumps are, that each stands on dry ground you can walk up to, and that its rise is solid. `tests/streaming.test.ts`'s Oakvale triangle count drops from 214,310 to 213,811, because plants are cleared round the clumps.
- `.scratch/professions/checks/herbalism.mjs` passed in headless Chromium, all 8 steps:
  - At the Hearthleaf west of the farm's wheat, the loop draws the knife.
  - A hot slice through the leaves trims one, says "Cut lower" and takes nothing.
  - A slow pass through the stems only brushes it.
  - A hot slice through the stems takes it: 2 Hearthleaf, Herbalism 1.
  - `?perf`: the 8 Hearthleaf are one call per eye.
  - In the mine's gallery, the Duskcap's caps glow, and a slice through its stems gives 2 Duskcap, Herbalism 2.
  - With Mining learned too, the loop gives the pick at the smithy's vein and the knife at the road-south Hearthleaf.
  - Both clumps grow back after 180 s at 30 m.
  - `?proto=pick&variant=C` still cuts its Hearthleaf. No page errors.
- `.scratch/professions/checks/mining.mjs` still passes, all 8 steps.

**Calls made on Tom's behalf**

- **The places**:
  - Hearthleaf: west of the wheat, north of the wheat (within a raider pair's notice), south of the cabbages, 4 m off the road south at (−9.5, 72), on the south bank by the bridge, the pond's east and west shores, and the meadow south-west of the standing stones.
  - Duskcap: two in the woods west of the houses (−44, −12) and (−33, −19), two just outside the lumber camp's clearing (west and north), and two in the gallery: one against its west wall between the veins, among the undead, and one against its east wall, clear of them.
- **Duskcap grows on old stumps** (in the mine, rotten pit props), so both herbs sit at the same height for the knife.
- **A slice that catches both bands takes the clump.** A downward cut through the leaves into the stems counts as low enough.
- **Trims stop at three leaves left.** A trimmed clump grows whole again only when it refills after being taken.
- **The rise is solid**, as a vein's rock is: you can't walk through the bank or the stump.

**For later tickets**

- **18 (trainers, intro quests):** learning Herbalism hangs the knife (`learn('herbalism')` is all it takes). The herbalist's "Leaves for the Pot" gathers Hearthleaf: count `gathered` events with `spot: 'hearthleaf'`. The quest's place is "the fields": the three farm clumps are `hearthleaf-farm-*` in `Zone.spots`, and the nearest to the village is `hearthleaf-bridge`. Barks pointing at the nearest ones can read `Gathering.spots`.
- **19 (one sitting):** tune `CONFIG.professions.knife` and `clump` on the headset: the cut's speed, the band's height, and whether 0.45 m of rise is right.

**On the headset:** learn Herbalism (`__descent.professions.learn('herbalism')`) and walk to the clump west of the farm's wheat field, or the one by the bridge.
- Does a slice through the stems feel natural at that height, or do you still stoop?
- Is "Cut lower" clear when you slice too high?
- Can you pick out Hearthleaf's gold flowers and Duskcap's glow in the mine from a few metres off?
- With Mining learned too, does the loop always hand you the tool you expected?
