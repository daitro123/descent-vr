import {
  BufferAttribute,
  type BufferGeometry,
  type Camera,
  Group,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  PointLight,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pushOutOfCircle } from '../combat/geometry';
import { CONFIG } from '../config';
import { ModelBuilder, type PartOpts } from '../models/kit';
import { sharedModelMaterial } from '../models/materials';
import { PAL } from '../models/palette';
import { Glows } from './glows';
import { brickWallTexture, stoneFloorTexture } from './pixelTexture';

const PI = Math.PI;

/**
 * The crypt hall: a square room with three gates, the Warden's throne on the
 * north wall, four torch-lit pillars and corner braziers. Owns the static
 * collision shapes.
 *
 * Budget (see the Quest 3 performance research): static geometry is merged
 * per material into four meshes (floor, walls, props, glows), and the light
 * count is fixed at four point lights plus the hemisphere. Braziers and the
 * rune circle fake their light with glow sprites.
 */
export class Arena {
  readonly root = new Group();
  private readonly lights: { light: PointLight; base: number; seed: number }[] = [];
  private readonly glows: Glows;
  private time = 0;

  constructor() {
    const { halfSize, wallHeight } = CONFIG.arena;
    const size = halfSize * 2;

    const floor = new Mesh(
      new PlaneGeometry(size, size),
      new MeshLambertMaterial({ map: stoneFloorTexture(size / 2) }),
    );
    floor.rotation.x = -PI / 2;
    this.root.add(floor);

    const brick = brickWallTexture(1, 1);
    this.root.add(new Mesh(buildWalls(), new MeshLambertMaterial({ map: brick })));

    const props = new ModelBuilder(21);
    this.glows = new Glows();
    buildTrim(props);
    buildGates(props);
    buildPillars(props, this.glows);
    buildThrone(props);
    buildBraziers(props, this.glows);
    buildCeiling(props, wallHeight);
    buildRuneCircle(props);
    buildClutter(props);
    this.root.add(new Mesh(props.build({ ao: { from: 0, to: 1.2, min: 0.6 } }), sharedModelMaterial()));
    this.root.add(this.glows.mesh);

    // Four real lights, one per pillar torch. Never add or remove lights at
    // runtime: that recompiles every lit shader.
    for (const p of CONFIG.arena.pillars) {
      const light = new PointLight(0xff9a3c, 7, 10, 1.5);
      light.position.copy(torchPosition(p)).add(toCentre(p).multiplyScalar(0.25));
      this.root.add(light);
      this.lights.push({ light, base: 7, seed: Math.random() * 100 });
    }
    this.root.add(new HemisphereLight(0x6a78a8, 0x2a1c14, 0.9));
  }

  /** Torch flicker and glow billboards. */
  update(dt: number, camera: Camera): void {
    this.time += dt;
    for (const l of this.lights) {
      const t = this.time * 9 + l.seed;
      l.light.intensity = l.base * (0.85 + 0.1 * Math.sin(t) + 0.06 * Math.sin(t * 2.7 + 1.3));
    }
    this.glows.update(this.time, camera);
  }

  /**
   * Push a point on the floor plane out of walls, pillars and props.
   * `radius` is the body radius of whatever is being resolved.
   */
  resolve(p: Vector3, radius: number): boolean {
    return resolveFloor(p, radius);
  }

  /** Is the straight line a→b on the floor clear of pillars? (Archers want a clear shot.) */
  lineOfSight(a: Vector3, b: Vector3): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1;
    for (const c of CONFIG.arena.pillars) {
      const t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.z - a.z) * dz) / len2));
      const px = a.x + dx * t - c.x;
      const pz = a.z + dz * t - c.z;
      if (px * px + pz * pz < (c.r + 0.1) ** 2) return false;
    }
    return true;
  }
}

/** The room's collision, as a pure function (see Arena.resolve). */
export function resolveFloor(p: Vector3, radius: number): boolean {
  let moved = false;
  const limit = CONFIG.arena.halfSize - radius;
  if (p.x > limit) (p.x = limit), (moved = true);
  if (p.x < -limit) (p.x = -limit), (moved = true);
  if (p.z > limit) (p.z = limit), (moved = true);
  if (p.z < -limit) (p.z = -limit), (moved = true);
  for (const c of CONFIG.arena.pillars) {
    if (pushOutOfCircle(p, c.x, c.z, c.r + radius)) moved = true;
  }
  for (const c of CONFIG.arena.obstacles) {
    if (pushOutOfCircle(p, c.x, c.z, c.r + radius)) moved = true;
  }
  return moved;
}

