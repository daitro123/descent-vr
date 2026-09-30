# 15: The stash

**What to build:** a chest by the Golden Tankard's hearth. Touch its lid and a 32-slot stash panel in two pages opens beside the bag panel, moved to and from by touch-and-carry and saved with the character. Quest items are refused.

**Blocked by:** 09.

**Status:** ready-for-agent

Read [the spec](../spec.md) and [Vendors and the stash](06-vendors-and-the-stash.md).

- [ ] Inventory tests: moves between bag and stash across both pages, quest items refused, a save round trip.
- [ ] `.scratch/inventory/checks/stash.mjs` stashes an item at the inn, reloads, and takes it back.
- [ ] `npm run typecheck` and `npm test` pass.
