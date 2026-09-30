# Spec: The inventory

Status: ready-for-agent

Written on 2026-09-30 from the [inventory map](map.md) and its seven resolved tickets, **by Claude on Tom's behalf**: Tom asked for the rest of the map to run without his input, taking the recommended options. Where the map left a detail to the spec, the call made here is marked _(spec, on Tom's behalf)_, and every such call is listed under Further Notes so he can revisit it. Every number is a starting point, to tune on the headset. Every item name is a placeholder, cheap to change.

The glossary is `CONTEXT.md`. This spec uses its words: **item**, **item level**, **quest item**, **bag**, **gear**, **belt**, **loot**, **rarity**, **junk**, **coins**, **vendor** and **stash**, and from the sibling maps **class**, **attribute**, **material** and **station**.

## Problem Statement

Everything you own in Descent VR is what's in your hands. The warrior holds a sword and a shield. The only reward that isn't XP is Hale's old longsword, which swaps into your hand at the last hand-in. Enemies drop only healing orbs, and the leader's orders are a tick on the tracker, not something you carry. Oakvale's spec ruled out loot, coins and equipping on purpose, to keep the first zone small.

The game is now growing classes (warrior, ranger and mage), attributes that rise with gear, and professions that gather materials and make potions. All of those need somewhere to keep things, something to wear, and a reason to open a bandit's pouch. Tom wants the WoW loop: kill, loot, compare, equip, sell the junk, buy a potion. It has to be done the way VR does it best, by hand, without a menu you point a laser at, and without pausing a world that keeps fighting you.

## Solution

Every character carries a **bag** on their back, wears **gear** in seven slots, keeps two potions on a **belt** at the hips, and has a purse of **coins**.

Reach over either shoulder and squeeze the grip, and your bag swings round into a panel in front of you. Sixteen slots sit on the right. On the left is a small figure of you wearing your seven pieces of gear. Touch an item with a fist or your weapon's tip and its card shows its name in its rarity's colour, its numbers, and how it compares with what you wear. Squeeze the grip and it sticks to your fist or blade. Let go over a gear slot to wear it, over another slot to move it, or away from the panel to drop it on the ground. The world doesn't stop while you sort. Reach over your shoulder again, or walk away, and the bag closes.

In a fight, reach down to a hip and squeeze: a flask comes into your hand, and the weapon in that hand fades away until you're done. Lift it to your mouth, hold it there a moment, and it's drunk with a gulp and a pulse; pull away early and you keep it. The slot refills from the bag.

Enemies drop a small pouch where they fall. It glows in the colour of the best thing inside it, and green and blue loot throws a thin beam of light up so you can see it across a camp. Touch it and the coins are yours, and the items go into your bag. Grey junk sells; white, green and blue gear is better the rarer it is, and the numbers of an item come from its **item level** and its rarity by one rule. You can't wear gear above your own level. Weapons and off hands belong to one class; armour anyone can wear, and each piece carries Stamina and the attribute that suits a class.

In Oakvale, the smith's and the innkeeper's **wares boards** unfold beside them as Hale's board does. Buy by carrying an item into your bag, and sell by carrying one onto their board. Hale's hand-ins each offer a pick of two items that fit your class; What Lies Below offers a blue, and for a warrior that's still Hale's old longsword. Three chests wait to be found: at the top of the watchtower, in the leader's tent, and the strongbox at the bandits' dig. A chest by the Golden Tankard's hearth opens your **stash**, and every inn's chest opens the same one.

## User Stories

### The bag

