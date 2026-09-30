# How a profession grows

Type: grilling
Status: resolved
Blocked by: 

## Question

How does practice move a profession through its tiers, and what is that growth called?

- **Charting settled:** it grows by practice, through a few tiers that follow the zones' materials, and the trainer sells new recipes at each tier.
- **Open:** what counts as practice (each strike, each ore taken, each thing made), whether old recipes stop teaching once you've outgrown them (WoW's grey recipes), how many tiers exist in all and how many steps each takes, whether a tier is capped until you visit the trainer, and how it's shown to you (a number, a bar, a name like "Apprentice").
- **Words:** "skill" and "level" are taken or avoided in `CONTEXT.md` and the Abilities map. Settle this map's word for a profession's growth and for a tier, and add them to `CONTEXT.md`.
- **Fits with:** character levels (sketched to about 20, specced 1 to 10) and zones: does a tier line up with a zone's level range?

## Answer

Settled on 2026-09-30 **by Claude on Tom's behalf**: Tom asked for the rest of the map to be worked without him, taking the recommended option each time. Every number is a starting point, to tune on the headset, and every name is a placeholder.


- **The words:** a profession's growth is its **proficiency**, a number. Proficiency climbs through **grades**: Apprentice, Journeyman, Expert and Artisan, WoW's names. A grade belongs with a tier of materials: Apprentice is Oakvale's copper, Hearthleaf and Duskcap; later grades come with later zones. Both words go in `CONTEXT.md`.
- **Practice is what counts:** emptying a gathering spot gives 1 proficiency, and making something gives 1 (3 for a piece of gear). Swings and strikes don't count on their own, so a botched job isn't a lost point, only a slower one.
- **A grade caps it.** Apprentice runs from 0 to 25. At the cap, practice stops paying until a trainer teaches the next grade. Oakvale's trainers teach only Apprentice (which comes with the intro quest); later zones' trainers teach the rest, and their contents are out of scope.
- **Recipes and spots need proficiency** (see [Oakvale's first tier](03-oakvales-first-tier.md)): within a grade, everything of that grade pays until the grade's cap. Once you're a grade past something, it pays nothing (WoW's grey). No character level is needed for a grade; the next zone's materials gate it naturally.
- **Showing it:** "+1 Mining" floats up small where you took the ore or made the thing, like "+N XP", and "Mining: Journeyman" with a sound at a new grade. The trainer's board and the bag panel show each profession as "Mining: Apprentice 12/25". A recipe you can't make yet shows its proficiency in grey on the trainer's list.
- **Oakvale in numbers:** 25 Mining is about 25 veins and 25 Herbalism about 25 clumps, over the hour or two Oakvale takes, gathering on the way. 25 Smithing or Alchemy is about 25 things made, fewer with gear.
- **Saved per character:** each profession learned, its proficiency and its known recipes.
