import type { GameMap, MapInfo, Zone } from './types';

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

/**
 * The zones over `zone`'s seams, loaded (through `load`, which may keep what
 * it has loaded): what the World adds beside it, so you walk over into them.
 */
export async function loadNeighbours(zone: Zone, load: (info: MapInfo) => Promise<GameMap> = (info) => info.load()): Promise<Zone[]> {
  const info = findMap(zone.id);
  const ids = info?.kind === 'zone' ? info.neighbours : [];
  const maps = await Promise.all(ids.map((id) => findMap(id)).filter((m) => m !== undefined).map(load));
  return maps.filter((m): m is Zone => m.kind === 'zone');
}
