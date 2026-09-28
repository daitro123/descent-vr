# 32: Finding the way

**What to build:** Oakvale shows you the way. A small gold quest arrow beside the objective you're working on points towards its place as the crow flies. The crossroads signpost's boards name their roads, a second signpost stands where the watchtower and lumber camp roads branch, and a painted map of Oakvale on a board at the crossroads shows the whole zone with a red "You are here". Smoke rises from the village's chimneys, the smithy's forge and the lumber camp's fire.

**Spec:** Implementation Decisions › Talking and tracking (the quest arrow), The rest of Oakvale (smoke, signposts, the map board). User stories 43–49 and 140.

**Blocked by:** 18 (Marshal Hale and Raiders in the Fields), 23 (The inn), 25 (The old mine: the mouth to the gallery).

**Status:** ready-for-agent

- [ ] The adventure state answers the quest arrow's target for every state: the farm, the lumber camp or the old mine's mouth for the quest you're on, Hale for "Return to Marshal Hale", or nothing.
- [ ] The quest arrow is a small gold arrow at the left of the first objective not yet done, pointing its way as the crow flies and turning as you turn: up is straight ahead. It shows no distance. It hides inside the place's clearing (for the mine, from the mine front on), within 10 m of Hale, indoors and in the mine, and comes back when you step out.
- [ ] The crossroads signpost's boards are painted "Old Mine" and "Lumber Camp" (north, a fifth board under the first), "Farm" (east), "Pond" (west) and "Brackenmoor" (south), readable from a few steps away. Nothing on them follows the quest.
- [ ] A second, smaller signpost stands north of the bridge between where the watchtower and lumber camp roads leave the main road: "Old Mine" north, "Lumber Camp" west, "Watchtower" east, "Village" south. Each signpost's names are one texture and one draw call.
- [ ] The map board stands about 2.5 m east of the signpost on the south side of the farm road, facing west across the crossroads. It's about 1.2 × 0.9 m on two posts with its top a little below eye height, painted once from the zone's plan: roads, the stream and the pond, the village's buildings, the farm, the lumber camp, the watchtower on its hill, the standing stones and the old mine, each named, "To Brackenmoor" at the pass, and a red "You are here" at the crossroads. Under 100 triangles and two draw calls.
- [ ] Smoke: one instanced mesh of soft puffs for every plume at once (about 60 quads), thin to keep overdraw down, from the inn's two chimneys, the two houses that have one, the smithy's forge and the lumber camp's fire. Not the farmhouse.
- [ ] Tests at the adventure-state seam: the arrow's target for every state. The arrow's hide rule is a pure rule with its own test. Plan tests: the map board and the second signpost stay off the roads.
- [ ] Checked in headless Chromium: screenshots of the signposts and the map board from a few steps away, at Quest-like pixels per degree, for the thread's reply.
- [ ] Every new number is in the game's table of tunables.
