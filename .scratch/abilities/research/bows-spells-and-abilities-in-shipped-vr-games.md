# Bows, spells and abilities in shipped VR games

_Research for [issue 01](../issues/01-bows-spells-and-abilities-in-shipped-vr-games.md), 2026-09-30. Sources are numbered and listed at the end._

## Answer

Shipped games agree on a few things:

- **Bows:** don't make the player reach for a quiver. Show the draw with haptics.
- **Spells:** a few spells, each on its own motion, and the off hand casts too.
- **Abilities:** a small loadout of about four per hand, called up with a grip plus a flick.
- **Comfort:** gestures fail by being too strict, and arms tire when held high.

What it means for Descent VR:

- **Ranger's bow.**
  - The bow sits in the left hand, where the warrior's shield is. The right hand draws. Offer a handedness swap, as In Death does. [3]
  - Don't use a quiver. Touching the string with the right hand and holding the trigger nocks an arrow, as in In Death and Asgard's Wrath 2. [4][5][14] This also keeps the hand away from the headset, where Quest tracking fails. [5]
  - Damage scales with how far the string is drawn (Asgard's Wrath 2). [14]
  - Haptics build during the draw and end in one sharp pulse on release (Asgard's Wrath 2, Meta's haptics guide). [15][21]
  - The arrow leaves along the line from the nock through the bow hand. Tune the aim offsets the way Elven Assassin's patch did (see Bows). [8]
  - Put the bow hand's grip on a short ward that blocks projectiles, as In Death puts a shield on the off-hand grip. [2][3] Keep the dash on B/Y.
  - Special shots are the ranger's abilities: at most one on a button, the rest by gesture. Asgard's Wrath 2 cycles arrow types from a button on the bow hand, which Descent's one-button rule allows. [14]
- **Mage's casting.**
  - Each hand holds a spell. Hold the trigger to conjure or charge, then throw or push the palm out to cast. Skyrim VR, Blade & Sorcery, Hellsweeper and Waltz of the Wizard all work this way. [10][11][13][17][19]
  - Let how the player throws shape the spell. In Waltz of the Wizard a fast throw makes a tight bolt and a slow toss a wide spread. [19]
  - The off hand is a second caster, not an empty hand.
  - Bringing both hands together makes a merged spell (Blade & Sorcery, Hellsweeper). [11][17] It fits the map's rule that the deepest talents grant new abilities: Blade & Sorcery puts its merges in the top tier of its skill tree. [12]
  - Don't make players pick spells from a wheel mid-fight. Skyrim VR's menus and Blade & Sorcery's wheel led to mods that equip spells by gesture or by voice. [11][13][24][25]
- **Triggering abilities.**
  - Use Hellsweeper's scheme: hold the grip, then flick the hand up, down, in or out to call one of four loadout slots. [17] Holding the grip first also keeps idle movement from firing an ability, which is Meta's advice for hand gestures. [20]
  - Give every recognised gesture a sound, a flash and a haptic pulse, and do nothing on a near-miss. [20]
  - Make gesture thresholds loose and adjustable. Hellsweeper players complain its gestures are too strict and misfire, and its developers let players adjust the threshold for some moves. [18][23]
  - Keep to about four abilities per hand. Hellsweeper caps a run at four loadout items. Blade & Sorcery builds on three elements and changes how spells behave instead of adding new buttons. [12][17] No source measures how many abilities players can keep in mind. This limit is our reading of what shipped.
- **Fatigue.**
  - Casting and ward poses should work at chest height, with the elbows near the hips. Meta says hands held above the heart tire quickly. [20]
  - Pace fights so the arms get rests. Meta advises rest periods and few reflex-heavy events unless the game is meant as a workout. [20] Survios added stamina so flailing stops paying. [22] Rage, focus and mana can play that role.
  - Offer a seated mode and adjustable thresholds, as Hellsweeper does. [23]

## Findings

### Bows

**In Death / In Death: Unchained (Sólfar, then Superbright on Quest)**

- **Controls.** Meta's own tips page gives the layout: the dominant hand's trigger shoots, the off hand's grip raises a shield, and the in-game menu swaps hands. [3] The same page tells players to "move, lean, dodge, and lurk behind corners". [3]
- **Defence.** In Death's first prototype (late 2016) had a bow, a shield and two arrows, one to kill and one to teleport. The shield blocks enemy arrows and most melee. [2][1] (Meta's launch post and hands-on coverage; medium confidence, from search extracts.)
- **No quiver.** You put your hand to the string, press the trigger and pull. Road to VR notes this avoids tracking the hand behind your head, where the headset can't see it. [5] (First-hand review.)
- **Arrows.** Standard arrows are unlimited, and special arrows come in limited numbers. [6] (First-hand review.)
- **Tracking.** Road to VR: archery needs the headset to track the drawing hand close to the face. On Quest, a hand held too close to the cameras, or just outside their view, freezes or jitters. [5] (First-hand review of the Quest 1 port; Quest 3 not tested.)
- **Wireless.** Superbright says wireless play is "a massive feature" for In Death, because arrows come from every direction. [7] (Developer interview, from a search extract; medium confidence.)

