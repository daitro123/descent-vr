import type { FlockPlan, Perch } from '../types';

// Aldhaven's birds (zones/aldhaven-inhabitants.md): pigeons in the market
// and on the cathedral's forecourt, bursting up onto the cross, the stalls'
// awnings and the walls as you come through; gulls circling over the basin
// and standing on the Long Quay's bollards, the mole's parapet and the
// light's gallery; swans and mallards on the King's Garden's pond; hens in
// the farm's barn yard. Perches are the props' tops, from their models
// (aldhaven/buildings.ts) where the plan puts them.

/** The market cross at (350, 345), its foot at 2.49: its top step all round, the crossbar and the gilt ball. */
const CROSS: readonly Perch[] = [
  { x: 350.75, y: 3.69, z: 345, yaw: Math.PI / 2 },
  { x: 349.25, y: 3.69, z: 345, yaw: -Math.PI / 2 },
  { x: 350, y: 3.69, z: 345.75, yaw: 0 },
  { x: 350, y: 3.69, z: 344.25, yaw: Math.PI },
  { x: 350, y: 7.34, z: 345, yaw: 0, w: 1 },
  { x: 350, y: 8.64, z: 345, yaw: 0.6 },
];

/** A stall's awning's ridge, 2.45 m over its foot, along its width. */
const awning = (x: number, foot: number, z: number, yaw: number): Perch => ({ x, y: foot + 2.45, z, yaw, w: 3 });

/** The mole's round end round the light at (570, 405): its parapet's top, and the light's gallery, at `a` round from south. */
const parapet = (a: number): Perch => ({ x: 570 + Math.sin(a) * 6.25, y: 2.93, z: 405 + Math.cos(a) * 6.25, yaw: a });
const gallery = (a: number): Perch => ({ x: 570 + Math.sin(a) * 3.3, y: 22.8, z: 405 + Math.cos(a) * 3.3, yaw: a });

export const ALDHAVEN_BIRDS: readonly FlockPlan[] = [
  {
    id: 'aldhaven-market-pigeons',
    ways: 'flush',
    birds: Array.from({ length: 10 }, () => 'pigeon' as const),
    x: 348,
    z: 340,
    r: 6,
    perches: [
      ...CROSS,
      awning(361.5, 2.79, 340.2, 5.11),
      awning(354.8, 2.76, 333.5, 5.89),
      awning(345.2, 2.51, 333.5, 6.68),
      awning(338.5, 2.46, 340.2, 7.46),
      awning(338.5, 2.52, 349.8, 8.25),
      awning(344, 2.47, 329, 0),
      awning(356, 3.04, 329, 0),
    ],
  },
  {
    // The forecourt is only 4 m deep: they settle on the statue, its plinth and the close's walls.
    id: 'aldhaven-forecourt-pigeons',
    ways: 'flush',
    birds: Array.from({ length: 8 }, () => 'pigeon' as const),
    x: 430,
    z: 344,
    r: 3,
    perches: [
      { x: 432.62, y: 10.58, z: 334, yaw: Math.PI / 2, w: 1 },
      { x: 432, y: 12.92, z: 334, yaw: Math.PI / 2 },
      { x: 428, y: 13.65, z: 338, yaw: Math.PI / 2, w: 6 },
      { x: 428, y: 8.36, z: 352, yaw: Math.PI / 2, w: 5 },
    ],
  },
  { id: 'aldhaven-basin-gulls', ways: 'circle', birds: ['gull', 'gull', 'gullYoung', 'gull', 'gull', 'gullYoung', 'gull', 'gull'], x: 510, z: 420, r: 22, high: [10, 20] },
  {
    id: 'aldhaven-longquay-gulls',
    ways: 'perch',
    birds: ['gull', 'gull', 'gullYoung', 'gull', 'gull', 'gull'],
    x: 500.5,
    z: 395,
    r: 20,
    high: [5, 10],
    perches: [478, 487, 496, 505, 514, 523].map((x) => ({ x, y: 3.15, z: 389.2, yaw: 0 })),
  },
  {
    id: 'aldhaven-mole-gulls',
    ways: 'perch',
    birds: ['gull', 'gullYoung', 'gull', 'gull', 'gull', 'gull'],
    x: 565,
    z: 402,
    r: 10,
    high: [6, 12],
    perches: [parapet(0.3), parapet(1.1), gallery(0.94), parapet(1.9), parapet(2.7), gallery(2.2)],
  },
  { id: 'aldhaven-pond-waterfowl', ways: 'swim', birds: ['swan', 'swan', 'mallard', 'mallardDuck', 'mallard'], x: 338, z: 284, r: 5 },
  { id: 'aldhaven-barnyard-hens', ways: 'peck', birds: ['hen', 'henWhite', 'cock', 'henSpeckled', 'henBlack'], x: 294, z: 454, r: 3 },
];
