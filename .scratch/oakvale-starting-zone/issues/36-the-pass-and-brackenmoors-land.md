# 36: The pass and Brackenmoor's land

**What to build:** The southern pass opens, and Brackenmoor lies over its crest. Walk south from the village along the road, between rocks and pines, up to a border stone on the crest, and down onto a bare moor of bracken and heather ringed by low hills, where the road runs on to a rockfall in a gap. The two zones' land meets exactly on the crest. `?fly` flies Brackenmoor too. What happens as you cross (the light, the name, the sound, the save) comes in ticket 37.

**Spec:** Implementation Decisions › The southern pass, the seam and Brackenmoor, Zones: a plan and chunks. User stories 115–118, 123, 124 and 126.

**Blocked by:** 35 (Building chunks in a worker).

**Status:** done

- [x] The pass opens as a walkable corridor about 10 m either side of the road, from the play area's edge (z = 84) to the crest (z = 140), bounded where the pass's walls turn steep, with rocks and pines along the edge so the limit reads. The road's steepest stretch (about 1 in 4 around z = 110 to 120) is regraded to 1 in 5.
- [x] Brackenmoor is a zone like Oakvale, id `brackenmoor`, labelled "Brackenmoor": a plan plus a chunk builder spanning x from −100 to 100 and z from 140 to 300 (5 by 4 chunks), walkable within x ±60 from the crest to z = 260. Low, rounded hills of 20 to 35 m ring it east, west and south. From the crest the land falls into a shallow basin a few metres above Oakvale's valley floor. The road runs from the crest across the moor to a gap in the south hills, closed by a rockfall at the walkable edge.
- [x] Its look: an open moor of bracken and heather in rust, olive and purple, with scattered grey rocks, low bushes and a few lone, wind-bent pines. It reuses Oakvale's plant shapes and the shared material with its own vertex colours, so no new shader appears.
- [x] Its atmosphere: a paler, cooler haze, a whiter sky and a rust-brown ground light, under the same sun.
- [x] The seam is the crest, z = 140. Oakvale's heights along it are the shared border profile, and Brackenmoor's first row of chunks blends its land to that profile over 40 m, so both zones' heights agree exactly on the line.
- [x] The border stone is one standing stone like those in Oakvale's circle, by the road on the crest.
- [x] The World's `Ground` dispatches to the zone underfoot, and within about 1 m of the seam asks both. The walkable shape includes the pass corridor and Brackenmoor's area.
- [x] Nothing lives in Brackenmoor, nothing can hurt you there, and it has no respawn point. No camp's leash reaches the pass.
- [x] `?fly` flies Brackenmoor as well as Oakvale, and `?map=brackenmoor` walks the World from Brackenmoor's start.
- [x] Tests at the `Ground` seam: the zones' heights agree along the seam; the pass corridor is walkable from the play area to Brackenmoor, and its edges stop you; Brackenmoor's chunk builds are deterministic.
- [x] Checked in headless Chromium: screenshots from the upper pass (the moor's far hills in haze) and from the crest both ways, for the thread's reply.
- [x] Every new number is in the game's table of tunables.

## Built

Built on 2026-09-30 by Claude, in autonomous mode (Tom asked for the rest of Oakvale to run without his input).

- **The pass** (`src/maps/forest/layout.ts`): the main road now ends on the crest (z = 140), and its steepest stretch is eased to 1 in 5 (`PASS.grade`; the ground under it reads at most 0.193). Oakvale's walkable shape is the play square plus the pass's corridor, `PASS.half` (10 m) either side of the road from the square's edge to 1 m over the crest, as overlapping convex areas along the road. Rocks and pines stand along both edges about every 3.5 m, 1 to 2.5 m outside, each with a collider where it's within 2 m of the walkable edge. The plan is memoized (`planOakvale()`), and the crest seam carries Oakvale's heights along z = 140 and where the road crosses it.
- **Brackenmoor** (`src/maps/brackenmoor/`): a zone like Oakvale, id `brackenmoor`, labelled "Brackenmoor": a pure plan (`plan.ts`, numbers in `MOOR`), a chunk builder over x −100..100, z 140..300 (5 by 4 chunks), its own worker, and a registry entry. The land falls from the crest into a shallow basin a few metres above Oakvale's valley floor (about 2.5 m on average), ringed east, west and south by hills 20 to 35 m high, and parted where the road leaves through the south hills. The road runs from the crest across the moor to that gap, where a rockfall of 14 boulders closes it at the walkable edge (z = 260). Its plants are Oakvale's shapes recoloured with vertex colours on the shared material: rust bracken (grass tufts), purple heather (low rock mounds), olive bushes, lichen-grey rocks and 13 wind-bent pines. No new shader: `renderer.info.programs` is unchanged walking in.
- **Its atmosphere** (`MOOR_ATMOSPHERE`): a paler, cooler haze (fog 40 to 200 m), a whiter sky light, and a rust-brown ground light under the same sun. It shows under `?map=brackenmoor` and `?fly=brackenmoor`; changing to it as you cross is 37's.
- **The seam** at z = 140: Brackenmoor's plan takes Oakvale's crest heights and blends its land to them over its first 40 m, so both zones read exactly the same heights along the line (tested every 2 m and between). `HeightGrid` (`src/maps/heightGrid.ts`) is the shared height grid both zones read back exactly as their meshes draw. The border stone is one of the circle's standing stones (`standingStone`, now exported), by the road on the crest, 1 m into Brackenmoor, with a collider.
- **The World** (`src/world/world.ts`): `add(zone)` loads a neighbour without taking on its atmosphere. The ground dispatches to the zone whose land you're over (else the nearest walkable one), and the walkable shape is the union of every zone's (`Walkable.union`). Pushing you out of trunks and rocks asks every zone whose land is within `CONFIG.world.ground.seam` (1 m). Each zone's walkable area reaches the same 1 m over the seam into its neighbour's, so the union has no edge on the line.
- **Loading**: the Adventure, `?map=` and `?fly=` load the zone's neighbours up front (`loadNeighbours`), so the pass leads straight onto the moor. `?map=brackenmoor` starts on the road just over the crest, looking south; `?fly=brackenmoor` flies Start, The crest, The moor, The rockfall and Overview.
- **Nothing lives there**: Brackenmoor has no camps, villagers, respawn point or Hale; `Zone` no longer carries those, and the starting zone's type (`StartingZone`) does. No camp's leash reaches the pass (tested).
- **Tunables**: `CONFIG.world.ground.seam` (1 m).
- **Tests**: `tests/brackenmoor.test.ts` (22): the seam heights agree exactly and the land is continuous across it; walking the road from the play square over the crest to the rockfall; a flood fill of the walkable union with no pockets for every body radius; the corridor's edges stop you and have rocks and pines along them; the road's grade; no leash in the pass; the basin, hills, gap and rockfall; the plants and none on the road; the border stone and its collider; the spawn; chunk builds deterministic, the worker's byte for byte the main thread's, stand-ins cheaper. `tests/streaming.test.ts` updated for the neighbour, the pass's extra triangles (+2,238) and the land's new south edge.
- **Checks**: `checks/pass-and-brackenmoor.mjs` (see its header). `?map=forest` streams both zones from their workers and adds no shader program; screenshots from the upper pass (the moor's far hills in haze over the crest) and from the crest both ways. `?map=brackenmoor` starts just over the crest with Oakvale loaded. `?fly=brackenmoor` flies all five spots. In the Adventure in VR, walking the road from z = 80: over the crest after 29 s, never pushed back, stopped by the walkable edge at the rockfall (z 259.7), nothing fought, `renderer.info.programs` 18 at both ends, no page errors. Screenshots are in the project files under `pass-and-brackenmoor/`.

Calls **taken on Tom's behalf**, to revisit:

- **The zones' layout numbers stay in their plans** (`PASS` in Oakvale's layout, `MOOR` in Brackenmoor's plan), as Oakvale's `FOREST` layout and the mine's rooms already are; only the seam's reach went into the tunables table. They're shapes of the land rather than knobs to turn on the headset.
- **Brackenmoor's walkable shape is the pass's corridor carried on, then the moor**: the corridor runs 20 m wide from the crest to about z = 162 and opens to ±60 m by z = 205, rather than the whole ±60 m rectangle from the crest. The land just over the crest is the pass's far wall, and a bare rectangle would let you climb it.
- **The pass is a fixed 10 m either side of the road**, not traced where the walls turn steep: at the pass's foot the land is gentle, so there the rocks and pines are what show the edge.
- **Hills 20 to 35 m** means the ring's own height over the basin floor; the floor's swell (±5 m) rides under it.
- **The walkable areas overlap 1 m over the seam**, so crossing is never an edge.
- **Neighbours are loaded up front** in the Adventure, `?map` and `?fly`; loading them early as a zone becomes current is 37's.
- **`StartingZone` split out of `Zone`**, so Brackenmoor carries no respawns, Hale or places.
- **Brackenmoor's worker plans Oakvale for itself** for the crest's heights, as Oakvale's worker does (a one-off cost when it starts).
- **Heather is low purple mounds** made from the rock shapes: grass tufts in purple read as spikes.
- **Brackenmoor's registry origin is (0, 0)**: chunk keys are on the one global grid, so the origin is only nominal.
- **Paths' ends are cut square** (no ragged edge at a path's first and last point), so the road meets its other half at the seam. Oakvale's other path ends change imperceptibly.
- **`HeightGrid.at` reads the far edge from the last cell** so an edge reads its own heights exactly where a neighbour's land meets it.
- **On the seam's line itself `zoneAt` answers with the zone added first** (Brackenmoor, as a neighbour): the heights agree there, so it only matters for 37's current zone, which should decide the line itself.

Left for later:

- Crossing the seam: the current zone, the atmosphere's blend, the zone's name, its sound and the save (37). Neighbours loading early (37). The whole zone on the headset and the triangle budget (38).
