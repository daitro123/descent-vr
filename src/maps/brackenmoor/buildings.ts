import type { BufferGeometry } from 'three';
import { ModelBuilder, type PartOpts } from '../../models/kit';
import { PAL } from '../../models/palette';
import { standingStone } from '../forest/buildings';
import { mulberry32 } from '../forest/noise';
import { EARTH } from '../forest/palette';
import { cairn, chimney, crate, door, gableRoof, pile, punt, quoins, type RoofLook, signpost, walls, windowOn } from '../props';
import type { MoorStructure } from './plan';
import { MOOR_BUILD as B, MOOR_TREES } from './palette';

// Brackenmoor's buildings and set pieces, each in its own frame (origin on the
// ground at its footprint's middle, front facing +Z), as Oakvale's are: grey
// gritstone two storeys high under slate in Cairnford, long low crofts under
// heather thatch with a peat stack by the door, round folds of dry stone, the
// landlord's hall in dressed stone (the only square-cut stone on the moor),
// and the Deepkings' black stone in the Long Stones and Hollowhill's door.

const PI = Math.PI;

const SLATE: RoofLook = { roof: B.slate, ridge: B.slateDark, gable: B.grit, thick: 0.14 };
const THATCH: RoofLook = { roof: B.thatch, ridge: B.thatchDark, gable: B.gritDark, thick: 0.34 };
const HALL_ROOF: RoofLook = { roof: B.slate, ridge: B.slateDark, gable: B.dressed, thick: 0.16 };

/** The model of one structure, in its own frame. */
export function buildMoorStructure(s: MoorStructure): BufferGeometry {
  const b = new ModelBuilder(1 + s.seed * 13);
  const rand = mulberry32(s.seed * 7919 + 3);
  switch (s.kind) {
    case 'house': stoneHouse(b, s.w, s.d, s.h, rand, s.variant); break;
    case 'inn': inn(b, s.w, s.d); break;
    case 'mootHall': mootHall(b, s.w, s.d); break;
    case 'chapel': chapel(b, s.w, s.d); break;
    case 'smithy': smithy(b, s.w, s.d); break;
    case 'mill': mill(b, s.w, s.d); break;
    case 'cottage': stoneHouse(b, s.w, s.d, 1, rand, 3); break;
    case 'croft': croft(b, s.w, s.d, s.variant === 1, rand); break;
    case 'ruin': ruin(b, s.w, s.d, rand); break;
    case 'fold': fold(b, s.w, s.variant === 1, rand); break;
    case 'hall': hall(b, s.w, s.d); break;
    case 'gatehouse': gatePosts(b, s.w); break;
    case 'flag': flag(b, s.h); break;
    case 'tollhouse': tollhouse(b, s.w, s.d); break;
    case 'tollgate': tollgate(b, s.w); break;
    case 'cairn': cairn(b, s.h, s.seed, B.grit, B.gritDark); break;
    case 'signpost': signpost(b, SIGN_WAYS[s.variant] ?? [0]); break;
    case 'mapboard': mapBoard(b); break;
    case 'bridge': bridge(b, s.w, s.d, s.h); break;
    case 'barrow': barrow(b, s.w, s.h, s.variant === 1, rand); break;
    case 'hollowhill': hollowDoor(b, s.w, s.h); break;
    case 'spoil': spoil(b, s.w, rand); break;
    case 'tent': tent(b, s.w, s.d); break;
    case 'ragPole': ragPole(b, s.h); break;
    case 'ladder': ladder(b, s.h); break;
    case 'lookout': lookout(b, s.w); break;
    case 'peatStack': peatStack(b, s.w, s.d, s.h); break;
    case 'peatBank': peatBank(b, s.w, s.d, rand); break;
    case 'hut': hut(b, s.w, s.d); break;
    case 'jetty': jetty(b, s.w, s.d); break;
    case 'boat': punt(b, s.d); break;
    case 'grave': grave(b); break;
    case 'stall': stall(b, s.w, s.d); break;
    case 'cart': cart(b); break;
    case 'garden': garden(b, s.w, s.d, rand); break;
    case 'hide': hide(b, s.w, s.d); break;
    case 'crates': crates(b, rand); break;
    case 'borderStone': standingStone(b, [0, 0, 0], s.h, 0, [0.05, -0.04], false); break;
    case 'longStone': longStone(b, s.h, rand); break;
    case 'marketCross': marketCross(b, s.h); break;
  }
  return b.build();
}

/** Which ways each signpost's boards point (radians about +Y from +Z, before the post turns). */
const SIGN_WAYS: readonly (readonly number[])[] = [
  [PI, PI * 0.1, -PI / 2],
  [0.2, PI * 0.75, -PI * 0.6],
  [PI, PI / 2, -PI / 2, 0.1],
  [-PI * 0.9, PI / 2, -PI / 2],
  [PI, 0.3, PI * 0.6],
];

// ------------------------------------------------------------------ Cairnford

