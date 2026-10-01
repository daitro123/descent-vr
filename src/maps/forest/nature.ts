import { BufferAttribute, BufferGeometry, ConeGeometry, CylinderGeometry, DodecahedronGeometry, IcosahedronGeometry } from 'three';
import { ModelBuilder, type Vec3 } from '../../models/kit';
import type { Plant, PlantKind } from './layout';
import { mulberry32 } from './noise';
import { CROP, EARTH, FLOWERS, GREEN } from './palette';

// Trees, rocks and undergrowth. Each kind is modelled a few times over at the
// origin (different shapes and colours), and the map stamps copies of those
// prototypes, turned and scaled, into its chunks: thousands of trees without
// modelling thousands of trees.

const PI = Math.PI;

/** How many differently shaped and coloured copies of each kind to model. */
const VARIANTS: Record<PlantKind, number> = {
  oak: 6, goldOak: 3, pine: 5, young: 3, bush: 4, rock: 5, grass: 3, flower: 6,
  mushroom: 2, log: 2, stump: 1, reed: 3, lily: 2, fern: 3, crag: 4, meadow: 4, bloom: 6,
};

export type Prototypes = Record<PlantKind, BufferGeometry[]>;

/**
 * Every plant kind's variants, at the origin with scale 1 and facing +Z.
 * `lite` builds cheaper trees for the mountains past the play area.
 */
export function plantPrototypes(lite = false): Prototypes {
  const out = {} as Prototypes;
  for (const kind of Object.keys(VARIANTS) as PlantKind[]) {
    out[kind] = Array.from({ length: VARIANTS[kind] }, (_, v) => {
      const b = new ModelBuilder(100 + v);
      buildPlant(b, { kind, x: 0, y: 0, z: 0, yaw: 0, scale: 1, seed: 1000 + v * 7919 + kind.length }, lite, v);
      return b.build();
    });
  }
  return out;
}

/** An open-ended cylinder: trunks, whose caps are always hidden in the ground or the canopy. */
function trunk(b: ModelBuilder, rTop: number, rBottom: number, h: number, segs: number, at: Vec3, color: number): void {
  b.shape(new CylinderGeometry(rTop, rBottom, h, segs, 1, true), { at, color, jitter: 0.12 });
}

/** A squashed low-poly ball: canopies, bushes, boulders. */
function blob(b: ModelBuilder, r: number, squash: number, at: Vec3, color: number, spin: number, jitter = 0.09): void {
  const g = new IcosahedronGeometry(r, 0);
  g.scale(1, squash, 1);
  b.shape(g, { at, rot: [spin * 0.7, spin, spin * 0.3], color, jitter });
}

function pick<T>(list: readonly T[], r: number): T {
  return list[Math.floor(r * list.length) % list.length];
}

function buildPlant(b: ModelBuilder, p: Plant, lite: boolean, variant: number): void {
  const rand = mulberry32(p.seed);
  switch (p.kind) {
    case 'oak':
      return oak(b, p, rand, GREEN.leaf, lite);
    case 'goldOak':
      return oak(b, p, rand, GREEN.leafGold, lite);
    case 'pine':
      return pine(b, p, rand, lite);
    case 'young':
      return young(b, p, rand);
    case 'bush':
      return bush(b, p, rand);
    case 'rock':
      return rock(b, p, rand);
    case 'grass':
      return grass(b, p, rand);
    case 'flower':
      return flowers(b, p, rand, FLOWERS[variant % FLOWERS.length]);
    case 'mushroom':
      return mushrooms(b, p, rand);
    case 'log':
      return log(b, p);
    case 'stump':
      return stump(b, p.x, p.y, p.z, p.scale);
    case 'reed':
      return reeds(b, p, rand);
    case 'lily':
      return lily(b, p, rand);
    case 'fern':
      return fern(b, p, rand);
    case 'crag':
      return crag(b, p, rand);
    case 'meadow':
      return meadow(b, p, rand, variant);
    case 'bloom':
      return bloom(b, p, rand, FLOWERS[variant % FLOWERS.length]);
  }
}

