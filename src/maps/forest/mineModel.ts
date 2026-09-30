import { type BufferGeometry, type Camera, Group, IcosahedronGeometry, Matrix4, Mesh, PlaneGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ModelBuilder, type PartOpts } from '../../models/kit';
import { type ModelMaterial, sharedModelMaterial } from '../../models/materials';
import { PAL } from '../../models/palette';
import { Glows } from '../../world/glows';
import { brazier, buildHall, CORNICE, gateFrame, hallMaterials, PLINTH, TEXTURED } from '../../world/hall';
import type { Mine, MinePlan } from '../../world/mine';
import { type Axis, bends, floorOf, Hollow, type Piece } from './hollow';
import { FLAME } from './interiorModel';
import { type Finish, MINE, type MinePiece, minePiece } from './mine';
import { mulberry32, valueNoise } from './noise';
import { BUILD, EARTH } from './palette';

// The old mine's meshes, built in the mouth's frame (mine.ts) and placed with
// it. Everything of one material is one mesh, its parts laid down in order
// along the route, so drawing the part you're in and its neighbours is one
// draw range: the rock, timbers and props (the models' material), the crypt's
// flagstone floors, its brick walls, and the glows: four draw calls for the
// whole mine. The rock is planes facing into the open space, roughened away
// from their edges so neighbouring walls still meet; the crypt's is dressed
// stone; the Warden's hall is the arena's (world/hall.ts).

/** How far the rock's faces are pushed out into the open space, at most: the old mine's, and the bandits' rougher dig. */
const ROUGH: Record<Finish, number> = { timbered: 0.12, dug: 0.2, dressed: 0, hall: 0 };
/** The rock stops this far out past the mouth's line, behind its timbers. */
const LIP = 0.1;

const ROCK: PartOpts = { color: EARTH.cliff, jitter: 0.14 };
const CEILING: PartOpts = { color: EARTH.rockDark, jitter: 0.14 };
const FLOOR: PartOpts = { color: EARTH.dirtDark, jitter: 0.1 };
const DUG_FLOOR: PartOpts = { color: EARTH.mud, jitter: 0.14 };
const VAULT: PartOpts = { color: PAL.stoneDark, jitter: 0.08 };
const TIMBER: PartOpts = { color: PAL.woodDark, jitter: 0.12 };
const IRON: PartOpts = { color: PAL.ironDark, jitter: 0.05 };
const BRICK = 0x6e463a;
/** Room for every glow in the mine. */
const MAX_GLOWS = 24;

type Glow = (x: number, y: number, z: number, size: number, color?: number) => void;

/** One part's builders: the models' material, the crypt's flagstones and its bricks. */
interface PartBuilders {
  readonly model: ModelBuilder;
  readonly floor: ModelBuilder;
  readonly walls: ModelBuilder;
}

/** A mesh holding every part's geometry of one material in route order: `starts[i]` is where part i's vertices begin. */
class PartedMesh {
  readonly mesh: Mesh;
  readonly starts: number[] = [0];

  constructor(geometries: (BufferGeometry | null)[], material: ModelMaterial, name: string, place: Matrix4) {
    const present = geometries.filter((g): g is BufferGeometry => !!g);
    for (const g of geometries) this.starts.push(this.starts[this.starts.length - 1] + (g ? g.getAttribute('position').count : 0));
    const merged = mergeGeometries(present, false);
    for (const g of present) g.dispose();
    merged.applyMatrix4(place);
    merged.computeBoundingSphere();
    this.mesh = new Mesh(merged, material);
    this.mesh.name = name;
  }

  /** Draw parts `lo` to `hi`; nothing if `lo` > `hi`. */
  show(lo: number, hi: number): void {
    const from = this.starts[Math.max(0, lo)];
    const to = this.starts[Math.min(this.starts.length - 1, hi + 1)];
    this.mesh.geometry.setDrawRange(from, Math.max(0, to - from));
    this.mesh.visible = to > from;
  }

  /** Part i's triangles. */
  triangles(part: number): number {
    return (this.starts[part + 1] - this.starts[part]) / 3;
  }
}

