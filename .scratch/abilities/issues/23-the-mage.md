# 23: The mage

**What to build:** the mage becomes a class you can make and play, promoted from the mage prototype's kit A: the bolt charged at the tip of the worn wand or staff and thrown (either hand's trigger), the focus's ward that blocks, parries and bashes as the shield does, the blink on B/Y, mana on the belt's right orb in blue with Intellect's pool. Frost Nova on A/X (level 2) and Fireball (ring, level 3) with its shape shown in the air. Its class card appears on the page before VR, and `?arena&class=mage` plays it. Oakvale plays through to level 5 as a mage.

**Blocked by:** 17, 18, 19, 20.

**Status:** done

Read [the spec](../spec.md) ("The mage", "Abilities", "The belt and the level-up"), [How the mage fights](06-how-the-mage-fights.md), [Oakvale and the arena for every class](15-oakvale-and-the-arena-for-every-class.md) and [The mage's abilities and talents](13-the-mages-abilities-and-talents.md). The prototype is in `src/prototype/mage/`. Tell the Inventory map's "The ranger and mage in the inventory" ticket that the mage's weapons exist in the hand once this merges.

- [x] Tests at the combat seam for the throw's shaping, the ward's mana, the blink, Frost Nova's freeze and Fireball's burst.
- [x] A headless check makes a mage, kills the farm's camp with bolts, reaches level 2 and freezes a grunt, reaches 3 and bursts a Fireball.
- [x] `?arena&class=mage&kit=` no longer loads the prototype's kits once this lands; the README says so.
- [x] `npm run typecheck` and `npm test` pass.

## What was built

Built on 2026-09-30 **by Claude on Tom's behalf**, taking the recommended option at every fork. Nobody has thrown a bolt on a headset since the prototype: the numbers are the prototype's kit A, to tune.

- **One bar per class on the player.** `Player.resource` is the class's rage, focus or mana, and `Player.bar` (`stats.resource`) says which, how big and how it fills; `refill(bar, now, fighting, dt)` in `player.ts` steps it every frame (rage drains 2 a second as before, mana refills 2 a second while anything fights you and 30 once nothing does). `player.rage` is kept as the warrior's name for the same number, so nothing of the warrior's changed. `reset` fills focus and mana and empties rage. The arena now tells the player it's fighting while anything of the wave stands. Combat's `use` checks and spends `player.resource`.
- **The player knows its class:** `new Player(camera, renderer, ground, klass)`; the arena's numbers are that class's level 1 with every base ability. The mage holds no sword (`attachWeapons` leaves it off, so nothing cuts or parries with it), never dashes, and its shield is on the left grip only while the ward is up.
- **The mage's hands** (`src/player/mage.ts`, `MageHands`, made by the arena and the Adventure for a mage): either trigger charges a bolt (full in 0.6 s) at the tip of the worn wand or staff in the right hand, or in the left palm; let go mid-throw and it leaves along the throw. The hand's motion is read in the rig's space, so walking, turning or blinking adds nothing to a throw. The wand is drawn from the main hand's item (`wear`): the Apprentice's Wand is a wand, a `staff` look is a longer staff with the bolt 0.75 m out, and an empty main hand casts from the palm. The focus is drawn while an off hand is worn; the ward (the prototype's violet hex, on the shield's board) rises on the left grip while there's 10 mana and a focus, and blocks, parries and bashes as the shield does. B / Y blinks 3.5 m (`blinkTo` stops short of a wall or anything the ground pushes you out of), every 2.2 s, on the dash's bar. Nothing casts or wards while the bag is open, your hands are at the bench, or the smith's tools are in them.
- **The rules** (`src/combat/mage.ts`): `boltShape` (a throw's speed to the bolt's size and speed, null for a fizzle), `chargeOf`, `conjured`, `boltDamage` (7 to 20), `wardRises` / `afterBlock` (10 mana a block), `blinkTo`, and `within` (whom a burst or a nova reaches). Numbers in `CONFIG.mage` (the plain kit) and `CONFIG.classes.mage.abilities`.
- **Bolts** (`src/combat/bolts.ts`, `Bolts`, one instanced mesh of at most 16, owned by Combat like the axes): the 15° aim assist (`assist`), gentle homing, a head is a crit at the enemy's multiplier, exposed ×1.5, never guarded, walking-home enemies evade. `Combat.castBolt(hand, from, dir, shape, fraction, colour)` throws one; `combatStats.bolts` and `.boltHits` count them.
- **Frost Nova** on A / X: `Combat.press(enemies)` is the A / X button now (the War Cry for the warrior, Frost Nova once the mage's level brings it), and Frost Nova is a case of `Combat.use`. Every enemy within 3 m takes 5 (times your damage) and then `afflict('frozen', 4)`, since any hit breaks a freeze; brutes take it for half as long and the Warden ignores it (ticket 20's rule). A pale blue shockwave, a burst of frost, "FROST NOVA", both hands buzz. Unaffordable or cooling, it says so in front of you with a dull buzz, as a gesture does.
- **Fireball** on the ring: 15 mana arms the next bolt (`AbilityClock.prime`, `primed`, `spend`: a charge that waits until the next attack spends it, cleared with the clock). The bolt gathers orange, deals 1.5× and bursts for 10 on every other enemy within 2 m of where it lands, on an enemy or on the floor. Drawn again while it waits, it says "already waiting" (`Use` gained `'waiting'`) and spends nothing.
- **The belt** shows mana in blue on the right orb from level 1; pips read `player.resource`. Frost Nova's and Fireball's colours are in `ABILITY_COLOUR`, and `sfx` has `frostNova`, `fireballReady`, `fireball`, `fireballBurst` and `blink`.
- **The page before VR** offers the mage's card (`PLAYABLE` is the warrior and the mage), and `?arena&class=mage` plays the built mage (`playable(name)` in `classes.ts`; `main.ts` gives the Game the class). The prototype's kits no longer load from any flag (`&kit=`, `&cast=`, `&focus=`, `&move=`, `&mana=`); its code stays in `src/prototype/mage/` for Tom to read. `&class=mage&gestures` still lays the gesture prototype over the built mage, paid from its mana. The README says so.
- **The debug handle** in Oakvale has `combatStats`.

### Tests and checks

- `tests/mage.test.ts` (23) drives a real Player, Combat and `MageHands` through stand-in controllers against real enemies: the throw's shaping (a toss bigger and slower than a hard throw, a still hand or a tap casting nothing, walking adding nothing, the focus hand casting, the right hand's charge stopping a gesture); three full bolts killing a grunt; the ward stopping an arrow for 10 mana and no health, the same arrow hurting with the grip let go, no ward under 10 mana or without a focus, the pool's size and refill; the blink's 3.5 m, its cooldown and a wall stopping it; Frost Nova freezing two grunts within 3 m and not the one at 6, holding 4 s, broken by a bolt that lands in full, its cooldown and cost, a brute's half and the Warden's immunity, nothing on A before level 2; Fireball's charge (once, until thrown), its 1.5× and its burst on the one beside and not the one 4 m off, and its burst on the floor.
- `.scratch/abilities/checks/mage.mjs` (was the prototype's check; 27 checks, all ok): in the arena the built mage (wand and focus, no sword, 100 mana) kills a wave-1 grunt with thrown bolts, wards an arrow for 10 mana, blinks 3.5 m, freezes a grunt with X for 30 mana, draws a ring for Fireball whose bolt burns for 30 and bursts on the grunt beside, and `&kit=B` loads nothing. In Oakvale it makes Merlin the mage on `?newgame`'s form, kills the farm's four bandits with 16 thrown bolts (40 XP), reaches level 2 (two more clearings by the debug handle) and freezes a bandit grunt with X, reaches level 3 (five more) with the ring hanging, draws it and bursts a Fireball on the farm's bandits.
- Still passing: `characters.mjs` (its form now shows the warrior and the mage, the warrior picked), `warrior-gestures.mjs`, `enemy-states.mjs`, and Oakvale's `levels.mjs`, `saving.mjs` and `farm-camp.mjs`.

### Against the budget

Bolts are one instanced mesh (one draw call, 80 triangles each, at most 16: 1,280); Frost Nova and Fireball's burst use the shared shockwave and particles, and the ward is one hexagon (one draw call, 6 triangles, only while raised). No lights. `?perf` wasn't read on a headset.

**Calls made on Tom's behalf:**

- **One bar on the player** (`resource`), with `rage` as the warrior's name for it, so the ranger's focus (ticket 21, built beside this) is the same number with its own refill. Whichever of 21 and 23 merges second adopts the other's shape.
- **Frost Nova deals 5** (level-1 terms) before it freezes, so it pulls whoever it catches like any blow (a freeze alone wouldn't); ticket 13 gave it no damage.
- **Fireball's burst** reaches every *other* enemy within 2 m (the one hit takes the 1.5× bolt), and bursts on the floor or a wall too, so a near miss still burns a pack.
- **A Fireball drawn while one waits** is refused as "already waiting" rather than spending 15 mana for nothing.
- **An empty main hand still casts** from the palm (no weapon rating), as the focus hand does; with no focus worn the ward won't rise.
- **The throw is read in your own space**, not the world's, so walking while you let go doesn't throw a bolt.
- **The blink** is tried every 0.25 m and stops at the last step with a clear line at chest height that the ground doesn't push you out of; with nowhere to go it does nothing and doesn't cool down.
- **Frost Nova unaffordable or cooling** says why in front of you with a dull buzz, as a gesture does.
- **The first-visit form** (ticket 18's open call) is left to ticket 21 (the ranger), or taken by whichever of the two merges second; see the PR for which.

**For later tickets:**

- **24 (Frostbolt, Chain Lightning, Blizzard):** add each as a case of `Combat.use` (it returns `'unbuilt'` today, and the arena's mage already has all three in its Z, V and S slots). Frostbolt and Chain Lightning change the next bolt: `player.abilities.prime(ability)` as Fireball does, then in `Combat.castBolt` `abilities.spend(...)` and carry it on the `Bolt` (add a field beside `fire`), and apply it in `boltLands` (`enemy.afflict('slowed', time, slow)` for Frostbolt after the hit; `within` for Chain Lightning's arcs). Decide whether Fireball and Frostbolt can both wait on one bolt. Blizzard points where the right hand faces (`Aim.hand`); its 4 m circle's ticks can reuse `within`. Colours go in `ABILITY_COLOUR`, sounds in `sfx`. The `waiting` refusal is in gestures' words already.
- **21 (the ranger):** focus is `player.resource` with `resourceOf('ranger')`'s refill; `refill` and the belt's gold orb for focus are already in. Hook the nocked arrow into `GestureHost.busy` as the mage's charge is (`busy: () => mage?.charging('right')`). Power Shot on A/X while drawing: route it in `Combat.press` as Frost Nova is.
- **25 (talents):** Incineration (charge time), Critical Mass (head multiplier), Improved Fireball (burst radius), Arctic Reach (nova radius), Frozen Ward (a block slows) and Master of Elements (mana back) read `CONFIG.mage` and `CONFIG.classes.mage.abilities` today: put their talent-adjusted numbers through the state's answers where Combat and `MageHands` read them.
- **27 (every class through Oakvale):** What Lies Below still pays Hale's longsword, a warrior's; the mage's reward is Inventory 16's.
- **Inventory 16:** the mage's weapons are in the hand: `MageHands.wear(mainHand, offHand)` draws the worn main hand by its item's `model` (`wand`, or `staff` for a longer one; the tip lengths are `CONFIG.mage.tip`), and any off hand as the focus. The damage rating already comes through `statsAt`.

**On the headset:** whether the throw's release lands where you meant (the assist's 15° and the homing's 70°/s are `CONFIG.mage.bolt` and `.throw`); whether the ward, held up by the grip, tires the arm over Oakvale; whether 3.5 m is too far indoors (the inn, the mine); and whether Frost Nova's 3 m reaches a grunt about to hit you.
