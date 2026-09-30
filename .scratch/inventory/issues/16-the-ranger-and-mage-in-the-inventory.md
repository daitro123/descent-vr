# 16: The ranger and mage in the inventory

**What to build:** the ranger's and mage's items: their white starting kits, their class-locked weapons and off hands in loot and in the smith's stock, their hand-in picks, and their blue weapon at What Lies Below. The weapon models in the hands follow what's worn, as the warrior's do.

**Blocked by:** 12, 14, and the Abilities map's build tickets [21: The ranger](../../abilities/issues/21-the-ranger.md) and [23: The mage](../../abilities/issues/23-the-mage.md) (their weapons must exist in the hands first; each tells this ticket when it merges).

**Status:** ready-for-agent

Read [the spec](../spec.md), [Oakvale's items](07-oakvales-items.md), and the Abilities map's "How the ranger fights" and "How the mage fights" for the weapons' real names, which replace this map's placeholders.

- [ ] Tests: each class's kit, picks, loot and stock; wrong-class weapons refused.
- [ ] `.scratch/inventory/checks/classes.mjs` starts a ranger and a mage, equips a dropped weapon on each, and hands in Raiders in the Fields.
- [ ] `npm run typecheck` and `npm test` pass.

## Comments

**2026-09-30, from the Abilities map's ticket 21 (the ranger), merged:** the ranger's weapons exist in the hand. A ranger character holds a bow in the left hand (`src/player/bow.ts`, placed each frame by `RangerKit` in `src/combat/ranger.ts`), shown while the main hand wears anything (`combat.ranger.worn`, set in the Adventure's `dressHands` from `gear.mainHand`); an empty main hand puts it away, as it takes the warrior's sword. Every bow draws alike today: one model, its numbers in `CONFIG.ranger`, and the worn weapon's damage rating adds to your damage through `statsAt` as the sword's does. What this ticket still needs for the ranger: a look per bow (the Bow's geometry is one recurve), and, per ticket 11's note, the ranger's weapons and off hands in `LOOT_GEAR` (`items.ts`) with `class: 'ranger'`, since today a ranger's loot is armour only. The quiver is gear only (never reached into), as the spec says. What Lies Below's reward is still Hale's old longsword for every class until this ticket (or Abilities 27) gives the ranger its bow.
