# VR inventories in shipped games

_Research for [issue 01](../issues/01-vr-inventories-in-shipped-games.md), 2026-09-30. Sources are numbered and listed at the end._

## Bottom line

- The mix we planned is what shipped games have settled on. A few body slots hold what you grab mid-fight, and a bag or panel holds everything else. Saints & Sinners has belt, chest and shoulder slots plus a backpack over the left shoulder. [15][16] Asgard's Wrath 2 has a belt of quick items plus a pointer-driven inventory screen. [12] Half-Life: Alyx puts ammo in a backpack over the shoulder and grenades or health pens in wrist pockets. [25]
- The same complaints come up in every game: a holster you can't see or feel, and items dropped because you missed the zone or the slot was full. [19][22] Boneworks' review calls its "inventory view" "a band-aid" for those gaps. [19] Every slot needs a glow and a haptic tick when your hand enters it, and a missed drop must never lose an item.
- Body zones are spheres fixed to the **headset**, not to a tracked body. HIGGS (the Skyrim VR interaction mod, open source) puts each shoulder about 25 cm to the side, 7 cm behind and 10 cm below the headset. It puts the mouth about 14 cm forward and 13 cm down. Each zone is a sphere of radius about 16 cm, and it counts only while the hand moves under 2 m/s. [11] Games that hang the slots on a body model's hips drift, and players complain about it. [19][22]
- Drinking works by holding the item at your mouth. Saints & Sinners, Asgard's Wrath 2, HIGGS and Into the Radius all do this. [12][11][17][26] Blade & Sorcery also makes you pull a cork and tip the bottle, and after U10 its players complained that the mouth zone had shrunk. [21] Asgard's Wrath 2 also gives a quick-drink button, because a potion mid-fight is urgent. [12]
- VR players dislike big flat menus worked by pointing. Reviews call Asgard's Wrath 2's "ill-conceived for virtual reality" and praise Saints & Sinners' physical backpack instead. [13][14] Skyrim VR's menus drew the most modding effort. [29] Keep the panel small, within reach, and worked by touch.
- WebXR on the Quest 3 exposes trigger, grip, thumbstick with its click, A/B or X/Y, and a thumbrest touch per hand. The **grip is free in Descent**: weapons stay in the hand without holding it, and gameplay reads `squeeze` nowhere ([input.ts](../../../src/player/input.ts)). [1][3] The registry also lists a left **menu** button, but the Quest Browser probably keeps it for itself, so don't bind it. [3][7] Haptics are `hapticActuators[0].pulse(intensity, ms)` only, and since February 2026 the player can switch them off per site. [4][6][8]

**For ticket 03, the bag and the gear panel:**

- To open the bag, squeeze the grip with the hand already inside a shoulder sphere. The hand must be moving under about 1.5 m/s, and the grip must go down there, not arrive already held. Allow either hand at its own shoulder. The speed gate and "grip pressed in the zone" tell the reach from an overhead swing, as HIGGS does. [11] Give a light buzz while the hand is in the zone and a stronger pulse when the bag opens. [11]
- Place the panel once when it opens, about 45 cm in front of the chest and a little below the eyes. Don't make it follow your head. It should turn toward you only when you turn more than about 60°. Close it by the same reach over the shoulder, or by walking more than about 1.5 m away. Meta puts touch panels at 42 to 46 cm and wants the elbows kept near the hips. [10] Cloudhead moved its bag out of the face after positional tracking arrived. [24]
- Move items by touch, as on the talk board. Touch an item with the fist or the weapon's tip, hold the grip, and the item sticks to the tip. Let go over a slot to place it, or outside the panel to drop it. Touching an item without the grip shows its card. This reuses a button that is already free, and it never makes the player let go of a weapon.
- An item's card shows the name in its rarity colour and the numbers, with + or − against the item worn in that slot. Light up that worn slot on the figure while the card shows. Every loot game we checked shows details when you select an item, and Dungeons of Eternity has a quick compare. [30] The card is ours to design.
- Draw the items as flat icons in one texture atlas, one draw call for all 23 slots. Show the full 3D model only on the item picked up. The bag slots are our own count (16); Saints & Sinners starts with 27, in pages of 9. [16]

**For ticket 04, the belt and drinking a potion:**