/** Two storeys (or one) of rough gritstone under slate, dark quoins, a chimney at a gable end, a door and windows. */
function stoneHouse(b: ModelBuilder, w: number, d: number, storeys: number, rand: () => number, variant: number): void {
  const h = storeys * 2.7;
  walls(b, w, d, h, rand() < 0.5 ? B.grit : B.gritLight);
  quoins(b, w, d, h, B.gritDark);
  b.box(w + 0.1, 0.2, d + 0.1, { at: [0, h - 0.1, 0], color: B.gritDark });
  gableRoof(b, w, d, h, 2.3 + storeys * 0.2, 0.35, SLATE);
  chimney(b, (variant % 2 ? -1 : 1) * (w / 2 - 0.5), 0, h + 1.2, h + 3.6, B.gritDark);
  const doorX = ((variant % 3) - 1) * (w / 4);
  door(b, doorX, d / 2, 1.0, 2.0, B.door, B.gritDark);
  for (let s = 0; s < storeys; s++) {
    const y = 1.5 + s * 2.7;
    for (const x of [-w / 3, w / 3]) {
      if (s === 0 && Math.abs(x - doorX) < 1.2) continue;
      windowOn(b, [x, y, d / 2], [0, 1], 0.7, B.window, B.gritDark);
      windowOn(b, [x, y, -d / 2], [0, -1], 0.6, B.window, B.gritDark);
    }
  }
  b.box(1.6, 0.25, 0.9, { at: [doorX, 0.06, d / 2 + 0.5], color: B.gritDark });
}

/** The Ford Inn: a long two-storey house with a hanging sign and a bench by its door. */
function inn(b: ModelBuilder, w: number, d: number): void {
  const rand = mulberry32(17);
  stoneHouse(b, w, d, 2, rand, 1);
  // A second chimney, and the sign on its bracket.
  chimney(b, -w / 2 + 0.5, 0, 6.6, 9.2, B.gritDark);
  b.box(0.1, 0.1, 1.2, { at: [w / 4, 3.6, d / 2 + 0.6], color: PAL.ironDark });
  b.box(0.9, 0.7, 0.06, { at: [w / 4, 3.15, d / 2 + 1.0], rot: [0, PI / 2, 0], color: B.door });
  b.box(0.06, 0.4, 0.5, { at: [w / 4, 3.15, d / 2 + 1.0], color: 0xc9a040 });
  b.box(2.2, 0.1, 0.45, { at: [-w / 4, 0.5, d / 2 + 0.5], color: PAL.wood }).box(0.12, 0.45, 0.4, { at: [-w / 4 - 0.9, 0.23, d / 2 + 0.5], color: PAL.woodDark });
  b.box(0.12, 0.45, 0.4, { at: [-w / 4 + 0.9, 0.23, d / 2 + 0.5], color: PAL.woodDark });
}

/** The moot hall: open arches on the ground floor where the market shelters, the hall over them. */
function mootHall(b: ModelBuilder, w: number, d: number): void {
  const t: PartOpts = { color: B.gritLight, jitter: 0.08 };
  // The arcade's piers.
  const bays = 4;
  for (let i = 0; i <= bays; i++) {
    const x = -w / 2 + (i * w) / bays;
    for (const z of [-d / 2, d / 2]) b.box(0.8, 3.4, 0.8, { ...t, at: [x, 1.0, z] });
  }
  b.box(w, 0.4, d, { at: [0, 0.02, 0], color: B.gritDark });
  b.box(0.6, 3.0, d, { ...t, at: [-w / 2, 1.5, 0] });
  b.box(0.6, 3.0, d, { ...t, at: [w / 2, 1.5, 0] });
  b.box(w, 0.4, d + 0.2, { at: [0, 3.2, 0], color: B.gritDark });
  walls(b, w + 0.2, d + 0.2, 2.6, B.grit, [0, 3.4, 0]);
  quoins(b, w, d, 6.0, B.gritDark);
  for (let i = 0; i < bays; i++) {
    const x = -w / 2 + ((i + 0.5) * w) / bays;
    windowOn(b, [x, 4.8, d / 2 + 0.1], [0, 1], 0.8, B.window, B.gritDark);
    windowOn(b, [x, 4.8, -d / 2 - 0.1], [0, -1], 0.8, B.window, B.gritDark);
  }
  gableRoof(b, w + 0.2, d + 0.2, 6.0, 2.6, 0.4, SLATE);
  // A bell-cote on the ridge.
  b.box(0.8, 1.2, 0.8, { at: [0, 8.9, 0], color: B.grit }).cone(0.7, 0.9, 4, { at: [0, 9.95, 0], rot: [0, PI / 4, 0], color: B.slateDark });
  b.box(0.4, 0.4, 0.4, { at: [0, 9.0, 0], color: 0x8a6a2a });
  // A notice board on a pier.
  b.box(1.4, 1.0, 0.08, { at: [0, 1.7, d / 2 + 0.45], color: PAL.wood });
  for (const [x, y] of [[-0.3, 1.9], [0.25, 1.75], [-0.1, 1.5]]) b.box(0.32, 0.4, 0.02, { at: [x, y, d / 2 + 0.5], color: B.wool, jitter: 0.05 });
}

