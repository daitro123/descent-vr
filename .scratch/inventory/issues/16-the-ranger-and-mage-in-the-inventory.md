# 16: The ranger and mage in the inventory

**What to build:** the ranger's and mage's items: their white starting kits, their class-locked weapons and off hands in loot and in the smith's stock, their hand-in picks, and their blue weapon at What Lies Below. The weapon models in the hands follow what's worn, as the warrior's do.

**Blocked by:** 12, 14, and the Abilities map's build tickets [21: The ranger](../../abilities/issues/21-the-ranger.md) and [23: The mage](../../abilities/issues/23-the-mage.md) (their weapons must exist in the hands first; each tells this ticket when it merges).

**Status:** resolved

Read [the spec](../spec.md), [Oakvale's items](07-oakvales-items.md), and the Abilities map's "How the ranger fights" and "How the mage fights" for the weapons' real names, which replace this map's placeholders.

- [x] Tests: each class's kit, picks, loot and stock; wrong-class weapons refused.
- [x] `.scratch/inventory/checks/classes.mjs` starts a ranger and a mage, equips a dropped weapon on each, and hands in Raiders in the Fields.
- [x] `npm run typecheck` and `npm test` pass.

## Comments

**2026-09-30, from the Abilities map's [23: The mage](../../abilities/issues/23-the-mage.md) (built on Tom's behalf):** the mage's weapons now exist in the hand. `MageHands.wear(mainHand, offHand)` (`src/player/mage.ts`, called from the Adventure's `dressHands`) draws the worn main hand by its item's `model`: `wand` (the Apprentice's Wand) is a wand with the bolt gathering 0.32 m out, `staff` a longer staff with it 0.75 m out (`CONFIG.mage.tip`), anything else a wand; an empty main hand casts from the palm. Any worn off hand is drawn as the focus, and the ward rises only with one worn. A weapon's damage rating already reaches the bolts through `statsAt`. Still this ticket's: the mage's loot weapons and focuses (per [11's note](11-loot-from-kills.md), add them to `LOOT_GEAR` in `items.ts` with `class: 'mage'`), the smith's stock, the hand-in picks and the blue weapon at What Lies Below, which today still hands a mage Hale's longsword.

