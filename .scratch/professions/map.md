# Map: Professions

Label: wayfinder:map

## Destination

A written **spec for professions**, ready to hand off as build tickets: **Mining** with **Smithing**, and **Herbalism** with **Alchemy**, learnable by every class, done by hand at gathering spots and stations, and paying off mostly in consumables for fights. It covers Oakvale's first tier fully and lays down the pattern later zones extend. Its build order waits on the Inventory spec, since everything professions make lands in the bag.

## Notes

- **Domain:** a browser VR action RPG (Three.js + WebXR). The glossary is `CONTEXT.md`; this map adds **profession**, **material**, **gathering spot**, **station**, **trainer**, **proficiency** and **grade**. Don't call a profession's growth a "skill" or a "level": Abilities keeps "ability" and avoids "skill", and a **level** is how strong a character is. Its words are **proficiency** and **grade** (see [How a profession grows](issues/04-how-a-profession-grows.md)).
- **What exists:** nothing to gather or craft, no bag, no coins; enemies drop only healing orbs (`src/world/orbs.ts`), and Hale's longsword replaces your sword at the last hand-in (`src/quests.ts`). Oakvale already has the hooks: the smithy with its forge and anvil and the smith working at it (`src/maps/forest/smithy.ts`, `src/people/work.ts`), the old mine down to the Warden's hall, the farm, the fields and the woods. Villagers are the innkeeper, the smith and the farmer (`VILLAGERS` in `src/quests.ts`). Camps refill 180 s after they're cleared, once you're 30 m off (`CONFIG` in `src/config.ts`).
- **Sibling maps** (both charted 2026-09-30):
  - **Inventory** (`.scratch/inventory/map.md` on `claude/plan-inventory-vkxbvv`): a 16-slot bag where materials and potions stack, coins take no slot, fixed hand-made items with grey/white/green/blue rarity, seven gear slots, two belt slots at the hips for potions (grab one and lift it to your mouth), the bag pulled round from over your shoulder, the smith buys anything and sells basic gear, the innkeeper sells food and potions, a stash at the inn, nothing wears out. Its **Not yet specified** holds a slot for this map's needs; send them to the Inventory thread, never design storage here.
  - **Abilities** (`.scratch/abilities/map.md` on `claude/plan-abilities-8b66c9`): three classes (warrior, ranger, mage), each with its resource (rage, focus, mana); attributes Stamina, Strength, Agility and Intellect rise with level and gear; up to three saved characters; levels sketched to about 20, specced 1 to 10. The belt's two hip slots and the over-the-shoulder reach are taken, and abilities are mostly gestures: a gathering or crafting motion must not collide with them.
- **Controls taken:** A/X the War Cry, B/Y the dash, the left stick click the run.
- **Hardware and testing:** Tom tests alone on his Quest 3. The performance budget is `docs/quest-3-browser-performance-budget.md`: 72 fps, about 300 draw calls, at most 4 point lights.
- **Skills:** grilling tickets call `grilling` and `domain-modeling`. Prototype tickets call `prototype`. Research tickets call `research`, with findings in `.scratch/professions/research/`.
- **Standing preferences** (from charting with Tom, 2026-09-30; he took every recommendation in both rounds):
  - The payoff is mostly **consumables for fights** (potions and the like), plus a few pieces of gear **as good as drops at that level, never better**. What you make can be **sold to vendors** for coins.
  - Professions are a **calm thing to do with your hands** between fights. Gathering and crafting are **physical**: you really swing the pick and really hammer on the anvil, where timing or aim matters, and each takes a few seconds, never a chore.
  - Two pairs: **Mining → Smithing** and **Herbalism → Alchemy**.
  - **Every character can learn every profession**; there's no cap of two. Professions are **per character**.
  - A **villager teaches** each profession, after a short intro quest.
  - A profession **grows by practice through a few tiers** that follow the zones' materials (Oakvale's are tier one), with new recipes bought from the trainer at each tier.
  - **Gathering spots are fixed** and refill a few minutes after you take them, as camps do.
  - **Tools come from the belt**: drawing a pick or a knife replaces your weapon until you put it back, and you can't gather in a fight.
  - **Crafting happens only at a station**: the smithy's anvil and forge, and an alchemy table in the village.

## Decisions so far

<!-- one line per resolved ticket: [title](link): gist -->

