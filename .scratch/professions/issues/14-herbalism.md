# 14: Herbalism

**What to build:** Herbalism in Oakvale, end to end. The knife from the tool loop within 3 m of a clump. The one low slice through the stems takes the clump (2 herbs to the bag), and a slice through the leaves trims one and says "cut lower". "+1 Herbalism", short stems while it's taken, and the refill. The 8 Hearthleaf and 6 Duskcap clumps placed in Oakvale's plan, two instanced meshes, and Duskcap's faint glow in the mine. Until ticket 18 a character learns Herbalism through the debug handle.

**Blocked by:** 13.

**Status:** ready-for-agent

Read [the spec](../spec.md) ("Gathering spots and the tool loop") and [Gathering spots in Oakvale](10-gathering-spots-in-oakvale.md).

- [ ] `.scratch/professions/checks/herbalism.mjs` cuts a Hearthleaf clump in the farm's fields and a Duskcap clump in the mine, sees 2 of each in the bag and Herbalism at 2, and sees a leaves-only slice trim without taking the clump.
- [ ] With both Mining and Herbalism learned, the loop gives the pick at a vein and the knife at a clump.
- [ ] `npm run typecheck`, `npm test` and `npm run build` pass.
