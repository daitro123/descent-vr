# 28: The Warden and What Lies Below

**What to build:** Hale's last quest. Take "What Lies Below", walk down the old mine, and step through the hall's gate: the Warden, slumped on its throne, rises to fight. Beat it and walk back up to Hale, who hands you their own old longsword, darker-bladed with a gilded guard, straight into your hand, then points you south through the pass towards Brackenmoor. The Oakvale quest chain plays from start to finish.

**Spec:** Implementation Decisions › Enemies (the Warden), The adventure state, The player (Hale's longsword), Friendly characters (Hale's sword). User stories 27, 33, 37, 85, 86 and 100–103.

**Blocked by:** 18 (Marshal Hale and Raiders in the Fields), 20 (The human body), 27 (The mine's undead).

**Status:** ready-for-agent

- [ ] The Warden is _absent_ (an empty throne) before What Lies Below and once beaten; _seated_, slumped on the throne, while the quest is active; _fighting_ from the moment you step through the hall's gate; and _resetting_ when you die or leave by the gate (it walks back to the throne at full health, and the skeletons it raised crumble). It never leaves the hall.
- [ ] The Warden is level 5 with a level-1 health of 600 (1,080 at level 5) and takes no camp multiplier. Its raised skeletons are level 5, pay nothing and take no camp multiplier. Its summons land round you as today.
- [ ] While the Warden is up, the melee pool is 2, the arena's, since its fight was tuned with two.
- [ ] When it falls its raised skeletons crumble, and the adventure state records it beaten; the save keeps it, so it stays dead across reloads.
- [ ] The adventure state answers whether the Warden sits on its throne, which sword you carry, and whether Hale's sword hangs at their hip.
- [ ] What Lies Below plays end to end: "What woke the dead defeated: n/1" on the tracker; the hand-in pays 300 XP and Hale's old longsword. The longsword replaces your sword in your hand the moment you hand in: a darker blade and a gilded guard, with the same length, weight and handling, and 0.2 more on the damage multiplier. The sword leaves Hale's hip. Hale's last line points south and names Brackenmoor, and after it Hale shows no marker.
- [ ] Tests at the `EnemyContext` seam: the Warden's seated, fighting, resetting and beaten states, and its raised skeletons crumbling when it resets or falls. At the adventure-state seam: the plain route lands level 4 at the dig's brute and level 5 with the sword at the last hand-in; the sword's damage step; the Warden's and the sword's answers for every state.
- [ ] Checked in headless Chromium with the emulator: the Warden rises at the gate, a reload after beating it shows an empty throne, Hale without their sword and the longsword in your hand.
- [ ] Every new number is in the game's table of tunables.
