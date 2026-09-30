# How the ranger fights

Type: prototype
Status: ready for its own session
Blocked by: 01

## Question

How does the ranger fight before any ability: how the bow draws, aims and shoots, and how the ranger survives a blow without a shield?

- Which hand holds the bow, how an arrow is taken and nocked (Inventory makes the ranger's off-hand slot a quiver), how aim, draw strength and damage relate, and whether arrows run out.
- A close weapon, or none: a knife in the draw hand, a kick, the dash.
- Defence without a shield: dodging, the dash, a parry with the bow, keeping distance.
- How it fits enemies built for melee: the enemies' archers already shoot, and their arrows can be sent back.

Build a throwaway prototype in the arena (for example `?arena&class=ranger`) that Tom can try on the headset against today's enemies.

## Brief for the prototype session

- **Start from `main`** once PR #58 (this map) has merged. Read `../map.md`, this ticket, both research notes in `../research/`, `CONTEXT.md`, and the player and combat code (`src/player/`, `src/combat/`, `src/world/arena.ts`, `src/route.ts`).
- **Call the Skill tool with "prototype".** Tom has asked for this map to be worked without him: take the option you judge best at every fork, and mark the answer "on Tom's behalf".
- **Keep it in the repo** so Tom can try it later on the live site: behind the URL flag below, with its files under `src/prototype/` and named so they read as a prototype. With the flag absent, the arena and the Adventure must behave exactly as today.
- **Level 1 numbers** against today's arena waves; the dash stays on B/Y unless the prototype replaces it.
- **Checks:** `npm run typecheck`, `npm test` and `npm run build` pass; the existing headless checks in `.scratch/oakvale-starting-zone/checks/` that touch the arena still pass; a new headless check in `.scratch/abilities/checks/` (emulator, `?emulate&nodevui`) drives the plain attack and shows it killing a wave-1 grunt. The README's URL-flag list gains the flag.
- **Record the answer:** append `## Answer` here (what was tried, what was kept and why, what it means for the resource and the Inventory map's off-hand slot), set `Status: resolved`, and add one line to the map's Decisions so far. Leave every other ticket alone; a sibling prototype session may edit the map at the same time, so keep both lines when merging.
- **Ship it:** open a PR into `main`, drive CI green, and merge it (Tom authorised merging).
- **Flag:** `?arena&class=ranger`.
- **Starting point from the research:** the bow in the left hand, drawn with the right; an arrow nocked by touching the string and holding the trigger, with no reach into a quiver; damage scaled by the draw; haptics building through the draw and a pulse on release; the bow hand's grip raising a short ward against arrows. Settle the close-range answer (a knife, a kick, only the dash) and whether arrows run out.
