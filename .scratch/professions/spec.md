# Spec: Professions

Status: ready-for-agent

Written on 2026-09-30 from the [professions map](map.md) and its ten resolved tickets, **by Claude on Tom's behalf**. Tom asked for the rest of this effort to run without his input, taking the recommended option each time. Where the map left a detail to the spec, the call made here is marked _(spec, on Tom's behalf)_ and listed under Further Notes so he can revisit it. Every number is a starting point, to tune on the headset. Every name (Hearthleaf, Duskcap, the herbalist, the quests, the lines people say) is a placeholder and cheap to change.

It builds on the [inventory spec](../inventory/spec.md): everything professions gather and make is an item in the bag, and the tool loop is a third zone of the belt's mechanics.

## Problem Statement

Between fights, Oakvale gives you nothing to do with your hands but walk. Nothing in the world can be gathered and nothing made, so the smithy's anvil, the old mine's rock and the fields are scenery. The new bag and belt need things to fill them beyond what enemies drop. A healing potion comes only from the innkeeper, and each class's resource (rage, focus, mana) has nothing to top it up. Tom wants WoW's professions, done the way VR does them best: really swinging the pick, really hammering the anvil, a few seconds at a time, as a calm thing to do between fights that pays off in the next one.

## Solution

Two pairs of **professions**, which every character can learn: **Mining** with **Smithing**, and **Herbalism** with **Alchemy**.

The smith teaches the first pair, and a new herbalist in the house by the well teaches the second. Each trainer does it through a short intro quest that opens once Marshal Hale's first quest is handed in. Learning a gathering profession hangs its tool on your belt: a pick or a herb knife, drawn from a **tool loop** behind your sword hip whenever you stand near a **gathering spot**.

Oakvale holds 22 spots: copper veins in the rocks and the old mine, Hearthleaf in the fields and along the roads, and Duskcap in the deep woods and the mine. Strike the glint on a vein and it breaks in two swings, sending copper ore and a rough stone to your bag. Cut a clump of Hearthleaf low with one slice and two herbs fly to your bag. Spots refill a few minutes after you leave.

At the smithy's anvil, step up and your sword and shield become the smith's hammer and tongs. Press a recipe on the board beside the anvil, and smelt, heat and hammer glowing marks on the work. The whetstone or the gauntlets fly to your bag.

At the alchemy bench in the house by the well, step up and your hands are free. Drop herbs in the mortar, grind, stir, and a corked potion waits on its stand for your belt.

What you make serves every class: a healing potion for everyone, a rage draught for the warrior, a mana potion for the mage, an elixir for the ranger, a whetstone for a blade or arrowheads, and a pair of copper gauntlets as good as a green drop at level 5. Doing the motion well makes it quicker, never better, and nothing can fail.

Each profession's **proficiency** climbs by one for every spot emptied and every thing made, up to the cap of its **grade**. Apprentice, Oakvale's grade, runs to 25. Trainers sell the grade's other recipes for coins. What you make sells to vendors like anything else.

## User Stories

### Learning a profession

