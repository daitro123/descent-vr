import { IcosahedronGeometry, PlaneGeometry, Vector3 } from 'three';
import { CONFIG } from '../config';
import { ModelBuilder, type PartOpts } from '../models/kit';
import { createModelMaterial, type ModelMaterial } from '../models/materials';
import { PAL } from '../models/palette';
import { brickWallTexture, stoneFloorTexture } from './pixelTexture';

// The crypt hall: a square room with a gate in each of three walls, the
// Warden's throne on the north wall, four torch-lit pillars and corner
// braziers. The arena is this hall on its own, its gates running back into
// the dark; the old mine's Warden's hall is the same hall at the bottom of
// the mine, come in by its south gate, its east and west gates choked with
// fallen stone. Built in the hall's own frame: the floor's middle at the
// origin, the throne towards −Z (CONFIG.arena has its numbers).

const PI = Math.PI;

/**
 * What lies behind a gate: `dark`, a short tunnel into the dark (the
 * arena's); `through`, the tunnel with nothing at its end, for a way in;
 * `choked`, the tunnel heaped with fallen stone.
 */
export type GateKind = 'dark' | 'through' | 'choked';

/** The gates in the south, east and west walls. North holds the throne. */
export interface HallGates {
  readonly south: GateKind;
  readonly east: GateKind;
  readonly west: GateKind;
}

/** Where the hall's parts go: its flagstone floor, its brick walls and everything else, and its glows. */
export interface HallBuilders {
  readonly floor: ModelBuilder;
  readonly walls: ModelBuilder;
  readonly props: ModelBuilder;
  glow(x: number, y: number, z: number, size: number, color: number): void;
}

/** Flagstones and bricks: white, so the texture is all the colour. */
const TEXTURED: PartOpts = { color: 0xffffff, jitter: 0 };

/** A wall with a gate, and its side: which way into the room is −side along its axis. */
const WALLS = [
  { name: 'north', axis: 'z', sign: -1 },
  { name: 'south', axis: 'z', sign: 1 },
  { name: 'west', axis: 'x', sign: -1 },
  { name: 'east', axis: 'x', sign: 1 },
] as const;

type Wall = (typeof WALLS)[number];

function gateOf(gates: HallGates, wall: Wall): GateKind | null {
  return wall.name === 'north' ? null : gates[wall.name];
}

/** Build the hall into `b`, with `gates`. */
export function buildHall(b: HallBuilders, gates: HallGates): void {
  const { halfSize } = CONFIG.arena;
  const size = halfSize * 2;
  b.floor.shape(new PlaneGeometry(size, size), { ...TEXTURED, rot: [-PI / 2, 0, 0] });
  buildWalls(b.walls, gates);
  buildTrim(b.props, gates);
  buildGates(b.props, gates);
  buildPillars(b.props, b.glow);
  buildThrone(b.props);
  buildBraziers(b.props, b.glow);
  buildCeiling(b.props);
  buildRuneCircle(b.props);
  buildClutter(b.props);
}

let materials: { floor: ModelMaterial; walls: ModelMaterial } | null = null;

/**
 * The flagstone floor's and the brick walls' materials: the models' own
 * (vertex colours, box-projected UVs at one metre a texture), textured one
 * tile per 2 m, so the hall compiles no shader the models haven't. Without
 * a browser (unit tests), untextured.
 */
export function hallMaterials(): { floor: ModelMaterial; walls: ModelMaterial } {
  if (materials) return materials;
  const floor = createModelMaterial();
  const walls = createModelMaterial();
  if (typeof document !== 'undefined') {
    floor.map = stoneFloorTexture(0.5);
    walls.map = brickWallTexture(0.5, 0.5);
  }
  materials = { floor, walls };
  return materials;
}

type Pillar = { x: number; z: number; r: number };

/** From a pillar towards the middle of the room. */
export function toCentre(p: Pillar): Vector3 {
  return new Vector3(-p.x, 0, -p.z).normalize();
}

