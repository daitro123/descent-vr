# How VR games do gathering and crafting

_Research for [issue 01](../issues/01-how-vr-games-do-gathering-and-crafting.md), 2026-09-30. Sources are numbered and listed at the end._

**How the sources were read.** This environment's egress proxy blocked every page fetch (the Township Tale wikis, UploadVR, Road to VR, Steam, Nexus Mods, Meta's developer site and others). Every claim below therefore comes from search-engine extracts of the linked pages, not from reading them in full. Treat the claims as **medium confidence**, and re-read the linked page before relying on an exact number. Where a source gave no number (most of them give no time per action), the note says so, and any figure we supply is marked **(our estimate)**.

## Bottom line

- **The motion has to be a real swing, and a full swing must beat a tap.** A Township Tale, the most complete hand-driven mining and smithing game on Quest, scores each pick swing on its momentum and arc length, so slow or short swings do less, and "large, frequent swings" through the vein are fastest. [1][2][3] Descent VR's sword already works this way (minimum tip speed, minimum hand travel, damage scaled by speed), so the pick can reuse it.
- **Say how good the hit was with feedback sized to the hit.** In A Township Tale the size of the sparks on the anvil tells you how effective the strike was: small sparks mean a weak swing, a poor tool or cold metal. The metal visibly flattens where you have struck it, and the job is done when the whole piece has been worked. [4] That is the single most borrowable idea here: graded sparks, graded haptics and a shape that changes where you hit.
- **Skill should change speed, not the item.** A Township Tale lets a better swing break a vein in fewer hits and finish a blade sooner, and gives more smithing experience for better hits. [1][4] BlackForge makes precision optional: "you don't get punished for the odd wonky cut". [9] Both fit Descent VR's fixed-stat, hand-made items.
- **Length and repetition are what players hate, not the physical act.** Reviewers liked A Township Tale's mining and smithing in themselves but called the solo loop "a tiresome grind", with a few hours of mining before the smithy is useful, and one review found smithing "extremely tedious and exhausting". [5][6][7] Keep each job to a handful of strikes.
- **Menus kill it; a physical station saves it.** Skyrim VR's vanilla crafting is flat menus, which reviewers called its most unwieldy part, and the most popular VR mods exist to replace the menus with real tools at the forge and real grabbing of plants. [10][11][12]
- **Precision tools frustrate if the physics fights you.** BlackForge's players said the hammer "eats up the metal" and even light taps "smash large chunks off", so it felt like removing material instead of shaping it. [8] Hand Physics Lab's reviewers found fully physical hands "as maddening as it is interesting". [16][17] Snap, clamp and forgive; do not simulate.
- **Fake the liquids.** Owlchemy spent about 850 hours on the coffee in Job Simulator, 500 of them one developer's work on liquid subsystems, because players poured, blocked, heated and mixed in ways nobody planned. [20] Brewing should be discrete steps (drop in, stir, pour into a flask) with a shader or particle stream for the look.

## Findings by game

### A Township Tale (Alta, Quest and PC VR)

The closest match to what Descent VR wants: a Quest game where mining, smelting and forging are all done by hand, at fixed stations in a town.

