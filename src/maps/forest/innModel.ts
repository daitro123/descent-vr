import { type BufferGeometry, type Camera, Group, Matrix4, Mesh, Vector3 } from 'three';
import { CONFIG } from '../../config';
import { ModelBuilder, type PartOpts } from '../../models/kit';
import { sharedModelMaterial } from '../../models/materials';
import { PAL } from '../../models/palette';
import { Glows } from '../../world/glows';
import type { Interior, InteriorPlan } from '../../world/interiors';
import { INN, innFlames } from './inn';
import { mulberry32 } from './noise';
import { BUILD, EARTH } from './palette';

// The Golden Tankard's taproom, built in the inn's frame (inn.ts) and placed
// with it: one mesh for the room, its glows, and the door's two leaves, which
// hang in the doorway whether you're in or out.

const DAYLIGHT = 0xe4ecf0;
const FLAME = 0xffb050;

/** The taproom, its glows and the door, for the inn's `plan`. */
export function buildInnInterior(plan: InteriorPlan): Interior {
  const { frame } = plan;
  const place = new Matrix4().makeRotationY(frame.yaw).setPosition(frame.x, frame.y, frame.z);
  const glows = new Glows();
  const glow = (x: number, y: number, z: number, size: number) => {
    const p = new Vector3(x, y, z).applyMatrix4(place);
    glows.add(p.x, p.y, p.z, size, FLAME);
  };

  const b = new ModelBuilder(23);
  buildRoom(b, glow);
  const geometry = b.build({ ao: { from: INN.floor, to: INN.floor + 1.2, min: 0.65 } });
  geometry.applyMatrix4(place);
  const roomMesh = new Mesh(geometry, sharedModelMaterial());
  roomMesh.name = 'inn-room';
  const room = new Group();
  room.name = 'inn-taproom';
  room.add(roomMesh, glows.mesh);
  room.visible = false;

  // The door: two leaves hinged at the doorway's sides, swinging in.
  const { width, height } = INN.door;
  const leaf = buildLeaf(width / 2 - 0.01, height);
  const hinges = [-1, 1].map((side) => {
    const hinge = new Group();
    const mesh = new Mesh(leaf, sharedModelMaterial());
    mesh.name = 'inn-door';
    mesh.scale.x = -side; // the left leaf reaches right from its hinge, the right leaf left
    hinge.add(mesh);
    const at = new Vector3(side * (width / 2), INN.floor, INN.leaves.z - INN.leaves.thick / 2).applyMatrix4(place);
    hinge.position.copy(at);
    return { hinge, side };
  });

  const root = new Group();
  root.name = 'inn-interior';
  root.add(room, ...hinges.map((h) => h.hinge));
  let time = 0;
  const interior: Interior = {
    ...plan,
    root,
    room,
    swing(open: number) {
      // Turning the left leaf (reaching +X) by +a swings it in towards −Z; the right leaf turns the other way.
      for (const { hinge, side } of hinges) hinge.rotation.y = frame.yaw - side * CONFIG.interiors.angle * open;
    },
    update(dt: number, camera: Camera) {
      time += dt;
      if (room.visible) glows.update(time, camera);
    },
  };
  interior.swing(0);
  return interior;
}

/** One of the door's leaves, from its hinge (at the origin, on the floor) out along +X. */
function buildLeaf(w: number, h: number): BufferGeometry {
  const b = new ModelBuilder(7);
  const t = INN.leaves.thick;
  const board: PartOpts = { color: BUILD.plank, jitter: 0.12 };
  const boards = 3;
  for (let i = 0; i < boards; i++) b.box(w / boards - 0.01, h, t, { ...board, at: [(i + 0.5) * (w / boards), h / 2, 0] });
  for (const y of [0.35, h - 0.35]) b.box(w - 0.04, 0.12, t + 0.03, { at: [w / 2, y, 0], color: BUILD.timber, jitter: 0.1 });
  b.bar([0.06, 0.45, 0], [w - 0.08, h - 0.45, 0], 0.1, t + 0.02, { color: BUILD.timber, jitter: 0.1 });
  for (const y of [0.35, h - 0.35]) b.box(0.4, 0.05, t + 0.05, { at: [0.2, y, 0], color: PAL.ironDark, jitter: 0 });
  b.box(0.05, 0.14, 0.06, { at: [w - 0.12, h * 0.48, 0.05], color: PAL.ironDark, jitter: 0 });
  b.box(0.05, 0.14, 0.06, { at: [w - 0.12, h * 0.48, -0.05], color: PAL.ironDark, jitter: 0 });
  return b.build();
}

type Glow = (x: number, y: number, z: number, size: number) => void;

