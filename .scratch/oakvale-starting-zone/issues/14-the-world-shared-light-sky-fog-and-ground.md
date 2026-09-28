# 14: The World: shared light, sky, fog and ground

**What to build:** Oakvale looks as it does today in `?fly` and `?map=forest`, but its hemisphere light, sun, sky dome, fog and far plane now belong to one **World** that zones are loaded into, and the World answers the ground (`Ground`) for wherever you stand. The one visible change is that fog becomes radial, so turning your head no longer shifts a hill's fog. This is the prefactor the rest of Oakvale rests on: after it, loading a zone never adds a light, a sky or a shader.

**Spec:** [spec.md](../spec.md), Implementation Decisions › The world: zones, atmosphere, light and ground. User stories 127 and 144.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] The World owns one light rig: one hemisphere light, one sun at a fixed late afternoon from the south-west, and a pool of exactly 4 point lights that is always in the scene, at zero intensity outdoors.
- [x] The World owns the sky dome (today's Oakvale sky, with its haze band widened so distant ridges culled at the far edge are already fog-coloured), the fog and the camera's far plane. Oakvale's root carries no lights and no sky.
- [x] Each zone brings an **atmosphere** (fog colour, near and far; background; sky colours; sun and hemisphere colours and intensities; far plane; the flames the pool may sit on). The World applies it by changing uniform values only. Blending two atmospheres by a weight is a pure function with its own test; the seam and the interiors use it later.
- [x] Fog is radial: patched into the shared model material's shader once at startup, before any program compiles.
- [x] The World implements `Ground` for Oakvale (heights, colliders, sight lines, steering, arrows). The camp prototype's zone ground (in history at merge `1135338`) is the starting point.
- [x] `?fly` and `?map=forest` go through the World and look as before (screenshots from the viewer's spots match today's apart from the fog). `?fly=crypt` and `?map=crypt` still work: the crypt hall stays a whole-build map with its own lights.
- [x] Tests at the `Ground` seam: the World's heights match Oakvale's plan at sample positions, a body is pushed out of a building, a sight line through a hill is blocked, and an arrow stops in the ground. The pool always holds 4 lights.
- [x] Checked in headless Chromium: `renderer.info.programs.length` after loading Oakvale is no higher than before this change.
- [x] Every new number is in the game's table of tunables.

## Built

Built on 2026-09-28 by Claude, in autonomous mode (Tom asked for the rest of Oakvale to run without his input).

- **The World** (`src/world/world.ts`) owns the light rig (one hemisphere light, one sun from `CONFIG.world.sunDirection`, a pool of 4 point lights at zero), the sky dome (`src/world/sky.ts`), one `Fog`, the scene's background and the camera's far plane. Zones are loaded into it with `load(zone)`; `apply(atmosphere)` only sets colours, intensities, distances and the pool's places. It implements `Ground` by asking the zone underfoot, with the camp prototype's sight lines, steering and arrows.
- **Atmospheres** (`src/world/atmosphere.ts`): Oakvale's is `OAKVALE_ATMOSPHERE` in `src/maps/forest/forest.ts`, today's numbers. `blendAtmospheres(a, b, t)` is pure and tested.
- **Maps:** `GameMap` is now a `Zone` (lit by the World, root without lights or sky, brings an atmosphere) or a `WholeMap` (the crypt, with its own lights). The full reshape into a plan and chunks is ticket 34.
- **Checks:** `tests/world.test.ts` (the `Ground` seam and the light rig) and `tests/atmosphere.test.ts`. In headless Chromium, `checks/world.mjs`: shader programs after loading Oakvale are 5 on the page and 5 in VR, as before; `?fly=forest` after every spot is 5, down from 7. The same spot of the valley seen ahead and then near the edge of view kept its colour (it drifted by 32 of 255 before). The viewer's spots look as before apart from the fog and the wider haze band. `?fly=crypt`, `?map=crypt` and the arena run as before.

Calls **taken on Tom's behalf**, to revisit:

- **Radial fog everywhere.** It's patched into three.js's shared fog chunk rather than the model material alone, so everything fogged (the model material, the water, the arena's walls and floor) agrees and no new program appears. The arena and the crypt get it too: their far corners fog a little more than before.
- **The haze band:** pure haze up to 0.18 (the sine of the elevation, about 10°) and blending into today's sky by 0.38 (about 22°). Oakvale's ridges past the far plane rise to about 10°, and fully fogged ones to about 14°, from anywhere you can walk.
- **The sun's disc and halo** are drawn by the dome's shader now, so they're round rather than 12-sided.
- **Flames in an atmosphere** put the pool's lights on the first four, at the arena torch's light. Moving them to the nearest four, the flicker and the fade over the swap are ticket 23's.
- **The viewer's fog toggle** now pushes the fog past the far plane instead of removing it, so turning it off no longer compiles new programs.
- **The zone underfoot** is the loaded zone whose walkable area holds the point, else the nearest; with Oakvale alone that's always Oakvale. Seams refine it in ticket 37.