- Put the two slots in front of each hip, placed from the headset (its height and a smoothed yaw), not from a guessed body. Each slot shows a small 3D flask with a count badge. When your hand is within about 12 cm the slot glows and ticks the controller. [11][19][22]
- Take a potion by squeezing the grip at the slot with the hand beside it. The weapon in that hand (shield, bow or focus) fades or snaps to the hip while the flask is in the hand. It comes back on its own when the flask is used up or let go. No game we found makes the player put a weapon down to drink.
- To drink, hold the flask within about 15 cm of a mouth point roughly 13 cm below and 10 cm in front of the headset, while moving slowly. [11] Drink over about 0.7 s with a steady light buzz, and heal at the end with a strong pulse and a gulp sound. [11] Taking it away early cancels the drink and keeps the potion. The empty flask disappears. No cork: Blade & Sorcery shows the cost of one. [21]
- Refill each slot from its stack in the bag without asking. To put an item on the belt, drag it from the panel onto a slot on the figure's belt, or drop it straight onto the hip slot. Asgard's Wrath 2 does both. [12]
- Leave a quick-drink button out for now, since every button is bound. Note it as the fallback if drinking by hand proves too slow in the arena.

## Findings

### Body slots and backpacks in shipped games

- **The Walking Dead: Saints & Sinners** (Skydance, 2020) has six holsters: two hip holsters for weapons, the flashlight and journal on the chest, a large weapon over the right shoulder, and the backpack over the left shoulder (secondary: player guides). [15] The backpack is pulled round and held in front of you. It starts with 27 slots in pages of 9 plus a page for quest items, and the "Deep Pockets" upgrade adds a page and a second large-weapon slot. Every item takes one slot whatever its size, and players ask for a sized grid (secondary). [16] A Skydance developer said players "pretty quickly don't think about reaching here or there, you just know where your items are" (medium confidence, interview extract). [18]
- **Half-Life: Alyx** (Valve, 2020): the backpack over the shoulder holds ammo only. Reaching into it gives the ammo for the gun in your other hand. Grenades and health pens go in two wrist pockets (secondary: reviews and wikis). [25] Keeping each kind of item in one place means there is never a choice to make during a fight.
- **Boneworks** (Stress Level Zero, 2019) has five slots: one behind each shoulder, one under each arm and one on the lower back. Each slot takes only some item types. [20] Road to VR says the game never shows when your hand is in the right place, or that a slot is already full. It says items dropped by mistake are "all too easy", and that the slots are tied to the body model, not the headset, so they move when you crouch (secondary: review). [19]
- **Blade & Sorcery** (Warpfrog): two hip holsters for small weapons and large ones on the back. Without full-body tracking the game guesses the hips from the head and hands, and players find one hip slot often lands in an awkward spot (secondary: forums). [22] Modders add up to 16 more slots. Update 1.0 replaced the old item wheel with an in-world "Dalgarian device", plus a stash you reach through the item book (medium confidence, changelog extract). [23]
- **Into the Radius**: a vest with pouches and holsters, and a backpack you grab over the shoulder. The backpack returns to you if you walk away from it, and it has no grid, so players keep it tidy themselves. [26] Players in the sequel still ask how to reach their pouches reliably (secondary). [26]
- **Ghosts of Tabor**: rigs, pouches and backpacks as physical containers. Players call the inventory "atrocious", report grabbing the armour when they meant the backpack, and lose loot to physics bugs (secondary: Steam discussions). [27]
- **The Gallery** (Cloudhead Games): the first backpack over the shoulder. You reach over your shoulder, pull, and set the bag in front of you. It began as a gamepad menu floating in front of your face. After positional tracking arrived, the team let players place the bag themselves so it would not end up inside walls. A dropped important item goes back into the bag on its own; anything else falls. [24] (medium confidence: developer blog, read from a search extract)
- Research: Cmentowski and Krüger's taxonomy of VR inventories found that body-relative reaches let players act without looking, and they recommend them for opening an inventory and for putting items in and taking them out. [28] (medium confidence: abstract only)

### How the reach is detected (HIGGS source)

- HIGGS is open source, so its thresholds are the best hard numbers we have. [11] It defines three spheres relative to the headset node, in Skyrim units (70 units ≈ 1 m; our conversion):
  - right and left shoulder at (±17.5, −5, −6.85), about 25 cm to the side, 7 cm back and 10 cm down, radius 11 units (≈ 16 cm);
  - mouth at (0, 10, −9), about 14 cm forward and 13 cm down, radius 11 units (≈ 16 cm).
