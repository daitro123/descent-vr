# Descent VR

A single-player action RPG for VR that runs in the browser (Three.js + WebXR), growing into a WoW-style world of zones joined without loading screens. The plain URL is the **Adventure**: Oakvale, the starting zone, where Marshal Hale waits at the crossroads with a quest chain and you walk out with a sword and shield to take on the raiders camped at the farm (the lumber camp, the old mine and the rest are being built, see `.scratch/oakvale-starting-zone/`). The **arena** at `?arena` is the combat prototype that came first: one crypt hall, four enemy types including a boss, seven waves.

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
  - `?bag` is a **prototype** of the bag and the gear panel (inventory ticket 03), in a quiet yard with a training dummy: reach over either shoulder and squeeze the grip to bring the bag round. `?bag=a` (touch an item with a fist or the sword's tip and hold the grip to carry it, the pick), `?bag=b` (press an item, then press where it goes) and `?bag=c` (grab it with your hand) are the three ways to move items; in the headset a click of the left stick switches between them, and the right stick swaps the slots' icons for small 3D models (`&models` starts with them). Nothing in it reaches the Adventure or the save.
  - `?perf` adds a readout of the frame rate, draw calls, triangles and shader programs, low on the left of your view, over Oakvale or the arena.
  - `?emulate` forces the emulator even when a real headset is present. `?emulate&nodevui` runs it without the DevUI, so controller poses are driven only by code (for scripted tests). `window.__descent` is the debug handle; in Oakvale it has `camps`, `state` (your level and XP, and what Hale and the tracker show), `saved()` (resolves once no save write is in flight), `teleport(x, z, yaw)` and `step(seconds)`, which runs the game without waiting for frames.
  - `?fly` opens the map viewer: fly freely through any map, with no enemies and no walls in the way. `?fly=crypt` opens one map. Walk mode drops you to eye height with the player's collision. R (desktop) or Y (headset) steps through the map's start, its landmarks and an overview from above. On the desktop, click to look around, WASD to move, Q/E for down and up, shift to go fast, M for the next map, G to walk, F for fog. In the headset, the left stick moves where you look, the right stick turns and rises, grip goes fast, A is the next map, B walks or flies, and X toggles fog. The readout floats over your left controller. On a phone or tablet, a stick (bottom left) moves, dragging anywhere else looks around, ▲ ▼ go up and down, and buttons under the readout switch map, walk, fog, fast and spot.
  - `?map=forest` walks Oakvale from its start with no enemies (`?map=crypt` for the crypt hall). Headset: left stick moves, right stick turns. Desktop: WASD or the arrow keys walk (Shift to hurry), dragging looks around.

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

In Oakvale, you start facing Marshal Hale, with a gold "!" over their head. Walk up looking at them and a board unfolds beside them; press its buttons with either fist or your sword's tip. The quest you're on floats at the top left of your view with its counts, and a gold "?" over Hale says it's ready to hand in. Kills pay XP and hand-ins pay more, and each level adds health and damage (the War Cry comes at level 2, Earthshaker at 3).

Enemies wait in camps. Come within 8 m of one, or hurt it, and it fights, bringing whoever of its camp stands near it; lead it 30 m from where it waited and it walks home untouchable ("Evade") and heals. A cleared camp fills again three minutes later, once you're well away. Out of a fight for 5 s, your health comes back. If you die, the view fades to black and you wake in the village in front of the inn, with nothing lost.

### Saving

Oakvale saves itself in the browser's IndexedDB (one database, `descent-vr`, holding one record). It writes at once when you take a quest, a count goes up, a quest is ready or handed in, you level up or get a new sword (and, once Brackenmoor is joined on, when you cross into another zone). It also writes every 30 s of play, when the page is hidden, when VR ends and when the headset is put down. Loading puts you where you stood, facing the way you faced, with your level, XP, sword and quests, at full health, with no rage and every camp full. Health, rage, the camps and the talk board aren't saved.

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
  people/hale.ts     Marshal Hale at the crossroads: turns to you, waves, the "!" or "?" over their head
  world/             the World (one light rig, sky, fog and Ground for every zone), the arena's crypt hall
                     (merged geometry, colliders), glow sprites, blob shadows, pixel textures, orbs
  maps/
    types.ts         GameMap: what gameplay and the map viewer need from any map (scene, sky, ground height, collision)
    registry.ts      finds every map folder (src/maps/<id>/index.ts); add a map by adding a folder
    walk.ts          ?map=<id>: walk a map with the warrior's locomotion, no enemies
    crypt/           the crypt hall (world/arena.ts) as a map
    forest/          Oakvale, the outdoor map: layout.ts is the plan (heights, roads, what stands where,
                     colliders, unit tested); terrain, nature, buildings and sky turn it into chunked meshes
  fx/                particles, sword trail, shockwaves, floating text, spatial synthesised SFX
  ui/                belt HUD and vignette, enemy health bars, Hale's talk board, the quest tracker,
                     debug text panel, ?perf readout, ?newgame's dialog
```

## How the combat works

- **Your sword:** the blade is a segment swept between frames in sub-steps, so fast swings don't tunnel. Contact counts only above a tip speed. Enemies have a head sphere (crit) and a body capsule that follow their animation.
- **Enemy blows are physical:** each frame of a swing, the enemy's weapon segment is swept against your shield's block box, your blade, and a head sphere with a torso capsule hanging below the headset. Whatever it touches first decides the outcome. Horizontal slashes aim at your chest when the wind-up starts, so ducking during the telegraph makes them pass overhead.
- **Poses are the animation and the hitbox:** attacks blend between keyframe poses (`enemies/poses.ts`), and the blend's arc is exactly what the strike sweep tests. `tests/enemyAttacks.test.ts` drives real enemies through every attack against a simulated player, so a pose tweak that makes a blow whiff, or makes the right block stop working, fails a test.

## Status

- **Not yet tested on a physical headset.** Everything below was verified in the IWER emulator and in unit tests.
- A scripted emulator bot that reads telegraphs and blocks on the correct side cleared a full run twice in a row: all seven waves and the boss. A bot that doesn't block goes down within a couple of waves. Each ability was exercised in isolation: block, shield and sword parry, bash interrupt, dash, War Cry, Earthshaker, arrows stuck in the shield, and arrows reflected by the shield and by the sword.
- Performance: 36 draw calls in the emulator's mono view with a full wave (five enemies, their health bars and the HUD), so about 72 per frame in stereo, well under the ~300 budget from the Quest 3 research. Characters are one draw call each, the room is four meshes, and all particles, arrows, glows and shadows are instanced.
- Expect to tune after the first headset session: `CONFIG.sword.minHitSpeed`, both weapons' `pitchDeg`, the shield's size and offset, the parry speeds, and the enemy wind-up times.
- Art is procedural: low-poly models built in code with pixel-grain textures. There are no imported assets.

## Next steps (suggested)

1. Loot drops with rolled stats: the core Diablo loop.
2. Hand-built floors, and a descent between them.
3. Real models from Blockbench (glTF) once the look is settled. The rig and pose system can drive them.
