# 38: The whole zone in one sitting

**What to build:** Proof that Oakvale plays as the spec says, start to finish. A scripted play-through in headless Chromium takes a new character from `?newgame` through all three quests to level 5 and Hale's longsword, and on over the pass to Brackenmoor's rockfall, with a reload and a death along the way. Whatever it finds broken gets fixed, and the numbers Tom will want to check on the headset are measured in the emulator and written down.

**Spec:** the whole spec, especially Testing Decisions and Performance and the triangle budget. User stories 1–147.

**Blocked by:** 14–37 (every ticket before it).

**Status:** done

- [x] A play-through script drives the Adventure through the debug handle (teleports and fixed time steps allowed, fights fought through the real combat): take and hand in each quest in turn, take the orders, beat the Warden, receive the longsword at level 5, then walk south over the seam to the rockfall. The script is checked in beside the spec.
- [x] Along the way: a reload mid-chain resumes where it left off; a death outside the mine wakes you by the inn's hearth and one inside wakes you outside its mouth; the Warden stays dead after a reload.
- [x] Every user story in the spec is either seen working in the play-through or its tests, or listed as waiting on the headset (feel, sound and the budget).
- [x] The emulator's draw calls, triangles and shader programs are measured from the village, from the crest looking north with both zones loaded, inside the inn, and in the Warden's hall, and recorded on this ticket beside the budget (72 fps, about 300 draw calls, at most 4 point lights, 250k to 300k triangles over both eyes). If they're over, the spec's order of cuts is applied, in order, until they're under.
- [x] Anything broken that fits in this ticket is fixed; anything bigger becomes a new ticket after this one.
- [x] The README describes playing Oakvale: the quest chain, saving and `?newgame`, the arena at `?arena`, and every URL flag.
- [x] The spec's "For Tom, on the headset" list is copied onto this ticket with the emulator's numbers beside each, ready for his next session.

## Built

Built on 2026-09-30 by Claude, in autonomous mode (Tom asked for the rest of Oakvale to run without his input).