/** A pillar's torch, on its side facing the room. */
export function torchPosition(p: Pillar): Vector3 {
  return new Vector3(p.x, 2.2, p.z).addScaledVector(toCentre(p), p.r + 0.12);
}

// ---------------------------------------------------------------- walls

/** Brick walls as quads, split round each gate, and each gate's tunnel back from the wall. */
function buildWalls(b: ModelBuilder, gates: HallGates): void {
  const { halfSize: h, wallHeight: H, gate } = CONFIG.arena;
  for (const wall of WALLS) {
    // Built facing +Z at z = 0, then turned to face the room from its side.
    const yaw = wall.axis === 'z' ? (wall.sign < 0 ? 0 : PI) : wall.sign < 0 ? PI / 2 : -PI / 2;
    const off = new Vector3(0, 0, -h).applyAxisAngle(new Vector3(0, 1, 0), yaw);
    const quad = (g: PlaneGeometry) => {
      g.rotateY(yaw);
      g.translate(off.x, 0, off.z);
      b.shape(g, TEXTURED);
    };
    const segment = (x0: number, x1: number, y0: number, y1: number) => {
      const g = new PlaneGeometry(x1 - x0, y1 - y0);
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
      quad(g);
    };
    if (!gateOf(gates, wall)) {
      segment(-h, h, 0, H);
      continue;
    }
    const gw = gate.width / 2;
    segment(-h, -gw, 0, H);
    segment(gw, h, 0, H);
    segment(-gw, gw, gate.height, H);
    // The gate's tunnel: two side walls and a ceiling running back from the wall.
    const d = gate.depth;
    for (const side of [-1, 1]) {
      const g = new PlaneGeometry(d, gate.height);
      g.rotateY((-side * PI) / 2);
      g.translate(side * gw, gate.height / 2, -d / 2);
      quad(g);
    }
    const top = new PlaneGeometry(gate.width, d);
    top.rotateX(PI / 2);
    top.translate(0, gate.height, -d / 2);
    quad(top);
  }
}