/** The mine, its parts hidden but for the adit, for its `plan`. */
export function buildMine(plan: MinePlan): Mine {
  const { mouth } = plan;
  const place = new Matrix4().makeRotationY(mouth.yaw).setPosition(mouth.x, mouth.y, mouth.z);
  const hollow = new Hollow(MINE.pieces);
  const partOf = (x: number, z: number) => hollow.pieceAt(x, z).part;
  const floorAt = (x: number, z: number) => hollow.floorAt(x, z);

  const builders: PartBuilders[] = MINE.parts.map((_, i) => ({ model: new ModelBuilder(250 + i), floor: new ModelBuilder(270 + i), walls: new ModelBuilder(290 + i) }));
  const glowsOf: { x: number; y: number; z: number; size: number; color: number }[][] = MINE.parts.map(() => []);
  const glowIn = (part: number): Glow => (x, y, z, size, color = FLAME) => {
    const p = new Vector3(x, y, z).applyMatrix4(place);
    glowsOf[part].push({ x: p.x, y: p.y, z: p.z, size, color });
  };
  const at = (x: number, z: number) => builders[partOf(x, z)].model;
  const glowAt = (x: number, z: number) => glowIn(partOf(x, z));

  buildRock(hollow, builders);
  buildSets(at);
  buildRails(at);
  buildCartHall(builders[1].model, glowIn(1));
  buildGallery(builders[2].model);
  buildRamp(at, floorAt);
  buildDig(builders[4], glowIn(4));
  buildCrypt(hollow, builders, glowIn, floorAt);
  for (const [x, y, z] of MINE.lanterns) lantern(at(x, z), glowAt(x, z), x, floorAt(x, z) + y, z);

  const ao = { from: 0, to: 1.4, min: 0.6, floor: floorAt };
  const built = (b: ModelBuilder, opts = {}) => (b.count > 0 ? b.build(opts) : null);
  const materials = hallMaterials();
  const meshes = [
    new PartedMesh(builders.map((b) => built(b.model, { ao })), sharedModelMaterial(), 'mine-rock', place),
    new PartedMesh(builders.map((b) => built(b.floor)), materials.floor, 'mine-flagstones', place),
    new PartedMesh(builders.map((b) => built(b.walls)), materials.walls, 'mine-bricks', place),
  ];
  const glows = new Glows(MAX_GLOWS);
  const glowStarts = [0];
  for (const list of glowsOf) {
    for (const g of list) glows.add(g.x, g.y, g.z, g.size, g.color);
    glowStarts.push(glows.count);
  }
  glows.mesh.name = 'mine-glows';
  const root = new Group();
  root.name = 'mine';
  root.add(...meshes.map((m) => m.mesh), glows.mesh);

  let current = 0;
  let time = 0;
  let drawn = MINE.parts.map(() => false);
  const mine: Mine = {
    ...plan,
    root,
    show(entered, outdoors, x, z) {
      if (entered) current = plan.partAt(x, z);
      const [lo, hi] = entered ? [current - 1, current + 1] : outdoors ? [0, 0] : [1, 0];
      for (const m of meshes) m.show(lo, hi);
      glows.range(glowStarts[Math.max(0, lo)], glowStarts[Math.min(MINE.parts.length, hi + 1)]);
      glows.mesh.visible = hi >= lo;
      drawn = MINE.parts.map((_, i) => i >= lo && i <= hi);
    },
    get drawn() {
      return drawn;
    },
    triangles(part) {
      return meshes.reduce((n, m) => n + m.triangles(part), 0);
    },
    update(dt: number, camera: Camera) {
      time += dt;
      if (glows.mesh.visible) glows.update(time, camera);
    },
  };
  mine.show(false, true, mouth.x, mouth.z);
  return mine;
}

// ------------------------------------------------------------------ rock

/**
 * A quad from its corners, facing `n`: `a0` and `b0` along its bottom edge,
 * `a1` and `b1` along its top (a0→b0 and a0→a1 must turn to face `n`, as x
 * and y do to face z). Its middle is pushed out along `n` by up to `rough`
 * in lumps, its edges left flat so it meets its neighbours; `u0`, `v0` place
 * the lumps, so one face's don't repeat another's.
 */
function roughQuad(
  a0: Vector3,
  b0: Vector3,
  a1: Vector3,
  b1: Vector3,
  n: Vector3,
  rough: number,
  u0: number,
  v0: number,
  seed: number,
): PlaneGeometry {
  const w = a0.distanceTo(b0);
  const h = a0.distanceTo(a1);
  const sw = Math.max(1, Math.round(w / 0.8));
  const sh = Math.max(1, Math.round(h / 0.8));
  const g = new PlaneGeometry(1, 1, sw, sh);
  const pos = g.getAttribute('position');
  const p = new Vector3();
  const top = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getX(i) + 0.5;
    const s = pos.getY(i) + 0.5;
    p.lerpVectors(a0, b0, t);
    top.lerpVectors(a1, b1, t);
    p.lerp(top, s);
    const edge = Math.min(Math.min(t, 1 - t) * w, Math.min(s, 1 - s) * h);
    if (rough > 0 && edge > 1e-3) {
      const u = t * w;
      const v = s * h;
      const lump = valueNoise((u0 + u) * 0.9, (v0 + v) * 0.9, seed) * 0.7 + valueNoise((u0 + u) * 2.3, (v0 + v) * 2.3, seed + 1) * 0.3;
      p.addScaledVector(n, rough * lump * Math.min(1, edge / 0.5));
    }
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Where along [a, b] a piece's floor bends: its ends and its slope's, in order. */
function stops(p: Piece, axis: Axis, a: number, b: number): number[] {
  return [a, ...bends(p, axis, a, b), b];
}

const _a0 = new Vector3();
const _b0 = new Vector3();
const _a1 = new Vector3();
const _b1 = new Vector3();
const _n = new Vector3();
const UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);

