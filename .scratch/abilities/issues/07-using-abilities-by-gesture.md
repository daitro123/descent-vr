# Using abilities by gesture

Type: prototype
Status: ready for its own session
Blocked by: 02, 05, 06

## Question

How does each class use its abilities in a fight: which gestures, which buttons, and how many can one player remember?

- Charting decided gestures for most abilities and at most one button ability per hand. The prototypes settled the hands: the warrior holds the sword and the shield and both grips are free; the ranger's bow-hand (left) grip raises the ward and the mage's focus-hand (left) grip raises the ward, so both arm gestures on the right grip only. A/X is free for the ranger and the mage; the right stick's click is free for all. B/Y is the dash (the mage's blink).
- A gesture vocabulary that works for all three classes: what makes a gesture distinct from a sword swing or a bow draw, and how it's armed (a grip held, a pose, a place near the body).
- Inventory and Professions have taken places on the body: lifting a belt potion to your mouth, the grip at the shoulder (the bag), the grip in the potion slots at the hips, and the grip in the tool loop behind the main-hand hip. A grip pressed in any of them never arms a gesture.
- How many abilities one class can have in use at once, and whether you choose which (a loadout) or have them all.
- What a missed or false gesture costs, and how the game shows a gesture was read.

Build a throwaway prototype that tries a handful of gestures per class in the arena, with the recogniser the research recommends.

## Brief for the prototype session

- **Start from `main`.** Read `../map.md`, this ticket, both research notes in `../research/` (the gesture note's recommendation is the starting point), the answers of [How the ranger fights](05-how-the-ranger-fights.md), [How the mage fights](06-how-the-mage-fights.md) and [Rage, focus and mana](09-rage-focus-and-mana.md), `CONTEXT.md`, and the class prototypes in `src/prototype/` with the player and combat code (`src/player/`, `src/combat/`).
- **Call the Skill tool with "prototype".** Tom has asked for this map to be worked without him: take the option you judge best at every fork, and mark the answer "on Tom's behalf".
- **What to build:** a recogniser of our own on the research's Jackknife-style method (no UCF code), armed by holding the arming hand's grip and classifying on release, with a start-zone check that ignores a grip at the shoulder, the hip potion slots and the tool loop behind the main-hand hip. Give each class four to six placeholder abilities (a coloured burst, a sound and a buzz naming the gesture, spending the class's resource per ticket 09), a mix of flicks and shaped strokes, plus one button ability where a button is free. Include a way to record a gesture's template in the headset.
- **What to measure:** how often each gesture is read right, and how often normal play (sword swings, bow draws, bolt throws, blocks) fires one by mistake, in a headless run and as numbers Tom can check on the headset. Settle how many abilities a class can hold at once and whether you choose a loadout.
- **Keep it in the repo** behind `?arena&class=<warrior|ranger|mage>&gestures`, with files under `src/prototype/` named as a prototype. Without the flag, the arena, the class prototypes and the Adventure behave as today.
- **Checks:** `npm run typecheck`, `npm test` and `npm run build` pass, the existing checks still pass, and a new headless check in `.scratch/abilities/checks/` plays recorded strokes for each class and shows each read correctly and a set of sword swings and bow draws reading as nothing. The README's URL-flag list gains the flag.
- **Record the answer:** append `## Answer` here (what was tried, the gesture set per class, the loadout rule, the false-trigger numbers), set `Status: resolved`, and add one line to the map's Decisions so far. Leave every other ticket alone.
- **Ship it:** open a PR into `main`, drive CI green, and merge it (Tom authorised merging).
