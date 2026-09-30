# Descent VR

A single-player action RPG for VR that runs in the browser (Three.js + WebXR), growing into a WoW-style world of zones joined without loading screens. The plain URL is the **Adventure**: Oakvale, the starting zone, where Marshal Hale waits at the crossroads with a chain of three quests that take a new character from level 1 to 5, and south over the pass lies Brackenmoor, a small second zone you walk into without a loading screen (see [Playing Oakvale](#playing-oakvale), and `.scratch/oakvale-starting-zone/` for the spec and its tickets). The **arena** at `?arena` is the combat prototype that came first: one crypt hall, four enemy types including a boss, seven waves.

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
  - The plain URL is Oakvale. Before VR the page shows it from where you'll start (or where your save stands), slowly turning behind the intro.
  - `?newgame` starts Oakvale over. If there's a save, a dialog on the page asks first: **Start over** deletes it and starts a new character at level 1, **Carry on** loads it as usual. Either way the flag drops from the address, so a reload doesn't ask again.
  - `?arena` is the wave game in the crypt hall. Its flags work alone too, so older links still open it:
    - `?wave=N` starts the run at wave N (`?wave=7` goes straight to the boss).
    - `?duel` fights practice duelists one at a time: grunts that block about nine swings in ten. After each one falls, a banner shows how many of your hits it blocked.
    - `?showcase` pins the title-screen camera on the bestiary lineup, for reviewing models without a headset.
    - `&class=ranger` is a throwaway prototype of the ranger (`src/prototype/ranger/`, [How the ranger fights](.scratch/abilities/issues/05-how-the-ranger-fights.md)): a bow in the left hand instead of the sword and shield. Touch the string with your right hand and hold the trigger to nock an arrow, pull back and let go; a fuller draw hits harder and flies flatter, and a head shot crits. `&variant=` picks what the ranger does up close, and clicking the right stick cycles them: `ward` (the default: the left grip raises a short ward that stops arrows and, raised just in time, sends them back), `knife` (a knife in the draw hand, and swinging the bow parries a blow or swats an arrow back) or `kite` (two dashes and a longer step, but only 12 arrows, one back every 1.5 s).
    - `?class=mage` fights the waves as the mage, a prototype (`src/prototype/mage/`, [ticket](.scratch/abilities/issues/06-how-the-mage-fights.md)): hold a trigger to charge a bolt in that hand and let go mid-throw to cast it (a hard throw makes a small fast bolt, a gentle toss a big slow one); hold the left grip to raise a ward that blocks like the shield, spending mana; B/Y blinks 3.5 m. The right stick's click steps through three kits (`?kit=A`, the pick, `B` a wand, `C` a palm push with two casting hands), named on a panel over your left hand; `?cast=throw|wand|push`, `?focus=ward|wardOnly|caster`, `?move=blink|dash` and `?mana=free|spend` change one thing at a time.
    - `&gestures` adds a throwaway prototype of abilities by gesture (`src/prototype/gestures/`, [ticket](.scratch/abilities/issues/07-using-abilities-by-gesture.md)) over the class, the warrior's too (`?arena&class=warrior&gestures`, or no `&class=`). Hold the **right** grip, draw a shape in the air in front of you, let go: a ring (from the top, clockwise), a Z, a V, a triangle (from the top, down to the right first) and, for the ranger and the mage, an S each cast a placeholder ability, a coloured burst paid for in rage, focus or mana; the ranger and the mage also have one on A/X. A grip squeezed at a shoulder, a hip or the tool loop never arms. A panel low on your left counts what was read. Clicking the right stick steps through its modes: FIGHT, DRILL (the fight holds still and the panel asks for each gesture in turn, counting how many were read right), JUNK (it asks for sword swings, bow draws or bolt throws with the grip held, and counts how many fired a gesture by mistake) and RECORD (what you draw becomes that gesture's template, kept in this browser; the left stick's click skips, A/X forgets). Clicking the left stick steps the gesture set (`&vocab=C`, shapes, is the pick; `A` mixes two flicks in, `B` is all flicks).
  - `?bag` is a **prototype** of the bag and the gear panel (inventory ticket 03), in a quiet yard with a training dummy: reach over either shoulder and squeeze the grip to bring the bag round. `?bag=a` (touch an item with a fist or the sword's tip and hold the grip to carry it, the pick), `?bag=b` (press an item, then press where it goes) and `?bag=c` (grab it with your hand) are the three ways to move items; in the headset a click of the left stick switches between them, and the right stick swaps the slots' icons for small 3D models (`&models` starts with them). Nothing in it reaches the Adventure or the save.
  - `?perf` adds a readout of the frame rate, draw calls, triangles (both eyes), shader programs, the most bytes uploaded to the GPU in a frame and, in Oakvale, the chunks loaded at full detail and as far stand-ins, low on the left of your view, over Oakvale or the arena.
  - `?emulate` forces the emulator even when a real headset is present, and `?noemulate` rules it out (the page's desktop camera, for screenshots). `?emulate&nodevui` runs it without the DevUI, so controller poses are driven only by code (for scripted tests). `window.__descent` is the debug handle; in Oakvale it has `adventure`, `world`, `player`, `camps`, `state` (your level and XP, and what Hale, the tracker and the quest arrow show), `device` (the emulator's), `saved()` (resolves once no save write is in flight), `paused` (stops VR frames stepping the game), `teleport(x, z, yaw)` and `step(seconds)`, which runs the game without waiting for frames. The scripted checks in `.scratch/oakvale-starting-zone/checks/` drive it, `play-through.mjs` from `?newgame` to Brackenmoor.
  - `?fly` opens the map viewer: fly freely through any map (Oakvale, Brackenmoor and the crypt hall), with no enemies and no walls in the way. `?fly=crypt` opens one map (`?fly=forest` is Oakvale, `?fly=brackenmoor` the moor). Walk mode drops you to eye height with the player's collision. R (desktop) or Y (headset) steps through the map's start, its landmarks and an overview from above. On the desktop, click to look around, WASD to move, Q/E for down and up, shift to go fast, M for the next map, G to walk, F for fog. In the headset, the left stick moves where you look, the right stick turns and rises, grip goes fast, A is the next map, B walks or flies, and X toggles fog. The readout floats over your left controller. On a phone or tablet, a stick (bottom left) moves, dragging anywhere else looks around, ▲ ▼ go up and down, and buttons under the readout switch map, walk, fog, fast and spot.
  - `?belt` is a PROTOTYPE of the belt (inventory ticket 04): two potion slots at your hips while practice duelists fight you and a light drain eats your health (`&calm` keeps only the drain). Squeeze the grip at a slot to take a flask and hold it at your mouth to drink. `?belt=a|b|c` picks how the weapon in that hand gets out of the way (a: it fades, b: it swings to the hip, c: it stays and you touch the slot then lift that hand to your mouth); a click of either stick cycles them in the headset.
  - `?proto=brew` is a throwaway prototype for the professions map's "Brewing at the alchemy table" ticket: three ways to brew a minor healing potion at a bench in the house by the well (`?proto=brew&variant=A`, `B` or `C` to start on one). In the headset, squeeze the grip to take things and click the left stick to switch; the page lists the desktop keys. It goes once a variant is rebuilt properly.
  - `?proto=pick` is a throwaway prototype for the professions map's "Swinging the pick and cutting herbs" ticket: a copper vein and a clump of Hearthleaf outside the old mine, no enemies. Squeeze the grip in the loop behind your right hip to draw the pick or the knife, and click the left stick to switch the three variants (`&variant=A`, `B` or `C` to start on one); the page lists the desktop keys. It goes once the winner is rebuilt properly.
  - `?proto=anvil` is a throwaway prototype for the professions map's "Hammering at the anvil" ticket: Oakvale's smithy with no enemies, where you smelt ore into a bar, hammer a whetstone cold and heat, hammer and quench a pair of copper gauntlets. Squeeze the grip in the loop behind your right hip for the hammer and tongs, and click the left stick to switch the three variants (`&v=A`, `B` or `C` to start on one). It goes once the winner is rebuilt properly.
  - `?map=forest` walks the world from Oakvale's start with no enemies and no save, over the pass into Brackenmoor too (`?map=brackenmoor` starts on the moor, `?map=crypt` walks the crypt hall). Headset: left stick moves, right stick turns. Desktop: WASD or the arrow keys walk (Shift to hurry), dragging looks around.

Other commands: `npm test` runs the unit tests, `npm run typecheck`, `npm run build`.

## Controls (warrior)

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
| Hand or feet | Touch a red orb to heal a quarter of your health |

The belt HUD (look down) shows health on the left orb and rage on the right orb, with pips for Earthshaker and War Cry beneath it. Between the orbs is the dash cooldown, and in the arena the wave and the enemies left. Rage builds from hits, blocks, parries and bashes.

## Playing Oakvale

You start at the crossroads a few steps from **Marshal Hale**, the village's guard captain, facing them, with a gold "!" over their head and "Oakvale" floating up in front of you. Walk up looking at them and a parchment board unfolds on your right with what they say; press its buttons (**Accept**, **Not now**, **Hand in**, **Goodbye**) with either fist or your sword's tip, and that hand buzzes. Over Hale, a gold "!" means a quest to take, a grey "?" one under way and a gold "?" one ready to hand in. The quest you're on floats at the top left of your view with its counts, and a small gold arrow beside the line you're working on points the way (up is straight ahead). Signposts name the roads, and a painted map by the crossroads shows the whole zone.

**The quest chain**, one quest at a time, each unlocked by handing in the one before:

| Quest | What Hale asks | Pays |
|---|---|---|
| Raiders in the Fields | Defeat 3 of the red-masked bandits at the farm, east of the village | 80 XP (level 2) |
| The Lumber Camp | Defeat the 5 bandits of the lumber camp across the bridge, their leader included, and take the leader's orders from the tent by touching them | 120 XP (level 3) |
| What Lies Below | Go down the old mine at the end of the north road and defeat what woke the dead: the Bone Warden, who rises from its throne as you step into its hall | 300 XP and Hale's old longsword (level 5) |

Only kills of the quest's own camp, made while it's active, count. Every kill pays 10 XP per enemy level (triple for the bandit leader, the mine's brutes and the Warden) and floats what it paid. Each level adds 20 health and 20% damage; the War Cry arrives at level 2 (with rage and its orb) and Earthshaker at 3, and level 5 is the cap. The longsword swaps into your hand at the last hand-in, a darker blade with a gilded guard that handles like yours and hits one level harder. Afterwards Hale points you south, to Brackenmoor.

**Enemies** wait in camps at the farm, the lumber camp, on the lumber camp's road (a patrol) and at the watchtower, and the undead fill the mine. Come within 8 m of one, or hurt it, and it fights, bringing whoever of its camp stands near it; lead it 30 m from where it waited and it walks home untouchable ("Evade") and heals. A cleared camp fills again three minutes later, once you're well away. The village, the bridge, the pond, the standing stones and Brackenmoor are safe. Out of a fight for 5 s, your health comes back over about 10 s, and a click of the left stick runs while nothing fights you (the edges of your view darken a little).

**Dying** costs only the walk back: the view fades to black and you wake by the inn's hearth, inside with the door shut, or on the rail bed outside the old mine if you fell inside it, at full health with nothing lost.

**The village** is at work: the smith hammers at the anvil, the innkeeper polishes tankards behind the bar of the Golden Tankard and the farmer waits by the well, and each has a line for you as you pass that changes as the chain moves on. The inn and the house by the well open as you walk up to their doors, and you can walk in under the smithy's roof.

**Brackenmoor**: the road climbs south out of Oakvale to the crest of a pass. Walk over it and the light, the haze and the wind blend into the moor's, "Brackenmoor" floats up and the game saves, all without a loading screen. Its road ends at a rockfall in the far hills, the way on to a later zone. Nothing lives there yet.

### Saving

Oakvale saves itself in the browser's IndexedDB (one database, `descent-vr`, holding one record). It writes at once when you take a quest, a count goes up, a quest is ready or handed in, you level up or get a new sword, and when you cross into another zone. It also writes every 30 s of play, when the page is hidden, when VR ends and when the headset is put down. Loading puts you where you stood, facing the way you faced, with your level, XP, sword and quests, at full health, with no rage and every camp full. Health, rage, the camps and the talk board aren't saved.

The record carries a version. A new build that changes its shape bumps the version and adds a migration (`src/save/record.ts`), so older saves upgrade and a deploy never wipes a character. A page from an older build (a stale cache) that finds a newer record leaves it alone and plays unsaved, and so does a page that can't make sense of the record; `?newgame` deletes it after asking. Where the browser won't store data (some private windows), the game plays anyway, keeping progress in memory, and the page says it won't be kept. `?newgame` starts over; the arena and `?map=` never read or write the save.

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
  adventureState.ts  levels, XP and Hale's quest chain: events in, effects and answers out (unit tested)
  save/
    record.ts        the save record, its version and the migrations that bring older ones up (unit tested)
    store.ts         the save store port, its in-memory adapter, and opening the save with its fallback (unit tested)
    indexedDb.ts     the browser's adapter: IndexedDB, one strict transaction per write
    controller.ts    when to write: what's earned, zone changes, every 30 s, leaving; one write in flight (unit tested)
  quests.ts          the quest chain as data: objectives, rewards and what Hale says
  game.ts            the arena (?arena): owns its systems; wave director, spawning, summons, death/victory
  showcase.ts        the arena's title-screen bestiary (?showcase)
  prototype/         throwaway prototypes kept for trying on the headset, each behind its URL flag
    mage/            ?arena&class=mage: the mage's bolts, ward, blink and mana, in three kits
    ranger/          ?arena&class=ranger: the ranger's bow, with a ward, a knife or kiting
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
    player.ts        rig, locomotion, snap turn, dash, collision, HP/rage/frenzy, body volumes
    weapons.ts       sword + shield; velocity tracking in rig space
  combat/
    geometry.ts      segment–segment, segment–box, circle push-out (unit tested)
    strike.ts        an enemy weapon's swing swept against shield, sword and body (unit tested)
    combat.ts        sword hits and crits, blocks and parries, bash, Earthshaker, War Cry, arrow outcomes
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
    brackenmoor/     Brackenmoor, the moor over the southern pass: its plan and chunk builder
  fx/                particles, sword trail, shockwaves, floating text, spatial synthesised SFX and ambience
  ui/                belt HUD and vignettes, enemy health bars, Hale's talk board, the quest tracker and arrow,
                     the zone's name, debug text panel, ?perf readout, ?newgame's dialog
```

## How the combat works

- **Your sword:** the blade is a segment swept between frames in sub-steps, so fast swings don't tunnel. Contact counts only above a tip speed. Enemies have a head sphere (crit) and a body capsule that follow their animation.
- **Enemy blows are physical:** each frame of a swing, the enemy's weapon segment is swept against your shield's block box, your blade, and a head sphere with a torso capsule hanging below the headset. Whatever it touches first decides the outcome. Horizontal slashes aim at your chest when the wind-up starts, so ducking during the telegraph makes them pass overhead.
- **Poses are the animation and the hitbox:** attacks blend between keyframe poses (`enemies/poses.ts`), and the blend's arc is exactly what the strike sweep tests. `tests/enemyAttacks.test.ts` drives real enemies through every attack against a simulated player, so a pose tweak that makes a blow whiff, or makes the right block stop working, fails a test.

## Status

- **Not yet tested on a physical headset.** Everything below was verified in the IWER emulator and in unit tests.
- **Oakvale, start to finish** (ticket 38): a scripted play-through in headless Chromium (`.scratch/oakvale-starting-zone/checks/play-through.mjs`) takes a new character from `?newgame` through all three quests, fought through the real combat with a sword and shield, to level 5 and Hale's longsword, then over the pass to Brackenmoor's rockfall. On the way it reloads mid-chain, dies outside the mine (waking by the inn's hearth) and inside it (waking outside its mouth), and reloads with the Warden beaten to find its throne empty. Every user story in the spec is mapped to what showed it, or to what waits on the headset, in `.scratch/oakvale-starting-zone/stories-seen.md`.
- Oakvale's performance in the emulator, both eyes at 96° each, the worst heading: the village 122 draw calls and 255k triangles, the crest looking north 136 calls and 318k, inside the inn 22 calls and 11k, the Warden's hall 20 calls and 17k, never more than 4 point lights. Draw calls are well under the ~300 budget; the triangles in the open woods are still a little over the 250k to 300k rule of thumb after the spec's three cuts, and wait on the headset's frame time (ticket 39).
- The arena (`?arena`): a scripted emulator bot that reads telegraphs and blocks on the correct side cleared a full run twice in a row: all seven waves and the boss. A bot that doesn't block goes down within a couple of waves. Each ability was exercised in isolation: block, shield and sword parry, bash interrupt, dash, War Cry, Earthshaker, arrows stuck in the shield, and arrows reflected by the shield and by the sword. 36 draw calls in the emulator's mono view with a full wave.
- Expect to tune after the first headset session: `CONFIG.sword.minHitSpeed`, both weapons' `pitchDeg`, the shield's size and offset, the parry speeds, the enemy wind-up times, the run's vignette and the camps' levels.
- Art is procedural: low-poly models built in code with pixel-grain textures. There are no imported assets.

## Next steps (suggested)

1. Play Oakvale on the Quest: the "For Tom, on the headset" list on ticket 38 says what to check.
2. More of Brackenmoor past the rockfall, and the next zone after it.
3. Loot drops with rolled stats.
4. Real models (Blender or Blockbench, glTF) once the look is settled. The rig and pose system can drive them.
