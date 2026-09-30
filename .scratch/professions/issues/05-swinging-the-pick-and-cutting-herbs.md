# Swinging the pick and cutting herbs

Type: prototype
Status: open
Blocked by: 01, 02

## Question

How should gathering feel in the hand: what makes a strike on a vein good or bad, and how do you take an herb?

- **The pick:** how many strikes to break a vein, whether where and how hard you hit matters (a glinting weak spot, swing speed like the sword's), what the vein does as it breaks, and what drops (chunks you pick up, or ore that goes straight to the bag).
- **The herb:** cut with the knife, or pulled by hand, and whether there's anything to get right (cutting low, not crushing it).
- **Feedback:** sparks, sound, the rumble in the controller, the vein cracking.
- **Test:** a throwaway scene (a vein and a clump of herbs, the pick and the knife in hand) to try on the Quest 3, with two or three variants to compare. Link it here.

## Comments

**2026-09-30:** Tom asked for prototypes to be built and chosen without him, with the code kept in the repo for him to check later. So this prototype is built in its own session and merged to `main` behind `?proto=pick` (code in `src/professions/prototypes/`, marked as a prototype), with two or three variants switchable in the headset by clicking the left stick (the prototype has no run), as the `?talk` prototype was. The session picks the best variant itself, records the verdict and why under Answer, and leaves the code on `main` until Tom has tried it. The patterns to start from are in [VR gathering and crafting](../research/vr-gathering-and-crafting.md).
