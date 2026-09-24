# Headset playtest of the white box

Type: task
Status: open
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
