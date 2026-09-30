# 17: Using what professions make

**What to build:** the made consumables working in a fight. The rage draught gives 30 rage and the minor mana potion 40% of mana (a no-op until the Abilities build gives the mage mana), both drunk from the belt on the shared 60 s potion cooldown. The elixir of the keen eye is drunk from the bag panel or the hand and gives +10% damage for 5 minutes. The whetstone is taken from the bag and rubbed along the blade (or the arrowheads) for +5% damage for 10 minutes; it never goes on the belt. One of each buff at a time, a new one replacing the old, with a small icon and its minutes left beside the belt HUD. Buffs aren't saved.

**Blocked by:** 11, and Inventory's ticket 10 (the belt in the Adventure).

**Status:** ready-for-agent

Read [the spec](../spec.md) ("The professions state", "Items added to the catalogue" and "The view in VR").

- [ ] The inventory module's tests: the rage draught and mana potion share the cooldown with the healing potion; the whetstone and the elixir report their buffs, and a second replaces the first.
- [ ] The character's damage reads the buffs (a test through the adventure state or the character's numbers).
- [ ] `.scratch/professions/checks/consumables.mjs` drinks a rage draught against a camp (rage +30), rubs a whetstone on the sword and sees damage rise 5% and its icon count down.
- [ ] `npm run typecheck`, `npm test` and `npm run build` pass.