1. As a player, I want the smith to have a gold "!" over them once I've handed in Raiders in the Fields, so that I know there's something new to learn in the village.
2. As a player, I want the smith to offer "Ore and Fire" on the same talk board Marshal Hale uses, so that I don't have to learn a new way of talking.
3. As a player, I want accepting "Ore and Fire" to teach me Mining and Smithing at once and hang a pick on my belt, so that I can start straight away.
4. As a player, I want "Ore and Fire" to ask me to break 2 copper veins and make a whetstone at the anvil, so that the quest teaches the motion in context.
5. As a player, I want a new herbalist in the house by the well, with a gold "!" once Raiders in the Fields is handed in, so that the second pair has its own teacher.
6. As a player, I want accepting "Leaves for the Pot" to teach me Herbalism and Alchemy and hang a knife on my belt, so that I can cut herbs at once.
7. As a player, I want "Leaves for the Pot" to ask me to gather 4 Hearthleaf and brew a minor healing potion, so that I learn both halves.
8. As a player, I want each intro quest's hand-in to pay XP and a few coins and let me keep what I made, so that the lesson is worth doing.
9. As a player, I want each intro quest to teach its grade's first recipes (the copper bar and the whetstone; the minor healing potion), so that I can make something the moment I've learned.
10. As a player, I want the trainers' quests to run alongside Marshal Hale's chain without blocking it, so that I can learn whenever I like.
11. As a player, I want up to three quests active at once (Hale's and the two intro quests), each listed in the tracker with its own lines, so that I can see everything I'm doing.
12. As a player, I want the quest arrow beside the first unfinished objective of the quest I took most recently, so that it points where I'm most likely heading.
13. As a player, I want any character of any class to learn all four professions, so that no class is shut out of making its own potions.
14. As a player with several characters, I want professions learned per character, so that each character's progress is their own.

### The tool loop

15. As a player, I want a pick and a knife to hang behind my sword hip once I've learned their professions, visible when I glance down, so that I know where my tools are.
16. As a player, I want to squeeze the grip with my sword hand in the tool loop to draw the tool for the nearest gathering spot within 3 m, so that I never choose between tools.
17. As a player, I want the loop to do nothing far from any spot, so that a stray grab while walking never swaps my weapon.
18. As a player, I want the loop to glow and tick my controller when my hand enters it, as the belt's slots do, so that I can find it without looking.
19. As a player, I want my sword to go away while the tool is in my hand and my shield, bow or focus to stay in the other hand, so that gathering takes one hand.
20. As a player, I want to put the tool back by squeezing in the loop again, or by walking more than 5 m from every spot, so that my weapon comes back without thinking.
21. As a player, I want the loop to do nothing while anything fights me, and a pull to put my tool away and my weapon in my hand at once with one buzz, so that I'm never caught holding a pick.
22. As a player, I want a grip pressed in the loop never to arm an ability's gesture, so that drawing a tool never casts anything.

### Mining

23. As a player, I want copper veins to show as green-and-copper streaks in grey rock, bright enough to see from the road, so that I can find them without markers.
24. As a player, I want a glint on the vein once I've drawn the pick, moving after every strike, so that I have something to aim at.
25. As a player, I want a strike to count only on a committed swing, the sword's rule, so that the pick feels like a weapon I already know.
26. As a player, I want a strike on the glint to count more than two plain strikes, so that a vein breaks in 2 good swings or 5 plain ones.
27. As a player, I want a slow touch to give only a dull clink and a light buzz, so that I can tell a tap from a strike.
28. As a player, I want a hot strike off the ore to thunk into the rock and count for nothing, so that aim matters without costing me anything.
29. As a player, I want sparks, a ring and a pulse sized to each strike, and a brighter burst on the glint, so that every swing tells me how good it was.
30. As a player, I want the vein to crack at a third and two thirds, then burst in copper rubble, so that I can see how close it is.
31. As a player, I want 3 copper ore and 1 rough stone to fly to my bag when the vein breaks, so that I never bend to the ground to pick them up.
32. As a player, I want a broken vein to go dark and stay so until I've left, so that I can tell which spots I've taken.

### Herbalism

33. As a player, I want Hearthleaf as a knee-high clump of bright leaves with small gold flowers on a bank or rise, so that I can spot it and never kneel to it.
34. As a player, I want Duskcap as a cluster of dark purple caps that glow faintly in the mine, so that I can find it in the dark.
35. As a player, I want to take a clump with one low slice of the knife through its stems, so that gathering an herb is one clean motion.
36. As a player, I want a slice through the leaves to trim one and say "cut lower", so that I learn the motion without losing anything.
37. As a player, I want 2 herbs to pop up and fly to my bag from a clump, so that one clump makes one healing potion.
38. As a player, I want a cut clump to show short stems until it grows back, so that I can tell it's been taken.

### Gathering spots in Oakvale

39. As a player, I want 8 copper veins: 2 near the smithy at the village's edge, 2 beside the old mine's mouth, 2 in the mine's upper galleries, 1 on the watchtower's hill and 1 by the standing stones, so that mining takes me round the zone.
40. As a player, I want 8 clumps of Hearthleaf: 3 in the farm's fields, 1 by the road south, 1 by the bridge, 2 on the pond's shore and 1 by the standing stones, so that the healing herb is common.
41. As a player, I want 6 clumps of Duskcap: 2 in the deep woods, 2 round the lumber camp and 2 in the mine's upper galleries, so that the rarer herb takes me somewhere dangerous.
42. As a player, I want some spots among the camps, so that gathering sometimes means clearing a camp or slipping past it.
43. As a player, I want a spot to refill 3 minutes after I take it, and only once I'm 30 m away, so that it never grows back in front of me.
44. As a player, I want no spots in the crypt below the breach or in Brackenmoor, so that the deep mine stays about the Warden and the moor stays bare.

### Stations and hands

45. As a player, I want my sword and shield to become the smith's hammer and tongs as I step up to the anvil, so that I'm ready to work without reaching for anything.
46. As a player, I want my weapons to become bare, gloved hands as I step up to the alchemy bench, so that I can hold a pestle and a spoon.
47. As a player, I want my weapons back as I step away from a station, so that I leave ready to fight.
48. As a player, I want a station never to take my weapons while anything fights me, so that the smithy is never a trap.
49. As a player, I want anything I let go of at a station to glide back to its place, so that nothing is dropped, spilled or knocked off.

### Smithing

50. As a player, I want a board beside the anvil, like the talk board, listing the recipes I know with what each takes and what I have, greyed when I'm short, so that I choose what to make with one press.
51. As a player, I want pressing a recipe to take its materials out of my bag onto the station, so that I never carry ore from the bag by hand.
52. As a player, I want smelting to be a wait: two ore in the crucible become a bar in 3 s with embers and a bubbling sound, so that the dull step is short.
53. As a player, I want a whetstone hammered cold on the anvil with 3 glowing marks, so that it's 3 to 6 strikes.
54. As a player, I want copper gauntlets to take four bars into the fire as one blank, heated with the tongs, then hammered on 5 marks, so that the gauntlets feel like real work.
55. As a player, I want a strike from 1.2 m/s to work a mark halfway and one from 2.2 m/s to work it at once, with bigger sparks and a brighter ring, so that a good hand is quicker.
56. As a player, I want hot metal to stay workable about 10 s out of the fire and cold metal simply to stop working until I heat it again, so that heat is a rhythm, not a failure.
57. As a player, I want to quench the gauntlets in a bucket beside the anvil, with a hiss, steam and a long soft buzz, so that the make has a finishing beat.
58. As a player, I want what I made to fly to my bag with a chime and "+1 Smithing", so that I can make the next one at once.
59. As a player, I want the thing to wait on the anvil if my bag is full, so that nothing I made is ever lost.
60. As a player, I want to choose which version of the gauntlets (of Strength, of Agility, of Intellect) on the board, so that I make the one for my class.
61. As a player, I want walking off mid-work to leave the work where it stands (cooling) and the tools to go back, so that I can leave at any moment.

### Alchemy

62. As a player, I want the alchemy bench against the house's back wall, with a mortar, a pot over a small burner, flasks on stands and herbs hanging, so that it's a place to work.
63. As a player, I want the herbs I drop in the mortar to choose the recipe, so that there's no menu to press.
64. As a player, I want a note pinned at the back of the bench listing the recipes I know and what each takes, so that I know what to drop.
65. As a player, I want to grind the herbs with 3 turns of the pestle (pounding counts too), with a crunch and a tick each half turn, so that grinding is rhythmic.
66. As a player, I want the mortar to tip itself into the pot and the pot to pour itself into the flask, so that I never aim a small mouth at a smaller one.
67. As a player, I want to stir the pot with 3 turns of the spoon while the brew changes colour, so that I watch it become a potion.
68. As a player, I want the finished potion corked and glowing on its stand, to put at my hip or drink, so that I can belt it straight from the bench.
69. As a player, I want a potion I leave on its stand to go to my bag as I step away, so that I never lose one.
70. As a player, I want a brew I walk away from to wait where it stands, so that nothing times out.

### What professions make

71. As a player, I want a minor healing potion (2 Hearthleaf) healing 40% of my health, the same as the innkeeper's, so that I can make my own instead of buying them.
72. As a warrior, I want a rage draught (2 Duskcap) that gives 30 rage, so that I can open a hard fight with an ability ready.
73. As a mage, I want a minor mana potion (1 Hearthleaf and 1 Duskcap) that gives back 40% of my mana, so that a long fight doesn't leave me empty.
74. As a ranger, I want an elixir of the keen eye (2 Hearthleaf and 1 Duskcap) giving 10% more damage for 5 minutes, so that the ranger has something of their own.
75. As a warrior or ranger, I want a whetstone (1 rough stone) that I rub along my blade or my arrowheads for 5% more damage for 10 minutes, so that sharpening is a small ritual before a fight.
76. As a player, I want copper gauntlets (4 copper bars) in my class's version, a green of item level 5 that shows on my hands, so that I can make my own gloves.
77. As a player, I want the rage draught and the mana potion to share the belt's 60 s potion cooldown, so that no potion beats a fight on its own.
78. As a player, I want one whetstone and one elixir on me at a time, each with no cooldown, so that buffs stay simple.
79. As a player, I want a small icon with the time left while a whetstone or elixir is on me, so that I know when to renew it.
80. As a player, I want the innkeeper to sell only the minor healing potion, so that everything else is a crafter's.
81. As a player, I want vendors to buy every material and everything I make at fixed prices, so that gathering also pays in coins.

### Growing a profession

82. As a player, I want each spot I empty to give 1 proficiency in its gathering profession, so that practice counts.
83. As a player, I want each thing I make to give 1 proficiency (3 for gauntlets), so that making counts too.
84. As a player, I want "+1 Mining" to float up small where I took the ore or made the thing, like "+N XP", so that I see myself improve.
85. As a player, I want proficiency to stop at my grade's cap (Apprentice's 25) until a trainer teaches the next grade, so that the next zone has something to teach.
86. As a player, I want recipes and spots that need proficiency (rage draught and mana potion at 5, the elixir at 10, the gauntlets at 15) shown in grey until I have it, so that I know what's next.
87. As a player, I want the trainer's board to gain a "Train" button that lists my grade's recipes with their price and the proficiency each needs, so that I can buy recipes where I learned the profession.
88. As a player, I want each profession shown on the bag panel as "Mining: Apprentice 12/25", so that I can check my progress.
89. As a player, I want "Mining: Journeyman" and a sound when I reach a new grade in a later zone, so that the moment is marked.

