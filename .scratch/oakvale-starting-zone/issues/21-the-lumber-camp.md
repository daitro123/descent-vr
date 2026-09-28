# 21: The Lumber Camp

**What to build:** Across the bridge, the lumber camp's gang holds the clearing: three thugs, an archer and their big leader with a felling axe, level 2, spread round the fire, the log pile and the tent. Hale's second quest asks you to defeat all five and take the leader's orders from the tent. Touch the rolled parchment with either hand and it's gone, with a buzz and the tracker ticking over. Hand in for 120 XP and level 3.

**Spec:** Implementation Decisions › Camps (the lumber camp), Enemies (the leader), Talking and tracking (the orders). User stories 30–32, 59 (the lumber camp) and 69.

**Blocked by:** 20 (The human body).

**Status:** ready-for-agent

- [ ] Oakvale's plan holds the lumber camp's camp at level 2: a thug where the camp road comes in, one at the fire, one at the log pile, the archer to the south and the leader before the tent, posts on clear ground 5 to 18 m apart inside the clearing. Round two of the `?camp` prototype (merge `1135338`) placed them first.
- [ ] The tent, the log pile, the fire and the fences are colliders, so enemies steer round them.
- [ ] The leader has the brute behaviour with a felling axe in place of the maul. Its slash and slam are checked against a simulated player on the human body and retuned if they fall short (the brute's 1.65 m attack range and 0.5 m body radius were set for the undead brute's bigger body). Its kill pays triple.
- [ ] The orders are a rolled parchment on a crate in the leader's tent. They lie there while the adventure state says so: from when The Lumber Camp is taken until they're picked up, then gone for good. Touching them with either hand, as you touch an orb, picks them up while the quest is active, with a buzz in that hand and "Leader's orders taken: 1/1" on the tracker.
- [ ] The Lumber Camp plays end to end, with its two objectives in either order.
- [ ] Tests: the leader's slash and slam reach a simulated player (the enemy attack tests' pattern); the adventure state answers whether the orders lie in the tent for every state; the lumber camp's posts stand on clear ground inside its clearing.
- [ ] Checked in headless Chromium with the emulator: accept, clear the camp, take the orders, hand in, and see level 3.
- [ ] Every new number is in the game's table of tunables.
