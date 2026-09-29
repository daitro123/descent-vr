# 28: The Warden and What Lies Below

**What to build:** Hale's last quest. Take "What Lies Below", walk down the old mine, and step through the hall's gate: the Warden, slumped on its throne, rises to fight. Beat it and walk back up to Hale, who hands you their own old longsword, darker-bladed with a gilded guard, straight into your hand, then points you south through the pass towards Brackenmoor. The Oakvale quest chain plays from start to finish.

**Spec:** Implementation Decisions › Enemies (the Warden), The adventure state, The player (Hale's longsword), Friendly characters (Hale's sword). User stories 27, 33, 37, 85, 86 and 100–103.

**Blocked by:** 18 (Marshal Hale and Raiders in the Fields), 20 (The human body), 27 (The mine's undead).

**Status:** done

- [x] The Warden is _absent_ (an empty throne) before What Lies Below and once beaten; _seated_, slumped on the throne, while the quest is active; _fighting_ from the moment you step through the hall's gate; and _resetting_ when you die or leave by the gate (it walks back to the throne at full health, and the skeletons it raised crumble). It never leaves the hall.
- [x] The Warden is level 5 with a level-1 health of 600 (1,080 at level 5) and takes no camp multiplier. Its raised skeletons are level 5, pay nothing and take no camp multiplier. Its summons land round you as today.
- [x] While the Warden is up, the melee pool is 2, the arena's, since its fight was tuned with two.
- [x] When it falls its raised skeletons crumble, and the adventure state records it beaten; the save keeps it, so it stays dead across reloads.
- [x] The adventure state answers whether the Warden sits on its throne, which sword you carry, and whether Hale's sword hangs at their hip.
- [x] What Lies Below plays end to end: "What woke the dead defeated: n/1" on the tracker; the hand-in pays 300 XP and Hale's old longsword. The longsword replaces your sword in your hand the moment you hand in: a darker blade and a gilded guard, with the same length, weight and handling, and 0.2 more on the damage multiplier. The sword leaves Hale's hip. Hale's last line points south and names Brackenmoor, and after it Hale shows no marker.
- [x] Tests at the `EnemyContext` seam: the Warden's seated, fighting, resetting and beaten states, and its raised skeletons crumbling when it resets or falls. At the adventure-state seam: the plain route lands level 4 at the dig's brute and level 5 with the sword at the last hand-in; the sword's damage step; the Warden's and the sword's answers for every state.
- [x] Checked in headless Chromium with the emulator: the Warden rises at the gate, a reload after beating it shows an empty throne, Hale without their sword and the longsword in your hand.
- [x] Every new number is in the game's table of tunables.

## Built

Built on 2026-09-29 by Claude, in autonomous mode (Tom asked for the rest of Oakvale to run without his input).

- **The Warden on its throne** (`Throne` in `src/enemies/throne.ts`): _absent_ (an empty throne) unless the adventure state says it sits there; _seated_, slumped on the throne; _fighting_ from the moment you're half a metre in through the hall's gate; _resetting_ when you go back out through the gate into the antechamber, fall, or leave the mine: whatever it raised crumbles at once, it's whole again, and it walks back untouchable (as a camp's enemy walks home) and sits. It stands on the mine's ground and never passes the hall's south wall (`ThronePlan.keepIn`), so from the gate it can come no nearer than the wall. When it falls, what it raised crumbles with it, its kill goes into the adventure state (camp none, level 5, the Warden), the save keeps it beaten, and nobody sits there again.
- **Its numbers**: level 5 with a level-1 health of 600, so 1,080, and no camp multiplier; its blows take the level-5 step. Its summons land 3 m round you as in the arena, level-5 grunts in no camp (81 health) that pay nothing. While it fights, the camps' shared melee pool is 2; it goes back to 3 once it resets or falls.
- **Sitting and standing** (`Enemy.sit`, `sitDown`, `standUp`, the `SEATED` pose): a seated enemy is held on its seat with its hips at the seat's height, out of reach, and nothing shoves it (`keepApart` leaves it be). It stands up over 2.4 s, stepping out to the arena's rising spot before the throne, and sits back down over 1.6 s. Its health bar shows only once it's up. `Enemy.crumble` and `recover` (the Warden's re-arms its summons) are new.
- **The hall's plan** (`MinePlan.throne`, from `planMine`): the seat and the spot before it, whether you're through the gate or out of it, and holding a body in the hall.
- **The adventure state** answers whether the Warden sits on its throne (What Lies Below under way and it not beaten), which sword you carry, and whether Hale's sword hangs at their hip. `statsAt(level, sword)`: Hale's longsword adds 0.2 to the damage multiplier.
- **Hale's longsword** (`buildLongsword(…, sword)`, `Sword.sword`): the same shape, so the same length, weight and handling, finished with a darker (blued) blade and a gilded guard, pommel and grip bands. It swaps into your hand the moment you hand in, and loads there from the save.
- **Hale without it** (`buildHale`, `Hale.swordAtHip`): once handed over, Hale's body is rebuilt with the scabbard empty and their left hand hanging easy. Their last line already pointed south to Brackenmoor, with no marker after it (ticket 18).
- **In the Adventure**: the Warden and what it raises are fought, war-cried and shadowed with the camps' enemies, drawn only while the hall's part of the mine is; it rises with a roar, a burst of magic and "THE BONE WARDEN", and its summons flash and rise as in the arena.
- **Tunables**: `CONFIG.warden.hall` (level, health, melee pool, how far in it rises, the seat and the spot before it, the seated hip height, standing and sitting times) and `CONFIG.levels.swords`.
- **Tests**: `tests/throne.test.ts` drives a real Warden through `EnemyContext` on the mine's own ground: the empty throne, seated (and not woken from the antechamber or the gate), rising at the gate, never leaving the hall, the raised skeletons' level, health and pay, resetting when you leave by the gate, fall or leave the mine (the raised crumbling, it walking back whole and untouchable, sitting, and rising again with its summons re-armed), and beaten. `tests/questChain.test.ts` has the state's answers for every stage, across reloads, and the plain route ending at 2.0 damage; `tests/adventureState.test.ts` the sword's step.
- **Checks**: `checks/warden.mjs` in headless Chromium with the emulator (see its header): the Warden seated and not woken from the gate, rising as you step through, resetting and sitting again when you walk out, beaten, the hand-in (level 5, the longsword in hand at 2.0 damage, gone from Hale's hip), and a reload with the longsword in hand, Hale without it and an empty throne. Screenshots are in the project's files under `mine/` (24 to 31).

Calls **taken on Tom's behalf**, to revisit:

- **Your starting sword's hilt is now plain iron** (it had the gold guard), so Hale's gilded guard reads as the reward. Hale's blade is a blued steel, noticeably darker than yours, with the same shape.
- **Where the fight starts and ends**: it rises once you're 0.5 m into the hall past the gate's inner mouth, and resets once you're out past the gate's outer mouth in the antechamber. Standing in the gate (1.4 m deep) does neither, so a step back doesn't reset it; it can't follow you into the gate, but its reach still can.
- **Leaving the mine resets it too** (you woke outside after dying, or walked out some other way): it doesn't wait by the gate.
- **The melee pool is 2 only while it fights**: back to the camps' 3 as it walks home. One already holding a turn as it rises (the antechamber's brute, chasing you in) keeps it for its blow.
- **Walking back in while it resets doesn't turn it round**: as a camp's enemy walking home, it sits first, then rises again for you.
- **What it raised crumbles in a burst of bone**, with a small death rattle, not the kill's full effect.
- **It's whole the moment it resets**, and its summons at 70% and 40% come again next time.
- **Standing up takes 2.4 s**, the arena Warden's rise from the floor, and it can't be hurt until it's up; it steps out to the arena's rising spot, 1.5 m before the throne.
- **Slumped, not asleep**: seated, its back bowed, head down, forearms on the throne's arms, the greatsword's point on the floor before it.
- **What it raised crumbles without paying**; those you cut down pay nothing too (they're killed as "raised").
- **Hale's empty scabbard stays on their belt**, with their left hand off it.

Left for later:

- `checks/mine-deep.mjs` finds one new shader program on the way down (12 → 13) on main as it stood before this ticket too, so it came with the mine's undead (27); not chased here.

- The drone at the breach and the crypt's sound (31); staging the Warden with the hall's meshes (34).