function buildRoom(b: ModelBuilder, glow: Glow): void {
  const { room, floor, door, leaves, hearth, fireplace, bar, shelves, barrels, tables, table } = INN;
  const W = room.hw;
  const D = room.hd;
  const H = room.height;
  const top = floor + H;
  const stone: PartOpts = { color: PAL.stone, jitter: 0.1 };
  const plaster: PartOpts = { color: BUILD.plaster, jitter: 0.04 };
  const timber: PartOpts = { color: BUILD.timber, jitter: 0.1 };

  // The floor: broad boards running front to back.
  const boards = 14;
  for (let i = 0; i < boards; i++) {
    const x = -W + ((i + 0.5) * 2 * W) / boards;
    b.box((2 * W) / boards - 0.015, 0.06, 2 * D, { at: [x, floor - 0.03, 0], color: i % 3 ? BUILD.plank : PAL.wood, jitter: 0.1 });
  }

  // Walls: stone to the waist, plaster above, a timber rail between. Their inner faces stand at ±W and ±D.
  const low = 1.0;
  const wall = (w: number, d: number, x: number, z: number, y0: number = floor, y1: number = top) => {
    const split = Math.min(Math.max(floor + low, y0), y1);
    if (split > y0) b.box(w, split - y0, d, { ...stone, at: [x, (y0 + split) / 2, z] });
    if (y1 > split) b.box(w, y1 - split, d, { ...plaster, at: [x, (split + y1) / 2, z] });
  };
  const t = 0.06;
  wall(2 * W + 2 * t, t, 0, -D - t / 2);
  wall(t, 2 * D, -W - t / 2, 0);
  wall(t, 2 * D, W + t / 2, 0);
  // The front, round the doorway: thick enough to meet the door's frame, so no gap shows beside the shut door.
  const front = leaves.z - leaves.thick - D;
  const jamb = door.width / 2;
  const lintel = floor + door.height;
  for (const side of [-1, 1]) wall(W + t - jamb, front, side * (jamb + (W + t - jamb) / 2), D + front / 2);
  wall(2 * jamb, front, 0, D + front / 2, lintel, top);
  b.box(2 * jamb + 0.24, 0.12, front + 0.04, { ...timber, at: [0, lintel + 0.06, D + front / 2 - 0.02] });
  for (const [w, d, x, z] of [
    [2 * W, 0.1, 0, -D + 0.05],
    [0.1, 2 * D, -W + 0.05, 0],
    [0.1, 2 * D, W - 0.05, 0],
    [W - jamb, 0.1, -(jamb + W) / 2, D - 0.05],
    [W - jamb, 0.1, (jamb + W) / 2, D - 0.05],
  ] as const) b.box(w, 0.1, d, { ...timber, at: [x, floor + low, z] });

  // The ceiling, and its beams from front to back.
  b.box(2 * W + 0.2, 0.08, 2 * D + 0.2, { color: BUILD.plank, jitter: 0.08, at: [0, top + 0.04, 0] });
  for (let x = -W + 1.3; x < W; x += 1.75) b.box(0.2, 0.22, 2 * D, { ...timber, at: [x, top - 0.11, 0] });
  b.box(2 * W, 0.24, 0.22, { ...timber, at: [0, top - 0.12, 0] });

  // Windows: panes glowing with the afternoon outside, where the outside has them.
  const windowAt = (x: number, z: number, yaw: number) => {
    const y = 1.9;
    const rot = [0, yaw, 0] as const;
    const out = (d: number) => [x + Math.sin(yaw) * d, z + Math.cos(yaw) * d] as const;
    const [px, pz] = out(0.03);
    const [fx, fz] = out(0.05);
    const [sx, sz] = out(0.1);
    b.box(0.8, 0.9, 0.03, { at: [px, y, pz], rot, color: DAYLIGHT, glow: 0.85, jitter: 0.02 })
      .box(1.0, 0.1, 0.06, { at: [fx, y + 0.5, fz], rot, color: BUILD.timber })
      .box(0.1, 1.08, 0.06, { at: [fx + Math.cos(yaw) * 0.45, y, fz - Math.sin(yaw) * 0.45], rot, color: BUILD.timber })
      .box(0.1, 1.08, 0.06, { at: [fx - Math.cos(yaw) * 0.45, y, fz + Math.sin(yaw) * 0.45], rot, color: BUILD.timber })
      .box(0.06, 0.9, 0.05, { at: [fx, y, fz], rot, color: BUILD.timber })
      .box(0.8, 0.06, 0.05, { at: [fx, y, fz], rot, color: BUILD.timber })
      .box(1.1, 0.07, 0.16, { at: [sx, y - 0.5, sz], rot, color: BUILD.timber });
  };
  // A window's frame sits proud of the wall into the room: turned to face the room, with `yaw` as a model turns.
  for (const x of [-3.4, 3.4]) windowAt(x, D, Math.PI);
  for (const x of [-2.2, 2.2]) windowAt(x, -D, 0);
  for (const z of [-2.2, 2.2]) {
    windowAt(-W, z, Math.PI / 2);
    windowAt(W, z, -Math.PI / 2);
  }

  // The big hearth on the right wall, under the larger chimney.
  fireplaceOn(b, glow, W, hearth.z, hearth.width, hearth.depth, 1.3, true);
  // The small fireplace on the left wall, under the other chimney: its fire is a glow.
  fireplaceOn(b, glow, -W, fireplace.z, fireplace.width, fireplace.depth, 0.95, false);

  // The bar along the back, its top overhanging towards the room.
  const bx = (bar.x0 + bar.x1) / 2;
  const bw = bar.x1 - bar.x0;
  const bz = bar.z - bar.depth / 2;
  b.box(bw, bar.height - 0.06, bar.depth - 0.1, { color: BUILD.plank, jitter: 0.12, at: [bx, floor + (bar.height - 0.06) / 2, bz - 0.05] })
    .box(bw + 0.1, 0.07, bar.depth + 0.06, { ...timber, at: [bx, floor + bar.height - 0.035, bz] })
    .box(bw, 0.1, 0.06, { ...timber, at: [bx, floor + 0.12, bar.z - 0.02] });
  for (let x = bar.x0 + 0.1; x < bar.x1; x += 1.15) b.box(0.1, bar.height - 0.1, 0.05, { ...timber, at: [x, floor + (bar.height - 0.1) / 2, bar.z - 0.08] });
  // Tankards along the bar.
  for (const x of [-2.1, -1.2, 0.4, 1.5]) tankard(b, x, floor + bar.height, bz + 0.05);

  // Shelves of bottles and tankards on the back wall between its windows.
  const shelfZ = -D + shelves.depth / 2;
  for (const x of [-shelves.half + 0.05, shelves.half - 0.05]) b.box(0.08, 1.6, shelves.depth, { ...timber, at: [x, floor + 1.2 + 0.4, shelfZ] });
  const rand = mulberry32(5);
  [1.0, 1.45, 1.9].forEach((h, row) => {
    b.box(2 * shelves.half, 0.05, shelves.depth, { ...timber, at: [0, floor + h, shelfZ] });
    for (let x = -shelves.half + 0.2; x < shelves.half - 0.1; x += 0.26) {
      if (row === 1 && rand() < 0.5) tankard(b, x, floor + h + 0.025, shelfZ);
      else bottle(b, x, floor + h + 0.025, shelfZ, rand());
    }
  });

  // Barrels past the bar's right end, one with a tap.
  for (const [x, z] of barrels) {
    b.cyl(0.32, 0.28, 0.85, 8, { at: [x, floor + 0.425, z], color: PAL.wood })
      .cyl(0.335, 0.335, 0.05, 8, { at: [x, floor + 0.2, z], color: PAL.ironDark })
      .cyl(0.335, 0.335, 0.05, 8, { at: [x, floor + 0.66, z], color: PAL.ironDark });
  }
  b.cyl(0.25, 0.25, 0.7, 8, { at: [barrels[0][0], floor + 0.85 + 0.35, barrels[0][1]], rot: [0, 0, Math.PI / 2], color: PAL.wood })
    .box(0.05, 0.1, 0.05, { at: [barrels[0][0] - 0.38, floor + 1.15, barrels[0][1]], color: PAL.gold, jitter: 0 });

  // Four tables, each with a bench along either side.
  tables.forEach(([x, z], i) => {
    const th = table.height;
    b.box(2 * table.hw, 0.07, 2 * table.hd, { color: BUILD.plank, jitter: 0.1, at: [x, floor + th - 0.035, z] });
    for (const sx of [-1, 1]) {
      b.box(0.1, th - 0.07, 0.5, { ...timber, at: [x + sx * (table.hw - 0.18), floor + (th - 0.07) / 2, z] });
      b.box(0.08, 0.06, 2 * table.hd - 0.1, { ...timber, at: [x + sx * (table.hw - 0.18), floor + 0.08, z] });
    }
    for (const sz of [-1, 1]) {
      const bz2 = z + sz * (table.hd + 0.24);
      b.box(2 * table.hw - 0.1, 0.06, 0.28, { color: BUILD.plank, jitter: 0.1, at: [x, floor + 0.44, bz2] });
      for (const sx of [-1, 1]) b.box(0.07, 0.41, 0.22, { ...timber, at: [x + sx * (table.hw - 0.25), floor + 0.205, bz2] });
    }
    tankard(b, x - 0.3, floor + th, z + 0.1);
    tankard(b, x + 0.35, floor + th, z - 0.12);
    // A candle on the tables with no lantern over them; the lanterns' tables get a plate.
    if (i === 1 || i === 3) {
      b.cyl(0.035, 0.04, 0.14, 6, { at: [x, floor + th + 0.07, z], color: 0xf0e6c8 })
        .box(0.025, 0.05, 0.025, { at: [x, floor + th + 0.17, z], color: 0xffd080, glow: 1, jitter: 0 });
      glow(x, floor + th + 0.19, z, 0.35);
    } else b.cyl(0.14, 0.12, 0.03, 8, { at: [x + 0.05, floor + th + 0.015, z + 0.05], color: PAL.iron });
  });

  // Lanterns hung from the beams: over the bar and over two tables. These are the pool's flames.
  for (const [x, y, z] of innFlames().slice(1)) {
    b.box(0.02, top - y - 0.15, 0.02, { at: [x, (top + y + 0.15) / 2, z], color: PAL.ironDark, jitter: 0 })
      .box(0.22, 0.3, 0.22, { at: [x, y, z], color: PAL.ironDark })
      .box(0.16, 0.22, 0.16, { at: [x, y, z], color: 0xffd080, glow: 1, jitter: 0 })
      .taper(0.26, 0.26, 0.06, 0.06, 0.12, { at: [x, y + 0.15, z], color: PAL.ironDark });
  }
}