### The trainers in the village

90. As a player, I want the smith to keep hammering and add a line once I've learned ("Keep your pick sharp and your fire hot."), so that the village notices.
91. As a player, I want the herbalist to bark about Hearthleaf by the road, and once I've learned, to ask for Duskcap from the old mine, so that they point me at the spots.
92. As a player, I want the herbalist in undyed linen with a green-stained apron and a herb satchel, grey-haired, at the bench, so that they look like Oakvale's people.

### Saving

93. As a player, I want the professions I've learned, their proficiency and the recipes I know saved with my character, so that nothing is lost between visits.
94. As a player with an older save, I want it to load with no professions learned and everything else as it was, so that a new build never wipes my character.
95. As a player, I want a spot's taken state, a buff's time left and work on a station not saved, so that loading is clean: every spot full, no buffs, stations empty.

### Checking it

96. As Tom, I want `?proto=pick`, `?proto=anvil` and `?proto=brew` kept on `main`, so that I can compare the variants on the headset.
97. As a developer, I want the debug handle to teach a profession, set proficiency and fill the bag with materials, so that scripted checks reach any state fast.

## Implementation Decisions

### The professions state

- **A pure professions module** holds one character's professions, with no DOM, no Three.js and no XR, like the adventure state and the inventory module. For each profession learned it keeps the proficiency, the grade and the known recipes. Its operations:
  - **learn** a profession (the gathering one with its pair), which grants the grade's first recipes;
  - **gather** from a spot: given the spot's kind, it says what goes to the bag and how much proficiency the profession gains;
  - **start** a recipe: it checks the recipe is known, the proficiency is enough and the inventory holds the materials, then takes the materials out through the inventory module (materials leave only when a make starts);
  - **finish** a make: it puts the product in through the inventory module, or reports it left on the station if the bag is full, and adds proficiency;
  - **buy** a recipe from a trainer, spending coins through the inventory module.
  Each returns **effects** (proficiency gained, a grade reached, a recipe learned, a refusal and why) for the view to show, as the other two modules do.
