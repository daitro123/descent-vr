# Map: Descent VR vertical slice

Label: wayfinder:map

## Destination

A written **vertical-slice spec** for Descent VR, ready to hand off as build tickets. The slice is a short playable dungeon descent with deeper melee, enemy variety and light loot. It is buildable in roughly 2–6 weeks of evenings. Playing it on a Quest 3 answers one question: *is this viable and worth continuing?*

## Notes

- **Domain:** a browser VR action RPG (Three.js + WebXR). Today's white box is described in `README.md`, and the stack and art reasoning is in `docs/tech-research.md`.
- **Why the project exists:** a hobby, a testbed for VR melee, and a check on whether it can become something viable. Viability is the lens for every ticket.
- **Hardware:** the dev owns a Quest 3. The IWER emulator (`npm run dev`) is enough for desktop checks, but combat feel is only judged on the headset.
- **Skills:** for grilling tickets, call `grilling` and `domain-modeling`. For prototypes, call `prototype`. For research, call `research`. Findings live in `.scratch/vertical-slice/research/`.
- **Standing preferences:**
  - One class only: the warrior (sword + shield).
  - **Loot is light:** about 3 items. The interesting part is trying out an item UI in VR, not stat depth.
  - Hand-built floors for the slice.
  - A minimal atmosphere pass only (lighting, audio, mood). No full art.

## Decisions so far

<!-- one line per resolved ticket: [title](link): gist -->

- [Quest 3 browser performance budget](issues/04-quest-3-browser-performance-budget.md): target 72 fps. Draw calls are the binding limit (~300, since every draw runs once per eye). At most 4 constant point lights, no shadows, ~8 enemies on screen, rooms merged and culled to what's visible.

## Not yet specified

- **Enemy roster:** which enemy types the slice needs and what each one tests in the player (ranged, which forces shield use and movement, is the obvious candidate). This waits on the combat-depth decision.
- **Atmosphere pass scope:** how much lighting, fog, torchlight and audio the slice needs to *feel* like a descent. Sharpens once the floors and the performance budget are known.
- **The 3 items themselves:** what they are and what they change. This waits on the item UI prototype and on how runs work.
- **Onboarding inside the slice:** how a first-time player learns sword, shield, parry and War Cry without the intro page. It matters for any viability test that involves another person.
- **A boss or end-of-slice moment:** whether the slice ends in a climax and what it would be.
- **Assembling the spec:** once the decisions above are in, write the vertical-slice spec itself and break it into build tickets.

## Out of scope

- A second class. One class done well is the better viability test.
- Multiplayer.
- A native or Unity port.
- Monetisation or a store release.
- Full art production (Blockbench models, pixel-art pipeline). Only a minimal atmosphere pass is in scope.
- Procedurally generated dungeons. The slice uses hand-built floors, and procedural generation is a later effort.
- Deep Diablo loot (rolled affixes, rarity tiers, big inventories). The slice has about 3 items.