/**
 * A hearth against the side wall at x = `wall` (its sign says which), centred
 * at `z` along it: stone cheeks and a timber mantel round the fire, the
 * chimney breast up to the ceiling above, logs and flames inside.
 */
function fireplaceOn(b: ModelBuilder, glow: Glow, wall: number, z: number, width: number, depth: number, mouth: number, big: boolean): void {
  const { floor, room } = INN;
  const top = floor + room.height;
  const s = Math.sign(wall);
  const x = (d: number) => wall - s * d; // `d` in from the wall
  const cheek = 0.25;
  const stone: PartOpts = { color: PAL.stoneLight, jitter: 0.12 };
  b.box(depth + 0.2, 0.08, width + 0.4, { color: PAL.stoneDark, jitter: 0.1, at: [x((depth + 0.2) / 2), floor + 0.04, z] });
  for (const side of [-1, 1]) b.box(depth, mouth, cheek, { ...stone, at: [x(depth / 2), floor + mouth / 2, z + side * (width / 2 - cheek / 2)] });
  b.box(depth + 0.08, 0.16, width + 0.12, { color: BUILD.timber, jitter: 0.1, at: [x(depth / 2), floor + mouth + 0.08, z] })
    .box(depth - 0.15, top - floor - mouth - 0.16, width - 0.1, { ...stone, at: [x((depth - 0.15) / 2), (floor + mouth + 0.16 + top) / 2, z] })
    .box(0.05, mouth, width - 2 * cheek, { color: 0x1a120c, jitter: 0.05, at: [x(0.03), floor + mouth / 2, z] });
  // Logs, embers and flames.
  const inX = x(depth * 0.45);
  const logs = big ? 3 : 2;
  for (let i = 0; i < logs; i++) {
    b.cyl(0.07, 0.07, width - 2 * cheek - 0.15, 6, { at: [inX + (i - (logs - 1) / 2) * 0.12, floor + 0.14 + (i % 2) * 0.08, z], rot: [Math.PI / 2, 0, 0], color: EARTH.barkDark });
  }
  b.box(depth * 0.6, 0.05, width - 2 * cheek - 0.1, { at: [inX, floor + 0.1, z], color: PAL.coal, glow: 0.9, jitter: 0.2 });
  const flames = big ? [-0.3, 0, 0.3] : [-0.12, 0.12];
  flames.forEach((dz, i) => {
    const h = (big ? 0.55 : 0.35) * (i % 2 ? 0.75 : 1);
    b.cone(0.12, h, 5, { at: [inX, floor + 0.2 + h / 2, z + dz], color: PAL.flame, glow: 1, jitter: 0.1 });
  });
  glow(inX, floor + (big ? 0.5 : 0.35), z, big ? 1.4 : 0.8);
}

function tankard(b: ModelBuilder, x: number, y: number, z: number): void {
  b.cyl(0.05, 0.045, 0.13, 6, { at: [x, y + 0.065, z], color: PAL.iron })
    .box(0.02, 0.08, 0.05, { at: [x + 0.06, y + 0.07, z], color: PAL.iron, jitter: 0 });
}

function bottle(b: ModelBuilder, x: number, y: number, z: number, r: number): void {
  const color = [0x3a6a3a, 0x6a4a2a, 0x2a4a5a][Math.floor(r * 3)];
  b.cyl(0.04, 0.045, 0.16, 6, { at: [x, y + 0.08, z], color })
    .cyl(0.015, 0.02, 0.07, 5, { at: [x, y + 0.195, z], color });
}
