// Every tunable in one place. White-boxing is mostly turning these knobs,
// so keep gameplay numbers here rather than scattered through systems.

import type { EnemyKind } from './models/characters';

/** Which keyframe pair (enemies/poses.ts) an attack animates between. */
export type AttackPoseName = 'chop' | 'slashR' | 'slashL' | 'slam' | 'draw' | 'summon';

export interface AttackConfig {
  pose: AttackPoseName;
  /**
   * melee: the weapon's arc is swept against shield, sword and body. slam: AOE
   * where the weapon lands. shot: an arrow. summon: raises the dead.
   */
  kind: 'melee' | 'slam' | 'shot' | 'summon';
  windup: number; // s of telegraph (the weapon glows)
  active: number; // s of the swing itself
  recover: number;
  damage: number;
  /** false: red telegraph, shields don't help, get out of the way. */
  blockable: boolean;
  /** Blocking still stings and numbs the shield arm. */
  guardBreak?: boolean;
  /** Horizontal slash: tilt the arc to the player's chest height at wind-up start (so you can duck it). */
  aim?: boolean;
  radius?: number; // slam AOE, metres around the impact
  weight: number; // how often it's picked
  /** Combo: attack index that follows immediately (the Warden). */
  next?: number;
  /** Weapon stuck in the floor after the blow: a window of bonus damage. */
  exposeOnRecover?: boolean;
}

/** Raising the weapon to block the player's sword (see CONFIG.guard). */
export interface GuardConfig {
  /** Chance to raise it against a swing, rolled once per swing. */
  chance: number;
  hold: readonly [number, number]; // s the guard stays up (random in range)
  cooldown: number; // s before it will guard again
  /** s between looks at which side your blade is on: a quicker feint gets past. */
  reaction: number;
  /** Drops its own wind-up or recovery to meet your swing (only a blow already falling can't be stopped). */
  breaksOff?: boolean;
}

export interface EnemyConfig {
  hp: number;
  radius: number; // body collision and hurt capsule
  speed: number; // m/s
  turnSpeed: number; // rad/s
  /** Hits dealing less than this don't interrupt its attacks (super armour). */
  poise: number;
  attackRange: number; // starts an attack within this distance (feet to feet)
  holdDistance: number; // without an attack token, circle the player at this range
  attackCooldown: readonly [number, number]; // s between its own attacks (random in range)
  staggerTime: number;
  /**
   * s after a stagger ends in which blows only make it flinch, so a player who
   * keeps hitting can't stun-lock it. Kinds without one can be staggered again
   * as soon as they recover.
   */
  steadyTime?: number;
  blockStagger: number;
  parryStagger: number;
  exposedTime: number; // bonus-damage window after a parry, bash or stuck weapon
  critMultiplier: number; // head hits
  orbChance: number;
  death: 'shatter' | 'topple';
  attacks: readonly AttackConfig[];
  /** Kinds without one never block. */
  guard?: GuardConfig;
}

