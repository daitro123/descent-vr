import type { ModelBuilder, PartOpts } from '../../models/kit';
import { PAL } from '../../models/palette';
import type { Interior, InteriorPlan } from '../../world/interiors';
import { HOUSE, houseFlames, roofAt } from './house';
import { mulberry32 } from './noise';
import { BUILD, CROP } from './palette';
import { buildRoom, fireplaceOn, type Glow, windowIn } from './roomModel';

// The house by the well's one room, built in the house's frame (house.ts) and
// placed with it: one mesh for the room, open to the rafters, its glows, and
// the door's leaf, which hangs in the doorway whether you're in or out.

/** How far under the outer roof's slope the room's roof boards are, so the outside's never shows through from the doorway. */
const UNDER = 0.07;

/** The room, its glows and the door, for the house's `plan`. */
export function buildHouseInterior(plan: InteriorPlan): Interior {
  const { door, floor, leaves } = HOUSE;
  return buildRoom(plan, {
    name: 'house',
    seed: 24,
    build: buildCottageRoom,
    ao: { from: floor, to: floor + 1.2, min: 0.65 },
    // One leaf, hinged at the doorway's left side as you face it and swinging in, so the hearth shows through it.
    leaves: [{ hinge: door.x - door.width / 2, reach: 1, width: door.width }],
    door: { floor, z: leaves.z, thick: leaves.thick, height: door.height },
  });
}