/** The rock round the open space (or the crypt's dressed stone): floors, ceilings, walls and the rock over openings, each in its piece's part. */
function buildRock(hollow: Hollow, builders: PartBuilders[]): void {
  const pieces = hollow.pieces as readonly MinePiece[];
  for (const { piece, rect } of hollow.floors()) {
    const p = pieces[piece];
    if (p.finish === 'hall') continue;
    const z1 = Math.min(rect.z1, LIP);
    if (z1 - rect.z0 <= 0) continue;
    // Split where the floor bends, so each stretch is one flat or sloping plane.
    const xs = stops(p, 'x', rect.x0, rect.x1);
    const zs = stops(p, 'z', rect.z0, z1);
    for (let i = 1; i < xs.length; i++) {
      for (let j = 1; j < zs.length; j++) {
        const [x0, x1, za, zb] = [xs[i - 1], xs[i], zs[j - 1], zs[j]];
        const y = (x: number, z: number) => floorOf(p, x, z);
        const g = roughQuad(_a0.set(x0, y(x0, zb), zb), _b0.set(x1, y(x1, zb), zb), _a1.set(x0, y(x0, za), za), _b1.set(x1, y(x1, za), za), UP, 0, 0, 0, 0);
        if (p.finish === 'dressed') builders[p.part].floor.shape(g, TEXTURED);
        else builders[p.part].model.shape(g, p.finish === 'dug' ? DUG_FLOOR : FLOOR);
      }
    }
  }
  for (const { piece, rect } of hollow.ceilings()) {
    const p = pieces[piece];
    if (p.finish === 'hall') continue;
    // The ceiling stops at the mouth's line, under the lintel.
    const z1 = Math.min(rect.z1, 0);
    if (z1 - rect.z0 <= 0) continue;
    const xs = stops(p, 'x', rect.x0, rect.x1);
    const zs = stops(p, 'z', rect.z0, z1);
    for (let i = 1; i < xs.length; i++) {
      for (let j = 1; j < zs.length; j++) {
        const [x0, x1, za, zb] = [xs[i - 1], xs[i], zs[j - 1], zs[j]];
        const y = (x: number, z: number) => floorOf(p, x, z) + p.height;
        const g = roughQuad(_a0.set(x0, y(x0, za), za), _b0.set(x1, y(x1, za), za), _a1.set(x0, y(x0, zb), zb), _b1.set(x1, y(x1, zb), zb), DOWN, ROUGH[p.finish], x0, za, 61);
        builders[p.part].model.shape(g, p.finish === 'dressed' ? VAULT : CEILING);
      }
    }
  }
  /** A stretch of wall from (ax, az) to (bx, bz), facing (nx, nz), between `bottom` and `top` at each end, split where the floor bends. */
  const face = (p: MinePiece, w: { ax: number; az: number; bx: number; bz: number; nx: number; nz: number }, bottom: (x: number, z: number) => number, top: (x: number, z: number) => number) => {
    // Turn so that a→b and up face into the open space.
    const flip = w.nz * (w.bx - w.ax) - w.nx * (w.bz - w.az) < 0;
    const [ax, az, bx, bz] = flip ? [w.bx, w.bz, w.ax, w.az] : [w.ax, w.az, w.bx, w.bz];
    const axis = ax === bx ? 'z' : 'x';
    const marks = stops(p, axis, axis === 'x' ? ax : az, axis === 'x' ? bx : bz);
    _n.set(w.nx, 0, w.nz);
    for (let k = 1; k < marks.length; k++) {
      const [x0, z0] = axis === 'x' ? [marks[k - 1], az] : [ax, marks[k - 1]];
      const [x1, z1] = axis === 'x' ? [marks[k], az] : [ax, marks[k]];
      const [cz0, cz1] = [Math.min(z0, LIP), Math.min(z1, LIP)];
      if (Math.hypot(x1 - x0, cz1 - cz0) <= 1e-3) continue;
      if (top(x0, z0) - bottom(x0, z0) <= 1e-3 && top(x1, z1) - bottom(x1, z1) <= 1e-3) continue;
      const g = roughQuad(
        _a0.set(x0, bottom(x0, z0), cz0),
        _b0.set(x1, bottom(x1, z1), cz1),
        _a1.set(x0, top(x0, z0), cz0),
        _b1.set(x1, top(x1, z1), cz1),
        _n,
        ROUGH[p.finish],
        x0 + z0,
        bottom(x0, z0),
        67,
      );
      if (p.finish === 'dressed') builders[p.part].walls.shape(g, TEXTURED);
      else builders[p.part].model.shape(g, ROCK);
    }
  };
  for (const w of hollow.walls) {
    const p = pieces[w.piece];
    if (p.finish === 'hall') continue;
    face(p, w, (x, z) => floorOf(p, x, z), (x, z) => floorOf(p, x, z) + p.height);
  }
  for (const l of hollow.lintels) {
    const p = pieces[l.wall.piece];
    if (p.finish === 'hall') continue;
    const { ax, az, bx, bz } = l.wall;
    // Its height from the wall's a end to its b end, whichever way round the face is laid.
    const end = (x: number, z: number, i: 0 | 1) => {
      const t = ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2);
      return l.a[i] + (l.b[i] - l.a[i]) * t;
    };
    face(p, l.wall, (x, z) => end(x, z, 0), (x, z) => end(x, z, 1));
  }
  // Over the adit's first metres, where the hillside is dug away, a lump of rock to close the hole.
  const { hw, height } = MINE.tunnel;
  builders[0].model.box(2 * hw + 1.1, 1.8, 2.6, { ...ROCK, at: [0, height + 0.95, -1.3] });
}