- [How VR games do gathering and crafting](issues/01-how-vr-games-do-gathering-and-crafting.md): borrow from A Township Tale (pick swings count by momentum, sparks grade each anvil strike); a good hand buys speed, not a different item; keep each job to a few strikes at waist-to-chest height; no menus, no simulated metal or liquids. Medium confidence: page fetches were blocked.
- [Tools on the belt](issues/02-tools-on-the-belt.md): tools come with the profession, not the bag; one tool loop behind the main-hand hip gives the tool for the nearest gathering spot, in the main hand only, and does nothing in a fight or far from a spot. A pull puts it away.
- [Oakvale's first tier](issues/03-oakvales-first-tier.md): copper ore, rough stone and copper bars; Hearthleaf and Duskcap. Alchemy makes a healing potion for everyone, a rage draught, a mana potion and a ranger's elixir; Smithing makes whetstones and copper gauntlets at par in three versions. Potions share a 60 s cooldown.
- [How a profession grows](issues/04-how-a-profession-grows.md): **proficiency** climbs by practice (1 per spot emptied or thing made) through **grades** (Apprentice to Artisan); Apprentice is Oakvale's, 0 to 25, and a trainer teaches each next grade. No character level needed.
- [Swinging the pick and cutting herbs](issues/05-swinging-the-pick-and-cutting-herbs.md): strike a moving glint on the vein (2 glint strikes or 5 plain ones, on the sword's committed-swing gate), the ore flies to the bag, and the knife takes Hearthleaf with one slice low through the stems. Prototype at `?proto=pick`, variant C.
- [Hammering at the anvil](issues/06-hammering-at-the-anvil.md): A, "Board and marks" (`?proto=anvil`): press a recipe on a board at the anvil like Hale's talk board and its materials come out of the bag; the tool loop there gives hammer and tongs; 3 (whetstone) or 5 (gauntlets) glowing marks, a great strike works a mark and a good one half; heat is a 10 s window; quench in a bucket by the anvil; what you make flies to the bag. Picked without the headset; Tom to try it.
- [Brewing at the alchemy table](issues/07-brewing-at-the-alchemy-table.md): B, "Grind and stir" (`?proto=brew`): you drop 2 Hearthleaf in the mortar, grind them and stir the pot by hand; the mortar tips and the pot pours into the flask by themselves. The herbs you drop choose the recipe, nothing can fail, and the corked flask waits on its stand for the belt or a drink. Picked without the headset; Tom to try it.
- [Trainers and first lessons](issues/09-trainers-and-first-lessons.md): the smith teaches Mining and Smithing; a new herbalist in the house by the well, with the alchemy table, teaches Herbalism and Alchemy. One intro quest per pair after Raiders in the Fields; up to three quests active at once; recipes bought from a "Train" button on the talk board.
- [Gathering spots in Oakvale](issues/10-gathering-spots-in-oakvale.md): 22 spots (8 copper veins, 8 Hearthleaf, 6 Duskcap) through the village's edge, the mine's mouth and upper galleries, the fields, the pond, the woods and the standing stones, several among camps. A vein gives 3 ore and 1 rough stone, a clump 2 herbs. They refill 180 s after they're taken once you're 30 m off, are seen by their look alone, and cost 3 instanced draw calls.
- [Does a better hand make a better thing](issues/08-does-a-better-hand-make-a-better-thing.md): no. A better hand buys speed only (fewer strikes, a quicker brew); yields and items never change, nothing fails and no material is wasted.

## Not yet specified

- **Assembling the spec:** done. The spec is [spec.md](spec.md), written on 2026-09-30 by Claude on Tom's behalf from every decision above. The calls it made beyond the tickets are listed in its Further Notes: prices, grade caps after Apprentice, and one rule for hands at a station. Prices, saving, the later grades' pattern and the budget, once fog here, are settled there or measured in the last build ticket.

## Build tickets

Written on 2026-09-30 from [spec.md](spec.md) with `/to-tickets`, **by Claude on Tom's behalf**, numbered on from the map's ten tickets in the same `issues/` folder. Each lists what genuinely blocks it, including the Inventory map's build tickets where the work sits on the bag or the belt. Each runs in its own session.

1. [11: The professions state and its items](issues/11-the-professions-state-and-its-items.md)
2. [12: Quests from more than one giver](issues/12-quests-from-more-than-one-giver.md)
3. [13: The tool loop and Mining](issues/13-the-tool-loop-and-mining.md) (also waits on Inventory's 10)
4. [14: Herbalism](issues/14-herbalism.md)
5. [15: The smith's anvil](issues/15-the-smiths-anvil.md)
6. [16: The herbalist and the alchemy bench](issues/16-the-herbalist-and-the-alchemy-bench.md)
7. [17: Using what professions make](issues/17-using-what-professions-make.md) (also waits on Inventory's 10)
8. [18: Trainers and intro quests](issues/18-trainers-and-intro-quests.md) (also waits on Inventory's 09)
9. [19: Oakvale with professions, in one sitting](issues/19-oakvale-with-professions-in-one-sitting.md)

`/to-tickets` would have asked Tom about granularity, edges and splits; answered **on his behalf**:

- **Granularity:** nine tickets, each sized for one session to build, test and merge. The pure state and the quest system come first as prefactors, then one ticket per profession's place in the world, then using the products, then the trainers that tie it together, and a last play-through that tunes and measures.
- **Edges:** 11 and 12 can start now and run side by side. 15 and 16 follow 11 and can run side by side. 13 and 17 also wait on the belt in the Adventure (Inventory's 10).
- **Learning before trainers:** until 18, checks teach professions through the debug handle, so the world tickets don't wait on the quest work.

**Every build ticket is merged, and the map is done** (2026-09-30): 11 (#77), 12 (#79), 13 (#101), 14 (#105), 15 (#88), 16 (#84), 17 (#103), 18 (#106) and 19 (#108). What's left is Tom's pass on the headset, gathered in [ticket 19's Answer](issues/19-oakvale-with-professions-in-one-sitting.md), and his try of the prototypes behind `?proto=pick`, `?proto=anvil` and `?proto=brew`.

## Out of scope

- **Cooking and Fishing**, and any profession beyond the two pairs: noted for a later effort.
- **Crafted gear better than drops:** ruled out in charting; crafted gear stays at par.
- **The bag, the belt, the stash and how vendors trade:** the Inventory map. This map only lists what it needs from them.
- **A WoW-style cap on professions:** ruled out; every character can learn all four.
- **Durability and repair:** Inventory ruled out wear, so smithing never repairs.
- **The contents of tiers past Oakvale's**, for zones not yet built.
- **Trading between players:** the game is single-player.
