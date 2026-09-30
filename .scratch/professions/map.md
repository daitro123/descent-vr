# Map: Professions

Label: wayfinder:map

## Destination

A written **spec for professions**, ready to hand off as build tickets: **Mining** with **Smithing**, and **Herbalism** with **Alchemy**, learnable by every class, done by hand at gathering spots and stations, and paying off mostly in consumables for fights. It covers Oakvale's first tier fully and lays down the pattern later zones extend. Its build order waits on the Inventory spec, since everything professions make lands in the bag.

## Notes

- **Domain:** a browser VR action RPG (Three.js + WebXR). The glossary is `CONTEXT.md`; this map adds **profession**, **material**, **gathering spot**, **station** and **trainer**. Don't call a profession's growth a "skill" or a "level": Abilities keeps "ability" and avoids "skill", and a **level** is how strong a character is. Its own word is decided in [How a profession grows](issues/04-how-a-profession-grows.md).
- **What exists:** nothing to gather or craft, no bag, no coins; enemies drop only healing orbs (`src/world/orbs.ts`), and Hale's longsword replaces your sword at the last hand-in (`src/quests.ts`). Oakvale already has the hooks: the smithy with its forge and anvil and the smith working at it (`src/maps/forest/smithy.ts`, `src/people/work.ts`), the old mine down to the Warden's hall, the farm, the fields and the woods. Villagers are the innkeeper, the smith and the farmer (`VILLAGERS` in `src/quests.ts`). Camps refill 180 s after they're cleared, once you're 30 m off (`CONFIG` in `src/config.ts`).
- **Sibling maps** (both charted 2026-09-30, not yet merged to `main`):
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

## Not yet specified

- **Prices and coins:** what materials and crafted goods sell for, and what a trainer's recipes cost, once Inventory settles its coin economy and what the innkeeper's potions cost.
- **Saving professions:** what the save record adds per character (each profession learned, its growth, its known recipes) and the migration, once the growth and the recipes are settled.
- **What Inventory must provide:** material stacks, where the tools live, where crafted goods land (the bag, or on the station for you to pick up), and what happens when the bag is full. Sharpens with [Tools on the belt](issues/02-tools-on-the-belt.md) and [Oakvale's first tier](issues/03-oakvales-first-tier.md); then send it to the Inventory thread.
- **The later tiers' pattern:** how a tier two material and its recipes slot in when a later zone brings them, sketched once the growth and the first tier are settled. The contents of later tiers are out of scope.
- **The budget:** gathering spots scattered through Oakvale, a new station and a trainer cost triangles and draw calls in a zone already near its limit (see the Oakvale map's triangle budget).
- **Assembling the spec** from every decision, then build tickets with `/to-tickets`.

## Out of scope

- **Cooking and Fishing**, and any profession beyond the two pairs: noted for a later effort.
- **Crafted gear better than drops:** ruled out in charting; crafted gear stays at par.
- **The bag, the belt, the stash and how vendors trade:** the Inventory map. This map only lists what it needs from them.
- **A WoW-style cap on professions:** ruled out; every character can learn all four.
- **Durability and repair:** Inventory ruled out wear, so smithing never repairs.
- **The contents of tiers past Oakvale's**, for zones not yet built.
- **Trading between players:** the game is single-player.