// ------------------------------------------------------------------ timbers

/** Timber sets along the tunnels (posts in the walls, a cap beam over), every few metres. */
function buildSets(at: (x: number, z: number) => ModelBuilder): void {
  const { hw, height } = MINE.tunnel;
  const { every, post, cap } = MINE.sets;
  // Sunk into the rock but for a hand's breadth.
  const inset = hw + post / 2 - 0.07;
  const set = (x: number, z: number, across: Axis) => {
    const b = at(x, z);
    for (const s of [-1, 1]) {
      const [px, pz] = across === 'x' ? [x + s * inset, z] : [x, z + s * inset];
      b.box(post, height, post, { ...TIMBER, at: [px, height / 2, pz] });
    }
    const [w, d] = across === 'x' ? [2 * hw + 0.3, post] : [post, 2 * hw + 0.3];
    b.box(w, cap, d, { ...TIMBER, at: [x, height - cap / 2, z] });
  };
  // The adit, from just inside the mouth to the bend; round it to the cart hall; and the passage.
  for (let z = -1; z > -9; z -= every) set(0, z, 'x');
  for (let x = -3; x > -6; x -= every) set(x, -10, 'z');
  set(-15.5, -17, 'x');
}

/** A lantern hung at (x, y, z): an iron cage with its flame, a hook and a glow. */
function lantern(b: ModelBuilder, glow: Glow, x: number, y: number, z: number): void {
  b.box(0.2, 0.28, 0.2, { ...IRON, at: [x, y, z] })
    .box(0.13, 0.2, 0.13, { at: [x, y, z], color: 0xffd080, glow: 1, jitter: 0 })
    .box(0.03, 0.2, 0.03, { ...IRON, at: [x, y + 0.24, z] });
  glow(x, y, z, 0.8);
}

// ------------------------------------------------------------------ rails

/** The rails from the mouth round the bend to the turntable, and the siding to the carts. */
function buildRails(at: (x: number, z: number) => ModelBuilder): void {
  const { gauge, turn, sleeper } = MINE.rails;
  const { turntable, carts } = MINE;
  // The line's centre, every 0.3 m: straight in, round an arc, straight on west.
  const line: [number, number][] = [];
  for (let z = LIP; z > -10 + turn; z -= 0.3) line.push([0, z]);
  for (let a = 0; a <= Math.PI / 2 + 1e-6; a += Math.PI / 24) line.push([-turn + turn * Math.cos(a), -10 + turn - turn * Math.sin(a)]);
  for (let x = -turn - 0.3; x > turntable.x + turntable.r; x -= 0.3) line.push([x, -10]);
  line.push([turntable.x + turntable.r, -10]);
  track(at, line, gauge, sleeper);
  track(at, [[carts.x, turntable.z + turntable.r], [carts.x, carts.siding.z1 - 0.05]], gauge, sleeper);

  const hall = at(turntable.x, turntable.z);
  hall.cyl(turntable.r, turntable.r, 0.1, 16, { at: [turntable.x, 0.05, turntable.z], color: PAL.woodDark, jitter: 0.1 });
  for (const [dx, dz] of [
    [1, 0],
    [0, 1],
  ]) {
    for (const s of [-1, 1]) {
      const [ox, oz] = [dz * s * (gauge / 2), dx * s * (gauge / 2)];
      hall.box(dx ? 2 * turntable.r - 0.1 : 0.07, 0.07, dz ? 2 * turntable.r - 0.1 : 0.07, { color: PAL.iron, at: [turntable.x + ox, 0.14, turntable.z + oz] });
    }
  }
  for (const z of carts.z) oreCart(hall, carts.x, z, z === carts.z[0]);
}

/** Two rails `gauge` apart along `line`, on sleepers every `every` m. */
function track(at: (x: number, z: number) => ModelBuilder, line: readonly (readonly [number, number])[], gauge: number, every: number): void {
  let next = 0;
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1];
    const [bx, bz] = line[i];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    const tx = (bx - ax) / len;
    const tz = (bz - az) / len;
    const b = at((ax + bx) / 2, (az + bz) / 2);
    for (const s of [-1, 1]) {
      const [ox, oz] = [-tz * s * (gauge / 2), tx * s * (gauge / 2)];
      b.bar([ax + ox, 0.12, az + oz], [bx + ox, 0.12, bz + oz], 0.07, 0.07, { color: PAL.iron, jitter: 0.04 });
    }
    while (next <= walked + len) {
      const t = (next - walked) / len;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      at(x, z).box(1.3, 0.08, 0.2, { ...TIMBER, at: [x, 0.04, z], rot: [0, Math.atan2(tx, tz), 0] });
      next += every;
    }
    walked += len;
  }
}

