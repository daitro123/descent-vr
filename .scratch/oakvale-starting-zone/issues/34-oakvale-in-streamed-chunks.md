# 34: Oakvale in streamed chunks

**What to build:** Oakvale stops being built whole. A zone becomes a pure plan plus a chunk builder, and a streamer keeps the chunks near you at full detail, the ones farther out as cheap stand-ins, and the ones past the fog unloaded. Walking the length of Oakvale looks as it does today, while `?perf` shows chunks changing detail as you go. This is the prefactor for a second zone.

**Spec:** Implementation Decisions › Zones: a plan and chunks, The streamer. User stories 125 (Oakvale's part) and 143 (loaded chunks).

**Blocked by:** 24 (The house by the well and the smithy), 26 (The old mine: down to the Warden's hall).

**Status:** ready-for-agent

- [ ] A zone is a pure plan plus a chunk builder, both free of the DOM so they run in a worker and in tests. It registers an id, its display name, its origin on the grid and its neighbours. `GameMap` and `MapInfo` change shape to this; the registry still finds zones by folder. Oakvale keeps its id, `forest`, and is labelled "Oakvale". The crypt stays a whole-build map for the viewer and `?map=crypt`, and the arena keeps building its own hall.
- [ ] The plan holds everything a zone knows: heights, roads, the stream and pond, clearings, structures, colliders, landmarks, the places, the camps' posts and the patrol's road, the respawn points, Hale's spot, the atmosphere and the border profile along each seam. The zone's extras (glows, water, the windmill's sails, smoke, signposts' names, the map board) are built once per zone on the main thread from positions in the plan.
- [ ] The chunk builder builds one 40 m chunk at full or stand-in detail (far trees and coarse ground) and returns transferable arrays with a bounding sphere. Chunk keys are global on one 40 m grid in world metres.
- [ ] Where each chunk should be is a pure decision from your position and the loaded plans: full detail within about 120 m, a stand-in out to the fog's far edge, and unloaded beyond, with one chunk of hysteresis on each radius (fetched a chunk early, unloaded a chunk late). Chunks beyond the fog's far edge plus a chunk's radius are culled.
- [ ] The streamer builds and uploads at most one chunk per frame on the main thread, nearest first. The worker comes in ticket 35.
- [ ] Interiors (the inn, the house and the mine) are built with Oakvale, hidden, and their meshes staged when you come within about 40 m of the door or mouth.
- [ ] The walkable area becomes a shape rather than Oakvale's ±84 m square.
- [ ] `?perf` adds loaded chunks by detail.
- [ ] Tests: chunk builds are deterministic; the streamer's decisions at sample positions in Oakvale, including the hysteresis; the forest layout tests pass unchanged.
- [ ] Checked in headless Chromium: `?fly=forest`, `?map=forest` and the Adventure look as before from the viewer's spots, and walking north to south keeps the frame's triangles under today's.
- [ ] Every new number is in the game's table of tunables.