/** The chapel: a plain nave with a west gable's bell-cote and a round-headed door. */
function chapel(b: ModelBuilder, w: number, d: number): void {
  walls(b, w, d, 3.6, B.gritLight);
  quoins(b, w, d, 3.6, B.gritDark);
  gableRoof(b, d, w, 3.6, 3.2, 0.3, SLATE, [0, 0, 0]);
  // The gable roof runs along X: turn the nave's long side to Z by building it rotated.
  door(b, 0, d / 2, 1.2, 2.4, B.door, B.gritDark);
  b.box(1.2, 0.6, 0.12, { at: [0, 2.6, d / 2 + 0.04], color: B.gritDark });
  for (const z of [-d / 4, d / 4 - 1]) {
    windowOn(b, [w / 2, 2.0, z], [1, 0], 0.5, B.window, B.gritDark);
    windowOn(b, [-w / 2, 2.0, z], [-1, 0], 0.5, B.window, B.gritDark);
  }
  b.box(1.0, 1.6, 0.8, { at: [0, 7.4, d / 2 - 0.4], color: B.gritLight }).box(1.1, 0.2, 0.9, { at: [0, 8.3, d / 2 - 0.4], color: B.gritDark });
  b.box(0.36, 0.4, 0.36, { at: [0, 7.4, d / 2 - 0.4], color: 0x8a6a2a });
  // A few gravestones by its side.
  for (const [x, z] of [[w / 2 + 2, -2], [w / 2 + 2.2, 0.5], [w / 2 + 2.6, 3], [w / 2 + 4, -1]]) b.box(0.55, 0.8, 0.14, { at: [x, 0.3, z], rot: [0, PI / 2, (x + z) * 0.03], color: B.gritDark });
}

/** The smithy: an open-fronted shed under slate, the forge's stone hearth and chimney at its back, an anvil on its block. */
function smithy(b: ModelBuilder, w: number, d: number): void {
  const h = 3;
  b.box(w, h + 1.4, 0.5, { at: [0, (h - 1.4) / 2, -d / 2 + 0.25], color: B.grit });
  for (const x of [-w / 2 + 0.25, w / 2 - 0.25]) b.box(0.5, h + 1.4, d, { at: [x, (h - 1.4) / 2, 0], color: B.grit });
  for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) b.box(0.3, h, 0.3, { at: [x, h / 2, d / 2 - 0.2], color: B.timber });
  b.box(w, 0.3, 0.3, { at: [0, h - 0.15, d / 2 - 0.2], color: B.timber });
  gableRoof(b, w, d, h, 1.8, 0.4, SLATE);
  b.box(1.6, 0.9, 1.6, { at: [-w / 4, 0.45, -d / 4], color: B.gritDark }).box(1.0, 0.1, 1.0, { at: [-w / 4, 0.92, -d / 4], color: 0x2a2220 });
  chimney(b, -w / 4, -d / 2 + 0.6, 0.9, h + 3.2, B.gritDark);
  b.box(0.5, 0.6, 0.5, { at: [w / 6, 0.3, 0.6], color: PAL.woodDark }).box(0.75, 0.25, 0.32, { at: [w / 6, 0.72, 0.6], color: PAL.ironDark });
  b.box(0.9, 0.8, 0.5, { at: [w / 2 - 1, 0.4, -d / 2 + 0.8], color: PAL.wood });
}

/** The mill on the beck: a two-storey stone mill house, its wheel turned by the water on its front. */
function mill(b: ModelBuilder, w: number, d: number): void {
  const rand = mulberry32(5);
  stoneHouse(b, w, d, 2, rand, 2);
  // The wheel, standing out over the water on the front, and its axle.
  const r = 2.1;
  const at = [w / 2 - 1.8, 1.0, d / 2 + 1.0] as const;
  b.cyl(0.18, 0.18, 1.3, 6, { at: [at[0], at[1], at[2] - 0.4], rot: [PI / 2, 0, 0], color: PAL.ironDark });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2;
    b.box(0.14, r * 2, 0.12, { at: [at[0], at[1], at[2]], rot: [0, 0, a], color: PAL.woodDark });
    b.box(0.5, 0.06, 0.8, { at: [at[0] + Math.sin(a) * r, at[1] + Math.cos(a) * r, at[2]], rot: [0, 0, -a], color: PAL.wood });
  }
  for (const z of [at[2] - 0.4, at[2] + 0.4]) b.cyl(r, r, 0.08, 12, { at: [at[0], at[1], z], rot: [PI / 2, 0, 0], color: PAL.wood });
}

/** A long low croft of rubble under heather thatch, a peat stack by its door; an abandoned one with its door hanging open and its thatch fallen in. */
function croft(b: ModelBuilder, w: number, d: number, abandoned: boolean, rand: () => number): void {
  const h = 2.1;
  walls(b, w, d, h, rand() < 0.5 ? B.gritDark : B.grit, [0, 0, 0], 0.14);
  gableRoof(b, w, d, h, 2.0, 0.3, abandoned ? { ...THATCH, roof: 0x4a3a2c } : THATCH);
  if (abandoned) {
    // A hole where the thatch has fallen in, the rafters showing.
    b.box(w * 0.3, 0.4, d * 0.34, { at: [w * 0.15, h + 1.2, d * 0.15], rot: [-0.7, 0, 0], color: 0x1e1814 });
    for (let i = 0; i < 3; i++) b.box(0.1, 0.1, d * 0.5, { at: [w * 0.06 + i * 0.6, h + 1.3, d * 0.12], rot: [-0.75, 0, 0], color: B.timber });
  }
  door(b, -w / 4, d / 2, 0.9, 1.75, B.door, B.gritDark, abandoned ? 1.1 : 0);
  windowOn(b, [w / 5, 1.2, d / 2], [0, 1], 0.5, B.window, B.gritDark);
  chimney(b, w / 2 - 0.6, 0, h + 1.0, h + 2.6, B.gritDark);
  if (!abandoned) peatStack(b, 1.8, 1.0, 1.0, [-w / 2 - 1.4, 0, d / 2 - 0.4]);
}

