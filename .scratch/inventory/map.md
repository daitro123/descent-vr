# Map: Inventory

Label: wayfinder:map

## Destination

A written **spec for the inventory**, ready to hand off as build tickets: the bag, gear you wear, loot, coins and vendors, consumables on the belt, quest items and a stash, for all three classes. It reaches back into Oakvale lightly so the first hour teaches it; bigger loot tables come with later zones.

## Notes

- **Domain:** a browser VR action RPG (Three.js + WebXR). The glossary is `CONTEXT.md`; the inventory's words are **item**, **bag**, **gear**, **belt**, **loot**, **rarity**, **junk**, **coins**, **vendor** and **stash**.
- **What exists:** no inventory. Oakvale's spec ruled out loot, coins and equipping: the sword and shield sit in your hands, Hale's longsword replaces your sword at the last hand-in (`src/quests.ts`, `SWORDS`), enemies drop only healing orbs (`src/world/orbs.ts`), and the leader's orders are a quest pickup, not a bag item (`src/world/pickups.ts`). The save record is version 1 and holds `sword` (`src/save/record.ts`).
- **Sibling maps:** Abilities (branch `claude/plan-abilities-8b66c9`) settles the classes (warrior, ranger, mage), each class's weapon and fighting style, and what each **attribute** means. Professions settles gathering and crafting; its materials are items in the bag, and it will send its needs from the inventory to this map. Tickets that wait on either say so.
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
  - One currency, "coins". The smith buys anything and sells basic gear; the innkeeper sells food and potions. Junk exists only to sell.
  - Nothing is lost on death and nothing wears out.
  - Quest hand-ins offer a pick of two or three items, and What Lies Below offers a weapon for each class.
  - A stash in a chest at the inn. Letting go of an item outside the panel drops it on the ground, and it's gone once you leave.

## Decisions so far

<!-- one line per resolved ticket: [title](link): gist -->

- [VR inventories in shipped games](issues/01-vr-inventories-in-shipped-games.md): shipped games use the same mix; zones are spheres placed from the headset with a speed gate, every slot glows and ticks, the grip is free to use, and the menu button isn't.

## Not yet specified

- **Saving the inventory:** the record's version 2 (bag, gear, belt, coins, stash) and the migration from version 1's `sword`. It sharpens once [What an item is](issues/02-what-an-item-is.md), [The bag and the gear panel](issues/03-the-bag-and-the-gear-panel.md) and [Vendors and the stash](issues/06-vendors-and-the-stash.md) are settled.
- **Professions' needs:** material stacks, gathering tools and where crafted items land, once the Professions map sends them.
- **Bigger bags:** where they come from and how many slots they add.
- **Each class's off hand:** what a quiver and a mage's focus do as gear, once Abilities settles how the ranger and mage fight.
- **Consumables beyond healing potions:** food, mana potions, buffs; which exist hangs on Abilities' resources and Professions' crafting.

## Out of scope

- What each attribute does, the classes' weapons and how they handle: the Abilities map.
- Gathering and crafting: the Professions map.
- Random stats on items (Diablo-style) and durability or repair: ruled out in charting.
- Trading and auction houses: the game is single-player.
