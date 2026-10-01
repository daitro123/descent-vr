# 39: The triangle budget in the woods

**What to build:** Bring Oakvale's triangles in the open woods under the budget if the headset says they need it. After the spec's three cuts (ticket 38) the village measures 255k triangles over both eyes, but the crest looking north measures 318k arriving from the moor (364k teleporting there from the village, with more chunks held full by the hysteresis), and standing at the mine's front, the farm and the lumber camp 327k to 378k. Draw calls (at most 142) and point lights (4) are well within. The rule of thumb was 250k to 300k; on 2026-10-01 Tom doubled the budget to 600k over both eyes (`CONFIG.streaming.budget`), so every spot measured is now under it. The real limit is still 72 fps on the Quest, and the budget is unverified until the mine's front holds it.

**Spec:** Implementation Decisions › Performance and the triangle budget. User stories 143 and 144.

**Blocked by:** 38, and Tom's first headset session with `?perf` (whether the frame time at these spots holds 72 fps).

**Status:** needs-info

- [ ] Read `?perf` on the Quest at the village, the crest looking north, the mine's front, the farm and the lumber camp. If each holds 72 fps, close this as not needed.
- [ ] Otherwise, cut in this order until they do (each measured with `.scratch/oakvale-starting-zone/checks/play-through.mjs`'s method, both eyes, the worst heading):
  - [ ] Hold chunks full with half the hysteresis (20 m rather than 40 m), so walking about doesn't keep a wide ring full.
  - [ ] A middle tier: full chunks from 60 m to 100 m use the far trees (the near trees only within 60 m).
  - [ ] Cheaper near trees (fewer leaf clumps on the oaks, the canopy's biggest share).
  - [ ] A ground diet: coarser ground cells in full chunks past 60 m.
- [ ] Every new number is in the game's table of tunables, and the streaming tests' triangle totals are updated with what each cut took.
