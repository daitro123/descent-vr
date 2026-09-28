# Progression, death and saving

Type: grilling
Status: claimed
Blocked by: 05

## Question

How far does Oakvale take a character, and what happens when you die?

- How many levels the zone covers, and what a level gives (health, damage, a new ability).
- Where XP comes from (quests, kills) and roughly how much.
- What an item reward is, given that loot stays light: a better sword or shield, or something else.
- Death in an open zone: respawn in the village, walk back from a graveyard as in WoW, or restart at the last camp? What is lost?
- What the save holds (level, items, quest progress, position) and when it saves.

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