/** A burnt longhouse: its walls broken down to stumps on one side, charred roof timbers fallen across its floor. */
function ruin(b: ModelBuilder, w: number, d: number, rand: () => number): void {
  const t = 0.6;
  const ragged = (len: number, at: readonly [number, number], alongX: boolean) => {
    const n = Math.round(len / 1.2);
    for (let i = 0; i < n; i++) {
      const h = 0.6 + rand() * 1.6;
      const u = -len / 2 + (i + 0.5) * (len / n);
      b.box(alongX ? len / n + 0.05 : t, h + 1, alongX ? t : len / n + 0.05, { at: [at[0] + (alongX ? u : 0), (h - 1) / 2, at[1] + (alongX ? 0 : u)], color: rand() < 0.3 ? B.charred : B.gritDark, jitter: 0.15 });
    }
  };
  ragged(w, [0, -d / 2], true);
  ragged(d, [-w / 2, 0], false);
  ragged(d, [w / 2, 0], false);
  ragged(w / 2, [w / 4, d / 2], true);
  for (let i = 0; i < 5; i++) b.box(0.18, 0.18, d * (0.6 + rand() * 0.5), { at: [-w / 2 + 1 + rand() * (w - 2), 0.2 + rand() * 0.6, (rand() - 0.5) * 1.2], rot: [0.3 * (rand() - 0.5), rand() * 0.6, 0.4 * (rand() - 0.5)], color: B.charred });
  b.box(w - 1, 0.04, d - 1, { at: [0, 0.03, 0], color: 0x2e2620 });
}

/** A round sheepfold of dry stone, its gate gap on the front; an empty one with a gap fallen in its wall. */
function fold(b: ModelBuilder, r: number, broken: boolean, rand: () => number): void {
  const n = Math.max(10, Math.round((r * PI * 2) / 1.2));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    if (Math.abs(a - PI * 2) < 0.35 || a < 0.35) continue; // the gate, at the front
    if (broken && Math.abs(a - PI * 0.8) < 0.3) continue;
    const h = 1.0 + rand() * 0.25;
    b.box(0.7, h + 0.5, (r * PI * 2) / n + 0.05, { at: [Math.sin(a) * r, (h - 0.5) / 2, Math.cos(a) * r], rot: [0, a + PI / 2, 0], color: rand() < 0.5 ? B.grit : B.gritDark, jitter: 0.14 });
  }
  if (!broken) for (const s of [-1, 1]) b.box(0.15, 1.1, 0.15, { at: [s * 0.6, 0.55, r], color: PAL.woodDark });
}

/** Fellgate Hall: three storeys of dressed stone, a porch with columns, a stone parapet, too big and too clean for the moor. */
function hall(b: ModelBuilder, w: number, d: number): void {
  const h = 8.4;
  walls(b, w, d, h, B.dressed, [0, 0, 0], 0.03);
  for (const y of [2.8, 5.6]) b.box(w + 0.16, 0.18, d + 0.16, { at: [0, y, 0], color: B.dressedDark, jitter: 0.02 });
  b.box(w + 0.3, 0.5, d + 0.3, { at: [0, h + 0.1, 0], color: B.dressedDark, jitter: 0.02 });
  gableRoof(b, w - 1, d - 1, h + 0.35, 2.6, 0.1, HALL_ROOF);
  for (const x of [-w / 2 + 1.5, w / 2 - 1.5]) chimney(b, x, 0, h + 1, h + 4.2, B.dressedDark);
  for (let s = 0; s < 3; s++) {
    for (let i = 0; i < 5; i++) {
      const x = -w / 2 + ((i + 0.5) * w) / 5;
      if (s === 0 && i === 2) continue;
      windowOn(b, [x, 1.5 + s * 2.8, d / 2], [0, 1], 1.0, B.window, B.dressedDark);
      windowOn(b, [x, 1.5 + s * 2.8, -d / 2], [0, -1], 1.0, B.window, B.dressedDark);
    }
  }
  door(b, 0, d / 2, 1.6, 2.6, B.crimson, B.dressedDark);
  // The porch: two columns and a pediment, steps up to it.
  for (const x of [-1.6, 1.6]) b.cyl(0.25, 0.28, 3.2, 8, { at: [x, 1.6, d / 2 + 1.8], color: B.dressed, jitter: 0.02 });
  b.box(4.2, 0.3, 2.4, { at: [0, 3.35, d / 2 + 1.1], color: B.dressedDark }).taper(4.2, 2.4, 4.2, 0.1, 0.9, { at: [0, 3.5, d / 2 + 1.1], color: B.dressed });
  for (let i = 0; i < 3; i++) b.box(4.6 - i * 0.4, 0.18, 0.5, { at: [0, 0.09 + i * 0.18, d / 2 + 2.6 - i * 0.45], color: B.dressedDark });
  // The house's black key, carved over the door.
  b.box(0.7, 0.7, 0.06, { at: [0, 4.4, d / 2 + 0.04], color: B.crimson }).box(0.12, 0.5, 0.04, { at: [0, 4.35, d / 2 + 0.09], color: B.black });
  b.box(0.3, 0.12, 0.04, { at: [0.08, 4.25, d / 2 + 0.09], color: B.black });
}

