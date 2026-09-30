# 21: The ranger

**What to build:** the ranger becomes a class you can make and play, promoted from the ranger prototype's kept variant: the bow in the left hand following the worn weapon, nocking by touching the string, damage and speed by the draw, unlimited arrows, the ward on the bow hand's grip, the dash, focus on the belt's right orb in gold. Power Shot on A/X while drawing (level 2) and Snare Trap (ring, level 3) with its shape shown in the air. Its class card appears on the page before VR, and `?arena&class=ranger` plays it. Oakvale plays through to level 5 as a ranger.

**Blocked by:** 17, 18, 19, 20.

**Status:** ready-for-agent

Read [the spec](../spec.md) ("The ranger", "Abilities", "The belt and the level-up"), [How the ranger fights](05-how-the-ranger-fights.md) and [The ranger's abilities and talents](12-the-rangers-abilities-and-talents.md). The prototype is in `src/prototype/ranger/`. Tell the Inventory map's "The ranger and mage in the inventory" ticket that the ranger's weapons exist in the hand once this merges.

- [ ] Tests at the combat seam for the draw's damage and speed, the ward's stop and reflect, Power Shot's pierce and Snare Trap's root.
- [ ] A headless check makes a ranger, kills the farm's camp with arrows, reaches level 2 and fires Power Shot, reaches 3 and lays a trap that roots a grunt.
- [ ] `?arena&class=ranger&variant=` no longer loads the prototype's variants once this lands; the README says so.
- [ ] `npm run typecheck` and `npm test` pass.
