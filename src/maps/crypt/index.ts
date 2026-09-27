import type { MapInfo } from '../types';

export const map: MapInfo = {
  id: 'crypt',
  label: 'Crypt hall',
  load: () => import('./crypt').then((m) => m.buildCrypt()),
};
