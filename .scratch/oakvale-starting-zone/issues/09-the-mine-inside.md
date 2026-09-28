# The mine inside

Type: grilling
Status: resolved
Blocked by: 02, 04

## Question

What is inside the old mine?

- Its size and layout: a tunnel and a few chambers, and how deep it goes.
- Which enemies are in it and where. The quest chain ends here (see The quest chain): the bandits dug too deep and woke the dead, and you fight down to whatever woke them. So: where the bandits' digging meets the undead, and what the final room is like.
- How it is lit within the 4-light budget.
- How it joins the outdoors: part of Oakvale's scene, or streamed in at the mouth like a small zone.

## Answer

Settled over three rounds on 2026-09-28 **by Claude on Tom's behalf**: Tom asked for the rest of the map to be settled without him, so every recommendation below was taken without his answer. The rounds and the reasons are under Comments, for him to revisit. The numbers are starting points, to tune on the headset.

- **One route down, no forks.** The mine is a single winding route of tunnels with its chambers strung along it, about 100 m from the mouth to the Warden's hall and about 7 m down, over two ramps of about 1 in 5. No stairs, ladders or drops. Walking it end to end takes about 45 s without a fight. It runs north from the mouth under the ridge and the mountains behind it, beyond the zone's walkable edge.
- **The story is in the walls:** the old mine near the mouth, the bandits' new digging below it, and an ancient crypt where their digging broke through. In order:
  1. **The adit:** the timbered tunnel from the mouth, about 10 m straight in with the rails, then a bend. Tunnels are about 3.5 m wide and 3 m high.
  2. **The cart hall** (level with the mouth): about 12 × 10 m, its roof on timber props. The rails end at a turntable with two ore carts, a winch stands over a boarded-up shaft, and the bandits camped here (bedrolls, crates, their brazier).
  3. **The gallery:** a long, tall working about 16 × 7 m and 6 m high where the old miners followed the vein, with timber scaffolding against one wall (scenery, not climbable).
  4. **The bandits' ramp:** their own rougher tunnel, sparsely timbered, winding down about 4 m.
  5. **The dig:** a rough cave about 12 × 10 m where the silver vein glints in the rock and the bandits' gear lies where they dropped it: picks, a strongbox of ore, a lantern on its side, a torn cloak. No bodies.
  6. **The breach:** in the dig's far wall the bandits broke through dressed stone. The hole opens on a carved passage sloping down about 3 m to a small **antechamber**, about 8 m square, with the hall's gate in its far wall.
  7. **The Warden's hall:** today's crypt hall from the arena, as it is: 14 m square and 4 m high, the throne on the north wall, four torch-lit pillars and the corner braziers. You come in by its south gate; the east and west gates are choked with fallen stone.
- **The undead, 7 and the Warden** (starting counts):
  - The cart hall: 2 grunts and an archer, level 3.
  - The gallery: a grunt and an archer at its far end, level 3.
  - The dig: a brute among the bandits' gear, level 4.
  - The antechamber: a brute guarding the gate, level 4.
  - The Warden's hall: while What Lies Below is active, the Warden sits slumped on the throne and rises as you step through the gate. Before that, and once it is beaten, the throne is empty.
- **XP lands where Progression, death and saving wanted it.** The plain route arrives with about 370 to 420 XP (all five at the lumber camp, the leader included, and maybe the road patrol). The upper chambers pay 150, which puts you at 520 to 570. The dig's brute takes you to level 4 (640 to 690), the antechamber's brute to 760 to 810, and the Warden to 910 to 960, short of level 5. The hand-in's 300 makes level 5 together with the sword. Someone who also cleared the watchtower reaches level 4 in the gallery and level 5 as the Warden falls.
- **Fighting in tunnels:**
  - Rock blocks noticing and calling: an undead notices you at 8 m and brings anyone within 10 m only along a clear line, so each chamber is pulled on its own. Outdoors nothing changes.
  - An undead that can't see you follows the mine's route along its centre line towards you, and walks home the same way. One that can see you walks straight at you and steers round props as it does outdoors. Every chamber sits on the route, so no corner is off it. No navmesh.
  - Props stand flush with a wall or a body-width clear of walls and each other, as in the crypt hall, so nobody can be knocked into a pocket and stay there.
  - The 30 m leash from each post stays, but **the undead never leave the mine**: the mouth ends every leash.
  - Walls and ceilings stop arrows.
