import { type Camera, Group } from 'three';
import { TreeCover } from '../../world/ambience';
import { Glows } from '../../world/glows';
import { Smoke } from '../../world/smoke';
import type { Zone } from '../types';
import { buildWaterSheet } from '../waterSheet';
import { buildSallowsChunk, sallowsChunks, sallowsPlan } from './chunks';
import { SALLOWS, SALLOWS_ATMOSPHERE, type SallowsPlan } from './plan';
import { SALLOWS_BIRDS } from './birds';
import { FEN_WATER } from './palette';

/**
 * The Sallows (see plan.ts for what's where): its plan, its chunk builder
 * (chunks.ts), and the extras built once on the main thread: the water, one
 * sheet at the one level over every channel, pool and flat; the glows that
 * fake Reedholm's lanterns, the forge and the kiln; and the smoke over the
 * chimneys, the smoking sheds and the kiln. Nothing lives here yet, so it
 * has no camps, no people and nowhere to wake.
 */
export function buildSallows(given?: SallowsPlan): Zone {
  const plan = given ?? sallowsPlan();
  const root = new Group();
  root.name = 'sallows';
  const water = buildWaterSheet(plan.ground, () => SALLOWS.water, { deep: FEN_WATER.deep, shallow: FEN_WATER.shallow, depth: 1.6, emissive: 0x0c1a16 }, 'sallows-water');
  const glows = new Glows(plan.glows.length);
  for (const g of plan.glows) glows.add(g.x, g.y, g.z, g.size, g.color);
  const smoke = new Smoke(plan.smoke);
  root.add(water.mesh, glows.mesh, smoke.mesh);

  let time = 0;
  return {
    kind: 'zone',
    id: 'sallows',
    label: 'The Sallows',
    root,
    chunks: {
      keys: sallowsChunks(),
      build: (key, detail) => buildSallowsChunk(plan, key, detail),
      // The worker plans the fens afresh, so it's only the same fens when this one was too.
      worker: given ? undefined : () => new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module', name: 'sallows-chunks' }),
    },
    walkable: plan.walkable,
    land: SALLOWS.land,
    seams: [plan.northSeam],
    sideSeams: [plan.fenSeam],
    atmosphere: SALLOWS_ATMOSPHERE,
    spawn: plan.spawn,
    camps: [],
    interiors: [],
    mine: null,
    villagers: [],
    people: [],
    birds: SALLOWS_BIRDS,
    // The fog closes at 75 m anyway; Reedholm's landing will have 29 within it (sallows-inhabitants.md).
    crowd: { near: 80, most: 30 },
    respawnPoints: [],
    pickups: [],
    chests: [],
    spots: [],
    sounds: plan.sounds,
    trees: new TreeCover(plan.trees),
    ambience: 'moor',
    bounds: plan.walkable.bounds,
    landmarks: plan.landmarks,
    heightAt: plan.heightAt,
    // The meres, the lodes and the channel: one water line over every hollow below it.
    waterAt: (x, z) => (plan.ground.at(x, z) < SALLOWS.water ? SALLOWS.water : NaN),
    resolve: (p, radius) => plan.colliders.resolve(p, radius),
    collide: (p, radius) => plan.colliders.pushOut(p, radius),
    update(dt: number, camera: Camera) {
      time += dt;
      glows.update(time, camera);
      smoke.update(time, camera);
      water.update(dt);
    },
  };
}
