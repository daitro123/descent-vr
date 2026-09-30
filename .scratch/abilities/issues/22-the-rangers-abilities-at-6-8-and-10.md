# 22: The ranger's abilities at 6, 8 and 10

**What to build:** Volley (Z, 6), Scatter (V, 8) and Hunter's Mark (S, 10) for the ranger, playable in `?arena&class=ranger`.

**Blocked by:** 21.

**Status:** done

Read [the spec](../spec.md) ("Abilities", "Performance") and [The ranger's abilities and talents](12-the-rangers-abilities-and-talents.md).

- [x] Tests for each ability's rule (Volley's fan, Scatter's knockback in a cone, the mark's extra damage and time).
- [x] A headless check in the arena fires each and sees it do what it says.
- [x] `npm run typecheck` and `npm test` pass.

## What was built

Built on 2026-09-30 **by Claude on Tom's behalf**, taking the recommended option at every fork. Nobody has drawn them on a headset yet: the numbers are ticket 12's, in `CONFIG.classes.ranger.abilities`, except where a call below says otherwise.

- **Three more cases of `Combat.use`** beside Power Shot's and Snare Trap's, each calling the ranger's kit (`RangerKit.volley`, `.scatter`, `.huntersMark` in `src/combat/ranger.ts`) and spending focus as the others do. They no longer say "not built yet".
- **Volley** (Z, level 6, 35 focus, 12 s): the Z primes it on the ability clock (`AbilityClock.prime('volley')`); the nocked arrow glows pale sea green while it waits; loosed, the arrow splits as it leaves the bow into five (`fanOf` in `shots.ts`: a level fan 20° across, turned about the up axis, the middle one along the aim), each at 60% of the draw's blow times your damage. They're five of ticket 21's instanced arrows (`Shots.loose` now takes `{ pierce, powered, volley }`), each striking on its own. The next arrow is single again. `stats.volleys` counts them.
- **Power Shot and Volley wait one at a time.** Power Shot's glow now lives on the ability clock too (`RangerKit.powered` is a getter and setter over `primed('powerShot')`, so reading and setting it works as before). `ARROW_CHARGES` (in `ranger.ts`) lists the two. A Z drawn while Power Shot's glow waits says "Volley: Power Shot is waiting", and A pressed on a Volley's arrow says "Power Shot: Volley is waiting" over the bow; neither spends.
- **Scatter** (V, level 8, 25 focus, 15 s): `scatteredBy(feet, facing, enemies)` picks whom the gust reaches: every enemy a blow can land on whose body is within 3 m of your feet and within the 90° in front of where you look (widened by how wide the body looks; one pressed against you is always in). Each is pushed straight away from you by a new `Enemy.shove(push)`, which adds to the enemy's knockback as a blow's push would (heavy ones barely) and does nothing else (no damage, no pull, no flinch), and staggered 1.2 s (`Enemy.stagger`). The gust is sparks and dust through the shared particles across the arc, with a rush of wind. `stats.scattered` counts whom it reached.
- **Hunter's Mark** (S, level 10, 20 focus, 1 s; `src/combat/mark.ts`, `Mark`, owned by the kit as `ranger.mark`): the nearest enemy within 15° of where the right hand faces, else of where you look (`throwTarget`, as Heroic Throw), in sight and within 30 m, is marked for 20 s. "MARKED" floats over it. Every arrow of yours on it deals 15% more (`mark.of(enemy)` multiplies the arrow's blow before the head and exposed multipliers, in `RangerKit.hit`), and so does an arrow the ward sends back at it (`Combat.enemyContact`). It shows a red outline round the body (a capsule drawn brightest at its rim, over walls) and a small chevron turning over its head, both drawn with no depth test so walls don't hide them. One enemy at a time: marking another moves it, the same one again starts its 20 s over. It ends early when the enemy dies. `stats.marks` and `stats.markedHits` count them.
- **Colours and sounds:** `ABILITY_COLOUR.volley` (a pale sea green), `.scatter` (a pale wind white) and `.huntersMark` (a hunter's red); `sfx.volleyReady`, `sfx.volley`, `sfx.scatter` and `sfx.huntersMark`.
- **Words:** a Hunter's Mark with nobody to mark says "Hunter's Mark: nothing to mark" (`NOTHING` in `gestures.ts`), not Heroic Throw's "nothing to throw at".
- The README's ranger controls list all three, and the arena line no longer says they're unbuilt.

### Tests and checks

- `tests/ranger.test.ts` (+16, 35 in all), at the combat seam through a real `RangerKit` and real enemies. Volley: its data and level; `fanOf`'s five ways 20° across and level; the next arrow splitting into five at 60% and the one after single; a camp of five in an arc 8 m off each taking one arrow; waiting one at a time with Power Shot either way round. Scatter: its data and level; `scatteredBy` taking every body within 3 m in the 90° in front and none behind, 60° aside or further; a grunt in front knocked back about 1.5 m (1.3 to 1.7) and staggered, unhurt, one behind you untouched; two at once each pushed straight away; a brute pushed a third as hard and the Warden a sixth (under 30 cm of slide) and not staggered; a rooted grunt left where it stands, staggered. Hunter's Mark: its data and level; marking the enemy the hand faces, else the one you look at, and nothing behind a wall, past 30 m or 30° off; arrows dealing the marked enemy 15% more and nobody else; 20 s, one at a time, starting over, ending with the enemy's death; its outline and chevron drawn with no depth test, 2 meshes under 500 triangles, round the body and over the head.
- `.scratch/abilities/checks/ranger-abilities.mjs` (new, 19 checks, all ok): in `?arena&class=ranger` with the waves held back, the Z, V and S hold Volley, Scatter and Hunter's Mark; a drawn Z is Volley for 35 focus, a second Z is refused (cooling) and spends nothing, A on the Volley's arrow says "Power Shot: Volley is waiting", and the arrow loosed at the middle of five grunts in an arc 10 m off splits into five and each grunt takes 18; a drawn V is Scatter for 25 focus, the two grunts close in front stagger and slide about 1.6 m further off, unhurt, and the one behind isn't pushed; a drawn S facing a grunt is Hunter's Mark for 20 focus, its outline and chevron up over walls (224 triangles), a full-draw arrow deals it 35 against the unmarked grunt's 30, and its outline still shows behind a pillar; no page errors.
- Still passing: `ranger-class.mjs` (ticket 21's check).

### Against the budget

No new lights. Volley adds no draw call: its five arrows are the arrows' one instanced mesh (44 triangles each, 220 for a volley). Scatter adds none: its gust is the shared particles. Hunter's Mark is one lasting effect of 2 draw calls (the outline and the chevron) and 224 triangles, and only one is ever up (a new mark moves it). With the mage's Blizzard (2 calls, 224) and three traps (1 call, 612) that's 5 draw calls and about 1,280 triangles at the worst moment the two classes' effects could share, well under 10 and 5,000. `?perf` wasn't read on a headset.

**Calls made on Tom's behalf:**

- **Volley's five arrows each strike on their own**, as five real arrows: at range a camp of five takes one each, and point-blank several may land on one enemy (up to 3× a shot's blow for 35 focus, about Power Shot's worth per focus). Limiting a volley to one arrow per enemy was the other way; it made the fan a rule rather than arrows you can see.
- **The fan is level**, turned about the up axis, so every arrow rises and falls as the aimed one does and the fan lies across a camp on the ground.
- **One of Power Shot and Volley on an arrow at a time**, following the mage's one-bolt-ability rule (ticket 24): stacking them (five double-damage piercing arrows for 55 focus) was the other way. To name which waits, Power Shot's glow moved onto the ability clock.
- **Scatter aims where you look, not where the hand points:** ticket 12 says "in front of you", and the spec's pointing rule names only Heroic Throw, Hunter's Mark and Blizzard. Its cone is 90° (the config's `arcDeg`), measured from your feet.
- **Scatter moves enemies itself** (`Enemy.shove`), as the brief asked: `afflict` does no damage and doesn't push, and `takeHit` would deal damage and pull the camp. It pulls nobody by itself; anyone within its 3 m has noticed you anyway (camps notice at 8 m).
- **How far Scatter knocks back:** `knockback` went from the config's 6 to 12 m/s, so a grunt slides about 1.5 m (6 gave 0.75 m, less than a grunt's reach, which didn't read as a knockback). Brutes and the Warden take the push at their own scale, as every push in the game: a brute about 0.5 m, **the Warden about 0.2 m** (the brief's "not knocked back far"), and **the Warden isn't staggered**, as the shield bash doesn't stagger it.
- **A rooted enemy isn't moved by the gust** (the vines hold it; it's still staggered), so a trap and a Scatter together don't pull a grunt out of its root; a frozen one is left as it is, since a stagger would thaw it without a blow.
- **Scatter is cast whether or not anyone is in front**, like the War Cry and Frost Nova: it isn't refused as "no target".
- **Hunter's Mark falls back to where you look**, as Heroic Throw does (ticket 12 says "the enemy you face"); it needs a clear line to mark (you can't mark what you can't see, only keep seeing it once marked) and reaches 30 m (new `range`: the leash's length, past an arrow's pull).
- **The mark's 15% is on every blow of yours**, arrows and an arrow sent back by the ward alike, and applies before the head and exposed multipliers. It pulls nobody (it deals nothing), and it holds while the enemy walks home.
- **The outline through walls is a glowing capsule round the body**, brightest at its rim so the enemy shows through its middle where it's in sight, with a chevron over the head. Drawing the enemy's own skinned mesh over walls was the other way: it costs its whole mesh's triangles a second time, over the 500 a lasting effect may have.

**For later tickets:**

- **25 (talents) and 26 (the ranger's trees):** Improved Volley (6 / 7 arrows) is `CONFIG.classes.ranger.abilities.volley.arrows` (read at each loose in `RangerKit.loose`, so the state's answer can be passed there); Improved Scatter (slows 30 / 60% for 4 s) belongs in `RangerKit.scatter`'s loop after the stagger (`enemy.afflict('slowed', 4, k)`); Deadeye (+5 / 10% on a marked enemy) is `Mark.of`'s bonus; Lethal Shots and Serrated Tips sit beside the mark in `RangerKit.hit`. Explosive Trap's knockback can use `Enemy.shove` as Scatter does. A new ability that changes the next arrow (none yet) joins `ARROW_CHARGES`.
- **27 (every class through Oakvale):** the ranger reaches 6, 8 and 10 only past the level cap of 5, so none of these is reachable in Oakvale yet; the arena has them all.

**On the headset:** whether the Z is easy to draw between shots, whether five arrows 5° apart read as a volley at camp range, whether 1.5 m is the right shove (and the V's gust where you look, not where the hand ends), and whether the red outline is bright enough through Oakvale's walls without being loud in plain sight.
