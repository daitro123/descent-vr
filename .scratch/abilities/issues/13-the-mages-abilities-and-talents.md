# The mage's abilities and talents

Type: grilling
Status: resolved
Blocked by: 07, 08, 09, 10

## Question

What are the mage's base abilities from level 1 to 10, and what's in its two talent trees?

- Which base ability each level brings, what it does, what it costs and how it's used (by gesture or button, per [Using abilities by gesture](07-using-abilities-by-gesture.md)).
- Two trees: for example fire and frost.
- Each tree's talents to the depth a level-10 character can reach, and a sketch of its deepest talents to level 20.
- Which enemies and places in Oakvale each ability is meant to answer.

## Answer

Settled on 2026-09-30 **by Claude on Tom's behalf**, taking the recommended option at every fork. Damage is in level-1 terms and grows with your damage multiplier like every blow; costs follow [Rage, focus and mana](09-rage-focus-and-mana.md) and never grow with level. The numbers are starting points, to tune on the headset.

**How abilities are used** (per [Using abilities by gesture](07-using-abilities-by-gesture.md)): each base gesture ability has its own shape, listed below; a tier-3 talent ability takes the triangle, and anything later the next free shape. The talent page can swap which shape holds which. Hold the right grip, draw, let go.

**What stays as it is:** a bolt charged in either palm and thrown (free, shaped by the throw), the ward on the focus hand's grip (10 mana a block, a parry free) and the blink on B/Y. Mana is a pool of 100 plus 2 a point of Intellect over 10. A gesture can't be drawn while the right hand charges a bolt; the left hand's bolt and the ward don't stop one.

**Base abilities to level 10:**

| Level | Ability | Used by | Cost | Cooldown | What it does | Meant for |
|---|---|---|---|---|---|---|
| 2 | Frost Nova | A/X | 30 mana | 20 s | Frost bursts from you: every enemy within 3 m is frozen in place for 4 s, or until a hit breaks it. | A grunt in your face: freeze, blink, throw. |
| 3 | Fireball | gesture (ring) | 15 mana | none | The next bolt you charge burns: 1.5× damage, and it bursts for 10 within 2 m. | The farm's pack; the mage's everyday cast. |
| 6 | Frostbolt | gesture (Z) | 15 mana | none | The next bolt is frost: the enemy it hits is slowed by 40% for 5 s. | Kiting the lumber camp's leader. |
| 8 | Chain Lightning | gesture (V) | 30 mana | 8 s | The next bolt arcs on to 2 more enemies within 4 m, at 70% each. | Camps of five. |
| 10 | Blizzard | gesture (S) | 40 mana | 30 s | Ice falls for 5 s over a 4 m circle where you point: 6 damage every 0.5 s and a 50% slow. | The mine's crowds, the Warden's raised dead. |

**Sketched past 10:** Evocation at 14 (no cost, 2-minute cooldown: stand still to regain 60% of your mana over 6 s) and Ice Block at 18 (30 mana, 90 s: 4 s encased, taking no damage and unable to act).

**Fire** (damage):

| Tier | Talent | Points | What it does |
|---|---|---|---|
| 1 | Ignite | 3 | A fire hit burns the enemy for a further 10 / 20 / 30% of it over 4 s. |
| 1 | Incineration | 2 | A bolt charges full in 0.5 / 0.4 s. |
| 2 | Improved Fireball | 2 | Fireball's burst reaches 2.5 / 3 m. |
| 2 | Critical Mass | 3 | A head hit's multiplier +0.1 / 0.2 / 0.3. |
| 3 | **Pyroblast** (ability, triangle) | 1 | 35 mana, 12 s: the next bolt charges for 1.2 s into a huge slow orb that deals 60 and sets the enemy burning. |
| 3 | Master of Elements | 2 | A fire head hit gives back 5 / 10 mana. |
| 4 (sketch) | Fire Power | 3 | Fire deals +5 / 10 / 15%. |
| 4 (sketch) | Blazing Ward | 2 | A blow blocked by the ward burns its attacker for 5 / 10. |
| 5 (sketch) | **Meteor** (ability) | 1 | 50 mana, 45 s: 1.5 s after the gesture, a meteor lands where you point for 80 within 3 m and knocks enemies down. |

**Frost** (control):

| Tier | Talent | Points | What it does |
|---|---|---|---|
| 1 | Frostbite | 3 | A slowed enemy hit by frost has a 5 / 10 / 15% chance to freeze for 2 s. |
| 1 | Ice Shards | 2 | Frost bolts deal +10 / 20%. |
| 2 | Permafrost | 2 | Slows last +1 / 2 s and are 10 / 20% stronger. |
| 2 | Arctic Reach | 3 | Frost Nova and Blizzard reach +0.3 / 0.6 / 0.9 m further. |
| 3 | **Ice Barrier** (ability, triangle) | 1 | 30 mana, 25 s: a shell of ice takes the next 40 damage (times your level's step) within 10 s. |
| 3 | Frozen Ward | 2 | A blow blocked by the ward slows its attacker by 20 / 40% for 3 s. |
| 4 (sketch) | Shatter | 3 | A frozen enemy takes +10 / 20 / 30%. |
| 4 (sketch) | Cold Snap | 2 | Frost Nova comes back 5 / 10 s sooner. |
| 5 (sketch) | **Frozen Orb** (ability) | 1 | 50 mana, 45 s: an orb rolls 10 m ahead over 4 s, shooting shards at enemies within 3 m of it (8 each, 4 a second) and slowing them. |

## Comments

**2026-09-30, on Tom's behalf:**

- Frost Nova on the button: it's the mage's answer to a blow about to land, when drawing a shape is too slow.
- Fireball, Frostbolt and Chain Lightning change the next bolt rather than cast something new, so the mage keeps throwing, the part of the prototype that felt like magic, and a gesture only colours the throw.
- Fire and Frost as the two trees: damage against control, the same split as the warrior's sword and shield.
- No polymorph: turning an enemy into an animal needs a four-legged model.
