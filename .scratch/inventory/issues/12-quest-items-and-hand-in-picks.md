# 12: Quest items and hand-in picks

**What to build:** the leader's orders go on the bag's quest page when touched and leave at the hand-in. Each of Hale's hand-ins shows a reward row of two items fitting your class, carried into the bag to hand the quest in (a full bag makes the pick wait). What Lies Below offers the class's blue weapon or the Warden's Mantle, and Hale's sword leaves their hip only when a warrior takes it.

**Blocked by:** 09.

**Status:** resolved

Read [the spec](../spec.md) and [Oakvale's items](07-oakvales-items.md).

- [x] Adventure-state tests: each hand-in's picks for each class; the orders on the quest page and gone at the hand-in; a hand-in waiting on a full bag; Hale's sword at the hip by class.
- [x] `.scratch/inventory/checks/hand-in-picks.mjs` hands in Raiders in the Fields and carries a pick into the bag.
- [x] `npm run typecheck` and `npm test` pass.

## Answer

Built on 2026-09-30 by Claude **on Tom's behalf** (he asked for the build tickets to run without his input, taking the recommended option at every fork). Quests from more than one giver (Professions ticket 12, PR #79), loot (PR #82) and classes (PR #81) landed first, so this is built on their chains, `state.giver(...)` and `state.class`.

**What was built**

- **The picks in the catalogue** (`src/items.ts`): the Farmstead Gloves and Hedgerow Boots (green, item level 2), the Timberline Leggings and Marshal's Cap (green, 3), the Warden's Mantle (blue, 5), Hale's Old Hunting Bow (the ranger's blue) and the Crypt-Warded Staff (the mage's). Each armour piece is made once per main attribute (`farmstead-gloves-strength`, `-agility`, `-intellect`), and `pickFor(id, klass)` names the one for a class. Hale's longsword is unchanged.
- **The quests** (`src/quests.ts`): `Quest.reward` is gone. A quest has `picks` per class, and `paid` (what it paid before picks, for old records). `QUEST_ITEM` maps a pickup to its quest item (`orders` → `leaders-orders`).
- **The adventure state**:
  - A giver's board shows `picks` when a quest is ready, and no "Hand in" button then. A quest without picks keeps the button.
  - `handIn` takes a `pick` and a bag slot `to`. Without a pick, the first on offer is taken, which is what the older checks and tests use.
  - A full bag, or a slot holding something else, refuses the pick with `full`. The quest stays ready and the orders stay on the page.
  - `pickRefusal(pick, to)` answers before the item is let go, so the slot can turn red or green.
  - The orders go on the quest page when touched, and `giveUp` removes them at the hand-in. A record saved with the orders taken but not on the page gains them on load.
  - `haleSwordAtHip` is true unless a quest was handed in with `hale-longsword` picked. `pickedAt(id)` reads what was picked.
  - The picks follow `state.class`, the class PR #81 added (`new AdventureState(saved, chains, { class })`, a warrior by default).
- **The save**: each handed-in quest keeps `picked`. It's an optional field, so the version stays 2 with no migration. A record whose What Lies Below was handed in without `picked` counts as having taken the longsword, since that's all the old hand-in paid.
- **Hale's board** (`src/ui/talkBoard.ts`): at a hand-in, the buttons' row becomes the reward row. Each item stands in a frame of its rarity's colour, with its card underneath (the bag's card, comparing against what you wear). The board also says "Carry one into your bag." The card painter moved out of `BagPanel` as `paintItemCard`.
- **Carrying a pick** (`src/ui/bag/bag.ts`): the bag takes an optional `Shelf`, meaning items offered beside it. A fist or the tip on a pick lights its frame, with the light buzz. The grip carries it, and if the bag is shut it swings round in front of you with the item already in hand. Let go over a bag slot to take it. Let go anywhere else and it goes back to the board. The Adventure's shelf is Hale's board, and taking a pick hands the quest in with the fanfare over Hale.

**Checks**

- `npm run typecheck`, `npm test` and `npm run build` pass. The tests include 17 new ones in `tests/handInPicks.test.ts`: each hand-in's picks for each class, the class's main attribute on every armour pick, the orders on the page and gone at the hand-in, a full bag, a refused slot, and Hale's sword by class and by pick, with reloads and an old record. The quest chain, saving and givers tests were updated. The plain route still lands levels 2, 3, 4 and 5 where it did.
- `checks/hand-in-picks.mjs`: all 31 passed. It hands in Raiders in the Fields by carrying the gloves off the board into bag slot 4, with the bag shut to start with. The Lumber Camp's pick is refused with a full bag (red slot, strong buzz) and taken once a slot is freed. What Lies Below's Warden's Mantle leaves Hale's sword at their hip. A reload keeps it all.
- Updated for picks and passing: `oakvale-starting-zone/checks/hale.mjs` (the gloves carried on the sword's tip), `lumber-camp.mjs` and `warden.mjs`. `warden.mjs` also got a one-line fix for the tracker becoming a list in PR #79. `play-through.mjs` takes a pick at each hand-in, and with main merged its whole Hale chain passes, from Raiders in the Fields to Hale's longsword in your hand at level 5.

**Calls made on Tom's behalf**

- A pick goes into the bag, never straight into a hand. That includes Hale's longsword, which you now wear from the bag at level 5. Before, it was swapped into your hand.
- There's no "Hand in" button once a quest with picks is ready. Carrying the pick is the hand-in. Walk away to leave it waiting.
- Gripping a pick with the bag shut opens the bag, rather than asking you to open it first.
- Letting a pick go onto an occupied slot is refused (as buying is), not moved to a free slot.
- Armour picks are one item per main attribute rather than one item whose attribute follows who wears it, so an item's numbers never depend on its wearer.
- Hale's What Lies Below line no longer promises the sword: "So it's done. Take what you like of my old kit…"

**For later tickets**

- 14 and 15 (vendors and the stash): a wares board or the stash can be a `Shelf` for `Bag.update` (`itemAt`, `stackAt`, `check`, `take`, `show`). `paintItemCard` draws any card. `Inventory.receive(stack, to)` and `checkReceive` take something into a chosen bag slot. `purchase` now uses them.
- The Abilities roster: pass the character's class in `AdventureState`'s options (`{ class }`), and the board offers that class's picks.
- The trainers' quests (Professions 18): give a quest `picks` for a reward row, or none to keep the "Hand in" button.

**On the headset** (plain URL, a new character):

1. Finish Raiders in the Fields and walk up to Hale. Are the two items and their cards readable, and does the board read as "take one"?
2. Grip the gloves with the bag shut. Does the bag swinging round with the gloves in hand feel right, or would you rather open it first?
3. Fill the bag and try a pick. Is the red slot and the strong buzz enough to say the bag is full?

