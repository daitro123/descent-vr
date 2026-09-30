# 13: Oakvale's chests

**What to build:** three chests in Oakvale: at the top of the watchtower (level 2), in the lumber camp leader's tent beside the orders (level 2), and the bandits' strongbox at the dig in the mine (level 4, today a prop). Touch the lid to open one. It holds 5 × its level in coins and a green (20% a blue), opens once per character, stays open and is saved.

**Blocked by:** 11.

**Status:** ready-for-agent

Read [the spec](../spec.md) and [Oakvale's items](07-oakvales-items.md).

- [ ] Tests: each chest's roll once, remembered across a save round trip; the plan's chest spots are clear and reachable.
- [ ] `.scratch/inventory/checks/chests.mjs` opens the watchtower's chest, reloads, and finds it open and empty.
- [ ] `npm run typecheck` and `npm test` pass.
