# Spec: Classes, abilities and talents

Status: ready-for-agent

Written on 2026-09-30 from the [abilities map](map.md) and its sixteen resolved tickets, **by Claude on Tom's behalf**: Tom asked for the map to be worked without him, taking the recommended option at every fork. Where the map left a detail to the spec, the call made here is marked _(spec, on Tom's behalf)_ and listed under Further Notes. Every number is a starting point, to tune on the headset. Every name (abilities, talents, trees) is a placeholder, cheap to change.

The glossary is `CONTEXT.md`. This spec uses its words: **character**, **class**, **ability**, **talent**, **attribute**, **level**, **camp**, **pull**, **leash**, **boss**, **behaviour**, and the Inventory map's **gear**, **bag** and **belt**.

## Problem Statement

Descent VR has one way to fight: the warrior's sword and shield. Levels 1 to 5 in Oakvale hand every character the same health, damage and two abilities (the War Cry at 2, Earthshaker at 3), and nothing is ever chosen. There's one save, so one character. Tom wants character development like WoW's: more than one class to play, abilities that grow as you level, and choices in talent trees that make two characters of the same class play differently.

## Solution

A player keeps up to three **characters**, each of a **class**: the warrior, the ranger or the mage. They're made, picked, renamed and deleted on the page before VR.

Each class fights its own way. The warrior keeps today's sword and shield. The ranger holds a bow in the left hand, nocks by touching the string with the right, and draws harder to hit harder; a squeeze of the bow hand raises a ward that stops arrows. The mage charges a bolt at the tip of a wand or staff and throws it, the way you throw shapes the bolt; the off hand's focus raises a ward that blocks like a shield, and B/Y blinks instead of dashing.

Each class has a resource, a bar of 100 on the belt: rage, focus or mana. Plain attacks never spend it; **abilities** do. Levels bring a class's base abilities at 2, 3, 6, 8 and 10. The first is on A/X; most of the rest are drawn in the air: hold the right grip, draw a ring, a Z, a V, a triangle or an S, let go.

From level 2 each level brings a **talent** point to spend in one of the class's two trees, on a page of the bag's panel. Talents change numbers and abilities, and the third tier of each tree grants a new ability. Resetting is free out of a fight.

