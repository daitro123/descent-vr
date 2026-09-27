# Descent VR

A Diablo-like action RPG for VR that runs in the browser (Three.js + WebXR). This is a **combat prototype**: one crypt hall, four enemy types including a boss, and a warrior with a sword and shield. It exists to prove the melee combat feel before content goes in.

For why this stack, other options, and the pixel-art pipeline, see [docs/tech-research.md](docs/tech-research.md).

## Play it

**https://daitro123.github.io/descent-vr/**

- **On a Quest:** open the link in the Quest browser and press **Enter VR**. GitHub Pages serves over HTTPS, so WebXR works with no dev server and no certificate to accept.
- **On a desktop:** the same link loads the IWER emulator (see below). The URL flags below work there too, for example `…/descent-vr/?wave=7`.

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
- URL flags:
  - `?emulate` forces the emulator even when a real headset is present. `?emulate&nodevui` runs it without the DevUI, so controller poses are driven only by code (for scripted tests).
  - `?wave=N` starts the run at wave N (`?wave=7` goes straight to the boss).
  - `?showcase` pins the title-screen camera on the bestiary lineup, for reviewing models without a headset.
  - `?map=forest` walks the outdoor map with no enemies (`?map=crypt` for the crypt hall). Headset: left stick moves, right stick turns. Desktop: WASD or the arrow keys walk (Shift to hurry), dragging looks around.

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
| Hand or feet | Touch a red orb to heal |

The belt HUD (look down) shows health on the left orb and rage on the right orb, with pips for Earthshaker and War Cry beneath it. Between the orbs are the wave, the enemies left and the dash cooldown. Rage builds from hits, blocks, parries and bashes.

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
  main.ts            renderer and XR settings, frame loop, emulator bootstrap, debug handle
  game.ts            owns the systems; wave director, spawning, summons, death/victory
  showcase.ts        title-screen bestiary (?showcase)
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
  world/             arena (merged geometry, colliders), glow sprites, blob shadows, pixel textures, orbs
  maps/
    types.ts         GameMap: what gameplay and the map viewer need from any map (scene, sky, ground height, collision)
    registry.ts      finds every map folder (src/maps/<id>/index.ts); add a map by adding a folder
    walk.ts          ?map=<id>: walk a map with the warrior's locomotion, no enemies
    crypt/           the crypt hall (world/arena.ts) as a map
    forest/          Oakvale, the outdoor map: layout.ts is the plan (heights, roads, what stands where,
                     colliders, unit tested); terrain, nature, buildings and sky turn it into chunked meshes
  fx/                particles, sword trail, shockwaves, floating text, spatial synthesised SFX
  ui/                belt HUD and vignette, enemy health bars
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

1. A headset playtest pass (see `.scratch/vertical-slice/issues/01-headset-playtest-of-the-white-box.md`).
2. Loot drops with rolled stats: the core Diablo loop.
3. Hand-built floors, and a descent between them.
4. Real models from Blockbench (glTF) once the look is settled. The rig and pose system can drive them.