/** The hall's gate posts, dressed stone with a ball on each. */
function gatePosts(b: ModelBuilder, span: number): void {
  for (const s of [-1, 1]) {
    b.box(0.8, 2.6, 0.8, { at: [(s * span) / 2, 1.0, 0], color: B.dressed, jitter: 0.03 }).ball(0.35, { at: [(s * span) / 2, 2.6, 0], color: B.dressedDark }, 1);
    b.box(2.2, 1.2, 0.5, { at: [(s * span) / 2 + s * 1.5, 0.4, 0], color: B.dressed, jitter: 0.03 });
  }
  // Iron gates, standing open.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) b.box(0.05, 2.0, 0.05, { at: [(s * span) / 2 - s * 0.2, 1.0, 0.3 + i * 0.4], color: PAL.ironDark, jitter: 0 });
    b.box(0.05, 0.08, 2.4, { at: [(s * span) / 2 - s * 0.2, 1.9, 1.3], color: PAL.ironDark, jitter: 0 });
  }
}

/** A tall pole with House Corvane's crimson flag and its black key. */
function flag(b: ModelBuilder, h: number): void {
  b.cyl(0.07, 0.1, h, 6, { at: [0, h / 2, 0], color: PAL.woodDark }).ball(0.12, { at: [0, h + 0.05, 0], color: PAL.gold });
  b.box(0.04, 1.3, 2.0, { at: [0, h - 0.8, 1.05], rot: [0, 0, 0.03], color: B.crimson, jitter: 0.06 });
  b.box(0.05, 0.6, 0.18, { at: [0, h - 0.8, 1.1], color: B.black, jitter: 0 }).box(0.05, 0.14, 0.4, { at: [0, h - 1.05, 1.2], color: B.black, jitter: 0 });
}

/** The tollhouse: a small single-storey stone house with a bay window toward the road. */
function tollhouse(b: ModelBuilder, w: number, d: number): void {
  const rand = mulberry32(23);
  stoneHouse(b, w, d, 1, rand, 0);
  b.box(1.8, 1.4, 0.9, { at: [w / 4, 1.3, d / 2 + 0.45], color: B.grit }).box(1.4, 0.8, 0.06, { at: [w / 4, 1.5, d / 2 + 0.92], color: B.window });
  b.taper(2.0, 1.1, 2.0, 0.1, 0.5, { at: [w / 4, 2.0, d / 2 + 0.45], color: B.slate });
}

/** The toll gate, shut across the road: two posts, a beam and a painted bar. */
function tollgate(b: ModelBuilder, w: number): void {
  for (const s of [-1, 1]) b.box(0.3, 1.6, 0.3, { at: [(s * w) / 2, 0.8, 0], color: PAL.woodDark });
  b.box(w + 0.2, 0.2, 0.2, { at: [0, 1.15, 0], color: B.wool }).box(w * 0.2, 0.22, 0.22, { at: [-w * 0.2, 1.15, 0], color: B.crimson });
  b.box(w * 0.2, 0.22, 0.22, { at: [w * 0.2, 1.15, 0], color: B.crimson });
  b.box(w, 0.12, 0.12, { at: [0, 0.6, 0], color: PAL.woodDark });
}

/** A weathered painted map on a board, two legs, a little roof; its face left plain. */
function mapBoard(b: ModelBuilder): void {
  for (const s of [-1, 1]) b.box(0.14, 2.0, 0.14, { at: [s * 0.75, 1.0, 0], color: PAL.woodDark });
  b.box(1.5, 1.0, 0.08, { at: [0, 1.45, 0.05], rot: [-0.12, 0, 0], color: PAL.wood }).box(1.3, 0.8, 0.02, { at: [0, 1.45, 0.11], rot: [-0.12, 0, 0], color: 0xc8b88a, jitter: 0.04 });
  b.box(1.8, 0.08, 0.5, { at: [0, 2.05, 0.05], rot: [0.25, 0, 0], color: B.slateDark });
}

/** Cairnford's bridge: three stone arches over the beck, its deck rising to the middle, parapets either side. */
function bridge(b: ModelBuilder, width: number, len: number, rise: number): void {
  const t: PartOpts = { color: B.grit, jitter: 0.1 };
  const steps = 10;
  // The deck: blocks along the span, each at its height on the arch.
  for (let i = 0; i < steps; i++) {
    const f0 = i / steps;
    const f1 = (i + 1) / steps;
    const y0 = rise * Math.sin(PI * f0);
    const y1 = rise * Math.sin(PI * f1);
    const z0 = -len / 2 + f0 * len;
    const seg = len / steps;
    const a = Math.atan2(y1 - y0, seg);
    b.box(width, 0.5, seg + 0.06, { at: [0, (y0 + y1) / 2 - 0.25, z0 + seg / 2], rot: [-a, 0, 0], color: B.gritDark, jitter: 0.08 });
    for (const s of [-1, 1]) b.box(0.4, 0.9, seg + 0.06, { ...t, at: [s * (width / 2 + 0.2), (y0 + y1) / 2 + 0.2, z0 + seg / 2], rot: [-a, 0, 0] });
  }
  // The piers between the arches, and the arches' spandrels down into the water.
  for (const f of [1 / 3, 2 / 3]) {
    const z = -len / 2 + f * len;
    b.box(width + 0.8, 3.2, 1.2, { ...t, at: [0, -1.3, z] });
    b.taper(width + 0.8, 1.6, width + 0.8, 0.2, 0.8, { at: [0, -2.9, z], rot: [0, 0, 0], color: B.gritDark });
  }
  for (let i = 0; i < 3; i++) {
    const zc = -len / 2 + ((i + 0.5) * len) / 3;
    const span = len / 3 - 1.2;
    for (const s of [-1, 1]) {
      // A ring of voussoirs round each arch, on each face.
      for (let k = 0; k <= 6; k++) {
        const a = PI * (k / 6);
        b.box(0.5, 0.5, 0.4, { at: [s * (width / 2 + 0.05), -1.0 + Math.sin(a) * 0.9, zc - Math.cos(a) * (span / 2)], rot: [a - PI / 2, 0, 0], color: B.gritDark, jitter: 0.12 });
      }
    }
  }
}

