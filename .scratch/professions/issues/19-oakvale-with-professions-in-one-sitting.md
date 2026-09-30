# 19: Oakvale with professions, in one sitting

**What to build:** nothing new. Play Oakvale from a new character through Hale's chain with both professions pairs: learn both, reach Apprentice's cap in all four along the way, make a pair of gauntlets and a stack of potions, and sell the spare. Measure the budget with every spot, the herbalist and the stations in view, as the Oakvale map's last ticket did. Tune the numbers the play-through shows are off (yields, refill, recipe needs, prices), and record the tuning and the measurements under this ticket.

**Blocked by:** 17, 18.

**Status:** done

Read [the spec](../spec.md) and the Oakvale map's [The whole zone in one sitting](../../oakvale-starting-zone/issues/38-the-whole-zone-in-one-sitting.md).

- [x] `.scratch/professions/checks/oakvale-professions.mjs` plays the route above in the emulator and prints the time to Apprentice 25 in each profession, the coins earned from selling, and the draw calls and triangles from the village, the smithy, the house and the mine's upper galleries.
- [x] The results and every tuned number are written under this ticket.
- [x] `npm run typecheck`, `npm test` and `npm run build` pass.

## Answer

Played on 2026-09-30 by Claude **on Tom's behalf**: he asked for the build tickets to run without his input, taking the recommended option at every fork. Checked in headless Chromium with the emulator, not yet on the headset.

**The run** (`.scratch/professions/checks/oakvale-professions.mjs`, all 52 checks pass)

A new warrior takes Raiders in the Fields, then The Lumber Camp, Ore and Fire at the smith and Leaves for the Pot in the house by the well, all three at once. Both intro quests are handed in before the lumber camp, Hale's chain runs to the Warden, and then the check takes every one of the zone's 22 spots in a round (the 6 outdoor veins, the gallery's veins and Duskcap, 8 Hearthleaf, the stumps' Duskcap), back to the anvil and the bench after each, until all four are at 25. Then it makes the gauntlets to wear, keeps 10 healing potions and 10 rage draughts (three on the belt), and sells the rest to the smith. Every gather, make and brew is done by the tools and hands through the stations' own rules; walking is charged at run speed (3.5 m/s) for the straight line. The clock is the game's own, so it's a fast floor: no looking around, no missed swings beyond what the swing itself misses, no stops.

| | learned | Apprentice 25 | time to 25 |
|---|---|---|---|
| Mining | 1:17 | 28:50 | **27:34** |
| Smithing | 1:17 | 19:11 | **17:54** |
| Herbalism | 1:29 | 23:07 | **21:39** |
| Alchemy | 1:29 | 28:23 | **26:55** |

