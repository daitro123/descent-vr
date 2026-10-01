import { type Camera, Group, Vector3 } from 'three';
import { TreeCover } from '../../world/ambience';
import { type PlumeSource, Smoke } from '../../world/smoke';
import type { Zone } from '../types';
import { buildWaterSheet } from '../waterSheet';
import { smokeFrom } from './buildings';
import { buildMoorChunk, moorChunks, planMoor } from './chunks';
import { MOOR_BUILD } from './palette';
import { MOOR_CRITTERS } from './critters';
import { MOOR_PEOPLE } from './people';
import { MOOR, MOOR_ATMOSPHERE, type MoorPlan, type MoorStructure } from './plan';

/**
 * Brackenmoor (see plan.ts for what's where): its plan, made against
 * Oakvale's crest, its chunk builder (chunks.ts), and the extras built once on
 * the main thread: the water of the beck, the Blackmire's pools and Beck's
 * Foot as one sheet, and the peat smoke over Cairnford's and the crofts'
 * chimneys. Its villagers (people.ts) are built as you come near them;
 * nothing can hurt you yet, so it has no camps and nowhere to wake.
 */
export function buildBrackenmoor(given?: MoorPlan): Zone {
  const plan = given ?? planMoor();
  const root = new Group();
  root.name = 'brackenmoor';
  const water = buildWaterSheet(plan.ground, plan.waterLevel, { ...MOOR_BUILD.water, depth: 0.8, emissive: 0x0e1210 }, 'brackenmoor-water');
  const smoke = new Smoke(plumes(plan.structures));
  root.add(water.mesh, smoke.mesh);
  let time = 0;
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
    sideSeams: [plan.fenSeam, plan.kingsSeam],
    atmosphere: MOOR_ATMOSPHERE,
    spawn: plan.spawn,
    camps: [],
    interiors: [],
    mine: null,
    villagers: [],
    people: MOOR_PEOPLE,
    critters: MOOR_CRITTERS,
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
    waterAt: (x, z) => {
      const level = plan.waterLevel(x, z);
      return level > plan.heightAt(x, z) ? level : null;
    },
    resolve: (p, radius) => plan.colliders.resolve(p, radius),
    collide: (p, radius) => plan.colliders.pushOut(p, radius),
    update(dt: number, camera: Camera) {
      time += dt;
      water.update(dt);
      smoke.update(time, camera);
    },
  };
}

/**
 * Where peat smoke rises: the chimneys of Cairnford's lived-in houses, the
 * inn's two, the smithy's forge, the tollhouse's, and the crofts still lived
 * in (an abandoned croft's hearth is cold). Each chimney's top, in its
 * building's frame, as buildings.ts stands it.
 */
export function plumes(structures: readonly MoorStructure[]): PlumeSource[] {
  const up = new Vector3(0, 1, 0);
  return structures.flatMap((s) =>
    smokeFrom(s).map(([x, y, z]) => {
      const p = new Vector3(x, y, z).applyAxisAngle(up, s.yaw);
      return { x: s.x + p.x, y: s.y + p.y, z: s.z + p.z, fire: false };
    }),
  );
}
