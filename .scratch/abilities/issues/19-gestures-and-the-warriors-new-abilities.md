# 19: Gestures and the warrior's new abilities

**What to build:** the gesture recogniser comes into the game from the prototype: hold the right grip, draw, let go; the zones at the shoulder, the hips and the tool loop never arm; a stroke over 1.6 s or with lost tracking is dropped; the tick, the trail, the read flash with the ability's name and cost, the miss puff and "not enough rage". Gesture slots live in the adventure state with their default shapes. The warrior gets Heroic Throw (ring, 6), Shield Wall (Z, 8) and Sweeping Strikes (V, 10). The first time a gesture is unlocked, its shape hangs in the air until drawn. `?arena&class=warrior` plays with every base ability.

**Blocked by:** 17.

**Status:** done

Read [the spec](../spec.md) ("Gestures", "Abilities", "The arena", "Performance"), [Using abilities by gesture](07-using-abilities-by-gesture.md) and [The warrior's abilities and talents](11-the-warriors-abilities-and-talents.md). The prototype is in `src/prototype/gestures/`.

- [x] The recogniser's bench becomes a test: each of the five shapes read from seeded sloppy strokes at the prototype's rate or better, sword swings, thrusts and blocks read as nothing, and a grip in each zone never arming.
- [x] Tests for the three abilities' rules where they have a seam (Shield Wall's blocks, Sweeping Strikes' second target).
- [x] A headless check in the arena as a warrior draws each shape, sees each ability fire, and sees a swing with the grip held fire nothing.
- [x] `?arena&gestures` still runs as a prototype for the ranger and mage.
- [x] `npm run typecheck` and `npm test` pass.

## What was built

Built on 2026-09-30 **by Claude on Tom's behalf**, taking the recommended option at every fork. Nobody has drawn a shape on a headset yet: every read rate here comes from strokes made up by code, as in ticket 07.

- **The recogniser is the game's** (`src/player/gestures/`): `matcher.ts` and `recorder.ts` are the prototype's, cut to shapes (no flicks); `shapes.ts` holds the five shapes (`ring`, `z`, `v`, `triangle`, `s`, the ids `ABILITY[id].use` already used) and their templates, the prototype's clean ones plus any in `recorded.ts` (none yet: its comment says how to paste the prototype's RECORD mode's strokes in). Its numbers (the grip's thresholds, 1.6 s, the threshold and margin, the places that never arm, the buzzes, the trail and the hanging shape) are `CONFIG.gestures`. Over the prototype's own seeded strokes it reads exactly as the prototype did (96.5% of 200 of each shape, 98.0 to 99.3% of the warrior's three alone), and 1,800 swings, thrusts and blocks with the grip held read as nothing.
- **`gestures.ts`** arms it on the right grip in the arena and the Adventure alike, reads a stroke against the shapes your slots hold, and uses the ability in that shape's slot through `Combat.use`. It shows the tick, the trail, the read (trail and burst in the ability's colour, its sound, a strong buzz, the name and cost floating up), the miss (grey puff, "?", two ticks), and "not enough rage", "ready in N s" or "nothing to throw at" with a dull buzz, spending nothing. The shape you haven't drawn yet hangs a metre ahead at chest height, bright where it starts and fading to its end, turning with you once you look well away.
- **Slots are the adventure state's:** `slotsOf(abilities)` in `classes.ts` puts each base gesture ability in its own shape; `state.slots` and `state.unlearned` answer from your class and level, and a `drawn` event learns a shape (a `learned` effect, which saves). The save keeps `drawn` as an optional list on the record, so no version bump.
- **The warrior's three** (`src/combat/abilities.ts` holds their rules, Combat applies them): **Heroic Throw** throws a spectral axe (`thrownAxes.ts`, one instanced mesh, at most three in the air) that homes on its enemy's chest at 16 m/s and lands for 20 and a 1 s stagger; **Shield Wall** holds for 6 s, the shield glowing gold, and a heavy blow blocked behind it takes nothing and doesn't numb the arm ("SHIELD WALL" floats up); **Sweeping Strikes** lasts 8 s, and each sword hit also strikes the nearest other enemy whose body is within 1.5 m of the one hit, for 60%. Each has its own sound. Cooldowns and how long each lasts live in the player's `AbilityClock`, cleared on death and restart.
- **The belt** shows a pip per ability your level has brought, left to right in the order they came, lit while it's off cooldown and affordable (the Oakvale check `levels.mjs` reads the pips' new places).
- **The arena:** `?arena&class=warrior` (or `?arena`) is the level-1 warrior with all five base abilities and gestures on. `&gestures` still runs the prototype over any class, and the game's gestures stand aside while it does.
- **Tests:** `tests/gestures.test.ts` (the prototype's bench as a test: each shape from seeded sloppy strokes at the prototype's rate or better, the warrior's play reading as nothing, each taken place never arming, dropped strokes, the slots and learning shapes through the adventure state and the save) and `tests/warriorAbilities.test.ts` (the ability clock, Heroic Throw's aim, Shield Wall's blocks, Sweeping Strikes' second target). The stroke maker moved into `tests/support/gestureStrokes.ts` so the tests don't lean on the prototype. The headless check is `.scratch/abilities/checks/warrior-gestures.mjs` (25 checks, all ok): as a warrior it draws a ring with no rage and then with rage (the axe lands for 20 and staggers a grunt), a Z (a brute's heavy blow on the shield takes nothing, then breaks the guard once the wall lapses), a V (a swing at one of two brutes hurts both), a swing and nine kinds of play with the grip held (nothing fires, the sword still cuts), the grip at each taken place, and the prototype for the ranger and the mage. The prototype's check (`gestures.mjs`) and `levels.mjs` pass.

