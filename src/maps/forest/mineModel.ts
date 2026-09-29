import { type Camera, Group, IcosahedronGeometry, Matrix4, Mesh, PlaneGeometry, Vector3 } from 'three';
import { ModelBuilder, type PartOpts } from '../../models/kit';
import { sharedModelMaterial } from '../../models/materials';
import { PAL } from '../../models/palette';
import { Glows } from '../../world/glows';
import type { Mine, MinePlan } from '../../world/mine';
import { Hollow, type Wall } from './hollow';
import { FLAME } from './interiorModel';
import { MINE } from './mine';
import { mulberry32, valueNoise } from './noise';
import { BUILD, EARTH } from './palette';

// The old mine's meshes, built in the mouth's frame (mine.ts) and placed with
// it: for each part (the adit, the cart hall, the gallery) one mesh and its
// glows. The rock is planes facing into the open space, roughened away from
// their edges so neighbouring walls still meet; the timbers, rails, carts and
// the bandits' leavings stand on it.

/** How far the rock's faces are pushed out into the open space, at most. */
const ROUGH = 0.12;
/** The rock stops this far out past the mouth's line, behind its timbers. */
const LIP = 0.1;

const ROCK: PartOpts = { color: EARTH.cliff, jitter: 0.14 };
const CEILING: PartOpts = { color: EARTH.rockDark, jitter: 0.14 };
const FLOOR: PartOpts = { color: EARTH.dirtDark, jitter: 0.1 };
const TIMBER: PartOpts = { color: PAL.woodDark, jitter: 0.12 };
const IRON: PartOpts = { color: PAL.ironDark, jitter: 0.05 };

type Glow = (x: number, y: number, z: number, size: number) => void;

/** The mine, its parts hidden but for the adit, for its `plan`. */
export function buildMine(plan: MinePlan): Mine {
  const { mouth } = plan;
  const place = new Matrix4().makeRotationY(mouth.yaw).setPosition(mouth.x, mouth.y, mouth.z);
  const hollow = new Hollow(MINE.pieces);
  const partOf = (x: number, z: number) => hollow.pieceAt(x, z).part;

  const builders = MINE.parts.map((_, i) => new ModelBuilder(250 + i));
  const glows = MINE.parts.map(() => new Glows());
  const glowIn = (part: number): Glow => (x, y, z, size) => {
    const p = new Vector3(x, y, z).applyMatrix4(place);
    glows[part].add(p.x, p.y, p.z, size, FLAME);
  };
  const at = (x: number, z: number) => builders[partOf(x, z)];
  const glowAt = (x: number, z: number) => glowIn(partOf(x, z));

  buildRock(hollow, builders);
  buildSets(at);
  buildRails(at);
  buildHall(builders[1], glowIn(1));
  buildGallery(builders[2]);
  for (const [x, y, z] of MINE.lanterns) lantern(at(x, z), glowAt(x, z), x, y, z);

  const parts = builders.map((b, i) => {
    const geometry = b.build({ ao: { from: 0, to: 1.4, min: 0.6 } });
    geometry.applyMatrix4(place);
    const mesh = new Mesh(geometry, sharedModelMaterial());
    mesh.name = `mine-${MINE.parts[i].replace(' ', '-')}`;
    const group = new Group();
    group.name = `${mesh.name}-part`;
    group.add(mesh, glows[i].mesh);
    return group;
  });
  const root = new Group();
  root.name = 'mine';
  root.add(...parts);

  let current = 0;
  let time = 0;
  const mine: Mine = {
    ...plan,
    root,
    show(entered, outdoors, x, z) {
      if (entered) current = plan.partAt(x, z);
      for (let i = 0; i < parts.length; i++) parts[i].visible = entered ? Math.abs(i - current) <= 1 : i === 0 && outdoors;
    },
    update(dt: number, camera: Camera) {
      time += dt;
      for (let i = 0; i < parts.length; i++) if (parts[i].visible) glows[i].update(time, camera);
    },
  };
  mine.show(false, true, mouth.x, mouth.z);
  return mine;
}

// ------------------------------------------------------------------ rock

/**
 * A w×h plane facing +Z, its middle pushed out towards +Z by up to ROUGH in
 * lumps, its edges left flat so it meets its neighbours. `u0`, `v0` place
 * the lumps, so one wall's lumps don't repeat another's.
 */
function roughPlane(w: number, h: number, u0: number, v0: number, seed: number): PlaneGeometry {
  const sw = Math.max(1, Math.round(w / 0.8));
  const sh = Math.max(1, Math.round(h / 0.8));
  const g = new PlaneGeometry(w, h, sw, sh);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const edge = Math.min(w / 2 - Math.abs(x), h / 2 - Math.abs(y));
    if (edge < 1e-3) continue;
    const lump = valueNoise((u0 + x) * 0.9, (v0 + y) * 0.9, seed) * 0.7 + valueNoise((u0 + x) * 2.3, (v0 + y) * 2.3, seed + 1) * 0.3;
    pos.setZ(i, ROUGH * lump * Math.min(1, edge / 0.5));
  }
  return g;
}

