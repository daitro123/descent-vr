# Progression, death and saving

Type: grilling
Status: resolved
Blocked by: 05

## Question

How far does Oakvale take a character, and what happens when you die?

- How many levels the zone covers, and what a level gives (health, damage, a new ability).
- Where XP comes from (quests, kills) and roughly how much.
- What an item reward is, given that loot stays light: a better sword or shield, or something else.
- Death in an open zone: respawn in the village, walk back from a graveyard as in WoW, or restart at the last camp? What is lost?
- What the save holds (level, items, quest progress, position) and when it saves.

## Answer

Settled with Tom over three rounds on 2026-09-28; the rounds are under Comments. The numbers are starting points, to tune on the headset.

- **Levels 1 to 5.** A new character starts at level 1, at the crossroads a few steps from Marshal Hale and facing them. Level 5 is Oakvale's cap until a later zone raises it; XP past it is dropped.
- **What a level gives:** 20 more health (100 at level 1, 180 at 5) and 20% more of all the damage you deal. Enemy levels use the same step for their health and damage, so a fight against an enemy of your own level feels like today's arena. The War Cry unlocks at level 2 and the ground slam at 3; the rage orb stays hidden until level 2. Levels 4 and 5 bring only health and damage.
- **Enemy levels:** the farm 1, the lumber camp and the watchtower 2, the mine 3 near its mouth and 4 deeper in, the Warden 5 (and the skeletons it raises). The Warden's level-1 health drops from 1100 to 600, about 1100 at level 5.
- **XP** comes from quests and kills. Levels 2, 3, 4 and 5 need 100, 200, 300 and 400 more (1000 in all). A kill pays 10 XP per enemy level, triple for the leader, the mine's brutes and the Warden, and nothing for the skeletons the Warden raises. The quests pay 80, 120 and 300. On the plain route that lands level 2 at the first hand-in, 3 at the second, 4 inside the mine, and 5 at the last hand-in with the sword; recheck once [The mine inside](09-the-mine-inside.md) sets its counts.
- **The item:** What Lies Below pays Marshal Hale's own old longsword (a placeholder name), with a darker blade and a gilded guard. It deals 20% more damage and handles exactly like today's sword. It replaces your sword on the spot: no inventory, no equipping.
- **No other loot.** Enemies drop only healing orbs, as today. Loot can come back with a later zone that needs it.
- **Healing:** after 5 s without taking or dealing damage, health refills to full over about 10 s. Each orb heals a quarter of your health. Levelling up fills your health too.
- **Death:** the view fades to black and you wake at a **respawn point** with full health and no rage: in the village, or just outside the mine's mouth if you died inside the mine. Nothing is lost (no XP, no sword, no quest progress); the walk back is the price. Enemies that were fighting you go back to their places at full health, and the ones you killed stay dead until their camp refills. The Warden resets as [The zone's enemies](02-the-zones-enemies.md) says.
- **The save** (IndexedDB, per [Saving in the Quest browser](05-saving-in-the-quest-browser.md)) holds the level, XP, which sword you carry, each quest's state (kills counted, the orders picked up, whether the Warden is beaten) and where you stand. Health, rage and the camps aren't saved: you load where you last stood with full health, no rage, and every camp full. It saves on every quest change, level-up, new sword and zone crossing, every 30 s, and when the page is hidden or you leave VR.
- **One character, one save.** Oakvale becomes the game at the plain URL, and `?newgame` wipes the save after you confirm. The arena moves to `?arena` (with `?duel` and `?wave`) as a practice mode that never touches the save. A "start over" button can join a menu once quest tracking brings one.
- **Seeing it:** the belt gains your level number and a thin XP bar between the health and rage orbs. Each kill floats "+20 XP" where the enemy fell. Levelling up shows "LEVEL 3" with a sound and names anything it unlocked ("War Cry: press A or X").

## Comments

**2026-09-28:** [The quest chain](01-the-quest-chain.md) is resolved. All three quests pay XP and only the last one, What Lies Below, also pays the item. Only one quest is active at a time and none can be dropped or repeated, and the mine's final enemy stays dead once beaten, so the save needs that flag too.

