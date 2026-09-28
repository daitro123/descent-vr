# The second zone and the seam

Type: grilling
Status: resolved
Blocked by: 04

## Question

Where does the second zone sit, and what does crossing into it look like?

- Candidates: through the southern pass where the player starts, or down the stream's valley.
- How big it is. It stays small and bare, per the Notes.
- What the player sees across the seam before crossing, and what marks the border (a road sign, a change in the trees).

The research on joining zones decides how wide the seam can be and when the next zone loads.

## Answer

Settled over three rounds on 2026-09-28 **by Claude on Tom's behalf**: Tom asked for the rest of the map to be settled without him, so every recommendation below was taken without his answer. The rounds and the reasons are under Comments, for him to revisit. The numbers are starting points, to tune on the headset.

- **Through the southern pass.** The second zone lies south of Oakvale, over the pass the main road already climbs. The stream's valleys east and west are left as gaps in the mountain ring, for later zones.
- **The seam is the crest of the pass**, the line z = +140 on the 40 m chunk grid, where the road tops out at about 9.3 m. Oakvale's side climbs to it and the second zone's side falls away from it, so the crest is a saddle and the seam sits on top. Each side blends its land into the other over one 40 m chunk, per [Joining zones without a loading screen](04-joining-zones-without-a-loading-screen.md): Oakvale's heights at the crest are the shared border, and the second zone's first chunk meets them.
- **The pass becomes walkable.** Today you can walk within ±84 m, so the pass from z = 84 to 140 is out of bounds. It opens as a corridor about 10 m either side of the road, bounded where the pass's walls turn steep, with rocks and pines along the edge. The road climbs about 8.5 m over 56 m; its steepest stretch (about 1 in 4 around z = 110 to 120) eases to 1 in 5, like the mine's ramps.
- **Open from the start.** Nothing gates the pass: as the quest chain decided, the zone is open, and the marshal's last line only points you there. Marshal Hale's last line names the second zone.
- **The second zone is Brackenmoor** (a placeholder name): an open moor of bracken and heather under the same late-afternoon sun, rust, olive and purple where Oakvale is green, with a scatter of grey rocks, low bushes and a few lone, wind-bent pines. It is bare, as the Notes ask: no quests, no enemies, no people and no buildings.
- **Its size:** 200 m across and 160 m deep on the chunk grid (5 by 4 chunks, x = −100 to 100, z = 140 to 300), about a third of Oakvale. You can walk about 120 m each way: x within ±60, z from the crest to about 260. Low, rounded moorland hills of 20 to 35 m ring it on the east, west and south, lower and softer than Oakvale's mountains. From the crest the land falls into a shallow basin a few metres above Oakvale's valley floor.
- **The road runs on** from the crest down across the moor and south to a gap in the far hills, where a **rockfall** closes it at the walkable edge: the way on to a later zone. Walking from the crossroads to the crest takes about a minute, and from the crest to the rockfall another minute.
- **What you see before crossing:**
  - From the village, the pass is what it is today: a notch of sky between the mountains at the end of the southern road.
  - Climbing the pass, the road runs up to a bare skyline between pines, and the tops of Brackenmoor's far hills rise in haze beyond the crest.
  - At the crest the moor opens below you: the basin, the road winding across it, the far hills and the rockfall's gap. Looking back north, Oakvale's valley lies below in its haze, framed by the pass.
- **What marks the border:**
  - **The land changes at the crest:** Oakvale's pines end and the moor begins, and the ground turns from green to rust and heather. Brackenmoor uses Oakvale's own plant shapes and materials with its own colours, so no new shader appears at the seam.
  - **A border stone** stands by the road on the crest, a single standing stone like the ones in Oakvale's circle.
  - **The light blends** across the 40 m either side of the line, by where you stand: Brackenmoor's haze is paler and cooler, its sky whiter and its ground light rust-brown. The sun stays where it is, since it's one sun and the same hour.
  - **The zone's name floats up.** As you cross, the name of the zone you're entering ("Brackenmoor", or "Oakvale" on the way back) fades in a little above your eye line, holds for about 3 s and fades, as WoW names a zone when you enter it. It lags your head like the quest tracker. It also shows when you load into the game.
- **Crossing:** the zone you're in (the current zone) changes only once you're 2 m past the line, so standing on it and stepping back and forth doesn't flash the name or save again and again. Crossing writes a save, as [Progression, death and saving](03-progression-death-and-saving.md) decided. The save's position is in world metres on the shared chunk grid, so it needs no zone name. Loading a save made in Brackenmoor puts you there, with Oakvale streaming in behind you.
- **Nothing follows you over.** No camp's 30 m leash reaches the pass (the farm, the nearest camp, is more than 50 m from its foot), and Brackenmoor has nothing that can hurt you, so there's no dying there and no respawn point.
- **What it proves.** Walking from the crest to the rockfall takes you far enough that Oakvale's chunks all drop from full detail to stand-ins and most of them unload (at z = 260, none of its 49 chunks is within 120 m and 32 are beyond 230 m), and walking back brings them in again. So the zone exercises the whole streamer both ways. Its check on the headset is the research's: walk back and forth across the seam 10 times with `renderer.info.programs.length` unchanged, 0 stale frames in OVR Metrics, and memory back at the same baseline.
- **Budget:** Brackenmoor is cheap to draw, about 16k triangles of ground at Oakvale's 2 m grid plus its sparse rocks and trees (an estimate, not measured), against Oakvale's ~200k. The costly view is the crest looking north into Oakvale; the streamer's stand-ins beyond 120 m are what keep it in budget.
- Brackenmoor is a zone like Oakvale in the code, so the viewer can fly it (`?fly`).
- Names (Brackenmoor, the border stone) are placeholders for the spec.

