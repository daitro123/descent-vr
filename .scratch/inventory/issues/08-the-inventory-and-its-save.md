# 08: The inventory and its save

**What to build:** the pure inventory module and the item catalogue, wired into the Adventure without any new view yet. A warrior starts in the starting kit, Hale's old longsword at the last hand-in becomes a worn blue item (no pick yet), and the character's health and damage read worn gear through the one rule. The save carries the bag, gear, belt, coins, stash and opened chests, and a version-1 save migrates to a warrior in the kit wearing its sword. The game plays exactly as today from the player's side, except that the numbers now come from gear.

**Blocked by:** None (can start immediately). If the Abilities map's per-character roster has landed, the inventory goes into each character's record; otherwise into today's one record. Either way, bump the version with a migration.

**Status:** ready-for-agent

Read [the spec](../spec.md) ("The item catalogue and the rule", "The inventory state", "Saving", and the Testing Decisions).

- [ ] Every operation and refusal in the spec's inventory module is covered by Vitest tests through its interface, seeded where random.
- [ ] The rule's tests pass: rarities in order, the green set against the Abilities budget, Hale's longsword giving today's +20%, and armour at about 10% and 15%.
- [ ] `sword` is gone from progress; the main hand's item decides the sword's model and damage, and the Hale's-sword swap at the last hand-in still happens.
- [ ] A version-1 record migrates (both swords), an unknown item id is dropped, and everything round-trips through the in-memory store.
- [ ] `npm run typecheck` and `npm test` pass, and the plain route through Oakvale still lands the same levels.