- **The play-through** (`checks/play-through.mjs`, see its header): a new character at `?newgame`, played in headless Chromium with the IWER emulator, paused and stepped 1/72 s at a time from inside the page, with teleports between places. Every fight goes through the real combat: the script holds the controllers' grips where a player's hands would be, swings the sword forehand and backhand across the nearest enemy, holds the shield between you and the blow that's coming (or towards an archer drawing on you) and steps back out of a slam's reach. Nothing is healed by the script. Hale's board is pressed and the leader's orders taken by moving a fist onto them; the mine and the pass are walked with the left stick.
- **Its last run, all ok, no page errors:**
  - A new character 3.56 m from Hale facing them, a gold "!", "Oakvale" floating up.
  - Raiders in the Fields: the board stays folded with your back to Hale, unfolds as you look at them, "Not now" folds it and keeps the "!", it reopens walking back and folds 4 m off; "Accept"; the farm fought to 3/3 (13 of 27 swings landed, 100/100 health); health comes back; handed in: +80 XP, level 2, "+80 XP" and "LEVEL 2" floating over Hale.
  - The Lumber Camp: two bandits down, then **a reload resumes it** (level 2, 200 XP, 2/5, 0.02 m from where you stood, full health, the camp full again); the rest and the leader fought, the orders taken with the left fist, handed in: level 3 at 460 XP.
  - **A death outside the mine**: standing guard down among the watchtower's bandits, you fall after 14.6 s; "YOU DIED", the fade reaches black; you **wake by the inn's hearth**, inside with the door shut, 140/140 health, no rage, nothing lost; the bandits go home.
  - What Lies Below: in through the mouth, running in the adit; the cart hall fought; **a death in the gallery wakes you on the rail bed outside the mouth**, facing it, the three undead you cut down still dead; the rest of the mine fought (level 4 at the dig's brute, no more deaths); the Warden seated from the gate, rising as you step through it, **beaten through the real combat with no deaths to it**; "Return to Marshal Hale", its arrow hidden in the mine. 138 of 259 swings landed over all the fights.
  - **Reloaded, the Warden stays beaten**: its throne is empty.
  - The hand-in: level 5 at 1,000 XP, Hale's longsword in your hand (2.00 damage), gone from Hale's hip, Hale pointing south, the tracker gone.
  - The run south: z 8 to 259.7 in 77 s, running all the way; the zone becomes Brackenmoor at z 142.07, "Brackenmoor" floats up and a save is written there (z 142.07); the road ends at the rockfall; Oakvale behind you is 5 chunks full, 24 stand-ins, 20 unloaded.
  - The healing orbs: 5 dropped, the one picked up healed a quarter of your health.
- **Screenshots** of each stage are in the project files under `play-through/`.
- **Every user story** is in [stories-seen.md](../stories-seen.md): each one against the play-through step, check or test that showed it working, with four partly seen and the rest of what only a headset can show listed as waiting on it (feel, sound, look and the budget).
- **Fixed on the way**: nothing in the game was broken by the play-through. The triangle budget was over (below), so the spec's cuts went in.
- **The README** has a "Playing Oakvale" section (Hale and the board, the quest chain with its XP, levels and what they unlock, the camps, dying and where you wake, the village, Brackenmoor), every URL flag (`?newgame`, `?arena`, `?map=`, `?fly=`, `?inspect`, `?perf`, `?duel`, `?noemulate` and the rest), the debug handle, the checks folder, an updated code map and a new Status.

### The budget

Measured in the emulator in stereo, 96° square per eye (the Quest's field), the worst of several headings, with `renderer.info` over both eyes. Budget: 72 fps, about 300 draw calls, at most 4 point lights, 250k to 300k triangles.

| View | Draw calls | Triangles before the cuts | Triangles after | Programs | Point lights |
|---|---|---|---|---|---|
| The village (the crossroads) | 122 | 309.6k | **254.9k** | 18 | 4 |
| The crest looking north, both zones loaded | 136 | 376.8k | **318.2k** | 21 | 4 |
| Inside the inn | 22 | 11.4k | 11.4k | 23 | 4 |
| The Warden's hall, from its gate | 20 | 17.0k | 17.0k | 23 | 4 |

Other spots after the cuts (teleported there, so with more chunks held full): the village 287k, the crest 364k, the mine's front 378k, the farm 358k, the lumber camp 327k, all at 142 draw calls or fewer.

The spec's order of cuts, all three applied:

1. **The full radius 120 m → 100 m** (`CONFIG.streaming.full`).
2. **Far trees in more places**: in a full chunk, a tree deep in the woods (off every road's verge and `CONFIG.streaming.trees.clearing`, 6 m, clear of every clearing) uses the far set too. The village, the camps and the roads look as they did.
3. **Thin the trees outside the play area**: in the ring of chunks round the zone's edge, past where you can walk, one tree in `CONFIG.streaming.trees.thin` (2) is kept.

Oakvale's whole-zone triangle total went from 266,542 to 214,824 (`tests/streaming.test.ts`, with a new test that the village's chunk is untouched and the woods' and edge's chunks are cut).

Calls **taken on Tom's behalf**, to revisit:

- **The woods are still a little over the rule of thumb after all three cuts**, so they're recorded rather than cut further: the ticket's own cuts are the spec's, the limit that matters is 72 fps on the Quest, and draw calls (the Quest's usual bottleneck) are under half the budget. Further cuts are ticket 39, waiting on `?perf` from the headset.
- **Cut 2 reads "far trees in more places" as deep in the woods**, since the stand-ins past 100 m already use them; it keeps the near trees wherever you walk or fight.
- **Cut 3 keeps one tree in two in the edge ring**, which is outside the walkable land, so the zone's rim still reads as forest.
- **Measured over both eyes with IWER in stereo at 96° per eye**, the worst of 8 headings (5 on the crest, looking north): IWER's mono mode still draws a second empty view, and its default field is narrower than the Quest's.
- **Triangles are reported, not failed** in the check; draw calls and point lights fail it if over.
- **The play-through's fighter holds its shield towards the blow and steps back from a slam**, as a player would; with guard down it dies, which is how the two deaths are played.
- **Teleports stand in for the walks between places**, except into the mine and over the pass, which are walked, since those are what the ticket's crossing and the mine's run are about.
- **The stories' evidence is a companion file** beside the spec rather than on this ticket, since it's 147 rows.

### For Tom, on the headset

Copied from the spec, with the emulator's numbers beside each. The build doesn't wait on these.

- **Save**: whether `navigator.storage.persist()` returns true, and whether a save survives quitting straight after a hand-in. *Emulator: a reload resumes mid-chain (0.02 m from where you stood); the crossing wrote a save at z 142.07; the Warden stays beaten after a reload.*
- **Streaming** (the research's list): how long a plan and a chunk take to build; how many bytes a frame can upload with no stale frames; whether crossing the seam 10 times leaves `renderer.info.programs.length` unchanged, stale frames at 0 and memory at its baseline; whether the swap to stand-ins shows at the full radius (now 100 m); whether the staging frame uploads without drawing. *Emulator (ticket 37): 10 crossings, programs 18 before and after, no frame uploading more than one chunk; at the rockfall Oakvale is 5 full, 24 stand-ins, 20 unloaded.*
- **The budget**: triangles and frame time from the village and from the crest looking north, and the audio's CPU cost with 8 sounds playing. *Emulator: the village 122 calls and 254.9k triangles, the crest looking north 136 calls and 318.2k, the inn 22 calls and 11.4k, the Warden's hall 20 calls and 17.0k, 4 point lights at each. `?perf` on the Quest shows fps, calls, triangles and chunks.*
- **Feel**: the run's speed and vignette, the leader's reach, the camps at their levels, the Warden at level 5, and the talk board's distances. *Emulator: the run covered z 8 to 259.7 in 77 s; the scripted fighter beat every camp and the Warden with a shield, landing 138 of 259 swings, and died only when it lowered its guard; the board unfolds at about 3.5 m looking at Hale and folds 4 m off.*

Left for later:

- The triangles in the open woods, if the headset's frame time needs it (39).