export const CONFIG = {
  arena: {
    halfSize: 7, // room is (2*halfSize) metres square
    wallHeight: 4,
    gate: { width: 1.8, height: 2.8, depth: 1.4 },
    pillars: [
      { x: -3, z: -3, r: 0.45 },
      { x: 3, z: -3, r: 0.45 },
      { x: -3, z: 3, r: 0.45 },
      { x: 3, z: 3, r: 0.45 },
    ],
    // Other round colliders: the throne, corner braziers, crates. Keep them
    // either flush with a wall or a body-width clear of it and of each other:
    // a gap narrower than an enemy makes a pocket it can be knocked into and
    // never leave.
    obstacles: [
      { kind: 'throne', x: 0, z: -6.3, r: 0.9 },
      { kind: 'brazier', x: -6.4, z: -6.4, r: 0.4 },
      { kind: 'brazier', x: 6.4, z: -6.4, r: 0.4 },
      { kind: 'brazier', x: 6.4, z: 6.4, r: 0.4 },
      { kind: 'brazier', x: -6.4, z: 6.4, r: 0.4 },
      { kind: 'crate', x: -4.4, z: 6.3, r: 0.55 },
      { kind: 'crate', x: -3.3, z: 6.5, r: 0.3 },
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
    // What enemy weapons can hit, relative to the headset: a head sphere and a
    // torso capsule hanging below it. Duck, and a slash passes over.
    body: {
      headRadius: 0.12,
      headDrop: 0.04, // the skull's centre sits a little below the eyes
      torsoTop: 0.28,
      torsoBottom: 0.85,
      torsoRadius: 0.2,
    },
  },

  dash: {
    // B / Y: a quick step in the left-stick direction (backwards if neutral).
    distance: 1.7,
    time: 0.16, // short enough to read as a step, not a glide (comfort)
    cooldown: 1.1,
    invulnerable: 0.22, // s of dodge frames from the start of the dash
  },

  sword: {
    // WebXR grip space: -Z runs through the fist (pinky → thumb), which on
    // Quest is ~45° up-forward when the controller is held level. So 0 means
    // "blade continues out of the fist", like holding a real sword.
    pitchDeg: 0,
    bladeStart: 0.12, // metres from grip origin to where the blade begins
    bladeEnd: 1.0, // tip distance
    bladeHalfWidth: 0.04,
    minHitSpeed: 2.8, // m/s at the tip; slower contact is a "tap", no damage
    // A swing only hurts once it is committed: the hand itself has travelled
    // this far in one direction. Flicking the wrist whips the tip past
    // minHitSpeed without moving the hand, and turning back starts over, so
    // wiggling the blade never adds up to a hit.
    minSwingTravel: 0.2, // m of hand travel
    swingHandSpeed: 1.0, // m/s: the hand is swinging, not dragging the blade along
    swingGrace: 0.06, // s the hand may dip below swingHandSpeed mid-swing
    // Weight: the tip is heavy. It chases where the hand points the blade about
    // `tipLag` seconds behind (0 = rigid), so a fast swing or a quick sweep of
    // the arm drags it behind the hand. It never trails by more than maxLagDeg.
    tipLag: 0.09,
    maxLagDeg: 35,
    fullDamageSpeed: 5.0, // tip speed at which damage stops scaling up
    minDamage: 8,
    maxDamage: 28,
    perEnemyCooldown: 0.35, // s — one swing registers one hit per enemy
    knockback: 2.8, // m/s at full swing speed
    sweepSamples: 5, // sub-steps between frames so fast swings don't tunnel
    blockMargin: 0.05, // forgiveness: thickens the blade when it's in the way of a blow or an arrow
    parrySpeed: 2.2, // tip speed that turns a sword block into a parry
    guardKnockback: 1.2, // m/s shove on an enemy whose guard takes a full-speed swing
    exposedMultiplier: 1.5,
    frenzyMultiplier: 1.35,
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
    guardBreakChip: 0.3, // share of a heavy blow that gets through a block
    numbTime: 1.0, // s the shield can't block after a guard break
    // Shield bash: punch the shield into an enemy.
    bashSpeed: 2.2, // m/s toward the enemy
    bashReach: 0.22, // shield centre to body surface
    bashDamage: 6,
    bashKnockback: 3.2,
    bashCooldown: 0.8,
  },

  // Enemy guards: kinds with a `guard` raise their weapon when your blade comes
  // at them, on the side it comes from. A blade that meets the guard does no
  // damage; swing at the open side, feint, or shield-bash the guard away.
  guard: {
    threatSpeed: 1.0, // m/s at your sword tip; below minHitSpeed, so they react to the wind-up
    threatReach: 0.7, // your blade within this of its body counts as coming at it
    margin: 0.02, // extra thickness on a guarding weapon
    raiseRate: 20, // 1/s pose easing into the guard (walking eases at 10)
  },

  // Ranged attacks: arrows are straight and quick, so blocking and side-stepping both work.
  arrow: {
    speed: 10, // damage comes from the archer's attack
    reflectDamage: 30,
    life: 2.5,
    stickTime: 2.5, // how long spent arrows stay stuck in walls and shields
    hitRadius: 0.05,
    aimBelowHead: 0.35, // archers aim at the chest: this far below the player's head
  },

  // Attack tokens: how many enemies may be mid-attack at once, per type of
  // threat, and the minimum spacing (s) between two attacks starting.
  tokens: { melee: 2, ranged: 2, meleeGap: 0.9, rangedGap: 0.6 },

  enemies: {
    grunt: {
      hp: 45,
      radius: 0.33,
      speed: 1.35,
      turnSpeed: 6,
      poise: 0,
      attackRange: 1.15,
      holdDistance: 2.3,
      attackCooldown: [0.8, 1.8],
      staggerTime: 0.4,
      blockStagger: 0.7,
      parryStagger: 1.5,
      exposedTime: 1.5,
      critMultiplier: 1.6,
      orbChance: 0.35,
      death: 'shatter',
      attacks: [
        { pose: 'chop', kind: 'melee', windup: 0.8, active: 0.22, recover: 0.75, damage: 14, blockable: true, weight: 1 },
        { pose: 'slashR', kind: 'melee', windup: 0.75, active: 0.24, recover: 0.7, damage: 12, blockable: true, aim: true, weight: 1 },
        { pose: 'slashL', kind: 'melee', windup: 0.75, active: 0.24, recover: 0.7, damage: 12, blockable: true, aim: true, weight: 1 },
      ],
      guard: { chance: 0.35, hold: [0.9, 1.6], cooldown: 1.8, reaction: 0.3 },
    },
    archer: {
      hp: 28,
      radius: 0.3,
      speed: 1.5,
      turnSpeed: 5,
      poise: 0,
      attackRange: 9, // longest shot
      holdDistance: 5.5, // preferred range; backs off inside 3.5 m
      attackCooldown: [1.4, 2.6],
      staggerTime: 0.5,
      blockStagger: 0.5,
      parryStagger: 1.2,
      exposedTime: 1.5,
      critMultiplier: 1.6,
      orbChance: 0.3,
      death: 'shatter',
      attacks: [{ pose: 'draw', kind: 'shot', windup: 1.1, active: 0.15, recover: 0.6, damage: 10, blockable: true, weight: 1 }],
    },
    brute: {
      hp: 170,
      radius: 0.5,
      speed: 1.05,
      turnSpeed: 3.5,
      poise: 22,
      attackRange: 1.65,
      holdDistance: 2.8,
      attackCooldown: [1.2, 2.2],
      staggerTime: 0.5,
      steadyTime: 2.5, // long enough to wind up and land one blow before it can be staggered again
      blockStagger: 0.6,
      parryStagger: 2.0,
      exposedTime: 2.2,
      critMultiplier: 1.6,
      orbChance: 1,
      death: 'topple',
      attacks: [
        { pose: 'slashR', kind: 'melee', windup: 1.05, active: 0.3, recover: 0.9, damage: 22, blockable: true, guardBreak: true, aim: true, weight: 2 },
        { pose: 'slam', kind: 'slam', windup: 1.25, active: 0.25, recover: 1.6, damage: 30, blockable: false, radius: 1.5, exposeOnRecover: true, weight: 1 },
      ],
    },
    warden: {
      hp: 1100,
      radius: 0.55,
      speed: 1.25,
      turnSpeed: 3,
      poise: 45,
      attackRange: 2.2,
      holdDistance: 2.2,
      attackCooldown: [0.6, 1.3],
      staggerTime: 0.6,
      blockStagger: 0.5,
      parryStagger: 0, // a parry drops the Warden to one knee instead (see warden)
      exposedTime: 2.8,
      critMultiplier: 2,
      orbChance: 0,
      death: 'shatter',
      attacks: [
        { pose: 'slashR', kind: 'melee', windup: 0.85, active: 0.28, recover: 0.3, damage: 18, blockable: true, aim: true, weight: 2, next: 1 },
        { pose: 'slashL', kind: 'melee', windup: 0.5, active: 0.28, recover: 0.3, damage: 18, blockable: true, aim: true, weight: 0, next: 2 },
        { pose: 'chop', kind: 'melee', windup: 0.6, active: 0.3, recover: 0.9, damage: 24, blockable: true, weight: 0 },
        { pose: 'slam', kind: 'slam', windup: 1.3, active: 0.3, recover: 1.0, damage: 34, blockable: false, radius: 2.2, exposeOnRecover: true, weight: 1 },
      ],
      guard: { chance: 0.25, hold: [0.6, 1.1], cooldown: 2.5, reaction: 0.22 },
    },
  } satisfies Record<EnemyKind, EnemyConfig>,

  warden: {
    summonAt: [0.7, 0.4], // HP fractions at which it raises grunts
    summonCount: 2,
    enrageAt: 0.35, // below this HP fraction, wind-ups are faster
    enrageWindup: 0.75,
    kneelTime: 2.6,
  },

  // ?duel: a practice duelist, one at a time. It is a grunt that reads nearly
  // every swing and keeps its guard up, to test how often blocking can win.
  // Its guard follows your blade almost at once; get round it, go low, catch
  // it mid-attack, or shield-bash the guard away.
  duelist: {
    guard: { chance: 0.92, hold: [2.5, 4], cooldown: 0.1, reaction: 0.06, breaksOff: true },
    poise: 30, // a hit that gets through doesn't stagger it out of its next guard
    attackCooldown: [1.4, 2.6],
  },

  waves: {
    // Each wave's roster, in order; after the last (the Warden) the run is won.
    list: [
      { grunt: 2 },
      { grunt: 3 },
      { grunt: 2, archer: 1 },
      { grunt: 2, archer: 2 },
      { brute: 1, grunt: 2 },
      { brute: 1, grunt: 2, archer: 2 },
      { warden: 1 },
    ] as Partial<Record<EnemyKind, number>>[],
    delay: 4, // s between waves
    spawnInterval: 0.7, // s between enemies of one wave
    spawnDistance: [4.5, 6] as const,
    maxAlive: 8, // performance budget: ~8 on screen
  },

  warCry: {
    // A / X: spend rage, knock everything nearby away, then fight in a frenzy.
    cost: 50,
    radius: 3.5,
    damage: 15,
    knockback: 6,
    stagger: 1.2,
    frenzyTime: 8,
  },

  groundSlam: {
    // Drive the sword tip into the floor, fast, with enough rage.
    cost: 35,
    floorY: 0.12, // tip below this counts as striking the floor
    minDownSpeed: 3.5, // m/s, downward tip speed
    radius: 2.2,
    damage: 30,
    knockback: 5,
    stagger: 1.0,
    cooldown: 0.8,
  },

  rage: {
    perHit: 10,
    perBlock: 12,
    perParry: 25,
    perBash: 8,
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
