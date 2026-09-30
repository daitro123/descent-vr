# Loot

Type: grilling
Status: resolved
Blocked by: 02

## Question

What drops, from what, and how does it show?

- Which enemies drop items and how often, by role (ordinary, leader, brute, boss) and by level, and how many coins each is worth.
- Chests in the world: where they stand, what they hold, and whether they refill like camps.
- Junk: which enemies drop it and what it's for beyond selling.
- The drop on the ground: how it glows in its rarity colour without a light (the budget allows 4 point lights), how long it lies there, and touching it to take it, as with an orb. What happens when the bag is full.
- Healing orbs: do they stay alongside potions, or give way to them?

## Answer

Settled by Claude **on Tom's behalf** on 2026-09-30, taking the recommended option at every fork. Every number is a starting point, to tune on the headset.

- **Loot's item level is the enemy's level.** Drops are only armour or a weapon or off hand of your own class. The game is single-player, so a drop nobody can use would only be junk by another name.
- **What each kill drops, by role:**

  | Role | Coins | Junk | Gear |
  | --- | --- | --- | --- |
  | Ordinary | 1 to 3 × level, always | 40% | 8% white, 3% green |
  | Leader, deep brute | 3 × that, always | 60% | one piece always: 75% green, 25% blue |
  | Boss (the Warden) | 10 × that, always | none | one blue and one green, every time it's beaten |
  | Raised by the Warden | nothing | nothing | nothing |

  Each kill rolls at most one piece of gear, bosses aside. Camps that refill drop again, since Oakvale's cap already stops XP farming and a few coins more do no harm.
- **Chests** are hand-placed at a zone's places of interest, a few per zone. You lift the lid by touching it. Each holds 5 × the area's level in coins and one green, sometimes a blue (20%). A chest opens once per character and stays open, saved: chests are discoveries, not a farm. [Oakvale's items](07-oakvales-items.md) places Oakvale's.
- **Junk** is only for selling. Bandits drop worn trinkets and torn cloth; the undead drop bone charms and grave dust. The Professions map may turn some of it into materials later.
- **The drop on the ground:** where the enemy fell lies one small pouch. It holds the coins, and any item shows as its own model beside it. Each glows in its rarity colour through an emissive rim, with no light. Greens and blues also raise a thin, unlit, additive beam of their colour about 2 m high, one draw call each, so they can be seen from across a camp. Touching the pouch takes the coins. Touching an item puts it in the bag with a buzz and the pickup sound. Drops lie for 5 minutes, through your death too, and at most 12 lie in the world at once: past that the oldest goes.
- **A full bag:** the item stays on the ground, flashing red, with a short "Bag full" float. Coins are always taken, and quest items never need a slot.
- **Healing orbs stay** as today, dropped at each enemy's `orbChance`. Orbs are the in-fight heal that keeps a fight's pace; potions on the belt are the reserve you choose to spend.
