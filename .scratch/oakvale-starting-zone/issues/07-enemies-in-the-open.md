# Enemies in the open

Type: prototype
Status: claimed
Blocked by: 02

## Question

How do enemies live in an open zone instead of an arena with waves? Today they steer around `CONFIG.arena` pillars on a flat floor.

Decide by prototyping one camp (at the lumber camp, say) and playing it on the headset:

- Placement: camps, patrols or both, and how many enemies a camp holds within the performance budget.
- Aggro and leash: when they notice you, how far they chase, and when they give up and walk home.
- Respawn: how long before a cleared camp fills again.
- Ground: walking and striking on slopes and among trees, and whether steering around colliders is enough or the zone needs a navmesh.
- Attack tokens (at most 2 melee and 2 ranged today) when two camps are close together.

## Comments

**2026-09-28:** [The quest chain](01-the-quest-chain.md) is resolved. The farm and the lumber camp are the chain's two bandit places and refill like any camp after their quest is handed in. Only enemies at a quest's own place count towards it. The mine's final enemy is the one thing that never respawns.

**2026-09-28:** [The zone's enemies](02-the-zones-enemies.md) is resolved. The camps and their starting counts, to check against the budget: the farm 4 thugs; the lumber camp 4 thugs, 2 archers and the leader (brute behaviour); the watchtower 2 thugs and 1 archer. Every camp refills after it is cleared, the mine's undead included; only the Warden stays dead. Prototype the lumber camp with skeletons standing in for the bandits: their looks come from [Friendly characters](11-friendly-characters.md), and the camp's behaviour doesn't depend on them. Whether anything patrols the roads is still this ticket's call.

**2026-09-28:** [Progression, death and saving](03-progression-death-and-saving.md) is resolved. Enemy levels, which scale health and damage by 20% a level from today's numbers: the farm 1, the lumber camp and the watchtower 2. When you die, enemies that were fighting you go back to their places at full health, and the ones you killed stay dead until their camp refills. Healing orbs keep dropping as today, and your health refills once you go 5 s without taking or dealing damage.

**2026-09-28:** Prototype built at `?camp` (code in `src/enemies/camp-prototype/`), three ways switchable in the headset with a left-stick click. The lumber camp has its 7 (skeletons standing in: 4 thugs round the fire, 2 archers watching the road, the leader by the tent), and two thugs patrol the camp road between the camp and the main road. You start on the main road where the camp road leaves it. Shared by all three: fighting enemies run at your walking pace when you're more than a few metres off, so walking away doesn't lose them; giving up means walking home untouchable and healing to full; a cleared camp refills after a minute (shortened to test it) once you're 30 m off; your health refills after 5 s out of the fight, and dying wakes you at the start with the fighters gone home. Enemies stand and walk on the ground's real height and steer round trunks and tents by looking a stride ahead (no navmesh).

- **A · One at a time:** each enemy notices you within 8 m and brings anyone within 6 m of it; each gives up 30 m from its post. You can pull the edge of a camp.
- **B · The whole camp:** step into the clearing (12 m) or hurt anyone and all 7 come; they all turn back together once you're 24 m from the camp.
- **C · Sight and alarm:** each sees 16 m ahead in a 120° cone, blocked by trees, tents and hills, and hears you within 3 m. It stops with a "?", then shouts and everyone within 15 m comes. Each gives up 6 s after losing sight of you, or 40 m from its post. You can sneak up behind the fire-watchers.

A "?", "!" or "home" over a head shows what it's doing; holding the left grip shows a readout with the camp's state, the leash, and the frame rate, draw calls and triangles. Clicking the right stick doubles the camp to 14 for the budget. In the emulator, 7 more skeletons cost about 14k triangles and 30 draw calls; the terrain and trees are most of the ~200k.