/** Stone plinth, cornice and pilasters around the walls. */
function buildTrim(b: ModelBuilder, gates: HallGates): void {
  const { halfSize: h, wallHeight: H, gate } = CONFIG.arena;
  const stone: PartOpts = { color: PAL.stone };
  const dark: PartOpts = { color: PAL.stoneDark };
  for (const wall of WALLS) {
    const { axis, sign } = wall;
    // Runs along the wall, split around a gate.
    const runs: [number, number][] = gateOf(gates, wall)
      ? [
          [-h, -gate.width / 2 - 0.25],
          [gate.width / 2 + 0.25, h],
        ]
      : [[-h, h]];
    const place = (along: number, y: number, inset: number, w: number, ht: number, d: number, o: PartOpts) => {
      const at: [number, number, number] = axis === 'z' ? [along, y, sign * (h - inset)] : [sign * (h - inset), y, along];
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

function buildGates(b: ModelBuilder, gates: HallGates): void {
  const { halfSize: h, gate } = CONFIG.arena;
  const gw = gate.width / 2;
  for (const wall of WALLS) {
    const kind = gateOf(gates, wall);
    if (!kind) continue;
    // Author the gate in a frame where the wall is at z = +h, facing −Z.
    const yaw = wall.axis === 'z' ? 0 : wall.sign > 0 ? PI / 2 : -PI / 2;
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
    // The dark beyond, unless it's the way in.
    if (kind !== 'through') b.box(gate.width, gate.height, 0.05, { at: put(0, gate.height / 2, h + gate.depth), rot, color: 0x050404, jitter: 0 });
    if (kind === 'choked') {
      chokeGate(b, put, gw, h);
      continue;
    }
    // A raised portcullis.
    for (let i = 0; i < 7; i++) {
      const x = -gw + 0.14 + i * ((gate.width - 0.28) / 6);
      b.box(0.045, 0.7, 0.045, { at: put(x, gate.height - 0.3, h + 0.35), rot, color: PAL.ironDark });
      b.cone(0.035, 0.1, 4, { at: put(x, gate.height - 0.7, h + 0.35), rot: [PI, yaw, 0], color: PAL.iron });
    }
    b.box(gate.width, 0.06, 0.06, { at: put(0, gate.height - 0.1, h + 0.35), rot, color: PAL.ironDark });
    b.box(gate.width, 0.06, 0.06, { at: put(0, gate.height - 0.45, h + 0.35), rot, color: PAL.ironDark });
  }
}

/**
 * Fallen stone heaped in a gate's tunnel, to its lintel at the back and
 * spilling a little into the room (as far as `CONFIG.arena.choked`, which a
 * collider flush with the wall covers), with the portcullis fallen across it.
 */
function chokeGate(b: ModelBuilder, put: (x: number, y: number, z: number) => [number, number, number], gw: number, h: number): void {
  const { gate, choked } = CONFIG.arena;
  let seed = 31 + Math.round(put(0, 0, 1)[0] * 10);
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 22; i++) {
    // From the tunnel's back (deep, piled to the lintel) to the spill's edge (low).
    const back = rand();
    const z = h - choked + back * (gate.depth + choked);
    const top = 0.3 + back * (gate.height - 0.3);
    const r = 0.25 + rand() * 0.35;
    const x = (rand() * 2 - 1) * (gw + (back < 0.3 ? 0.3 : 0) - r * 0.5);
    const y = Math.min(top, r * 0.6 + rand() * top);
    b.shape(new IcosahedronGeometry(r, 0), { at: put(x, y, z), rot: [rand() * 3, rand() * 3, 0], color: rand() < 0.5 ? PAL.stone : PAL.stoneDark, jitter: 0.18 });
  }
  // The portcullis, fallen and bent across the heap.
  b.box(gate.width - 0.2, 0.06, 0.06, { at: put(0, 1.05, h + 0.2), rot: [0.5, 0, 0.1], color: PAL.ironDark });
  for (let i = 0; i < 4; i++) b.box(0.045, 0.9, 0.045, { at: put(-gw + 0.35 + i * 0.4, 1.1, h + 0.25), rot: [0.7, 0, 0.1], color: PAL.ironDark });
}

function buildPillars(b: ModelBuilder, glow: HallBuilders['glow']): void {
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
    glow(t.x, t.y + 0.16, t.z, 0.9, 0xff9a40);
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

/** A brazier on three legs at (x, z), its fire's glow over it. */
export function brazier(b: ModelBuilder, glow: HallBuilders['glow'], x: number, z: number): void {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2;
    b.bar([x + Math.sin(a) * 0.28, 0, z + Math.cos(a) * 0.28], [x + Math.sin(a) * 0.12, 0.75, z + Math.cos(a) * 0.12], 0.05, 0.05, {
      color: PAL.ironDark,
    });
  }
  b.cyl(0.36, 0.22, 0.24, 8, { at: [x, 0.86, z], color: PAL.ironDark })
    .cyl(0.32, 0.32, 0.04, 8, { at: [x, 0.97, z], color: PAL.coal, glow: 0.8 })
    .cone(0.2, 0.32, 5, { at: [x, 1.14, z], color: PAL.flame, glow: 1, jitter: 0 })
    .cone(0.1, 0.22, 5, { at: [x + 0.06, 1.1, z - 0.05], color: 0xffe080, glow: 1, jitter: 0 });
  glow(x, BRAZIER_FIRE, z, 1.5, 0xff8a30);
}

/** How high a brazier's fire burns over the floor. */
export const BRAZIER_FIRE = 1.2;

function buildBraziers(b: ModelBuilder, glow: HallBuilders['glow']): void {
  for (const o of CONFIG.arena.obstacles) if (o.kind === 'brazier') brazier(b, glow, o.x, o.z);
}

function buildCeiling(b: ModelBuilder): void {
  const { halfSize, wallHeight: H } = CONFIG.arena;
  const size = halfSize * 2;
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
