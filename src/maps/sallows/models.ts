import { type BufferGeometry, ConeGeometry, IcosahedronGeometry, Matrix4 } from 'three';
import { ModelBuilder, type PartOpts, type Vec3 } from '../../models/kit';
import { PAL } from '../../models/palette';
import { standingStone } from '../forest/buildings';
import { mulberry32 } from '../forest/noise';
import { EARTH } from '../forest/palette';
import { crate, barrel, door, gableRoof, pile, punt, type RoofLook, signpost, windowOn } from '../props';
import { type FenDeck, type FenStructure, LANE, SALLOWS } from './plan';
import { FEN_BUILD as B, FEN_PLANTS } from './palette';

// The Sallows' buildings and set pieces, each in its own frame (origin on
// its footing at the footprint's middle, front facing +Z), as Oakvale's and
// Brackenmoor's are: the fen folk's stilt houses in timber, wattle and reed
// thatch on piles over the water, the crown's grey limestone on the
// causeway, and the Deepkings' huge square green-black blocks in the Sluice
// House and the drowned town. Free of the DOM, so chunks build in workers.

const PI = Math.PI;
const F = SALLOWS.floor;

const THATCH: RoofLook = { roof: B.thatch, ridge: B.thatchDark, gable: B.wattle, thick: 0.34 };
const OLD_THATCH: RoofLook = { roof: B.thatchDark, ridge: 0x5e5230, gable: B.wattle, thick: 0.3 };
const SLATE: RoofLook = { roof: 0x4e5654, ridge: 0x3a403e, gable: B.lime, thick: 0.14 };
const SHINGLE: RoofLook = { roof: B.timberDark, ridge: 0x2a221a, gable: B.timber, thick: 0.12 };

/** Which ways each signpost's boards point (radians about +Y from +Z, before the post turns). */
const SIGN_WAYS: readonly (readonly number[])[] = [
  // At Reedholm's landing: Cairnford back west, Aldhaven north, the Sluice House east, Vinhold south-west.
  [-PI / 2, PI, PI / 2, -PI * 0.8],
  // By the kiln: Reedholm back north-east, Vinhold on west.
  [PI * 0.75, -PI / 2],
];

/** The model of one structure, in its own frame. */
export function buildFenStructure(s: FenStructure): BufferGeometry {
  const b = new ModelBuilder(1 + s.seed * 13);
  const rand = mulberry32(s.seed * 7919 + 5);
  switch (s.kind) {
    case 'stiltHouse': stiltHouse(b, s.w, s.d, s.h, s.variant, s.y === SALLOWS.water ? F : 0.9, rand); break;
    case 'stall': stall(b, s.w, s.d, s.h, s.variant, rand); break;
    case 'revetment': revetment(b, s.w, s.gaps ?? [], rand); break;
    case 'banner': banner(b, s.h); break;
    case 'peatStack': peatStack(b, s.w, s.d, rand); break;
    case 'fencePosts': fencePosts(b, s.w, rand); break;
    case 'plankBridge': plankBridge(b, s.w, s.d, rand); break;
    case 'column': column(b, s.h, s.variant, SALLOWS.water - s.y, rand); break;
    case 'deepHead': deepHead(b, s.w, SALLOWS.water - s.y); break;
    case 'brazier': brazier(b); break;
    case 'churchyard': churchyard(b, s.w, rand); break;
    case 'washLine': washLine(b, s.w, rand); break;
    case 'inn': inn(b, s.w, s.d, s.h); break;
    case 'mootHall': mootHall(b, s.w, s.d, s.h); break;
    case 'forge': forge(b, s.w, s.d, s.h); break;
    case 'herbHut': herbHut(b, s.w, s.d, s.h, rand); break;
    case 'smokeShed': smokeShed(b, s.w, s.d, s.h, s.y === SALLOWS.water ? F : 0); break;
    case 'netRack': netRack(b, s.w); break;
    case 'punt': moored(b, s.d, s.variant); break;
    case 'eelTraps': eelTraps(b, rand); break;
    case 'raft': raft(b, s.w, s.d); break;
    case 'mapboard': mapBoard(b); break;
    case 'signpost': signpost(b, SIGN_WAYS[s.variant] ?? [0]); break;
    case 'lanternPost': lanternPost(b); break;
    case 'lastStone': standingStone(b, [0, 0, 0], s.h, 0, [0.04, -0.06], true); break;
    case 'tollHouse': tollHouse(b, s.w, s.d, s.h); break;
    case 'tollGate': tollGate(b, s.w); break;
    case 'customsRuin': customsRuin(b, s.w, s.d, s.h, rand); break;
    case 'watchPost': watchPost(b, s.w, s.d, s.h); break;
    case 'chapel': chapel(b, s.w, s.d, s.h); break;
    case 'grave': grave(b, s.variant); break;
    case 'sunkCottage': sunkCottage(b, s.w, s.d, s.h, rand); break;
    case 'hide': hide(b, s.w, s.d, s.h); break;
    case 'decoys': decoys(b, rand); break;
    case 'gibbet': gibbet(b, s.h); break;
    case 'kiln': kiln(b, s.w, s.d, s.h); break;
    case 'chalkBank': chalkBank(b, s.w, s.d, s.h, rand); break;
    case 'smokehouse': smokehouse(b, s.w, s.d, s.h, rand); break;
    case 'crates': crates(b, rand); break;
    case 'cog': cog(b, s.w, s.d, s.h); break;
    case 'tent': tent(b, s.w, s.d, s.h); break;
    case 'lookout': lookout(b, s.h); break;
    case 'sluice': sluice(b, s.w, s.d, rand); break;
    case 'sluiceTower': sluiceTower(b, s.w, s.h); break;
    case 'sluiceGate': sluiceGate(b, s.w); break;
    case 'deepWall': deepWall(b, s.w, s.d, s.h, false, rand); break;
    case 'floodWall': deepWall(b, s.w, s.d, s.h, true, rand); break;
    case 'deepArch': deepArch(b, s.w, s.h); break;
    case 'deepRoof': deepRoof(b, s.w, s.d, s.h, s.variant, SALLOWS.water - s.y, rand); break;
    case 'drownedTower': drownedTower(b, s.w, s.h, rand); break;
    case 'bellTower': bellTower(b, s.w, s.h); break;
    case 'bridge': bridge(b, s.w, s.d, s.h); break;
  }
  return b.build();
}

// ------------------------------------------------------------------ the fen folk's buildings

/** Piles under a floor `w` by `d` at `floor`, driven deep into the mud, every `every` m round its edge. */
function stilts(b: ModelBuilder, w: number, d: number, floor: number, every = 2.2): void {
  const nx = Math.max(1, Math.round(w / every));
  const nz = Math.max(1, Math.round(d / every));
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      if (i > 0 && i < nx && j > 0 && j < nz) continue;
      pile(b, -w / 2 + (i * w) / nx, -d / 2 + (j * d) / nz, -2.6, floor, 0.13);
    }
  }
}

/** Wattle and daub walls over a timber frame, from `y0` up `h`. */
function wattleWalls(b: ModelBuilder, w: number, d: number, y0: number, h: number, color: number = B.daub): void {
  b.box(w, h, d, { at: [0, y0 + h / 2, 0], color, jitter: 0.1 });
  const t: PartOpts = { color: B.timberDark, jitter: 0.1 };
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) b.box(0.2, h, 0.2, { ...t, at: [x, y0 + h / 2, z] });
  for (const z of [-d / 2 - 0.02, d / 2 + 0.02]) b.box(w, 0.14, 0.06, { ...t, at: [0, y0 + h - 0.07, z] });
}

/** A plank door `w` by `h` in the wall at z = `face`, its sill at `y0`. */
function doorAt(b: ModelBuilder, x: number, y0: number, face: number, w: number, h: number): void {
  b.box(w + 0.2, h + 0.12, 0.1, { at: [x, y0 + h / 2, face + 0.03], color: B.timberDark });
  b.box(w, h, 0.08, { at: [x, y0 + h / 2, face + 0.08], color: B.timber, jitter: 0.06 });
}

/**
 * A fen house on piles, thatched almost to the floor, with a porch out front
 * that reaches its lane's edge flush with it, and a ladder down to the
 * water. By its variant's low bits a woad pennant, a lit window, eel traps
 * or nets hung on it; by its high bit its gable turned to the lane and a
 * lean-to store at its side.
 */
function stiltHouse(b: ModelBuilder, w: number, d: number, h: number, variant: number, floor: number, rand: () => number): void {
  const porch = LANE.porch;
  const look = variant & 3;
  const gable = (variant & 4) !== 0;
  stilts(b, w, d + porch, floor);
  b.box(w + 0.3, 0.16, d + porch, { at: [0, floor - 0.08, porch / 2], color: B.plank, jitter: 0.14 });
  // A plank edge along the porch's front, where it meets the lane.
  b.box(w + 0.3, 0.12, 0.14, { at: [0, floor - 0.1, d / 2 + porch - 0.07], color: B.timberDark });
  const wall = h * 0.7;
  wattleWalls(b, w, d, floor, wall, look === 2 ? B.wattle : B.daub);
  const roof = rand() < 0.3 ? OLD_THATCH : THATCH;
  if (gable) {
    // Its ridge runs back from the lane, its gable end over the porch.
    b.on(0, new Matrix4().makeRotationY(PI / 2));
    gableRoof(b, d, w, floor + wall, h * 0.95, 0.6, roof);
    b.on(0, new Matrix4());
    // A wattle hood over the smoke hole in the ridge.
    b.box(0.6, 0.5, 0.6, { at: [0, floor + wall + h * 0.95 + 0.2, -d / 4], color: B.thatchDark });
  } else {
    gableRoof(b, w, d, floor + wall, h * 0.95, 0.6, roof);
    // A wattle hood over the smoke hole at one end of the ridge.
    b.box(0.6, 0.5, 0.6, { at: [-w / 4, floor + wall + h * 0.95 + 0.25, 0], color: B.thatchDark });
  }
  const doorX = (variant & 1 ? -1 : 1) * w * 0.2;
  // The frame showing through the daub: a sill beam and studs front and back, a brace by the door.
  for (const z of [-d / 2 - 0.03, d / 2 + 0.03]) {
    b.box(w, 0.14, 0.06, { at: [0, floor + 0.07, z], color: B.timberDark, jitter: 0.1 });
    for (let x = -w / 2 + 1.1; x < w / 2 - 0.5; x += 1.1) if (z < 0 || Math.abs(x - doorX) > 0.75) b.box(0.12, wall, 0.06, { at: [x, floor + wall / 2, z], color: B.timberDark, jitter: 0.1 });
  }
  b.box(0.1, wall * 1.1, 0.06, { at: [-doorX * 0.35, floor + wall / 2, d / 2 + 0.04], rot: [0, 0, doorX > 0 ? 0.5 : -0.5], color: B.timberDark, jitter: 0.1 });
  doorAt(b, doorX, floor, d / 2, 0.9, 1.6);
  windowOn(b, [-doorX * 1.2, floor + 1.1, d / 2], [0, 1], 0.45, look === 1 ? B.warmWindow : B.window, B.timberDark);
  // A shuttered window in each side wall, one shutter hanging open.
  for (const sx of gable ? [-1] : [-1, 1]) {
    const z = (rand() - 0.5) * d * 0.3;
    windowOn(b, [sx * (w / 2), floor + 1.15, z], [sx, 0], 0.4, look === 1 && sx > 0 ? B.warmWindow : B.window, B.timberDark);
    b.box(0.05, 0.5, 0.26, { at: [sx * (w / 2 + 0.16), floor + 1.15, z + 0.38], rot: [0, sx * 0.9, 0], color: B.plank, jitter: 0.1 });
  }
  // A bench against the front wall, the other side of the door from the window.
  b.box(1.1, 0.08, 0.32, { at: [doorX + (doorX > 0 ? 1.0 : -1.0), floor + 0.42, d / 2 + 0.25], color: B.plank, jitter: 0.08 });
  for (const e of [-0.45, 0.45]) b.box(0.08, 0.4, 0.26, { at: [doorX + (doorX > 0 ? 1.0 : -1.0) + e, floor + 0.2, d / 2 + 0.25], color: B.timberDark });
  if (look === 1 || (gable && look === 0)) {
    // Eels and fish hung to dry on a pole under the side eaves.
    const sx = gable ? -1 : 1;
    b.box(0.06, 0.06, d * 0.8, { at: [sx * (w / 2 + 0.35), floor + wall - 0.1, 0], color: B.timber });
    for (let z = -d * 0.35; z <= d * 0.35; z += 0.32) b.box(0.05, 0.42 + rand() * 0.2, 0.09, { at: [sx * (w / 2 + 0.35), floor + wall - 0.4, z], color: rand() < 0.5 ? 0x6a6450 : 0x8a8064, jitter: 0.1 });
  }
  if (look === 0) {
    // A woad-blue pennant on a pole at the gable.
    b.box(0.08, 2.2, 0.08, { at: [w / 2 + 0.1, floor + wall + 1.1, 0], color: B.timber });
    b.box(0.04, 0.5, 1.0, { at: [w / 2 + 0.1, floor + wall + 1.9, 0.5], color: B.woad, jitter: 0.05 });
  }
  if (look === 2) for (let i = 0; i < 3; i++) eelTrap(b, -w / 2 + 0.7 + i * 0.9, floor + 0.35, -d / 2 - 0.45, PI / 2, 0.6);
  if (look === 3) b.box(w * 0.8, 1.1, 0.04, { at: [0, floor + 0.9, -d / 2 - 0.08], color: B.net, jitter: 0.2 });
  if (gable) {
    // A lean-to store against its side, on piles of its own.
    const sw = 1.6;
    stilts(b, sw, d * 0.7, floor - 0.1, 2);
    b.box(sw, wall * 0.8, d * 0.7, { at: [w / 2 + sw / 2, floor + wall * 0.4 - 0.1, -d * 0.1], color: B.timberDark, jitter: 0.14 });
    b.box(sw + 0.5, 0.14, d * 0.7 + 0.5, { at: [w / 2 + sw / 2 + 0.1, floor + wall * 0.8, -d * 0.1], rot: [0, 0, -0.35], color: B.thatchDark, jitter: 0.12 });
  }
  // The ladder down from the porch to where a punt ties up.
  const lx = -w / 2 - 0.15;
  for (const z of [d / 2 + 0.4, d / 2 + 1.0]) b.box(0.08, floor + 1.1, 0.08, { at: [lx, (floor - 1.1) / 2 + 0.25, z], color: B.timber });
  for (let y = -0.3; y < floor; y += 0.35) b.box(0.06, 0.05, 0.6, { at: [lx, y, d / 2 + 0.7], color: B.timber });
  // What's left on the porch: a barrel, a basket of eels, a stool.
  const pick = rand();
  if (pick < 0.4) barrel(b, [w / 2 - 0.5, floor, d / 2 + 0.7], 0.7);
  else if (pick < 0.7) b.cyl(0.3, 0.24, 0.4, 7, { at: [w / 2 - 0.6, floor + 0.2, d / 2 + 0.6], color: B.rope, jitter: 0.2 });
  else b.cyl(0.2, 0.2, 0.42, 5, { at: [w / 2 - 0.6, floor + 0.21, d / 2 + 0.6], color: B.timber });
}