- An item held in a zone counts only if the controller's average speed over recent frames is under 2 m/s (`shoulderVelocityThreshold`, `mouthVelocityThreshold`). A fast swing through the zone does nothing. [11]
- Letting go of a potion, food or a book inside the mouth sphere consumes it. Letting go inside a shoulder sphere stores it. While the item is in a zone, HIGGS buzzes at 0.3, and it gives a 0.5 pulse that fades over 0.2 s when the item is consumed. [11]

### Menus and grids

- **Asgard's Wrath 2** (Sanzaru, 2023): press the grip on an item and let go near your hip to store it. Click and hold the left stick to open the belt, which holds five quick items, and drag items onto the belt from the inventory or the belt menu. The menu button opens the big menus (medium confidence: in-game tutorials as transcribed on a wiki, and Meta's player's guide from a search extract). [12] UploadVR calls its menus for maps, inventory and quests "ill-conceived for virtual reality": "giant screens that you interact with through pointing a controller-based cursor", unlike Saints & Sinners' physical backpack (secondary). [13] Gaming Nexus found too many layers and slow transitions between menus (secondary). [14]
- **Skyrim VR** kept the flat desktop menus. Players call item navigation unreliable and "horrible", and mods such as Spell Wheel VR, MageVR and HIGGS exist mainly to get around them (secondary). [29]
- Meta's own guidance for touch panels (written for hands, but about the same arm): put the panel 42 to 46 cm away, make targets at least 22 mm, keep the elbows near the hips, and don't make players reach above heart height, which tires them quickly (medium confidence: search extracts of Meta design docs). [10]
- No game we found freezes the world while you sort with a physical bag. Asgard's Wrath 2 opens its large menus as separate screens. We found no source on whether they pause.

### A consumable mid-fight

- **Saints & Sinners**: you eat food by holding it to your face and heal by wrapping a bandage round your arm (secondary). [17]
- **Asgard's Wrath 2**: "To consume a potion or food, hold the item and gently raise it to your mouth". A potion on the belt can also be drunk with a quick press, which a setting ("Quick Belt Consume") can turn off, because players drank by accident (medium confidence). [12]
- **Blade & Sorcery**: pull the cork with the other hand, then tip the bottle at your mouth. Players found after U10 that they had to tilt their head far back (secondary: forums). [21] That needs two free hands, which our players never have.
- **Half-Life: Alyx**: press the health pen anywhere on your body and click it. [25] **Into the Radius**: open a can with the trigger and eat from it with a knife, or stab the injector into your other hand. [26]
- **HIGGS**: drop the item at your mouth, as above. [11]
- When both hands hold weapons, the games we found don't solve it. They either let the player drop or holster a weapon first (Blade & Sorcery, Boneworks, Saints & Sinners) or offer a button (Asgard's Wrath 2). Hiding the off-hand weapon while that hand holds the flask is our own design, for the prototype to test.

### WebXR on the Quest 3 browser

- **Buttons.** The Touch Plus profile lists, for each hand: `buttons[0]` trigger, `[1]` grip (squeeze), `[2]` empty, `[3]` thumbstick click, `[4]` A or X, `[5]` B or Y, `[6]` thumbrest. It lists `[7]` menu on the left hand only, with the thumbstick on `axes[2]` and `axes[3]`. [3] Grip and trigger report an analog `value` from 0 to 1. [1]
- **The menu button.** The spec says buttons the browser or platform keeps for itself MUST NOT be exposed. [1] Meta's hand-tracking doc says the left palm pinch "is equivalent to pressing the menu button on your left controllers, which takes the user out of the WebXR session". So the Quest Browser probably keeps the left menu button, even though the registry lists it (medium confidence). [7] The right controller's Meta button is never exposed. [3]
- **The grip while a weapon is held.** WebXR has no idea of holding. The trigger is the "primary action" (`selectstart`/`selectend`) and the grip is the "primary squeeze action" (`squeezestart`/`squeezeend`). Both are also readable every frame on the gamepad, which is updated in place each frame, so the code must keep the last frame's state itself (as `XRInput.update` already does). [1][2] Descent never needs the grip to keep a weapon in the hand, so the grip on both hands is free for the bag, the belt and moving items.
- **Haptics.** The Quest Browser exposes `gamepad.hapticActuators[0].pulse(intensity, ms)`, with intensity from 0 to 1. Descent already uses it. [4][5][6] A new pulse replaces one still playing. [4] Meta documents extra actuators only for the Touch Pro; nothing documents more than one for the Quest 3's Touch Plus. [6] Browser 42.3 (2026-02-18) added "controller haptics" to site permissions, so pulses may do nothing without any error (medium confidence). [8] On one OS build the left and right haptics were swapped until a fix on 2026-03-09 (medium confidence). [9]