/** A broad-leaved tree: a stout trunk, two limbs and a clump of leafy blobs. */
function oak(b: ModelBuilder, p: Plant, rand: () => number, leaves: readonly number[], lite: boolean): void {
  const { x, y, z, scale: s, yaw } = p;
  const trunkH = (2.8 + rand() * 0.9) * s;
  trunk(b, 0.24 * s, 0.38 * s, trunkH, lite ? 4 : 6, [x, y + trunkH / 2 - 0.1, z], EARTH.bark);
  if (!lite) trunk(b, 0.4 * s, 0.56 * s, 0.5 * s, 6, [x, y + 0.12 * s, z], EARTH.barkDark);
  for (let k = 0; k < (lite ? 0 : 2); k++) {
    const a = yaw + k * 2.6 + rand() * 0.5;
    b.bar(
      [x, y + trunkH * 0.75, z],
      [x + Math.cos(a) * 1.3 * s, y + trunkH + 0.8 * s, z + Math.sin(a) * 1.3 * s],
      0.16 * s,
      0.16 * s,
      { color: EARTH.bark },
    );
  }
  const top = y + trunkH + 1.2 * s;
  const clumps: [number, number, number, number][] = lite
    ? [
        [0, 0.4, 0, 2.2],
        [0.6, -0.2, 0.9, 1.6],
      ]
    : [
        [0, 0.6, 0, 1.9],
        [1.35, -0.1, 0.3, 1.5],
        [-1.15, 0, 0.85, 1.55],
        [-0.2, -0.2, -1.3, 1.55],
      ];
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  for (const [cx, cy, cz, r] of clumps) {
    const rr = r * s * (0.9 + rand() * 0.25);
    blob(b, rr, 0.78, [x + (cx * c + cz * sn) * s, top + cy * s, z + (-cx * sn + cz * c) * s], pick(leaves, rand()), rand() * PI);
  }
}

/** A fir: a slim trunk under stacked cones. */
function pine(b: ModelBuilder, p: Plant, rand: () => number, lite: boolean): void {
  const { x, y, z, scale: s, yaw } = p;
  trunk(b, 0.13 * s, 0.26 * s, 2.4 * s, lite ? 4 : 5, [x, y + 1.1 * s, z], EARTH.barkDark);
  const tiers = lite ? 3 : 4;
  for (let i = 0; i < tiers; i++) {
    const r = (2.2 - i * (lite ? 0.6 : 0.45)) * s * (0.92 + rand() * 0.16);
    const h = (2.7 - i * 0.2) * s * (lite ? 1.3 : 1);
    b.cone(r, h, lite ? 5 : 6, {
      at: [x, y + (1.7 + i * (lite ? 2 : 1.55)) * s + h / 2, z],
      rot: [0, yaw + i * 0.45, 0],
      color: GREEN.pine[(i + Math.floor(rand() * 3)) % 3],
      jitter: 0.1,
    });
  }
}

/** A sapling: a thin trunk and two small blobs. */
function young(b: ModelBuilder, p: Plant, rand: () => number): void {
  const { x, y, z, scale: s } = p;
  trunk(b, 0.08 * s, 0.13 * s, 2.2 * s, 5, [x, y + 1.1 * s, z], EARTH.bark);
  blob(b, 0.95 * s, 0.85, [x, y + 2.6 * s, z], pick(GREEN.young, rand()), rand() * PI);
  blob(b, 0.7 * s, 0.85, [x + 0.4 * s, y + 3.2 * s, z - 0.2 * s], pick(GREEN.leaf, rand()), rand() * PI);
}

function bush(b: ModelBuilder, p: Plant, rand: () => number): void {
  const { x, y, z, scale: s, yaw } = p;
  const n = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < n; i++) {
    const a = yaw + (i / n) * PI * 2;
    const r = (0.55 + rand() * 0.3) * s;
    blob(b, r, 0.75, [x + Math.cos(a) * 0.45 * s, y + r * 0.55, z + Math.sin(a) * 0.45 * s], pick(GREEN.leaf, rand()), rand() * PI);
  }
  if (rand() < 0.3) {
    for (let i = 0; i < 5; i++) {
      const a = rand() * PI * 2;
      b.box(0.07, 0.07, 0.07, { at: [x + Math.cos(a) * 0.6 * s, y + (0.4 + rand() * 0.5) * s, z + Math.sin(a) * 0.6 * s], color: 0xb8302a, jitter: 0 });
    }
  }
}

