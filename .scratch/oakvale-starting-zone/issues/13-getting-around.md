# Getting around

Type: grilling
Status: resolved
Blocked by: 

## Question

Is walking Oakvale with the stick enough, or does it need a sprint, a map or markers to find your way?

- **The walking:** the quest chain walks you out and back three times between Marshal Hale and the farm, the lumber camp and the mine: 60 to 90 m by road each way, 30 to 40 s at 2.2 m/s. After the chain, the marshal sends you south: about a minute from the crossroads to the crest of the pass, and another across Brackenmoor to its rockfall. Inside, the old mine is one route with no forks, about 100 m from its mouth to the Warden.
- **Finding the way:** the quest tracker at the top left names what's left to do but not which way to go (see [Talking to NPCs and tracking quests in VR](06-talking-to-npcs-and-tracking-quests.md)). The signpost stands at the crossroads. Smoke over the village and the lumber camp, and the sounds of the stream, the windmill and the smithy, now help you find places (see [A living zone](12-a-living-zone.md)).
- **What could help:** a faster way to move (a sprint on the stick, or a walk speed that rises on the road), a map you look at (on the wrist, or a board in the village), markers (on the tracker, in the world, or a compass), and the signpost pointing the quest's way.
- **Fits with:** enemies chase at your walking pace (see [Enemies in the open](07-enemies-in-the-open.md)), so a sprint changes how you escape a pull. Anything shown in view must fit the first-pass UI, before Tom's planned overhaul.

## Answer

Settled over three rounds on 2026-09-28 **by Claude on Tom's behalf**: Tom asked for the rest of the map to be settled without him, so every recommendation below was taken without his answer. The rounds and the reasons are under Comments, for him to revisit. The numbers are starting points, to tune on the headset.

- **Walking stays as it is,** 2.2 m/s on the left stick, with snap turns and the dash unchanged.
- **You can run.** Click the left stick while you move and you run at 3.5 m/s, about 1.6 times your walk. It saves about a third of every walk: the farm, the lumber camp and the mine are 70 to 90 m by road from Marshal Hale, about 20 to 25 s at a run, and the crest of the pass is about 140 m, some 40 s.
  - **Only out of a fight.** You can't start a run while any enemy is fighting you, and a run ends the moment one starts, as WoW won't let you mount in a fight. Enemies walking home to their posts don't count. So escaping a pull stays what [Enemies in the open](07-enemies-in-the-open.md) made it: they chase at your walking pace until their leash turns them back. When a fight ends your run, the left controller buzzes once.
  - **Forward only.** You run while the stick points ahead, within about 45° either side. Push it sideways or back and you walk, since fast sideways and backwards motion is what makes people sick. The run ends when you let the stick go, and the next click starts it again.
  - **The edges of your view darken a little while you run,** fading in and out over about 0.2 s, the usual comfort vignette. Its strength is one number, and 0 switches it off.
  - You can run anywhere out of a fight: on the roads, through the woods, indoors, in the mine and on the moor. In the arena you're always in a fight, so you never run there.
  - Running isn't saved; you always start walking.
- **The quest tracker gets a quest arrow.** A small gold arrow sits at the left of the objective you're working on and points the way to where it is, as the crow flies, turning as you turn: pointing up means straight ahead. There's no distance, just the direction.
  - It points at the objective's place: the farm for Raiders in the Fields, the lumber camp for The Lumber Camp (both its objectives are there), and the old mine's mouth for What Lies Below. Once an objective is done it moves to "Return to Marshal Hale" and points at them.
  - It hides once you're at the place (inside its clearing, or within about 10 m of Hale, where the gold "?" over them shows the way), while you're indoors, and all the way through the mine, which is one route with no forks. It comes back when you step out.
  - After the chain there's no quest and so no arrow; the marshal's last line and the signpost's "Brackenmoor" board point you south.
- **The signposts name their roads.** Each board has its destination painted on it, readable from a few steps away:
  - **At the crossroads:** "Old Mine" and "Lumber Camp" north (a fifth board under the first), "Farm" east, "Pond" west and "Brackenmoor" south, the road out through the pass.
  - **A second, smaller signpost** stands north of the bridge where the watchtower's road and the lumber camp's road branch off the main road: "Old Mine" north, "Lumber Camp" west, "Watchtower" east and "Village" south.
  - The signposts are part of the world, not the quest: nothing on them lights up for the quest you're on. The arrow does that.
- **A map board stands at the crossroads,** near Marshal Hale and the signpost, facing the road: a painted map of Oakvale, about 1.2 by 0.9 m on two posts, its top a little below eye height. It shows the roads, the stream and the pond, the village's buildings, the farm, the lumber camp, the watchtower on its hill, the standing stones and the old mine, each named, the pass south marked "To Brackenmoor", and a red "You are here" at the crossroads. It's drawn from the zone's own layout, so it stays true when the layout changes. It's painted, so it never changes and shows no quests. It stands where it won't overlap Hale's talk board, which the spec places.
- **No map you carry, no minimap and no compass.** The zone is small, every quest place is on a road from the crossroads, and the smoke over the village and the lumber camp and the places' sounds from [A living zone](12-a-living-zone.md) help you find your way. A map on the wrist or in a menu, and a minimap, belong with Tom's planned overhaul of the UI, when there are more zones to map.
- **No quest markers in the world** (no beams of light or gold marks over a place), no speed-up on the roads, no teleport and no way home to the inn like WoW's hearthstone: the distances are short, and the inn's hearth is about 20 m from Hale.
- **Budget:**
  - The quest arrow is one small draw call. The run's vignette is one draw call while you run: a ring over the edges of the view, not a full-screen pass, to keep the overdraw down.
  - The map board is a frame, two posts and one texture drawn once from the layout: under 100 triangles and two draw calls. Each signpost's names are one texture on its boards, one draw call. The second signpost costs what the first does, about 120 triangles.
  - Running covers a 40 m chunk every 11 s or so, well within the streamer's pace of one chunk upload per frame.
