import { Color, Group, Matrix4, Mesh, MeshLambertMaterial, Vector3 } from 'three';
import { TreeCover } from '../../world/ambience';
import { Glows } from '../../world/glows';
import { fbm, lerp, smoothstep } from '../forest/noise';
import { MeshBuffer } from '../forest/terrain';
import type { Zone } from '../types';
import { aldhavenChunks, buildAldhavenChunk } from './chunks';
import { CITY_GROUND, CITY_WATER } from './palette';
import { ALDHAVEN, ALDHAVEN_ATMOSPHERE, type AldhavenPlan, planAldhaven } from './plan';

/**
 * Aldhaven, the capital (see plan.ts for what's where): its plan, its chunk
 * builder (chunks.ts), and the extras built once on the main thread: the
 * water (the river, the harbour, the tidal flats and the sea out to the fog,
 * and the King's Garden's pond) and the glows of the harbour light, the
 * Collegium's lamp room, the Great Forge's hearth and the cathedral's gilt
 * sunburst; and the Greyspine's feet past its north edge, the gorge going on
 * up into them. Its own air is the harbour's: the wind off the sea, the
 * surf, the gulls; the river, the quays, the forge and the windmill sound
 * where they are. Nothing lives here yet and nothing can hurt you: no camps,
 * no people, nowhere to wake, no interiors. It meets Brackenmoor on its west
 * edge, over the Kingsroad, and the Sallows on its south, over the causeway.
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
  root.add(water, buildBackdrop(plan), glows.mesh);

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
    seams: [plan.southSeam],
    sideSeams: [plan.westSeam],
    atmosphere: ALDHAVEN_ATMOSPHERE,
    spawn: plan.spawn,
    camps: [],
    interiors: [],
    mine: null,
    villagers: [],
    people: [],
    // Within 100 m the cathedral front and the Aldbridge break the frame budget; within 50 m every
    // spot fits, and the busiest circle has 45 people (aldhaven-inhabitants.md).
    crowd: { near: 50, most: 45 },
    respawnPoints: [],
    pickups: [],
    chests: [],
    spots: [],
    sounds: plan.sounds,
    trees: new TreeCover(plan.trees),
    ambience: 'harbour',
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
 * the open sea east, on out past the land into the fog; and the pond in the
 * King's Garden at its own height.
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
  // On past the land: the sea to the east and round its north-east corner. South is the Sallows, with its own water.
  const far = 3000;
  const sea = shades[3];
  const coast = land.minX + (ALDHAVEN.coast - ALDHAVEN.land.minX) + 4;
  quad(land.maxX, land.minZ - far, land.maxX + far, land.maxZ, sea);
  quad(coast, land.minZ - far, land.maxX, land.minZ, sea);
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

/**
 * The Greyspine's feet past the north edge, where no zone is yet: one mesh,
 * its first row the city's own ground along its edge vertex for vertex, rising
 * north into grey fells, bare rock higher, snow on the tops; the gorge going on
 * up into them out of the north-west, the Ald in it; down to the sea in the
 * east. Seen, never walked: it lies past where you can go.
 */
