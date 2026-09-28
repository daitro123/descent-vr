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

## Not yet specified

- **Getting around:** whether walking a 168 m zone with the stick is enough, or it needs a sprint, a map or markers to find your way. The quest chain walks you out and back three times between the marshal and the farm, the lumber camp and the mine: 60 to 90 m by road each way, 30 to 40 s at 2.2 m/s. The quest tracker names what's left to do but not which way to go.
- **A living zone:** ambient sound, villagers going about their day, time of day. Sharpens once the quests and interiors are known.
- **Triangle budget:** Oakvale seen from the village is already about 250k to 300k triangles over both eyes, the rule-of-thumb limit, before interiors, NPCs and enemies are added. How to cut (chunk stand-ins, fewer trees) waits on a measurement on the headset. An enemy costs about 2k triangles and 4 draw calls.
- **Assembling the spec:** once the decisions are in, write the Oakvale spec and break it into build tickets.

## Out of scope

- Online play: servers, accounts and netcode. It is the long-term vision, and a separate effort.
- Voiced dialogue.
- Four-legged creatures (wolves, boars). They need a new rig.
- Fleshing out the second zone with quests, enemies or landmarks.
- Changing how combat feels. Tweaks come later, outside this map.
- A complete overhaul of talking and quest tracking. Tom plans it for after Oakvale is specced and built, so this map settles only a plain first pass.