// ------------------------------------------------------------------ the barrows

/** A grassy barrow; a broken one has a dark cut into its side where the diggers went in. */
function barrow(b: ModelBuilder, r: number, h: number, broken: boolean, rand: () => number): void {
  const g = b.ball(1, { at: [0, -0.3, 0], color: 0x6e6c3e, jitter: 0.12 }, 1);
  void g;
  // The ball is the unit icosphere: stretch it into a low mound by building several overlapping lumps.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + rand();
    b.ball(r * (0.75 + rand() * 0.15), { at: [Math.cos(a) * r * 0.25, -r * 0.7 + h, Math.sin(a) * r * 0.25], color: rand() < 0.5 ? 0x6e6c3e : 0x7a7444, jitter: 0.1 }, 1);
  }
  // Kerb stones round its foot.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * PI * 2;
    b.box(0.6, 0.6, 0.4, { at: [Math.sin(a) * r * 0.95, 0.1, Math.cos(a) * r * 0.95], rot: [0, a, 0.1], color: B.gritDark, jitter: 0.15 });
  }
  if (broken) {
    b.box(1.4, 1.4, 2.6, { at: [0, 0.6, r * 0.7], rot: [0.25, 0, 0], color: 0x1a1612, jitter: 0 });
    b.box(1.8, 0.3, 0.3, { at: [0, 1.4, r * 0.55], color: B.deep });
    // A dropped pick by the cut.
    b.box(0.06, 0.06, 1.1, { at: [1.5, 0.1, r + 0.6], rot: [0, 0.6, 0], color: PAL.wood }).box(0.6, 0.08, 0.08, { at: [1.82, 0.12, r + 1.04], rot: [0, 0.6, 0], color: PAL.iron });
  }
}

/** Hollowhill's door: a frame of black Deepking stone with its faint inlaid line, the stone door standing ajar, boot prints going in. */
function hollowDoor(b: ModelBuilder, w: number, h: number): void {
  const line: PartOpts = { color: B.deepLine, glow: 0.35, jitter: 0 };
  for (const s of [-1, 1]) {
    b.box(0.9, h + 0.6, 1.2, { at: [(s * w) / 2, (h + 0.6) / 2 - 0.3, 0], color: B.deep, jitter: 0.05 });
    b.box(0.06, h - 0.2, 0.04, { ...line, at: [(s * w) / 2 - s * 0.12, h / 2, 0.62] });
  }
  b.box(w + 1.8, 0.9, 1.4, { at: [0, h + 0.3, 0], color: B.deep, jitter: 0.05 });
  b.box(w + 1.2, 0.05, 0.04, { ...line, at: [0, h + 0.2, 0.72] });
  // The dark beyond, and the door slab swung in.
  b.box(w - 0.9, h, 0.2, { at: [0, h / 2, -0.4], color: 0x0c0b0a, jitter: 0 });
  b.box(w * 0.55, h - 0.1, 0.35, { at: [w / 4, h / 2, -0.5], rot: [0, -0.9, 0], color: B.deep, jitter: 0.05 });
  // The diggers' rope and a pick left at the threshold.
  b.box(0.06, 0.06, 1.2, { at: [-0.5, 0.06, 1.2], rot: [0, 0.4, 0], color: PAL.wood }).box(0.6, 0.08, 0.08, { at: [-0.25, 0.08, 1.7], rot: [0, 0.4, 0], color: PAL.iron });
  b.cyl(0.3, 0.3, 0.12, 8, { at: [0.6, 0.06, 1.0], color: 0x8a7a5a });
}

/** A heap of spoil from the diggers. */
function spoil(b: ModelBuilder, r: number, rand: () => number): void {
  for (let i = 0; i < 4; i++) b.ball(r * (0.4 + rand() * 0.3), { at: [(rand() - 0.5) * r, -0.1, (rand() - 0.5) * r], color: rand() < 0.5 ? 0x5a4632 : 0x6a543a, jitter: 0.15 });
}

// ------------------------------------------------------------------ the Kerchiefs' places

/** A ridge tent of patched canvas, its flaps open at the front. */
function tent(b: ModelBuilder, w: number, d: number): void {
  const h = 2.0;
  const theta = Math.atan2(h, w / 2);
  const len = Math.hypot(h, w / 2);
  for (const s of [-1, 1]) b.box(0.06, len, d, { at: [(s * w) / 4, h / 2, 0], rot: [0, 0, s * (PI / 2 - theta)], color: s < 0 ? 0xb8a880 : 0xa89870, jitter: 0.1 });
  b.box(0.1, 0.1, d + 0.4, { at: [0, h, 0], color: PAL.woodDark });
  for (const z of [-d / 2, d / 2]) b.box(0.1, h, 0.1, { at: [0, h / 2, z], color: PAL.woodDark });
  b.box(w * 0.7, h * 0.6, 0.04, { at: [0, h * 0.3, -d / 2], color: 0xa89870 });
  b.box(0.5, 0.06, 0.4, { at: [0.6, 0.03, d / 2 + 0.6], color: B.kerchief });
}

