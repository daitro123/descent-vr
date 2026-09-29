# 25: The old mine: the mouth to the gallery

**What to build:** The old mine opens. Walk up the rail bed, in through the mouth and along the timbered adit; past its bend the daylight fades and the lanterns take over. The cart hall and the gallery lie beyond, empty for now, and the route stops for now at the head of the bandits' ramp. Dying inside wakes you on the rail bed just outside the mouth, and a save made inside loads inside.

**Spec:** Implementation Decisions › The mine (the route's first three parts, in or out, the switch, light, respawn). User stories 8, 90, 92, 93, 105 and 106 (the old mine's part).

**Blocked by:** 23 (The inn).

**Status:** done

- [x] In or out goes by the mouth, not by position: the World tracks that you walked in through the mouth, and from then on your ground and walls come from the mine. Oakvale's terrain leaves out its ground where the tunnel cuts into the hillside.
- [x] The adit: timbered, about 10 m straight in with the rails, then a bend. The cart hall, level with the mouth: about 12 × 10 m on timber props; the rails end at a turntable with two ore carts; a winch stands over a boarded-up shaft; the bandits' camp lies about (bedrolls, crates, their brazier). The gallery: about 16 × 7 m and 6 m high, with timber scaffolding against one wall (scenery, not climbable).
- [x] Tunnels are about 3.5 m wide and 3 m high. Props stand flush with a wall, or a body's width clear of walls and each other. Nothing can be picked up or used, and the carts don't move.
- [x] _(Taken on Tom's behalf: until ticket 26, the route ends at the gallery's far end in a wall of fallen rock where the bandits' ramp will go down.)_
- [x] The Interiors switch runs past the adit's bend: from outside only the adit shows; inside, only the part you're in and its neighbours are drawn and the outdoors is hidden; walking out, the daylight is back before you can see out.
- [x] Light: lanterns on the timber props about every 8 m and the brazier in the cart hall. The pool sits on the 4 nearest flames and fades as it swaps. The ambient light is the crypt hall's cool fill, and fog closes in at about 6 to 18 m.
- [x] The mine's respawn point is on the rail bed a few metres outside the mouth, facing it; a death inside the mine wakes you there.
- [x] The save records the mine as your interior; loading inside puts you where you stood with the mine's light on.
- [x] The mine gives the World its route's centre line so far (from the mouth through each chamber) and a sight test through rock.
- [x] Tests: the mine's ground applies only once you've come in by the mouth (walking the hillside above the adit stays on Oakvale's ground); the mine's respawn point is clear and faces the mouth; the no-pockets flood fill passes over every part so far for every body radius; the ramps and floors stay at 1 in 5 or gentler; a save round-trips with the mine as its interior.
- [x] Checked in headless Chromium: walking in past the bend swaps the light without changing `renderer.info.programs.length`, and each part costs a few thousand triangles in a few draw calls.
- [x] Every new number is in the game's table of tunables.

## Built

Built on 2026-09-29 by Claude, in autonomous mode (Tom asked for the rest of Oakvale to run without his input).

- **The mine is a hollow in the rock** (`src/maps/forest/hollow.ts`): a union of rectangles, each with its floor, height and part. Its walls, the rock over openings between pieces of different heights, its floors and ceilings, the push back out of rock and the sight test all come from those rectangles, so a later part is one more rectangle.
- **The plan** (`src/maps/forest/mine.ts`, numbers in `MINE`): in the mouth's frame, the adit runs 11.75 m in, 3.5 m wide and 3 m high, then turns west along a short tunnel into the cart hall (12 × 10 m, 3.6 m high). A passage leaves the hall's north-west corner into the gallery (7 × 16 m, 6 m high). `planMine` gives the World the mine's ground, walls, parts, flames, route (its centre line from the mouth to the fallen rock) and sight test.
- **The meshes** (`src/maps/forest/mineModel.ts`): rough rock faces; timber sets along the adit, the tunnel and the passage; the rails round the bend to a turntable with two ore carts on a siding; props and beams in the hall; the winch over a boarded shaft; the bandits' brazier, crates and bedrolls; the gallery's posts, two-deck scaffolding (scenery), pale streaks of the vein, and the fallen rock heaped across its far end. Each part is one mesh and one of glows: the adit 2,368 triangles, the cart hall 2,878, the gallery 2,320.
- **In or out goes by the mouth** (`src/world/mine.ts`, `MineSwitch`): you're in the mine once you cross the mouth's line inside its opening, and out when you cross it back. Only then do the mine's ground and walls apply. Walking the hillside over the adit, or arriving past the line any other way, stays on Oakvale's ground. Oakvale's terrain leaves out its triangles where the adit cuts the hill.
- **The switch** swaps to the mine's light 5.5 m past the bend and hides the outdoors; walking out, the sun is back 4.5 m past the bend, before the mouth can be seen (from 3.3 m past it at a run). From outside only the adit is drawn; inside, the part you're in and its neighbours.
- **Light:** lanterns on the timber sets and props (six, about every 8 m along the route) and the brazier. The adit's lanterns join the pool when you're within 12 m of the mouth. Inside, the crypt hall's cool fill, no sun, fog from 6 to 18 m and a 40 m far plane.
- **Respawn and saves:** a death while in the mine (the adit included) wakes you on the rail bed 3 m outside the mouth, facing it. The save records `mine` as your interior, and loading puts you where you stood, in the mine's light. Loading now settles the World before placing you, so you land on the mine's floor.
- **Outside the mouth:** the entrance's posts are set to the tunnel's width with no dark box behind them, the boulders sit clear of the tunnel, and the outside ore cart moved 5.6 m out on the rails and collides.
- **Tunables:** the switch's cues and fades are `CONFIG.mine` (`inside`, `back`, `near`, `fadeIn`, `fadeOut`). The mine's layout numbers are in `MINE`, and its air (`MINE_ATMOSPHERE_BASE`) is beside its plan, as the inn's and the house's are.
- **Tests:** `tests/mine.test.ts` covers the switch (entered only through the mouth, the light's cues and fades, settling) and the hollow (walls, lintels, resolve, sight, floors). `tests/world.test.ts` covers the mouth at the mine front, ground only once entered, the respawn clear and facing the mouth, no pockets over every part for every body radius, floors at 1 in 5 or gentler, the route clear of walls and props, the sight test, the switch and parts walking in and out at a run, settling, the terrain cut, and each part's cost. `tests/saving.test.ts`: a save round-trips with the mine as its interior. `tests/camps.test.ts`: going indoors sends a fight home, and nobody notices you in there.
- **Checks:** `checks/mine.mjs` in headless Chromium with the emulator; see its header for every step. `renderer.info.programs.length` stays 12 walking in and out, each part costs 2,300 to 2,900 triangles in 2 draw calls (a frame in the cart hall is 20 draw calls and about 16,000 triangles), the sun is back before the mouth can be seen, a save in the gallery reloads there, and a death wakes you outside. Screenshots are in the project's files under `mine/`.

Calls **taken on Tom's behalf**, to revisit:

- **The bend turns west into the cart hall, and the gallery lies north of the hall**, reached by a passage from its north-west corner. That way no part can be seen from two parts away, and the route never doubles back past the mouth.
- **The passage counts as the cart hall's part**, so walking into it draws the gallery too.
- **The fallen rock is a heap across the gallery's north end**, with a collider flush to it, where ticket 26's ramp will go down.
- **"In the mine" starts at the mouth, not the bend**: a death or a save anywhere past the mouth counts as in the mine. Only the light waits for the bend.
- **The switch's cues are 5.5 m in and 4.5 m out past the bend**, so the sun is back before the mouth can be seen even at a run.
- **The adit's lanterns are lit from 12 m out**, so the mouth glows as you walk up.
- **The outside ore cart moved 5.6 m out and collides**, clear of the respawn point 3 m out. A collider on Oakvale's ground just behind the mouth, over the adit, means only the mouth takes you in.
- **The vein's streaks are dull and barely glow**, so they don't read as lights.
- **No camp outdoors notices you or follows you indoors** (a building or the mine): whoever is fighting you walks home as you go in. The mine's ground and walls go by whether *you* came in by its mouth, so an enemy following you in would stand on the wrong ground. The patrol's road passes 30.5 m from the mouth, just inside a jumped member's reach, so distance alone didn't rule it out as it does for the inn and the house.

Left for later:

- Undead ground, sight and arrows inside the mine, and following the route's centre line (27). The mine's camp will be the first that's indoors, so `You.indoors` will need to say where you are, and each enemy its own in-or-out, not yours.
- Ramps (every piece's floor is level for now), the bandits' ramp and removing the fallen rock (26).
- Staging the mine's meshes within 40 m of the mouth with the streamer (34).
- Muffled sound in the mine (31).
