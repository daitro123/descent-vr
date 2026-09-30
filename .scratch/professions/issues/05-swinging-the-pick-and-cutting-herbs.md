# Swinging the pick and cutting herbs

Type: prototype
Status: resolved
Blocked by: 01, 02

## Question

How should gathering feel in the hand: what makes a strike on a vein good or bad, and how do you take an herb?

- **The pick:** how many strikes to break a vein, whether where and how hard you hit matters (a glinting weak spot, swing speed like the sword's), what the vein does as it breaks, and what drops (chunks you pick up, or ore that goes straight to the bag).
- **The herb:** cut with the knife, or pulled by hand, and whether there's anything to get right (cutting low, not crushing it).
- **Feedback:** sparks, sound, the rumble in the controller, the vein cracking.
- **Test:** a throwaway scene (a vein and a clump of herbs, the pick and the knife in hand) to try on the Quest 3, with two or three variants to compare. Link it here.

## Answer

Settled on 2026-09-30 **by Claude on Tom's behalf**: Tom asked for prototypes to be built and chosen without him. **Variant C wins: strike the glint, the ore flies to the bag, cut the herb low with the knife.** It was judged from the research and from driving every variant end to end in the emulator with scripted swings (real controller poses through the real hit detection), not on the Quest 3. Every number is a starting point to tune on the headset.

**Try it:** `?proto=pick` (code in `src/professions/prototypes/pick/`, kept on `main` until this is built). You start outside the old mine with a copper vein on your left and a clump of Hearthleaf on your right. Squeeze the grip in the tool loop behind your right hip to draw the tool for the nearer spot. Click the left stick to go from A to B to C; `&variant=C` starts on one. A board between the two spots shows every strike and cut as it happens.

| | A: Swing hard, slice | B: Strike the glint, pull | **C: Strike the glint, slice** |
|---|---|---|---|
| A strike counts | by head speed: 1 at the gate, 1.5 at full power | 2.25 in the glint, 1 elsewhere on the ore | as B |
| To break the vein | 3 full or 5 gentle strikes | 2 glints or 5 plain | as B |
| It drops | 3 chunks to pick up | 3 ore that fly to the bag | as B |
| The herb | knife, a slice low through the stems | grab with either hand and pull up | as A |

**Why C.**
- **The glint gives aim a reason, and the eye something to go for.** Under the speed rule the only skill is swinging harder, which the research warns tires the shoulder (overhead swings, gorilla arm), and you can't see what counted except by the size of the sparks. The glint asks for a well-placed strike at a comfortable speed, and a player who hits it breaks the vein in 2 swings instead of 5. That is Tom's "timing or aim matters" and the research's "skill changes speed, not the item" at once.
- **Ore to the bag, not chunks on the ground.** Chunks meant bending to the ground three times with a pick in one hand and a shield in the other, and they can roll where you don't want to reach. The research says to keep gathering off the floor. A short beat (0.35 s) to see the ore come loose keeps the moment.
- **The knife, not the pull.** Tom's charting settled that tools come from the belt and named the knife, and ticket 02 gives it from the loop. The slice uses the same committed-swing rule as the pick and the sword, so there is one thing to learn, and "cut low, through the stems" is something to get right without a way to ruin the herb. The pull was pleasant (rising rumble, a pop) but works best with an empty hand, and every class has something in each hand. Its rising rumble is worth borrowing for the knife's cut if the slice feels thin on the headset.

**What each question settled.**
- **The pick:** a strike counts only on a committed swing, the sword's gate: 0.2 m of hand travel at 1 m/s, with the head's point over 2.5 m/s (the sword's tip needs 2.8 m/s a metre out; the pick's head is about half as far). One strike per swing. Slower contact is a tap: a dull clink and a 20 ms buzz, nothing else. A hot strike on bare rock off the ore gives a thunk and grit and doesn't count. The vein needs 4.5: a glint strike is 2.25 and a plain one 1, so 2 to 5 strikes, a few seconds of swinging. The glint moves after every strike.
- **The vein as it breaks:** cracks appear at a third and at two thirds, then it bursts in copper-coloured rubble and dust, the ore goes dark, and 3 copper ore fly to the bag. It refills after the spot's refill time (6 s in the prototype so you can go again).
- **The herb:** drawn from the loop within 3 m of the clump, the knife cuts on a lighter gate (0.1 m of hand travel, tip over 1.4 m/s). A slice through the stems (the bottom 10 cm) takes the whole clump, 2 Hearthleaf, which pops up and flies to the bag. A slice through the leaves only trims one and says "cut lower". A slow knife or hand just rustles it. The clump sits on a bank at knee height, so nobody kneels.
- **Feedback, sized to the hit:** a plain strike gives sparks (6 to 20, by power), a clank whose ring grows with power, a pulse of 0.45 to 0.9 and a copper flash. A glint strike gives 30 bright sparks and embers, a long bright ring, a white flash and a double pulse (1.0, then 0.8). The break is a crunch, rubble and a 150 ms pulse at full strength. All particles use the existing instanced pools (no new draw calls per spark, no lights).
- **Not settled here:** a short hit-stop on a glint strike (the research suggests one; without enemies there was nothing to freeze) and whether 2.5 m/s suits Tom's arm, both for the headset.

## Comments

**2026-09-30:** Tom asked for prototypes to be built and chosen without him, with the code kept in the repo for him to check later. So this prototype is built in its own session and merged to `main` behind `?proto=pick` (code in `src/professions/prototypes/`, marked as a prototype), with two or three variants switchable in the headset by clicking the left stick (the prototype has no run), as the `?talk` prototype was. The session picks the best variant itself, records the verdict and why under Answer, and leaves the code on `main` until Tom has tried it. The patterns to start from are in [VR gathering and crafting](../research/vr-gathering-and-crafting.md).