type Pillar = { x: number; z: number; r: number };

function toCentre(p: Pillar): Vector3 {
  return new Vector3(-p.x, 0, -p.z).normalize();
}

function torchPosition(p: Pillar): Vector3 {
  return new Vector3(p.x, 2.2, p.z).addScaledVector(toCentre(p), p.r + 0.12);
}

// ---------------------------------------------------------------- walls

/** Which walls have a gate. North (−Z) holds the throne instead. */
const GATES = [
  { axis: 'z', sign: 1 }, // south
  { axis: 'x', sign: 1 }, // east
  { axis: 'x', sign: -1 }, // west
] as const;

function hasGate(axis: 'x' | 'z', sign: number): boolean {
  return GATES.some((g) => g.axis === axis && g.sign === sign);
}

/**
 * Brick walls as quads with world-scaled UVs so the bricks line up across
 * segments: one texture tile (32 px) per 2 m, as before.
 */
function buildWalls(): BufferGeometry {
  const { halfSize: h, wallHeight: H, gate } = CONFIG.arena;
  const parts: BufferGeometry[] = [];
  const quad = (w: number, ht: number, u0: number, v0: number, place: (g: PlaneGeometry) => void) => {
    const g = new PlaneGeometry(w, ht);
    const uv = g.getAttribute('uv') as BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (u0 + uv.getX(i) * w) / 2, (v0 + uv.getY(i) * ht) / 2);
    place(g);
    parts.push(g);
  };

  const walls: { axis: 'x' | 'z'; sign: number }[] = [
    { axis: 'z', sign: -1 },
    { axis: 'z', sign: 1 },
    { axis: 'x', sign: -1 },
    { axis: 'x', sign: 1 },
  ];
  for (const wall of walls) {
    // Build facing +Z at z = 0 in a local frame, then turn to face the room.
    const yaw = wall.axis === 'z' ? (wall.sign < 0 ? 0 : PI) : wall.sign < 0 ? PI / 2 : -PI / 2;
    const toWorld = (g: BufferGeometry) => {
      g.rotateY(yaw);
      const off = new Vector3(0, 0, -h).applyAxisAngle(new Vector3(0, 1, 0), yaw);
      g.translate(off.x, 0, off.z);
    };
    const segment = (x0: number, x1: number, y0: number, y1: number) =>
      quad(x1 - x0, y1 - y0, x0 + h, y0, (g) => {
        g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
        toWorld(g);
      });
    if (!hasGate(wall.axis, wall.sign)) {
      segment(-h, h, 0, H);
      continue;
    }
    const gw = gate.width / 2;
    segment(-h, -gw, 0, H);
    segment(gw, h, 0, H);
    segment(-gw, gw, gate.height, H);
    // The gate's tunnel: two side walls and a ceiling running back into the dark.
    const d = gate.depth;
    for (const side of [-1, 1]) {
      quad(d, gate.height, 0, 0, (g) => {
        g.rotateY((-side * PI) / 2);
        g.translate(side * gw, gate.height / 2, -d / 2);
        toWorld(g);
      });
    }
    quad(gate.width, d, 0, 0, (g) => {
      g.rotateX(PI / 2);
      g.translate(0, gate.height, -d / 2);
      toWorld(g);
    });
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** Stone plinth, cornice and pilasters around the walls. */
function buildTrim(b: ModelBuilder): void {
  const { halfSize: h, wallHeight: H, gate } = CONFIG.arena;
  const stone: PartOpts = { color: PAL.stone };
  const dark: PartOpts = { color: PAL.stoneDark };
  for (const [axis, sign] of [
    ['z', -1],
    ['z', 1],
    ['x', -1],
    ['x', 1],
  ] as const) {
    const gated = hasGate(axis, sign);
    // Runs along the wall, split around a gate.
    const runs: [number, number][] = gated
      ? [
          [-h, -gate.width / 2 - 0.25],
          [gate.width / 2 + 0.25, h],
        ]
      : [[-h, h]];
    const place = (along: number, y: number, inset: number, w: number, ht: number, d: number, o: PartOpts) => {
      const at: [number, number, number] =
        axis === 'z' ? [along, y, sign * (h - inset)] : [sign * (h - inset), y, along];
      const dims: [number, number, number] = axis === 'z' ? [w, ht, d] : [d, ht, w];
      b.box(dims[0], dims[1], dims[2], { ...o, at });
    };
    for (const [a0, a1] of runs) {
      place((a0 + a1) / 2, 0.14, 0.08, a1 - a0, 0.28, 0.16, dark);
      place((a0 + a1) / 2, H - 0.12, 0.1, a1 - a0, 0.24, 0.2, stone);
    }
    for (const along of [-4.8, 4.8]) {
      place(along, H / 2, 0.1, 0.6, H, 0.2, stone);
      place(along, 0.2, 0.14, 0.75, 0.4, 0.28, dark);
    }
  }
}

function buildGates(b: ModelBuilder): void {
  const { halfSize: h, gate } = CONFIG.arena;
  const gw = gate.width / 2;
  for (const g of GATES) {
    // Author the gate in a frame where the wall is at z = +h, facing −Z.
    const yaw = g.axis === 'z' ? 0 : g.sign > 0 ? PI / 2 : -PI / 2;
    const put = (x: number, y: number, z: number): [number, number, number] => {
      const v = new Vector3(x, y, z).applyAxisAngle(new Vector3(0, 1, 0), yaw);
      return [v.x, v.y, v.z];
    };
    const rot: [number, number, number] = [0, yaw, 0];
    // Jambs, lintel and keystone.
    for (const side of [-1, 1]) {
      b.box(0.34, gate.height + 0.2, 0.34, { at: put(side * (gw + 0.14), (gate.height + 0.2) / 2, h - 0.1), rot, color: PAL.stoneLight });
    }
    b.box(gate.width + 0.7, 0.36, 0.36, { at: put(0, gate.height + 0.16, h - 0.1), rot, color: PAL.stoneLight })
      .box(0.34, 0.46, 0.4, { at: put(0, gate.height + 0.2, h - 0.12), rot, color: PAL.stone });
    // The dark beyond, and a raised portcullis.
    b.box(gate.width, gate.height, 0.05, { at: put(0, gate.height / 2, h + gate.depth), rot, color: 0x050404, jitter: 0 });
    for (let i = 0; i < 7; i++) {
      const x = -gw + 0.14 + i * ((gate.width - 0.28) / 6);
      b.box(0.045, 0.7, 0.045, { at: put(x, gate.height - 0.3, h + 0.35), rot, color: PAL.ironDark });
      b.cone(0.035, 0.1, 4, { at: put(x, gate.height - 0.7, h + 0.35), rot: [PI, yaw, 0], color: PAL.iron });
    }
    b.box(gate.width, 0.06, 0.06, { at: put(0, gate.height - 0.1, h + 0.35), rot, color: PAL.ironDark });
    b.box(gate.width, 0.06, 0.06, { at: put(0, gate.height - 0.45, h + 0.35), rot, color: PAL.ironDark });
  }
}

function buildPillars(b: ModelBuilder, glows: Glows): void {
  const H = CONFIG.arena.wallHeight;
  for (const p of CONFIG.arena.pillars) {
    b.box(p.r * 2.3, 0.32, p.r * 2.3, { at: [p.x, 0.16, p.z], color: PAL.stoneDark })
      .box(p.r * 2.1, 0.14, p.r * 2.1, { at: [p.x, 0.39, p.z], color: PAL.stone })
      .cyl(p.r * 0.9, p.r, H - 0.9, 8, { at: [p.x, 0.46 + (H - 0.9) / 2, p.z], color: PAL.stone })
      .box(p.r * 2.1, 0.16, p.r * 2.1, { at: [p.x, H - 0.36, p.z], color: PAL.stone })
      .box(p.r * 2.4, 0.2, p.r * 2.4, { at: [p.x, H - 0.18, p.z], color: PAL.stoneLight });
    // Iron sconce and torch on the side facing the room.
    const c = toCentre(p);
    const t = torchPosition(p);
    const yaw = Math.atan2(c.x, c.z);
    const back = t.clone().addScaledVector(c, -0.12);
    b.box(0.06, 0.06, 0.16, { at: [back.x, t.y - 0.18, back.z], rot: [0, yaw, 0], color: PAL.ironDark })
      .box(0.1, 0.03, 0.1, { at: [t.x, t.y - 0.1, t.z], color: PAL.ironDark })
      .cyl(0.025, 0.02, 0.3, 5, { at: [t.x, t.y - 0.05, t.z], rot: [0.25 * c.z, 0, -0.25 * c.x], color: PAL.wood })
      .cone(0.05, 0.16, 5, { at: [t.x, t.y + 0.16, t.z], color: PAL.flame, glow: 1, jitter: 0 })
      .cone(0.028, 0.1, 5, { at: [t.x, t.y + 0.15, t.z], color: 0xffe080, glow: 1, jitter: 0 });
    glows.add(t.x, t.y + 0.16, t.z, 0.9, 0xff9a40);
  }
}

function buildThrone(b: ModelBuilder): void {
  const z = -CONFIG.arena.halfSize + 0.75;
  b.box(2.4, 0.18, 1.5, { at: [0, 0.09, z + 0.1], color: PAL.stoneDark })
    .box(1.9, 0.14, 1.1, { at: [0, 0.25, z], color: PAL.stone })
    .box(1.1, 0.55, 0.8, { at: [0, 0.6, z], color: PAL.stone })
    .box(1.1, 2.4, 0.22, { at: [0, 1.4, z - 0.36], color: PAL.stone })
    .box(0.2, 0.55, 0.8, { at: [-0.55, 1.0, z], color: PAL.stoneLight })
    .box(0.2, 0.55, 0.8, { at: [0.55, 1.0, z], color: PAL.stoneLight })
    .box(0.9, 0.2, 0.08, { at: [0, 2.2, z - 0.24], color: PAL.gold })
    .box(0.9, 0.9, 0.04, { at: [0, 1.6, z - 0.24], color: PAL.banner })
    .box(0.24, 0.2, 0.2, { at: [0, 2.72, z - 0.36], color: PAL.bone })
    .box(0.06, 0.05, 0.03, { at: [-0.05, 2.74, z - 0.25], color: PAL.blueEye, glow: 1, jitter: 0 })
    .box(0.06, 0.05, 0.03, { at: [0.05, 2.74, z - 0.25], color: PAL.blueEye, glow: 1, jitter: 0 });
  for (const x of [-0.5, 0.5]) {
    b.cone(0.07, 0.4, 4, { at: [x, 2.8, z - 0.36], color: PAL.stoneLight });
  }
}

function buildBraziers(b: ModelBuilder, glows: Glows): void {
  for (const o of CONFIG.arena.obstacles) {
    if (o.kind !== 'brazier') continue;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * PI * 2;
      b.bar([o.x + Math.sin(a) * 0.28, 0, o.z + Math.cos(a) * 0.28], [o.x + Math.sin(a) * 0.12, 0.75, o.z + Math.cos(a) * 0.12], 0.05, 0.05, {
        color: PAL.ironDark,
      });
    }
    b.cyl(0.36, 0.22, 0.24, 8, { at: [o.x, 0.86, o.z], color: PAL.ironDark })
      .cyl(0.32, 0.32, 0.04, 8, { at: [o.x, 0.97, o.z], color: PAL.coal, glow: 0.8 })
      .cone(0.2, 0.32, 5, { at: [o.x, 1.14, o.z], color: PAL.flame, glow: 1, jitter: 0 })
      .cone(0.1, 0.22, 5, { at: [o.x + 0.06, 1.1, o.z - 0.05], color: 0xffe080, glow: 1, jitter: 0 });
    glows.add(o.x, 1.2, o.z, 1.5, 0xff8a30);
  }
}

