# 24: The mage's abilities at 6, 8 and 10

**What to build:** Frostbolt (Z, 6), Chain Lightning (V, 8) and Blizzard (S, 10) for the mage, playable in `?arena&class=mage`.

**Blocked by:** 23.

**Status:** done

Read [the spec](../spec.md) ("Abilities", "Performance") and [The mage's abilities and talents](13-the-mages-abilities-and-talents.md).

- [x] Tests for each ability's rule (the slow, the arcs to two more, Blizzard's ticks and slow in its circle).
- [x] A headless check in the arena fires each and sees it do what it says.
- [x] `npm run typecheck` and `npm test` pass.

## What was built

Built on 2026-09-30 **by Claude on Tom's behalf**, taking the recommended option at every fork. Nobody has cast them on a headset: the numbers are ticket 13's, to tune.

- **Frostbolt, Chain Lightning and Fireball change the next bolt, one at a time.** Each is a case of `Combat.use` that primes itself on the clock (`AbilityClock.prime`), and `Combat.castBolt` spends whichever waits and carries it on the bolt as `Bolt.charge` (`'fireball' | 'frostbolt' | 'chainLightning' | null`, which replaced ticket 23's `fire` flag). `BOLT_CHARGES` in `combat/mage.ts` lists them; `AbilityClock.waitingOn(among?)` says which waits. The bolt gathers in the waiting one's colour (`MageHands.colourOf`), flies in it, and trails embers (Fireball), frost motes (Frostbolt) or sparks (Chain Lightning).
- **Frostbolt** (Z, level 6, 15 mana): the bolt deals what a plain one does and then `afflict('slowed', 5, 0.4)` on the enemy it hits, if it lived (a brute and the Warden take half, ticket 20's rule). `combatStats.chilled` counts them.
- **Chain Lightning** (V, level 8, 30 mana, 8 s): after the bolt's blow, `chainFrom(struck, enemies, 2, 4)` picks the arcs: the nearest enemy a blow can land on within 4 m of the last one struck (body to body), never one twice. Each takes 70% of the bolt's damage times your damage (no head or exposed bonus rides an arc), and the arc is drawn as a jagged line of sparks through the shared particles. It arcs on from an enemy its bolt kills. `combatStats.arcs` counts them.
- **Blizzard** (S, level 10, 40 mana, 30 s): `blizzardAt` (`combat/blizzard.ts`) finds the circle: on the nearest enemy within 15° of where the wand points and 15 m, in sight (`throwTarget`, the hand's line only); else where the wand's line meets the floor, 15 m off if it points level or up, stopped short of a wall or prop (`arrowStops` or no line of sight, tried every 0.5 m). `Blizzard` (owned by Combat as `combat.blizzard`) ticks at once and every 0.5 s after, 10 ticks over 5 s: each tick, every enemy within 4 m (`within`) takes 6 times your damage and `afflict('slowed', 1, 0.5)`, so the slow holds while it stands in the circle and lets go a second after. It draws a pale disc on the floor and 24 falling icicles in one instanced mesh, with snow motes and splashes through the shared particles; "BLIZZARD" floats over the circle. `combatStats.blizzardHits` counts its blows. It's cleared with the bolts on the arena's restart and the Adventure's respawn.
- **"Already waiting" in words.** Ticket 23 said the `waiting` refusal was in gestures' words; it wasn't (it said "not built yet"). Now a Fireball drawn while it waits says "Fireball: already waiting", and one drawn while Frostbolt waits says "Fireball: Frostbolt is waiting" (`waitingWords` in `gestures.ts`), with the dull buzz.
- **Colours and sounds:** `ABILITY_COLOUR` has `frostbolt` (a deep ice blue), `chainLightning` (a pale violet-white) and `blizzard` (snow white); `sfx` has `frostboltReady`, `frostbolt`, `frostboltHit`, `chainLightningReady`, `chainLightningLoose`, `chainLightning` (each arc), `blizzard` (a 5 s wind) and `blizzardTick` (a patter of ice when it bites).
- Numbers in `CONFIG.classes.mage.abilities` (Blizzard gained `linger: 1` and `range: 15`). The README's mage controls list all three.

### Tests and checks

- `tests/mage.test.ts` (+14, 37 in all), at the combat seam through a real Player, Combat and `MageHands`: Frostbolt's charge (15 mana, the next bolt only, and any bolt ability refused as `waiting` while another waits), its 40% slow for 5 s on the one hit and not the one beside, half on a brute and the Warden, none from a plain bolt; Chain Lightning's arcs (20 on the one hit, 14 on each of two more, one 4 m from the second and 6 m from the first, nothing on one 6 m away, its cost and cooldown), arcing on from a kill, nothing to arc to alone, and `chainFrom`'s hops; Blizzard's aim (on the enemy within 15°, the floor where the line meets it, 15 m when level or up, short of a wall and of the room's edge, at your feet pointing down), its ticks (four in 1.9 s on the two grunts in the circle and none on the one outside, each slowed by half), ten ticks in all and a brute's half slow lingering a second after, letting go of one that leaves, its cost, cooldown and "no target" without an aim, and its budget (a mesh and an instanced mesh, 224 triangles).
- `.scratch/abilities/checks/mage-abilities.mjs` (new, 20 checks, all ok): in `?arena&class=mage` with three grunts in front of you, the Z, V and S hold Frostbolt, Chain Lightning and Blizzard; a drawn Z is Frostbolt for 15 mana, and a ring drawn while it waits says "Fireball: Frostbolt is waiting" and spends nothing; the next bolt deals 20 and slows its grunt by 40%; a drawn V is Chain Lightning for 30 mana and the next bolt deals 20, arcing twice for 14; a drawn S facing a grunt is Blizzard for 40 mana, falling on that grunt, biting all three every 0.5 s and slowing each by half, its disc and 24 icicles up (224 triangles); after 5 s the ice stops; no page errors.
- Still passing: `mage.mjs` (ticket 23's check; it reads `bolt.charge` now) and `warrior-gestures.mjs`.

### Against the budget

No new lights. Frostbolt and Chain Lightning add no draw call: their bolts are the bolts' instanced mesh, the arcs and trails are the shared particles. Blizzard is one lasting effect of 2 draw calls (the disc, 32 triangles, and the icicles, one instanced mesh of 24 × 8 triangles) and 224 triangles, and only one can fall at once (its cooldown outlasts it), so it can never be a fourth. `?perf` wasn't read on a headset.

**Calls made on Tom's behalf:**

- **One ability waits on a bolt at a time.** Drawing Fireball, Frostbolt or Chain Lightning while another of them waits is refused (`'waiting'`), spends nothing, and says which waits. Stacking them on one bolt (a burning, freezing, arcing bolt for 60 mana) was the other way; it would make the colours unreadable and the strongest play a three-shape ritual before every throw.
- **Chain Lightning hops**: each arc leaves the last enemy struck for the nearest within 4 m of it, not every arc from the first. It reaches along a line of five (ticket 13's "camps of five") and reads as a chain.
- **An arc takes 70% of the bolt's damage before the head or exposed bonus**, so a head shot doesn't double through the chain. An arc leaves from an enemy the bolt killed; a Chain Lightning bolt that hits no enemy arcs to nobody and is spent.
- **Frostbolt slows after the blow** (a hit on a frozen enemy breaks the freeze first, and the slow then holds).
- **Blizzard's ticks start as it lands** (at 0, 0.5 … 4.5 s: ten ticks over its 5 s, 60 in all), so the slow takes hold at once.
- **Blizzard's slow lingers 1 s** after the last tick that caught an enemy (`linger`), so the slow holds without a gap while it stands in the circle and ends soon after it leaves.
- **Blizzard aims by the wand's line only** (where the right hand faces, the rule for pointing abilities), not falling back to where you look as Heroic Throw does: pointing at the floor is how you place it. With no enemy within 15°, it falls where the wand's line meets the floor, at most 15 m off (`range`), short of a wall or prop; pointed level or up, 15 m ahead.
- **Blizzard pulls** whoever it bites (it deals damage, like any blow). Enemies walking home are left out silently, not with an "Evade" every half second.

**For later tickets:**

- **25 (talents) and 26 (the mage's trees):** Ice Shards (frost bolts +10/20%) reads `bolt.charge === 'frostbolt'` in `boltLands`; Permafrost (slows +1/2 s, 10/20% stronger) is `CONFIG.classes.mage.abilities.frostbolt.time/slow` and `blizzard.slow` (and ticket 20's afflict); Arctic Reach (Frost Nova and Blizzard +0.3/0.6/0.9 m) is `frostNova.radius` and `blizzard.radius` (the Blizzard's disc scales from `this.radius`, read once in its constructor: make it read the state's answer at `start`); Frostbite (a slowed enemy hit by frost may freeze) sits in `chill` and `blizzardTick`. Pyroblast (tier 3, triangle) would be a fourth `BOLT_CHARGES` entry.
- **27 (every class through Oakvale):** the mage reaches 6, 8 and 10 only past the level cap of 5, so none of these is reachable in Oakvale yet; the arena has them all.

**On the headset:** whether the wand is the right thing to point Blizzard with at the end of an S (the stroke often ends with the hand low and the wand angled), whether 15 m is too far, whether the disc reads on Oakvale's grass, and whether the arcs (sparks only, no light) are bright enough to follow.