/** The rock round the open space: floors, ceilings, walls and the rock over openings, each in its piece's part. */
function buildRock(hollow: Hollow, builders: ModelBuilder[]): void {
  const { pieces } = hollow;
  for (const { piece, rect } of hollow.floors()) {
    const z1 = Math.min(rect.z1, LIP);
    const w = rect.x1 - rect.x0;
    const d = z1 - rect.z0;
    if (d <= 0) continue;
    const g = new PlaneGeometry(w, d, Math.max(1, Math.round(w / 1.2)), Math.max(1, Math.round(d / 1.2)));
    builders[pieces[piece].part].shape(g, { ...FLOOR, at: [(rect.x0 + rect.x1) / 2, pieces[piece].floor, (rect.z0 + z1) / 2], rot: [-Math.PI / 2, 0, 0] });
  }
  for (const { piece, rect } of hollow.ceilings()) {
    const p = pieces[piece];
    // The ceiling stops at the mouth's line, under the lintel.
    const z1 = Math.min(rect.z1, 0);
    const w = rect.x1 - rect.x0;
    const d = z1 - rect.z0;
    if (d <= 0) continue;
    const g = roughPlane(w, d, rect.x0, rect.z0, 61);
    builders[p.part].shape(g, { ...CEILING, at: [(rect.x0 + rect.x1) / 2, p.floor + p.height, (rect.z0 + z1) / 2], rot: [Math.PI / 2, 0, 0] });
  }
  const face = (w: Wall, y0: number, y1: number, part: number) => {
    const bz = Math.min(w.bz, LIP);
    const az = Math.min(w.az, LIP);
    const len = Math.hypot(w.bx - w.ax, bz - az);
    if (len <= 1e-3) return;
    const g = roughPlane(len, y1 - y0, w.ax + w.az, y0, 67);
    builders[part].shape(g, { ...ROCK, at: [(w.ax + w.bx) / 2, (y0 + y1) / 2, (az + bz) / 2], rot: [0, Math.atan2(w.nx, w.nz), 0] });
  };
  for (const w of hollow.walls) {
    const p = pieces[w.piece];
    face(w, p.floor, p.floor + p.height, p.part);
  }
  for (const l of hollow.lintels) face(l.wall, l.y0, l.y1, pieces[l.wall.piece].part);
  // Over the adit's first metres, where the hillside is dug away, a lump of rock to close the hole.
  const { hw, height } = MINE.tunnel;
  builders[0].box(2 * hw + 1.1, 1.8, 2.6, { ...ROCK, at: [0, height + 0.95, -1.3] });
}

// ------------------------------------------------------------------ timbers

/** Timber sets along the tunnels (posts in the walls, a cap beam over), every few metres. */
function buildSets(at: (x: number, z: number) => ModelBuilder): void {
  const { hw, height } = MINE.tunnel;
  const { every, post, cap } = MINE.sets;
  // Sunk into the rock but for a hand's breadth.
  const inset = hw + post / 2 - 0.07;
  const set = (x: number, z: number, across: 'x' | 'z') => {
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
function buildHall(b: ModelBuilder, glow: Glow): void {
  const hall = MINE.pieces[2];
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

/** The gallery: timbers on its west wall, the scaffolding on its east, a streak of the vein, and the fallen rock at its end. */
function buildGallery(b: ModelBuilder): void {
  const gallery = MINE.pieces[4];
  const top = gallery.floor + gallery.height;
  const { scaffold, fall, sets } = MINE;
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

  // Fallen rock heaped across the far end, where the bandits' ramp goes down, and the broken timbers that let it in.
  const fx = (fall.x0 + fall.x1) / 2;
  for (let i = 0; i < 16; i++) {
    const r = 0.4 + rand() * 0.6;
    const x = fall.x0 + r * 0.6 + rand() * (fall.x1 - fall.x0 - r * 1.2);
    const d = 1 - Math.abs(x - fx) / ((fall.x1 - fall.x0) / 2);
    const z = fall.z0 + 0.2 + rand() * (fall.z1 - fall.z0 - r * 0.9 - 0.2);
    const y = r * 0.6 + rand() * 2.4 * d;
    b.shape(new IcosahedronGeometry(r, 0), { at: [x, y, z], rot: [rand() * 3, rand() * 3, 0], color: rand() < 0.5 ? EARTH.cliff : EARTH.rockDark, jitter: 0.18 });
  }
  b.box(0.22, 2.6, 0.22, { ...TIMBER, at: [fall.x0 + 0.2, 1.3, fall.z0 + 0.25], rot: [0, 0, 0.12] })
    .box(0.22, 1.4, 0.22, { ...TIMBER, at: [fall.x1 - 0.2, 0.7, fall.z0 + 0.3] })
    .bar([fall.x0 + 0.1, 2.5, fall.z0 + 0.4], [fall.x1 - 0.4, 1.1, fall.z0 + 0.6], 0.22, 0.22, TIMBER);
}