/** A pole on the scar's lip with a red rag flying from it. */
function ragPole(b: ModelBuilder, h: number): void {
  b.box(0.1, h, 0.1, { at: [0, h / 2 - 0.3, 0], rot: [0.05, 0, 0.04], color: PAL.woodDark });
  b.box(0.04, 0.45, 0.8, { at: [0, h - 0.6, 0.42], rot: [0.1, 0, 0.05], color: B.kerchief, jitter: 0.1 });
}

/** The ladder path up the scar: a long wooden ladder against the quarry face. */
function ladder(b: ModelBuilder, h: number): void {
  const lean = 0.18;
  for (const s of [-1, 1]) b.box(0.08, h + 1, 0.08, { at: [s * 0.3, (h + 1) / 2, -Math.sin(lean) * (h / 2)], rot: [-lean, 0, 0], color: PAL.wood });
  for (let y = 0.4; y < h + 0.6; y += 0.4) b.box(0.6, 0.05, 0.05, { at: [0, y, -Math.sin(lean) * y], color: PAL.woodDark });
}

/** The lookout on the scar's lip: a plank platform on posts with a rail. */
function lookout(b: ModelBuilder, w: number): void {
  for (const x of [-w / 2, w / 2]) for (const z of [-w / 2, w / 2]) b.box(0.15, 2.4, 0.15, { at: [x, 0.9, z], color: PAL.woodDark });
  b.box(w + 0.3, 0.12, w + 0.3, { at: [0, 1.5, 0], color: PAL.wood });
  for (const [x, z, rot] of [[0, w / 2, 0], [0, -w / 2, 0], [w / 2, 0, PI / 2], [-w / 2, 0, PI / 2]] as const) b.box(w, 0.08, 0.08, { at: [x, 2.4, z], rot: [0, rot, 0], color: PAL.wood });
}

/** A fresh grave behind the scar: a mound, a shepherd's crook stuck in it and a red kerchief tied round the crook. */
function grave(b: ModelBuilder): void {
  b.box(0.9, 0.35, 2.0, { at: [0, 0.1, 0], color: 0x5a4632, jitter: 0.15 });
  b.box(0.06, 1.5, 0.06, { at: [0, 0.8, -1.0], color: PAL.wood }).box(0.06, 0.06, 0.3, { at: [0, 1.52, -0.88], color: PAL.wood });
  b.box(0.1, 0.18, 0.12, { at: [0, 1.2, -1.0], color: B.kerchief });
}

// ------------------------------------------------------------------ the peat, the bog, Beck's Foot

/** A stack of cut peat blocks drying, `w` by `d`, `h` high (at `at`, or the middle). */
function peatStack(b: ModelBuilder, w: number, d: number, h: number, at: readonly [number, number, number] = [0, 0, 0]): void {
  const layers = Math.round(h / 0.22);
  for (let i = 0; i < layers; i++) {
    const f = 1 - i / (layers + 1);
    b.box(w * f, 0.22, d * f, { at: [at[0], at[1] + 0.11 + i * 0.22, at[2]], rot: [0, i * 0.2, 0], color: i % 2 ? B.peat : B.peatCut, jitter: 0.16 });
  }
}

/** A cut peat bank: a dark face where the cutters have dug, a few blocks lying cut beside it. */
function peatBank(b: ModelBuilder, w: number, d: number, rand: () => number): void {
  b.box(w, 1.0, d, { at: [0, -0.2, -d / 2], color: B.peat, jitter: 0.12 });
  for (let i = 0; i < 6; i++) b.box(0.45, 0.2, 0.3, { at: [-w / 2 + 0.6 + rand() * (w - 1.2), 0.08, 0.6 + rand() * 0.8], rot: [0, rand(), 0], color: B.peatCut, jitter: 0.12 });
  // A spade left standing in the bank.
  b.box(0.05, 1.2, 0.05, { at: [w / 3, 0.6, 0.2], rot: [0.2, 0, 0], color: PAL.wood }).box(0.24, 0.3, 0.03, { at: [w / 3, 0.05, 0.1], rot: [0.2, 0, 0], color: PAL.iron });
}

/** The eel-trapper's hut: a timber hut on short piles by the water, eel traps hung on its wall. */
function hut(b: ModelBuilder, w: number, d: number): void {
  for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) for (const z of [-d / 2 + 0.2, d / 2 - 0.2]) pile(b, x, z, -1, 0.6);
  b.box(w, 0.15, d, { at: [0, 0.6, 0], color: PAL.wood });
  b.box(w - 0.2, 2.0, d - 0.2, { at: [0, 1.65, 0], color: 0x6a5236, jitter: 0.12 });
  gableRoof(b, w - 0.2, d - 0.2, 2.65, 1.3, 0.3, { roof: 0x8a7a48, ridge: 0x6a5a34, gable: 0x6a5236, thick: 0.3 });
  door(b, 0, d / 2 - 0.1, 0.8, 1.7, PAL.woodDark, PAL.wood);
  for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) b.cyl(0.25, 0.15, 0.9, 6, { at: [x, 1.5, d / 2 + 0.05], rot: [PI / 2, 0, 0], color: 0x8a7a50 });
}

/** A short jetty of planks on piles, out from the bank along its own Z. */
function jetty(b: ModelBuilder, w: number, len: number): void {
  for (let z = -len / 2 + 0.3; z <= len / 2; z += 1.6) for (const x of [-w / 2, w / 2]) pile(b, x, z, -1.4, 0.55);
  b.box(w + 0.1, 0.1, len, { at: [0, 0.5, 0], color: PAL.wood, jitter: 0.12 });
}

