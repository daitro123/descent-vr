# 24: The house by the well and the smithy

**What to build:** The house by the well opens as the inn does: one warm room with a hearth and a hanging pot, a bed, a table with a candle, and nobody home. The smithy becomes walk-in under its roof, so you can stand at the forge and the anvil.

**Spec:** Implementation Decisions › Interiors (the house, the smithy). User stories 107, 112 and 113 (the house and the smithy).

**Blocked by:** 23 (The inn).

**Status:** done

- [x] The house that opens is the slate-roofed house facing the crossroads, with the lantern at its door. It gains a real doorway with steps, and the Interiors switch works at its door as at the inn's.
- [x] The room, about 6 × 5 m and open to the rafters: a hearth with a hanging pot in the back corner under the chimney, a bed, a table with two chairs and a candle, a chest, a shelf of crocks, a rug and a broom. Its flames are the hearth and the candle. The attic is out of reach.
- [x] The smithy is walk-in under its roof with no switch, since it's open-fronted and lit by the sun. Its solid footprint becomes colliders for the back wall, the low side wall, the forge, the anvil, a barrel and the grindstone.
- [x] A save inside the house loads inside it.
- [x] Tests: the World's floor and walls inside the house's footprint are the house's; the no-pockets flood fill passes over the room and under the smithy's roof for every body radius.
- [x] Checked in headless Chromium: screenshots of the room from the door and from inside, for the thread's reply.
- [x] Every new number is in the game's table of tunables.

## Built

Built on 2026-09-29 by Claude, in autonomous mode (Tom asked for the rest of Oakvale to run without his input).

- **What the inn and the house share** now lives in two modules: `src/maps/forest/interiorPlan.ts` (the plan: `planInterior` places an interior's floor, steps, colliders, flames and wake point with its building; `wallShapes` gives the walls round a doorway as colliders) and `interiorModel.ts` (the meshes: `buildInterior` makes the room mesh, its glows and the door's leaves; `fireplaceOn`, `windowIn`). The inn is rebuilt on them unchanged (still 4,494 triangles).
- **A door needn't be in the front's middle**: `InteriorPlan.door.x` says where it is across the front, and the World measures you from it for the switch.
- **The house by the well** (`src/maps/forest/house.ts`, the plan; `houseModel.ts`, the room):
  - Outside, it's the same cottage, but its walls stand round the room with a real doorway right of the front's middle, its timber frame, stone steps up to the floor, and a lantern on a bracket by the door. The gable ends are thin, so the roof is hollow over the room. The ground is levelled round it out to the foot of its steps.
  - The room is 6.4 × 5.4 m, 2.9 m to the eaves and open to the rafters (boards under both slopes, rafters, a ridge beam and three tie beams). No attic floor and no stair.
  - The hearth stands in the back right corner, against the gable wall and the back wall, with a pot hung over its fire; the chimney outside moved over it, to the gable end. The bed is along the left wall with its head at the back, the chest across its foot, the table with a chair at each end nearer the front, the shelf of crocks against the back wall, the rug before the hearth, and the broom in the front right corner. Windows glow with daylight where the outside has them.
  - Its flames are the hearth and the candle on the table. Nobody is home.
  - It costs 2,548 triangles in one draw call, plus one for its glows and one for the door's leaf (120 triangles).
- **The smithy** (`src/maps/forest/smithy.ts`, what stands where): no longer a solid box. Its back wall, low side wall, forge, anvil, quench barrel, grindstone, crate and two front posts are colliders; the open front and right side let you in. Its flagstones are flush with ground levelled under it. No switch: under its roof you're outdoors in the sun.
- **A save inside the house loads inside it**, through the record's `interior` as the inn's does.
- **Tunables:** no new gameplay numbers. The house's and the smithy's layout numbers are in `HOUSE` and `SMITHY`, and the house's air (`HOUSE_ATMOSPHERE_BASE`) is beside its plan, as the inn's are in `INN` and `INN_ATMOSPHERE_BASE`. Every cottage's walls and roof now come from `HOUSE` (its foundation, eaves and rise), so the room always fits under the roof.
- **Tests** (`tests/world.test.ts`, with the flood fill now one helper the inn, the house and the smithy share): the house is the one facing the crossroads nearest the well; its floor and steps; its walls and props from inside and out, and its open doorway; no pockets over the room for every body radius; every camp more than a leash from its doorway; walking in and out, and settling inside; the smithy's level floor, its colliders, no pockets under its roof for every body radius, and no switch. `tests/saving.test.ts`: a save round-trips with the house as its interior.
- **Checks:** `checks/house.mjs` in headless Chromium with the emulator; see its header for every step. The door opens 1.92 m out and shuts 1.51 m in, the sun is up before it opens on the way out, `renderer.info.programs.length` stays 12 throughout, a save inside reloads inside, and in the smithy the forge and the anvil stop you an arm's length off. Screenshots are in the project's files under `house/`. `checks/inn.mjs` and the other checks still pass.

Calls **taken on Tom's behalf**, to revisit:

- **The house that opens is the one at (−13, −12)**, the slate-roofed cottage facing the crossroads nearest the well, which already had the lantern's glow by its door.
- **The door stays where it was, right of the front's middle**, rather than moving to the middle, so the outside keeps its look. It's 1.2 m clear (the old one was 1.1) so every body fits through it, and it's one leaf hinged on its left, swinging in, so the hearth shows through the open door.
- **The hearth is in the back right corner against the right (gable) wall**, clear of that wall's window, and the chimney moved from nearer the middle to the gable end over it. The lantern by the door, which was only a glow, now has a lantern on a bracket to glow in.
- **"Inside" ends at the eaves (2.9 m over the floor)**: a camera above them is over the roof's slope, outdoors.
- **The broom and the rug don't collide**: the broom stands in a corner no body reaches, and the rug is flat.
- **The smithy's front posts collide too** (the ticket's list didn't name them, but you'd walk through them otherwise), and so does the crate. Its flagstones were lowered to sit flush with the ground, levelled 1.5 m round it, so walking in under the roof isn't a step up.
- **Props in the smithy moved a little** so no gap between them is only just a body's width: the anvil 0.4 m towards the middle, the barrel 0.5 m towards the front corner, the grindstone forward, the crate against the back wall. In the house the table is 0.1 m further from the left wall for the same reason.
- **No enemy comes indoors** because every camp post and patrol road is more than a leash (plus a patrol's keep-up and the biggest body) from the house's doorway. The patrol's road passes 31 m behind the house, closer than it passes the inn, but the doorway faces away from it.

Left for later:

- The house's smoke (32) comes out of its chimney's new place at the gable end.
- Staging the house's meshes near its door with the streamer (34).
