// Every tunable in one place. White-boxing is mostly turning these knobs,
// so keep gameplay numbers here rather than scattered through systems.

export const CONFIG = {
  arena: {
    halfSize: 7, // room is (2*halfSize) metres square
    wallHeight: 3.5,
    pillars: [
      { x: -3, z: -3, r: 0.45 },
      { x: 3, z: -3, r: 0.45 },
      { x: -3, z: 3, r: 0.45 },
      { x: 3, z: 3, r: 0.45 },
    ],
  },

  player: {
    maxHp: 100,
    bodyRadius: 0.3, // for wall/pillar push-out around the head's floor projection
    moveSpeed: 2.2, // m/s, left stick
    snapTurnDeg: 45,
    stickDeadzone: 0.25,
    maxRage: 100,
    rageDecayPerSec: 2,
  },

  sword: {
    // WebXR grip space: -Z runs through the fist (pinky → thumb), which on
    // Quest is ~45° up-forward when the controller is held level. So 0 means
    // "blade continues out of the fist", like holding a real sword.
    pitchDeg: 0,
    bladeStart: 0.12, // metres from grip origin to where the blade begins
    bladeEnd: 1.0, // tip distance
    bladeHalfWidth: 0.04,
    minHitSpeed: 1.6, // m/s at the tip; slower contact is a "tap", no damage
    fullDamageSpeed: 5.0, // tip speed at which damage stops scaling up
    minDamage: 8,
    maxDamage: 28,
    critHeight: 1.45, // hits above this (head) crit
    critMultiplier: 1.6,
    perEnemyCooldown: 0.35, // s — one swing registers one hit per enemy
    knockback: 2.8, // m/s at full swing speed
    sweepSamples: 5, // sub-steps between frames so fast swings don't tunnel
  },

  shield: {
    // Tilts the board off the fist axis so it stands upright facing forward
    // when the controller is held level (see sword.pitchDeg).
    pitchDeg: -45,
    width: 0.5,
    height: 0.6,
    depth: 0.05,
    forwardOffset: 0.06,
    blockMargin: 0.08, // forgiveness: grows the block box on every side
    parrySpeed: 1.8, // m/s shield speed toward the attacker at impact = parry
  },

  enemy: {
    hp: 40,
    radius: 0.35,
    height: 1.55,
    moveSpeed: 1.3,
    turnSpeed: 6, // rad/s
    attackRange: 1.15, // starts wind-up within this distance (head XZ)
    reachBonus: 0.35, // strike still lands if player is within range + this
    windup: 0.75, // telegraph time, the window to block or step back
    strikeTime: 0.15,
    recover: 0.9,
    damage: 14,
    staggerTime: 0.35, // interrupts wind-up: hitting first matters
    blockStagger: 0.6,
    parryStagger: 1.4,
    orbDropChance: 0.4,
    separation: 0.8,
  },

  waves: {
    first: 2,
    growth: 1,
    delay: 3,
    spawnDistance: 6,
  },

  ability: {
    // War Cry: spend rage, knock everything nearby away.
    cost: 50,
    radius: 3.5,
    damage: 15,
    knockback: 6,
    stagger: 1.2,
  },

  rage: {
    perHit: 10,
    perBlock: 12,
    perParry: 25,
  },

  orb: {
    heal: 25,
    pickupRadius: 0.25, // hand touch
    walkRadius: 0.45, // or walk over it
    lifetime: 20,
  },

  feel: {
    hitStop: 0.06, // s of frozen enemies on a solid hit
    hapticHit: { intensity: 0.8, ms: 60 },
    hapticBlock: { intensity: 1.0, ms: 90 },
    hapticHurt: { intensity: 0.6, ms: 150 },
  },
} as const;
