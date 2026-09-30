# 11: Loot from kills

**What to build:** every kill in the Adventure rolls loot by the spec's role table: a pouch of coins where the enemy fell, junk and gear at the enemy's level and for your class as models beside it, a rim glow in each rarity's colour, and beams for green and blue. Touching them takes them, "Bag full" leaves an item on the ground, drops last 5 minutes (at most 12 lie), and healing orbs keep dropping. Bandit and undead junk exist in the catalogue.

**Blocked by:** 08. (Loosened from 09 on Tom's behalf, so it can run beside the bag: taking loot goes through the inventory module, and the check can read the bag through the debug handle.)

**Status:** ready-for-agent

Read [the spec](../spec.md) and [Loot](05-loot.md).

- [ ] Seeded tests over many rolls land each role's rates within a tolerance; the Warden always drops a blue and a green; raised skeletons drop nothing; drops are your class's, at the enemy's level.
- [ ] `.scratch/inventory/checks/loot.mjs` kills a farm bandit and the lumber camp's leader, loots both, and fills the bag to see "Bag full".
- [ ] With 12 drops and 12 beams lying at once, `?perf` stays inside the budget in `docs/quest-3-browser-performance-budget.md`.
- [ ] `npm run typecheck` and `npm test` pass.
