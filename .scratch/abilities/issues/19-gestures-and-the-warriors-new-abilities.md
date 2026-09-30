# 19: Gestures and the warrior's new abilities

**What to build:** the gesture recogniser comes into the game from the prototype: hold the right grip, draw, let go; the zones at the shoulder, the hips and the tool loop never arm; a stroke over 1.6 s or with lost tracking is dropped; the tick, the trail, the read flash with the ability's name and cost, the miss puff and "not enough rage". Gesture slots live in the adventure state with their default shapes. The warrior gets Heroic Throw (ring, 6), Shield Wall (Z, 8) and Sweeping Strikes (V, 10). The first time a gesture is unlocked, its shape hangs in the air until drawn. `?arena&class=warrior` plays with every base ability.

**Blocked by:** 17.

**Status:** ready-for-agent

Read [the spec](../spec.md) ("Gestures", "Abilities", "The arena", "Performance"), [Using abilities by gesture](07-using-abilities-by-gesture.md) and [The warrior's abilities and talents](11-the-warriors-abilities-and-talents.md). The prototype is in `src/prototype/gestures/`.

- [ ] The recogniser's bench becomes a test: each of the five shapes read from seeded sloppy strokes at the prototype's rate or better, sword swings, thrusts and blocks read as nothing, and a grip in each zone never arming.
- [ ] Tests for the three abilities' rules where they have a seam (Shield Wall's blocks, Sweeping Strikes' second target).
- [ ] A headless check in the arena as a warrior draws each shape, sees each ability fire, and sees a swing with the grip held fire nothing.
- [ ] `?arena&gestures` still runs as a prototype for the ranger and mage.
- [ ] `npm run typecheck` and `npm test` pass.
