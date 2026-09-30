# 14: Vendors

**What to build:** the smith's and the innkeeper's wares boards. Walk up and the board unfolds beside the vendor with your bag panel beside it. Buy by carrying into the bag and sell by carrying onto the board, at the rule's prices. Unaffordable items are dimmed and refused, there's a Sold row of the last six, and a "Sell junk" button. The smith sells each class's white weapon and off hand at item levels 1, 3 and 5 and white armour at 2 and 4, and buys anything; the innkeeper sells the minor healing potion.

**Blocked by:** 11.

**Status:** resolved

Read [the spec](../spec.md) and [Vendors and the stash](06-vendors-and-the-stash.md).

- [x] Inventory tests: buying, selling and buyback at the rule's prices, refusing too few coins, selling all junk, quest items unsellable.
- [x] `.scratch/inventory/checks/vendors.mjs` sells junk to the smith, buys a potion from the innkeeper, and buys back a sold item.
- [x] `npm run typecheck` and `npm test` pass.

## Answer

Built on 2026-09-30 by Claude **on Tom's behalf** (he asked for the build tickets to run without his input, taking the recommended option at every fork).

**What was built**

- `src/vendors.ts`: who trades and what they sell, as data. `STOCK.smith` comes from the catalogue: the loot table's white weapons and off hands of every class at item levels 1, 3 and 5, and its white armour for every slot at 2 and 4 (`CONFIG.vendors.smith`). `STOCK.innkeeper` is the minor healing potion. `waresFor(vendor, class)` is what a board shows, `opensWith(giverShows)` says whether walking up unfolds the talk board or the wares, and `vendorTalk` puts "Trade" beside the giver's buttons.
- `src/inventory.ts`: `checkBuy`, `checkBuyBack` and `checkSell` say before you let go whether a purchase, a buyback or a sale would go, so the slot under a carried ware lights green or red. `buy`, `buyBack` and `sell` use them.
- `src/ui/wares/`: the wares board, a `BesidePanel` like the stash's (ticket 15), hung on the bag panel's left and turned in towards you by the stash's 25°. It has the talk board's parchment with the vendor's name and a "Sell junk" button along the top, the stock in a grid of four with each price under its slot, and the Sold row of six along the bottom with what each fetched. About 3 draws an eye (the board, the frames, the icons from the bag's atlas), plus 1 for the card. A ware you can't afford has its icon and frame dimmed and its price in red, turns red under a fist, and the grip on it refuses with the strong buzz. Its card says "Costs N coins" (red if too dear), or "Buy back for N coins" on the Sold row.
- `src/ui/bag/bag.ts`: a `BesidePanel` may carry a `Trade`. Then carrying off it into a bag slot takes (buys), and letting something of yours go over it gives (sells), where the stash's panel would move the item. `openBeside(..., at)` opens the bag pinned at a point, so the wares board stands where Hale's talk board would, with no following and no walking-away close of its own; the vendor's distance closes it. `src/ui/bag/pieces.ts`: slots can be dimmed, and a card's footer can say what it costs rather than what it sells for.
- `src/ui/talkBoard.ts`: a board has a name, a "Trade" button, and three buttons fit in a row. `placeBeside` is shared with the wares board.
- The Adventure: walk up to the smith or the innkeeper within 2.3 m, looking their way, and their wares board unfolds beside them, with the bag panel opening on its right. Walk off 3.6 m and both fold. Shutting the bag by the shoulder shuts the wares too, until you walk away and back. "Sell junk" sells every grey in the bag with a buzz and the coins' sound (a light buzz with none). Leaving the zone empties the Sold row.

**Checks**

- `npm run typecheck`, `npm test` and `npm run build` pass. New tests are in `tests/vendors.test.ts` (the smith's stock, the innkeeper's, prices, what walking up unfolds, "Trade" beside the buttons) and `tests/inventory.test.ts` (the checks before you let go, selling what you wear). The existing vendor tests cover buying, selling, buyback, refusing too few coins, selling all junk and quest items being unsellable.
- `checks/vendors.mjs`, all 21 passed. The smith's board unfolds with the bag panel 57 cm to its right, the board turned in (0.91 facing). It shows sixteen wares, all dimmed with their prices in red at 0 coins, for 3 draws an eye. The iron longsword's card says "Costs 12 coins" in red, and the grip on it refuses with a strong buzz. "Sell junk" sells three torn cloth and a bone charm for 10 coins, and the Sold row holds them, newest first. The tunic carried onto the board sells for 3 and comes back off the Sold row for 3. Walking off folds both. The innkeeper sells a potion for 8 and still has it. Leaving the zone empties the Sold row, and a reload keeps the coins and what was bought.
- `checks/vendors.mjs` also checks that at the anvil (Professions ticket 15), with its hammer and tongs in your hands, the smith's wares stay shut. `checks/bag-adventure.mjs`, `checks/stash.mjs`, `checks/hand-in-picks.mjs` and the Professions' `checks/anvil-adventure.mjs` still pass after the bag's changes and the merges.