/** An ore cart on the rails, its front along ±Z: a tapered iron tub on four wheels, maybe heaped with ore. */
function oreCart(b: ModelBuilder, x: number, z: number, full: boolean): void {
  b.taper(0.8, 1.0, 1.0, 1.2, 0.6, { at: [x, 0.3, z], color: PAL.ironDark });
  for (const dx of [-0.45, 0.45]) for (const dz of [-0.35, 0.35]) b.cyl(0.14, 0.14, 0.08, 8, { at: [x + dx, 0.22, z + dz], rot: [0, 0, Math.PI / 2], color: PAL.iron });
  if (!full) return;
  const rand = mulberry32(Math.round(z * 100));
  for (let i = 0; i < 5; i++) b.shape(new IcosahedronGeometry(0.2, 0), { at: [x + (rand() - 0.5) * 0.5, 0.9, z + (rand() - 0.5) * 0.6], rot: [rand() * 3, rand() * 3, 0], color: EARTH.rockDark, jitter: 0.2 });
}

// ------------------------------------------------------------------ the cart hall

/** The cart hall: props and beams under its roof, the winch over the shaft, the bandits' camp. */
function buildCartHall(b: ModelBuilder, glow: Glow): void {
  const hall = minePiece('cart hall');
  const top = hall.floor + hall.height;
  const { props, propRadius, winch, brazier, crates, bedrolls } = MINE;
  // Each prop holds up a beam that runs the hall's width under its roof.
  for (const [x, z] of props) {
    b.box(propRadius * 1.7, top, propRadius * 1.7, { ...TIMBER, at: [x, top / 2, z] })
      .box(0.9, 0.2, 0.3, { ...TIMBER, at: [x, top - 0.34, z] })
      .box(hall.x1 - hall.x0, 0.24, 0.26, { ...TIMBER, at: [(hall.x0 + hall.x1) / 2, top - 0.12, z] });
    for (const s of [-1, 1]) b.bar([x, top - 1.1, z], [x + s * 0.8, top - 0.3, z], 0.12, 0.12, TIMBER);
  }

  // The winch over the boarded-up shaft, in its corner.
  const wx = (winch.x0 + winch.x1) / 2;
  const wz = (winch.z0 + winch.z1) / 2;
  const collar: PartOpts = { color: BUILD.timber, jitter: 0.12 };
  for (const s of [-1, 1]) {
    b.box(1.9, 0.25, 0.22, { ...collar, at: [wx, 0.12, wz + s * 0.95] }).box(0.22, 0.25, 1.9, { ...collar, at: [wx + s * 0.95, 0.12, wz] });
  }
  for (let i = 0; i < 5; i++) b.box(0.3, 0.05, 1.7, { color: BUILD.plank, jitter: 0.15, at: [wx - 0.64 + i * 0.32, 0.26, wz], rot: [0, 0, (i % 2 ? 1 : -1) * 0.02] });
  for (const s of [-1, 1]) {
    const x = wx + s * 1.15;
    b.bar([x, 0, wz - 0.7], [x, 1.7, wz], 0.14, 0.14, TIMBER).bar([x, 0, wz + 0.7], [x, 1.7, wz], 0.14, 0.14, TIMBER);
  }
  b.cyl(0.18, 0.18, 2.3, 8, { ...TIMBER, at: [wx, 1.6, wz], rot: [0, 0, Math.PI / 2] })
    .box(0.06, 0.5, 0.06, { ...IRON, at: [wx + 1.25, 1.35, wz] })
    .box(0.04, 1.3, 0.04, { color: BUILD.canvas, at: [wx, 0.95, wz], jitter: 0 });

  // The bandits' brazier, crates and bedrolls.
  const { x: bx, z: bz, height } = brazier;
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * Math.PI) / 3;
    b.bar([bx + Math.cos(a) * 0.38, 0, bz + Math.sin(a) * 0.38], [bx + Math.cos(a) * 0.2, height - 0.2, bz + Math.sin(a) * 0.2], 0.05, 0.05, IRON);
  }
  b.cyl(0.42, 0.22, 0.3, 8, { ...IRON, at: [bx, height - 0.12, bz] })
    .box(0.55, 0.06, 0.55, { at: [bx, height + 0.02, bz], color: PAL.coal, glow: 0.9, jitter: 0.2 });
  for (const [dx, dz, h] of [
    [0, 0, 0.5],
    [0.12, -0.1, 0.35],
    [-0.12, 0.1, 0.4],
  ]) b.cone(0.13, h, 5, { at: [bx + dx, height + 0.05 + h / 2, bz + dz], color: PAL.flame, glow: 1, jitter: 0.1 });
  glow(bx, height + 0.35, bz, 1.3);
  const cx = (crates.x0 + crates.x1) / 2;
  const cz = (crates.z0 + crates.z1) / 2;
  b.box(0.7, 0.6, 0.7, { color: BUILD.plank, jitter: 0.12, at: [cx - 0.3, 0.3, cz] })
    .box(0.6, 0.55, 0.6, { color: PAL.wood, jitter: 0.12, at: [cx + 0.35, 0.28, cz + 0.1] })
    .box(0.55, 0.5, 0.55, { color: BUILD.plank, jitter: 0.12, at: [cx - 0.25, 0.85, cz - 0.05], rot: [0, 0.3, 0] })
    .box(0.4, 0.5, 0.35, { color: BUILD.canvas, jitter: 0.1, at: [cx + 0.35, 0.8, cz + 0.05], rot: [0, -0.2, 0] });
  for (const [x, z, yaw] of bedrolls) {
    b.box(0.8, 0.07, 1.8, { color: PAL.clothDark, jitter: 0.1, at: [x, 0.035, z], rot: [0, yaw, 0] })
      .box(0.55, 0.05, 1.3, { color: PAL.cloth, jitter: 0.1, at: [x, 0.09, z], rot: [0, yaw, 0] });
    const [ux, uz] = [Math.sin(yaw) * -0.75, Math.cos(yaw) * -0.75];
    b.cyl(0.13, 0.13, 0.7, 6, { color: BUILD.canvas, at: [x + ux, 0.14, z + uz], rot: [0, yaw, Math.PI / 2] });
  }
}