- **Refusals are values:** not learned, too little proficiency, missing materials, too few coins, a recipe already known.
- **Recipes and spot kinds are data**, in one table: a recipe's id, its profession, its station, what it takes, what it makes, the proficiency it needs, its proficiency gain and its trainer's price. A spot kind is its profession, its yield and its refill. A later zone adds rows.
- **The cap:** proficiency stops at the grade's cap (Apprentice 25). Things of an earlier grade pay nothing. Oakvale's trainers teach only Apprentice. Journeyman, Expert and Artisan exist as names and caps (50, 75, 100) for later zones _(spec, on Tom's behalf)_.
- **The effects of what's made** (the rage draught, the mana potion, the elixir and the whetstone) are consumables in the inventory's catalogue. Using one reports an effect the Adventure applies to the character: rage, mana, or a timed damage buff. **One buff of each kind** (whetstone, elixir) is on you at a time, and a new one replaces the old. The mana potion's effect waits on the Abilities build to give the mage mana; until then it's in the catalogue with its number and does nothing.

### Items added to the catalogue

| Item | Kind | Stack | Sells for | Notes |
|---|---|---|---|---|
| Copper ore | material | 20 | 1 | |
| Rough stone | material | 20 | 1 | |
| Copper bar | material | 20 | 3 | |
| Hearthleaf | material | 20 | 1 | |
| Duskcap | material | 20 | 1 | |
| Rage draught | consumable | 10 | 3 | 30 rage; a potion, on the shared cooldown |
| Minor mana potion | consumable | 10 | 3 | 40% of mana; a potion, on the shared cooldown |
| Elixir of the keen eye | consumable | 10 | 4 | +10% damage, 5 minutes; not a potion |
| Whetstone | consumable | 10 | 2 | +5% damage, 10 minutes, warrior and ranger; not a potion, never on the belt |
| Copper gauntlets of Strength, of Agility, of Intellect | gear (hands) | 1 | by the rule | green, item level 5, each with Stamina |

The minor healing potion is already in the catalogue at the inventory's 40%, and alchemy makes the same item. Sell prices for materials and consumables are fixed, as the inventory spec says; gear sells by its rule _(spec, on Tom's behalf)_.