function buildCeiling(b: ModelBuilder, H: number): void {
  const size = CONFIG.arena.halfSize * 2;
  b.box(size, 0.2, size, { at: [0, H + 0.1, 0], color: 0x1a1614, jitter: 0.15 });
  for (const z of [-5.25, -1.75, 1.75, 5.25]) {
    b.box(size, 0.3, 0.32, { at: [0, H - 0.15, z], color: PAL.woodDark });
  }
  // Chains hanging from the beams.
  for (const [x, z, len] of [
    [-5, -1.75, 1.3],
    [5.2, 1.75, 1.0],
    [-1.5, 5.25, 0.8],
    [2.5, -5.25, 1.5],
  ] as const) {
    for (let i = 0; i * 0.09 < len; i++) {
      b.box(0.02, 0.1, 0.05, { at: [x, H - 0.35 - i * 0.09, z], rot: [0, (i % 2) * (PI / 2), 0], color: PAL.ironDark });
    }
    b.box(0.08, 0.12, 0.08, { at: [x, H - 0.4 - len, z], color: PAL.iron });
  }
}

/** A faintly glowing ring of runes around the fighting ground. */
function buildRuneCircle(b: ModelBuilder): void {
  const R = 2.3;
  const n = 28;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    b.box(0.08, 0.012, (2 * PI * R) / n - 0.06, {
      at: [Math.cos(a) * R, 0.006, Math.sin(a) * R],
      rot: [0, -a, 0],
      color: PAL.stoneDark,
      jitter: 0.1,
    });
    if (i % 4 === 0) {
      b.box(0.12, 0.014, 0.05, {
        at: [Math.cos(a) * (R - 0.16), 0.007, Math.sin(a) * (R - 0.16)],
        rot: [0, -a + 0.6, 0],
        color: PAL.rune,
        glow: 0.7,
        jitter: 0,
      });
    }
  }
}

