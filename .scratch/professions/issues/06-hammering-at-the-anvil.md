# Hammering at the anvil

Type: prototype
Status: resolved
Blocked by: 01, 03

## Question

How does making something at the forge and the anvil feel, from choosing what to make to taking it off the anvil?

- **Choosing:** how you pick a recipe at the station (a board like Marshal Hale's talk board, laying materials on the anvil, or a pattern on the wall) and how the materials go in.
- **Working it:** heating in the forge, hammering on the anvil with a timing or target to hit, quenching, and how many strikes a thing takes (a few seconds in all).
- **Getting it:** whether the finished thing is left on the anvil for you to take or goes to the bag, and what happens if you walk off mid-work.
- **Test:** a throwaway anvil scene to try on the Quest 3, with two or three variants of the hammering. Link it here.

## Answer

Settled on 2026-09-30 **by Claude on Tom's behalf**: Tom asked for prototypes to be built and chosen without him. Picked from the prototype and the [research](../research/vr-gathering-and-crafting.md), driven with emulated controllers but not yet tried on the Quest 3, so every number is a starting point to tune there. The prototype stays on `main` for Tom to try: `?proto=anvil` (code in `src/professions/prototypes/anvil/`, its numbers in `TUNE` in `station.ts`), and its scripted check is [checks/anvil.mjs](../checks/anvil.mjs).

**The pick: variant A, "Board and marks".** Choose on a board at the anvil; hammer glowing marks; what you make goes straight to your bag.

**The three variants** (the left stick click switches; each starts over with a full bag):

| | Choosing | Hammering | Getting it |
|---|---|---|---|
| **A · Board and marks** | Press a recipe on a board beside the anvil; its materials come out of the bag onto the station | Strike the glowing marks | Flies to your bag |
| B · Lay it out, marks | Take materials off a tray (the bag's stand-in) with the tongs and lay them on the station: ore in the crucible, a stone on the anvil, four bars in the fire | Strike the glowing marks | Take it and let go: into the bag |
| C · Lay it out, on the beat | As B | Strike anywhere on the work as a ring closes on a beat | As B |

**Why A.**

- **Choosing on a board beats laying things out.** It's one press, it shows every recipe with what it takes and what you have (greyed when you're short), and it's the talk board you already know from Marshal Hale, so the trainer's "Train" button (ticket 09) and this board are one kind of thing. Laying out is more physical, but every choice is a trip from the bag to the station, the station has to guess the recipe from what you laid, and the real bag (Inventory's, over the shoulder) would put a pick-a-slot step in front of every trip. The work itself stays physical in A: the fire, the anvil and the quench are all done by hand with the tongs.
- **Marks beat a beat.** The marks are the research's best idea: the shape is the progress bar, each strike lands where you aimed and dents it, and you go at your own pace, which is what "a calm thing to do with your hands" asks. The beat makes you wait for the ring, adds a second pressure on top of the heat, and a real swing's timing varies with its size, so a good hard strike can land off the beat and count for nothing. It stays as the thing to try if the marks feel too easy on the headset.
- **Straight to the bag.** Made is marked by a chime, "+1 Smithing" and the thing flying to your hip. Taking it by hand every time (B and C) adds a grab and a carry to every make for no decision.

**How it works in A** (every one of these is in all three variants unless said):

- **At the anvil, the tool loop gives the hammer and the tongs** (ticket 02's loop, extended from gathering spots to stations): grip behind your right hip within 3 m of the anvil and the sword becomes the smith's hammer and the shield the tongs (the off hand needs its tongs to hold hot metal). Grip there again, or walk more than 5 m away, and your sword and shield come back.
- **Smelting** is a wait, not a skill: two ore in the crucible at the front of the forge become a bar in 3 s, with embers and a bubbling sound. On the board the bar goes to the bag.
- **The whetstone** is hammered cold: the stone lies on the anvil with **3 marks**. **Copper gauntlets** take four bars into the fire as one blank, which glows full in 1.5 s; the tongs carry it to the anvil, which has **5 marks**.
- **A strike** is the hammer's face coming down onto the work after at least 8 cm of travel. Under 1.2 m/s it's a tap (a dull clink, a light buzz, nothing else). From 1.2 m/s it's **good**: it works a mark halfway. From 2.2 m/s it's **great**: it works a mark at once, with more sparks, a brighter ring and a flash. A strike more than 4 cm off an unworked mark, or on metal gone cold, gives small sparks and does nothing. So a whetstone is 3 to 6 strikes and the gauntlets 5 to 10, as the research asks: a good hand buys speed, never a worse thing (ticket 08).
- **Heat is a window, not a fail state**: out of the fire the blank stays workable for about 10 s, enough for ten good strikes at a steady pace (the first try, 7 s, ran cold after seven good strikes in the checks). Cold, it just stops working until it's been back in the fire; nothing is ruined.
- **Quench** by dipping the shaped gauntlets in the bucket in the tongs: a hiss, steam and a long soft buzz, and they're made. The prototype adds a **bucket beside the anvil**: the smithy's barrel is across the room, 3 m away, too far to carry to after every make.
- **Walking off mid-work** loses nothing: what's on the anvil or in the fire stays there (cooling), what's in the tongs goes back where it lay, and the tools go back at 5 m.
- **The status card** over the anvil says what to do next and shows the heat; it's prototype scaffolding, and the real thing should say it with the marks, the glow and one line at most.

**To check on the headset:** the hammer's face is modelled pointing down from the fist (the grip's −Y), which the emulator can't confirm; the anvil's face is at 74 cm, which may want raising for a standing player (the research's waist-to-chest); and the 1.2 and 2.2 m/s strike speeds.

**What this sends on:** ticket 08 (a better hand buys speed; nothing is wasted), ticket 09 (the recipe board at the anvil and the trainer's board should be one design), the Inventory thread (made things go to the bag, and a recipe's materials come out of it without a trip), and the Oakvale smithy (a quench bucket within reach of the anvil).

## Comments

**2026-09-30:** Tom asked for prototypes to be built and chosen without him, with the code kept in the repo for him to check later. So this prototype is built in its own session and merged to `main` behind `?proto=anvil` (code in `src/professions/prototypes/`, marked as a prototype), with two or three variants switchable in the headset by clicking the left stick (the prototype has no run), as the `?talk` prototype was. The session picks the best variant itself, records the verdict and why under Answer, and leaves the code on `main` until Tom has tried it. The patterns to start from are in [VR gathering and crafting](../research/vr-gathering-and-crafting.md).
