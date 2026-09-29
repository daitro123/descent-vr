# 21: The Lumber Camp

**What to build:** Across the bridge, the lumber camp's gang holds the clearing: three thugs, an archer and their big leader with a felling axe, level 2, spread round the fire, the log pile and the tent. Hale's second quest asks you to defeat all five and take the leader's orders from the tent. Touch the rolled parchment with either hand and it's gone, with a buzz and the tracker ticking over. Hand in for 120 XP and level 3.

**Spec:** Implementation Decisions › Camps (the lumber camp), Enemies (the leader), Talking and tracking (the orders). User stories 30–32, 59 (the lumber camp) and 69.

**Blocked by:** 20 (The human body).

**Status:** done

- [x] Oakvale's plan holds the lumber camp's camp at level 2: a thug where the camp road comes in, one at the fire, one at the log pile, the archer to the south and the leader before the tent, posts on clear ground 5 to 18 m apart inside the clearing. Round two of the `?camp` prototype (merge `1135338`) placed them first.
- [x] The tent, the log pile, the fire and the fences are colliders, so enemies steer round them.
- [x] The leader has the brute behaviour with a felling axe in place of the maul. Its slash and slam are checked against a simulated player on the human body and retuned if they fall short (the brute's 1.65 m attack range and 0.5 m body radius were set for the undead brute's bigger body). Its kill pays triple.
- [x] The orders are a rolled parchment on a crate in the leader's tent. They lie there while the adventure state says so: from when The Lumber Camp is taken until they're picked up, then gone for good. Touching them with either hand, as you touch an orb, picks them up while the quest is active, with a buzz in that hand and "Leader's orders taken: 1/1" on the tracker.
- [x] The Lumber Camp plays end to end, with its two objectives in either order.
- [x] Tests: the leader's slash and slam reach a simulated player (the enemy attack tests' pattern); the adventure state answers whether the orders lie in the tent for every state; the lumber camp's posts stand on clear ground inside its clearing.
- [x] Checked in headless Chromium with the emulator: accept, clear the camp, take the orders, hand in, and see level 3.
- [x] Every new number is in the game's table of tunables.

## Built

Built on 2026-09-29 by Claude, in autonomous mode (Tom asked for the rest of Oakvale to run without his input).

- **The lumber camp's camp** (`lumberCamp` in `src/maps/forest/layout.ts`) holds three bandit thugs, a bandit archer and the bandit leader at level 2, in the camp clearing:
  - a thug where the camp road comes in, facing down it;
  - one by the fire;
  - one on the log pile's dry side;
  - the archer on the clearing's north side, watching the woods;
  - the leader before the tent's door, facing out.
  - Posts are 5 to 18 m apart, so a pull brings two to four of them, never all five, and walking the main road past doesn't wake them.
- **The leader** is the brute behaviour with the felling axe (ticket 20's look) and the `leader` role, so the kill pays triple: 60 XP at level 2.
- **The leader's reach** was checked against a simulated player on the human body and needs no retune:
  - The slash reaches the head at 1.4, 1.6 and 1.8 m tall, from touching out to the edge of the brute's 1.65 m attack range.
  - The slam lands 1.75 m ahead with its 1.5 m radius, so it catches you standing anywhere from touching to 2.3 m away.
- **The tent** (`TENT` in the layout, `tent()` in `buildings.ts`) is a canvas ridge tent: two sloping sides, a back wall, a ridge pole, guy ropes and pegs, the door's flaps rolled up and tied, a bedroll and a lantern hanging from the ridge. Two crates stack just inside the door, and the orders lie on the top one, a hand's reach from the doorway. The tent is a solid collider, like the log pile and the fire.
- **The orders** (`src/world/pickups.ts`) are a rolled parchment tied with a red cord:
  - `Zone.pickups` says where in a zone a quest item lies.
  - The adventure state's new answer, `lies(item)`, says whether it lies there: from when The Lumber Camp is taken until the orders are picked up, then never again, across saves too.
  - A fist within an orb's touch (`CONFIG.orb.pickupRadius`) takes them. The sword's tip doesn't.
  - Taking them buzzes that hand (`CONFIG.pickups.buzz`) and plays a parchment rustle. The tracker ticks over to "Leader's orders taken: 1/1", and the game saves.
- **Enemies notice when walking gets them nowhere.** Before, only a body that barely moved from frame to frame side-stepped. Now a body that has made little headway over 0.8 s while meaning one way side-steps too. Without it, a chaser met square on by a wall with the way on straight through it flip-flopped in place for good. The leader did this behind the tent. The numbers are in `CONFIG.unstick`.
- **Tests:**
  - `tests/forest.test.ts` (8 new): the camp's make-up, level and clearing. Each post's place. Clear, level ground at every post. The spacing and pulls. The main road leaves it asleep. Nothing walks through the tent, the log pile or the fire. The orders lie on the crates just inside the door, within reach of someone who walks up to the doorway.
  - `tests/enemyAttacks.test.ts`: the leader's slash and slam against a simulated player, as above, and the leader in the melee attack tests.
  - `tests/questChain.test.ts`: whether the orders lie in the tent, for every stage of the chain, and across a save.
  - `tests/world.test.ts`: the tent is no trap. Standing square behind it, the leader before its door comes round and swings at you.
  - `tests/bandits.test.ts`: the skeleton-shatters test was flaky (about one run in a few) and now measures every bone.
- **Checks:** `checks/lumber-camp.mjs` in headless Chromium with the emulator. It covers accepting, clearing the camp, taking the orders and handing in for level 3; see its header for every step. Screenshots are in the project's files under `lumber-camp/`. The adventure, farm camp, Hale, levels, saving, world, people and tunnel checks still pass. The farm camp check's control swing now swings again when a thug guards it, since thugs guard about a third of swings.

Calls **taken on Tom's behalf**, to revisit:

- **The archer stands north of the camp**, not south as the spec says. That's where round two of the `?camp` prototype actually put them (its comment said south). The south of the clearing is the stream bank, and the archer's spot to the north looks out over the woods the camp road comes through.
- **The log pile's thug stands on the pile's dry side.** The prototype had them on the stream bank, where the ground slopes too much for a post.
- **The tent is solid, and you reach in from the doorway.** A walk-in tent trapped the leader, chasing you, inside it. So the door's flaps are rolled back on two crates stacked just inside, and the orders lie on them, as the spec's "a crate in the leader's tent".
- **The tent moved back about 0.7 m**, so the leader has room before its door. The forest's plants didn't move.
- **Taking the orders plays a parchment rustle and a soft chime**, on top of the buzz, so the find is heard as well as felt.
- **The orders glow a little and a lantern hangs over them**, so they read in the tent's shade.
- **The orders are a touch as an orb's is**: they share the orb's pickup radius rather than having one of their own.
- **Enemies unstick over a stretch of walking**, as above. This touches every enemy's walking, the arena's and the mine's too.

Left for later:

- The patrol on the camp road and the watchtower's camp are ticket 22.
- The camp fire's sound is ticket 30, and its smoke is ticket 32.
- The quest arrow pointing at the lumber camp is ticket 32.
