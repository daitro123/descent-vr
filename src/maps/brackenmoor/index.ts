import type { MapInfo } from '../types';

export const map: MapInfo = {
  kind: 'zone',
  id: 'brackenmoor',
  label: 'Brackenmoor',
  origin: { x: 0, z: 0 },
  neighbours: ['forest', 'sallows'],
  load: () => import('./moor').then((m) => m.buildBrackenmoor()),
};
