# 18: Marshal Hale and Raiders in the Fields

**What to build:** Marshal Hale stands at the crossroads with a gold "!" over their head. Walk up and a parchment board unfolds beside them; press "Accept" with a fist or the sword's tip. The tracker at the top left of your view counts "Bandits defeated at the farm: 0/3". Defeat three of the farm's camp, walk back to a gold "?", press "Hand in", and "+80 XP" then "LEVEL 2" float over Hale with a fanfare. Hale then offers The Lumber Camp. Hale is the talk prototype's stand-in until the human body lands (ticket 20).

**Spec:** Implementation Decisions › The adventure state, Hale's board and the villagers' barks (Hale's lines), Friendly characters (Hale), Talking and tracking. User stories 16–29, 34–42.

**Blocked by:** 16 (The farm's camp), 17 (Levels and XP).

**Status:** ready-for-agent

- [ ] The adventure state holds the whole quest chain as data (the spec's table of three quests) with its rules: states _locked_, _offered_, _active_, _ready_ and _handed in_; one active at a time; none dropped or repeated; a kill counts only for the active quest and only if the enemy is of that quest's camp; a pickup counts only while its quest is active; after the chain Hale shows no marker. _(Taken on Tom's behalf: the whole chain goes in now, tested in full at the seam, while each place's part of the world arrives with its own ticket.)_
- [ ] The adventure state answers what Hale shows for every state (the marker, the board's line and buttons, every line from the spec's table) and the tracker (the title, each objective with its count, or "Return to Marshal Hale").
- [ ] Hale stands at (1.5, 4.8), facing north towards the crossroads' centre, turns to face you and waves as you walk up, and is solid. The marker floats about half a metre over their head: a gold "!" while a quest is offered, a grey "?" while one is active, a gold "?" when it's ready.
- [ ] The talk board is the talk prototype's variant A (in history at merge `19ce545`): within about 2.3 m and roughly facing Hale it unfolds beside them on your right, turned to you, with Hale's name, their line and chunky buttons. Either fist or the sword's tip presses, and that hand buzzes. A hand or blade already inside a button when it appears must leave before it can press. It folds when the talk ends or you're about 3.6 m off, and stays shut until you've walked away and come back. "Not now" folds it and leaves the "!".
- [ ] The tracker is the prototype's variant C: top left of your view, lagging your head, the title in gold and one line per objective with its count, or "Return to Marshal Hale". It flashes when you take a quest, make progress or finish, and it's gone while you have no quest.
- [ ] Handing in floats the reward over Hale ("+80 XP", then "LEVEL 2" if it lands one) with a fanfare.
- [ ] Tests at the adventure-state seam: the whole chain on the plain route, with kill and pickup events for places not built yet (level 2 at the first hand-in, 3 at the second, 4 at the dig's brute, 5 and the sword at the last); kill credit (only the quest's own camp, only while active, the lumber camp's patrol doesn't count); the orders only while active; both Lumber Camp objectives in either order; no abandoning or repeating; the marker, board and tracker for every state.
- [ ] Checked in headless Chromium with the emulator: accept, defeat three at the farm, hand in, and see level 2.
- [ ] Every new number (talk distances, the tracker's lag) is in the game's table of tunables.
