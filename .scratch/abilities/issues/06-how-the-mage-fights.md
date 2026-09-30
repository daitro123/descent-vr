# How the mage fights

Type: prototype
Status: resolved
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

## Answer

Prototyped on 2026-09-30 and decided on Tom's behalf. The prototype stays in the game at `?arena&class=mage` (`src/prototype/mage/`) for Tom to try on the headset; `.scratch/abilities/checks/mage.mjs` drives it in the emulator.

**The pick, kit A: a thrown bolt in each hand, a ward on the focus, and a blink.**

- **The plain attack.** Hold a trigger and a bolt gathers in that palm, full in 0.6 s. Let go mid-throw and it leaves along the throw. How hard you throw shapes it: a gentle toss makes a big, slow orb (0.2 m at 7 m/s) that's easy to land, a hard throw a small, fast bolt (0.08 m at 20 m/s). A 15° aim assist locks the nearest enemy along the throw, and the bolt bends toward it in flight. Let go with the hand still and nothing is cast. The hand ticks as it charges and pulses on the cast and the hit.
- **Level 1 numbers.** A full bolt deals 20, a tap 7, a head 1.6×, as the sword's crit. Three full bolts kill a grunt (45 health), two with a head shot. The sword deals 8 to 28 a swing, so the mage trades damage for range.
- **The off hand's focus.** It holds a ward: squeeze the grip and a hex of light stands where the warrior's shield would be. It *is* the shield to the combat code, so it blocks, parries (moved into the blow) and bashes exactly as the shield does. Each block costs 10 mana; a parry is free. With under 10 mana the ward won't rise. The focus hand's trigger casts bolts too, as the main hand's.
- **Defence.** The blink replaces the dash on B/Y: you're 3.5 m away at once, in the stick's direction (backwards if it's neutral), every 2.2 s. The belt's dash bar shows its cooldown. It opens the distance a caster wants, and a teleport has no gliding motion to make anyone sick.
- **Mana.** The plain bolt is free; its charge time is its limit, as a swing is the sword's. Mana pays for the ward's blocks now and for abilities later. A pool of 100 refills at 2 a second while anything fights you and 30 a second once the wave is down.

**What was tried and not kept** (all three kits are still in the code: the right stick's click steps through them, or `?kit=B`, `?kit=C`, and `?cast=`, `?focus=`, `?move=`, `?mana=` change one thing at a time):

- **Kit B, a wand** pointed and triggered, with a ward-only focus, the dash, and 5 mana a bolt. The wand is the most accurate and the least tiring, but it plays like a gun and loses "how you throw shapes it". Charging the plain bolt mana made the wave a count of casts; with the charge time already pacing it, it added bookkeeping and nothing to decide.
- **Kit C, a palm push** (charge, then push the palm out, trigger held) with two casting hands, no ward, and the blink. The push reads well as "magic", but each cast is a full arm's extension, which tires the arm sooner than a flick of a throw (the research's fatigue point), and without a ward the only answer to a grunt in your face is to blink.

**What it means elsewhere:**

- **Rage, focus and mana (ticket 09):** mana is a pool of 100 that the ward and abilities spend and the plain bolt doesn't; 2 a second in a fight, 30 out of it, as a first number.
- **Inventory's off-hand slot:** the mage's focus is the thing that holds the ward, as the warrior's shield is the thing that blocks. A better focus could carry a larger or cheaper ward (and Intellect, per ticket 08). Weapons stay a class matter: the main hand holds nothing, so the mage's "weapon" is its focus alone, unless a later ticket gives the main hand a wand or staff that carries the damage.
- **Gestures (tickets 02 and 07):** the focus hand's grip is the ward, so a gesture armed by a held grip can't use that hand's grip. The mage's gestures arm on the main hand's grip, or ticket 07 finds another arming for the off hand.
- **Enemies (map, not yet specified):** grunts raise their guard against a blade, not a bolt, so bolts are never guarded. Wave 1 dies to bolts; whether melee enemies need a way to close on a blinking mage waits on Tom's headset run.

**To try on the headset:** whether the throw's release lands where you meant (the assist's 15° and the homing's 70°/s are the knobs, in `mageNumbers.prototype.ts`); whether the ward, held up by the grip, is tiring over a full run; and whether the blink's 3.5 m is too far indoors.

