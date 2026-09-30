# 27: Every class through Oakvale

**What to build:** one headless run per class from a new character to What Lies Below's hand-in, as Oakvale's "whole zone in one sitting" did for the warrior, checking levels land where the curve says, each class's rewards, and the frame budget with every class's biggest effect up. The class prototypes' remaining flags (`&gestures`, `?arena&class=` variants) are removed; the README lists what's left.

**Blocked by:** 26.

**Status:** done

Read [the spec](../spec.md) ("Performance", "Testing Decisions") and [Effects within the budget](16-effects-within-the-budget.md).

- [x] `.scratch/abilities/checks/` has a whole-zone run per class, all passing.
- [x] `?perf` numbers for the worst moment per class are recorded in this ticket, under 10 draw calls and 5,000 triangles for the abilities.
- [x] Anything a class can't clear on the plain route is tuned (camp strength first) and noted here.
- [x] `npm run typecheck` and `npm test` pass.

## What was built

Built on 2026-09-30 **by Claude on Tom's behalf**, taking the recommended option at every fork. Nothing in the game changed: no class needed tuning, so this ticket is the checks, the prototypes kept reachable, and the README.

- **One whole-zone run, three classes.** Inventory 17's `.scratch/inventory/checks/whole-zone.mjs` takes a class (`warrior`, `ranger` or `mage`) and plays a new character of it from `?newgame` through every camp, the chests and Hale's three hand-ins, then the smith, the innkeeper and the stash, fought through the real combat. `.scratch/abilities/checks/whole-zone.mjs` runs it for each class in turn (or the ones named) and passes when all do. The ranger nocks at the string, draws full and looses at the nearest enemy's chest (leading its walk and the drop), with Power Shot on A, a Snare Trap drawn as a ring when a grunt reaches it and the ward squeezed while an arrow flies at it. The mage charges a bolt and throws it, holds the ward up against a blow, uses Frost Nova on X and blinks back on B when reached, and draws a Fireball ring on a pack. Both back off at walking pace. A talent point is spent as each level brings one: the warrior's in Protection (Toughness, then Iron Arm), the ranger's in Marksmanship (Steady Aim, then Swift Arrows), the mage's in Fire (Ignite, then Critical Mass). At each hand-in it checks the level is where the curve puts the XP and the points spent are the level's; at the last one, that Hale offers the class's own reward, and that it's what the hand draws once worn (Hale's Old Longsword as `hale`, Hale's Old Hunting Bow as `hunting-bow`, the Crypt-Warded Staff as `crypt-staff`), with Hale's own sword gone from his hip only for the warrior.
- **The worst moment per class,** `.scratch/abilities/checks/effects-budget.mjs` (new): `?arena&class=<class>&perf`, both eyes drawn, five grunts held in an arc, each class's abilities fired at once through Combat (the tier-3 ones added, since the arena has no talents), and the frame drawn with and without the ability effects.
- **The prototypes stay** (Tom's call, relayed with the brief): `src/prototype/` and all its flags are kept. The mage's prototype moved from `&class=mage` (now the built mage) to `?arena&class=mage-prototype` beside the ranger's `&class=ranger-prototype`, so `?arena&class=warrior|ranger|mage` is the game's arena and nothing more. Each class prototype takes the warrior's sword, shield and abilities away, so the War Cry and the game's gestures don't fire under it. The README's new **Prototypes** section lists every prototype URL (the ranger's three variants, the mage's three kits and their axes, the gestures over each class, the bag, the belt and the three professions prototypes). `gestures.mjs`'s mage part now enters `&class=mage-prototype`, and checks that `&class=mage-prototype` is the prototype and `&class=mage` the built mage.

### The worst moments (`?perf` in the arena)

Per eye (the budget is per frame drawn); the abilities' share is the frame with the effects less the frame without.

| Class | What was up | Abilities' draw calls | Abilities' triangles | Whole frame, both eyes |
|---|---|---|---|---|
| Warrior | Earthshaker and the War Cry, 3 Heroic Throws in the air, Shield Wall, Sweeping Strikes, Mortal Strike and Shield Slam armed | **5** | **1,292** | 76 calls, 24.0k triangles |
| Ranger | 3 traps (2 snares, an explosive), a rooted grunt's vines, Hunter's Mark, Trueshot, 9 arrows in the air with a Volley's fan, Scatter's gust | **7** | **3,776** | 48 calls, 28.0k triangles |
| Mage | 16 bolts in the air with a Pyroblast, the Blizzard, the Ice Barrier's ring, Frost Nova's shockwave, Chain Lightning's arcs | **5** | **4,132** | 68 calls, 28.6k triangles |

All under 10 draw calls and 5,000 triangles, with the pool's 4 point lights at most. The shared particles are most of each (1.6k to 2.6k triangles). The floating words (each blow's number, an ability's name) cost up to 11 more draw calls an eye; they're the game's text, drawn for every sword hit too, so they're counted beside the budget.

### The runs

Each class, final script, after merging main (Inventory 17's run, Herbalism, using what professions make):

| | Warrior | Ranger | Mage |
|---|---|---|---|
| Checks | 53, all ok | 53, all ok | 53, all ok |
| Deaths | 0 | 0 | 0 |
| Levels (Raiders, Lumber Camp, after the mine, What Lies Below) | 2, 3, 5, 5 | 2, 3, 5, 5 | 2, 3, 5, 5 |
| Talents at the end | Toughness 3, Iron Arm 1 | Steady Aim 3, Swift Arrows 1 | Ignite 3, Critical Mass 1 |
| How it fought | 316 swings, 173 landed | 60 arrows (13 Power Shots), 6 Snare Traps | 126 bolts, 4 Fireballs, 3 Frost Novas, 18 blinks, the ward up 26 times |
| The drink at the lumber camp | 111 to 137 of 137 | 92 to 130 of 130 | 79 to 130 of 130 |
| Reward, drawn as | Hale's Old Longsword, `hale` | Hale's Old Hunting Bow, `hunting-bow` | Crypt-Warded Staff, `crypt-staff` |
| Coins before spending, at the end | 320, 518 | 418, 533 | 343, 452 |
| The dig, the bag open (worst heading) | 44 calls, 12.4k triangles | 48 calls, 12.7k | 52 calls, 12.6k |
| The smith, both boards open | 118 calls, 234k triangles | 122 calls, 235k | 118 calls, 234k |

Each shape drawn was read as meant (0 misread). Every view kept the 4 point lights. The ranger's 418 coins is one run's swing with the Warden's roll; the route's expected total stays 333.

### Checks

- `.scratch/abilities/checks/whole-zone.mjs`: all three passed (the table above), about 55 minutes each with the three running at once in software rendering.
- `.scratch/abilities/checks/effects-budget.mjs`: all passed (the table above).
- `.scratch/abilities/checks/gestures.mjs`: all ok, with the two new prototype checks.
- `npm run typecheck` clean; `npm test` 60 files, 1,281 tests passed.

**Calls made on Tom's behalf:**

- **The prototypes are kept, not removed** (the brief's change to this ticket): the mage's moves to `&class=mage-prototype` so `&class=mage` is only the built mage, and the README lists every prototype URL under Prototypes.
- **Nothing was tuned.** Every class cleared the plain route with no deaths, so camp strength and the talents' first guesses stay as they are.
- **The budget is checked per eye.** It's a budget for a frame drawn, and the Quest draws each eye; over both eyes the mage's moment is 10 calls and 8.3k triangles.
- **Floating words are outside the abilities' budget**, as the game's text for every blow.
- **The talent plans are one tree each, tier 1 then tier 2** (the ranger's Marksmanship, the mage's Fire, the warrior's Protection). Oakvale's four points don't reach tier 3.
- **The fighters walk, not glide.** A step is only as long as your legs have had time for at the walking speed, and stops at walls (the blink's rule).
- **Fighting the Warden, the ranged classes stay in its hall.** Backing out through its gate sends it back to its throne whole (spec), which is what first stopped the ranger. A player learns it once; the script keeps inside.
- **Four harmless shots in a row mean walk closer.** At the watchtower the mage's bolts met the lip of the hill below the archer; a player would step up, so the script does.
- **One walking home is waited for.** An enemy that has broken off can't be hit on its way back, so when nobody is left to fight near you the script lets it get home first, then goes to it.

## For later

- The ranger's ward never went up in the runs: no archer's arrow was seen flying at it within 8 m, since the ranger outranges the archers. Worth trying the ward on the headset against the watchtower's archer.
- A run spends most of its time at the smith, where every frame is 234k triangles in software rendering; three at once took about 55 minutes each. The page's own import of a module can be another copy of the game's after the dev server has reloaded files, so the checks compare looks by value.

## On the headset

With `?perf` on, a new character of each class from the page before VR:

1. **A ranger** through Oakvale: Power Shot on A, a ring for the Snare Trap when a grunt reaches you, and the ward against the watchtower's archer. Keep inside the Warden's hall while you kite it. Take Hale's Old Hunting Bow and see it in your hand.
2. **A mage** the same way: Frost Nova on X and a blink on B when reached, a Fireball ring on a pack, then the Crypt-Warded Staff.
3. **The arena's worst moments** (`?arena&class=ranger&perf`, then `mage` and `warrior`): everything up at once should hold 72 fps.
4. **The prototypes** are still there to compare (README, Prototypes): `?arena&class=ranger-prototype` and `?arena&class=mage-prototype`.
