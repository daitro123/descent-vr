# Enemies in the open

Type: prototype
Status: open
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
