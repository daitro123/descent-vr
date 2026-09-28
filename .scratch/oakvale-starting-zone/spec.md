# Spec: Oakvale, the starting zone

Status: ready-for-agent

Written on 2026-09-28 from the [Oakvale map](map.md) and its thirteen resolved tickets, **by Claude on Tom's behalf**: Tom asked for the rest of the Oakvale work to run without his input. Where the map left a detail to the spec, the call made here is marked _(spec, on Tom's behalf)_, and every such call is listed under Further Notes so he can revisit it. Every number is a starting point, to tune on the headset. Every name (Marshal Hale, the quests, the Golden Tankard, Brackenmoor, the lines people say) is a placeholder, cheap to change.

The glossary is `CONTEXT.md`. This spec uses its words: **zone** (never "map" for a region), **quest giver**, **villager**, **bark**, **camp**, **patrol**, **pull**, **leash**, **hand in**, **objective**, **behaviour**, **family**, **level**, **boss**, **respawn point**, **interior**, **ambience**, **seam**, **current zone**, **run** and **quest arrow**.

## Problem Statement

Descent VR is a combat prototype today. You enter VR in a crypt hall and fight waves of skeletons until the Warden falls, and then it starts over. The combat feels right (Tom, 2026-09-28), but there is no world to use it in. Oakvale, the forest Tom built after WoW's Elwynn Forest, can only be walked or flown through. Nobody lives there, no building opens, nothing fights you, nothing asks anything of you, and nothing you do is kept when you take the headset off.

Tom wants the game to grow into a WoW-style world of zones joined without loading screens. For that, the first zone has to be something you play. A new character needs a reason to go out, a few levels to fight through, and people to come back to who notice what they did. At the end, they need to walk over a pass into the next zone without the game stopping to load it.

## Solution

Oakvale becomes the game at the site's plain URL: a single-player starting zone that takes a new character from level 1 to 5 in a sitting or two.

You start at the crossroads facing Marshal Hale, the village's guard captain, with a gold "!" over their head. Walk up and a board unfolds beside them; press "Accept" with a fist or the sword's tip. Hale's chain of three quests sends you to the farm to drive off red-masked bandits, then to the lumber camp across the bridge to clear out the gang and take their leader's orders from the tent by hand, and last down the old mine, where the bandits dug into an ancient crypt and woke the dead. At the bottom the Warden rises from its throne. Beat it, walk back to Hale, and they hand you their own old longsword and point you south.

Between the quests the zone is alive. Bandit camps notice you and pull their neighbours in, chase you until their leash turns them home, and fill up again later. The inn and a house open, and you walk in through their doors. A smith hammers, an innkeeper polishes tankards and a farmer waits by the well, and each has a line for you as you pass. You hear the wind and the birds, the stream, the windmill and the forge, and smoke rises over the chimneys. A tracker at the top left of your view says what's left to do, with a gold arrow pointing the way. Signposts name the roads, and a painted map at the crossroads shows the whole zone. You can run when nothing is fighting you.

Dying costs only the walk back: you wake by the inn's hearth, or outside the mine if you fell inside it. The game saves itself in the browser, so you can take the headset off and carry on later where you stood.

South over the pass lies Brackenmoor, a small, bare moor. Walk over the crest and the land, the light and the sound change, its name floats up, and Oakvale unloads behind you, all without a loading screen. Brackenmoor exists to prove that. Its road ends at a rockfall, the way on to a later zone.

The arena stays as a practice mode at `?arena`.

## User Stories

### Starting and saving

1. As a new player, I want the game at the plain URL to be Oakvale, so that the zone is the game and not a side mode.
2. As a player on the page before entering VR, I want to see Oakvale from where I'll stand, slowly turning behind the intro text, so that the page shows the game I'm about to play.
3. As a new player, I want to start at the crossroads a few steps from Marshal Hale and facing them, so that the first quest is the first thing I see.
4. As a player, I want the zone's name, "Oakvale", to float up in view when I load in, so that I know where I am.
5. As a returning player, I want to load where I last stood, facing the way I faced, with my level, XP, sword and quests as they were, so that I can carry on after taking the headset off.
6. As a returning player, I want to load with full health, no rage and every camp full, so that loading is a clean start and nothing is half-fought.
7. As a returning player who saved inside the inn or the house, I want to load inside with the door shut and the room lit, so that I'm not dropped outside or into a wall.
8. As a returning player who saved inside the old mine, I want to load inside the mine where I stood, with the mine's light on, so that I pick up the descent where I left it.
9. As a returning player who saved in Brackenmoor, I want to load there with Oakvale streaming in behind me, so that saving works in any zone.
10. As a player, I want the game to save on every quest change, level-up, new sword and zone crossing, so that nothing I earn is lost if the headset's battery dies.
11. As a player, I want the game to save every 30 s, and when I leave VR or the page is hidden, so that where I stand is kept too.
12. As a player, I want my save to survive new builds of the site and browser updates, so that Tom's deploys never wipe my character.
13. As a player, I want `?newgame` to start over from level 1 after I confirm it, so that I can play the chain again.
14. As a player in a private window, or where the browser won't store data, I want the game to play anyway and say on the page that progress won't be kept, so that nothing breaks.
15. As Tom, I want the arena at `?arena` (with `?duel`, `?wave` and `?showcase`) to play as it does today and never touch the save, so that I can practise combat without affecting my character.

### Talking to Marshal Hale

16. As a player, I want a gold "!" over Marshal Hale when they have a quest for me, a grey "?" while mine is under way, and a gold "?" when it's ready to hand in, so that I can tell from across the crossroads whether to go back.
17. As a player, I want Hale to turn to face me and wave as I walk up, so that they feel like someone waiting for me.
18. As a player, I want a parchment board to unfold beside Hale, on my right and turned to me, when I'm within about 2.3 m and looking their way, so that talking needs no menu and no button.
19. As a player, I want the board to show Hale's name, what they say, and chunky buttons ("Accept" and "Not now", "Hand in", "Goodbye"), so that I can read the quest and act on it.
20. As a player, I want to press the board's buttons with either fist or the sword's tip and feel that hand buzz, so that I never put my sword or shield down to talk.
21. As a player, I want a hand or blade already resting where a button appears to have to leave it before it can press, so that nothing fires by accident as the board unfolds.
22. As a player, I want the board to fold away when the talk ends or when I walk about 3.6 m off, and stay shut until I've walked away and come back, so that it doesn't keep springing open while I stand near Hale.
23. As a player, I want "Not now" to fold the board and leave the "!" over Hale, so that I can take the quest later.
24. As a player with a quest under way, I want Hale's board to remind me what they asked, so that I can check without reading the tracker.
25. As a player, I want to hand in a finished quest with the board's "Hand in" button, so that handing in is a deliberate act at the quest giver.
26. As a player handing in, I want the reward to float over Hale ("+80 XP", then "LEVEL 2" if it lands one) with a fanfare, so that finishing a quest feels like an event.
27. As a player who has finished the chain, I want Hale's last line to point me south through the pass and name Brackenmoor, so that I know the world goes on.

### The quest chain

28. As a player, I want Hale's quests to come one at a time, each unlocked by handing in the one before, so that the zone leads me through itself in order.
29. As a player, I want "Raiders in the Fields" to ask me to defeat 3 bandits at the farm, so that my first quest is a short, clear fight close to the village.
30. As a player, I want "The Lumber Camp" to ask me to defeat the 5 bandits of the lumber camp and take their leader's orders from the tent, in either order, so that the second quest is a bigger fight with something to find.
31. As a player, I want to pick up the leader's orders by touching them with either hand, with a buzz and the tracker ticking over, so that the find is a real hand action in VR.
32. As a player, I want the orders to reveal that the gang is digging for silver in the old mine, so that the chain leads me on to the mine.
33. As a player, I want "What Lies Below" to send me down the old mine to defeat whatever woke the dead, so that the chain ends in a descent and a boss.
34. As a player, I want only enemies of the quest's own camp, killed while the quest is active, to count towards it, so that the counts mean what they say.
35. As a player, I want kills and pickups made before I took the quest not to count, while the whole zone stays open to me, so that I can explore freely and the quest still asks its fight of me.
36. As a player, I want no quest to be dropped or repeated, so that the chain is a story that moves one way.
37. As a player, I want every quest to pay XP and the last one also to pay Hale's old longsword, so that every hand-in is worth the walk back.
38. As a player, I want nothing to stop me going anywhere in the zone at any level, so that Oakvale feels open, as WoW's zones do.

