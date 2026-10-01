import type { FlockPlan } from '../types';

// Brackenmoor's birds (zones/brackenmoor-inhabitants.md "Animals"): hens in
// three of Cairnford's yards and gardens, red grouse in pairs down in the
// deep heather, and ravens on the Long Stones and the rag poles. Nothing
// within about 60 m of Hollowhill, where the birds fall silent. Curlews and
// the heron at Beck's Foot are sound only for now.

/** A covey of two grouse at (x, z), hidden in the heather. */
const covey = (n: number, x: number, z: number): FlockPlan => ({ id: `brackenmoor-grouse-${n}`, ways: 'covey', birds: ['grouse', 'grouse'], x, z, r: 1.5 });

export const MOOR_BIRDS: readonly FlockPlan[] = [
  // Hens: pecking about a Kingsroad back yard, Granny Mott's garden gate and the green at Turfmoss.
  { id: 'brackenmoor-kingsroad-hens', ways: 'peck', birds: ['cock', 'hen', 'henSpeckled'], x: 75, z: 352, r: 3 },
  { id: 'brackenmoor-mott-hens', ways: 'peck', birds: ['hen', 'henBlack', 'henWhite'], x: 13.5, z: 418.5, r: 2.5 },
  { id: 'brackenmoor-turfmoss-hens', ways: 'peck', birds: ['henSpeckled', 'hen', 'henBlack'], x: -84, z: 359, r: 3 },

  // Red grouse, two to a covey, at least 30 m from any camp.
  covey(1, -26, 202),
  covey(2, 66, 254),
  covey(3, -58, 290),
  covey(4, -130, 314),
  covey(5, -18, 438),
  covey(6, 82, 462),
  covey(7, -50, 478),
  covey(8, 122, 250),

  // Ravens: on the 3rd and 7th Long Stones' tops, the Old Fold's rag pole, and the two on Raven Scar's lip.
  {
    id: 'brackenmoor-longstones-ravens',
    ways: 'perch',
    birds: ['raven', 'raven'],
    x: 71,
    z: 292,
    r: 16,
    perches: [
      { x: 56.5, y: 17.69, z: 289.6, yaw: 2.9 },
      { x: 85.5, y: 17.27, z: 294.8, yaw: -0.4 },
    ],
  },
  { id: 'brackenmoor-oldfold-raven', ways: 'perch', birds: ['raven'], x: -49.5, z: 324.5, r: 9, perches: [{ x: -49.5, y: 10.23, z: 324.5, yaw: 0.4 }] },
  {
    id: 'brackenmoor-ravenscar-ravens',
    ways: 'perch',
    birds: ['raven', 'raven'],
    x: -158,
    z: 200,
    r: 14,
    perches: [
      { x: -172, y: 38.59, z: 197, yaw: 3.4 },
      { x: -144, y: 31.39, z: 198, yaw: 2.8 },
    ],
  },
];
