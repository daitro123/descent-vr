import { type Camera, Group, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { ModelBuilder } from '../../models/kit';
import { sharedModelMaterial } from '../../models/materials';
import type { Atmosphere } from '../../world/atmosphere';
import { Glows } from '../../world/glows';
import type { Zone } from '../types';
import { buildFence, buildField, buildStructure } from './buildings';
import { buildLayout, FOREST } from './layout';
import { plantPrototypes } from './nature';
import { LIGHT, SKY } from './palette';
import { addPaths, addPatches, addTerrain, buildWater, Chunks } from './terrain';

const UP = new Vector3(0, 1, 0);

/**
 * Oakvale's air and light under the World's late-afternoon sun: a pale blue
 * haze, closing in from 45 m. No flames for the light pool: outdoors, glows
 * fake every lantern and fire.
 */
export const OAKVALE_ATMOSPHERE: Atmosphere = {
  background: SKY.haze,
  fog: { color: SKY.haze, near: 45, far: 200 },
  sky: { zenith: SKY.zenith, horizon: SKY.horizon, haze: SKY.haze, sun: SKY.sun },
  sun: { color: LIGHT.sun, intensity: 2.3 },
  hemisphere: { sky: LIGHT.sky, ground: LIGHT.ground, intensity: 1.5 },
  farPlane: 240,
  flames: [],
};

/**
 * Oakvale, the starting zone (see layout.ts for what's where). Static
 * geometry is merged into 40 m chunks with the shared model material, so the
 * frustum culls whole chunks and each visible one is a single draw call. The
 * World lights it and gives it its sky; lanterns and fires fake their light
 * with glow billboards.
 */
export function buildForest(): Zone {
  const layout = buildLayout();
  const root = new Group();
  root.name = 'forest';

  const chunks = new Chunks(FOREST.half, 40);
  addTerrain(chunks, layout);
  addPaths(chunks, layout);
  addPatches(chunks, layout);

  // Plants are stamped from prototypes; the mountains past the play area get cheaper trees.
  const near = plantPrototypes();
  const far = plantPrototypes(true);
  const m = new Matrix4();
  const q = new Quaternion();
  for (const p of layout.plants) {
    const outside = Math.abs(p.x) > FOREST.play + 6 || Math.abs(p.z) > FOREST.play + 6;
    const variants = (outside ? far : near)[p.kind];
    m.compose(new Vector3(p.x, p.y, p.z), q.setFromAxisAngle(UP, p.yaw), new Vector3(p.scale, p.scale, p.scale));
    chunks.at(p.x, p.z).stamp(variants[p.seed % variants.length], m.clone(), 0.92 + ((p.seed >> 4) % 17) / 100);
  }
  const identity = new Matrix4();
  for (const f of layout.fields) {
    const b = new ModelBuilder(3);
    buildField(b, f, layout.heightAt);
    chunks.at(f.x, f.z).stamp(b.build(), identity);
  }
  for (const fence of layout.fences) {
    const b = new ModelBuilder(4);
    buildFence(b, fence, layout.heightAt);
    chunks.at(fence[0][0], fence[0][1]).stamp(b.build(), identity);
  }

  const glows = new Glows();
  const spinners: Mesh[] = [];
  for (const s of layout.structures) {
    const place = new Matrix4().makeRotationY(s.yaw).setPosition(s.x, s.y, s.z);
    const geometry = buildStructure(s, {
      layout,
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
    });
    chunks.at(s.x, s.z).stamp(geometry, place);
  }

  root.add(...chunks.meshes(sharedModelMaterial()), ...spinners, glows.mesh);
  const water = buildWater(layout);
  root.add(water.mesh);

  let time = 0;
  const { play } = FOREST;
  return {
    kind: 'zone',
    id: 'forest',
    root,
    atmosphere: OAKVALE_ATMOSPHERE,
    spawn: layout.spawn,
    camps: layout.camps,
    respawns: layout.respawns,
    hale: layout.hale,
    bounds: { minX: -play, maxX: play, minZ: -play, maxZ: play },
    landmarks: layout.landmarks,
    heightAt: layout.heightAt,
    resolve: (p, radius) => layout.colliders.resolve(p, radius),
    update(dt: number, camera: Camera) {
      time += dt;
      glows.update(time, camera);
      water.update(dt);
      for (const s of spinners) s.rotation.z -= dt * 0.35;
    },
  };
}