### Tracking quests and finding the way

39. As a player, I want the quest I'm on to float at the top left of my view, drifting a little behind my head, with its title in gold and each objective with its count ("Bandits defeated at the farm: 2/3"), so that I always know what's left.
40. As a player, I want the tracker to say "Return to Marshal Hale" once everything is done, so that I know to hand in.
41. As a player, I want the tracker to flash when I take a quest, make progress or finish it, so that I notice progress without looking for it.
42. As a player with no quest, I want the tracker gone, so that my view is clear.
43. As a player, I want a small gold quest arrow beside the objective I'm working on, pointing the way to its place as the crow flies (up is straight ahead), so that I know which way to walk.
44. As a player, I want the arrow to point at the farm, the lumber camp or the old mine's mouth for the quest I'm on, and at Hale once I should return, so that it leads me out and back.
45. As a player, I want the arrow to hide once I'm at the place, within about 10 m of Hale, indoors, and inside the mine, so that it never points through rock or at what's already in front of me.
46. As a player, I want the crossroads signpost's boards to name their roads ("Old Mine" and "Lumber Camp" north, "Farm" east, "Pond" west, "Brackenmoor" south), readable from a few steps away, so that the world itself says where things are.
47. As a player, I want a second signpost north of the bridge, where the watchtower and lumber camp roads branch ("Old Mine" north, "Lumber Camp" west, "Watchtower" east, "Village" south), so that I take the right fork.
48. As a player, I want a painted map of Oakvale on a board at the crossroads, showing the roads, the stream, the pond, the village, the farm, the lumber camp, the watchtower, the standing stones, the old mine, "To Brackenmoor" and a red "You are here", so that one look shows me the whole zone.
49. As a player, I want the smoke over the village and the lumber camp, and the sounds of the stream, the windmill and the forge, to help me find places, so that I find my way by the world and not only by the tracker.

### Getting around

50. As a player, I want to keep walking at 2.2 m/s on the left stick, with snap turns and the dash as today, so that the movement I know stays.
51. As a player, I want to click the left stick to run at 3.5 m/s, so that the walks back to Hale go faster.
52. As a player, I want to run only while the stick points ahead (within about 45° either side), and walk when I push it sideways or back, so that fast motion doesn't make me sick.
53. As a player, I want the run to end when I let go of the stick, so that I'm never carried along by a run I forgot about.
54. As a player, I want the edges of my view to darken a little while I run, fading in and out over about 0.2 s, so that the faster motion stays comfortable.
55. As Tom, I want the run's vignette strength to be one number, with 0 switching it off, so that I can tune it on the headset.
56. As a player, I want to be unable to start a run while any enemy is fighting me, so that I can't outrun a pull.
57. As a player, I want a pull to end my run on the spot with one buzz in my left hand, so that I know a fight caught me even if I didn't see it.
58. As a player, I want to be able to run anywhere out of a fight, indoors, in the mine and on the moor included, so that the rule is simple.

### Enemies and camps

59. As a player, I want bandits at the farm (4 thugs in two pairs), at the lumber camp (3 thugs, an archer and their leader, spread round the clearing), on the lumber camp's road (a patrol of 2 thugs) and at the watchtower (2 thugs and an archer), so that the woods have their own fights.
60. As a player, I want the village, the bridge, the pond and the standing stones to be safe, so that I have places to catch my breath.
61. As a player, I want each enemy to notice me within 8 m, or when I hurt it, and to bring anyone of its camp within 10 m of it, so that I can pull a camp's edge and take it a few at a time, as in WoW.
62. As a player, I want a fighting enemy to run at my walking pace when it's more than a few metres off, so that walking away doesn't lose it.
63. As a player, I want an enemy to give up once it's 30 m from its post, walk home untouchable and heal to full when it gets there, so that fleeing works and camps reset cleanly.
64. As a player, I want a hit on an enemy walking home to do nothing and float "Evade", so that I know why my blow didn't land.
65. As a player, I want the lumber camp's patrol to walk its road in single file, pausing 3 s at each end, so that the road itself can surprise me.
66. As a player, I want a cleared camp to fill again 3 minutes after the last of it falls, and only while I'm at least 30 m away, so that nobody appears in front of me and kills stay on offer.
67. As a player, I want camp enemies to have 40% more health and damage than the arena's at the same level, and up to three of them to swing at me at once (and two to shoot) across every camp together, so that camps are a real fight but still readable one blow at a time.
68. As a player, I want enemies to stand, walk and strike at the ground's real height and steer round trunks, tents and fences, so that fights on hills and among trees look right.
69. As a player, I want each place to add one new test in chain order (the farm teaches reading and blocking a swing, the lumber camp adds archers and the leader's unblockable slam, the mine puts every undead behaviour together, then the Warden), so that the zone teaches combat as I go.
70. As a player, I want an enemy's look to tell me its family and behaviour (a bandit's red kerchief and sash, an archer's green hood, bone for the undead, the leader's size, red coat and felling axe), so that I can read enemies without names over their heads.
71. As a player, I want no names or levels over enemies' heads, only their health bars as today, so that my view stays clean.
72. As a player, I want enemies to drop only healing orbs, each healing a quarter of my health, so that loot stays light and orbs keep their use.
73. As a player, I want every enemy fighting me to walk home and heal when I die, and the ones I killed to stay dead until their camp refills, so that dying doesn't undo what I cleared.

### Levels and progression

74. As a player, I want to climb from level 1 to 5 in Oakvale, about a level per place, so that I feel myself get stronger.
75. As a player, I want each level to give me 20 more health (100 at level 1, 180 at 5) and 20% more damage, so that levels matter.
76. As a player, I want enemy levels to use the same step (the farm 1, the lumber camp and the watchtower 2, the mine 3 near its mouth and 4 deeper in, the Warden 5), so that a fight against my own level always feels like the arena.
77. As a player, I want kills to pay 10 XP per enemy level (triple for the bandit leader, the mine's brutes and the Warden) and the quests to pay 80, 120 and 300, so that both fighting and questing move me on.
78. As a player, I want levels 2, 3, 4 and 5 to need 100, 200, 300 and 400 more XP, so that the plain route lands level 2 at the first hand-in, 3 at the second, 4 inside the mine and 5 with the sword.
79. As a player, I want XP past level 5 to be dropped, so that the cap is clear and grinding goes nowhere.
80. As a player, I want the skeletons the Warden raises to pay nothing, so that a reset Warden can't be farmed.
81. As a player, I want the War Cry to unlock at level 2 and the ground slam (Earthshaker) at 3, with rage and its orb hidden until level 2, so that abilities arrive as I grow into them.
82. As a player, I want each kill to float what it paid ("+20 XP") where the enemy fell, so that I see what the fight was worth.
83. As a player, I want a level-up to show "LEVEL 3" with a sound, fill my health, and name anything it unlocked ("War Cry: press A or X"), so that it's a moment and I learn the new ability.
84. As a player, I want the belt to show my level number and a thin XP bar between the health and rage orbs, so that I can glance down at my progress.
85. As a player, I want Hale's old longsword to replace my sword in my hand the moment I hand in the last quest, darker-bladed with a gilded guard, handling exactly like mine and dealing 20% more damage, so that the reward is felt without an inventory.
86. As a player, I want the sword gone from Hale's hip once they've given it to me, so that the world agrees it's the same sword.
87. As a player, I want my health to refill to full over about 10 s once I've gone 5 s without taking or dealing damage, so that I can keep going between fights without hunting orbs.

### Death

88. As a player, I want the view to fade to black when I die, and to wake at a respawn point with full health and no rage, so that death is clear and quick.
89. As a player who died outside the mine, I want to wake by the inn's hearth, inside with the door shut, so that I wake somewhere warm and walk out.
90. As a player who died inside the mine, I want to wake on the rail bed just outside its mouth, facing it, so that the way back in is in front of me.
91. As a player, I want to lose nothing when I die (no XP, no sword, no quest progress), so that the walk back is the only price.

### The mine and the Warden

92. As a player, I want the old mine to be one route with no forks, about 100 m long and 7 m down over two gentle ramps with no stairs or ladders, so that I can't get lost and it's comfortable to walk.
93. As a player, I want the mine to tell the chain's story in its walls (the timbered old mine with its rails and carts, the bandits' rough dig and their dropped gear, then a breach into an ancient crypt), so that I understand what happened without being told.
94. As a player, I want 2 grunts and an archer in the cart hall and a grunt and an archer in the gallery (level 3), then a brute alone in the dig and another guarding the antechamber (level 4), so that the mine builds up to the Warden.
95. As a player, I want rock to block enemies noticing me and calling each other in the mine, so that each chamber is its own pull.
96. As a player, I want an enemy that can't see me to follow the tunnel towards me and walk home the same way, so that nobody gets stuck on a corner.
97. As a player, I want the mine's undead never to follow me out of its mouth, so that daylight is always an escape and the respawn point stays clear.
98. As a player, I want walls and ceilings to stop arrows, so that archers need a clear shot underground as they do outdoors.
99. As a player, I want the mine to refill 3 minutes after its last undead falls, and only once I've left it and am 30 m from its mouth, so that a death at the Warden doesn't mean fighting the whole mine again.
100. As a player on "What Lies Below", I want the Warden slumped on its throne and rising as I step through the hall's gate, so that the fight starts once I've seen the room.
101. As a player not on that quest, or after beating the Warden, I want the throne empty, so that the Warden has one moment to die in.
102. As a player, I want the Warden to reset to full health and its raised skeletons to crumble if I die or leave its hall by the gate, so that a boss is fought in one go.
103. As a player, I want the Warden to stay dead once beaten, reloads included, so that the boss is beaten for good.
104. As a player, I want the Warden's hall to be today's crypt hall with its throne, pillars and torches, so that the finale plays as well as it was tuned in the arena.
105. As a player, I want lanterns on the old mine's timbers about every 8 m, the bandits' brazier and lanterns further down, and torches in the crypt, with the deep workings darkest, so that the descent feels like going down while a swing stays readable.
106. As a player walking in, I want the daylight to fade and the mine's own light and fog to come up past the adit's bend, and the daylight to be back before I can see out on the way back, so that going underground never pops.

