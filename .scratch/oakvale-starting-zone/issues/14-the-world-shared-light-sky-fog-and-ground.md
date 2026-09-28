# 14: The World: shared light, sky, fog and ground

**What to build:** Oakvale looks as it does today in `?fly` and `?map=forest`, but its hemisphere light, sun, sky dome, fog and far plane now belong to one **World** that zones are loaded into, and the World answers the ground (`Ground`) for wherever you stand. The one visible change is that fog becomes radial, so turning your head no longer shifts a hill's fog. This is the prefactor the rest of Oakvale rests on: after it, loading a zone never adds a light, a sky or a shader.

**Spec:** [spec.md](../spec.md), Implementation Decisions › The world: zones, atmosphere, light and ground. User stories 127 and 144.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The World owns one light rig: one hemisphere light, one sun at a fixed late afternoon from the south-west, and a pool of exactly 4 point lights that is always in the scene, at zero intensity outdoors.
- [ ] The World owns the sky dome (today's Oakvale sky, with its haze band widened so distant ridges culled at the far edge are already fog-coloured), the fog and the camera's far plane. Oakvale's root carries no lights and no sky.
- [ ] Each zone brings an **atmosphere** (fog colour, near and far; background; sky colours; sun and hemisphere colours and intensities; far plane; the flames the pool may sit on). The World applies it by changing uniform values only. Blending two atmospheres by a weight is a pure function with its own test; the seam and the interiors use it later.
- [ ] Fog is radial: patched into the shared model material's shader once at startup, before any program compiles.
- [ ] The World implements `Ground` for Oakvale (heights, colliders, sight lines, steering, arrows). The camp prototype's zone ground (in history at merge `1135338`) is the starting point.
- [ ] `?fly` and `?map=forest` go through the World and look as before (screenshots from the viewer's spots match today's apart from the fog). `?fly=crypt` and `?map=crypt` still work: the crypt hall stays a whole-build map with its own lights.
- [ ] Tests at the `Ground` seam: the World's heights match Oakvale's plan at sample positions, a body is pushed out of a building, a sight line through a hill is blocked, and an arrow stops in the ground. The pool always holds 4 lights.
- [ ] Checked in headless Chromium: `renderer.info.programs.length` after loading Oakvale is no higher than before this change.
- [ ] Every new number is in the game's table of tunables.
