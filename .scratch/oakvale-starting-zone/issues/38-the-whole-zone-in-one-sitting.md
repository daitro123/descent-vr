# 38: The whole zone in one sitting

**What to build:** Proof that Oakvale plays as the spec says, start to finish. A scripted play-through in headless Chromium takes a new character from `?newgame` through all three quests to level 5 and Hale's longsword, and on over the pass to Brackenmoor's rockfall, with a reload and a death along the way. Whatever it finds broken gets fixed, and the numbers Tom will want to check on the headset are measured in the emulator and written down.

**Spec:** the whole spec, especially Testing Decisions and Performance and the triangle budget. User stories 1–147.

**Blocked by:** 14–37 (every ticket before it).

**Status:** ready-for-agent

- [ ] A play-through script drives the Adventure through the debug handle (teleports and fixed time steps allowed, fights fought through the real combat): take and hand in each quest in turn, take the orders, beat the Warden, receive the longsword at level 5, then walk south over the seam to the rockfall. The script is checked in beside the spec.
- [ ] Along the way: a reload mid-chain resumes where it left off; a death outside the mine wakes you by the inn's hearth and one inside wakes you outside its mouth; the Warden stays dead after a reload.
- [ ] Every user story in the spec is either seen working in the play-through or its tests, or listed as waiting on the headset (feel, sound and the budget).
- [ ] The emulator's draw calls, triangles and shader programs are measured from the village, from the crest looking north with both zones loaded, inside the inn, and in the Warden's hall, and recorded on this ticket beside the budget (72 fps, about 300 draw calls, at most 4 point lights, 250k to 300k triangles over both eyes). If they're over, the spec's order of cuts is applied, in order, until they're under.
- [ ] Anything broken that fits in this ticket is fixed; anything bigger becomes a new ticket after this one.
- [ ] The README describes playing Oakvale: the quest chain, saving and `?newgame`, the arena at `?arena`, and every URL flag.
- [ ] The spec's "For Tom, on the headset" list is copied onto this ticket with the emulator's numbers beside each, ready for his next session.
