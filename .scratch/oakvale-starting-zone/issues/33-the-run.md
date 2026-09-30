# 33: The run

**What to build:** Click the left stick and you run at 3.5 m/s while the stick points ahead, with the edges of your view darkening a little, so the walks back to Hale go faster. You can't start a run while anything is fighting you, and a pull ends your run on the spot with one buzz in your left hand.

**Spec:** Implementation Decisions › The player (the run and its vignette). User stories 51–58.

**Blocked by:** 16 (The farm's camp).

**Status:** done

- [x] The run is a pure rule, tested on its own: a left-stick click latches it; you move at 3.5 m/s while it's latched, the stick is pushed, it points within about 45° of ahead, and nothing is fighting you; otherwise you walk at 2.2 m/s. Letting go of the stick unlatches it.
- [x] A click while anything is fighting you does nothing. A fight starting unlatches it and buzzes the left controller once. Enemies walking home don't count as fighting.
- [x] You can run anywhere out of a fight: indoors, in the mine and on the moor included. The run is the Adventure's only, and it isn't saved.
- [x] The run's vignette is a ring over the edges of the view only (not today's whole-sphere hurt vignette), one draw call while it shows, fading in and out over about 0.2 s. Its strength is one tunable, and 0 turns it off.
- [x] Tests: speed from the stick's direction, the latch and its release, and never while fighting.
- [x] Checked in headless Chromium with the emulator: a run starts on the click, stops on a pull with one buzz, and the vignette shows while running.
- [x] Every new number is in the game's table of tunables.

## Built

Built on 2026-09-30 by Claude, in autonomous mode (Tom asked for the rest of Oakvale to run without his input).

- **The rule** (`src/player/run.ts` `Run`, pure): each frame it takes the left stick's click, the stick and whether anything fights you, and answers the speed (the run's 3.5 m/s or the walk's 2.2 m/s, times how far the stick is pushed, as the walk always was), whether you're running, and whether a fight has just caught you. A click with the stick pushed latches it; you run while it's latched and the stick points within 45° of ahead. The stick back in its deadzone unlatches it. A fight unlatches it and catches you once (only if it was latched); a click during a fight does nothing. `stop()` for a death, a wake or a teleport.
- **The Player** steps it with the left stick each frame (`Player.run`, `fighting`, `running`); the stick's click is a new button on the input (`HandState.stick`, `stickPressed`, xr-standard button 3). A catch buzzes the left controller once (`CONFIG.run.buzz`). The arena's player has no run (`run` is null), so the arena is as it was.
- **The Adventure** gives the player its run and tells it each frame whether anything is fighting you: a camp's member fighting (walking home doesn't count), or the Warden up. The same answer now feeds the ambience's dip. The camps move after you in a frame, so the run hears of a pull one frame (about 14 ms) later.
- **The vignette** (`src/ui/runVignette.ts` `RunVignette`): a flat ring of 64 triangles hung 0.1 m in front of the eyes, its colour black and its alpha worked out per pixel from the angle off the middle of the view: clear out to 30°, strongest from 65°, reaching out to 80° (past the Quest's field of view). One draw call a view while it shows, none once it has faded (hidden). It fades in and out linearly over 0.2 s (`fadeLevel`, pure). It draws under the quest tracker and the hurt vignette, and under the death's fade. Its shader is compiled as the Adventure starts.
- **Tunables**: `CONFIG.run` (speed, `aheadDeg`, `buzz`, and `vignette`: `strength` 0.55, 0 off; `fade`; `clearDeg`, `fullDeg`, `reachDeg`).
- **Not saved**: nothing new goes into the save; you load walking.
- **Tests**: `tests/run.test.ts` (the speeds; running within 45° of ahead and walking past it, from the direction not the push; the latch, its release in the deadzone, a click with the stick at rest or pointing back, a second click; `stop`; a click while fighting ignored; a fight ending the run once with a catch, including with the stick sideways, and no catch when you weren't running; the vignette's fade).
- **Checks**: `checks/run.mjs` (see its header): walking at 2.20 m/s, a click and 3.50 m/s with the ring at full strength, one draw call a view and no new shader program; sideways you walk still latched; let go and it ends, the ring half faded at 0.1 s and gone at 0.2 s; running at the farm's first pair, the pull ends the run with one buzz in the left hand, and a click while they fight does nothing; led past their leash they walk home, and a click runs; the arena has no run. Screenshots under `the-run/` in the project's files (the ring darkens the view's corners by about half and its sides by about a third in the emulator's 112° × 90° view, next to `02b`, the same view without it).

Calls **taken on Tom's behalf**, to revisit:

- **The run's speed scales with the stick**, as the walk's always has: pushed all the way it's 3.5 m/s, half-way about half that. A run at a fixed 3.5 m/s however lightly you push would make the stick's travel do nothing while running.
- **A second click while running does nothing**, rather than toggling the run off: the spec's click latches, and letting go of the stick (or pointing it sideways) is the way to slow down. A toggle would also end a run on a stray click as you push hard.
- **A click with the stick at rest does nothing**, since letting go ends the run anyway; a click with the stick pointing back latches it, and you run once you point it ahead.
- **The vignette's strength is 0.55**, with the view clear out to 30° and darkest from 65°: at the Quest's edges it darkens the view by about a third, and at its corners by about half, "a little" as the ticket asks. Black, not tinted. Tune `CONFIG.run.vignette.strength` on the headset (0 turns it off).
- **The buzz** is 0.7 for 120 ms on the left hand only, between a hit landing (0.8 for 60 ms) and being hurt (0.6 for 150 ms on both hands), so it doesn't read as a blow.
- **The ring draws under the quest tracker**, so the tracker and its arrow stay readable at the top left while you run.

Left for later:

- Streaming chunks at a run's pace (34, 35); the run's feel on the headset (38).