**Elven Assassin (Wenklly)**

- **Nocking.** You pluck each arrow from behind your shoulder. [9] (Review.)
- **The 1.0.8 patch.** The developer rebuilt the bow because players disliked it. [8] (Developer patch notes.)
  - The further you draw, the closer the arrow moves to your eye vertically, which stops shots flying over targets.
  - The arrow now flies straight ahead, where before it pulled to the left.
  - A new calculation for the drawing hand's offset makes aim more consistent.
  - The bow model was scaled up, the arrow made thicker and its speed raised.
- **Handedness.** Players report that the left-hand option only mirrors the gloves and bow. There is also an "arrow hand offset" setting, so a player's hand doesn't hit the headset. [26] (Player forum; low confidence.)
- **Magic.** Magic is a separate "RPG" mode, alongside plain archery. [9]

**Skyrim VR (Bethesda)**

- **Hands.** Each hand holds a sword, shield or spell. A bow takes both hands. [10]
- **Shooting.** Bring the arrow to the string, hold the attack button to nock, draw, and release to fire. Returning the arrow to its start cancels the shot. [10][27]
- **Aiming.** An optional "Realistic Bow Aiming" setting lets the drawing hand aim the shot as well as the bow hand. [10][27] (PlayStation Blog launch guide and Bethesda support; medium confidence, from search extracts.)

**Asgard's Wrath 1 and 2 (Sanzaru)**

- **Drawing.** In Asgard's Wrath 2 you grab the string, pull and release. A fuller draw does more damage. [14]
- **Arrow types.** A trigger on the bow cycles between bounce, pierce and split arrows. Holding it readies a grappling arrow. [14] (In-game codex text, transcribed on the fan wiki; medium confidence.)
- **Haptics.** Sanzaru made more than 700 haptic effects for Quest 3. With Alvilda's bladed bow, "the player feels the weapon charge before releasing the arrow". Haptics play off the same events as the audio, through FMOD. [15] (Meta developer blog.)

### Spellcasting

**The Wizards (Carbon Studio)**

- **Gestures.** The six basic spells each have their own gesture. There are no menus or button combinations. [16] (Coverage at launch.)
- **Why gestures.** Carbon Studio's 2026 retrospective says the Vive wands were held "almost like wands", which pushed them to gestures. Their core loop is "gesture → magic → world reaction", and their lesson is: "Magic cannot be a button. Magic has to be movement and instinct." [28] (Developer blog, from a search extract; the page itself was blocked.)
- **Gaps.** I could not source how The Wizards handles missed gestures or what the off hand does.

**Blade & Sorcery (Warpfrog)**

- **Choosing a spell.** Hold a button, move the hand over a spell on the wheel, and release the button. [11]
- **Casting.** The trigger casts, and the hand's motion finishes the spell:
  - Fire is thrown.
  - Lightning is held down and aimed by tilting the hand.
  - Gravity charges for half a second, then pushes out as a shockwave.
  - Holding a spell against a weapon imbues the weapon with it.
  - Telekinesis is aimed with an open palm.
  - Holding the same spell in both hands and bringing them together makes a stronger "merge" spell. [11]

  (Community wiki; medium confidence.)
- **Skill tree.** Warpfrog's Crystal Hunt preview describes five paths: Fire, Lightning, Gravity, Body and Mind. [12] (Developer announcement.)
  - Tier 1 holds the familiar spells, tier 2 something new, and tier 3 "the big merge skills". Some skills need two paths, such as Fire with Gravity.
  - Warpfrog avoided "+5 damage" nodes. Each unlock changes how a spell behaves, for example fireballs that bounce, or chain lightning between armoured enemies.
- **Mods.** A popular mod equips spells with more than 40 hand gestures, as "a much more natural way" than the "large cumbersome spell wheel". [24] (The mod's own page; it shows what players asked for, not Warpfrog's view.)

**Skyrim VR**

