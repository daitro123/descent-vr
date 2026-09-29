# 30: Oakvale's ambience and places' sounds

**What to build:** Oakvale sounds alive. A light wind and birdsong come from the trees around you, with fewer calls over the open fields. Walk towards the stream and you hear it under the bridge; the windmill creaks, the smith's hammer rings in time with the smith, the forge roars, the inn's hearth crackles, the lumber camp's fire burns, and a cold draught blows at the mine's mouth. There's still no music.

**Spec:** Implementation Decisions › Sound (every sound by name, Oakvale's ambience, places' sounds). User stories 128, 131 and 135.

**Blocked by:** 29 (Villagers at work).

**Status:** done

- [x] Every sound is played by one name, so any one can later become a recording without touching where it plays. All stay synthesised, with no audio files. No music; the existing stings stay.
- [x] Oakvale's ambience isn't placed in space: a light wind, and birdsong of a few different calls, each now and then from a spot 10 to 30 m away in the trees, fewer where the plan has few trees.
- [x] Places' sounds are placed where they are: the stream under the bridge, water at the pond's dock, the windmill's creak, the smith's hammer (struck by the smith's animation) and the forge's roar, the inn's hearth, the lumber camp's fire, and a cold draught and drips at the mine's mouth. A place's sound stops beyond about 40 m.
- [x] At most 8 ambient sounds (places' sounds and bird calls) play at once, nearest first. The nearest 3 places' sounds use HRTF as combat's sounds do; farther ones and the birds pan cheaply.
- [x] Tests: choosing which ambient sounds play and which get HRTF, from your position, is a pure rule with its own test (8 at most, nearest first, 3 with HRTF, none beyond 40 m).
- [x] Checked in headless Chromium: walking from the crossroads to the bridge never has more than 8 ambient sources playing at once.
- [x] Every new number is in the game's table of tunables.

## Built

Built on 2026-09-29 by Claude, in autonomous mode (Tom asked for the rest of Oakvale to run without his input).

- **Every sound by one name** (`src/fx/sfx.ts`, `src/fx/loops.ts`): the one-shots are `sfx.<name>` as before, now joined by `hammer`, `creak`, `drip`, `crackle` and the birds' `trill`, `whistle`, `chirps` and `coo`; the sounds that go on are `startLoop('<name>', …)`: the arena's `drone` (moved here from `startAmbience`, which still plays it), and Oakvale's `wind`, `stream`, `lapping`, `forge`, `hearth`, `campfire` and `draught`. Where a sound plays names it and nothing else, so any one can become a recording by changing its entry. All synthesised from filtered noise and oscillators; no audio files, no music, and every existing sting unchanged. A one-shot can now play into a node as well as at a point (`Where`), which is how a place's voice carries its one-shots. The shared noise is 4 s long, so a loop of it doesn't audibly repeat. Each loop comes out about as loud as the arena's drone (RMS about 0.05, measured by rendering each offline in headless Chromium).
- **The places** (`Zone.sounds`, `PlaceSound`, placed in `layout.ts` `placeSounds`): the stream at the water under the bridge's middle, the pond's water just off the dock's end, the windmill's creak at its sails' hub, the smithy's forge and anvil (two places), the inn's hearth (its first flame, tagged `interior: 'inn'` for ticket 31), the lumber camp's fire, and the mine's draught and drips just inside its mouth. What each plays is one table in `src/fx/ambience.ts` (`PLACES`): a loop, one-shots now and then, or what its work strikes.
- **The smith's hammer** rings on the anvil on `Villagers.onStrike`, one strike per blow of their work, heard while the anvil's place is sounding.
- **The wind** isn't placed: a band of noise to each side, gusting slowly and out of step, always playing once audio is unlocked. It isn't one of the 8.
- **Birdsong** (`BirdSong`, pure, in `src/world/ambience.ts`): every 0.8 to 2.6 s it tries a spot at random, 10 to 30 m from you; a bird calls from the nearest tree within 4 m of it (and 10 to 30 m from you), perched 60 to 95% of the way up, with one of four calls. Over the open fields most tries find no tree, so fewer birds call: the test counts under 60% of the woods' calls by the farm's wheat field. The trees are the plan's (`Zone.trees`, a `TreeCover` grid).
- **Which play** (`chooseAmbient`, pure): the nearest ambient sounds (places' sounds and bird calls) up to 8, none beyond 40 m on the floor plane; the nearest 3 places' sounds by HRTF, as combat's are; the rest and every bird with the cheap equal-power panner. `Ambience` (`src/fx/ambience.ts`) keeps the Web Audio graph in step each frame: a dropped sound fades out over 0.4 s and holds its slot until it's gone, so the 8 counts those fading too; a new one starts only while a slot is free, nearest first. Each place falls off as 1/distance past its own reference distance and fades out over the last 8 m before 40, so it never cuts off. A place's voice exists only while it plays: its loop is started and stopped with it.
- **Tunables**: `CONFIG.sound` (the 8, 3, 40 m and the fade; the wind; the birds; each place's level, reference distance and one-shots' timing).
- **Tests**: `tests/ambience.test.ts`: the rule (8 at most, nearest first, 3 by HRTF, none beyond 40 m, birds never by HRTF), Oakvale's places (each where it should be; the stream by HRTF on the bridge; the forge, anvil and hearth at the smithy; never more than 8 walking to the bridge), and the birds (from a tree 10 to 30 m off, fewer over the fields).
- **Checks**: `checks/ambience.mjs` in headless Chromium with the emulator (see its header): the walk from the crossroads to the bridge never has more than 8 ambient sounds playing (6 at most) nor 3 by HRTF; walking back with a bird trying to call every few frames, the cap holds at exactly 8; the hammer rang on all 9 of the smith's blows; each place sounds by it, by HRTF; nothing sounds on the southern road, 50 m from every place. `checks/villagers.mjs` and `checks/adventure.mjs` still pass.

Calls **taken on Tom's behalf**, to revisit:

- **The loops' sound**: the stream is a broad rush over a low burble with a glint on top; the pond laps slowly; the forge roars low and breathes; the hearth and the camp's fire are a soft flame under random crackles; the mine's mouth moans hollow over a low rumble, with drips. The windmill creaks every 2.2 to 5 s; the hammer is a clank and an inharmonic ring. None of it heard on the headset yet: levels are `CONFIG.sound.places`, and the wind is `CONFIG.sound.wind.level`.
- **The birds' four calls** are a finch's trill, a blackbird's whistle, a sparrow's chirps and a wood pigeon's coo, picked at random.
- **The stream sounds only under the bridge**, as the ticket says, not along its length (the lumber camp's stretch of it is silent).
- **The inn's hearth sounds from outside too**, faintly (1/distance from 2.5 m): muffling it through the walls is ticket 31's mix. Birds and the places keep calling while you're in the mine for now, for the same reason.
- **The anvil is a place of its own**, beside the forge, so the hammer comes from the anvil and the roar from the forge; it holds a slot while the forge's does, even between bursts.
- **A place is measured on the floor plane** for the 40 m and nearest-first, not through the air, so the windmill's hub 7 m up counts as where its foot is.
- **HRTF or not can change while a sound plays**, as you walk past a nearer place, rather than a sound keeping how it started.

Left for later:

- The mix: muffling behind a shut door, the mine's own ambience past the bend, the drone at the breach and the dip in a fight (31); the places' `interior` tag is there for it. Brackenmoor's wind and lone call (36). The audio's CPU with 8 playing, on the headset (38).