- **Nothing new is saved.** The arrow follows the quest you're on, which the save already holds.

## Comments

**2026-09-28:** graduated from the map's "Getting around" fog when [A living zone](12-a-living-zone.md), the last open ticket, was resolved, so it's the last decision before the spec.

**2026-09-28, round 1 (taken on Tom's behalf, without his answer):**

- Walking isn't too far, it's too slow. Over the whole chain you walk about 650 m, out and back to the farm, the lumber camp and the mine and then south to the crest: about 5 minutes at 2.2 m/s, much like the walking in Elwynn Forest's first quests. But 2.2 m/s is a brisk walk, and WoW's characters run at about 6.4 m/s (7 yards a second), so each walk home to the marshal feels long. A run on demand fixes the pace where it drags, on the road home, and leaves the zone's size alone.
- A run you start yourself, not a walk that speeds up on the road: in VR, a speed change you didn't ask for is the classic cause of sickness, and a road speed-up would also surprise you in a fight on the road. No teleport: combat is built on moving smoothly, and a teleport would let you skip past pulls.
- No map you carry. The zone is 168 m across, everything a quest sends you to is on a road from the crossroads, and Tom dropped the wrist quest log from [Talking to NPCs and tracking quests in VR](06-talking-to-npcs-and-tracking-quests.md) in favour of the tracker in view, so a wrist map would bring back what he passed over. WoW's own map and minimap are the kind of UI his planned overhaul covers.
- A quest arrow on the tracker. The tracker already says what to do; an arrow beside it says which way, for one small glyph and no new panel. Classic WoW left finding the way to quest text, but modern WoW shows where to go on its map and minimap, and without either the arrow stands in for them. It points as the crow flies, like WoW's minimap arrow; the roads go roughly the same way.
- No markers in the world: a beam over the farm would need to be seen past the trees, clutters the view, and the "!" and "?" over Hale are already the one kind of marker, which the glossary keeps for them. No compass strip either: it would be a second panel in view before the overhaul.
- The signposts name their roads. The crossroads signpost's boards are blank today; names are the world's own way to find places, and WoW's crossroads have them too. The signpost doesn't track the quest, so the world stays the world and the arrow stays the UI.

**2026-09-28, round 2 (taken on Tom's behalf, without his answer):**

- The run is 3.5 m/s, a jog, about 1.6 times the walk: enough to cut a walk by a third, and slow enough to stay comfortable on the Quest. The left stick's click is free in the game (the A and X buttons are the War Cry, B and Y the dash), and clicking the stick you're moving with is how most VR games start a run.
- Out of a fight only, because the camps were tuned for your walking pace: enemies chase at 2.2 m/s so walking away doesn't lose them, and a run in a fight would let you outpace and kite them, which changes how combat feels (out of this map's scope). WoW's rule for mounts is the same, so it reads as familiar. The buzz tells you a pull has caught you even if you didn't see it.
- Forward only, since fast strafing and backpedalling are the hardest motions on the stomach. The vignette is the standard comfort aid for faster motion, and cheap; it can be turned off with one number if Tom doesn't want it.
- The arrow hides where it would mislead or add nothing: at the place itself, where the enemies are in front of you; near Hale, whose "?" shows; indoors; and in the mine, where it would point through rock and the one route leads to the Warden anyway. No distance number, to keep the tracker as plain as the first pass asks.
- A second signpost north of the bridge, because the main road forks twice there (to the watchtower and to the lumber camp) within a few metres, and the crossroads signpost can only say "north". The watchtower has no quest but is a place worth naming.
- A map board at the crossroads, where a new character starts and every quest is handed in: one look at it shows the whole zone and where you are. It's static, since a painted board that tracked quests would be UI pretending to be the world.

**2026-09-28, round 3 (taken on Tom's behalf, without his answer):**

- Budget: the arrow, the vignette, the map board and the signposts' names come to a handful of draw calls and a few hundred triangles, against a budget whose tight limit is the trees and terrain. The vignette covers only the edges, since a full-screen pass costs fill rate on the Quest.
- Glossary: `CONTEXT.md` gains **Run** (not "sprint", and not the dash, which is combat's dodge step) and **Quest arrow** (not a marker, which stays the "!" and "?" over a quest giver).
- Nothing graduates from the fog: this was the last decision on the map. Mounts, flight paths, a map you carry and a minimap are WoW's ways of getting around a world of many zones; they go on the map's Out of scope, for when there are more zones than Oakvale and Brackenmoor. Mounts are four-legged anyway.
- Notes added to [Talking to NPCs and tracking quests in VR](06-talking-to-npcs-and-tracking-quests.md) (the tracker's arrow) and [Enemies in the open](07-enemies-in-the-open.md) (a pull ends your run).