function buildCottageRoom(b: ModelBuilder, glow: Glow): void {
  const { room, floor, eaves, rise, hd, door, leaves, hearth, bed, chest, table, shelf, rug, broom } = HOUSE;
  const W = room.hw;
  const D = room.hd;
  const t = 0.06;
  const plaster: PartOpts = { color: BUILD.plaster, jitter: 0.04 };
  const timber: PartOpts = { color: BUILD.timber, jitter: 0.1 };
  const wood: PartOpts = { color: PAL.wood, jitter: 0.1 };

  // The floor: boards running front to back.
  const boards = 12;
  for (let i = 0; i < boards; i++) {
    const x = -W + ((i + 0.5) * 2 * W) / boards;
    b.box((2 * W) / boards - 0.015, 0.06, 2 * D, { at: [x, floor - 0.03, 0], color: i % 3 ? BUILD.plank : PAL.wood, jitter: 0.1 });
  }

  // Walls: plaster over a timber sill. The front and back walls rise to the
  // roof's slope; the side walls to the eaves, with the gables above them.
  const longTop = roofAt(D + t) - UNDER;
  const wall = (w: number, d: number, x: number, z: number, y0: number, y1: number) => b.box(w, y1 - y0, d, { ...plaster, at: [x, (y0 + y1) / 2, z] });
  wall(2 * W + 2 * t, t, 0, -D - t / 2, floor, longTop);
  for (const s of [-1, 1]) {
    wall(t, 2 * D, s * (W + t / 2), 0, floor, eaves);
    // The gable: its slopes run under the roof's, down to the eaves.
    const base = hd * (1 - UNDER / rise);
    b.taper(t, 2 * base, t, 0.04, rise - UNDER, { ...plaster, at: [s * (W + t / 2), eaves, 0] });
  }
  // The front, round the doorway: thick enough to meet the door's frame, so no gap shows beside the shut door.
  const front = leaves.z - leaves.thick - D;
  const left = door.x - door.width / 2;
  const right = door.x + door.width / 2;
  const lintel = floor + door.height;
  wall(left + W + t, front, (left - W - t) / 2, D + front / 2, floor, longTop);
  wall(W + t - right, front, (right + W + t) / 2, D + front / 2, floor, longTop);
  wall(door.width, front, door.x, D + front / 2, lintel, longTop);
  b.box(door.width + 0.24, 0.12, front + 0.04, { ...timber, at: [door.x, lintel + 0.06, D + front / 2 - 0.02] });
  for (const s of [-1, 1]) b.box(0.1, door.height, front + 0.04, { ...timber, at: [door.x + s * (door.width / 2 + 0.05), floor + door.height / 2, D + front / 2 - 0.02] });
  // Sills along the walls' feet, corner posts, and wall plates under the eaves.
  for (const [w, d, x, z] of [
    [2 * W, 0.08, 0, -D + 0.04],
    [0.08, 2 * D, -W + 0.04, 0],
    [0.08, 2 * D, W - 0.04, 0],
    [left + W, 0.08, (left - W) / 2, D - 0.04],
    [W - right, 0.08, (right + W) / 2, D - 0.04],
  ] as const) b.box(w, 0.12, d, { ...timber, at: [x, floor + 0.06, z] });
  for (const x of [-W + 0.1, W - 0.1]) for (const z of [-D + 0.1, D - 0.1]) b.box(0.2, eaves - floor, 0.2, { ...timber, at: [x, (floor + eaves) / 2, z] });
  for (const z of [-D + 0.1, D - 0.1]) b.box(2 * W, 0.2, 0.2, { ...timber, at: [0, eaves - 0.1, z] });

  // Open to the rafters: boards under the roof's two slopes, rafters under
  // them, a ridge beam, and tie beams across at the eaves. No attic floor and
  // no stair: the loft is out of reach.
  const theta = Math.atan2(rise, hd);
  const reach = D + 0.25;
  const len = reach / Math.cos(theta) + 0.1;
  for (const s of [-1, 1]) {
    const zc = (s * reach) / 2;
    b.box(2 * W + 0.2, 0.04, len, { color: BUILD.plank, jitter: 0.1, at: [0, roofAt(zc) - UNDER - 0.02, zc], rot: [s * theta, 0, 0] });
    for (let x = -W + 0.35; x < W; x += 0.8) {
      const drop = UNDER + 0.04 + 0.07;
      b.bar([x, roofAt(D) - drop, s * D], [x, roofAt(0) - drop, 0], 0.1, 0.12, timber);
    }
  }
  b.box(2 * W, 0.18, 0.18, { ...timber, at: [0, roofAt(0) - UNDER - 0.04 - 0.09, 0] });
  for (const x of [-1.7, 0, 1.7]) b.box(0.18, 0.2, 2 * D, { ...timber, at: [x, eaves - 0.1, 0] });

  // Windows: panes glowing with the afternoon outside, where the outside has them.
  const sill = 1.8;
  windowIn(b, -1.4, sill, D, Math.PI);
  windowIn(b, -0.8, sill, -D, 0);
  windowIn(b, -W, sill, 0, Math.PI / 2);
  windowIn(b, W, sill, 0, -Math.PI / 2);

  // The hearth in the back right corner, under the chimney, with a pot hung over its fire.
  const [fx, , fz] = fireplaceOn(b, glow, {
    wall: W,
    z: hearth.z,
    width: hearth.width,
    depth: hearth.depth,
    mouth: hearth.mouth,
    big: false,
    floor,
    top: roofAt(hearth.z) - UNDER,
  });
  const potY = floor + 0.5;
  b.box(0.03, floor + hearth.mouth - potY - 0.2, 0.03, { at: [fx, (floor + hearth.mouth + potY + 0.2) / 2, fz], color: PAL.ironDark, jitter: 0 })
    .cyl(0.17, 0.13, 0.22, 8, { at: [fx, potY + 0.11, fz], color: PAL.ironDark })
    .cyl(0.175, 0.175, 0.03, 8, { at: [fx, potY + 0.21, fz], color: PAL.iron })
    .bar([fx, potY + 0.22, fz - 0.17], [fx, potY + 0.36, fz], 0.02, 0.02, { color: PAL.ironDark, jitter: 0 })
    .bar([fx, potY + 0.22, fz + 0.17], [fx, potY + 0.36, fz], 0.02, 0.02, { color: PAL.ironDark, jitter: 0 });
  // The bed along the left wall, its head against the back wall.
  const by = floor + 0.32;
  b.box(2 * bed.hw, 0.14, 2 * bed.hd, { ...wood, at: [bed.x, by - 0.07, bed.z] })
    .box(2 * bed.hw - 0.08, 0.14, 2 * bed.hd - 0.1, { color: CROP.wheatDark, jitter: 0.08, at: [bed.x, by + 0.07, bed.z] })
    .box(2 * bed.hw - 0.04, 0.06, 1.35, { color: BUILD.blue, jitter: 0.08, at: [bed.x, by + 0.15, bed.z + bed.hd - 0.7] })
    .box(0.6, 0.12, 0.34, { color: BUILD.canvas, jitter: 0.05, at: [bed.x, by + 0.2, bed.z - bed.hd + 0.25] })
    .box(2 * bed.hw, 0.9, 0.08, { ...wood, at: [bed.x, floor + 0.45, bed.z - bed.hd + 0.04] })
    .box(2 * bed.hw, 0.5, 0.08, { ...wood, at: [bed.x, floor + 0.25, bed.z + bed.hd - 0.04] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.08, by - floor, 0.08, { ...timber, at: [bed.x + sx * (bed.hw - 0.04), (floor + by) / 2, bed.z + sz * (bed.hd - 0.04)] });

  // The chest across the bed's foot.
  b.box(2 * chest.hw, 0.42, 2 * chest.hd, { ...wood, at: [chest.x, floor + 0.21, chest.z] })
    .box(2 * chest.hw + 0.04, 0.08, 2 * chest.hd + 0.04, { color: PAL.woodDark, jitter: 0.1, at: [chest.x, floor + 0.46, chest.z] });
  for (const dx of [-0.28, 0.28]) b.box(0.05, 0.47, 2 * chest.hd + 0.02, { color: PAL.ironDark, jitter: 0, at: [chest.x + dx, floor + 0.24, chest.z] });
  b.box(0.08, 0.1, 0.03, { color: PAL.gold, jitter: 0, at: [chest.x, floor + 0.36, chest.z + chest.hd + 0.01] });

  // The table, a chair at either end, a candle, a bowl and a loaf.
  const th = table.height;
  b.box(2 * table.hw, 0.06, 2 * table.hd, { color: BUILD.plank, jitter: 0.1, at: [table.x, floor + th - 0.03, table.z] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.07, th - 0.06, 0.07, { ...timber, at: [table.x + sx * (table.hw - 0.08), floor + (th - 0.06) / 2, table.z + sz * (table.hd - 0.08)] });
  for (const s of [-1, 1]) {
    const cx = table.x + s * table.chair;
    b.box(0.4, 0.05, 0.4, { ...wood, at: [cx, floor + 0.45, table.z] })
      .box(0.05, 0.5, 0.38, { ...wood, at: [cx + s * 0.18, floor + 0.72, table.z] });
    for (const lx of [-0.16, 0.16]) for (const lz of [-0.16, 0.16]) b.box(0.05, 0.43, 0.05, { ...timber, at: [cx + lx, floor + 0.215, table.z + lz] });
  }
  const [, cy] = houseFlames()[1];
  b.cyl(0.07, 0.08, 0.02, 8, { at: [table.x, floor + th + 0.01, table.z], color: PAL.iron })
    .cyl(0.035, 0.04, 0.14, 6, { at: [table.x, floor + th + 0.09, table.z], color: 0xf0e6c8 })
    .box(0.025, 0.05, 0.025, { at: [table.x, floor + th + 0.18, table.z], color: 0xffd080, glow: 1, jitter: 0 });
  glow(table.x, cy, table.z, 0.35);
  b.cyl(0.13, 0.09, 0.07, 8, { at: [table.x - 0.3, floor + th + 0.035, table.z + 0.1], color: PAL.wood })
    .box(0.22, 0.1, 0.12, { at: [table.x + 0.3, floor + th + 0.05, table.z - 0.12], rot: [0, 0.4, 0], color: 0xb07a3a, jitter: 0.1 });

  // The shelf of crocks against the back wall.
  const sz = -D + shelf.depth / 2;
  for (const x of [shelf.x - shelf.hw + 0.04, shelf.x + shelf.hw - 0.04]) b.box(0.08, shelf.height, shelf.depth, { ...timber, at: [x, floor + shelf.height / 2, sz] });
  const rand = mulberry32(24);
  const crocks = [0x9a6a4a, 0x7a5a3e, 0xb08a5a, 0x6a6a5a];
  [0.08, 0.55, 1.0, shelf.height].forEach((h, row) => {
    b.box(2 * shelf.hw, 0.04, shelf.depth, { ...timber, at: [shelf.x, floor + h, sz] });
    if (row === 3) return;
    for (let x = shelf.x - shelf.hw + 0.2; x < shelf.x + shelf.hw - 0.1; x += 0.24) {
      const r = 0.06 + rand() * 0.04;
      const h2 = 0.14 + rand() * 0.14;
      const color = crocks[Math.floor(rand() * crocks.length)];
      b.cyl(r * 0.7, r, h2, 7, { at: [x, floor + h + 0.02 + h2 / 2, sz], color, jitter: 0.08 }).cyl(r * 0.55, r * 0.6, 0.04, 7, {
        at: [x, floor + h + 0.02 + h2 + 0.02, sz],
        color: PAL.woodDark,
      });
    }
  });

  // The rug before the hearth, and the broom leant in the corner by the door.
  b.box(2 * rug.hw, 0.02, 2 * rug.hd, { color: PAL.cloth, jitter: 0.06, at: [rug.x, floor + 0.01, rug.z] })
    .box(2 * rug.hw - 0.3, 0.022, 2 * rug.hd - 0.3, { color: 0xa8743a, jitter: 0.06, at: [rug.x, floor + 0.012, rug.z] });
  const foot: [number, number, number] = [broom.x - 0.12, floor + 0.3, broom.z - 0.12];
  b.bar(foot, [broom.x + 0.12, floor + 1.45, broom.z + 0.12], 0.035, 0.035, { color: PAL.wood, jitter: 0.05 })
    .taper(0.22, 0.07, 0.07, 0.05, 0.34, { at: [foot[0] - 0.03, floor, foot[2] - 0.03], rot: [0, -Math.PI / 4, 0], color: CROP.wheatDark });
}
