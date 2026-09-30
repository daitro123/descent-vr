# Descent VR

A single-player action RPG for VR in the browser, growing into a WoW-style world of zones joined without loading screens. This glossary holds the game's design language.

## Language

**Adventure**:
The game at the plain URL: Oakvale and the zones beyond it, with one character that levels up and is saved.
_Avoid_: campaign, story mode, main game

**Arena**:
The wave game in the crypt hall at `?arena`, the combat prototype kept for practising fights. It never touches the Adventure's save.
_Avoid_: practice mode, wave mode, the crypt (the crypt hall is the arena's room; the Warden's hall at the bottom of the old mine is the same hall, built by the same code)

**Zone**:
A hand-built outdoor region of the world, joined to its neighbours so the player walks from one into the next.
_Avoid_: map, level (in the code, a zone is a `Zone` under `src/maps/`, loaded into the `World`)

**Chunk**:
A 40 m square of the world on one grid shared by every zone, built and loaded on its own as you walk. Near you a chunk is at **full detail**; farther out it's a **stand-in** (coarse ground, cheaper trees, no undergrowth); past the fog it isn't loaded at all.
_Avoid_: tile, cell (the ground's 2 m squares are cells), sector, LOD

**Starting zone**:
The zone a new character begins in and levels up through first. Oakvale is the starting zone.
_Avoid_: tutorial, hub

**Seam**:
The border where two zones meet: a line across a pass or a valley, which the player crosses without a loading screen. The land and light of the two zones blend into each other on either side of it.
_Avoid_: portal, transition, loading zone

**Current zone**:
The zone the player is standing in. Neighbouring zones can be loaded and in view without being current; crossing a seam makes the neighbour current.
_Avoid_: active zone, loaded zone

**Quest giver**:
A friendly character who hands out quests and takes them back when they're done.
_Avoid_: NPC (too broad: every friendly character is an NPC), questgiver

**Villager**:
A friendly character who lives in a zone and gives no quests. Oakvale has two: the innkeeper and the farmer (the smith is a trainer).
_Avoid_: NPC (too broad), townsfolk, civilian

**Bark**:
A short line a friendly character says unasked as you walk near, shown as text over their head. It isn't a conversation, and what it says can change as the quest chain moves on.
_Avoid_: greeting, gossip, chatter, speech bubble

**Quest chain**:
A run of quests where handing one in unlocks the next.
_Avoid_: storyline, questline

**Quest arrow**:
The small arrow beside the objective you're working on that points the way to where it is, as the crow flies. With several quests under way, it's on the one you took most recently.
_Avoid_: waypoint, compass, marker (a marker is the "!" or "?" over a quest giver)

**Map board**:
The painted map of the zone on a board at the crossroads, with a red "You are here". It's part of the world: painted once, it never changes and shows no quests.
_Avoid_: minimap, world map, map (a map is any place the game can put you)

**Hand in**:
Returning a finished quest to its quest giver, which completes it and pays its reward.
_Avoid_: turn in, complete

**Objective**:
One thing a quest asks before it can be handed in: defeat enemies at a place, find something and pick it up by hand, gather from a kind of spot, or make a recipe.
_Avoid_: task, goal, requirement

**Behaviour**:
How an enemy fights, and so what it tests in the player: the grunt (reading a swing), the archer (ranged pressure), the brute (an unblockable slam) or the Warden (a boss fight). One behaviour can wear many looks.
_Avoid_: kind, type, class, AI

**Family**:
Who an enemy is, whatever its behaviour: the bandits or the undead. A bandit archer and an undead archer share a behaviour but not a family.
_Avoid_: faction, race, type

**Rooted**, **frozen**, **slowed**:
What an ability can hold an enemy in for a while. Rooted, it can't walk but strikes what's in reach; frozen, it does nothing until the time runs out or a hit breaks it; slowed, it walks and winds up slower by a fraction. Brutes take half; the Warden ignores roots and freezes.
_Avoid_: stun (a stagger is the game's stun), snare, debuff, crowd control

**Human body**:
The one body every person wears, bandits and friendly characters alike, dressed per character. The undead are skeletons instead.
_Avoid_: human model, NPC mesh

**Build**:
A human body's size and shape: average, stout, broad or big.
_Avoid_: body type, size

**Camp**:
A group of enemies that lives at one place and refills some time after it is cleared: the bandits at the farm, at the lumber camp and at the watchtower, and the undead in the mine. A boss is never part of a camp. (The lumber camp is a place; the bandits there are its camp.)
_Avoid_: spawn, pack, mob

**Patrol**:
A small camp that walks a road back and forth instead of waiting at one place.
_Avoid_: roamer, wanderer

**Run**:
Moving at a jog instead of a walk, which you start yourself and only while nothing is fighting you. A pull ends it.
_Avoid_: sprint, dash (the dash is combat's quick dodge step)

**Pull**:
Drawing enemies into a fight: one notices you or is hurt, and brings the rest of its camp that stand near it.
_Avoid_: aggro, agro

**Leash**:
How far a fighting enemy follows you from its post before it gives up, walks home untouchable and heals.
_Avoid_: tether, reset range

**Boss**:
An enemy fought once, at the end of a quest chain, that stays dead once beaten. Oakvale has one: the Warden at the bottom of the mine.
_Avoid_: elite, raid boss, mini-boss

**Level**:
How strong a character or an enemy is. Each level adds the same step of health and damage to both, so a fight against an enemy of your own level feels the same at any level. Oakvale takes a character from level 1 to 5, its **level cap**.
_Avoid_: rank, tier, difficulty

**Character**:
One saved hero of a class, with a name, a level and their progress. A player keeps up to three.
_Avoid_: hero, profile, save slot (a slot is where a character shows on the page), toon

**Roster**:
Your characters, in the order of the page's slots, with the one you played last. The page before VR shows it; Enter VR plays the picked character.
_Avoid_: account, character list, save file

**Class**:
What kind of fighter a character is: a warrior, a ranger or a mage. It decides the character's abilities and talent trees.
_Avoid_: role, archetype, job, spec

**Ability**:
A move a character uses in a fight beyond their plain attacks, like the warrior's War Cry or Earthshaker. Each class has its own.
_Avoid_: skill (too broad: professions have skills too), spell, power, move

**Talent**:
A pick a character makes in their class's talent tree that grants a new ability or changes one they have. Talents are the character's choices; everything else a level brings is the same for everyone.
_Avoid_: perk, feat, skill point

**Attribute**:
A number that describes a character's strength and rises on its own with their level and their gear, never by spending points.
_Avoid_: stat point, characteristic

**Respawn point**:
Where you wake after dying, at full health, with nothing lost. Oakvale has two: the inn's hearth in the village, and just outside the old mine for a death inside it.
_Avoid_: graveyard, checkpoint, spawn

**Interior**:
The inside of a building or a mine you can walk into, part of its zone and entered through its door or mouth without a loading screen. In Oakvale: the inn, the house by the well, and the old mine.
_Avoid_: instance, dungeon (in WoW, a separate copy for a group), room, indoor zone, cell

**Ambience**:
The steady sound of a place that plays under everything else: wind, birds, water, fire. Each zone and each interior has its own, and it changes as you step indoors, go down the mine or cross a seam.
_Avoid_: soundscape, background music, ambient noise

**Place's sound**:
A sound that comes from one spot in a zone, heard only near it: the stream under the bridge, the windmill's creak, the smith's hammer, the inn's hearth. Unlike the ambience it's placed in space, and it stops beyond about 40 m. Places' sounds and the birds' calls are the **ambient sounds**, at most 8 of which play at once.
_Avoid_: emitter, sound source, point sound

**Mix**:
How loud and how muffled each part of the ambience is right now, following the light's cues: behind a shut door the outdoors goes quiet and muffled and the room's fires come up, past the mine's bend the outdoors gives way to the mine's own air, at the crypt's breach the drone rises, and while anything fights you it all dips.
_Avoid_: mixer, ducking, audio state

**Item**:
Anything that can sit in the bag: gear, a consumable, a material, a quest item or junk.
_Avoid_: object, thing, loot (loot is items as they drop)

**Item level**:
The level an item belongs to: the level of the enemy that dropped it, or of the quest that paid it. It sets the item's numbers with its rarity, and you can't wear gear whose item level is above your own level.
_Avoid_: tier, ilvl, gear score

**Quest item**:
An item a quest asks for, kept on the bag's own quest page, taking none of its slots, and gone when the quest is handed in. The leader's orders are one.
_Avoid_: key item, quest object

**Bag**:
What you carry items in, on your back. You reach over your shoulder to pull it round and sort it. It starts with 16 slots.
_Avoid_: backpack, pack, inventory (the inventory is the whole system: bag, gear, belt, coins and stash)

**Gear**:
The items you wear, one in each of seven slots: main hand, off hand, head, chest, hands, legs and feet. A weapon is gear locked to the class that fights with it; armour anyone can wear.
_Avoid_: equipment, kit, outfit

**Belt**:
Two slots at your hips for what you use in the middle of a fight, taken by hand, like a potion you lift to your mouth.
_Avoid_: quick slots, hotbar, holster (the health orbs and level you glance down at are the belt HUD, not the belt)

**Loot**:
Items and coins as they drop from enemies or come out of chests, before you take them. Loot glows in its rarity's colour, and a touch takes it.
_Avoid_: drops, reward (a reward is what a hand-in pays)

**Chest**:
A box standing at one of a zone's places, opened once per character by touching its lid. It holds coins and a green or blue by its area's level, which come out as loot on the ground beside it; it stays open, and empty, for good.
_Avoid_: treasure, lootbox, container (the stash is a chest you keep things in, not one you open once)

**Rarity**:
How good an item is for its level, shown by the colour of its name and its glow: grey (junk), white, green or blue.
_Avoid_: quality, tier, grade

**Junk**:
Grey items that are only worth selling.
_Avoid_: trash, vendor trash

**Coins**:
The one currency. They take no slot in the bag.
_Avoid_: gold, money, currency

**Vendor**:
A friendly character who buys and sells: in Oakvale, the smith (gear, and anything you bring) and the innkeeper (the minor healing potion).
_Avoid_: merchant, shopkeeper, trader

**Wares board**:
A vendor's board, unfolding beside them as you walk up, with what they sell and a **Sold row** of the last six things you sold, to buy back until you leave the zone. You buy by carrying from it into the bag, and sell by carrying onto it.
_Avoid_: shop, store, trade window, buyback tab

**Stash**:
The chest at the inn where you keep items you aren't carrying.
_Avoid_: bank, storage, vault

**Profession**:
A trade a character learns from a trainer and practises by hand between fights: gathering (Mining, Herbalism) or making (Smithing, Alchemy). Every character can learn all of them.
_Avoid_: skill (abilities are what you fight with), job, trade skill, craft (as a noun for the profession)

**Material**:
Something gathered or made to be used up in making something else: ore, an herb, a bar.
_Avoid_: resource (a class's rage, focus or mana), reagent, component, mat

**Gathering spot**:
A fixed place in a zone where a material can be taken by hand, such as a vein of ore or a clump of herbs. It refills some time after it's taken.
_Avoid_: node, resource node, spawn

**Station**:
The place in the world where a making profession is done: the smithy's forge and anvil, the alchemy table.
_Avoid_: crafting bench, workbench

**Trainer**:
A friendly character who teaches a profession, gives its intro quest and sells its recipes. Oakvale has two: the smith (Mining and Smithing) and the herbalist (Herbalism and Alchemy).
_Avoid_: teacher, master, NPC

**Proficiency**:
How practised a character is at one profession: a number that climbs by gathering and making.
_Avoid_: skill, level, experience

**Grade**:
A step of proficiency, from Apprentice through Journeyman and Expert to Artisan, each capped until a trainer teaches the next. Each grade goes with a zone's materials; Oakvale's is Apprentice.
_Avoid_: rank, tier, level
