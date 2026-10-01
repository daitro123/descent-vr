import type { MapInfo } from '../types';

export const map: MapInfo = {
  kind: 'zone',
  id: 'aldhaven',
  label: 'Aldhaven',
  // Its plan is laid out in the city's own frame and moved to ALDHAVEN.at itself.
  origin: { x: 0, z: 0 },
  // Brackenmoor over the Kingsroad (west), the Sallows over the causeway (south). Greyfell, north, waits for that zone.
  neighbours: ['brackenmoor', 'sallows'],
  load: () => import('./city').then((m) => m.buildAldhaven()),
};
