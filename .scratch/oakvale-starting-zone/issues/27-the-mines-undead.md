# 27: The mine's undead

**What to build:** The dead walk in the old mine. Two grunts and an archer hold the cart hall and a grunt and an archer the gallery's far end (level 3); a brute waits alone in the dig and another before the hall's gate (level 4). Rock hides you, so each chamber is its own pull. An undead that can't see you follows the tunnel towards you, the undead never follow you out of the mouth, and the mine fills again only once you've left it.

**Spec:** Implementation Decisions › Camps (in the mine), The mine (for the camps). User stories 94–99.

**Blocked by:** 16 (The farm's camp), 26 (The old mine: down to the Warden's hall).

**Status:** done

- [x] The mine is one camp: 2 grunts and an archer in the cart hall and a grunt and an archer at the gallery's far end (level 3); a brute in the dig and another before the hall's gate (level 4). The two brutes pay triple.
- [x] Rock blocks noticing and bringing others: both need a clear line through the mine.
- [x] An undead that can't see you follows the route's centre line towards you and walks home the same way. One that can see you walks straight at you and steers as it does outdoors. No navmesh.
- [x] The mouth ends every leash: the undead never leave the mine.
- [x] Walls and ceilings stop arrows.
- [x] The mine refills 3 minutes after its last undead falls, and only once you've left it and are at least 30 m from its mouth.
- [x] Tests at the `EnemyContext` seam: no noticing through rock; following the centre line round a hairpin and a switchback (the tunnel-steering check next to the spec becomes this test); stopping at the mouth; the refill rule; arrows stopping in a wall.
- [x] Checked in headless Chromium with the emulator: pulling the cart hall doesn't wake the gallery, and a chase ends at the mouth.
- [x] Every new number is in the game's table of tunables.

## Built

Built on 2026-09-29 by Claude, in autonomous mode (Tom asked for the rest of Oakvale to run without his input).

- **The mine's camp** (`MINE.camp` and `mineCamp` in `src/maps/forest/mine.ts`, added to Oakvale's camps by the layout): one camp, `mine`, of the undead at level 3. Two grunts and an archer in the cart hall, facing the way in from the adit; a grunt and an archer at the gallery's far end, facing back up it; a brute alone in the dig facing the ramp, and another before the hall's gate facing the way in from the passage, both level 4 (a post may now have its own `level`) and both `deepBrute`, which pays triple. Its place is the mouth.
- **Where a camp is** (`CampPlan.interior`, `You.interior` in `src/enemies/camps.ts`): a camp notices you and fights you only while you're where it is. The camps outdoors do as before (they don't follow you indoors); the mine's undead notice you only once you've come in by its mouth, and turn for home the moment you walk out through it. It refills only once you've left it: 3 minutes after the last falls, and while you're 30 m from the mouth.
- **Rock blocks them**: in the mine, noticing you and bringing others both need a clear line through rock (the mine's sight test).
- **The mine's own ground** (`src/world/mineGround.ts`, `World.mineGround`): the undead stand on the mine's ground whether or not you've come in, since the World gives you the mine's only once you have. Its floor, walls and props are the mine's, only rock blocks sight, and its steering is the World's (moved into `steerRound` in `world/ground.ts` so both share it). The `Camps` take a ground per camp, each with its own `EnemyContext`, sharing one token pool.
- **Finding the way** (`Ground.wayRound`, used by `Enemy`): with rock between an undead and you, it heads for the farthest point it can see up to 4 m on along the route's centre line, from where it meets the line towards where you do, at the chase's run; walking home it goes the same way. Once it can see you it walks straight at you and fights as it does outdoors. No navmesh.
- **Arrows** (`MinePlan.arrowStops`): in the mine an arrow stops in the floor, the ceiling and the rock at any height, and in props up to their height. The World asks the mine once you're in it.
- **Drawn with the mine**: each of the undead is drawn only in a part of the mine that's drawn (the part you're in and its neighbours, or the adit from outside), and its blob shadow with it.
- **Tunables**: the posts and levels in `MINE.camp`; how far on along the line an undead looks, and the step it tries back by, in `CONFIG.mine.way`. The pull, leash, refill and chase numbers are the camps' own, unchanged.
- **Tests**: `tests/mineUndead.test.ts` drives real enemies through `EnemyContext` on the mine's ground: no noticing or pulling through rock; following the centre line round a hairpin and through a switchback, and home the same way (the tunnel-steering check's two cases where steering alone stuck); the mouth ending a chase with none ever past it, and not noticing you outside; the refill rule; arrows stopping in walls, floors and ceilings; and the camp's posts (each chamber its own pull). `tests/world.test.ts` walks into the real mine with the World: only the cart hall wakes, only the parts drawn show their dead, and they give up at the mouth and walk home.
- **Checks**: `checks/mine-undead.mjs` in headless Chromium with the emulator (see its header): pulling the cart hall doesn't wake the gallery or the brutes, and the chase ends at the mouth. Screenshots are in the project's files under `mine/` (21 to 23).

Calls **taken on Tom's behalf**, to revisit:

- **The mouth ends the chase where the mine begins**: the same line that puts you in the mine (walking in through the mouth) takes you out of the undead's reach, so the moment you step out they turn for home, and the rail bed is always safe. The adit's end a metre out is as far as any of them can go.
- **The leash stays 30 m straight from the post**, as outdoors. The cart hall is about 16 m from the mouth, so for it the mouth ends a chase first; deeper down, 30 m straight is a chamber or two along the route.
- **Only rock blocks their sight in the mine**: the hall's pillars and the props don't. Outdoors nothing changes (noticing there needs no line of sight, as before).
- **Where an undead meets the line is the nearest point of it that it can see**, so the next chamber's line, behind rock, is never taken for its own. It heads for the farthest point it can see up to 4 m on, which cuts corners without walking into them.
- **Out of sight, it runs** at your walking pace along the line, as a chase outdoors does when you're well out of reach.
- **Posts**: the cart hall's three face the way in from the adit, the gallery's pair its far end facing back up it, the dig's brute the foot of the ramp, and the antechamber's brute stands 3 m before the gate, facing the passage. Each is out of sight of every other chamber's within a pull.
- **The mine's place for the refill is its mouth**, 30 m measured straight from it.

Left for later:

- The Warden on its throne and the hall's behaviour when you step through its gate (28).
- The mine's sounds, and the drone at the breach (31); staging the mine's undead with its meshes (34): they're stepped every frame wherever you are, as the camps outdoors are.
