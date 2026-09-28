# 17: Levels and XP

**What to build:** Kills pay XP, and you climb from level 1 towards 5. Each level adds 20 health and 20% damage, and an enemy of a level takes the same step. "+10 XP" floats where a bandit falls; "LEVEL 2" plays with a sound and names what it unlocked; the belt shows your level and a thin XP bar. The War Cry and rage wait for level 2 and the ground slam for level 3. This ticket starts the **adventure state**, the pure module of progress the rest of the chain builds on.

**Spec:** Implementation Decisions › The adventure state (numbers and unlocks), Enemies, The player, Talking and tracking (floating text, the belt). User stories 74–84.

**Blocked by:** 16 (The farm's camp).

**Status:** ready-for-agent

- [ ] A new adventure state module with no three.js in it: events in, effects and answers out. This ticket gives it level, XP and XP to the next level; maximum health; the damage multiplier; the unlocked abilities; and the kill event (the enemy's level and role: ordinary, leader, deep brute, the Warden, or raised by the Warden), whose effects are the XP gained and any levels reached with what they unlock.
- [ ] The numbers: maximum health 100 + 20 per level above 1; damage × (1 + 0.2 per level above 1); levels at 100, 300, 600 and 1,000 XP in all; XP past 1,000 is dropped; a kill pays 10 XP per enemy level, triple for the leader, the deep brutes and the Warden, and nothing for skeletons the Warden raises.
- [ ] Making an enemy takes its behaviour, its level and whether it's in a camp: health and damage × (1 + 0.2 per level above 1), then × 1.4 in a camp. The arena builds its enemies through the same code at level 1 with no camp multiplier, so it plays as today. The farm's camp is level 1.
- [ ] The player's maximum health and damage multiplier come from the adventure state. The War Cry needs level 2 and Earthshaker level 3; before that their inputs do nothing, and rage builds only once the War Cry is unlocked. In the arena everything is unlocked at level 1, as today.
- [ ] "+N XP" floats in gold where an enemy fell. A level-up shows "LEVEL N" with a sound and a line per unlock ("War Cry: press A or X", "Earthshaker: drive your sword's tip into the ground"), and fills your health.
- [ ] The Adventure's belt shows the level number and a thin XP bar between the health and rage orbs. The rage orb and each ability's pips appear once unlocked; the dash cooldown stays. The arena's belt is unchanged.
- [ ] Tests at the adventure-state seam: health and damage per level; enemies' numbers per level, in and out of camps; kill XP by role; the cap dropping XP; unlocks at 2 and 3; a level-up's effects naming its unlocks.
- [ ] Checked in headless Chromium: killing the farm's camp at level 1 pays 40 XP and shows the floats.
- [ ] Every new number is in the game's table of tunables.
