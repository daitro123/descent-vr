# 15: The Adventure at the plain URL, the arena at `?arena`

**What to build:** Opening the site's plain URL starts the **Adventure**: you enter VR at Oakvale's crossroads with sword and shield and walk, snap-turn and dash over the World's hills with today's player. Nothing fights you yet. Today's wave game becomes the **Arena** at `?arena` and plays exactly as before.

**Spec:** Implementation Decisions › Two games in one page, The Adventure, Performance (`?perf`). User stories 1–3, 15, 50, 143 (first part), 145 and 147.

**Blocked by:** 14 (The World).

**Status:** ready-for-agent

- [ ] The entry point routes by flag: `?inspect`, `?fly`, `?map=<id>`, `?arena`, `?emulate` and `?nodevui` as today, `?perf` as a readout over whichever game runs, and anything else starts the Adventure. The routing is a pure function of the query string, with a unit test.
- [ ] `?arena` plays as today's plain URL does, with `?duel`, `?wave=N` and `?showcase` as its flags. _(Taken on Tom's behalf: `?duel`, `?wave` and `?showcase` on their own also open the arena, so old links keep working.)_
- [ ] In the Adventure, a new character starts on the road about 3.5 m from Hale's spot (1.5, 4.8), facing it. Walking (2.2 m/s), snap turns and the dash work as in the arena, on the World's ground and colliders.
- [ ] The Adventure's belt shows health without the wave or the enemies left. The arena's belt is unchanged.
- [ ] The Adventure plays no drone; the arena keeps it. Oakvale's own ambience comes in ticket 30.
- [ ] Before VR, the page shows Oakvale from the start spot, slowly turning behind the intro text. The arena's page keeps the bestiary lineup for `?showcase`.
- [ ] `?perf` shows frame rate, draw calls, triangles and `renderer.info.programs.length` over whichever game runs. Shader error checks are off in production builds.
- [ ] The debug handle (`__descent`) offers the World, the player, a teleport to (x, z, facing), a way to step the game by a fixed time without XR frames, and the emulator's device.
- [ ] `?map=<id>` walks the World from that zone's start with no enemies (and, once saving lands, no save).
- [ ] A plan test: the start spot is clear, on the road, and faces Hale's spot.
- [ ] The README's URL list says the plain URL is Oakvale and the arena is at `?arena`.
- [ ] Checked in headless Chromium with the emulator: the plain URL enters VR at the crossroads; `?arena`, `?arena&duel` and `?wave=7` play as before.
