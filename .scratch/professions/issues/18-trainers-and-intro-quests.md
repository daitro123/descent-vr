# 18: Trainers and intro quests

**What to build:** the smith and the herbalist as trainers. Each gets a gold "!" once Raiders in the Fields is handed in, and the talk board with "Ore and Fire" or "Leaves for the Pot". Accepting teaches the pair of professions and hangs the tool on the loop. The objectives are break 2 copper veins and make a whetstone, or gather 4 Hearthleaf and brew a minor healing potion, and the hand-in pays XP as a level-2 quest and 5 coins. The "Train" button lists the Apprentice recipes with price and proficiency, grey until buyable, and buys through the professions module. The trainers' barks follow what you've learned. The bag panel shows a line per learned profession ("Mining: Apprentice 12/25"). The debug handle's shortcut for learning stays, for checks.

**Blocked by:** 12, 13, 14, 15, 16, and Inventory's ticket 09 (the bag in the Adventure).

**Status:** ready-for-agent

Read [the spec](../spec.md) ("Trainers and quests" and "The view in VR") and [Trainers and first lessons](09-trainers-and-first-lessons.md).

- [ ] The adventure state's tests: both intro quests open at Raiders in the Fields' hand-in, accepting teaches the pair, the objectives count, the hand-in pays.
- [ ] `.scratch/professions/checks/trainers.mjs` takes both intro quests from a fresh character after Raiders in the Fields, completes and hands them in, buys the rage draught from the herbalist, and sees three quests in the tracker while Hale's is also active.
- [ ] `npm run typecheck`, `npm test` and `npm run build` pass.

## Comments

**2026-09-30, notes from the tickets built so far** (read their Answers for detail):

- **Quests (12):** add the smith's and the herbalist's chains to `CHAINS` with `after: 'raiders'`, reach each board through `state.giver('smith' | 'herbalist')`, send `{ kind: 'accept' | 'handIn', giver }`, give objectives their own place, and add the givers' spots to the quest arrow's givers. Accepting calls `state.professions.learn('mining' | 'herbalism')`.
- **The Train list (11):** `Object.values(RECIPES)` filtered to the trainer's professions with a non-null `price`, one row per `lessonOf`; grey a row out when `buy` would refuse it.
- **The smith's board (Inventory 14 and 12):** "Train" goes beside "Trade". A trainer quest with `picks` gets the pick shelf's reward row; with none it keeps "Hand in".
- **The herbalist (16):** make them a real friendly character with barks and quests, not the bench's stand-in.
- **Hands at stations (15, 16):** the anvil's rule is in `stationHands` with its numbers under `CONFIG.professions.station`. The bench still has its own copy under `CONFIG.professions.bench`. Fold the bench into `stationHands` here, since both trainers' stations are touched.