function rock(b: ModelBuilder, p: Plant, rand: () => number): void {
  const { x, y, z, scale: s, yaw } = p;
  const r = 0.8 * s;
  blob(b, r, 0.62, [x, y + r * 0.25, z], rand() < 0.3 ? GREEN.moss : pick([EARTH.rock, EARTH.rockDark], rand()), yaw, 0.12);
  if (rand() < 0.5) {
    const a = yaw + 1.3;
    blob(b, r * 0.5, 0.7, [x + Math.cos(a) * r * 0.9, y + r * 0.1, z + Math.sin(a) * r * 0.9], EARTH.rock, yaw * 2, 0.12);
  }
}

/** A tuft of three blades. */
function grass(b: ModelBuilder, p: Plant, rand: () => number): void {
  const { x, y, z, scale: s, yaw } = p;
  for (let i = 0; i < 3; i++) {
    const a = yaw + i * 2.1;
    const h = (0.32 + rand() * 0.22) * s;
    const g = new ConeGeometry(0.05 * s, h, 3, 1, true);
    b.shape(g, {
      at: [x + Math.cos(a) * 0.06, y + h / 2 - 0.02, z + Math.sin(a) * 0.06],
      rot: [Math.sin(a) * 0.25, a, Math.cos(a) * 0.25],
      color: rand() < 0.5 ? GREEN.grassLight : GREEN.grass,
      jitter: 0.12,
    });
  }
}

/**
 * A clump of long meadow grass: blades in two rings leaning out, a few gone
 * dry at the top, and on every other variant a couple of seed stalks.
 */
function meadow(b: ModelBuilder, p: Plant, rand: () => number, variant: number): void {
  const { x, y, z, scale: s, yaw } = p;
  const blades = 7;
  for (let i = 0; i < blades; i++) {
    const outer = i >= 3;
    const a = yaw + (outer ? (i - 3) * 1.57 + 0.6 : i * 2.09) + (rand() - 0.5) * 0.5;
    const h = (outer ? 0.32 + rand() * 0.2 : 0.48 + rand() * 0.26) * s;
    const lean = (outer ? 0.4 : 0.18) + rand() * 0.15;
    const r = (outer ? 0.16 : 0.05) * s;
    const g = new ConeGeometry(0.045 * s, h, 3, 1, true);
    const shade = rand();
    b.shape(g, {
      at: [x + Math.cos(a) * (r + Math.sin(lean) * h * 0.5), y + (h / 2) * Math.cos(lean) - 0.03, z + Math.sin(a) * (r + Math.sin(lean) * h * 0.5)],
      rot: [Math.sin(a) * lean, 0, -Math.cos(a) * lean],
      color: shade < 0.2 ? GREEN.grassDry : shade < 0.55 ? GREEN.grassLight : shade < 0.85 ? GREEN.grass : GREEN.grassDark,
      jitter: 0.1,
    });
  }
  if (variant % 2 === 1) {
    for (let k = 0; k < 2; k++) {
      const a = yaw + k * PI + 0.8;
      const h = (0.75 + rand() * 0.2) * s;
      const lean = 0.12 + rand() * 0.1;
      const out = Math.sin(lean) * h;
      const rot: Vec3 = [Math.sin(a) * lean, 0, -Math.cos(a) * lean];
      b.shape(new ConeGeometry(0.022 * s, h, 3, 1, true), { at: [x + Math.cos(a) * out * 0.5, y + h * 0.5 * Math.cos(lean), z + Math.sin(a) * out * 0.5], rot, color: GREEN.grassDry, jitter: 0 });
      b.shape(new ConeGeometry(0.035 * s, 0.16 * s, 3, 1, true), { at: [x + Math.cos(a) * out, y + h * Math.cos(lean), z + Math.sin(a) * out], rot, color: CROP.wheatDark, jitter: 0.08 });
    }
  }
}