## Comments

**2026-09-28:** the research on joining zones is in. It suggests the southern pass (the terrain's edge at z = +140, where the road already leaves) because the mountain ring hides most of the neighbour, and a seam that is a line on a 40 m chunk grid with a 40 m height blend each side.

**2026-09-28:** [The quest chain](01-the-quest-chain.md) is resolved. When the chain is done, Marshal Hale's last line points you south through the pass toward the next zone, which fits the research's pick of the southern pass. There is no quest in the second zone.

**2026-09-28:** [Progression, death and saving](03-progression-death-and-saving.md) is resolved. A new character now starts at the crossroads, not on the southern road, so the southern pass is no longer "where the player starts". The south stays unseen until the marshal's last line sends you there. Crossing the seam writes a save.

**2026-09-28, round 1 (taken on Tom's behalf, without his answer):**

- Where: the southern pass, over the stream's valleys. The road already leaves Oakvale that way, Marshal Hale's last line already points south, and the research picked it because the mountain ring hides the neighbour everywhere but down the pass. The stream's valleys sit at water level with the stream running out through them (heights at the ring, x = ±138, are 0 to 1 m along the channel), have no road, and would carry flowing water across the seam into the neighbour. They stay as the ring's gaps, where later zones can join.
- The seam on the crest: measured in the layout, the road climbs from 0.8 m at the play edge (z = 84) to 9.3 m at z = 140 and is nearly level from there to 150, so the chunk-grid line the research named is also the top of the pass. A seam on a saddle hides each zone from the other until you're nearly there, which suits a streamer that has to have the neighbour's stand-ins in place before you can see them.
- Brackenmoor as a moor: the biggest sign of a new zone is the land changing, as Elwynn's woods give way to Westfall's golden fields in WoW. An open moor contrasts most with Oakvale's woods, and bare is cheap: few trees means few triangles on the side of the seam you see from the crest. It also makes a zone without quests or enemies feel like a place, not an unfinished one.
- Size: a third of Oakvale, with about 120 m to walk past the crest. The size is set by what the zone has to prove, not by content: at the far end you're 260 m from the village, so every Oakvale chunk has dropped to a stand-in or unloaded, which a smaller zone wouldn't reach (quick count on the chunk grid: 13 of Oakvale's 49 chunks are still full detail at the crest, 6 at z = 200, none at z = 260).

**2026-09-28, round 2 (taken on Tom's behalf, without his answer):**

- What you see: looked at in the viewer (`?fly=forest`). From the village the southern road ends in a notch of sky between hazy mountains; from halfway up, the road climbs to a bare skyline; from the crest looking north, the pass falls away between pines into Oakvale's haze. Brackenmoor sits lower than the crest, so it can't be seen from Oakvale until the crest, but its far hills (20 to 35 m high, 120 m and more past the crest) rise over the skyline from the upper pass. That's the tease, and the crest is the reveal.
- Marking the border: four things together, all cheap. The land change is the one you'd notice without being told. The border stone is one prop that makes the crest a spot. The light blend comes free with the research's world-level lights and fog, and making Brackenmoor's haze cooler than Oakvale's warm afternoon is what shows the blend working. The zone's name floating up is WoW's own sign that you've crossed, and it tells Tom on the headset that the crossing happened. No sign with words on it: the floating name says it where you can't miss it.
- The pass opens as a corridor along the road rather than the whole pass, so you can't climb the mountain ring's sides and look out over its edges. It's bounded the same invisible way as Oakvale's play area today, with rocks and pines along the edge so the limit reads.
- Open from the start: the quest chain ruled out gating. Walking over at level 1 finds an empty moor, which is fine for a zone with nothing in it.

**2026-09-28, round 3 (taken on Tom's behalf, without his answer):**

- The road ends at a rockfall, not at nothing: a road that stops in the grass looks unfinished, and a rockfall in a gap says the world goes on, as the long-term vision needs.
- The current zone changes 2 m past the line: a seam the player stands on would otherwise flash the name and write a save on every small step. The atmosphere doesn't need this, since it blends by position.
- Nothing dies in Brackenmoor, so it needs no respawn point; one comes with the first thing there that fights.
- The save needs no zone name, because the research puts every zone on one chunk grid in world metres. Saving on crossing was already decided.
- Glossary: `CONTEXT.md` gains **Current zone**, and **Seam** now says it's a line across a pass or valley where the two zones' land and light blend.
