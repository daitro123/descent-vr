# How the ranger fights

Type: prototype
Status: resolved
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

## Answer

Settled on 2026-09-30 **by Claude on Tom's behalf**: Tom asked for the map to be worked without him, taking the recommended option at every fork and keeping the prototype in the code for him to try later. Nobody has played it on a headset yet, so every number below is a first guess; the reasons are under Comments.

**Try it:** `?arena&class=ranger` (code in `src/prototype/ranger/`). The default is the kept variant; `&variant=ward|knife|kite` picks one, and clicking the right stick cycles them in the headset with a banner naming each.

**What every variant shares, and what's kept:**

- **The bow is in the left hand and drawn with the right.** To nock, touch the string's middle half with the right hand and hold the trigger. Nothing is taken from a quiver. Pull back and let go of the trigger to loose; a draw under 15% puts the arrow away. The arrow flies from the nock through the rest, so the draw hand aims as much as the bow hand.
- **The draw sets damage and speed.** At level 1 an arrow does 6 to 30 damage and flies at 14 to 42 m/s, both rising in step with the draw (full draw is 0.62 m from the rest). Arrows fall under gravity, so a weak draw lobs. A head shot crits at the enemy's own multiplier (×1.6 on a grunt), and an exposed enemy takes ×1.5, as with the sword. So two full-draw body shots kill a grunt (45 health), one full-draw head shot drops it, and one body shot drops an archer (28). An enemy's raised guard stops an arrow.
- **Haptics:** a tick every 50 ms through the draw, growing with the bend in both hands, a click at full draw, and a sharp pulse on release (1.0 in the draw hand, 0.6 in the bow hand).
- **Plain arrows never run out.**
- **Kept for defence, variant A (the ward):** squeezing the bow hand's grip raises a ward, a disc just past the bow hand, facing away from you. It lasts while held, up to 1.2 s, then needs 2 s to come back. It stops enemy arrows, and in its first 0.35 s it sends them back at the archer (the warrior's arrow reflect, 30 damage and the archer left exposed). It doesn't stop blows.
- **Kept up close:** only the dash (B/Y, unchanged) and point-blank shots. The bow shoots fine at a metre.
- A/X and the right stick's click are free for the ranger. The prototype borrows the click to cycle variants.

**Tried and not kept:**

- **B, the knife:** a knife in the draw hand whenever it isn't holding an arrow (8 to 16 damage by slash speed, crits on the head). Swinging the bow into a blow parries it (the enemy staggers and is exposed), and holding it still blocks 60% of the blow. A fast bow swing sends an arrow back.
- **C, kiting:** no ward and no knife. Instead, two dash charges (one back every 1.4 s), a longer step (2.4 m instead of 1.7), and a quiver of 12 arrows that refills one every 1.5 s while you aren't drawing.

**What it means for the rest of the map:**

- **Focus (issue 09)** pays for the ranger's abilities (special shots and the like), not for plain arrows. The ward is free on its cooldown here; whether it should cost focus is 09's call.
- **Inventory's off-hand slot:** the ranger's quiver is a gear piece that carries attributes (Agility, Stamina) and a look. You never reach into it, and arrows aren't items or ammunition to buy. Nothing about the slot needs an interaction.
- **Gestures (issue 07):** the ranger's bow-hand grip is the ward, so the ranger's gesture abilities arm on the draw hand's grip. Both hands are busy while drawing, so a ranger ability wants a moment between shots, or a button (A/X is free).
- **The ranger's talents (issue 12)** get the close-range gap to fill: a disengage (a kick or a leap back), a trap, a point-blank shot.
- **Enemies (the map's fog):** a grunt (1.35 m/s) closes from 5 m to striking reach in about 3 s, time for two full draws. The dash buys the rest. What a kiting ranger needs from camps (leash and notice ranges) is still open.

## Comments

**2026-09-30, on Tom's behalf:**

- **The ward over the knife:** the knife turns the ranger into a second melee class, and it puts a blade on the hand that has to find the string, so every reach to nock swings a knife through whatever is close. The bow parry has the same flaw from the other side: parrying means swinging the bow, which throws off the aim you were holding. The ward asks for a squeeze of a hand already holding still, and it answers the one thing a ranger meets that a dash can't: an archer's arrow from across the room.
- **Unlimited arrows over a quiver that runs dry:** In Death gives unlimited plain arrows and rations only the special ones (research note 01). In a melee-built arena, a dry quiver leaves you with nothing to do but dash. Counting arrows is bookkeeping without a choice. Rationing belongs to focus and the special shots.
- **Only the dash up close:** being weak up close is the ranger's side of the class triangle, and it leaves the talents something to give. Two dash charges (C) felt like the better way to kite on paper, so they're the first thing to try if the dash alone is too little on the headset.
- **What to check on the headset:** whether nocking by touching the string is reliable (the reach is 13 cm around the string's middle half), whether the arrow's line from the nock suits the eye (Elven Assassin's patch moved it), whether the ward's disc is where the eye expects it, and whether the damage makes wave 3's archer and two grunts fair.
- The headless check `.scratch/abilities/checks/ranger.mjs` draws, looses and kills wave 1's grunts (two body shots, then one head shot), sends an archer's arrow back with the ward, cuts with the knife, and spends the kite's arrows and dashes.
