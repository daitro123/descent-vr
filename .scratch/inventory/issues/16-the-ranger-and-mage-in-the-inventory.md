# 16: The ranger and mage in the inventory

**What to build:** the ranger's and mage's items: their white starting kits, their class-locked weapons and off hands in loot and in the smith's stock, their hand-in picks, and their blue weapon at What Lies Below. The weapon models in the hands follow what's worn, as the warrior's do.

**Blocked by:** 12, 14, and the Abilities map's build tickets for how the ranger and the mage fight (their weapons must exist in the hands first).

**Status:** ready-for-agent

Read [the spec](../spec.md), [Oakvale's items](07-oakvales-items.md), and the Abilities map's "How the ranger fights" and "How the mage fights" for the weapons' real names, which replace this map's placeholders.

- [ ] Tests: each class's kit, picks, loot and stock; wrong-class weapons refused.
- [ ] `.scratch/inventory/checks/classes.mjs` starts a ranger and a mage, equips a dropped weapon on each, and hands in Raiders in the Fields.
- [ ] `npm run typecheck` and `npm test` pass.
