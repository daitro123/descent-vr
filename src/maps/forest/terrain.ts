import { BufferAttribute, BufferGeometry, Color, Matrix4, Vector3 } from 'three';
import { CONFIG } from '../../config';
import type { HeightGrid } from '../heightGrid';
import { FOREST, type ForestLayout, worldToLocal } from './layout';
import { hash01, mulberry32, smoothstep, valueNoise } from './noise';
import { EARTH, GREEN } from './palette';

// Ground and dirt roads, a chunk at a time. The ground is a height-field mesh
// with one colour per triangle (the same faceted look as the models); a
// stand-in's is coarser and colours the roads into it. Every random choice is
// fixed by where it is, not by what was built before, so a chunk comes out
// the same whenever and wherever it's built.

const _c = new Color();
const _n = new Vector3();

/** A chunk's square, and whether a point belongs to it. */
export interface Region {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  owns(x: number, z: number): boolean;
}

/** One merged mesh's vertices, in the model material's layout: position, normal, colour, fx and uv. */
export interface MeshArrays {
  readonly position: Float32Array;
  readonly normal: Float32Array;
  readonly color: Float32Array;
  readonly fx: Float32Array;
  readonly uv: Float32Array;
}

/**
 * The vertices of one merged mesh, in the model material's layout (position,
 * normal, colour, fx, uv). Ground triangles go in one at a time; props are
 * stamped in as transformed copies of a prototype geometry.
 */
export class MeshBuffer {
  private readonly pos: number[] = [];
  private readonly col: number[] = [];
  private readonly stamps: { g: BufferGeometry; m: Matrix4; tint: number }[] = [];

  get empty(): boolean {
    return this.pos.length === 0 && this.stamps.length === 0;
  }

  /** One ground triangle, wound to face up whatever order the corners come in. */
  tri(a: readonly number[], b: readonly number[], c: readonly number[], color: Color): void {
    const ux = b[0] - a[0];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vz = c[2] - a[2];
    const up = uz * vx - ux * vz >= 0;
    this.pos.push(...a, ...(up ? b : c), ...(up ? c : b));
    for (let i = 0; i < 3; i++) this.col.push(color.r, color.g, color.b);
  }