function buildBackdrop(plan: AldhavenPlan): Mesh {
  const { ground, land } = plan;
  const { at, gorge, ald, coast } = ALDHAVEN;
  const raw = new MeshBuffer();
  const reach = 180;
  const dz = 4;
  // A few columns on west of the edge, tucked under Brackenmoor's moor where it reaches north past the Kingsroad's seam.
  const tuck = 5;
  const cols = ground.cols + tuck;
  const rows = Math.round(reach / dz) + 1;
  const xAt = (i: number) => ground.x(i - tuck);
  // The gorge's line north of the edge, in the city's frame: on from the Ald's, bending north-west.
  const gorgeX = (d: number) => ald.line[0][0] - 0.12 * d - 0.0009 * d * d;
  const heightAt = (i: number, d: number): number => {
    const wx = xAt(i);
    const x = wx - at.x;
    const z = land.minZ - d;
    // The fells: great masses rising north, sharp ridges between, highest in the west over the gorge, down to the sea in the east.
    const mass = fbm(wx * 0.009, z * 0.009, 241);
    const ridge = 1 - Math.abs(2 * fbm(wx * 0.022, z * 0.022, 243) - 1);
    const fell = 16 + smoothstep(0, 150, d) * (28 + 52 * mass) + 20 * ridge * smoothstep(10, 70, d);
    const east = smoothstep(coast + 10, coast - 50, x);
    // The gorge: its floor and the river in it, between cliffs.
    const off = Math.abs(x - gorgeX(d));
    const half = gorge.half - 4 * smoothstep(0, 80, d);
    const floor = 2.6 + 0.06 * d;
    const bed = lerp(-3, floor, smoothstep(ald.half - 1, ald.half + 2.5, off));
    let h = lerp(fell * east - 6 * (1 - east), bed, smoothstep(half + 12, half, off));
    // Low along the west, under the moor's edge (Brackenmoor's land reaches 80 m north of ours there).
    const west = smoothstep(land.minX - 10, land.minX + 40, wx);
    h = lerp(26, h, lerp(west, 1, smoothstep(70, 100, d)));
    // Blended from the city's own edge, vertex for vertex along it.
    const edge = i >= tuck ? ground.get(i - tuck, 0) : 26;
    return lerp(edge, h, smoothstep(0, 24, d));
  };
  const h = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) h[j * cols + i] = heightAt(i, j * dz);
  const grass = new Color(CITY_GROUND.grassDry);
  const rock = new Color(CITY_GROUND.granite);
  const rockDark = new Color(CITY_GROUND.graniteDark);
  const snow = new Color(0xe8ecf0);
  const mud = new Color(CITY_GROUND.mud);
  const col = new Color();
  const v = (i: number, j: number): [number, number, number] => [xAt(i), h[j * cols + i], land.minZ - j * dz];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = v(i, j);
      const b = v(i + 1, j);
      const c = v(i, j + 1);
      const d = v(i + 1, j + 1);
      for (const [p, q, r] of [
        [a, c, b],
        [b, c, d],
      ] as const) {
        const y = (p[1] + q[1] + r[1]) / 3;
        const ux = q[0] - p[0];
        const uy = q[1] - p[1];
        const uz = q[2] - p[2];
        const wx = r[0] - p[0];
        const wy = r[1] - p[1];
        const wz = r[2] - p[2];
        const nx = uy * wz - uz * wy;
        const ny = uz * wx - ux * wz;
        const nz = ux * wy - uy * wx;
        const up = Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1);
        col.copy(grass).lerp(rock, smoothstep(0.85, 0.6, up)).lerp(rockDark, smoothstep(0.6, 0.35, up) * 0.6);
        col.lerp(rock, smoothstep(40, 60, y) * 0.7).lerp(snow, smoothstep(68, 82, y) * smoothstep(0.45, 0.7, up));
        if (y < 0.4) col.lerp(mud, 0.8);
        raw.tri(p, q, r, col.clone().multiplyScalar(0.94 + 0.12 * fbm(p[0] * 0.2, p[2] * 0.2, 247)));
      }
    }
  }
  // The Ald in the gorge, at the water line.
  const water = new Color(CITY_WATER.harbour);
  const y = ALDHAVEN.water;
  for (let j = 0; j < rows - 1; j++) {
    const [d0, d1] = [j * dz, (j + 1) * dz];
    const [x0, x1] = [gorgeX(d0) + at.x, gorgeX(d1) + at.x];
    const w = ald.half + 1;
    const [z0, z1] = [land.minZ - d0, land.minZ - d1];
    // Wound as the ground's are, its rows running north.
    raw.tri([x0 - w, y, z0], [x1 - w, y, z1], [x0 + w, y, z0], water);
    raw.tri([x0 + w, y, z0], [x1 - w, y, z1], [x1 + w, y, z1], water);
  }
  const mesh = new Mesh(raw.geometry(), new MeshLambertMaterial({ vertexColors: true }));
  mesh.name = 'aldhaven-greyspine';
  return mesh;
}
