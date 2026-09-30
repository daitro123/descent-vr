# Map: Oakvale, the starting zone

Label: wayfinder:map

## Destination

A written **spec for Oakvale as a playable, single-player starting zone**, ready to hand off as build tickets: building and mine interiors, a quest giver with a couple of quests, and enemies that fit the zone. It also covers a **small, bare second zone** joined to Oakvale without a loading screen, which proves the seamless crossing and the loading. The long-term vision is a WoW-style world of many joined zones; this map only has to make Oakvale ready for it.

## Notes

- **Domain:** a browser VR action RPG (Three.js + WebXR). Oakvale is the outdoor forest map in `src/maps/forest/` (`?map=forest` to walk it, `?fly=forest` to fly through it), inspired by WoW's Elwynn Forest. The glossary is `CONTEXT.md`: say **zone**, not "map", for a region of the world.
- **What exists:** a 168 m square play area ringed by mountains. A road runs north from the southern pass through a crossroads village (inn, three houses, smithy), over a stone bridge to the old mine in the northern ridge. Side roads lead to a farm, a pond, a lumber camp and a watchtower. No building can be entered yet. Walk mode has no enemies.
- **Combat** is a viable prototype (Tom, 2026-09-28) and is not reopened here. Enemies, though, were built for a flat arena with waves (`ctx.arena`, `CONFIG.arena`), so putting them in a zone is in scope.
- **Hardware and testing:** Tom tests alone on his Quest 3. The live site is `main` on GitHub Pages. The performance budget is `docs/quest-3-browser-performance-budget.md`: 72 fps, about 300 draw calls, at most 4 point lights.
- **Skills:** grilling tickets call `grilling` and `domain-modeling`. Prototype tickets call `prototype`. Research tickets call `research`, with findings in `.scratch/oakvale-starting-zone/research/`.
- **Standing preferences** (from charting, 2026-09-28):
  - Single-player. The WoW-style world is the model, not online play.
  - Light progression: quests pay XP and an item, and Oakvale covers the first few levels.
  - Progress and the character are saved in the browser.
  - NPC dialogue is text only.
  - Humanoid enemies only, on the existing humanoid rig.
  - The second zone stays small and bare: just enough terrain to cross the seam and watch the loading.

## Decisions so far

<!-- one line per resolved ticket: [title](link): gist -->

