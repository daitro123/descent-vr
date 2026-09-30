# Oakvale and the arena for every class

Type: grilling
Status: resolved
Blocked by: 03, 11, 12, 13

## Question

What changes in Oakvale and in the arena now that a character can be a ranger or a mage?

- The quest chain, Hale's lines and the rewards.
- Teaching each class's first button ability (level 2) and first gesture (level 3).
- What the mage holds in the main hand, given the Inventory map's wand and staff.
- Which class the arena plays, and at what level.

## Answer

Settled on 2026-09-30 **by Claude on Tom's behalf**, taking the recommended option at every fork.

- **The chain is the same for every class:** the same quests, camps, Warden and lines. Only the rewards differ, and the Inventory map's [Oakvale's items](../../inventory/issues/07-oakvales-items.md) already offers each class its own weapon at What Lies Below.
- **Level 2 teaches the button** with the level-up's lines, as today: "War Cry: press A or X", "Power Shot: press A or X while drawing", "Frost Nova: press A or X".
- **Level 3 teaches the first gesture.** Besides the line ("Earthshaker: drive your sword's tip into the ground" for the warrior; "Snare Trap: hold the right grip, draw a ring, let go" and "Fireball: hold the right grip, draw a ring, let go" for the others), a faint ring of light hangs a metre ahead of you at chest height until you've drawn a ring once. Every later gesture unlock shows its shape the same way.
- **The mage's main hand holds the Inventory map's wand or staff.** A bolt gathers at its tip instead of in the palm, and it's thrown exactly as the prototype throws it. The weapon carries the damage rating, as the warrior's sword does. The off hand holds the focus and its ward.
- **The arena picks a class:** `?arena&class=warrior|ranger|mage`, the warrior by default. It plays at level 1 with every base ability to level 10 unlocked and no talents, as today's arena unlocks everything; the class prototypes' flags are replaced by it once the classes are built.
- **The belt** is [Rage, focus and mana](09-rage-focus-and-mana.md)'s: health on the left, the class's resource on the right, a pip per ability.