/** Wild flowers in the long grass: a few slender stems, each with a low head of petals. */
function bloom(b: ModelBuilder, p: Plant, rand: () => number, color: number): void {
  const { x, y, z, scale: s } = p;
  for (let i = 0; i < 5; i++) {
    const a = rand() * PI * 2;
    const r = (0.04 + rand() * 0.16) * s;
    const h = (0.24 + rand() * 0.2) * s;
    const lean = (rand() - 0.5) * 0.3;
    const [fx, fz] = [x + Math.cos(a) * r, z + Math.sin(a) * r];
    b.shape(new ConeGeometry(0.012 * s, h, 3, 1, true), { at: [fx, y + h / 2, fz], rot: [lean, 0, 0], color: CROP.stem, jitter: 0.05 });
    b.shape(new ConeGeometry(0.065 * s, 0.045 * s, 3, 1, true), { at: [fx, y + h * Math.cos(lean), fz + Math.sin(lean) * h * 0.5], rot: [lean, rand() * PI, 0], color, jitter: 0.08 });
  }
}

function flowers(b: ModelBuilder, p: Plant, rand: () => number, color: number): void {
  const { x, y, z, scale: s } = p;
  for (let i = 0; i < 3; i++) {
    const fx = x + (rand() - 0.5) * 0.4;
    const fz = z + (rand() - 0.5) * 0.4;
    const h = (0.22 + rand() * 0.14) * s;
    b.box(0.018, h, 0.018, { at: [fx, y + h / 2, fz], color: CROP.stem, jitter: 0 })
      .box(0.08 * s, 0.05 * s, 0.08 * s, { at: [fx, y + h, fz], rot: [0, rand() * PI, 0], color, jitter: 0.05 });
  }
}

function mushrooms(b: ModelBuilder, p: Plant, rand: () => number): void {
  const { x, y, z, scale: s } = p;
  const cap = rand() < 0.5 ? 0xb8402a : 0x9a7452;
  for (let i = 0; i < 3; i++) {
    const mx = x + (rand() - 0.5) * 0.35;
    const mz = z + (rand() - 0.5) * 0.35;
    const h = (0.08 + rand() * 0.08) * s;
    b.cyl(0.025 * s, 0.035 * s, h, 5, { at: [mx, y + h / 2, mz], color: 0xe8e0cc, jitter: 0 })
      .cone(0.08 * s, 0.06 * s, 6, { at: [mx, y + h + 0.02 * s, mz], color: cap, jitter: 0.05 });
  }
}

function log(b: ModelBuilder, p: Plant): void {
  const { x, y, z, scale: s, yaw } = p;
  const len = 3.6 * s;
  b.cyl(0.3 * s, 0.34 * s, len, 7, { at: [x, y + 0.22 * s, z], rot: [0, yaw, PI / 2], color: EARTH.bark, jitter: 0.12 });
  // Cut ends.
  const dx = -Math.cos(yaw) * (len / 2 + 0.01);
  const dz = Math.sin(yaw) * (len / 2 + 0.01);
  for (const k of [-1, 1]) {
    b.cyl(0.27 * s, 0.27 * s, 0.02, 7, { at: [x + dx * k, y + 0.22 * s, z + dz * k], rot: [0, yaw, PI / 2], color: EARTH.cutWood, jitter: 0.05 });
  }
  if (p.seed % 3 === 0) blob(b, 0.25 * s, 0.5, [x + dx * 0.3, y + 0.5 * s, z + dz * 0.3], GREEN.moss, yaw);
}

export function stump(b: ModelBuilder, x: number, y: number, z: number, s: number): void {
  b.cyl(0.36 * s, 0.46 * s, 0.55 * s, 7, { at: [x, y + 0.2 * s, z], color: EARTH.bark, jitter: 0.1 })
    .cyl(0.34 * s, 0.34 * s, 0.02, 7, { at: [x, y + 0.48 * s, z], color: EARTH.cutWood, jitter: 0.04 });
}