- Hale's chain done at 11:48, with mining 7, smithing 5, herbalism 10 and alchemy 8. The whole run is 29:50, with 0 deaths. Round 1 took all 22 spots in 9:17, round 2 all 22 in 5:59, and Mining reached 25 two spots into round 3.
- The pick takes 2 swings a vein and the knife 1 slice a clump. In all: 25 veins, 20 Hearthleaf, 18 Duskcap.
- Made: 12 copper bars, 7 whetstones, 3 pairs of copper gauntlets of Strength, 11 minor healing potions, 13 rage draughts and 1 elixir of the keen eye. Bought off the Train lists: the rage draught (10 coins), the copper gauntlets (25) and the elixir (10).
- **Coins from selling:** 130 for the spare at the end (114 of it the professions' goods: 46 ore, 18 stone, 7 whetstones, 25 herbs, 3 rage draughts, a potion), and 194 over the whole run for what the professions gathered and made (the two spare pairs of gauntlets at 40 each among it). Loot (junk and old gear) sold for 335 along the way. 766 coins in the purse at the end.
- An earlier run (before the bench fix below) came out within a minute on every line: Mining 27:57, Smithing 18:02, Herbalism 22:15, Alchemy 27:18, the whole run 30:49.

**The budget** (stereo, 96° fov, the worst heading of 6 or 8, `renderer.info`; 38 programs everywhere)

| where | draw calls | triangles | point lights |
|---|---|---|---|
| the village, at the crossroads | 144 | 288.8k | 4 |
| the smithy, at the anvil with the hammer and tongs | 174 | 272.2k | 4 |
| the herbalist's house, at the bench | 46 | 10.0k | 4 |
| the mine's upper gallery, its veins and Duskcap round you | 24 | 21.2k | 4 |

All are within about 300 draw calls and 4 point lights, and the triangles within the 250k–300k rule of thumb. The frame rate can't be measured headless (swiftshader); 72 fps is for the headset.

**Tuned** (only in `CONFIG.professions`)

- `recipes['rage-draught'].needs`: **5 → 3.**
- `recipes['minor-mana-potion'].needs`: **5 → 3** (the same step on the herbalist's list, so the two stay together).

Why: Leaves for the Pot ends at Alchemy 3, and with the healing potion the only recipe below 5, Alchemy sat at 4 at the chain's end: the Duskcap from the gallery couldn't be used and the Hearthleaf ran out first. With 3, the rage draught is bought at the hand-in and 4 are brewed before the mine, and a warrior has them for the Warden.

`tests/professions.test.ts` and `tests/trainers.test.ts` follow the new numbers.

**Left as they are, and why**

- **Vein and herb yields** (3 ore and a stone; 2 leaves), **gain 1 a spot** and **refill 180 s**: 25 spots to 25 is about two laps of the zone after the chain, and Smithing reaching 25 about 10 minutes ahead of Mining is what "about 25 things made" gives when a vein makes a bar and a whetstone. The refill only bit at the script's pace (a lap in 6 minutes); a person looking around won't wait on it.
- **Prices:** the rage draught and elixir at 10 and the gauntlets at 25 were affordable at the moment Alchemy and Smithing allowed them, with no grinding for coins.

**Fixed along the way**

- **The bench's pot stuck over the last flask.** Pouring into the last free stand, the pot lost its flask as it corked and waited, tilted, for a stand to free, so the next herbs wouldn't load. It now keeps its flask until it's back on its trivet (`src/professions/bench/bench.ts`, `pour` and `cork`). Three brews to a visit now work every time.

**Findings for Tom** (not in `CONFIG.professions`, so not tuned)

- **The gauntlets are the money.** A pair from 8 ore (8 coins as ore, 12 as bars) sells for 40 by the gear rule (`items.copperGauntlets` is a level-5 green). Everything else the professions make sells for 1 to 4.
- **The bag fills by the mine.** Round 1 came back with 2 free slots and round 2 with none; ore left over once Smithing is 25 (about 46 at the end) is most of it. Veins with a full bag drop what doesn't fit.
- **The intro quests level you ahead.** Their 120 XP each put a new character at level 4 after The Lumber Camp (Hale's alone: 3).
- **The anvil takes your hands in front of the smith.** Once Smithing is learned, walking up to the smith head-on steps you up to the anvil instead of opening their board; the check approaches from the side.
- **Camps refilled between rounds are fought again**, so the gathering laps also bring in loot.
- **Smithing stops at about Mining 15:** from there on, the ore and stone pile up unused.

**On the headset** (a new character; `__descent.professions.learn()` and `.fill()` from the console skip ahead)

1. Play Hale's chain with both intro quests taken straight after Raiders in the Fields. Is buying the rage draught at the herbalist's hand-in (Alchemy 3) clear, and do you use the rage draughts on the Warden?
2. Time yourself to 25 in each profession. The script's 27:34 for Mining is a floor; if a person's is much over 40 minutes, raise a spot's `gain` or lower `refill.after`.
3. Brew three in a row at the bench, filling every stand. Does the pot pour into the third flask and go back to its trivet, and do the flasks fly to the bag when you step away?
4. Walk up to the smith head-on with Smithing learned. Is the anvil taking your hands a surprise, or fine?
5. Watch the bag in the mine on a second lap. Does a full bag at a vein read clearly?
6. The knife's cut and the clump's 0.45 m rise (ticket 14), and the hammer's strike speeds and the anvil's 74 cm (ticket 15), all still want a headset pass.
7. The village reads 144 draw calls and the smithy 174. Check 72 fps at the crossroads and at the anvil.
