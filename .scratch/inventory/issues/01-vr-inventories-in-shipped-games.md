# VR inventories in shipped games

Type: research
Status: resolved
Blocked by:

## Question

How do shipped VR games let you carry, reach for and use items, and what does WebXR on the Quest 3 give us to build it with?

- Packs you reach over your shoulder for, holsters and belt slots: which games do it (Blade & Sorcery, Boneworks, The Walking Dead: Saints & Sinners, Asgard's Wrath 2, Skyrim VR, Into the Radius, Ghosts of Tabor, and others), how the reach is detected, and what players and reviewers say works or tires them.
- Menus and grids for sorting many items in VR: how they open, how items are moved (grab, point, touch), and how an item's stats are read and compared with what you wear.
- Using a consumable mid-fight: lifting a potion or food to the mouth, and what happens when both hands already hold weapons.
- WebXR on the Quest 3 browser: which controller buttons a page can read (the menu buttons included), whether the grip can be read while a weapon is held, and the haptics available.

Findings go in `.scratch/inventory/research/`.

## Answer

Researched on 2026-09-30; the full note with sources is [VR inventories in shipped games](../research/vr-inventories-in-shipped-games.md). The proxy blocked most game sites, so many game facts are secondary and marked so there.

- Shipped games settled on the mix this map chose: a few body slots for what you grab mid-fight, and a bag for the rest. Their common failures are slots you can't see or feel and items lost to a missed reach or a full slot, so every slot glows and ticks the controller, and a missed drop never loses an item.
- Body zones are spheres placed from the headset, not a guessed body (HIGGS: shoulders about 25 cm to the side, 7 cm back, 10 cm down; the mouth about 14 cm forward, 13 cm down; radius about 16 cm; only for a hand moving under about 2 m/s). The speed gate and "grip pressed inside the zone" tell a reach from an overhead swing.
- The grip is free in Descent: weapons stay in the hand without it, and gameplay reads `squeeze` nowhere. The left menu button is probably kept by the Quest Browser, so it isn't bound. Haptics are `pulse(intensity, ms)` only, and players can switch them off per site.
- For [The bag and the gear panel](03-the-bag-and-the-gear-panel.md): open with the grip inside a shoulder zone, either hand; place the panel once, about 45 cm in front of the chest, turning only if you turn past about 60°; move items by touching with a fist or weapon tip and holding the grip; touching shows the item's card with + or − against what you wear; icons from one texture atlas, one draw call.
- For [The belt and drinking a potion](04-the-belt-and-drinking-a-potion.md): hip slots placed from the headset with a glow and tick within about 12 cm; the grip takes the flask and hides that hand's shield, bow or focus meanwhile; hold it near the mouth for about 0.7 s to drink, and pulling away early keeps the potion; no cork; slots refill from the bag; a quick-drink button stays a fallback.
- To check on the headset: whether the left menu button shows up or leaves VR, what the thumbrest reports, what `pulse()` does with haptics switched off, and where a reach over the shoulder lands with a shield on the arm.
