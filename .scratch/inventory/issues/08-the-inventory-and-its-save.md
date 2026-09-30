# 08: The inventory and its save

**What to build:** the pure inventory module and the item catalogue, wired into the Adventure without any new view yet. A warrior starts in the starting kit, Hale's old longsword at the last hand-in becomes a worn blue item (no pick yet), and the character's health and damage read worn gear through the one rule. The save carries the bag, gear, belt, coins, stash and opened chests, and a version-1 save migrates to a warrior in the kit wearing its sword. The game plays exactly as today from the player's side, except that the numbers now come from gear.

**Blocked by:** None (can start immediately). If the Abilities map's per-character roster has landed, the inventory goes into each character's record; otherwise into today's one record. Either way, bump the version with a migration.

**Status:** resolved

Read [the spec](../spec.md) ("The item catalogue and the rule", "The inventory state", "Saving", and the Testing Decisions).

- [x] Every operation and refusal in the spec's inventory module is covered by Vitest tests through its interface, seeded where random.
- [x] The rule's tests pass: rarities in order, the green set against the Abilities budget, Hale's longsword giving today's +20%, and armour at about 10% and 15%.
- [x] `sword` is gone from progress; the main hand's item decides the sword's model and damage, and the Hale's-sword swap at the last hand-in still happens.
- [x] A version-1 record migrates (both swords), an unknown item id is dropped, and everything round-trips through the in-memory store.
- [x] `npm run typecheck` and `npm test` pass, and the plain route through Oakvale still lands the same levels.

## Answer

Built on 2026-09-30 by Claude **on Tom's behalf** (he asked for the build tickets to run without his input, taking the recommended option at every fork). The Abilities map's per-character roster hasn't landed, so the inventory went into today's single record.

**What was built**

- `src/items.ts`: the catalogue as data (the three classes' starting kits, Hale's old longsword as a blue of item level 5, the minor healing potion, the leader's orders as a quest item, and four placeholder junk items) and the one rule. Every number is in `CONFIG.items`, `CONFIG.bag` and `CONFIG.belt`.
  - Rarity scales every number: white 1, green 1.6, blue 2.4 (so a blue is 1.5 times a green).
  - A weapon carries only a damage rating: 1/60 per item level for a white, so Hale's longsword adds exactly 0.2 and the plain sword about 0.017.
  - Armour is 30 per item level for a white set, shared over the six other slots (chest 25%, legs 20%, head and off hand 15%, hands and feet 12.5%), rounded per piece. It cuts `armour / (armour + 270 × the attacker's level)`: a set of your level cuts 10% (white), 15% (green) or 21% (blue) at any level.
  - Greens and blues carry Stamina and a main attribute, each a third of the level's own attributes over a full set, in whole points and at least one: 7 of each at level 5, 8 at level 10. Weapons carry no attributes.
- `src/inventory.ts`: the pure inventory module. It moves between bag, gear, belt, stash and the ground (stacking, splitting, swapping), takes loot in and reports what didn't fit, buys, sells, buys back the last six, sells all junk, drinks and refills, and opens a chest once. Refusals are values: `class`, `level`, `slot`, `full`, `coins`, `quest`, `empty`, `cooldown`.
- The adventure state owns an `Inventory` (every character is a warrior for now). `sword` left `Progress`, `statsAt(level, worn)` reads gear, and `Stats` gained `armour`. The main hand's item model decides the blade. What Lies Below's `reward` is `hale-longsword`, worn at once, with the plain sword going into the bag.
- Combat cuts every blow you take by your armour against the attacker's level. The arena's player wears nothing, so it's unchanged.
- The save is version 2. The migration from version 1 gives the warrior's starting kit wearing the plain sword or Hale's longsword, three potions on the right hip and 0 coins. On load, an unknown item id, or anything in a slot that can't hold it, is dropped.

**Checks**

- `npm run typecheck`, `npm test` (762 passed) and `npm run build` pass. The plain route still lands levels 2, 3, 4 and 5 where it did.
- `checks/saving.mjs` (updated for version 2, with a new step 9 that loads a version-1 record in the browser): all passed.
- `checks/warden.mjs`: all passed, including Hale's longsword in your hand at 2.0 damage and gone from Hale's hip, after a reload too.

**Calls made on Tom's behalf**

- The rarity scale is 1 / 1.6 / 2.4 for every number. This is the one table that gives both armour targets (10% and 15%) and keeps a blue at 1.5 times a green.
- A new character's kit (shield, tunic, boots) is 17 armour, so at level 1 you take about 6% less damage than before. That's the only change a player would notice.
- Attributes are whole points with at least one per green or blue piece. At low levels a blue can carry no more attributes than a green, but it always has more armour.
- The plain sword goes into the bag when Hale's longsword replaces it, where today it vanished.
- The belt refills a slot only when it's drunk empty, taking the first stack of that potion in the bag.
- Class isn't saved yet: every character is a warrior until the roster lands.

**For later tickets**

- 09 (the bag in the Adventure): the operations are `AdventureState.inventory.move / take / sell / ...`. Feed their effects through `Adventure.show` and `SaveController.onEffects`, which already writes on any effect but XP or a refusal. `AdventureState.sword` is null when the main hand is empty.
- 10 (the belt): call `inventory.tick(dt)` every frame and `drink(slot)`. `drank.heal` is a share of maximum health.
- 11 (loot): loot's item level is the enemy's. Ids are strings, so levelled loot needs its own ids (for example one per level) or a catalogue entry built per drop.
- 12 (picks): replace `Quest.reward` and `inventory.wear()` with the pick. `haleSwordAtHip` reads What Lies Below's hand-in and must learn "only if a warrior took it". The orders go on the quest page with `take`, and `giveUp` removes them at the hand-in.
- 13 (chests): `openChest(id, stacks, coins)` records the chest and takes its contents.
- The Abilities and Professions builds: chain the next migration from version 2. Move `inventory` into each character's record when the roster lands. `CONFIG.items.attribute` holds the Abilities map's attribute numbers until that map's build owns them.

**On the headset:** nothing new to see. Play to the last hand-in, and check that Hale's longsword still lands in your hand and that blows feel about as hard as before.