/** The Eel and Lantern: a long two-storey house on piles over the pool, its porch onto the square, a stone chimney and a hanging lantern sign. */
function inn(b: ModelBuilder, w: number, d: number, h: number): void {
  stilts(b, w, d + 1.4, F, 2);
  b.box(w + 0.4, 0.18, d + 1.4, { at: [0, F - 0.09, 0.7], color: B.plank, jitter: 0.14 });
  wattleWalls(b, w, d, F, h, B.daub);
  // The upper storey jettied out over the porch, under a deep thatch.
  b.box(w + 0.2, 0.2, d + 0.6, { at: [0, F + h + 0.1, 0.3], color: B.timberDark });
  wattleWalls(b, w + 0.2, d + 0.6, F + h + 0.2, 2.2, B.wattle);
  gableRoof(b, w + 0.2, d + 0.6, F + h + 2.4, 3.2, 0.7, THATCH, [0, 0, 0.3]);
  b.box(0.9, h + 6.2, 0.8, { at: [w / 2 - 1, F + (h + 6.2) / 2, 0], color: PAL.stoneDark, jitter: 0.12 });
  doorAt(b, 0, F, d / 2, 1.3, 2.1);
  for (const x of [-3, 3]) windowOn(b, [x, F + 1.3, d / 2], [0, 1], 0.7, B.warmWindow, B.timberDark);
  for (const x of [-3, 0, 3]) windowOn(b, [x, F + h + 1.3, d / 2 + 0.6], [0, 1], 0.6, B.window, B.timberDark);
  // The sign: an eel round a lantern, on a bracket.
  b.box(0.1, 0.1, 1.3, { at: [-w / 4, F + h - 0.3, d / 2 + 0.65], color: PAL.ironDark });
  b.box(0.06, 0.8, 0.9, { at: [-w / 4, F + h - 0.85, d / 2 + 1.1], color: B.timber });
  b.box(0.08, 0.3, 0.3, { at: [-w / 4, F + h - 0.85, d / 2 + 1.1], color: B.warmWindow, glow: 0.8, jitter: 0 });
  // Benches on the porch.
  for (const x of [-w / 2 + 1.4, w / 2 - 1.4]) b.box(1.8, 0.1, 0.4, { at: [x, F + 0.45, d / 2 + 0.4], color: B.plank });
}

/** The moot hall: a long timber hall on its island, thatched, woad pennants at its gables and the heron weathervane on its ridge. */
function mootHall(b: ModelBuilder, w: number, d: number, h: number): void {
  b.box(w + 0.6, 0.9, d + 0.6, { at: [0, -0.2, 0], color: PAL.stoneDark });
  wattleWalls(b, w, d, 0.25, h, B.daub);
  for (let x = -w / 2 + 1.5; x < w / 2; x += 1.5) for (const z of [-d / 2 - 0.04, d / 2 + 0.04]) b.box(0.16, h, 0.08, { at: [x, 0.25 + h / 2, z], color: B.timberDark });
  gableRoof(b, w, d, h + 0.25, 3.6, 0.7, THATCH);
  door(b, 0, d / 2, 1.8, 2.6, B.timber, B.timberDark);
  for (const x of [-w / 3, w / 3]) windowOn(b, [x, 2, d / 2], [0, 1], 0.7, B.window, B.timberDark);
  // A porch roof over the doors.
  b.box(3.4, 0.12, 1.6, { at: [0, 3.0, d / 2 + 0.8], rot: [0.2, 0, 0], color: B.thatchDark });
  for (const x of [-1.5, 1.5]) b.box(0.16, 2.8, 0.16, { at: [x, 1.55, d / 2 + 1.5], color: B.timber });
  // Woad pennants at the gables.
  for (const x of [-w / 2 - 0.4, w / 2 + 0.4]) {
    b.box(0.1, 3, 0.1, { at: [x, h + 2.7, 0], color: B.timber });
    b.box(0.04, 0.6, 1.3, { at: [x, h + 3.8, 0.65], color: B.woad, jitter: 0.05 });
  }
  // The heron weathervane: a tall rod on the ridge, the bird on top.
  const top = h + 0.25 + 3.6 + 0.3;
  b.box(0.08, 2.6, 0.08, { at: [0, top + 1.3, 0], color: PAL.ironDark });
  for (const [x, z] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]] as const) b.box(0.05, 0.05, 0.5, { at: [x / 2, top + 1.2, z / 2], rot: [0, x ? PI / 2 : 0, 0], color: PAL.ironDark });
  const y = top + 2.6;
  b.taper(0.24, 0.5, 0.14, 0.3, 0.5, { at: [0, y, 0], rot: [PI / 2 - 0.3, 0, 0], color: PAL.iron });
  b.bar([0, y + 0.1, 0.25], [0, y + 0.8, 0.4], 0.08, 0.08, { color: PAL.iron });
  b.box(0.12, 0.12, 0.2, { at: [0, y + 0.85, 0.48], color: PAL.iron });
  b.box(0.04, 0.04, 0.4, { at: [0, y + 0.83, 0.75], color: PAL.gold });
  b.bar([0, y, -0.1], [0, y - 0.25, -0.5], 0.04, 0.04, { color: PAL.iron });
}

/** The bog-iron forge: an open shed on its stone footing, a hearth and chimney, the anvil and a quench tub. */
function forge(b: ModelBuilder, w: number, d: number, h: number): void {
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) b.box(0.24, h, 0.24, { at: [x, h / 2, z], color: B.timberDark });
  gableRoof(b, w + 0.4, d + 0.4, h, 1.6, 0.5, SHINGLE);
  // The hearth at the back, its chimney up through the roof.
  b.box(2.2, 1.0, 1.4, { at: [-w / 2 + 1.2, 0.5, -d / 2 + 0.9], color: PAL.stoneDark });
  b.box(1.6, 0.1, 1.0, { at: [-w / 2 + 1.2, 1.02, -d / 2 + 0.9], color: PAL.coal, glow: 0.9, jitter: 0 });
  b.taper(1.6, 1.2, 0.8, 0.7, h + 2.4 - 1.0, { at: [-w / 2 + 1.2, 1.0, -d / 2 + 0.8], color: PAL.stone });
  // Anvil on its block, a quench tub, bellows.
  b.cyl(0.3, 0.35, 0.6, 7, { at: [0.6, 0.3, 0.4], color: B.timberDark }).box(0.75, 0.2, 0.3, { at: [0.6, 0.7, 0.4], color: PAL.ironDark }).box(0.3, 0.12, 0.2, { at: [1.0, 0.72, 0.4], color: PAL.ironDark });
  b.cyl(0.5, 0.45, 0.6, 9, { at: [w / 2 - 0.8, 0.3, d / 2 - 0.9], color: B.timber });
  b.cyl(0.44, 0.44, 0.02, 9, { at: [w / 2 - 0.8, 0.58, d / 2 - 0.9], color: 0x34463e, jitter: 0 });
  b.taper(0.9, 0.6, 0.2, 0.6, 0.5, { at: [-w / 2 + 2.7, 0.5, -d / 2 + 0.9], rot: [0, 0, PI / 2], color: PAL.leather });
  // Bog-iron blooms and bars by the anvil.
  for (let i = 0; i < 4; i++) b.box(0.5, 0.06, 0.07, { at: [1.6, 0.04 + i * 0.07, -0.2 + (i % 2) * 0.1], color: i % 2 ? PAL.rust : PAL.ironDark });
}

/** Mother Sedge's hut: a small stilt hut with herbs drying under its eaves. */
function herbHut(b: ModelBuilder, w: number, d: number, h: number, rand: () => number): void {
  stiltHouse(b, w, d, h, 1, F, () => 0.8);
  for (let i = 0; i < 6; i++) {
    const x = -w / 2 + 0.5 + (i * (w - 1)) / 5;
    b.box(0.18, 0.4, 0.18, { at: [x, F + h * 0.7 - 0.3, d / 2 + 0.45], color: rand() < 0.5 ? FEN_PLANTS.sedge[0] : 0x8a6a7a, jitter: 0.2 });
  }
  // Pots of herbs along the porch's edge.
  for (let i = 0; i < 3; i++) {
    b.cyl(0.18, 0.14, 0.3, 6, { at: [-w / 2 + 0.8 + i * 0.5, F + 0.15, d / 2 + LANE.porch - 0.4], color: 0x8a5a3a });
    b.ball(0.2, { at: [-w / 2 + 0.8 + i * 0.5, F + 0.42, d / 2 + LANE.porch - 0.4], color: FEN_PLANTS.sedge[i % 3] });
  }
}

/** A smoking shed for eels: low, shuttered, smoke leaking from its ridge. */
function smokeShed(b: ModelBuilder, w: number, d: number, h: number, floor: number): void {
  if (floor > 0) {
    stilts(b, w, d, floor);
    b.box(w + 0.2, 0.14, d + 0.2, { at: [0, floor - 0.07, 0], color: B.plank });
  }
  b.box(w, h * 0.6, d, { at: [0, floor + h * 0.3, 0], color: B.timberDark, jitter: 0.14 });
  gableRoof(b, w, d, floor + h * 0.6, h * 0.5, 0.3, OLD_THATCH);
  for (let x = -w / 2 + 0.4; x < w / 2; x += 0.4) b.box(0.05, 0.6, 0.05, { at: [x, floor + h * 0.95, 0], color: B.timber });
}

/** Two posts and a rail, with nets hung to dry. */
function netRack(b: ModelBuilder, w: number): void {
  for (const x of [-w / 2, w / 2]) b.box(0.14, 2.2, 0.14, { at: [x, 1.0, 0], color: B.timber });
  b.box(w + 0.2, 0.1, 0.1, { at: [0, 2.05, 0], color: B.timber });
  b.box(w * 0.45, 1.5, 0.03, { at: [-w / 4, 1.3, 0.04], color: B.net, jitter: 0.25 });
  b.box(w * 0.4, 1.2, 0.03, { at: [w / 4, 1.45, -0.04], color: 0x6a6450, jitter: 0.25 });
}

