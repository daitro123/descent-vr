import type { MapInfo } from '../types';

export const map: MapInfo = {
  kind: 'zone',
  id: 'aldhaven',
  label: 'Aldhaven',
  // Its plan is laid out in the city's own frame and moved to ALDHAVEN.at itself.
  origin: { x: 0, z: 0 },
  // Its seams with Brackenmoor, the Sallows and Greyfell wait for those zones.
  neighbours: [],
  load: () => import('./city').then((m) => m.buildAldhaven()),
};
