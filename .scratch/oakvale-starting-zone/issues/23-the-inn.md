# 23: The inn

**What to build:** The Golden Tankard opens. Its door swings open as you walk up, and you see the hearth already lit through the doorway. Step in and the door shuts behind you; over half a second the sun fades, the room's flames light you and the outdoors is hidden. Walk back to the door and the daylight returns before you can see out. Dying now wakes you by the inn's hearth, and a save made inside loads inside with the door shut and the room lit. This ticket builds the **Interiors switch** the house and the mine reuse.

**Spec:** Implementation Decisions › Interiors, The world (the light pool). User stories 7, 89 and 107–114 (the inn).

**Blocked by:** 16 (The farm's camp), 19 (Saving).

**Status:** ready-for-agent

- [ ] An **interior** is a model built with its zone and hidden until needed, its ground inside its footprint (floor heights, walls, and props as colliders), its flames (the ones the light pool may sit on; the rest are glows), its atmosphere, and its entrance.
- [ ] The Interiors switch is one small state machine, pure and tested: _outside_; _at the door_ (door open, room visible and lit by its flames, outdoor light); _inside_ (door shut behind you: over about 0.5 s the sun fades, the sky light drops to the interior's fill, fog closes in, the pool moves onto its flames and the outdoors is hidden); and back, with the sun up again just before you can see out.
- [ ] Doors open when you're within about 2 m of them from either side, stay open while you stand in the doorway, and shut once you're about 1.5 m past. No button and no fade.
- [ ] The pool of 4 point lights moves onto the 4 nearest flames, flickers by intensity and fades over the swap. The count never changes, so no shader recompiles.
- [ ] The inn's outside keeps its look but gains a real doorway, with steps up to a floor at the top of its 0.3 m foundation. The interior's walls stand just inside the outer walls; the single-sided shared material hides the outer walls from inside. The windows are panes that glow with daylight and can't be seen through.
- [ ] The taproom, about 10 × 7 m and 2.9 m high: a big hearth under the larger chimney, a bar along the back wall with barrels and shelves of bottles and tankards, four tables with benches, and a small fireplace under the other chimney. Its flames are the hearth, a lantern over the bar and a lantern over each of two tables. The innkeeper's spot behind the bar stays empty until ticket 29. The upper floor is out of reach, with no stair.
- [ ] The World's `Ground` inside the footprint is the inn's. No enemy ever comes indoors.
- [ ] The village respawn point moves to the hearth: you wake inside with the door shut.
- [ ] The save records the interior you're in; loading inside the inn puts you there with the door shut and the room lit.
- [ ] Tests: the switch's states; the hearth's respawn point is clear; the World's floor and walls inside the footprint are the inn's; the arena's no-pockets flood fill passes over the taproom for every body radius; a save round-trips with the inn as its interior.
- [ ] Checked in headless Chromium: walking in and out swaps the light without changing `renderer.info.programs.length`; the interior costs a few thousand triangles and one draw call plus its glows.
- [ ] Every new number is in the game's table of tunables.
