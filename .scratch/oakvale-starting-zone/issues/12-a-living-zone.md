# A living zone

Type: grilling
Status: open
Blocked by: 11

## Question

What makes Oakvale feel lived in beyond its quests and enemies?

- **Sound:** what plays where. Birds and wind in the woods, the stream and the pond, the smithy's hammer, the inn's fire and chatter, the mine's drips; and whether sound changes as you step indoors. Every sound in the game today is synthesised in code (`src/fx/sfx.ts`), with no audio files.
- **Villagers:** what the people [Friendly characters](11-friendly-characters.md) adds do. Standing at a spot with an idle loop, or walking a short round (the smith at the anvil, the innkeeper behind the bar, a farmer at the village edge), and whether any speak a line when you pass.
- **Time of day:** Oakvale is lit as a fixed late afternoon. Keep it, or let the sun move through a day and night, given the fixed light rig and the pool of 4 point lights from the research on joining zones.
- What fits the triangle and draw-call budget, since every villager costs about what an enemy does.

## Comments

**2026-09-28:** graduated from the map's "A living zone" fog once [The quest chain](01-the-quest-chain.md) and [Interiors](08-interiors.md) were resolved. The open interiors are the inn and the house by the well, and the smithy is walk-in; each has a spot a villager could fill.
