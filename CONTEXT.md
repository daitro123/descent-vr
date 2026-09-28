# Descent VR

A single-player action RPG for VR in the browser, growing into a WoW-style world of zones joined without loading screens. This glossary holds the game's design language.

## Language

**Zone**:
A hand-built outdoor region of the world, joined to its neighbours so the player walks from one into the next.
_Avoid_: map, level (in the code, a zone is a `GameMap` under `src/maps/`)

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
A friendly character who lives in a zone and gives no quests. Oakvale has three: the innkeeper, the smith and the farmer.
_Avoid_: NPC (too broad), townsfolk, civilian

**Bark**:
A short line a friendly character says unasked as you walk near, shown as text over their head. It isn't a conversation, and what it says can change as the quest chain moves on.
_Avoid_: greeting, gossip, chatter, speech bubble

**Quest chain**:
A run of quests where handing one in unlocks the next.
_Avoid_: storyline, questline

**Quest arrow**:
The small arrow beside the objective you're working on that points the way to where it is, as the crow flies.
_Avoid_: waypoint, compass, marker (a marker is the "!" or "?" over a quest giver)

**Hand in**:
Returning a finished quest to its quest giver, which completes it and pays its reward.
_Avoid_: turn in, complete

**Objective**:
One thing a quest asks before it can be handed in: defeat enemies at a place, or find something and pick it up by hand.
_Avoid_: task, goal, requirement

**Behaviour**:
How an enemy fights, and so what it tests in the player: the grunt (reading a swing), the archer (ranged pressure), the brute (an unblockable slam) or the Warden (a boss fight). One behaviour can wear many looks.
_Avoid_: kind, type, class, AI

**Family**:
Who an enemy is, whatever its behaviour: the bandits or the undead. A bandit archer and an undead archer share a behaviour but not a family.
_Avoid_: faction, race, type

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

**Respawn point**:
Where you wake after dying, at full health, with nothing lost. Oakvale has two: the inn's hearth in the village, and just outside the old mine for a death inside it.
_Avoid_: graveyard, checkpoint, spawn

**Interior**:
The inside of a building or a mine you can walk into, part of its zone and entered through its door or mouth without a loading screen. In Oakvale: the inn, the house by the well, and the old mine.
_Avoid_: instance, dungeon (in WoW, a separate copy for a group), room, indoor zone, cell

**Ambience**:
The steady sound of a place that plays under everything else: wind, birds, water, fire. Each zone and each interior has its own, and it changes as you step indoors, go down the mine or cross a seam.
_Avoid_: soundscape, background music, ambient noise
