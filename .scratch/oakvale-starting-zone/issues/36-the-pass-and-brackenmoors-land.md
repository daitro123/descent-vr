# 36: The pass and Brackenmoor's land

**What to build:** The southern pass opens, and Brackenmoor lies over its crest. Walk south from the village along the road, between rocks and pines, up to a border stone on the crest, and down onto a bare moor of bracken and heather ringed by low hills, where the road runs on to a rockfall in a gap. The two zones' land meets exactly on the crest. `?fly` flies Brackenmoor too. What happens as you cross (the light, the name, the sound, the save) comes in ticket 37.

**Spec:** Implementation Decisions › The southern pass, the seam and Brackenmoor, Zones: a plan and chunks. User stories 115–118, 123, 124 and 126.

**Blocked by:** 35 (Building chunks in a worker).

**Status:** ready-for-agent

- [ ] The pass opens as a walkable corridor about 10 m either side of the road, from the play area's edge (z = 84) to the crest (z = 140), bounded where the pass's walls turn steep, with rocks and pines along the edge so the limit reads. The road's steepest stretch (about 1 in 4 around z = 110 to 120) is regraded to 1 in 5.
- [ ] Brackenmoor is a zone like Oakvale, id `brackenmoor`, labelled "Brackenmoor": a plan plus a chunk builder spanning x from −100 to 100 and z from 140 to 300 (5 by 4 chunks), walkable within x ±60 from the crest to z = 260. Low, rounded hills of 20 to 35 m ring it east, west and south. From the crest the land falls into a shallow basin a few metres above Oakvale's valley floor. The road runs from the crest across the moor to a gap in the south hills, closed by a rockfall at the walkable edge.
- [ ] Its look: an open moor of bracken and heather in rust, olive and purple, with scattered grey rocks, low bushes and a few lone, wind-bent pines. It reuses Oakvale's plant shapes and the shared material with its own vertex colours, so no new shader appears.
- [ ] Its atmosphere: a paler, cooler haze, a whiter sky and a rust-brown ground light, under the same sun.
- [ ] The seam is the crest, z = 140. Oakvale's heights along it are the shared border profile, and Brackenmoor's first row of chunks blends its land to that profile over 40 m, so both zones' heights agree exactly on the line.
- [ ] The border stone is one standing stone like those in Oakvale's circle, by the road on the crest.
- [ ] The World's `Ground` dispatches to the zone underfoot, and within about 1 m of the seam asks both. The walkable shape includes the pass corridor and Brackenmoor's area.
- [ ] Nothing lives in Brackenmoor, nothing can hurt you there, and it has no respawn point. No camp's leash reaches the pass.
- [ ] `?fly` flies Brackenmoor as well as Oakvale, and `?map=brackenmoor` walks the World from Brackenmoor's start.
- [ ] Tests at the `Ground` seam: the zones' heights agree along the seam; the pass corridor is walkable from the play area to Brackenmoor, and its edges stop you; Brackenmoor's chunk builds are deterministic.
- [ ] Checked in headless Chromium: screenshots from the upper pass (the moor's far hills in haze) and from the crest both ways, for the thread's reply.
- [ ] Every new number is in the game's table of tunables.
