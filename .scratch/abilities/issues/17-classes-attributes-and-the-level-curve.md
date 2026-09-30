# 17: Classes, attributes and the level curve

**What to build:** the adventure state learns the character's class. A character's health and damage come from Stamina and the class's main attribute (10 of each at level 1, 2 more a level, 10 health a point of Stamina, 10% of level 1's damage a point of the main attribute), adding to the gear the Inventory map already sums through the same rule. The level curve continues past 5 as data with the cap set by content (still 5), and an enemy five or more levels below you pays no XP. Every class's resource and base abilities become data per class, with today's War Cry and Earthshaker as the warrior's. Every character is still a warrior, and Oakvale plays exactly as today.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

Read [the spec](../spec.md) ("The adventure state learns classes", "Testing Decisions"), [Attributes and what they do](08-attributes-and-what-they-do.md), [The level curve to 20](04-the-level-curve-to-20.md), [Rage, focus and mana](09-rage-focus-and-mana.md), and the three class tickets (11 to 13) for the abilities' data.

- [ ] Tests at the adventure-state seam: each class's health and damage at levels 1, 5 and 10, with and without gear; the warrior's equal to today's at every level; XP to each level to 20 and the cap dropping XP past 5; grey enemies paying nothing; each class's abilities by level; each class's resource (size, start, refill, mana's Intellect rule).
- [ ] The level-up effect names each ability it brings for the character's class.
- [ ] Every new number is in the game's table of tunables.
- [ ] `npm run typecheck` and `npm test` pass, and the existing Oakvale checks still pass.
