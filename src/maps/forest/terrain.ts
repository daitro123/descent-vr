import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  LinearMipmapLinearFilter,
  Mesh,
  MeshLambertMaterial,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Material,
  Matrix4,
  type Texture,
  Vector3,
} from 'three';
import { FOREST, type ForestLayout, worldToLocal } from './layout';
import { mulberry32, smoothstep, valueNoise } from './noise';
import { EARTH, GREEN, WATER } from './palette';

// Ground, dirt roads and water. The ground is a height-field mesh with one
// colour per triangle (the same faceted look as the models), cut into square
// chunks so the headset only draws the ones in view. Each chunk also carries
// every tree and building standing on it: one draw call per chunk.

const _c = new Color();
const _n = new Vector3();

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

  /** A copy of `g` (a built kit model) placed by `m`, its colours scaled by `tint`. */
  stamp(g: BufferGeometry, m: Matrix4, tint = 1): void {
    this.stamps.push({ g, m, tint });
  }

  geometry(): BufferGeometry {
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
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('normal', new BufferAttribute(nrm, 3));
    geo.setAttribute('color', new BufferAttribute(col, 3));
    geo.setAttribute('fx', new BufferAttribute(fx, 2));
    geo.setAttribute('uv', new BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    return geo;
  }
}

/** Square chunks of the map, each gathering its ground, plants and buildings into one mesh. */
export class Chunks {
  readonly count: number;
  private readonly buffers: MeshBuffer[];

  constructor(
    private readonly half: number,
    private readonly size: number,
  ) {
    this.count = Math.ceil((2 * half) / size);
    this.buffers = Array.from({ length: this.count * this.count }, () => new MeshBuffer());
  }

  /** The chunk that owns the point (x, z). */
  at(x: number, z: number): MeshBuffer {
    const clamp = (v: number) => Math.min(this.count - 1, Math.max(0, Math.floor((v + this.half) / this.size)));
    return this.buffers[clamp(z) * this.count + clamp(x)];
  }

  meshes(material: Material): Mesh[] {
    return this.buffers.flatMap((b, i) => {
      if (b.empty) return [];
      const mesh = new Mesh(b.geometry(), material);
      mesh.name = `forest-chunk-${i}`;
      mesh.matrixAutoUpdate = false;
      return [mesh];
    });
  }
}

// ------------------------------------------------------------------ ground

