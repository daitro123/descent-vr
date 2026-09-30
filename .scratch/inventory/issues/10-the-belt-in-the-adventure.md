# 10: The belt in the Adventure

**What to build:** the two hip slots in the Adventure, promoted from the belt prototype's variant (a) (`?belt`): take a flask, the weapon in that hand fades, drink at the mouth, cancel by pulling away, refill from the bag's stacks, the shared 60 s cooldown that dims the flasks, and carrying a potion from the bag panel onto a hip slot or onto the figure's belt. A new character has three minor healing potions on the right hip.

**Blocked by:** 09.

**Status:** claimed

Read [the spec](../spec.md) ("The belt" under "The view in VR") and [The belt and drinking a potion](04-the-belt-and-drinking-a-potion.md).

- [ ] The inventory module's tests cover drinking, the cooldown and the refill.
- [ ] `.scratch/inventory/checks/belt-adventure.mjs` drinks a potion in Oakvale against a camp (health rises by 40%), cancels one, sees the flasks dim for 60 s, and moves a potion from the bag onto the belt.
- [ ] `?belt` still runs as a prototype.
- [ ] `npm run typecheck` and `npm test` pass.