- [The quest chain](issues/01-the-quest-chain.md): Marshal Hale, outdoors at the crossroads, gives a chain of three: defeat bandits at the farm, clear the lumber camp and take the leader's orders by hand, then go down the old mine and defeat whatever woke the dead. Hand in at the marshal; every quest pays XP, the last also pays the item. The zone is open, and the marshal points you south once the chain is done.
- [Saving in the Quest browser](issues/05-saving-in-the-quest-browser.md): IndexedDB, one `descent-vr` record written with strict durability, versioned with migrations. Survives deploys and browser updates; lost only if site data is cleared or a full headset evicts it.
- [Joining zones without a loading screen](issues/04-joining-zones-without-a-loading-screen.md): feasible. Build zones in a worker in 40 m chunks, upload one chunk per frame before it's seen, keep lights, sky and fog at world level so no shader recompiles, and stream by chunk distance. The seam is a line with a 40 m blend, best in a pass. Triangles, not draw calls, are the tight limit.
- [The zone's enemies](issues/02-the-zones-enemies.md): bandits outside (thugs, archers and a brute-behaviour leader at the lumber camp, plus a lookout at the watchtower) and today's skeletons in the mine, with no new behaviours. Each place adds one new test and a higher enemy level. The Warden is the one boss and rises only during the last quest; every camp refills, and no names or levels show over heads.
- [Progression, death and saving](issues/03-progression-death-and-saving.md): levels 1 to 5, each adding 20 health and 20% damage to you and enemies alike, with the War Cry at 2 and the slam at 3. XP comes from quests and kills; enemy levels climb from the farm (1) to the Warden (5). The last quest pays Hale's longsword, and enemies drop only healing orbs. Death wakes you in the village or outside the mine with nothing lost. The save holds level, XP, sword, quests and position; new characters start by the marshal, and the arena moves to `?arena`.
- [Talking to NPCs and tracking quests in VR](issues/06-talking-to-npcs-and-tracking-quests.md): walk up to Marshal Hale and a board unfolds beside them; press its buttons with a fist or the sword's tip. A gold "!" or "?" floats over Hale, and your quest floats at the top left of your view with its counts. No menu. A first pass: Tom plans a full UI overhaul once Oakvale is built.
- [Enemies in the open](issues/07-enemies-in-the-open.md): WoW-style pulls. Each enemy notices you at 8 m and brings anyone within 10 m, chases at your walking pace, and walks home untouchable to heal 30 m from its post. The lumber camp is 5 spread round its clearing, with two thugs patrolling its road. Camp enemies have 40% more health and damage than today, three may swing at once, and a cleared camp refills after 3 minutes once you're 30 m off. No navmesh.
- [Interiors](issues/08-interiors.md): the inn and the house by the well open, and the smithy becomes walk-in; everything else stays shut. The door swings open as you walk up and shuts behind you, with the room built in from the start. Once it shuts, the sun fades, the pool of 4 lights moves to the room's flames and the outdoors is hidden. Ground floors only, no enemies indoors, and the village respawn point is the inn's hearth. Settled by Claude on Tom's behalf.
- [The mine inside](issues/09-the-mine-inside.md): one route with no forks, about 100 m and 7 m down: the timbered old mine, the bandits' rough dig, then a breach into an ancient crypt whose last room is today's crypt hall with the Warden's throne. Five level-3 grunts and archers in the upper chambers, a level-4 brute alone in each of the two deep rooms, then the Warden, which lands level 4 at the first brute and level 5 at the hand-in. Rock blocks noticing, enemies out of sight follow the tunnel's centre line, the undead never leave the mine, and it refills only after you've left. Part of Oakvale, with the Interiors switch at the adit's bend and the pool of 4 lights on lanterns. Settled by Claude on Tom's behalf.
- [The second zone and the seam](issues/10-the-second-zone-and-the-seam.md): Brackenmoor, a bare moor of bracken and heather over the southern pass, about a third of Oakvale with some 120 m to walk. The seam is the pass's crest on the chunk grid, and the pass opens as a corridor along the road from the start. From the upper pass the moor's far hills show in haze; at the crest the moor opens below. The land changes, a border stone stands on the crest, the light blends over 40 m each side, and the zone's name floats up as you cross. The road ends at a rockfall, the way on to a later zone. Nothing lives there; walking it end to end takes Oakvale's chunks from full detail to unloaded and back. Settled by Claude on Tom's behalf.
- [Friendly characters](issues/11-friendly-characters.md): one human body on today's rig, dressed per character. Marshal Hale is bareheaded and grey, in mail under a blue tabard with gold, their old longsword at the hip. Bandits wear a red kerchief over the face and a red sash: thugs in leather with a sword or a hatchet, archers in the green hood, and a big leader in a long red coat and fur with a felling axe. An innkeeper, a smith and the farmer the bandits drove out stand at the inn's bar, the anvil and the well. A human costs 630 to 900 triangles, fewer than a skeleton. Settled by Claude on Tom's behalf.
- [A living zone](issues/12-a-living-zone.md): a fixed late afternoon, no day and night. Sound stays synthesised, with no music: each zone has its ambience (Oakvale's wind and birds, Brackenmoor's wind, the mine's drips, the crypt's drone) and places sound as you near them (the stream, the windmill, the smith's hammer, the inn's hearth). The outdoors goes muffled indoors, fades past the mine's bend and crossfades at the seam. Villagers work at their spots, turn their heads to you and bark a line of text that follows the quest chain. Smoke rises from the village's chimneys; birds are heard, not seen. Settled by Claude on Tom's behalf.
- [Getting around](issues/13-getting-around.md): walking stays at 2.2 m/s, and clicking the left stick runs at 3.5 m/s, forward only, with the edges of the view darkening a little. You can't run in a fight, and a pull ends your run, so the camps' chase and leash work as tuned. A gold quest arrow on the tracker points to the objective's place as the crow flies, hiding at the place, indoors and in the mine. The signposts name their roads, with a second one where the watchtower and lumber camp roads branch, and a painted map of Oakvale stands at the crossroads. No map you carry, minimap, compass or markers in the world. Settled by Claude on Tom's behalf.

## Not yet specified

- **Triangle budget:** Oakvale seen from the village is already about 250k to 300k triangles over both eyes, the rule-of-thumb limit, before NPCs and enemies are added. Interiors and the mine cost little: a few thousand triangles per room, and the outdoors is hidden while you're inside with the door shut or past the mine's first bend. The crest of the southern pass looking north over Oakvale is a new view to measure, with both zones loaded; Brackenmoor itself is bare and cheap. How to cut (chunk stand-ins, fewer trees) waits on a measurement on the headset. A character costs one draw call per eye: a human 630 to 900 triangles, a skeleton grunt about 1,050, the Warden 1,300. The four friendly characters add about 2,800, of which Hale, the smith and the farmer (about 2,100) are in view from the crossroads. A living zone adds chimney smoke (one draw call, about 120 triangles) and bark panels (one draw call each while shown), and its sounds cost CPU, to measure on the headset alongside. Getting around adds a handful of draw calls and a few hundred triangles: the quest arrow, the run's vignette (while you run), the map board and the signposts' names. The spec carries this into its Performance section, with the order of cuts to make if the headset measures too many; the measurement itself waits on the headset.
- **Assembling the spec:** done. The spec is [spec.md](spec.md), written on 2026-09-28 by Claude on Tom's behalf from every decision above; the calls it made beyond the tickets are listed in its Further Notes. It was broken into build tickets on 2026-09-28: see Build tickets below.

## Build tickets

Written on 2026-09-28 from [spec.md](spec.md) with `/to-tickets`, **by Claude on Tom's behalf**. They are numbered on from the map's thirteen tickets in the same `issues/` folder, and built one at a time in number order: each lists the tickets that genuinely block it, and every blocker has a lower number, so the first open ticket whose blockers are all done is always the next one. Each ticket's `Status:` line says where it stands.

1. [14: The World: shared light, sky, fog and ground](issues/14-the-world-shared-light-sky-fog-and-ground.md)
2. [15: The Adventure at the plain URL, the arena at `?arena`](issues/15-the-adventure-at-the-plain-url-and-the-arena-at-arena.md)
3. [16: The farm's camp](issues/16-the-farms-camp.md)
4. [17: Levels and XP](issues/17-levels-and-xp.md)
5. [18: Marshal Hale and Raiders in the Fields](issues/18-marshal-hale-and-raiders-in-the-fields.md)
6. [19: Saving](issues/19-saving.md)
7. [20: The human body](issues/20-the-human-body.md)
8. [21: The Lumber Camp](issues/21-the-lumber-camp.md)
9. [22: The patrol and the watchtower](issues/22-the-patrol-and-the-watchtower.md)
10. [23: The inn](issues/23-the-inn.md)
11. [24: The house by the well and the smithy](issues/24-the-house-by-the-well-and-the-smithy.md)
12. [25: The old mine: the mouth to the gallery](issues/25-the-old-mine-mouth-to-gallery.md)
13. [26: The old mine: down to the Warden's hall](issues/26-the-old-mine-down-to-the-wardens-hall.md)
14. [27: The mine's undead](issues/27-the-mines-undead.md)
15. [28: The Warden and What Lies Below](issues/28-the-warden-and-what-lies-below.md)
16. [29: Villagers at work](issues/29-villagers-at-work.md)
17. [30: Oakvale's ambience and places' sounds](issues/30-oakvales-ambience-and-places-sounds.md)
18. [31: Sound that follows the light](issues/31-sound-that-follows-the-light.md)
19. [32: Finding the way](issues/32-finding-the-way.md)
20. [33: The run](issues/33-the-run.md)
21. [34: Oakvale in streamed chunks](issues/34-oakvale-in-streamed-chunks.md)
22. [35: Building chunks in a worker](issues/35-building-chunks-in-a-worker.md)
23. [36: The pass and Brackenmoor's land](issues/36-the-pass-and-brackenmoors-land.md)
24. [37: Crossing the seam](issues/37-crossing-the-seam.md)
25. [38: The whole zone in one sitting](issues/38-the-whole-zone-in-one-sitting.md)
26. [39: The triangle budget in the woods](issues/39-the-triangle-budget-in-the-woods.md) (found by 38; waits on the headset)

`/to-tickets` would have asked Tom whether the granularity, the blocking edges and the splits were right. These were answered **on Tom's behalf**, for him to revisit:

- **Granularity:** 25 tickets, each sized for one thread to build, test and merge. The big pieces are split where a thread would run out of room: the mine into its tunnels (two tickets), its undead and the Warden; sound into places and the mix; streaming into chunks and the worker; the seam into the land and the crossing.
- **Order:** the spec's own: the World and the Adventure/Arena split first, then the first playable slice (the farm's camp, levels, Hale and Raiders in the Fields, saving), then the human body, the lumber camp, the interiors, the mine and the Warden, the living zone, getting around, streaming, Brackenmoor, and a last ticket that plays the whole zone through and measures the budget. Streaming comes before Brackenmoor so the second zone is written in the streamed shape from the start.
- **Stand-ins:** skeletons stand in for bandits and the talk prototype's Hale for the real one until [20: The human body](issues/20-the-human-body.md); the village respawn point stands outside the inn's door until [23: The inn](issues/23-the-inn.md) opens it.
- **The adventure state** takes the whole quest chain as data in ticket 18 and is tested in full there; each place's part of the world arrives with its own ticket, and later tickets add their answers (the orders, the Warden, the sword, the barks, the quest arrow).
- **Smaller calls**, each marked on its ticket: `?duel`, `?wave` and `?showcase` on their own also open the arena; the mine's route ends at fallen rock after the gallery until the rest is dug; the Warden's hall is built by the same code as the arena's.

## Out of scope

- Online play: servers, accounts and netcode. It is the long-term vision, and a separate effort.
- Voiced dialogue.
- Four-legged creatures (wolves, boars). They need a new rig.
- Mounts, flight paths, a map you carry and a minimap: WoW's ways of getting around a world of many zones, for when there are more zones than Oakvale and Brackenmoor (see [Getting around](issues/13-getting-around.md)). Mounts are four-legged anyway.
- Fleshing out the second zone with quests, enemies or landmarks.
- Changing how combat feels. Tweaks come later, outside this map.
- A complete overhaul of talking and quest tracking. Tom plans it for after Oakvale is specced and built, so this map settles only a plain first pass.
