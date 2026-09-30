# The bag and the gear panel

Type: prototype
Status: resolved
Blocked by: 01

## Question

How does it feel to pull your bag round and sort it?

- Reaching over your shoulder and squeezing the grip to bring the bag round, with a weapon in each hand: which hand, and how it's told apart from a swing.
- The panel: 16 bag slots, the seven gear slots (main hand, off hand, head, chest, hands, legs, feet) and a small figure of you wearing them. How it faces you and follows you, and how it closes.
- Moving an item: with a fist or a weapon's tip, as on the talk board, or by grabbing. Equipping, swapping and dropping (letting go outside the panel drops it on the ground).
- Reading an item: its name in its rarity colour, its numbers, and how it compares with what you wear.
- Items in the panel as small 3D models or as flat icons, measured against the draw-call budget.

## Answer

Settled by Claude **on Tom's behalf** on 2026-09-30, taking the research's recommendation after building all three ways (Tom asked for the rest of the map to run without his input). The pick is **A: touch an item with a fist or the sword's tip and hold the grip to carry it.** The prototype stays on `main` at `?bag` (code in `src/ui/bag-prototype/`, marked PROTOTYPE), so B and C can still be tried: `?bag=b`, `?bag=c`, or a click of the left stick in the headset. Every number is the prototype's, a starting point to tune on the headset.

- **The reach:** a sphere of 18 cm radius over each shoulder, centred 20 cm out to the side, 14 cm below and 12 cm behind the eyes, placed from the headset's position and facing (not its tilt). Either hand opens the bag at its own shoulder. The grip has to go down with the hand already in the sphere, moving under 1.5 m/s; a grip already held when the hand arrives doesn't count. A light buzz (0.15 for 25 ms, every 0.2 s) runs while a slow hand is in the zone, and a pulse (0.9 for 90 ms) comes as the bag opens. The same reach shuts it.
- **Telling it from a swing:** in the check, an overhead chop starting in the zone with the grip held all the way (the hand at up to 7.4 m/s) left the bag shut and landed on the dummy, and a grip squeezed as the hand swung up into the zone at about 9 m/s was refused as too fast.
- **The panel:** placed once, 45 cm out in front and 28 cm below the eyes, turned to face you. It comes round in front again only when you've turned more than 60° away, and it closes when you walk more than 1.5 m from it or reach back again. The world doesn't pause. Sixteen bag slots (4 × 4) on the right, the seven gear slots in two columns round a small figure of you on the left, wearing what's in them. Slots are 6 cm square, 7.2 cm apart; the whole panel is about 65 × 38 cm.
- **Moving items (A):** a fist or the tip touching an item lights its slot and shows its card, with a light tick. Squeezing the grip picks it up: the slot empties and the item's model sticks to what touched it. Let go over a slot to put it there (a gear slot equips it, swapping what was worn back into the item's old slot), over the figure to wear it in its own slot, off the panel to drop it on the ground, or anywhere else over the panel to put it back. A slot it can't go in turns red under it, and letting go there refuses with a strong buzz. Within 5 cm of a slot's centre counts, since a carried item is aimed by eye.
- **The card:** above the panel over the item. Its name in its rarity's colour, its slot (or "Junk: only to sell"), its numbers, and + in green or − in red against what's worn in that slot. The worn slot lights blue on the panel while the card shows. [What an item is](02-what-an-item-is.md) adds the item level and the class lock to it.
- **Dropped items** fall, lie glowing in their rarity's colour, and a hand touching one takes it back into the first free slot (here only as a convenience for testing; [Loot](05-loot.md) decides how picking up works).
- **Icons, not models:** icons come from one texture atlas, every slot's icon in one draw. With the panel open the panel costs **4 draw calls an eye** with icons (the board, every slot's frame, every icon, the figure), plus one for the card and one for the carried item's model, against **15 an eye** with a small 3D model per item for 11 items (one more per item). The only model shown is on the item you've picked up.
- **Why not B or C:** B (press, then press, with a Drop key) takes two presses for every move and a key for dropping, and the sword's tip sweeping over the panel presses whatever it passes. C (grab it bodily) takes the weapon out of your hand while you hold the item, in a world that doesn't pause, and needs your hand within 7.5 cm of an item where A takes a fist or the tip.

**What Tom should check on the headset** (`?bag`, sword and shield in hand):

1. Reach back over each shoulder and squeeze: does the zone sit where your hand naturally goes, and is 1.5 m/s too strict for a quick grab mid-fight?
2. Chop at the dummy from high over the shoulder, grip squeezed or not: the bag must not open.
3. With the panel open, touch and carry with the right fist and with the sword's tip, then with the left fist: the shield sits in front of the left fist, so it may push through the panel first.
4. Is the panel comfortable at 45 cm out and 28 cm down, is the card readable, and does the 60° turn rule feel right?
5. Try `?bag=b` and `?bag=c`, and a click of the right stick for 3D models in the slots, in case either feels clearly better.

The checks are `.scratch/inventory/checks/bag.mjs` (IWER in headless Chromium): every variant opens the bag, shows a card, equips the helm, moves the charm, wears the vest over the figure and drops the rope, and the swings above don't open it.
