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
- [How the mage fights](issues/06-how-the-mage-fights.md): a bolt charged on each hand's trigger and cast by throwing it, the throw's speed making it small and fast or big and slow, three to a grunt; the focus in the off hand holds a ward on the grip that blocks like the shield for 10 mana a block; a 3.5 m blink replaces the dash; the plain bolt is free, mana pays for the ward and abilities. Prototype kept at `?arena&class=mage`. On Tom's behalf.
- [Rage, focus and mana](issues/09-rage-focus-and-mana.md): every resource is a bar of 100 that plain attacks never spend; rage stays as built, focus starts full and refills 10 a second, mana grows 2 a point of Intellect over 10 and refills 2 a second in a fight and 30 out; costs don't grow with level; the belt's right orb shows the class's resource. On Tom's behalf.
- [Using abilities by gesture](issues/07-using-abilities-by-gesture.md): hold the right grip, draw a shape in the air, let go; the same five shapes for every class (ring, Z, V, triangle, S), since flicks read a sword's thrusts and blocks as gestures; a grip at a shoulder, a hip or the tool loop never arms, nor one with an arrow nocked or a bolt charging; every ability ready with no loadout up to six gestures and one A/X button, a loadout of six by slot past that; a miss costs nothing. Prototype kept at `?arena&class=<class>&gestures`. On Tom's behalf.
- [The warrior's abilities and talents](issues/11-the-warriors-abilities-and-talents.md): today's kit stays; Heroic Throw (6), Shield Wall (8) and Sweeping Strikes (10) as ring, Z and V; Arms (Mortal Strike at tier 3, Bladestorm at 5) and Protection (Shield Slam, Bulwark). On Tom's behalf.
- [The ranger's abilities and talents](issues/12-the-rangers-abilities-and-talents.md): Power Shot on A/X mid-draw (2), Snare Trap (3), Volley (6), Scatter (8) and Hunter's Mark (10); Marksmanship (Trueshot, Rain of Arrows) and Survival (Explosive Trap, Camouflage). On Tom's behalf.
- [The mage's abilities and talents](issues/13-the-mages-abilities-and-talents.md): Frost Nova on A/X (2), then Fireball (3), Frostbolt (6) and Chain Lightning (8) that change the next bolt, and Blizzard (10); Fire (Pyroblast, Meteor) and Frost (Ice Barrier, Frozen Orb). On Tom's behalf.
- [Enemies against every class](issues/14-enemies-against-every-class.md): no new behaviours; range pulls and the leash work as today; new rooted, frozen and slowed states, halved on brutes, and the Warden ignores roots and freezes. On Tom's behalf.
- [Oakvale and the arena for every class](issues/15-oakvale-and-the-arena-for-every-class.md): one chain for every class, rewards per class from Inventory; level 3 shows the first gesture's shape in the air; the mage's bolt gathers at the tip of its wand or staff; `?arena&class=` plays level 1 with every base ability. On Tom's behalf.
- [Effects within the budget](issues/16-effects-within-the-budget.md): no new lights (one pooled light lent for 0.5 s), shared particles and instanced projectiles, at most three lasting effects, under 10 draw calls and 5,000 triangles in all. On Tom's behalf.

## Not yet specified

- **The talent page's look:** a page of Inventory's panel with free resets (see Talent tree rules); its layout waits on Tom's UI overhaul, so the spec carries only a plain first pass.
- **Assembling the spec:** done. The spec is [spec.md](spec.md), written on 2026-09-30 by Claude on Tom's behalf from every decision above, then broken into build tickets (see Build tickets below).

## Build tickets

Written on 2026-09-30 from [spec.md](spec.md), **by Claude on Tom's behalf**, numbered on from the map's sixteen tickets in the same `issues/` folder. Each needs its own session. Each lists the tickets that genuinely block it; tickets with no open blockers can run side by side.

1. [17: Classes, attributes and the level curve](issues/17-classes-attributes-and-the-level-curve.md): no blockers.
2. [18: Characters: the roster and the page before VR](issues/18-characters-the-roster-and-the-page-before-vr.md): after 17.
3. [19: Gestures and the warrior's new abilities](issues/19-gestures-and-the-warriors-new-abilities.md): after 17.
4. [20: Rooted, frozen and slowed](issues/20-rooted-frozen-and-slowed.md): no blockers.
5. [21: The ranger](issues/21-the-ranger.md): after 17 to 20.
6. [22: The ranger's abilities at 6, 8 and 10](issues/22-the-rangers-abilities-at-6-8-and-10.md): after 21.
7. [23: The mage](issues/23-the-mage.md): after 17 to 20.
8. [24: The mage's abilities at 6, 8 and 10](issues/24-the-mages-abilities-at-6-8-and-10.md): after 23.
9. [25: Talents and the warrior's trees](issues/25-talents-and-the-warriors-trees.md): after 18 and 19.
10. [26: The ranger's and mage's trees](issues/26-the-rangers-and-mages-trees.md): after 22, 24 and 25.
11. [27: Every class through Oakvale](issues/27-every-class-through-oakvale.md): after 26.

`/to-tickets` would have asked Tom about the granularity and the edges; answered on his behalf: each class splits into its plain kit with its level-2 and level-3 abilities (so Oakvale is playable as that class) and its abilities at 6 to 10 (arena-only until the cap rises); the enemy states stand alone so both classes can build on them; talents come after the warrior's gestures so the page has slots to show.

## Out of scope

- Gathering, crafting and profession skills: the Professions effort.
- The bag, equipping, loot, coins and vendors: the Inventory effort. This map uses only that gear carries attributes.
- Classes beyond warrior, ranger and mage.
- Detailed abilities and talents past level 10; the curve to about 20 is only sketched.
- Changing how the warrior's sword and shield feel.
- Online play.