export function addTerrain(chunks: Chunks, layout: ForestLayout): void {
  const { ground, fields, plants } = layout;
  const { n, cell, half } = ground;
  const { water } = FOREST;

  // Per-vertex extras: shade under canopies, and how close a road is.
  const shade = new Float32Array(n * n);
  for (const t of plants) {
    const reach = t.kind === 'oak' || t.kind === 'goldOak' ? 3 * t.scale : t.kind === 'pine' ? 2.3 * t.scale : t.kind === 'young' ? 1.3 : 0;
    if (!reach) continue;
    const i0 = Math.max(0, Math.floor((t.x - reach + half) / cell));
    const i1 = Math.min(n - 1, Math.ceil((t.x + reach + half) / cell));
    const j0 = Math.max(0, Math.floor((t.z - reach + half) / cell));
    const j1 = Math.min(n - 1, Math.ceil((t.z + reach + half) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(-half + i * cell - t.x, -half + j * cell - t.z);
        if (d < reach) shade[j * n + i] += 1 - d / reach;
      }
    }
  }
  const road = new Float32Array(n * n);
  ground.each((x, z, k) => (road[k] = layout.roadDistance.at(x, z)));

  const rand = mulberry32(77);
  const grass = new Color(GREEN.grass);
  const grassLight = new Color(GREEN.grassLight);
  const grassDry = new Color(GREEN.grassDry);
  const floor = new Color(GREEN.forestFloor);
  const verge = new Color(EARTH.dirt).lerp(grass, 0.5);
  const dirtDark = new Color(EARTH.dirtDark);
  const cliff = new Color(EARTH.cliff);
  const moss = new Color(GREEN.moss);
  const rock = new Color(EARTH.rock);
  const sand = new Color(EARTH.sand);
  const mud = new Color(EARTH.mud);
  const soil = new Color(EARTH.soil);
  const color = new Color();

  const colourAt = (x: number, z: number, h: number, ny: number, sh: number, rd: number): Color => {
    color.copy(grass).lerp(grassLight, valueNoise(x * 0.09, z * 0.09, 41));
    color.lerp(grassDry, smoothstep(0.55, 0.8, valueNoise(x * 0.02, z * 0.02, 43)) * 0.6);
    color.lerp(floor, Math.min(1, sh * 0.55));
    color.lerp(dirtDark, smoothstep(0.86, 0.66, ny) * 0.7);
    color.lerp(cliff, smoothstep(0.66, 0.5, ny));
    if (h > 12) color.lerp(_c.copy(moss).lerp(rock, valueNoise(x * 0.05, z * 0.05, 47) * 0.6), smoothstep(12, 30, h) * 0.7);
    // Worn verges: the ribbon draws the road itself, this just browns the grass beside it.
    if (rd < 2) color.lerp(verge, smoothstep(2, 0, rd) * 0.5);
    color.lerp(sand, smoothstep(water + 0.4, water + 0.1, h));
    color.lerp(mud, smoothstep(water - 0.05, water - 0.4, h));
    for (const f of fields) {
      const [lx, lz] = worldToLocal(f, x, z);
      if (Math.abs(lx) < f.hw + 0.4 && Math.abs(lz) < f.hd + 0.4) color.copy(soil);
    }
    return color.multiplyScalar((1 - Math.min(0.25, sh * 0.1)) * (0.95 + rand() * 0.1));
  };

  const v = (i: number, j: number) => [-half + i * cell, ground.get(i, j), -half + j * cell];
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = v(i, j);
      const b = v(i + 1, j);
      const c = v(i, j + 1);
      const d = v(i + 1, j + 1);
      const raw = chunks.at(a[0] + cell / 2, a[2] + cell / 2);
      const ka = j * n + i;
      const kb = j * n + i + 1;
      const kc = (j + 1) * n + i;
      const kd = (j + 1) * n + i + 1;
      // The same split as HeightField.at: a-b-c and b-d-c.
      for (const [p, q, r, ks] of [
        [a, b, c, [ka, kb, kc]],
        [b, d, c, [kb, kd, kc]],
      ] as const) {
        const cx = (p[0] + q[0] + r[0]) / 3;
        const cz = (p[2] + q[2] + r[2]) / 3;
        const cy = (p[1] + q[1] + r[1]) / 3;
        const ny = faceUp(p, q, r);
        const sh = (shade[ks[0]] + shade[ks[1]] + shade[ks[2]]) / 3;
        const rd = Math.min(road[ks[0]], road[ks[1]], road[ks[2]]);
        raw.tri(p, q, r, colourAt(cx, cz, cy, ny, sh, rd));
      }
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

/**
 * Each path is a ribbon laid a few centimetres above the ground: grassy
 * edges, darker wheel ruts on the wider roads, a lighter crown.
 */
export function addPaths(chunks: Chunks, layout: ForestLayout): void {
  const { ground, bridge } = layout;
  const rand = mulberry32(5);
  const edge = new Color(EARTH.dirt).lerp(new Color(GREEN.grass), 0.2);
  const rut = new Color(EARTH.dirt).lerp(new Color(EARTH.dirtDark), 0.7);
  const crown = new Color(EARTH.dirt);
  const light = new Color(EARTH.dirtLight);
  const col = new Color();
  const onBridge = (x: number, z: number) => {
    const [lx, lz] = worldToLocal(bridge, x, z);
    return Math.abs(lx) < bridge.hw + 1 && Math.abs(lz) < bridge.hd - 0.2;
  };
  layout.paths.forEach((path, pi) => {
    const lift = 0.07 - pi * 0.006;
    const wide = path.width > 3;
    const across = wide ? [-0.5, -0.36, -0.25, 0.25, 0.36, 0.5] : [-0.5, -0.3, 0.3, 0.5];
    const strips = wide ? [edge, rut, crown, rut, edge] : [edge, crown, edge];
    const rows = path.line.map(([x, z], i) => {
      const [px, pz] = path.line[Math.max(0, i - 1)];
      const [nx, nz] = path.line[Math.min(path.line.length - 1, i + 1)];
      const len = Math.hypot(nx - px, nz - pz) || 1;
      const sx = -(nz - pz) / len;
      const sz = (nx - px) / len;
      return across.map((f, k) => {
        const ragged = k === 0 || k === across.length - 1 ? rand() * 0.35 : 0;
        const off = f * path.width + Math.sign(f) * ragged;
        const vx = x + sx * off;
        const vz = z + sz * off;
        return [vx, ground.at(vx, vz) + lift, vz];
      });
    });
    for (let i = 0; i < rows.length - 1; i++) {
      const [x, z] = path.line[i];
      if (onBridge(x, z) || onBridge(...path.line[i + 1])) continue;
      const raw = chunks.at(x, z);
      for (let k = 0; k < strips.length; k++) {
        col.copy(strips[k]);
        if (strips[k] === crown) col.lerp(light, valueNoise(x * 0.3, z * 0.3, 3) * 0.6);
        col.multiplyScalar(0.94 + rand() * 0.12);
        raw.tri(rows[i][k], rows[i + 1][k], rows[i][k + 1], col);
        raw.tri(rows[i][k + 1], rows[i + 1][k], rows[i + 1][k + 1], col);
      }
    }
  });
}

/** Worn earth where people gather: the village square, the farmyard, the camp. */
export function addPatches(chunks: Chunks, layout: ForestLayout): void {
  const patches: [number, number, number][] = [
    [0, 0, 7.5],
    [54, 27, 7],
    [-48, -42, 5],
    [40, -58, 5.5],
    [-14, -73.5, 4.5],
    [-30, 52, 3],
  ];
  const rand = mulberry32(9);
  const dirt = new Color(EARTH.dirt);
  const light = new Color(EARTH.dirtLight);
  const edge = new Color(EARTH.dirt).lerp(new Color(GREEN.grass), 0.4);
  const col = new Color();
  for (const [cx, cz, r] of patches) {
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
    const raw = chunks.at(cx, cz);
    for (let ring = 0; ring < rings.length - 1; ring++) {
      for (let s = 0; s < segs; s++) {
        const t = (s + 1) % segs;
        col.copy(ring === rings.length - 2 ? edge : dirt).lerp(light, ring === 0 ? 0.3 : rand() * 0.3).multiplyScalar(0.94 + rand() * 0.12);
        raw.tri(pts[ring][s], pts[ring + 1][s], pts[ring + 1][t], col);
        if (ring > 0) raw.tri(pts[ring][s], pts[ring + 1][t], pts[ring][t], col);
      }
    }
  }
}

// ------------------------------------------------------------------ water

let rippleTexture: Texture | null = null;

/** 32×32 ripples: a mid tone with scattered light dashes, magnified crisp like every other texture. */
function ripples(): Texture {
  if (rippleTexture) return rippleTexture;
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(3);
  ctx.fillStyle = 'rgb(214,214,214)';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 70; i++) {
    const v = rand() < 0.5 ? 255 : 190;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 2 + Math.floor(rand() * 3), 1);
  }
  const tex = new CanvasTexture(canvas);
  tex.magFilter = NearestFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  rippleTexture = tex;
  return tex;
}