/** Bones, skulls, rubble, crates, banners: set dressing along the walls. */
function buildClutter(b: ModelBuilder): void {
  const h = CONFIG.arena.halfSize;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const alongWalls = (n: number, fn: (x: number, z: number, yaw: number) => void) => {
    for (let i = 0; i < n; i++) {
      const side = i % 4;
      const t = (rand() * 2 - 1) * (h - 1.2);
      if (Math.abs(t) < 1.4) continue; // keep gates and the throne clear
      const inset = h - 0.35 - rand() * 0.4;
      const [x, z] = side === 0 ? [t, -inset] : side === 1 ? [t, inset] : side === 2 ? [-inset, t] : [inset, t];
      fn(x, z, rand() * PI * 2);
    }
  };
  alongWalls(26, (x, z, yaw) => {
    // Bone pile: a few long bones and a skull.
    for (let k = 0; k < 4; k++) {
      b.box(0.04, 0.035, 0.3, { at: [x + (rand() - 0.5) * 0.3, 0.02 + k * 0.02, z + (rand() - 0.5) * 0.3], rot: [0, yaw + k, 0], color: PAL.boneShade });
    }
    b.box(0.14, 0.12, 0.15, { at: [x, 0.07, z], rot: [0, yaw, 0.2], color: PAL.bone })
      .box(0.1, 0.04, 0.02, { at: [x + Math.sin(yaw) * 0.075, 0.08, z + Math.cos(yaw) * 0.075], rot: [0, yaw, 0.2], color: PAL.socket, jitter: 0 });
  });
  alongWalls(18, (x, z, yaw) => {
    const s = 0.12 + rand() * 0.18;
    b.box(s, s * 0.7, s * 1.1, { at: [x, s * 0.35, z], rot: [0, yaw, 0], color: rand() < 0.5 ? PAL.stone : PAL.stoneDark });
  });
  // Crates and a barrel along the south wall (their colliders are in CONFIG.arena.obstacles).
  const [crate, barrel] = CONFIG.arena.obstacles.filter((o) => o.kind === 'crate');
  b.box(0.7, 0.7, 0.7, { at: [crate.x, 0.35, crate.z], rot: [0, 0.2, 0], color: PAL.wood })
    .box(0.5, 0.5, 0.5, { at: [crate.x + 0.05, 0.95, crate.z - 0.05], rot: [0, 0.6, 0], color: PAL.woodDark })
    .cyl(0.28, 0.28, 0.8, 8, { at: [barrel.x, 0.4, barrel.z], color: PAL.wood })
    .cyl(0.29, 0.29, 0.05, 8, { at: [barrel.x, 0.62, barrel.z], color: PAL.ironDark });
  // Banners on the north pilasters, either side of the throne.
  for (const x of [-4.8, 4.8]) {
    b.box(0.7, 1.7, 0.03, { at: [x, 2.45, -h + 0.22], color: PAL.banner })
      .box(0.8, 0.06, 0.06, { at: [x, 3.32, -h + 0.22], color: PAL.woodDark })
      .box(0.3, 0.3, 0.035, { at: [x, 2.6, -h + 0.21], rot: [0, 0, PI / 4], color: PAL.gold })
      .box(0.12, 0.3, 0.03, { at: [x - 0.22, 1.5, -h + 0.22], color: PAL.banner })
      .box(0.12, 0.2, 0.03, { at: [x + 0.2, 1.55, -h + 0.22], color: PAL.banner });
  }
}
