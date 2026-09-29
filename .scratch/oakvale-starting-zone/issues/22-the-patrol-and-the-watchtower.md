# 22: The patrol and the watchtower

**What to build:** Two thugs walk the lumber camp's road in single file, pausing at each end, so the road itself can surprise you, and a camp of two thugs and an archer holds the watchtower's hill. Neither counts for The Lumber Camp. The village, the bridge, the pond and the standing stones stay safe.

**Spec:** Implementation Decisions › Camps (the patrol, the watchtower). User stories 59 (the patrol and the watchtower), 60 and 65.

**Blocked by:** 21 (The Lumber Camp).

**Status:** done

- [x] The patrol is its own camp of 2 thugs, level 2, on the camp road between the lumber camp and the main road. It walks the road in single file at 0.8 m/s, 1.8 m apart, and pauses 3 s at each end.
- [x] A jumped patrol measures its leash from where it was jumped, and it refills only while you're at least 30 m from its road.
- [x] The watchtower's camp: 2 thugs and an archer, level 2, on the tower's hill.
- [x] No camp stands in the village, on the bridge, at the pond or at the standing stones.
- [x] Tests at the `EnemyContext` seam: the patrol walking and pausing, its leash from where it was jumped, and its refill distance from the road. Plan tests: the watchtower's posts stand on clear ground 5 to 18 m apart; no post or patrol road lies in the safe places.
- [x] Checked in headless Chromium with the emulator: the patrol walks its road, and killing it doesn't count for The Lumber Camp.
- [x] Every new number is in the game's table of tunables.

## Built

Built on 2026-09-29 by Claude, in autonomous mode (Tom asked for the rest of Oakvale to run without his input).

- **The patrol** (`patrol` in `src/maps/forest/layout.ts`) is its own camp of two bandit thugs at level 2 on the camp road.
  - Its road is the stretch of the camp road at least 10 m from the main road's middle and at least 9 m from every one of the lumber camp's posts: about 11.7 m of it, from (−18.1, −47.5) to (−29.4, −44.6).
  - It fills in file at the road's main-road end, walking towards the camp.
- **A patrol walks** (`src/enemies/patrol.ts`, `PatrolWalk`). It works out where each member of the file should be; the camp moves their posts there, and the members walk after them.
  - The file walks at 0.8 m/s, 1.8 m apart, and keeps its order on the road. The second of the pair leads out, and the first leads back.
  - At each end it stands 3 s, looking on past the end, then turns and walks back.
  - A member walks after its moving post at the patrol's pace (`EnemyPost.pace`), rather than strolling as a camp's member walks home.
  - The file holds where it is while any of it fights, walks home, or has fallen more than 1.2 m behind its place.
  - Once one member falls, the other walks on alone, still to the very ends of the road.
  - `CampPlan.road` says a camp is a patrol. It refills whole only while you're at least 30 m from its road.
- **A jumped patrol's leash** runs from where each member was jumped: its post is set to its spot on the road. It gives up 30 m from there, walks home there and heals, and then the file walks on from there.
- **The watchtower's camp** (`watchtower`) is two bandit thugs and a bandit archer at level 2 on the flat top of the tower's hill:
  - a thug at the door where the road comes up, facing down it;
  - the archer on the hill's south-west brow, looking down over the road;
  - a thug round the back, watching the woods.
  - The posts are 6 to 11 m apart. The door's thug and the archer come as a pair, and the thug round the back is out of pull of both.
- **The safe places stay safe.** No post or patrol road comes within notice (8 m) of the village, the bridge, the pond's shore or the standing stones.
- **Every new number** is in `CONFIG.camps.patrol` (speed, gap, pause, keepUp).
- **Tests:**
  - `tests/camps.test.ts` (5 new), with real enemies through `EnemyContext`: the patrol walks at 0.8 m/s, 1.8 m apart, on its road, facing the way it walks. It pauses 3 s at each end, then walks back with the last in the file leading. A jumped patrol gives up 30 m from where it was jumped, walks home there, and then walks on. A survivor walks on alone, to the road's very ends. It refills only 30 m from its road, wherever its place is.
  - `tests/forest.test.ts` (11 new). The patrol: its make-up and level; its road is the camp road between the main road and the camp; it stands in file where its road starts; its road is clear ground you can walk; the main road and the lumber camp are out of its notice. The watchtower: its make-up, level and hilltop; the door's thug; clear, dry, level ground you can walk to; posts 5 to 18 m apart, with the door and the archer as a pair. The safe places have no camp or patrol road within notice.
- **Checks:** `checks/patrol-and-watchtower.mjs` in headless Chromium with the emulator; see its header for every step. Screenshots are in the project's files under `patrol-and-watchtower/`. The lumber camp check now waits for the patrol to walk to the far end of its road before it stands at the camp end. The adventure, farm camp, Hale, levels, saving, world, people and tunnel checks still pass.

Calls **taken on Tom's behalf**, to revisit:

- **The patrol's road is shorter than the prototype's**, about 11.7 m rather than 22.6 m. The `?camp` prototype's road ran from 5 m off the main road to 4 m from where ticket 21 put the camp's gate thug. That road woke the patrol for anyone walking the main road, and a fight at its far end woke the camp too. The main road is how you reach the mine, and the second signpost (ticket 32) stands where the roads leave it, so the patrol keeps to the camp road itself.
- **A jumped member's leash runs from its own spot**, not from its place in the file, which walks about 0.7 m ahead of it. It walks home to that spot, and the patrol walks on from there rather than starting over.
- **The file waits** for anyone fighting, walking home or lagging behind, as the prototype's did.
- **One survivor walks on alone**, to the road's very ends.
- **At each end the file stands looking on past the end**, then turns.
- **A cleared patrol refills at its road's main-road end**, walking towards the camp.
- **The watchtower's posts** are the door, the south-west brow and the back of the hill, all on its small flat top. The door's thug and the archer come as a pair.
- **A patrol's place** is a circle round its road, for anything asking where a camp is. The refill goes by the road itself.

Left for later:

- The second signpost where the watchtower and camp roads leave the main road, and the quest arrow, are ticket 32.
