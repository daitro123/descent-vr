# A living zone

Type: grilling
Status: resolved
Blocked by: 11

## Question

What makes Oakvale feel lived in beyond its quests and enemies?

- **Sound:** what plays where. Birds and wind in the woods, the stream and the pond, the smithy's hammer, the inn's fire and chatter, the mine's drips; and whether sound changes as you step indoors. Every sound in the game today is synthesised in code (`src/fx/sfx.ts`), with no audio files.
- **Villagers:** what the people [Friendly characters](11-friendly-characters.md) adds do. Standing at a spot with an idle loop, or walking a short round (the smith at the anvil, the innkeeper behind the bar, a farmer at the village edge), and whether any speak a line when you pass.
- **Time of day:** Oakvale is lit as a fixed late afternoon. Keep it, or let the sun move through a day and night, given the fixed light rig and the pool of 4 point lights from the research on joining zones.
- What fits the triangle and draw-call budget, since every villager costs about what an enemy does.

## Answer

Settled over three rounds on 2026-09-28 **by Claude on Tom's behalf**: Tom asked for the rest of the map to be settled without him, so every recommendation below was taken without his answer. The rounds and the reasons are under Comments, for him to revisit. The numbers are starting points, to tune on the headset.

- **Time of day stays a fixed late afternoon**, in Oakvale and Brackenmoor alike. No day and night this pass: the zone feels alive through what moves and what you hear, not through the sun.
- **Every sound is synthesised in code, as today.** No audio files. Each sound is played by one name, so any one of them can later become a recording without changing where it plays. Voices and crowd chatter, which synthesise badly, are left out rather than faked.
- **No music.** Oakvale's sound is its ambience. The short stings the game already has aren't music and stay where they are.
- **Each zone has an ambience** that plays everywhere in it, under everything else:
  - **Oakvale:** a light wind in the leaves, and birdsong: a few kinds of call, each now and then from somewhere in the trees 10 to 30 m around you, fewer over the open fields.
  - **Brackenmoor:** a stronger, lower wind over open ground, and a lone bird's call now and then. No birdsong, since there are no trees.
  - **The mine:** hollow air and water dripping around you, with timbers creaking in the old mine. The crypt at the bottom has today's low drone, which leaves the outdoors and becomes the sound of the undead's home. The arena keeps the drone too.
- **Places have their own sound**, heard as you come near and placed where they are, so you can walk toward them:
  - the stream running under the bridge, and water lapping at the pond's dock;
  - the windmill's slow wooden creak at the farm as its sails turn;
  - the smithy: the hammer on the anvil, struck when the smith strikes, and the forge's low roar;
  - the inn: its hearth crackling, heard through the open door and inside;
  - the lumber camp's campfire crackling;
  - a cold draught and drips at the mine's mouth.
- **Sound changes with place**, on the same cues as the light:
  - **Indoors:** when the door shuts behind you, the outdoors goes muffled and quiet, and the room's fires come up (the inn's hearth and small fireplace, the house's hearth). Opening the door brings the outdoors back over the same half-second as the sun.
  - **The mine:** past the adit's bend the outdoor ambience fades out and the mine's comes up. At the breach into the crypt, the drone rises.
  - **The seam:** Oakvale's ambience crossfades into Brackenmoor's across the same 40 m either side of the crest as the light.
  - **In a fight**, the ambience dips a little, so the enemies' wind-up cues cut through.
- **Villagers stay at their spots and work.** No rounds. Each turns their head to follow you while you're within 4 m, and goes back to work when you leave:
  - **The smith** hammers at the anvil in bursts of a few strikes, turns the piece, and pumps the bellows now and then. Each strike rings out.
  - **The innkeeper** wipes the bar and polishes a tankard, sets it down and picks up another.
  - **The farmer** leans on the pitchfork by the well, looks off toward the farm, and shifts their weight.
  - **Marshal Hale** stands with their left hand on the pommel and waves as you walk up, as before.
- **Villagers bark.** Each says one short line as text over their head when you come within 4 m. It shows for about 4 s, facing you, and not again until you've been 10 m away. Each villager has two or three lines that follow the quest chain: the farmer's change once Raiders in the Fields is handed in, the smith's once The Lumber Camp is, and the innkeeper's once What Lies Below starts and again once the Warden is beaten. Text only, no voice. Marshal Hale doesn't bark, since they have the board. The lines are placeholders for the spec, for example the farmer's "Those red-masked thieves took my farm. The marshal's the one to see."
- **Smoke rises** from the village's chimneys (the inn's two, the two houses that have one, and the smithy's forge) and from the lumber camp's campfire. It's the one new thing that moves, and it shows where the village is from the hills and the pass.
- **Birds are heard, not seen.** No flying birds, butterflies or small animals this pass; four-legged ones are out of scope anyway.
- **Budget:**
  - The villagers' triangles are already counted in [Friendly characters](11-friendly-characters.md): about 2,800 for all four friendly characters. Working loops and head turns add no triangles.
  - Smoke is one draw call of soft puffs for every plume together, about 60 quads (120 triangles), kept thin to hold down overdraw. A bark is one small text panel and one draw call while it shows; at most two show at once.
  - At most 8 ambient sounds play at once, nearest first, and a place's sound stops when you're more than about 40 m off. The zone's wind isn't placed in space. The nearest few places' sounds are placed with HRTF, as combat's are; farther ones, and the birds, pan cheaply. The audio's CPU cost is measured on the headset along with the triangles.
- **Nothing new is saved.** Barks and ambience follow where you stand and how far the quest chain has got, which the save already holds.

## Comments

**2026-09-28:** graduated from the map's "A living zone" fog once [The quest chain](01-the-quest-chain.md) and [Interiors](08-interiors.md) were resolved. The open interiors are the inn and the house by the well, and the smithy is walk-in; each has a spot a villager could fill.

