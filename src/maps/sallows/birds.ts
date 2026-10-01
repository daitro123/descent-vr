import type { BirdFlockPlan } from '../types';

// The Sallows' birds (zones/sallows-inhabitants.md "Wildlife"): geese on the
// landing's holm, herons and egrets standing alone in the shallows, mallards
// in fours on the moat, the floods and the pools, gulls round the beached cog
// at Smugglers' Hythe, and crows in the Gibbet Willow. Spots in the water
// were checked against the plan's depths; where the spec's spot was too deep
// or dry, the nearest shallows stand in. The bittern is Later.

/** A grey heron (or a little egret) on its own in the shallows at (x, z). */
const wader = (id: string, look: 'heron' | 'egret', x: number, z: number): BirdFlockPlan => ({ id: `sallows-${id}`, ways: 'wade', birds: [look], x, z, r: 2 });

/** Four mallards, two drakes and two ducks, on the water round (x, z). */
const mallards = (id: string, x: number, z: number, r: number): BirdFlockPlan => ({ id: `sallows-${id}-mallards`, ways: 'swim', birds: ['mallard', 'mallardDuck', 'mallard', 'mallardDuck'], x, z, r });

export const SALLOWS_BIRDS: readonly BirdFlockPlan[] = [
  { id: 'sallows-landing-geese', ways: 'graze', birds: ['goose', 'goose', 'goose', 'goose', 'goose'], x: 356, z: 606, r: 3 },

  wader('heron-gibbet', 'heron', 315, 650),
  wader('heron-withy', 'heron', 356.5, 765.5),
  wader('heron-south-lode', 'heron', 403, 664),
  wader('heron-east-lode', 'heron', 442.3, 622.1),
  wader('heron-cockle', 'heron', 293.3, 727.8),
  wader('heron-saltflats', 'heron', 631.5, 892.5),
  wader('egret-saltflats', 'egret', 617, 881),
  wader('egret-flats-north', 'egret', 650, 855),
  wader('egret-flats-east', 'egret', 661.8, 888.8),
  wader('egret-hythe', 'egret', 668, 690),

  // Fowler Quill's decoys stand on dry ground: his mallards are on the Withy Holm's pool, west of his hide.
  mallards('decoy', 360, 770, 2.5),
  mallards('gibbet', 325, 651.5, 3),
  mallards('cockle', 296, 722, 4),
  mallards('pool', 360, 645.5, 3),

  {
    // The cog's high rail (it's heeled over), the shell bank, the jetty's lantern post and its planks.
    id: 'sallows-hythe-gulls',
    ways: 'perch',
    birds: ['gull', 'gull', 'gullYoung', 'gull', 'gull', 'gull', 'gullYoung', 'gull'],
    x: 694,
    z: 632,
    r: 10,
    high: [6, 12],
    perches: [
      { x: 693.53, y: 3.5, z: 627.61, yaw: 1.92 },
      { x: 690.5, z: 640, yaw: 3 },
      { x: 698.4, y: 3.5, z: 627.5, yaw: 1.41 },
      { x: 694.73, y: 3.5, z: 630.9, yaw: 1.92 },
      { x: 692.5, z: 641, yaw: 2.6 },
      { x: 691, y: 0.9, z: 627.3, yaw: 3 },
      { x: 695.93, y: 3.5, z: 634.19, yaw: 1.92 },
      { x: 694.7, z: 639.7, yaw: 3.4 },
    ],
  },
  {
    // The Gibbet Willow at (322, 642): the cage's top, the long limb it hangs from, and a high limb.
    id: 'sallows-gibbet-crows',
    ways: 'perch',
    birds: ['crow', 'crow', 'crow'],
    x: 323,
    z: 641,
    r: 8,
    perches: [
      { x: 325.35, y: 4.88, z: 639.77, yaw: 1 },
      { x: 324.53, y: 6.35, z: 640.34, yaw: 2.5 },
      { x: 323.94, y: 10.16, z: 640.89, yaw: 4 },
    ],
  },
];
