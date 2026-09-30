import { Group } from 'three';
import { TreeCover } from '../../world/ambience';
import type { Zone } from '../types';
import { buildMoorChunk, moorChunks, planMoor } from './chunks';
import { MOOR, MOOR_ATMOSPHERE, type MoorPlan } from './plan';

/**
 * Brackenmoor (see plan.ts for what's where): its plan, made against
 * Oakvale's crest, and its chunk builder (chunks.ts). It has no extras to
 * build: no glows, water or smoke, and everything on it (the border stone
 * too) is in its chunks. Nothing lives here and nothing can hurt you, so it
 * has no camps, no people and nowhere to wake.
 */
export function buildBrackenmoor(given?: MoorPlan): Zone {
  const plan = given ?? planMoor();
  const root = new Group();
  root.name = 'brackenmoor';
  return {
    kind: 'zone',
    id: 'brackenmoor',
    label: 'Brackenmoor',
    root,
    chunks: {
      keys: moorChunks(),
      build: (key, detail) => buildMoorChunk(plan, key, detail),
      // The worker plans the moor afresh, so it's only the same moor when this one was too.
      worker: given ? undefined : () => new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module', name: 'brackenmoor-chunks' }),
    },
    walkable: plan.walkable,
    land: MOOR.land,
    seams: [plan.seam],
    atmosphere: MOOR_ATMOSPHERE,
    spawn: plan.spawn,
    camps: [],
    interiors: [],
    mine: null,
    villagers: [],
    pickups: [],
    sounds: [],
    trees: new TreeCover(plan.trees),
    ambience: 'moor',
    bounds: plan.walkable.bounds,
    landmarks: plan.landmarks,
    heightAt: plan.heightAt,
    resolve: (p, radius) => plan.colliders.resolve(p, radius),
    collide: (p, radius) => plan.colliders.pushOut(p, radius),
    update() {},
  };
}
