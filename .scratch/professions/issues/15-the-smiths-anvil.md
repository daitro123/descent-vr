# 15: The smith's anvil

**What to build:** Smithing at the smithy, promoted from `?proto=anvil` variant A. Stepping up to the anvil swaps both hands for the smith's hammer and tongs (out of a fight), and stepping back swaps them back. The recipe board beside the anvil lists the recipes you know, what each takes and what you have. Pressing one starts it through the professions module, taking its materials from the bag. Smelting in the crucible, heating a blank in the fire, and the glowing marks (3 for the whetstone, 5 for the gauntlets) with tap, good and great strikes. About 10 s of heat, the new quench bucket beside the anvil, and the product flying to the bag, or waiting on the anvil with a full bag. "+1 Smithing". Walking off leaves the work where it stands. The smith steps aside from the anvil while you work.

**Blocked by:** 11.

**Status:** resolved

Read [the spec](../spec.md) ("Stations") and [Hammering at the anvil](06-hammering-at-the-anvil.md).

- [x] `.scratch/professions/checks/anvil-adventure.mjs` (from the prototype's `checks/anvil.mjs`) walks into the smithy with ore and rough stone in the bag and sees the hands swap. It makes 2 bars, a whetstone with great strikes and a pair of gauntlets of Strength with good strikes and a quench, finds them in the bag, and sees Smithing rise and the hands swap back 2 m away.
- [x] A recipe you lack materials for is greyed, and pressing it is refused with nothing taken.
- [x] `?proto=anvil` still runs.
- [x] `npm run typecheck`, `npm test` and `npm run build` pass.

## Answer

Built on 2026-09-30 by Claude **on Tom's behalf**: he asked for the build tickets to run without his input, taking the recommended option at every fork. Driven with emulated controllers, not yet tried on the Quest 3, so every number is a starting point to tune there. `?proto=anvil` is untouched and its check still passes.

**What was built**

- `src/professions/anvil/work.ts`: the make at the anvil as a pure module (`AnvilWork`), with no DOM, three.js or XR. `choose(id)` starts a recipe through `professions.start`, which takes its materials, and sets them on the station. `update(dt)` smelts and heats. `strike(speed, travel, x, z)` works the marks, `grab`, `letGo(where)` and `walkOff` move the piece, `dunk` quenches, and `retry` bags a thing left waiting. Finishing calls `professions.finish('anvil')`. `FORMS` maps each anvil recipe to how it's made (smelted, hammered cold, or heated, hammered and quenched), and `MARKS` holds where the marks are.
- `src/professions/anvil/anvil.ts`: the station in the smithy. It holds the frame, the crucible and mould, the new quench bucket beside the anvil, the recipe board, the hammer's strike detection, the tongs, the sparks and sounds, the flight to your hip, and one line of what to do next over the anvil. `board.ts`, `pieces.ts`, `tools.ts` and `sounds.ts` are promoted from the prototype's files, which keep their own copies.
- `src/professions/stationHands.ts`: the spec's one rule for hands at a station, `stationHands(were, atStation(...))`, so the alchemy bench (16) can use it too. Stepping within 1.3 m of the anvil, facing it (within 60°) and out of a fight, swaps both hands. Past 2 m, or when a fight starts, they swap back (a fight does it at once, with a strong buzz). Turning away (to the forge, the bucket) keeps them.
- `Player.holdTools(tools | null)` puts the hammer and tongs in the grips in place of the sword and shield. With no sword in the grip, nothing hits and the sword's tip is no probe.
- `Villager.stepAside(to | null)`: the smith walks to `SMITHY.aside`, by the back wall and clear of the way to the forge, and stands watching while you work. They go back to the anvil 2 s after you leave. Their body moves with them.
- `Adventure`: builds the anvil from the smith's spot, drawn with the outdoors, and steps it each frame. What a make does goes through `applyThings` (saved, bag refreshed), and each `made` effect also goes to `state.apply({ kind: 'made', recipe })` so quests count it (ticket 12). The bench build's `proficiency` float shows "+1 Smithing" where the thing was made.
- Every number is in `CONFIG.professions.station` and `.anvil`, and in `CONFIG.villagers.smith.aside`.

**Checks**

- `tests/anvil.test.ts` covers the make through its seam against a real professions module and inventory, and the hands rule.
- [checks/anvil-adventure.mjs](../checks/anvil-adventure.mjs) plays it in the Adventure in headless Chromium, and all of it passes. It walks in with the stick, the hands swap and the smith steps aside. It makes 2 bars, a whetstone with great strikes, and a pair of gauntlets of Strength with ten good strikes and a quench. Smithing goes 0, 1, 2, 3, then 15 to 18. A greyed recipe is refused with nothing taken. At 2.3 m the hands swap back and the smith returns. The anvil costs about 142 draw calls in view.
- `npm run typecheck`, `npm test` and `npm run build` pass.

**Calls made on Tom's behalf**

- **The anvil needs Smithing learned.** Without it, stepping up does nothing, the board is hidden and the smith keeps hammering.
- **One make at a time.** The crucible, the fire and the anvil share one make, as the professions module keeps one per station. A thing left waiting with the bag full blocks the board until it's bagged. It tries every second, and when it's dropped from the tongs.
- **The board and the line turn to face you**, eased. You can step up from the open front as well as from the smith's side, and a fixed board faced one of them edge-on.
- **The distance is measured from the anvil**, not from where the smith stands, so stepping up from the front counts. From where the smith stands, the forge's fire is within the 2 m.
- **The bucket is the station's**, built beside the anvil at `SMITHY.bucket`, as the prototype's was. The map viewer doesn't show it.
- **The smith glides aside** at walking pace in their standing pose. Nobody walks yet, and a walk cycle can come later.

**For later tickets**

- **16 (the bench)** landed alongside this with its own copy of the hands rule (`CONFIG.professions.bench`). The two can share `stationHands` later. Both pass their makes through `Adventure.applyMade` and float proficiency the same way.
- **13, 14 (gathering):** the "+1 Mining" float is already there. Pass `gather`'s effects through `applyThings`.
- **17 (using what's made):** the whetstone and gauntlets arrive in the bag as ordinary items.

**On the headset:** check the hammer's face angle in the grip, the anvil's face height (74 cm), the strike speeds (1.2 and 2.2 m/s), and whether 1.3 m and 60° feel right for stepping up.
