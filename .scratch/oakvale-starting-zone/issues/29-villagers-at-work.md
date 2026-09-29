# 29: Villagers at work

**What to build:** The village is peopled. The innkeeper polishes tankards behind the bar, the smith hammers at the anvil and pumps the bellows, and the farmer leans on a pitchfork by the well looking towards the farm. Each turns their head to follow you when you come near and says a short line over their head that changes as the quest chain moves on. Hale doesn't bark.

**Spec:** Implementation Decisions › Friendly characters (the villagers, barks), Hale's board and the villagers' barks (the barks table). User stories 136–139 and 141.

**Blocked by:** 18 (Marshal Hale and Raiders in the Fields), 20 (The human body), 23 (The inn).

**Status:** done

- [x] The innkeeper stands behind the inn's bar, the smith at the anvil and the farmer by the well.
- [x] Each plays a working loop: the smith strikes in bursts of a few blows, turns the piece and pumps the bellows now and then; the innkeeper wipes the bar and polishes a tankard, sets it down and picks up another; the farmer leans on the pitchfork, looks off towards the farm and shifts their weight. The smith's blows are events the sound in ticket 30 can strike on.
- [x] Each turns their head to follow you within 4 m and goes back to work when you leave.
- [x] Barks show as text on a small panel over the villager's head when you come within 4 m, facing you, for about 4 s. They don't show again until you've been 10 m away. At most two show at once. Hale doesn't bark.
- [x] The adventure state answers each villager's bark line for every stage of the chain, as the spec's barks table says.
- [x] Friendly characters are solid: you can't walk through them.
- [x] Tests at the adventure-state seam: every villager's bark for every stage. The bark's show-and-rearm rule (4 m, 4 s, 10 m, two at once) is a pure rule with its own test.
- [x] Checked in headless Chromium: screenshots of each villager at work and barking, for the thread's reply.
- [x] Every new number is in the game's table of tunables.

## Built

Built on 2026-09-29 by Claude, in autonomous mode (Tom asked for the rest of Oakvale to run without his input).

- **Where they stand** (`Zone.villagers`, `VillagerSpot`, placed in `layout.ts` `placeVillagers`): the innkeeper behind the Golden Tankard's bar facing the room (`INN.keeper`), the smith at the anvil facing it and the smithy's open front (`SMITHY.smith`), and the farmer at the well's east side facing the farm. The innkeeper hangs from the inn's room, so they're drawn only while it is; the smith and the farmer are drawn with the outdoors. Each is one draw call (`buildPerson`), and solid: a `World.addBody` circle of 0.3 m, as Hale is.
- **Their work** (`src/people/work.ts`, pure loops of poses, shared with the model inspector's new "work" clip): the smith strikes in bursts of 4, 3 and 5 blows, turning the piece over in the tongs between bursts, then turns round to the bellows, holding the piece in the fire while pumping the handle three times, and turns back; the innkeeper wipes the bar with a rag, polishes a tankard before their chest, sets it down on the bar and reaches along it for the next; the farmer leans on the pitchfork, shifts their weight from foot to foot, and every other shift shades their eyes to look off towards the farm. Everyone breathes. The smith's blows are events: `strikesBetween(work, from, to)`, and `Villagers.onStrike(at)` at the hammer hand for each, which ticket 30's sound can strike on (nothing listens yet).
- **Noticing you**: within 4 m they stop work (easing to standing easy, their loop's clock standing still) and turn their head to follow you, and their chest with it past the head's reach; walk off and they go back to work where they left off.
- **Barks** (`src/people/barks.ts` `BarkRule`, pure): within 4 m their line shows on a small parchment panel over their head, turned to you, for 4 s; not again until you've been 10 m away; at most two at once, nearest first. The lines are data (`BARKS` in `quests.ts`), and the adventure state answers each villager's line (`AdventureState.bark`) for where the chain stands, as the spec's barks table says. Hale doesn't bark.
- **The smithy** gains bellows on a stand against the forge's right side, nozzle into the fire, and its anvil moves a step from the forge; both are colliders. The smith holds tongs with a bar hot from the forge; the innkeeper has a rag.
- **Tunables**: `CONFIG.villagers` (radius, noticing, the head's turn, stopping work, the bark's 4 m, 4 s, 10 m and two at once and its height, and each loop's timings).
- **Tests**: `tests/questChain.test.ts` has every villager's bark for every stage of the chain and across reloads; `tests/barks.test.ts` the bark rule (4 m, 4 s, 10 m, two at once, the third waiting, a villager out of sight); `tests/work.test.ts` the smith's bursts and blows as events, the turn to the bellows, and every loop moving without a jump.
- **No stall on the first bark**: the barks' shader (Hale's board's, both its sides) is compiled as the Adventure starts (`Villagers.warm`), as the hurt vignette's now is.
- **Checks**: `checks/inn.mjs` counts the room's draw calls without the innkeeper, and `checks/people.mjs` expects each villager's work clip. `checks/villagers.mjs` in headless Chromium with the emulator (see its header). Screenshots are in the project's files under `villagers/`.

Calls **taken on Tom's behalf**, to revisit:

- **The smithy had no bellows**, so it has them now, against the forge's right side, and the **anvil moved** from the middle of the floor to a step from the forge (−0.35, −0.2 in the smithy's frame), so the smith reaches both from one spot. At the bellows the smith turns round to them, holds the piece in the fire in the tongs with the left hand and pumps the handle with the right, hammer and all.
- **The tankard never leaves the innkeeper's hand**: "sets it down and picks up another" is the hand setting it on the bar and reaching along the bar for the next. A tankard of its own would be another draw call.
- **They stop work while you're within 4 m** (the spec's "goes back to work when you leave"), and the smith's blows don't ring while they do.
- **The head turns up to 1.1 rad (63°) and the chest up to 0.35 rad more**; past that they don't turn their feet. They look up or down to your eyes too.
- **The bark is parchment**, as Hale's board is, with the villager's name ("Innkeeper", "Smith", "Farmer") small and bold over the line; 1.1 × 0.33 m, its text about 5 cm tall so it reads at 4 m, its middle 0.6 m over their head's, clear of the farmer's hat and pitchfork. It's depth-tested, so a wall or a post can hide it.
- **A bark runs its 4 s** even if you walk off. A third, while two show, waits while you stay within 4 m and shows when one of them ends.
- **A villager out of sight** (the innkeeper while the inn's door is shut and you're outside) neither notices you nor barks, and counts as far away: walk out of the inn and back in and the innkeeper greets you again.
- **The innkeeper stands a body's width off the bar's back** (0.3 m, not the 0.48 m ticket 23 left), so they reach its top.
- **The farmer stands at the well's east side**, facing the farm, and shades their eyes with the left hand to look towards it.
- **The villagers start at different points in their loops**, so the village doesn't move in step.
- **The innkeeper's last line starts once What Lies Below is ready**, which is the Warden beaten, its one objective.

Left for later:

- The smith's hammer ringing in time on `Villagers.onStrike`, and the forge's roar (30); muffled behind the inn's door (31); staging the villagers with the zone's chunks (34).