/** A market stall: a trestle, a striped awning on poles, nothing on it. */
function stall(b: ModelBuilder, w: number, d: number): void {
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) b.box(0.08, 2.2, 0.08, { at: [x, 1.1, z], color: PAL.woodDark });
  b.box(w, 0.08, d * 0.6, { at: [0, 0.85, d * 0.15], color: PAL.wood });
  b.box(w + 0.2, 0.05, d + 0.3, { at: [0, 2.25, 0], rot: [0.12, 0, 0], color: B.wool });
  for (let i = 0; i < 3; i++) b.box(w / 6, 0.06, d + 0.32, { at: [-w / 2 + (w / 6) * (2 * i + 1.5), 2.26, 0], rot: [0.12, 0, 0], color: B.crimson });
}

/** A two-wheeled cart, its shafts down. */
function cart(b: ModelBuilder): void {
  b.box(1.5, 0.12, 2.4, { at: [0, 0.8, 0], color: PAL.wood });
  for (const s of [-1, 1]) {
    b.box(0.08, 0.4, 2.4, { at: [s * 0.75, 1.05, 0], color: PAL.woodDark });
    b.cyl(0.55, 0.55, 0.1, 10, { at: [s * 0.85, 0.55, 0], rot: [0, 0, PI / 2], color: PAL.woodDark });
    b.box(0.08, 0.08, 1.8, { at: [s * 0.45, 0.4, 1.9], rot: [0.3, 0, 0], color: PAL.wood });
  }
}

/** Granny Mott's herb garden: low beds edged with stone, a few rows of herbs. */
function garden(b: ModelBuilder, w: number, d: number, rand: () => number): void {
  for (let i = 0; i < 3; i++) {
    const z = -d / 2 + (i + 0.5) * (d / 3);
    b.box(w, 0.25, d / 3 - 0.6, { at: [0, 0.05, z], color: 0x4e3a28 });
    for (let k = 0; k < 6; k++) b.ball(0.25 + rand() * 0.12, { at: [-w / 2 + 0.6 + k * ((w - 1.2) / 5), 0.35, z], color: [0x4f7a34, 0x6a8a3a, 0x8a7a9a][i], jitter: 0.12 });
  }
  for (const z of [-d / 2, d / 2]) b.box(w + 0.3, 0.6, 0.3, { at: [0, 0.2, z], color: B.gritDark });
}

/** The Kerchiefs' hide in the drained pool: a tarp over poles, sacks of grave goods under it. */
function hide(b: ModelBuilder, w: number, d: number): void {
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) b.box(0.08, 1.5, 0.08, { at: [x, 0.75, z], color: PAL.woodDark });
  b.box(w + 0.4, 0.04, d + 0.4, { at: [0, 1.5, 0], rot: [0.15, 0, 0.05], color: 0x5a5a44 });
  for (let i = 0; i < 3; i++) b.ball(0.35, { at: [-0.8 + i * 0.7, 0.25, -0.3], color: 0x8a7a5a }, 1);
  b.box(0.4, 0.3, 0.3, { at: [0.9, 0.15, 0.6], color: 0x6a8a6a });
}

/** A few crates and a barrel. */
function crates(b: ModelBuilder, rand: () => number): void {
  crate(b, [0, 0, 0], 0.7, rand());
  crate(b, [0.8, 0, 0.2], 0.6, rand());
  crate(b, [0.3, 0.7, 0.1], 0.5, rand());
}

// ------------------------------------------------------------------ the Deepkings' stones, the town's cross

/** One of the Long Stones: tall, black Deepking stone, a faint inlaid line up its face, leaning a little. */
function longStone(b: ModelBuilder, h: number, rand: () => number): void {
  const tilt = [(rand() - 0.5) * 0.08, 0, (rand() - 0.5) * 0.08] as const;
  b.taper(1.0, 0.6, 0.62, 0.42, h + 0.3, { at: [0, -0.3, 0], rot: tilt, color: B.deep, jitter: 0.06 });
  b.box(0.05, h * 0.8, 0.04, { at: [tilt[2] * -h * 0.4, h * 0.45, 0.3], rot: tilt, color: B.deepLine, glow: 0.3, jitter: 0 });
  b.box(0.4, 0.05, 0.04, { at: [tilt[2] * -h * 0.6, h * 0.65, 0.29], rot: tilt, color: B.deepLine, glow: 0.3, jitter: 0 });
  b.box(0.7, 0.25, 0.5, { at: [0, h * 0.3, -0.05], rot: tilt, color: MOOR_TREES.cotton[0] });
}

/** The market cross in the square: a shaft on stepped plinths. */
function marketCross(b: ModelBuilder, h: number): void {
  for (let i = 0; i < 3; i++) b.box(2.4 - i * 0.6, 0.3, 2.4 - i * 0.6, { at: [0, 0.15 + i * 0.3, 0], color: i % 2 ? B.grit : B.gritDark, jitter: 0.08 });
  b.box(0.35, h, 0.35, { at: [0, 0.9 + h / 2, 0], color: B.gritLight }).box(1.0, 0.3, 0.3, { at: [0, 0.9 + h * 0.85, 0], color: B.gritLight });
  b.box(0.06, 0.4, 0.06, { at: [0, 0.9 + h + 0.2, 0], color: EARTH.rockDark });
}