1. As a player, I want a bag on my back that I reach for over either shoulder, so that I never need a button or a menu to see what I carry.
2. As a player, I want the bag to open only when my hand is slow and I squeeze the grip with my hand already over my shoulder, so that an overhead chop never opens it by mistake.
3. As a player, I want a light buzz while my hand is in the reach zone and a stronger pulse as the bag opens, so that I can find it without looking.
4. As a player, I want the panel to appear once in front of my chest and stay put, turning round to me only if I turn well away, so that it doesn't swim when I look around.
5. As a player, I want the bag to close when I reach over my shoulder again or walk away from it, so that closing it is as natural as opening it.
6. As a player, I want the world to keep going while the bag is open, so that sorting my bag in the middle of a camp is my own risk, as in WoW.
7. As a player, I want sixteen slots to start with, so that I have to choose what's worth carrying.
8. As a player, I want potions, materials and junk to stack (10, 20 and 10 to a slot), so that a few kinds of small things don't fill my bag.
9. As a player, I want coins to take no slot, so that money never crowds out loot.
10. As a player, I want quest items on their own page of the bag, taking no slot, so that a full bag never stops a quest.
11. As a player, I want to touch an item with a fist or my weapon's tip to see its card, so that I never let go of my weapon to read something.
12. As a player, I want to squeeze the grip on an item to pick it up, with its model stuck to my fist or blade, so that I see what I'm carrying.
13. As a player, I want to let go over a slot to put an item there, so that moving things is one motion.
14. As a player, I want to let go over a gear slot or over the figure of me to wear an item, with what I wore going back into the item's old slot, so that swapping gear is one motion.
15. As a player, I want a slot an item can't go in to turn red under it and refuse with a strong buzz, so that I learn the rules by feel.
16. As a player, I want to let go of an item away from the panel to drop it on the ground, where I can pick it up again until I leave, so that I can make room and change my mind.
17. As a player, I want quest items never to be dropped, sold or stashed, so that I can't lose what a quest needs.
18. As a player, I want the panel to show my coins, so that I know what I can afford.

### Gear and its numbers

19. As a player, I want seven gear slots (main hand, off hand, head, chest, hands, legs, feet), so that gear has variety without clutter.
20. As a player, I want my weapon, my off hand and my gloves to show on my own hands, and the rest on the figure of me, so that I see what I wear where I can see it.
21. As a player, I want an item's card to show its name in its rarity's colour, its slot, its item level and its numbers, so that I can judge it at a glance.
22. As a player, I want each number on the card marked + in green or − in red against what I wear in that slot, with that slot lit on the panel, so that comparing is instant.
23. As a player, I want gear above my level to show its level in red and refuse to go into a gear slot, so that I can carry an upgrade until I'm ready for it.
24. As a player, I want weapons and off hands locked to their class, named on the card in red if it isn't mine, so that I understand why I can't wear them.
25. As a player, I want armour anyone can wear, with a main attribute that isn't mine shown greyed on the card, so that I know it does little for me.
26. As a player, I want a weapon's damage rating to add to my damage, so that a better weapon hits harder.
27. As a player, I want armour on each piece and on the shield to cut the damage I take, so that better armour keeps me alive longer.
28. As a player, I want greens and blues to carry Stamina and my class's main attribute, feeding my health and damage as the Abilities map defines, so that gear grows my character.
29. As a player, I want grey items to be junk, only worth selling, so that I know at a glance what to sell.
30. As a player, I want a blue to be clearly better than a green of the same level, so that a blue is exciting.

### The belt

31. As a player, I want two slots at my hips, placed from my head so they're always where I reach, so that I can find a potion without looking.
32. As a player, I want each slot to show a small flask with a count, glowing and ticking the controller when my hand is near, so that I know it's there and what's left.
33. As a player, I want to squeeze the grip at a slot to take a flask with the hand beside it, while that hand's weapon fades out until I'm done, so that I can drink without dropping anything.
34. As a player, I want to drink by holding the flask at my mouth for about 0.7 s, with a buzz, two gulps and a pulse, so that drinking feels like drinking.
35. As a player, I want pulling away early to keep the potion, and letting go of the grip to put it back, so that a bad moment never wastes one.
36. As a player, I want a minor healing potion to heal 40% of my health, so that it's worth more than an orb (25%).
37. As a player, I want all my belt's potions to dim for 60 s after I drink any of them, so that potions are a reserve, not a spam.
38. As a player, I want a slot to refill from its stack in the bag without asking, so that I don't sort mid-fight.
39. As a player, I want to put a potion on the belt by carrying it from the bag onto a hip slot or onto the figure's belt, so that I choose what I carry into a fight.

### Loot

