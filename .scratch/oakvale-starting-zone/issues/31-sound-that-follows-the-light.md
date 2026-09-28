# 31: Sound that follows the light

**What to build:** What you hear stays in step with what you see. Step into the inn and the outdoors goes muffled and quiet while the room's fires come up, over the same half-second as the light. Past the mine's bend the outdoor ambience gives way to hollow air, dripping water and creaking timbers, and at the breach into the crypt the old drone rises. While anything fights you, the ambience dips so the enemies' wind-up cues cut through.

**Spec:** Implementation Decisions › Sound (the mine's ambience, the mix follows the light's cues). User stories 130, 132 and 134.

**Blocked by:** 16 (The farm's camp), 26 (The old mine: down to the Warden's hall), 30 (Oakvale's ambience and places' sounds).

**Status:** ready-for-agent

- [ ] The mine has its own ambience: hollow air, drips and creaking timbers. The crypt part of the mine plays today's drone, which has left the outdoors; the arena keeps it.
- [ ] Behind a shut door the outdoors is muffled and quiet and the room's fires come up, over the same half-second as the Interiors switch's light.
- [ ] Past the adit's bend the outdoor ambience fades out and the mine's comes in; at the breach the drone rises.
- [ ] While anything fights you (the camps' report), the ambience dips a little.
- [ ] Tests: the mix's levels for outside, at the door, inside, in the mine, in the crypt and in a fight are a pure function of those states, with its own test.
- [ ] Checked in headless Chromium: the audio graph's gains follow the switch when walking into the inn and down past the breach.
- [ ] Every new number is in the game's table of tunables.