// ------------------------------------------------------------------ the gallery

/** The gallery: timbers on its west wall, the scaffolding on its east, and a streak of the vein. */
function buildGallery(b: ModelBuilder): void {
  const gallery = minePiece('gallery');
  const top = gallery.floor + gallery.height;
  const { scaffold, sets } = MINE;
  // Props against the west wall, sunk into it, with lanterns on some.
  for (const z of [-23, -31]) {
    b.box(sets.post, top, sets.post, { ...TIMBER, at: [gallery.x0 + sets.post / 2 - 0.07, top / 2, z] })
      .box(0.5, 0.22, 0.3, { ...TIMBER, at: [gallery.x0 + 0.2, top - 0.3, z] });
  }
  // The scaffolding: two rows of posts, two decks of planks with a rail, braces between.
  const rows = [scaffold.x0 + 0.1, scaffold.x1 - 0.1];
  const n = 4;
  const zs = Array.from({ length: n }, (_, i) => scaffold.z0 + 0.1 + (i * (scaffold.z1 - scaffold.z0 - 0.2)) / (n - 1));
  for (const x of rows) for (const z of zs) b.box(0.16, top - 0.6, 0.16, { ...TIMBER, at: [x, (top - 0.6) / 2, z] });
  for (const y of scaffold.decks) {
    for (let i = 0; i < 4; i++) {
      const x = scaffold.x0 + 0.17 + i * 0.32;
      b.box(0.3, 0.05, scaffold.z1 - scaffold.z0, { color: BUILD.plank, jitter: 0.15, at: [x, y, (scaffold.z0 + scaffold.z1) / 2] });
    }
    b.box(0.08, 0.08, scaffold.z1 - scaffold.z0, { ...TIMBER, at: [rows[0], y + 0.95, (scaffold.z0 + scaffold.z1) / 2] });
    for (const x of rows) b.box(0.12, 0.14, scaffold.z1 - scaffold.z0, { ...TIMBER, at: [x, y - 0.1, (scaffold.z0 + scaffold.z1) / 2] });
  }
  for (let i = 0; i < n - 1; i++) b.bar([rows[0], 0.3, zs[i]], [rows[0], scaffold.decks[0] - 0.15, zs[i + 1]], 0.1, 0.1, TIMBER);
  // A ladder's stump, broken off below the first deck: nothing climbs it.
  for (const s of [-0.22, 0.22]) b.box(0.07, 1.1, 0.07, { ...TIMBER, at: [rows[0] - 0.12, 0.55, zs[1] + 0.9 + s] });
  for (let y = 0.3; y < 1.1; y += 0.3) b.box(0.05, 0.05, 0.5, { ...TIMBER, at: [rows[0] - 0.12, y, zs[1] + 0.9] });

  // The vein the old miners followed: pale streaks in the west wall.
  const rand = mulberry32(25);
  for (let i = 0; i < 7; i++) {
    const z = gallery.z0 + 3 + rand() * (gallery.z1 - gallery.z0 - 6);
    const y = 1.2 + rand() * 3.5;
    b.box(0.06, 0.08 + rand() * 0.08, 0.8 + rand() * 1.4, { color: 0x9aa4ae, glow: 0.06, jitter: 0.1, at: [gallery.x0 + 0.05, y, z], rot: [rand() * 0.4 - 0.2, 0, 0] });
  }
}

// ------------------------------------------------------------------ the bandits' ramp and dig

