# Descent VR

A single-player action RPG for VR that runs in the browser (Three.js + WebXR), growing into a WoW-style world of zones joined without loading screens. The plain URL is the **Adventure**: Oakvale, the starting zone, where Marshal Hale waits at the crossroads with a chain of three quests that take a new character from level 1 to 5, and south over the pass lies Brackenmoor, a full second zone of moor, bog and fell round the market town of Cairnford that you walk into without a loading screen (its land and buildings only, so far) (see [Playing Oakvale](#playing-oakvale), and `.scratch/oakvale-starting-zone/` for the spec and its tickets). The **arena** at `?arena` is the combat prototype that came first: one crypt hall, four enemy types including a boss, seven waves.

For why this stack, other options, and the pixel-art pipeline, see [docs/tech-research.md](docs/tech-research.md).

## Play it

**https://daitro123.github.io/descent-vr/**

- **On a Quest:** open the link in the Quest browser and press **Enter VR**. GitHub Pages serves over HTTPS, so WebXR works with no dev server and no certificate to accept.
- **On a desktop:** the same link loads the IWER emulator (see below). The URL flags below work there too, for example `…/descent-vr/?arena` for the arena.

Every push to `main` rebuilds and publishes the site ([`.github/workflows/pages.yml`](.github/workflows/pages.yml)). Pull requests run the same typecheck, tests and build without deploying. This needs the repository's **Settings → Pages → Build and deployment → Source** set to **GitHub Actions**.

## Run it locally

```bash
npm install
npm run dev          # http://localhost:5173
```

- **No headset:** open the dev URL in a desktop browser. The IWER emulator loads automatically and shows a DevUI. Use it to move the emulated Quest 3 headset and controllers, or turn on its play mode for mouse and keyboard.
- **On a Quest:** WebXR needs a secure origin. Use either option:
  - `npm run dev:quest`, then open `https://<your-LAN-IP>:5173` in the Quest browser and accept the self-signed certificate.
  - Or connect over USB with `adb reverse tcp:5173 tcp:5173` and open `http://localhost:5173` on the headset.
- URL flags ([`src/route.ts`](src/route.ts) reads them):
  - The plain URL is Oakvale. Before VR the page lists your characters (up to three) and shows Oakvale from where the picked one stands, slowly turning behind the intro; **Enter VR** plays the picked one (see [Characters](#characters)). A first visit, with no characters yet, shows the new-character form on the page.
  - `?newgame` opens the new-character form on the page (with three characters already, it says so and points at Delete); nothing is deleted. **Cancel** plays the picked character as usual. Either way the flag drops from the address, so a reload doesn't ask again.
  - `?arena` is the wave game in the crypt hall. Its flags work alone too, so older links still open it:
    - `?wave=N` starts the run at wave N (`?wave=7` goes straight to the boss).
    - `?duel` fights practice duelists one at a time: grunts that block about nine swings in ten. After each one falls, a banner shows how many of your hits it blocked.
    - `?showcase` pins the title-screen camera on the bestiary lineup, for reviewing models without a headset.
    - `&class=ranger` is the ranger at level 1 with every base ability to level 10: the bow, the ward, Power Shot, Snare Trap, Volley, Scatter and Hunter's Mark (see [Controls (ranger)](#controls-ranger)).
    - `&class=mage` is the mage at level 1 with every base ability to level 10: Frost Nova on A/X, and Fireball, Frostbolt, Chain Lightning and Blizzard drawn on the ring, Z, V and S (see [Controls (mage)](#controls-mage)).
    - `&class=warrior` (or no `&class=`) is the warrior at level 1 with every base ability to level 10: the War Cry, Earthshaker and the three gesture abilities, Heroic Throw, Shield Wall and Sweeping Strikes (see [Abilities by gesture](#abilities-by-gesture)). The arena keeps no save, so the first shape hangs in the air again on every visit until you draw it.
    - `&class=ranger-prototype`, `&class=mage-prototype` and `&gestures` are the throwaway prototypes the classes and gestures were built from, kept to compare: see [Prototypes](#prototypes).
  - `?bag`, `?belt` and `?proto=brew|pick|anvil` are prototypes, kept to compare with what was built from them: see [Prototypes](#prototypes).
  - `?perf` adds a readout of the frame rate, draw calls, triangles (both eyes), shader programs, the most bytes uploaded to the GPU in a frame and, in Oakvale, the chunks loaded at full detail and as far stand-ins, low on the left of your view, over Oakvale or the arena.
  - `?emulate` forces the emulator even when a real headset is present, and `?noemulate` rules it out (the page's desktop camera, for screenshots). `?emulate&nodevui` runs it without the DevUI, so controller poses are driven only by code (for scripted tests). `window.__descent` is the debug handle; in Oakvale it has `adventure`, `characters` (the roster: `slots`, `picked`, `play()`), `world`, `player`, `camps`, `state` (your level and XP, and what Hale, the tracker and the quest arrow show), `device` (the emulator's), `saved()` (resolves once no save write is in flight), `paused` (stops VR frames stepping the game), `teleport(x, z, yaw)` and `step(seconds)`, which runs the game without waiting for frames. The scripted checks in `.scratch/oakvale-starting-zone/checks/` drive it, `play-through.mjs` from `?newgame` to Brackenmoor.
  - `?fly` opens the map viewer: fly freely through any map (Oakvale, Brackenmoor and the crypt hall), with no enemies and no walls in the way. `?fly=crypt` opens one map (`?fly=forest` is Oakvale, `?fly=brackenmoor` the moor, `?fly=aldhaven` the capital). Walk mode drops you to eye height with the player's collision. R (desktop) or Y (headset) steps through the map's start, its landmarks and an overview from above. On the desktop, click to look around, WASD to move, Q/E for down and up, shift to go fast, M for the next map, G to walk, F for fog. In the headset, the left stick moves where you look, the right stick turns and rises, grip goes fast, A is the next map, B walks or flies, and X toggles fog. The readout floats over your left controller. On a phone or tablet, a stick (bottom left) moves, dragging anywhere else looks around, ▲ ▼ go up and down, and buttons under the readout switch map, walk, fog, fast and spot.
  - `?map=forest` walks the world from Oakvale's start with no enemies and no save, over the pass into Brackenmoor too (`?map=brackenmoor` starts on the moor, `?map=crypt` walks the crypt hall, `?map=aldhaven` starts outside the capital's Kingsgate). Headset: left stick moves, right stick turns. Desktop: WASD or the arrow keys walk (Shift to hurry), dragging looks around.

Other commands: `npm test` runs the unit tests, `npm run typecheck`, `npm run build`.

## Prototypes

Throwaway prototypes, each kept in the code behind its URL flag so the game built from them can be compared with them on the headset. Without its flag none of a prototype's code loads, and none of it reaches the Adventure or the save. They run on the dev server as any other URL does (`http://localhost:5173/?arena&class=mage-prototype`, for one).

- **The ranger** ([How the ranger fights](.scratch/abilities/issues/05-how-the-ranger-fights.md), `src/prototype/ranger/`):
  - `?arena&class=ranger-prototype` (`&variant=ward`, the default and the one built)
  - `?arena&class=ranger-prototype&variant=knife`
  - `?arena&class=ranger-prototype&variant=kite`

  A bow in the left hand over the warrior's arena. `&variant=` picks what the ranger does up close, and clicking the right stick cycles them: `ward` (the default and the one built: the left grip raises a short ward that stops arrows and, raised just in time, sends them back), `knife` (a knife in the draw hand, and swinging the bow parries a blow or swats an arrow back) or `kite` (two dashes and a longer step, but only 12 arrows, one back every 1.5 s).
- **The mage** ([How the mage fights](.scratch/abilities/issues/06-how-the-mage-fights.md), `src/prototype/mage/`):
  - `?arena&class=mage-prototype` (`&kit=A`, the default and the one built: a wand, the focus's ward, the blink, mana spent)
  - `?arena&class=mage-prototype&kit=B`
  - `?arena&class=mage-prototype&kit=C`
  - One axis of a kit can be swapped with `&cast=`, `&focus=`, `&move=` or `&mana=` (the values are in `src/prototype/mage/mageVariants.prototype.ts`).

  The warrior's sword and shield give way to the mage's hands over the arena: hold a trigger to charge a bolt and throw it. Clicking the right stick steps through the kits, and a panel over your left hand names the one you're on, with your mana and the blink's cooldown.
- **Gestures** ([Using abilities by gesture](.scratch/abilities/issues/07-using-abilities-by-gesture.md), `src/prototype/gestures/`):
  - `?arena&gestures` (over the warrior)
  - `?arena&class=ranger&gestures` and `?arena&class=mage&gestures` (over the built ranger and mage)
  - `?arena&class=ranger-prototype&gestures` and `?arena&class=mage-prototype&gestures` (over the class prototypes)
  - `&vocab=A`, `B` or `C` (the pick, shapes) starts on a gesture set.

  The game's own gestures stand aside while it runs; it is also how templates get recorded. Hold the **right** grip, draw a shape in the air in front of you, let go: a ring (from the top, clockwise), a Z, a V, a triangle (from the top, down to the right first) and, for the ranger and the mage, an S each cast a placeholder ability, a coloured burst paid for in rage, focus or mana; the ranger and the mage also have one on A/X. A grip squeezed at a shoulder, a hip or the tool loop never arms. A panel low on your left counts what was read. Clicking the right stick steps through its modes: FIGHT, DRILL (the fight holds still and the panel asks for each gesture in turn, counting how many were read right), JUNK (it asks for sword swings, bow draws or bolt throws with the grip held, and counts how many fired a gesture by mistake) and RECORD (what you draw becomes that gesture's template, kept in this browser and logged to the console, for pasting into `src/player/gestures/recorded.ts`; the left stick's click skips, A/X forgets). Clicking the left stick steps the gesture set (`&vocab=C`, shapes, is the pick; `A` mixes two flicks in, `B` is all flicks).
- **The bag** (inventory ticket 03, `src/ui/bag-prototype/`):
  - `?bag` or `?bag=a`, `?bag=b`, `?bag=c` (and `&models`)

  The bag and the gear panel in a quiet yard with a training dummy: reach over either shoulder and squeeze the grip to bring the bag round. `?bag=a` (touch an item with a fist or the sword's tip and hold the grip to carry it, the pick), `?bag=b` (press an item, then press where it goes) and `?bag=c` (grab it with your hand) are the three ways to move items; in the headset a click of the left stick switches between them, and the right stick swaps the slots' icons for small 3D models (`&models` starts with them). Nothing in it reaches the Adventure or the save.
- **The belt** (inventory ticket 04, `src/player/beltPrototype.ts`):
  - `?belt` or `?belt=a`, `?belt=b`, `?belt=c` (and `&calm`)

  Two potion slots at your hips while practice duelists fight you and a light drain eats your health (`&calm` keeps only the drain). Squeeze the grip at a slot to take a flask and hold it at your mouth to drink. `?belt=a|b|c` picks how the weapon in that hand gets out of the way (a: it fades, b: it swings to the hip, c: it stays and you touch the slot then lift that hand to your mouth); a click of either stick cycles them in the headset.
- **Professions** (`src/professions/prototypes/`):
  - `?proto=brew` (`&variant=A`, `B` or `C`)
  - `?proto=pick` (`&variant=A`, `B` or `C`)
  - `?proto=anvil` (`&v=A`, `B` or `C`)

  `?proto=brew` is for the professions map's "Brewing at the alchemy table" ticket: three ways to brew a minor healing potion at a bench in the house by the well (`?proto=brew&variant=A`, `B` or `C` to start on one). In the headset, squeeze the grip to take things and click the left stick to switch; the page lists the desktop keys.

  `?proto=pick` is for the professions map's "Swinging the pick and cutting herbs" ticket: a copper vein and a clump of Hearthleaf outside the old mine, no enemies. Squeeze the grip in the loop behind your right hip to draw the pick or the knife, and click the left stick to switch the three variants (`&variant=A`, `B` or `C` to start on one); the page lists the desktop keys.

  `?proto=anvil` is for the professions map's "Hammering at the anvil" ticket: Oakvale's smithy with no enemies, where you smelt ore into a bar, hammer a whetstone cold and heat, hammer and quench a pair of copper gauntlets. Squeeze the grip in the loop behind your right hip for the hammer and tongs, and click the left stick to switch the three variants (`&v=A`, `B` or `C` to start on one).

## Controls (warrior)

The warrior is the class a character starts as unless you pick another on the page before VR; the mage's are [below](#controls-mage).

| Input | Action |
|---|---|
| Right hand | Sword. Swing fast and the blade glows blue when it can deal damage. Damage scales with swing speed. Hit the **head** for a crit. |
| Left hand | Shield. Put it where the blow will land: over your head for a chop, on the side the blade comes from for a slash. Push it **into** the blow as it lands to **parry**. |
| Shield, punched into an enemy | **Shield bash**. It staggers the enemy, and catching one mid wind-up leaves it exposed. |
| Left stick | Move, relative to where you look |
| Right stick | Snap turn by 45° |
| B / Y | **Dash**: a quick step in the stick's direction, or backwards if the stick is neutral. You can't be hit for a moment. |
| A / X | **War Cry**: 50 rage for an area knockback and stagger, then 8 s of **frenzy** (the blade burns, +35% damage). |
| Sword tip driven into the floor | **Earthshaker**: 35 rage for a shockwave where the tip lands |
| Right grip held, a shape drawn, let go | An ability by gesture, from level 6 (in the arena, from the start): see below |
| Hand or feet | Touch a red orb to heal a quarter of your health |

The belt HUD (look down) shows health on the left orb and rage on the right orb, with a pip beneath it for each ability your level has brought, lit while it's ready and you have the rage for it. Between the orbs is the dash cooldown, and in the arena the wave and the enemies left. Rage builds from hits, blocks, parries and bashes.

### Abilities by gesture

Hold the **right** grip, draw a shape in the air in front of you, and let go: the stroke is read once, on release. The grip ticks as it arms and a faint trail follows your hand. A shape read flashes the trail in its ability's colour, a burst leaves your hand with its own sound and a strong buzz, and the ability's name floats up with its cost. A stroke that reads as nothing is a grey puff, a "?" and two ticks, and costs nothing; so does a shape read when you haven't the rage ("not enough rage") or it isn't ready yet. The sword still cuts while the grip is held, and no swing, thrust or block reads as a shape. A grip squeezed over a shoulder (the bag), at a hip (a potion) or in the tool loop behind the right hip never arms, nor does a stroke held over 1.6 s. The first time a shape holds an ability, it hangs faintly in the air ahead of you, bright where it starts, until you've drawn it once.

| Shape | Level | Ability | Rage | Cooldown | What it does |
|---|---|---|---|---|---|
| Ring (from the top, clockwise) | 6 | **Heroic Throw** | 15 | 6 s | A spectral axe flies up to 20 m at the nearest enemy within 15° of where your right hand faces (or, with none there, of where you look): 20 damage and a stagger. |
| Z (across, down to the left, across) | 8 | **Shield Wall** | 25 | 30 s | For 6 s the shield glows gold, and a block takes no damage from any blow, the brute's heavy swing included, and doesn't numb the arm. The slam still can't be blocked. |
| V (down, back up to the right) | 10 | **Sweeping Strikes** | 30 | 20 s | For 8 s every sword hit also strikes the nearest other enemy within 1.5 m of the one you hit, for 60%. |

The level cap is 5 today, so in Oakvale these wait for a zone past it; the arena has them all.

## Controls (ranger)

| Input | Action |
|---|---|
| Left hand | The bow (the one you wear in your main hand). |
| Right hand on the string, trigger held | **Nock** an arrow: touch the string's middle half. Pull back and let go of the trigger to loose; a fuller draw hits harder (6 to 30) and flies faster and flatter (14 to 42 m/s). Under 15% puts the arrow away. Arrows never run out, and a head shot crits. The draw ticks in both hands and pulses on release. |
| Left grip squeezed | The **ward**: a disc past the bow hand for up to 1.2 s (back 2 s after), which stops enemy arrows and, in its first 0.35 s, sends them back at the archer. It doesn't stop blows. |
| A / X while drawing | **Power Shot** (level 2): 20 focus, 4 s. The nocked arrow glows: double damage, and it passes through the first enemy to hit one behind. |
| Right grip held, a ring drawn, let go | **Snare Trap** (level 3): 20 focus, 10 s. A trap at your feet; the first enemy to step on it within 30 s is rooted for 4 s (brutes 2, the Warden not at all). Drop it, dash back, shoot. No gesture reads while an arrow is nocked. |
| Right grip held, a Z drawn, let go | **Volley** (level 6): 35 focus, 12 s. Your next arrow splits into five as it leaves the bow, in a level fan 20° across, each at 60% of the draw's blow. It waits until you loose, and not with Power Shot: one of the two goes on an arrow ("Power Shot: Volley is waiting"). |
| Right grip held, a V drawn, let go | **Scatter** (level 8): 25 focus, 15 s. A gust from your hand knocks every enemy within 3 m in the 90° in front of you (where you look) about 1.5 m back and staggers it for 1.2 s, without hurting it. Brutes slide a third as far; the Warden barely budges and isn't staggered; a rooted enemy stays where the vines hold it. |
| Right grip held, an S drawn, let go | **Hunter's Mark** (level 10): 20 focus, 1 s. The enemy the right hand faces (within 15°, else the one you look at; in sight, within 30 m) is marked for 20 s: it takes 15% more from you, and a red outline and chevron show it through walls. One at a time; it ends when the enemy dies. |
| B / Y, sticks | The dash, moving and snap turn, as the warrior's. |

The belt's right orb is **focus** in gold: 100, full from the start, refilling 10 a second, in a fight or out. Plain arrows never spend it.

Volley, Scatter and Hunter's Mark come at levels 6, 8 and 10, past today's cap of 5, so in Oakvale they wait for a zone past it; the arena has them all.

## Controls (mage)

| Input | Action |
|---|---|
| Either trigger, held, then let go mid-throw | A **bolt**: it gathers as you hold (full in 0.6 s) at the tip of your wand (right hand) or in your palm (left hand), and leaves along the throw. A gentle toss makes a big slow orb, a hard throw a small fast bolt; a light aim assist bends it onto an enemy within 15°. A full bolt deals 20 (7 a tap), a head 1.6×. Let go with the hand still and it fizzles. Bolts are free. |
| Left grip, held | The focus's **ward**, a hex of light that blocks, parries and bashes as the warrior's shield does. Each block costs 10 mana, a parry nothing; it won't rise under 10 mana. |
| B / Y | **Blink** 3.5 m in the stick's direction, or back if it's neutral, stopping short of a wall; every 2.2 s, shown on the belt's dash bar. |
| A / X | **Frost Nova** (level 2): 30 mana, 20 s. Every enemy within 3 m takes 5 and is frozen for 4 s, or until a hit breaks it (a brute for half as long; the Warden shrugs it off). |
| Right grip held, a ring drawn, let go | **Fireball** (level 3): 15 mana. The next bolt you throw burns: 1.5× damage, and it bursts for 10 on every other enemy within 2 m of where it lands. |
| Right grip held, a Z drawn, let go | **Frostbolt** (level 6): 15 mana. The next bolt you throw is frost: the enemy it hits is slowed by 40% for 5 s (a brute and the Warden by half as much). |
| Right grip held, a V drawn, let go | **Chain Lightning** (level 8): 30 mana, 8 s. The next bolt you throw arcs on from the enemy it hits to the nearest within 4 m, and from that one to the next: two more, each taking 70% of the bolt. |
| Right grip held, an S drawn, let go | **Blizzard** (level 10): 40 mana, 30 s. Ice falls for 5 s over a 4 m circle where your wand points: on the nearest enemy within 15° of it, or where its line meets the floor (up to 15 m off, short of a wall). Every enemy in the circle takes 6 every 0.5 s and is slowed by half while it stands there, and for a second after. |
| Left stick, right stick | Move, snap turn, as the warrior |

Mana is the belt's right orb, in blue: 100, plus 2 for each point of Intellect over 10, refilling 2 a second while anything fights you and 30 once nothing does. No gesture arms while the right hand charges a bolt. Fireball, Frostbolt and Chain Lightning each wait on your next bolt, one at a time: drawing another while one waits says which is waiting and spends nothing. The bolt gathers in the colour of the one that waits.

## Playing Oakvale

You start at the crossroads a few steps from **Marshal Hale**, the village's guard captain, facing them, with a gold "!" over their head and "Oakvale" floating up in front of you. Walk up looking at them and a parchment board unfolds on your right with what they say; press its buttons (**Accept**, **Not now**, **Hand in**, **Goodbye**) with either fist or your sword's tip, and that hand buzzes. Over Hale, a gold "!" means a quest to take, a grey "?" one under way and a gold "?" one ready to hand in. The quest you're on floats at the top left of your view with its counts, and a small gold arrow beside the line you're working on points the way (up is straight ahead). Signposts name the roads, and a painted map by the crossroads shows the whole zone.

**The quest chain**, one quest at a time, each unlocked by handing in the one before:

| Quest | What Hale asks | Pays |
|---|---|---|
| Raiders in the Fields | Defeat 3 of the red-masked bandits at the farm, east of the village | 80 XP (level 2) |
| The Lumber Camp | Defeat the 5 bandits of the lumber camp across the bridge, their leader included, and take the leader's orders from the tent by touching them | 120 XP (level 3) |
| What Lies Below | Go down the old mine at the end of the north road and defeat what woke the dead: the Bone Warden, who rises from its throne as you step into its hall | 300 XP and Hale's old longsword (level 5) |

Only kills of the quest's own camp, made while it's active, count. Every kill pays 10 XP per enemy level (triple for the bandit leader, the mine's brutes and the Warden) and floats what it paid. Each level adds 2 Stamina and 2 of your class's main attribute (Strength for the warrior, Agility for the ranger, Intellect for the mage), which make 20 health and 20% damage; enemies five or more levels below you pay no XP; the War Cry arrives at level 2 (with rage and its orb) and Earthshaker at 3 (for a ranger, Power Shot and Snare Trap; for a mage, Frost Nova and Fireball), and level 5 is the cap. The longsword swaps into your hand at the last hand-in, a darker blade with a gilded guard that handles like yours and hits one level harder. Afterwards Hale points you south, to Brackenmoor.

**Enemies** wait in camps at the farm, the lumber camp, on the lumber camp's road (a patrol) and at the watchtower, and the undead fill the mine. Come within 8 m of one, or hurt it, and it fights, bringing whoever of its camp stands near it; lead it 30 m from where it waited and it walks home untouchable ("Evade") and heals. A cleared camp fills again three minutes later, once you're well away. The village, the bridge, the pond, the standing stones and Brackenmoor are safe. Out of a fight for 5 s, your health comes back over about 10 s, and a click of the left stick runs while nothing fights you (the edges of your view darken a little).

**Dying** costs only the walk back: the view fades to black and you wake by the inn's hearth, inside with the door shut, or on the rail bed outside the old mine if you fell inside it, at full health with nothing lost.

**The village** is at work: the smith hammers at the anvil, the innkeeper polishes tankards behind the bar of the Golden Tankard and the farmer waits by the well, and each has a line for you as you pass that changes as the chain moves on. The inn and the house by the well open as you walk up to their doors, and you can walk in under the smithy's roof.

**Brackenmoor**: the road climbs south out of Oakvale to the crest of a pass. Walk over it and the light, the haze and the wind blend into the moor's, "Brackenmoor" floats up and the game saves, all without a loading screen. The moor is about 480 by 440 m: the road runs down through Passfoot and Hob's Fold, over the Long Stones' ridge, to Cairnford, a grey stone market town at a three-arched bridge over the Brack Beck. West lie Turfmoss and the Blackmire's bog with its boardwalk, and Raven Scar's quarry in the fells; east, the landlord's walled green enclosure, Fellgate Hall and the Kingsroad's tollhouse, its gate shut toward Aldhaven; north-east, the barrows on the High Fells and Hollowhill's door; south-east, the beck runs out past Beck's Foot by the Fen road toward the Sallows; south, the Sunreach road ends at a rockfall in the Rockfall Gap. Nothing lives there yet (see the zone's spec, `zones/brackenmoor.md` in the project's files).

### Characters

You keep up to three characters, of any classes (two warriors are fine), each with a name. The page before VR lists them in three slots, each showing the name, class, level and zone; the one you played last is picked (marked ▶), and **Enter VR** plays it. Press another slot to pick it (the page loads again, showing Oakvale from where that one stands). **New character** in an empty slot opens the form: a card for each class that's built (the warrior, the ranger and the mage) and a name, up to 16 letters, with a suggestion filled in; **Make** makes them at level 1 by Marshal Hale, in the class's starting kit (the ranger with a short bow and a quiver), and picks them. Each character has **Rename** and **Delete**, which asks first, naming them. With no characters yet, the first slot is a new warrior with a suggested name, and the form is open under it: choose a class, type a name and press **Make** to play that one, or press **Enter VR** to play the warrior (under the name in the form). A new character is saved (and added to the roster) as soon as it earns anything, as a new character always was.

### Saving

Oakvale saves itself in the browser's IndexedDB (one database, `descent-vr`, holding a record for each character and a roster listing them in slot order with the one played last). It writes at once when you take a quest, a count goes up, a quest is ready or handed in, you level up or get a new sword, and when you cross into another zone. It also writes every 30 s of play, when the page is hidden, when VR ends and when the headset is put down. Loading puts you where you stood, facing the way you faced, with your level, XP, sword and quests, at full health, with no rage and every camp full. Health, rage, the camps and the talk board aren't saved.

Each record carries a version. A new build that changes its shape bumps the version and adds a migration (`src/save/record.ts`), so older saves upgrade and a deploy never wipes a character. The save from before the roster (one character, version 3 or earlier) becomes your first character, a warrior named "Warrior", with everything it had; nothing is written until it plays. A page from an older build (a stale cache) that finds a newer roster or record leaves it alone and plays unsaved, saying so; a character this build can't read (or one a newer build wrote) shows in its slot, never played or written over, and **Delete** frees the slot. Where the browser won't store data (some private windows), the game plays anyway, keeping progress in memory, and the page says it won't be kept. The arena and `?map=` never read or write the save.

### Reading enemies

Enemies telegraph every attack. The weapon (and the body) glows while they wind up, and the pose shows the direction the blow will come from.

- **Orange** means blockable. Block it on the correct side, parry it, hit first to interrupt, step back out of reach, or duck a horizontal slash.
- **Red** means unblockable (a slam). Get out of the way, or dash, then punish the weapon stuck in the floor.

A parried or bashed enemy flickers **blue** while it is *exposed* and takes 50% more damage. Only two enemies can be mid-attack at once, and their swings are spaced out, so you can read a crowd one blow at a time.

| Enemy | What it tests |
|---|---|
| **Skeleton warrior** (sword or axe) | Directional melee: an overhead chop, a slash from its right (arriving on your shield side) and a backhand from its left (arriving on your sword side). |
| **Skeleton archer** | Ranged pressure. It keeps its distance and needs a clear shot. Arrows stick in a raised shield. A shield pushed into an arrow, or a sword swung through it, sends it back at the archer. |
| **Grave brute** | Armour. Small hits don't interrupt it. Its heavy swing breaks guards: blocking takes some damage and numbs the shield arm. Its slam is unblockable, and after a slam the maul is stuck in the floor. |
| **The Bone Warden** (boss, wave 7) | A three-hit combo to block in turn, a long-range slam, and summoned grunts at 70% and 40% health. Parrying it, or dodging its slam, drops it to one knee with its head in reach for double crits. |

## Code map

```
src/
  config.ts          every gameplay number (enemy types, attacks, waves, abilities), for tuning
  route.ts           what the page runs, from its query string (unit tested)
  main.ts            renderer and XR settings, each mode's frame loop, emulator bootstrap, debug handles
  adventure.ts       the plain URL: Oakvale in the World, the player, its camps, Hale, healing and death, the belt
  adventureState.ts  levels, XP, attributes and the quest givers' chains: events in, effects and answers out (unit tested)
  classes.ts         each class's main attribute, resource (rage, focus, mana) and base abilities by level, as data (unit tested)
  save/
    record.ts        the save record, its version and the migrations that bring older ones up (unit tested)
    store.ts         the save store port and its in-memory adapter; your characters (the roster: pick, make, delete, rename) (unit tested)
    indexedDb.ts     the browser's adapter: IndexedDB, one strict transaction per write
    controller.ts    when to write: what's earned, zone changes, every 30 s, leaving; one write in flight (unit tested)
  quests.ts          the quest chain as data: objectives, rewards and what Hale says
  game.ts            the arena (?arena): owns its systems; wave director, spawning, summons, death/victory
  showcase.ts        the arena's title-screen bestiary (?showcase)
  prototype/         throwaway prototypes kept for trying on the headset, each behind its URL flag
    mage/            ?arena&class=mage-prototype: the mage's bolts, ward, blink and mana, in three kits
    ranger/          ?arena&class=ranger-prototype: the ranger's bow, with a ward, a knife or kiting
    gestures/        ?arena&gestures: abilities by gesture over any class, with its drill, junk and record modes
  viewer/
    mapViewer.ts     ?fly: free flight through every map in maps/
    touchControls.ts on-screen stick, look and buttons for the viewer on phones
  models/
    kit.ts           procedural modelling: primitives → one merged, vertex-coloured, pixel-grained mesh
    rig.ts           humanoid skeleton, rigidly skinned (a whole animated character is one draw call)
    characters.ts    the bestiary's bodies and weapons
    gear.ts          the warrior's longsword and heater shield
    materials.ts     shared Lambert material: grain texture, per-vertex glow, weapon telegraph
    palette.ts       the limited palette
  player/
    input.ts         XR controllers → left/right hands, sticks, buttons, haptics
    player.ts        rig, locomotion, snap turn, dash, collision, HP, the class's bar (rage, focus, mana), frenzy, body volumes
    weapons.ts       sword + shield; velocity tracking in rig space
    mage.ts          the mage's hands: the bolt charged and thrown, the wand and the focus, the ward, the blink
    bow.ts           the ranger's bow and string on the bow hand: nocking at the string, the draw, the aim
    gestures/        abilities by gesture: the recogniser (matcher.ts, recorder.ts; unit tested), the five shapes and
                     their templates, and gestures.ts, which arms it on the right grip, shows the trail, the read and
                     the shape not yet drawn, and uses the ability in the shape's slot
  combat/
    geometry.ts      segment–segment, segment–box, circle push-out (unit tested)
    strike.ts        an enemy weapon's swing swept against shield, sword and body (unit tested)
    combat.ts        sword hits and crits, blocks and parries, bash, Earthshaker, War Cry, the gesture abilities, the mage's bolts and abilities, arrow outcomes
    abilities.ts     the gesture abilities' rules: cooldowns, Heroic Throw's aim, Shield Wall's blocks, Sweeping Strikes' reach (unit tested)
    thrownAxes.ts    Heroic Throw's axes in flight (instanced)
    ranger.ts        the ranger's kit: the draw and loose, the ward, Power Shot, Snare Trap, Volley, Scatter's gust and Hunter's Mark, landed through Combat (unit tested)
    shots.ts         the ranger's arrows in flight: damage and speed by the draw, gravity, a Power Shot's pierce, a Volley's fan (instanced, unit tested)
    mark.ts          Hunter's Mark: whom it's on, for how long, what it adds, and the outline shown through walls (unit tested)
    ward.ts          the ranger's ward: its hold, cooldown, and what it stops and sends back (unit tested)
    traps.ts         Snare Trap's traps: laid, sprung by the first enemy over one, rooting it (instanced, unit tested)
    mage.ts          the mage's rules: a throw's bolt, its damage, the ward's mana, the blink's way, who a burst reaches, whom Chain Lightning arcs to (unit tested)
    blizzard.ts      Blizzard: where it falls, its ticks, the disc and the falling ice (instanced)
    bolts.ts         the mage's bolts in flight, the aim assist and homing (instanced)
    projectiles.ts   arrows: flight, sticking, reflecting (instanced)
  enemies/
    enemy.ts         shared machinery: rising, steering, attack timeline, stagger/expose/kneel, deaths
    kinds.ts         per-type brains: grunt, archer, brute, the Warden
    poses.ts         keyframe poses; the arc between wind-up and strike is the blow
    tokens.ts        attack tokens: who may swing, and spacing between swings
    camps.ts         Oakvale's camps: pulls, the leash, refilling, one token pool (unit tested)
    throne.ts        the Warden on its throne at the mine's foot: seated, fighting, resetting, beaten (unit tested)
  people/            Marshal Hale (turns to you, waves, the "!" or "?"), the villagers at work and their barks
  world/             the World: one light rig, sky and radial fog, the streamer and its chunk worker, Ground
                     for every zone, the seam's crossing and blended air, interiors and the mine with their
                     switch, the ambience's mix; also the arena's crypt hall, glows, blob shadows, orbs, smoke
  maps/
    types.ts         GameMap: what gameplay and the map viewer need from any map (scene, sky, ground height, collision)
    registry.ts      finds every map folder (src/maps/<id>/index.ts); add a map by adding a folder
    walk.ts          ?map=<id>: walk a map with the warrior's locomotion, no enemies
    crypt/           the crypt hall (world/arena.ts) as a map
    forest/          Oakvale, the starting zone: layout.ts is the plan (heights, roads, what stands where,
                     camps, places, colliders, unit tested); chunks.ts builds a 40 m chunk of it (in a worker)
    brackenmoor/     Brackenmoor, the moor over the southern pass: its plan, buildings and chunk builder
    decks.ts, lines.ts, props.ts, recolour.ts, waterSheet.ts  pieces any zone builds with: decks you walk on, roads laid into a height grid, building parts, Oakvale's plants recoloured, a water sheet
    fenRoad.ts       the Fen road's seam between Brackenmoor and the Sallows, its heights fixed so either zone plans alone
  fx/                particles, sword trail, shockwaves, floating text, spatial synthesised SFX and ambience
  ui/                belt HUD and vignettes, enemy health bars, Hale's talk board, the quest tracker and arrow,
                     the zone's name, debug text panel, ?perf readout; the page before VR's characters and forms
```

## How the combat works

- **Your sword:** the blade is a segment swept between frames in sub-steps, so fast swings don't tunnel. Contact counts only above a tip speed. Enemies have a head sphere (crit) and a body capsule that follow their animation.
- **Enemy blows are physical:** each frame of a swing, the enemy's weapon segment is swept against your shield's block box, your blade, and a head sphere with a torso capsule hanging below the headset. Whatever it touches first decides the outcome. Horizontal slashes aim at your chest when the wind-up starts, so ducking during the telegraph makes them pass overhead.
- **Poses are the animation and the hitbox:** attacks blend between keyframe poses (`enemies/poses.ts`), and the blend's arc is exactly what the strike sweep tests. `tests/enemyAttacks.test.ts` drives real enemies through every attack against a simulated player, so a pose tweak that makes a blow whiff, or makes the right block stop working, fails a test.

## Status

- **Not yet tested on a physical headset.** Everything below was verified in the IWER emulator and in unit tests.
- **Oakvale, start to finish** (ticket 38): a scripted play-through in headless Chromium (`.scratch/oakvale-starting-zone/checks/play-through.mjs`) takes a new character from `?newgame` through all three quests, fought through the real combat with a sword and shield, to level 5 and Hale's longsword, then over the pass to Brackenmoor's rockfall. On the way it reloads mid-chain, dies outside the mine (waking by the inn's hearth) and inside it (waking outside its mouth), and reloads with the Warden beaten to find its throne empty. Every user story in the spec is mapped to what showed it, or to what waits on the headset, in `.scratch/oakvale-starting-zone/stories-seen.md`.
- **Every class through Oakvale** (abilities ticket 27): `.scratch/abilities/checks/whole-zone.mjs` plays a new warrior, ranger and mage each from `?newgame` through every camp, the chests and Hale's three hand-ins to their own reward (Hale's Old Longsword, Hale's Old Hunting Bow, the Crypt-Warded Staff), then the smith, the innkeeper and the stash, fought through the real combat with each class's own weapon, abilities and shapes. All three clear it (the warrior with one death at the lumber camp in the last run, the others with none) and land on the level curve with their talent points spent. `.scratch/abilities/checks/effects-budget.mjs` fires each class's biggest effects at once in the arena: at worst 5 to 7 draw calls and 1.3k to 4.1k triangles an eye, under the abilities' 10 and 5,000.
- Oakvale's performance in the emulator, both eyes at 96° each, the worst heading: the village 122 draw calls and 255k triangles, the crest looking north 136 calls and 318k, inside the inn 22 calls and 11k, the Warden's hall 20 calls and 17k, never more than 4 point lights. Draw calls are well under the ~300 budget, and the triangles (the open woods reach about 330k to 380k) are under the budget of 600k over both eyes, doubled from 300k on 2026-10-01 and not yet measured on the headset: the check is `?perf` at the mine's front holding 72 fps on the Quest (ticket 39).
- The arena (`?arena`): a scripted emulator bot that reads telegraphs and blocks on the correct side cleared a full run twice in a row: all seven waves and the boss. A bot that doesn't block goes down within a couple of waves. Each ability was exercised in isolation: block, shield and sword parry, bash interrupt, dash, War Cry, Earthshaker, arrows stuck in the shield, and arrows reflected by the shield and by the sword. 36 draw calls in the emulator's mono view with a full wave.
- Expect to tune after the first headset session: `CONFIG.sword.minHitSpeed`, both weapons' `pitchDeg`, the shield's size and offset, the parry speeds, the enemy wind-up times, the run's vignette and the camps' levels.
- Art is procedural: low-poly models built in code with pixel-grain textures. There are no imported assets.

## Next steps (suggested)

1. Play Oakvale on the Quest: the "For Tom, on the headset" list on ticket 38 says what to check.
2. Brackenmoor's people, enemies and quests, and the zones past it.
3. Loot drops with rolled stats.
4. Real models (Blender or Blockbench, glTF) once the look is settled. The rig and pose system can drive them.
