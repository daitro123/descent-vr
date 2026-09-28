# 33: The run

**What to build:** Click the left stick and you run at 3.5 m/s while the stick points ahead, with the edges of your view darkening a little, so the walks back to Hale go faster. You can't start a run while anything is fighting you, and a pull ends your run on the spot with one buzz in your left hand.

**Spec:** Implementation Decisions › The player (the run and its vignette). User stories 51–58.

**Blocked by:** 16 (The farm's camp).

**Status:** ready-for-agent

- [ ] The run is a pure rule, tested on its own: a left-stick click latches it; you move at 3.5 m/s while it's latched, the stick is pushed, it points within about 45° of ahead, and nothing is fighting you; otherwise you walk at 2.2 m/s. Letting go of the stick unlatches it.
- [ ] A click while anything is fighting you does nothing. A fight starting unlatches it and buzzes the left controller once. Enemies walking home don't count as fighting.
- [ ] You can run anywhere out of a fight: indoors, in the mine and on the moor included. The run is the Adventure's only, and it isn't saved.
- [ ] The run's vignette is a ring over the edges of the view only (not today's whole-sphere hurt vignette), one draw call while it shows, fading in and out over about 0.2 s. Its strength is one tunable, and 0 turns it off.
- [ ] Tests: speed from the stick's direction, the latch and its release, and never while fighting.
- [ ] Checked in headless Chromium with the emulator: a run starts on the click, stops on a pull with one buzz, and the vignette shows while running.
- [ ] Every new number is in the game's table of tunables.
