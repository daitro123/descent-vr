# Combat depth for the slice

Type: grilling
Status: open
Blocked by: 01

## Question

Given the headset playtest notes, what does "deeper combat" mean for the slice? Decide which of these are in, and roughly how each should feel:

- Keep speed-gated "ghost" weapons, or move towards physical weight (see `docs/tech-research.md`, "Melee model")?
- Player moves beyond swing, block, parry and War Cry: a dodge or sidestep, a charged or heavy strike, a shield bash, a second ability?
- What pressure enemy variety must create: ranged, shielded, swarming, or big telegraphed attacks? This sets up the enemy roster, which is still in the fog.
- Fixes the playtest showed are needed (hit detection, reach, parry window), as opposed to new features.

## Comments

**2026-09-26: candidates now exist in the prototype**, ahead of the playtest, so this grilling can decide from play rather than theory. Everything is in `src/config.ts` and can be cut or tuned:

- **Melee model:** still speed-gated "ghost" weapons for the player. Enemy blows became physical: the weapon's animated arc is swept against shield, sword and body, so block placement and ducking matter.
- **Player moves:** shield bash (interrupts a wind-up and exposes the enemy), dash with dodge frames (B/Y), sword parry and clash, Earthshaker (sword tip into the floor, 35 rage), and War Cry now also grants frenzy (+35% damage for 8 s).
- **Pressure types:** ranged (skeleton archer, with arrows that can be reflected), armoured and unblockable (grave brute: poise, a guard-breaking swing, a red slam), and a boss (the Bone Warden: a three-hit combo, a slam, summons, and a kneel punish window).
- **Crowd rules:** attack tokens (2 melee, 2 ranged) with a 0.9 s gap between swing starts.

**2026-09-28: the playtest is in** ([Headset playtest of the white box](01-headset-playtest-of-the-white-box.md)). Tom calls combat a viable prototype, to be tweaked later. Sword and shield carry every fight, while shield bash, dash, War Cry, Earthshaker and the orbs are rarely used. Since then the prototype also gained edge-only cuts, enemy guards (high, left, right and low), hits that need a committed swing, a trailing sword tip, and a `?duel` duelist that blocks about 90% of swings.
