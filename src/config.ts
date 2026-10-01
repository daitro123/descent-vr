// Every tunable in one place. White-boxing is mostly turning these knobs,
// so keep gameplay numbers here rather than scattered through systems.

import type { Role } from './adventureState';
import type { EnemyKind } from './models/characters';
import type { GearSlot, Rarity } from './items';
import type { Grade, RecipeRow, SpotKindRow } from './professions/professions';

/** Which keyframe pair (enemies/poses.ts) an attack animates between. */
/** The attacks a human body or a skeleton swings (poses.ts). */
export type HumanoidAttack = 'chop' | 'slashR' | 'slashL' | 'slam' | 'draw' | 'summon';
/** Which keyframes an attack plays: a humanoid's swing, or a crawler's lunge at your legs (crawler.ts). */
export type AttackPoseName = HumanoidAttack | 'lunge';

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
  /**
   * Strikes low, at your legs as well as your body (a biter's lunge): hold the
   * shield or the blade down to block it, or step back out of its reach.
   */
  low?: boolean;
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
  /** m round it that keeps you and the others off it, if not its radius: a biter, low on the ground, comes in to your feet. */
  crowd?: number;
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
  /** How its undead die: a skeleton shatters into its bones, the brute topples. Bandits always topple. */
  death: 'shatter' | 'topple';
  attacks: readonly AttackConfig[];
  /** Kinds without one never block. */
  guard?: GuardConfig;
  /** How much of a root's or freeze's length (`hold`, 0: immune) and of a slow's strength (`slow`) it takes. All of both without one. */
  takes?: { hold: number; slow: number };
  /** How far a blow's push moves it, 1 for a grunt: heavy ones barely budge. Without one, by its behaviour. */
  knockback?: number;
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
    // A choked gate's fallen stone (world/hall.ts: the old mine's hall's east and west gates): m it spills into the room,
    // and m its collider, flush with the wall, reaches past the gate's sides.
    choked: { spill: 0.6, beyond: 0.4 },
  },

  // The World (world/world.ts): what every zone shares. Loading a zone never
  // adds a light, a sky or a shader; a zone's atmosphere only changes values.
  world: {
    /** Towards the sun: a late afternoon from the south-west, the same hour in every zone. */
    sunDirection: [-0.55, 0.62, 0.56],
    /**
     * Point lights that sit on the nearest flames indoors. Always exactly this
     * many in the scene (a different count recompiles every lit shader), and
     * dark outdoors, where glows fake every flame. The arena's torches give
     * the same light.
     */
    pool: {
      size: 4,
      color: 0xff9a3c,
      intensity: 7,
      distance: 10,
      decay: 1.5,
      fade: 0.3, // s a light takes to fade out of one flame, and again into the next
      // Flicker by intensity: this share of the flame's light plus two waves,
      // the second a `phase` behind the first, and each light `stagger` s on from the last.
      flicker: { base: 0.85, depth: [0.1, 0.06], rate: [9, 24], phase: 1.3, stagger: 2.9 }, // 1, ratios of intensity, rad/s, rad, s
    },
    sky: {
      radius: 180, // m; the World shrinks it inside a nearer far plane
      farShare: 0.9, // …to this share of the far plane
      // Sine of the elevation below which the dome is pure haze, the fog's
      // colour. Oakvale's ridges past the far plane rise to about 0.17; fully
      // fogged ones (past the fog's far edge) to about 0.25, inside the blend.
      hazeTop: 0.18,
      hazeBlend: 0.2, // over this much more it turns to the sky above
      sunDiscDeg: 2, // angular radius of the sun's disc
      sunHaloDeg: 3.9,
    },
    // How a zone's ground answers a fight (steering, sight lines, arrows):
    // from the camp prototype's zone ground.
    ground: {
      eyeHeight: 1.4, // m above the ground at each end of a sight line
      sightStep: 0.5, // m between samples along a sight line
      bodyClearance: 0.8, // m at each end of a sight line where the bodies themselves stand
      sightWidth: 0.05, // m: how thin a trunk or post may be and still block a sight line
      lookAhead: 1, // m beyond a body's radius that steering probes for what's ahead
      turns: [0.4, 0.8, 1.2, 1.6, 2.0], // rad either side that steering tries, nearest first
      propHeight: 3, // m: arrows fly over trunks, tents and walls above this
      arrowWidth: 0.02, // m: an arrow stops this close to the ground or to a trunk or wall
      // m: each zone's walkable area reaches this far over a seam into its neighbour's,
      // and within this of a zone's land the World asks it too (its trunks and rocks by the line)
      seam: 1,
    },
    // Crossing a seam into the next zone (world/seams.ts): the light, haze, sky
    // and ambience blend by where you stand across `band` m either side of its
    // line, and the current zone (its name, the save, the sound) changes once
    // you're `past` m over it, either way.
    crossing: {
      band: 40, // m either side of the line
      past: 2, // m over the line
    },
  },

  player: {
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
      // Below the torso, legs only a low blow (a biter's lunge) can strike: down to the ankles, both legs in one capsule.
      ankles: 0.06,
      legsRadius: 0.13,
    },
  },

  run: {
    // The Adventure's run: click the left stick and you jog while it points ahead
    // and nothing fights you; let go of the stick and it ends.
    speed: 3.5, // m/s (the walk is player.moveSpeed)
    aheadDeg: 45, // the stick must point within this of straight ahead, either side
    buzz: { intensity: 0.7, ms: 120 }, // the left hand's one buzz when a pull ends your run
    // The edges of your view darken a little while you run: a ring, clear in the middle.
    vignette: {
      strength: 0.55, // how dark the very edge gets (0 turns the vignette off, 1 black)
      fade: 0.2, // s to fade in, and out
      clearDeg: 30, // clear out to this far off the middle of your view
      fullDeg: 65, // at its strongest from this far off
      reachDeg: 80, // the ring's outer edge, past the Quest's field of view
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

  // The mage's plain kit (player/mage.ts, combat/bolts.ts; .scratch/abilities/spec.md, "The mage"),
  // promoted from the mage prototype's kit A. A grunt has 45 health: a full bolt deals 20, so three
  // kill one, two with a head shot; the sword deals 8 to 28 a swing, so the mage trades damage for range.
  mage: {
    bolt: {
      minDamage: 7, // a bolt let go the moment it's conjured…
      maxDamage: 20, // …and one held to full charge
      chargeTime: 0.6, // s of holding the trigger to full charge
      minHold: 0.12, // s: let go sooner and nothing is cast
      life: 2.2, // s in flight
      knockback: 1.6, // m/s shove along the bolt's travel
      exposedMultiplier: 1.5, // as the sword's
      assistRange: 18, // m: the aim assist looks this far
      homingDegPerSec: 70, // how hard a bolt bends toward what the assist locked on
    },
    // Let go mid-throw: the hand's speed (in your own space, so walking adds nothing) shapes the bolt.
    throw: {
      minSpeed: 1.2, // m/s of the hand at release: slower is a fizzle, not a cast
      fullSpeed: 4, // m/s: a throw this fast makes the tightest, fastest bolt
      slow: { speed: 7, radius: 0.2 }, // a gentle toss: a big slow orb, easy to land
      fast: { speed: 20, radius: 0.08 }, // a hard throw: a small quick bolt
      assistDeg: 15, // thrown aim is rough: bend onto an enemy this far off
    },
    // The main hand's bolt gathers at the tip of the worn weapon, this far out of the fist (m), by its
    // look; any other look is a wand's, and an empty main hand casts from the palm, as the focus hand does.
    tip: { wand: 0.32, staff: 0.75 },
    // The focus's ward on the off hand's grip is the shield to combat: each block costs this much mana
    // (a parry is free), and it won't rise with less.
    ward: { cost: 10 },
    // B / Y: `distance` m in the stick's direction (back if it's neutral) every `cooldown` s, shown on the dash's bar.
    // The way is tried every `step` m, and the blink stops short of a wall.
    blink: { distance: 3.5, cooldown: 2.2, step: 0.25 },
    haptics: {
      charge: { intensity: 0.12, ms: 20 }, // a tick every 0.1 s while charging
      full: { intensity: 0.5, ms: 40 }, // at full charge
      cast: { intensity: 0.8, ms: 60 },
      hit: { intensity: 0.5, ms: 40 },
      fizzle: { intensity: 0.2, ms: 30 },
      blink: { intensity: 0.6, ms: 60 },
    },
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
  // threat, and the minimum spacing (s) between two attacks starting. The
  // arena's; the Adventure's camps share their own pools (CONFIG.camps).
  tokens: { melee: 2, ranged: 2, meleeGap: 0.9, rangedGap: 0.6 },

  // An enemy whose walking gets it nowhere (there's no navmesh) side-steps for
  // `detour` s (enemies/enemy.ts walk()): once it has barely moved from frame
  // to frame for `time` s, or has gone under `headway` of its pace over `time` s
  // of meaning one way (every heading within `sameWay`, as a dot product, of
  // the first), as when it flip-flops against a wall met square on.
  unstick: { time: 0.8, headway: 0.3, sameWay: 0.9, detour: 1 },

  // The Adventure's camps (enemies/camps.ts): the WoW-style pull Tom picked
  // in the `?camp` prototype. You take a camp a few at a time from its edge.
  camps: {
    notice: 8, // m: an idle member fights you this close, or once you hurt it…
    pull: 10, // m: …and brings every idle member of its own camp this close to it
    leash: 30, // m from its post: it gives up, walks home untouchable and heals
    chaseSpeed: 2.2, // m/s, your walking pace: it runs when well out of reach
    home: 0.5, // m from its post counts as home
    // Walking home, one that hasn't come `progress` m nearer in `time` s is
    // stuck behind something (there's no navmesh) and is put back at its post,
    // once you're at least `away` m from it, so it doesn't vanish under your nose.
    stuck: { progress: 1, time: 3, away: 12 },
    refillTime: 180, // s after the last member falls, the camp refills whole…
    refillAway: 30, // m: …but only while you're this far from its clearing (a patrol's: its road)
    strength: 1.4, // health and damage, on top of its level
    // One pool for the player across every camp: three may swing, two shoot.
    tokens: { melee: 3, ranged: 2 },
    // A patrol (enemies/patrol.ts) walks its road in single file and pauses at
    // each end. It holds where it is while any of it lags this far behind its
    // place in the file, so nobody is left behind.
    patrol: { speed: 0.8, gap: 1.8, pause: 3, keepUp: 1.2 }, // m/s, m apart, s at each end, m
    // A family that lurks (the drowned, the bog's beasts) lies hidden where it's
    // raised, under the ground, the water or the mud, until you come this near
    // (m, a little beyond `notice`) or its camp fights; then it rises.
    lurk: { wake: 11 },
  },

  // Levels (adventureState.ts): the Adventure's character climbs from 1 to the
  // cap. Your health and damage come from your attributes (items.attribute),
  // which rise the same at every level, and an enemy of each level takes the
  // same step, so a fight against your own level plays like the arena at any
  // level. The arena is level 1 with every base ability of its class.
  levels: {
    xp: 100, // level L needs this × (L − 1) more XP than level L − 1: 100, 300, 600 and 1,000 in all to 2, 3, 4 and 5; 19,000 to 20, 78,000 to 40
    cap: 5, // the top level the content has quests and camps for; XP past it is dropped. Raised as each zone's quests come (Brackenmoor's are 5 to 12)
    most: 40, // the highest a test may raise the cap to (`&cap=`): the world's (zones/world-map.md in the project's files; the Hollow North is 32 to 40)
    grey: 5, // an enemy this many levels or more below you pays no XP
    step: 0.2, // an enemy's health and damage, times 1 + this per level above 1 (your attributes make the same step)
    killXp: 10, // a kill pays this per enemy level…
    roles: { ordinary: 1, leader: 3, deepBrute: 3, warden: 3, raised: 0 } satisfies Record<Role, number>, // …times this, by what it was
    xpFloat: { height: 1.9, time: 1.6 }, // "+N XP" floats this high over where an enemy fell, for this long (s)
    levelUp: { banner: 3.5, lines: 5 }, // s that "LEVEL N", and the lines on what it brought, stay in view
  },

  // Each class's resource and base abilities (classes.ts; .scratch/abilities/spec.md,
  // "The adventure state learns classes", and the class tickets 11 to 13). An
  // ability's `use` is how it's used: A / X, A / X while drawing, the
  // Earthshaker rule, or the gesture shape it starts in. Costs never grow with
  // level; damage is in level-1 terms and multiplies by your damage like every blow.
  classes: {
    warrior: {
      resource: 'rage',
      abilities: {
        warCry: { level: 2, use: 'button' }, // its cost and numbers are warCry's, below
        earthshaker: { level: 3, use: 'earthshaker' }, // its cost, cooldown and numbers are groundSlam's, below
        // A spectral axe flies at `speed` m/s up to `range` m to the nearest enemy within `aimDeg`° of where the right hand
        // faces as the gesture ends (or, with none there, of where you look), and in sight: `damage` and `stagger` s.
        heroicThrow: { level: 6, use: 'ring', cost: 15, cooldown: 6, damage: 20, range: 20, stagger: 1, aimDeg: 15, speed: 16 },
        // For `time` s a block takes no damage from any blow (the slam still can't be blocked) and doesn't numb the arm.
        shieldWall: { level: 8, use: 'z', cost: 25, cooldown: 30, time: 6 },
        // For `time` s every sword hit also strikes the nearest other enemy within `reach` m, for `share` of it.
        sweepingStrikes: { level: 10, use: 'v', cost: 30, cooldown: 20, time: 8, reach: 1.5, share: 0.6 },
      },
    },
    ranger: {
      resource: 'focus',
      abilities: {
        // The nocked arrow deals `multiplier` times and passes through the first enemy to hit one behind.
        powerShot: { level: 2, use: 'drawing', cost: 20, cooldown: 4, multiplier: 2, pierce: 1 },
        // A trap at your feet roots the first enemy to step on it within `lasts` s, for `root` s.
        snareTrap: { level: 3, use: 'ring', cost: 20, cooldown: 10, lasts: 30, root: 4 },
        // The next arrow splits into `arrows` in a `fanDeg`° fan (level, across where it flies), each at `share`.
        volley: { level: 6, use: 'z', cost: 35, cooldown: 12, arrows: 5, fanDeg: 20, share: 0.6 },
        // A gust knocks back and staggers every enemy within `radius` m (of its body) in the `arcDeg`° in front
        // of you (where you look). `knockback` m/s slides a grunt about an eighth of it in metres (1.5 m); a brute
        // slides a third as far and the Warden a sixth, as any push (Enemy.knockbackScale). The Warden isn't staggered.
        scatter: { level: 8, use: 'v', cost: 25, cooldown: 15, radius: 3, arcDeg: 90, knockback: 12, stagger: 1.2 },
        // The enemy you face (within `aimDeg`° of where the right hand faces, else where you look; in sight and
        // within `range` m) is marked for `time` s: it takes `bonus` more from you and its outline shows through walls.
        huntersMark: { level: 10, use: 's', cost: 20, cooldown: 1, time: 20, bonus: 0.15, aimDeg: 15, range: 30 },
      },
    },
    mage: {
      resource: 'mana',
      abilities: {
        // Every enemy within `radius` m takes `damage` and is frozen for `freeze` s, or until a hit breaks it.
        frostNova: { level: 2, use: 'button', cost: 30, cooldown: 20, radius: 3, freeze: 4, damage: 5 },
        // The next bolt deals `multiplier` times and bursts for `burst` on every other enemy within `radius` m.
        fireball: { level: 3, use: 'ring', cost: 15, cooldown: 0, multiplier: 1.5, burst: 10, radius: 2 },
        // The next bolt slows the enemy it hits by `slow` for `time` s.
        frostbolt: { level: 6, use: 'z', cost: 15, cooldown: 0, slow: 0.4, time: 5 },
        // The next bolt arcs on to `jumps` more enemies within `reach` m, at `share` each.
        chainLightning: { level: 8, use: 'v', cost: 30, cooldown: 8, jumps: 2, reach: 4, share: 0.7 },
        // Ice falls for `time` s over a `radius` m circle where you point: `damage` every `every` s and a `slow` slow,
        // which lingers `linger` s after the last tick that caught it. The circle centres on the nearest enemy within
        // `aimDeg`° of where the right hand faces and `range` m, or else where the hand's line meets the floor (at most `range` m off).
        blizzard: { level: 10, use: 's', cost: 40, cooldown: 30, time: 5, radius: 4, damage: 6, every: 0.5, slow: 0.5, linger: 1, aimDeg: 15, range: 15 },
      },
    },
  },

  // Talents (talents.ts; .scratch/abilities/issues/10-talent-tree-rules.md, and the class tickets 11 to 13):
  // a point every level from `from`, spent in either of your class's two trees out of a fight. A tier
  // opens once `tier` points are spent in its tree for each tier above it (tier 2 at 3, tier 3 at 6).
  // Each talent has its tier, the most points it takes, and either what each point `adds` to your
  // numbers or, with a `use`, the ability it grants (its cost, cooldown and numbers beside it). What
  // a point adds: `cost:<ability>` to that ability's cost, `lasts:<ability>` to how long it lasts (s),
  // and the rest to the number Combat reads by that name (0 without talents). Tiers 4 and 5 are
  // sketched in the class tickets and not built.
  talents: {
    from: 2,
    tier: 3,
    trees: {
      warrior: {
        // Arms: the sword, offence.
        arms: {
          deepCuts: { tier: 1, max: 3, adds: { headHit: 0.1 } }, // a head hit deals this much more
          bloodRage: { tier: 1, max: 2, adds: { hitRage: 2 } }, // rage a sword hit builds, on top of rage.perHit
          tactician: { tier: 2, max: 2, adds: { 'cost:warCry': -10 } },
          heavySwing: { tier: 2, max: 3, adds: { fullSwing: 0.05 } }, // a swing at full damage speed deals this much more
          // Your next sword hit within `window` s deals `multiplier` times, and the enemy can't heal for `noHeal` s, walking home included.
          mortalStrike: { tier: 3, max: 1, use: 'triangle', cost: 30, cooldown: 8, window: 3, multiplier: 2, noHeal: 10 },
          sweepingMastery: { tier: 3, max: 2, adds: { 'lasts:sweepingStrikes': 2 } },
        },
        // Protection: the shield, holding a crowd.
        protection: {
          toughness: { tier: 1, max: 3, adds: { health: 0.05 } }, // of your maximum health
          shieldSpikes: { tier: 1, max: 2, adds: { bashDamage: 5, bashRage: 4 } }, // on top of shield.bashDamage and rage.perBash
          quickGuard: { tier: 2, max: 2, adds: { parry: 0.25 } }, // the parry comes this much easier: its speed divided by 1 + this
          ironArm: { tier: 2, max: 3, adds: { numbLess: 1 / 3 } }, // a blocked heavy blow numbs the arm this much less
          // Your next shield bash within `window` s stuns for `stun` s and exposes for as long, even a brute (not the Warden).
          shieldSlam: { tier: 3, max: 1, use: 'triangle', cost: 20, cooldown: 10, window: 3, stun: 3 },
          unbreakable: { tier: 3, max: 2, adds: { 'lasts:shieldWall': 2 } },
        },
      },
      ranger: {
        // Marksmanship: the bow, damage at range.
        marksmanship: {
          steadyAim: { tier: 1, max: 3, adds: { arrowDamage: 0.05 } }, // an arrow deals this much more
          keenEye: { tier: 1, max: 2, adds: { headMultiplier: 0.2 } }, // added to a head hit's multiplier
          efficiency: { tier: 2, max: 2, adds: { 'cost:powerShot': -5 } },
          swiftArrows: { tier: 2, max: 3, adds: { arrowSpeed: 0.1 } }, // an arrow flies this much faster (so drops less)
          // For `time` s every arrow you loose bends, at up to `bendDegPerSec`°/s, onto the enemy within `aimDeg`° of
          // its flight (in sight, within `range` m), and passes a raised guard.
          trueshot: { tier: 3, max: 1, use: 'triangle', cost: 30, cooldown: 20, time: 8, aimDeg: 8, bendDegPerSec: 60, range: 40 },
          improvedVolley: { tier: 3, max: 2, adds: { volleyArrows: 1 } }, // more arrows in a Volley's fan
        },
        // Survival: traps, and staying alive up close.
        survival: {
          trapper: { tier: 1, max: 3, adds: { trapRoot: 1 } }, // s more Snare Trap roots for
          fleetFoot: { tier: 1, max: 2, adds: { dashSooner: 0.3 } }, // s off the dash's cooldown
          serratedTips: { tier: 2, max: 3, adds: { bleed: 2 }, time: 4 }, // an arrow hit bleeds the enemy for this over `time` s
          steadyWard: { tier: 2, max: 2, adds: { wardLonger: 0.3 } }, // s more the ward holds, and sends arrows back for
          // A trap at your feet, lying `lasts` s: the first enemy to step on it sets it off, and every enemy within
          // `radius` m takes `damage` and is knocked back at `knockback` m/s (a grunt slides about an eighth of it in metres).
          explosiveTrap: { tier: 3, max: 1, use: 'triangle', cost: 30, cooldown: 15, lasts: 30, damage: 25, radius: 2.5, knockback: 10 },
          improvedScatter: { tier: 3, max: 2, adds: { scatterSlow: 0.3 }, time: 4 }, // Scatter also slows by this for `time` s
        },
      },
      mage: {
        // Fire: damage.
        fire: {
          ignite: { tier: 1, max: 3, adds: { ignite: 0.1 }, time: 4 }, // a fire hit burns for this share of it over `time` s
          incineration: { tier: 1, max: 2, adds: { chargeFaster: 0.1 } }, // s off a bolt's charge time (mage.bolt.chargeTime)
          improvedFireball: { tier: 2, max: 2, adds: { fireballRadius: 0.5 } }, // m more a Fireball's burst reaches
          criticalMass: { tier: 2, max: 3, adds: { headMultiplier: 0.1 } }, // added to a head hit's multiplier
          // The next bolt takes `charge` s to charge full, and leaves as a huge slow orb (`radius` m, `speed` m/s)
          // whatever the throw: `damage` at full charge (a lesser charge less, as a bolt's), and the enemy it hits
          // burns for `burn` over `burnTime` s.
          pyroblast: { tier: 3, max: 1, use: 'triangle', cost: 35, cooldown: 12, charge: 1.2, radius: 0.3, speed: 6, damage: 60, burn: 15, burnTime: 4 },
          masterOfElements: { tier: 3, max: 2, adds: { fireHeadMana: 5 } }, // mana back for a fire head hit
        },
        // Frost: control.
        frost: {
          frostbite: { tier: 1, max: 3, adds: { frostbite: 0.05 }, freeze: 2 }, // the chance a Frostbolt freezes a slowed enemy for `freeze` s
          iceShards: { tier: 1, max: 2, adds: { frostDamage: 0.1 } }, // a Frostbolt deals this much more
          permafrost: { tier: 2, max: 2, adds: { slowLonger: 1, slowStronger: 0.1 } }, // your slows last s longer and are this much stronger
          arcticReach: { tier: 2, max: 3, adds: { frostReach: 0.3 } }, // m more Frost Nova and Blizzard reach
          // A shell of ice takes the next `absorb` damage (times your level's step) within `time` s.
          iceBarrier: { tier: 3, max: 1, use: 'triangle', cost: 30, cooldown: 25, absorb: 40, time: 10 },
          frozenWard: { tier: 3, max: 2, adds: { wardSlow: 0.2 }, time: 3 }, // a blow the ward stops slows its attacker by this for `time` s
        },
      },
    },
  },

  // Each class's resource: a bar plain attacks never spend (classes.ts). None of it is saved:
  // after death or loading you have no rage and full focus and mana.
  resources: {
    // Rage starts empty; its size and drain are player.maxRage and player.rageDecayPerSec, and what builds it is `rage`, below.
    rage: { start: 0 },
    // Focus starts full and refills this much a second, in a fight or out.
    focus: { size: 100, start: 1, refill: 10 },
    // Mana starts full; the pool is `size` plus `perIntellect` for every point of Intellect over `from`, and
    // refills `fighting` a second while anything fights you and `calm` once nothing does.
    mana: { size: 100, perIntellect: 2, from: 10, start: 1, refill: { fighting: 2, calm: 30 } },
  },

  // The ranger's plain kit (player/bow.ts, combat/ranger.ts; .scratch/abilities/spec.md, "The ranger"),
  // promoted from the prototype's kept variant (issues/05): the bow in the left hand, drawn with the right.
  ranger: {
    // The bow, in metres: grip to each limb's tip, how far behind the grip the string sits at rest, the pull
    // from the arrow rest to the nock at full draw, the rest over the fist, how near the string the draw hand
    // nocks (its middle half), and the least draw that looses an arrow (less puts it away).
    bow: { limb: 0.66, brace: 0.16, fullDraw: 0.62, rest: 0.05, nockReach: 0.13, minDraw: 0.15 },
    // An arrow's damage (level-1 terms, times your damage) and speed rise in step with the draw, from the least
    // to full; it falls under `gravity`, lives `life` s in flight and `stick` s stuck in a wall or the ground.
    // A head hit takes the enemy's own multiplier, an exposed one the sword's; a raised guard stops it.
    arrow: { minDamage: 6, maxDamage: 30, minSpeed: 14, maxSpeed: 42, gravity: 9.8, life: 3, stick: 4, radius: 0.03 },
    // Squeeze the bow hand's grip: a disc `radius` m across, `reach` m past the bow hand, up while held for at most
    // `hold` s, back `cooldown` s after it drops. It stops enemy arrows, and sends them back in its first
    // `reflect` s (the warrior's reflect); `margin` m of slack round its rim. It doesn't stop blows.
    ward: { radius: 0.3, reach: 0.16, hold: 1.2, cooldown: 2, reflect: 0.35, margin: 0.05, squeeze: 0.6 },
    // Nock with the trigger past `nock`, loose under `loose`. Haptics: a tick every `tick` s through the draw,
    // growing with the bend in both hands, a click at full draw and a sharp pulse on release.
    trigger: { nock: 0.5, loose: 0.3 },
    haptics: { tick: 0.05, nock: 0.5, full: 0.9, release: { draw: 1, bow: 0.6 } },
    // Snare Trap's trap: `radius` m across on the ground, sprung by an enemy whose body reaches over it; at
    // most `alive` lie about at once (another ends the oldest).
    trap: { radius: 0.35, alive: 3 },
  },

  // Abilities by gesture (player/gestures/; .scratch/abilities/spec.md, "Gestures"): hold the right
  // grip, draw a shape, let go. The stroke is read once, on release, against each shape's templates.
  gestures: {
    // The grip arms past `down` and lets go under `up`; a stroke held longer than `maxDuration` s is dropped.
    arm: { down: 0.8, up: 0.5, maxDuration: 1.6 },
    // A stroke is read as a shape scoring at most `threshold` (lower is closer), unless the runner-up
    // scores under `margin` times the winner's (too close to call); shorter than `minLength` m reads as nothing.
    read: { threshold: 0.3, margin: 1.2, minLength: 0.3 },
    // Where a grip belongs to something else and never arms, from the eyes (x right, y up, z forward; m):
    // the bag over either shoulder, a potion at either hip, and the tool loop behind the right hip.
    taken: [
      { name: 'the bag', at: [0.2, -0.14, -0.12], radius: 0.18 },
      { name: 'the bag', at: [-0.2, -0.14, -0.12], radius: 0.18 },
      { name: 'a potion', at: [0.19, -0.7, 0.04], radius: 0.12 },
      { name: 'a potion', at: [-0.19, -0.7, 0.04], radius: 0.12 },
      { name: 'the tool loop', at: [0.19, -0.7, -0.16], radius: 0.12 }, // as the belt's frame hangs it (professions.toolLoop)
    ],
    // In the right hand: a tick as the grip arms, a strong buzz on a read, two ticks `gap` ms apart on a miss,
    // and a dull buzz when it can't be paid for or isn't ready.
    buzz: {
      armed: { intensity: 0.25, ms: 20 },
      read: { intensity: 0.9, ms: 80 },
      miss: { intensity: 0.3, ms: 30, gap: 90 },
      dull: { intensity: 0.15, ms: 60 },
    },
    trail: { opacity: 0.6, fade: 0.5 }, // the faint line behind the hand while you draw, and s it takes to fade once read
    // A gesture not yet drawn hangs `ahead` m in front of you at `drop` m below the eyes, `size` m across,
    // until you've drawn it once; it turns with you once you look `follow` rad away.
    hint: { ahead: 1, drop: 0.35, size: 0.4, opacity: 0.35, follow: 0.6 },
  },

  // Marshal Hale's quest chain (quests.ts): what each quest asks and pays.
  // Hale's lines name the farm's count ("three"): change them with it.
  quests: {
    raiders: { bandits: 3, xp: 80 }, // Raiders in the Fields: defeat this many of the farm's camp
    lumber: { bandits: 5, xp: 120 }, // The Lumber Camp: this many of the lumber camp's camp, and the leader's orders
    below: { xp: 300 }, // What Lies Below: the Warden, for this and Hale's old longsword
    // The trainers' intro quests, open once Raiders in the Fields is handed in: each pays XP as a
    // level-2 quest (The Lumber Camp's) and a few coins, and what you made for it stays yours.
    trainers: {
      xp: 120,
      coins: 5,
      oreAndFire: { veins: 2 }, // the smith's: break this many copper veins, then make a whetstone at the anvil
      leavesForThePot: { clumps: 2 }, // the herbalist's: cut this many clumps of Hearthleaf (2 leaves each), then brew a minor healing potion
    },
  },

  // Items and their numbers (items.ts). No item's numbers are hand-tuned: its
  // item level and rarity give them by this one rule
  // (.scratch/inventory/spec.md, "The item catalogue and the rule").
  items: {
    // How far each kind stacks in one slot: gear and quest items never do.
    stack: { consumable: 10, material: 20, junk: 10 },
    // Every number a piece carries is times this, by its rarity: a green set of your level
    // cuts about 15% of the damage you take where a white set cuts 10%, and a blue is 1.5 times a green.
    rarity: { grey: 0, white: 1, green: 1.6, blue: 2.4 } satisfies Record<Rarity, number>,
    // A white weapon's damage rating per item level, added to your damage multiplier:
    // Hale's old longsword, a blue of item level 5, adds 0.2 (one level's step, as it always has).
    weapon: 0.2 / (5 * 2.4),
    // A white set's armour per item level, shared over the pieces by `share`.
    armour: 30,
    // Armour cuts damage taken by armour / (armour + this × the attacker's level): a set of your level
    // cuts the same share at any level (white 10%, green 15%, blue 21%).
    armourVsLevel: 270,
    // A green set of your level adds this share of the level's own attributes (the Abilities map's
    // budget, about 8 Stamina and 8 of the main attribute by level 10); a white carries none.
    attributes: 1 / 3,
    // Each armour slot's share of a set's armour and attributes. A weapon carries only its damage rating.
    share: { offHand: 0.15, head: 0.15, chest: 0.25, hands: 0.125, legs: 0.2, feet: 0.125 } satisfies Record<Exclude<GearSlot, 'mainHand'>, number>,
    // The attributes the Abilities map sets: a level-1 character's own Stamina and main attribute, what
    // each level adds to both, and what a point is worth: Stamina in health, the main attribute in damage
    // (a share of level 1's). Levels and gear add up through this one rule.
    attribute: { atLevel1: 10, perLevel: 2, health: 10, damage: 0.1 },
    // Coins a vendor pays per item level, by rarity; consumables and materials have their own price.
    sell: { grey: 2, white: 3, green: 8, blue: 20 } satisfies Record<Rarity, number>,
    buy: 4, // a vendor sells at this many times what they'd pay
    minorHealingPotion: { price: 2, heal: 0.4 }, // coins, and the share of your maximum health it heals
  },

  // The bag, the stash and the sold row (inventory.ts).
  bag: {
    slots: 16,
    stash: 32, // slots, in two pages of 16, the same from every inn
    buyback: 6, // the last things sold, bought back at the price you got until you leave the zone
    // Reaching over a shoulder for the bag (ui/bag/reach.ts): a sphere over each shoulder, placed from
    // the headset's position and facing (not its tilt). The grip must go down with the hand already
    // inside it, moving slower than the gate, so an overhead swing never opens it.
    reach: {
      side: 0.2, // m out to the side of the eyes…
      down: 0.14, // …below them…
      back: 0.12, // …and behind them, the sphere's centre
      radius: 0.18, // m
      speedGate: 1.5, // m/s the hand must be under as the grip goes down
      speedLag: 0.03, // s the measured hand speed takes to follow the hand
      zoneBuzz: { intensity: 0.15, ms: 25, every: 0.2 }, // while a slow hand is in the zone
      openPulse: { intensity: 0.9, ms: 90 },
      closePulse: { intensity: 0.5, ms: 60 },
    },
    grip: { on: 0.6, off: 0.4 }, // the grip counts as squeezed past `on`, and let go under `off`
    // The panel (ui/bag/panel.ts): placed once in front of you, turned to face you.
    panel: {
      out: 0.45, // m in front of the eyes…
      down: 0.28, // …and below them
      turn: 60, // ° turned away from it before it comes round in front again
      walkAway: 1.5, // m walked from it (on the floor) and it closes
      slot: 0.06, // m square
      pitch: 0.072, // m between slots' centres
    },
    // Touching a slot with a fist or the weapon's tip: round its face, in front of it and behind it (m).
    touch: { margin: 0.006, front: 0.035, back: 0.07 },
    // Letting a carried item go: anywhere near the panel's face, and within `near` of a slot's centre counts (m).
    release: { margin: 0.006, front: 0.12, back: 0.1, near: 0.05 },
    // The tabs along the panel's top, pressed like the talk board's buttons (s before a press counts).
    tabs: { arming: 0.4, rearm: 0.3 },
    buzz: {
      touch: { intensity: 0.25, ms: 20 }, // a fist or the tip arriving on an item
      pick: { intensity: 0.6, ms: 40 }, // the grip taking it
      place: { intensity: 0.8, ms: 50 }, // let go where it went
      refused: { intensity: 1, ms: 120 }, // let go where it can't go
      tab: { intensity: 0.5, ms: 40 },
      takeBack: { intensity: 0.8, ms: 70 }, // a dropped item taken back off the ground
    },
    // What you drop off the panel lies on the ground (world/dropped.ts), as loot does: not saved.
    dropped: {
      most: 12, // lying at once: past that the oldest goes
      lasts: 300, // s
      take: 0.25, // m from a hand to take it back, the orb's pickup radius
      settle: 0.6, // s after it's let go before a hand can take it back
    },
    // The stash panel (ui/bag/stashPanel.ts): opened with the bag's by touching the stash chest's lid,
    // on the bag panel's left, turned in towards you. It closes with the bag's.
    stashPanel: {
      gap: 0.03, // m between its edge and the bag panel's
      turn: 25, // ° turned in towards you
    },
    // The stash's chest by the inn's hearth (world/stashChest.ts).
    stashChest: {
      touch: 0.05, // m round its lid a fist or the weapon's tip counts as touching it
      lid: 105, // ° its lid swings up while the stash is open…
      swing: 0.35, // …over this many s
      buzz: { intensity: 0.6, ms: 50 }, // the lid touched
    },
  },

  // The smith's and the innkeeper's wares (vendors.ts, ui/wares/)
  // (.scratch/inventory/issues/06-vendors-and-the-stash.md, 14-vendors.md).
  vendors: {
    // The smith's white stock: each class's weapon and off hand at these item levels, and armour for every slot at these.
    smith: { hands: [1, 3, 5], armour: [2, 4] },
    // The wares board stands where Hale's talk board would, opening as `talk` says when: m from the
    // vendor towards you, to your right, and its middle's height. The bag panel opens pinned on its
    // right, the board hanging on the bag's left and turned in, as the stash's does.
    board: { out: 0.6, side: 0.55, height: 1.35 },
    // "Sell junk" is pressed like the talk board's buttons: m round its face, in front of it and behind
    // it that still touch it, and s after the board unfolds, and after a press, before it takes one.
    button: { margin: 0.025, front: 0.03, back: 0.08 },
    arming: 0.4,
    rearm: 0.6,
    buzz: {
      trade: { intensity: 0.8, ms: 60 }, // bought or sold
      button: { intensity: 0.8, ms: 50 },
      nothing: { intensity: 0.3, ms: 30 }, // "Sell junk" with no junk in the bag
    },
  },

  // The belt at your hips (inventory.ts, player/belt.ts), promoted from the belt prototype's variant (a):
  // the weapon in the hand that takes a flask fades out until the flask is drunk or put back.
  belt: {
    slots: 2, // the left hip's, then the right's
    cooldown: 60, // s every potion on the belt dims for after you drink any of them
    // Where the belt hangs (player/beltZones.ts): from a neck point below and behind the eyes, so looking
    // down doesn't move it, turning with you only once you've looked `yawDeadzone` (rad) away.
    neck: { below: 0.1, behind: 0.08 }, // m
    hip: { down: 0.6, side: 0.19, ahead: 0.12 }, // m from the neck to each hip slot
    yawDeadzone: 0.5, // rad, about 30°
    near: 0.12, // m: a hand this close to a slot makes it glow and tick, and its grip takes the flask
    mouth: { below: 0.13, ahead: 0.1 }, // m from the eyes, turning and nodding with your head
    mouthRadius: 0.15, // m: hold the flask this close to the mouth…
    drinkTime: 0.7, // s …for this long to drink it…
    maxHandSpeed: 1.0, // m/s …with the hand no faster than this: faster, the drink waits rather than cancels
    fade: 0.15, // s the weapon takes to fade out of the hand, and back in
    buzz: {
      tick: { intensity: 0.3, ms: 20 }, // a hand arriving at a flask
      take: { intensity: 0.5, ms: 40 },
      drink: { intensity: 0.15, ms: 100, every: 0.09 }, // steady, while at the mouth
      gulp: { intensity: 0.9, ms: 120 },
    },
  },

  // What a kill drops (loot.ts) and how it lies on the ground (world/drops.ts)
  // (.scratch/inventory/issues/05-loot.md). Loot's item level is the enemy's.
  loot: {
    // By what the enemy was: coins are `coins` × level × the role's `coins` (a whole number, evenly),
    // junk drops at `junk`, and one piece of gear at most, of a rarity by `gear`'s chances; a boss
    // drops every rarity in `every` instead. What the Warden raises drops nothing.
    coins: [1, 4], // so the plain route pays about 330 before spending (inventory ticket 17: 1 to 3 paid about 275)
    roles: {
      ordinary: { coins: 1, junk: 0.4, gear: { white: 0.08, green: 0.03 }, every: [] },
      leader: { coins: 3, junk: 0.6, gear: { green: 0.75, blue: 0.25 }, every: [] },
      deepBrute: { coins: 3, junk: 0.6, gear: { green: 0.75, blue: 0.25 }, every: [] },
      warden: { coins: 10, junk: 0, gear: {}, every: ['blue', 'green'] },
      raised: { coins: 0, junk: 0, gear: {}, every: [] },
    } satisfies Record<Role, { coins: number; junk: number; gear: Partial<Record<Rarity, number>>; every: Rarity[] }>,
    // What a chest holds (.scratch/inventory/issues/13-oakvales-chests.md): `coins` × its level,
    // and one piece of gear of your class at its level, of a rarity by `gear`'s chances.
    chest: { coins: 5, gear: { green: 0.8, blue: 0.2 } satisfies Partial<Record<Rarity, number>> },
    levels: 40, // loot's items come at item levels 1 to this; an enemy above it drops this level's
    lifetime: 300, // s a drop lies, through your death too
    most: 12, // drops lying at once: past this the oldest goes
    ring: 0.4, // m from the pouch its items lie, round it
    hover: 0.3, // m over the ground each item turns, slowly
    spin: 0.8, // rad/s
    size: 0.3, // m: an item's model, about this big
    rim: 0.9, // how brightly a rarity's colour glows round each model's edge
    beam: { height: 2, radius: 0.025, opacity: 0.55 }, // green and blue items' unlit, additive beams
    full: { flash: 1.6, rate: 6, float: 1.2 }, // s a full bag flashes an item red, flashes per s, s "Bag full" floats
    buzz: { take: { intensity: 0.8, ms: 70 }, full: { intensity: 1, ms: 160 } }, // in the hand that touched it
  },

  // Chests in a zone (world/chests.ts; .scratch/inventory/issues/13-oakvales-chests.md): a
  // touch of a shut chest's lid opens it for good, with a creak and a buzz in that hand, and
  // what's inside comes out on the ground beside it as a kill's loot does (loot.chest).
  chests: {
    reach: 0.12, // m round its lid a fist or the sword's tip opens it from
    open: { seconds: 0.6, angle: 1.35 }, // the lid swings back this far (rad), over this long
    buzz: { intensity: 0.7, ms: 120 }, // in the hand that opened it
    // Each look's size (m): width, depth, the body's height and the lid's thickness.
    looks: {
      chest: { w: 0.62, d: 0.42, h: 0.34, lid: 0.1 },
      strongbox: { w: 1.0, d: 0.65, h: 0.5, lid: 0.06 },
    },
  },

  // Professions (professions/professions.ts; .scratch/professions/spec.md): the
  // grades, the kinds of gathering spot, the Apprentice recipes and the numbers
  // of what they make. Proficiency climbs by `gain` for each spot emptied and
  // each thing made, up to its grade's cap. A later zone adds rows.
  professions: {
    // Each grade's proficiency cap, in order. Oakvale's trainers teach only Apprentice.
    grades: { apprentice: 25, journeyman: 50, expert: 75, artisan: 100 } satisfies Record<Grade, number>,
    // What emptying one spot of each kind puts in the bag. It refills `refill.after` s
    // after it's taken, once you're `refill.away` m from it.
    spots: {
      copperVein: { profession: 'mining', grade: 'apprentice', needs: 0, gives: { 'copper-ore': 3, 'rough-stone': 1 }, gain: 1, refill: { after: 180, away: 30 } },
      hearthleaf: { profession: 'herbalism', grade: 'apprentice', needs: 0, gives: { hearthleaf: 2 }, gain: 1, refill: { after: 180, away: 30 } },
      duskcap: { profession: 'herbalism', grade: 'apprentice', needs: 0, gives: { duskcap: 2 }, gain: 1, refill: { after: 180, away: 30 } },
    } satisfies Record<string, SpotKindRow>,
    // What each recipe takes and makes, the proficiency it needs and pays, and the
    // trainer's price in coins (null: taught with the profession). Recipes sharing a
    // `lesson` are bought together, once: one price teaches every version of the gauntlets.
    recipes: {
      'copper-bar': { profession: 'smithing', station: 'anvil', grade: 'apprentice', takes: { 'copper-ore': 2 }, makes: 'copper-bar', needs: 0, gain: 1, price: null },
      whetstone: { profession: 'smithing', station: 'anvil', grade: 'apprentice', takes: { 'rough-stone': 1 }, makes: 'whetstone', needs: 0, gain: 1, price: null },
      'copper-gauntlets-of-strength': { profession: 'smithing', station: 'anvil', grade: 'apprentice', takes: { 'copper-bar': 4 }, makes: 'copper-gauntlets-of-strength', needs: 15, gain: 3, price: 25, lesson: 'copper-gauntlets' },
      'copper-gauntlets-of-agility': { profession: 'smithing', station: 'anvil', grade: 'apprentice', takes: { 'copper-bar': 4 }, makes: 'copper-gauntlets-of-agility', needs: 15, gain: 3, price: 25, lesson: 'copper-gauntlets' },
      'copper-gauntlets-of-intellect': { profession: 'smithing', station: 'anvil', grade: 'apprentice', takes: { 'copper-bar': 4 }, makes: 'copper-gauntlets-of-intellect', needs: 15, gain: 3, price: 25, lesson: 'copper-gauntlets' },
      'minor-healing-potion': { profession: 'alchemy', station: 'bench', grade: 'apprentice', takes: { hearthleaf: 2 }, makes: 'minor-healing-potion', needs: 0, gain: 1, price: null },
      'rage-draught': { profession: 'alchemy', station: 'bench', grade: 'apprentice', takes: { duskcap: 2 }, makes: 'rage-draught', needs: 3, gain: 1, price: 10 },
      'minor-mana-potion': { profession: 'alchemy', station: 'bench', grade: 'apprentice', takes: { hearthleaf: 1, duskcap: 1 }, makes: 'minor-mana-potion', needs: 3, gain: 1, price: 10 },
      'elixir-of-the-keen-eye': { profession: 'alchemy', station: 'bench', grade: 'apprentice', takes: { hearthleaf: 2, duskcap: 1 }, makes: 'elixir-of-the-keen-eye', needs: 10, gain: 1, price: 10 },
    } satisfies Record<string, RecipeRow>,
    // Oakvale's materials and what the recipes make (items.ts). Materials and
    // consumables sell for a fixed price in coins; the gauntlets by the gear rule.
    items: {
      copperOre: { price: 1 },
      roughStone: { price: 1 },
      copperBar: { price: 3 },
      hearthleaf: { price: 1 },
      duskcap: { price: 1 },
      rageDraught: { price: 3, rage: 30 }, // a potion, on the belt's shared cooldown
      minorManaPotion: { price: 3, mana: 0.4 }, // the share of your maximum mana; does nothing until the mage has mana
      // Buffs: not potions, so off the cooldown; one of each kind on you at a time, a new one replacing the old.
      elixirOfTheKeenEye: { price: 4, damage: 0.1, seconds: 5 * 60 }, // your damage 10% more while it lasts (buffs together add up: 15% with the whetstone)
      whetstone: { price: 2, damage: 0.05, seconds: 10 * 60 }, // 5% more; rubbed along the blade or the bow (professions/sharpen.ts); never on the belt
      copperGauntlets: { level: 5, rarity: 'green' }, // as good as a green drop at level 5, each version with Stamina
    },
    // Sharpening (professions/sharpen.ts): the whetstone carried from the bag, rubbed along the blade in the
    // other hand (the ranger's bow, for the arrowheads). Within `reach` m of the edge it scrapes; `travel` m
    // along the edge in all, back and forth, sharpens it, with a scrape's buzz every `stroke` m.
    sharpen: { reach: 0.06, travel: 0.5, stroke: 0.12, buzz: { scrape: { intensity: 0.35, ms: 25 }, done: { intensity: 0.8, ms: 60 } } },
    // The tool loop behind the main-hand hip (professions/gathering/; spec, "Gathering spots and the
    // tool loop"): a sphere `radius` m round a point `behind` m behind the right hip's potion slot, hung
    // from the belt's frame. A grip in it, the hand under `maxSpeed` m/s, draws the tool for the nearest
    // spot within `draw` m, or puts the tool back; walking `putAway` m from every spot puts it back too.
    // It does nothing while anything fights you, and a pull puts the tool away at once with `pulled`.
    toolLoop: {
      behind: 0.2,
      radius: 0.12,
      maxSpeed: 1.5,
      draw: 3,
      putAway: 5,
      buzz: {
        tick: { intensity: 0.25, ms: 15 }, // the hand arrives where the loop would give or take
        draw: { intensity: 0.5, ms: 30 },
        putAway: { intensity: 0.3, ms: 30 },
        nothing: { intensity: 0.15, ms: 20 }, // a grip there with nothing near to gather
        pulled: { intensity: 1, ms: 120 }, // a pull put the tool away
      },
    },
    // The pick (professions/gathering/pick.ts), promoted from ?proto=pick variant C. The head's two
    // points are `reach` m down the handle and `spike` m either side of it. A strike counts on the
    // sword's committed swing: `travel` m of hand travel one way at `handSpeed` m/s, with the head's
    // point over `minSpeed` m/s (the sword's tip wants 2.8 a metre out; the pick's head is half as far),
    // and full power at `fullSpeed`. Slower is a tap.
    pick: { reach: 0.5, spike: 0.17, travel: 0.2, handSpeed: 1, minSpeed: 2.5, fullSpeed: 4.5 },
    // A copper vein (professions/gathering/veins.ts): a strike in the glint is worth `glint`, one
    // elsewhere on the ore `plain`, and it breaks at `need` (2 glints or 5 plain), cracking at a third
    // and two thirds. The rock is struck as a sphere of `rockRadius` round a centre `centreHeight` over
    // its foot (a little inside the drawn `drawnRadius`, so the head seems to bite); the ore faces its
    // yaw, `oreLift` up, and reaches `oreRadius` from its middle, the glint `glintRadius`. You bump into
    // it as a circle of `body`. What it gives comes loose for `flight` s, then flies to the bag.
    vein: {
      need: 4.5,
      glint: 2.25,
      plain: 1,
      glintRadius: 0.1,
      oreRadius: 0.28,
      rockRadius: 0.74,
      drawnRadius: 0.8,
      centreHeight: 0.62,
      oreLift: 0.55,
      body: 0.85,
      flight: 0.35,
    },
    // The herb knife (professions/gathering/knife.ts), promoted from ?proto=pick variant C: a blade
    // from `bladeStart` to `bladeEnd` m out of the fist. A cut counts on a lighter gate than the pick's:
    // `travel` m of hand travel one way at `handSpeed` m/s, with the tip over `minSpeed` m/s. Slower
    // only brushes the leaves.
    knife: { bladeStart: 0.1, bladeEnd: 0.3, travel: 0.1, handSpeed: 0.6, minSpeed: 1.4 },
    // A clump of Hearthleaf or Duskcap (professions/gathering/clumps.ts) on its bank or stump `rise` m
    // high, so nobody kneels. A cut through its stems, within `stemRadius` m of its middle and under
    // `stemTop` m over its foot, takes it; one through its leaves (or caps), within `leafRadius` and up to
    // `leafTop`, trims one and says "cut lower", down to `leavesLeft`. You bump into its rise as a circle
    // of `body`. What it gives comes loose for `flight` s, then flies to the bag. Taken, its stems stand
    // `stub` m high until it refills, growing back over `grow` s.
    clump: {
      rise: 0.45,
      stemTop: 0.1,
      stemRadius: 0.1,
      leafTop: 0.34,
      leafRadius: 0.17,
      leavesLeft: 3,
      body: 0.42,
      flight: 0.25,
      stub: 0.025,
      grow: 0.6,
      clear: { plant: 1.2, tree: 2.2 }, // nothing grows this near one (a tree this near)
    },
    // One rule for hands at a station: step within `near` m of it, looking within `facing` rad of
    // it and out of a fight, and both hands become the station's; past `far` m they're yours again.
    station: { near: 1.3, far: 2, facing: Math.PI / 3 },
    // The smith's anvil (professions/anvil/), promoted from ?proto=anvil variant A.
    anvil: {
      tapSpeed: 1.2, // m/s the hammer's face comes down under which a strike is only a tap…
      greatSpeed: 2.2, // …and from which it's great, working a mark at once (a good one works it halfway)
      minTravel: 0.08, // m the face must come down onto the work for a strike to count
      rearm: 0.04, // m it must lift off again before the next strike
      markReach: 0.04, // m from a mark a strike must land to work it
      heatUp: 1.5, // s in the fire from cold to full heat…
      coolDown: 14, // …and out of it from full heat to cold: over `workingHeat` for about 10 s
      workingHeat: 0.3, // hot enough to work (0 cold to 1 fresh from the fire)
      smelt: 3, // s two ore take in the crucible to become a bar
      flight: 0.35, // s what's made takes to fly to your bag…
      settle: { made: 0.5, smelted: 0.9 }, // …after resting this long in the tongs or on the anvil, or on the mould
      retry: 1, // s between tries to bag a thing left waiting on the anvil with the bag full
      tongs: { grab: 0.6, release: 0.35, reach: 0.15 }, // squeeze to close the tongs and to let go; m from a piece they take it
    },
  },

  // The alchemy bench in the house by the well (professions/bench/), promoted
  // from `?proto=brew` variant B: you drop the herbs, grind and stir; the bench
  // tips the mortar and pours the pot. Its herbalist stands at its end.
  alchemyBench: {
    // Stepping up to it and away is the stations' one rule for hands (CONFIG.professions.station), measured from its front.
    reach: 0.02, // m past a thing's own size a hand takes it from
    back: 0.25, // s a thing you let go glides back to its place
    drop: 0.1, // m from the mortar's mouth, over the floor, that a herb let go drops in
    turns: { grind: 3, stir: 3 }, // full turns of the pestle, and of the spoon
    pound: { fall: 0.6, share: 1 / 3 }, // m/s down onto the mortar's floor that counts as a pound, and the share of a turn it's worth
    tip: 1.2, // s the bench takes to tip the mortar into the pot
    pour: 2, // s it takes to pour the pot into the flask and cork it
    stands: 3, // flask stands: brews wait corked on them until you take them or step away
    herbs: 3, // of each herb laid out on the tray, as many as the bag holds
    hip: { down: 0.7, aside: 0.2, within: 0.18 }, // a flask let go this near a hip (m below your head, m aside) goes on the belt there
    buzz: { take: { intensity: 0.5, ms: 30 }, crunch: { intensity: 0.4, ms: 25 }, pound: { intensity: 0.8, ms: 40 }, stir: { intensity: 0.25, ms: 30 }, belt: { intensity: 0.6, ms: 50 }, nope: { intensity: 1, ms: 120 } },
    herbalist: { reach: 1.2, tie: 2.4, hang: 1.4 }, // s: their work at the bench's end: reaching for a sprig, tying it into a bundle, holding it up to look
  },

  // Marshal Hale at the crossroads (people/hale.ts).
  hale: {
    radius: 0.3, // m round them: they're solid, so you can't walk through them
    turnWithin: 8, // m: they turn to face you this close, and back to the crossroads when you go
    turnRate: 3, // per s: how fast they ease round
    waveWithin: 6, // m: they wave as you walk up this close…
    waveAgain: 10, // …and again once you've been this far away and come back
    waveTime: 1.8, // s the wave lasts
    marker: 0.5, // m over their head the "!" or "?" floats
  },

  // Who lives in each zone (people/population.ts): the villagers a zone places
  // by data, and the camps of every zone but the starting zone, which are built
  // as you come near and dropped as you leave, the way chunks are. Oakvale's own
  // cast and camps stand from the start, as they always have.
  population: {
    near: 100, // m: what's this near you is built and shown (the chunks' full detail, CONFIG.streaming.full)…
    hysteresis: 40, // m: …and dropped once you're this much farther
    most: 30, // villagers built at once, the nearest: a town's crowd is about 1.5k triangles and 2 draw calls each in view (zones/character-notes.md)
    perFrame: 1, // villagers built a frame as you walk, and as many of a camp's members: each is a few ms on the headset
    pad: 0.6, // m round a villager's body at bind that culls them out of view: room for their arms to swing and what they hold to move
    walk: { speed: 1.1, pause: 4 }, // m/s strolling a route (each build has its own pace: human.ts `Gait`), s standing at each end
  },

  // The birds every zone places by data, flock by flock (birds/birds.ts): each
  // flock one mesh and one draw call, built as you come near it and dropped as
  // you leave, like the villagers; how near you come before each kind takes
  // fright, and what it does then, is birds/ways.ts.
  birds: {
    near: 120, // m from a flock's ground (its middle less its reach) that it's built and shown: gulls circle high and are seen from far…
    hysteresis: 30, // m: …and dropped once you're this much farther
    perFrame: 1, // flocks built a frame as you walk
    // How near you come (m, on the ground plane) before a bird takes fright, by look or by family.
    shy: { crow: 10, pigeon: 4, gull: 7, hen: 3, grouse: 6, duck: 8, swan: 5, goose: 4.5, heron: 12 } as Record<string, number>,
    shallows: 0.6, // m of water at most a heron stands in
    calm: 4, // s you've been gone (past twice its fright distance) before a startled bird comes back to where it was
    away: 75, // s a covey or a heron keeps to where it fled before going home, once you're out of sight of both
    call: { reach: 45, gap: 1.6 }, // m you hear a bird call from; s at least between one flock's calls (a flush's clatter excepted)
  },

  // The animals a zone places (animals/herds.ts): built as you come near, as
  // its villagers are, and sharing a body per look. Sheep graze about their
  // home and scatter from you; dogs lie, trot about or follow; horses stand
  // tethered. (Wolves are enemies: CONFIG.wolf.)
  animals: {
    most: 40, // animals built at once, the nearest: a sheep or a dog is about 450 triangles, a horse about 500
    perFrame: 2, // herds (a flock, a dog, a horse) built a frame as you walk: each look's first body is a build, the rest share it
    pad: 0.5, // m round an animal's body at bind that culls it out of view: room for its legs and neck to swing
    speed: {
      sheep: { walk: 0.45, run: 2.3 },
      dog: { walk: 1.2, run: 3.2 },
      horse: { walk: 1.0, run: 2.6 },
    },
    turn: 4, // rad/s an animal turns at its walk (twice that running)
    radius: { sheep: 0.32, dog: 0.25, horse: 0.55 }, // m: the solid round each, that you and the others walk round (a horse's at each end is 0.85 of it)
    // A flock grazes about its home: each sheep walks a few metres to a new
    // patch, grazes `graze` s, and now and then lifts its head (`look`) and looks round.
    flock: {
      roam: 6, // m from home a sheep grazes, unless the plan says
      graze: [5, 14] as const, // s at one patch
      look: 0.25, // chance it looks up between patches…
      lie: 0.1, // …or lies down a while, chewing the cud (`rest` s)
      rest: [15, 30] as const,
      // A shy one runs from you once you're within `fear`, straight away, until
      // it's `safe` off; it drifts back home only while you're well clear of it.
      fear: 6,
      safe: 11,
      clear: 9, // m: how far you must be from home before they drift back to it
      wary: [3, 6] as const, // s a sheep that's run stands watching you before it grazes where it is
      aside: 1.4, // m: a flock that isn't shy still steps out of your way this close
    },
    // A dog that minds a flock gets up every `every` s and goes round it, `round`
    // m beyond its roam, sniffing at a couple of places; when the flock scatters
    // it follows, keeping `round` m off its edge, and goes back to its bed once
    // the flock is home.
    follow: { round: 2.5, every: [20, 40] as const },
    notice: 7, // m: a lying dog lifts its head to you, a tethered horse turns its head
    sniff: [2, 4] as const, // s a dog going round sniffs at each of a couple of places
    // s a tethered horse stands, crops the grass, or rests a hind leg, before it changes;
    // and the chance it stamps as it does.
    tether: { stand: [5, 12] as const, graze: [4, 10] as const, rest: [10, 20] as const, stamp: 0.25 },
  },

  // Critters (world/critters.ts): hares and rabbits, frogs, rats, each a
  // few still frames drawn instanced. They live round their spot and always
  // run away from you, never towards you.
  critters: {
    near: 40, // m: critters this near you move and are drawn; farther ones wait unseen where they are
    most: 24, // critters drawn at once in all, the nearest first
    // Hares and rabbits sit, graze, sit up and hop about their spot, sit up to watch you within `notice` m, and bolt
    // within `flee`, zig-zagging (each hop up to `zig` rad off straight away) until you're `safe` m off.
    rabbit: {
      notice: 12,
      flee: 7,
      safe: 22,
      wander: 5, // m from its spot it hops about in
      hop: { near: [0.3, 0.7], speed: 2.4, height: 0.12 }, // a hop about: m, m/s, m high
      bolt: { near: [1.2, 1.8], speed: 7, height: 0.22, zig: 0.7 }, // a hop fleeing
      rest: [1.5, 5], // s between hops about
    },
    // A frog leaps `leap` m the way it faces (into the water) once you're within `flee` m, and is back on its stone
    // once you've been `away` m off for `after` s.
    frog: { flee: 3.5, leap: 1.3, time: 0.38, height: 0.22, away: 10, after: 8 },
    // A rat runs `run` m along its wall at `speed` m/s, away from you, once you're within `flee` m, and is gone into
    // a gap; back once you've been `away` m off for `after` s.
    rat: { flee: 5, run: 2.6, speed: 3.2, away: 15, after: 10, shuffle: 0.5 },
  },

  // The village's people at work (people/villagers.ts, people/work.ts): the
  // innkeeper behind the bar, the smith at the anvil, the farmer by the well.
  villagers: {
    radius: 0.3, // m round each: they're solid, so you can't walk through them
    notice: 4, // m: they turn their head to follow you this close, and stop work while you're there
    look: { rate: 4, head: 1.1, chest: 0.35 }, // per s the head eases round; rad the head turns at most, and the chest with it beyond that
    attend: 1.5, // per s: how fast they stop work as you come, and go back to it as you leave
    // A bark: a short line on a small panel over their head, turned to you.
    bark: {
      within: 4, // m: it shows as you come this close…
      time: 4, // s: …for this long…
      rearm: 10, // m: …and not again until you've been this far away
      most: 2, // barks showing at once, at most
      over: 0.6, // m over the middle of their head, to the panel's middle (clear of the farmer's hat and pitchfork)
    },
    // The robed and named figures' loops (models/clergy.ts, gentry.ts, trainers.ts), each in s unless it says otherwise.
    figures: {
      // A book: reading, a page turned now and then, and a look up over it at the street.
      read: { read: 5, page: 1.0, lift: 0.8, look: 2.6 },
      // A ledger: lines written in bursts, the pen down the page, a look up to smile at whoever passes.
      ledger: { write: 3.2, strokes: 2.5, line: 0.6, lift: 0.7, look: 2.2 }, // strokes: per s
      // A coin box: coins lifted out one at a time and dropped back, counted, then a look up.
      coins: { lift: 0.45, drop: 0.35, count: 6, rest: 1.2, look: 2 },
      // A hedge priest: salt taken from the bag and scattered in a fan, three throws, then a prayer.
      salt: { dip: 0.8, throw: 0.6, throws: 3, pray: 4, rest: 2 },
      // Hands folded: the head bowed in prayer, raised, and a glance down at the floor.
      pray: { bow: 1.2, prayer: 5, lift: 1, rest: 2.5, glance: 2.2 },
      // The almoner: a loaf laid on the trestle, the next taken from the basket at her left.
      alms: { reach: 1.1, lay: 0.8, turn: 1.0, take: 0.8, rest: 1.5 },
      // Talking: an open hand lifted, a nod, the hand back.
      converse: { rest: 2.5, raise: 0.7, speak: 2.4, lower: 0.8, nod: 0.6 },
      // Pointing out at the ships, then a look down at the ledger beside them.
      point: { raise: 0.9, point: 2.6, lower: 0.9, turn: 0.8, check: 3, rest: 2 },
      // A drill master's slow form: a chop and a slash with the grunt's own poses, slowed, then the sword down.
      form: { ready: 1.0, windup: 1.1, strike: 0.6, hold: 0.7, recover: 0.9, rest: 4 },
      // A ranger's draw, aim and loose with the archer's own poses, then a long watch.
      loose: { draw: 1.4, aim: 1.2, release: 0.12, follow: 0.5, back: 1.0, rest: 4 },
      // Fletching an arrow: the feathers smoothed, then the shaft sighted along and turned.
      fletch: { stroke: 0.7, strokes: 3, raise: 0.8, sight: 2.4, lower: 0.8, rest: 1.5 },
    },
    // The smith's loop: bursts of blows, turning the piece between them, and the bellows now and then.
    smith: {
      bursts: [4, 3, 5], // blows in each burst, the loop round
      blow: 0.8, // s from one blow to the next
      turnPiece: 1.3, // s turning the piece over between bursts
      face: 0.8, // s turning to the bellows after the last burst, and back
      pumps: 3, // pulls on the bellows' handle…
      pump: 1.2, // …each this long
      aside: { speed: 0.9, back: 2 }, // m/s they step aside from the anvil while you work at it; s after you leave before they go back
    },
    // The innkeeper's loop: wiping the bar, polishing a tankard, setting it down and picking up another.
    innkeeper: { wipe: 5, polish: 5, setDown: 1.4, pickUp: 1.6, rubs: 1.6 }, // s each; rubs per s of the rag
    // The farmer's loop: leaning on the pitchfork, shifting their weight, shading their eyes to look towards the farm.
    farmer: { lean: 4, shift: 1.2, look: 3, lift: 0.8 }, // s each: a lean before each shift of weight, the look after every second one, the hand going up and down
    // Standing about, for anyone with no work of their own: weight on one foot, then the other, and a look round each side now and then.
    stand: { rest: 5, shift: 1.4, turn: 0.7, glance: 2.2, look: 0.75, hip: 0.025 }, // s on a foot, shifting, turning the head and looking; rad the head turns; m the hips shift
    // The guards' loops (models/guards.ts), each in s unless it says otherwise.
    guard: {
      // At a gate or a door: weight from foot to foot, a long look up the road, and the polearm lifted and grounded now and then.
      sentry: { rest: 6, shift: 1.6, turn: 1.1, watch: 3.5, look: 1.0, lift: 0.5, ground: 0.25 }, // look: rad the head and chest turn up the road
      // The royal guard at attention: nearly still, the eyes going to one side now and then and back.
      attention: { still: 9, eyes: 0.6, glance: 1.8, look: 0.3 }, // look: rad
      // The recruits at the dummies: a chop and a slash with the grunt's own strikes, `rounds` times, then a rest; everyone at it keeps time together.
      drill: { ready: 0.8, windup: 0.6, strike: 0.22, recover: 0.6, rounds: 2, rest: 3.5 },
      // The quartermaster: a blade raised to sight along its edge and turned, lowered, and hung on the rack (round to their left).
      blades: { raise: 1.0, sight: 2.6, lower: 0.9, turn: 1.0, hang: 1.1, hold: 0.6, rest: 1.5 },
      // Leaning on a polearm: a sigh now and then, and a look off to one side.
      lean: { rest: 5, sigh: 2.2, turn: 1.2, look: 3, away: 0.9 }, // away: rad
      // At a fence round a hole: leaning in to peer down, looking along it, straightening to look round.
      peer: { stand: 4, down: 1.4, scan: 4, up: 1.2, turn: 0.8, look: 2 },
    },
  },

  // Talking to Hale on a board that unfolds beside them: the talk prototype's
  // variant A (in history at merge 19ce545).
  talk: {
    open: 2.3, // m from Hale (on the floor): the board unfolds this close…
    facing: 50, // °: …while their head is within this of where you look
    close: 3.6, // m: it folds this far off; once folded it opens again only after you've been this far away
    board: { out: 0.6, side: 0.55, height: 1.2 }, // m from Hale towards you and to your right, and its middle's height
    reach: { side: 0.025, front: 0.03, back: 0.08 }, // m round a button's face that still touch it: a fist is fat, a tip needn't be exact
    unfold: 0.2, // s it takes to unfold, or fold away
    arming: 0.4, // s after it unfolds before a button takes a press…
    rearm: 0.6, // …and after each press
    buzz: { intensity: 0.8, ms: 50 }, // in the hand that pressed
    // A trainer's Train list (ui/talkBoard.ts): pressing a lit row buys its lesson with this buzz on top
    // of the press's; a grey row buys nothing and buzzes hard.
    train: { bought: { intensity: 0.8, ms: 60 }, refused: { intensity: 1, ms: 120 } },
  },

  // The quest tracker at the top left of your view: the talk prototype's variant C.
  tracker: {
    direction: [-0.4, 0.24, -1], // where it sits from your eyes (x right, y up, −z ahead)…
    distance: 1.1, // …this far out (m)
    lag: 3, // per s: how quickly it catches up as you turn your head, so it drifts rather than sticks
    flash: 1.5, // s it flashes when you take a quest, make progress or finish
    // The quest arrow at the left of the objective you're working on, pointing its way as the crow flies.
    arrow: {
      size: 0.022, // m across, on the tracker
      nearGiver: 10, // m: it hides this close to Hale (or any quest giver), when it points at them (their gold "?" shows the way)
    },
  },

  // The zone's name (ui/zoneName.ts), floating up a little above your eye line
  // as you cross into a zone and when you load in, as in WoW. It lags your
  // head like the tracker.
  zoneName: {
    direction: [0, 0.2, -1], // where it sits from your eyes (x right, y up, −z ahead)…
    distance: 1.6, // …this far out (m)
    lag: 3, // per s: how quickly it catches up as you turn your head
    size: [1.1, 0.22], // m across and high
    fadeIn: 0.4, // s it takes to come up…
    hold: 3, // …s it holds…
    fadeOut: 1.2, // …and s it takes to fade
  },

  // Smoke over the zone (world/smoke.ts): the inn's and the cottages'
  // chimneys, the smithy's forge and the lumber camp's fire.
  smoke: {
    puffs: 10, // per plume, all in one instanced mesh
    life: 9, // s a puff takes to rise and thin away
    fadeIn: 0.12, // of its life it takes to thicken, leaving the chimney
    opacity: 0.55, // at its thickest: few and thin, for the overdraw
    drift: 3.5, // m the breeze has carried it by the end
    sway: 0.4, // m it wanders across the breeze
    wind: [0.8, -0.6], // the breeze's way on the floor plane (x east, z south)
    chimney: { rise: 8, size: [0.8, 3], color: 0xb4b0a8 }, // m it rises; m across leaving the chimney and at the end
    fire: { rise: 5, size: [0.4, 2], color: 0x8e8a84 }, // the lumber camp's fire: lower, smaller and darker
  },

  // A hand-in's reward floats over Hale with a fanfare.
  handIn: {
    height: 0.9, // m over Hale's head, above the marker: "+N XP"…
    levelAfter: 0.6, // s: …then "LEVEL N", if it lands one…
    levelHeight: 0.3, // m: …this much higher
    time: 2.6, // s each floats
  },

  // The Adventure's health out of a fight (the arena has none).
  healing: {
    calm: 5, // s without taking or dealing damage…
    refill: 10, // …then health refills from empty to full over this long
  },

  // A death in the Adventure: the view fades to black and you wake in the village.
  death: {
    linger: 1.5, // s you see where you fell before it darkens
    fadeOut: 1, // s to black
    dark: 0.5, // s of black, while you're moved to the respawn point
    fadeIn: 1, // s back to the view
  },
  // Buildings you walk into (world/interiors.ts): the door swings open as you
  // walk up and shuts behind you, and the light swaps once it's shut.
  interiors: {
    open: 2, // m from the door's middle, from either side: it swings open…
    margin: 0.3, // m: …and outside, shuts again once you're this much further off
    shut: 1.5, // m in past the door's line: it shuts behind you, and the room's light comes up
    reopen: 1.3, // m from the door's middle, from inside: the sun comes back, then the door opens (open by the time you reach it at a walk)
    fadeIn: 0.5, // s for the sun to fade and the room's light to take over, once the door is shut
    fadeOut: 0.2, // s for the sun to come back as you walk to the door, before it opens
    swing: 0.35, // s for a door to swing from shut to open, or back
    angle: 1.6, // rad a door swings in to when open
    stage: 40, // m from a door (or the mine's mouth): its meshes are uploaded, unseen, ahead of the door opening
  },

  // The streamer (world/streamer.ts): zones are built a 40 m chunk at a time,
  // at full detail near you and as cheap stand-ins (far trees, coarse ground)
  // out to the fog's far edge. Distances are from you to a chunk's nearest point.
  streaming: {
    chunk: 40, // m: one grid of square chunks over every zone, centred on multiples of this
    full: 100, // m: chunks this near are at full detail (120 until the triangle budget's first cut, ticket 38)
    hysteresis: 40, // m (a chunk): a chunk is fetched this much early and dropped this much late, at each radius
    perFrame: 1, // chunks uploaded a frame while you walk (and built, where there's no worker)
    inFlight: 2, // chunks a zone's worker is asked for at once, nearest first: enough to keep it busy, few enough to follow you
    // A stand-in's ground: one height every `cell` m, and a skirt hung round its
    // edge `skirt` m below where its coarse edge strays from the full ground beside it.
    standIn: { cell: 4, skirt: 0.4 },
    // The triangle budget's other cuts (the spec's order, ticket 38). Deep in the
    // woods, off every road's verge and `clearing` m clear of every clearing, a
    // full chunk's trees are the far set too. Past where you can walk, in the ring
    // of chunks round the zone's edge, one tree in `thin` is kept.
    trees: { clearing: 6, thin: 2 },
    // The triangle budget (docs/quest-3-browser-performance-budget.md), as
    // renderer.info counts it in XR, both eyes: `frame` for a whole frame and
    // `chunk` for one full-detail chunk. Doubled from 300k and 16k on Tom's call
    // (2026-10-01) and not yet measured on the headset: the check is `?perf` at
    // Oakvale's mine front holding 72 fps on the Quest.
    budget: { frame: 600_000, chunk: 32_000 },
  },

  // The old mine (world/mine.ts): you're in it once you walk in through its
  // mouth, and the Interiors switch runs past its adit's bend. From 3.3 m
  // past the bend on, the mouth can't be seen.
  mine: {
    inside: 5.5, // m on past the adit's bend along the route: the sun fades, the mine's light and fog come up, the outdoors is hidden
    back: 4.5, // m past the bend, walking back: the sun comes back (up before you can see out at a run)
    near: 12, // m from the mouth's middle: the pool sits on the adit's lanterns
    fadeIn: 0.5, // s for the sun to fade and the mine's light to take over
    fadeOut: 0.2, // s for the sun to come back as you walk back to the bend
    // Its undead (world/mineGround.ts): one that can't see you heads for the
    // farthest point it can see up to `ahead` m on along the route's centre
    // line towards you, trying back `step` m at a time.
    way: { ahead: 4, step: 0.5 },
  },

  save: {
    every: 30, // s of play between writes when nothing else has written (where you stand is kept too)
    openTimeout: 5, // s to wait for the browser's storage to open before playing unsaved
    characters: 3, // characters a player keeps (the page before VR's slots)
    name: 16, // letters at most in a character's name
  },

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
      takes: { hold: 0.5, slow: 0.5 }, // shrugs off half
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
      takes: { hold: 0, slow: 0.5 }, // no root or freeze holds it: it stays a boss fight
      attacks: [
        { pose: 'slashR', kind: 'melee', windup: 0.85, active: 0.28, recover: 0.3, damage: 18, blockable: true, aim: true, weight: 2, next: 1 },
        { pose: 'slashL', kind: 'melee', windup: 0.5, active: 0.28, recover: 0.3, damage: 18, blockable: true, aim: true, weight: 0, next: 2 },
        { pose: 'chop', kind: 'melee', windup: 0.6, active: 0.3, recover: 0.9, damage: 24, blockable: true, weight: 0 },
        { pose: 'slam', kind: 'slam', windup: 1.3, active: 0.3, recover: 1.0, damage: 34, blockable: false, radius: 2.2, exposeOnRecover: true, weight: 1 },
      ],
      guard: { chance: 0.25, hold: [0.6, 1.1], cooldown: 2.5, reaction: 0.22 },
    },
    // A small fighter on the ground: a leech or an adder (crawler.ts). It lunges
    // at your legs, so you look down and block low, or step back out of reach.
    biter: {
      hp: 26,
      // Wider than it is, so a blade swung low finds it, and as wide as the narrowest of the others: no gap in a wall
      // or a mine lets it into a pocket they couldn't follow it into.
      radius: 0.3,
      crowd: 0.12,
      speed: 1.1,
      turnSpeed: 5,
      poise: 0,
      attackRange: 0.85, // its middle to your feet; each look's own is as far as its lunge reaches your ankles (createEnemy)
      holdDistance: 1.6,
      attackCooldown: [0.9, 1.9],
      staggerTime: 0.5,
      blockStagger: 0.8,
      parryStagger: 1.6,
      exposedTime: 1.5,
      critMultiplier: 1.6, // its head
      orbChance: 0.25,
      death: 'topple', // it curls up (Biter)
      attacks: [{ pose: 'lunge', kind: 'melee', windup: 0.7, active: 0.16, recover: 0.75, damage: 9, blockable: true, low: true, weight: 1 }],
    },
  } satisfies Record<EnemyKind, EnemyConfig>,

  warden: {
    summonAt: [0.7, 0.4], // HP fractions at which it raises grunts
    summonCount: 2,
    summonRing: 3, // m round you they rise
    enrageAt: 0.35, // below this HP fraction, wind-ups are faster
    enrageWindup: 0.75,
    kneelTime: 2.6,
    // In the old mine (enemies/throne.ts): the Warden on its throne in its
    // hall at the mine's foot, while you're on What Lies Below. It rises once
    // you're `rise` m in through the hall's south gate, and resets once you're
    // out through it into the antechamber (or down).
    hall: {
      level: 5, // it, and the skeletons it raises, at this level and in no camp
      hp: 600, // its level-1 health, so 1,080 at level 5 (the arena's Warden is 1,100)
      melee: 2, // the melee pool across every camp while it's up: the arena's, as its fight was tuned with two
      rise: 0.5, // m in past the gate's inner mouth: it rises
      seat: -6.2, // m from the hall's middle towards the throne: where it sits…
      front: -4.7, // …and where it stands up to, and walks back to before it sits (the arena's Warden rises here)
      seatHeight: 0.95, // m: its hips over the floor while it sits
      stand: 2.4, // s to stand up off the throne
      sit: 1.6, // s to sit back down
    },
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

  // Quest items lying in the world, picked up by hand as you touch an orb
  // (world/pickups.ts, orb.pickupRadius): the leader's orders.
  pickups: {
    buzz: { intensity: 0.8, ms: 70 }, // in the hand that took it
  },

  orb: {
    heal: 0.25, // of your maximum health
    pickupRadius: 0.25, // hand touch
    walkRadius: 0.45, // or walk over it
    lifetime: 20,
  },

  // Oakvale's ambience and its places' sounds (world/ambience.ts, fx/ambience.ts,
  // fx/loops.ts), all synthesised, and no music.
  sound: {
    // Which ambient sounds play (places' sounds and bird calls): the nearest,
    // up to `most`, none past `reach`; the nearest `hrtf` places' sounds are
    // placed by HRTF as combat's are, the rest (and every bird) panned cheaply.
    ambient: {
      most: 8,
      hrtf: 3,
      reach: 40, // m on the floor plane: a place's sound stops beyond this…
      edge: 8, // m: …fading out over this much before it, so it never cuts off
      fade: 0.4, // s a sound takes to fade out once it's dropped (it holds its slot till then)
      level: 1, // the whole ambience, wind and all, before the master
    },
    // The light wind everywhere, not placed: two bands of noise, one to each side, gusting slowly.
    wind: {
      level: 0.5,
      band: [380, 520], // Hz: each side's band's middle
      gust: [0.07, 0.11], // Hz: how slowly each side's gusts come and go
      depth: 0.6, // of the level the gusts swing by
    },
    // Brackenmoor's own ambience, placed nowhere: a stronger, lower wind than
    // Oakvale's, over a low rumble, and now and then a lone curlew's call from
    // somewhere out over the moor, on the wing.
    moor: {
      wind: {
        level: 0.75,
        band: [210, 300], // Hz: each side's band's middle, lower than the woods'
        gust: [0.09, 0.14], // Hz: its gusts come and go a little quicker…
        depth: 0.75, // …and swing it further
        // The rumble under it: noise below `cutoff` Hz, `level` as loud as a side's band, swelling at `gust` Hz by `depth` of that.
        rumble: { cutoff: 110, level: 0.35, gust: 0.045, depth: 0.5 },
      },
      call: {
        every: [9, 24], // s between calls (random in range)
        near: 30, // m off, at the nearest…
        far: 70, // …and the farthest
        height: [5, 14], // m over your head
        last: 3, // s a call holds its slot
        level: 1,
        ref: 30, // m within which it isn't quieter for distance: it carries
      },
    },
    // Aldhaven's own ambience, placed nowhere: a steady wind off the sea over
    // the surf's slow swell, and gulls crying now and then over the harbour
    // and the roofs (the quays' lapping and the river are placed, as places).
    harbour: {
      wind: {
        level: 0.6,
        band: [320, 440], // Hz: each side's band's middle, between the woods' and the moor's
        gust: [0.06, 0.1], // Hz: steadier than the moor's
        depth: 0.5,
        // The surf under it: noise below `cutoff` Hz, `level` as loud as a side's band, swelling at `swell` Hz by `depth` of that.
        surf: { cutoff: 300, level: 0.5, swell: 0.11, depth: 0.6 },
      },
      call: {
        every: [4, 13], // s between cries (random in range)
        near: 15, // m off, at the nearest…
        far: 45, // …and the farthest
        height: [6, 18], // m over your head
        last: 2.5, // s a cry holds its slot
        level: 0.9,
        ref: 20, // m within which it isn't quieter for distance
      },
    },
    // Birdsong: now and then a call from a tree `near` to `far` m off. Each try
    // picks a spot at random and a bird calls only if a tree stands within
    // `tree` m of it, so the open fields hear fewer.
    birds: {
      every: [0.8, 2.6], // s between tries (random in range)
      near: 10,
      far: 30,
      tree: 4, // m
      perch: [0.6, 0.95], // of the tree's height the bird calls from
      last: 2.5, // s a call holds its slot
      level: 1,
      ref: 8, // m within which a call isn't quieter for distance
    },
    // Each place's sound: its loudness (1 plays a loop about as loud as the
    // arena's drone), the distance within which it's no quieter (it falls
    // off as 1/distance past it), and how often its one-shots come (random
    // in range, s), if it has any.
    places: {
      stream: { level: 0.8, ref: 7 },
      dock: { level: 0.6, ref: 4 },
      windmill: { level: 0.6, ref: 6, every: [2.2, 5] },
      forge: { level: 0.6, ref: 3 },
      anvil: { level: 0.5, ref: 4 }, // the smith's hammer, struck by their work
      hearth: { level: 0.6, ref: 2.5, every: [0.08, 0.7] },
      campfire: { level: 0.7, ref: 3, every: [0.08, 0.6] },
      mineMouth: { level: 0.8, ref: 4, every: [0.6, 2.8] },
    },
    // The mix follows the light's cues (world/mix.ts): it moves as the
    // Interiors switch's light does, so over the same half-second.
    mix: {
      open: 20000, // Hz: a lowpass this high muffles nothing
      ease: 0.03, // s: the graph eases to each frame's mix with this time constant
      // Behind a shut door, the outdoors (the wind, the birds, the places outside) is this loud and muffled above `cutoff` Hz.
      inside: { level: 0.3, cutoff: 500 },
      // A room's own sounds (the inn's hearth) heard from outside through its shut door and walls…
      walls: { level: 0.3, cutoff: 400 },
      door: 0.6, // …and with its door open, this share of the way to how they sound in the room
      // The drone at the breach into the crypt: it rises from `from` to `to` m on past the breach along the route,
      // while the mine's creaking timbers fade out and its air drops to `air` of its level.
      crypt: { from: -2, to: 6, air: 0.5 },
      // While anything fights you, the whole ambience dips to `level`: over `attack` s, and back over `release` s once it's over.
      fight: { level: 0.6, attack: 0.3, release: 1.5 },
    },
    // The mine's own ambience past the adit's bend, not placed: hollow air, and
    // now and then a drip or a timber's creak from one side or the other.
    mine: {
      air: 0.9, // the hollow air's loudness (1 about as loud as the arena's drone)
      drips: { level: 0.6, every: [0.5, 2.4] }, // s between drips (random in range)
      timbers: { level: 0.7, every: [3, 9] }, // s between creaks
      sides: [-0.8, -0.3, 0.3, 0.8], // the stereo pans a drip or a creak can come from (±1 all the way to one side)
      drone: 1, // the arena's drone in the crypt: 1 as loud as in the arena
      linger: 1, // s the mine's ambience keeps going once its light is out, before it stops
    },
  },

  feel: {
    hitStop: 0.06, // s of frozen enemies on a solid hit
    hapticHit: { intensity: 0.8, ms: 60 },
    hapticBlock: { intensity: 1.0, ms: 90 },
    hapticHurt: { intensity: 0.6, ms: 150 },
  },
} as const;
