# Rage, focus and mana

Type: grilling
Status: resolved
Blocked by: 05, 06

## Question

How does each class's resource fill, drain and show?

- Rage (warrior): today it builds from hits, blocks, parries and bashes and the War Cry costs 50. Does it drain out of a fight?
- Focus (ranger): refills quickly (decided in charting). How big, how fast, and what spends it.
- Mana (mage): a pool that refills out of a fight (decided in charting). How big, and whether the plain attack costs any.
- What each class's belt shows, and how the resource grows with level and attributes.

## Answer

Settled on 2026-09-30 **by Claude on Tom's behalf**, taking the recommended option at every fork and building on what the prototypes found ([How the ranger fights](05-how-the-ranger-fights.md), [How the mage fights](06-how-the-mage-fights.md)). The numbers are starting points, to tune on the headset.

- **Every resource is a bar of 100 that plain attacks never spend.** Abilities spend it; the sword, arrows and the plain bolt are free, limited by how fast you swing, draw or charge.
- **Rage (warrior) stays as built:** it starts at 0, builds 10 a hit, 12 a block, 25 a parry and 8 a bash, and drains 2 a second. The War Cry costs 50 and Earthshaker 35. The Professions map's rage draught gives 30.
- **Focus (ranger)** starts full and refills 10 a second, in a fight or out. Special shots and the ranger's other abilities cost 20 to 40, so a full bar is a burst of about three and the refill allows one about every three seconds after that. The ward stays free on its own cooldown (1.2 s up, 2 s back). No potion restores focus.
- **Mana (mage)** starts full; the pool is 100 plus 2 for every point of Intellect over 10 (about 136 at level 10 without gear, about 164 with a green set). It refills 2 a second while anything fights you and 30 a second once nothing does. A ward block costs 10 and a parry nothing, as the prototype has it; abilities cost 15 to 40. The Professions map's minor mana potion gives back 40% of the pool.
- **Costs don't grow with level.** Talents can lower them or change what fills the bar.
- **After death or loading** you have no rage and full focus and mana. None of the three is saved.
- **The belt:** health stays the left orb, and the right orb shows your class's resource, red for rage, gold for focus and blue for mana. Below it, one pip per ability you can use, lit once you can afford it and it's off cooldown. The dash's bar also shows the mage's blink.

## Comments

**2026-09-30, on Tom's behalf:**

- A bar of 100 for everyone: one belt, one set of costs to read, and the War Cry's 50 means the same thing in each class.
- Focus refilling fast and always: that's what charting asked for, and it makes the ranger's rhythm "shoot, special, shoot" rather than saving up.
- Mana growing with Intellect but costs fixed: gear and levels buy the mage more casts before the pool runs dry, the one thing a mage wants from a bigger number, without inflating costs to match. Regen stays flat so a bigger pool means a longer fight, not a faster one.
- Plain attacks free: both prototypes found charging for the plain attack only added bookkeeping.
