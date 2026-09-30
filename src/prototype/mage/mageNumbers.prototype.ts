// PROTOTYPE (abilities ticket 06): the mage's level 1 numbers, beside the
// warrior's in CONFIG. A grunt has 45 health; the sword deals 8 to 28 a swing.
// A full bolt deals 20, so a grunt takes three, or two with a head shot.

export const MAGE = {
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
  throw: {
    minSpeed: 1.2, // m/s of the hand at release: slower is a fizzle, not a cast
    fullSpeed: 4, // m/s: a throw this fast makes the tightest, fastest bolt
    slow: { speed: 7, radius: 0.2 }, // a gentle toss: a big slow orb, easy to land
    fast: { speed: 20, radius: 0.08 }, // a hard throw: a small quick bolt
    assistDeg: 15, // thrown aim is rough: bend onto an enemy this far off
  },
  wand: {
    length: 0.32, // m from the fist to the tip
    speed: 16,
    radius: 0.1,
    assistDeg: 6, // a pointed wand aims well: only a nudge
  },
  push: {
    minSpeed: 1.4, // m/s of the hand, away from you, to count as a push…
    fullSpeed: 3.5,
    reach: 0.3, // …with the hand at least this far out in front of your head (m)
    slow: { speed: 8, radius: 0.18 },
    fast: { speed: 18, radius: 0.09 },
    assistDeg: 12,
  },
  mana: {
    max: 100,
    boltCost: 5, // ?mana=spend only: each bolt
    blockCost: 10, // the ward: each blow or arrow it stops (a parry is free)
    regenInFight: 2, // per s while any enemy stands
    regenOutOfFight: 30, // per s once the wave is down: "a pool that refills out of a fight"
  },
  blink: {
    distance: 3.5, // m
    cooldown: 2.2, // s; the dash's is 1.1
  },
  offHandDamage: 1, // the off hand's bolts, as a share of the main hand's
  haptics: {
    charge: { intensity: 0.12, ms: 20 }, // a tick every 0.1 s while charging
    full: { intensity: 0.5, ms: 40 }, // at full charge
    cast: { intensity: 0.8, ms: 60 },
    hit: { intensity: 0.5, ms: 40 },
    fizzle: { intensity: 0.2, ms: 30 },
  },
};