/** The bandits' crooked props down their ramp: thinner than the old miners', leaning, far apart. */
function buildRamp(at: (x: number, z: number) => ModelBuilder, floorAt: (x: number, z: number) => number): void {
  const { hw, height } = MINE.tunnel;
  const { post, cap, first, second } = MINE.ramp;
  const inset = hw + post / 2 - 0.06;
  const [legA, legB] = [minePiece('ramp east'), minePiece('ramp north')];
  const mid = (a: number, b: number) => (a + b) / 2;
  const set = (x: number, z: number, across: Axis, lean: number) => {
    const b = at(x, z);
    const y = floorAt(x, z);
    for (const s of [-1, 1]) {
      const [px, pz] = across === 'x' ? [x + s * inset, z] : [x, z + s * inset];
      b.box(post, height - 0.05, post, { ...TIMBER, at: [px, y + (height - 0.05) / 2, pz], rot: across === 'x' ? [lean * s, 0, 0] : [0, 0, lean * s] });
    }
    const [w, d] = across === 'x' ? [2 * hw + 0.2, cap] : [cap, 2 * hw + 0.2];
    b.box(w, cap, d, { ...TIMBER, at: [x, y + height - cap / 2 - 0.05, z], rot: across === 'x' ? [0, 0, lean * 0.3] : [lean * 0.3, 0, 0] });
  };
  first.forEach((x, i) => set(x, mid(legA.z0, legA.z1), 'z', i % 2 ? 0.05 : -0.04));
  second.forEach((z, i) => set(mid(legB.x0, legB.x1), z, 'x', i % 2 ? -0.05 : 0.04));
}

/** The dig: the silver vein glinting in its walls, and what the bandits dropped (bar their strongbox, a chest). */
function buildDig(b: PartBuilders, glow: Glow): void {
  const dig = minePiece('dig');
  const { picks, cloak, lantern: fallen, vein } = MINE.dig;
  const y = dig.floor;
  const m = b.model;
  // The vein: bright flecks of silver along the north and west walls, catching the light.
  const rand = mulberry32(26);
  for (let i = 0; i < vein; i++) {
    const north = i % 3 !== 0;
    const along = north ? dig.x0 + 1.5 + rand() * (dig.x1 - dig.x0 - 3) : dig.z0 + 1.5 + rand() * (dig.z1 - dig.z0 - 5);
    const h = y + 0.9 + rand() * 2.6;
    const len = 0.5 + rand() * 0.9;
    // Half sunk in the rock's lumps, so it reads as a seam in the wall, not a bar in front of it.
    const [x, z] = north ? [along, dig.z0 + 0.1] : [dig.x0 + 0.1, along];
    m.box(north ? len : 0.1, 0.05 + rand() * 0.05, north ? 0.1 : len, { color: 0x8a949e, glow: 0.08, jitter: 0.12, at: [x, h, z], rot: north ? [0, 0, rand() * 0.6 - 0.3] : [rand() * 0.6 - 0.3, 0, 0] });
    for (let k = 0; k < 3; k++) m.box(0.04, 0.04, 0.04, { color: 0xdce6f0, glow: 0.35, jitter: 0, at: [x + (north ? (rand() - 0.5) * len : 0.1), h + (rand() - 0.5) * 0.2, z + (north ? 0.1 : (rand() - 0.5) * len)] });
  }
  // Their strongbox by the north wall is Oakvale's chest now (world/chests.ts), opened by its lid.
  // Two picks dropped on the floor.
  for (const [x, z, yaw] of picks) {
    m.box(0.05, 0.05, 0.9, { color: PAL.wood, at: [x, y + 0.03, z], rot: [0, yaw, 0] });
    const hx = x + Math.sin(yaw) * 0.42;
    const hz = z + Math.cos(yaw) * 0.42;
    m.box(0.55, 0.06, 0.06, { ...IRON, at: [hx, y + 0.04, hz], rot: [0, yaw, 0.08] });
  }
  // A torn cloak, dropped in a heap.
  m.box(0.9, 0.04, 0.6, { color: PAL.cloth, jitter: 0.12, at: [cloak.x, y + 0.02, cloak.z], rot: [0, cloak.yaw, 0] })
    .box(0.5, 0.06, 0.45, { color: PAL.clothDark, jitter: 0.12, at: [cloak.x + 0.3, y + 0.04, cloak.z - 0.2], rot: [0, cloak.yaw + 0.7, 0.1] })
    .box(0.3, 0.03, 0.25, { color: PAL.cloth, jitter: 0.12, at: [cloak.x - 0.45, y + 0.02, cloak.z + 0.25], rot: [0, cloak.yaw - 0.5, 0] });
  // Their lantern, fallen on its side and still burning.
  // Its cage lies along its length: two end caps and four bars, the flame showing between.
  m.on(0, new Matrix4().makeRotationY(0.5).setPosition(fallen.x, y + 0.1, fallen.z));
  for (const e of [-1, 1]) m.box(0.2, 0.2, 0.03, { ...IRON, at: [0, 0, e * 0.13] });
  for (const [bx, by] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]) m.box(0.025, 0.025, 0.26, { ...IRON, at: [bx * 0.09, by * 0.09, 0] });
  m.box(0.13, 0.13, 0.2, { at: [0, 0, 0], color: 0xffd080, glow: 1, jitter: 0 });
  m.on(0, new Matrix4());
  glow(fallen.x, y + 0.12, fallen.z, 0.6);
}

// ------------------------------------------------------------------ the crypt

/**
 * The crypt the bandits broke into: its outer wall laid bare round the
 * breach, the carved passage's stone ribs, the antechamber's braziers and
 * the frame of the hall's gate, and the Warden's hall itself, the arena's.
 */