### Recipes (Apprentice)

| Recipe | Profession | Takes | Needs | Gain | Trainer's price |
|---|---|---|---|---|---|
| Copper bar | Smithing | 2 copper ore | 0 | 1 | taught |
| Whetstone | Smithing | 1 rough stone | 0 | 1 | taught |
| Copper gauntlets (each version) | Smithing | 4 copper bars | 15 | 3 | 25 coins |
| Minor healing potion | Alchemy | 2 Hearthleaf | 0 | 1 | taught |
| Rage draught | Alchemy | 2 Duskcap | 5 | 1 | 10 coins |
| Minor mana potion | Alchemy | 1 Hearthleaf, 1 Duskcap | 5 | 1 | 10 coins |
| Elixir of the keen eye | Alchemy | 2 Hearthleaf, 1 Duskcap | 10 | 1 | 10 coins |

Buying one of the gauntlets' recipes teaches all three versions _(spec, on Tom's behalf)_. The prices sit against Oakvale's 300 to 400 coins on the plain route (the inventory spec).

### Gathering spots and the tool loop

- **Spots are placed in the zone's plan** beside its places, as camps and chests are, each with its kind and position. They load with their chunk, and the mine's with the mine. One instanced mesh per kind: 3 draw calls for every spot in view, about 150 triangles a vein and 100 a clump.
- **A spot's state** (full, being worked, taken, refilling) lives in the world, not in the save. It refills 180 s after it's taken, once you're 30 m away.
- **The pick** is promoted from prototype C of [Swinging the pick and cutting herbs](issues/05-swinging-the-pick-and-cutting-herbs.md): the sword's committed-swing gate (0.2 m of hand travel at 1 m/s, the head over 2.5 m/s), a glint worth 2.25 against a plain strike's 1, a vein needing 4.5, cracks at a third and two thirds, and the prototype's feedback on the existing instanced particle pools.
- **The knife** uses the lighter gate (0.1 m of travel, the tip over 1.4 m/s). A slice through the bottom 10 cm of the clump takes it.
- **The tool loop** is a third zone built from the belt's mechanics: a 12 cm sphere about 20 cm behind the main-hand hip's potion slot, placed from the headset like the slots, with the grip pressed inside it under 1.5 m/s. It draws the tool for the nearest spot within 3 m and does nothing otherwise, or while anything fights you. A grip taken by any zone never arms a gesture.

