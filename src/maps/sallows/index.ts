import type { MapInfo } from '../types';

export const map: MapInfo = {
  kind: 'zone',
  id: 'sallows',
  label: 'The Sallows',
  origin: { x: 0, z: 0 },
  // Brackenmoor over the Fen road (src/maps/fenRoad.ts), Aldhaven over the causeway.
  neighbours: ['brackenmoor', 'aldhaven'],
  load: () => import('./fen').then((m) => m.buildSallows()),
};