40. As a player, I want a small pouch where an enemy falls, glowing in the colour of the best thing in it, so that I know at a glance whether it's worth walking over.
41. As a player, I want green and blue loot to raise a thin beam of its colour, so that I can spot it across a camp.
42. As a player, I want to touch the pouch to take the coins and each item to put it in my bag, with a buzz and a sound, so that looting is one reach.
43. As a player, I want every enemy to drop some coins, ordinary ones to sometimes drop junk or a white or green, and leaders and deep brutes always to drop a green or a blue, so that tougher enemies pay better.
44. As a player, I want the Warden to drop a blue and a green each time it's beaten, so that the boss feels like a boss.
45. As a player, I want loot's item level to be the enemy's level, and gear drops only for my class, so that what drops is always useful to me.
46. As a player, I want the skeletons the Warden raises to drop nothing, so that loot matches XP.
47. As a player, I want loot to lie for five minutes, even through my death, so that I can come back for it.
48. As a player, I want an item I can't fit to stay on the ground flashing red with "Bag full", so that I never lose it silently.
49. As a player, I want healing orbs to keep dropping as today, so that fights keep their pace.
50. As a player, I want chests at a zone's places of interest that I open by touching the lid, each holding coins and a green (sometimes a blue), opening once per character, so that exploring pays.

### Vendors and the stash

51. As a player, I want a vendor's wares board to unfold beside them as I walk up, with my bag panel opening beside it, so that trading needs no reach and no menu.
52. As a player, I want to buy by carrying an item from the wares board into my bag and sell by carrying one onto the board, so that trading uses the same motion as sorting.
53. As a player, I want each card to show the price, and what I can't afford to sit dimmed and refuse, so that I never buy by mistake.
54. As a player, I want a "Sell junk" button that sells every grey at once, so that selling junk is one press.
55. As a player, I want the last six things I sold waiting in a "Sold" row to buy back at the price I got, until I leave the zone, so that a mistake is cheap.
56. As a player, I want the smith to sell white gear for every class and slot at the zone's levels and to buy anything, and the innkeeper to sell the minor healing potion, so that each vendor fits who they are.
57. As a player, I want vendors' stock never to run out, so that I don't have to wait.
58. As a player, I want a chest by the inn's hearth that opens a 32-slot stash beside my bag, the same stash from every inn, so that I can keep things I don't carry.

### Oakvale

59. As a new character of any class, I want to start in a worn tunic and boots with my class's white weapon and off hand, and three minor healing potions on my belt, so that I start equipped but with room to grow.
60. As a player, I want each of Hale's hand-ins to offer me a pick of two items that fit my class, carried from their board into my bag, so that I choose my reward.
61. As a warrior, I want What Lies Below to still offer Hale's old longsword, now a blue of item level 5, so that the story's reward survives.
62. As a ranger or a mage, I want What Lies Below to offer a blue weapon of my own class, so that the last quest pays me as well as a warrior.
63. As a player, I want Hale's sword to leave their hip only if a warrior takes it, so that the world agrees who has it.
64. As a player, I want the leader's orders to go on the quest page when I touch them in the tent, and to be gone at the hand-in, so that the story's item is something I carry.
65. As a player, I want three chests in Oakvale (the watchtower's top, the leader's tent, the strongbox at the dig), so that the zone rewards looking around.
66. As a returning player from before the inventory, I want my character to become a warrior wearing the starting kit with the sword I had, so that nothing I earned is lost.

### Saving

67. As a player, I want my bag, gear, belt, coins, stash and opened chests saved with my character, so that I load exactly as I left.
68. As a player, I want the game to save when I equip, buy, sell, loot an item, open a chest or change the stash, as it saves on quest changes today, so that a dead battery loses nothing.
69. As a player, I want loot lying on the ground not to be saved, so that saving stays simple (it's gone on reload, like a camp's state).

## Implementation Decisions

### The item catalogue and the rule

