# 15: The stash

**What to build:** a chest by the Golden Tankard's hearth. Touch its lid and a 32-slot stash panel in two pages opens beside the bag panel, moved to and from by touch-and-carry and saved with the character. Quest items are refused.

**Blocked by:** 09.

**Status:** resolved

Read [the spec](../spec.md) and [Vendors and the stash](06-vendors-and-the-stash.md).

- [x] Inventory tests: moves between bag and stash across both pages, quest items refused, a save round trip.
- [x] `.scratch/inventory/checks/stash.mjs` stashes an item at the inn, reloads, and takes it back.
- [x] `npm run typecheck` and `npm test` pass.

## Answer

Built on 2026-09-30 by Claude **on Tom's behalf** (he asked for the build tickets to run without his input, taking the recommended option at every fork).

**What was built**

- **The chest** (`src/world/stashChest.ts`): an iron-bound chest with a brass lock plate in the Golden Tankard, against the right wall between the hearth and the barrels (`INN.stash` in `maps/forest/inn.ts`, placed by `placeStash` in `layout.ts` as the zone's `stash: StashSpot`). It's solid (one more collider box), hangs from the inn's room so it's drawn only while the room is, and costs two draws: the body and the lid.
- **Opening it:** a fist or the weapon's tip arriving on the lid (one already resting there must leave first, as with the talk board's buttons) opens the stash panel with the bag's beside it, no reach needed, with a buzz in that hand and the chests' opening sound (`sfx.chest`, from ticket 13). The lid swings up while the stash is open and shuts with it.
- **The stash panel** (`src/ui/bag/stashPanel.ts`, `stashLayout.ts`): 32 slots in two pages of sixteen, with Page 1 and Page 2 tabs along the top (level with the bag's tabs) and "Stash, N of 32 slots" under the slots. It stands on the bag panel's left, 3 cm off it and turned 25° in towards you, and hangs from the bag panel, so it turns round in front of you with it. 3 draws an eye (board, frames, icons), plus its card.
- **Built from `BagPanel`'s pieces:** the slot frames, icons and counts are now `SlotMeshes`, and the card painting is `paintCard`, both in `src/ui/bag/pieces.ts`. `BagPanel` uses them too, drawing as before.
- **Touch and carry both ways:** `Bag` now knows a `BesidePanel`, a panel open beside the bag's whose page of slots is touched, carried from and let go onto just like the bag's. A slot there is the `Spot` `{ in: 'beside', i }`. Every move still goes through `inventory.move` and `Adventure.applyThings`, so it saves. `Bag.openBeside(panel, head, gaze, probes, why)` opens it; closing the bag (the reach, walking off, falling) closes both.
- **Quest items are refused:** they can't be picked up off the quest page (as before), and the inventory refuses them the stash (`quest`), so none can be stashed.
- **It closes when you walk off**, as the bag does (1.5 m from the panel).

**Checks**

- `npm run typecheck`, `npm test` (909 passed after merging main, 11 of them new in `tests/stash.test.ts`) and `npm run build` pass.
- `checks/stash.mjs`, all 24 passed: in the inn the chest is drawn; a fist on its lid opens the stash panel on the bag panel's left with the bag's 45 cm in front, a buzz, and the lid up; no new shader program compiles at the first open (24 before and after); the stash panel costs 3 draws an eye; the bone charm goes onto page 1 and shows its card over the stash panel; the Page 2 tab shows the second page and the potions go into stash slot 22; the caption says 2 of 32; the leader's orders can't be carried off the quest page and the inventory refuses them the stash; walking off shuts both panels and the lid; after a reload the stash is as left; the lid opens it again and the potions come back into the bag, which a second reload keeps.
- `checks/bag-adventure.mjs`, `checks/bag.mjs` and `oakvale-starting-zone/checks/inn.mjs`: all passed. The inn check now counts the chest's two draws out of the room's, as it does the innkeeper's.

**Calls made on Tom's behalf**

- **Where the chest stands:** the brief said by the hearth and clear of the respawn point. The door's side of the hearth is the only way a big enemy's body (0.55 m) gets round the right side of the room, and a chest there left a pocket it could be knocked into (the inn's no-pockets test caught it). So it stands on the hearth's other side, against the right wall between the hearth and the barrels, 1.6 m from where you wake and behind you as you wake facing the door.
- **Opening it opens the bag panel too**, in front of you as a reach would, with the stash panel on its left. The bag opens on its Bag page and the stash on Page 1 each time.
- **The stash panel hangs from the bag panel** rather than being placed on its own, so it follows it round and there's one walk-off rule for both.
- **The chest's lid is the only way in**, and the stash is one for the character, as the spec says: every zone's inn will open the same one. Brackenmoor has no inn, so no chest.

**For later tickets**

- 14 (vendors): `BesidePanel` in `ui/bag/bag.ts` is the seam for the wares board beside the bag. The stash's slots are places in your things, so letting go is `inventory.move`; a vendor's are not, so ticket 14 will want letting go onto or off the board to call `buy`/`sell`/`buyBack` instead (say, an optional `accept(from, to)` on the panel). `Bag.openBeside` opens a vendor's board the same way, when you walk up to them. `SlotMeshes` and `paintCard` in `ui/bag/pieces.ts` build the board's slots and cards; `cardText` already has `sells`.
- The stash's chest (`world/stashChest.ts`) and ticket 13's chests (`world/chests.ts`) are separate models: the stash's lid opens and shuts again with the panel, where a loot chest opens once for good. If a later ticket wants one look for both, `chests.ts`'s body and lid builders are the place to share.
- Any zone with an inn: give its plan a `StashSpot` and hang a `StashChest` from its room, as `Adventure` does for Oakvale's.
- The Abilities build's per-character record: the stash is already in the inventory's save shape (version 2), so it moves with the rest of the inventory.

**On the headset** (plain URL, a new or existing character):

1. Walk into the Golden Tankard and find the chest between the hearth and the barrels. Is it easy to spot, and to reach its lid without bending too far?
2. Touch the lid: do the stash and bag panels come up where you can read both, and does the lid swing open?
3. Carry things between the bag and both stash pages with either fist and the sword's tip.
4. Walk off: do both panels close and the lid shut?