  /** One upright triangle, wound to face (ox, 0, oz) whatever order the corners come in. */
  wall(a: readonly number[], b: readonly number[], c: readonly number[], ox: number, oz: number, color: Color): void {
    const [ux, uy, uz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const [vx, vy, vz] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const facing = (uy * vz - uz * vy) * ox + (ux * vy - uy * vx) * oz >= 0;
    this.pos.push(...a, ...(facing ? b : c), ...(facing ? c : b));
    for (let i = 0; i < 3; i++) this.col.push(color.r, color.g, color.b);
  }

  /** A copy of `g` (a built kit model) placed by `m`, its colours scaled by `tint`. */
  stamp(g: BufferGeometry, m: Matrix4, tint = 1): void {
    this.stamps.push({ g, m, tint });
  }

  arrays(): MeshArrays {
    const own = this.pos.length / 3;
    const total = own + this.stamps.reduce((n, s) => n + s.g.getAttribute('position').count, 0);
    const pos = new Float32Array(total * 3);
    const nrm = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    const fx = new Float32Array(total * 2);
    const uv = new Float32Array(total * 2);
    pos.set(this.pos);
    col.set(this.col);
    for (let t = 0; t < own; t += 3) {
      const o = t * 3;
      _n.set(
        (pos[o + 4] - pos[o + 1]) * (pos[o + 8] - pos[o + 2]) - (pos[o + 5] - pos[o + 2]) * (pos[o + 7] - pos[o + 1]),
        (pos[o + 5] - pos[o + 2]) * (pos[o + 6] - pos[o]) - (pos[o + 3] - pos[o]) * (pos[o + 8] - pos[o + 2]),
        (pos[o + 3] - pos[o]) * (pos[o + 7] - pos[o + 1]) - (pos[o + 4] - pos[o + 1]) * (pos[o + 6] - pos[o]),
      ).normalize();
      for (let k = 0; k < 3; k++) nrm.set([_n.x, _n.y, _n.z], o + k * 3);
    }
    for (let i = 0; i < own; i++) {
      uv[i * 2] = pos[i * 3];
      uv[i * 2 + 1] = pos[i * 3 + 2];
    }
    let v = own;
    for (const { g, m, tint } of this.stamps) {
      const e = m.elements;
      const sp = g.getAttribute('position').array;
      const sn = g.getAttribute('normal').array;
      const sc = g.getAttribute('color').array;
      const sf = g.getAttribute('fx').array;
      const su = g.getAttribute('uv').array;
      const n = sp.length / 3;
      for (let i = 0; i < n; i++) {
        const x = sp[i * 3];
        const y = sp[i * 3 + 1];
        const z = sp[i * 3 + 2];
        const o = (v + i) * 3;
        pos[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
        pos[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        pos[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        // Rotation only: the material is flat-shaded and ignores these anyway.
        const nx = sn[i * 3];
        const ny = sn[i * 3 + 1];
        const nz = sn[i * 3 + 2];
        nrm[o] = e[0] * nx + e[4] * ny + e[8] * nz;
        nrm[o + 1] = e[1] * nx + e[5] * ny + e[9] * nz;
        nrm[o + 2] = e[2] * nx + e[6] * ny + e[10] * nz;
        col[o] = sc[i * 3] * tint;
        col[o + 1] = sc[i * 3 + 1] * tint;
        col[o + 2] = sc[i * 3 + 2] * tint;
      }
      fx.set(sf, v * 2);
      uv.set(su, v * 2);
      v += n;
    }
    return { position: pos, normal: nrm, color: col, fx, uv };
  }

  geometry(): BufferGeometry {
    const a = this.arrays();
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(a.position, 3));
    geo.setAttribute('normal', new BufferAttribute(a.normal, 3));
    geo.setAttribute('color', new BufferAttribute(a.color, 3));
    geo.setAttribute('fx', new BufferAttribute(a.fx, 2));
    geo.setAttribute('uv', new BufferAttribute(a.uv, 2));
    geo.computeBoundingSphere();
    return geo;
  }
}

// ------------------------------------------------------------------ ground

/** How far each kind of tree's canopy shades the ground under it (scaled by the plant's scale). */
function canopy(kind: string, scale: number): number {
  return kind === 'oak' || kind === 'goldOak' ? 3 * scale : kind === 'pine' ? 2.3 * scale : kind === 'young' ? 1.3 : 0;
}

/**
 * The ground over `region`: every height-field cell at full detail, or at a
 * stand-in's coarser spacing with the roads coloured in (it has no ribbons)
 * and a skirt round its edge. The skirt hangs below wherever the coarse edge
 * strays from the full ground beside it, so no crack opens between the two.
 */
export function addGround(raw: MeshBuffer, layout: ForestLayout, region: Region, coarse: boolean): void {
  const { ground, fields, plants, mine } = layout;
  const { n, cell, half } = ground;
  const { water } = FOREST;
  const step = coarse ? Math.round(CONFIG.streaming.standIn.cell / cell) : 1;
  const index = (v: number) => Math.min(n - 1, Math.max(0, Math.round((v + half) / cell)));
  const [i0, i1, j0, j1] = [index(region.minX), index(region.maxX), index(region.minZ), index(region.maxZ)];
  if (i1 <= i0 || j1 <= j0) return;
  const w = i1 - i0 + 1;
  const local = (i: number, j: number) => (j - j0) * w + (i - i0);

  // Per-vertex extras: shade under canopies, and how close a road is.
  const shade = new Float32Array(w * (j1 - j0 + 1));
  for (const t of plants) {
    const reach = canopy(t.kind, t.scale);
    if (!reach) continue;
    const a0 = Math.max(i0, Math.floor((t.x - reach + half) / cell));
    const a1 = Math.min(i1, Math.ceil((t.x + reach + half) / cell));
    const b0 = Math.max(j0, Math.floor((t.z - reach + half) / cell));
    const b1 = Math.min(j1, Math.ceil((t.z + reach + half) / cell));
    for (let j = b0; j <= b1; j++) {
      for (let i = a0; i <= a1; i++) {
        const d = Math.hypot(-half + i * cell - t.x, -half + j * cell - t.z);
        if (d < reach) shade[local(i, j)] += 1 - d / reach;
      }
    }
  }
  const road = new Float32Array(shade.length);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) road[local(i, j)] = layout.roadDistance.at(-half + i * cell, -half + j * cell);

  const grass = new Color(GREEN.grass);
  const grassLight = new Color(GREEN.grassLight);
  const grassDry = new Color(GREEN.grassDry);
  const floor = new Color(GREEN.forestFloor);
  const verge = new Color(EARTH.dirt).lerp(grass, 0.5);
  const dirt = new Color(EARTH.dirt);
  const dirtDark = new Color(EARTH.dirtDark);
  const cliff = new Color(EARTH.cliff);
  const moss = new Color(GREEN.moss);
  const rock = new Color(EARTH.rock);
  const sand = new Color(EARTH.sand);
  const mud = new Color(EARTH.mud);
  const soil = new Color(EARTH.soil);
  const color = new Color();

  const colourAt = (x: number, z: number, h: number, ny: number, sh: number, rd: number, jitter: number): Color => {
    color.copy(grass).lerp(grassLight, valueNoise(x * 0.09, z * 0.09, 41));
    color.lerp(grassDry, smoothstep(0.55, 0.8, valueNoise(x * 0.02, z * 0.02, 43)) * 0.6);
    color.lerp(floor, Math.min(1, sh * 0.55));
    color.lerp(dirtDark, smoothstep(0.86, 0.66, ny) * 0.7);
    color.lerp(cliff, smoothstep(0.66, 0.5, ny));
    if (h > 12) color.lerp(_c.copy(moss).lerp(rock, valueNoise(x * 0.05, z * 0.05, 47) * 0.6), smoothstep(12, 30, h) * 0.7);
    // Worn verges: the ribbon draws the road itself, this just browns the grass beside it.
    if (rd < 2) color.lerp(verge, smoothstep(2, 0, rd) * 0.5);
    // A stand-in has no ribbons, so its ground is the road.
    if (coarse && layout.roadDistance.at(x, z) < 0) color.lerp(dirt, 0.85);
    color.lerp(sand, smoothstep(water + 0.4, water + 0.1, h));
    color.lerp(mud, smoothstep(water - 0.05, water - 0.4, h));
    for (const f of fields) {
      const [lx, lz] = worldToLocal(f, x, z);
      if (Math.abs(lx) < f.hw + 0.4 && Math.abs(lz) < f.hd + 0.4) color.copy(soil);
    }
    return color.multiplyScalar((1 - Math.min(0.25, sh * 0.1)) * (0.95 + jitter * 0.1));
  };

  const v = (i: number, j: number): [number, number, number] => [-half + i * cell, ground.get(i, j), -half + j * cell];
  for (let j = j0; j < j1; j += step) {
    for (let i = i0; i < i1; i += step) {
      const a = v(i, j);
      const b = v(i + step, j);
      const c = v(i, j + step);
      const d = v(i + step, j + step);
      const ka = local(i, j);
      const kb = local(i + step, j);
      const kc = local(i, j + step);
      const kd = local(i + step, j + step);
      // The same split as HeightField.at: a-b-c and b-d-c.
      for (const [p, q, r, ks, t] of [
        [a, b, c, [ka, kb, kc], 0],
        [b, d, c, [kb, kd, kc], 1],
      ] as const) {
        // Where the mine's adit cuts into the hillside, the ground is left out.
        if (mine.cuts([p, q, r])) continue;
        const cx = (p[0] + q[0] + r[0]) / 3;
        const cz = (p[2] + q[2] + r[2]) / 3;
        const cy = (p[1] + q[1] + r[1]) / 3;
        const ny = faceUp(p, q, r);
        const sh = (shade[ks[0]] + shade[ks[1]] + shade[ks[2]]) / 3;
        const rd = Math.min(road[ks[0]], road[ks[1]], road[ks[2]]);
        raw.tri(p, q, r, colourAt(cx, cz, cy, ny, sh, rd, hash01(i, j, 77 + t + (coarse ? 2 : 0))));
      }
    }
  }
  if (coarse) addSkirt(raw, ground, [i0, i1, j0, j1], step, (x, z, y) => colourAt(x, z, y, 1, 0, Infinity, 0.5));
}

/**
 * A stand-in's skirt round grid vertices i0..i1 by j0..j1 (`step` apart):
 * down from each coarse edge by how far the full ground's midpoints stray
 * from it, and CONFIG.streaming.standIn.skirt more, coloured by `colour` at
 * each stretch's middle.
 */
export function addSkirt(
  raw: MeshBuffer,
  ground: HeightGrid,
  [i0, i1, j0, j1]: readonly [number, number, number, number],
  step: number,
  colour: (x: number, z: number, y: number) => Color,
): void {
  const drop = CONFIG.streaming.standIn.skirt;
  const v = (i: number, j: number): [number, number, number] => [ground.x(i), ground.get(i, j), ground.z(j)];
  const sides: [number, number, number, number, number, number][] = [
    // Start (i, j), step along the edge (di, dj), and which way is out (ox, oz).
    [i0, j0, 1, 0, 0, -1],
    [i0, j1, 1, 0, 0, 1],
    [i0, j0, 0, 1, -1, 0],
    [i1, j0, 0, 1, 1, 0],
  ];
  for (const [si, sj, di, dj, ox, oz] of sides) {
    const len = di ? i1 - i0 : j1 - j0;
    for (let s = 0; s < len; s += step) {
      const [ai, aj] = [si + di * s, sj + dj * s];
      const [bi, bj] = [ai + di * step, aj + dj * step];
      const a = v(ai, aj);
      const b = v(bi, bj);
      let stray = 0;
      for (let k = 1; k < step; k++) {
        const f = k / step;
        stray = Math.max(stray, Math.abs(ground.get(ai + di * k, aj + dj * k) - (a[1] + (b[1] - a[1]) * f)));
      }
      const depth = stray + drop;
      const a1 = [a[0], a[1] - depth, a[2]];
      const b1 = [b[0], b[1] - depth, b[2]];
      const col = colour((a[0] + b[0]) / 2, (a[2] + b[2]) / 2, (a[1] + b[1]) / 2);
      raw.wall(a, b, b1, ox, oz, col);
      raw.wall(a, b1, a1, ox, oz, col);
    }
  }
}

function faceUp(a: readonly number[], b: readonly number[], c: readonly number[]): number {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  return Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1);
}

// ------------------------------------------------------------------ roads and bare ground

/** Oakvale's paths, but over the bridge's deck, which is its own. */
export function addPaths(raw: MeshBuffer, layout: ForestLayout, region: Region): void {
  const { ground, bridge } = layout;
  const onBridge = (x: number, z: number) => {
    const [lx, lz] = worldToLocal(bridge, x, z);
    return Math.abs(lx) < bridge.hw + 1 && Math.abs(lz) < bridge.hd - 0.2;
  };
  addRoads(raw, ground, layout.paths, region, GREEN.grass, onBridge);
}

/**
 * Each path is a ribbon laid a few centimetres above the ground: edges
 * blending into the land's `verge` colour, darker wheel ruts on the wider
 * roads, a lighter crown. A stretch goes in the chunk its start is in, but
 * where `skip` says. A path's ends are cut square, so a road carried on over
 * a seam meets its other half.
 */
export function addRoads(
  raw: MeshBuffer,
  ground: Pick<HeightGrid, 'at'>,
  paths: readonly { readonly line: readonly (readonly [number, number])[]; readonly width: number }[],
  region: Region,
  verge: number,
  skip: (x: number, z: number) => boolean = () => false,
): void {
  const edge = new Color(EARTH.dirt).lerp(new Color(verge), 0.2);
  const rut = new Color(EARTH.dirt).lerp(new Color(EARTH.dirtDark), 0.7);
  const crown = new Color(EARTH.dirt);
  const light = new Color(EARTH.dirtLight);
  const col = new Color();
  paths.forEach((path, pi) => {
    const lift = 0.07 - pi * 0.006;
    const wide = path.width > 3;
    const across = wide ? [-0.5, -0.36, -0.25, 0.25, 0.36, 0.5] : [-0.5, -0.3, 0.3, 0.5];
    const strips = wide ? [edge, rut, crown, rut, edge] : [edge, crown, edge];
    const row = (i: number) => {
      const [x, z] = path.line[i];
      const [px, pz] = path.line[Math.max(0, i - 1)];
      const [nx, nz] = path.line[Math.min(path.line.length - 1, i + 1)];
      const len = Math.hypot(nx - px, nz - pz) || 1;
      const sx = -(nz - pz) / len;
      const sz = (nx - px) / len;
      return across.map((f, k) => {
        const end = i === 0 || i === path.line.length - 1;
        const ragged = !end && (k === 0 || k === across.length - 1) ? hash01(pi * 4096 + i, k, 5) * 0.35 : 0;
        const off = f * path.width + Math.sign(f) * ragged;
        const vx = x + sx * off;
        const vz = z + sz * off;
        return [vx, ground.at(vx, vz) + lift, vz];
      });
    };
    for (let i = 0; i < path.line.length - 1; i++) {
      const [x, z] = path.line[i];
      if (!region.owns(x, z)) continue;
      if (skip(x, z) || skip(...path.line[i + 1])) continue;
      const [here, next] = [row(i), row(i + 1)];
      for (let k = 0; k < strips.length; k++) {
        col.copy(strips[k]);
        if (strips[k] === crown) col.lerp(light, valueNoise(x * 0.3, z * 0.3, 3) * 0.6);
        col.multiplyScalar(0.94 + hash01(pi * 4096 + i, k, 6) * 0.12);
        raw.tri(here[k], next[k], here[k + 1], col);
        raw.tri(here[k + 1], next[k], next[k + 1], col);
      }
    }
  });
}

/** Worn earth where people gather: the village square, the farmyard, the camp. */
const PATCHES: readonly (readonly [number, number, number])[] = [
  [0, 0, 7.5],
  [54, 27, 7],
  [-48, -42, 5],
  [40, -58, 5.5],
  [-14, -73.5, 4.5],
  [-30, 52, 3],
];

/** Each patch of worn earth whose middle is in `region`. */
export function addPatches(raw: MeshBuffer, layout: ForestLayout, region: Region): void {
  const dirt = new Color(EARTH.dirt);
  const light = new Color(EARTH.dirtLight);
  const edge = new Color(EARTH.dirt).lerp(new Color(GREEN.grass), 0.4);
  const col = new Color();
  PATCHES.forEach(([cx, cz, r], index) => {
    if (!region.owns(cx, cz)) return;
    const rand = mulberry32(9 + index * 7919);
    const segs = 28;
    const rings = [0, 0.45, 0.8, 1];
    const pts = rings.map((f) =>
      Array.from({ length: segs }, (_, s) => {
        const a = (s / segs) * Math.PI * 2;
        const rr = r * f * (f === 1 ? 0.9 + rand() * 0.2 : 1);
        const x = cx + Math.cos(a) * rr;
        const z = cz + Math.sin(a) * rr;
        return [x, layout.ground.at(x, z) + 0.04, z];
      }),
    );
    for (let ring = 0; ring < rings.length - 1; ring++) {
      for (let s = 0; s < segs; s++) {
        const t = (s + 1) % segs;
        col.copy(ring === rings.length - 2 ? edge : dirt).lerp(light, ring === 0 ? 0.3 : rand() * 0.3).multiplyScalar(0.94 + rand() * 0.12);
        raw.tri(pts[ring][s], pts[ring + 1][s], pts[ring + 1][t], col);
        if (ring > 0) raw.tri(pts[ring][s], pts[ring + 1][t], pts[ring][t], col);
      }
    }
  });
}