### Interiors

107. As a player, I want to walk into the Golden Tankard (the inn) and the house by the well, and in under the smithy's roof up to the forge and the anvil, so that the village feels lived in.
108. As a player, I want a door to swing open as I walk up and shut behind me, with no fade, loading or button, so that going indoors is seamless.
109. As a player, I want to see into a room through its open door with its fires already lit, so that inside and outside agree.
110. As a player, I want the sun to fade and the room's flames to light me once the door shuts behind me, and the sun to come back as I walk back to the door, so that indoors looks like indoors.
111. As a player, I want the windows to glow with daylight, so that the room still belongs to the afternoon outside.
112. As a player, I want the inn to be one taproom (a big hearth, a bar with barrels, bottles and tankards, four tables with benches, a small fireplace) and the house one room (a hearth with a pot, a bed, a table with two chairs and a candle, a chest, crocks, a rug, a broom), so that each reads at a glance.
113. As a player, I want the inn's upper floor and the house's attic out of reach, with no stair that leads nowhere, so that nothing looks unfinished.
114. As a player, I want no enemy ever to come indoors, so that the village's buildings are safe.

### Brackenmoor and the seam

115. As a player, I want the southern pass to be walkable along the road, bounded by rocks and pines, so that I can climb to its crest.
116. As a player climbing the pass, I want Brackenmoor's far hills to rise in haze beyond the crest, so that I'm drawn on.
117. As a player at the crest, I want the moor to open below me and Oakvale's valley to lie behind me in its haze, so that the crossing is a view.
118. As a player crossing, I want the land to change from Oakvale's green woods to Brackenmoor's rust, olive and purple bracken and heather, with a border stone by the road on the crest, so that I can see I've entered a new zone.
119. As a player crossing, I want the light, haze and sky to blend over the 40 m either side of the crest by where I stand, so that there's no line to see.
120. As a player crossing, I want the new zone's name to float up ("Brackenmoor", or "Oakvale" on the way back), hold for about 3 s and fade, so that I know I've crossed, as in WoW.
121. As a player, I want the current zone to change only once I'm 2 m past the crest, so that standing on it doesn't flash the name or save again and again.
122. As a player, I want no loading screen, pause or dropped frame anywhere in the crossing, so that the world feels like one place.
123. As a player on the moor, I want its road to run south to a rockfall in a gap in the far hills, so that the world clearly goes on.
124. As a player, I want Brackenmoor empty (no quests, enemies, people or buildings) and safe, so that for now it's just a place to walk.
125. As Tom, I want walking Brackenmoor end to end to take Oakvale from full detail to stand-ins to unloaded, and back on the way home, so that the crossing exercises the whole streamer.
126. As Tom, I want `?fly` to fly Brackenmoor as well as Oakvale, so that I can look the new zone over.

### A living zone

127. As a player, I want a fixed late-afternoon light in both zones, so that Oakvale keeps its golden look.
128. As a player, I want Oakvale's ambience of light wind and birdsong from the trees around me (fewer calls over the open fields), so that the woods feel alive.
129. As a player, I want Brackenmoor's stronger, lower wind and a lone bird's call now and then, so that the moor sounds open and empty.
130. As a player in the mine, I want hollow air, dripping water and creaking timbers, and the old drone rising at the breach into the crypt, so that the sound tells me the undead are near.
131. As a player, I want to hear the stream under the bridge, water at the pond's dock, the windmill's creak, the smith's hammer (in time with the smith) and the forge, the inn's hearth, the lumber camp's fire and a cold draught at the mine's mouth, each placed where it is, so that I can walk towards what I hear.
132. As a player stepping indoors, I want the outdoors to go muffled and quiet and the room's fires to come up over the same half-second as the light, so that what I see and hear stay in step.
133. As a player crossing the seam, I want Oakvale's ambience to crossfade into Brackenmoor's over the same 40 m as the light, so that the zones sound different.
134. As a player in a fight, I want the ambience to dip a little, so that the enemies' wind-up cues cut through.
135. As a player, I want no music, only each zone's ambience and the game's existing stings, so that I can hear an archer draw behind me.
136. As a player, I want the smith hammering in bursts and pumping the bellows, the innkeeper wiping the bar and polishing tankards, and the farmer leaning on a pitchfork looking towards the farm, so that the village is at work.
137. As a player, I want each villager to turn their head to follow me while I'm within 4 m, so that they notice me.
138. As a player, I want each villager to bark a short line as text over their head when I come within 4 m (about 4 s, facing me, once per visit), with lines that change as the chain moves on, so that the village notices what I've done.
139. As a player, I want Hale not to bark, so that the board and the gold marker stay the one way Hale speaks.
140. As a player, I want smoke rising from the village's chimneys and the lumber camp's fire, so that I can see where people are from the hills and the pass.
141. As a player, I want the four friendly characters (Marshal Hale, the innkeeper, the smith and the farmer) to be people with faces, each dressed for who they are, so that the village is peopled and Hale looks like an old fighter worth listening to.

### Building and testing it

142. As Tom, I want every new number (distances, timings, XP, levels, speeds) in the game's one table of tunables, so that tuning on the headset is turning knobs.
143. As Tom, I want a `?perf` readout of frame rate, draw calls, triangles, loaded chunks, bytes uploaded this frame and shader programs, so that I can measure the budget on the headset.
144. As Tom, I want the game to hold 72 fps, about 300 draw calls and at most 4 point lights on the Quest 3, so that it plays smoothly.
145. As Tom, I want `?map=<id>` to keep walking the world with no enemies and no save, so that I can still check the layout from the ground.
146. As Tom, I want the model inspector (`?inspect`) to show the human characters (Hale, the villagers and the bandits) with every animation, so that I can review them as I review the skeletons.
147. As a developer, I want the game driveable from the console and in the headless emulator (teleport, step time, read the quest state), so that checks run without a headset.

## Implementation Decisions

### Two games in one page

- The plain URL starts the **Adventure**, Oakvale with the save. Today's wave game becomes the **Arena** at `?arena`, unchanged in how it plays, with `?duel`, `?wave` and `?showcase` as its flags. It builds its enemies through the same level code at level 1, with no camp multiplier and its two melee tokens, and it never loads or writes the save.
- The entry point routes by flag, as it does now: `?inspect`, `?fly`, `?map=<id>`, `?arena`, `?perf` (a readout over whichever game is running), `?emulate` and `?nodevui` as today. `?newgame` asks for confirmation in a plain page dialog before VR; on yes it deletes the save and starts a new character, on no it carries on _(spec, on Tom's behalf)_. Anything else starts the Adventure.
- Before VR, the page shows the intro text over Oakvale seen from where the save (or a new character) stands, slowly turning, in place of the arena's bestiary lineup _(spec, on Tom's behalf)_. `?showcase` keeps the lineup, on the arena's page.
- Every new number goes into the game's one table of tunables, grouped by what it tunes (levels, camps, talk, tracker, run, sound, streaming, interiors), as every number is today.

