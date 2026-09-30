# 14: Vendors

**What to build:** the smith's and the innkeeper's wares boards. Walk up and the board unfolds beside the vendor with your bag panel beside it. Buy by carrying into the bag and sell by carrying onto the board, at the rule's prices. Unaffordable items are dimmed and refused, there's a Sold row of the last six, and a "Sell junk" button. The smith sells each class's white weapon and off hand at item levels 1, 3 and 5 and white armour at 2 and 4, and buys anything; the innkeeper sells the minor healing potion.

**Blocked by:** 11.

**Status:** ready-for-agent

Read [the spec](../spec.md) and [Vendors and the stash](06-vendors-and-the-stash.md).

- [ ] Inventory tests: buying, selling and buyback at the rule's prices, refusing too few coins, selling all junk, quest items unsellable.
- [ ] `.scratch/inventory/checks/vendors.mjs` sells junk to the smith, buys a potion from the innkeeper, and buys back a sold item.
- [ ] `npm run typecheck` and `npm test` pass.
