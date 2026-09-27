import type { MapInfo } from './types';

// Every map lives in its own folder, src/maps/<id>/, whose index.ts exports
// `map: MapInfo`. Vite finds them at build time, so adding a map never means
// editing this file.

const found = import.meta.glob<{ map: MapInfo }>('./*/index.ts', { eager: true });

/** All maps, in a stable order (by id). */
export const MAPS: readonly MapInfo[] = Object.values(found)
  .map((m) => m.map)
  .sort((a, b) => a.id.localeCompare(b.id));

export function findMap(id: string): MapInfo | undefined {
  return MAPS.find((m) => m.id === id);
}