- **The Warden never leaves its hall.** Going back out through its gate counts as fleeing: it walks back to the throne and resets to full health, and the skeletons it raised crumble. Dying resets it the same way.
- **Refilling:** the mine's 7 undead are one camp. It refills 3 minutes after the last of them falls, and only once you've left the mine and are at least 30 m from its mouth. A cleared mine stays clear while you go back for the Warden after a death.
- **Light:** the pool of 4 point lights moves onto the 4 nearest flames and fades as it swaps. Every other flame is a glow. The flames are lanterns on the timber props about every 8 m in the old mine, the bandits' brazier in the cart hall, a few bandit lanterns down the ramp, the fallen lantern in the dig, two braziers in the antechamber, and the hall's four pillar torches as today. The deep workings are the darkest part. The ambient light everywhere inside is the crypt hall's own cool fill, so an enemy's swing reads anywhere, and fog closes in at about 6 to 18 m.
- **Part of Oakvale, not a zone of its own:** there is no seam at the mouth. The mine is built with Oakvale and loaded as one cell keyed to its mouth, per the research on joining zones: its meshes upload as you come within about 40 m, and from outside only the adit shows. Past the adit's bend, the switch from Interiors runs: over about half a second the sun fades, the sky light drops to the crypt hall's fill, fog closes in, the pool moves onto the mine's flames and the outdoors is hidden. Walking back towards the bend brings the sun back before you can see out. Inside, only the part you're in and its neighbours are drawn.
- **In or out goes by the mouth, not by position:** the adit's first metres run under the ridge you can stand on, so you're inside once you've walked in through the mouth, and ground and walls then come from the mine.
- **The respawn point** is on the rail bed a few metres outside the mouth, facing it. A save made inside loads you inside where you stood, with the mine's light on and every camp full, as anywhere else.
- **Scenery only:** nothing in the mine can be picked up or used, and the carts don't move.
- **Budget:** each part of the mine is a few thousand triangles, merged to 6 to 8 draw calls, with only the current part and its neighbours drawn. The outdoors is hidden past the bend, which takes the mine front's view (about 54k triangles per eye) off the frame. The 7 undead cost about 14k triangles. The mine is the cheapest place in Oakvale to draw.
- Names (the cart hall, the gallery, the dig, the antechamber, the Warden's hall) are placeholders for the spec.

## Comments

**2026-09-28:** [The quest chain](01-the-quest-chain.md) is resolved and ends in the mine, so the second bullet is updated to match. The final enemy stays dead once beaten.

**2026-09-28:** [The zone's enemies](02-the-zones-enemies.md) is resolved. The mine holds the undead only, today's skeletons as they are: grunts and archers near the mouth, brutes deeper, the Warden at the bottom. The bandits who dug there are already dead. The Warden rises only while What Lies Below is active; before that, its chamber holds an empty throne. Dying or fleeing resets it, and the skeletons it raises crumble when it falls or resets. The mine's other undead refill like any camp. Counts and placement are this ticket's.

**2026-09-28:** [Progression, death and saving](03-progression-death-and-saving.md) is resolved. The undead are level 3 near the mouth and level 4 deeper in; the Warden and the skeletons it raises are level 5. The Warden's level-1 health is 600, about 1100 at level 5. A death inside the mine wakes you just outside its mouth, which is a respawn point. XP is meant to land level 4 inside the mine on the plain route, from about 330 XP on arrival to 600: skeleton grunts and archers pay 30, brutes 120, the Warden 150. Check the mine's counts against that.

**2026-09-28:** [Enemies in the open](07-enemies-in-the-open.md) is resolved. The mine's undead pull, chase and refill like any camp: each notices you at 8 m, brings anyone within 10 m, and gives up 30 m from its post. They have 40% more health and damage than today's numbers on top of their level, and three may swing at you at once; the Warden keeps its numbers. Enemies steer round colliders by looking a stride ahead, with no navmesh, which was enough on the lumber camp's open ground. In tunnels, check whether they get stuck at corners, and whether a 30 m leash suits a tunnel.

**2026-09-28:** [Interiors](08-interiors.md) is resolved (by Claude on Tom's behalf). The village's buildings go indoors like this: the room is built with the zone and hidden until its door opens; once you're inside and can't see out, the sun fades, the sky light drops to a low warm fill, the pool of 4 point lights moves onto the room's flames, and the outdoors is hidden. The mine can reuse the same switch past a bend in its tunnel instead of a door. Enemies never go into the village's buildings, which says nothing about the mine, where they live.

**2026-09-28, round 1 (taken on Tom's behalf, without his answer):**

- Shape: one route with no forks, rather than a branching mine. There's no loot to reward a side gallery, you can't get lost, and enemies without a navmesh have one line to follow (round 2). WoW's Elwynn mines branch, but they're full of kobolds to grind; this one is a quest's finale.
- Size and depth: about 100 m and 7 m down, about 45 s end to end. That makes it a real place to fight through, while the walk back after dying to the Warden stays short. Ramps and no stairs, since stick walking on stairs is the least comfortable thing in VR (the same reason Interiors kept to ground floors). About 1 in 5 is like the hills outside.
- Story: the three parts tell the quest chain without a word. The timbered old mine and its rails match the mouth outside, the bandits' rough digging and dropped gear show how far they went, and the breach into dressed stone shows what they broke into. No bandit bodies: they would need the human body from [Friendly characters](11-friendly-characters.md), and their gear tells it.
- The final room: today's crypt hall, as it is. The Warden's fight was tuned in that exact room (its pillars, its size, the summons landing round you), and it already carries its own 4 torch lights. It sits naturally at the bottom as the tomb the digging woke. Two of its three gates are choked with stone so it has one way in.
- Joining the outdoors: part of Oakvale, loaded as a cell keyed to the mouth, which is what the research on joining zones prescribes for the mine. A zone of its own would need a seam, which is for joining outdoor regions, and the glossary keeps "zone" for those. The switch at the adit's bend is the one Interiors uses at a door.

**2026-09-28, round 2 (taken on Tom's behalf, without his answer):**

- Counts: 5 at level 3 in the two upper chambers, then a brute alone in the dig and another in the antechamber, then the Warden. The upper chambers are the pulls that teach the mine (grunts with an archer behind them). Each brute is alone because its unblockable slam needs room to step away from, and a brute's room is where you practise that before the Warden's own slam. The XP check is in the Answer: level 4 comes at the first brute, and the Warden alone doesn't reach level 5, so the sword and level 5 arrive together at the hand-in as [Progression, death and saving](03-progression-death-and-saving.md) planned. (That ticket's "about 330 on arrival" predates the lumber camp shrinking to 5 in [Enemies in the open](07-enemies-in-the-open.md), where the quest now takes all five, the leader included.)
- Corners: a quick simulation of the camp prototype's stride-ahead steer in tunnels ([checks/tunnel-steering.mjs](../checks/tunnel-steering.mjs)) got an enemy round a single right-angle bend and a gentle one, but it stuck for good in a hairpin, a switchback and a chamber whose exit was off the straight line to you. Following the tunnel's centre line whenever you're out of sight got through all five. So the mine gives its enemies that line, and every chamber sits on it. No navmesh.
- Noticing through rock: the WoW-style pull noticed you by distance alone, which is right on open ground, but in the mine it would pull a chamber through a wall. So rock blocks noticing and calling in the mine, and each chamber is its own pull.
- Leash: 30 m from the post stays. It lets you pull a chamber back into the one you've cleared, which is how WoW caves are played. But the undead stop at the mouth: fleeing into daylight is always an escape, the respawn point by the mouth stays clear of them, and no enemy is ever half in and half out of the mine's ground.
- The Warden stays in its hall, and leaving by the gate is fleeing. It rises when you step through the gate, so the fight starts when you've seen the room.
- Refilling: the mine as one camp that refills only after you've left. Refilling chambers behind you would make a death at the Warden mean fighting the whole mine again on the way back, which is a lot to ask of your arms in VR.

**2026-09-28, round 3 (taken on Tom's behalf, without his answer):**

- Light: flames every 8 m or so keep a light of the pool near you everywhere, with the crypt hall's fill so nothing is pitch black. The deep workings get fewer flames so the descent darkens. No light carried by the player: it would hold one of the 4 lights for good, and WoW doesn't hand you one either.
- The switch at the bend, as Interiors does it at a door. Only the current part and its neighbours drawn, as the performance budget prescribes for dungeons.
- Saving inside loads you inside, as Interiors decided for buildings, rather than a special rule that moves you to the mouth. The respawn point faces the mouth, so waking after a death shows you the way back in.
- Nothing to pick up or use, and no rideable carts (a cart ride is a comfort risk).