- **Casting.** You hold a trigger to cast or charge, point the hand, and release to fire a charged spell. Each hand casts on its own, so you can cast two spells at once. [10][27]
- **Choosing a spell.** Spells and shouts are set in the menus. Players describe shouting as choosing the shout in the magic menu, then pressing a grip or side button. [29] (Player forum.)
- **Mods.** The Nexus mods for Skyrim VR include a spell wheel, spell gestures, voice-equip and glyph drawing. [13][25] These fill a gap in the base game (our reading).

**Waltz of the Wizard (Aldin)**

- **Designed for hands.** Aldin says the game was built "from the very beginning" around natural hand interaction. It added hand tracking on Quest 1 in 2020, and voice spells later. [30] (Developer blog.)
- **Natural Magic's particle spell.** Pull your palms toward you while gripping to gather particles, then release to throw them. A quick throw makes a tight, powerful shot, and a slow toss a wide spread. Hold the trigger again to steer the shot in flight. [19] (First-hand hands-on write-up.)
- **Powers update.** The first update added seven powers cast by hand gesture, beside the particle spell, a sonic scream and telekinesis. [31][19] (Developer's Steam news; hands-on coverage.)

**Hellsweeper VR (Mixed Realms)**

- **Summoning.** Holding the grip and flicking up, down, in or out calls the item in that slot into that hand. [17]
- **Casting.** Hold the trigger with an element in hand, then push the palm forward "as if pushing against a wall". [17]
- **Merging.** Slamming two elements together and pushing both palms out makes a combined spell. It unlocks at mastery level 2. [17]

(The developer's official guide on Steam.)

### Many abilities on one controller

- **Hellsweeper.** A run carries up to four weapons, guns and spells, one per flick direction, and either hand can summon from them. [17] Its developers say the gesture system lets players switch skills and call up spell variants as the fight needs. [23] (Developer interview.)
- **Asgard's Wrath 2.** It spreads abilities across different kinds of input:
  - The grips hold weapons.
  - Pointing, gripping and pulling back recalls a thrown weapon.
  - Holding B raises a beam to command your follower.
  - The bow's trigger cycles arrow types.
  - "Heroics" are bought in the skill tree, and each node shows a short tutorial on how to perform its move. [14]
- **Divine Wrath.** In Asgard's Wrath 2, blocking, parrying, dodging, weak-point hits and kills charge your weapons for a while. [32] (Meta's player guide.) This is close to Descent's rage.
- **Blade & Sorcery.** It grows the kit by changing what a spell does, not by adding inputs (see Spellcasting). [12]
- **How many players keep in mind.** None of these sources measures it. What shipped points to about four per hand, and growth through changing existing spells rather than adding inputs (our reading).

### Comfort and fatigue

- **Arm position.** Meta's hand-interaction guidelines ask for arms close to the body, with the elbows level with the hips. Hands above heart level tire quickly (the "gorilla arm" problem). [20]
- **Pacing.** The same guidelines ask for rest periods, and no time-based or reflex-heavy events unless the game is meant as a workout. [20]
- **Missed gestures.** Meta's guidelines:
  - Gate gestures, so idle movement doesn't fire them.
  - Keep testing for accidental triggers.
  - Confirm every recognised action with sound and visuals. [20]
- **Where gestures fail.** A Hellsweeper player review calls its gestures "way too strict". It says swings need too much force, a flick down can summon the wrong item, and a flick too far does nothing. [18] (Player review; it shows the mechanic first-hand.)
- **Settings.** Hellsweeper's developers added a seated mode and adjustable thresholds for moves like crouch-to-slide. They still recommend standing. [23] One review found its movement caused sickness even with tunnel vision on. [23]
- **Flailing.** Survios added limited stamina to its boxing game because players flailed their arms. Fast punches tire the avatar, and the player must defend until stamina comes back. [22] (Trade press reporting the developer.)
- **Asgard's Wrath 1.** Parrying costs stamina, a swing too close to an enemy lands with the hilt, and reaching to the sheath recalls weapons faster. [33] (Meta's tech blog.)
- **Haptics.** Meta's guide says to design haptics together with sound and visuals. Use amplitude and frequency envelopes for continuous effects, and short "emphasis points" for crisp moments. [21]

## To check on the headset

1. In the Quest 3 browser, how well the right controller tracks when drawn to the chest, and when drawn to the cheek. The In Death Quest port found tracking unreliable close to the face. [5] This decides where the draw anchors.
2. Whether a rising haptic during the draw and a pulse on release feel right. WebXR's `GamepadHapticActuator` pulse is cruder than Meta's Haptics SDK.
3. How often the grip-plus-flick scheme misfires. Hold a real fight for a minute and count wrong and missed summons against a loose threshold and a strict one.
4. After a five-minute arena fight, whether charging and casting at chest height tires the arms less than casting at head height.

