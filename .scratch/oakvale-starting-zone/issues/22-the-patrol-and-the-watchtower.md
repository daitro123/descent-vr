# 22: The patrol and the watchtower

**What to build:** Two thugs walk the lumber camp's road in single file, pausing at each end, so the road itself can surprise you, and a camp of two thugs and an archer holds the watchtower's hill. Neither counts for The Lumber Camp. The village, the bridge, the pond and the standing stones stay safe.

**Spec:** Implementation Decisions › Camps (the patrol, the watchtower). User stories 59 (the patrol and the watchtower), 60 and 65.

**Blocked by:** 21 (The Lumber Camp).

**Status:** ready-for-agent

- [ ] The patrol is its own camp of 2 thugs, level 2, on the camp road between the lumber camp and the main road. It walks the road in single file at 0.8 m/s, 1.8 m apart, and pauses 3 s at each end.
- [ ] A jumped patrol measures its leash from where it was jumped, and it refills only while you're at least 30 m from its road.
- [ ] The watchtower's camp: 2 thugs and an archer, level 2, on the tower's hill.
- [ ] No camp stands in the village, on the bridge, at the pond or at the standing stones.
- [ ] Tests at the `EnemyContext` seam: the patrol walking and pausing, its leash from where it was jumped, and its refill distance from the road. Plan tests: the watchtower's posts stand on clear ground 5 to 18 m apart; no post or patrol road lies in the safe places.
- [ ] Checked in headless Chromium with the emulator: the patrol walks its road, and killing it doesn't count for The Lumber Camp.
- [ ] Every new number is in the game's table of tunables.
