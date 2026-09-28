# 25: The old mine: the mouth to the gallery

**What to build:** The old mine opens. Walk up the rail bed, in through the mouth and along the timbered adit; past its bend the daylight fades and the lanterns take over. The cart hall and the gallery lie beyond, empty for now, and the route stops for now at the head of the bandits' ramp. Dying inside wakes you on the rail bed just outside the mouth, and a save made inside loads inside.

**Spec:** Implementation Decisions › The mine (the route's first three parts, in or out, the switch, light, respawn). User stories 8, 90, 92, 93, 105 and 106 (the old mine's part).

**Blocked by:** 23 (The inn).

**Status:** ready-for-agent

- [ ] In or out goes by the mouth, not by position: the World tracks that you walked in through the mouth, and from then on your ground and walls come from the mine. Oakvale's terrain leaves out its ground where the tunnel cuts into the hillside.
- [ ] The adit: timbered, about 10 m straight in with the rails, then a bend. The cart hall, level with the mouth: about 12 × 10 m on timber props; the rails end at a turntable with two ore carts; a winch stands over a boarded-up shaft; the bandits' camp lies about (bedrolls, crates, their brazier). The gallery: about 16 × 7 m and 6 m high, with timber scaffolding against one wall (scenery, not climbable).
- [ ] Tunnels are about 3.5 m wide and 3 m high. Props stand flush with a wall, or a body's width clear of walls and each other. Nothing can be picked up or used, and the carts don't move.
- [ ] _(Taken on Tom's behalf: until ticket 26, the route ends at the gallery's far end in a wall of fallen rock where the bandits' ramp will go down.)_
- [ ] The Interiors switch runs past the adit's bend: from outside only the adit shows; inside, only the part you're in and its neighbours are drawn and the outdoors is hidden; walking out, the daylight is back before you can see out.
- [ ] Light: lanterns on the timber props about every 8 m and the brazier in the cart hall. The pool sits on the 4 nearest flames and fades as it swaps. The ambient light is the crypt hall's cool fill, and fog closes in at about 6 to 18 m.
- [ ] The mine's respawn point is on the rail bed a few metres outside the mouth, facing it; a death inside the mine wakes you there.
- [ ] The save records the mine as your interior; loading inside puts you where you stood with the mine's light on.
- [ ] The mine gives the World its route's centre line so far (from the mouth through each chamber) and a sight test through rock.
- [ ] Tests: the mine's ground applies only once you've come in by the mouth (walking the hillside above the adit stays on Oakvale's ground); the mine's respawn point is clear and faces the mouth; the no-pockets flood fill passes over every part so far for every body radius; the ramps and floors stay at 1 in 5 or gentler; a save round-trips with the mine as its interior.
- [ ] Checked in headless Chromium: walking in past the bend swaps the light without changing `renderer.info.programs.length`, and each part costs a few thousand triangles in a few draw calls.
- [ ] Every new number is in the game's table of tunables.