### The world: zones, atmosphere, light and ground

The research on joining zones sets this shape. A new **World** module owns everything that has to be shared across zones, so that loading a zone never adds a light, a sky or a shader.

- **The World owns** one light rig (one hemisphere light, one sun, and a pool of exactly 4 point lights that is always in the scene), one sky dome, one fog, the camera's far plane, the streamer, and every loaded zone and interior. A zone's root carries no lights and no sky.
- **The pool of 4 point lights** sits at zero intensity outdoors, where glows fake every flame as today. Indoors and in the mine it moves onto the 4 nearest flames and flickers by intensity, fading over the swap. The count never changes, so no shader recompiles.
- **Fog is radial**, patched into the model material's shader once at startup before any program compiles, so a hill's fog doesn't change as you turn your head. The streamer culls chunks beyond the fog's far edge plus a chunk's radius.
- **Each zone and each interior brings an atmosphere**: fog colour, near and far; background; sky colours; sun and hemisphere colours and intensities; the far plane; and the flames for the pool. The World blends atmospheres by where you stand: across the 40 m either side of a seam, and over about half a second at an interior's cue. Only uniform values change.
- **One sun, one hour.** The sun's direction is fixed in the World's rig for every zone: a late afternoon from the south-west, with no day and night. The sky dome's haze band widens so distant ridges culled at the far edge are already fog-coloured.
- **The World implements `Ground`** (height, colliders, sight lines, steering, arrows) for the whole world, dispatching by position to the zone underfoot, or to an interior once you're inside it. Enemies, arrows and the player keep taking a `Ground` and never learn which zone or interior they're in. The same interface is how the arena's hall works today, so combat code doesn't change.
- **Current zone:** the World reports which zone you're in, and changes it only once you're 2 m past a seam's line. It also reports which interior you're in, if any. Changes fire an event the Adventure uses to float the zone's name, write a save, and switch sound.
- **Coordinates are world metres on one 40 m chunk grid**, x east and z south as today. Oakvale keeps its origin and its id (`forest`, so `?fly=forest` and `?map=forest` still work) and is labelled "Oakvale". Brackenmoor spans x from −100 to 100 and z from 140 to 300. Chunk keys are global, so a save's position needs no zone name.

### Zones: a plan and chunks

- **A zone is a pure plan plus a chunk builder**, both free of the DOM so they run in a worker and in tests. It registers an id, its display name, its origin on the grid and its neighbours. The **plan** is today's forest layout grown: heights, roads, the stream and pond, clearings, structures, colliders, landmarks, and now the **places** (the farm, the lumber camp, the watchtower, the mine front, the village), the camps' posts and the patrol's road, the respawn points, Hale's spot, the atmosphere, and the border profile along each seam. The **chunk builder** builds one 40 m chunk at full or stand-in detail and returns transferable arrays with a bounding sphere.
- The zone's own extras (glows, water, the windmill's sails, smoke, signposts' names, the map board) are built once per zone on the main thread from positions in the plan.
- `?fly` flies every zone, Brackenmoor included. `?map=<id>` walks the World from that zone's start, with no enemies and no save.
- `GameMap` and `MapInfo` change shape to this. The registry still finds zones by folder. The crypt stays a whole-build map for the viewer and `?map=crypt`, and the arena keeps building its own hall.
- **The walkable area becomes a shape**, not Oakvale's ±84 m square: the play square plus the pass corridor, and Brackenmoor's own area. Within about 1 m of a seam the World asks both zones.

### The streamer

- **Where each chunk should be is a pure decision** from your position and the loaded plans: full detail within about 120 m, a stand-in (far trees and coarse ground) out to the fog's far edge, and unloaded beyond. Each radius has one chunk of hysteresis: a chunk is fetched a chunk early and unloaded a chunk late.
- **Chunks are built in a worker**, nearest first, and handed back without copying. At most one chunk is uploaded per frame, staged one frame ahead with a hidden material and culling off so the upload doesn't land when it's first seen. A zone's programs are compiled before its first chunk shows.
- **Neighbours load early.** When a zone becomes current, every neighbour's plan loads and its stand-ins go in place before any of it can be seen.
- Running at 3.5 m/s crosses a chunk every 11 s or so, far inside this pace.
- Interiors (the inn, the house and the mine) are part of Oakvale, not zones. They're built with it, hidden, and their meshes are staged when you come within about 40 m of the door or mouth.

### The southern pass, the seam and Brackenmoor

- **The pass opens** as a walkable corridor about 10 m either side of the road from the play area's edge (z = 84) to the crest (z = 140), bounded where the pass's walls turn steep, with rocks and pines along the edge so the limit reads. The road's steepest stretch (about 1 in 4 around z = 110 to 120) is regraded to 1 in 5.
- **The seam is the crest**, z = 140. Oakvale's heights along it are the shared border profile, and Brackenmoor's first row of chunks blends its land to that profile over 40 m, so both zones' heights agree exactly on the line.
- **Brackenmoor** is a zone like Oakvale: an open moor of bracken and heather, rust, olive and purple, with scattered grey rocks, low bushes and a few lone, wind-bent pines. It is 5 by 4 chunks, walkable within x ±60 and from the crest to z = 260. Low, rounded hills of 20 to 35 m ring it east, west and south. From the crest the land falls into a shallow basin a few metres above Oakvale's valley floor. The road runs on from the crest across the moor to a gap in the south hills, closed by a rockfall at the walkable edge. It reuses Oakvale's plant shapes and the shared material with its own vertex colours, so no new shader appears.
- **Brackenmoor's atmosphere** is a paler, cooler haze, a whiter sky and a rust-brown ground light, under the same sun.
- **The border stone** is one standing stone like those in Oakvale's circle, by the road on the crest.
- **The zone's name** floats a little above your eye line as the current zone changes and when you load in. It holds about 3 s, fades, and lags your head like the tracker.
- Nothing lives in Brackenmoor, nothing can hurt you there, and it has no respawn point. No camp's leash reaches the pass.

### Interiors