/** A market stall: posts, a counter of eels and fish, a striped awning in woad or straw, baskets and a crate behind. */
function stall(b: ModelBuilder, w: number, d: number, h: number, variant: number, rand: () => number): void {
  for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) {
    b.box(0.12, h, 0.12, { at: [x, h / 2, d / 2 - 0.1], color: B.timber });
    b.box(0.12, h + 0.3, 0.12, { at: [x, (h + 0.3) / 2, -d / 2 + 0.1], color: B.timber });
  }
  b.box(w - 0.2, 0.9, 0.5, { at: [0, 0.45, d / 2 - 0.35], color: B.plank, jitter: 0.12 });
  b.box(w, 0.08, 0.7, { at: [0, 0.94, d / 2 - 0.35], color: B.plankGrey });
  // The awning, in stripes.
  const n = 6;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / n) * (i + 0.5);
    b.box(w / n + 0.01, 0.05, d + 0.5, { at: [x, h + 0.15, 0.1], rot: [0.22, 0, 0], color: i % 2 ? (variant ? B.thatch : B.woad) : 0xd8ccaa, jitter: 0.06 });
  }
  // Eels laid out, fish hung from the rail, baskets on the counter.
  for (let i = 0; i < 5; i++) b.box(0.08, 0.05, 0.5, { at: [-w / 2 + 0.5 + i * 0.25, 1.0, d / 2 - 0.35], rot: [0, (rand() - 0.5) * 0.6, 0], color: 0x3a3a2a });
  for (let i = 0; i < 4; i++) b.box(0.12, 0.4, 0.05, { at: [-w / 4 + i * 0.35, h - 0.35, d / 2 - 0.1], color: variant ? 0x8a8a7a : 0x6a6a52 });
  b.box(w, 0.06, 0.06, { at: [0, h - 0.1, d / 2 - 0.1], color: B.timber });
  for (const x of [w / 4, w / 2 - 0.5]) b.cyl(0.25, 0.2, 0.32, 7, { at: [x, 1.14, d / 2 - 0.4], color: B.rope, jitter: 0.2 });
  crate(b, [-w / 2 + 0.6, 0, -d / 2 + 0.5], 0.6, rand());
  barrel(b, [w / 2 - 0.5, 0, -d / 2 + 0.45], 0.7);
}

/**
 * A timber staithe round a holm, `r` m out: piles every metre or so with
 * planks behind them holding the holm's earth up out of the pool, left open
 * where a walkway or road crosses (`gaps`, turns from +Z).
 */
function revetment(b: ModelBuilder, r: number, gaps: readonly number[], rand: () => number): void {
  const n = Math.round((PI * 2 * r) / 1.1);
  const open = (a: number) => gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.08);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    if (open(a)) continue;
    const [x, z] = [Math.sin(a) * r, Math.cos(a) * r];
    pile(b, x, z, -2.2, 0.1 + rand() * 0.15, 0.12);
    // The planks on to the next pile, unless it's left open.
    const a2 = ((i + 1) / n) * PI * 2;
    if (open(a2)) continue;
    const [x2, z2] = [Math.sin(a2) * r, Math.cos(a2) * r];
    const len = Math.hypot(x2 - x, z2 - z);
    const yaw = Math.atan2(x2 - x, z2 - z);
    const mid = (a + a2) / 2;
    for (const y of [-0.55, -0.25, 0.02]) {
      b.box(0.06, 0.26, len + 0.05, { at: [(x + x2) / 2 - Math.sin(mid) * 0.12, y, (z + z2) / 2 - Math.cos(mid) * 0.12], rot: [0, yaw, 0], color: rand() < 0.3 ? B.timberDark : B.timber, jitter: 0.12 });
    }
  }
}

/** A tall pole with Reedholm's woad banner on it, a heron worked on the cloth in straw. */
function banner(b: ModelBuilder, h: number): void {
  b.box(0.16, h + 0.6, 0.16, { at: [0, h / 2, 0], color: B.timber });
  b.box(1.5, 0.08, 0.08, { at: [0, h - 0.4, 0], color: B.timberDark });
  b.box(1.3, 2.2, 0.04, { at: [0, h - 1.55, 0.06], color: B.woad, jitter: 0.05 });
  b.box(1.3, 0.25, 0.05, { at: [0, h - 2.75, 0.06], rot: [0, 0, 0.05], color: B.woadDark });
  // The heron, in straw, on the cloth.
  b.box(0.12, 0.8, 0.02, { at: [0, h - 1.5, 0.1], color: 0xe0d6b0 });
  b.box(0.45, 0.1, 0.02, { at: [0.15, h - 1.05, 0.1], rot: [0, 0, -0.5], color: 0xe0d6b0 });
  b.box(0.06, 0.6, 0.02, { at: [0, h - 2.15, 0.1], color: 0xe0d6b0 });
}

/** Peat cut from the bog and stacked to dry, the turves criss-crossed, a spade left by it. */
function peatStack(b: ModelBuilder, w: number, d: number, rand: () => number): void {
  for (let layer = 0; layer < 4; layer++) {
    const along = layer % 2 === 0;
    const n = along ? 5 : 3;
    const shrink = 1 - layer * 0.12;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      b.box(along ? 0.36 : w * shrink, 0.22, along ? d * shrink : 0.36, {
        at: [along ? t * w * shrink : 0, 0.11 + layer * 0.22, along ? 0 : t * d * shrink],
        rot: [0, (rand() - 0.5) * 0.15, 0],
        color: rand() < 0.5 ? 0x3a3020 : 0x2e2618,
        jitter: 0.15,
      });
    }
  }
  b.box(0.05, 1.3, 0.05, { at: [w / 2 + 0.4, 0.55, 0.3], rot: [0.2, 0, 0.15], color: B.timber });
  b.box(0.22, 0.3, 0.03, { at: [w / 2 + 0.5, -0.05, 0.4], rot: [0.2, 0, 0.15], color: PAL.ironDark });
}

/** An old garden fence drowned in the flood: posts leaning out of the water along `len` m, a rail or two still on them. */
function fencePosts(b: ModelBuilder, len: number, rand: () => number): void {
  const n = Math.round(len / 1.3);
  let last: Vec3 | null = null;
  for (let i = 0; i <= n; i++) {
    if (rand() < 0.15) {
      last = null;
      continue;
    }
    const x = -len / 2 + (i * len) / n;
    const top = 0.35 + rand() * 0.6;
    b.box(0.1, top + 1.2, 0.1, { at: [x, (top - 1.2) / 2, 0], rot: [(rand() - 0.5) * 0.3, 0, (rand() - 0.5) * 0.3], color: rand() < 0.5 ? B.timber : B.timberDark });
    const here: Vec3 = [x, top - 0.15, 0];
    if (last && rand() < 0.6) b.bar(last, here, 0.06, 0.04, { color: B.timberDark });
    last = here;
  }
}

/** The raiders' way from loft to loft: planks laid across, sagging, a rope to hold on one side. */
function plankBridge(b: ModelBuilder, w: number, len: number, rand: () => number): void {
  const n = Math.max(2, Math.round(len / 0.35));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    b.box(w * (0.85 + rand() * 0.2), 0.06, len / n - 0.05, { at: [(rand() - 0.5) * 0.08, -Math.sin(PI * t) * 0.25, -len / 2 + t * len], rot: [0, (rand() - 0.5) * 0.1, 0], color: rand() < 0.3 ? B.plankGrey : B.plank });
  }
  for (const s of [-1, 1]) b.box(0.05, 0.05, len, { at: [s * w * 0.45, -0.12, 0], color: B.timberDark });
  for (const z of [-len / 2 + 0.1, len / 2 - 0.1]) b.box(0.06, 1.0, 0.06, { at: [w / 2, 0.45, z], color: B.timber });
  for (let i = 0; i < 6; i++) {
    const [t0, t1] = [i / 6, (i + 1) / 6];
    b.bar([w / 2, 0.9 - Math.sin(PI * t0) * 0.35, -len / 2 + t0 * len], [w / 2, 0.9 - Math.sin(PI * t1) * 0.35, -len / 2 + t1 * len], 0.03, 0.03, { color: B.rope });
  }
}

/** A Deepking column standing out of the water: eight-sided, banded, its top broken off or (variant 1) still under its capital. `wl` is the water's height in its frame. */
function column(b: ModelBuilder, h: number, variant: number, wl: number, rand: () => number): void {
  if (variant === 2) {
    // Fallen: its drums lying along the street where they rolled, half under the water, its capital beyond them.
    const n = 3 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) b.cyl(0.58, 0.58, 1.3, 8, { at: [(rand() - 0.5) * 0.4, wl + 0.05, -2 + i * 1.42], rot: [PI / 2, 0, (rand() - 0.5) * 0.3], color: rand() < 0.3 ? B.deepLight : B.deep, jitter: 0.1 });
    b.box(1.5, 0.45, 1.5, { at: [0.5, wl + 0.1, -2 + n * 1.42 + 0.3], rot: [0.3, 0.4, 0.2], color: B.deepLight });
    return;
  }
  b.cyl(0.55, 0.62, h + 2, 8, { at: [0, h / 2 - 1, 0], color: B.deep, jitter: 0.1 });
  for (let y = 0.6; y < h - 0.4; y += 1.4) b.cyl(0.6, 0.6, 0.14, 8, { at: [0, y, 0], color: B.deepDark });
  b.cyl(0.66, 0.66, 0.3, 8, { at: [0, wl, 0], color: B.weed, jitter: 0.25 });
  if (variant === 1) {
    b.box(1.5, 0.45, 1.5, { at: [0, h + 0.2, 0], color: B.deepLight });
    b.box(1.2, 0.3, 1.2, { at: [0, h - 0.15, 0], color: B.deep });
  } else b.box(1.0, 0.5, 1.0, { at: [0.1, h - 0.1, 0], rot: [0.3 + rand() * 0.3, rand(), 0.2], color: B.deep });
}

/**
 * A Deepking magistrate's carved face, fallen from some great door and lying
 * tipped back in the water: brow, deep eyes, a broad nose and a set mouth,
 * worn smooth, weed at the water line. `wl` is the water's height in its frame.
 */
function deepHead(b: ModelBuilder, s: number, wl: number): void {
  b.on(0, new Matrix4().makeRotationX(-0.55));
  b.box(s, s * 1.1, s * 0.8, { at: [0, s * 0.35, 0], color: B.deep, jitter: 0.08 });
  const f = s * 0.4 + 0.02;
  b.box(s * 0.9, s * 0.14, 0.3, { at: [0, s * 0.62, f], color: B.deepLight });
  for (const x of [-s * 0.22, s * 0.22]) {
    b.box(s * 0.26, s * 0.14, 0.12, { at: [x, s * 0.48, f], color: 0x141814, jitter: 0 });
    b.box(s * 0.3, s * 0.05, 0.16, { at: [x, s * 0.4, f + 0.02], color: B.deepDark });
  }
  b.taper(s * 0.24, 0.5, s * 0.12, 0.2, s * 0.36, { at: [0, s * 0.12, f + 0.05], color: B.deepLight });
  b.box(s * 0.44, s * 0.06, 0.16, { at: [0, s * 0.02, f], color: 0x141814, jitter: 0 });
  b.box(s * 0.6, s * 0.1, 0.2, { at: [0, -s * 0.08, f], color: B.deep });
  // A beard of channels down its chin: the Deepkings' sign.
  for (let i = -2; i <= 2; i++) b.box(0.08, s * 0.3, 0.1, { at: [i * s * 0.08, -s * 0.18, f - 0.02], color: B.deepDark });
  b.on(0, new Matrix4());
  b.box(s * 1.15, 0.3, s * 1.1, { at: [0, wl, 0.2], color: B.weed, jitter: 0.25 });
}

/** A smugglers' iron fire basket on three legs, its coals glowing. */
function brazier(b: ModelBuilder): void {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2;
    b.bar([Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35], [Math.cos(a) * 0.2, 0.85, Math.sin(a) * 0.2], 0.05, 0.05, { color: PAL.ironDark });
  }
  b.cyl(0.38, 0.24, 0.35, 8, { at: [0, 0.95, 0], color: PAL.ironDark });
  b.cyl(0.32, 0.32, 0.06, 8, { at: [0, 1.1, 0], color: PAL.coal, glow: 0.9, jitter: 0 });
}

/** A churchyard's low limestone wall in a ring `r` m round, its lych gate (roofed, posts either side) on its +Z side. */
function churchyard(b: ModelBuilder, r: number, rand: () => number): void {
  const n = Math.round((PI * 2 * r) / 1.6);
  const seg = (PI * 2 * r) / n + 0.06;
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.16) continue;
    const [x, z] = [Math.sin(a) * r, Math.cos(a) * r];
    const hh = 0.7 + rand() * 0.25;
    // Its length runs round the ring: across the radius.
    b.box(seg, hh + 0.8, 0.5, { at: [x, (hh - 0.8) / 2, z], rot: [0, a, 0], color: rand() < 0.5 ? B.lime : B.limeDark, jitter: 0.12 });
    b.box(seg, 0.12, 0.6, { at: [x, hh + 0.05, z], rot: [0, a, 0], color: B.limeDark });
  }
  for (const x of [-1.3, 1.3]) for (const z of [-0.6, 0.6]) b.box(0.18, 2.3, 0.18, { at: [x, 1.0, r + z], color: B.timberDark });
  gableRoof(b, 3.0, 1.6, 2.15, 0.9, 0.3, OLD_THATCH, [0, 0, r]);
}

