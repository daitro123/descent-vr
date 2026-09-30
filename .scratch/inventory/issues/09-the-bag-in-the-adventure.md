# 09: The bag in the Adventure

**What to build:** reach over either shoulder in the Adventure and the bag panel opens, promoted from prototype A (`?bag`): sixteen slots, the figure with seven gear slots, cards with comparisons, touch-and-carry, equipping (the hands' models follow the main and off hand; gloves tint the hands), refusals, dropping on the ground and picking back up, the coin count, and the quest page tab. Each change saves.

**Blocked by:** 08.

**Status:** resolved

Read [the spec](../spec.md) ("The view in VR") and [The bag and the gear panel](03-the-bag-and-the-gear-panel.md).

- [x] A check script `.scratch/inventory/checks/bag-adventure.mjs` (IWER in headless Chromium, the Oakvale checks' style) opens the bag in Oakvale, equips an item and sees the damage change, is refused a wrong-class and a too-high item, drops one and takes it back, and shows that an overhead swing doesn't open the bag.
- [x] With the panel open, `?perf` shows about 4 draws an eye for it, and no new shader program compiles at the first open.
- [x] `?bag` still runs as a prototype.
- [x] `npm run typecheck` and `npm test` pass.

## Answer

Built on 2026-09-30 by Claude **on Tom's behalf** (he asked for the build tickets to run without his input, taking the recommended option at every fork).

**What was built**

- `src/ui/bag/`: prototype A promoted into real modules, driven by the inventory module. `reach.ts` (the shoulder spheres and the speed gate), `layout.ts` (where every slot, tab and the figure sit, and what a point touches), `panel.ts` (the board, the frames, the icons, the figure and the card), `cardLines.ts` (what a card says, with no canvas), `looks.ts` (the icon atlas and each item's small model) and `bag.ts` (open, close, touch, carry, let go, the tabs). Every number is in `CONFIG.bag` (`reach`, `grip`, `panel`, `touch`, `release`, `tabs`, `buzz`, `dropped`).
- The panel: sixteen slots, the figure with its seven gear slots, the coin count under the slots, and three tabs along the top (Bag, Quests, Talents). The card shows the name in its rarity's colour, what it is, the class lock (red if not yours), the item level (red above yours), its numbers with + or − against what's worn, a potion's heal, and what a vendor pays. A stack's count is two digits from the atlas.
- Every move goes through `inventory.move`, and its effects through `Adventure.applyThings`, which saves and shows them. `Inventory.check(from, to)` is new: it says whether a move would be refused, so the slot under a carried item turns green or red before you let go.
- The hands show their gear: the main hand's item is the sword you hold, and with the main hand empty the sword goes and can't hit; the off hand's is the shield, and with it empty the shield goes and can't block. New gloved fists (`src/player/fists.ts`) close on each grip, bare skin until gloves are worn, tinted by the gloves' colour after that.
- What you let go of off the panel falls and lies on the ground (`src/world/dropped.ts`), its model on a disc in its rarity's colour. A fist touching it takes it back into the bag. It isn't saved.
- `?bag` is untouched and still runs as the prototype, with its own copies.

**Checks**

- `npm run typecheck`, `npm test` (775 passed, 12 of them new in `tests/bag.test.ts`) and `npm run build` pass.
- `checks/bag-adventure.mjs`, all 31 passed: an overhead chop (up to 7.4 m/s, grip held) and a fast squeeze (9.1 m/s) leave the bag shut; a slow reach opens it 45 cm out and 28 cm down, with the zone buzz and the pulse; no new shader program compiles at the first open (23 before and after); the panel costs 4 draws an eye; Hale's longsword shows its card (name in blue, item level 5 in red, Damage +20%, +18% against the plain sword); at level 1 it's refused (too high) and the short bow is refused (a ranger's), each with the strong buzz; at level 5 it's worn, the sword in your hand is Hale's, and damage goes from 1.817 to 2.000; the charm is dropped, lands, and a fist takes it back; the Quests tab shows the orders, which can't be carried off; the shield carried into the bag leaves the arm bare and unable to block; the same reach shuts the bag, and a reload keeps it all.
- `checks/bag.mjs` (the prototype), `oakvale-starting-zone/checks/saving.mjs` and `warden.mjs`: all passed.

**Calls made on Tom's behalf**

- The tabs are painted on the panel's board, so they cost no draw. They're pressed as the talk board's buttons are: a fist or the tip arriving on one, not one already resting there, 0.4 s after the bag opens and 0.3 s after a press.
- The Talents tab is a placeholder page ("No talents yet"), since the Abilities map's build hasn't added one.
- A quest item on the quest page can't be picked up: the grip on it refuses with the strong buzz.
- The hands' models are new gloved fists, one extra draw a hand. The catalogue has no gloves yet, so the tint shows only once loot or a pick brings some.
- Dropped items follow loot's rules: at most 12 lie at once, each for 5 minutes, and a fist within 0.25 m (the orb's radius) takes one back. If the bag is full it stays where it lies.
- An item whose model the table doesn't know (loot a later build adds) is drawn by its slot or kind, in its rarity's colour, and the atlas draws its cell the first time it's seen.

**For later tickets**

- 10 (the belt): `Adventure.applyThings(effects, at)` saves and shows anything the inventory did. The bag reads the grip with `CONFIG.bag.grip`; the belt's grip should use the same numbers. Hands already show the weapon or nothing, via `Adventure.dressHands`.
- 11 (loot): `lookOf`, `modelOf` and the `IconAtlas` in `ui/bag/looks.ts` draw any item (add a line to `MODELS` for a hand-made look). `world/dropped.ts` is a small version of loot on the ground; merge the two if that's simpler. `Adventure.show` refreshes the panel on any `slot` or `coins` effect, and ignores `left`.
- 12 (picks): the quest page shows `inventory.quest`. A reward row can reuse the panel's layout and `cardText`.
- 14 and 15 (vendors and the stash): `cardText`, `layout.ts` and `BagPanel` are the pieces for a second panel beside the bag.
- The Abilities build: fill the Talents page (`PAGES` in `layout.ts`, and the note painted in `BagPanel.paintBoard`).

**On the headset** (plain URL, a new or existing character):

1. Reach over each shoulder and squeeze: does the bag open where your hand goes, and does a chop over the shoulder leave it shut?
2. Carry things with the right fist, the left fist and the sword's tip. Is the card readable, and does the slot turning red or green read clearly?
3. Look at your new fists round the sword's grip and the shield's bar. Do they sit right?
4. Drop something off the panel, then pick it up off the ground with a fist.
5. Press the Quests and Talents tabs, and open `?perf` with the bag open: about 4 draws an eye for the panel.
