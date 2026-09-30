# 10: The belt in the Adventure

**What to build:** the two hip slots in the Adventure, promoted from the belt prototype's variant (a) (`?belt`): take a flask, the weapon in that hand fades, drink at the mouth, cancel by pulling away, refill from the bag's stacks, the shared 60 s cooldown that dims the flasks, and carrying a potion from the bag panel onto a hip slot or onto the figure's belt. A new character has three minor healing potions on the right hip.

**Blocked by:** 09.

**Status:** resolved

Read [the spec](../spec.md) ("The belt" under "The view in VR") and [The belt and drinking a potion](04-the-belt-and-drinking-a-potion.md).

- [x] The inventory module's tests cover drinking, the cooldown and the refill.
- [x] `.scratch/inventory/checks/belt-adventure.mjs` drinks a potion in Oakvale against a camp (health rises by 40%), cancels one, sees the flasks dim for 60 s, and moves a potion from the bag onto the belt.
- [x] `?belt` still runs as a prototype.
- [x] `npm run typecheck` and `npm test` pass.

## Answer

Built on 2026-09-30 by Claude **on Tom's behalf** (he asked for the build tickets to run without his input, taking the recommended option at every fork).

**What was built**

- `src/player/beltZones.ts`: where the belt hangs. `BeltZone` is one small type, a name and an offset from the neck point (down, out to your right, ahead), and `HIPS` holds the two potion slots. `BeltFrame` follows the headset: the neck point 10 cm below and 8 cm behind the eyes, and a heading that turns only once you look more than about 30° away. It places any zone and finds the nearest one to a hand.
- `src/player/belt.ts`: prototype (a) promoted and driven by the inventory. A hand arriving at a hip with a flask makes it glow and ticks once. The grip (at `CONFIG.bag.grip`'s numbers, as the bag's) takes the flask, and the weapon in that hand leaves at once, so it can't hit or block, while a see-through copy fades out over 0.15 s. Hold the flask within 15 cm of the mouth point for 0.7 s, with a steady buzz, and `inventory.drink(slot)` runs: a strong pulse, two gulps, and its effects go through `Adventure.applyThings`, which heals 40% of your maximum on `drank` and saves. A hand over 1 m/s at the mouth pauses the drink; pulling away cancels it and keeps the flask in hand; letting go of the grip puts it back and fades the weapon in again. A slot drunk empty refills from the bag with a small pop. Each slot is a leather cup, the flask's model and one disc painted with the count and the cooldown's ring: 5 draws an eye for both hips with the starting belt.
- The cooldown: every flask dims while `inventory.cooldown` runs, and a thin ring on each drains. A grip at a dimmed flask is refused with the strong buzz.
- Bag to belt: the panel has the belt's two slots under the figure (the left hip's on your left), on every page. A potion let go over them, or over the figure, goes onto the belt; a potion carried off the panel down to your real hip goes onto that hip, which glows green, or red for anything that isn't a potion. The figure wears a belt with a flask at each filled hip.
- `Sword.away` and `Shield.away` (in `weapons.ts`): out of the hand for a moment, not drawn and unable to hit or block, separate from whether the hand wears one.
- `?belt` is untouched and still runs as the prototype, with its own copies.

**Checks**

- `npm run typecheck`, `npm test` (1040 passed after merging `main`, with the belt's zones and panel slots in `tests/belt.test.ts` and two new belt cases in `tests/inventory.test.ts`) and `npm run build` pass.
- `checks/belt-adventure.mjs`, all 28 passed: three potions on a new character's right hip, both hips 70 cm below the eyes and 5 draws an eye; the hand at the hip glows it with one tick; the grip takes the flask, the sword fades out (0.42 opacity at 0.07 s, gone by 0.37 s) and can't hit, and nothing new compiles; pulled away after 0.3 s the drink is cancelled, and let go it goes back and the sword returns; against the lumber camp, fighting you, the drink lands at 0.71 s and health rises by exactly 40% of the maximum, with 7 steady buzzes and a strong one, and the right hip drunk empty refills with the bag's 4; every flask dims, a grip at one is refused, the ring redraws as it drains, and after 60 s they're bright; a reload keeps the belt and the cooldown's 30 s left; from the open bag, potions go onto the figure's left hip slot, more stack there when carried down to the real left hip, and a tunic carried there is refused.
- `checks/belt.mjs` (the prototype), `checks/bag-adventure.mjs` and `checks/stash.mjs`: all passed. `oakvale-starting-zone/checks/saving.mjs` stops at step 4 reading the tracker's lines, on `main` too (before this build), since the quest givers' change reshaped the tracker; it isn't the belt's.

**Calls made on Tom's behalf**

- A dimmed flask can't be taken: the grip gets the strong buzz and a low blip, and no glow or tick invites it.
- Taking needs no speed gate, as in the prototype. The tool loop's 1.5 m/s gate stays the Professions build's.
- The belt's slots on the panel sit under the figure in the order you wear them (left hip on your left), though the figure itself faces you.
- A potion let go over the figure goes to the hip already holding it with room, else an empty hip, else the right hip.
- The flask in a hip slot hides while its one is in your hand, as in the prototype; the count shows what's left.

**For later tickets**

- Professions (the tool loop, their tickets 13 and 17): build the loop as another `BeltZone`, for example `{ name: 'toolLoop', offset: { ...HIPS[1].offset, ahead: HIPS[1].offset.ahead - 0.2 } }`, placed with the same `BeltFrame` (the Adventure's is `adventure.belt.frame`, updated every frame) and found with `frame.nearest`. The main hand's hip is `HIPS[1]`. `player.sword.away = true` takes the sword out of the hand without touching what's worn; set it back to false to return it. `belt.holding(hand)` says whether a hand holds a flask, so the loop can leave a busy hand alone. The rage draught and mana potion drink through the same `inventory.drink`; add their effect beside `drank` in `Adventure.show`.
- The alchemy bench (`professions/bench/bench.ts`) finds the hips with its own numbers (`CONFIG.alchemyBench.hip`, 70 cm below the head and 20 cm aside). It could ask `adventure.belt.slotNear(at)` instead, so a flask let go at the bench lands where the belt's slots really hang.
- Gestures: a flask in the right hand holds gestures off (`held` in the Adventure). `CONFIG.gestures.taken` keeps its own copy of where the hips hang (0.7 m below and 4 cm ahead of the eyes, 19 cm aside), which matches the belt's numbers today; if `CONFIG.belt.hip` or `neck` changes, change it too.
- The Abilities build: the belt fades whichever model `weaponModel` returns for a hand (the sword or the shield today); a ranger's bow or a mage's focus needs its own model there, with an `away` like the sword's.
- 14 (vendors): the bag panel's `BagSpot` now has a `belt` kind beside `grid` and `gear`, and letting a carried item go off every panel checks `BagWorld.beltAt` for a hip before it drops. A wares board beside the bag can ignore both.

**On the headset** (plain URL, a new or existing character):

1. Reach down to each hip without looking: do your hands land on the slots, and does the glow and tick find them?
2. Take a flask with the sword hand and then the shield hand: does the fading weapon read clearly, and does it come back right when you let go?
3. Drink between a bandit's blows: is 0.7 s at the mouth right?
4. Watch the ring drain after a drink, and try a flask while it's dim.
5. Open the bag and carry a potion onto the figure's belt slot, then one down to your real hip.

