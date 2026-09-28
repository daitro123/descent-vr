# Interiors

Type: grilling
Status: resolved
Blocked by: 01, 04

## Question

Which buildings can be entered, and how does going inside work? The candidates are the inn, three houses, the smithy, the farmhouse, the barn and the watchtower.

- Which ones open, and which stay shut. None is needed for the quests, since the quest giver stands outdoors (see The quest chain), so an interior earns its place by making the zone feel lived in.
- Walking straight through the door with the inside always there, or streamed in as you come near (see the research on joining zones).
- What is inside each one that opens, and how it fits the 4-light budget.
- How each inside fits its outside, since today's models are closed boxes.

## Answer

Settled over three rounds on 2026-09-28 **by Claude on Tom's behalf**: Tom asked for the rest of the map to be settled without him, so every recommendation below was taken without his answer. The rounds and the reasons are under Comments, for him to revisit. The numbers are starting points, to tune on the headset.

- **Two buildings open, both in the village:** the inn and the house by the well (the slate-roofed one facing the crossroads, with the lantern at its door). The smithy, already an open-fronted lean-to, becomes walk-in: you can step under its roof up to the forge and the anvil. The other two houses, the farmhouse, the barn and the watchtower stay shut.
- **Going in:** walk up to the door and it swings inward; walk through and it swings shut behind you. No fade, no loading, no button. It opens again as you walk up to it from inside, and stays open while anyone stands in the doorway.
- **Always there:** each interior is built with the zone when Oakvale loads and is hidden until its door opens. Nothing streams in; the research on joining zones already says small buildings can skip the streamer.
- **Ground floors only.** The inn's upper floor and the house's attic stay out of reach, with no stair that leads nowhere.
- **Safe inside:** enemies never go indoors. Every open building is in the village, which no camp's 30 m leash reaches, so this only guards against a stray chase.
- **Light:** while you're outside, you see in through the open door with the room's own flames already lit. Once the door shuts behind you, the sun fades out and the sky light drops to a low warm fill over about half a second, and the pool of 4 point lights moves onto the room's flames, flickering by intensity. The windows glow as panes of daylight and can't be seen through. While the door is shut with you inside, the outdoors (terrain, trees, sky, water) is hidden. Walking back to the door brings the sun back up just before it opens.
- **The inn** (the Golden Tankard, a placeholder name after the gold tankard on its sign) is one taproom filling its stone ground floor, about 10 × 7 m and 2.9 m high. A big hearth under the larger chimney, a bar along the back wall with barrels, shelves of bottles and tankards, four tables with benches, and a small fireplace under the other chimney. Lights: the hearth, a lantern over the bar, and one over each of two tables; every other candle is a glow. The bar leaves room for an innkeeper, whom [Friendly characters](11-friendly-characters.md) may add.
- **The house** is one room, about 6 × 5 m, open to the rafters. A hearth with a hanging pot in the back corner under the chimney, a bed, a table with two chairs and a candle, a chest, a shelf of crocks, a rug and a broom. Lights: the hearth and the candle. It's a villager's home; Friendly characters decides whether anyone is in.
- **Inside fits outside:** the outside model stays as it is, except that the open buildings get a real doorway where the door is today. The interior is its own model, walls set just inside the outer walls so both share one footprint, with its floor at the top of the foundation (0.3 m) and the steps outside the door. The outside walls face outward and so vanish from inside. Inside a building's footprint, floor height and walls come from the interior.
- **The village respawn point is the inn's hearth:** after a death outside the mine you wake by the fire, inside with the door shut, and walk out. A new character still starts by Marshal Hale outdoors.
- **Scenery only:** nothing indoors can be picked up, sat on or used this pass. Healing inside is the same regeneration as anywhere.
- **Saving inside:** a save made indoors loads you indoors with the door shut and the room's lighting on.
- **Budget:** an interior is a few thousand triangles and one draw call, plus its glows. With the door shut and the outdoors hidden, a room costs far less than the street outside it.

## Comments

**2026-09-28:** [The quest chain](01-the-quest-chain.md) is resolved. Marshal Hale stands outdoors at the crossroads, and the only indoor-ish objective is the bandit leader's tent at the lumber camp, which is a tent, not a building. The first bullet is updated to match.

**2026-09-28, round 1 (taken on Tom's behalf, without his answer):**

- Which buildings open: the inn and one house, the one by the well, which already reads as lived in (a lit lantern at the door, a warm window). The inn is where a WoW-style village gathers; one home shows people live here. The smithy is already open-fronted, so it only needs its solid footprint replaced with walls you can walk up to. The other houses stay shut, since a second and third room of the same kind add build work for little new. The farmhouse and the barn stand in the farm's bandit camp, and a fight through a doorway needs pathing the no-navmesh steering doesn't have. The watchtower's climb would be a fine view over the valley, but a spiral stair with stick locomotion risks comfort, and the lookout would have to follow you up it; it can come back later as its own idea.
- Going in: the door swings open as you walk up and shuts behind you. A door that stays open would show the outdoors from inside, which keeps the whole zone drawing while you're in and fights the lighting (below). Pushing it by hand was ruled out because both hands hold the sword and the shield.
- Always there, hidden until the door opens, not streamed: a room this size costs a few thousand triangles, and the research on joining zones already names this for small buildings.
- Ground floors only: stairs with stick locomotion are the least comfortable thing to walk in VR, and an upper floor doubles the build for the same feeling.
- Enemies never go indoors: every open building is in the safe village, so this costs nothing and rules out enemies stuck in doorways.

**2026-09-28, round 2 (taken on Tom's behalf, without his answer):**

- Light: there are no shadow maps, so the sun lights every indoor surface that faces it. The sun and sky therefore fade once the door is shut, when you can no longer see out, and the pool of 4 point lights (from the research's world light rig) moves onto the room's flames. The count of lights never changes, so no shaders recompile. The outdoors is hidden while the door is shut, which also takes the view from the village (the zone's heaviest, about 250k to 300k triangles) off the frame.
- The inn's taproom and the house's one room, as in the Answer. The hearths go under the existing chimneys so outside and inside agree. The bar leaves an innkeeper's spot, and the house could hold a villager, both for [Friendly characters](11-friendly-characters.md) to decide.
- Inside fits outside: keep today's outside models and add an interior model inset into the same footprint, rather than rebuilding each building as walls with thickness. The only change outside is a real doorway in the open buildings. The shared material is single-sided, so the outside walls can't be seen from inside.
- The smithy collides with its back wall, the low side wall, the forge, the anvil, the barrel and the grindstone instead of its whole footprint.

**2026-09-28, round 3 (taken on Tom's behalf, without his answer):**

- The village respawn point moves to the inn's hearth, as a WoW inn is where you wake. It gives the inn a use without a quest, and waking by a fire after a death reads better than waking on the road. This narrows [Progression, death and saving](03-progression-death-and-saving.md)'s "in the village"; the respawn point by the mine is unchanged.
- Nothing to pick up, sit on or use indoors this pass. Loose props you can pick up by hand would suit VR, but they need physics the game doesn't have yet; a later pass can add them.
- A save made indoors loads you indoors with the door shut and the room lit.
- Budget: each interior stays within a few thousand triangles and one draw call, plus its glows, checked on the headset with the rest of the zone.