/** A line of washing (or nets) strung between two poles. */
function washLine(b: ModelBuilder, w: number, rand: () => number): void {
  for (const x of [-w / 2, w / 2]) b.box(0.1, 3.2, 0.1, { at: [x, 0.8, 0], color: B.timber });
  const sag = (t: number) => 2.2 - Math.sin(PI * t) * 0.3;
  for (let i = 0; i < 5; i++) {
    const [t0, t1] = [i / 5, (i + 1) / 5];
    b.bar([-w / 2 + t0 * w, sag(t0), 0], [-w / 2 + t1 * w, sag(t1), 0], 0.03, 0.03, { color: B.rope });
  }
  const cloths = [0xb0a488, B.woad, 0x8a7a58, 0x6a6450, 0xc8bc98];
  for (let i = 0; i < 5; i++) {
    const t = 0.12 + i * 0.19;
    const ch = 0.5 + rand() * 0.4;
    b.box(0.5 + rand() * 0.3, ch, 0.03, { at: [-w / 2 + t * w, sag(t) - ch / 2, 0], rot: [0, 0, (rand() - 0.5) * 0.1], color: cloths[i], jitter: 0.08 });
  }
}

/**
 * A punt at its mooring, low in the water, its pole laid across it; some
 * woad-blue, Reedholm's own. Variant 3 is Hob's flat boat, broad and long,
 * with benches and a load under sailcloth; variant 4 a rotten one sunk to
 * its gunwales, nose down in the mud.
 */
function moored(b: ModelBuilder, len: number, variant: number): void {
  if (variant === 4) {
    b.on(0, new Matrix4().makeRotationX(0.12).multiply(new Matrix4().makeRotationZ(0.2)));
    punt(b, len, 0x5a4e3a, 0x3a3226);
    b.box(0.5, 0.08, 1.2, { at: [0.1, 0.2, 0.6], rot: [0, 0.3, 0], color: 0x4a5a34 });
    b.on(0, new Matrix4());
    return;
  }
  const flat = variant === 3;
  if (flat) b.on(0, new Matrix4().makeScale(2.1, 1.1, 1));
  punt(b, len, variant === 0 ? B.woad : B.plank, variant === 0 ? B.woadDark : B.timberDark);
  if (flat) {
    b.on(0, new Matrix4());
    for (const z of [-len / 4, len / 4]) b.box(2.1, 0.08, 0.35, { at: [0, 0.42, z], color: B.plank });
    b.box(1.4, 0.6, 1.6, { at: [0, 0.45, 0.2], color: 0xb0a488, jitter: 0.12 });
    crate(b, [-0.6, 0.12, -len / 2 + 0.9], 0.55, 0.3);
    barrel(b, [0.6, 0.12, -len / 2 + 1.0], 0.6);
  }
  b.box(0.06, 0.06, len * 1.1, { at: [flat ? 0.9 : 0.3, 0.42, 0], rot: [0, 0.08, 0], color: B.timber });
  pile(b, flat ? 1.5 : 0.8, len / 2 - 0.3, -2, 1.2, 0.1);
}

/** One wicker eel trap: a long cone on its side. */
function eelTrap(b: ModelBuilder, x: number, y: number, z: number, yaw: number, len: number): void {
  b.cone(0.22, len, 6, { at: [x, y, z], rot: [PI / 2, yaw, 0], color: B.rope, jitter: 0.2 });
}

/** Eel traps stacked by a stake in the shallows. */
function eelTraps(b: ModelBuilder, rand: () => number): void {
  pile(b, 0, 0, -1.5, 1.4, 0.09);
  for (let i = 0; i < 4; i++) eelTrap(b, (rand() - 0.5) * 1.4, 0.1 + (i > 2 ? 0.3 : 0), (rand() - 0.5) * 1.2, rand() * PI, 0.8 + rand() * 0.3);
}

/** The refugees' raft: logs lashed together, a lean-to of sailcloth, their bundles. */
function raft(b: ModelBuilder, w: number, d: number): void {
  for (let x = -w / 2 + 0.2; x < w / 2; x += 0.42) b.cyl(0.2, 0.2, d, 6, { at: [x, 0.05, 0], rot: [PI / 2, 0, 0], color: EARTH.bark, jitter: 0.12 });
  b.bar([-w / 2 + 0.4, 0.2, -d / 2 + 0.6], [0, 1.6, -d / 2 + 0.6], 0.08, 0.08, { color: B.timber });
  b.bar([w / 2 - 0.4, 0.2, -d / 2 + 0.6], [0, 1.6, -d / 2 + 0.6], 0.08, 0.08, { color: B.timber });
  b.box(w * 0.9, 0.04, 2.2, { at: [0, 1.0, -d / 2 + 1.5], rot: [0.55, 0, 0], color: 0xb0a488, jitter: 0.12 });
  crate(b, [w / 2 - 0.7, 0.25, d / 2 - 0.8], 0.6, 0.3);
  // The sod of turf they brought "to prove it", a giant's footprint pressed in it.
  b.box(1.2, 0.25, 1.6, { at: [-w / 4, 0.37, d / 2 - 1.1], color: 0x4e5a30 });
  b.box(0.8, 0.06, 1.2, { at: [-w / 4, 0.48, d / 2 - 1.1], color: 0x3a3424, jitter: 0 });
}

/** A map board: a weathered door nailed between two posts, painted later. */
function mapBoard(b: ModelBuilder): void {
  for (const x of [-0.7, 0.7]) b.box(0.12, 2.0, 0.12, { at: [x, 1.0, 0], color: B.timber });
  b.box(1.3, 1.1, 0.08, { at: [0, 1.4, 0.06], color: B.plankGrey, jitter: 0.12 });
  for (const y of [1.0, 1.8]) b.box(1.3, 0.1, 0.04, { at: [0, y, 0.12], color: B.timberDark });
  b.box(1.5, 0.08, 0.3, { at: [0, 2.0, 0.08], color: B.timberDark });
}

/** A post with a lantern hung from its arm. */
function lanternPost(b: ModelBuilder): void {
  b.box(0.14, 2.6, 0.14, { at: [0, 1.3, 0], color: B.timber });
  b.box(0.08, 0.08, 0.5, { at: [0, 2.5, 0.2], color: PAL.ironDark });
  b.box(0.22, 0.3, 0.22, { at: [0, 2.28, 0.35], color: PAL.ironDark });
  b.box(0.16, 0.2, 0.16, { at: [0, 2.28, 0.35], color: B.warmWindow, glow: 0.9, jitter: 0 });
}

// ------------------------------------------------------------------ the crown's causeway

/** The crown's toll house: grey limestone, a slate roof, the crown's colours over the door. */
function tollHouse(b: ModelBuilder, w: number, d: number, h: number): void {
  b.box(w, h + 1.4, d, { at: [0, (h - 1.4) / 2, 0], color: B.lime, jitter: 0.08 });
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) b.box(0.4, h, 0.4, { at: [x, h / 2, z], color: B.limeDark });
  gableRoof(b, w, d, h, 1.8, 0.35, SLATE);
  door(b, 0, d / 2, 1.0, 2.0, B.timber, B.limeDark);
  for (const x of [-w / 3, w / 3]) windowOn(b, [x, 1.6, d / 2], [0, 1], 0.6, B.window, B.limeDark);
  b.box(0.5, 0.7, 0.05, { at: [0, 2.6, d / 2 + 0.05], color: 0x8a2a24 });
  b.box(0.3, 0.2, 0.06, { at: [0, 2.7, d / 2 + 0.07], color: PAL.gold, jitter: 0 });
  b.box(0.7, h + 1.6, 0.6, { at: [-w / 2 + 0.6, (h + 1.6) / 2 + 0.6, -d / 2 + 0.6], color: B.limeDark });
}

/** The toll bar across the causeway, raised: open from the start. */
function tollGate(b: ModelBuilder, w: number): void {
  b.box(0.4, 1.4, 0.4, { at: [-w / 2, 0.7, 0], color: B.limeDark });
  b.box(0.3, 1.2, 0.3, { at: [w / 2, 0.6, 0], color: B.limeDark });
  b.bar([-w / 2, 1.3, 0], [-w / 2 + w * 0.7, 1.3 + w * 0.7, 0], 0.14, 0.14, { color: 0xc0b8a0 });
  b.box(0.3, 0.3, 0.3, { at: [-w / 2 - 0.3, 1.2, 0], color: PAL.stoneDark });
}

/** The ruined customs post: broken limestone walls, no roof, fallen blocks. */
function customsRuin(b: ModelBuilder, w: number, d: number, h: number, rand: () => number): void {
  const t = 0.5;
  const wall = (x: number, z: number, len: number, along: 'x' | 'z') => {
    for (let s = 0; s < len; s += 1.2) {
      const hh = h * (0.3 + rand() * 0.8);
      const at = -len / 2 + s + 0.6;
      b.box(along === 'x' ? 1.2 : t, hh + 1, along === 'x' ? t : 1.2, { at: [along === 'x' ? x + at : x, (hh - 1) / 2, along === 'x' ? z : z + at], color: rand() < 0.5 ? B.lime : B.limeDark, jitter: 0.12 });
    }
  };
  wall(0, -d / 2, w, 'x');
  wall(-w / 2, 0, d, 'z');
  wall(w / 2, 0, d, 'z');
  wall(-w / 4, d / 2, w / 2, 'x');
  for (let i = 0; i < 5; i++) b.box(0.6, 0.4, 0.5, { at: [(rand() - 0.5) * w * 1.4, 0.1, (rand() - 0.5) * d * 1.4], rot: [rand(), rand() * PI, rand() * 0.4], color: B.lime });
}

/** The Lantern Men's watch post: a platform on tall stilts in the reeds, screened with reed, a ladder up. */
function watchPost(b: ModelBuilder, w: number, d: number, h: number): void {
  const top = F + h;
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) pile(b, x, z, -2.4, top + 1.2, 0.12);
  b.box(w + 0.3, 0.14, d + 0.3, { at: [0, top, 0], color: B.plank });
  for (const [x, z, rx] of [[0, -d / 2, 0], [-w / 2, 0, 1], [w / 2, 0, 1]] as const) {
    b.box(rx ? 0.1 : w, 1.0, rx ? d : 0.1, { at: [x, top + 0.55, z], color: FEN_PLANTS.reed[1], jitter: 0.2 });
  }
  b.box(w + 0.6, 0.1, d + 0.6, { at: [0, top + 1.7, 0], rot: [0.1, 0, 0], color: B.thatchDark });
  for (const x of [-0.25, 0.25]) b.box(0.07, top + 0.6, 0.07, { at: [x, top / 2 - 0.3, d / 2 + 0.6], rot: [-0.18, 0, 0], color: B.timber });
  for (let y = 0; y < top; y += 0.4) b.box(0.55, 0.05, 0.06, { at: [0, y, d / 2 + 0.6 - (y - top / 2) * 0.18], color: B.timber });
  // A shuttered lantern on a hook.
  b.box(0.2, 0.28, 0.2, { at: [0, top + 1.2, 0], color: PAL.ironDark });
}

// ------------------------------------------------------------------ the holms

/** Saint Odo's: a small limestone chapel, thatched, with a bell-cote at its west gable. */
function chapel(b: ModelBuilder, w: number, d: number, h: number): void {
  b.box(w, h + 1.4, d, { at: [0, (h - 1.4) / 2, 0], color: B.lime, jitter: 0.1 });
  for (const x of [-w / 2 + 0.2, 0, w / 2 - 0.2]) for (const z of [-d / 2 - 0.25, d / 2 + 0.25]) b.taper(0.7, 0.6, 0.6, 0.3, h * 0.8, { at: [x, 0, z], color: B.limeDark });
  gableRoof(b, w, d, h, 2.4, 0.4, THATCH);
  // The bell-cote on its west gable.
  b.box(0.8, 2.2, 1.2, { at: [-w / 2 + 0.4, h + 2.6, 0], color: B.lime });
  b.box(0.85, 0.9, 0.7, { at: [-w / 2 + 0.4, h + 2.7, 0], color: 0x2a2620 });
  b.cone(0.3, 0.5, 8, { at: [-w / 2 + 0.4, h + 2.5, 0], rot: [PI, 0, 0], color: 0x8a6a3a });
  door(b, w / 6, d / 2, 1.1, 2.2, B.timber, B.limeDark);
  for (const x of [-w / 4, w / 2.6]) for (const n of [-1, 1]) windowOn(b, [x, 2.2, (n * d) / 2], [0, n], 0.5, B.window, B.limeDark);
}

/** A grave: a wooden cross, a leaning stone, or a mound. */
function grave(b: ModelBuilder, variant: number): void {
  if (variant === 0) {
    b.box(0.1, 1.0, 0.1, { at: [0, 0.4, 0], color: B.timber });
    b.box(0.6, 0.1, 0.1, { at: [0, 0.7, 0], color: B.timber });
  } else if (variant === 1) b.taper(0.5, 0.15, 0.4, 0.12, 0.9, { at: [0, -0.2, 0], rot: [0.12, 0, 0.05], color: B.limeDark });
  b.box(0.7, 0.18, 1.6, { at: [0, 0.02, 0.9], color: 0x4e4632, jitter: 0.1 });
}

