# A living zone

Type: grilling
Status: claimed
Blocked by: 11

## Question

What makes Oakvale feel lived in beyond its quests and enemies?

- **Sound:** what plays where. Birds and wind in the woods, the stream and the pond, the smithy's hammer, the inn's fire and chatter, the mine's drips; and whether sound changes as you step indoors. Every sound in the game today is synthesised in code (`src/fx/sfx.ts`), with no audio files.
- **Villagers:** what the people [Friendly characters](11-friendly-characters.md) adds do. Standing at a spot with an idle loop, or walking a short round (the smith at the anvil, the innkeeper behind the bar, a farmer at the village edge), and whether any speak a line when you pass.
- **Time of day:** Oakvale is lit as a fixed late afternoon. Keep it, or let the sun move through a day and night, given the fixed light rig and the pool of 4 point lights from the research on joining zones.
- What fits the triangle and draw-call budget, since every villager costs about what an enemy does.

## Comments

**2026-09-28:** graduated from the map's "A living zone" fog once [The quest chain](01-the-quest-chain.md) and [Interiors](08-interiors.md) were resolved. The open interiors are the inn and the house by the well, and the smithy is walk-in; each has a spot a villager could fill.

**2026-09-28:** [The mine inside](09-the-mine-inside.md) is resolved (by Claude on Tom's behalf). The mine has three parts with their own feel: the timbered old mine with its rails and lanterns, the bandits' rough dig, and the ancient crypt at the bottom. Past the adit's bend the sun fades and the outdoors is hidden, as indoors, so that's the place for the sound to change too. Nobody friendly lives in the mine.

**2026-09-28:** [The second zone and the seam](10-the-second-zone-and-the-seam.md) is resolved (by Claude on Tom's behalf). Over the southern pass lies Brackenmoor, an open, empty moor with no people, under the same late-afternoon sun. Its light blends with Oakvale's across 40 m either side of the pass's crest. If sound changes by place, the crest is where the woods' birds would give way to the moor's wind. A day and night cycle would have to run on both zones at once, since they share one sun.

**2026-09-28:** [Friendly characters](11-friendly-characters.md) is resolved (by Claude on Tom's behalf). Oakvale has three villagers besides Marshal Hale: the innkeeper behind the inn's bar, the smith at the anvil under the smithy's roof, and the farm's farmer, driven out by the bandits, standing by the well at the crossroads. The house by the well is empty. None gives quests; each so far just stands, and Hale waves as you walk up. Their idle loops, any rounds, and whether they speak a line as you pass are this ticket's. A human costs 630 to 900 triangles and one draw call, fewer than a skeleton.