**2026-09-28:** [The zone's enemies](02-the-zones-enemies.md) is resolved. Each place has an enemy level that sets health and damage, rising from the farm, to the lumber camp and the watchtower, to the mine, with the Warden highest; this ticket sets the numbers. The Warden's health (1100) was tuned for the arena's last wave and needs retuning for the zone. Every camp refills after it is cleared, so kills are always on offer if they pay XP. No names or levels show over enemies.

**2026-09-28, round 1 (Tom took every recommendation):**

- Levels: Oakvale takes a character from level 1 to 5, and 5 is the cap until a later zone raises it. About one level per place, so each step up is felt.
- What a level gives: 20 more health and 20% more damage. Enemy levels use the same step, so a fight against an enemy of your own level feels like today's arena. The War Cry and the ground slam unlock on the way up instead of being there from the start.
- XP comes from quests and kills. Kills pay a little, more for higher-level enemies; quests pay the bigger share. Camps refill, so the watchtower lookout and a second pass through a camp are worth something, and the cap stops grinding from going anywhere.
- The item What Lies Below pays is a better sword: a new look, the same length, weight and handling, and more damage. The marshal hands it over and it replaces the old sword on the spot. No inventory and no equipping.
- Death: the view fades to black and you wake in the village with full health and no rage, or just outside the mine's mouth if you died inside the mine. Nothing is lost (no XP, no sword, no quest progress); the walk back is the price. Enemies that were fighting you go back to their places at full health, and the ones you killed stay dead until their camp refills.
- Healing: after 5 s without taking or dealing damage, health refills to full over about 10 s. Orbs keep dropping as today, and each heals a quarter of your health rather than a flat 25.

**2026-09-28, round 2 (Tom took every recommendation):**

- Enemy levels: the farm 1, the lumber camp and the watchtower 2, the mine 3 near its mouth and 4 deeper in, the Warden 5. The skeletons the Warden raises share its level. The Warden's level-1 health drops from 1100 to 600, which comes to about 1100 at level 5, while you arrive hitting 60% harder than a level-1 character.
- XP, as starting numbers: levels 2, 3, 4 and 5 need 100, 200, 300 and 400 more (1000 in all), and XP past the cap is dropped. A kill pays 10 XP per enemy level; the leader, the mine's brutes and the Warden pay triple; the skeletons the Warden raises pay nothing, since a reset would let you farm them. The quests pay 80, 120 and 300. On the plain route that lands level 2 at the first hand-in, 3 at the second, 4 inside the mine, and 5 at the last hand-in together with the sword. The spec re-checks the mine once [The mine inside](09-the-mine-inside.md) sets its counts.
- Rage abilities: the War Cry unlocks at level 2 (a button press, for when the lumber camp's seven close in), the ground slam at 3 (a harder move, for the mine's crowds). The rage orb stays hidden until level 2. Levels 4 and 5 bring only health and damage.
- The sword: Marshal Hale's own old longsword, with a darker blade and a gilded guard, dealing 20% more damage (worth one level) and handling exactly like today's. The name is a placeholder.
- Loot beyond quest rewards: nothing but healing orbs. There's no inventory and nowhere to spend coins; loot can come back with a later zone that needs it.
- The save holds the level, XP, which sword you carry, each quest's state (kills counted, the orders picked up, whether the Warden is beaten) and where you stand. Health, rage and the camps aren't saved: you load where you last stood with full health, no rage, and every camp full. It saves on every quest change, level-up, new sword and zone crossing, every 30 s, and when the page is hidden or you leave VR.
- One character, one save. Oakvale becomes the game at the plain URL; `?newgame` wipes the save after you confirm. The arena moves to `?arena` (with `?duel` and `?wave`) as a practice mode that never touches the save. A "start over" button can join a menu once quest tracking brings one.
- Seeing it: the belt gains your level number and a thin XP bar between the health and rage orbs. Each kill floats "+20 XP" where the enemy fell. Levelling up shows "LEVEL 3" with a sound, fills your health, and names anything it unlocked ("War Cry: press A or X").

**2026-09-28, round 3 (Tom took the recommendation):**

- A new character starts at the crossroads, a few steps from Marshal Hale and facing them, not on the southern road where walk mode starts today. The first quest is right there, the village is also where you wake after dying, and the south stays unseen until the marshal's last line sends you that way.

**2026-09-28:** [Interiors](08-interiors.md) is resolved (by Claude on Tom's behalf). The village respawn point is now the inn's hearth: you wake by the fire inside the inn with the door shut, then walk out. A save made indoors loads you indoors. The respawn point by the mine and the new character's start by Marshal Hale are unchanged.
