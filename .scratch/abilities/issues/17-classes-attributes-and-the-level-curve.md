# 17: Classes, attributes and the level curve

**What to build:** the adventure state learns the character's class. A character's health and damage come from Stamina and the class's main attribute (10 of each at level 1, 2 more a level, 10 health a point of Stamina, 10% of level 1's damage a point of the main attribute), adding to the gear the Inventory map already sums through the same rule. The level curve continues past 5 as data with the cap set by content (still 5), and an enemy five or more levels below you pays no XP. Every class's resource and base abilities become data per class, with today's War Cry and Earthshaker as the warrior's. Every character is still a warrior, and Oakvale plays exactly as today.

**Blocked by:** None (can start immediately).

**Status:** done

Read [the spec](../spec.md) ("The adventure state learns classes", "Testing Decisions"), [Attributes and what they do](08-attributes-and-what-they-do.md), [The level curve to 20](04-the-level-curve-to-20.md), [Rage, focus and mana](09-rage-focus-and-mana.md), and the three class tickets (11 to 13) for the abilities' data.

- [x] Tests at the adventure-state seam: each class's health and damage at levels 1, 5 and 10, with and without gear; the warrior's equal to today's at every level; XP to each level to 20 and the cap dropping XP past 5; grey enemies paying nothing; each class's abilities by level; each class's resource (size, start, refill, mana's Intellect rule).
- [x] The level-up effect names each ability it brings for the character's class.
- [x] Every new number is in the game's table of tunables.
- [x] `npm run typecheck` and `npm test` pass, and the existing Oakvale checks still pass.

## What was built

Built on 2026-09-30 **by Claude on Tom's behalf**, taking the recommended option at every fork.

- **`src/classes.ts`** is the classes as data: `CLASSES`, each class's main attribute (`mainOf`, Inventory's `CLASS_MAIN`), its resource (`resourceOf`) and its base abilities (`ABILITY`, `abilitiesOf`, `abilitiesAt`), each with its class, level, cost, cooldown, name and `use`: `button` (A/X), `drawing` (A/X while an arrow is drawn), `earthshaker` (the sword-tip rule) or the gesture shape it starts in (`ring`, `z`, `v`, `s`; `triangle` is left for tier-3 talent abilities). `unlockLine(ability)` is what the level-up says ("Snare Trap: hold the right grip, draw a ring, let go"); the War Cry's and Earthshaker's lines are word for word today's.
- **The numbers are in `CONFIG`:** `CONFIG.classes.<class>` holds the resource and every base ability's level, use, cost, cooldown and numbers (from tickets 11 to 13), and `CONFIG.resources` holds focus (100, full, 10 a second) and mana (100 plus 2 a point of Intellect over 10, full, 2 a second in a fight and 30 out). The War Cry's and Earthshaker's costs stay in `CONFIG.warCry` and `CONFIG.groundSlam`, and rage's size and drain in `CONFIG.player`, so nothing the combat reads moved. Numbers the tickets left open are marked as calls below.
- **The adventure state knows your class:** `new AdventureState(saved, chains, { class, cap })`, a warrior with the content's cap unless it says; `state.class` and `state.cap`. A character of another class starts in that class's kit (Inventory's `STARTING_KIT`). The class isn't in the save yet: ticket 18 adds it to the character record.
- **Attributes make health and damage:** `statsAt(level, worn, class)` now answers `stamina`, `attribute`, `main`, `maxHp` (10 a point of Stamina), `damage` (a tenth of level 1's a point of the main attribute, plus the weapon's rating), `armour`, `resource` and `abilities`. Levels and gear add up through `CONFIG.items.attribute`, the rule the Inventory map already used; `levels.health` and `player.maxHp` went, as attributes now make both. The warrior's health and damage equal the old step at every level from 1 to 20, with and without gear (tested).
- **The curve is a rule:** `CONFIG.levels.xp` (100) makes level L need 100 × (L − 1) more (`xpToReach`), `CONFIG.levels.cap` is 5, and `CONFIG.levels.grey` (5) stops an enemy five or more levels below you paying XP (`paysXp`). A grey kill still counts for a quest. A restored level is kept within the cap.
- **The level-up** names each ability it brings for your class: the `level` effect's `unlocks` come from your class, and the Adventure's banner reads `unlockLine`.
- **The arena** is a level-1 warrior with the warrior's base abilities (`abilitiesOf('warrior')`); the class prototypes' flags are untouched.
- **Tests:** `tests/classes.test.ts` (24) at the adventure-state seam; `tests/saving.test.ts` reads the curve's rule instead of the old array. The Oakvale checks `levels.mjs` and `hale.mjs` pass as before, and `play-through.mjs` too once its tracker lines read the multi-giver tracker (a list since PR #79, which broke the check on main; fixed here).

**Calls made on Tom's behalf:**

- Ticket 04 says 5,500 XP in all to level 10, but its own rule (and its 19,000 to 20) make it 4,500; the rule wins.
- Heroic Throw's stagger (1 s), Scatter's arc in front of you (90°), knockback (6, the War Cry's) and stagger (1.2 s), and Hunter's Mark's and Blizzard's aim (15°, the spec's "within 15°") weren't set by the class tickets; they're in `CONFIG.classes`, to tune.
- The class stays out of the save until the roster (18) bumps the version, so this ticket needs no migration.

**For ticket 18 (the roster):** make each character with `new AdventureState(record, CHAINS, { class })`; the character record needs its class (and name, talents, slots) and the version bump from 3. `startingInventory(class)` already gives each class its kit.

**For ticket 19 (gestures):** each gesture ability's default shape is `ABILITY[id].use`; its cost and cooldown are `ABILITY[id].cost` and `.cooldown`, and its numbers `CONFIG.classes.warrior.abilities.<id>`. `player.can(id)` is true once the level brings it, and the arena's warrior already has all five (Heroic Throw, Shield Wall and Sweeping Strikes do nothing yet). The belt's pips still show only the War Cry and Earthshaker.