**Calls made on Tom's behalf:**

- **Heroic Throw's aim:** "where the right hand faces" is the blade's direction; with no one within 15° of it, it tries where you look, and it needs a clear line. With no one to throw at, nothing is thrown or spent. The axe homes, so a target that steps aside is still hit; frenzy adds to it as it does to Earthshaker.
- **Shield Wall** covers a block with the sword as well as the shield; parries and arrows are as before.
- **Sweeping Strikes** takes 60% of the blow as dealt (a crit, the frenzy and an exposed enemy included), measures 1.5 m between the two bodies, and doesn't chain.
- **A shape read while its ability is cooling down** says when it's ready and spends nothing, like "not enough rage".
- **The shape in the air:** one at a time, in the slots' order; drawing it counts once it's read, paid for or not. The arena keeps no save, so its shapes hang again each visit.
- **When gestures don't arm:** with no gesture ability (so Oakvale, capped at 5, is exactly as before), while the bag is open or your hands are bare at the alchemy bench, and while you're down. A stroke is read only against the shapes that hold something.
- **Belt pips** are fixed per ability rather than centred, so a pip never moves as a level adds one.

**For the ranger and the mage (21, 23, 24):**

- Hook each class's attack into `GestureHost.busy` (an arrow nocked, a bolt charging) so the stroke is dropped; the Adventure's and the arena's hosts pass none today.
- `Combat.use` switches on the ability and returns `'unbuilt'` for anything not built: add each class's gesture abilities there (and their colour to `ABILITY_COLOUR`, their sound to `sfx`). It spends and checks `player.rage`: focus and mana need the player to hold the class's resource, and `AbilityClock.refuses(ability, amount)` already takes any bar.
- The A/X abilities (Frost Nova, Power Shot while drawing) aren't gestures; the arena and the Adventure still call `combat.warCry` on A/X.
- The level-3 gesture in Oakvale will hang in the air by itself (`state.unlearned`), and is remembered in the save's `drawn`.
- Ticket 18 moves the record per character: carry `drawn` over with the rest of `Progress`.
- `&gestures` is the prototype's until ticket 27 removes it; its RECORD mode is still how templates get recorded.
