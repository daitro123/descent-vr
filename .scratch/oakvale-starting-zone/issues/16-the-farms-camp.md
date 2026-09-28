# 16: The farm's camp

**What to build:** Four enemies wait in two pairs at the farm. Walk within 8 m of one, or hit it, and it fights, bringing anyone of its camp within 10 m. Walk away and they chase at your walking pace until they're 30 m from their posts, then walk home untouchable ("Evade" floats if you hit them) and heal. Kill all four, walk off, and three minutes later the camp is full again. If you die, the view fades, you wake in the village, and everyone who was fighting you walks home. Skeleton grunts stand in for bandit thugs until the human body lands (ticket 20).

**Spec:** Implementation Decisions › Camps, Enemies, The Adventure, The player (healing, death). User stories 59 (the farm), 61–64, 66–68, 72, 73, 87, 88 and 91.

**Blocked by:** 15 (The Adventure).

**Status:** done

The camp brain comes from the `?camp` prototype (in history at merge `1135338`, rule A with round two's spread-out camp and "Both"), rebuilt properly on the hooks kept in `main` (an enemy's `post`, `standDown` and `chaseSpeed`). The prototype's rule, trimmed to the one Tom picked:

```ts
type Mind = 'idle' | 'fight' | 'home' | 'dead';
notices: (m, s) => flat(m.enemy.position, s.player) < 8,           // or it was hurt
joins:   (from, other) => flat(from.enemy.position, other.enemy.position) < 10,
givesUp: (m) => flat(m.enemy.position, m.post) > 30,
```

- [x] A camp is a place, a level, its posts (each a behaviour, a family, a spot and a facing) and its members, each idle, fighting, walking home or dead.
- [x] Pulling: an idle member fights when you come within 8 m or hurt it, and brings every idle member of its own camp within 10 m of it.
- [x] Chasing: a fighting enemy runs at 2.2 m/s when it's more than a few metres off.
- [x] The leash: at 30 m from its post it walks home untouchable and heals to full on arrival. A hit meanwhile does nothing and floats "Evade".
- [x] Refill: 3 minutes after the last member falls, the camp refills whole, but only while you're at least 30 m from its clearing.
- [x] One melee pool of 3 and one ranged pool of 2 across every camp in the Adventure. The arena keeps its 2 and 2.
- [x] Camp enemies have 1.4 times today's health and damage.
- [x] The camp reports each kill with its camp, and whether anything is fighting you (the run and the ambience dip use it later).
- [x] Oakvale's plan holds the farm's camp: 4 in two pairs, posts on clear ground 5 to 18 m apart inside the farm's clearing, level 1.
- [x] Enemies stand, walk and strike at the ground's real height and steer round trunks, buildings and fences.
- [x] Death in the Adventure: the view fades to black, you wake at the village respawn point with full health and no rage, and it fades back in. Nothing is lost; enemies you killed stay dead until their camp refills. _(Taken on Tom's behalf: until the inn opens in ticket 23, the village respawn point stands outside the inn's door, facing the crossroads. No road passes the door, so it stands 2 m out from it; see Built.)_
- [x] Healing: after 5 s without taking or dealing damage, health refills to full over about 10 s (the Adventure only). Enemies drop only healing orbs, each healing a quarter of your maximum health.
- [x] Tests at the `EnemyContext` seam, with real enemies on a test ground and a simulated player: noticing at 8 m or when hurt; pulling within 10 m of its own camp only; the chase speed; giving up at 30 m, walking home untouchable and healing on arrival; everyone going home when you die; refilling only when cleared, after 3 minutes and 30 m away; one token pool across two camps. Anything random is seeded.
- [x] A plan test: the farm's posts stand on clear ground, 5 to 18 m apart, inside its clearing. The village respawn point is clear.
- [x] Checked in headless Chromium with the emulator, stepping through the debug handle: pulling one pair, the leash, and a death and wake.
- [x] Every new number is in the game's table of tunables.

## Built

Built on 2026-09-28 by Claude in PR #34, in autonomous mode (Tom asked for the rest of Oakvale to run without his input).