/** A Cockle End cottage drowned to its eaves: its walls under water, its sagging thatch above it, one gable fallen in. */
function sunkCottage(b: ModelBuilder, w: number, d: number, h: number, rand: () => number): void {
  const eaves = h * 0.45;
  b.box(w, eaves + 2, d, { at: [0, eaves / 2 - 1, 0], color: B.daub, jitter: 0.14 });
  gableRoof(b, w, d, eaves, h * 0.8, 0.5, OLD_THATCH);
  if (rand() < 0.6) b.box(w * 0.35, 0.5, d * 0.6, { at: [w * 0.2, eaves + h * 0.5, 0], color: 0x2a2620, jitter: 0 });
  b.box(0.9, eaves - 0.05, 0.08, { at: [0, eaves / 2, d / 2 + 0.03], color: B.timberDark });
  // A loft window raiders have boarded.
  b.box(0.7, 0.5, 0.08, { at: [w / 2 - 0.2, eaves + 0.6, 0], rot: [0, PI / 2, 0], color: B.timber });
  b.box(0.08, 1.6, 0.08, { at: [w / 2 + 0.6, 0.5, d / 2], rot: [0.3, 0, 0.2], color: B.timber });
}

/** The wildfowler's hide: a reed-thatched lean-to with a slot to watch from. */
function hide(b: ModelBuilder, w: number, d: number, h: number): void {
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) b.box(0.12, z < 0 ? h : h * 0.6, 0.12, { at: [x, (z < 0 ? h : h * 0.6) / 2, z], color: B.timber });
  b.box(w + 0.4, 0.18, d + 0.6, { at: [0, h * 0.8, 0], rot: [-0.35, 0, 0], color: B.thatch, jitter: 0.15 });
  b.box(w, h * 0.55, 0.12, { at: [0, h * 0.27, d / 2], color: FEN_PLANTS.reed[0], jitter: 0.2 });
  b.box(w, h * 0.9, 0.12, { at: [0, h * 0.45, -d / 2], color: FEN_PLANTS.reed[2], jitter: 0.2 });
}

/** Wooden duck decoys bobbing in the shallows. */
function decoys(b: ModelBuilder, rand: () => number): void {
  for (let i = 0; i < 7; i++) {
    const x = (rand() - 0.5) * 6;
    const z = (rand() - 0.5) * 5;
    const yaw = rand() * PI * 2;
    b.box(0.22, 0.14, 0.42, { at: [x, 0.04, z], rot: [0, yaw, 0], color: 0x5a4a34 });
    b.box(0.12, 0.12, 0.12, { at: [x + Math.sin(yaw) * 0.2, 0.17, z + Math.cos(yaw) * 0.2], color: i % 2 ? 0x2e4a34 : 0x6a5a40 });
  }
}

/** The Gibbet Willow: a dead giant willow, its pollard head of bare limbs, an old cage hung from one with a rusted lantern inside. */
function gibbet(b: ModelBuilder, h: number): void {
  const bark = 0x5a5448;
  const dark = 0x403c34;
  b.cyl(0.8, 1.15, 4.2, 8, { at: [0, 2.0, 0], rot: [0.06, 0, -0.08], color: bark, jitter: 0.14 });
  b.cyl(1.0, 0.8, 0.9, 8, { at: [0.15, 4.4, 0.1], color: dark, jitter: 0.14 });
  const limbs: [number, number, number][] = [[2.2, h, 0.4], [-1.8, h - 0.6, 1.2], [0.6, h + 0.6, -1.9], [-1.0, h - 1.5, -1.6], [2.6, h - 2.5, 1.6]];
  for (const [x, y, z] of limbs) {
    b.bar([0.15, 4.6, 0.1], [x, y, z], 0.32, 0.32, { color: bark, jitter: 0.14 });
    b.bar([x, y, z], [x * 1.35, y + 1.4, z * 1.3], 0.14, 0.14, { color: dark });
  }
  // The long limb the cage hangs from.
  b.bar([0.15, 4.4, 0.1], [4.6, 5.6, 0.5], 0.36, 0.36, { color: bark, jitter: 0.14 });
  b.box(0.05, 1.4, 0.05, { at: [4.0, 4.6, 0.45], color: PAL.ironDark });
  const cy = 3.0;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2;
    b.box(0.05, 1.7, 0.05, { at: [4.0 + Math.cos(a) * 0.45, cy, 0.45 + Math.sin(a) * 0.45], color: PAL.rust });
  }
  for (const y of [cy - 0.85, cy + 0.85]) b.cyl(0.5, 0.5, 0.06, 8, { at: [4.0, y, 0.45], color: PAL.ironDark });
  b.box(0.2, 0.28, 0.2, { at: [4.0, cy - 0.65, 0.45], color: PAL.rust });
}

/** The Lime Kiln: a squat chalk-stone tower with a fire arch, a ramp to its top, lime heaped white beside it. */
function kiln(b: ModelBuilder, w: number, d: number, h: number): void {
  b.taper(w, d, w * 0.72, d * 0.72, h + 1, { at: [0, -1, 0], color: 0xc4bea8, jitter: 0.1 });
  b.box(w * 0.74, 0.3, d * 0.74, { at: [0, h + 0.1, 0], color: 0x8a8476 });
  b.box(1.3, 1.4, 0.4, { at: [0, 0.7, d / 2 - 0.05], color: 0x2a201a });
  b.box(1.0, 0.5, 0.42, { at: [0, 0.35, d / 2 - 0.02], color: PAL.coal, glow: 0.9, jitter: 0 });
  b.bar([-w / 2 - 3.5, -0.2, -0.6], [-w / 2 + 0.6, h, -0.6], 1.6, 0.4, { color: EARTH.dirtDark });
  for (let i = 0; i < 3; i++) b.ball(0.7 + i * 0.2, { at: [w / 2 + 1.2 + i * 0.8, 0.2, 1.4 - i * 1.1], color: 0xe8e4d6, jitter: 0.05 });
  for (let i = 0; i < 3; i++) b.box(0.5, 0.35, 0.7, { at: [w / 2 + 0.4, 0.18, -1.6 + i * 0.75], rot: [0, 0.2 * i, 0], color: 0xb8a888 });
}

/** A white chalk bank where Sunreach's hollows begin. */
function chalkBank(b: ModelBuilder, w: number, d: number, h: number, rand: () => number): void {
  b.taper(w, d, w * 0.6, d * 0.4, h + 1, { at: [0, -1, 0], color: 0xd8d4c0, jitter: 0.12 });
  b.taper(w * 0.7, d * 0.5, w * 0.45, d * 0.3, 0.4, { at: [0, h - 0.1, 0], color: 0x9a9a62, jitter: 0.15 });
  for (let i = 0; i < 3; i++) b.box(0.8, 0.5, 0.6, { at: [(rand() - 0.5) * w, 0.1, d / 2 + 0.4], rot: [rand(), rand() * PI, 0], color: 0xe2ded0 });
}

// ------------------------------------------------------------------ the smugglers'

/** The Eelworks: an eel smokehouse gone to ruin, half its roof fallen, racks and tar barrels, the Lantern Men's now. */
function smokehouse(b: ModelBuilder, w: number, d: number, h: number, rand: () => number): void {
  b.box(w, h + 1, d, { at: [0, (h - 1) / 2, 0], color: B.timberDark, jitter: 0.16 });
  b.box(w * 0.4, h * 0.6, 0.1, { at: [w * 0.2, h * 0.55, d / 2 + 0.02], color: 0x1e1a14, jitter: 0 });
  // Half a roof: one slope in, the other fallen.
  b.box(w / 2 + 0.6, 0.18, d * 0.7, { at: [-w / 4, h + 0.9, -d / 4], rot: [-0.6, 0, 0], color: SHINGLE.roof });
  b.box(w / 2, 0.18, d * 0.5, { at: [w / 4 + 0.3, h * 0.6, -d / 4], rot: [-0.9, 0, 0.4], color: SHINGLE.roof });
  b.taper(w, 0.2, w, 0.04, 1.6, { at: [0, h, 0], color: B.timber });
  // Racks of eels on poles outside.
  for (let i = 0; i < 3; i++) {
    const x = -w / 2 + 1 + i * 1.6;
    b.box(0.08, 0.08, 1.4, { at: [x, 1.6, d / 2 + 1.2], color: B.timber });
    for (let k = 0; k < 4; k++) b.box(0.06, 0.6, 0.06, { at: [x, 1.25, d / 2 + 0.7 + k * 0.32], color: 0x3a3020 });
  }
  for (const x of [-1.6, 0]) b.box(0.08, 1.8, 0.08, { at: [x, 0.8, d / 2 + 1.9], color: B.timber });
  for (let i = 0; i < 3; i++) barrel(b, [w / 2 + 0.6, 0, -d / 2 + 0.8 + i * 0.8], 0.8);
  // A Lantern Man's lantern left on a barrel head.
  b.box(0.2, 0.3, 0.2, { at: [w / 2 + 0.6, 0.95, -d / 2 + 0.8 + Math.floor(rand() * 3) * 0.8], color: PAL.ironDark });
}

/** A heap of crates and a barrel. */
function crates(b: ModelBuilder, rand: () => number): void {
  crate(b, [-0.4, 0, 0], 0.8, rand() * 0.4);
  crate(b, [0.5, 0, 0.2], 0.7, rand() * 0.4);
  crate(b, [0, 0.8, 0.05], 0.6, rand());
  barrel(b, [0.2, 0, -0.9], 0.9);
}

/**
 * A cog beached on the shell bank, heeled over: a deep round hull of
 * clinker planks rising to a high stern castle and a raised bow, its deck,
 * its mast cut down to a stump with a yard lashed along the deck, a ladder
 * down its side to the mud.
 */
function cog(b: ModelBuilder, w: number, d: number, h: number): void {
  const heel = 0.2;
  b.on(0, new Matrix4().makeRotationZ(heel));
  const hull: PartOpts = { color: PAL.woodDark, jitter: 0.12 };
  const half = d / 2;
  // The hull in slices along its length, deepest and broadest amidships, rising at bow and stern.
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const z = -half + t * d;
    const belly = Math.sin(PI * t);
    const width = w * (0.45 + 0.55 * belly);
    const rise = 0.9 * (1 - belly) ** 2;
    b.taper(width * 0.45, d / n + 0.05, width, d / n + 0.05, h * 0.55, { ...hull, at: [0, -0.9 + rise * 0.6, z] });
    // Clinker strakes along its side.
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) b.box(0.06, 0.08, d / n + 0.06, { at: [s * (width * (0.62 + k * 0.13)) / 2, -0.55 + k * 0.6 + rise * 0.6, z], color: 0x2e2216 });
  }
  const deck = h * 0.55 - 0.9;
  b.box(w * 0.85, 0.12, d * 0.86, { at: [0, deck, 0], color: PAL.wood, jitter: 0.12 });
  // Bulwarks along both sides.
  for (const s of [-1, 1]) b.box(0.1, 0.6, d * 0.8, { at: [s * w * 0.46, deck + 0.3, 0], color: PAL.woodDark });
  // The stern castle, square and high, with a rail round its top.
  b.box(w * 0.9, 1.6, 3.2, { at: [0, deck + 0.8, -half + 1.9], color: PAL.wood, jitter: 0.1 });
  b.box(w * 0.95, 0.12, 3.4, { at: [0, deck + 1.66, -half + 1.9], color: PAL.woodDark });
  for (const s of [-1, 1]) b.box(0.08, 0.5, 3.2, { at: [s * w * 0.46, deck + 1.95, -half + 1.9], color: PAL.woodDark });
  b.box(0.8, 1.1, 0.08, { at: [0, deck + 0.6, -half + 3.52], color: 0x1e1a14, jitter: 0 });
  // The rudder.
  b.box(0.16, h * 0.6, 1.0, { at: [0, deck - 0.6, -half - 0.2], rot: [0.15, 0, 0], color: PAL.woodDark });
  // The bow's raised forecastle and its stem post.
  b.box(w * 0.7, 0.8, 2.0, { at: [0, deck + 0.4, half - 1.4], color: PAL.wood });
  b.box(0.2, 2.2, 0.2, { at: [0, deck + 0.6, half - 0.1], rot: [0.35, 0, 0], color: PAL.woodDark });
  // The mast cut down to a stump, its yard lashed along the deck, a furled sail over it.
  b.cyl(0.22, 0.26, 2.6, 6, { at: [0, deck + 1.3, 0.8], color: B.timber });
  b.cyl(0.12, 0.12, d * 0.6, 6, { at: [0.6, deck + 0.25, 0], rot: [PI / 2, 0, 0], color: B.timber });
  b.box(0.7, 0.35, d * 0.5, { at: [0.6, deck + 0.4, 0.2], color: 0xb0a488, jitter: 0.12 });
  b.on(0, new Matrix4());
  // A ladder down its low side to the shell bank.
  for (const z of [-0.4, 0.4]) b.box(0.08, 2.6, 0.08, { at: [-w * 0.62, 0.5, z + 1], rot: [0, 0, -0.35], color: B.timber });
  for (let y = 0; y < 2.2; y += 0.4) b.box(0.08, 0.06, 0.9, { at: [-w * 0.62 - 0.35 + y * 0.36, y - 0.4, 1], color: B.timber });
}

