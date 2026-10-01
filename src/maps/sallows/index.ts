import type { MapInfo } from '../types';

export const map: MapInfo = {
  kind: 'zone',
  id: 'sallows',
  label: 'The Sallows',
  origin: { x: 0, z: 0 },
  // Brackenmoor joins over the Fen road (src/maps/fenRoad.ts) once its land reaches it, and Aldhaven over the causeway.
  neighbours: [],
  load: () => import('./fen').then((m) => m.buildSallows()),
};
