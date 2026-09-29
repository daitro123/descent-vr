# 23: The inn

**What to build:** The Golden Tankard opens. Its door swings open as you walk up, and you see the hearth already lit through the doorway. Step in and the door shuts behind you; over half a second the sun fades, the room's flames light you and the outdoors is hidden. Walk back to the door and the daylight returns before you can see out. Dying now wakes you by the inn's hearth, and a save made inside loads inside with the door shut and the room lit. This ticket builds the **Interiors switch** the house and the mine reuse.

**Spec:** Implementation Decisions › Interiors, The world (the light pool). User stories 7, 89 and 107–114 (the inn).

**Blocked by:** 16 (The farm's camp), 19 (Saving).

**Status:** done

- [x] An **interior** is a model built with its zone and hidden until needed, its ground inside its footprint (floor heights, walls, and props as colliders), its flames (the ones the light pool may sit on; the rest are glows), its atmosphere, and its entrance.
- [x] The Interiors switch is one small state machine, pure and tested: _outside_; _at the door_ (door open, room visible and lit by its flames, outdoor light); _inside_ (door shut behind you: over about 0.5 s the sun fades, the sky light drops to the interior's fill, fog closes in, the pool moves onto its flames and the outdoors is hidden); and back, with the sun up again just before you can see out.
- [x] Doors open when you're within about 2 m of them from either side, stay open while you stand in the doorway, and shut once you're about 1.5 m past. No button and no fade.
- [x] The pool of 4 point lights moves onto the 4 nearest flames, flickers by intensity and fades over the swap. The count never changes, so no shader recompiles.
- [x] The inn's outside keeps its look but gains a real doorway, with steps up to a floor at the top of its 0.3 m foundation. The interior's walls stand just inside the outer walls; the single-sided shared material hides the outer walls from inside. The windows are panes that glow with daylight and can't be seen through.
- [x] The taproom, about 10 × 7 m and 2.9 m high: a big hearth under the larger chimney, a bar along the back wall with barrels and shelves of bottles and tankards, four tables with benches, and a small fireplace under the other chimney. Its flames are the hearth, a lantern over the bar and a lantern over each of two tables. The innkeeper's spot behind the bar stays empty until ticket 29. The upper floor is out of reach, with no stair.
- [x] The World's `Ground` inside the footprint is the inn's. No enemy ever comes indoors.
- [x] The village respawn point moves to the hearth: you wake inside with the door shut.
- [x] The save records the interior you're in; loading inside the inn puts you there with the door shut and the room lit.
- [x] Tests: the switch's states; the hearth's respawn point is clear; the World's floor and walls inside the footprint are the inn's; the arena's no-pockets flood fill passes over the taproom for every body radius; a save round-trips with the inn as its interior.
- [x] Checked in headless Chromium: walking in and out swaps the light without changing `renderer.info.programs.length`; the interior costs a few thousand triangles and one draw call plus its glows.
- [x] Every new number is in the game's table of tunables.

## Built

Built on 2026-09-29 by Claude, in autonomous mode (Tom asked for the rest of Oakvale to run without his input).

- **An interior** (`src/world/interiors.ts`) is a plan (`InteriorPlan`: its building's frame, footprint, floor, height, doorway, flames, atmosphere, respawn, and its own ground, `groundAt` and `resolve`) plus what it draws (`Interior`: the room, hidden until needed, and the door, which is part of the outside's look). A zone brings its interiors (`Zone.interiors`), and the World loads them with it.
- **The Interiors switch** (`InteriorSwitch`) is pure: _outside_, _atDoor_, _inside_ and _leaving_ (walking back to the door from inside), with `light` (0 outdoors' to 1 room's) and `door` (0 shut to 1 open).
  - The door opens within 2 m of its middle from either side, stays open while you're in the doorway, and shuts once you're 1.5 m in past its line, or 2.3 m off outside.
  - With the door shut behind you, the light swaps over 0.5 s, and the outdoors is hidden once the door is shut.
  - Walking back within 1.3 m of the door, the sun comes back over 0.2 s, and only then does the door open.
  - Arriving any other way (waking by the hearth, loading a save, a teleport) swaps at once (`settle`).
- **The World** steps each interior's switch from where the camera stands (a camera above the ceiling is nowhere near the door), swings its door, shows its room, blends its atmosphere from the zone's by the switch's `light`, and hides the zones and the sky while a door is shut behind you (`outdoorsShown`; the Adventure hides its camps, pickups and Hale with them). It reports `interior` (the one you're inside, or walking back to the door of).
- **The pool of 4 point lights** now picks the 4 flames nearest your head, from the atmosphere shown and any room showing. A light leaving a flame fades out over 0.3 s before it moves, and fades in on its new one, and each flickers by intensity. The count never changes. Outdoors it's dark, as before.
- **The World as `Ground`**: inside an interior's footprint (and on the steps up to its door) the height is the interior's; its walls and props push you out wherever you are. The inn's old solid footprint is gone from the zone's colliders; its walls collide from outside just as the box did, less the doorway.
- **The Golden Tankard** (`src/maps/forest/inn.ts`, the plan; `innModel.ts`, the meshes):
  - Outside, the stone ground floor's walls now stand round the taproom with a real doorway, its timber frame, and a double door that swings in. The old door panel is gone. The ground is levelled round the inn out to the foot of its steps, and the steps ramp from the floor (0.31 m) down to the ground.
  - The taproom is 10.3 × 7.3 m and 2.86 m to the ceiling: board floor, stone to the waist and plaster above, beams, and windows that glow with daylight wherever the outside has one.
  - The big hearth is on the right wall under the larger chimney; the small fireplace is on the left wall under the other; a bar runs along the back with tankards; shelves of bottles and tankards stand between the back windows; two barrels (one tapped) stand past the bar's end; four tables have a bench along each side.
  - Its flames: the hearth, a lantern over the bar and lanterns over two tables. The small fireplace and candles on the other two tables are glows.
  - The innkeeper's spot behind the bar is `INN.keeper`, empty until ticket 29.
  - It costs 4,494 triangles in one draw call, plus one for its 4 glows and two for the door's leaves (240 triangles).
- **The village respawn point** is before the hearth, facing the door (`Respawn.interior` says it's in the inn). You wake inside with the door shut and the room lit.
- **The save** records the interior you're in (`saveRecord` takes it with where you stand); loading a save made inside settles you inside, door shut, room lit.
- **Tunables:** `CONFIG.interiors` (open, margin, shut, reopen, fadeIn, fadeOut, swing, angle) and `CONFIG.world.pool` (fade, flicker).
- **Tests:**
  - `tests/interiors.test.ts` (9): the switch's states, the door's distances, the light swapping only once the door is shut, the sun up before the door opens on the way out, turning back, settling and teleports.
  - `tests/world.test.ts` (10 new or rewritten): the pool fading between flames and flickering, and sitting on the nearest; the inn's floor and steps; its walls and props from inside and out and its open doorway; no pockets over the taproom for every body radius; the hearth's respawn point clear; every camp post and patrol road more than a leash and a notice from its walls; walking in and out through the World, and settling inside.
  - `tests/forest.test.ts`: the respawn point by the hearth. `tests/saving.test.ts`: a save round-trips with the inn as its interior.
- **Checks:** `checks/inn.mjs` in headless Chromium with the emulator; see its header for every step. It walks up (the door opens 1.94 m out), in (it shuts 1.55 m in, then the light swaps), and back out (the sun is up before the door opens), with `renderer.info.programs.length` the same throughout (12). It dies and wakes by the hearth, and saves inside and reloads inside. Screenshots are in the project's files under `inn/`. The other checks still pass.

Calls **taken on Tom's behalf**, to revisit:

- **From inside, the door opens again at 1.3 m, not 2 m.** It shuts once you're 1.5 m in, so opening it again within 2 m would have it swing back open as soon as it shut. The sun comes back over 0.2 s rather than 0.5 s, so at a walk (2.2 m/s) the door is open by the time you reach it. Running (a later ticket) will reach it while it's still swinging; since the door doesn't collide, that's a brush through a leaf, not a stop.
- **Standing in a front corner of the room keeps the door open**: it shuts only once you're 1.5 m in past its line.
- **"Inside" for the save** is inside or walking back to the door; standing in the doorway is outside.
- **The door doesn't collide**, shut or open, so it can never hold you up or trap anyone. It's two leaves swinging in, each a small mesh of its own, since they're part of the outside's look too.
- **The room is 2.86 m high**, not 2.9, to sit under the jettied upper floor's beam; and 10.3 × 7.3 m inside the 0.25 m stone walls.
- **The hearth is centred 0.6 m off the chimney's line** (at z −0.8 rather than −1.4), to clear the right wall's back window.
- **The taproom's layout**: the bar leaves its right end open to walk behind it; the barrels stand past that end; the tables leave either a body's width (1.1 m for the biggest enemy) or no room at all between them and everything else, so nothing can be knocked into a nook it can't walk out of; the door's line leads straight to the bar.
- **The room's light**: a warm fill of 0.55 instead of the sky, a warm brown fog from 4 to 30 m (it softens the far wall a little) and a 60 m far plane.
- **No enemy comes indoors** because every camp post and patrol road stands more than a leash and a notice (38 m) from the inn's walls, checked by a test. No runtime rule keeps them out.
- **The pool picks the 4 flames nearest your head**, from anywhere a room shows.
- **The door opens for a camera flying over** only when it's below the ceiling, so `?fly` never hides the outdoors.

Left for later:

- The house and the smithy (24) reuse the switch.
- The mine (25) needs its ground to apply only once you've come in by the mouth, not by position.
- The outdoor sound muffled inside (31), the innkeeper behind the bar (29), and staging interiors' meshes near their doors with the streamer (34).

