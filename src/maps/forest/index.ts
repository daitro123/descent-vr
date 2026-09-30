import type { MapInfo } from '../types';

export const map: MapInfo = {
  kind: 'zone',
  id: 'forest',
  label: 'Oakvale',
  origin: { x: 0, z: 0 },
  neighbours: [],
  load: () => import('./forest').then((m) => m.buildForest()),
};