## To check on the headset

1. Log `gamepad.buttons.length` for each hand, and see whether pressing ≡ on the left sets `buttons[7]` or leaves the session.
2. Whether `buttons[6]` (thumbrest) gives only `touched`, or also a `value`.
3. Whether turning off "controller haptics" for the site makes `pulse()` resolve `false` or just do nothing.
4. Where a reach "over the shoulder" really ends up relative to the headset for a player 1.65 to 1.90 m tall, with a shield on the left arm.

## Sources

Most sites were blocked by the network proxy. The WebXR specs, the input-profile registry, MDN, three.js and HIGGS were read from their GitHub sources (`main`/`master`/`dev`, read 2026-09-30). The other sources are cited from search-engine extracts; secondary sources and medium-confidence ones are marked.

1. W3C, [WebXR Gamepads Module – Level 1](https://immersive-web.github.io/webxr-gamepads-module/): "xr-standard" mapping, placeholder buttons, "Buttons reserved by the UA or platform MUST NOT be exposed", and gamepad updated in place every frame. Source: `immersive-web/webxr-gamepads-module` `index.bs`.
2. W3C, [WebXR Device API](https://immersive-web.github.io/webxr/): primary action, primary squeeze action, `select*` and `squeeze*` events. Source: `immersive-web/webxr` `index.bs`.
3. WebXR Input Profiles registry, [`meta/meta-quest-touch-plus.json`](https://github.com/immersive-web/webxr-input-profiles/blob/main/packages/registry/profiles/meta/meta-quest-touch-plus.json), and `oculus/oculus-touch-v3.json` (same layout).
4. MDN, [GamepadHapticActuator: pulse()](https://developer.mozilla.org/en-US/docs/Web/API/GamepadHapticActuator/pulse). Source: `mdn/content`.
5. three.js, [`examples/webxr_xr_haptics.html`](https://github.com/mrdoob/three.js/blob/dev/examples/webxr_xr_haptics.html): `gamepad.hapticActuators[0].pulse(intensity, 100)`.
6. Meta, [Meta Quest Touch Pro Controller Support for Browser](https://developers.meta.com/horizon/documentation/web/webxr-pro-controller/): `hapticActuators[0]?.pulse(0.6, 100)` and the Pro's extra actuators (search extract, medium confidence).
7. Meta, [WebXR Hands](https://developers.meta.com/horizon/documentation/web/webxr-hands/): left palm pinch equals the left menu button and leaves the WebXR session (search extract, medium confidence).
8. Meta, [Browser release notes](https://developers.meta.com/horizon/release-notes/web/): 42.3, 2026-02-18, "controller haptics in permissions settings" (search extract, medium confidence).
9. Meta, [WebXR Controller Haptics Issue on Quest Browser v2.1.1034](https://developers.meta.com/horizon/feedback/vr/investigations/938861405320634/): fixed 2026-03-09 (search extract, medium confidence).
10. Meta, [Hands UI best practices](https://developers.meta.com/horizon/design/hands-ui-best-practices/) and [Panels](https://developers.meta.com/horizon/design/panels/) (search extracts, medium confidence).
11. adamhynek, [HIGGS](https://github.com/adamhynek/higgs): `include/config.h` (zone offsets, radii, velocity thresholds, haptic strengths) and `src/hand.cpp` (`IsObjectConsumable`, drop at mouth or shoulder).
12. Asgard's Wrath 2 in-game Codex, [Tutorials – Gameplay](https://asgardswrath2.fandom.com/wiki/Codex-Tutorials-Gameplay) and [Consumables](https://asgardswrath2.fandom.com/wiki/Consumables), transcribed on a fan wiki; Meta, [The Official Asgard's Wrath 2 Player's Guide](https://communityforums.atmeta.com/blog/AnnouncementsBlog/the-official-%E2%80%98asgard%E2%80%99s-wrath-2%E2%80%99-player%E2%80%99s-guide/1140558) (search extracts, medium confidence).
13. UploadVR, [Asgard's Wrath 2 Review](https://www.uploadvr.com/asgards-wrath-2-review/) (secondary).
14. Gaming Nexus, [Asgard's Wrath 2 review](https://www.gamingnexus.com/Article/13961/Asgards-Wrath-2/) (secondary).
15. Steam discussions, [Controls basics](https://steamcommunity.com/app/916840/discussions/0/4515507184333988071/); fandom, [How to play guide for Saints & Sinners](https://saintsandsinners.fandom.com/wiki/How_to_play_guide_for_The_Walking_Dead:_Saints_%26_Sinners) (secondary).
16. fandom, [Deep Pockets](https://saintsandsinners.fandom.com/wiki/Deep_Pockets); Steam discussions, [more backpack slots](https://steamcommunity.com/app/916840/discussions/2/1750148267248611273/) (secondary).
17. Steam discussions, [Explain Medicine to me?](https://steamcommunity.com/app/916840/discussions/0/3896114186158104786/); fandom, [Sterile Bandage](https://saintsandsinners.fandom.com/wiki/Sterile_Bandage) (secondary).
18. 80.lv, [Technical Challenges Behind Walking Dead: Saints & Sinners](https://80.lv/articles/technical-challenges-behind-walking-dead-saints-sinners) (developer interview, search extract, medium confidence).
19. Road to VR, [Boneworks Review](https://roadtovr.com/boneworks-review/) (secondary).
20. fandom, [Boneworks Inventory](https://boneworks.fandom.com/wiki/Inventory) (secondary).
21. Steam discussions, [How do you drink potions now?](https://steamcommunity.com/app/629730/discussions/0/3123802224171971160/) and [U10 Health Potions](https://steamcommunity.com/app/629730/discussions/0/3164335875696287283/) (secondary).
22. Steam discussions, [Difficulty Holstering Weapons](https://steamcommunity.com/app/629730/discussions/0/4524512379485334110/); Nexus, [MoreSlots](https://www.nexusmods.com/bladeandsorcery/mods/3943) (secondary).
23. Warpfrog, [Update 1.0 Changelog](https://steamcommunity.com/app/629730/discussions/4/6513974776606248561/) (search extract, medium confidence).
24. Joel Green (Cloudhead Games), [Finding the magic in VR-centric design: Backpack Inventory](https://cloudheadgames.com/backpack/), 2018 (search extract, medium confidence).
25. Road to VR, [Inside XR Design: Half-Life: Alyx](https://roadtovr.com/these-details-make-half-life-alyx-unlike-any-other-vr-game-inside-xr-design/2/); Combine OverWiki, [Health Pen](https://combineoverwiki.net/wiki/Health_Pen) (secondary).
26. fandom, [Into the Radius Items](https://into-the-radius.fandom.com/wiki/Items) and [Backpack](https://into-the-radius-2.fandom.com/wiki/Backpack); Steam discussions, [How do you access your pouches reliably?](https://steamcommunity.com/app/2307350/discussions/0/669474225528237877/) (secondary).
27. Steam discussions, [Ghosts of Tabor: inventory system](https://steamcommunity.com/app/1957780/discussions/1/3829787744087561838/) and [So many bugs...](https://steamcommunity.com/app/1957780/discussions/1/3830917450446310401/) (secondary).
28. Cmentowski, Krekhov and Krüger, [Toward a Taxonomy of Inventory Systems for VR Games](https://dl.acm.org/doi/10.1145/3341215.3356285) (CHI PLAY 2019), and [Game-Ready Inventory Systems for Virtual Reality](https://ieeexplore.ieee.org/document/9619028) (IEEE CoG 2021) (abstracts via search, medium confidence).
29. Steam discussions, [Skyrim VR: How do you manage your inventory?](https://steamcommunity.com/app/611670/discussions/0/3046105389678946034/); Nexus, [Spell Wheel VR](https://www.nexusmods.com/skyrimspecialedition/mods/47630) (secondary).
30. fandom, [Legendary Tales](https://legendary-tales-vr.fandom.com/wiki/Category:Potion_Shop); Checkpoint Gaming, [VR Corner: Dungeons of Eternity](https://checkpointgaming.net/features/2023/10/vr-corner-dungeons-of-eternity/) (secondary).