## Sources

Most sites were blocked by the network proxy, and I could not open any page directly. Every claim comes from search-engine extracts of the page named. Treat each as medium confidence unless it is marked low. Where one claim cites several sources, the search extract did not say which of them held it. Developer and platform sources come first; reviews and forums are cited only where they show a mechanic first-hand.

1. Road to VR, [GDC 2018 hands-on: In Death](https://roadtovr.com/hands-roguelike-bow-shooter-death/), and UploadVR, [In Death hands-on](https://www.uploadvr.com/hands-on-in-death-is-a-promising-vr-roguelike-bow-shooter/): the trigger nocks an arrow, and another button nocks the teleport arrow; the shield blocks arrows and most melee.
2. Meta blog, [VR Goes Roguelike: In Death available now on Rift](https://www.meta.com/blog/vr-goes-roguelike-medieval-shooter-in-death-available-now-on-rift/): the late-2016 prototype had a bow, a shield and two arrows.
3. Meta blog, [Oculus Tips & Tricks: In Death: Unchained](https://www.meta.com/blog/oculus-tips-tricks-in-death-unchained/): the dominant trigger shoots, the off-hand grip raises the shield, the hands can be swapped, and players should "move, lean, dodge".
4. Meta blog, [Take a Bow: In Death: Unchained on Quest](https://www.meta.com/blog/take-a-bow-archery-rouge-lite-in-death-unchained-now-available-on-oculus-quest/): haptics on nock and fire.
5. Road to VR, ['In Death: Unchained' review](https://roadtovr.com/death-unchained-review-fine-roguelike-bow-shooter-quest/): no quiver; Quest tracking of a hand close to the face.
6. UploadVR, [In Death: Unchained review](https://www.uploadvr.com/in-death-unchained-review/): unlimited standard arrows, limited special arrows.
7. UploadVR, [Taking Over In Death: Superbright on Quest challenges](https://www.uploadvr.com/in-death-unchained-interview/): interview with CEO Wojtek Podgorski.
8. Wenklly, [Elven Assassin 1.0.8: Major Bow Mechanics Improvement](https://store.steampowered.com/news/app/503770/view/5153763150564617679) (Steam patch notes, 2017-01-14).
9. [Elven Assassin on Meta Quest](https://www.meta.com/experiences/elven-assassin/2325731427501921/) and 6DOF Reviews, [Elven Assassin review](https://6dofreviews.com/reviews/games/quest/elven-assassin/): arrows plucked from behind the shoulder; the RPG and Normal modes.
10. PlayStation Blog, [The Skyrim VR launch guide: controls, settings, and more](https://blog.playstation.com/2017/11/18/the-skyrim-vr-launch-guide-controls-settings-and-more/).
11. Blade & Sorcery community wikis: [Magic](https://blade-sorcery.fandom.com/wiki/Magic), [Gravity](https://blade-sorcery.fandom.com/wiki/Gravity), [Lightning](https://blade-sorcery.fandom.com/wiki/Lightning), [bladeandsorcery.wiki.gg](https://bladeandsorcery.wiki.gg/).
12. Warpfrog, [Crystal Hunt Skills Preview](https://steamcommunity.com/games/629730/announcements/detail/3862463748010474177) (Steam announcement).
13. Nexus Mods, [Spell Wheel VR](https://www.nexusmods.com/skyrimspecialedition/mods/47630) and [Touch Gesture VR](https://www.nexusmods.com/skyrimspecialedition/mods/27815); UploadVR, [Skyrim VR mod equips spells and shouts by voice](https://www.uploadvr.com/skyrim-vr-mod-lets-equip-spells-shouts-using-just-voice/).
14. Asgard's Wrath 2 in-game codex, transcribed on the fan wiki: [Tutorials: Equipment](https://asgardswrath2.fandom.com/wiki/Codex-Tutorials-Equipment) and [Tutorials: Combat](https://asgardswrath2.fandom.com/wiki/Codex-Tutorials-Combat).
15. Meta developer blog, [Asgard's Wrath 2: A deep dive into the haptic design journey](https://developers.meta.com/horizon/blog/asgards-wrath2-and-haptics-studio/).
16. Tom's Hardware, [Carbon Studio's The Wizards makes you a powerful spellcaster](https://www.tomshardware.com/news/the-wizards-vr-carbon-studio,33450.html); Carbon Studio, [The Wizards: Quest Edition](https://carbonstudio.pl/en/the-wizards-quest-en/).
17. Mixed Realms, [Official Hellsweeper VR Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3046516841) (Steam guide).
18. Steam, [Hellsweeper VR negative reviews](https://steamcommunity.com/app/1341490/negativereviews/?l=english&browsefilter=toprated) (player reviews; low confidence).
19. UploadVR, [Waltz of the Wizard PS VR2 Natural Magic hands-on](https://www.uploadvr.com/waltz-of-the-wizard-psvr2-natural-magic/), and Road to VR, [Hands-on with Waltz of the Wizard: Natural Magic](https://roadtovr.com/hands-waltz-wizard-natural-magic-flexible-clever-sorcery-massive-dungeon/) and ['Powers' update](https://roadtovr.com/waltz-wizard-natural-magic-powers-update/).
20. Meta Horizon design docs: [Hands best practices](https://developers.meta.com/horizon/design/hands-best-practices/) and [Hands UI best practices](https://developers.meta.com/horizon/design/hands-ui-best-practices/).
21. Meta Horizon design docs: [Haptics: best practices](https://developers.meta.com/horizon/design/haptics-best-practices/) and [Haptics](https://developers.meta.com/horizon/design/haptics-overview/).
22. Tom's Hardware, [Survios believes it solved the VR melee problem](https://www.tomshardware.com/news/survios-vr-phantom-melee-technology,36678.html).
23. Dread Central, [Pushing fast fluid movement in VR with Hellsweeper](https://www.dreadcentral.com/horror-gaming/489751/pushing-fast-fluid-movement-in-virtual-reality-with-hellsweeper/) (interview with Edi Torres and Chalit Noonchoo); the sickness report is from [dialognews.ca](https://dialognews.ca/2023/09/25/virtualrealities-hellsweeper-vr/) or [CGMagazine](https://www.cgmagonline.com/review/game/hellsweeper-vr-review/) (the search extract didn't say which).
24. Nexus Mods, [The Wizard's Hands: Spell Gesture System](https://www.nexusmods.com/bladeandsorcery/mods/11783).
25. Nexus Mods, [MageVR](https://www.nexusmods.com/skyrimspecialedition/mods/21297) and [ISPVR: Immersive Spellcasting VR](https://www.nexusmods.com/skyrimspecialedition/mods/164183).
26. Steam forums: [Arrow hand offset option](https://steamcommunity.com/app/503770/discussions/0/348292787752296270/) and [Oculus left hand bow](https://steamcommunity.com/app/503770/discussions/0/1621724904371471548/) (players; low confidence).
27. Bethesda support, [What motion controls are available for Skyrim VR on the PS4?](https://help.bethesda.net/app/answers/detail/a_id/40547/~/what-motion-controls-are-available-for-skyrimvr-on-the-ps4).
28. Carbon Studio, [How The Wizards was created](https://carbonstudio.pl/en/2026/02/04/how-the-wizards-was-created-carbon-studio-vr-game/) (2026-02-04).
29. Steam forums, [How do shouts work in this](https://steamcommunity.com/app/611670/discussions/0/1696043806564804489/) and [Shouts](https://steamcommunity.com/app/611670/discussions/0/1640915206488790860/) (players; low confidence).
30. Aldin, [Waltz of the Wizard: PS VR2 hand tracking update](https://medium.com/aldin-dynamics/waltz-of-the-wizard-ps-vr2-hand-tracking-update-758efd445b04) (developer blog).
31. Aldin, [Waltz of the Wizard: POWERS, the first update for Natural Magic](https://store.steampowered.com/news/app/1094390/view/2879480028552035539) (Steam news).
32. Meta blog, [Asgard's Wrath 2: your guide to the epic VR action RPG](https://www.meta.com/blog/asgards-wrath-2-players-guide-game-overview/).
33. Tech at Meta, [How Asgard's Wrath is making VR combat feel real](https://tech.fb.com/ar-vr/2019/03/how-asgards-wrath-is-making-vr-combat-feel-real/) (2019).

### Not covered

- I found no VR version of The Elder Scrolls: Blades to study; Skyrim VR stands in for it.
- I found no source on The Wizards' off hand, how it handles missed gestures, or Elven Assassin's spell controls.
- The GDC talk [Until You Fall: Building Satisfying VR Combat on a Budget](https://www.gdcvault.com/play/1026868/Until-You-Fall-Building-Satisfying) looks relevant to fatigue, but I couldn't read it.
