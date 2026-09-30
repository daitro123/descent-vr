# Brewing at the alchemy table

Type: prototype
Status: resolved
Blocked by: 01, 03

## Question

How does making a potion feel at the alchemy table?

- **Choosing:** how you pick what to brew, matching however the anvil does it ([Hammering at the anvil](06-hammering-at-the-anvil.md)) unless brewing wants its own way.
- **Working it:** grinding herbs in a mortar, dropping them into a flask or pot, stirring, pouring; which of these the hands do and which just happen, and what you can get right or wrong, in a few seconds.
- **Getting it:** the potion left on the table to take, or in the bag; how it fits the belt's grab-and-drink.
- **Test:** a throwaway table scene to try on the Quest 3. Link it here.

## Answer

Settled on 2026-09-30 **by Claude on Tom's behalf**: Tom asked for prototypes to be built and chosen without him. The pick is from building the three variants and driving each through a whole brew with scripted hands in a desktop browser, **not yet from the headset**, so treat it as medium confidence until Tom has tried it. Every number is a starting point to tune on the Quest 3.

**Try it:** `?proto=brew` (code in `src/professions/prototypes/brew/`, kept on `main` until Tom has tried it). You start in the house by the well, at a waist-high bench against the right-hand wall, the hearth to your left. Click the left stick for the next variant; `?proto=brew&variant=B` starts on one. The note pinned at the back of the bench shows the recipe, each act, whether your hands or the table do it, and how long the last brew took.

**The pick: B, "Grind and stir".** You drop 2 Hearthleaf in the mortar and grind them with the pestle; the mortar lifts and tips the powder into the pot by itself; you stir the pot; the pot lifts and pours itself into the flask, which corks itself. Your hands do three things (drop, grind, stir) and the table does two.

The three variants differ only in how many of the five acts are yours:

| Variant | Your hands do | The table does | Scripted brew |
|---|---|---|---|
| A · Every step by hand | drop, grind, tip the mortar over the pot, stir, pick the pot up and pour | nothing | 8.2 s |
| **B · Grind and stir** | drop, grind, stir | tip, pour | 7.5 s |
| C · Drop in and watch | drop straight in the pot | stir, pour | 3.9 s |

The times come from a scripted hand in a slow headless browser, so they only rank the variants; a person will be slower on A and B. Our estimate for a person is about 15 to 20 s for A, 8 to 10 s for B and 4 s for C.

**Why B:**

- **Grinding and stirring are the acts worth doing by hand.** They're rhythmic, they can't be aimed wrong, and they carry the feedback: a crunch and a tick in the hand every half turn of the pestle, a slosh and bubbles every half turn of the spoon, and the brew going from green to glowing red as you stir. A tidy, quick hand finishes sooner and a slow one just takes longer, which is what the research says skill should buy.
- **Tipping and pouring are the fiddly acts.** Both ask you to hold a small mouth over a smaller one at arm's length and tilt, which is aim with no reward, and pouring is where faked liquids go wrong (Job Simulator's 850 hours). A spends about half its time there. In B they happen by themselves in about a second each, and they're the moment the colour shows off.
- **C is too little.** Dropping two leaves and watching is quick, but nothing your hands do matters, which goes against the map's standing preference that crafting is physical. It's Waltz of the Wizard's payoff without the discovery that makes Waltz work, since there's one known recipe here.

**Choosing a recipe:** what you drop in chooses it. Two Hearthleaf in the mortar is a minor healing potion; with more recipes (Oakvale's rage draught, mana potion and elixir), the herbs you drop decide which one brews, with no menu or board to pick from. The prototype has only the minor healing potion, since a new alchemist knows only that one, and the note on the bench lists it. This is brewing's own way, not a copy of the anvil's: herbs are the recipe in a way a copper bar isn't.

**Nothing fails.** Whatever you let go glides back to its place (a leaf to the tray, a tool to its rest), so nothing is dropped, spilled or knocked off. A leaf let go over the mortar drops in; a third leaf can't go in. Grinding counts pounding too (a quick blow to the bottom is a third of a turn), for players who pound instead of circling. There's no ruined brew.

**At the table your hands are free.** Within about 1.3 m of the bench the sword and shield go away and a pair of gloved hands takes their place; step back and they return. A held pestle, spoon or pot hides the hand (Owlchemy's "tomato presence"); a leaf or a flask doesn't.

**Getting it:** the potion ends corked and glowing on its stand. Take it and put it at your hip to belt it, or lift it to your mouth to drink it. Drinking starts the 60 s shared potion cooldown, and belted flasks dim until it's over. Once the flask leaves the stand the bench resets for the next brew. The prototype's two hip loops stand in for Inventory's belt slots; a potion made with the belt full should go to the bag, which is Inventory's to say.

**For the spec:** 3 turns of the pestle and 3 of the spoon, the leaf dropping in when let go within about 10 cm of the mortar's mouth, the stir counted only with the spoon's bowl in the brew, the table's two acts at about 1.2 s and 2 s. Walking off mid-brew keeps the brew where it stands, since nothing times out.

## Comments

**2026-09-30:** Tom asked for prototypes to be built and chosen without him, with the code kept in the repo for him to check later. So this prototype is built in its own session and merged to `main` behind `?proto=brew` (code in `src/professions/prototypes/`, marked as a prototype), with two or three variants switchable in the headset by clicking the left stick (the prototype has no run), as the `?talk` prototype was. The session picks the best variant itself, records the verdict and why under Answer, and leaves the code on `main` until Tom has tried it. The patterns to start from are in [VR gathering and crafting](../research/vr-gathering-and-crafting.md).
