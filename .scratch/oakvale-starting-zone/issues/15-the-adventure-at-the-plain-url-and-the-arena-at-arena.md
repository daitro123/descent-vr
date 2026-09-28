# 15: The Adventure at the plain URL, the arena at `?arena`

**What to build:** Opening the site's plain URL starts the **Adventure**: you enter VR at Oakvale's crossroads with sword and shield and walk, snap-turn and dash over the World's hills with today's player. Nothing fights you yet. Today's wave game becomes the **Arena** at `?arena` and plays exactly as before.

**Spec:** Implementation Decisions › Two games in one page, The Adventure, Performance (`?perf`). User stories 1–3, 15, 50, 143 (first part), 145 and 147.

**Blocked by:** 14 (The World).

**Status:** done

- [x] The entry point routes by flag: `?inspect`, `?fly`, `?map=<id>`, `?arena`, `?emulate` and `?nodevui` as today, `?perf` as a readout over whichever game runs, and anything else starts the Adventure. The routing is a pure function of the query string, with a unit test.
- [x] `?arena` plays as today's plain URL does, with `?duel`, `?wave=N` and `?showcase` as its flags. _(Taken on Tom's behalf: `?duel`, `?wave` and `?showcase` on their own also open the arena, so old links keep working.)_
- [x] In the Adventure, a new character starts on the road about 3.5 m from Hale's spot (1.5, 4.8), facing it. Walking (2.2 m/s), snap turns and the dash work as in the arena, on the World's ground and colliders.
- [x] The Adventure's belt shows health without the wave or the enemies left. The arena's belt is unchanged.
- [x] The Adventure plays no drone; the arena keeps it. Oakvale's own ambience comes in ticket 30.
- [x] Before VR, the page shows Oakvale from the start spot, slowly turning behind the intro text. The arena's page keeps the bestiary lineup for `?showcase`.
- [x] `?perf` shows frame rate, draw calls, triangles and `renderer.info.programs.length` over whichever game runs. Shader error checks are off in production builds.
- [x] The debug handle (`__descent`) offers the World, the player, a teleport to (x, z, facing), a way to step the game by a fixed time without XR frames, and the emulator's device.
- [x] `?map=<id>` walks the World from that zone's start with no enemies (and, once saving lands, no save).
- [x] A plan test: the start spot is clear, on the road, and faces Hale's spot.
- [x] The README's URL list says the plain URL is Oakvale and the arena is at `?arena`.
- [x] Checked in headless Chromium with the emulator: the plain URL enters VR at the crossroads; `?arena`, `?arena&duel` and `?wave=7` play as before.

## Built

Built on 2026-09-28 by Claude in PR #PR, in autonomous mode (Tom asked for the rest of Oakvale to run without his input).

- **Routing** (`src/route.ts`): `readPage(search)` is a pure function of the query string, tested in `tests/route.test.ts`. `?inspect`, `?fly`, `?map=<id>` come first as before, then `?arena` (or `?duel`, `?wave`, `?showcase` alone), and anything else is the Adventure. `?perf`, `?emulate`, `?noemulate` and `?nodevui` are read alongside.
- **The Adventure** (`src/adventure.ts`) owns the World (with Oakvale loaded), today's `Player` on the World's ground, the sword trail and a belt without the wave. It steps them in one `update(dt)` per XR frame. Before VR the page shows Oakvale from the start, turning at the arena's title speed, behind Oakvale's intro text; the arena's page keeps its own text and the bestiary.
- **The arena** (`startArena` in `src/main.ts`) is the old plain URL, unchanged: its fog, `Game`, showcase and drone.
- **The start spot** is in Oakvale's plan (`HALE` and the start in `src/maps/forest/layout.ts`): (0.2, 1.5) on the road, 3.55 m from Hale's spot (1.5, 4.8), facing it, as in the `?talk` prototype. `tests/forest.test.ts` checks it is on the road, clear, facing Hale's spot, with nothing in between.
- **`?perf`** (`src/ui/perfReadout.ts`): frame rate, draw calls, triangles and `renderer.info.programs.length`, low on the left of view, over either game. Shader error checks are on only in `npm run dev`.
- **The debug handle** in the Adventure: `adventure`, `world`, `player`, `device`, `renderer`, `camera`, `CONFIG`, `paused`, `teleport(x, z, yaw)` and `step(seconds, dt = 1/72)`.
- **Checks:** `checks/adventure.mjs` in headless Chromium with the emulator, all passing. The plain URL enters VR at (0.19, 1.48), facing Hale's spot, on the ground. The stick walks 4.40 m in 2 s, the snap turn is 45°, B dashes 1.70 m, the signpost stops you, and you stay on the ground over the hills. The belt draws health and nothing where the wave goes. `?arena` brings wave 1, `?arena&duel` and `?duel` one duelist, `?wave=7` the Warden, and `?showcase` the lineup; the arena's belt still shows the wave. `?map=forest` starts at the same spot, and there are no page errors. `checks/world.mjs` still counts 5 programs for `?map=forest` on the page and in VR, and for `?fly=forest`. Screenshots are in the project's files under `adventure/`.
- **Numbers, in the emulator's mono view at the start:** the Adventure draws 60 calls and 277.6k triangles with 6 programs (7 with the readout); the arena at its start draws 16 calls and 11.0k triangles. Ticket 38 measures on the headset.

Calls **taken on Tom's behalf**, to revisit:

- **Oakvale's start is the new character's start.** The zone's `spawn` moved from the southern road to the crossroads start, so `?map=forest` and the map viewer's Start begin there too. The southern road stays a landmark, and the old Crossroads landmark went, since it sat on the start.
- **The belt keeps the rage orb, its pips and the dash bar**, with the wave and enemies left gone. Rage can't build without a fight, so the orb stays empty until ticket 17 decides when it appears.
- **The sword trail comes along** with today's player; combat, orbs and shadows come with the first camp (ticket 16).
- **A teleport puts your head, not the play space's centre, over (x, z).** The arena's restart goes through the same code, so after a death there you stand at the room's centre even if you had walked off your play space's centre.
- **`?wave` rounds down** (`?wave=2.5` is wave 2; it used to pass 2.5 through).
- **The `?perf` panel** sits 0.5 m ahead, low on the left, over everything, and redraws twice a second. Its own panel is in the counts: one draw call and two triangles per eye, and one program.
- **The page's intro** shows Oakvale's text until the script picks the game's, so the plain URL never flashes an empty box.