/** A canvas ridge tent. */
function tent(b: ModelBuilder, w: number, d: number, h: number): void {
  const th = Math.atan2(h, w / 2);
  for (const s of [-1, 1]) b.box(0.05, Math.hypot(h, w / 2), d, { at: [(s * w) / 4, h / 2, 0], rot: [0, 0, -s * (PI / 2 - th)], color: 0xa89a7a, jitter: 0.1 });
  b.box(0.08, 0.08, d + 0.4, { at: [0, h, 0], color: B.timber });
  for (const z of [-d / 2 - 0.1, d / 2 + 0.1]) b.box(0.08, h, 0.08, { at: [0, h / 2, z], color: B.timber });
}

/** The smugglers' lookout over the sea: four poles lashed into a tower, braced, a platform at the top behind a reed hurdle, a ladder up and a shuttered lamp. */
function lookout(b: ModelBuilder, h: number): void {
  const [base, top] = [1.4, 0.8];
  const r = (y: number) => base + ((top - base) * (y + 0.4)) / (h + 1.4);
  const t: PartOpts = { color: B.timber, jitter: 0.1 };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.bar([sx * base, -0.4, sz * base], [sx * top, h + 1.0, sz * top], 0.1, 0.1, t);
  // Braces across each side, crossed low and straight higher up.
  for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]] as const) {
    b.bar([ax * r(0.4), 0.4, az * r(0.4)], [bx * r(h * 0.5), h * 0.5, bz * r(h * 0.5)], 0.06, 0.06, { color: B.timberDark });
    b.bar([ax * r(h * 0.62), h * 0.62, az * r(h * 0.62)], [bx * r(h * 0.62), h * 0.62, bz * r(h * 0.62)], 0.06, 0.06, { color: B.timberDark });
  }
  const p = top + 0.35;
  b.box(p * 2, 0.12, p * 2, { at: [0, h, 0], color: B.plank, jitter: 0.12 });
  // The hurdle round three sides, the ladder's side open.
  for (const [nx, nz] of [[0, 1], [0, -1], [-1, 0]] as const) b.box(nz === 0 ? 0.08 : p * 2, 0.85, nz === 0 ? p * 2 : 0.08, { at: [nx * p, h + 0.45, nz * p], color: FEN_PLANTS.reed[1], jitter: 0.2 });
  b.box(p * 2 + 0.5, 0.1, p * 2 + 0.5, { at: [0, h + 2.0, 0], rot: [0, 0, 0.12], color: B.thatchDark, jitter: 0.12 });
  for (const [x, z] of [[-p + 0.1, -p + 0.1], [-p + 0.1, p - 0.1]] as const) b.box(0.08, 1.1, 0.08, { at: [x, h + 1.45, z], color: B.timber });
  b.box(0.3, 0.36, 0.3, { at: [p - 0.2, h + 1.35, p - 0.25], color: B.warmWindow, jitter: 0 });
  // The ladder up the open side.
  const lx = (y: number) => r(y) + 0.3;
  for (const z of [-0.28, 0.28]) b.bar([lx(-0.3), -0.3, z], [lx(h), h + 0.1, z], 0.06, 0.06, t);
  for (let y = 0.3; y < h; y += 0.45) b.box(0.05, 0.05, 0.56, { at: [lx(y), y, 0], color: B.timber });
}

// ------------------------------------------------------------------ the Deepkings'

/** Carved channels cut into a face: the Deepkings' sign on everything they built. */
function channels(b: ModelBuilder, w: number, y0: number, h: number, z: number): void {
  for (let y = y0 + 0.5; y < y0 + h - 0.3; y += 0.9) b.box(w * 0.86, 0.12, 0.06, { at: [0, y, z], color: B.deepDark, jitter: 0.04 });
}

/**
 * The Sluice House's lock, across the Great Channel (its own X; +Z is
 * downstream): three great piers of green-black stone with their noses
 * rising either side of the walkway (a deck, laid over the gate beam), wing
 * walls along both banks, the gate leaves swung open downstream with the
 * water pouring white through them, and the great wheel beside the walkway.
 */
function sluice(b: ModelBuilder, w: number, d: number, rand: () => number): void {
  const half = w / 2;
  const top = 0.85;
  const stone: PartOpts = { color: B.deep, jitter: 0.08 };
  const piers = [-half + 1.4, 0, half - 1.4];
  for (const x of piers) {
    b.box(2.6, top + 3.4, d, { ...stone, at: [x, (top - 3.4) / 2, 0] });
    b.box(2.8, 0.4, d + 0.3, { at: [x, top - 0.2, 0], color: B.deepLight });
    b.box(2.7, 0.3, d + 0.1, { at: [x, 0.02, 0], color: B.weed, jitter: 0.2 });
    // Its noses, up and down stream, rising past the walkway's rails, a carved face on each, a pyramid cap.
    for (const s of [-1, 1]) {
      const z = s * (d / 2 - 0.75);
      b.box(2.4, 2.6, 1.5, { ...stone, at: [x, top + 1.3, z] });
      b.box(2.6, 0.25, 1.7, { at: [x, top + 2.65, z], color: B.deepLight });
      b.taper(2.4, 1.5, 0.3, 0.3, 0.9, { at: [x, top + 2.75, z], color: B.deep });
      b.box(1.0, 1.0, 0.1, { at: [x, top + 1.3, z + s * 0.76], color: B.deepDark });
      b.box(0.7, 0.16, 0.12, { at: [x, top + 1.4, z + s * 0.78], color: B.deepLight, jitter: 0 });
      b.box(0.5, 0.12, 0.12, { at: [x, top + 1.05, z + s * 0.78], color: 0x141814, jitter: 0 });
    }
  }
  // The gate beam under the walkway, spanning pier to pier.
  b.box(w - 2, 0.7, 1.6, { ...stone, at: [0, top - 0.55, 0] });
  // Wing walls along both banks, up and down stream of the piers: the lock's chamber.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const len = 9;
      b.box(1.4, top + 3.2, len, { ...stone, at: [sx * (half - 0.4), (top - 3.2) / 2, sz * (d / 2 + len / 2 - 0.2)] });
      b.box(1.6, 0.3, len, { at: [sx * (half - 0.4), top + 0.05, sz * (d / 2 + len / 2 - 0.2)], color: B.deepLight });
      b.box(1.45, 0.3, len, { at: [sx * (half - 0.4), 0.02, sz * (d / 2 + len / 2 - 0.2)], color: B.weed, jitter: 0.2 });
    }
  }
  // The gate leaves in each bay, open, swung back downstream against the piers.
  for (const cx of [-half / 2 + 0.7, half / 2 - 0.7]) {
    for (const s of [-1, 1]) {
      const x = cx + s * 2.6;
      b.box(0.3, 3.4, 3.4, { at: [x, -0.9, d / 2 + 1.6], rot: [0, s * 0.22, 0], color: 0x3a3a30, jitter: 0.1 });
      b.box(0.34, 0.22, 3.4, { at: [x, 0.62, d / 2 + 1.6], rot: [0, s * 0.22, 0], color: PAL.ironDark });
      b.box(0.34, 0.12, 3.4, { at: [x, 0.1, d / 2 + 1.6], rot: [0, s * 0.22, 0], color: PAL.rust });
    }
    // The water pouring through: a white tongue off the sill, then boils and foam spreading downstream.
    b.box(4.2, 0.06, 3.2, { at: [cx, 0.28, d / 2 + 0.6], rot: [0.16, 0, 0], color: B.foam, jitter: 0.15 });
    for (let i = 0; i < 7; i++) {
      const z = d / 2 + 2.4 + i * 1.5 + rand() * 0.6;
      const spread = 3.4 + i * 0.5;
      b.box(spread * (0.6 + rand() * 0.4), 0.05, 1.0 + rand() * 0.6, { at: [cx + (rand() - 0.5) * 1.6, 0.03 + rand() * 0.03, z], rot: [0, (rand() - 0.5) * 0.4, 0], color: i < 3 ? B.foam : B.falling, jitter: 0.2 });
    }
  }
  // The great wheel that turns the gates, upright beside the walkway's west end, upstream.
  const wx = -half + 3.4;
  b.cyl(1.4, 1.4, 0.16, 12, { at: [wx, top + 1.7, -2.1], rot: [PI / 2, 0, 0], color: PAL.ironDark });
  b.cyl(1.1, 1.1, 0.18, 12, { at: [wx, top + 1.7, -2.1], rot: [PI / 2, 0, 0], color: B.deepDark });
  for (let i = 0; i < 4; i++) b.box(0.12, 2.6, 0.12, { at: [wx, top + 1.7, -2.05], rot: [0, 0, (i * PI) / 4], color: PAL.iron });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2;
    b.box(0.1, 0.1, 0.4, { at: [wx + Math.cos(a) * 1.45, top + 1.7 + Math.sin(a) * 1.45, -2.0], color: PAL.iron });
  }
  b.box(0.5, 1.6, 0.5, { at: [wx, top + 0.7, -2.4], color: B.deep });
  // Chains from the wheel down to the gates.
  b.bar([wx + 0.3, top + 1.6, -2.0], [wx + 4.8, top - 0.2, -0.9], 0.06, 0.06, { color: PAL.ironDark });
}

/**
 * The Sluice House's tower: square, green-black, tapering over a battered
 * plinth, buttressed at its corners, slit windows up it, a door in a stone
 * porch onto the lock's walkway, and round its broken top the Lantern Men's
 * timber hoarding with a lamp lit in it.
 */
