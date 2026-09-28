# 27: The mine's undead

**What to build:** The dead walk in the old mine. Two grunts and an archer hold the cart hall and a grunt and an archer the gallery's far end (level 3); a brute waits alone in the dig and another before the hall's gate (level 4). Rock hides you, so each chamber is its own pull. An undead that can't see you follows the tunnel towards you, the undead never follow you out of the mouth, and the mine fills again only once you've left it.

**Spec:** Implementation Decisions › Camps (in the mine), The mine (for the camps). User stories 94–99.

**Blocked by:** 16 (The farm's camp), 26 (The old mine: down to the Warden's hall).

**Status:** ready-for-agent

- [ ] The mine is one camp: 2 grunts and an archer in the cart hall and a grunt and an archer at the gallery's far end (level 3); a brute in the dig and another before the hall's gate (level 4). The two brutes pay triple.
- [ ] Rock blocks noticing and bringing others: both need a clear line through the mine.
- [ ] An undead that can't see you follows the route's centre line towards you and walks home the same way. One that can see you walks straight at you and steers as it does outdoors. No navmesh.
- [ ] The mouth ends every leash: the undead never leave the mine.
- [ ] Walls and ceilings stop arrows.
- [ ] The mine refills 3 minutes after its last undead falls, and only once you've left it and are at least 30 m from its mouth.
- [ ] Tests at the `EnemyContext` seam: no noticing through rock; following the centre line round a hairpin and a switchback (the tunnel-steering check next to the spec becomes this test); stopping at the mouth; the refill rule; arrows stopping in a wall.
- [ ] Checked in headless Chromium with the emulator: pulling the cart hall doesn't wake the gallery, and a chase ends at the mouth.
- [ ] Every new number is in the game's table of tunables.
