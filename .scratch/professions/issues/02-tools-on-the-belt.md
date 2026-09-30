# Tools on the belt

Type: grilling
Status: resolved
Blocked by: 

## Question

Where do the pick and the herb knife live on your body, and how do you draw and put them away, for every class?

- **What's taken:** Inventory put two potion slots at the hips (grab one and lift it to your mouth) and the bag over your shoulder (reach back and squeeze the grip). Abilities uses gestures, and the warrior's sword and shield fill both hands. A/X, B/Y and the stick click are bound.
- **The choices:** a third place on the belt (the small of the back, a thigh), tools stored in the bag and drawn from its panel, or a tool that appears when you reach into a gathering spot. Whether a tool takes a gear slot, a bag slot, or none.
- **Per class:** the warrior drops the sword but may keep the shield; the ranger's bow takes both hands; the mage's focus is an off hand. Does drawing a tool empty one hand or both, and what comes back when you put it away?
- **In a fight:** charting said you can't gather in a fight. Does a pull snatch the tool back and return your weapon, and how fast?
- **Output:** what Inventory must provide for tools, to send to the Inventory thread.

## Answer

Settled on 2026-09-30 **by Claude on Tom's behalf**: Tom asked for the rest of the map to be worked without him, taking the recommended option each time. Every number is a starting point, to tune on the headset, and every name is a placeholder.


- **Tools come with the profession, not the bag.** Learning Mining hangs a pick on your belt and learning Herbalism hangs a knife beside it. Tools take no bag slot and no gear slot, can't be sold, dropped or lost, and have no stats or rarity. There is nothing to buy or replace.
- **One tool loop, behind the main-hand hip.** It sits about 20 cm behind the potion slot on that side, placed from the headset like Inventory's slots (its height and a smoothed yaw), as a sphere of about 12 cm. It works the way the belt's slots do: the hand must be inside it and moving under about 1.5 m/s, and the grip must go down there. It glows and ticks the controller when the hand enters. It shows the handles of what hangs there, so you can see it on a glance down.
- **The loop gives the tool for the nearest gathering spot.** Within about 3 m of a vein you draw the pick, and within 3 m of herbs you draw the knife. Far from any spot the loop does nothing, so a stray grab while walking never swaps your weapon. Half-Life: Alyx's backpack, which gives the ammo for the gun you hold, is the model: never a choice to make.
- **Only the main hand draws a tool.** Whatever it holds (the warrior's sword, a mage's main-hand weapon) is put away while the tool is in it, and the ranger's empty string hand simply takes it. The off hand keeps its shield, bow or focus. Today the main hand is the right hand; a left-handed setting is Abilities' or the UI overhaul's to add, and the loop follows the main hand wherever it is.
- **Putting it back:** squeeze the grip in the loop again, or walk more than about 5 m from every gathering spot, and your weapon is back in your hand.
- **Never in a fight.** While any enemy is fighting you the loop does nothing. A pull while you hold a tool puts it away and your weapon back in your hand at once, with one buzz, as a pull ends a run.
- **Gestures:** Abilities arms its gestures by holding the grip. A grip pressed inside the loop (or the potion slots, or at the shoulder) is taken by that zone first and never arms a gesture.
- **What Inventory must provide** (sent to the Inventory thread): a third belt zone for the tool loop, built from the same zone mechanics as the potion slots, and nothing else. Tools are not items.
