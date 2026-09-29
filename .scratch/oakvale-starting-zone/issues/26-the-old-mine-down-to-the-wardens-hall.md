# 26: The old mine: down to the Warden's hall

**What to build:** The rest of the descent. From the gallery the bandits' rough ramp winds down to their dig, where the silver vein glints and their gear lies dropped. A breach in the dig's far wall opens onto dressed stone: a carved passage slopes down to the antechamber, and through its gate is the Warden's hall, today's crypt hall with its throne, pillars and torches. The throne is empty for now.

**Spec:** Implementation Decisions › The mine (the route's last four parts, light, budget). User stories 92, 93, 104 and 105.

**Blocked by:** 25 (The old mine: the mouth to the gallery).

**Status:** done

- [x] The bandits' ramp: their rougher, sparsely timbered tunnel, winding down about 4 m. The dig: a rough cave about 12 × 10 m, the silver vein glinting in the rock, the bandits' dropped gear (picks, a strongbox of ore, a lantern on its side, a torn cloak) and no bodies. The breach: a hole through dressed stone in the dig's far wall, onto a carved passage sloping down about 3 m to the antechamber, about 8 m square, with the hall's gate in its far wall.
- [x] The Warden's hall is today's crypt hall, 14 m square and 4 m high, with the throne on the north wall, four torch-lit pillars and the corner braziers. You come in by its south gate; the east and west gates are choked with fallen stone. _(Taken on Tom's behalf: the hall is built by the same code as the arena's, so the two stay alike.)_
- [x] The whole route is one line with no forks, about 100 m from the mouth to the hall and about 7 m down over two ramps of about 1 in 5, with no stairs or ladders. The fallen rock at the gallery's end from ticket 25 is gone.
- [x] Light: a few bandit lanterns down the ramp, the fallen lantern in the dig, two braziers in the antechamber and the hall's four pillar torches, with the deep workings darkest. The pool keeps to the 4 nearest.
- [x] Only the part you're in and its neighbours are drawn, all the way down. The whole mine is merged to 6 to 8 draw calls.
- [x] The route's centre line runs unbroken from the mouth to the hall's gate through every chamber.
- [x] Tests: the no-pockets flood fill passes over every part for every body radius; the centre line is continuous and stays inside the walkable floor; no floor is steeper than 1 in 5.
- [x] Checked in headless Chromium: screenshots down the route and in the hall, for the thread's reply.
- [x] Every new number is in the game's table of tunables.

## Built

Built on 2026-09-29 by Claude, in autonomous mode (Tom asked for the rest of Oakvale to run without his input).

- **Floors that slope** (`src/maps/forest/hollow.ts`): a piece can be a ramp, its floor straight between level ends along one axis (`Piece.slope`, `floorOf`). The rock over openings, the ceilings laid where pieces overlap and the floor underfoot (`Hollow.floorAt`) all follow it. Pieces may now also meet edge to edge, which the breach and the hall's gate do.
- **The route on down** (`src/maps/forest/mine.ts`, numbers in `MINE`): the head of the bandits' ramp leaves the gallery's far east corner; their rough, sparsely timbered tunnel winds east down 2 m to a landing, then north down 2 m more into the dig (12 × 10 m, 4.5 m high, 4 m down). A 2 m hole through the crypt's brick wall in the dig's east wall opens onto the head of the carved passage, which turns south and slopes down 3 m, turns east at its foot into the antechamber (8 m square, 7 m down), and the hall's south gate is in its north wall. Both ramps are 1 in 5.25. The route is one line with no forks, 123 m from the mouth to the hall's gate, 7 m down. The fallen rock is gone.
- **The Warden's hall is the arena's** (`src/world/hall.ts`): the crypt hall's building code moved out of `arena.ts` into `buildHall`, which takes what lies behind each gate: the arena's three run back into the dark, as before; in the mine the south gate is the way in and the east and west are choked with fallen stone (a collider flush with the wall covers the spill, `CONFIG.arena.choked`). Each gate's tunnel now has flagstones down it, so there's no gap at the threshold. Its throne is empty. Its flagstone floor and brick walls now use the models' material with the two textures, so the hall compiles no shader of its own, in the arena or the mine; the crypt's passage and antechamber are dressed in the same brick and flagstones, and the antechamber shares the hall's gate frame, plinth and cornice (`gateFrame`, `PLINTH`, `CORNICE`), the plinth broken where the passage and the gate open.
- **The dig**: the silver vein in bright flecks along its north and west walls, a strongbox of ore flush with its north wall (the only new collider there), two picks and a torn cloak on the floor, and the bandits' lantern on its side, still burning. No bodies. The crypt's outer wall is laid bare round the breach, with loose bricks at its foot.
- **Light**: three bandit lanterns down the ramp, the fallen lantern in the dig, the antechamber's two braziers either side of the gate, and the hall's four pillar torches (its corner braziers are glows, as in the arena). The carved passage has none. The pool keeps to the 4 nearest, all the way down.
- **Drawing** (`src/maps/forest/mineModel.ts`): the whole mine is four meshes: the rock, timbers and props; the crypt's flagstones; its bricks; and the glows. Each lays its parts down in route order, so the part you're in and its neighbours is one draw range per mesh, and hidden parts' glows shrink to nothing. Parts cost 900 to 5,600 triangles (the hall's the most).
- **Tunables**: the layout's numbers are in `MINE` (with the hall's placing and the antechamber's braziers), the choked gates' spill and how far its collider reaches past the gate in `CONFIG.arena.choked`; the hall's own numbers stay in `CONFIG.arena`.
- **Tests**: `tests/mine.test.ts` covers a ramp in the hollow (its floor, its bends, meeting a room edge to edge, which ceiling is laid). `tests/world.test.ts` now runs every mine test over the whole route: no pockets over every part for every body radius; the centre line unbroken from the mouth to the hall's gate, on the walkable floor and clear of walls and props for every body; 7 m down in exactly two ramps, never a step and nothing steeper than 1 in 5; nothing two parts away can be seen; walking the whole way down and back at a run, only the part you're in and its neighbours are drawn; loading in the hall; the hillside over every piece; four meshes, each part's cost and each part's flames.
- **Checks**: `checks/mine-deep.mjs` in headless Chromium with the emulator (see its header); `checks/mine.mjs` reads what's drawn the new way. Screenshots are in the project's files under `mine/` (09 to 19 down the route; 20 is the arena, checked by eye after its floor and walls changed material, and looks as before).

