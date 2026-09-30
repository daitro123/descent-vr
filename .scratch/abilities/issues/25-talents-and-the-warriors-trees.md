# 25: Talents and the warrior's trees

**What to build:** a talent point every level from 2, spent on the bag panel's Talents tab out of a fight: both trees side by side, each talent a button with its points, locked tiers dimmed, points left and a free Reset. The level-up's lines say "Talent point: open your talents". The gesture slots under the trees, swapped by pressing two. The warrior's Arms and Protection to tier 3, with Mortal Strike and Shield Slam taking the triangle. Talents are saved per character.

**Blocked by:** 18, 19.

**Status:** done

Read [the spec](../spec.md) ("The adventure state learns classes", "Talents on the bag's panel"), [Talent tree rules](10-talent-tree-rules.md) and [The warrior's abilities and talents](11-the-warriors-abilities-and-talents.md).

- [x] Tests at the adventure-state seam: tiers opening at 3, 6 and 9 points; spending refused past a maximum, a closed tier or in a fight; resetting; the warrior's talents changing their numbers; Mortal Strike and Shield Slam appearing in the triangle; swaps; talents round-tripping through the save.
- [x] A headless check levels a warrior, opens the Talents tab, spends points, fires Shield Slam on a brute, resets, and swaps two slots.
- [x] `npm run typecheck` and `npm test` pass.

## What was built

Built on 2026-09-30 **by Claude on Tom's behalf**, taking the recommended option at every fork. Nobody has spent a point on a headset: the numbers are ticket 11's, to tune.

- **Talents as data, the same machinery for every class.** `CONFIG.talents` holds the rules (`from: 2`, a point a level from 2; `tier: 3`, a tier opens at 3 points per tier above it in its tree) and the rows, `CONFIG.talents.trees[class][tree][talent]`: `tier`, `max`, and either `adds` (named numbers a point adds to) or `use` (a tier ability's shape, cost, cooldown and own numbers). `src/talents.ts` derives the types (`Tree`, `Talent`, `Knob`, `Spent`) and answers from them with no three.js: `pointsAt(level)`, `tierOpensAt`, `spentIn`, `tierOpen`, `refusal(spent, talent, class, level, fighting)` (`'fighting' | 'points' | 'max' | 'tier' | 'class'`), `fits`, `knobsOf(spent)` (every knob summed, 0 without talents), `talentAbilities(spent)`, `costWith` and `lastsWith`. Names and hover lines are `NAMES` / `LINES` there.
- **Knobs.** A talent's `adds` sums into a named number Combat reads from `player.stats.talents` (the adventure state's `statsAt(level, worn, class, spent)` puts them there): `headHit`, `hitRage`, `fullSwing`, `health` (max health ×(1+health)), `bashDamage`, `bashRage`, `parry`, `numbLess`, and the dynamic `cost:<ability>` (added to an ability's cost, through `player.costOf`) and `lasts:<ability>` (added to how long it lasts, through `player.lastsOf`). The belt's pips, the War Cry orb and the gesture's floating cost read `costOf` too.
- **The warrior's trees** (ticket 11's rows). Arms: Deep Cuts (head hits +10%/pt, 3), Blood Rage (+2 rage a hit/pt, 2), Tactician (War Cry −10 rage/pt, 2), Heavy Swing (a full-speed swing +5%/pt, 3), **Mortal Strike** (tier 3), Sweeping Mastery (Sweeping Strikes +2 s/pt, 2). Protection: Toughness (+5% health/pt, 3), Shield Spikes (a bash +5 damage and +4 rage/pt, 2), Quick Guard (parry eased 25%/pt, 2), Iron Arm (shield numb a third shorter/pt, 3), **Shield Slam** (tier 3), Unbreakable (Shield Wall +2 s/pt, 2).
- **Mortal Strike and Shield Slam** are abilities granted by a talent (`AbilityDef.byTalent`, level 8 for tier 3, left out of `abilitiesOf`), each a new `Combat.use` case with an `ABILITY_COLOUR` and sounds, spending rage. Both arm the next blow for 3 s on the clock (`AbilityClock.end` spends the charge). **Mortal Strike** (30 rage, 8 s): the next sword hit deals double and wounds the enemy for 10 s (`enemy.wound`, `enemy.heals`): a wounded enemy doesn't recover, not at camp, not leashing home, not on the Warden's throne, until the wound ends. **Shield Slam** (20 rage, 10 s): the next shield bash staggers the enemy for 3 s (brutes too; the Warden only exposed) and exposes it for 3 s. `combatStats.mortalStrikes` / `shieldSlams` count them.
- **The triangle and swaps.** `slotsOf(abilities, placed)` places each ability on its saved shape if free, then its own shape if free, then the next free shape; tier-3 abilities ask for the triangle. `swapped(slots, a, b, placed)` swaps two shapes; the result is saved as `placed` (ability → shape), beside `drawn`.
- **The adventure state** holds `spent` and `placed`: events `spend {talent, fighting}`, `resetTalents {fighting}`, `swap {shapes, fighting}`; effects `talent`, `talentsReset`, `swapped`, `talentRefused {reason}`; answers `pointsLeft`, `pointsSpent`, `spentOn`, `spentIn`, `opens`, `refuses`, `talents` (the knobs), and `slots` with talent abilities and swaps. Everything refuses in a fight; reset is free and gives every point back.
- **Saved per character**: save version 5 (a migration from 4 adds `talents: {}`); `placed` is optional. Saved talents that no longer fit (an unknown talent, too many points, a closed tier) give every point back; a placement that isn't one of your abilities is dropped.
- **The Talents tab** (`src/ui/bag/talentPage.ts`, painted by the bag's panel): the class's two trees side by side, each talent a button with `n/max`, closed tiers dimmed, "N points to spend", a free Reset, and "Gestures" with five slot buttons (the shape drawn and the ability's name) under the trees; press one slot, then another, to swap them. Hovering shows a talent's line at the page's foot; in a fight it reads "Not in a fight: your talents wait until nothing fights you." The page takes the whole board: gear slots, icons and the figure stand aside. A refused press buzzes dull; a spend buzzes like placing gear.
- **The level-up** adds "Talent point: open your talents" from level 2.
- **`&cap=N`** on the Adventure's route raises the level cap (up to `CONFIG.levels.most`, 20) for testing: Oakvale's cap of 5 can't reach tier 3.

### Tests and checks

- `tests/talents.test.ts` (new, 28 tests) at the adventure-state seam: points from level 2; tiers opening at 3, 6 and 9 points; spending refused past a maximum, a closed tier, with no points, another class's talent, or in a fight; resetting (and refused in a fight); each warrior talent changing its number (head hits, rage, War Cry cost, full swings, health, bash, parry, numb, Sweeping Strikes and Shield Wall lengths); Mortal Strike and Shield Slam appearing in the triangle; swaps, refused in a fight; talents and swaps round-tripping through the save, and unfitting ones given back.
- `enemyStates.test.ts`: Mortal Strike's wound (no recovery until it ends), Shield Slam's stun on a steady brute. `warriorAbilities.test.ts`: the tier-3 charge window and its end. `route.test.ts`: the cap flag. `saving.test.ts`: the 4→5 migration.
- `.scratch/abilities/checks/talents.mjs` (new, 31 checks, all ok): with `?emulate&nodevui&cap=10`, levels a warrior to 8 and sees the "Talent point" line, opens the Talents tab, has Quick Guard refused (tier closed), spends Toughness 3, Quick Guard 2, Iron Arm 1 and Shield Slam (the triangle, +15% health), goes into the mine to the dig's brute, draws a triangle and bashes: Shield Slam staggers the brute and exposes it for 3 s; Reset refused in the fight; outside, Reset gives 7 points back; swaps the ring and the Z; the saved record is version 5 and a reload keeps it all.
- Still passing: `characters.mjs`, `warrior-gestures.mjs`, `levels.mjs`, `saving.mjs` and `bag-adventure.mjs` (the older checks read version 5 now).

**Calls made on Tom's behalf:**

- **Quick Guard eases the parry's speed** (the swing a parry needs ÷(1+0.25 a point)): the parry is speed-based and has no time window to widen.
- **Heavy Swing's "glow at its brightest" is a swing at full damage speed** (`power >= 1`).
- **Shield Slam exposes for as long as it stuns** (3 s). The Warden, who can't be stunned, is exposed only.
- **A wounded enemy heals once its wound ends**: it arrives home hurt and recovers then; the seated Warden the same.
- **Swaps are refused in a fight too**: the whole page works only out of a fight, one rule to read.
- **The Talents page takes the whole board**, the gear slots and figure standing aside, so both trees and the slots fit at a readable size.
- **Saved talents that don't fit give every point back** rather than guessing which to keep: reset is free.
- **Talent abilities' belt pips go leftwards from the first pip**, keeping the level abilities where they were.
- **The six-ready tick isn't built**: with five shapes, at most five gesture abilities are reachable, so there's never a sixth to warn of.
- **Hovering a talent shows its line at the page's foot.**
- **`&cap=` is a test flag**, not a setting a player sees.

## For later tickets

- **26 (the ranger's and mage's trees):** add rows under `CONFIG.talents.trees.ranger` / `.mage` (two trees each; tree names must be unique across classes, since `talentsIn` finds a tree by its name) and their `NAMES` / `LINES` in `src/talents.ts`; nothing else in the machinery changes, the page and the state follow the rows. A talent that changes a number adds a knob name to `adds` and Combat (or `MageHands`, the ranger's hands) reads it from `player.stats.talents.<knob>` (0 without the talent); a cost or length reuses `cost:<ability>` / `lasts:<ability>` through `player.costOf` / `lastsOf`. A tier-3 ability is a row with `use: 'triangle'`, a `cost`, `cooldown` and its own numbers, plus an entry in `classes.ts`'s `NAMES`, a `Combat.use` case, an `ABILITY_COLOUR` and sounds; the mage's Pyroblast would be a fourth `BOLT_CHARGES` entry (ticket 24's notes), and a charge on the next blow can follow Mortal Strike's (`AbilityClock.end`). Tickets 23 and 24 list where the mage's talents land (charge time, head multiplier, burst and nova radius, Blizzard's radius read at `start`, slows).
- **27 (every class through Oakvale):** Oakvale's cap of 5 gives 4 points, only tier 1 and 2 of one tree; tier 3 needs level 8. The `&cap=` flag reaches it for checks.
