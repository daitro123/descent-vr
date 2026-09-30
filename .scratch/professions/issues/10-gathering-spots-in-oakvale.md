# Gathering spots in Oakvale

Type: grilling
Status: resolved
Blocked by: 03, 05

## Question

Where are Oakvale's veins and herbs, how many, how do you spot them, and how do they refill?

- **Where:** veins in the old mine (among the undead, or only in the upper, bandit-dug galleries) and on the hills; herbs in the fields, the woods, by the stream and the pond. Near camps, so you gather among enemies, or away from them.
- **How many and how fast:** enough for a potion run without a long grind; charting chose fixed spots that refill a few minutes after they're taken, as camps do. Whether a spot refills only once you're away.
- **Spotting them:** a glint, a colour, a sound, or nothing but their look, given no markers in the world (Oakvale's Getting around).
- **Budget:** each spot's triangles and draw calls, and whether spots load with the chunks.

## Answer

Settled on 2026-09-30 **by Claude on Tom's behalf**: Tom asked for the rest of the map to be worked without him, taking the recommended option each time. Every number is a starting point, and the exact spots are placed when the build lays them out on Oakvale's layout.

- **How much a spot gives,** taking [Swinging the pick and cutting herbs](05-swinging-the-pick-and-cutting-herbs.md)'s numbers over [Oakvale's first tier](03-oakvales-first-tier.md)'s first guess: a copper vein gives 3 copper ore and 1 rough stone, and a clump gives 2 herbs. So a vein and a half makes a pair of bars, three veins a pair of gauntlets, and one clump of Hearthleaf a minor healing potion.
- **22 spots in Oakvale:**
  - **8 copper veins:** 2 in the rocks at the village's edge near the smithy (the intro quest's, about a minute's walk from the anvil), 2 in the ridge beside the old mine's mouth, 2 in the old mine's timbered upper galleries (among the undead, for a reason to go back down), 1 on the watchtower's hill and 1 in the rocks round the standing stones.
  - **8 clumps of Hearthleaf:** 3 in the farm's fields (among its raiders until they're cleared), 1 each by the road south towards the pass and by the bridge, 2 on the pond's shore and 1 in the meadow by the standing stones.
  - **6 clumps of Duskcap:** 2 in the deep woods west of the main road, 2 in the woods round the lumber camp and 2 in the old mine's upper galleries.
  - None in the crypt below the breach or in Brackenmoor, which stays bare.
- **Among enemies:** several spots sit in or near camps, so you clear a camp or slip past its 8 m notice radius to gather. You can't gather in a fight ([Tools on the belt](02-tools-on-the-belt.md)), and a pull puts the tool away.
- **Refilling:** a spot refills 180 s after it's taken, and only once you're 30 m away, as a camp does, so it never grows back in front of you. A taken spot looks taken: the ore goes dark, the stems are cut short.
- **Spotting them, with no markers:** copper veins are green-and-copper streaks in grey rock, bright enough to see from the road; the glint shows only once you draw the pick. Hearthleaf is a knee-high clump of bright leaves with small gold flowers, set on a bank or a rise so nobody kneels. Duskcap is a cluster of dark purple caps that glow faintly in the mine. The herbalist's and the smith's barks point at the nearest ones.
- **Proficiency:** 22 spots refilling every few minutes cover Apprentice's 25 Mining and 25 Herbalism over the hour or two Oakvale takes.
- **Budget:** one instanced mesh per kind (vein, Hearthleaf, Duskcap), so 3 draw calls for every spot in view. About 150 triangles a vein and 100 a clump: all 22 are about 2,800, of which a handful are in view at once. They load with their chunk, and the mine's with the mine.

