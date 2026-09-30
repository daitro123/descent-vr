# 26: The ranger's and mage's trees

**What to build:** the ranger's Marksmanship and Survival and the mage's Fire and Frost to tier 3, with Trueshot, Explosive Trap, Pyroblast and Ice Barrier taking the triangle.

**Blocked by:** 22, 24, 25.

**Status:** done

Read [The ranger's abilities and talents](12-the-rangers-abilities-and-talents.md) and [The mage's abilities and talents](13-the-mages-abilities-and-talents.md).

- [x] Tests for every talent's effect and the four tier-3 abilities.
- [x] A headless check spends points in each tree of each class and fires its tier-3 ability.
- [x] `npm run typecheck` and `npm test` pass.

## What was built

Built on 2026-09-30 **by Claude on Tom's behalf**, taking the recommended option at every fork. Nobody has spent a point on a headset: the numbers are tickets 12 and 13's first guesses, to tune. Nothing in ticket 25's machinery changed and there is no new save version: the rows, their names and lines, and Combat reading the knobs.

- **The ranger's trees** (`CONFIG.talents.trees.ranger`). Marksmanship: Steady Aim (arrows +5%/pt, 3), Keen Eye (head hits +0.2×/pt, 2), Efficiency (Power Shot −5 focus/pt, 2), Swift Arrows (arrows fly 10% faster/pt and so drop less, 3), **Trueshot** (tier 3), Improved Volley (+1 arrow/pt, 2). Survival: Trapper (Snare Trap roots +1 s/pt, 3), Fleet Foot (dash 0.3 s sooner/pt, 2), Serrated Tips (an arrow hit bleeds 2× your damage/pt over 4 s, 3), Steady Ward (Ward holds and reflects 0.3 s longer/pt, 2), **Explosive Trap** (tier 3), Improved Scatter (Scatter also slows 30%/pt for 4 s, 2).
- **The mage's trees** (`CONFIG.talents.trees.mage`). Fire: Ignite (a fire hit burns another 10%/pt over 4 s, 3), Incineration (bolts charge 0.1 s faster/pt, 2), Improved Fireball (burst +0.5 m/pt, 2), Critical Mass (head hits +0.1×/pt, 3), **Pyroblast** (tier 3), Master of Elements (a fire head hit gives 5 mana back/pt, 2). Frost: Frostbite (a Frostbolt on a slowed enemy freezes it for 2 s, 5%/pt chance, 3), Ice Shards (Frostbolt +10%/pt, 2), Permafrost (slows 1 s longer and 10% stronger/pt, 2), Arctic Reach (Frost Nova and Blizzard +0.3 m/pt, 3), **Ice Barrier** (tier 3), Frozen Ward (a blocked or parried blow slows its enemy 20%/pt for 3 s, 2).
- **Trueshot** (30 focus, 20 s cooldown, lasts 8 s): each arrow loosed while it lasts, a volley's too, bends onto the enemy nearest its line within 8° and 40 m and in sight (`bentOnto` in `shots.ts`), homing at up to 60°/s on its chest, and passes a raised guard. The bow glows its colour; its arrows trail motes.
- **Explosive Trap** (30 focus, 15 s): lays a trap at your feet on the snare traps' mesh, tinted coal-red, sharing their three-trap cap, lying 30 s. An enemy that walks onto it takes 25× your damage within 2.5 m, knocked back 10 m/s, with a shockwave, embers and a thump.
- **Pyroblast** (35 mana, 12 s): a fourth bolt charge (`BOLT_CHARGES`). Its orb grows twice a bolt's size over its own 1.2 s charge; thrown, it is always a 0.3 m orb at 6 m/s, dealing 60 at full charge (scaled like a bolt's charge) and burning 15 more over 4 s.
- **Ice Barrier** (30 mana, 25 s): absorbs 40× your level's step (`Stats.step`, new) of damage after armour, for 10 s. A faceted ice ring spins at your waist (`src/combat/iceBarrier.ts`, one draw, 72 triangles). It crackles when it takes a blow and shatters when broken.
- **Damage over time** (`src/combat/dots.ts`): bleeds and burns tick once a second through `Enemy.suffer` (hp and a flash, no flinch, no thaw), dealing their pool in equal shares; `combatStats.dotTicks` / `dotDamage` count them.

### Tests and checks

