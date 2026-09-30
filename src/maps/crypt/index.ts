import type { MapInfo } from '../types';

export const map: MapInfo = {
  kind: 'whole',
  id: 'crypt',
  label: 'Crypt hall',
  load: () => import('./crypt').then((m) => m.buildCrypt()),
};
