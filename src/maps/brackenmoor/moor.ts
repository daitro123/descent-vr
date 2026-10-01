import { type Camera, Group, Vector3 } from 'three';
import { TreeCover } from '../../world/ambience';
import { type PlumeSource, Smoke } from '../../world/smoke';
import type { Zone } from '../types';
import { buildWaterSheet } from '../waterSheet';
import { buildMoorChunk, moorChunks, planMoor } from './chunks';
import { MOOR_BUILD } from './palette';
import { MOOR, MOOR_ATMOSPHERE, type MoorPlan, type MoorStructure } from './plan';

/**
 * Brackenmoor (see plan.ts for what's where): its plan, made against
 * Oakvale's crest, its chunk builder (chunks.ts), and the extras built once on
 * the main thread: the water of the beck, the Blackmire's pools and Beck's
 * Foot as one sheet, and the peat smoke over Cairnford's and the crofts'
 * chimneys. Nothing lives here yet and nothing can hurt you, so it has no
 * camps, no people and nowhere to wake.
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
    sideSeams: [plan.fenSeam],
    atmosphere: MOOR_ATMOSPHERE,
    spawn: plan.spawn,
    camps: [],
    interiors: [],
    mine: null,
    villagers: [],
    pickups: [],
    chests: [],
    spots: [],
    sounds: plan.sounds,
    trees: new TreeCover(plan.trees),
    ambience: 'moor',
    bounds: plan.walkable.bounds,
    landmarks: plan.landmarks,
    heightAt: plan.heightAt,
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
 * inn's two, the smithy's forge, and the crofts still lived in (an
 * abandoned croft's hearth is cold). Each chimney's top, in its building's
 * frame, as buildings.ts stands it.
 */
export function plumes(structures: readonly MoorStructure[]): PlumeSource[] {
  const out: PlumeSource[] = [];
  const at = (s: MoorStructure, x: number, y: number, z: number) => {
    const p = new Vector3(x, y, z).applyAxisAngle(new Vector3(0, 1, 0), s.yaw);
    out.push({ x: s.x + p.x, y: s.y + p.y, z: s.z + p.z, fire: false });
  };
  for (const s of structures) {
    if (s.kind === 'inn') {
      at(s, s.w / 2 - 0.5, 9.2, 0);
      at(s, -s.w / 2 + 0.5, 9.2, 0);
    } else if (s.kind === 'house' && s.variant % 3 !== 2) at(s, (s.variant % 2 ? -1 : 1) * (s.w / 2 - 0.5), s.h * 2.7 + 3.6, 0);
    else if (s.kind === 'smithy') at(s, -s.w / 4, 3 + 3.2, -s.d / 2 + 0.6);
    else if (s.kind === 'croft' && s.variant === 0) at(s, s.w / 2 - 0.6, 2.1 + 2.6, 0);
  }
  return out;
}
