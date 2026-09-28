# Headset playtest of the white box

Type: task
Status: resolved
Blocked by:
Mode: HITL

## Question

How does the current white box actually feel on a Quest 3? This has never been tested. Every combat-depth decision rests on it.

Checklist for the dev:

1. Get the build onto the Quest 3: `npm run dev:quest` and open `https://<LAN-IP>:5173`, or connect over USB with `adb reverse tcp:5173 tcp:5173`.
2. Play at least 3 waves, twice.
3. Note each of these, one line each is enough:
   - **Sword:** do fast swings register? Does the blue glow match your intent? Is `minHitSpeed` too strict or too loose? Is the blade angle (`pitchDeg`) natural in the hand?
   - **Shield:** does holding it up naturally block? Can you parry on purpose? Are the size and offset right?
   - **Enemies:** can you read the orange windup in time? Is reach fair?
   - **Locomotion:** any motion sickness from stick movement or snap turn? Do you want room-scale footwork?
   - **War Cry and orbs:** do they get used? Are they satisfying?
   - **Frame rate:** any visible stutter?
   - **Fun:** would you play another wave? What was the best moment, and the worst?
4. Paste the notes as the answer. Tuning numbers in `src/config.ts` during the session is allowed, and any changed values should be recorded here.

## Comments

**2026-09-26: the white box grew into a combat prototype** (see README, "Reading enemies"). The checklist above still applies. Also note, one line each:

- **Directional blocking:** can you read which side a slash comes from in time, from the wind-up pose and weapon glow? Is the shield box forgiving enough (`CONFIG.shield.blockMargin`)?
- **Parry:** do shield parries (push into the blow) and sword parries (swing into it) happen when you mean them to? Tune `CONFIG.shield.parrySpeed` and `CONFIG.sword.parrySpeed`.
- **Ducking:** does ducking a horizontal slash feel possible and fair?
- **Dash (B/Y):** comfortable with the vignette? Is the distance (`CONFIG.dash.distance`) right?
- **Shield bash and Earthshaker:** do they trigger when intended and never by accident (`bashSpeed`, `groundSlam.minDownSpeed`)?
- **Archers:** can you block, parry or bat arrows back? Is the arrow speed fair?
- **Brute and Warden:** is the red slam readable, and the punish window (stuck maul, kneeling boss) satisfying? How long does the boss fight last?
- **Crowds:** do attack tokens (`CONFIG.tokens`) make groups readable, or too passive?
- **Frame rate:** check `renderer.info.render.calls` in the console (`__descent.renderer.info`) with a full wave.

**2026-09-28: what Quest 3 play has already shown** (gathered from the project's threads, 2026-09-27 to 2026-09-28; all fixes are merged on main):

- **Models:** "they look decent".
- **Archers:** the draw didn't aim at the player, though the arrow flew true. Fixed in PR #3.
- **Sword edge:** skeleton slashes landed with the flat. Fixed in PR #4, which also added enemy guards and sword blocking. The player's sword angle on main is right.
- **Sword too easy:** it went hot on small wiggles and slow drags, and could be swung wildly. Fixed over PRs #7, #10 and #11: about 20 cm of committed hand travel, a trailing tip (`tipLag`), and a stricter hot threshold (tip 2.8 m/s, hand 1.0 m/s).
- **Grave brute:** head hits stun-locked it, which made it useless. Fixed in PR #8.
- **Guarding:** a `?duel` duelist that blocks about 90% was added to test it (PR #10). Duels exposed open legs (PR #11), then open hips and endless stabs (PR #12).
- **Verdict (Tom, 2026-09-28):** combat is a viable prototype. It will be tweaked later, but it is in a good state for now.

## Answer

Played on the Quest 3 across 2026-09-27 and 2026-09-28. **Tom's verdict: combat is a viable prototype.** It will be tweaked later, but it is good enough to build the slice on. The fixes the play demanded are all merged (see the comment above: archer aim, sword edge, hits needing a committed swing and a trailing tip, the brute stun-lock, guard gaps at legs, hips and stabs).

The checklist items that never came up in those sessions, as confirmed by Tom on 2026-09-28:

- **Comfort:** stick movement, snap turn and the dash are fine. No motion sickness.
- **Frame rate:** no stutter in a full wave.
- **Reading enemies:** the side a slash comes from can mostly be read in time to block, parry or duck.
- **Extras:** sword and shield carry every fight. Shield bash, dash, War Cry, Earthshaker and the orbs are rarely used.
- **Brute, archers and the Warden:** fair, now that the brute no longer stun-locks.
- **Fun:** yes, he wants another wave.

No tuning values in `src/config.ts` were changed during play beyond what the PRs above merged.
