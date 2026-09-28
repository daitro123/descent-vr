# 24: The house by the well and the smithy

**What to build:** The house by the well opens as the inn does: one warm room with a hearth and a hanging pot, a bed, a table with a candle, and nobody home. The smithy becomes walk-in under its roof, so you can stand at the forge and the anvil.

**Spec:** Implementation Decisions › Interiors (the house, the smithy). User stories 107, 112 and 113 (the house and the smithy).

**Blocked by:** 23 (The inn).

**Status:** ready-for-agent

- [ ] The house that opens is the slate-roofed house facing the crossroads, with the lantern at its door. It gains a real doorway with steps, and the Interiors switch works at its door as at the inn's.
- [ ] The room, about 6 × 5 m and open to the rafters: a hearth with a hanging pot in the back corner under the chimney, a bed, a table with two chairs and a candle, a chest, a shelf of crocks, a rug and a broom. Its flames are the hearth and the candle. The attic is out of reach.
- [ ] The smithy is walk-in under its roof with no switch, since it's open-fronted and lit by the sun. Its solid footprint becomes colliders for the back wall, the low side wall, the forge, the anvil, a barrel and the grindstone.
- [ ] A save inside the house loads inside it.
- [ ] Tests: the World's floor and walls inside the house's footprint are the house's; the no-pockets flood fill passes over the room and under the smithy's roof for every body radius.
- [ ] Checked in headless Chromium: screenshots of the room from the door and from inside, for the thread's reply.
- [ ] Every new number is in the game's table of tunables.