function sluiceTower(b: ModelBuilder, w: number, h: number): void {
  const half = (y: number) => (w / 2) * (1 - (0.16 * (y + 1.5)) / (h + 1.5));
  b.taper(w, w, w * 0.84, w * 0.84, h + 1.5, { at: [0, -1.5, 0], color: B.deep, jitter: 0.08 });
  b.taper(w + 1.4, w + 1.4, w + 0.1, w + 0.1, 3, { at: [0, -1.5, 0], color: B.deepLight, jitter: 0.1 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.taper(1.3, 1.3, 0.7, 0.7, h * 0.5, { at: [sx * (w / 2 - 0.1), -1, sz * (w / 2 - 0.1)], color: B.deepLight, jitter: 0.1 });
  for (let y = 4.5; y < h - 3; y += 3) b.taper(w * 0.99, w * 0.99, w * 0.99, w * 0.99, 0.25, { at: [0, y, 0], color: B.deepDark });
  // Slits up every face, staggered, each in a pale dressed surround.
  for (let y = 3.2, k = 0; y < h - 3.2; y += 2.6, k++) {
    for (const [nx, nz] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
      const r = half(y) + 0.02;
      const along = (k % 2 ? 0.9 : -0.9) * (nz === 0 ? 1 : nz);
      const [x, z] = [nx * r + nz * along, nz * r + nx * along];
      const yaw = Math.atan2(nx, nz);
      b.box(0.62, 1.5, 0.08, { at: [x, y, z], rot: [0, yaw, 0], color: B.deepLight, jitter: 0.06 });
      b.box(0.24, 1.1, 0.1, { at: [x + nx * 0.03, y, z + nz * 0.03], rot: [0, yaw, 0], color: 0x141814, jitter: 0 });
    }
  }
  // The door, in a stone porch out of the plinth, two steps up to it.
  const front = w / 2 + 0.1;
  b.box(2.4, 3.4, 1.4, { at: [0, 1.0, front + 0.3], color: B.deepLight, jitter: 0.08 });
  b.box(2.6, 0.3, 1.6, { at: [0, 2.85, front + 0.35], color: B.deep });
  b.box(1.3, 2.3, 0.1, { at: [0, 1.25, front + 1.02], color: 0x141814, jitter: 0 });
  b.box(1.1, 2.1, 0.08, { at: [0.15, 1.15, front + 1.1], rot: [0, -0.5, 0], color: B.timber, jitter: 0.08 });
  for (let i = 0; i < 2; i++) b.box(2.0 - i * 0.3, 0.2, 0.5, { at: [0, -0.1 + i * 0.2, front + 1.2 + (1 - i) * 0.45], color: B.deep, jitter: 0.1 });
  // The hoarding: beams out through the wall, plank sides, a pent roof, round the top.
  const hy = h - 2.6;
  const ht = half(hy) + 0.75;
  for (const [nx, nz] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
    const yaw = Math.atan2(nx, nz);
    for (const a of [-1, 0, 1]) b.box(0.22, 0.22, 1.6, { at: [nx * (ht - 0.6) + nz * a * ht * 0.8, hy - 0.2, nz * (ht - 0.6) + nx * a * ht * 0.8], rot: [0, yaw, 0], color: B.timberDark });
    b.box(ht * 2 + 0.2, 1.7, 0.14, { at: [nx * ht, hy + 0.75, nz * ht], rot: [0, yaw, 0], color: B.timber, jitter: 0.12 });
    b.box(ht * 2 + 0.2, 0.1, 1.4, { at: [nx * (ht - 0.6), hy, nz * (ht - 0.6)], rot: [0, yaw, 0], color: B.plank, jitter: 0.1 });
    // A shutter propped open, the lamp's light behind it.
    b.box(0.7, 0.6, 0.06, { at: [nx * (ht + 0.06), hy + 0.95, nz * (ht + 0.06)], rot: [0, yaw, 0], color: B.warmWindow, jitter: 0 });
  }
  // Its roof: a skirt of old thatch from the hoarding's top in to the tower's wall.
  b.taper(ht * 2 + 0.8, ht * 2 + 0.8, half(h) * 2 + 0.1, half(h) * 2 + 0.1, h - hy - 1.6, { at: [0, hy + 1.6, 0], color: B.thatchDark, jitter: 0.1 });
  b.taper(w * 0.88, w * 0.88, w * 0.88, w * 0.88, 0.5, { at: [0, h, 0], color: B.deepLight });
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) b.box(0.9, 0.9 - (i === 2 ? 0.5 : 0), 0.5, { at: [-w * 0.3 + i * w * 0.2, h + 0.9, s * w * 0.4], color: B.deep });
  // The Lantern Men's flag on a pole off the parapet.
  b.box(0.12, 3.2, 0.12, { at: [w * 0.3, h + 2.1, -w * 0.3], color: B.timberDark });
  b.box(0.06, 0.9, 1.5, { at: [w * 0.3, h + 3.1, -w * 0.3 + 0.78], color: 0x2c2a26, jitter: 0.1 });
}

/** The gate across the walkway's east end, chained shut: the shortcut a later quest opens. */
function sluiceGate(b: ModelBuilder, w: number): void {
  for (const x of [-w / 2, w / 2]) b.box(0.3, 2.4, 0.3, { at: [x, 1.2, 0], color: B.deep });
  for (let x = -w / 2 + 0.3; x < w / 2 - 0.1; x += 0.3) b.box(0.05, 2.0, 0.05, { at: [x, 1.05, 0], color: PAL.ironDark });
  for (const y of [0.3, 1.0, 1.9]) b.box(w, 0.08, 0.08, { at: [0, y, 0], color: PAL.ironDark });
  b.box(0.8, 0.06, 0.1, { at: [0, 1.0, 0.1], rot: [0, 0, 0.6], color: PAL.iron });
  b.box(0.8, 0.06, 0.1, { at: [0, 1.0, 0.1], rot: [0, 0, -0.6], color: PAL.iron });
  b.box(0.2, 0.24, 0.14, { at: [0, 0.85, 0.16], color: PAL.rust });
}

/** A length of the drowned town's wall, its footing in the mud, weed at the water line; a flood wall has the fen folk's chalk marks. */
function deepWall(b: ModelBuilder, w: number, d: number, h: number, marks: boolean, rand: () => number): void {
  b.box(w, h + 2, d, { at: [0, h / 2 - 1, 0], color: B.deep, jitter: 0.1 });
  // Broken top: a few blocks missing, a few left proud.
  for (let x = -w / 2 + 0.6; x < w / 2; x += 1.2) if (rand() < 0.5) b.box(1.1, 0.5, d + 0.1, { at: [x, h + 0.25, 0], color: rand() < 0.5 ? B.deep : B.deepLight });
  channels(b, w, 0.4, h - 0.5, d / 2 + 0.02);
  b.box(w + 0.06, 0.28, d + 0.06, { at: [0, 0.08, 0], color: B.weed, jitter: 0.25 });
  if (marks) {
    // Flood marks: old ones cut low down, fresh chalk scrawls higher.
    for (let i = 0; i < 6; i++) {
      const y = 0.4 + i * 0.42;
      b.box(0.6 + rand() * 0.6, 0.05, 0.04, { at: [-w / 4 + rand() * 0.4, y, d / 2 + 0.05], color: i < 3 ? B.deepDark : 0xe8e4d0, jitter: 0 });
      b.box(0.04, 0.12, 0.04, { at: [-w / 4 + 0.7, y + 0.08, d / 2 + 0.05], color: i < 3 ? B.deepDark : 0xe8e4d0, jitter: 0 });
    }
  }
}

/** An arch standing out of the water: two piers and a lintel. */
function deepArch(b: ModelBuilder, w: number, h: number): void {
  const pw = Math.max(1, w * 0.18);
  for (const s of [-1, 1]) {
    b.box(pw, h + 2.6, pw, { at: [s * (w / 2 - pw / 2), (h + 2.6) / 2 - 2, 0], color: B.deep, jitter: 0.1 });
    b.box(pw + 0.06, 0.28, pw + 0.06, { at: [s * (w / 2 - pw / 2), 0.08, 0], color: B.weed, jitter: 0.25 });
  }
  b.box(w, 1.0, pw, { at: [0, h + 1.1, 0], color: B.deepLight, jitter: 0.08 });
  b.box(w * 0.5, 0.5, pw + 0.04, { at: [0, h + 0.4, 0], color: B.deep });
  b.box(1.0, 0.8, 0.1, { at: [0, h + 1.1, pw / 2 + 0.03], color: B.deepDark });
}

/**
 * A drowned house, its walls under the water to the eaves, its roof above
 * it: stepped (variant 0), flat behind a broken parapet (1), or a steep
 * stone gable (2). `wl` is the water's height in its frame.
 */
function deepRoof(b: ModelBuilder, w: number, d: number, h: number, variant: number, wl: number, rand: () => number): void {
  const eaves = Math.max(wl + 0.4, h * 0.35);
  b.box(w, eaves + 2, d, { at: [0, eaves / 2 - 1, 0], color: B.deep, jitter: 0.1 });
  b.box(w + 0.06, 0.28, d + 0.06, { at: [0, wl, 0], color: B.weed, jitter: 0.25 });
  channels(b, w, wl + 0.2, eaves - wl - 0.2, d / 2 + 0.02);
  if (variant === 1) {
    b.box(w + 0.3, 0.3, d + 0.3, { at: [0, eaves + 0.15, 0], color: B.deepLight, jitter: 0.08 });
    for (let x = -w / 2 + 0.5; x < w / 2; x += 1) for (const z of [-d / 2, d / 2]) if (rand() < 0.7) b.box(0.9, 0.5 + rand() * 0.3, 0.4, { at: [x, eaves + 0.5, z], color: B.deep });
    for (let z = -d / 2 + 0.5; z < d / 2; z += 1) for (const x of [-w / 2, w / 2]) if (rand() < 0.7) b.box(0.4, 0.5 + rand() * 0.3, 0.9, { at: [x, eaves + 0.5, z], color: B.deep });
    // A stair head on its roof, its doorway black.
    b.box(1.6, 1.6, 1.6, { at: [w / 4, eaves + 1.1, -d / 4], color: B.deep });
    b.box(0.7, 1.1, 0.1, { at: [w / 4, eaves + 0.85, -d / 4 + 0.82], color: 0x141814 });
  } else if (variant === 2) {
    b.taper(w + 0.4, d + 0.4, w + 0.4, 0.3, h * 0.55 + 0.6, { at: [0, eaves, 0], color: B.deepLight, jitter: 0.08 });
    b.box(w + 0.6, 0.3, 0.5, { at: [0, eaves + h * 0.55 + 0.7, 0], color: B.deep });
    // A gap where the roof's stones have fallen in.
    b.box(w * 0.3, 0.4, d * 0.3, { at: [-w / 5, eaves + h * 0.25, d / 6], rot: [0.5, 0, 0], color: 0x141814, jitter: 0 });
  } else {
    let [sw, sd] = [w + 0.4, d + 0.4];
    for (let y = eaves; sw > 0.8 && sd > 0.8; y += 0.5) {
      b.box(sw, 0.5, sd, { at: [0, y + 0.25, 0], color: B.deepLight, jitter: 0.08 });
      sw -= 0.9;
      sd -= 0.9;
    }
  }
  b.box(0.8, Math.max(0.3, eaves - wl - 0.2), 0.1, { at: [0, (eaves + wl) / 2 + 0.1, d / 2 + 0.03], color: 0x141814 });
}

/** The Drowned Tower: a Deepking tower leaning out of the water, the tallest thing in the zone, its top broken. */
function drownedTower(b: ModelBuilder, w: number, h: number, rand: () => number): void {
  const lean = 0.2;
  const up = (y: number): Vec3 => [0, y * Math.cos(lean), y * Math.sin(lean)];
  const seg = 3;
  for (let y = -1.5; y < h; y += seg) {
    const t = (y + 1.5) / (h + 1.5);
    const s = w * (1 - t * 0.25);
    const top = y + seg >= h;
    b.taper(s, s, s * 0.97, s * 0.97, seg - (top ? 1.2 : 0), { at: up(y), rot: [lean, 0, 0], color: rand() < 0.3 ? B.deepLight : B.deep, jitter: 0.08 });
    b.taper(s * 1.03, s * 1.03, s * 1.03, s * 1.03, 0.25, { at: up(y + seg - 0.25), rot: [lean, 0, 0], color: B.deepDark });
    if (y > 2 && !top) for (const [nx, nz] of [[0, 1], [1, 0], [-1, 0]] as const) {
      const [cx, cy, cz] = up(y + seg / 2);
      b.box(0.4, 1.0, 0.12, { at: [cx + nx * s * 0.5, cy, cz + nz * s * 0.5 * Math.cos(lean)], rot: [lean, Math.atan2(nx, nz), 0], color: 0x141814 });
    }
  }
  // Its broken crown: a few blocks left standing on the north-east corner.
  const [cx, cy, cz] = up(h - 0.8);
  for (let i = 0; i < 4; i++) b.box(1.1, 1.4 - i * 0.25, 1.1, { at: [cx + w * 0.3 - (i % 2) * 1.2, cy + 0.6, cz + w * 0.25 - Math.floor(i / 2) * 1.2], rot: [lean, 0, 0], color: B.deep });
  b.box(w + 0.1, 0.4, w + 0.1, { at: [0, 0.08, 0.03], color: B.weed, jitter: 0.25 });
}

/** The drowned town's bell tower: four piers and a cap, its bell still hanging, the lower half under water. */
function bellTower(b: ModelBuilder, w: number, h: number): void {
  for (const x of [-w / 2 + 0.6, w / 2 - 0.6]) for (const z of [-w / 2 + 0.6, w / 2 - 0.6]) b.box(1.2, h + 1, 1.2, { at: [x, (h - 1) / 2, z], color: B.deep, jitter: 0.1 });
  b.box(w + 0.3, 1.0, w + 0.3, { at: [0, h + 0.5, 0], color: B.deepLight });
  b.taper(w + 0.3, w + 0.3, 0.6, 0.6, 2.2, { at: [0, h + 1, 0], color: B.deep });
  b.box(w * 0.8, 0.2, 0.2, { at: [0, h - 0.4, 0], color: B.timberDark });
  b.cone(1.0, 1.5, 10, { at: [0, h - 1.4, 0], color: 0x5a6a52, jitter: 0.08 });
  b.ball(0.18, { at: [0, h - 2.3, 0], color: PAL.ironDark });
  b.box(w + 0.1, 0.4, w + 0.1, { at: [0, 0.08, 0], color: B.weed, jitter: 0.25 });
}

/** The old bridge over the Great Channel: two massive abutments and the arch's stones under the deck (laid over it). */
function bridge(b: ModelBuilder, w: number, len: number, rise: number): void {
  const half = len / 2;
  for (const s of [-1, 1]) b.box(w + 1.2, 4, 3.4, { at: [0, -1.4, s * (half - 1.7)], color: B.deep, jitter: 0.1 });
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const z = -half + 3 + t * (len - 6);
    const y = 0.7 + rise * Math.sin(PI * (0.15 + 0.7 * t)) - 0.7;
    b.box(w + 0.3, 0.9, (len - 6) / n + 0.08, { at: [0, y, z], color: i % 2 ? B.deep : B.deepLight, jitter: 0.08 });
  }
  b.box(w + 1.3, 0.3, 3.5, { at: [0, 0.08, -half + 1.7], color: B.weed, jitter: 0.25 });
  b.box(w + 1.3, 0.3, 3.5, { at: [0, 0.08, half - 1.7], color: B.weed, jitter: 0.25 });
}

// ------------------------------------------------------------------ decks

/**
 * A deck's model in its own frame (centre line along +Z, absolute heights,
 * so it's placed by its turn and its floor position only): planks across it
 * on piles, or the Deepkings' stone slabs, with rails if it has them.
 */
