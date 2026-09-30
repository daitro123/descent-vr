# Characters and choosing a class

Type: grilling
Status: resolved
Blocked by:

## Question

How does a player make a character of a class, keep several, and pick one to play?

- Up to three characters, each with a fixed class (decided in charting). Can two share a class? Do they have names?
- The page before VR: how you pick, make and delete a character, and what `?newgame` becomes.
- What a class looks like on the human body (the warrior's mail and shield, a ranger's hood and bow, a mage's robe), within the budget.
- The save: today one record holds one warrior. How the record grows to several characters and a class, and how today's save migrates (it becomes a warrior).
- Where a new character starts, and whether it's the same for every class.

## Answer

Settled on 2026-09-30 **by Claude on Tom's behalf**: Tom asked for the map to be worked without him, taking the recommended option at every fork. The reasons are under Comments, for him to revisit.

- **Up to three characters, any mix of classes.** Two warriors are fine. A character's class is fixed; to try another class you make another character or delete one.
- **Each character has a name** you type on the page (up to 16 letters), with a suggested name filled in. Names are only for telling characters apart; nothing in the world says them.
- **The page before VR lists your characters** in three slots, each showing the name, class, level and the zone they stand in. The one you played last is picked; pressing a slot picks another, and Enter VR plays the picked one. An empty slot says "New character": press it, pick one of three class cards (a line on how each fights), take or change the name, and it's made. Each filled slot has a small Delete, which asks first, naming the character.
- **`?newgame` opens the new-character form** instead of deleting the save, so older links still do something sensible. With three characters already, it says so and points at Delete.
- **A class shows in your hands and on the gear panel's figure**: the warrior's sword and shield, the ranger's bow, the mage's casting hands. The outfit each class starts in is the Inventory map's starting gear. There's no separate class costume.
- **Every class starts in the same place**, by Marshal Hale at the crossroads, and plays the same quest chain. Whether Oakvale needs anything per class is in the map's fog.
- **The save keeps one record per character**, each holding what today's record holds plus its class and name, and a small roster record holding the slots' order and the last played. Today's save becomes the first character: a warrior, named "Warrior" until renamed on the page. The migration runs on first load and is tested like today's.
- **Rename** is on the page too (press the name). There's no appearance to customise.

## Comments

**2026-09-30, on Tom's behalf:**

- Any mix of classes, rather than one per class: it's single-player, and a second warrior costs nothing.
- Names typed on the page rather than in VR: the page is 2D, so the browser's own keyboard works on the Quest and the desktop alike. A suggested name means you can skip it.
- `?newgame` kept as an alias for making a character, since the README and older links use it; deleting is now a deliberate act on a slot.
- No class costume: the player's body isn't drawn in first person, so looks live in the hands and the gear figure, both of which the Inventory map already owns.
- One record per character plus a roster, rather than one big record: a write for one character can't damage another, and today's one-record code grows into it. Inventory's version bump and this one must land in some order; whichever builds first takes version 2 and the other version 3.
