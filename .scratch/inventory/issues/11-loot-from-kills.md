# 11: Loot from kills

**What to build:** every kill in the Adventure rolls loot by the spec's role table: a pouch of coins where the enemy fell, junk and gear at the enemy's level and for your class as models beside it, a rim glow in each rarity's colour, and beams for green and blue. Touching them takes them, "Bag full" leaves an item on the ground, drops last 5 minutes (at most 12 lie), and healing orbs keep dropping. Bandit and undead junk exist in the catalogue.

**Blocked by:** 08. (Loosened from 09 on Tom's behalf, so it can run beside the bag: taking loot goes through the inventory module, and the check can read the bag through the debug handle.)

**Status:** resolved

Read [the spec](../spec.md) and [Loot](05-loot.md).

- [x] Seeded tests over many rolls land each role's rates within a tolerance; the Warden always drops a blue and a green; raised skeletons drop nothing; drops are your class's, at the enemy's level.
- [x] `.scratch/inventory/checks/loot.mjs` kills a farm bandit and the lumber camp's leader, loots both, and fills the bag to see "Bag full".
- [x] With 12 drops and 12 beams lying at once, `?perf` stays inside the budget in `docs/quest-3-browser-performance-budget.md`.
- [x] `npm run typecheck` and `npm test` pass.

## Answer

Built on 2026-09-30 by Claude **on Tom's behalf** (he asked for the build tickets to run without his input, taking the recommended option at every fork).

**What was built**

- `src/loot.ts`: the pure loot roll. `rollLoot(fallen, class, rand)` takes the enemy's role, level and family and your class, and returns coins and item ids by the role table, now in `CONFIG.loot.roles`. Rolls are seeded (`seeded`, mulberry32) from `lootSeed(camp, enemy, time)`, a hash of the camp, the member's index (or the Warden's hall and where it fell) and the milliseconds played.
  - Coins are a whole number from 1 to 3 × level × the role's multiplier (1, 3 for a leader or deep brute, 10 for the Warden), evenly.
  - Junk is one of the enemy's family's two kinds. Gear is at most one piece, bosses aside: the Warden drops a blue and a green every time.
  - Gear is always your class's: a warrior's weapon or off hand, or armour carrying your class's main attribute (a white carries none).
- `src/items.ts`: the loot catalogue, generated as data. For every slot there's a white, a green and a blue at item levels 1 to 5, with placeholder names (Iron, Tempered and Moonsteel Longswords; Leather, Studded and Chain armour; "of the Bear, Fox or Owl" for a green or blue armour piece's attribute). Weapons and off hands are the warrior's only. Oakvale's junk (worn trinket and torn cloth for bandits, bone charm and grave dust for the undead) now comes at every loot level too.
- The adventure state: a kill event now carries the enemy's `family` and the loot `seed`, and a kill's effects begin with `{ kind: 'loot', coins, items }` when anything dropped. Loot lying on the ground isn't yours yet, so the save controller doesn't write for it, nor for `left` (an item a full bag leaves behind).
- `src/world/drops.ts`: loot on the ground. The pouch sits where the enemy fell, and each item turns 30 cm over the ground, 40 cm out round it. Each has a rim glow in its rarity's colour from an emissive term in the model material (one shader for all; the pouch glows in its best item's colour). Greens and blues raise a 2 m unlit, additive beam, fading upwards, one draw call each. Items are drawn by the bag's `modelOf` (`src/ui/bag/looks.ts`, from ticket 09), in its `RARITY_COLOUR`. A fist, the sword's tip or your feet (the orb's radii) takes a piece on a new touch. Drops last 5 minutes, through your death, and at most 12 lie at once, the oldest going first. A drop inside the mine shows only while you're in it.
- The Adventure: kills seed their loot and show the drop. Touching the pouch takes its coins (floating "+N coins"); touching an item calls `inventory.take`, with a buzz in that hand and the pickup sound, and its effects go through `Adventure.applyThings`, so an open bag panel shows them. With the bag full, the item stays, flashing red, "Bag full" floats over it and the hand buzzes hard. Healing orbs are unchanged.

**Checks**

- `npm run typecheck`, `npm test` and `npm run build` pass. New tests: `tests/loot.test.ts` (20,000 seeded rolls per role land within tolerance; the Warden's blue and green; raised skeletons drop nothing; your class's gear at the enemy's level) and `tests/drops.test.ts` (touch, full-bag flashing, lifetime, the cap of 12).
- `checks/loot.mjs`: all passed. A farm bandit dropped 2 coins and a worn trinket, each taken with the left fist. The lumber camp's leader dropped 12 coins and a green Studded Jerkin of the Bear (item level 2, with a beam), taken by walking over them. With the bag filled, a thug's pouch of 5 coins was still taken, while its torn cloth stayed flashing red under "Bag full" with a strong buzz, and was taken once there was room. (Game time is stepped, so a run is the same each time; if a later change leaves every thug empty-handed, the check lays a drop there for the full-bag step and says so.)
- Twelve drops with twelve beams in view: 226 draw calls against 130 without, both eyes, inside the 300 budget (246k triangles against 235k).
- The lumber camp's, the Warden's, saving's, finding the way's, the villagers' and the bag's (`bag-adventure.mjs`, after merging ticket 09) checks still pass. Those that build kill events by hand now pass a family and a seed, and the bag's check clears the drops of the kills it uses to reach level 5.

**Calls made on Tom's behalf**

- Levelled loot has **one catalogue id per item level**, `<name>-<level>` (for example `iron-longsword-3`, `torn-cloth-2`), generated from data. This is simpler than building an entry per drop, and a save can hold these ids like any other. The old level-1 junk ids (`torn-cloth` and the rest) became `torn-cloth-1` etc. No save could hold them yet.
- Junk is at the enemy's level too, so it sells for level × 2.
- Green and blue armour exists once per main attribute (Bear, Fox, Owl), so a drop can always carry your class's. The ranger's and mage's loot weapons wait for ticket 16: until then a ranger or mage would get armour only (every character is a warrior for now).
- Loot swords draw the plain blade, and loot shields the round shield, until item models reach the hands (ticket 09).
- Items turn 30 cm over the ground rather than lying flat, so a fist or the sword's tip reaches them without kneeling. Walking over a drop takes it too, as it takes an orb.
- Touching the pouch takes only the coins; each item is its own touch (ticket 05's answer). A small gold "+N coins" float shows what the pouch held, since the coin count arrives with the bag panel.
- An enemy above level 5 drops level-5 items (the loot levels end there), with coins still by its own level.
- Loot on the ground (`world/drops.ts`) stays apart from what you let go of off the bag panel (09's `world/dropped.ts`). The two look and behave differently (a pouch, rims and beams against a model on a disc that falls from your hand), and ticket 09 left the merge optional; one module for both is a later tidy-up if it earns its place.

**For later tickets**

- 13 (chests): roll a chest's green or blue with the same pool, for example by adding a chest role to `CONFIG.loot.roles` or calling `rollLoot` with a leader's table. `lootSeed` and `seeded` are in `loot.ts`.
- 16 (ranger and mage): add their weapons and off hands to `LOOT_GEAR` in `items.ts` with `class` set, and `rollLoot` picks them up.
- 17: coins per camp are `CONFIG.loot.coins × level × role`, about 2 × level per ordinary kill on average.

**On the headset:** kill a few bandits and walk over what they drop. Check that the pouch and items are easy to see and reach, that the beams read from across a camp without being too bright, and that the "Bag full" flash is clear.
