import type { PersonPlan } from '../types';

// Brackenmoor's villagers (maps/types.ts `PersonPlan`), built as you come
// near them. For now two plain ones in Cairnford's square, from the cast's
// commoners, to stand in until the zone's own people are placed from its
// inhabitants spec (/zones/brackenmoor-inhabitants.md in the project's
// files): a shepherd by the well, come down off the fell with news, and a
// goodwife walking the square's east side between the inn and the cart.

export const MOOR_PEOPLE: readonly PersonPlan[] = [
  {
    id: 'cairnford-shepherd',
    cast: 'shepherd',
    x: 35.4,
    z: 365.6,
    yaw: 0.37,
    barks: [
      'Kerchiefs took three of my ewes off the fell last night. The reeve wants telling.',
      "Don't take the Blackmire boards after dark. Folk hear the barrows breathing.",
    ],
  },
  {
    id: 'cairnford-goodwife',
    cast: 'goodwife',
    x: 41,
    z: 362.6,
    yaw: Math.PI,
    route: [{ x: 41, z: 381 }],
    barks: [
      "The landlord's men were in again, counting hearths for his new tithe.",
      "Mind the beck by the bridge. It's up since the rain.",
    ],
  },
];
