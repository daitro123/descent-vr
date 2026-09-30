# 17: Oakvale with the inventory, in one sitting

**What to build:** a whole run of Oakvale as a warrior with the inventory: loot, a vendor, the stash, the three chests, the belt in a fight and each hand-in's pick. Measure the budget where it's worst (the dig with drops lying and the panel open), tune anything that falls outside it, and check the plain route's coins land in the spec's 300 to 400.

**Blocked by:** 10, 13, 14, 15.

**Status:** ready-for-agent

Read [the spec](../spec.md) and `.scratch/oakvale-starting-zone/issues/38-the-whole-zone-in-one-sitting.md` as prior art.

- [ ] `.scratch/inventory/checks/whole-zone.mjs` plays the chain through with the inventory and records coins, drops and draw calls.
- [ ] The ticket's answer lists what Tom should check on the headset.
- [ ] `npm run typecheck` and `npm test` pass.
