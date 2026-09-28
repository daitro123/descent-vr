# 16: The farm's camp

**What to build:** Four enemies wait in two pairs at the farm. Walk within 8 m of one, or hit it, and it fights, bringing anyone of its camp within 10 m. Walk away and they chase at your walking pace until they're 30 m from their posts, then walk home untouchable ("Evade" floats if you hit them) and heal. Kill all four, walk off, and three minutes later the camp is full again. If you die, the view fades, you wake in the village, and everyone who was fighting you walks home. Skeleton grunts stand in for bandit thugs until the human body lands (ticket 20).

**Spec:** Implementation Decisions › Camps, Enemies, The Adventure, The player (healing, death). User stories 59 (the farm), 61–64, 66–68, 72, 73, 87, 88 and 91.

**Blocked by:** 15 (The Adventure).

**Status:** ready-for-agent

The camp brain comes from the `?camp` prototype (in history at merge `1135338`, rule A with round two's spread-out camp and "Both"), rebuilt properly on the hooks kept in `main` (an enemy's `post`, `standDown` and `chaseSpeed`). The prototype's rule, trimmed to the one Tom picked:

```ts
type Mind = 'idle' | 'fight' | 'home' | 'dead';
notices: (m, s) => flat(m.enemy.position, s.player) < 8,           // or it was hurt
joins:   (from, other) => flat(from.enemy.position, other.enemy.position) < 10,
givesUp: (m) => flat(m.enemy.position, m.post) > 30,
```

- [ ] A camp is a place, a level, its posts (each a behaviour, a family, a spot and a facing) and its members, each idle, fighting, walking home or dead.
- [ ] Pulling: an idle member fights when you come within 8 m or hurt it, and brings every idle member of its own camp within 10 m of it.
- [ ] Chasing: a fighting enemy runs at 2.2 m/s when it's more than a few metres off.
- [ ] The leash: at 30 m from its post it walks home untouchable and heals to full on arrival. A hit meanwhile does nothing and floats "Evade".
- [ ] Refill: 3 minutes after the last member falls, the camp refills whole, but only while you're at least 30 m from its clearing.
- [ ] One melee pool of 3 and one ranged pool of 2 across every camp in the Adventure. The arena keeps its 2 and 2.
- [ ] Camp enemies have 1.4 times today's health and damage.
- [ ] The camp reports each kill with its camp, and whether anything is fighting you (the run and the ambience dip use it later).
- [ ] Oakvale's plan holds the farm's camp: 4 in two pairs, posts on clear ground 5 to 18 m apart inside the farm's clearing, level 1.
- [ ] Enemies stand, walk and strike at the ground's real height and steer round trunks, buildings and fences.
- [ ] Death in the Adventure: the view fades to black, you wake at the village respawn point with full health and no rage, and it fades back in. Nothing is lost; enemies you killed stay dead until their camp refills. _(Taken on Tom's behalf: until the inn opens in ticket 23, the village respawn point stands on the road outside the inn's door, facing the crossroads.)_
- [ ] Healing: after 5 s without taking or dealing damage, health refills to full over about 10 s (the Adventure only). Enemies drop only healing orbs, each healing a quarter of your maximum health.
- [ ] Tests at the `EnemyContext` seam, with real enemies on a test ground and a simulated player: noticing at 8 m or when hurt; pulling within 10 m of its own camp only; the chase speed; giving up at 30 m, walking home untouchable and healing on arrival; everyone going home when you die; refilling only when cleared, after 3 minutes and 30 m away; one token pool across two camps. Anything random is seeded.
- [ ] A plan test: the farm's posts stand on clear ground, 5 to 18 m apart, inside its clearing. The village respawn point is clear.
- [ ] Checked in headless Chromium with the emulator, stepping through the debug handle: pulling one pair, the leash, and a death and wake.
- [ ] Every new number is in the game's table of tunables.