function buildCrypt(hollow: Hollow, builders: PartBuilders[], glowIn: (part: number) => Glow, floorAt: (x: number, z: number) => number): void {
  const dig = minePiece('dig');
  const breach = minePiece('breach');
  const { masonry } = MINE;
  // The crypt's wall on the dig's side, round the hole, and loose bricks at its foot.
  const b4 = builders[4];
  const x = dig.x1 - masonry.thick / 2;
  const hole = breach.height;
  const box = (z0: number, z1: number, y0: number, y1: number) =>
    b4.walls.box(masonry.thick, y1 - y0, z1 - z0, { ...TEXTURED, at: [x, dig.floor + (y0 + y1) / 2, (z0 + z1) / 2] });
  box(masonry.z0, breach.z0, 0, masonry.height);
  box(breach.z1, masonry.z1, 0, masonry.height);
  box(breach.z0, breach.z1, hole, masonry.height);
  const rand = mulberry32(27);
  for (let i = 0; i < 14; i++) {
    const z = breach.z0 - 0.8 + rand() * (breach.z1 - breach.z0 + 1.6);
    const out = 0.3 + rand() * 1.1;
    b4.model.box(0.3, 0.1, 0.16, { color: BRICK, jitter: 0.15, at: [dig.x1 - out, dig.floor + 0.05, z], rot: [0, rand() * 3, rand() * 0.3] });
  }
  // Broken bricks round the hole's edge.
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? breach.z0 : breach.z1;
    b4.model.box(0.32, 0.16, 0.2, { color: BRICK, jitter: 0.15, at: [dig.x1 - masonry.thick - 0.02, dig.floor + 0.3 + rand() * (hole - 0.4), side + (rand() - 0.5) * 0.2], rot: [0, 0, rand() * 0.4] });
  }

  // Stone ribs across the carved passage's vault, every few metres, following its slope.
  const passage = minePiece('carved passage');
  for (let z = passage.z0 + 1.5; z < passage.z1 - 0.5; z += 3) {
    const cx = (passage.x0 + passage.x1) / 2;
    const top = floorAt(cx, z) + passage.height;
    const b = builders[passage.part].model;
    b.box(passage.x1 - passage.x0, 0.22, 0.3, { ...VAULT, at: [cx, top - 0.11, z] });
    for (const s of [-1, 1]) b.box(0.18, passage.height, 0.3, { color: PAL.stone, jitter: 0.08, at: [cx + s * ((passage.x1 - passage.x0) / 2 - 0.09), top - passage.height / 2, z] });
  }

  // The antechamber: a brazier either side of the gate, and the gate's frame on this side.
  const ante = minePiece('antechamber');
  const b6 = builders[ante.part].model;
  const gate = minePiece('gate');
  const lift = (b: ModelBuilder, dy: number, fn: () => void) => {
    b.on(0, new Matrix4().makeTranslation(0, dy, 0));
    fn();
    b.on(0, new Matrix4());
  };
  lift(b6, ante.floor, () => {
    for (const [bx, bz] of MINE.braziers) brazier(b6, (gx, gy, gz, size, color) => glowIn(ante.part)(gx, ante.floor + gy, gz, size, color), bx, bz);
    const gx = (gate.x0 + gate.x1) / 2;
    gateFrame(b6, (x, y, inset) => [gx + x, y, ante.z0 + inset], [0, 0, 0]);
    // Plinth and cornice along its walls, as the hall's: the plinth broken where the passage and the gate open, the cornice running on over them.
    const walls = hollow.walls.filter((w) => hollow.pieces[w.piece] === ante);
    const over = hollow.lintels.filter((l) => hollow.pieces[l.wall.piece] === ante).map((l) => l.wall);
    for (const [{ height, depth }, y, color, along] of [
      [PLINTH, PLINTH.height / 2, PAL.stoneDark, walls],
      [CORNICE, ante.height - CORNICE.height / 2, PAL.stone, [...walls, ...over]],
    ] as const) {
      for (const w of along) {
        const length = Math.hypot(w.bx - w.ax, w.bz - w.az);
        const [cx, cz] = [(w.ax + w.bx) / 2 + (w.nx * depth) / 2, (w.az + w.bz) / 2 + (w.nz * depth) / 2];
        const [sx, sz] = w.nx === 0 ? [length, depth] : [depth, length];
        b6.box(sx, height, sz, { color, at: [cx, y, cz] });
      }
    }
  });

  // The Warden's hall, as the arena's, come in by its south gate; its east and west gates are choked.
  const { hall } = MINE;
  const hallPiece = minePiece('hall');
  const hallPart = builders[hallPiece.part];
  const offset = new Matrix4().makeTranslation(hall.x, hall.floor, hall.z);
  for (const b of [hallPart.model, hallPart.floor, hallPart.walls]) b.on(0, offset);
  buildHall(
    { floor: hallPart.floor, walls: hallPart.walls, props: hallPart.model, glow: (gx, gy, gz, size, color) => glowIn(hallPiece.part)(hall.x + gx, hall.floor + gy, hall.z + gz, size, color) },
    { south: 'through', east: 'choked', west: 'choked' },
  );
  for (const b of [hallPart.model, hallPart.floor, hallPart.walls]) b.on(0, new Matrix4());
}