**2026-09-30, from the Abilities map's ticket 21 (the ranger), merged:** the ranger's weapons exist in the hand. A ranger character holds a bow in the left hand (`src/player/bow.ts`, placed each frame by `RangerKit` in `src/combat/ranger.ts`), shown while the main hand wears anything (`combat.ranger.worn`, set in the Adventure's `dressHands` from `gear.mainHand`); an empty main hand puts it away, as it takes the warrior's sword. Every bow draws alike today: one model, its numbers in `CONFIG.ranger`, and the worn weapon's damage rating adds to your damage through `statsAt` as the sword's does. What this ticket still needs for the ranger: a look per bow (the Bow's geometry is one recurve), and, per ticket 11's note, the ranger's weapons and off hands in `LOOT_GEAR` (`items.ts`) with `class: 'ranger'`, since today a ranger's loot is armour only. The quiver is gear only (never reached into), as the spec says. What Lies Below's reward is still Hale's old longsword for every class until this ticket (or Abilities 27) gives the ranger its bow.

## Answer

Built on 2026-09-30 by Claude **on Tom's behalf** (he asked for the build tickets to run without his input, taking the recommended option at every fork). The Abilities map's ranger (21) and mage (23) had already put the bow and the wand in the hands, and ticket 12 had already given What Lies Below its per-class picks and the kits their items, so this ticket fills in loot, looks and the few places that still assumed a warrior.

**What was built**

- **Loot** (`src/items.ts`): `LOOT_HANDS` gives each class a white, a green and a blue main hand and off hand at every loot level (1 to 5), with `class` set. It replaces the old single row of warrior hands and the `LOOT_MODEL` entry for hands; each hand piece now names its own model. Armour is unchanged (`LOOT_ARMOUR`, `ARMOUR_MODEL`). Quivers and focuses carry `noArmour`, so they carry Stamina and the class's main attribute from green up and no armour. `rollLoot` and `rollChest` pick them up with no change, and their `fits` rule already keeps another class's weapon out of your roll. The warrior's loot ids are unchanged (`iron-longsword-3` and so on), so saves still hold them.
- **The smith** (`src/vendors.ts`): nothing changed. The ranger's and mage's white weapons and off hands at item levels 1, 3 and 5 come in through `STOCK.smith`, so every class's board holds sixteen.
- **Looks in the hand**:
  - `src/player/bow.ts`: `BOW_LOOKS` by model. Every bow is the one recurve, its limbs scaled and its woods tinted, with gold or silver tips and bands where it has them. `Bow.dress(model)` swaps the one mesh's geometry (built once per look), and the string's tips follow the limbs' length. It's still one draw call.
  - `src/combat/ranger.ts`: `RangerKit.wear(mainHand)` sets `worn` and dresses the bow. The Adventure's `dressHands` calls it, as it calls `MageHands.wear`.
  - `src/player/mage.ts`: `WAND_LOOKS` by model gives each a kind (wand or staff, which sets the bolt's distance from `CONFIG.mage.tip`), a shaft colour, and iron rings with a caged stone for the blue staffs. Before this, the Crypt-Warded Staff's model (`crypt-staff`) drew as a wand. It now draws as a staff.
- **Looks in the bag** (`src/ui/bag/looks.ts`): each new model has an icon and a carried model in its own tint. There's a new `staff` look for the staffs. The atlas still fits every look (tested against `ITEM_CELLS`).
- **Hale's sword**: a ranger's or mage's record saved before picks no longer counts as having taken the longsword. It restores with nothing picked, so Hale keeps it at his hip. A warrior's does as before.

**Checks**

- `npm run typecheck` and `npm test` pass (1129 tests). `tests/classItems.test.ts` has 16 new tests covering each class's kit, the loot weapons and off hands at every level and rarity, drops for each class holding its weapons and never another class's, the class refusal in both hands, each class's smith stock, What Lies Below's picks, the old-record case, and every bow and wand having its own look. `vendors.test.ts` and `loot.test.ts` were updated for the new stock and drops.
- `checks/classes.mjs` passed all 42 checks, for a ranger and then a mage, each made on the first-visit form:
  - The kit is worn, and the short bow or the wand is in hand.
  - A farm bandit drops the class's white weapon, found with the game's own roll. Walking over it takes it, and worn from the bag it draws as the Ash Longbow or the Birch Wand.
  - The smith's weapon for the other class is refused with "class".
  - Raiders in the Fields hands in with the gloves carried off the board.
  - What Lies Below offers Hale's Old Hunting Bow or the Crypt-Warded Staff beside the Warden's Mantle. Worn at level 5, each draws its own look, and Hale keeps his sword.
- Still passing: `checks/hand-in-picks.mjs`, `checks/vendors.mjs`, and the Abilities map's `checks/ranger.mjs` and `checks/mage.mjs` (results below).

**Calls made on Tom's behalf**

- Names follow the warrior's pattern: a plain material for white, a better one for green, and "Moon-" for blue.
  - Ranger: Ash Longbow, Yew Longbow, Moonhorn Recurve; Hide Quiver, Tooled Quiver, Moonhide Quiver.
  - Mage: Birch Wand, Rowan Staff, Moonwood Staff; Quartz Focus, Amethyst Focus, Moonstone Focus.
  - The kit names and Hale's two weapons are kept.
- For the mage, the white is a wand and the green and blue are staffs, so both lengths drop.
- The focus in the off hand draws as it did: its violet is the off hand's bolt colour, so it isn't tinted by rarity. The quiver is never drawn on you.
- Bows' limbs grow with the look, from the short bow's 0.66 m up to Hale's 0.75 m. The draw length and full draw don't change, so a longer bow shoots the same.

**For later tickets**

- Abilities 27 (every class through Oakvale): this should land first. Each class's rewards, loot weapons and smith stock are now in place and tested, so 27 checks them rather than builds them.
- A new bow or wand is a line in `LOOT_HANDS` plus a line in `BOW_LOOKS` or `WAND_LOOKS`, and a bag tint in `looks.ts`. A model with no look draws as the short bow or the starting wand.
- The spec's "placeholder" note on the ranger's and mage's names can go once Tom has seen these.

**On the headset** (a new ranger, then a new mage):

1. Pick up a dropped bow or staff and wear it from the bag. Does the new bow or staff read as better than the kit's at a glance?
2. Hold Hale's Old Hunting Bow and draw it. Does the longer bow still sit right in the hand, and is the string still easy to find?
3. Wear the Crypt-Warded Staff. Does the bolt gathering 0.75 m out feel right for throwing?

