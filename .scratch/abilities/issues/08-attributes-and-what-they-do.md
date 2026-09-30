# Attributes and what they do

Type: grilling
Status: resolved
Blocked by: 04

## Question

What does each attribute do, how much of it do levels give, and how much can gear add?

- Stamina, Strength, Agility and Intellect (decided in charting): what each one raises (health, damage, resource, crit, ranged damage) and for which class.
- Whether an attribute that isn't your class's main one does anything for you (Strength on a mage).
- How much each level gives per class, so the level curve's health and damage come out of attributes.
- What the Inventory effort needs to know: the rough share of attributes that gear should carry at each level.
- Whether secondary numbers (crit chance, haste) are attributes too, now or later.

## Answer

Settled on 2026-09-30 **by Claude on Tom's behalf**, taking the recommended option at every fork; the reasons are under Comments. The numbers are starting points, to tune on the headset.

- **Two attributes count for each character: Stamina, and their class's main attribute** (Strength for the warrior, Agility for the ranger, Intellect for the mage). The other two main attributes do nothing for you, so a mage gains nothing from Strength.
- **Stamina gives health:** 10 health per point.
- **The main attribute gives damage:** every point is 10% of level 1's damage, on everything you deal (plain attacks and abilities alike). Intellect also sizes the mage's mana pool, by a rule [Rage, focus and mana](09-rage-focus-and-mana.md) sets.
- **Levels give attributes:** a level-1 character of any class has 10 Stamina and 10 of their main attribute, and every level adds 2 of each. That reproduces today's numbers exactly: 100 health and ×1 damage at level 1, 180 and ×1.8 at 5, 280 and ×2.8 at 10.
- **Gear adds attributes on top.** The budget for the Inventory map: a full set of gear matching your level, all green, adds about a third to your level's attributes by level 10 (about 8 Stamina and 8 of the main attribute, spread over the seven slots), and a blue piece carries about half again what a green one does. Weapons carry their own damage (Inventory's call) and may carry attributes too. Hale's longsword's +0.2 today is worth 2 Strength.
- **Enemies have no attributes.** They keep the level rule: health and damage × (1 + 0.2 per level above 1), × 1.4 in a camp.
- **No secondary numbers yet.** No crit chance, haste or armour rating: a crit is still a hit to the head, and speed is how fast you swing. They can come later as attributes if a zone needs them.
- **Every class has the same health at a level.** The ranger and mage have no shield, so if they turn out too fragile, [How the ranger fights](05-how-the-ranger-fights.md) and [How the mage fights](06-how-the-mage-fights.md) answer it with their defence, not with less or more Stamina.
- **Seeing them:** the gear panel's figure shows your Stamina and main attribute with the health and damage they make. Nothing on the belt.

## Comments

**2026-09-30, on Tom's behalf:**

- Only two attributes per character: four attributes that all do something for everyone is WoW's spreadsheet, and in VR your hands already decide most of a fight. Two numbers make gear easy to read.
- 10 health and 10% damage per point with +2 a level: round numbers that land exactly on today's curve, so nothing built changes.
- A third from gear by 10: enough that a blue drop feels like a step, not so much that gear outweighs levels.
- Same health for every class: tuning three health curves before anyone has held a bow or cast a spell would be guessing.
