import { type Camera, Group, Matrix4, Mesh, Vector3 } from 'three';
import { sharedModelMaterial } from '../../models/materials';
import type { Interior as InteriorId } from '../../save/record';
import { TreeCover } from '../../world/ambience';
import type { Interior, InteriorPlan } from '../../world/interiors';
import { Glows } from '../../world/glows';
import { Smoke } from '../../world/smoke';
import type { StartingZone } from '../types';
import { buildStructure } from './buildings';
import { buildOakvaleChunk, oakvaleChunks } from './chunks';
import { buildHouseInterior } from './houseModel';
import { buildInnInterior } from './innModel';
import { buildMine } from './mineModel';
import { buildMapFace, buildSignNames } from './wayfinding';
import { FOREST, type ForestLayout, planOakvale } from './layout';
import { buildWater } from './water';

/** Each interior's meshes, by its id. */
const INTERIOR_MODELS: Partial<Record<InteriorId, (plan: InteriorPlan) => Interior>> = {
  inn: buildInnInterior,
  house: buildHouseInterior,
};

/**
 * Oakvale, the starting zone (see layout.ts for what's where): its plan, its
 * chunk builder (chunks.ts), and the extras built once on the main thread from
 * positions in the plan: the glows that fake every lantern and fire, the
 * windmill's sails, the water, the smoke, the signposts' names and the map
 * board. Its interiors and the mine are built with it, hidden. The World
 * lights it, gives it its sky, and streams its chunks in round you.
 */
export function buildForest(given?: ForestLayout): StartingZone {
  const plan = given ?? planOakvale();
  const root = new Group();
  root.name = 'forest';

  const glows = new Glows();
  const spinners: Mesh[] = [];
  for (const s of plan.structures) {
    const place = new Matrix4().makeRotationY(s.yaw).setPosition(s.x, s.y, s.z);
    // Its shape is the chunk's; only its lights and sails are kept here.
    buildStructure(s, {
      layout: plan,
      glow: (at, size, color) => {
        const p = new Vector3(...at).applyMatrix4(place);
        glows.add(p.x, p.y, p.z, size, color);
      },
      spinner: (g, at) => {
        const mesh = new Mesh(g, sharedModelMaterial());
        mesh.position.copy(new Vector3(...at).applyMatrix4(place));
        mesh.rotation.y = s.yaw;
        spinners.push(mesh);
      },
    }).dispose();
  }

  // The signposts' names and the map board's painted face, each one texture; the smoke over them all.
  const wayfinding = [
    ...plan.structures.filter((s) => s.kind === 'signpost').map(buildSignNames),
    ...plan.structures.filter((s) => s.kind === 'mapboard').map((s) => buildMapFace(s, plan)),
  ];
  const smoke = new Smoke(plan.smoke);
  const water = buildWater(plan);
  root.add(...spinners, glows.mesh, ...wayfinding, smoke.mesh, water.mesh);

  let time = 0;
  return {
    kind: 'zone',
    id: 'forest',
    label: 'Oakvale',
    root,
    chunks: {
      keys: oakvaleChunks(),
      build: (key, detail) => buildOakvaleChunk(plan, key, detail),
      // The worker plans Oakvale afresh, so it's only the same Oakvale when this one was too.
      worker: given ? undefined : () => new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module', name: 'oakvale-chunks' }),
    },
    walkable: plan.walkable,
    land: { minX: -FOREST.half, maxX: FOREST.half, minZ: -FOREST.half, maxZ: FOREST.half },
    seams: plan.seams,
    atmosphere: plan.atmosphere,
    spawn: plan.spawn,
    camps: plan.camps,
    respawns: plan.respawns,
    stash: plan.stash,
    interiors: plan.interiors.map((interior) => {
      const build = INTERIOR_MODELS[interior.id];
      if (!build) throw new Error(`No model for the ${interior.id}`);
      return build(interior);
    }),
    mine: buildMine(plan.mine),
    hale: plan.hale,
    places: plan.places,
    villagers: plan.villagers,
    pickups: plan.pickups,
    sounds: plan.sounds,
    trees: new TreeCover(plan.trees),
    ambience: 'woods',
    bounds: plan.walkable.bounds,
    landmarks: plan.landmarks,
    heightAt: plan.heightAt,
    resolve: (p, radius) => plan.colliders.resolve(p, radius),
    collide: (p, radius) => plan.colliders.pushOut(p, radius),
    update(dt: number, camera: Camera) {
      time += dt;
      glows.update(time, camera);
      smoke.update(time, camera);
      water.update(dt);
      for (const s of spinners) s.rotation.z -= dt * 0.35;
    },
  };
}
