# 29: Villagers at work

**What to build:** The village is peopled. The innkeeper polishes tankards behind the bar, the smith hammers at the anvil and pumps the bellows, and the farmer leans on a pitchfork by the well looking towards the farm. Each turns their head to follow you when you come near and says a short line over their head that changes as the quest chain moves on. Hale doesn't bark.

**Spec:** Implementation Decisions › Friendly characters (the villagers, barks), Hale's board and the villagers' barks (the barks table). User stories 136–139 and 141.

**Blocked by:** 18 (Marshal Hale and Raiders in the Fields), 20 (The human body), 23 (The inn).

**Status:** ready-for-agent

- [ ] The innkeeper stands behind the inn's bar, the smith at the anvil and the farmer by the well.
- [ ] Each plays a working loop: the smith strikes in bursts of a few blows, turns the piece and pumps the bellows now and then; the innkeeper wipes the bar and polishes a tankard, sets it down and picks up another; the farmer leans on the pitchfork, looks off towards the farm and shifts their weight. The smith's blows are events the sound in ticket 30 can strike on.
- [ ] Each turns their head to follow you within 4 m and goes back to work when you leave.
- [ ] Barks show as text on a small panel over the villager's head when you come within 4 m, facing you, for about 4 s. They don't show again until you've been 10 m away. At most two show at once. Hale doesn't bark.
- [ ] The adventure state answers each villager's bark line for every stage of the chain, as the spec's barks table says.
- [ ] Friendly characters are solid: you can't walk through them.
- [ ] Tests at the adventure-state seam: every villager's bark for every stage. The bark's show-and-rearm rule (4 m, 4 s, 10 m, two at once) is a pure rule with its own test.
- [ ] Checked in headless Chromium: screenshots of each villager at work and barking, for the thread's reply.
- [ ] Every new number is in the game's table of tunables.