- **Mining, what the hands do.** Hold a pickaxe and hit an ore vein repeatedly until it breaks. Veins give copper, iron, coal and sandstone. [1][2]
- **Mining, how hits are detected.** The number of hits a vein needs depends on each swing's **momentum** and **arc length**, and on the pickaxe's quality. The wiki describes arc length as the distance between two invisible points along the swing, so short swings do less than long ones; speed also counts, so slow swings do less than fast ones. The fastest mining is "large, frequent swings where the player attempts to go through the ore vein". [1][3] Reviewers put it the same way for every tool task: "a full swing being much more effective than a tap". [13]
- **Mining, how long.** No source gives seconds per vein. What reviewers do say is that getting the blacksmith going "takes a few hours of mining", which is the part that reads as a grind when solo. [5]
- **Smelting.** Put ore in the smelter's input, close it, add fuel, and ingots drop out: 3 ore make 1 ingot for every ore type. Working a fan beside the fuel speeds it up. [1][14] This is a station with a few hand-sized acts (load, latch, fuel, pump) and a wait, not a skill test.
- **Forging, what the hands do.** Heat a weapon head (cast in a mould) in the forge until it glows orange; embers come off it at the best working temperature. Lay it on the anvil and hammer it. [4][14]
- **Forging, how hits are judged.** How fast a piece forges depends on "the effectiveness of the hammer strikes, the toughness of the metal and the temperature of the weapon head". [4] Different metals heat and cool at different rates. [4]
- **Forging, feedback.** "The size of the sparks on impact indicates the effectiveness" of the strike; small sparks mean a weak swing, an ineffective tool or cold metal. The head flattens and spreads where it has been struck, and "the entirety of the weapon head must be forged before it is completed". [4] So the object's shape is itself the progress bar, and hitting only one spot does not finish it.
- **Does skill matter.** Yes, for speed and progression: better swings break veins sooner and finish blades sooner, and smithing experience comes per hit, "better hits provide more experience". [1][4] Swinging at the wrong angle in carpentry can drive a nail crooked or break the material. [13][15]
- **What players disliked.** Solo play "could feel like a tiresome grind" and the design leans on friends to share the load. [5] One Quest review said the realism may be "to its detriment", with smithing "extremely tedious and exhausting" (this exact quote surfaced in a search summary for The Game Crater's review, but its wording could not be confirmed on the page). [6][7] Road to VR noted that repeated sudden changes of height while blacksmithing were uncomfortable. [15] The developers themselves describe the smithy as mixing "physical responsiveness" with "quality-of-life abstractions". [18]

### Skyrim VR (Bethesda) and its mods

- **Vanilla.** Gathering is point and press, and smithing and alchemy open the flat-game menus. Reviewers called the menus the most unwieldy part of the port, and time freezing in a menu breaks the scene. [10]
- **Mods that fix it.** Immersive Smithing is a "VR centric" overhaul: make a hammer at any forge, smelt ore in real time, and use the forge's tools instead of a menu; with Realistic Mining you can go from ore to ingot "without opening a single text-based menu". [11] Immersive Harvesting VR lets you take a plant by physically grabbing it, with a whole-plant grab zone, haptic feedback and **no "Press A to Harvest" prompt**; the ingredient appears in the hand. Its vibration strength is a setting (0 to 1). [12]
- **Lesson.** The community's own fixes are the spec for us: generous grab zones on the plant, a haptic tick when it comes free, and the item landing in the hand.

### Blacksmith sims: BlackForge, Hammer & Anvil VR, Master Bladesmith, Craft Keep VR

- **BlackForge (Quest and PC VR, 2024).** You scoop, smelt, hammer and grind to make blades and other items for a merchant's requests. Every step "is absurdly precise if you want it to be", but you are not punished for "the odd wonky cut of wood or messy bit of metal", and the preview calls it relaxing. [9] Players' complaint: the hammer is "finicky", "eats up the metal" and "doesn't feel like I'm shaping the metal, only removing chunks"; "even when hammering lightly, it can smash large chunks off", so they used the grinding wheel instead. [8] A 5/10 review summed it up as creative core play with "janky pacing". [19]
- **Hammer & Anvil VR** and **Master Bladesmith** go further into simulation (ore processing through a trommel, shaping, handles on a lathe) and both sit at mixed Steam ratings, 61% and 65% positive. [21][22] Craft Keep VR has you pour molten metal into moulds and bang the moulds with a hammer, also mixed at 63%. [23]
- **Lesson.** The more a sim models real metal deformation, the more its players complain the tool does not do what they meant. The well-liked part (A Township Tale's sparks and flattening) is a canned deformation: each good strike advances a preset shape.

### Waltz of the Wizard (Aldin Dynamics)

- **What the hands do.** Take one ingredient from each of three plates or tablets and throw it into a boiling cauldron; the combination decides the spell or potion. A talking skull gives hints when you are stuck. [24][25][26]
- **How long.** Seconds: three grabs and three drops. The satisfaction is discovery (which combination does what), not labour. [24][25]
- **Lesson.** Brewing can be very short and still feel magical when the result is a surprise you caused. Aldin built its later "Natural Magic" update around "natural movements, gestures and mic input", and a reviewer praised the "natural input mechanics". [24][27]

### Owlchemy Labs (Job Simulator, Vacation Simulator)

- **Hands.** Hide the hand while it holds something ("tomato presence"); presence moves to the held object and the brain accepts it. [28] A held pick or pestle can replace the hand model.
- **Liquids.** Letting players pour from cup to cup forced temperature, colour mixing and blocking the cup's mouth, and cost about 850 hours in total. [20]
- **Comfort.** Their Meta case study says tinkering with objects within your play space was "the most comfortable and accessible" part of room-scale VR. [29] Stations should bring the work to waist height, within reach.

### Hand Physics Lab (Holonautic)

- About 80 small physics tasks with hands that obey physics: they cannot pass through tables or lift things too big. [16][30] Reviewers found it fun and "maddening", partly from hand-tracking dropouts that launch a lightbulb "into the stratosphere". [16][17] Its design question was "did the system understand what the player meant?", not "did it detect the gesture?". [30]
- **Lesson.** Aim for the player's intent. Snap a herb into the knife's path, clamp the ingot to the anvil, and never let a held tool be knocked away by physics.

### Other swing models worth copying

- **Walkabout Mini Golf.** The putter head is always visible but only solid while you hold the grip ("Grip-to-Putt"), so practice swings pass through the ball and a shaky hand never takes a stroke by accident. [31][32] For a pick near a vein, or a hammer resting on the anvil, a similar rule (strikes count only on a committed downswing) prevents accidental hits.
- **Beat Saber.** A cut scores up to 70 points for a 100 degree swing into the block, up to 30 for a 60 degree follow-through, and up to 15 for hitting the centre. [33] This is a clean, legible way to grade one strike from its approach arc, follow-through and aim, and it is already how Descent VR's sword thinks.
- **Blade & Sorcery.** Damage and embedding depend on impact velocity, with a minimum of about 2 m/s mentioned for its enhanced collision checks (mod documentation, low confidence). [34] Descent VR's sword already uses 2.8 m/s at the tip (`CONFIG` in `src/config.ts`).

### Haptics and fatigue

- **Haptics.** Meta's guidance is to use haptics consistently, with a clear causal link to the action, and alongside sound and visuals, not instead of them. [35] Quest 3 controllers have wideband voice-coil motors, but in the browser we only get `hapticActuators[0].pulse(intensity, ms)`, one amplitude and a duration. [35][36] Descent VR already wraps that as `input.pulse()` (`src/player/input.ts`) and scales hit strength by swing power (`src/combat/combat.ts`). So variety has to come from pattern: one sharp pulse, a double tap, a pulse whose strength follows the hit.
- **Fatigue.** The "gorilla arm" effect is measurable: Consumed Endurance rates arm fatigue from how long and how high the arm works, and fatigue rises quickly with the arm raised away from the body. [37] Overhead swings and long hammering sessions tire the shoulder; downward strikes at about waist height, a few at a time, are gentle. Road to VR's note on height changes at the anvil points the same way. [15]

## Summary table

| Game | What the hands do | Time for one job | How hits count | Feedback | Skill changes | Complaints |
|---|---|---|---|---|---|---|
| A Township Tale, mining | Swing pick at vein | Not given; hours of mining to get going | Momentum, arc length, tool quality | Vein breaks into ore | Fewer hits | Solo grind |
| A Township Tale, forging | Heat, lay on anvil, hammer | Not given | Strike quality, heat, metal toughness | Spark size, metal flattens where hit, embers at right heat | Faster, more XP | "Tedious and exhausting", height changes |
| Skyrim VR (vanilla) | Point and press; menus | Instant | None | Menu | None | Menus break the scene |
| Skyrim VR mods | Grab plant; real forge tools | Seconds | Grab zone | Haptic on harvest | None | (Mods exist because vanilla lacks it) |
| BlackForge | Scoop, smelt, hammer, grind | Minutes per order | Physics deformation | Chunks removed | Optional precision | Hammer "eats up the metal" |
| Waltz of the Wizard | Grab 3 ingredients, throw in cauldron | Seconds | Which ingredients | Spell or effect appears | Discovery only | Few noted |
| Job Simulator | Pour, mix | Seconds | Tilt | Liquid, colour, steam | None | (Cost 850 dev hours) |

## Patterns to try in the prototypes

All of these fit the Quest 3 browser budget: 72 fps, about 300 draw calls, at most 4 point lights.

**Gathering ([issue 05](../issues/05-swinging-the-pick-and-cutting-herbs.md))**

1. **Reuse the sword's swing gate for the pick.** A strike counts only after the hand has committed (about 0.2 m of travel) and the pick head is over about 2.8 m/s, and its power scales with head speed. Try **3 to 5 good strikes per vein**, and let a strong strike count for more (for example 1.5), so a tidy player breaks it in 3 and a timid one in 6. Downward and sideways arcs at waist-to-chest height only; a vein placed low or overhead will tire the arm.
2. **A glint to aim at.** Show one bright weak spot on the vein, moving after each hit. A strike inside it gets bigger sparks and counts more. This gives aim a reason without precision frustration, and it keeps the swing away from the Earthshaker gesture (tip driven fast into the floor) because the target sits above floor height.
3. **Grade the feedback in three steps.** Tap (under the speed gate): a dull clink and a light 20 ms pulse, nothing else. Good strike: sparks, a crack decal or a crack stage on the vein, and a sharp pulse whose strength follows power (as `combat.ts` does). Weak-spot strike: more sparks, a louder ring, a short hit-stop. Use one instanced spark system (1 draw call), no new point light; tint the emissive of the vein for a flash.
4. **Visible stages of damage.** Swap the vein between 3 prebuilt meshes (whole, cracked, broken) instead of deforming it. On the last strike it bursts into 2 or 3 ore chunks that you grab (a satisfying grab, not a menu), or that fly to the bag, as a variant to compare.
5. **Herbs by the grab, not by a button.** Copy Immersive Harvesting: a generous grab zone on the whole plant, grip it and pull up past a small distance, with a rising haptic while it resists and a pop when it comes free. As a knife variant, one committed slice through a band near the base (reuse the swing gate at a lower speed). Keep plants at knee height or above, or on rocks and banks, so no one kneels to the floor.
6. **Keep the job to about 3 to 6 seconds (our estimate), and never more than a dozen swings per visit.** A Township Tale's praise and its complaints both come from the same mechanic; the difference is how many times you repeat it.

**Crafting ([issues 06](../issues/06-hammering-at-the-anvil.md) and [07](../issues/07-brewing-at-the-alchemy-table.md))**

7. **The shape is the progress bar.** Put the ingot on the anvil and clamp it (it cannot be knocked off). Mark 3 to 5 spots on it; each good strike on a spot flattens it one preset step (a morph target or a swap between prebuilt meshes). The item is done when every spot is worked, as in A Township Tale. No free-form deformation, which is what BlackForge's players fought.
8. **Heat as a gentle window, not a fail state.** The metal glows (emissive, and one pooled point light moved to the forge while you are there) and cools over about 6 to 10 seconds (our estimate). Cold strikes give small sparks and do nothing; a return to the forge reheats it. No ruined materials.
9. **Grade each hammer strike like Beat Saber, but coarsely.** Down-strike speed and landing on the marked spot decide "good" or "great". Great strikes finish a spot in one hit; good strikes need two. Feedback is spark size, the ring's pitch and pulse strength.
10. **Quench as the finishing beat.** Dip the piece in the trough: a hiss, a burst of steam particles and a long soft pulse, and the item is done. It is a satisfying end marker that costs one second.
11. **Brewing as three to four discrete acts with a surprise.** Drop herbs into the mortar, grind with a few circular strokes of the pestle (count revolutions, with a crunch sound and a pulse per turn), tip the powder into the pot, stir a couple of turns, then hold a flask under the spout. Fake every liquid: a colour change on the pot's surface, and a stream mesh or particles when you tilt past an angle. Waltz of the Wizard shows the payoff can be the colour and puff of smoke when it is done.
12. **Choose the recipe physically.** Laying the materials on the anvil or the table, or touching a pattern on the wall, not a floating menu. Skyrim VR's menus are the thing players and modders worked to remove.
13. **Skill buys speed or a small bonus, never a worse item.** A tidy player finishes in fewer strikes or turns; a sloppy one just takes longer. This matches A Township Tale and BlackForge and leaves [issue 08](../issues/08-does-a-better-hand-make-a-better-thing.md) room to add a small reward for great strikes.
14. **Hide the hand while it holds a tool** (tomato presence), and never let physics pull a tool out of the hand.

## Sources

1. [Mining, Official A Township Tale Wiki (fandom)](https://townshiptale.fandom.com/wiki/Mining) and [Mining (wiki.gg)](https://townshiptale.wiki.gg/wiki/Mining)
2. [Ore, Official A Township Tale Wiki](https://townshiptale.fandom.com/wiki/Ore)
3. [Ore Vein, Official A Township Tale Wiki](https://townshiptale.fandom.com/wiki/Ore_Vein) and [Damage](https://townshiptale.fandom.com/wiki/Damage)
4. [Smithy, Official A Township Tale Wiki](https://townshiptale.wiki.gg/wiki/Smithy) and [Blacksmith](https://townshiptale.fandom.com/wiki/Blacksmith)
5. [A Township Tale Review, UploadVR](https://www.uploadvr.com/a-township-tale-review/) and [Android Central review](https://www.androidcentral.com/township-tale-review)
6. [A Township Tale: An Uneasy Journey, The Game Crater](https://www.thegamecrater.com/a-township-tale-an-uneasy-journey-oculus-quest-review/)
7. [A Township Tale review, TechRaptor](https://techraptor.net/gaming/reviews/township-tale-review)
8. [BlackForge Steam reviews (top rated)](https://steamcommunity.com/app/2146140/reviews/?browsefilter=toprated)
9. [BlackForge Preview: A Chilled Out Creation, UploadVR, 2024-06-05](https://www.uploadvr.com/blackforge-a-smithing-adventure-preview/)
10. [Skyrim VR Review, Fullsync](https://fullsync.co.uk/shout-it-out-skyrim-vr-review/) and [The VR Coach](https://thevr.coach/skyrim-vr-review/)
11. [Immersive Smithing, Nexus Mods](https://www.nexusmods.com/skyrimspecialedition/mods/72298)
12. [Immersive Harvesting VR, Nexus Mods](https://www.nexusmods.com/skyrimspecialedition/mods/186754)
13. [Crafting fun together: A Township Tale hands-on, Gaming Trend](https://gamingtrend.com/impressions/crafting-fun-together-a-township-tale-vr-hands-on-impressions/)
14. [Smelting, Forging & Crafting in VR, Alta (developer blog), 2017-10-13](https://townshiptale.com/news/smelting-forging-and-crafting-in-vr) and [A Township Tale Blacksmith Guide, UploadVR](https://www.uploadvr.com/a-township-tale-blacksmith-guide/)
15. ['A Township Tale' Quest Review, Road to VR](https://roadtovr.com/township-tale-oculus-quest-review-most-immersive-vr-mmo-yet/) and [Road to VR preview](https://roadtovr.com/a-township-tale-oculus-quest-preview-deep-crafting/)
16. [Hand Physics Lab Review, UploadVR](https://www.uploadvr.com/hand-physics-lab-review/)
17. [Hand Physics Lab review, Skarredghost](https://skarredghost.com/2021/04/15/hand-physics-lab-review-2/)
18. [Quick Look: Blacksmithing in A Township Tale, Alta (developer blog)](https://townshiptale.com/news/quick-look-blacksmithing-in-a-township-tale)
19. [BlackForge review, Auganix](https://www.auganix.org/blackforge-a-smithing-adventure-review-hot-steel-rough-edges/)
20. [Why A Cup Of Coffee In Job Simulator Took 850 Hours To Make, UploadVR](https://www.uploadvr.com/job-simulator-coffee/)
21. [Hammer & Anvil VR, Steam](https://store.steampowered.com/app/1017780/Hammer__Anvil_VR/)
22. [Master Bladesmith, Steam](https://store.steampowered.com/app/1194830/Master_Bladesmith/)
23. [Craft Keep VR, Steam](https://store.steampowered.com/app/546350/Craft_Keep_VR/) and [UploadVR](https://www.uploadvr.com/craft-keep-vr/)
24. [Waltz of the Wizard: The Magic of Natural Interactions, Construct Studio](https://medium.com/constructstudio/waltz-of-the-wizard-the-magic-of-natural-interactions-d0ddbbea545a)
25. [Waltz of the Wizard free edition guide, Steam Community](https://steamcommunity.com/sharedfiles/filedetails/?id=1999896854)
26. [Waltz of the Wizard, Steam](https://store.steampowered.com/app/1094390/Waltz_of_the_Wizard_Natural_Magic?l=english)
27. [Announcing Natural Magic for Waltz of the Wizard, Aldin Dynamics](https://medium.com/aldin-dynamics/announcing-natural-magic-for-waltz-of-the-wizard-our-first-major-expansion-6d083a1f7843)
28. [Tomato Presence, Owlchemy Labs](https://owlchemylabs.com/tomatopresence)
29. [Owlchemy Labs Case Study: Lessons Learned from Job to Vacation, Meta](https://developers.meta.com/horizon/blog/owlchemy-labs-case-study-lessons-learned-from-job-to-vacation/) and [GDC Vault talk](https://www.gdcvault.com/play/1025757/Lessons-Learned-from-Job-Simulator)
30. [Hand Physics Lab success story, Meta](https://developers.meta.com/horizon/discover/success-stories/hand-physics-lab-holonautic/)
31. [Walkabout Mini Golf's Grip-To-Puppet, UploadVR](https://www.uploadvr.com/puppeteering-walkabout/)
32. [Grip-To-Putter, Mighty Coconut](https://www.mightycoconut.com/gtp)
33. ['Beat Saber' Scoring Explained, Road to VR](https://roadtovr.com/beat-saber-studio-shows-get-highest-score-new-video/) and [Beat Saber precise scoring, Steam news](https://store.steampowered.com/news/app/620980/view/4036870438631348235)
34. [Improved Collisions, Blade & Sorcery Nexus](https://www.nexusmods.com/bladeandsorcery/mods/12703) (low confidence, mod documentation)
35. [Designing Haptics, Meta](https://developers.meta.com/horizon/documentation/unreal/unreal-haptics-design-guidelines/) and [Haptics Overview, Meta](https://developers.meta.com/horizon/resources/haptics-overview/)
36. [GamepadHapticActuator, MDN](https://developer.mozilla.org/en-US/docs/Web/API/GamepadHapticActuator)
37. [Consumed Endurance: A Metric to Quantify Arm Fatigue of Mid-Air Interactions, Hincapié-Ramos et al., CHI 2014](https://hci.cs.umanitoba.ca/assets/publication_files/Consumed_Endurance_-_CHI_2014.pdf)