export function buildDeck(d: FenDeck): BufferGeometry {
  const b = new ModelBuilder(Math.floor(Math.abs(d.x * 31 + d.z * 17)) + 1);
  const yAt = (lz: number) => {
    const t = (lz + d.hd) / (2 * d.hd);
    return d.y0 + (d.y1 - d.y0) * t + d.rise * Math.sin(PI * t);
  };
  const len = 2 * d.hd;
  const stone = d.look === 'stone';
  const step = stone ? 1.0 : 0.5;
  const n = Math.max(1, Math.round(len / step));
  for (let i = 0; i < n; i++) {
    const lz = -d.hd + (i + 0.5) * (len / n);
    const y = yAt(lz);
    const slope = Math.atan2(yAt(lz + 0.1) - yAt(lz - 0.1), 0.2);
    b.box(2 * d.hw + (stone ? 0 : 0.1), stone ? 0.3 : 0.08, len / n - (stone ? 0.02 : 0.05), {
      at: [0, y - (stone ? 0.15 : 0.04), lz],
      rot: [-slope, 0, 0],
      color: stone ? (i % 3 ? B.deepLight : B.deep) : i % 5 === 0 ? B.plankGrey : B.plank,
      jitter: 0.12,
    });
  }
  if (stone && !d.railed) {
    // A footing of dressed blocks down into the mud, weed at the water line: the forge's, the drowned town's quay.
    const low = Math.min(d.y0, d.y1);
    b.box(2 * d.hw + 0.3, low + 1.8, len + 0.3, { at: [0, (low - 0.3) / 2 - 0.75, 0], color: B.deep, jitter: 0.1 });
    b.box(2 * d.hw + 0.36, 0.26, len + 0.36, { at: [0, SALLOWS.water + 0.04, 0], color: B.weed, jitter: 0.25 });
    for (let z = -d.hd + 0.8; z < d.hd; z += 1.6) for (const s of [-1, 1]) b.box(0.08, 0.4, 0.5, { at: [s * (d.hw + 0.17), low - 0.45, z], color: B.deepDark });
  }
  if (!stone) {
    // Bearers under the planks, on piles every couple of metres.
    for (const s of [-1, 1]) b.box(0.14, 0.14, len, { at: [s * (d.hw - 0.2), (d.y0 + d.y1) / 2 - 0.15, 0], rot: [-Math.atan2(d.y1 - d.y0, len), 0, 0], color: B.timberDark });
    const piles = Math.max(1, Math.round(len / 2.2));
    for (let i = 0; i <= piles; i++) {
      const lz = -d.hd + (i * len) / piles;
      for (const s of [-1, 1]) pile(b, s * (d.hw - 0.2), lz, -2.4, yAt(lz) - 0.1, 0.11);
    }
  }
  if (d.railed) {
    for (const s of [-1, 1]) {
      const x = s * (d.hw + 0.05);
      if (stone) {
        for (let i = 0; i < n; i++) {
          const lz = -d.hd + (i + 0.5) * (len / n);
          b.box(0.35, 0.9, len / n - 0.02, { at: [x, yAt(lz) + 0.45, lz], rot: [-Math.atan2(yAt(lz + 0.1) - yAt(lz - 0.1), 0.2), 0, 0], color: i % 2 ? B.deep : B.deepDark, jitter: 0.1 });
        }
      } else {
        for (let lz = -d.hd; lz <= d.hd + 0.01; lz += 2) b.box(0.1, 1.0, 0.1, { at: [x, yAt(lz) + 0.5, lz], color: B.timber });
        b.box(0.08, 0.08, len, { at: [x, (d.y0 + d.y1) / 2 + 1.0, 0], color: B.timber });
      }
    }
  }
  return b.build();
}

/** One log of the Fen road's corduroy, laid across it along its own X, `len` long. */
export function roadLog(len: number, seed: number): BufferGeometry {
  const b = new ModelBuilder(seed);
  b.cyl(0.13, 0.15, len, 6, { at: [0, 0, 0], rot: [0, 0, PI / 2], color: seed % 3 ? EARTH.bark : EARTH.barkDark, jitter: 0.14 });
  return b.build();
}

// ------------------------------------------------------------------ plants of their own

/** A reed clump: tall straw blades, a few dark seed heads; `lite` for stand-ins, fewer and broader. */
export function reedClump(variant: number, lite: boolean): BufferGeometry {
  const b = new ModelBuilder(300 + variant);
  const rand = mulberry32(700 + variant * 31);
  const blades = lite ? 4 : 8;
  const colour = FEN_PLANTS.reed[variant % FEN_PLANTS.reed.length];
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * PI * 2 + rand();
    const r = 0.2 + rand() * 0.45;
    const h = 2.2 + rand() * 0.8;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const g = new ConeGeometry(lite ? 0.14 : 0.06, h, 3, 1, true);
    b.shape(g, { at: [x, h / 2 - 0.05, z], rot: [Math.sin(a) * 0.12, a, -Math.cos(a) * 0.12], color: rand() < 0.3 ? FEN_PLANTS.sedge[1] : colour, jitter: 0.14 });
    if (!lite && i % 3 === 0) b.cone(0.07, 0.35, 3, { at: [x + Math.cos(a) * 0.12 * h * 0.12, h - 0.15, z + Math.sin(a) * 0.12 * h * 0.12], rot: [PI, 0, 0], color: FEN_PLANTS.reedHead, jitter: 0.1 });
  }
  return b.build();
}

/** A pollarded willow: a short fat trunk crowned with a ball of straight young shoots. */
export function pollard(variant: number): BufferGeometry {
  const b = new ModelBuilder(400 + variant);
  const rand = mulberry32(900 + variant);
  b.cyl(0.36, 0.48, 2.2, 7, { at: [0, 1.05, 0], color: EARTH.bark, jitter: 0.14 });
  b.ball(0.55, { at: [0, 2.2, 0], color: EARTH.barkDark }, 0);
  for (let i = 0; i < 9; i++) {
    const a = rand() * PI * 2;
    const tilt = 0.15 + rand() * 0.45;
    const h = 1.4 + rand() * 1.2;
    b.bar([0, 2.3, 0], [Math.cos(a) * Math.sin(tilt) * h, 2.3 + Math.cos(tilt) * h, Math.sin(a) * Math.sin(tilt) * h], 0.05, 0.05, { color: 0x6a5a3a });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + rand();
    b.ball(0.7 + rand() * 0.3, { at: [Math.cos(a) * 0.7, 3.3 + rand() * 0.6, Math.sin(a) * 0.7], color: FEN_PLANTS.willow[i % 3], jitter: 0.1 });
  }
  return b.build();
}

/**
 * A clump of the fen's flowers, by `variant`: purple loosestrife's spikes
 * (0), yellow flag iris among its sword leaves (1), meadowsweet's cream
 * froth (2), marsh marigold low by the water (3). A few triangles each, so a
 * bank can be thick with them.
 */
export function fenFlower(variant: number): BufferGeometry {
  const b = new ModelBuilder(500 + variant);
  const rand = mulberry32(1300 + variant * 17);
  const kind = variant % 4;
  const leaf = FEN_PLANTS.sedge[variant % FEN_PLANTS.sedge.length];
  const blade = (x: number, z: number, h: number, r: number, color: number) => {
    const a = rand() * PI * 2;
    b.shape(new ConeGeometry(r, h, 3, 1, true), { at: [x, h / 2 - 0.03, z], rot: [Math.sin(a) * 0.2, a, Math.cos(a) * 0.2], color, jitter: 0.12 });
  };
  const n = kind === 3 ? 5 : 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2 + rand();
    const r = 0.08 + rand() * 0.3;
    const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
    if (kind === 0) {
      const h = 0.8 + rand() * 0.5;
      blade(x, z, h, 0.03, leaf);
      b.cone(0.07, 0.45, 4, { at: [x, h - 0.05, z], color: rand() < 0.5 ? 0x9a3f86 : 0xb4559e, jitter: 0.12 });
    } else if (kind === 1) {
      blade(x, z, 0.7 + rand() * 0.4, 0.05, leaf);
      if (i % 2 === 0) b.cone(0.09, 0.14, 4, { at: [x * 0.8, 0.75 + rand() * 0.2, z * 0.8], rot: [PI, rand() * PI, 0], color: 0xe2c43a, jitter: 0.08 });
    } else if (kind === 2) {
      const h = 0.7 + rand() * 0.4;
      blade(x, z, h, 0.03, leaf);
      b.cone(0.16, 0.14, 4, { at: [x, h + 0.04, z], rot: [PI, rand() * PI, 0], color: rand() < 0.5 ? 0xe8e2c8 : 0xdcd4b0, jitter: 0.1 });
    } else {
      blade(x * 1.2, z * 1.2, 0.3, 0.08, leaf);
      b.cone(0.08, 0.05, 5, { at: [x, 0.2 + rand() * 0.08, z], color: 0xe8c030, jitter: 0.06 });
    }
  }
  return b.build();
}

/** A tussock of sedge and rough grass, its blades arching out, green or bleached straw by `variant`. */
export function tussock(variant: number): BufferGeometry {
  const b = new ModelBuilder(520 + variant);
  const rand = mulberry32(1400 + variant * 23);
  const greens = [FEN_PLANTS.sedge[0], FEN_PLANTS.sedge[1], FEN_PLANTS.sedge[2], 0x8a8650];
  const base = greens[variant % greens.length];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * PI * 2 + rand() * 0.6;
    const lean = 0.25 + rand() * 0.45;
    const h = 0.45 + rand() * 0.35;
    const r = 0.05 + rand() * 0.12;
    b.shape(new ConeGeometry(0.045, h, 3, 1, true), {
      at: [Math.cos(a) * (r + Math.sin(lean) * h * 0.5), Math.cos(lean) * h * 0.5 - 0.02, Math.sin(a) * (r + Math.sin(lean) * h * 0.5)],
      rot: [Math.sin(a) * lean, 0, -Math.cos(a) * lean],
      color: rand() < 0.25 ? FEN_PLANTS.reed[(variant + i) % FEN_PLANTS.reed.length] : base,
      jitter: 0.14,
    });
  }
  return b.build();
}

/**
 * A fen willow: a short, leaning trunk forking low, its limbs arching up and
 * out, each crowned with grey-green leaves that hang from it in long
 * curtains nearly to the ground; a stand-in keeps the limbs and crowns.
 */
export function willow(variant: number, lite: boolean): BufferGeometry {
  const b = new ModelBuilder(540 + variant);
  const rand = mulberry32(1500 + variant * 29);
  const leaf = FEN_PLANTS.willow[variant % FEN_PLANTS.willow.length];
  const dark = FEN_PLANTS.willow[(variant + 2) % FEN_PLANTS.willow.length];
  const trunkH = 2.0 + rand() * 0.7;
  const lean = (rand() - 0.5) * 0.3;
  b.cyl(0.3, 0.46, trunkH + 0.3, lite ? 5 : 7, { at: [0, trunkH / 2 - 0.15, 0], rot: [lean, 0, lean * 0.6], color: EARTH.bark, jitter: 0.14 });
  if (!lite) b.cyl(0.5, 0.66, 0.45, 7, { at: [0, 0.1, 0], color: EARTH.barkDark, jitter: 0.14 });
  const fork: Vec3 = [Math.sin(lean * 0.6) * -trunkH * 0.5, trunkH - 0.1, Math.sin(lean) * trunkH];
  const limbs = lite ? 3 : 5;
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * PI * 2 + rand() * 0.9;
    const reach = 1.5 + rand() * 1.3;
    const tip: Vec3 = [fork[0] + Math.cos(a) * reach, trunkH + 1.6 + rand() * 1.4, fork[2] + Math.sin(a) * reach];
    b.bar(fork, tip, 0.16, 0.16, { color: EARTH.bark });
    const r = 1.1 + rand() * 0.45;
    const crown = new IcosahedronGeometry(r, 0).scale(1.25, 0.75, 1.25);
    b.shape(crown, { at: [tip[0], tip[1] + 0.2, tip[2]], rot: [0, rand() * PI, 0], color: i % 2 ? leaf : dark, jitter: 0.12 });
    if (lite) continue;
    // The curtains: long tapering fronds hanging from the crown's rim.
    for (let k = 0; k < 6; k++) {
      const c = (k / 6) * PI * 2 + rand() * 0.5;
      const len = 1.6 + rand() * 1.2;
      const [fx, fz] = [tip[0] + Math.cos(c) * r * 1.05, tip[2] + Math.sin(c) * r * 1.05];
      b.shape(new ConeGeometry(0.34, len, 3, 1, true), { at: [fx, tip[1] - len / 2 + 0.1, fz], rot: [PI + Math.sin(c) * 0.08, c, -Math.cos(c) * 0.08], color: k % 2 ? leaf : dark, jitter: 0.12 });
    }
  }
  return b.build();
}

/** A dead tree in the bog: a grey trunk and a few bare limbs. */
export function deadTree(variant: number): BufferGeometry {
  const b = new ModelBuilder(500 + variant);
  const rand = mulberry32(1100 + variant);
  const bark = 0x5e5a50;
  const h = 3.6 + rand() * 1.4;
  b.cyl(0.14, 0.3, h, 6, { at: [0, h / 2 - 0.1, 0], rot: [rand() * 0.1, 0, rand() * 0.1], color: bark, jitter: 0.14 });
  for (let i = 0; i < 4; i++) {
    const a = rand() * PI * 2;
    const y = h * (0.45 + rand() * 0.45);
    const r = 0.8 + rand() * 1.2;
    b.bar([0, y, 0], [Math.cos(a) * r, y + 0.6 + rand() * 0.8, Math.sin(a) * r], 0.08, 0.08, { color: bark });
  }
  return b.build();
}