### Stations

- **One rule for hands at a station** _(spec, on Tom's behalf)_: stepping within about 1.3 m of a station, facing it and out of a fight, swaps both hands for the station's (the smith's hammer and tongs at the anvil, bare gloved hands at the bench). Stepping back past about 2 m swaps them back. The tool loop is for gathering spots only. This replaces the anvil prototype's draw from the loop, so both stations work alike.
- **The anvil** is promoted from variant A of [Hammering at the anvil](issues/06-hammering-at-the-anvil.md) into the smithy: the recipe board beside the anvil (the talk board's frame), the crucible at the forge's front, the fire, the anvil's glowing marks (3 for the whetstone, 5 for the gauntlets), the strike speeds (a tap under 1.2 m/s, good from 1.2, great from 2.2), about 10 s of heat, and a quench bucket added beside the anvil. The prototype's status card shrinks to one line at most. Raise the anvil's face from 74 cm if the headset says so.
- **The alchemy bench** is promoted from variant B of [Brewing at the alchemy table](issues/07-brewing-at-the-alchemy-table.md) into the house by the well: drop, grind and stir by hand, with the tipping and pouring done by the bench. The herbs dropped choose the recipe among those you know. 3 turns of the pestle and 3 of the spoon; the bench's two acts take about 1.2 s and 2 s. The finished flask waits on its stand, and goes to the bag as you step away.
- **What's made goes to the bag** from the anvil; from the bench it waits on the stand. Either way it stays on the station if the bag is full.

### Trainers and quests

- **The quest system grows to more than one quest giver and more than one active quest.** Today's adventure state knows one chain, Marshal Hale's, with one quest under way at a time. It becomes a list of chains, each with its giver: Hale's chain of three, the smith's "Ore and Fire" and the herbalist's "Leaves for the Pot". Up to three quests can be active at once, one per giver. Markers, the talk board and the tracker read from the giver. The save's quest progress is keyed by quest id as today, so the new quests add entries.
- **New objective kinds:** gather from a kind of spot (N times), and make a recipe (N times). Both count through the same events the professions module reports.
- **The tracker** lists each active quest with its lines, newest at the bottom. The quest arrow sits beside the first unfinished objective of the quest taken most recently. The intro quests' places are the smithy's veins and the anvil, and the fields and the bench.
- **Accepting an intro quest teaches** the pair of professions and hangs the tool on the loop. Its hand-in pays XP (as a level-2 quest) and 5 coins; the whetstone or potion made for it stays yours.
- **Both open once Raiders in the Fields is handed in**, and neither blocks Hale's chain.
- **The smith becomes a trainer** (a quest giver who also teaches), and keeps their spot at the anvil. The anvil is theirs to hammer until you step up. **The herbalist is a new friendly character** in the one human body, standing at the bench in the house by the well. They're drawn only while the house is, like the villagers indoors.
- **The "Train" button** on a trainer's board opens a list of the grade's recipes in the talk board's frame, with price and proficiency, grey until you can buy. It stays the talk board's plain first pass until Tom's UI overhaul.
- **Barks** as in [Trainers and first lessons](issues/09-trainers-and-first-lessons.md), through the existing bark system.

### The view in VR

- **Floating text:** "+1 Mining" small where the ore flew or the thing was made, in the XP float's style but white; "Mining: Journeyman" with a sound at a new grade.
- **Buff icons:** a small whetstone and flask icon with its minutes left beside the belt HUD while one is on you.
- **The bag panel** gains a line per learned profession under the coin count ("Mining: Apprentice 12/25").
- **Every new number** goes into the one table of tunables, in a professions group, as every number is today.

### Saving

- **The record's next version** adds, per character, each profession learned with its proficiency and grade, and the recipes known. It goes in the Abilities map's per-character record once its roster lands, or in the current single record otherwise. The migration from the version before adds no professions; nothing is paid retroactively. The build bumps whatever the version is when it lands, as the inventory spec says.
- **It writes** when a profession is learned, a recipe bought, proficiency gained and a grade reached, through the existing save controller. The materials and products are the inventory's writes.

### Prototypes

- `?proto=pick`, `?proto=anvil` and `?proto=brew` stay on `main` as they are, marked PROTOTYPE, so Tom can try the variants on the headset. The build moves what's kept into the real modules; the prototypes then import from there or keep their own copies. Removing them is Tom's call later.

## Testing Decisions

- **A good test drives a module through its interface and checks what a player would notice:** what went into the bag, what proficiency became, what was refused and why, which recipes are known, what a quest's counts are. It never reads private fields. Tests run in Vitest with no browser, WebGL or XR, as today.
- **The seams** _(the skill's check with the user, taken on Tom's behalf)_: one new seam and three existing ones.
  1. **The professions module** (new, the main one): learn, gather, start, finish and buy in, effects and refusals out, working against a real inventory module.
  2. **The adventure state** (existing): chains from several givers, three active quests, and the gather and make objectives.
  3. **The inventory module** (existing): the new items stack, sell and drink as the rules say, and the new consumables' effects are reported.
  4. **The save record** (existing): the new version's migration and a round trip.
- **The professions module:**
  - Learning grants the pair and the first recipes; learning twice is refused.
  - Gathering each spot kind yields its items and 1 proficiency; nothing past the cap.
  - Starting a recipe with missing materials, too little proficiency or an unknown recipe is refused and takes nothing; a started recipe takes exactly its materials.
  - Finishing puts the product in the bag, or reports it left with a full bag.
  - Buying spends coins and refuses with too few or when already known.
  - Grades: the cap stops gains; a later grade's teaching lifts it.
- **The adventure state:** both intro quests open when Raiders in the Fields is handed in; accepting one teaches the pair; the gather and make objectives count; three quests are active at once and Hale's chain goes on untouched.
- **The inventory module:** the rage draught and mana potion share the 60 s cooldown with the healing potion; the whetstone and the elixir report their buffs, and a second replaces the first; vendors buy the new items at their fixed prices.
- **Saving:** a record from the version before loads with no professions; professions, proficiency and recipes round-trip.
- **Not unit-tested:** how the swings, strikes, grinding and stirring feel, and the tool loop's reach. These are checked in headless Chromium with the IWER emulator, as the prototypes' `checks/anvil.mjs` and the inventory's `bag.mjs` and `belt.mjs` do, and by Tom on the Quest.
- **Prior art:** the inventory tests (a pure module, effects out), the adventure state's and quest chain's tests, the saving tests, and the three prototypes' scripted checks.

## Out of Scope

- Cooking, Fishing and any other profession.
- Crafted gear better than drops; random stats; durability and repair.
- Journeyman and later grades' materials, recipes and trainers: they come with later zones.
- The bag, belt, stash and vendors themselves: the inventory spec. This spec only adds items and the tool loop.
- What rage, focus and mana are and how the ranger and mage fight: the Abilities map. The mana potion's effect waits on the mage.
- Trading between players: the game is single-player.
- The talk-and-tracking UI overhaul Tom plans after Oakvale; the Train list and the recipe board reuse today's talk board.
- Gathering spots in Brackenmoor, which stays bare.

## Further Notes

Calls made in this spec on Tom's behalf, beyond the map's tickets:

- One rule for hands at a station: stepping up swaps both hands for the station's; the tool loop is for gathering spots only. This replaces the anvil prototype's draw from the loop.
- The minor healing potion heals 40%, the inventory's number, not ticket 03's 35%.
- Materials and consumables sell for fixed prices (1 to 4 coins); the gauntlets sell by the gear rule.
- Recipe prices: 10 coins for each alchemy recipe past the first, 25 for the gauntlets. Buying the gauntlets' recipe teaches all three versions.
- Grade caps after Apprentice: Journeyman 50, Expert 75, Artisan 100.
- Intro quests pay XP as a level-2 quest and 5 coins.
- A potion left on the bench's stand goes to the bag as you step away.
- Buffs show as small icons with minutes left beside the belt HUD.

Things for Tom to check on the headset are listed in each prototype ticket's answer: [Swinging the pick and cutting herbs](issues/05-swinging-the-pick-and-cutting-herbs.md), [Hammering at the anvil](issues/06-hammering-at-the-anvil.md) and [Brewing at the alchemy table](issues/07-brewing-at-the-alchemy-table.md).
