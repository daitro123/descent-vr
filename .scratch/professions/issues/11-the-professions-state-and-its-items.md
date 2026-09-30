# 11: The professions state and its items

**What to build:** the pure professions module (learn, gather, start, finish, buy, with effects and refusals out), the recipe and spot-kind table for Apprentice, Oakvale's new items in the catalogue (five materials, four consumables, the three copper gauntlets), and professions in the save's next version with its migration. The debug handle can teach a profession, set proficiency and put materials in the bag, so later tickets' checks reach any state fast. Nothing in the world changes yet.

**Blocked by:** None (can start immediately). The inventory module and the save's version 2 are on `main` (Inventory's ticket 08).

**Status:** resolved

Read [the spec](../spec.md) ("The professions state", "Items added to the catalogue", "Recipes (Apprentice)" and "Saving").

- [x] The professions module's tests cover learning (the pair and its first recipes, learning twice refused), gathering each spot kind (yield and 1 proficiency, nothing past the cap), starting a recipe (every refusal takes nothing; a start takes exactly its materials), finishing (into the bag, or left on the station with a full bag), buying (coins spent, refusals), and the grade cap.
- [x] The items' tests cover the new stacks and fixed sell prices, and the gauntlets' numbers by the rule at item level 5, green.
- [x] The saving tests load a record from the version before with no professions, and round-trip professions, proficiency and recipes.
- [x] Every new number is in the one table of tunables, in a professions group.
- [x] `npm run typecheck`, `npm test` and `npm run build` pass.

## Answer

Built on 2026-09-30 by Claude **on Tom's behalf**: he asked for the build tickets to run without his input, taking the recommended option at every fork. The Abilities roster hasn't landed, so professions went into today's single record, beside the inventory.

**What was built**

- `src/professions/professions.ts`: the pure professions module. `new Professions(inventory, saved?)` has `learn`, `gather`, `start`, `finish`, `buy`, `train` (the next grade) and `setProficiency` (for the debug handle). Each returns `ProfessionEffect`s (`learned`, `recipe`, `proficiency`, `grade`, `gathered`, `started`, `made`, `refused`) alongside the inventory's own effects. Refusals are values: `learned`, `unlearned`, `unknown`, `known`, `proficiency`, `grade`, `materials`, `coins`, `busy`, `idle`.
- The recipe and spot-kind tables are data in `CONFIG.professions` (`recipes`, `spots`), with the grade caps and every item number. `RECIPES`, `SPOT_KINDS`, `recipeOf`, `capOf`, `takesOf` and `lessonOf` read them.
- `src/items.ts`: five materials (copper ore, rough stone, copper bar, Hearthleaf, Duskcap), four consumables (rage draught, minor mana potion, elixir of the keen eye, whetstone) and the copper gauntlets of Strength, Agility and Intellect (green, item level 5, hands, anyone can wear them). A consumable can now carry `rage`, `mana`, a timed `buff`, and `belt: false`. `isPotion(item)` says whether it's on the shared cooldown: every consumable but a buff.
- `src/inventory.ts`: `count(id)` (what the bag holds of an item) and `spend(stacks, coins)` (all or nothing, the last stacks first). The belt now refuses the whetstone.
- `AdventureState.professions` works on `AdventureState.inventory`, and `Progress` carries `professions`. `ProfessionEffect` is part of the adventure's `Effect`, so the save controller writes on a profession learned, a recipe bought, proficiency gained and a grade reached.
- The save is **version 3**. The migration from 2 adds no professions.
- The bag's icon table (`src/ui/bag/looks.ts`) draws the new items by their models: tinted pouches for the materials, coloured flasks, gloves for the gauntlets.
- The debug handle has `__descent.professions.learn(p?)` (a pair, or every profession with no argument), `.proficiency(p, n)` and `.fill(items?)` (a full stack of each material by default). Each one writes the save as play would.

**Checks**

- `npm run typecheck`, `npm test` (849 passed, after merging the bag build) and `npm run build` pass.
- `tests/professions.test.ts` covers the module, `tests/professionItems.test.ts` the items and the inventory's spending, and `tests/saving.test.ts` version 3.
- `.scratch/oakvale-starting-zone/checks/saving.mjs` now expects version 3, and a new step 10 drives the debug helpers and reads the record back from IndexedDB. It all passed in headless Chromium.

**Calls made on Tom's behalf**

- **A station holds one make at a time.** `start` records the make, and `finish(station)` completes it. A second `start` at a working station is refused with `busy`. This stops `finish` from making something out of nothing. Work on a station isn't saved.
- **Finishing always pays proficiency, even with a full bag.** Then `made.left` is true, and the thing waits on the station. The world keeps it there and tries `inventory.take` again later. The inventory's own `left` effect is folded into `made`, so the view never shows a finished make as lying on the ground.
- **Materials from a spot use the inventory's `left` effect when the bag is full.** They stay where they lay, and the spot still counts.
- **`learn` accepts either profession of a pair.** Learning one teaches both, and learning a pair twice is refused.
- **Buying needs the recipe's proficiency.** Buying one version of the gauntlets teaches all three for 25 coins (`lesson: 'copper-gauntlets'`).
- **Grades advance with `train(profession, grade)`, one step at a time.** Things of an earlier grade then pay nothing. A save that names a grade also knows every recipe taught up to it. A recipe the game no longer knows, or one of a profession not learned, is dropped on load.
- **Recipe ids are the product's item ids.** The three gauntlets are three recipes.

**For later tickets**

- **12 (quests):** count the gather and make objectives from `ProfessionEffect`s: `gathered` (with its `spot` kind) and `made` (with its `recipe`). Both come even at the cap, when no `proficiency` effect does. Accepting an intro quest calls `state.professions.learn('mining' | 'herbalism')`.
- **13, 14 (the tool loop, mining, herbalism):** call `state.professions.gather(kind)` when a spot breaks, with `kind` one of `copperVein`, `hearthleaf` or `duskcap`. Refill numbers are in `SPOT_KINDS[kind].refill`. Pass the effects through `Adventure.show` and `saves.onEffects`.
- **15, 16 (the anvil, the bench):** the board or the dropped herbs pick a recipe and call `start(id)`, which takes the materials. Call `finish('anvil' | 'bench')` at the quench or the cork. Use `working(station)` to resume work you walked away from. When `made.left` is true, keep the product on the station and `take` it later.
- **17 (using what's made):** `drink` still reports only `heal`. Add the rage, mana and buff effects from the item's `rage`, `mana` and `buff`, and use `isPotion` for the shared cooldown. `buff.for` lists the classes the whetstone suits.
- **18 (trainers):** the Train list is `Object.values(RECIPES)` filtered to the trainer's professions with a non-null `price`, one row per `lessonOf`. Grey out a row when `buy` would refuse it.
- **The bag panel:** `professions.learned`, `.proficiency(p)`, `.grade(p)` and `capOf(grade)` give "Mining: Apprentice 12/25".
- **The Abilities build:** chain the next migration from version 3. Move `professions` into each character's record with `inventory` when the roster lands.

**On the headset:** nothing new to see yet.