- **An item is data**: an id, a name, a kind (gear, consumable, material, quest item, junk), a gear slot if it's gear, a class lock for weapons and off hands, an item level, a rarity (grey, white, green, blue), a model and an icon cell in the atlas. Gear also says which attributes it carries: Stamina, and one main attribute (Strength, Agility or Intellect). Consumables and materials carry their stack size and their fixed sell price.
- **Numbers come from one rule, not per item:** item level and rarity give a piece's damage rating, armour and attribute points.
  - Whites carry only damage or armour.
  - Greens add attributes, sized to the Abilities map's budget: a full level-matched green set adds about a third to the level's attributes by level 10, about 8 Stamina and 8 main over seven slots.
  - A blue is about 1.5 times a green.
  - A blue weapon of your level adds about one level's damage step (Hale's longsword's +20% today, which the Abilities map counts as 2 Strength). A white adds a little.
  - Armour cuts damage taken by a share that rises with the armour total against the attacker's level. The curve is tuned so a full level-matched white set cuts about 10% and a green set about 15% _(spec, on Tom's behalf)_.
  All of it lives in the game's one table of tunables.
- **The class lock** applies to the main and off hand. Armour has none. A main attribute that isn't your class's does nothing for you (the Abilities map).
- **Sell prices by rule:** item level × 2, 3, 8 or 20 coins by rarity (grey, white, green, blue). Consumables and materials have fixed prices. A vendor sells at 4 times what they'd pay.
- **Oakvale's items** are listed in [Oakvale's items](issues/07-oakvales-items.md): each class's white kit, the hand-in picks (greens at item levels 2 and 3, blues at 5), the smith's white stock, and a small table of junk per family (bandit trinkets and torn cloth; undead bone charms and grave dust). Professions adds its materials, consumables and crafted gear to the same catalogue.

### The inventory state

- **A pure inventory module** holds one character's bag (16 slots and the quest page), gear (7 slots), belt (2 slots), coins and stash (32 slots). It answers "can this go there" and applies moves, with no DOM, no Three.js and no XR, like the adventure state. Its operations:
  - move an item between any two places (bag slot, gear slot, belt slot, stash slot, the ground);
  - take loot or a reward in, reporting what didn't fit;
  - buy, sell and buy back;
  - drink from a belt slot and refill it from the bag's stacks;
  - sell all junk.
  Each operation returns its **effects** (a changed slot, a changed number, a refusal and why) for the view to show, as the adventure state returns effects today.
- **Refusals are values, not exceptions:** the wrong class, too high a level, a slot of the wrong kind, a full bag, too few coins, a quest item leaving the bag. The view turns each into the red slot and the strong buzz.
- **The character's numbers read from it:** maximum health and damage come from level plus worn gear through the Abilities map's attributes. Armour comes from worn gear, and the belt's cooldown from the last drink. **The `sword` field goes away:** the main hand's item decides the weapon's model and damage. This replaces today's `statsAt(level, sword)` with an answer that also takes the worn gear.
- **Loot rolls are seeded** by the camp, the enemy and the time, so tests are deterministic. The roll takes the enemy's level, its role and your class. The role table:

  | Role | Coins | Junk | Gear |
  | --- | --- | --- | --- |
  | Ordinary | 1 to 4 × level | 40% | 8% white, 3% green |
  | Leader, deep brute | 3 × that | 60% | always: 75% green, 25% blue |
  | Boss | 10 × that | none | a blue and a green |
  | Raised | nothing | nothing | nothing |

  A kill rolls at most one piece of gear, bosses aside. Gear drops only for your class, and armour is open to all.
- **Chests** are placed in the zone's plan beside its places. Each holds 5 × the area's level in coins and a green (a blue 20% of the time), rolled once when opened and remembered as opened.

### The view in VR

