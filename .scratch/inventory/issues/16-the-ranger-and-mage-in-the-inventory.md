# 16: The ranger and mage in the inventory

**What to build:** the ranger's and mage's items: their white starting kits, their class-locked weapons and off hands in loot and in the smith's stock, their hand-in picks, and their blue weapon at What Lies Below. The weapon models in the hands follow what's worn, as the warrior's do.

**Blocked by:** 12, 14, and the Abilities map's build tickets [21: The ranger](../../abilities/issues/21-the-ranger.md) and [23: The mage](../../abilities/issues/23-the-mage.md) (their weapons must exist in the hands first; each tells this ticket when it merges).

**Status:** ready-for-agent

Read [the spec](../spec.md), [Oakvale's items](07-oakvales-items.md), and the Abilities map's "How the ranger fights" and "How the mage fights" for the weapons' real names, which replace this map's placeholders.

- [ ] Tests: each class's kit, picks, loot and stock; wrong-class weapons refused.
- [ ] `.scratch/inventory/checks/classes.mjs` starts a ranger and a mage, equips a dropped weapon on each, and hands in Raiders in the Fields.
- [ ] `npm run typecheck` and `npm test` pass.

## Comments

**2026-09-30, from the Abilities map's [23: The mage](../../abilities/issues/23-the-mage.md) (built on Tom's behalf):** the mage's weapons now exist in the hand. `MageHands.wear(mainHand, offHand)` (`src/player/mage.ts`, called from the Adventure's `dressHands`) draws the worn main hand by its item's `model`: `wand` (the Apprentice's Wand) is a wand with the bolt gathering 0.32 m out, `staff` a longer staff with it 0.75 m out (`CONFIG.mage.tip`), anything else a wand; an empty main hand casts from the palm. Any worn off hand is drawn as the focus, and the ward rises only with one worn. A weapon's damage rating already reaches the bolts through `statsAt`. Still this ticket's: the mage's loot weapons and focuses (per [11's note](11-loot-from-kills.md), add them to `LOOT_GEAR` in `items.ts` with `class: 'mage'`), the smith's stock, the hand-in picks and the blue weapon at What Lies Below, which today still hands a mage Hale's longsword.
