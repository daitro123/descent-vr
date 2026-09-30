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
- **What Inventory settled** (its map, `.scratch/inventory/map.md` on branch `claude/plan-inventory-vkxbvv`, relayed 2026-09-30): seven gear slots, with the off hand a shield, a quiver or a focus by class; weapons are locked to a class, armour is open to all and each piece carries the attribute that suits a class; What Lies Below pays a weapon per class. Two belt slots hold potions, drunk by lifting one to your mouth, and the bag opens by reaching over your shoulder and squeezing the grip. Those two motions are taken: no ability gesture may use them. Coins and vendors exist, so a trainer is possible, but Tom chose levels, not a trainer, to grant abilities. Inventory waits on this map for what each class's off hand does and which attributes gear carries.
- **What Professions settled** (its map, `.scratch/professions/map.md` on branch `claude/plan-professions-fv1lcv`, relayed 2026-09-30): a tool loop behind the main-hand hip; a grip pressed inside it, in the potion slots or at the shoulder belongs to that zone and never arms a gesture. Drawing a tool puts away what the main hand holds. Class consumables: a rage draught (30 rage), a minor mana potion (40% of mana back), an elixir of the keen eye (+10% damage for 5 min, the ranger's, since focus needs no potion) and a whetstone (+5% damage for 10 min), all potions on a shared 60 s cooldown. Professions' own growth is **proficiency** and **grade**, not skill or level.
- **Skills:** grilling tickets call `grilling` and `domain-modeling`. Prototype tickets call `prototype`. Research tickets call `research`, with findings in `.scratch/abilities/research/`.
- **Standing preferences** (from charting with Tom, 2026-09-30):
  - Three classes: warrior, ranger and mage. More can come later, so nothing should assume exactly three.
  - Abilities are moves like the War Cry. Levels grant each class's base abilities; talents add new ones and change them. There's no class trainer.
  - Talents follow WoW classic, trimmed: two trees per class (the warrior's might be Arms and Protection), one point every level from 2, and the deepest talents grant new abilities.
  - Attributes rise on their own with level and gear, never by spending points. Four to start: Stamina (health) for everyone, and one main attribute per class: Strength (warrior), Agility (ranger), Intellect (mage).
  - Each class has its own resource: the warrior keeps rage (built in a fight), the ranger gets focus (refills quickly), the mage gets mana (a pool that refills out of a fight).
  - Abilities are used mostly by gesture, with at most one button ability per hand.
  - Several saved characters, up to three, picked on the page before VR; a character's class is fixed.
  - From 2026-09-30 Tom asked for the rest of the map to be worked without him: every open ticket takes the recommended option, marked "on Tom's behalf". Prototypes are built in their own sessions and kept in the repo behind a URL flag for him to try later.
  - How the ranger's bow and the mage's casting fight is designed here, prototyped before their abilities.
  - The War Cry, Earthshaker, the dash and the shield bash can be reworked into the new system, but the warrior's sword and shield keep their feel.

## Decisions so far

<!-- one line per resolved ticket: [title](link): gist -->

- [Bows, spells and abilities in shipped VR games](issues/01-bows-spells-and-abilities-in-shipped-vr-games.md): shipped games nock an arrow by touching the string, with no quiver reach; cast a spell from each hand by charge and throw, with merged two-hand spells at the top; call abilities with a grip and a flick, about four per hand; and keep gestures loose, poses at chest height and fights paced. Sourced from search extracts only.
- [Recognising gestures in the browser](issues/02-recognising-gestures-in-the-browser.md): Earthshaker stays a rule check; shaped gestures use our own small Jackknife-style template matcher (not UCF's non-commercial code), armed by holding that hand's grip and classified on release, at well under 1 ms a gesture.
- [Characters and choosing a class](issues/03-characters-and-choosing-a-class.md): up to three named characters of any class, listed on the page before VR with New, Delete and Rename; `?newgame` opens the new-character form; every class starts by Hale; one save record per character plus a roster, and today's save becomes a warrior. On Tom's behalf.
- [The level curve to 20](issues/04-the-level-curve-to-20.md): Oakvale's 1 to 5 unchanged; five levels a zone to 20, the cap rising only with content; each level needs 100 more XP than the last; enemies five levels below pay nothing; health and damage keep the linear step; base abilities at 2, 3, 6, 8 and 10 (then 14 and 18), a talent point every level from 2. On Tom's behalf.
- [Attributes and what they do](issues/08-attributes-and-what-they-do.md): Stamina (10 health a point) and the class's main attribute (10% of level 1's damage a point) are the only two that count; 10 of each at level 1 and 2 more a level reproduce today's numbers; gear adds about a third by level 10; no secondary numbers yet. On Tom's behalf.
- [Talent tree rules](issues/10-talent-tree-rules.md): two trees of five tiers, a tier every 3 points; ability talents in tier 3 and a tier-5 capstone; points in both trees allowed; spent out of a fight on a page of Inventory's panel; free reset anywhere out of a fight. On Tom's behalf.
- [How the ranger fights](issues/05-how-the-ranger-fights.md): the bow in the left hand, nocked by touching the string with the trigger held, damage and speed by the draw (6 to 30, a full-draw head shot drops a grunt), plain arrows unlimited; the bow hand's grip raises a short ward that stops arrows and sends them back if raised in time; up close only the dash. The knife and kiting variants stay in the prototype at `?arena&class=ranger`. On Tom's behalf.

## Not yet specified

- **Enemies against the new classes:** camps were tuned for a warrior in melee. A ranger shooting from range meets the 8 m notice radius and the 30 m leash, and a mage's crowd control meets "only two enemies mid-attack at once". What enemies need (ranged pressure on a kiter, leash rules for ranged pulls) waits on how the ranger and mage fight.
- **Oakvale for every class:** the quest chain, the Warden and Hale's longsword were made for the warrior. Whether a ranger or mage can play levels 1 to 5 as they stand, and what the last quest pays a non-warrior, waits on the class kits and on Inventory.
- **The talent page's look:** a page of Inventory's panel with free resets (see Talent tree rules); its layout waits on Tom's UI overhaul, so the spec carries only a plain first pass.
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