- **An interior** is a model built with its zone and hidden until needed, its ground inside its footprint (floor heights, walls, and props as colliders), its flames (the ones the light pool may sit on; the rest are glows), its atmosphere, and its entrance: a door for a building, the mouth and the adit's bend for the mine.
- **The Interiors switch** is one small state machine shared by the buildings and the mine: _outside_, _at the door_ (door open, room visible and lit by its flames, outdoor light), _inside_ (door shut behind you, or past the bend: over about 0.5 s the sun fades, the sky light drops to the interior's fill, fog closes in, the pool moves onto its flames, the outdoors is hidden, the outdoor sound is muffled) and back. Walking back towards the door or the bend brings the sun back up just before you can see out.
- **Doors** open when you're within about 2 m of them, from either side, stay open while you stand in the doorway, and shut once you're about 1.5 m past them _(spec, on Tom's behalf: distances)_. No button and no fade.
- **Buildings that open:** the inn and the house by the well (the slate-roofed house facing the crossroads, with the lantern at its door). Their outside models keep their look but gain a real doorway, with steps up to a floor at the top of the 0.3 m foundation. The interior's walls stand just inside the outer walls on the same footprint. The shared material is single-sided, so the outer walls vanish from inside. Windows are panes that glow with daylight and can't be seen through. Ground floors only.
- **The inn** ("the Golden Tankard"): one stone taproom about 10 × 7 m and 2.9 m high. A big hearth under the larger chimney, a bar along the back wall with barrels, shelves of bottles and tankards, four tables with benches, and a small fireplace under the other chimney. Its flames: the hearth, a lantern over the bar, and a lantern over each of two tables. The innkeeper stands behind the bar. The **village respawn point** is at the hearth.
- **The house**: one room about 6 × 5 m, open to the rafters. A hearth with a hanging pot in the back corner under the chimney, a bed, a table with two chairs and a candle, a chest, a shelf of crocks, a rug and a broom. Its flames: the hearth and the candle. Nobody is home.
- **The smithy** becomes walk-in under its roof, with no switch, since it's open-fronted and lit by the sun. Its solid footprint becomes colliders for the back wall, the low side wall, the forge, the anvil, a barrel and the grindstone.
- Nothing indoors can be picked up, sat on or used. No enemy ever goes indoors.
- **Budget:** each interior is a few thousand triangles and one draw call, plus its glows.

### The mine

- **The route**, one line with no forks, about 100 m from the mouth to the Warden's hall and about 7 m down over two ramps of about 1 in 5. It runs north from the mouth under the ridge. Tunnels are about 3.5 m wide and 3 m high. In order:
  1. **The adit**: timbered, about 10 m straight in with the rails, then a bend.
  2. **The cart hall** (level with the mouth): about 12 × 10 m on timber props. The rails end at a turntable with two ore carts, a winch stands over a boarded-up shaft, and the bandits' camp lies about (bedrolls, crates, their brazier).
  3. **The gallery**: about 16 × 7 m and 6 m high, where the old miners followed the vein, with timber scaffolding against one wall (scenery, not climbable).
  4. **The bandits' ramp**: their rougher, sparsely timbered tunnel, winding down about 4 m.
  5. **The dig**: a rough cave about 12 × 10 m, the silver vein glinting in the rock, the bandits' dropped gear (picks, a strongbox of ore, a lantern on its side, a torn cloak). No bodies.
  6. **The breach**: a hole through dressed stone in the dig's far wall, onto a carved passage sloping down about 3 m to the **antechamber**, about 8 m square, with the hall's gate in its far wall.
  7. **The Warden's hall**: today's crypt hall, 14 m square and 4 m high, the throne on the north wall, four torch-lit pillars and the corner braziers. You come in by its south gate. The east and west gates are choked with fallen stone.
- **Props** stand flush with a wall, or a body's width clear of walls and each other, as in the crypt hall, so nobody can be knocked into a pocket. Nothing can be picked up or used, and the carts don't move.
- **In or out goes by the mouth, not by position.** The adit's first metres run under ground you can stand on, so the World tracks that you walked in through the mouth, and your ground and walls come from the mine from then on. Oakvale's terrain leaves out its ground where the tunnel cuts into the hillside.
- **The switch runs past the adit's bend.** From outside only the adit shows. Inside, only the part you're in and its neighbours are drawn.
- **Light:** the pool sits on the 4 nearest flames and fades as it swaps. The flames: lanterns on the timber props about every 8 m in the old mine, the brazier in the cart hall, a few bandit lanterns down the ramp, the fallen lantern in the dig, two braziers in the antechamber, and the hall's four pillar torches. The deep workings have the fewest. Everywhere inside, the ambient light is the crypt hall's cool fill, and fog closes in at about 6 to 18 m.
- **For the camps** the mine gives two things: its route's centre line (a line from the mouth to the hall's gate through every chamber) and a sight test through rock.
- **The mine's respawn point** is on the rail bed a few metres outside the mouth, facing it.
- **Budget:** each part is a few thousand triangles, merged to 6 to 8 draw calls in all. Hiding the outdoors past the bend takes the mine front's view (about 54k triangles per eye) off the frame.

### The Adventure

- **The Adventure owns and steps** the World, the player, combat, the camps, the Warden, the friendly characters, the adventure state, the UI, the sound mix and saving: one `update(dt)` per XR frame, as the wave game does today.
- It hands enemies an `EnemyContext` whose ground is the World. There is **one melee pool of 3 and one ranged pool of 2** for the player across every camp. While the Warden is up the melee pool is 2, the arena's, since its fight was tuned with two _(spec, on Tom's behalf)_.
- It wires combat's kills to the camps and the adventure state, and floats the XP. It turns a death into the fade and respawn, a hand-in into the reward, and every effect the adventure state returns into floats, sounds, tracker flashes and saves.
- It keeps the page's debug handle: the adventure state, the World, a teleport, a way to step the game by a fixed time without XR frames (as the camp prototype's checks did), and the emulator's device.

### The adventure state

A new deep module holds the rules of progress, with no three.js in it. The Adventure feeds it events and reads its answers; the save stores its snapshot. It's the main thing the tests drive.

- **Events in:** accept the offered quest; hand in; an enemy killed (its camp, its level and its role: ordinary, leader, deep brute, the Warden, or raised by the Warden); the orders picked up. Each event returns its **effects**: XP gained, levels reached with what they unlock, a quest's change, the sword changed. Snapshot and restore go to and from the save record.
- **Answers out:** level, XP and XP to the next level; maximum health and the damage multiplier; which sword you carry; which abilities are unlocked; what Hale shows (the marker, the board's lines and buttons); the tracker (title, objectives with counts, or "Return to Marshal Hale"); the quest arrow's target (a place, Hale, or nothing); each villager's bark line; whether the Warden sits on its throne; whether the orders lie in the tent; whether Hale's sword hangs at their hip.
- **Quest states:** _locked_, _offered_ (a gold "!"), _active_ (a grey "?", with counts), _ready_ (a gold "?", every objective done) and _handed in_. Only one quest is active at a time. None can be dropped or repeated. After the chain Hale shows no marker.
- **The quest chain** is data:

  | Quest | Place | Objectives | Pays |
  |---|---|---|---|
  | Raiders in the Fields | the farm | Defeat 3 of the farm's camp | 80 XP |
  | The Lumber Camp | the lumber camp | Defeat the 5 of the lumber camp's camp (the patrol is its own camp and doesn't count); take the leader's orders from the tent. Either order. | 120 XP |
  | What Lies Below | the old mine | Defeat the Warden | 300 XP and Hale's old longsword |

- **Kill credit:** a kill counts only for the active quest, and only if the enemy belongs to that quest's camp. A pickup counts only while its quest is active; the orders stay in the tent until then, and once picked up they're gone for good.
- **Numbers** _(the formulas are the spec's reading of the tickets' numbers)_:
  - Your maximum health is 100 + 20 per level above 1.
  - Your damage is multiplied by 1 + 0.2 per level above 1, plus 0.2 more with Hale's longsword (it is "worth one level"). The War Cry's frenzy multiplies on top, as today.
  - An enemy's health and damage are today's numbers times 1 + 0.2 per level above 1, and camp enemies take a further 1.4 times. The Warden and the skeletons it raises are not in a camp.
  - The Warden's level-1 health is 600, so 1,080 at level 5.
  - A kill pays 10 XP per enemy level; triple for the bandit leader, the mine's two brutes and the Warden; nothing for the skeletons the Warden raises.
  - The levels come at 100, 300, 600 and 1,000 XP in all. XP stops at 1,000, the level cap.
  - The plain route: about 110 to 120 XP at the first hand-in (level 2), 370 to 420 at the second (level 3), 640 to 690 at the dig's brute (level 4), 910 to 960 after the Warden, and level 5 with the sword at the last hand-in.
- **Unlocks:** the War Cry at level 2, with rage and its orb from then on; the ground slam (Earthshaker) at level 3. Levels 4 and 5 bring only health and damage.

### Hale's board and the villagers' barks

