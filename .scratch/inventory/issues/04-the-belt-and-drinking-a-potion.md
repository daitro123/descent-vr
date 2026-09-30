# The belt and drinking a potion

Type: prototype
Status: resolved
Blocked by: 01

## Question

How do you use the two belt slots in the middle of a fight?

- Where the two slots sit at your hips, and how you see what's in them.
- Taking a potion from the belt when both hands hold something (sword and shield, bow, a mage's focus).
- Lifting it to your mouth to drink: how close, how long, what you see and feel, and what happens to the empty flask.
- How an item gets onto the belt from the bag panel, and how the belt refills from a stack.

## Answer

Prototyped on 2026-09-30 and picked on Tom's behalf, as he asked, without a headset session. The prototype stays on `main` at `?belt` so he can try all three on the Quest: `src/player/beltPrototype.ts` (marked PROTOTYPE, reached only from `?belt`, nothing in the Adventure or the save), checked by [`checks/belt.mjs`](../checks/belt.mjs). `?belt=a|b|c` picks the way to take a potion, a click of either stick cycles it in the headset, and `&calm` swaps the practice duelists for the drain alone.

**The pick: (a), the weapon in that hand fades out while the flask is held**, the research's recommendation.

- **Why (a):** it is the quickest hand-off (0.15 s out, 0.15 s back) and the clearest: a flask in an otherwise empty fist, nothing else near your face. (b) costs 0.25 s each way, and the shield slung at the hip covers the left slot while you drink. (c) keeps the weapon live, but brings the sword or the whole 50 × 60 cm shield up to your mouth, which blinds you on the shield side; and priming by a touch takes potions by accident whenever a hand passes the hip mid-swing.
- **The cost of (a) and (b) alike:** while the flask is held, that hand's weapon can't hit or block (the prototype takes it off the grip). Drinking is a commitment you time between blows, which fits the combat.
- **Where the slots sit:** two slots hung from the neck point (10 cm below and 8 cm behind the eyes, so looking down doesn't move them), 60 cm below it, 19 cm to each side and 12 cm ahead. They turn with you only once you look more than about 30° away. Each shows a small red flask on a leather cup, with a count badge facing up at your eyes.
- **Seeing and feeling them:** within 12 cm a slot glows and ticks the controller once, on arrival. The HUD's orbs sit between and ahead of them, so a glance down reads both.
- **Taking a potion:** squeeze the grip within 12 cm, either hand at either slot; a clink and a short buzz. Let go of the grip and the flask goes back to its slot, and the weapon comes back.
- **Drinking:** hold the flask within 15 cm of the mouth point (13 cm below and 10 cm in front of the eyes, moving with your head) for 0.7 s, with a steady light buzz every 0.09 s, then a strong pulse, two gulps and the heal chime. A potion heals 40% of your maximum health (an orb heals 25%). Moving the hand faster than 1 m/s at the mouth pauses the drink rather than cancelling it; pulling away early cancels it and keeps the potion in the hand. No cork.
- **The empty flask and the refill:** the empty flask vanishes from the hand, and the slot refills from its stack at once with a small pop; the badge counts what's left.
- **Getting items onto the belt from the bag:** not prototyped here. It waits on [The bag and the gear panel](03-the-bag-and-the-gear-panel.md): whatever way that ticket picks for moving items, a hip slot (and the figure's belt on the panel) is one more place to let go over, as the research found in Asgard's Wrath 2. Stacks refill a slot from the bag without asking.
- **Other classes:** the same fade applies to whatever that hand holds (a bow, a mage's focus). The ranger's and mage's own hands wait on the Abilities map.
- **Numbers measured:** the two slots cost 8 draw calls a view (16 in stereo) and no new shader program at the first potion, since the flasks and ghosts are compiled at start.
- **What Tom should check on the headset:**
  - The slots' height and spread for his body: a reach down should land without looking.
  - 0.7 s at the mouth against a duelist: long enough to feel like drinking, short enough to fit between its blows.
  - Whether the fading weapon (a) reads better than the swing to the hip (b), especially the shield.
  - Whether the pause-not-cancel speed gate ever lets a drink finish on a fast swing past the face.
  - If drinking by hand proves too slow in a real fight, a quick-drink button is still the research's fallback, though every button is bound.