**Calls made on Tom's behalf**

- **A vendor who also gives quests talks first.** While they have a quest to offer or take back (a gold "!" or "?"), walking up unfolds their talk board with "Trade" beside the quest's buttons, pressed like any board button. Otherwise the wares board unfolds straight away. "Trade" folds the talk board and unfolds the wares. Accepting, "Not now" and "Goodbye" fold the talk board and keep the wares shut until you've walked away and back. Today no villager has a quest yet, so this waits for Professions' ticket 18, which gives the smith one. It's tested in `tests/vendors.test.ts` and wired in `Adventure.trade`.
- **"Trade" sits beside "Train" once Professions' ticket 18 lands.** It hadn't landed when this was built, so the smith's talk board has only the quest's buttons and "Trade". Ticket 18 adds `'train'` to `TalkButton` and to `vendorTalk`'s buttons.
- **The smith's board shows your class's weapons only.** The stock holds every class's white weapon and off hand, but a class can never wear another's, and one class's six hand pieces plus the ten armour pieces fill the sixteen slots exactly. Only the warrior's exist until ticket 16 adds the ranger's and mage's to the loot table, and they then come into the stock with no change.
- **Both vendors buy anything but a quest item,** the innkeeper as well as the smith, as WoW's vendors do. You can also sell what you're wearing, carried off the figure.
- **One at a time.** A ware is bought one per carry, including potions. A stack sold goes to the Sold row as one entry and comes back whole.
- **Carried off the board and let go anywhere but a bag slot, a ware goes back.** It never drops on the ground. A bag slot on the quest page or a gear slot refuses it.
- **Where it sits:** the wares board is 60 cm from the vendor towards you, 55 cm to your right (as Hale's board) and 1.35 m up (`CONFIG.vendors.board`), a little higher than Hale's so that the Sold row clears the inn's bar. It's built on the stash's side panel, as the coordinator asked once ticket 15 landed: the bag panel opens pinned on its right, and the board hangs on the bag's left, turned in as the stash's does.
- **"Sell junk" is painted on the board**, lit while pressed, rather than a separate 3D button like the talk board's. That keeps the board at three draws. It's pressed the same way: a fist or the tip arriving on it, 0.4 s after the board unfolds and 0.6 s after a press.
- **Prices:** the elixir of the keen eye and the whetstone sell for 4 and 2 coins, as Professions' spec settled them, not the 3 each ticket 06 had. The rest are ticket 06's.
- **At the anvil the wares stay shut.** The anvil stands in front of the smith, so walking up to it would otherwise unfold their wares. While it has your hands the wares close, and they stay shut until you've walked away and back.
- **A ware carried is a third kind of origin beside the hand-in's shelf.** Ticket 12's `Shelf` (Hale's pick) is carried from outside the bag's panels, while the wares are a `BesidePanel` whose slots the bag already touches, lights and cards, so the wares keep their `Trade` and a carried ware's origin is `{ in: 'ware' }` in the bag's `From`, next to the shelf's.
- The board shows what the bag's hands touch a frame later than the bag panel does, which can't be seen at 72 Hz.

**For later tickets**

- Another board beside the bag that buys or sells (a trainer's recipes, say) implements `BesidePanel` with a `Trade`, as `WaresBoard` does.
- 16 (ranger and mage): once their white weapons and off hands are in `LOOT_GEAR`, the smith sells them at 1, 3 and 5 with no change here.
- Professions 18 (trainers): the smith's quest chain goes into `CHAINS` and the talk-first rule starts working on its own. Add "Train" to `TalkButton`, `vendorTalk` and `Adventure.vendorPress`. A hand-in to the smith currently floats its level-up over Hale (`Adventure.show` with `handIn`), so point that at the giver. `vendorTalk` passes a hand-in's pick through, but the Adventure's `Shelf` reads only Hale's board, so a pick at the smith needs the vendor's talk board as the shelf too.
- 17 (one sitting): about 300 to 400 coins on the route buys a white chest piece (24 or 48 coins) and potions at 8.

**On the headset:** walk up to the smith and to the innkeeper. Check that the board and the bag panel sit where you can reach both without stepping sideways, that the prices read, that carrying a ware into the bag and something of yours onto the board feels like sorting, and that "Sell junk" is easy to hit.
