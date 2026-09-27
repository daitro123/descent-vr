import { type BufferGeometry, ExtrudeGeometry, Path, Shape } from 'three';
import { ModelBuilder } from './kit';
import { PAL } from './palette';

// The warrior's sword and shield, as static single-draw meshes. Both are
// authored in the weapon's pivot space (see player/weapons.ts): the blade runs
// along -Z out of the fist, the shield's painted face looks along -Z.
//
// The longsword is authored with its edges and crossguard on ±Y and its flats
// facing ±X. How it sits in the hand is the pivot's job: CONFIG.sword.rollDeg
// turns it about the blade so the edges face palm and back of the hand.

const PI = Math.PI;

/** Longsword: blade along -Z from `bladeStart` to `bladeEnd`. Blade vertices are masked (glow). */
export function buildLongsword(bladeStart: number, bladeEnd: number, halfWidth: number): BufferGeometry {
  const b = new ModelBuilder(5);
  const len = bladeEnd - bladeStart;
  const point = 0.09; // length of the tapered tip
  const w = halfWidth * 2;
  const alongBlade: [number, number, number] = [-PI / 2, 0, 0]; // taper +Y → -Z, its depth → Y
  // Hilt: the fist sits around z = 0. The crossguard spans Y, like the edges.
  b.ball(0.028, { at: [0, 0, 0.15], color: PAL.gold })
    .box(0.032, 0.032, 0.2, { at: [0, 0, 0.035], color: PAL.leatherDark })
    .box(0.036, 0.036, 0.02, { at: [0, 0, 0.1], color: PAL.leather })
    .box(0.036, 0.036, 0.02, { at: [0, 0, -0.03], color: PAL.leather })
    .box(0.028, 0.24, 0.034, { at: [0, 0, -bladeStart + 0.02], color: PAL.gold })
    .box(0.034, 0.04, 0.04, { at: [0, 0.13, -bladeStart + 0.03], rot: [-0.4, 0, 0], color: PAL.gold })
    .box(0.034, 0.04, 0.04, { at: [0, -0.13, -bladeStart + 0.03], rot: [0.4, 0, 0], color: PAL.gold })
    .box(0.04, 0.05, 0.04, { at: [0, 0, -bladeStart + 0.02], color: PAL.ironDark });
  // Blade (thin in X, wide in Y) with a darker fuller, then the point.
  b.taper(0.012, w, 0.01, w * 0.82, len - point, { at: [0, 0, -bladeStart], rot: alongBlade, color: PAL.steel, mask: 1, jitter: 0.03 })
    .box(0.0135, w * 0.22, (len - point) * 0.7, {
      at: [0, 0, -bladeStart - (len - point) * 0.38],
      color: PAL.iron,
      mask: 1,
      jitter: 0,
    })
    .taper(0.01, w * 0.82, 0.004, 0.004, point, { at: [0, 0, -bladeEnd + point], rot: alongBlade, color: PAL.steel, mask: 1 });
  return b.build();
}

function heaterOutline(w: number, h: number, into: Shape | Path): Shape | Path {
  // Straight top, straight upper sides, curving to a point at the bottom.
  const hw = w / 2;
  const top = h / 2;
  const shoulder = h * 0.08;
  into.moveTo(-hw, top);
  into.lineTo(hw, top);
  into.lineTo(hw, shoulder);
  into.quadraticCurveTo(hw * 0.95, -h * 0.32, 0, -h / 2);
  into.quadraticCurveTo(-hw * 0.95, -h * 0.32, -hw, shoulder);
  into.lineTo(-hw, top);
  return into;
}

function extrude(shape: Shape, depth: number, z: number): BufferGeometry {
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, z - depth / 2);
  return g;
}

/** Heater shield sized to the block box (width × height), painted face along -Z. */
export function buildHeaterShield(width: number, height: number, depth: number): BufferGeometry {
  const b = new ModelBuilder(9);
  const board = depth * 0.6;
  const face = -board / 2;
  b.shape(extrude(heaterOutline(width * 0.97, height * 0.97, new Shape()) as Shape, board, 0), { color: PAL.wood });
  // Iron rim: the outline with the inside cut away.
  const rim = heaterOutline(width, height, new Shape()) as Shape;
  rim.holes.push(heaterOutline(width * 0.88, height * 0.9, new Path()) as Path);
  b.shape(extrude(rim, depth, 0), { color: PAL.ironDark });
  // Painted field and a gold cross.
  b.shape(extrude(heaterOutline(width * 0.88, height * 0.9, new Shape()) as Shape, 0.004, face - 0.002), {
    color: PAL.banner,
    jitter: 0.04,
  });
  b.box(0.06, height * 0.72, 0.006, { at: [0, -height * 0.04, face - 0.005], color: PAL.gold })
    .box(width * 0.66, 0.06, 0.006, { at: [0, height * 0.12, face - 0.005], color: PAL.gold })
    .cyl(0.05, 0.065, 0.03, 8, { at: [0, height * 0.12, face - 0.018], rot: [PI / 2, 0, 0], color: PAL.iron });
  // Back: planks and the grip bar the fist closes around.
  const back = board / 2;
  for (const x of [-0.125, 0, 0.125]) {
    b.box(0.006, height * 0.8, 0.004, { at: [x, -0.02, back + 0.002], color: PAL.woodDark, jitter: 0 });
  }
  b.box(width * 0.7, 0.04, 0.012, { at: [0, 0.14, back + 0.006], color: PAL.leather })
    .box(width * 0.7, 0.04, 0.012, { at: [0, -0.1, back + 0.006], color: PAL.leather })
    .box(0.03, 0.14, 0.03, { at: [0, 0, back + 0.04], color: PAL.leatherDark })
    .box(0.03, 0.02, 0.04, { at: [0, 0.07, back + 0.02], color: PAL.iron })
    .box(0.03, 0.02, 0.04, { at: [0, -0.07, back + 0.02], color: PAL.iron });
  return b.build();
}