**Attributes** (Stamina and the class's main attribute) rise with every level and with gear, and make today's health and damage exactly.

Oakvale plays the same for every class; only the rewards differ. The arena lets you pick a class.

## User Stories

### Characters

1. As a player, I want to keep up to three characters, so that I can play more than one class without losing any.
2. As a player, I want to see each character's name, class, level and zone on the page before VR, so that I know which one I'm picking.
3. As a player, I want the character I played last to be picked already, so that Enter VR carries on where I left off.
4. As a player, I want to make a new character in an empty slot by picking a class card and a name, so that starting is quick.
5. As a player, I want a suggested name filled in, so that I can skip naming.
6. As a player, I want two characters of the same class to be allowed, so that I can try both talent trees.
7. As a player, I want to delete a character after a confirmation naming it, so that I don't lose one by accident.
8. As a player, I want to rename a character on the page, so that a hasty name isn't forever.
9. As a player with today's save, I want it to become my first character, a warrior, so that nothing is lost.
10. As a player, I want `?newgame` to open the new-character form, so that old links still make sense.
11. As a player with three characters, I want `?newgame` to tell me to delete one first, so that I understand why nothing was made.
12. As a player, I want every class to start by Marshal Hale, so that every character begins the same chain.

### The warrior

13. As a warrior, I want the sword, the shield, the bash and the dash to stay exactly as they are, so that the class I already know doesn't change.
14. As a warrior, I want the War Cry at level 2 and Earthshaker at 3 as today, so that Oakvale plays as it does.
15. As a warrior at level 6, I want Heroic Throw, so that I can hit an archer I can't reach.
16. As a warrior at level 8, I want Shield Wall, so that I can hold a brute's heavy blows.
17. As a warrior at level 10, I want Sweeping Strikes, so that a knot of enemies all feel my swings.

### The ranger

18. As a ranger, I want to nock an arrow by touching the string and holding the trigger, so that I never fumble for a quiver.
19. As a ranger, I want a fuller draw to hit harder and fly faster, so that a good shot feels good.
20. As a ranger, I want the draw to tick in my hands and pulse on release, so that I feel the bow.
21. As a ranger, I want arrows that never run out, so that I'm never left with nothing to do.
22. As a ranger, I want to squeeze the bow hand's grip to raise a ward that stops arrows and sends a well-timed one back, so that enemy archers aren't hopeless.
23. As a ranger, I want to press A or X while drawing for Power Shot at level 2, so that I can use an ability without letting go of the bow.
24. As a ranger at level 3, I want Snare Trap, so that a grunt closing on me stops long enough to back off.
25. As a ranger at level 6, I want Volley, so that a camp of five takes a fan of arrows.
26. As a ranger at level 8, I want Scatter, so that I can knock back whatever reaches me.
27. As a ranger at level 10, I want Hunter's Mark, so that I can hunt an archer behind cover.
28. As a ranger, I want focus to start full and refill quickly, so that my rhythm is shot, special, shot.

### The mage

29. As a mage, I want to charge a bolt at my wand's tip by holding the trigger and throw it, so that casting feels like magic.
30. As a mage, I want a hard throw to make a small fast bolt and a gentle toss a big slow orb, so that how I throw matters.
31. As a mage, I want a gentle aim assist, so that thrown bolts land where I meant.
32. As a mage, I want the focus in my off hand to raise a ward that blocks and parries like a shield, so that I'm not helpless up close.
33. As a mage, I want B/Y to blink me 3.5 m, so that I can open distance without sliding.
34. As a mage at level 2, I want Frost Nova on A/X, so that I can freeze whatever is about to hit me.
35. As a mage at level 3, I want Fireball, so that my everyday bolt can burn a pack.
36. As a mage at level 6, I want Frostbolt, so that I can slow a leader and keep my distance.
37. As a mage at level 8, I want Chain Lightning, so that one bolt reaches three enemies.
38. As a mage at level 10, I want Blizzard, so that a crowd is slowed and hurt at once.
39. As a mage, I want plain bolts to cost nothing and mana to pay for the ward's blocks and abilities, so that I never stop throwing.
40. As a mage, I want Intellect to grow my mana pool, so that levels and gear buy me longer fights.

### Gestures

41. As a player, I want to hold the right grip, draw a shape and let go to use an ability, so that abilities don't need buttons I don't have.
42. As a player, I want a tick when the grip arms, a faint trail while I draw, and a flash, a sound and the ability's name when it's read, so that I know it worked.
43. As a player, I want a grey puff, a "?" and a double tick when a shape isn't read, and nothing spent, so that a miss costs nothing.
44. As a player, I want "not enough rage" (or focus, or mana) when I can't afford an ability, so that I know why nothing happened.
45. As a warrior, I want no sword swing, thrust or block to ever cast an ability, so that fighting stays fighting.
46. As a player, I want a grip squeezed over my shoulder, at my hips or in the tool loop to never arm a gesture, so that the bag, potions and tools still work.
47. As a player, I want each shape always to cast the ability in its slot, so that the shapes I learn never change meaning.
48. As a player, I want to swap which shape holds which ability on the talent page, so that the shapes suit my hand.
49. As a player learning my first gesture, I want its shape to hang in the air in front of me until I've drawn it once, so that I know what to draw.
50. As a player past level 10, I want to choose which six gesture abilities are ready, out of a fight, so that I never have more shapes than I can remember.

### Talents

51. As a player, I want a talent point every level from 2, so that every level brings a choice.
52. As a player, I want two trees per class of five tiers, a tier opening every 3 points, so that going deep is a commitment.
53. As a player, I want to spend points in both trees if I like, so that hybrids are possible.
54. As a player, I want the third tier of each tree to grant a new ability, so that talents change how I fight, not only my numbers.
55. As a player, I want to spend points when I choose, out of a fight, so that a level-up mid-fight doesn't interrupt me.
56. As a player, I want the level-up's lines to say I have a talent point, so that I don't forget it.
57. As a player, I want the talents on a page of the bag's panel, so that one reach opens everything about my character.
58. As a player, I want to reset every point for free out of a fight, so that trying a build costs nothing.

### Attributes, resources and the belt

59. As a player, I want my health and damage at each level to come out of my Stamina and main attribute, so that gear and levels speak the same language.
60. As a player, I want only Stamina and my class's main attribute to count for me, so that gear is easy to read.
61. As a player, I want the gear panel's figure to show my Stamina and main attribute and the health and damage they make, so that I can see what gear did.
62. As a player, I want the belt's right orb to show my class's resource in its colour (red rage, gold focus, blue mana), so that I read it at a glance.
63. As a player, I want a pip per ability that lights when it's ready and affordable, so that I know what I can use.
64. As a warrior, I want rage to build and drain as today, so that nothing I know changes.

### Levels

65. As a player, I want Oakvale's levels 1 to 5 to stay exactly as built, so that the zone's pace holds.
66. As a player, I want enemies five or more levels below me to pay no XP, so that farming Oakvale later goes nowhere.
67. As a player, I want the level cap to rise only when a zone with quests and camps is added, so that XP never piles up with nothing to spend it on.

### Enemies

68. As a ranger, I want an arrow from 20 m to pull an enemy and whoever of its camp stands near it, so that range opens fights the same way.
69. As a player, I want roots, freezes and slows to show on enemies, so that I know what my abilities did.
70. As a player, I want brutes to shrug off half of a root, freeze or slow, and the Warden to ignore roots and freezes, so that they stay the fights they are.

### Oakvale and the arena

71. As any class, I want the same quest chain, camps and Warden, so that Oakvale is Oakvale.
72. As a ranger or mage, I want What Lies Below to offer my class's weapon, so that the last reward is mine.
73. As a player, I want `?arena&class=ranger` (or mage, or warrior) to put me in the arena as that class with every base ability, so that I can practise.

### Building and testing it

74. As Tom, I want the class prototypes' URL flags to keep working until the classes are built, so that I can compare.
75. As Tom, I want every new number in the game's table of tunables, so that tuning on the headset is one file.
76. As Tom, I want a headless check per class that plays its plain attack and each ability in the arena, so that a change that breaks a class shows up.
77. As Tom, I want the abilities' effects to stay under 10 draw calls and 5,000 triangles in the worst moment, so that the frame rate holds.

## Implementation Decisions

### The adventure state learns classes

- The adventure state (the pure module of progress, no three.js) gains the character's **class**. Every rule that depends on the class reads it from there: the main attribute, the resource, the base abilities per level, the talent trees and the plain kit's numbers.
- **Attributes** replace the per-level step for the player: 10 Stamina and 10 of the class's main attribute at level 1, 2 more of each a level; 10 health a point of Stamina, and 10% of level 1's damage a point of the main attribute. The Inventory map's gear rule already adds worn Stamina and main attribute through the same two numbers, so levels and gear become one sum. Enemies keep the level step (× 1 + 0.2 per level above 1, × 1.4 in a camp).
- **The level curve** continues past 5 as data: level L needs 100 × (L − 1) more XP; the cap is a number the current content sets (5 today). An enemy five or more levels below you pays no XP.
- **Abilities become data per class:** each with its level (or talent), cost, cooldown, how it's used (a button, the Earthshaker rule, or a gesture slot) and its numbers. Today's `Ability` list grows to every class's; `unlocks` becomes per class.
- **Talents are data per class:** two trees, each of tiers holding talents with a maximum of points and what a point does (a number change, or an ability). The state holds points spent per talent and answers: points to spend, which tiers are open, which abilities you have, and your numbers with the talents applied. Events: spend a point, reset all.
- **The gesture slots** are the state's too: which ability each shape holds, filled by default (base abilities to their listed shapes, a tier-3 talent ability to the triangle, later ones to the next free shape), swappable; past six gesture abilities, which six are ready.

### Characters and the save

- The save becomes **one record per character plus a roster record** (the slots' order and the last played). A character's record is today's record plus its class, its name and its talents and slots. The version bumps with a migration: today's record becomes the first character, a warrior named "Warrior". _(Whichever of this and another map's bump lands first takes the next version; the other takes the one after.)_
- **The page before VR** lists the three slots, with New, Delete (confirmed, naming the character) and Rename, and class cards with a line each. The picked slot is what Enter VR loads. `?newgame` opens the new-character form. Class cards show only the classes that are built.
- The arena and `?map=` never read or write the save, as today.

### The ranger

- Promoted from the ranger prototype's kept variant: the bow in the left hand, nocked by touching the string's middle half with the right hand and holding the trigger; a draw under 15% puts the arrow away; damage 6 to 30 and speed 14 to 42 m/s in step with the draw; gravity; head hits at the enemy's multiplier; exposed ×1.5; an enemy's raised guard stops an arrow; unlimited plain arrows; haptics per the prototype.
- The ward on the bow hand's grip: up to 1.2 s, back in 2 s, stops arrows, and sends one back in its first 0.35 s (the warrior's reflect).
- Focus: 100, starts full, 10 a second always. No gesture while an arrow is nocked.
- The bow in hand follows the worn main hand item (the Inventory map's ranger weapons), and the quiver is gear only, never reached into.

### The mage

- Promoted from the mage prototype's kit A: hold a trigger to charge (full in 0.6 s), release mid-throw to cast along the throw; a gentle toss makes a big slow orb (0.2 m, 7 m/s), a hard throw a small fast bolt (0.08 m, 20 m/s); 15° aim assist and gentle homing; 20 damage full, 7 a tap. The bolt gathers at the tip of the worn wand or staff _(ticket 15)_, which carries the damage rating. Either hand's trigger casts.
- The focus's ward on the off hand's grip is the shield to combat: blocks (10 mana), parries (free) and bashes; it won't rise under 10 mana.
- The blink on B/Y: 3.5 m in the stick's direction (back if neutral), every 2.2 s, shown on the dash's bar.
- Mana: 100 plus 2 a point of Intellect over 10; 2 a second while anything fights you, 30 once nothing does. No gesture while the right hand charges.

### Abilities

Every class's base abilities to level 10, and every talent to tier 3, are as the class tickets list them, with their costs, cooldowns and numbers: [the warrior's](issues/11-the-warriors-abilities-and-talents.md), [the ranger's](issues/12-the-rangers-abilities-and-talents.md) and [the mage's](issues/13-the-mages-abilities-and-talents.md). Tiers 4 and 5 and the abilities at 14 and 18 are sketched there and not built.

- Abilities that change "the next" swing, bash, arrow or bolt (Mortal Strike, Shield Slam, Volley, Fireball, Frostbolt, Chain Lightning, Pyroblast) arm a charge that the next plain attack spends; it lapses after its window (3 s for the warrior's, until spent for the rest) _(spec, on Tom's behalf)_.
- Abilities that point somewhere (Heroic Throw, Hunter's Mark, Blizzard) take the direction the right hand faces as the gesture ends, and the nearest enemy within 15° of it where they target one.
- Damage is in level-1 terms and multiplies by your damage like every blow.

### Gestures

- Promoted from the gesture prototype: the recogniser (16 points, direction vectors, banded DTW, per-gesture thresholds, a runner-up margin of 1.2), armed by holding the right grip in every class and read once on release; dropped when longer than 1.6 s, when tracking is lost, or with an arrow nocked or a bolt charging in the right hand; never armed from the shoulder, the hip potion slots or the tool loop.
- The five shapes are ring, Z, V, triangle and S. Every future shape must turn through a corner or a loop.
- Templates: the prototype's, until Tom records his own in the prototype's record mode; recordings are data in the game.
- Feedback as the prototype built it: a light tick on arming, a faint trail, and on a read the trail flashes the ability's colour, a burst leaves the hand with its sound and a strong buzz, and the name floats up with its cost. A miss: a grey puff, "?", two ticks. Unaffordable: a dull buzz and "not enough mana".
- The first time a gesture is unlocked, its shape hangs faintly a metre ahead at chest height until you've drawn it once.

### Talents on the bag's panel

- The bag's panel already has a Talents tab (the Inventory map's build). It shows both trees side by side as a plain first pass: each talent a button with its points and max, locked tiers dimmed, the points left, and a Reset button. Pressing a talent spends a point. It works only out of a fight.
- Below the trees, the gesture slots: each shape with the ability it holds; pressing two swaps them. Past six gesture abilities, a tick on each marks the six that are ready.

### Enemies

- New states on every enemy: **rooted** (no movement, still strikes in reach), **frozen** (no action until it ends or a hit breaks it) and **slowed** (movement and wind-ups slowed by a fraction). Each shows: roots as vines at the feet, a freeze as a pale blue tint and stillness, a slow as a faint frost on the body _(spec, on Tom's behalf)_.
- Brutes take roots and freezes at half length and slows at half strength; the Warden ignores roots and freezes and takes slows at half.
- Pulls by damage from any range and the 30 m leash are unchanged; the leash clock runs through a root or freeze. A frozen enemy doesn't count against the attackers' limit.

### The belt and the level-up

- The belt's right orb shows the class's resource in its colour, with one pip per ability you have, lit when it's off cooldown and affordable; the dash's bar also shows the blink.
- The level-up's lines name each ability it brings with how to use it, and "Talent point: open your talents" from level 2.

### The arena

- `?arena&class=warrior|ranger|mage` (warrior by default) plays at level 1 with every base ability to level 10 and no talents. The class prototypes' flags (`&variant=`, `&kit=`, `&gestures`) keep working until the class they prototype is built, then go.

### Performance

- No new lights: the brightest effect may borrow one of the four pooled lights for up to 0.5 s by moving it. Particles through the shared particle system. Arrows, bolts and thrown axes as one instanced mesh per kind. Lasting effects at most 2 draw calls and 500 triangles each, at most three alive (a fourth ends the oldest). All abilities together under 10 draw calls and 5,000 triangles.

## Testing Decisions

- A good test drives a module through its interface and checks what it answers, never how it works inside. The adventure state stays the main seam: events in (kill, level, spend a talent, reset, swap a slot), effects and answers out (stats, abilities, costs, slots). Prior art: `tests/adventureState.test.ts`, `tests/saving.test.ts`.
- **The adventure state:** attributes per class and level reproducing today's health and damage; gear adding through the same rule; grey enemies paying nothing; the curve past 5 and the cap; abilities per class by level; talent tiers opening at 3, 6, 9 and 12 points; spending, refusing past a tier or a maximum, resetting; tier-3 abilities appearing; default gesture slots and swaps; the six-ready rule.
- **The save:** a version-before record migrates to a roster of one warrior; characters round-trip through the in-memory store; a newer record is left alone.
- **The recogniser:** the prototype's bench as a test: each shape read from sloppy seeded strokes, normal play read as nothing, the zones never arming. Prior art: the prototype's bench.
- **Each class's plain kit and abilities:** at the combat seam where it exists (prior art: `tests/swordSwing.test.ts`, `tests/enemyGuard.test.ts`), plus a headless check per class in the style of `.scratch/abilities/checks/`: plain attack kills a wave-1 grunt, each ability fires and does what it says.
- **Enemy states:** rooted, frozen and slowed at the enemy seam, with brutes' halving and the Warden's immunity (prior art: `tests/bruteStagger.test.ts`).
- **Performance:** `?perf` in the arena with every class's biggest effect up, recorded in the ticket.

## Out of Scope

- Tiers 4 and 5 of every tree and the abilities at 14 and 18: sketched, not built.
- Zones past Oakvale and raising the cap.
- The talent page's final look: Tom's UI overhaul.
- Pets, polymorph and anything needing a four-legged rig.
- Classes beyond the three.
- Changing how the warrior's sword and shield feel.
- Online play.

## Further Notes

Calls made in this spec beyond the tickets, on Tom's behalf:

- "Next attack" abilities keep their charge until spent, except the warrior's 3 s windows the ticket set.
- How roots, freezes and slows look.
- Class cards show only built classes, so the roster can land before the ranger and mage do.
- The arena's class flag replaces the prototypes' flags only once each class is built.
