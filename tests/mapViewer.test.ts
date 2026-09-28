import { Group } from 'three';
import { describe, expect, it } from 'vitest';
import type { GameMap } from '../src/maps/types';
import { viewpoints } from '../src/viewer/mapViewer';

// A hillside: ground rises 0.1 m per metre east.
const hill: GameMap = {
  kind: 'whole',
  id: 'hill',
  root: new Group(),
  sky: { background: 0, fog: { color: 0, near: 10, far: 50 } },
  viewDistance: 80,
  spawn: { x: 0, z: 10, yaw: 0.3 },
  bounds: { minX: -20, maxX: 20, minZ: -30, maxZ: 10 },
  landmarks: [
    { label: 'East tower', x: 10, z: 10 },
    { label: 'Well', x: 0, z: 10 },
  ],
  heightAt: (x) => x * 0.1,
  resolve: () => false,
  update: () => {},
};

describe('map viewer viewpoints', () => {
  const spots = viewpoints(hill);

  it('starts where the player spawns, facing the same way', () => {
    expect(spots[0]).toMatchObject({ label: 'Start', x: 0, y: 0, z: 10, yaw: 0.3, clear: false });
  });

  it('stands on the ground at each landmark, facing away from the start', () => {
    const tower = spots.find((s) => s.label === 'East tower')!;
    expect(tower.y).toBeCloseTo(1);
    expect(tower.yaw).toBeCloseTo(-Math.PI / 2); // walked east: looking down +X
    // A landmark on the spawn point keeps the spawn's heading.
    expect(spots.find((s) => s.label === 'Well')!.yaw).toBe(0.3);
  });

  it('ends with a fog-free view over the middle of the map from the south', () => {
    const over = spots[spots.length - 1];
    expect(over.label).toBe('Overview');
    expect(over.clear).toBe(true);
    expect(over.x).toBe(0);
    expect(over.z).toBeGreaterThan(hill.bounds.maxZ);
    expect(over.y).toBeGreaterThan(20);
    expect(over.pitch).toBeLessThan(-0.3); // looking down
    expect(over.pitch).toBeGreaterThan(-Math.PI / 2);
  });
});
