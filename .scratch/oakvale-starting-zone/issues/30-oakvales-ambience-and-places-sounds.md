# 30: Oakvale's ambience and places' sounds

**What to build:** Oakvale sounds alive. A light wind and birdsong come from the trees around you, with fewer calls over the open fields. Walk towards the stream and you hear it under the bridge; the windmill creaks, the smith's hammer rings in time with the smith, the forge roars, the inn's hearth crackles, the lumber camp's fire burns, and a cold draught blows at the mine's mouth. There's still no music.

**Spec:** Implementation Decisions › Sound (every sound by name, Oakvale's ambience, places' sounds). User stories 128, 131 and 135.

**Blocked by:** 29 (Villagers at work).

**Status:** ready-for-agent

- [ ] Every sound is played by one name, so any one can later become a recording without touching where it plays. All stay synthesised, with no audio files. No music; the existing stings stay.
- [ ] Oakvale's ambience isn't placed in space: a light wind, and birdsong of a few different calls, each now and then from a spot 10 to 30 m away in the trees, fewer where the plan has few trees.
- [ ] Places' sounds are placed where they are: the stream under the bridge, water at the pond's dock, the windmill's creak, the smith's hammer (struck by the smith's animation) and the forge's roar, the inn's hearth, the lumber camp's fire, and a cold draught and drips at the mine's mouth. A place's sound stops beyond about 40 m.
- [ ] At most 8 ambient sounds (places' sounds and bird calls) play at once, nearest first. The nearest 3 places' sounds use HRTF as combat's sounds do; farther ones and the birds pan cheaply.
- [ ] Tests: choosing which ambient sounds play and which get HRTF, from your position, is a pure rule with its own test (8 at most, nearest first, 3 with HRTF, none beyond 40 m).
- [ ] Checked in headless Chromium: walking from the crossroads to the bridge never has more than 8 ambient sources playing at once.
- [ ] Every new number is in the game's table of tunables.
