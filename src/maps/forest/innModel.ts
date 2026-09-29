import type { ModelBuilder, PartOpts } from '../../models/kit';
import { PAL } from '../../models/palette';
import type { Interior, InteriorPlan } from '../../world/interiors';
import { INN, innFlames } from './inn';
import { mulberry32 } from './noise';
import { BUILD } from './palette';
import { buildInterior, fireplaceOn, type Glow, windowIn } from './interiorModel';

// The Golden Tankard's taproom, built in the inn's frame (inn.ts) and placed
// with it: one mesh for the room, its glows, and the door's two leaves, which
// hang in the doorway whether you're in or out.

/** The taproom, its glows and the door, for the inn's `plan`. */
export function buildInnInterior(plan: InteriorPlan): Interior {
  const { width, height } = INN.door;
  return buildInterior(plan, {
    name: 'inn',
    seed: 23,
    build: buildTaproom,
    ao: { from: INN.floor, to: INN.floor + 1.2, min: 0.65 },
    // Two leaves hinged at the doorway's sides, swinging in.
    leaves: [
      { hinge: -width / 2, reach: 1, width: width / 2 },
      { hinge: width / 2, reach: -1, width: width / 2 },
    ],
    door: { floor: INN.floor, z: INN.leaves.z, thick: INN.leaves.thick, height },
  });
}

function buildTaproom(b: ModelBuilder, glow: Glow): void {
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
  const windowAt = (x: number, z: number, yaw: number) => windowIn(b, x, 1.9, z, yaw);
  // A window's frame sits proud of the wall into the room: turned to face the room, with `yaw` as a model turns.
  for (const x of [-3.4, 3.4]) windowAt(x, D, Math.PI);
  for (const x of [-2.2, 2.2]) windowAt(x, -D, 0);
  for (const z of [-2.2, 2.2]) {
    windowAt(-W, z, Math.PI / 2);
    windowAt(W, z, -Math.PI / 2);
  }

  // The big hearth on the right wall, under the larger chimney.
  fireplaceOn(b, glow, { wall: W, z: hearth.z, width: hearth.width, depth: hearth.depth, mouth: 1.3, big: true, floor, top });
  // The small fireplace on the left wall, under the other chimney: its fire is a glow.
  fireplaceOn(b, glow, { wall: -W, z: fireplace.z, width: fireplace.width, depth: fireplace.depth, mouth: 0.95, big: false, floor, top });

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

function tankard(b: ModelBuilder, x: number, y: number, z: number): void {
  b.cyl(0.05, 0.045, 0.13, 6, { at: [x, y + 0.065, z], color: PAL.iron })
    .box(0.02, 0.08, 0.05, { at: [x + 0.06, y + 0.07, z], color: PAL.iron, jitter: 0 });
}

function bottle(b: ModelBuilder, x: number, y: number, z: number, r: number): void {
  const color = [0x3a6a3a, 0x6a4a2a, 0x2a4a5a][Math.floor(r * 3)];
  b.cyl(0.04, 0.045, 0.16, 6, { at: [x, y + 0.08, z], color })
    .cyl(0.015, 0.02, 0.07, 5, { at: [x, y + 0.195, z], color });
}
