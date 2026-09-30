# Oakvale's first tier

Type: grilling
Status: resolved
Blocked by: 

## Question

What does Oakvale give each profession: which materials, and which recipes each craft can make from them?

- **Materials:** the ore in Oakvale (copper, and anything else the mine or hills hold), whether ore is smelted into bars at the forge first, and which herbs grow in the fields, the woods and the mine.
- **Alchemy:** which potions, for which classes. Abilities gives each class its resource (rage, focus, mana), so a healing potion serves everyone but a mana potion only the mage. How potions sit beside the healing orbs enemies drop, and beside the potions the innkeeper sells (Inventory).
- **Smithing:** which consumables (a whetstone for a blade's edge, weights, arrowheads for the ranger?) and which few pieces of gear at par with drops, for which classes. Inventory's gear is hand-made with fixed stats and rarity colours, and weapons are locked to a class.
- **How much:** how many recipes in tier one (few and meaningful beats many), how many materials each takes, and how long a fight's worth of potions takes to gather and make.
- **Output:** the tier one table; what the bag must stack (to send to the Inventory thread).

## Answer

Settled on 2026-09-30 **by Claude on Tom's behalf**: Tom asked for the rest of the map to be worked without him, taking the recommended option each time. Every number is a starting point, to tune on the headset, and every name is a placeholder.


Oakvale is **tier one** (the Apprentice grade, see [How a profession grows](04-how-a-profession-grows.md)). Few recipes, each meaning something.

**Materials** (all stack in the bag):

| Material | From | Notes |
|---|---|---|
| Copper ore | Copper veins, with Mining | 2 or 3 from a vein |
| Rough stone | Copper veins, with Mining | 1 from every vein |
| Copper bar | Smelted at the forge, with Smithing | 2 copper ore make 1 bar |
| Hearthleaf | In the fields and along the roads, with Herbalism | 1 from a clump; the healing herb |
| Duskcap | A mushroom in the deep woods and the old mine, with Herbalism | 1 from a clump |

No vials to buy: a potion's flask is part of brewing it.

**Alchemy** (at the alchemy table):

| Recipe | Takes | Does | For | Needs |
|---|---|---|---|---|
| Minor healing potion | 2 Hearthleaf | Heals 35% of your health as you drink | Everyone | 0 |
| Rage draught | 2 Duskcap | Gives 30 rage | Warrior | 5 |
| Minor mana potion | 1 Hearthleaf, 1 Duskcap | Gives back 40% of your mana | Mage | 5 |
| Elixir of the keen eye | 2 Hearthleaf, 1 Duskcap | +10% damage for 5 minutes | Ranger (the focus that refills quickly needs no potion) | 10 |

**Smithing** (at the forge and the anvil):

| Recipe | Takes | Does | For | Needs |
|---|---|---|---|---|
| Copper bar | 2 copper ore | A bar to work | Smithing itself | 0 |
| Whetstone | 1 rough stone | Rub it along your blade or your arrowheads: +5% damage for 10 minutes, one at a time | Warrior, ranger | 0 |
| Copper gauntlets | 4 copper bars | Gloves at par with a green drop at level 5, in three versions: of Strength, of Agility, of Intellect, each with Stamina | Each class its own | 15 |

- **Beside the orbs and the innkeeper:** healing orbs stay as they are (a quarter of your health, from kills). The innkeeper sells only the minor healing potion (Inventory's vendor), dearer than the materials; everything else here only a crafter makes. The whetstone and the elixir are the only buffs, and one of each can be on you at a time.
- **A shared potion cooldown:** after drinking any potion, the belt's flasks dim for 60 s, as WoW's potions share one. It keeps two belt slots and a stack in the bag from beating a fight on their own. The whetstone and the elixir are not potions and have no cooldown past their one-at-a-time rule. This goes to the Inventory thread with the belt.
- **How long a fight's worth takes:** four minor healing potions are 8 Hearthleaf, about four minutes of walking the fields and two of brewing. A pair of gauntlets is 8 ore, three or four veins.
- **The effects need Abilities' numbers** (rage, mana, damage); the percentages here are starting points to set against them when that map settles.
- **What Inventory must provide** (sent to the Inventory thread): stacks for the five materials and the crafted consumables; the gauntlets as ordinary gear; potions on the belt with the shared cooldown; and vendors that buy all of it.
