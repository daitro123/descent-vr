import type { MapInfo } from '../types';

export const map: MapInfo = {
  id: 'forest',
  label: 'Oakvale forest',
  load: () => import('./forest').then((m) => m.buildForest()),
};
