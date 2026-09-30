# 09: The bag in the Adventure

**What to build:** reach over either shoulder in the Adventure and the bag panel opens, promoted from prototype A (`?bag`): sixteen slots, the figure with seven gear slots, cards with comparisons, touch-and-carry, equipping (the hands' models follow the main and off hand; gloves tint the hands), refusals, dropping on the ground and picking back up, the coin count, and the quest page tab. Each change saves.

**Blocked by:** 08.

**Status:** ready-for-agent

Read [the spec](../spec.md) ("The view in VR") and [The bag and the gear panel](03-the-bag-and-the-gear-panel.md).

- [ ] A check script `.scratch/inventory/checks/bag-adventure.mjs` (IWER in headless Chromium, the Oakvale checks' style) opens the bag in Oakvale, equips an item and sees the damage change, is refused a wrong-class and a too-high item, drops one and takes it back, and shows that an overhead swing doesn't open the bag.
- [ ] With the panel open, `?perf` shows about 4 draws an eye for it, and no new shader program compiles at the first open.
- [ ] `?bag` still runs as a prototype.
- [ ] `npm run typecheck` and `npm test` pass.
