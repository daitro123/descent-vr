# Map: Abilities, talents and attributes

Label: wayfinder:map

## Destination

A written **spec for character development in combat**, ready to hand off as build tickets: three **classes** (warrior, ranger and mage), each with its plain way of fighting, its **abilities**, the resource that fuels them and a **talent** tree to choose in, plus the **attributes** that rise with level and gear. The level curve is sketched to a notional cap of about 20 and specced in detail from 1 to 10.

## Notes

- **Domain:** a browser VR action RPG (Three.js + WebXR). The glossary is `CONTEXT.md`: say **ability** (not skill or spell), **talent**, **class** and **attribute** as it defines them.
- **What exists:** one class, the warrior, with a sword in the right hand and a shield in the left. Levels 1 to 5 in Oakvale each add 20 health and 20% damage, the War Cry arrives at level 2 and Earthshaker at 3, rage builds from hits and blocks, and there's nothing to choose. The dash (B/Y) and the shield bash are always there. The rules live in `src/adventureState.ts` and `CONFIG.levels` in `src/config.ts`; the save (`src/save/record.ts`) holds level, XP, sword and quests. Oakvale's decisions are in `.scratch/oakvale-starting-zone/map.md`, especially [Progression, death and saving](../oakvale-starting-zone/issues/03-progression-death-and-saving.md).
- **Controls today:** A/X let out the War Cry, B/Y dash, clicking the left stick runs, the triggers and grips are free in a fight, and Earthshaker is a gesture (the sword's tip driven into the ground).
- **Hardware and testing:** Tom tests alone on his Quest 3. The performance budget is `docs/quest-3-browser-performance-budget.md`: 72 fps, about 300 draw calls, at most 4 point lights. Spell effects count against it.
- **Neighbouring efforts:** the Inventory thread owns carrying, equipping, loot and coins; this map decides what each attribute means and uses only the fact that gear carries attributes. The Professions thread owns gathering, crafting and their skills. Keep class weapons (the bow, the mage's focus) in step with Inventory.
- **Skills:** grilling tickets call `grilling` and `domain-modeling`. Prototype tickets call `prototype`. Research tickets call `research`, with findings in `.scratch/abilities/research/`.
- **Standing preferences** (from charting with Tom, 2026-09-30):
  - Three classes: warrior, ranger and mage. More can come later, so nothing should assume exactly three.
  - Abilities are moves like the War Cry. Levels grant each class's base abilities; talents add new ones and change them. There's no class trainer.
  - Talents follow WoW classic, trimmed: two trees per class (the warrior's might be Arms and Protection), one point every level from 2, and the deepest talents grant new abilities.
  - Attributes rise on their own with level and gear, never by spending points. Four to start: Stamina (health) for everyone, and one main attribute per class: Strength (warrior), Agility (ranger), Intellect (mage).
  - Each class has its own resource: the warrior keeps rage (built in a fight), the ranger gets focus (refills quickly), the mage gets mana (a pool that refills out of a fight).
  - Abilities are used mostly by gesture, with at most one button ability per hand.
  - Several saved characters, up to three, picked on the page before VR; a character's class is fixed.
  - How the ranger's bow and the mage's casting fight is designed here, prototyped before their abilities.
  - The War Cry, Earthshaker, the dash and the shield bash can be reworked into the new system, but the warrior's sword and shield keep their feel.

## Decisions so far

<!-- one line per resolved ticket: [title](link): gist -->

## Not yet specified

- **Enemies against the new classes:** camps were tuned for a warrior in melee. A ranger shooting from range meets the 8 m notice radius and the 30 m leash, and a mage's crowd control meets "only two enemies mid-attack at once". What enemies need (ranged pressure on a kiter, leash rules for ranged pulls) waits on how the ranger and mage fight.
- **Oakvale for every class:** the quest chain, the Warden and Hale's longsword were made for the warrior. Whether a ranger or mage can play levels 1 to 5 as they stand, and what the last quest pays a non-warrior, waits on the class kits and on Inventory.
- **Choosing talents in VR:** where the talent tree is shown and how you pick in it, whether picks can be undone and where. Tom plans a UI overhaul after Oakvale, so how far this goes waits on the talent rules.
- **The belt for three classes:** today's belt shows health, rage and the warrior's ability pips. Each class needs its resource and its abilities' cooldowns shown.
- **The arena with classes:** whether `?arena` lets you pick a class and at what level.
- **Spell effects and the budget:** how many lights, particles and draw calls the mage's and ranger's effects may cost, once their kits exist.
- **Assembling the spec** from every decision, then build tickets with `/to-tickets`.

## Out of scope

- Gathering, crafting and profession skills: the Professions effort.
- The bag, equipping, loot, coins and vendors: the Inventory effort. This map uses only that gear carries attributes.
- Classes beyond warrior, ranger and mage.
- Detailed abilities and talents past level 10; the curve to about 20 is only sketched.
- Changing how the warrior's sword and shield feel.
- Online play.
