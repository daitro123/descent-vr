# 37: Crossing the seam

**What to build:** Crossing into Brackenmoor is a moment with no loading screen. Over the 40 m either side of the crest the light, haze, sky and ambience blend by where you stand; 2 m past the crest "Brackenmoor" floats up in view (or "Oakvale" on the way back), the game saves, and Oakvale unloads behind you as you walk on. Loading a save made on the moor puts you there with Oakvale streaming in behind you. Oakvale's name also floats up whenever you load in.

**Spec:** Implementation Decisions › The world (current zone, atmosphere blend), The streamer (neighbours load early), The southern pass, the seam and Brackenmoor (the zone's name), Sound (Brackenmoor's ambience, the crossfade), Saving. User stories 4, 9, 119–122, 125, 129 and 133.

**Blocked by:** 19 (Saving), 31 (Sound that follows the light), 36 (The pass and Brackenmoor's land).

**Status:** ready-for-agent

- [ ] The World reports the current zone and changes it only once you're 2 m past a seam's line, both ways. A change fires an event the Adventure uses to float the zone's name, write a save and switch the sound.
- [ ] The atmospheres blend by position across the 40 m either side of the seam; only uniform values change.
- [ ] The zone's name floats a little above your eye line when the current zone changes and when you load in, holds about 3 s, fades, and lags your head like the tracker.
- [ ] Neighbours load early: when a zone becomes current, every neighbour's plan loads and its stand-ins go in place before any of it can be seen.
- [ ] Walking Brackenmoor end to end takes Oakvale from full detail to stand-ins to unloaded, and back on the way home.
- [ ] Brackenmoor's ambience: a stronger, lower wind and a lone bird's call now and then. Across the 40 m either side of the seam the zones' ambiences crossfade by position.
- [ ] Loading a save made in Brackenmoor puts you there, with Oakvale streaming in behind you.
- [ ] Tests at the `Ground` seam: the current zone changes 2 m past the line and not before, both ways; the atmosphere blends by position across the band. The streamer's decisions at the crest, at z = 200 and at z = 260 (where no Oakvale chunk is full and most are unloaded) and on the way back; neighbours' stand-ins are in place before any of them is within the draw distance.
- [ ] Checked in headless Chromium: crossing the seam 10 times leaves `renderer.info.programs.length` unchanged with no frame uploading more than one chunk; the name floats and a save is written on each crossing.
- [ ] Every new number is in the game's table of tunables.
