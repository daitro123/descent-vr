import { Color, Group, Matrix4, Mesh, MeshLambertMaterial, Vector3 } from 'three';
import { TreeCover } from '../../world/ambience';
import { Glows } from '../../world/glows';
import { smoothstep } from '../forest/noise';
import { MeshBuffer } from '../forest/terrain';
import type { Zone } from '../types';
import { aldhavenChunks, buildAldhavenChunk } from './chunks';
import { CITY_WATER } from './palette';
import { ALDHAVEN, ALDHAVEN_ATMOSPHERE, type AldhavenPlan, planAldhaven } from './plan';

/**
 * Aldhaven, the capital (see plan.ts for what's where): its plan, its chunk
 * builder (chunks.ts), and the extras built once on the main thread: the
 * water (the river, the harbour, the tidal flats and the sea out to the fog,
 * and the King's Garden's pond) and the glows of the harbour light, the
 * Collegium's lamp room, the Great Forge's hearth and the cathedral's gilt
 * sunburst. Nothing lives here yet and nothing can hurt you: no camps, no
 * people, nowhere to wake, no interiors. It joins no neighbour yet.
 */
export function buildAldhaven(given?: AldhavenPlan): Zone {
  const plan = given ?? planAldhaven();
  const root = new Group();
  root.name = 'aldhaven';

  const water = buildWater(plan);
  const glows = new Glows(8);
  const glowAt = (kind: string, local: [number, number, number], size: number, color: number) => {
    for (const p of plan.pieces) {
      if (p.kind !== kind) continue;
      const at = new Vector3(...local).applyMatrix4(new Matrix4().makeRotationY(p.yaw).setPosition(p.x, p.y, p.z));
      glows.add(at.x, at.y, at.z, size, color);
    }
  };
  glowAt('lighthouse', [0, 21.7, 0], 7, 0xffd680);
  glowAt('collegium', [3.5, 28.5, 0], 6, 0xcfe8ff);
  glowAt('forge', [-4, 2.2, -2.7], 3, 0xff7a2a);
  glowAt('cathedral', [0, 48.6, 18], 4, 0xffe08a);
  root.add(water, glows.mesh);

  let time = 0;
  return {
    kind: 'zone',
    id: 'aldhaven',
    label: 'Aldhaven',
    root,
    chunks: {
      keys: aldhavenChunks(),
      build: (key, detail) => buildAldhavenChunk(plan, key, detail),
      // The worker plans the city afresh, so it's only the same city when this one was too.
      worker: given ? undefined : () => new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module', name: 'aldhaven-chunks' }),
    },
    walkable: plan.walkable,
    land: plan.land,
    seams: [],
    atmosphere: ALDHAVEN_ATMOSPHERE,
    spawn: plan.spawn,
    camps: [],
    interiors: [],
    mine: null,
    villagers: [],
    pickups: [],
    chests: [],
    spots: [],
    sounds: [],
    trees: new TreeCover(plan.trees),
    ambience: 'woods',
    bounds: plan.walkable.bounds,
    landmarks: plan.landmarks,
    heightAt: plan.heightAt,
    resolve: (p, radius) => plan.colliders.resolve(p, radius),
    collide: (p, radius) => plan.colliders.pushOut(p, radius),
    update(dt, camera) {
      time += dt;
      glows.update(time, camera);
    },
  };
}

/**
 * The water: one flat sheet at the water line over every stretch of ground
 * below it (merged along each row of the height grid), deeper the darker;
 * the open sea east, and the fens' water south, on out past the land into
 * the fog; and the pond in the King's Garden at its own height.
 */
function buildWater(plan: AldhavenPlan): Mesh {
  const { ground, land, pond } = plan;
  const y = ALDHAVEN.water;
  const raw = new MeshBuffer();
  const shades = [CITY_WATER.flats, CITY_WATER.shallow, CITY_WATER.harbour, CITY_WATER.deep].map((h) => new Color(h));
  const shadeOf = (depth: number) => (depth < 0.8 ? 0 : depth < 2 ? 1 : depth < 4 ? 2 : 3);
  const quad = (x0: number, z0: number, x1: number, z1: number, col: Color) => {
    raw.tri([x0, y, z0], [x1, y, z0], [x0, y, z1], col);
    raw.tri([x1, y, z0], [x1, y, z1], [x0, y, z1], col);
  };
  for (let j = 0; j < ground.rows - 1; j++) {
    let start = -1;
    let shade = -1;
    const flush = (end: number) => {
      if (start >= 0) quad(ground.x(start), ground.z(j), ground.x(end), ground.z(j + 1), shades[shade]);
      start = -1;
    };
    for (let i = 0; i < ground.cols - 1; i++) {
      const hs = [ground.get(i, j), ground.get(i + 1, j), ground.get(i, j + 1), ground.get(i + 1, j + 1)];
      if (Math.min(...hs) >= y) {
        flush(i);
        continue;
      }
      const s = shadeOf(y - (hs[0] + hs[1] + hs[2] + hs[3]) / 4);
      if (start >= 0 && s !== shade) flush(i);
      if (start < 0) [start, shade] = [i, s];
    }
    flush(ground.cols - 1);
  }
  // On past the land: the sea to the east (and round its corners), the fens' water to the south.
  const far = 500;
  const sea = shades[3];
  const coast = land.minX + (ALDHAVEN.coast - ALDHAVEN.land.minX) + 4;
  quad(land.maxX, land.minZ - far, land.maxX + far, land.maxZ + far, sea);
  quad(coast, land.minZ - far, land.maxX, land.minZ, sea);
  quad(land.minX - far, land.maxZ, land.maxX, land.maxZ + far, shades[1]);
  // The pond, a disc at its own height.
  const col = new Color(CITY_WATER.harbour).lerp(new Color(0x4f7a5a), smoothstep(0, 1, 0.4));
  const n = 16;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2;
    const a1 = ((k + 1) / n) * Math.PI * 2;
    const r = pond.r - 0.1;
    raw.tri([pond.x, pond.y, pond.z], [pond.x + Math.sin(a1) * r, pond.y, pond.z + Math.cos(a1) * r], [pond.x + Math.sin(a0) * r, pond.y, pond.z + Math.cos(a0) * r], col);
  }
  const mesh = new Mesh(raw.geometry(), new MeshLambertMaterial({ vertexColors: true, emissive: 0x0c1c24 }));
  mesh.name = 'aldhaven-water';
  return mesh;
}
