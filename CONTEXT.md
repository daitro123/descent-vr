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
The border where two zones meet, which the player crosses without a loading screen.
_Avoid_: portal, transition, loading zone

**Quest giver**:
A friendly character who hands out quests and takes them back when they're done.
_Avoid_: NPC (too broad: every friendly character is an NPC), questgiver

**Quest chain**:
A run of quests where handing one in unlocks the next.
_Avoid_: storyline, questline

**Hand in**:
Returning a finished quest to its quest giver, which completes it and pays its reward.
_Avoid_: turn in, complete

**Objective**:
One thing a quest asks before it can be handed in: defeat enemies at a place, or find something and pick it up by hand.
_Avoid_: task, goal, requirement
