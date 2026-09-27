import { describe, expect, it } from 'vitest';
import { MAPS, mapIndex } from '../src/world/maps';

// The map viewer opens a map from the URL (?maps=<id>), so ids are URL keys.
describe('map registry', () => {
  it('gives every map a unique, URL-safe id', () => {
    const ids = MAPS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('finds a map by id, and falls back to the first', () => {
    expect(mapIndex(MAPS[MAPS.length - 1].id)).toBe(MAPS.length - 1);
    expect(mapIndex('nowhere')).toBe(0);
    expect(mapIndex('')).toBe(0);
    expect(mapIndex(null)).toBe(0);
  });
});