function reeds(b: ModelBuilder, p: Plant, rand: () => number): void {
  const { x, y, z, scale: s } = p;
  for (let i = 0; i < 4; i++) {
    const rx = x + (rand() - 0.5) * 0.5;
    const rz = z + (rand() - 0.5) * 0.5;
    const h = (0.9 + rand() * 0.5) * s;
    const lean: Vec3 = [(rand() - 0.5) * 0.15, 0, (rand() - 0.5) * 0.15];
    b.box(0.025, h, 0.025, { at: [rx, y + h / 2, rz], rot: lean, color: GREEN.reed, jitter: 0.1 });
    if (i < 2) b.box(0.05, 0.16, 0.05, { at: [rx + lean[2] * -h * 0.5, y + h - 0.1, rz + lean[0] * h * 0.5], rot: lean, color: EARTH.barkDark, jitter: 0 });
  }
}

function lily(b: ModelBuilder, p: Plant, rand: () => number): void {
  const { x, y, z, scale: s, yaw } = p;
  b.cyl(0.32 * s, 0.32 * s, 0.02, 7, { at: [x, y, z], rot: [0, yaw, 0], color: GREEN.lily, jitter: 0.08 });
  if (rand() < 0.4) b.box(0.08, 0.06, 0.08, { at: [x + 0.08, y + 0.04, z], color: 0xf0d0e0, jitter: 0 });
}

/** A fern: a ring of fronds rising from its middle and arching over, each leaf-shaped and folded along its rib. */
function fern(b: ModelBuilder, p: Plant, rand: () => number): void {
  const { x, y, z, scale: s, yaw } = p;
  const n = 5 + Math.floor(rand() * 2);
  for (let i = 0; i < n; i++) {
    const len = (0.6 + rand() * 0.35) * s;
    const w = (0.14 + rand() * 0.04) * s;
    // Up from the middle at `rise`, bending over to droop at its tip.
    const rise = 0.75 + rand() * 0.35;
    const [mz, my] = [len * 0.45 * Math.cos(rise), len * 0.45 * Math.sin(rise)];
    const [tz, ty] = [mz + len * 0.55 * Math.cos(rise - 1.05), my + len * 0.55 * Math.sin(rise - 1.05)];
    const [B, L, R, M, T] = [[0, 0, 0], [-w, my, mz], [w, my, mz], [0, my + 0.035 * s, mz], [0, ty, tz]];
    // Its upper face, wound to face up (the leaf's underside is never what you see).
    const pts = [B, L, M, B, M, R, M, L, T, M, T, R].flat();
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
    b.shape(g, { at: [x, y + 0.02, z], rot: [0, yaw + (i / n) * PI * 2 + rand() * 0.4, 0], color: pick(GREEN.fern, rand()), jitter: 0.1 });
  }
}

/** A crag: two or three angular slabs of the hills' rock standing out of a slope, sunk well into it, some mossed. */
function crag(b: ModelBuilder, p: Plant, rand: () => number): void {
  const { x, y, z, scale: s, yaw } = p;
  const n = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < n; i++) {
    const g = new DodecahedronGeometry(1, 0);
    const [w, h, d] = [(1.1 + rand() * 0.6) * s, (0.75 + rand() * 0.6) * s, (0.7 + rand() * 0.4) * s];
    g.scale(w, h, d);
    const a = yaw + i * 2.2 + rand() * 0.6;
    const off = i === 0 ? 0 : (0.9 + rand() * 0.5) * s;
    const at: Vec3 = [x + Math.cos(a) * off, y + h * (i === 0 ? 0.35 : 0.1), z + Math.sin(a) * off];
    b.shape(g, { at, rot: [(rand() - 0.5) * 0.5, a + rand(), (rand() - 0.5) * 0.5], color: pick([EARTH.cliff, EARTH.rock, EARTH.rockDark], rand()), jitter: 0.1 });
    if (i === 0 && rand() < 0.5) blob(b, w * 0.55, 0.3, [at[0], at[1] + h * 0.8, at[2]], GREEN.moss, a, 0.12);
  }
}