- **The bag panel** is prototype A's (on `main` at `?bag`, in history at PR #64), promoted into the Adventure.
  - **The reach:** an 18 cm sphere over each shoulder, 20 cm out, 14 cm down and 12 cm back from the eyes, placed from the headset's position and yaw. The grip must go down inside it, with the hand under 1.5 m/s.
  - **The panel:** placed once, 45 cm out and 28 cm below the eyes. It turns only past 60°, and closes on the same reach or 1.5 m away. Sixteen bag slots in a 4 × 4 grid on the right, and the figure with its seven gear slots on the left. Slots are 6 cm, 7.2 cm apart.
  - **Moving items:** icons from one atlas (one draw for every icon); the item you carry is shown as its model. A fist or the weapon's tip touching an item shows its card, and the grip carries it. A release counts within 5 cm of a slot's centre.
  - **Pages and coins:** the panel gains a page switch for the quest page and the Abilities map's talent page, as tabs along its top pressed like the talk board's buttons _(spec, on Tom's behalf)_. The coin count sits under the bag grid.
  - **Draw calls:** the panel costs about 4 draws an eye, plus 1 for the card and 1 for a carried item.
- **The belt** is prototype (a) of [The belt and drinking a potion](issues/04-the-belt-and-drinking-a-potion.md), on `main` at `?belt`, promoted into the Adventure.
  - **The slots:** two hang from the neck point (10 cm below and 8 cm behind the eyes), 60 cm below it, 19 cm to each side and 12 cm ahead. They turn with you only past about 30°, glowing and ticking within 12 cm.
  - **Taking and drinking:** the grip takes a flask, and the weapon in that hand fades over 0.15 s and can't hit or block while it's gone. Hold the flask within 15 cm of the mouth point (13 cm below and 10 cm in front of the eyes) for 0.7 s. A hand moving over 1 m/s pauses the drink.
  - **The belt HUD** stays between the slots. While the 60 s cooldown runs, the flasks dim and a thin ring on each drains.
  - **Professions' tool loop** is a third zone of the same mechanics, behind the main-hand hip, built by the Professions map.
- **Loot on the ground:**
  - One pouch per kill with coins, and each item as its own small model beside it, with a rim glow in its rarity's colour from an emissive term and no light.
  - Green and blue items raise an unlit, additive beam about 2 m high, one draw call each.
  - At most 12 drops lie in the world; past that the oldest goes, and a drop lasts 5 minutes.
  - Touching works as an orb does, with the orb's pickup radius.
  - An item that doesn't fit flashes red and floats "Bag full" in the floating text's style.
- **Wares boards** are the talk board's frame with a grid of the vendor's stock and a Sold row, using the bag panel's slots and cards. The bag panel opens beside a wares board on its own. "Sell junk" is a talk-board button.
- **The stash panel** is a bag panel of 32 slots in two pages, opened by touching the stash chest's lid, beside the bag panel.
- **Hale's board** gains a reward row at a hand-in: the pick of items, carried into the bag like a vendor's wares. Picking one hands the quest in. If the bag is full, the pick waits on the board until there's room, and the quest waits with it.
- **Hands show their gear:** the main hand's and off hand's models follow the worn items. Gloves tint the hands' models. The rest shows only on the figure.
- **Every new number** goes into the one table of tunables, grouped (bag, belt, loot, vendors, items), as every number is today.

### Saving

- **The inventory is saved per character**, in the Abilities map's per-character record once its roster lands, or in the current single record otherwise. The first of the three maps to build bumps the version, and each later one bumps it again with its own migration. The shape the inventory adds:
  - the bag's slots, each an item id and a count;
  - the quest page;
  - the seven gear slots;
  - the two belt slots;
  - coins;
  - the stash's 32 slots;
  - the chests opened, by id;
  - the time left on the potion cooldown.
- **The migration from version 1** replaces `sword` with the warrior's starting kit, wearing the plain sword or Hale's old longsword as the main hand, adds three minor healing potions on the belt and 0 coins, and gives no retroactive rewards. An item id the catalogue no longer knows is dropped on load, not a failed read _(spec, on Tom's behalf)_.
- **It writes** on every equip, move into or out of the gear or belt, loot taken, purchase, sale, chest opened and stash change, through the existing save controller (one write in flight, the latest wins). Loot on the ground isn't saved.

### Prototypes

- `?bag` and `?belt` stay on `main` as they are, marked PROTOTYPE, so Tom can compare variants on the headset. The build reuses their code by moving what's kept into the real modules; the prototypes then import from there or keep their own copies. Removing them is Tom's call later.

## Testing Decisions

- **A good test drives a module through its interface and checks what a player would notice:** what's in a slot, what a number became, what was refused and why, what dropped, what a coin total is. It never reads private fields. Anything random is seeded. Tests run in Vitest with no browser, WebGL or XR, as today.
- **The seams** _(the skill's check with the user, taken on Tom's behalf)_: one new seam and two existing ones.
  1. **The inventory module** (new, the main one): moves and operations in, effects and refusals out. Most stories are tested here.
  2. **The adventure state** (existing): kills now also roll loot, and hand-ins now offer a pick; the character's numbers read gear.
  3. **The save record** (existing): migrations and a round trip through the in-memory store.
- **The inventory module:**
  - Stacking and splitting to each kind's limit.
  - Every refusal: class, level, slot kind, a full bag, coins, quest items.
  - An equip swapping back into the old slot.
  - Selling and buying at the rule's prices, buyback of the last six, and selling all junk.
  - Drinking, the cooldown and the refill.
  - The stash across its pages.
  - Taking loot with a full bag.
- **The rule:** a white, green and blue of the same slot and level come out in order; a full green set matches the Abilities budget at levels 5 and 10; the Hale's longsword blue at level 5 gives today's +20%; armour cuts about 10% (white set) and 15% (green set) at your own level.
- **Loot:** over many seeded rolls, each role's rates land within a tolerance; the Warden always drops a blue and a green; raised skeletons drop nothing; drops are always your class's; item levels equal the enemy's.
- **Oakvale:** each class's starting kit; each hand-in's two picks for each class; the orders on the quest page and gone at the hand-in; the three chests once each; the plain route's coins land roughly in the 300 to 400 range.
- **Saving:** a version-1 record with each sword migrates to the kit wearing it; an unknown item id is dropped; everything round-trips.
- **Not unit-tested:** how things look and feel, the reach, the panel, the belt's hand-off and the drink. These are checked in headless Chromium with the IWER emulator, as the prototypes' `bag.mjs` and `belt.mjs` checks do, and by Tom on the Quest.
- **Prior art:** the adventure state's tests (pure events in, effects out), the saving tests (migrations and the in-memory store), the quest chain tests, and the two prototypes' check scripts.

## Out of Scope

- What each attribute does, each class's weapon handling and abilities, talents and the characters' roster: the Abilities map.
- Gathering, crafting, stations, recipes and the tool loop's build: the Professions map.
- Random stats on items, durability and repair.
- Trading between players and auction houses: the game is single-player.
- Rings, trinkets and other gear slots.
- Bigger bags: the bag stays at 16 slots through Oakvale; the zone that first offers a bigger bag decides where it comes from and how many slots it adds _(spec, on Tom's behalf)_.
- Loot tables for zones after Oakvale.
- The talk-and-tracking UI overhaul Tom plans after Oakvale; the wares boards and the reward row reuse today's talk board.

## Further Notes

Calls made in this spec on Tom's behalf, beyond the map's tickets:

- Armour cuts about 10% of damage taken with a full white set of your level and about 15% with greens.
- The panel's quest and talent pages are tabs along its top.
- A hand-in with a full bag waits on the board with its pick.
- Coins are 1 to 4 × level (the role table's multipliers unchanged), tuned in [ticket 17](issues/17-oakvale-with-the-inventory-in-one-sitting.md) from 1 to 3, which paid the plain route about 275 coins on average, under the 300 to 400 this spec aims for.
- An unknown item id in a save is dropped on load.
- Save versions: each map's build bumps the record's version in turn, with its own migration.
- Bigger bags wait for the zone that first offers one.
- The ranger's and mage's weapon and off-hand names (short bow and quiver; apprentice's wand and glass focus; Hale's old hunting bow; a crypt-warded staff) are placeholders until the Abilities map's "How the ranger fights" and "How the mage fights" settle them. A quiver and a focus carry attributes and no armour until that map gives them more to do.

Things for Tom to check on the headset are listed in each prototype ticket's answer: [The bag and the gear panel](issues/03-the-bag-and-the-gear-panel.md) and [The belt and drinking a potion](issues/04-the-belt-and-drinking-a-potion.md).