- `tests/talents.test.ts`: the four trees' rows, tier 3 of each tree putting its ability in the triangle at level 8, another class's talents refused, every knob's value, and a save round trip.
- `tests/ranger.test.ts`: every Marksmanship and Survival talent's effect, Trueshot (its cost and length; an arrow 6° off a grunt bends onto it and misses without; it picks only an enemy within 8° and in sight, the nearest the line; it passes a raised guard) and Explosive Trap (its cost; bursts under the first grunt on it for 25 on each within 2.5 m, knocking them back; lies with the snares, three at most).
- `tests/mage.test.ts`: every Fire and Frost talent's effect, Pyroblast (its charge, orb, damage and burn), Ice Barrier (its cost; takes the next 40× step within 10 s, then lets blows through; its ring in the effects budget) and Frozen Ward.
- `tests/dots.test.ts` (new): a tick a second in whole points, fractions carried, another of its kind added to what's to come, ended by death or walking home.
- `.scratch/abilities/checks/class-trees.mjs` (new, 30 checks, all ok): with `?emulate&nodevui&cap=10`, plays a ranger to level 8, sees Marksmanship and Survival on the Talents tab, spends Marksmanship to Trueshot, draws a triangle and sees an arrow loosed half a metre wide bend onto a farm bandit; resets out of the fight, spends Survival to Explosive Trap, lays one, walks the bandit onto it for 25× damage, and an arrow after makes it bleed. Then a mage: Frost to Ice Barrier, holding 96 at level 8, absorbing the bandit's blows; Fire to Pyroblast, charging 1.2 s, hitting for 60× damage and leaving a burn. No page errors. It takes about 12 minutes; run it alone.

**Calls made on Tom's behalf:**

- **Bleeds and burns are damage over time ticking once a second**: they don't break a freeze, flinch or stagger, and they pull a camp like any hurt. A new one of the same kind on the same enemy adds to what is still to come and restarts its time, so every hit's share is taken. Both scale with your damage.
- **Ignite burns on every fire hit**: the Fireball bolt, its burst and Pyroblast. Pyroblast has its own burn too.
- **Pyroblast charges for its own 1.2 s**, its damage scaling with the charge like a bolt's; the throw doesn't shape it (always a 0.3 m orb at 6 m/s). Incineration doesn't shorten it.
- **Frostbite rolls only on a Frostbolt hitting an already-slowed enemy**, after the damage. Blizzard's ticks don't roll: the next tick would break the freeze half a second later.
- **Permafrost is relative** (a slow ×1.1 then ×1.2) and applies to the Frostbolt, Blizzard's linger and Frozen Ward.
- **Frozen Ward works on a block and a parry**, of melee blows only.
- **Ice Barrier absorbs after armour** and scales with your level's step, like an enemy's damage; a new barrier replaces the old.
- **Trueshot bends each arrow onto its own enemy**, volley arrows included, rather than all onto one; its arrows pass a raised guard.
- **Explosive Trap shares the snare traps' mesh and their cap of three**; evading enemies walking home don't set it off.
- **Keen Eye and Critical Mass add to one knob**, `headMultiplier`, added to the head-hit multiplier.
- **Swift Arrows' "drop less" is the speed alone**: a faster arrow drops less over the same distance.
- **Steady Ward lengthens both the hold and the reflect window.**
- **Improved Scatter slows rooted enemies too**, not frozen ones (the freeze is the stronger hold).
- **Budget**: Ice Barrier's ring is the only new draw (1 draw, 72 triangles, no light); the trap reuses the snare mesh, Pyroblast the bolts' mesh, Trueshot the particles.

## For later tickets

- **27 (every class through Oakvale):** Oakvale's cap of 5 gives 4 points, tiers 1 and 2 of one tree; tier 3 needs level 8, so checks use `&cap=10`. All six trees are in: a ranger or mage in Oakvale at level 5 can feel Steady Aim, Trapper, Serrated Tips, Ignite, Frostbite, Ice Shards and the rest. Bleeds and burns pull a camp and count in `combatStats.dotTicks` / `dotDamage`; the Warden takes them. Ice Barrier is the mage's answer to being reached; Frozen Ward needs the mage's parry or block to land. `class-trees.mjs` is the pattern for driving a ranger or mage through the headless checks (leveling by kill events, the Talents tab, a triangle, an arrow loosed, a bolt thrown).