The lines are placeholders _(spec, on Tom's behalf)_.

| When | Hale says | Buttons |
|---|---|---|
| Raiders in the Fields offered | "Bandits in red masks are raiding the farm east of the village. The farmer barely got out. Drive them off. Three of them down should send the rest a message." | Accept, Not now |
| Raiders in the Fields active | "The farm's east along the road. Three of those bandits, then come back to me." | Goodbye |
| Raiders in the Fields ready | "The farm's quieter already. Well done." | Hand in |
| The Lumber Camp offered | "The same gang holds the lumber camp across the bridge. Clear them out, and bring me whatever their leader keeps in that tent." | Accept, Not now |
| The Lumber Camp active | "The lumber camp is west off the north road, past the bridge. Mind their leader." | Goodbye |
| The Lumber Camp ready | "Orders... they're digging for silver in the old mine. Fools. That hill was left alone for a reason." | Hand in |
| What Lies Below offered | "Something stirs under that hill. The dead are walking in the old mine. Go down, find what woke them, and put it back to rest." | Accept, Not now |
| What Lies Below active | "The mine's at the end of the north road. Whatever's down there, end it." | Goodbye |
| What Lies Below ready | "So it's done. Take my old sword. It served me well; it'll serve you better." | Hand in |
| The chain done | "Oakvale's safe, thanks to you. There's more of the world south through the pass: Brackenmoor, and the roads beyond it." | Goodbye |

| Villager | Until | Barks | After |
|---|---|---|---|
| The farmer, by the well | Raiders in the Fields is handed in | "Those red-masked thieves took my farm. The marshal's the one to see." | "You ran them off my fields! I'll be home by harvest." |
| The smith, at the anvil | The Lumber Camp is handed in | "Bandits in the lumber camp, and not a plank to be had. Mind their leader's axe." | "Timber's coming down the road again. Good work at the camp." |
| The innkeeper, behind the bar | What Lies Below starts | "Welcome to the Golden Tankard. Sit by the fire a while." | While it's active: "The old mine? Folk say there's a tomb under that hill. Come back in one piece." Once the Warden is beaten: "They say you put the dead back to rest. Your ale's on the house." |

### Camps

The camp brain comes from the `?camp` prototype (in history at merge `1135338`), rule A with round two's spread-out camp and "Both". It drives enemies through the hooks kept in `main`: an enemy's `post` to wait at and walk home to, `standDown`, and `chaseSpeed`.

- **A camp** is a place, a level, its posts (each a behaviour, a family, a spot and a facing) or a patrol's road, and its members. Each member's mind is idle, fighting, walking home or dead. From the prototype, trimmed to the rule Tom picked:

  ```ts
  type Mind = 'idle' | 'fight' | 'home' | 'dead';
  notices: (m, s) => flat(m.enemy.position, s.player) < 8,           // or it was hurt
  joins:   (from, other) => flat(from.enemy.position, other.enemy.position) < 10,
  givesUp: (m) => flat(m.enemy.position, m.post) > 30,
  ```

- **Pulling:** an idle member fights when you come within 8 m or hurt it, and brings every idle member of its own camp within 10 m of it. In the mine, noticing and bringing others both need a clear line through rock.
- **Chasing:** a fighting enemy runs at 2.2 m/s (your walk) when it's more than a few metres off.
- **The leash:** at 30 m from its post it gives up and walks home untouchable, then heals to full on arrival. A hit on it meanwhile does nothing and floats "Evade" _(spec, on Tom's behalf)_. In the mine, the mouth ends every leash: the undead never leave. When you die, everyone fighting you walks home the same way.
- **Refill:** once every member is dead, 3 minutes after the last falls, the camp refills whole, but only while you're at least 30 m from it (from its clearing, or for the patrol its road). The mine's camp refills only once you've also left the mine.
- **The patrol** walks its road in single file (0.8 m/s, 1.8 m apart) and pauses 3 s at each end. A jumped patrol measures its leash from where it was jumped.
- **In the mine**, an undead that can't see you follows the route's centre line towards you and walks home the same way. One that can see you walks straight at you and steers as it does outdoors. No navmesh anywhere.
- **The camp reports** each kill with its camp, which the adventure state needs for kill credit, and whether anything is fighting you, which the run and the ambience dip need.
- **Oakvale's camps** (posts spread 5 to 18 m apart):
  - The farm: 4 thugs in two pairs, level 1.
  - The lumber camp: 3 thugs, an archer and the leader, level 2. A thug where the camp road comes in, one at the fire, one at the log pile, the archer to the south, the leader before the tent.
  - The lumber camp's patrol: 2 thugs on the camp road between the camp and the main road, level 2.
  - The watchtower: 2 thugs and an archer, level 2.
  - The mine (one camp): 2 grunts and an archer in the cart hall and a grunt and an archer at the gallery's far end (level 3); a brute in the dig and another before the hall's gate (level 4).

### Enemies

- **Making an enemy** takes its family, behaviour, level and whether it's in a camp, and builds its body and its tuned numbers. Behaviours are unchanged: no new ones.
- **Bandits** wear the human body. The thug has the grunt behaviour, with a short iron sword or a hatchet. The archer has the archer behaviour and today's bow. The leader has the brute behaviour, with a felling axe in place of the maul. The brute's reach (1.65 m attack range, 0.5 m body radius) was set for the undead brute's bigger body, so the leader's slash and slam are checked against a simulated player and retuned if they fall short.
- **The undead** are today's skeletons as they are.
- **The Warden** in the mine is _absent_ (an empty throne) before What Lies Below and once beaten; _seated_, slumped on the throne, while the quest is active; _fighting_ from the moment you step through the hall's gate; and _resetting_ when you die or leave through the gate (it walks back to the throne at full health, and the skeletons it raised crumble). It never leaves the hall. When it falls its raised skeletons crumble, and the adventure state records it beaten, which the save keeps. Its raised skeletons are level 5, pay nothing, and take no camp multiplier. Its summons land round you as today.
- Enemies keep today's health bars. No names or levels show over heads, and the only drops are healing orbs.

### People: one human body

- **The human body** comes from the people prototype (in history at commit `c987194`). One body on today's 14-bone rig, rigidly skinned, one draw call, the shared material and grain. It stands about 1.78 m and comes in four builds: average (Hale, the thugs, the archer, the farmer), stout (the innkeeper), broad (the smith) and big (the leader, about 1.97 m). It has a face (eyes with whites, brows, a nose, a mouth, ears), with the chin on the jaw bone. Hair, beards and clothes are parts laid over it. A character costs 630 to 900 triangles. Every enemy animation plays on it unchanged.
- **The looks**:
  - Hale: bareheaded, cropped grey hair, clean-shaven; a mail shirt under a blue tabard with a gold mark front and back, steel pauldrons, leather gloves and bracers, a belt with a gold buckle, dark trousers and boots; their old longsword sheathed at the left hip with the left hand on its pommel.
  - Bandits: a red kerchief over the nose and mouth, knotted behind, and a red sash. Thugs in a leather jerkin over a linen shirt, varied like grunts. The archer in the green hood and cowl, with a quiver and bracers. The leader bald with a black beard, a long red coat over a dark red shirt, a shaggy fur mantle and a heavy belt with a gold buckle.
  - The innkeeper: stout, bald, a brown moustache, rolled sleeves, a russet waistcoat, a long white apron, a tankard in hand. The smith: broad, cropped dark hair and a short beard, a sleeveless dark shirt, a leather bib apron, thick gloves and a hammer. The farmer: a straw hat, a linen shirt with braces, ochre trousers and a pitchfork.
  - Colours say who's who: blue and gold are Hale's alone, red on the face and at the waist marks a bandit, a green hood an archer of either family, bone the undead, and villagers wear undyed linen, browns and ochre.
- The model inspector gains every human character.

### Friendly characters

- **Marshal Hale** stands at the crossroads' south-east corner, at the edge of the main road just west of the signpost, facing north, towards the crossroads' centre. A new character starts about 3.5 m from Hale on the road, facing them. Hale turns to face you and waves as you walk up, and the marker floats about half a metre over their head. Their sword leaves their hip at the last hand-in _(spec, on Tom's behalf: the spot is the `?talk` prototype's)_.
- **The villagers** stay at their spots: the innkeeper behind the inn's bar, the smith at the anvil, the farmer by the well. Each plays a working loop: the smith strikes in bursts of a few blows (each ringing in time), turns the piece and pumps the bellows now and then; the innkeeper wipes the bar and polishes a tankard, sets it down and picks up another; the farmer leans on the pitchfork, looks off towards the farm and shifts their weight. Each turns their head to follow you within 4 m and goes back to work when you leave.
- **Barks** show as text on a small panel over the villager's head when you come within 4 m, facing you, for about 4 s. They won't show again until you've been 10 m away. At most two show at once. Hale doesn't bark.
- Friendly characters are solid: you can't walk through them.

### Talking and tracking (a plain first pass)

Tom plans a complete overhaul of this UI after Oakvale is built, so it's built plainly, close to the prototypes.

- **The talk board** is prototype A's (in history at merge `19ce545`): within about 2.3 m and roughly facing Hale, a parchment board unfolds beside them on your right, turned to you, with Hale's name, their line and chunky buttons. Either fist or the sword's tip presses, and that hand buzzes. A hand or blade already inside a button when it appears must leave before it can press. The board folds when the talk ends or you're about 3.6 m off, and stays shut until you've walked away and come back.
- **The tracker** is prototype C's: top left of your view, lagging your head, the title in gold and one line per objective with its count, or "Return to Marshal Hale". It flashes when you take a quest, make progress or finish, and it's gone while you have no quest. The objective lines:
  - "Bandits defeated at the farm: n/3"
  - "Bandits defeated at the lumber camp: n/5" and "Leader's orders taken: n/1"
  - "What woke the dead defeated: n/1"
- **The quest arrow** is a small gold arrow at the left of the objective you're working on (the first one not yet done), pointing its way as the crow flies, turning as you turn: up is straight ahead. It shows no distance. It points at the farm, the lumber camp or the old mine's mouth, and at Hale for "Return to Marshal Hale". It hides inside the place's clearing (for the mine, from the mine front on), within 10 m of Hale, indoors and in the mine, and comes back when you step out.
- **Floating text:** "+N XP" in gold where an enemy fell; "LEVEL N" with a sound and a line naming each unlock ("War Cry: press A or X", "Earthshaker: drive your sword's tip into the ground"); a hand-in's reward over Hale with a fanfare; "Evade"; and the zone's name.
- **The belt** in the Adventure shows the level number and a thin XP bar between the health and rage orbs, in place of the wave and the enemies left. The rage orb and each ability's pips appear once unlocked. The dash cooldown stays. The arena's belt is unchanged.
- **The orders** are a rolled parchment on a crate in the leader's tent. Touching them with either hand (as you touch an orb) picks them up while The Lumber Camp is active, with a buzz in that hand.

### The player

- **Level-based numbers** (maximum health, damage multiplier, unlocks) come from the adventure state. In the arena everything is unlocked at level 1, as today.
- **Rage** builds only once the War Cry is unlocked. The War Cry needs level 2 and Earthshaker needs level 3; before that, their inputs do nothing.
- **Healing:** after 5 s without taking or dealing damage, health refills to full over about 10 s (the Adventure only; the arena stays as it is). An orb heals a quarter of your maximum health. A level-up fills it.
- **Death:** the view fades to black, you're moved to the respawn point with full health and no rage, and the view fades back in.
- **Hale's longsword** swaps the sword's model in your hand at the last hand-in: a darker blade and a gilded guard, with the same length, weight and handling.
- **The run** is a pure rule, tested on its own: a left-stick click latches it; you move at 3.5 m/s while it's latched, the stick is pushed, it points within about 45° of ahead, and nothing is fighting you; otherwise you walk. Letting go of the stick unlatches it. A click while anything is fighting you does nothing, and a fight starting unlatches it and buzzes the left controller once. Enemies walking home don't count as fighting. Running isn't saved. The Adventure only.
- **The run's vignette** is a ring over the edges of the view only, one draw call while it shows, fading over about 0.2 s, with its strength one tunable (0 turns it off). Today's hurt and dash vignette is a whole sphere around the head, so the ring is new rather than a reuse.

### Sound

- **Every sound is played by one name**, so any one can later become a recording without touching where it plays. All stay synthesised, with no audio files. No music; the existing stings stay.
- **Each zone has an ambience** that isn't placed in space: Oakvale's light wind and birdsong (a few different calls, each now and then from a spot 10 to 30 m away in the trees, fewer where the plan has few trees), Brackenmoor's stronger, lower wind and a lone call now and then, and the mine's hollow air, drips and creaking timbers. The crypt part of the mine plays today's drone, which leaves the outdoors; the arena keeps it.
- **Places' sounds** are placed where they are: the stream under the bridge, water at the pond's dock, the windmill's creak, the smith's hammer (struck by the smith's animation) and the forge's roar, the inn's hearth, the lumber camp's fire, and a cold draught and drips at the mine's mouth. A place's sound stops beyond about 40 m. At most 8 ambient sounds (places' sounds and bird calls) play at once, nearest first. The nearest 3 places' sounds use HRTF as combat's sounds do _(spec, on Tom's behalf: the ticket said "the nearest few")_; farther ones and the birds pan cheaply.
- **The mix follows the light's cues:** behind a shut door the outdoors is muffled and quiet and the room's fires come up, over the same half-second; past the adit's bend the outdoor ambience fades out and the mine's comes in; at the breach the drone rises; across the 40 m either side of the seam the zones' ambiences crossfade by position; and while anything fights you the ambience dips a little.

### The rest of Oakvale

- **Smoke:** one instanced mesh of soft puffs for every plume at once (about 60 quads), thin to keep overdraw down: the inn's two chimneys, the two houses that have one (shut or not), the smithy's forge and the lumber camp's fire. Not the farmhouse.
- **Signposts:** the crossroads signpost's boards are painted "Old Mine" and "Lumber Camp" (north, a fifth board under the first), "Farm" (east), "Pond" (west) and "Brackenmoor" (south). A second, smaller signpost stands north of the bridge between where the watchtower and lumber camp roads leave the main road: "Old Mine" north, "Lumber Camp" west, "Watchtower" east, "Village" south. Each signpost's names are one texture, one draw call. Nothing on them follows the quest.
- **The map board** stands on the other side of the signpost from Hale, about 2.5 m east of the signpost on the south side of the farm road, facing west across the crossroads, so it never overlaps Hale's board _(spec, on Tom's behalf)_. It's about 1.2 × 0.9 m on two posts with its top a little below eye height, painted once from the zone's plan: roads, the stream and the pond, the village's buildings, the farm, the lumber camp, the watchtower on its hill, the standing stones and the old mine, each named, "To Brackenmoor" at the pass, and a red "You are here" at the crossroads. Under 100 triangles and two draw calls.
- Every new structure stays off the roads.

### Saving

- **A store with two adapters.** In the browser, IndexedDB: one database named `descent-vr` (every storage name starts with `descent-vr`, since all of Tom's Pages sites share one origin), one store, one record, each write in its own transaction with `durability: 'strict'`. In tests, and wherever IndexedDB fails to open, an in-memory store, with a note on the page that progress won't be kept. `navigator.storage.persist()` is called once; its answer is logged and nothing depends on it.
- **The record, version 1:** the version; when it was saved; level and XP; the sword (the starting sword or Hale's); each quest's state with its counts and whether the orders were taken; whether the Warden is beaten; your position in world metres and your facing; and which interior you're in, if any (none, the inn, the house or the mine). Knowing the interior is what lets a save inside the mine load inside it, since the adit runs under ground you can stand on _(spec, on Tom's behalf)_.
- **Older records upgrade** through ordered migrations keyed on the version.
- **When it writes:** on each quest change (taking one, a count going up, one becoming ready, a hand-in), each level-up, a new sword, each change of current zone, every 30 s, when the page is hidden, and when the VR session ends. One write is in flight at a time and the latest state wins.
- **Not saved:** health, rage, the camps, the run, the talk board. You always load with full health, no rage and every camp full.

### Performance and the triangle budget

The map's last fog, the triangle budget, is carried here, since its measurement needs the headset.

- **The budget:** 72 fps, about 300 draw calls, at most 4 point lights, and a rule of thumb of 250k to 300k triangles over both eyes. Oakvale seen from the village is already at that before anyone is added.
- **Where the costs are:** a human is 630 to 900 triangles, a skeleton grunt about 1,050 and the Warden 1,300, each one draw call per eye. The four friendly characters add about 2,800 triangles, of which about 2,100 are in view from the crossroads. Smoke is one draw call and about 120 triangles; a bark is one draw call while it shows. The quest arrow, the run's vignette, the map board and the signposts' names come to a handful of draw calls and a few hundred triangles. Interiors and the mine cost little, and hiding the outdoors while you're inside them takes the zone off the frame.
- **The new view to measure** is the crest of the pass looking north over Oakvale with both zones loaded. The streamer's stand-ins beyond 120 m are what keep it in budget.
- **If the headset shows too many triangles**, the cuts come in this order _(spec, on Tom's behalf)_: bring the full-detail radius in from 120 m to 100 m; then use the far tree set in more of the stand-ins; then thin the trees in chunks outside the play area. The byte diet from the research (dropping the unused normal attribute, 8-bit colours) is for memory and upload time, applied only if those measure too high.
- **`?perf`** shows frame rate, draw calls, triangles, loaded chunks by detail, bytes uploaded this frame, and `renderer.info.programs.length`. Shader error checks are off in production builds.

## Testing Decisions

- **A good test drives a module through its interface and checks what a player would notice**: a quest's counts, the XP and level, where you wake, whether an enemy is fighting you or walking home, how high the ground is at a spot, which chunks are loaded where you stand. It never reads private fields, so it survives a rewrite of the inside. Anything random is seeded. Tests run in Vitest with no browser, no WebGL and no XR, as today.
- **The seams** _(the skill's check with the user, taken on Tom's behalf)_: one new seam and two existing ones, plus the save's port.
  1. **The adventure state** (new, the main one): pure events in, answers and effects out. Most stories are tested here.
  2. **`Ground`** (existing), now implemented by the World: positions in, heights, collisions, sight lines and steering out.
  3. **`EnemyContext`** (existing), for camps: real enemies against a simulated player, as the crowd and attack tests already do.
  4. **The save store's port**, with the IndexedDB adapter and the in-memory one: two adapters, so a real seam.
- **The adventure state:**
  - The whole chain on the plain route: level 2 at the first hand-in, 3 at the second, 4 at the dig's brute, 5 and the sword at the last hand-in, with the XP totals above.
  - Kill credit: only the quest's own camp, only while active; the patrol doesn't count for The Lumber Camp; the orders only while active; both objectives in either order.
  - No abandoning or repeating; one quest active at a time; the markers for every state; the tracker's lines and the arrow's target for every state; the barks for every stage; Hale's sword and the orders' presence.
  - Numbers: health and damage per level, the sword's step, enemies' numbers per level and in camps, the Warden's 600, kills' XP by role, the cap dropping XP, unlocks at 2 and 3.
  - Snapshot and restore give back the same answers.
- **Saving:** every older record version migrates to the current one; a save round-trips through the in-memory store; the save controller writes on each trigger and every 30 s, given a fake clock, and never has two writes in flight. The IndexedDB adapter itself is checked in the headless emulator.
- **The World as `Ground`:** the zones' heights agree along the seam; the pass corridor is walkable from the play area to Brackenmoor, and its edges stop you; inside a building's footprint the floor and walls are the interior's; the mine's ground applies only once you've come in by the mouth; the current zone changes 2 m past the line and not before, both ways; the atmosphere blends by position across the band; chunk builds are deterministic.
- **No pockets:** the arena's flood-fill test (every spot a body can stand on is reachable) runs over each interior and every part of the mine, for every body radius.
- **The streamer's decisions** at sample positions: at the crest, at z = 200 and at z = 260 (where no Oakvale chunk is full and most are unloaded), and on the way back; neighbours' stand-ins are in place before any of them is within the draw distance.
- **Camps**, with real enemies on a test ground and a simulated player walking about: noticing at 8 m or when hurt; pulling within 10 m of its own camp only; the chase speed; giving up at 30 m, walking home untouchable ("Evade") and healing on arrival; everyone going home when you die; refilling only when cleared, after 3 minutes, and 30 m away; the patrol walking and pausing; one token pool across camps (three swing, two shoot); in the mine, no noticing through rock, following the centre line round a hairpin and a switchback (the tunnel-steering check becomes a test), and stopping at the mouth.
- **Enemies:** the leader's slash and slam reach a simulated player on the human body; the Warden's seated, fighting, resetting and beaten states; its raised skeletons crumbling.
- **The human body:** every enemy animation poses on it; each character's triangles stay under 900.
- **Oakvale's plan:** the start spot is clear, on the road and facing Hale; both respawn points are clear; the map board and the second signpost stay off the roads, as the buildings do; the camps' posts stand on clear ground, 5 to 18 m apart; the places' clearings hold their camps.
- **The run's rule:** speed from the stick's direction, the latch, and never while fighting.
- **Not unit-tested:** how things look, sound, the panels' layout, the GPU staging, and the IndexedDB adapter. These are checked in headless Chromium with the IWER emulator, stepping the game through the debug handle, and by Tom on the Quest.
- **Prior art:** the forest layout tests (a pure plan checked at positions), the arena's pocket flood fill, the crowd tests (tokens and a crowd of real grunts), the enemy attack tests (real enemies through every attack against a simulated player), the inspector's clip tests (poses), the map viewer's tests (a stub zone), the brute stagger tests, and the mine ticket's tunnel-steering check script.

## Out of Scope

- Online play: servers, accounts and netcode. It's the long-term vision, and a separate effort.
- Voiced dialogue, crowd chatter and music. Recordings of any kind.
- Four-legged creatures (wolves, boars, deer), mounts, and flying birds or other small animals.
- Flight paths, a map you carry, a minimap, a compass, beams or marks over places in the world, a teleport or a way home to the inn, and speed-ups on the roads.
- New enemy behaviours, a third family, and names or levels over enemies' heads.
- Loot beyond the one quest sword and healing orbs: no inventory, no equipping, no coins.
- More quests, more quest givers, side quests, repeatable quests, abandoning a quest.
- A menu, a "start over" button (`?newgame` does it), more than one character or save, and saves shared between devices.
- Upper floors, stairs, climbing the watchtower or the gallery's scaffolding, and entering the other houses, the farmhouse or the barn.
- Anything indoors or in the mine you can pick up, sit on, ride or use.
- A day and night cycle.
- Guards, children, or villagers who walk rounds.
- A navmesh.
- Fleshing out Brackenmoor with quests, enemies or landmarks, and joining zones through the stream's valleys.
- Changing how combat feels. Tweaks come later.
- The complete overhaul of talking and quest tracking Tom plans for after Oakvale. This spec builds only the plain first pass.

## Further Notes

- **Calls made in this spec on Tom's behalf**, beyond what the tickets settled:
  - The testing seams above.
  - The formulas behind the tickets' numbers: health and damage steps add rather than compound (the tickets' 1,100 Warden at level 5 and "60% harder" at level 4 only fit that), and Hale's longsword adds one level's step.
  - While the Warden is up, two may swing at you, not three: its fight was tuned in the arena with two, and the ticket says it "keeps its numbers". Its raised skeletons take no camp multiplier, for the same reason.
  - An enemy walking home floats "Evade" when hit, as WoW does, so a blow that does nothing doesn't feel like a bug.
  - The save records which interior you're in, so a save inside the mine loads inside it.
  - Where IndexedDB won't open, the game plays unsaved and says so on the page.
  - `?newgame` confirms with a page dialog before VR.
  - The page before VR shows Oakvale turning behind the intro.
  - Rage builds only from level 2, when its orb appears.
  - Regeneration is the Adventure's; the arena stays as tuned.
  - Hale's spot and facing (the `?talk` prototype's), the start 3.5 m from them, the map board east of the signpost facing west, and the second signpost between the two forks.
  - The door distances (open within about 2 m, shut about 1.5 m past).
  - Friendly characters are solid.
  - Every line Hale and the villagers say, and the tracker's objective lines.
  - The order of cuts if the triangle budget is over.
  - Oakvale keeps its id, `forest`, and Brackenmoor's is `brackenmoor`.
- **Known edge:** a kill before its quest is taken doesn't count, so a player who clears the lumber camp before taking The Lumber Camp must wait for the camp to refill. Refilling guarantees the quest can always be finished; it was settled in The quest chain and is kept.
- **Prototypes in history**, as starting points for the build: talking and tracking (`?talk`, merge `19ce545`), the camp brain and a zone's ground (`?camp`, merge `1135338`; round one's other ways at `7195835`), and the human body with every character (commit `c987194`). The mine ticket's tunnel-steering check is in `checks/` next to this spec.
- **For Tom, on the headset**, whenever he next plays (the build doesn't wait on these):
  - Save: whether `navigator.storage.persist()` returns true, and whether a save survives quitting straight after a hand-in.
  - Streaming (the research's list): how long a plan and a chunk take to build; how many bytes a frame can upload with no stale frames; whether crossing the seam 10 times leaves `renderer.info.programs.length` unchanged, stale frames at 0 and memory at its baseline; whether the swap to stand-ins shows at 120 m; whether the staging frame uploads without drawing.
  - The budget: triangles and frame time from the village and from the crest looking north, and the audio's CPU cost with 8 sounds playing.
  - Feel: the run's speed and vignette, the leader's reach, the camps at their levels, the Warden at level 5, and the talk board's distances.
- **For `/to-tickets`:** most of this rests on the World (lights, sky and fog at world level, `Ground` across zones) and on the Adventure replacing the wave game at the plain URL with the arena moved to `?arena`, so those come first. The adventure state and saving can then go end to end with Hale and the farm's camp (bandits can stand in as skeletons until the human body lands), before the lumber camp, the interiors, the mine, the streamer with Brackenmoor, the living zone and getting around. The camp prototype's lumber camp and the talk prototype's Hale are the quickest tracer bullets.