Calls **taken on Tom's behalf**, to revisit:

- **The ramp leaves the gallery by its far east corner, not its far end.** Anything straight on from the gallery's end can be seen from the cart hall, and only the part you're in and its neighbours are drawn, so the ramp turns out of the gallery at once (a short head of the ramp counts as the gallery).
- **The breach is in the dig's east wall, and the carved passage turns south straight behind it**, then east again into the antechamber. Each turn hides the next part but one: the passage from the ramp, the antechamber from the dig, the hall from the passage.
- **The route is about 123 m, not 100**: two ramps of 1 in 5 need 37 m of slope, and the turns that keep each part out of sight of the next but one add the rest.
- **Ramps are 1 in 5.25**, just under the limit, so a walk measured underfoot never reads steeper than 1 in 5.
- **The antechamber's braziers stand flush with its north wall** either side of the gate, and the gate has a stone frame on the antechamber's side too.
- **The fallen lantern lights the dig from a little over where it lies** (0.6 m), and lies near the middle of the dig, so its light reaches the walls, not just the floor round it.
- **The Warden's hall compiles no shader of its own**: its floor and walls moved onto the models' material, textured as before, in the arena too.
- **The whole mine is four draw calls, not six to eight**: one mesh per material with a draw range over the parts shown, rather than one mesh per part.

Left for later:

- The mine's undead, their ground and sight, and following the centre line (27).
- The Warden on its throne, and what the hall does when you step through its gate (28).
- The drone rising at the breach (31); staging (34).

