# Brewing at the alchemy table

Type: prototype
Status: resolved
Blocked by: 01, 03

## Question

How does making a potion feel at the alchemy table?

- **Choosing:** how you pick what to brew, matching however the anvil does it ([Hammering at the anvil](06-hammering-at-the-anvil.md)) unless brewing wants its own way.
- **Working it:** grinding herbs in a mortar, dropping them into a flask or pot, stirring, pouring; which of these the hands do and which just happen, and what you can get right or wrong, in a few seconds.
- **Getting it:** the potion ends corked and glowing on its stand. Take it and put it at your hip to belt it, or lift it to your mouth and hold it there to drink it (0.7 s, as Inventory's `?belt` settled). Drinking starts the 60 s shared potion cooldown, and belted flasks dim until it's over. Once the flask leaves the stand the bench resets for the next brew. The prototype's two hip loops only stand in for Inventory's belt slots, which hold a stack each and refill from the bag; a potion let go at a slot joins its stack, and one made with no room goes to the bag, which is Inventory's to say.

**For the spec:** 3 turns of the pestle and 3 of the spoon, the leaf dropping in when let go within about 10 cm of the mortar's mouth, the stir counted only with the spoon's bowl in the brew, the table's two acts at about 1.2 s and 2 s. Walking off mid-brew keeps the brew where it stands, since nothing times out.

## Comments

**2026-09-30:** Tom asked for prototypes to be built and chosen without him, with the code kept in the repo for him to check later. So this prototype is built in its own session and merged to `main` behind `?proto=brew` (code in `src/professions/prototypes/`, marked as a prototype), with two or three variants switchable in the headset by clicking the left stick (the prototype has no run), as the `?talk` prototype was. The session picks the best variant itself, records the verdict and why under Answer, and leaves the code on `main` until Tom has tried it. The patterns to start from are in [VR gathering and crafting](../research/vr-gathering-and-crafting.md).
