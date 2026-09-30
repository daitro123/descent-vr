// Every tunable in one place. White-boxing is mostly turning these knobs,
// so keep gameplay numbers here rather than scattered through systems.

import type { Ability, Role } from './adventureState';
import type { EnemyKind } from './models/characters';
import type { Sword } from './quests';

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
  /** How its undead die: a skeleton shatters into its bones, the brute topples. Bandits always topple. */
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
    },
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
  },

  // Levels (adventureState.ts): the Adventure's character climbs from 1 to the
  // cap, and every level adds the same step to it and to an enemy of that
  // level, so a fight against your own level plays like the arena at any level.
  // The arena is level 1 with every ability.
  levels: {
    xp: [100, 300, 600, 1000], // XP in all to reach levels 2, 3, 4 and 5, the cap; XP past it is dropped
    health: 20, // your maximum health (player.maxHp at level 1) grows this much per level above 1
    step: 0.2, // your damage, and an enemy's health and damage, times 1 + this per level above 1
    swords: { plain: 0, hale: 0.2 } satisfies Record<Sword, number>, // your damage multiplier's extra with each sword: Hale's old longsword is worth one level
    killXp: 10, // a kill pays this per enemy level…
    roles: { ordinary: 1, leader: 3, deepBrute: 3, warden: 3, raised: 0 } satisfies Record<Role, number>, // …times this, by what it was
    unlocks: { warCry: 2, earthshaker: 3 } satisfies Record<Ability, number>, // the level each ability arrives at; rage comes with the War Cry
    xpFloat: { height: 1.9, time: 1.6 }, // "+N XP" floats this high over where an enemy fell, for this long (s)
    levelUp: { banner: 3.5, lines: 5 }, // s that "LEVEL N", and the lines on what it brought, stay in view
  },

  // Marshal Hale's quest chain (quests.ts): what each quest asks and pays.
  // Hale's lines name the farm's count ("three"): change them with it.
  quests: {
    raiders: { bandits: 3, xp: 80 }, // Raiders in the Fields: defeat this many of the farm's camp
    lumber: { bandits: 5, xp: 120 }, // The Lumber Camp: this many of the lumber camp's camp, and the leader's orders
    below: { xp: 300 }, // What Lies Below: the Warden, for this and Hale's old longsword
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
    // The smith's loop: bursts of blows, turning the piece between them, and the bellows now and then.
    smith: {
      bursts: [4, 3, 5], // blows in each burst, the loop round
      blow: 0.8, // s from one blow to the next
      turnPiece: 1.3, // s turning the piece over between bursts
      face: 0.8, // s turning to the bellows after the last burst, and back
      pumps: 3, // pulls on the bellows' handle…
      pump: 1.2, // …each this long
    },
    // The innkeeper's loop: wiping the bar, polishing a tankard, setting it down and picking up another.
    innkeeper: { wipe: 5, polish: 5, setDown: 1.4, pickUp: 1.6, rubs: 1.6 }, // s each; rubs per s of the rag
    // The farmer's loop: leaning on the pitchfork, shifting their weight, shading their eyes to look towards the farm.
    farmer: { lean: 4, shift: 1.2, look: 3, lift: 0.8 }, // s each: a lean before each shift of weight, the look after every second one, the hand going up and down
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
      nearHale: 10, // m: it hides this close to Hale, when it points at them (their gold "?" shows the way)
    },
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
