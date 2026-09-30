# 23: The mage

**What to build:** the mage becomes a class you can make and play, promoted from the mage prototype's kit A: the bolt charged at the tip of the worn wand or staff and thrown (either hand's trigger), the focus's ward that blocks, parries and bashes as the shield does, the blink on B/Y, mana on the belt's right orb in blue with Intellect's pool. Frost Nova on A/X (level 2) and Fireball (ring, level 3) with its shape shown in the air. Its class card appears on the page before VR, and `?arena&class=mage` plays it. Oakvale plays through to level 5 as a mage.

**Blocked by:** 17, 18, 19, 20.

**Status:** ready-for-agent

Read [the spec](../spec.md) ("The mage", "Abilities", "The belt and the level-up"), [How the mage fights](06-how-the-mage-fights.md), [Oakvale and the arena for every class](15-oakvale-and-the-arena-for-every-class.md) and [The mage's abilities and talents](13-the-mages-abilities-and-talents.md). The prototype is in `src/prototype/mage/`. Tell the Inventory map's "The ranger and mage in the inventory" ticket that the mage's weapons exist in the hand once this merges.

- [ ] Tests at the combat seam for the throw's shaping, the ward's mana, the blink, Frost Nova's freeze and Fireball's burst.
- [ ] A headless check makes a mage, kills the farm's camp with bolts, reaches level 2 and freezes a grunt, reaches 3 and bursts a Fireball.
- [ ] `?arena&class=mage&kit=` no longer loads the prototype's kits once this lands; the README says so.
- [ ] `npm run typecheck` and `npm test` pass.
