# How the mage fights

Type: prototype
Status: ready for its own session
Blocked by: 01

## Question

How does the mage fight before any ability: the plain attack every mage has, what each hand holds, and how the mage survives a blow?

- The plain attack: a bolt thrown from the hand, a staff or wand pointed and triggered, or something drawn.
- What the off hand does. Inventory makes the mage's off-hand slot a focus: does it ward like a shield, cast, or boost the other hand?
- Defence: a ward, a blink in place of the dash, keeping distance.
- How mana (see the resource decision in charting) limits the plain attack, if at all.

Build a throwaway prototype in the arena (for example `?arena&class=mage`) that Tom can try on the headset against today's enemies.

## Brief for the prototype session

- **Start from `main`** once PR #58 (this map) has merged. Read `../map.md`, this ticket, both research notes in `../research/`, `CONTEXT.md`, and the player and combat code (`src/player/`, `src/combat/`, `src/world/arena.ts`, `src/route.ts`).
- **Call the Skill tool with "prototype".** Tom has asked for this map to be worked without him: take the option you judge best at every fork, and mark the answer "on Tom's behalf".
- **Keep it in the repo** so Tom can try it later on the live site: behind the URL flag below, with its files under `src/prototype/` and named so they read as a prototype. With the flag absent, the arena and the Adventure must behave exactly as today.
- **Level 1 numbers** against today's arena waves; the dash stays on B/Y unless the prototype replaces it.
- **Checks:** `npm run typecheck`, `npm test` and `npm run build` pass; the existing headless checks in `.scratch/oakvale-starting-zone/checks/` that touch the arena still pass; a new headless check in `.scratch/abilities/checks/` (emulator, `?emulate&nodevui`) drives the plain attack and shows it killing a wave-1 grunt. The README's URL-flag list gains the flag.
- **Record the answer:** append `## Answer` here (what was tried, what was kept and why, what it means for the resource and the Inventory map's off-hand slot), set `Status: resolved`, and add one line to the map's Decisions so far. Leave every other ticket alone; a sibling prototype session may edit the map at the same time, so keep both lines when merging.
- **Ship it:** open a PR into `main`, drive CI green, and merge it (Tom authorised merging).
- **Flag:** `?arena&class=mage`.
- **Starting point from the research:** a spell in each hand, charged by holding the trigger and cast by throwing or pushing the palm out, with how you throw shaping the bolt; no spell wheel. Settle what the off hand's focus does (a ward on the grip that blocks like a shield is the first thing to try), whether a blink replaces the dash, and whether the plain bolt costs mana.
