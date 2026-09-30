# Map: Inventory

Label: wayfinder:map

## Destination

A written **spec for the inventory**, ready to hand off as build tickets: the bag, gear you wear, loot, coins and vendors, consumables on the belt, quest items and a stash, for all three classes. It reaches back into Oakvale lightly so the first hour teaches it; bigger loot tables come with later zones.

## Notes

- **Domain:** a browser VR action RPG (Three.js + WebXR). The glossary is `CONTEXT.md`; the inventory's words are **item**, **bag**, **gear**, **belt**, **loot**, **rarity**, **junk**, **coins**, **vendor** and **stash**.
- **What exists:** no inventory. Oakvale's spec ruled out loot, coins and equipping: the sword and shield sit in your hands, Hale's longsword replaces your sword at the last hand-in (`src/quests.ts`, `SWORDS`), enemies drop only healing orbs (`src/world/orbs.ts`), and the leader's orders are a quest pickup, not a bag item (`src/world/pickups.ts`). The save record is version 1 and holds `sword` (`src/save/record.ts`).
- **Sibling maps:** Abilities (branch `claude/plan-abilities-8b66c9`) settles the classes (warrior, ranger, mage), each class's weapon and fighting style, and what each **attribute** means. Professions settles gathering and crafting; its materials are items in the bag, and it will send its needs from the inventory to this map. Tickets that wait on either say so.
- **What the sibling maps settled** (relayed 2026-09-30, on Tom's behalf):
  - Abilities: only Stamina (10 health each) and your class's main attribute (+10% of level-1 damage each) count; 10 of each at level 1, 2 more a level. A full green set of your level adds about a third by level 10; a blue piece is about 1.5 times a green. Talents are a page of the same over-the-shoulder panel, beside the bag and gear. Up to three characters, one save record each plus a roster; today's save becomes a warrior. Off hands (quiver, focus) wait on its ranger and mage prototypes.
  - Professions (`.scratch/professions/`): tools aren't items but hang on a **tool loop** behind the main-hand hip, a third belt zone with the potion slots' mechanics. Materials: copper ore, rough stone, copper bar, Hearthleaf, Duskcap. Crafted consumables stack in the bag: minor healing potion, rage draught, minor mana potion (all on the belt), elixir of the keen eye and whetstone (one active at a time). Drinking any potion dims the belt's flasks for a shared 60 s cooldown; this map adopts it. Crafted gear (copper gauntlets) is ordinary gear. Crafted goods land in the bag, or wait on the station if it's full. Vendors buy all materials and crafted goods; the innkeeper sells only the minor healing potion, and the other consumables are crafted only. The save holds each profession, its proficiency and known recipes, in the same record version as the bag.
- **Controls taken:** A/X is the War Cry, B/Y the dash, the stick click the run. Abilities wants gestures too.
- **Hardware and testing:** Tom tests alone on his Quest 3. The performance budget is `docs/quest-3-browser-performance-budget.md`: 72 fps, about 300 draw calls, at most 4 point lights.
- **Skills:** grilling tickets call `grilling` and `domain-modeling`. Prototype tickets call `prototype`. Research tickets call `research`, with findings in `.scratch/inventory/research/`.
- **Standing preferences** (from charting with Tom, 2026-09-30; he took every recommendation in both rounds):
  - All six parts are in: a bag, gear that changes your numbers, loot from enemies and chests, coins and vendors, consumables, and quest items in the bag.
  - Physical for what you use mid-fight, a panel for sorting the bag and gear.
  - Weapons are locked to the class that fights with them; armour is open to all, each piece carrying the attribute that suits a class. This map decides only that gear carries attributes.
  - The bag has 16 slots to start, with bigger bags as later rewards; materials and potions stack; coins take no slot.
  - Seven gear slots: main hand, off hand (shield, quiver or focus, per class), head, chest, hands, legs, feet. Rings and trinkets can come later.
  - Weapons and gloves show on your own hands; the rest shows on a small figure of you on the gear panel.
  - Items are hand-made with fixed stats and WoW's rarity colours: grey junk, white, green, blue. No random stats.
  - Loot drops on the ground as an object glowing in its rarity colour; touching it takes it, as with an orb, and coins go straight to the purse.
  - Reach over your shoulder and squeeze the grip to pull the bag round; the panel opens in front of you. No button.
  - Two belt slots at the hips; grab a potion and lift it to your mouth to drink.
  - The world doesn't pause while the bag is open.
  - One currency, "coins". The smith buys anything and sells basic gear; the innkeeper sells potions (narrowed by Professions to the minor healing potion). Junk exists only to sell.
  - Nothing is lost on death and nothing wears out.
  - Quest hand-ins offer a pick of two or three items, and What Lies Below offers a weapon for each class.
  - A stash in a chest at the inn. Letting go of an item outside the panel drops it on the ground, and it's gone once you leave.

## Decisions so far

<!-- one line per resolved ticket: [title](link): gist -->

- [VR inventories in shipped games](issues/01-vr-inventories-in-shipped-games.md): shipped games use the same mix; zones are spheres placed from the headset with a speed gate, every slot glows and ticks, the grip is free to use, and the menu button isn't.
- [What an item is](issues/02-what-an-item-is.md): five kinds; quest items on their own page; hand-made items whose numbers come from item level and rarity by one rule; white plain, green adds attributes, blue about 1.5 times a green; no wearing gear above your level; weapons and off hands class-locked; a full green set is about a third of your attributes. On Tom's behalf.
- [The bag and the gear panel](issues/03-the-bag-and-the-gear-panel.md): A, touch an item with a fist or the sword's tip and hold the grip to carry it; an 18 cm sphere over each shoulder with a 1.5 m/s gate opens it; the panel 45 cm out, turning after 60°, shut by walking 1.5 m off; icons from one atlas (4 draws an eye), the held item as a model. On Tom's behalf; the prototype stays at `?bag`.
- [Loot](issues/05-loot.md): drops at the enemy's level and only for your class; coins always, junk and gear by role (a leader or deep brute always drops green or blue, the Warden a blue and a green); chests open once per character; a glowing pouch with unlit beams for green and blue, lying 5 minutes; a full bag leaves the item on the ground; healing orbs stay. On Tom's behalf.
- [The belt and drinking a potion](issues/04-the-belt-and-drinking-a-potion.md): the grip takes a flask from a hip slot and that hand's weapon fades out until it's drunk (0.7 s at the mouth) or let go; the slot refills from its stack; prototype at `?belt`.
- [Vendors and the stash](issues/06-vendors-and-the-stash.md): a vendor's wares board unfolds beside them with your bag panel, and you buy and sell by carrying; stock never runs out, a Sold row buys back the last six, a Sell junk button; the smith sells white gear, the innkeeper the minor healing potion; sell prices by rule, buying at 4 times; a 32-slot stash shared by every inn's chest. On Tom's behalf.
- [Oakvale's items](issues/07-oakvales-items.md): a white starting kit per class with three potions on the belt; each hand-in offers a pick of two items fitting your class, blues at What Lies Below (Hale's longsword for a warrior); the orders on the quest page; three chests (watchtower, leader's tent, the dig's strongbox); an old save becomes a warrior in the kit with its sword. On Tom's behalf.

## Not yet specified

Nothing: the destination is reached. The last patches of fog went into [the spec](spec.md): saving (the record's shape and the version-1 migration), bigger bags (out of scope until a later zone offers one) and the quiver's and focus's numbers (attributes and no armour, until the Abilities map gives them more).

## The spec and its build tickets

[The spec](spec.md) was written on 2026-09-30 on Tom's behalf. `/to-tickets` would have asked Tom whether the granularity, the blocking edges and the splits were right; these were answered **on Tom's behalf**, for him to revisit. Ten build tickets, each sized for one thread session with a large context window:

- [08: The inventory and its save](issues/08-the-inventory-and-its-save.md): the pure module, the catalogue and the rule, the save and migration. No new view. Blocked by nothing.
- [09: The bag in the Adventure](issues/09-the-bag-in-the-adventure.md): prototype A promoted. Blocked by 08.
- [10: The belt in the Adventure](issues/10-the-belt-in-the-adventure.md): prototype (a) promoted, the cooldown, bag to belt. Blocked by 09.
- [11: Loot from kills](issues/11-loot-from-kills.md). Blocked by 09.
- [12: Quest items and hand-in picks](issues/12-quest-items-and-hand-in-picks.md). Blocked by 09.
- [13: Oakvale's chests](issues/13-oakvales-chests.md). Blocked by 11.
- [14: Vendors](issues/14-vendors.md). Blocked by 11.
- [15: The stash](issues/15-the-stash.md). Blocked by 09.
- [16: The ranger and mage in the inventory](issues/16-the-ranger-and-mage-in-the-inventory.md). Blocked by 12, 14 and the Abilities map's ranger and mage builds.
- [17: Oakvale with the inventory, in one sitting](issues/17-oakvale-with-the-inventory-in-one-sitting.md). Blocked by 10, 13, 14 and 15.

After 09, tickets 10, 11, 12 and 15 can run in parallel; each merges `main` before its PR.

## Out of scope

- What each attribute does, the classes' weapons and how they handle: the Abilities map.
- Gathering and crafting: the Professions map.
- Random stats on items (Diablo-style) and durability or repair: ruled out in charting.
- Trading and auction houses: the game is single-player.
