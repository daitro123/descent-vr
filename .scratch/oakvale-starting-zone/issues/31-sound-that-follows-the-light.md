# 31: Sound that follows the light

**What to build:** What you hear stays in step with what you see. Step into the inn and the outdoors goes muffled and quiet while the room's fires come up, over the same half-second as the light. Past the mine's bend the outdoor ambience gives way to hollow air, dripping water and creaking timbers, and at the breach into the crypt the old drone rises. While anything fights you, the ambience dips so the enemies' wind-up cues cut through.

**Spec:** Implementation Decisions › Sound (the mine's ambience, the mix follows the light's cues). User stories 130, 132 and 134.

**Blocked by:** 16 (The farm's camp), 26 (The old mine: down to the Warden's hall), 30 (Oakvale's ambience and places' sounds).

**Status:** done

- [x] The mine has its own ambience: hollow air, drips and creaking timbers. The crypt part of the mine plays today's drone, which has left the outdoors; the arena keeps it.
- [x] Behind a shut door the outdoors is muffled and quiet and the room's fires come up, over the same half-second as the Interiors switch's light.
- [x] Past the adit's bend the outdoor ambience fades out and the mine's comes in; at the breach the drone rises.
- [x] While anything fights you (the camps' report), the ambience dips a little.
- [x] Tests: the mix's levels for outside, at the door, inside, in the mine, in the crypt and in a fight are a pure function of those states, with its own test.
- [x] Checked in headless Chromium: the audio graph's gains follow the switch when walking into the inn and down past the breach.
- [x] Every new number is in the game's table of tunables.

## Built

Built on 2026-09-29 by Claude, in autonomous mode (Tom asked for the rest of Oakvale to run without his input).

- **The mix** (`src/world/mix.ts`, pure): `mix(cues, fighting)` gives how loud and how muffled each part of the ambience is: the outdoors (the wind, the birds and the places outside), each building's own sounds (the inn's hearth, by the places' `interior` tag), the mine's hollow air and drips, its timbers, the drone, and the whole of it. The cues are the World's (`World.cues`): each building's door and light from its Interiors switch, the mine's light, and how far on past the breach into the crypt you are along the mine's route (`MineStanding.crypt`, `MINE.breach`). Since the levels follow the switches' own light, the sound moves over exactly the light's half-second in (and its 0.2 s back out), and swaps at once when you arrive some other way (waking by the hearth, loading a save).
- **Behind a shut door** the outdoors drops to 0.3 and is lowpassed at 500 Hz, and the room's fires come up to full and unmuffled. From outside, a room's own sounds come through its walls at 0.3, lowpassed at 400 Hz; with its door open, 60% of the way to how they sound inside. Another building's room stays behind its walls.
- **The mine's own ambience** (`fx/ambience.ts`, started as its light comes up past the bend and stopped a second after it goes out): the `hollow` loop (`fx/loops.ts`: a low, boxy resonance drifting over a deeper rumble, about as loud as the drone, RMS 0.046 against 0.045), and now and then a drip (`sfx.drip`) or a timber's creak (a new one-shot, `sfx.timber`, shorter and higher than the windmill's) from one of four sides. Past the bend the outdoors fades out and all this comes in; once the outdoors is silent, no outdoor place or bird plays at all.
- **The crypt** plays the arena's drone (the same `drone` loop; outdoors it was already only the arena's): it rises from 2 m short of the breach to 6 m past it, while the timbers' creaks fall away and the hollow air drops to half.
- **The fight's dip**: while any camp fights you (`Camps.fighting`) or the Warden is up, the whole ambience dips to 0.6, over 0.3 s, and comes back over 1.5 s. Combat's sounds and the stings go straight to the master, so they're never dipped.
- **Tunables**: `CONFIG.sound.mix` (the levels and cutoffs, the door's share, the crypt's rise, the fight's dip) and `CONFIG.sound.mine` (the air's level, the drips' and creaks' levels and timing, their spread, the drone's level).
- **Tests**: `tests/mix.test.ts` (the levels outside, at the door, inside, in the mine, in the crypt and in a fight, and that each moves one way with the light); `tests/world.test.ts` (the World's cues follow the inn's switch, and the crypt's measure is 0 at the breach and grows down the route).
- **Checks**: `checks/sound-mix.mjs` in headless Chromium with the emulator (see its header): walking into the inn, frame by frame the outdoors' level follows the switch's light, falling over 0.49 s once the door has shut, and the graph's gains settle at 0.3 and 500 Hz outside with the hearth at full; back out, the outdoors is up before the door opens. Walking in by the mine's mouth, the outdoors fades out over 0.49 s past the bend as the mine's air comes in, nothing outside plays, there's no drone in the dig, it rises across the breach (0.16 at it) and is up down the carved passage with the timbers gone; out again, the mine's ambience stops. With the farm's camp on you, the graph's whole ambience sits at 0.6, and is back at 1 once they've gone home. `checks/ambience.mjs`, `inn.mjs`, `mine.mjs` and `adventure.mjs` still pass.

Calls **taken on Tom's behalf**, to revisit:

- **How muffled and how quiet**: the outdoors at 0.3 (about −10 dB) under a 500 Hz lowpass behind a shut door; a room heard from outside at 0.3 under 400 Hz, and an open door letting through 60% of the way. Picked so the inn feels shut in but you still hear the weather, as a WoW inn does. None of it heard on the headset yet: `CONFIG.sound.mix`.
- **The mix rides the switch's light** rather than its own fade, so it can't drift from what you see: in over 0.5 s, back out over 0.2 s (the sun's return).
- **The mine's mouth keeps its draught and drips as a place outside**: heard in the adit, gone with the outdoors past the bend, where the mine's own drips take over.
- **The mine's drips and creaks come from four fixed sides**, not placed in the tunnels, to keep them cheap; they're not among the 8 ambient sounds (nor is the hollow air or the drone).
- **The crypt's drone starts 2 m short of the breach**, where you can see the dressed stone through the hole, and is full 6 m past it; the dressed stone has no timbers to creak, so the creaks fade out as it rises, and the hollow air halves.
- **Deep in the mine nothing outside plays at all**, rather than playing silently; the mine's ambience stops a second after its light goes out (back in the adit or outside).
- **The Warden counts as fighting you** from the moment it rises, as the camps' report does for theirs.
- **The dip is 0.6 (about −4.4 dB)**, in over 0.3 s and out over 1.5 s, and dips everything ambient, the drone included.

Left for later:

- Brackenmoor's wind and lone call, and the crossfade across the seam by position (36 and 37); `mix` takes the zone's cues when there are two. The audio's CPU with 8 playing and the mine's bed, on the headset (38).