/**
 * One flat sheet at the water line, only over cells where the ground dips
 * below it. Shallows are lighter than the deeps.
 */
export function buildWater(layout: ForestLayout): { mesh: Mesh; update(dt: number): void } {
  const { ground } = layout;
  const { n, cell, half } = ground;
  const { water } = FOREST;
  const raw = new MeshBuffer();
  const deep = new Color(WATER.deep);
  const shallow = new Color(WATER.shallow);
  const col = new Color();
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const hs = [ground.get(i, j), ground.get(i + 1, j), ground.get(i, j + 1), ground.get(i + 1, j + 1)];
      if (Math.min(...hs) >= water) continue;
      const x = -half + i * cell;
      const z = -half + j * cell;
      const depth = water - (hs[0] + hs[1] + hs[2] + hs[3]) / 4;
      col.copy(shallow).lerp(deep, smoothstep(0.1, 1.1, depth));
      raw.tri([x, water, z], [x + cell, water, z], [x, water, z + cell], col);
      raw.tri([x + cell, water, z], [x + cell, water, z + cell], [x, water, z + cell], col);
    }
  }
  const geometry = raw.geometry();
  const uv = geometry.getAttribute('uv') as BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3, uv.getY(i) / 3);
  const map = typeof document === 'undefined' ? null : ripples();
  const material = new MeshLambertMaterial({ vertexColors: true, map, emissive: 0x0c1c24 });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'forest-water';
  let t = 0;
  return {
    mesh,
    update(dt) {
      t += dt;
      if (map) map.offset.set(t * 0.02, Math.sin(t * 0.3) * 0.05);
    },
  };
}