**2026-09-28:** [The mine inside](09-the-mine-inside.md) is resolved (by Claude on Tom's behalf). The mine has three parts with their own feel: the timbered old mine with its rails and lanterns, the bandits' rough dig, and the ancient crypt at the bottom. Past the adit's bend the sun fades and the outdoors is hidden, as indoors, so that's the place for the sound to change too. Nobody friendly lives in the mine.

**2026-09-28:** [The second zone and the seam](10-the-second-zone-and-the-seam.md) is resolved (by Claude on Tom's behalf). Over the southern pass lies Brackenmoor, an open, empty moor with no people, under the same late-afternoon sun. Its light blends with Oakvale's across 40 m either side of the pass's crest. If sound changes by place, the crest is where the woods' birds would give way to the moor's wind. A day and night cycle would have to run on both zones at once, since they share one sun.

**2026-09-28:** [Friendly characters](11-friendly-characters.md) is resolved (by Claude on Tom's behalf). Oakvale has three villagers besides Marshal Hale: the innkeeper behind the inn's bar, the smith at the anvil under the smithy's roof, and the farm's farmer, driven out by the bandits, standing by the well at the crossroads. The house by the well is empty. None gives quests; each so far just stands, and Hale waves as you walk up. Their idle loops, any rounds, and whether they speak a line as you pass are this ticket's. A human costs 630 to 900 triangles and one draw call, fewer than a skeleton.

**2026-09-28, round 1 (taken on Tom's behalf, without his answer):**

- Time of day stays a fixed late afternoon. There are no shadow maps and only 4 real point lights, so a night would be lit by four lights for the whole view: the woods and the camps would go dark, and the enemies' wind-ups, which combat is read by, would be hard to see. Oakvale's colours are baked into its vertices for this one sun, and the sky dome is painted with its sun disc fixed, so a cycle means re-tuning every colour for several times of day and repainting the sky. The quest chain is a sitting or two of play, so a cycle would barely turn once. Elwynn's look is its golden afternoon, and WoW's own cycle is slow and subtle. The world-level atmosphere from the research on joining zones blends colours and fog as uniforms, so a cycle can come later as a blend over time without a rebuild.
- Sounds stay synthesised in code. The game has no audio files, no asset pipeline and no licences to track, and nothing has to download to the headset. Wind, water, fire, birds and a hammer on an anvil are noise-and-tone sounds that synthesise well enough; voices don't, so there's no chatter at the inn. Mixing recordings in would make the synthesised combat sound thin beside a recorded brook, so it's all one family now, with each sound behind one name so a recording can replace it later.
- Villagers stay at their spots. There's no navmesh, the village is small, and a villager on a round would meet you on the road and need rules for bumping into you. A smith at the anvil or an innkeeper at the bar reads as a working village better than someone pacing, and that's how WoW's Goldshire does it.
- No music this pass. Synthesised music would be the thinnest thing in the game. In VR the ambience carries the sense of being there and leaves room to hear an archer draw behind you. Elwynn's music is part of its charm, so recorded zone music is a candidate for later, with the rest of the recordings.

**2026-09-28, round 2 (taken on Tom's behalf, without his answer):**

- One ambience per zone, and a sound for each place that has something making noise: the stream, the pond, the windmill, the smithy, the inn's hearth, the lumber camp's fire and the mine's mouth. Places' sounds are placed where they are, so they double as a way to find things: you hear the stream before you see the bridge. The bandits' camps get no sound of their own, since the only sound they could make is voices.
- Sound changes on the cues the light already uses: the door shutting, the adit's bend, and the 40 m either side of the crest. Using the same cues keeps what you see and what you hear in step and adds no new triggers.
- Today's drone plays under everything, arena and Oakvale alike. It's a dungeon sound, so it moves to the crypt at the bottom of the mine (and stays in the arena), where it tells you the undead are near.
- The ambience dips in a fight because the wind-up cues are how you read a swing; birdsong over the top of them would hide a tell.
- Each villager works on a loop at their spot, and all of them turn their heads to you within 4 m. A head that follows you is the cheapest way in VR to make a character feel present. The smith's strikes are in time with their sound, so the smithy is heard from the crossroads.
- Villagers bark: a short line as text when you come near, once per visit, with lines that change as the chain moves on. A line that notices what you just did (the farmer thanking you once Raiders in the Fields is handed in) makes the zone feel as though it saw you do it. It's text only, per the charting, and one line at a time, so it doesn't compete with Hale's board. Hale doesn't bark: the board and the gold marker are how they speak.

**2026-09-28, round 3 (taken on Tom's behalf, without his answer):**

- Smoke from the village's chimneys and the lumber camp's fire: a lit chimney says someone lives here, and a plume over the trees shows where the village and the lumber camp are from the hills and the pass. The houses that stay shut smoke too, so the village looks lived in all round. The farmhouse doesn't, since the bandits hold the farm.
- Birds are heard, not seen. Flying birds would be a new animation job for specks at 30 m, and birdsong already sells the woods. Deer and rabbits need a four-legged rig, which is out of scope.
- Budget: smoke and barks each cost one draw call and a handful of triangles; the villagers were counted in Friendly characters. Audio's cost is CPU, not GPU: each HRTF panner is a small convolution, so only the nearest few places' sounds use it. Up to 8 ambient sounds at once is a starting point, to check on the headset.
- Glossary: `CONTEXT.md` gains **Ambience** and **Bark**.
- On the map, the "Getting around" fog graduates into its own ticket, [Getting around](13-getting-around.md), since the question is sharp and it's the last decision left before the spec. The smoke plumes and the places' sounds from this ticket are part of its answer.
