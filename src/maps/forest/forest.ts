import { type Camera, DirectionalLight, Group, HemisphereLight, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { ModelBuilder } from '../../models/kit';
import { sharedModelMaterial } from '../../models/materials';
import { Glows } from '../../world/glows';
import type { GameMap } from '../types';
import { buildFence, buildField, buildStructure } from './buildings';
import { buildLayout, FOREST } from './layout';
import { plantPrototypes } from './nature';
import { SKY } from './palette';
import { buildSky } from './sky';
import { addPaths, addPatches, addTerrain, buildWater, Chunks } from './terrain';

const UP = new Vector3(0, 1, 0);

/** Late-afternoon sun from the south-west, low enough to rake across the hills. */
const SUN = new Vector3(-0.55, 0.62, 0.56).normalize();

/**
 * Oakvale, the outdoor map (see layout.ts for what's where). Static geometry
 * is merged into 40 m chunks with the shared model material, so the frustum
 * culls whole chunks and each visible one is a single draw call. Lighting is
 * one sun and a sky/ground hemisphere; lanterns and fires fake their light
 * with glow billboards.
 */
export function buildForest(): GameMap {
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
  const sky = buildSky(SUN);
  root.add(water.mesh, sky.root);

  root.add(new HemisphereLight(0xd4e4f4, 0x5e6e3e, 1.5));
  const sun = new DirectionalLight(0xfff0d4, 2.3);
  sun.position.copy(SUN).multiplyScalar(100);
  root.add(sun);

  let time = 0;
  const { play } = FOREST;
  return {
    id: 'forest',
    root,
    sky: { background: SKY.haze, fog: { color: SKY.haze, near: 45, far: 200 } },
    viewDistance: 240,
    spawn: layout.spawn,
    bounds: { minX: -play, maxX: play, minZ: -play, maxZ: play },
    landmarks: layout.landmarks,
    heightAt: layout.heightAt,
    resolve: (p, radius) => layout.colliders.resolve(p, radius),
    update(dt: number, camera: Camera) {
      time += dt;
      glows.update(time, camera);
      sky.update(dt, camera);
      water.update(dt);
      for (const s of spinners) s.rotation.z -= dt * 0.35;
    },
  };
}
