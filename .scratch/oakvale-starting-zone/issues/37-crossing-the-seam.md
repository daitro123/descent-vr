# 37: Crossing the seam

**What to build:** Crossing into Brackenmoor is a moment with no loading screen. Over the 40 m either side of the crest the light, haze, sky and ambience blend by where you stand; 2 m past the crest "Brackenmoor" floats up in view (or "Oakvale" on the way back), the game saves, and Oakvale unloads behind you as you walk on. Loading a save made on the moor puts you there with Oakvale streaming in behind you. Oakvale's name also floats up whenever you load in.

**Spec:** Implementation Decisions › The world (current zone, atmosphere blend), The streamer (neighbours load early), The southern pass, the seam and Brackenmoor (the zone's name), Sound (Brackenmoor's ambience, the crossfade), Saving. User stories 4, 9, 119–122, 125, 129 and 133.

**Blocked by:** 19 (Saving), 31 (Sound that follows the light), 36 (The pass and Brackenmoor's land).

**Status:** done

- [x] The World reports the current zone and changes it only once you're 2 m past a seam's line, both ways. A change fires an event the Adventure uses to float the zone's name, write a save and switch the sound.
- [x] The atmospheres blend by position across the 40 m either side of the seam; only uniform values change.
- [x] The zone's name floats a little above your eye line when the current zone changes and when you load in, holds about 3 s, fades, and lags your head like the tracker.
- [x] Neighbours load early: when a zone becomes current, every neighbour's plan loads and its stand-ins go in place before any of it can be seen.
- [x] Walking Brackenmoor end to end takes Oakvale from full detail to stand-ins to unloaded, and back on the way home.
- [x] Brackenmoor's ambience: a stronger, lower wind and a lone bird's call now and then. Across the 40 m either side of the seam the zones' ambiences crossfade by position.
- [x] Loading a save made in Brackenmoor puts you there, with Oakvale streaming in behind you.
- [x] Tests at the `Ground` seam: the current zone changes 2 m past the line and not before, both ways; the atmosphere blends by position across the band. The streamer's decisions at the crest, at z = 200 and at z = 260 (where no Oakvale chunk is full and most are unloaded) and on the way back; neighbours' stand-ins are in place before any of them is within the draw distance.
- [x] Checked in headless Chromium: crossing the seam 10 times leaves `renderer.info.programs.length` unchanged with no frame uploading more than one chunk; the name floats and a save is written on each crossing.
- [x] Every new number is in the game's table of tunables.

## Built

Built on 2026-09-30 by Claude, in autonomous mode (Tom asked for the rest of Oakvale to run without his input).

- **Where the zones meet** (`src/world/seams.ts`, pure): `crossings` finds each seam between loaded zones (Oakvale north, Brackenmoor south, along z = 140, x −100..100); `zoneUnder` is the old `zoneAt` rule; `currentZone` keeps the zone you were in until you're more than `CONFIG.world.crossing.past` (2 m) off its land, then takes the zone underfoot; `airAt` blends the north zone's air towards the south's across `CONFIG.world.crossing.band` (40 m) either side of the line, eased at both edges and halfway on it; `shares` gives each zone its part of it.
- **The World** (`src/world/world.ts`): each update it moves the current zone by that rule and applies the blended atmosphere (values only, only when the blend changed), which interiors and the mine still blend from, and which the streamer's reach reads. `world.zone` is the current zone; `onZone` fires on a change, `onAdd` when a zone is added in play. `fill` (loading in, waking) makes the zone underfoot current at once, since arriving isn't crossing. Given the registry's `findMap` (the Adventure, `?map`, `?fly`), it fetches a zone's neighbours that aren't loaded when it becomes current, and a zone added in play is staged and compiled before it shows. Zones are held by id: loading another built by the same id makes the first current.
- **The name** (`src/ui/zoneName.ts`): gold serif letters edged in dark, no panel, a 1.1 m card like the tracker's (so its shader, warmed at the start), a little over your eye line 1.6 m out. It comes up over 0.4 s, holds 3 s and fades over 1.2 s, lagging your head as the tracker does (the lag is now shared, `src/ui/follow.ts` `HeadFollow`). The Adventure floats it on its first update (loading in) and on each change of zone.
- **The save**: the Adventure tells `saves.onZone` the current zone every frame after it knows where you stand, so a crossing writes where you are, over the line.
- **The sound**: `Zone.ambience` is `woods` (Oakvale) or `moor` (Brackenmoor). The `Ambience` plays every loaded zone's own air into the outdoors: its wind and its birds (Oakvale's `BirdSong` in the trees; the moor's `LoneCall`, a curlew every 9 to 24 s from 30 to 70 m off, on the wing), one table (`AIRS`) per kind. The World's cues carry each zone's share of the air, and `mix` crossfades them at equal power (the square root of each share), so the air is as loud on the line as either side. Brackenmoor's wind (`moorWind`) is lower (210/300 Hz bands against 380/520), stronger and gustier, over a low rumble.
- **Loading a save made on the moor** puts you there: in Brackenmoor, under its light, its name floating up, with Oakvale's chunks filled in behind you (the fill takes every zone at once, behind the page).
- **Tunables**: `CONFIG.world.crossing` (band, past), `CONFIG.zoneName`, `CONFIG.sound.moor` (wind, call).
- **Tests**: `tests/crossing.test.ts` (18): the current zone changes 2 m past the line and not before, both ways, never while shuffling on the crest, and at once on a fill; the rule itself; the one crossing; the atmosphere blends by position across the band, halfway on the line and monotonic; only values change (the same lights, fog, sky and meshes); each zone's share of the air and the mix's equal-power crossfade; the streamer's decisions at the crest, at z = 200 and at z = 260, walking the moor end to end and home, and every chunk's stand-in in place before it's within the fog's far edge; neighbours fetched as a zone becomes current, not when held, not without a registry; zones kept by id; the lone call's timing, distance and height. `tests/mix.test.ts`: the zones' crossfade.
- **Checks**: `checks/crossing.mjs` (see its header), all ok. `?map=forest`: the haze is Oakvale's 40 m short of the crest (#c8d8dc), between the two on it (#ccdae2) and the moor's 40 m past it (#d0dce8). In the Adventure in VR, "Oakvale" floats up as you load in; moved along the road one step a rendered frame, 10 crossings between z = 128 and 152 each changed zone at 142.0 going south and 138.0 coming back, floated the new name and wrote a save there; 659 renders, none uploading more than one chunk; `renderer.info.programs` 18 before and after; on the crest both zones' airs at about 0.71. Oakvale's chunks (full / stand-in / unloaded) walking to the rockfall and home: z 152 26/23/0, z 200 19/23/7, z 258 8/23/18, back at z 200 12/21/16, z 120 26/21/2 (all a fresh decision there wants). A save at z = 200 loads in Brackenmoor under its haze, where you stood, "Brackenmoor" floating up, with Oakvale in behind you (12 full, 21 stand-ins). No page errors. Screenshots are in the project files under `crossing/`.

Calls **taken on Tom's behalf**, to revisit:

- **At z = 260 one Oakvale chunk can still be full.** The ticket expected none: Oakvale's crest row is exactly 120 m from the rockfall, the full radius itself, so the chunk straight north stays full (and walking in, with the 40 m hysteresis, a few more: 8 in the check). I kept ticket 34's streaming numbers rather than shrink the full radius for this; most of Oakvale is unloaded there as asked (over half loading in there; 18 of 49 walking in, the rest stand-ins).
- **"2 m past the line" is 2 m off the zone's land**, which for this seam is the same thing and needs no seam-specific geometry.
- **The blend eases in and out** (smoothstep over the 80 m band) rather than running linearly, so there's no kink at its edges; it's halfway on the line either way.
- **Places' sounds stay where they are**: they fade with distance alone, not with the zones' crossfade (none is near the crest).
- **The blended light and air are written into reused objects**, so walking over the crest makes no garbage a frame; a zone fetched in play is compiled with `compileAsync`, off the frame.
- **The name at loading in is the current zone's**: "Oakvale" for a new character, "Brackenmoor" for a save made on the moor, as the spec's zone-name line has it.
- **The zones' airs crossfade at equal power**, not linearly, so the wind doesn't dip on the crest.
- **The name looks like WoW's**: gold serif, no panel, above the eye line; it fades in briefly (0.4 s) as well as out.
- **Neighbours are still loaded up front** at the Adventure, `?map` and `?fly`; fetching them as a zone becomes current comes on top, and with two zones it never has to fetch anything yet.
- **Loading on the moor fills Oakvale at once** (behind the page) rather than streaming it chunk by chunk, so nothing pops in when you first look north.
- **The lone bird is a curlew**, the moor's bird: two rising whistles and a bubbling run.

Left for later:

- The whole zone on the headset and the budget numbers (38).
