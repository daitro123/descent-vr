# Using abilities by gesture

Type: prototype
Status: resolved
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

## Answer

Settled on 2026-09-30 **by Claude on Tom's behalf**: Tom asked for the map to be worked without him, taking the recommended option at every fork and keeping the prototype in the code for him to try. Nobody has drawn a gesture on a headset yet. Every number below comes from strokes made up by code (seeded, drawn sloppily on purpose), not from recordings, so they say what the recogniser can tell apart, not yet what Tom's hand does; the headset modes below give those numbers.

**Try it:** `?arena&class=warrior|ranger|mage&gestures` (code in `src/prototype/gestures/`). Hold the right grip, draw, let go. The right stick's click steps through FIGHT, DRILL (asks for each gesture and counts how many were read right), JUNK (asks for sword swings, bow draws or bolt throws with the grip held and counts how many fired a gesture) and RECORD (what you draw becomes that gesture's template, kept in the browser). The left stick's click steps the gesture set; `&vocab=A|B|C` starts on one. The headless check is `.scratch/abilities/checks/gestures.mjs`.

**What was built:** a recogniser of our own on the research's method (16 points, 15 direction vectors, banded DTW of radius 2, the travel and bounding-box correction factors, a threshold per gesture, and a runner-up that must score at least 1.2 times the winner), armed by holding the grip and read on release, with a start-place check for the bag, the potion slots and the tool loop. Each class got placeholder abilities (a coloured burst, a sound per ability, a strong buzz and the gesture's name) paid for in its resource per [Rage, focus and mana](09-rage-focus-and-mana.md).

**Three gesture sets were tried**, the same five for every class:

- **A, mixed:** push out, flick up, ring, Z, V.
- **B, flicks:** push out, flick up, flick down, flick out to the side, flick across. A flick starts at the chest and is short, quick and straight.
- **C, shapes:** ring, Z, V, triangle, S, drawn in the air in front of you.

**The numbers** (200 strokes of each gesture and 200 of each move of normal play, all made with the grip held, the worst case for a player who squeezes it out of habit; "false" is the share of normal play read as a gesture):

| Class | Set | Read right | Read wrong | False | What fired |
|---|---|---|---|---|---|
| Warrior | A | 98.1% | 0% | 14.2% | thrusts as "push out" (105 of 200), overhead blocks as "flick up" (151) |
| Warrior | B | 97.4% | 0% | 17.8% | the same, and blocks on the right as "flick out" (61) |
| Warrior | **C** | 97.0% | 0.5% | **0%** | nothing, in 1,800 swings, thrusts and blocks |
| Ranger | A / B / C | 97.0 / 97.2 / 96.5% | 0 / 0 / 0.4% | 0% | nothing (bow draws) |
| Mage | A / B / C | 97.0 / 97.2 / 96.5% | 0 / 0 / 0.4% | 0.3 / 0.3 / 0% | one underhand bolt toss as "push out" |

The only confusion in set C is a sloppy triangle read as a ring, or too close to call, about one time in fifteen.

**The pick: set C, shapes, for every class.**

- **Arming:** hold the main hand's (right) grip, draw, let go; the stroke is read once, on release. The right grip arms in every class: the ranger's and the mage's left grip is their ward, and the warrior's shield hand makes flicks whenever it blocks or bashes, so the warrior's left grip stays free (for a shield ability later, if a talent wants one). The sword still cuts while the grip is held.
- **What makes a gesture a gesture and not a swing:** it turns. A swing is one arc, a thrust or a block one straight line, and a flick is the same line: a thrust with the grip held read as "push out" half the time, a sword raised to block as "flick up" three times in four. Every shape here has a corner or a loop, and none of 1,800 warrior moves read as one. **Rule for the ability tickets: every gesture turns through at least one corner or a loop; no straight lines and no single arcs.** Flicks read as well as shapes, and for the ranger and the mage they'd cost nothing, but one set for every class means a second character never relearns, so flicks stay out.
- **What never arms:** a grip squeezed over either shoulder (the bag), at either hip (a potion) or in the tool loop behind the right hip. A stroke is also dropped, not read, when it lasts over 1.6 s (a grip held through a fight), loses tracking, or has the class's own attack in the hand: an arrow nocked (ranger) or a bolt charging on the right trigger (mage). So a ranger's ability waits for a moment between shots, as ticket 05 guessed.
- **Buttons:** at most one button ability per class, on A/X: the warrior's is the War Cry as today, and the ranger and the mage each get one. B/Y stays the dash (the mage's blink). The right stick's click stays free; the prototype borrows it for its modes. Earthshaker stays a rule check, unarmed, as today.
- **How many at once, and the loadout:** the recogniser isn't the limit. Over the same strokes, three shapes read right 98.7% of the time, four 97.1%, five 96.9%, six 94.4% and eight 94.1%, with false reads at or under 0.1% throughout. Memory is the limit: shipped games settle on about four a hand (research note 01). So **every ability a character has is ready, with no loadout, up to six gestures and one button**, which covers level 10 (five base abilities and one talent ability from tier 3): the warrior has four gestures beside Earthshaker and the War Cry, the ranger and the mage five gestures and a button. **Past six** (only past level 10), you choose which six are ready, out of a fight on the talent page. Each gesture belongs to a slot, not to an ability, so a ring always casts whatever is in your first slot and the shapes you know never change meaning.
- **What a miss costs:** nothing is spent; the trail goes grey, a grey puff and a "?" rise from the hand, the grip ticks twice, and you draw again. Not enough rage, focus or mana: the gesture is read, nothing is spent, and a dull buzz and "not enough mana" say why. A false read spends its cost, which is why the thresholds lean strict: a miss is cheaper than a false read.
- **How the game shows a gesture was read:** a light tick when the grip arms, a faint trail behind the hand while you draw, then on release the trail flashes the ability's colour, a burst of that colour leaves the hand with its own sound and a strong buzz, and the gesture's name floats up with what it cost.

**What it means for the rest of the map:**

- **The class ability tickets (11 to 13):** give each class at most six gesture abilities by level 10, drawn from ring, Z, V, triangle and S (any new shape must turn), plus one on A/X for the ranger and the mage. The first slots should take the cheapest, most-used abilities; the triangle and the ring are the pair most often confused, so give them abilities that are cheap to cast by mistake or far apart in cost. Costs stay within ticket 09's ranges.
- **The talent tree (ticket 10):** the talent page also holds the loadout once a class has more than six gesture abilities.
- **Build:** the recogniser (`gestureMatcher`, `gestureRecorder`) is pure and small; a build ticket moves it into `src/player/` with templates recorded by Tom, and the stroke maker and the bench stay in the prototype.

## Comments

**2026-09-30, on Tom's behalf:**

- **Shapes over flicks:** the whole difference is the warrior. A flick is exactly what a sword arm does all fight, and research says false reads cost more than misses. A shape asks a little more of the arm, but a ring or a V is a second's work.
- **Right grip only:** one rule for three classes, and it keeps the shield hand free to block without casting. The cost is that the warrior can't cast from the shield hand; a talent could add that later.
- **No loadout up to six:** choosing which abilities are ready is a menu between fights that shipped games mostly avoid; six is within reach of memory, and level 10 needs no more.
- **To check on the headset:** DRILL each set for Tom's own read rate (and RECORD a few of each gesture if it's low: recordings are used at once); JUNK with the sword to see whether squeezing the grip mid-swing is a habit; whether the S is too fiddly (drop it for the ranger and mage and move their fifth ability to a button if so); whether the trail is visible enough; and whether drawing mid-fight is too slow against wave 3.