- **The plan** (`src/maps/types.ts`): a zone now has `camps` (each a `CampPlan`: an id, its place as the clearing's centre and radius, a level, and posts, each a behaviour, a family, a spot and a facing) and `respawns.village`, a `Spot`. Oakvale's `CAMPS` table (`src/maps/forest/layout.ts`) holds the farm's camp at the farm's clearing, level 1: four bandit grunts in two pairs. One pair stands in the yard at (60, 33) and (57.5, 37.5), eyeing the farmhouse; the other by the windmill at (67.5, 43) and (72, 45.5), eyeing the wheat field. Partners stand 5.2 m apart, and the pairs 11.4 to 17.3 m apart, so each post has exactly its partner within a pull. The village respawn point is 2 m out from the inn's door at (8.9, −10.6), facing the crossroads.
- **The camp brain** (`src/enemies/camps.ts`): `Camp` holds each member's mind (idle, fight, home, dead) and does the `?camp` prototype's rule A. It notices you at 8 m or when hurt, pulls idle members of its own camp within 10 m, and gives up at 30 m from the post. Walking home it is untouchable (`post.evading`) and heals to full on arrival within 0.5 m. It refills 180 s after its last member falls, once you're 30 m from the clearing's edge. `Camps` raises the bodies (`campStrength`: 1.4 times health and every attack's damage), steps them through one `EnemyContext` on the World's ground with one melee pool of 3 and one ranged pool of 2, and keeps them apart. It reports kills through `onKill(camp, member)` and has `fighting`.
- **Evade** (`src/combat/combat.ts`): a sword hit, shield bash, ground slam, War Cry or reflected arrow on an enemy walking home does nothing and floats a grey "Evade".
- **The Adventure** (`src/adventure.ts`) now brings the arena's fight: `Combat`, the camps, orbs, blob shadows, floating text, particles, shockwaves and hit-stop. Health comes back after 5 s without taking or dealing damage, from empty to full over 10 s. A death shows "YOU DIED", lingers 1.5 s, fades to black over 1 s (`src/ui/fade.ts`, a black sphere round the head), stays black 0.5 s, and wakes you at the village with full health and no rage, fading back in over 1 s. The debug handle has `camps`.
- **Shared with the arena:** enemy separation (`keepApart` in `src/enemies/enemy.ts`), blob shadows (`BlobShadows.cast`) and the "YOU DIED" banner (`FloatingText.banner`) moved out of `Game`, so both games use one copy. An orb heals a quarter of `Player.maxHp` (25 of 100, as before).
- **Tests:** `tests/camps.test.ts` (15) drives real enemies at the `EnemyContext` seam on a sloped test ground with a simulated you and seeded randomness. It covers noticing at 8 m and when hurt, the pull and its own camp only, the 2.2 m/s chase, the leash at 30 m with the walk home untouchable and healing, everyone home when you die, kills with their camp, refilling only when cleared after 3 minutes and 30 m away, one pool across two camps, the camp strength, the ground's height, and the stuck walker put home. `tests/forest.test.ts` checks the farm's posts (clear, dry, level, reachable, inside the clearing, 5 to 18 m apart, one partner each within a pull), that the east road reaches the farm without walking into a notice, and that the respawn point is clear, reachable, out past the inn's front, facing the crossroads and 30 m clear of every camp.
- **Checks:** `checks/farm-camp.mjs` in headless Chromium with the emulator, all 27 passing. The four wait at their posts with 63 health. From the road's end nothing stirs; walking in, the first pair comes at 7.6 m and the second stays. Led away, the first gives up 29.97 m from its post and walks home with its partner, a swing floats "Evade" and does nothing, and both are home at full health. A death fades to 0.51, then black, wakes you at (8.9, −10.6) with 100 health and no rage, and fades back in; the one you killed stays down. Healing waits, then fills over about 10 s. The cleared camp is still empty after 171 s and full after 3 minutes. `checks/adventure.mjs` (the plain URL, `?arena`, `?duel`, `?wave=7`, `?showcase`, `?map=forest`) and `checks/world.mjs` still pass. Screenshots are in the project's files under `farm-camp/`.
- **Numbers, in the emulator's mono view:** the Adventure at the start draws 70 calls and 285.8k triangles with 12 programs (60, 277.6k and 6 before); at the farm's road end, 46 calls, 148.1k triangles and 16 programs. The extra programs come with the fight: enemies, orbs, shadows and their effects. Ticket 38 measures on the headset.

Calls **taken on Tom's behalf**, to revisit:

- **The respawn point stands 2 m out from the inn's door, not on a road.** No road passes the door (the east road is about 8 m off), so the nearest clear spot facing the crossroads is used until the inn opens in ticket 23.
- **The refill waits until you're 30 m from the clearing's edge**, not its centre, so standing just outside a big clearing doesn't watch it refill.
- **The farm's pairs:** the yard pair stands clear of the hay bales, since an enemy walking home got stuck on them in the emulator, and each post has only its partner within a pull, so the pairs come one at a time. "5 to 18 m apart" is read as every pair of posts.
- **A walker that can't get home is put back.** With no navmesh, one that hasn't come 1 m nearer its post in 3 s is placed there, healed, once you're more than 12 m away, so it never vanishes in front of you.
- **Evade covers every way you can hit**: the sword, the shield bash, Earthshaker, War Cry and reflected arrows.
- **War Cry and Earthshaker work from level 1** until ticket 17 gates abilities by level.
- **The death:** "YOU DIED" in red as in the arena, 1.5 s to see where you fell, 1 s to black, 0.5 s black, 1 s back in.
- **Orbs heal a share of your maximum health** (a quarter), so they keep up once levels raise it.
- **Camp members rise from the ground** as the skeleton grunts do, until the human body (ticket 20).
- **Health comes back at the same rate whatever your maximum** (empty to full in 10 s).

Left for later: the Adventure doesn't use `onKill` or `fighting` yet (quests, XP, the run and the ambience dip do, from ticket 17 on). The blob shadows hold 24 at once, plenty for the farm; later tickets with more camps in view may want more.
