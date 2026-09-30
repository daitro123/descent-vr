# 20: Rooted, frozen and slowed

**What to build:** three new states on every enemy. Rooted: it can't move but still strikes what's in reach, with vines at its feet. Frozen: it can't act until the time runs out or a hit breaks it, tinted pale blue. Slowed: it moves and winds up slower by a fraction, with a faint frost. Brutes take roots and freezes at half length and slows at half strength; the Warden ignores roots and freezes and takes slows at half. The leash clock runs through them, and a frozen enemy doesn't count against the attackers' limit. The debug handle can apply each, for checks.

**Blocked by:** None (can start immediately).

**Status:** done

Read [the spec](../spec.md) ("Enemies") and [Enemies against every class](14-enemies-against-every-class.md).

- [x] Tests at the enemy seam: each state's effect and end, a hit breaking a freeze, the brute's halving, the Warden's immunity, the leash still turning a rooted enemy home, and the attackers' limit ignoring a frozen one.
- [x] A headless check roots, freezes and slows a camp's grunt through the debug handle and sees each hold and end.
- [x] The looks cost what [Effects within the budget](16-effects-within-the-budget.md) allows.
- [x] `npm run typecheck` and `npm test` pass.

## What was built

Built on 2026-09-30 by Claude on Tom's behalf, taking the recommended option at every fork.

- **`Enemy.afflict(what, seconds, by?)`** (`src/enemies/enemy.ts`) roots, freezes or slows any enemy; `afflictedFor(what)` gives the seconds left, `slowness` the fraction while slowed. It returns the seconds it took: 0 for one that can't be hit (rising, seated, walking home, dead) or that ignores it. Again while it lasts, the longer time and the stronger slow hold. This is the one call the class tickets (21, 23, 24) make: Snare Trap roots, Frost Nova freezes, Frostbolt and Blizzard slow.
- **Rooted:** it can't walk (its `walk` does nothing), but it still turns, swings and shoots at what's in reach. A knockback still shoves it.
- **Frozen** is a new `EnemyState`, `'frozen'`: whatever it was doing stops (its attack ends), it's held in the pose it was caught in and doesn't turn, and it gives its attack token back, so it doesn't count against the attackers' limit (two in the arena, three in camps). It thaws to `'move'` when the time runs out, or at once when a hit lands; that hit then lands as it would have, stagger and all.
- **Slowed:** its walking pace and its wind-ups (the telegraph, not the blow) are slower by the fraction, at most 0.9.
- **Brutes and the Warden:** a new optional `takes: { hold, slow }` on an enemy's numbers in `CONFIG.enemies`: the brute `{ 0.5, 0.5 }`, the Warden `{ 0, 0.5 }`; grunts and archers take all.
- **The leash:** nothing pauses it; a camp's member is checked against its leash every frame whatever holds it, and turning home (`standDown` to its post) shakes off any root, freeze or slow, so it walks home free. A rooted or frozen enemy only crosses its leash by being shoved (or by you leaving for somewhere it can't follow).
- **The looks:** frozen tints its own material pale blue with a faint blue glow; slowed, a fainter frost. Rooted grows vines round its feet (`src/fx/vines.ts`, `Vines`): every rooted enemy's in one instanced mesh, placed after the enemies each frame in the arena (`Game`) and the Adventure, growing in over 0.25 s and withering over the last 0.25 s.
- **The debug handle:** `__descent.enemies.root(seconds)`, `.freeze(seconds)`, `.slow(seconds, by)` act on the enemy nearest you (or on the enemy passed last), in the Adventure and the arena, and return the seconds it took; `.nearest()` gives that enemy.

### The looks against the budget

Against [Effects within the budget](16-effects-within-the-budget.md): no lights and no particles. The freeze and the slow change only the enemy's own material's colour and emissive, so they cost no draw call and no triangle. The vines are one draw call however many enemies are rooted (up to 16 drawn), 252 triangles each (7 stalks, runners and leaves, 21 boxes), and hidden when nothing is rooted. `tests/enemyStates.test.ts` checks the tint adds nothing to the enemy and that three rooted enemies' vines are one mesh within 500 triangles apiece.

### Tests and check

- `tests/enemyStates.test.ts`: rooted holds and ends and still strikes in reach; frozen stops mid-swing, holds still, ends, and a hit breaks it; the frozen one's token goes to the one waiting; slowed walks and winds up slower by the fraction and ends; the stronger slow and longer time hold; the brute's halving; the Warden's immunity and half slow; nothing takes on one still rising; the leash turns a rooted and a frozen enemy home (shoved past it) and a rooted one when you go indoors; the looks.
- `.scratch/abilities/checks/enemy-states.mjs` roots, freezes and slows the farm camp's first bandit through the debug handle and sees each hold and end (all 17 checks pass): rooted 3 s, it doesn't step and its vines are drawn; frozen 3 s, it neither moves nor swings, tinted blue, and a blow breaks a second freeze; slowed by half, it runs 1.10 m/s against 2.20, then 2.10 once the slow ends.

### For later tickets

- Call `afflict` from the ability; don't reach into the enemy's timers. It needs no damage, so an ability that only roots or freezes doesn't pull the enemy's camp: deal damage too if it should.
- A War Cry or any `takeHit` breaks a freeze, including the ability's own damage: apply the freeze after the hit (Frost Nova: damage, then freeze).
- To check the headset: whether the vines' green (`0x3f6a26`) reads against Oakvale's grass from 20 m; darken it if not.
