# 13: Oakvale's chests

**What to build:** three chests in Oakvale: at the top of the watchtower (level 2), in the lumber camp leader's tent beside the orders (level 2), and the bandits' strongbox at the dig in the mine (level 4, today a prop). Touch the lid to open one. It holds 5 × its level in coins and a green (20% a blue), opens once per character, stays open and is saved.

**Blocked by:** 11.

**Status:** resolved

Read [the spec](../spec.md) and [Oakvale's items](07-oakvales-items.md).

- [x] Tests: each chest's roll once, remembered across a save round trip; the plan's chest spots are clear and reachable.
- [x] `.scratch/inventory/checks/chests.mjs` opens the watchtower's chest, reloads, and finds it open and empty.
- [x] `npm run typecheck` and `npm test` pass.

## Answer

Built on 2026-09-30 by Claude **on Tom's behalf** (he asked for the build tickets to run without his input, taking the recommended option at every fork).

**What was built**

- The plan: a zone now has `chests` (`ChestPlan` in `src/maps/types.ts`: id, level, look, where it stands and faces, its interior, and where its contents come out). Oakvale's three, with ids as the save keeps them:
  - `oakvale-watchtower` (level 2): on the watchtower's hilltop, its back to the tower's wall round the far side from the door, away from the gang's three posts. It's solid.
  - `oakvale-leaders-tent` (level 2): in the leader's tent beside the crates the orders lie on, on the side away from the leader's post, its front on the door's line so its lid is in reach from the doorway (as the orders are).
  - `oakvale-strongbox` (level 4): the bandits' strongbox in the dig, which was a static prop in the mine's model and is now this chest (`MINE.dig.strongbox`, `mineChest` in `mine.ts`).
- `src/world/chests.ts`: the chests in the world. A wooden chest or an iron-bound strongbox (sizes in `CONFIG.chests.looks`), with a lid on a hinge. A fist or the sword's tip within 12 cm of a shut lid lifts it; the lid swings back over 0.6 s and stays open, showing an empty inside. A chest opened before is built open. The mine's strongbox is staged and shown with the mine's parts, the others with the outdoors.
- `src/loot.ts`: `rollChest(level, class, rand)`, 5 × its level in coins and one piece of your class's gear at its level from the same pool as kills, green 80% or blue 20% (`CONFIG.loot.chest`), seeded by `chestSeed(chest, character)`.
- The adventure state: a `{ kind: 'chest', chest, level }` event records the chest opened (`inventory.openChest(id)`, which now takes nothing by default) and returns its roll as a `loot` effect. A chest already opened returns nothing. The chest effect writes the save at once.
- The Adventure: touching a lid gives a creak-and-thud (`sfx.chest`) and a buzz in that hand, and the contents lie on the ground at the chest's drop spot, taken as a kill's are.
- `CONTEXT.md` has **Chest**.

**Checks**

- `npm run typecheck`, `npm test` and `npm run build` pass. New tests: `tests/chests.test.ts` (the roll's coins, one green or blue for your class at its level, about 20% blue over 20,000 seeded rolls; one roll per chest and character; written at once and still open after a save round trip; the lid's touch, swing and "open from the start") and "Oakvale's chests" in `tests/forest.test.ts` (where each stands, more than a metre from every camp's posts, clear of the orders, walkable up to with the lid in a hand's reach, solid, and its contents coming out on open ground out of your feet's way).
- `checks/chests.mjs`: all passed. The left fist lifted the watchtower chest's lid: the sound, a buzz in the left hand, a pouch of 10 coins and a green Banded Heater Shield (item level 2) with its beam on the ground beside it, nothing in the bag yet, and the save written at once with the chest opened. Walking over it took it all. After a reload the chest showed open (the other two shut), and touching its lid again did nothing.
- `checks/loot.mjs` and the Oakvale saving check still pass. The saving check had broken on `main` when the tracker became a list (quests from more than one giver); it now reads the quest taken last.
- Screenshots of all three, shut and open, looked right; the strongbox moved a quarter metre off the dig's wall so its lid clears the rock's lumps.

**Calls made on Tom's behalf**

- What's inside **comes out as loot on the ground beside the chest**, using ticket 11's pouch and items, so a full bag leaves an item flashing red as it does for a kill. It lands to the chest's side, not before it, so it isn't taken by your feet the moment it appears. Like any drop it isn't saved until taken: reloading before you pick it up loses it, as with a kill's.
- **The "top of the watchtower" is its hilltop at the tower's foot.** The tower can't be climbed (a 12 m solid model), and the camp's clearing is already called the tower's top.
- The chest's roll has **its own row, `CONFIG.loot.chest`**, rather than a chest role in `CONFIG.loot.roles`. A role there would join `Role`, which also sets XP in `CONFIG.levels.roles`, and a chest's coins are exact (5 × level), not a range.
- **The seed is the chest's id and the character's class** (every character is a warrior for now). When the roster lands, pass the character's own id to `chestSeed` instead.
- The strongbox's ore went with the prop: it's a chest now, and an opened one shows empty.
- A chest is "clear of posts" when every post stands more than a metre from its footprint. The leader's post is 1.75 m from the tent's chest, which is inside the tent where nobody stands.

**For later tickets**

- 15 (the stash): `world/chests.ts` builds the wooden chest and its hinged lid (`bodyGeometry`/`lidGeometry` are private for now; export them if the stash chest reuses the look). A `ChestPlan` is only for chests opened once; the stash chest is a different thing.
- 16 (ranger and mage): chests roll your class's gear through the same pool, so their weapons in `LOOT_GEAR` reach chests too.
- 17: Oakvale's chests pay 10 + 10 + 20 = 40 coins and three greens or blues.
- The Abilities roster: seed chests by the character's id (`chestSeed(id, character)` in `adventureState.ts`), and move `chests` with the rest of the inventory into each character's record.

**On the headset:** open each chest by touching its lid with a fist. Check the lid is easy to reach (the tent's from its doorway, bending a little), that the creak and buzz feel like opening something, and that the drop beside it is easy to see and take.
