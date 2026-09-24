# Descent VR

A Diablo-like action RPG for VR that runs in the browser (Three.js + WebXR). This is currently a **white box**: one room, one enemy type and a warrior with a sword and shield. It exists to prove the melee combat feel before any art or content goes in.

For why this stack, other options, and the pixel-art pipeline, see [docs/tech-research.md](docs/tech-research.md).

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

- **No headset:** open the dev URL in a desktop browser. The IWER emulator loads automatically and shows a DevUI. Use it to move the emulated Quest 3 headset and controllers, or turn on its play mode for mouse and keyboard.
- **On a Quest:** WebXR needs a secure origin. Use either option:
  - `npm run dev:quest`, then open `https://<your-LAN-IP>:5173` in the Quest browser and accept the self-signed certificate.
  - Or connect over USB with `adb reverse tcp:5173 tcp:5173` and open `http://localhost:5173` on the headset.
- URL flags: `?emulate` forces the emulator even when a real headset is present. `?emulate&nodevui` runs the emulator without the DevUI, so controller poses are driven only by code (for scripted tests).

Other commands: `npm test` runs the unit tests (collision maths), `npm run typecheck`, `npm run build`.

## Controls (warrior)

| Input | Action |
|---|---|
| Right hand | Sword. Swing fast and the blade glows blue when it can deal damage. Damage scales with swing speed, and head hits crit. |
| Left hand | Shield. Put it between you and the club to block. Push it into the blow as it lands to **parry**, which staggers the enemy for longer. |
| Left stick | Move, relative to where you look |
| Right stick | Snap turn by 45° |
| A / X | **War Cry**: spend 50 rage for an area knockback and stagger |
| Hand or feet | Touch a red orb to heal |

The belt HUD (look down) shows health on the left orb and rage on the right orb. Rage builds from hits, blocks and parries.

Enemies glow orange while winding up. You have three answers: hit them first (interrupts the attack), block, or step back out of reach.

## Code map

```
src/
  config.ts          every gameplay number, in one place for tuning
  main.ts            renderer, VR button, frame loop, emulator bootstrap
  emulator.ts        IWER + DevUI (lazy-loaded; not in the headset path)
  game.ts            owns the systems; wave loop, separation, death/restart
  player/
    input.ts         XR controllers → left/right hands, sticks, buttons, haptics
    player.ts        rig, stick locomotion, snap turn, wall collision, HP/rage
    weapons.ts       sword + shield meshes; velocity tracking in rig space
  combat/
    geometry.ts      segment–segment, segment–box, circle push-out (unit tested)
    combat.ts        sword sweeps, strike resolution (block/parry/hit/miss), War Cry
  enemies/enemy.ts   grunt state machine: spawn → chase → windup → strike → recover / stagger / dead
  world/             arena + colliders, procedural pixel textures, health orbs
  fx/                floating combat text, synthesised SFX, shockwave ring
  ui/beltHud.ts      body-locked HP/rage orbs, hurt flash
```

## Status

- Tested in the IWER emulator, including a scripted combat run: a fast swing damages and crits, a slow push through an enemy does not, a raised shield blocks, and a lowered shield takes the hit. **Not yet tested on a physical headset.** Expect to tune `CONFIG.sword.minHitSpeed`, both weapons' `pitchDeg`, and the shield size and offset after the first real session.
- All art is placeholder: primitive shapes and procedural textures.

## Next steps (suggested)

1. A headset playtest pass to tune numbers in `config.ts`.
2. A second enemy type (ranged) to force shield use and movement.
3. Loot drops with rolled stats: the core Diablo loop.
4. Procedural dungeon rooms and corridors, plus a navmesh for enemies.
5. Real models from Blockbench (glTF) to replace the primitives.
