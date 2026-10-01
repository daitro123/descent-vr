import { type BufferGeometry, Matrix4 } from 'three';
import { ModelBuilder, type PartOpts, type Vec3 } from '../../models/kit';
import { PAL } from '../../models/palette';
import { standingStone } from '../forest/buildings';
import { hash01, mulberry32 } from '../forest/noise';
import { EARTH } from '../forest/palette';
import { barrel, cairn, crate, door, pile, punt, type RoofLook, signpost, walls, windowOn } from '../props';
import { houseLook } from './cairnford';
import type { MoorStructure } from './plan';
import { MOOR_BUILD as B, MOOR_TREES } from './palette';

// Brackenmoor's buildings and set pieces, each in its own frame (origin on the
// ground at its footprint's middle, front facing +Z), as Oakvale's are: grey
// gritstone houses one and two storeys high under slate in Cairnford, their
// doors painted, their windows in dressed surrounds and some of them lit, in
// terraces down its streets; long low crofts under heather thatch with a peat
// stack by the door; round folds of dry stone; the landlord's hall in dressed
// stone (the only square-cut stone on the moor); the three-arched bridge and
// the quays the beck runs between; and the Deepkings' black stone in the Long
// Stones and Hollowhill's door.

const PI = Math.PI;
type Rand = () => number;

const SLATE: RoofLook = { roof: B.slate, ridge: B.slateDark, gable: B.grit, thick: 0.14 };
const THATCH: RoofLook = { roof: B.thatch, ridge: B.thatchDark, gable: B.gritDark, thick: 0.34 };
const HALL_ROOF: RoofLook = { roof: B.slate, ridge: B.slateDark, gable: B.dressed, thick: 0.16 };

/** A storey's height, floor to floor. */
const STOREY = 2.7;

/** The model of one structure, in its own frame. */
export function buildMoorStructure(s: MoorStructure): BufferGeometry {
  const b = new ModelBuilder(1 + s.seed * 13);
  const rand = mulberry32(s.seed * 7919 + 3);
  let ao: { from: number; to: number; min: number } | undefined;
  switch (s.kind) {
    case 'house': house(b, s.w, s.d, s.h, s.variant); ao = AO; break;
    case 'cottage': house(b, s.w, s.d, 1, s.variant, { thatch: true }); cottageDressing(b, s.w, s.d); ao = AO; break;
    case 'inn': inn(b, s.w, s.d); ao = AO; break;
    case 'mootHall': mootHall(b, s.w, s.d); ao = AO; break;
    case 'chapel': chapel(b, s.w, s.d); ao = AO; break;
    case 'smithy': smithy(b, s.w, s.d); break;
    case 'mill': mill(b, s.w, s.d, (s.extra?.[0] ?? s.y - 1.2) - s.y); ao = AO; break;
    case 'croft': croft(b, s.w, s.d, s.variant === 1, rand); ao = AO; break;
    case 'ruin': ruin(b, s.w, s.d, rand); break;
    case 'fold': fold(b, s.w, s.variant === 1, rand); break;
    case 'hall': hall(b, s.w, s.d); ao = AO; break;
    case 'gatehouse': gatePosts(b, s.w); break;
    case 'flag': flag(b, s.h); break;
    case 'tollhouse': tollhouse(b, s.w, s.d); ao = AO; break;
    case 'tollgate': tollgate(b, s.w); break;
    case 'cairn': cairn(b, s.h, s.seed, B.grit, B.gritDark); break;
    case 'signpost': waySign(b, (s.extra ?? [0]).map((a) => a - s.yaw), s.variant === 1); break;
    case 'mapboard': mapBoard(b); break;
    case 'bridge': bridge(b, s.w, s.d, s.h, s.extra ?? [1.2, 1.2, -5, 5]); break;
    case 'quay': quay(b, s.w, rand); break;
    case 'barrow': barrow(b, s.w, s.h, s.variant === 1, rand); break;
    case 'hollowhill': hollowDoor(b, s.w, s.h); break;
    case 'dromos': dromos(b, s.w, s.d, s.extra ?? [1], rand); break;
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
    case 'graves': graves(b, s.w, s.d, rand); break;
    case 'stall': stall(b, s.w, s.d, s.variant, rand); break;
    case 'cart': cart(b, s.variant, rand); break;
    case 'wagon': wagon(b); break;
    case 'garden': garden(b, s.w, s.d, rand); break;
    case 'hide': hide(b, s.w, s.d); break;
    case 'crates': crates(b, rand); break;
    case 'borderStone': standingStone(b, [0, 0, 0], s.h, 0, [0.05, -0.04], false); break;
    case 'longStone': longStone(b, s.h, rand); break;
    case 'marketCross': marketCross(b, s.h); break;
    case 'well': well(b); break;
    case 'trough': trough(b, s.w, s.d); break;
    case 'bench': bench(b, s.w); break;
    case 'barrels': barrels(b, s.variant, rand); break;
    case 'postbox': postbox(b); break;
    case 'woodpile': woodpile(b, s.w, s.d, s.h, rand); break;
    case 'cartShed': cartShed(b, s.w, s.d, rand); break;
    case 'hayrick': hayrick(b, s.w, s.h); break;
    case 'townGate': townGate(b, s.w, s.h); break;
    case 'bollard': bollard(b); break;
    case 'stable': stable(b, s.w, s.d); ao = AO; break;
    case 'hedge': hedge(b, s.w, s.d, s.h); break;
    case 'sundial': sundial(b); break;
    case 'fieldGate': fieldGate(b, s.w); break;
    case 'campfire': campfire(b, rand); break;
    case 'crane': crane(b, s.h); break;
    case 'blocks': blocks(b, s.w, s.d, s.variant, rand); break;
    case 'eelTraps': eelTraps(b, rand); break;
    case 'waymark': waymark(b, s.h, rand); break;
    case 'tor': tor(b, s.w, s.variant, rand); break;
    case 'rack': rack(b, s.w, rand); break;
  }
  return b.build(ao ? { ao } : {});
}

/** A building's walls darken a little toward their feet. */
const AO = { from: -0.2, to: 1.6, min: 0.72 };

/**
 * Where smoke rises from a structure's chimneys, in its own frame: every
 * Cairnford house's first stack (but where its hearth is cold), the inn's
 * two, the mill's, the smithy's forge, and a lived-in croft's.
 */
export function smokeFrom(s: MoorStructure): Vec3[] {
  switch (s.kind) {
    case 'house': {
      const tops = stackTops(s.w, s.d, s.h, s.variant);
      return s.variant % 5 === 4 ? [] : [tops[0]];
    }
    case 'cottage':
      return [stackTops(s.w, s.d, 1, s.variant, true)[0]];
    case 'inn':
      return [-1, 1].map((x): Vec3 => [x * (s.w / 2 - 0.45), 2 * STOREY + INN_RISE + 1.5, 0]);
    case 'smithy':
      return [[-s.w / 4, SMITHY_H + 3.6, -s.d / 2 + 0.6]];
    case 'tollhouse':
      return [stackTops(s.w, s.d, 1, TOLL_LOOK)[0]];
    case 'croft':
      return s.variant === 0 ? [[s.w / 2 - 0.6, 2.1 + 2.7, 0]] : [];
    default:
      return [];
  }
}

// ------------------------------------------------------------------ the kit

const IDENTITY = new Matrix4();
const frames: Matrix4[] = [];

/** Build what `fn` adds in a frame moved to (x, y, z) and turned by `yaw` within the current one. */
function within(b: ModelBuilder, x: number, y: number, z: number, yaw: number, fn: () => void): void {
  const m = (frames.at(-1) ?? IDENTITY).clone().multiply(new Matrix4().makeRotationY(yaw).setPosition(x, y, z));
  frames.push(m);
  b.on(0, m);
  try {
    fn();
  } finally {
    frames.pop();
    b.on(0, frames.at(-1) ?? IDENTITY);
  }
}

/**
 * A gable roof with its ridge along X over a `w` by `d` box whose walls stop
 * at `top`: gable ends `rise` high, its slabs overhanging the eaves by `eave`
 * and the gables by `gable` (little, in a terrace, where the next roof meets
 * this one), a ridge along its top.
 */
function roofX(b: ModelBuilder, w: number, d: number, top: number, rise: number, eave: number, gable: number, look: RoofLook, at: Vec3 = [0, 0, 0]): void {
  const [ox, oy, oz] = at;
  b.taper(w, d, w, 0.04, rise, { at: [ox, oy + top, oz], color: look.gable, jitter: 0.08 });
  const half = d / 2 + eave;
  const theta = Math.atan2(rise, d / 2);
  const len = half / Math.cos(theta);
  const drop = eave * Math.tan(theta);
  for (const side of [-1, 1]) {
    b.box(w + 2 * gable, look.thick, len + 0.1, {
      at: [ox, oy + (top - drop + top + rise) / 2 + look.thick / 2, oz + (side * half) / 2],
      rot: [side * theta, 0, 0],
      color: look.roof,
      jitter: 0.1,
    });
  }
  b.box(w + 2 * gable + 0.04, look.thick + 0.08, 0.32, { at: [ox, oy + top + rise + look.thick * 0.55, oz], color: look.ridge });
}

/** The same roof with its ridge along Z. */
function roofZ(b: ModelBuilder, w: number, d: number, top: number, rise: number, eave: number, gable: number, look: RoofLook, at: Vec3 = [0, 0, 0]): void {
  within(b, at[0], at[1], at[2], PI / 2, () => roofX(b, d, w, top, rise, eave, gable, look));
}

/** A chimney stack from `from` up to `top`, its cap and two clay pots. */
function stack(b: ModelBuilder, x: number, z: number, from: number, top: number, color: number): void {
  b.box(0.76, top - from, 0.64, { at: [x, (from + top) / 2, z], color, jitter: 0.12 });
  b.box(0.9, 0.12, 0.78, { at: [x, top + 0.06, z], color: B.gritDark });
  for (const dx of [-0.17, 0.17]) b.box(0.2, 0.34, 0.2, { at: [x + dx, top + 0.29, z], color: B.pot, jitter: 0.1 });
}

/**
 * A window facing `normal` with its middle at `at`: a dressed stone
 * surround, a sill, a pane dark or lit warm from inside, a mullion down a
 * wide one.
 */
function pane(b: ModelBuilder, at: Vec3, normal: readonly [number, number], w: number, h: number, lit: boolean, frame: number = B.sill): void {
  const yaw = Math.atan2(normal[0], normal[1]);
  const [x, y, z] = at;
  const out = (k: number): Vec3 => [x + normal[0] * k, y, z + normal[1] * k];
  b.box(w + 0.26, h + 0.26, 0.1, { at: out(0.03), rot: [0, yaw, 0], color: frame, jitter: 0.05 });
  b.box(w, h, 0.08, { at: out(0.07), rot: [0, yaw, 0], color: lit ? B.warm : B.window, glow: lit ? 0.45 : 0, jitter: lit ? 0 : 0.04 });
  const sill = out(0.12);
  b.box(w + 0.4, 0.1, 0.24, { at: [sill[0], y - h / 2 - 0.15, sill[2]], rot: [0, yaw, 0], color: frame, jitter: 0.05 });
  if (w >= 0.9) b.box(0.08, h, 0.04, { at: out(0.12), rot: [0, yaw, 0], color: frame, jitter: 0 });
}

/** A door at `x` in the wall at z = `face` (front +, back −): a heavy lintel and jambs, its painted leaf, a step. */
function entrance(b: ModelBuilder, x: number, face: number, w: number, h: number, color: number, frame: number = B.sill): void {
  const s = Math.sign(face) || 1;
  b.box(w + 0.42, h + 0.34, 0.12, { at: [x, (h + 0.34) / 2, face + s * 0.04], color: frame, jitter: 0.05 });
  b.box(w, h, 0.1, { at: [x, h / 2, face + s * 0.1], color, jitter: 0.05 });
  b.box(0.08, 0.08, 0.06, { at: [x + w * 0.34, 1.05, face + s * 0.17], color: PAL.ironDark, jitter: 0 });
  b.box(w + 0.5, 0.22, 0.55, { at: [x, 0.0, face + s * 0.32], color: B.gritDark });
}

/** An iron lantern on a bracket out from the wall at z = `face`, lit. */
function lantern(b: ModelBuilder, x: number, y: number, face: number): void {
  const s = Math.sign(face) || 1;
  b.box(0.06, 0.06, 0.42, { at: [x, y + 0.2, face + s * 0.2], color: PAL.ironDark, jitter: 0 });
  b.box(0.22, 0.3, 0.22, { at: [x, y, face + s * 0.42], color: B.warm, glow: 0.8, jitter: 0 });
  b.box(0.3, 0.07, 0.3, { at: [x, y + 0.18, face + s * 0.42], color: PAL.ironDark, jitter: 0 });
}

/** Dressed corner stones up a building's two front corners, long and short in turn. */
function frontQuoins(b: ModelBuilder, w: number, d: number, h: number, color: number): void {
  for (const x of [-w / 2, w / 2]) {
    for (let y = 0.6, i = 0; y < h - 0.2; y += 0.6, i++) {
      const long = i % 2 === 0;
      b.box(long ? 0.54 : 0.32, 0.5, long ? 0.32 : 0.54, { at: [x, y, d / 2], color, jitter: 0.08 });
    }
  }
}

// ------------------------------------------------------------------ Cairnford's houses

/** Its walls' height to the eaves. */
function eavesOf(storeys: number): number {
  return storeys > 1 ? storeys * STOREY : 2.5;
}

/** Its roof's rise over a `d` deep house: slate's pitch, or thatch's steeper. */
function riseOf(d: number, thatch = false): number {
  return d * (thatch ? 0.56 : 0.42);
}

/** Its chimneys' tops (where their pots' smoke leaves), in its own frame. */
function stackTops(w: number, d: number, storeys: number, look: number, thatch = false): Vec3[] {
  const L = houseLook(look);
  const top = eavesOf(storeys) + riseOf(d, thatch) + 0.9;
  const sides = L.stacks === 0 ? [-1, 1] : [L.stacks === 1 ? -1 : 1];
  return sides.map((s): Vec3 => [s * (w / 2 - 0.45), top + 0.5, 0]);
}

const STONES = [B.grit, B.gritLight, B.gritWarm, B.grit, B.gritSoot] as const;
const SLATES = [B.slate, 0x555b63, 0x474c55] as const;

/**
 * A Cairnford house, `look` setting it apart from its neighbours: rough
 * gritstone under slate (or heather thatch), its plinth and eaves in darker
 * courses, dressed quoins up its front, a painted door, windows across its
 * front a storey at a time (some lit, a shop's wide one, window boxes), a
 * porch hood or a lamp, chimneys on its gables, and a lean-to at its back.
 * A mill's door is on its back, away from the water.
 */
function house(b: ModelBuilder, w: number, d: number, storeys: number, look: number, opts: { thatch?: boolean; doorBack?: boolean; dark?: boolean } = {}): void {
  const L = houseLook(look);
  const h = eavesOf(storeys);
  const thatch = !!opts.thatch;
  const rise = riseOf(d, thatch);
  const stone = STONES[L.stone];
  const trim = stone === B.gritLight ? B.gritDark : B.sill;
  const face = opts.doorBack ? -d / 2 : d / 2;
  const back = -face;
  const fs = Math.sign(face);
  walls(b, w, d, h, stone, [0, 0, 0], 0.1);
  b.box(w + 0.14, 0.42, d + 0.14, { at: [0, 0.05, 0], color: B.gritDark, jitter: 0.12 });
  frontQuoins(b, w, fs * d, h, trim);
  if (storeys > 1 && L.band) b.box(w + 0.08, 0.14, d + 0.08, { at: [0, STOREY + 0.05, 0], color: B.gritDark, jitter: 0.06 });
  b.box(w + 0.12, 0.2, d + 0.12, { at: [0, h - 0.1, 0], color: B.gritDark, jitter: 0.06 });
  if (thatch) roofX(b, w, d, h, rise, 0.5, 0.3, { ...THATCH, gable: stone });
  else roofX(b, w, d, h, rise, 0.3, 0.06, { roof: SLATES[look % 3], ridge: B.slateDark, gable: stone, thick: 0.14 });
  for (const [x, top] of stackTops(w, d, storeys, look, thatch)) stack(b, x, 0, h + rise * 0.3, top - 0.5, B.gritDark);

  // The door, and its hood or lamp.
  const doorX = L.doorAt * Math.max(0, w / 2 - 0.9);
  entrance(b, doorX, face, 1.0, 2.1, B.doors[L.door], trim);
  if (L.porch) {
    b.box(1.7, 0.1, 0.8, { at: [doorX, 2.62, face + fs * 0.42], rot: [fs * 0.25, 0, 0], color: B.slateDark });
    for (const sx of [-0.72, 0.72]) b.box(0.1, 0.34, 0.5, { at: [doorX + sx, 2.38, face + fs * 0.27], color: trim });
  }
  if (L.lamp) lantern(b, doorX + (doorX > 0 ? -0.95 : 0.95), 2.35, face);

  // The windows across its front, a storey at a time; on the ground floor a shop's wide one, or window boxes.
  const n = Math.max(1, Math.round((w - 1) / 2.3));
  const rand = mulberry32(look * 131 + 7);
  for (let st = 0; st < storeys; st++) {
    const y = st === 0 ? 1.45 : st * STOREY + 1.35;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (i + 0.5) * (w / n);
      if (st === 0 && Math.abs(x - doorX) < 1.25) continue;
      const lit = !opts.dark && hash01(look, st * 10 + i, 211) < 0.38;
      if (st === 0 && L.shop && i === (doorX > 0 ? 0 : n - 1)) {
        // A shop: a wide window with its fascia board in its colour over it.
        pane(b, [x, 1.4, face], [0, fs], Math.min(1.9, w / n - 0.6), 1.3, true, trim);
        b.box(Math.min(2.3, w / n - 0.2), 0.36, 0.08, { at: [x, 2.42, face + fs * 0.08], color: B.dyes[look % 4], jitter: 0.05 });
        continue;
      }
      pane(b, [x, y, face], [0, fs], st === 0 ? 0.82 : 0.78, st === 0 ? 1.05 : 0.95, lit, trim);
      if (st === 0 && L.flowers) {
        b.box(1.0, 0.2, 0.26, { at: [x, y - 0.7, face + fs * 0.2], color: PAL.woodDark });
        for (let k = 0; k < 3; k++) b.box(0.24, 0.18, 0.18, { at: [x - 0.3 + k * 0.3, y - 0.52, face + fs * 0.2], color: [0xb03a3a, 0x8a5aa0, 0xd8b840][(k + look) % 3], jitter: 0.15 });
      }
    }
  }
  // Its back: a small dark window a storey, and the lean-to.
  for (let st = 0; st < storeys; st++) {
    const x = -doorX * 0.6 + (rand() - 0.5) * 0.6;
    b.box(0.7, 0.8, 0.08, { at: [x, st * STOREY + 1.45, back - fs * 0.05], color: B.window, jitter: 0.04 });
    b.box(0.9, 0.09, 0.2, { at: [x, st * STOREY + 0.98, back - fs * 0.1], color: trim });
  }
  if (L.outshut !== 0 && !opts.doorBack) {
    const ox = L.outshut * (w / 4);
    const lw = w / 2 - 0.2;
    walls(b, lw, 2.0, 2.2, stone, [ox, 0, back - fs * 1.0]);
    const a = Math.atan2(0.8, 2.2);
    b.box(lw + 0.3, 0.12, 2.5, { at: [ox, 2.62, back - fs * 1.05], rot: [-fs * a, 0, 0], color: SLATES[(look + 1) % 3], jitter: 0.1 });
    b.box(0.8, 1.8, 0.08, { at: [ox + (L.outshut > 0 ? -lw / 4 : lw / 4), 0.9, back - fs * 2.04], color: B.doors[(L.door + 3) % 6] });
  }
}

/** Granny Mott's cottage: herbs hung drying under its eaves, a bench by its door. */
function cottageDressing(b: ModelBuilder, w: number, d: number): void {
  for (let i = 0; i < 6; i++) b.box(0.14, 0.42, 0.14, { at: [w / 2 - 0.5 - i * 0.4, 2.0, d / 2 + 0.3], color: [0x6a7a3a, 0x8a7a9a, 0x7a8a4a][i % 3], jitter: 0.15 });
  b.box(0.06, 0.06, 0.06, { at: [w / 2 - 1.5, 2.28, d / 2 + 0.3], color: PAL.woodDark });
  b.box(2.6, 0.06, 0.06, { at: [w / 2 - 1.5, 2.25, d / 2 + 0.3], color: PAL.woodDark });
  bench(b, 1.6, [-w / 4 - 0.6, 0, d / 2 + 0.75]);
}

const INN_RISE = 3.3;

/**
 * The Ford Inn: the biggest house on the square, two storeys and dormers in
 * its roof, a stone porch at its door with lamps either side, its long
 * ground-floor windows lit, its sign out on a bracket: a blue ford under a
 * white wave.
 */
function inn(b: ModelBuilder, w: number, d: number): void {
  const h = 2 * STOREY;
  walls(b, w, d, h, B.gritLight, [0, 0, 0], 0.08);
  b.box(w + 0.14, 0.42, d + 0.14, { at: [0, 0.05, 0], color: B.gritDark, jitter: 0.12 });
  frontQuoins(b, w, d, h, B.gritDark);
  b.box(w + 0.1, 0.14, d + 0.1, { at: [0, STOREY + 0.05, 0], color: B.gritDark });
  b.box(w + 0.14, 0.22, d + 0.14, { at: [0, h - 0.1, 0], color: B.gritDark });
  roofX(b, w, d, h, INN_RISE, 0.35, 0.12, { ...SLATE, gable: B.gritLight });
  for (const s of [-1, 1]) stack(b, s * (w / 2 - 0.45), 0, h + 1, h + INN_RISE + 1.0, B.gritDark);
  // Two dormers in the roof's front, one lit.
  for (const [x, lit] of [[-w / 4, true], [w / 4, false]] as const) {
    b.box(1.5, 1.5, 1.6, { at: [x, h + 0.55, d / 2 - 0.9], color: B.gritLight });
    roofZ(b, 1.5, 1.8, h + 1.3, 0.7, 0.15, 0.1, SLATE, [x, 0, d / 2 - 0.9]);
    pane(b, [x, h + 0.65, d / 2 - 0.1], [0, 1], 0.7, 0.8, lit, B.sill);
  }
  // The porch: a little stone house of its own round the door, under its own gable.
  const pz = d / 2 + 0.8;
  walls(b, 2.8, 1.6, 2.9, B.gritLight, [0, 0, pz]);
  roofZ(b, 2.8, 1.9, 2.9, 1.1, 0.2, 0.1, { ...SLATE, gable: B.gritLight }, [0, 0, pz + 0.1]);
  b.box(1.5, 2.3, 0.1, { at: [0, 1.15, pz + 0.82], color: 0x1c1712, jitter: 0 });
  b.box(1.9, 0.3, 0.14, { at: [0, 2.45, pz + 0.84], color: B.sill });
  entrance(b, 0, d / 2 + 0.02, 1.1, 2.1, B.doors[1], B.sill);
  for (const x of [-1.85, 1.85]) lantern(b, x, 2.4, d / 2);
  b.box(2.2, 0.22, 0.8, { at: [0, 0.0, pz + 1.2], color: B.gritDark });
  // Long windows on the ground floor, lit; five above.
  for (const x of [-w / 2 + 1.7, -2.9, 2.9, w / 2 - 1.7]) pane(b, [x, 1.45, d / 2], [0, 1], 1.4, 1.2, true, B.sill);
  for (let i = 0; i < 5; i++) pane(b, [-w / 2 + (i + 0.5) * (w / 5), STOREY + 1.35, d / 2], [0, 1], 0.85, 1.0, i === 1 || i === 4, B.sill);
  // Its sign on its bracket at the corner.
  const sx = w / 2 - 0.9;
  b.box(0.08, 0.08, 1.3, { at: [sx, 3.55, d / 2 + 0.65], color: PAL.ironDark, jitter: 0 });
  b.box(0.08, 0.06, 0.6, { at: [sx, 3.35, d / 2 + 0.35], rot: [0.7, 0, 0], color: PAL.ironDark, jitter: 0 });
  b.box(0.08, 0.9, 1.1, { at: [sx, 2.95, d / 2 + 0.85], color: PAL.woodDark });
  b.box(0.1, 0.7, 0.9, { at: [sx, 2.95, d / 2 + 0.85], color: B.dyes[3], jitter: 0 });
  b.box(0.12, 0.14, 0.8, { at: [sx, 2.98, d / 2 + 0.85], rot: [0.12, 0, 0], color: B.wool, jitter: 0 });
  // The kitchen's lean-to and the back windows.
  walls(b, w / 2, 2.4, 2.4, B.grit, [-w / 4, 0, -d / 2 - 1.2]);
  b.box(w / 2 + 0.3, 0.12, 2.8, { at: [-w / 4, 2.82, -d / 2 - 1.25], rot: [-Math.atan2(0.8, 2.4), 0, 0], color: B.slate, jitter: 0.1 });
  for (const x of [w / 4 - 1, w / 4 + 1.4]) for (const y of [1.45, STOREY + 1.35]) b.box(0.8, 0.9, 0.08, { at: [x, y, -d / 2 - 0.05], color: B.window, jitter: 0.04 });
  // A mounting block by its east gable.
  for (let i = 0; i < 3; i++) b.box(1.0, 0.3 * (i + 1), 0.45, { at: [w / 2 + 0.7, 0.15 * (i + 1), d / 2 - 1.6 + i * 0.45], color: B.gritDark, jitter: 0.1 });
}

/** The moot hall: open arches on the ground floor where the market shelters, the hall over them up an outside stair, its bell-cote and notice board. */
function mootHall(b: ModelBuilder, w: number, d: number): void {
  const t: PartOpts = { color: B.gritLight, jitter: 0.08 };
  const bays = 4;
  // The arcade's piers, front and back, and the shade under it.
  for (let i = 0; i <= bays; i++) {
    const x = -w / 2 + (i * w) / bays;
    for (const z of [-d / 2, d / 2]) b.box(0.8, 3.6, 0.8, { ...t, at: [x, 0.9, z] });
  }
  for (let i = 0; i < bays; i++) {
    const x = -w / 2 + ((i + 0.5) * w) / bays;
    // A flat arch head between each pair of piers.
    for (const z of [-d / 2, d / 2]) b.box(w / bays - 0.7, 0.5, 0.7, { at: [x, 2.95, z], color: B.gritLight, jitter: 0.08 });
  }
  b.box(w, 0.3, d, { at: [0, -0.1, 0], color: B.gritDark });
  b.box(w - 0.6, 2.9, 0.2, { at: [0, 1.45, -d / 2 + 0.8], color: 0x3a3630, jitter: 0.05 });
  b.box(0.6, 3.0, d, { ...t, at: [-w / 2, 1.5, 0] });
  b.box(0.6, 3.0, d, { ...t, at: [w / 2, 1.5, 0] });
  b.box(w, 0.4, d + 0.2, { at: [0, 3.3, 0], color: B.gritDark });
  walls(b, w + 0.2, d + 0.2, 2.6, B.grit, [0, 3.4, 0]);
  frontQuoins(b, w + 0.2, d + 0.2, 6.0, B.sill);
  for (let i = 0; i < bays; i++) {
    const x = -w / 2 + ((i + 0.5) * w) / bays;
    pane(b, [x, 4.8, d / 2 + 0.1], [0, 1], 0.9, 1.1, i % 2 === 1, B.sill);
    pane(b, [x, 4.8, -d / 2 - 0.1], [0, -1], 0.9, 1.1, false, B.sill);
  }
  b.box(w + 0.32, 0.2, d + 0.32, { at: [0, 6.0, 0], color: B.gritDark });
  roofX(b, w + 0.2, d + 0.2, 6.1, 3.0, 0.4, 0.2, SLATE);
  // The bell-cote on the ridge.
  b.box(0.9, 1.4, 0.9, { at: [0, 9.6, 0], color: B.gritLight }).box(0.5, 0.6, 1.0, { at: [0, 9.7, 0], color: 0x1a1816, jitter: 0 });
  b.box(0.36, 0.4, 0.36, { at: [0, 9.6, 0], color: 0x8a6a2a }).cone(0.8, 1.0, 4, { at: [0, 10.8, 0], rot: [0, PI / 4, 0], color: B.slateDark });
  // The stair up its south gable to the hall's door.
  for (let k = 0; k < 8; k++) b.box(1.2, 0.4 * (k + 1), 0.6, { at: [-w / 2 - 0.75, 0.2 * (k + 1) - 0.1, d / 2 - 0.5 - k * 0.6], color: B.gritDark, jitter: 0.1 });
  const [l0, l1] = [d / 2 - 5.0, -d / 2 + 0.2];
  b.box(1.2, 3.3, l0 - l1, { at: [-w / 2 - 0.75, 1.55, (l0 + l1) / 2], color: B.gritDark, jitter: 0.1 });
  b.box(0.1, 2.0, 1.0, { at: [-w / 2 - 0.12, 4.3, (l0 + l1) / 2], color: B.doors[2] });
  // A notice board on a pier, and a few sacks and crates sheltering in the arcade.
  b.box(1.4, 1.0, 0.08, { at: [0, 1.7, d / 2 + 0.45], color: PAL.wood });
  for (const [x, y] of [[-0.3, 1.9], [0.25, 1.75], [-0.1, 1.5]]) b.box(0.32, 0.4, 0.02, { at: [x, y, d / 2 + 0.5], color: B.wool, jitter: 0.05 });
  crate(b, [-w / 4, 0.05, 0], 0.7, 0.3);
  crate(b, [-w / 4 + 0.8, 0.05, -0.4], 0.6, 0.9);
  for (let i = 0; i < 3; i++) b.box(0.6, 0.7, 0.45, { at: [w / 4 + i * 0.5, 0.4, -0.6], rot: [0, i * 0.4, 0], color: 0xa89870, jitter: 0.1 });
}

/**
 * The chapel: a plain nave along its own Z under a slate roof the same way,
 * buttressed, its door in its front gable with a round window over it and
 * its bell-cote on the gable's top, narrow windows down its sides.
 */
function chapel(b: ModelBuilder, w: number, d: number): void {
  const h = 3.8;
  const rise = 3.2;
  walls(b, w, d, h, B.gritLight, [0, 0, 0], 0.08);
  b.box(w + 0.14, 0.42, d + 0.14, { at: [0, 0.05, 0], color: B.gritDark, jitter: 0.12 });
  for (const z of [-d / 2 + 2.6, 0, d / 2 - 2.6]) for (const s of [-1, 1]) b.taper(0.7, 0.9, 0.45, 0.5, h + 0.2, { at: [s * (w / 2 + 0.3), -0.4, z], color: B.gritDark });
  b.box(w + 0.12, 0.2, d + 0.12, { at: [0, h - 0.1, 0], color: B.gritDark });
  roofZ(b, w, d, h, rise, 0.35, 0.25, { ...SLATE, gable: B.gritLight });
  // The door and its arch, a round window over it.
  entrance(b, 0, d / 2, 1.3, 2.4, B.doors[0], B.sill);
  for (let k = 0; k <= 4; k++) {
    const a = PI * (k / 4);
    b.box(0.32, 0.26, 0.16, { at: [-Math.cos(a) * 0.75, 2.55 + Math.sin(a) * 0.55, d / 2 + 0.06], rot: [0, 0, a - PI / 2], color: B.sill });
  }
  b.cyl(0.62, 0.62, 0.1, 10, { at: [0, h + 1.0, d / 2 + 0.03], rot: [PI / 2, 0, 0], color: B.sill });
  b.cyl(0.46, 0.46, 0.1, 10, { at: [0, h + 1.0, d / 2 + 0.08], rot: [PI / 2, 0, 0], color: B.warm, glow: 0.25, jitter: 0 });
  // The bell-cote on the front gable's top.
  const apex = h + rise;
  b.box(1.2, 1.9, 0.75, { at: [0, apex + 0.6, d / 2 - 0.15], color: B.gritLight });
  b.box(0.62, 0.85, 0.8, { at: [0, apex + 0.95, d / 2 - 0.15], color: 0x1a1816, jitter: 0 });
  b.box(0.36, 0.42, 0.36, { at: [0, apex + 0.9, d / 2 - 0.15], color: 0x8a6a2a });
  b.cone(0.9, 0.8, 4, { at: [0, apex + 1.95, d / 2 - 0.15], rot: [0, PI / 4, 0], color: B.slateDark });
  b.box(0.08, 0.6, 0.08, { at: [0, apex + 2.6, d / 2 - 0.15], color: PAL.ironDark, jitter: 0 }).box(0.36, 0.08, 0.08, { at: [0, apex + 2.7, d / 2 - 0.15], color: PAL.ironDark, jitter: 0 });
  // Tall narrow windows down both sides, between the buttresses; three in the back gable.
  for (const z of [-d / 2 + 1.3, -1.3, 1.3, d / 2 - 1.3]) {
    for (const s of [-1, 1]) pane(b, [s * (w / 2), 2.1, z], [s, 0], 0.45, 1.5, z === 1.3 && s > 0, B.sill);
  }
  for (const x of [-0.9, 0, 0.9]) pane(b, [x, x === 0 ? 2.4 : 2.1, -d / 2], [0, -1], 0.4, x === 0 ? 1.9 : 1.5, false, B.sill);
}

const SMITHY_H = 3;

/** The smithy: open-fronted under slate, the forge's hearth glowing at its back under its hood and chimney, the bellows, the anvil, tools racked on the wall. */
function smithy(b: ModelBuilder, w: number, d: number): void {
  const h = SMITHY_H;
  b.box(w, h + 1.4, 0.5, { at: [0, (h - 1.4) / 2, -d / 2 + 0.25], color: B.grit });
  for (const x of [-w / 2 + 0.25, w / 2 - 0.25]) b.box(0.5, h + 1.4, d, { at: [x, (h - 1.4) / 2, 0], color: B.grit });
  for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) b.box(0.3, h, 0.3, { at: [x, h / 2, d / 2 - 0.2], color: B.timber });
  b.box(w, 0.3, 0.3, { at: [0, h - 0.15, d / 2 - 0.2], color: B.timber });
  b.box(w, 0.2, d, { at: [0, 0.0, 0], color: 0x3a3028, jitter: 0.1 });
  roofX(b, w, d, h, 2.0, 0.4, 0.15, SLATE);
  // The forge: a stone hearth, its coals, a hood over it, the chimney up through the roof.
  const fx = -w / 4;
  const fz = -d / 4;
  b.box(1.8, 0.9, 1.6, { at: [fx, 0.45, fz], color: B.gritDark }).box(1.1, 0.12, 0.9, { at: [fx, 0.94, fz], color: PAL.coal, glow: 0.9, jitter: 0.1 });
  b.taper(1.8, 1.4, 0.8, 0.7, 1.2, { at: [fx, 1.9, fz - 0.2], color: B.gritDark });
  stack(b, fx, -d / 2 + 0.6, 3.0, h + 3.1, B.gritDark);
  // The bellows beside it, the anvil on its block, the quench tub.
  b.taper(0.9, 1.2, 0.2, 1.2, 0.5, { at: [fx + 1.4, 0.7, fz], rot: [0, 0, PI / 2], color: PAL.leather });
  b.box(0.5, 0.6, 0.5, { at: [w / 6, 0.3, 0.6], color: PAL.woodDark }).box(0.8, 0.25, 0.34, { at: [w / 6, 0.72, 0.6], color: PAL.ironDark });
  b.cone(0.17, 0.3, 4, { at: [w / 6 + 0.5, 0.72, 0.6], rot: [0, 0, -PI / 2], color: PAL.ironDark });
  barrel(b, [w / 6 + 1.0, 0, -0.4], 0.7);
  // Tongs and hammers on a rail on the side wall, horseshoes over the front.
  b.box(0.06, 0.06, d - 1.6, { at: [w / 2 - 0.55, 1.9, 0], color: PAL.woodDark, jitter: 0 });
  for (let i = 0; i < 5; i++) b.box(0.05, 0.7, 0.06, { at: [w / 2 - 0.58, 1.55, -d / 2 + 1.2 + i * 0.6], rot: [0, 0, 0.1 * (i % 2)], color: PAL.ironDark, jitter: 0 });
  for (let i = 0; i < 4; i++) b.box(0.24, 0.24, 0.05, { at: [-0.6 + i * 0.4, h - 0.45, d / 2 - 0.03], color: PAL.iron, jitter: 0 });
  b.cyl(0.6, 0.6, 0.08, 10, { at: [w / 2 + 0.05, 0.62, d / 2 - 1.2], rot: [0.15, 0, PI / 2], color: PAL.woodDark });
}

/**
 * The mill on the beck: a two-storey stone mill, its front wall the quay's
 * along the water, its wheel turning in the beck on its axle, a hoist's
 * timber hood high on its gable, its door on its back to the lane.
 * `water` is the beck's level in its own frame.
 */
function mill(b: ModelBuilder, w: number, d: number, water: number): void {
  house(b, w, d, 2, 30, { doorBack: true, dark: true });
  // Its front wall carried down to the beck's bed, out to the quays' line.
  b.box(w + 0.4, 3.4, 1.4, { at: [0, -1.5, d / 2 + 0.4], color: B.gritDark, jitter: 0.12 });
  b.box(w + 0.5, 0.16, 1.5, { at: [0, 0.15, d / 2 + 0.45], color: B.sill });
  // The wheel, its rims of felloes, its spokes and paddles, dipping into the water.
  const r = 2.1;
  const at: Vec3 = [w / 2 - 2.0, water + r - 0.55, d / 2 + 1.65];
  b.cyl(0.16, 0.16, 1.9, 6, { at: [at[0], at[1], at[2] - 0.5], rot: [PI / 2, 0, 0], color: PAL.ironDark });
  for (const z of [at[2] - 0.38, at[2] + 0.38]) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * PI * 2;
      b.box((2 * PI * r) / 12 + 0.06, 0.16, 0.1, { at: [at[0] + Math.sin(a) * r, at[1] + Math.cos(a) * r, z], rot: [0, 0, -a], color: PAL.wood, jitter: 0.12 });
    }
    for (let k = 0; k < 4; k++) b.box(0.12, r * 2, 0.1, { at: [at[0], at[1], z], rot: [0, 0, (k / 4) * PI], color: PAL.woodDark });
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * PI * 2 + PI / 12;
    b.box(0.5, 0.06, 0.86, { at: [at[0] + Math.sin(a) * (r - 0.12), at[1] + Math.cos(a) * (r - 0.12), at[2]], rot: [0, 0, -a], color: PAL.wood, jitter: 0.1 });
  }
  // Its outer bearing on a post in the water.
  pile(b, at[0], at[2] + 0.75, water - 1.2, at[1] + 0.2, 0.16, PAL.woodDark);
  // The hoist's hood on the west gable, its beam and rope.
  b.box(1.4, 1.6, 1.2, { at: [-w / 2 - 0.55, STOREY + 1.6, 0], color: PAL.wood, jitter: 0.1 });
  roofX(b, 1.6, 1.4, STOREY + 2.4, 0.5, 0.1, 0.1, SLATE, [-w / 2 - 0.55, 0, 0]);
  b.box(0.06, 1.8, 0.06, { at: [-w / 2 - 1.0, STOREY + 0.1, 0], color: 0xb8a878, jitter: 0 });
  for (let i = 0; i < 3; i++) b.box(0.55, 0.7, 0.45, { at: [-w / 2 - 1.0 + i * 0.1, 0.35, -d / 2 - 0.8 - i * 0.55], rot: [0, i * 0.5, 0], color: 0xc8b890, jitter: 0.1 });
}

/** The tollhouse's look among the houses'. */
const TOLL_LOOK = 31;

/** The tollhouse: a small single-storey stone house with a bay window toward the road, its toll board by the door. */
function tollhouse(b: ModelBuilder, w: number, d: number): void {
  house(b, w, d, 1, TOLL_LOOK);
  b.box(1.8, 1.4, 0.9, { at: [w / 4, 1.3, d / 2 + 0.45], color: B.grit }).box(1.4, 0.8, 0.06, { at: [w / 4, 1.5, d / 2 + 0.92], color: B.warm, glow: 0.35, jitter: 0 });
  b.taper(2.0, 1.1, 2.0, 0.1, 0.5, { at: [w / 4, 2.0, d / 2 + 0.45], color: B.slate });
  b.box(0.9, 1.1, 0.06, { at: [-w / 4 - 1.0, 1.5, d / 2 + 0.05], color: PAL.woodDark }).box(0.75, 0.9, 0.04, { at: [-w / 4 - 1.0, 1.5, d / 2 + 0.09], color: B.wool, jitter: 0.05 });
}

// ------------------------------------------------------------------ the square and the streets

/** A market stall: a trestle under an awning striped in one of the moor's dyes, its goods on the board and crates beside it. */
function stall(b: ModelBuilder, w: number, d: number, look: number, rand: Rand): void {
  const dye = B.dyes[look % B.dyes.length];
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) b.box(0.08, z > 0 ? 2.0 : 2.4, 0.08, { at: [x, z > 0 ? 1.0 : 1.2, z], color: PAL.woodDark });
  b.box(w, 0.08, d * 0.6, { at: [0, 0.85, d * 0.15], color: PAL.wood });
  for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) b.box(0.08, 0.85, d * 0.5, { at: [x, 0.42, d * 0.15], color: PAL.woodDark });
  const a = Math.atan2(0.4, d);
  b.box(w + 0.3, 0.05, d + 0.4, { at: [0, 2.22, 0], rot: [a, 0, 0], color: B.wool });
  for (let i = 0; i < 3; i++) b.box(w / 6, 0.06, d + 0.42, { at: [-w / 2 + (w / 6) * (2 * i + 1.5), 2.23, 0], rot: [a, 0, 0], color: dye });
  b.box(w + 0.3, 0.3, 0.04, { at: [0, 1.9, d / 2 + 0.2], color: dye, jitter: 0.05 });
  // Its goods: greens and roots, fleeces, cheeses, crocks.
  const top = 0.89;
  for (let i = 0; i < 6; i++) {
    const x = -w / 2 + 0.4 + i * ((w - 0.8) / 5);
    const z = d * 0.15 + (i % 2 ? 0.2 : -0.2);
    if (look === 0) b.ball(0.2, { at: [x, top + 0.16, z], color: [0x5a7a34, 0x7a4a6a, 0xb88a3a][i % 3], jitter: 0.12 });
    else if (look === 1) b.box(0.45, 0.24, 0.4, { at: [x, top + 0.12, z], rot: [0, rand(), 0], color: i % 3 ? B.wool : 0x6a5a48, jitter: 0.12 });
    else if (look === 2) b.cyl(0.2, 0.2, 0.16, 8, { at: [x, top + 0.08, z], color: 0xd8b860, jitter: 0.06 });
    else b.cyl(0.13, 0.17, 0.32, 6, { at: [x, top + 0.16, z], color: i % 2 ? 0x8a5a3a : 0x6a6a5a, jitter: 0.08 });
  }
  crate(b, [w / 2 + 0.5, 0, -0.2], 0.55, rand());
  if (look % 2) crate(b, [w / 2 + 0.45, 0.55, -0.15], 0.45, rand());
  else b.box(0.5, 0.6, 0.4, { at: [-w / 2 - 0.45, 0.3, -0.2], color: 0xa89870, jitter: 0.1 });
}

/** The well on the square: a round stone head, two posts and a windlass under a little slate roof, a bucket on its rim. */
function well(b: ModelBuilder): void {
  b.cyl(0.95, 1.0, 0.85, 10, { at: [0, 0.4, 0], color: B.grit, jitter: 0.1 });
  b.cyl(1.02, 1.02, 0.14, 10, { at: [0, 0.86, 0], color: B.sill, jitter: 0.06 });
  b.cyl(0.72, 0.72, 0.06, 10, { at: [0, 0.9, 0], color: 0x161a1c, jitter: 0 });
  for (const s of [-1, 1]) b.box(0.16, 2.1, 0.16, { at: [s * 0.85, 1.6, 0], color: PAL.woodDark });
  b.cyl(0.12, 0.12, 1.6, 6, { at: [0, 2.0, 0], rot: [0, 0, PI / 2], color: PAL.wood });
  b.box(0.06, 0.4, 0.06, { at: [1.0, 1.85, 0], color: PAL.ironDark, jitter: 0 });
  b.box(0.04, 0.9, 0.04, { at: [0, 1.5, 0], color: 0xb8a878, jitter: 0 });
  for (const s of [-1, 1]) b.box(2.2, 0.08, 0.95, { at: [0, 2.85, s * 0.4], rot: [s * 0.65, 0, 0], color: B.slateDark, jitter: 0.08 });
  b.cyl(0.18, 0.15, 0.3, 6, { at: [0.6, 1.08, 0.55], color: PAL.wood });
}

/** A stone trough, full of water. */
function trough(b: ModelBuilder, w: number, d: number): void {
  b.box(w, 0.65, d, { at: [0, 0.22, 0], color: B.gritDark, jitter: 0.1 });
  b.box(w - 0.2, 0.04, d - 0.2, { at: [0, 0.53, 0], color: B.trough, jitter: 0 });
}

/** A plain bench: a plank on two stone feet (at `at`, or the middle). */
function bench(b: ModelBuilder, w: number, at: Vec3 = [0, 0, 0]): void {
  for (const s of [-1, 1]) b.box(0.3, 0.45, 0.4, { at: [at[0] + s * (w / 2 - 0.25), at[1] + 0.22, at[2]], color: B.gritDark });
  b.box(w, 0.09, 0.42, { at: [at[0], at[1] + 0.48, at[2]], color: PAL.wood });
}

/** Three barrels standing and one on its side; or two and a crate. */
function barrels(b: ModelBuilder, variant: number, rand: Rand): void {
  barrel(b, [0, 0, 0], 0.9);
  barrel(b, [0.68, 0, 0.18], 0.85);
  if (variant === 0) {
    barrel(b, [0.3, 0, -0.6], 0.9);
    b.cyl(0.3, 0.3, 0.85, 8, { at: [-0.8, 0.3, 0.3], rot: [PI / 2, 0, 0.4], color: PAL.wood, jitter: 0.08 });
  } else crate(b, [-0.75, 0, -0.1], 0.6, rand());
}

/** The postbox by the moot hall's door: a green-painted box on a post, its slot and a little roof. */
function postbox(b: ModelBuilder): void {
  b.box(0.14, 1.1, 0.14, { at: [0, 0.55, 0], color: PAL.woodDark });
  b.box(0.42, 0.5, 0.32, { at: [0, 1.3, 0], color: 0x2e4a34 }).box(0.24, 0.04, 0.02, { at: [0, 1.42, 0.17], color: 0x111111, jitter: 0 });
  b.box(0.52, 0.06, 0.42, { at: [0, 1.58, 0], rot: [0.15, 0, 0], color: B.slateDark });
}

/** A log pile, `w` long, `d` deep, `h` high, and a chopping block with its axe. */
function woodpile(b: ModelBuilder, w: number, d: number, h: number, rand: Rand): void {
  const rows = Math.max(2, Math.round(h / 0.3));
  for (let r = 0; r < rows; r++) {
    const n = Math.max(1, Math.round(d / 0.3) - (r > rows / 2 ? 1 : 0));
    for (let k = 0; k < n; k++) {
      b.cyl(0.14, 0.14, w * (0.9 + rand() * 0.1), 5, { at: [(rand() - 0.5) * 0.2, 0.14 + r * 0.27, -d / 2 + 0.15 + k * ((d - 0.3) / Math.max(1, n - 1))], rot: [0, 0, PI / 2], color: rand() < 0.5 ? PAL.wood : EARTH.bark, jitter: 0.1 });
    }
  }
  b.cyl(0.3, 0.32, 0.5, 7, { at: [w / 2 + 0.7, 0.25, 0.3], color: PAL.wood });
  b.box(0.05, 0.6, 0.05, { at: [w / 2 + 0.7, 0.75, 0.3], rot: [0.4, 0, 0.2], color: PAL.woodDark }).box(0.08, 0.14, 0.24, { at: [w / 2 + 0.75, 0.52, 0.42], rot: [0.4, 0, 0.2], color: PAL.iron });
}

/** A two-wheeled cart, its shafts down; a peat cart heaped with cut turves; or one left broken, its wheel off. */
function cart(b: ModelBuilder, variant: number, rand: Rand): void {
  const broken = variant === 2;
  within(b, 0, broken ? -0.15 : 0, 0, 0, () => {
    const tilt: Vec3 = broken ? [0.08, 0, 0.22] : [0, 0, 0];
    b.box(1.5, 0.12, 2.4, { at: [0, 0.8, 0], rot: tilt, color: PAL.wood });
    for (const s of [-1, 1]) {
      b.box(0.08, 0.4, 2.4, { at: [s * 0.75, 1.05 + (broken ? -s * 0.16 : 0), 0], rot: tilt, color: PAL.woodDark });
      if (!(broken && s > 0)) b.cyl(0.55, 0.55, 0.1, 10, { at: [s * 0.85, 0.55, 0], rot: [0, 0, PI / 2], color: PAL.woodDark });
      b.box(0.08, 0.08, 1.8, { at: [s * 0.45, 0.4, 1.9], rot: [0.3, 0, 0], color: PAL.wood });
    }
  });
  if (broken) {
    b.cyl(0.55, 0.55, 0.1, 10, { at: [1.6, 0.06, -0.6], rot: [0, 0.4, 0], color: PAL.woodDark });
    for (let i = 0; i < 3; i++) b.box(0.5, 0.25, 0.35, { at: [-0.4 + i * 0.4, 0.12, 1.6 + rand() * 0.4], rot: [0, rand(), 0], color: 0xa89870, jitter: 0.1 });
  } else if (variant === 1) {
    for (let i = 0; i < 10; i++) b.box(0.42, 0.2, 0.28, { at: [-0.45 + (i % 3) * 0.45, 0.98 + Math.floor(i / 6) * 0.2, -0.8 + ((i * 7) % 6) * 0.32], rot: [0, rand() * 0.4, 0], color: i % 2 ? B.peat : B.peatCut, jitter: 0.14 });
  } else {
    for (let i = 0; i < 3; i++) b.box(0.55, 0.45, 0.4, { at: [-0.3 + i * 0.3, 1.08, -0.5 + i * 0.45], rot: [0, rand(), 0], color: 0xa89870, jitter: 0.1 });
  }
}

/** A four-wheeled hay wagon, loaded. */
function wagon(b: ModelBuilder): void {
  b.box(1.8, 0.14, 3.8, { at: [0, 1.0, 0], color: PAL.wood });
  for (const s of [-1, 1]) {
    b.box(0.08, 0.5, 3.8, { at: [s * 0.9, 1.3, 0], color: PAL.woodDark });
    for (const z of [-1.3, 1.3]) b.cyl(z > 0 ? 0.5 : 0.62, z > 0 ? 0.5 : 0.62, 0.1, 10, { at: [s * 0.98, z > 0 ? 0.5 : 0.62, z], rot: [0, 0, PI / 2], color: PAL.woodDark });
  }
  b.box(0.1, 0.1, 2.2, { at: [0, 0.6, 2.8], rot: [0.2, 0, 0], color: PAL.wood });
  b.taper(1.9, 3.6, 1.3, 2.8, 1.1, { at: [0, 1.06, 0], color: B.hay, jitter: 0.12 });
  b.box(0.04, 0.04, 3.6, { at: [0, 2.18, 0], color: 0x8a7a5a, jitter: 0 });
}

/** The cart shed by the wagon yard: open-fronted under slate, its back and ends of stone, a cart and hay inside. */
function cartShed(b: ModelBuilder, w: number, d: number, rand: Rand): void {
  const h = 2.6;
  b.box(w, h + 1.4, 0.5, { at: [0, (h - 1.4) / 2, -d / 2 + 0.25], color: B.grit });
  for (const x of [-w / 2 + 0.25, w / 2 - 0.25]) b.box(0.5, h + 1.4, d, { at: [x, (h - 1.4) / 2, 0], color: B.grit });
  for (const x of [-w / 6, w / 6]) b.box(0.26, h, 0.26, { at: [x, h / 2, d / 2 - 0.2], color: B.timber });
  b.box(w, 0.26, 0.26, { at: [0, h - 0.13, d / 2 - 0.2], color: B.timber });
  roofX(b, w, d, h, 1.5, 0.35, 0.15, SLATE);
  within(b, -w / 4, 0, -0.2, 0.15, () => cart(b, 0, rand));
  b.taper(2.6, 1.8, 2.2, 1.4, 1.2, { at: [w / 4 + 0.4, 0, -0.4], color: B.hay, jitter: 0.12 });
}

/** A hay rick, thatched against the rain and roped down. */
function hayrick(b: ModelBuilder, w: number, h: number): void {
  const r = w / 2;
  b.cyl(r * 0.92, r * 0.85, h * 0.55, 8, { at: [0, h * 0.27, 0], color: B.hay, jitter: 0.12 });
  b.cone(r * 1.02, h * 0.5, 8, { at: [0, h * 0.55 + h * 0.25, 0], color: B.hayDark, jitter: 0.1 });
  for (const a of [0, PI / 2]) b.box(0.05, 0.05, r * 2.1, { at: [0, h * 0.6, 0], rot: [0, a, 0], color: 0x6a5a3a, jitter: 0 });
}

/** Cairnford's east gate: two stone pillars either side of the Kingsroad, a lamp on each, lengths of wall out from them and the gates standing open. */
function townGate(b: ModelBuilder, span: number, h: number): void {
  for (const s of [-1, 1]) {
    const x = s * (span / 2 + 0.5);
    b.box(1.5, 0.5, 1.5, { at: [x, 0.0, 0], color: B.gritDark });
    b.box(1.3, h + 1, 1.3, { at: [x, (h - 1) / 2, 0], color: B.gritLight, jitter: 0.1 });
    b.box(1.5, 0.22, 1.5, { at: [x, h + 0.1, 0], color: B.sill });
    b.cone(0.8, 0.8, 4, { at: [x, h + 0.6, 0], rot: [0, PI / 4, 0], color: B.gritDark });
    b.ball(0.2, { at: [x, h + 1.1, 0], color: B.sill });
    within(b, x - s * 0.66, 0, 0, s * -PI / 2, () => lantern(b, 0, 2.5, 0));
    // The wall on out from it.
    for (let k = 0; k < 3; k++) b.taper(0.7, 1.05, 0.5, 1.05, 1.9 + 0.4, { at: [x + s * (1.15 + k), -0.4, 0], color: k % 2 ? B.grit : B.gritDark, jitter: 0.12 });
    // A gate leaf swung back against it, outward.
    for (let i = 0; i < 6; i++) b.box(0.05, 1.9, 0.05, { at: [x - s * 0.72, 1.05, 0.75 + i * 0.4], color: PAL.ironDark, jitter: 0 });
    for (const y of [0.3, 1.8]) b.box(0.05, 0.08, 2.2, { at: [x - s * 0.72, y, 1.75], color: PAL.ironDark, jitter: 0 });
  }
}

/** A stone mooring post on the quay. */
function bollard(b: ModelBuilder): void {
  b.cyl(0.18, 0.22, 0.8, 7, { at: [0, 0.3, 0], color: B.gritDark }).cyl(0.24, 0.24, 0.1, 7, { at: [0, 0.75, 0], color: B.gritDark });
  b.box(0.04, 0.04, 1.4, { at: [0, 0.55, 0.6], rot: [0.4, 0, 0], color: 0xb8a878, jitter: 0 });
}

/** The chapel's graves in rows: headstones facing the morning, some leaning, a cross or two, a table tomb, the turf mounded in front of them. */
function graves(b: ModelBuilder, w: number, d: number, rand: Rand): void {
  const cols = Math.max(2, Math.floor(w / 1.3));
  const rows = Math.max(2, Math.floor(d / 2.4));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rand() < 0.18) continue;
      const x = -w / 2 + (c + 0.5) * (w / cols) + (rand() - 0.5) * 0.2;
      const z = -d / 2 + (r + 0.35) * (d / rows);
      const lean: Vec3 = [(rand() - 0.5) * 0.25, (rand() - 0.5) * 0.15, (rand() - 0.5) * 0.2];
      const shade = rand() < 0.5 ? B.grit : B.gritSoot;
      if ((r * cols + c) % 7 === 3) {
        b.box(0.12, 1.1, 0.12, { at: [x, 0.45, z], rot: lean, color: shade }).box(0.6, 0.12, 0.12, { at: [x, 0.75, z], rot: lean, color: shade });
      } else if ((r * cols + c) % 9 === 5) {
        b.box(0.9, 0.55, 1.8, { at: [x, 0.2, z + 0.9], color: B.gritLight, jitter: 0.08 }).box(1.0, 0.1, 1.9, { at: [x, 0.52, z + 0.9], color: B.sill });
        continue;
      } else b.box(0.55, 0.65 + rand() * 0.35, 0.12, { at: [x, 0.3, z], rot: lean, color: shade, jitter: 0.1 });
      b.box(0.6, 0.12, 1.4, { at: [x, 0.02, z + 0.85], color: 0x6a6a3e, jitter: 0.12 });
    }
  }
}

// ------------------------------------------------------------------ the beck: its bridge, its quays

/**
 * Cairnford's bridge, along its own Z from one bank to the other, its origin
 * at the water's level in the middle: three arches over the channel on two
 * piers with cutwaters, its deck rising over them between parapets, as its
 * deck in the plan rises. `extra`: its deck's ends' heights over the water,
 * and where the channel runs from and to along it.
 */
function bridge(b: ModelBuilder, width: number, len: number, rise: number, extra: readonly number[]): void {
  const [e0, e1, c0, c1] = extra;
  const deckAt = (z: number) => {
    const t = Math.max(0, Math.min(1, (z + len / 2) / len));
    return e0 + (e1 - e0) * t + rise * Math.sin(PI * t);
  };
  const bed = -2.6;
  // The arches: three spans and two piers across the channel, a little wider than it.
  const pier = 1.0;
  const from = c0 - 0.4;
  const span = (c1 + 0.4 - from - 2 * pier) / 3;
  const arches = [0, 1, 2].map((k) => {
    const a0 = from + k * (span + pier);
    return { a0, a1: a0 + span, mid: a0 + span / 2 };
  });
  const spring = 0.25;
  const archRise = Math.min(span * 0.48, 1.2);
  const intrados = (z: number) => {
    for (const a of arches) if (z > a.a0 && z < a.a1) return spring + archRise * Math.sqrt(Math.max(0, 1 - ((z - a.mid) / (span / 2)) ** 2));
    return null;
  };
  // Its body in slices along it, down to the bed but under each arch.
  const dz = 0.5;
  for (let z0 = -len / 2; z0 < len / 2 - 1e-6; z0 += dz) {
    const z = z0 + dz / 2;
    const top = Math.min(deckAt(z0), deckAt(z0 + dz)) - 0.22;
    const under = intrados(z);
    const bottom = under ?? (Math.abs(z) > len / 2 - 2.5 ? -3.2 : bed);
    if (top - bottom < 0.05) continue;
    b.box(width, top - bottom, dz + 0.02, { at: [0, (top + bottom) / 2, z], color: B.grit, jitter: 0.12 });
  }
  // A ring of voussoirs round each arch on both faces.
  for (const a of arches) {
    for (let k = 0; k <= 8; k++) {
      const t = PI * (k / 8);
      const z = a.mid - Math.cos(t) * (span / 2 + 0.12);
      const y = spring + Math.sin(t) * (archRise + 0.12);
      const ang = Math.atan2(Math.cos(t) * archRise, Math.sin(t) * (span / 2));
      for (const s of [-1, 1]) b.box(0.12, 0.46, 0.34, { at: [s * (width / 2 + 0.05), y, z], rot: [-ang, 0, 0], color: B.gritDark, jitter: 0.12 });
    }
  }
  // The piers' cutwaters, pointed into the stream either side.
  for (let k = 0; k < 2; k++) {
    const z = arches[k].a1 + pier / 2;
    for (const s of [-1, 1]) {
      b.box(0.8, spring + 0.9 - bed, 0.8, { at: [s * (width / 2 + 0.15), (spring + 0.9 + bed) / 2, z], rot: [0, PI / 4, 0], color: B.gritDark, jitter: 0.1 });
      b.cone(0.62, 0.6, 4, { at: [s * (width / 2 + 0.15), spring + 1.2, z], color: B.grit });
    }
  }
  // The deck's setts and the parapets with their coping, a metre or so at a time up and over.
  const n = Math.round(len / 1.4);
  const seg = len / n;
  for (let i = 0; i < n; i++) {
    const z0 = -len / 2 + i * seg;
    const [y0, y1] = [deckAt(z0), deckAt(z0 + seg)];
    const a = Math.atan2(y1 - y0, seg);
    const y = (y0 + y1) / 2;
    b.box(width, 0.3, seg + 0.04, { at: [0, y - 0.15, z0 + seg / 2], rot: [-a, 0, 0], color: B.gritDark, jitter: 0.1 });
    for (const s of [-1, 1]) {
      b.box(0.4, 0.95, seg + 0.04, { at: [s * (width / 2 + 0.2), y + 0.3, z0 + seg / 2], rot: [-a, 0, 0], color: B.grit, jitter: 0.1 });
      b.box(0.5, 0.12, seg + 0.06, { at: [s * (width / 2 + 0.2), y + 0.83, z0 + seg / 2], rot: [-a, 0, 0], color: B.sill, jitter: 0.06 });
    }
  }
  // Squat piers at the parapets' ends.
  for (const z of [-len / 2 + 0.3, len / 2 - 0.3]) {
    for (const s of [-1, 1]) b.box(0.62, 1.4, 0.62, { at: [s * (width / 2 + 0.22), deckAt(z) + 0.5, z], color: B.gritLight }).box(0.72, 0.12, 0.72, { at: [s * (width / 2 + 0.22), deckAt(z) + 1.24, z], color: B.sill });
  }
}

/**
 * A stretch of quay `w` long along its own X, its face to the water on its
 * +Z, its top level with the street behind: a stone wall down to the beck's
 * bed, its courses and the dark line where the water laps, a coping and a
 * low parapet along its edge.
 */
function quay(b: ModelBuilder, w: number, rand: Rand): void {
  b.box(w + 0.02, 3.3, 1.7, { at: [0, -1.6, -0.45], color: rand() < 0.5 ? B.grit : B.gritDark, jitter: 0.14 });
  for (const y of [-0.55, -1.75]) b.box(w + 0.02, 0.12, 0.06, { at: [0, y, 0.42], color: B.gritDark, jitter: 0.1 });
  b.box(w + 0.02, 0.3, 0.06, { at: [0, -1.25, 0.43], color: 0x4a5236, jitter: 0.1 });
  b.box(w + 0.02, 0.16, 0.75, { at: [0, 0.06, 0.1], color: B.sill, jitter: 0.08 });
  b.box(w + 0.02, 0.5, 0.42, { at: [0, 0.38, 0.2], color: B.grit, jitter: 0.12 });
  b.box(w + 0.04, 0.08, 0.5, { at: [0, 0.66, 0.2], color: B.sill, jitter: 0.06 });
}

// ------------------------------------------------------------------ the moor's crofts and folds

/** A long low croft of rubble under heather thatch roped down with stones, a peat stack by its door; an abandoned one with its door hanging open and its thatch fallen in. */
function croft(b: ModelBuilder, w: number, d: number, abandoned: boolean, rand: Rand): void {
  const h = 2.1;
  const rise = 2.0;
  walls(b, w, d, h, rand() < 0.5 ? B.gritDark : B.grit, [0, 0, 0], 0.14);
  roofX(b, w, d, h, rise, 0.4, 0.3, abandoned ? { ...THATCH, roof: 0x4a3a2c } : THATCH);
  if (abandoned) {
    // A hole where the thatch has fallen in, the rafters showing.
    b.box(w * 0.3, 0.4, d * 0.34, { at: [w * 0.15, h + 1.2, d * 0.15], rot: [-0.7, 0, 0], color: 0x1e1814 });
    for (let i = 0; i < 3; i++) b.box(0.1, 0.1, d * 0.5, { at: [w * 0.06 + i * 0.6, h + 1.3, d * 0.12], rot: [-0.75, 0, 0], color: B.timber });
  } else {
    // Ropes over the thatch, a stone hung on each end to hold it down in the wind.
    const theta = Math.atan2(rise, d / 2);
    for (const x of [-w / 3, 0, w / 3]) {
      for (const s of [-1, 1]) {
        b.box(0.05, 0.05, (d / 2 + 0.4) / Math.cos(theta), { at: [x, h + rise / 2 + 0.38, (s * (d / 2 + 0.4)) / 2], rot: [s * theta, 0, 0], color: 0x3a2e22, jitter: 0 });
        b.box(0.3, 0.32, 0.22, { at: [x, h - 0.2, s * (d / 2 + 0.48)], color: B.gritDark, jitter: 0.15 });
      }
    }
  }
  door(b, -w / 4, d / 2, 0.9, 1.75, B.door, B.gritDark, abandoned ? 1.1 : 0);
  windowOn(b, [w / 5, 1.2, d / 2], [0, 1], 0.5, abandoned ? B.window : B.warm, B.gritDark);
  b.box(0.5, 0.5, 0.06, { at: [w / 5, 1.2, d / 2 + 0.09], color: abandoned ? B.window : B.warm, glow: abandoned ? 0 : 0.35, jitter: 0 });
  b.box(0.7, 2.5, 0.6, { at: [w / 2 - 0.6, h + 1.4, 0], color: B.gritDark, jitter: 0.12 });
  b.box(0.82, 0.12, 0.72, { at: [w / 2 - 0.6, h + 2.7, 0], color: B.gritDark });
  if (!abandoned) {
    peatStack(b, 1.8, 1.0, 1.0, [-w / 2 - 1.4, 0, d / 2 - 0.4]);
    // A water butt by the gable, and a bench by the door.
    b.cyl(0.35, 0.32, 0.8, 7, { at: [w / 2 + 0.5, 0.4, d / 2 - 0.6], color: PAL.woodDark });
    bench(b, 1.3, [-w / 4 + 1.4, 0, d / 2 + 0.55]);
  }
}

/** A burnt longhouse: its walls broken down unevenly, one gable still standing with its window hole, charred roof timbers fallen across its floor and its stones spilled round it. */
function ruin(b: ModelBuilder, w: number, d: number, rand: Rand): void {
  const t = 0.6;
  const ragged = (len: number, at: readonly [number, number], alongX: boolean, high: number) => {
    const n = Math.round(len / 1.0);
    for (let i = 0; i < n; i++) {
      const h = 0.5 + rand() * high;
      const u = -len / 2 + (i + 0.5) * (len / n);
      b.box(alongX ? len / n + 0.05 : t, h + 1, alongX ? t : len / n + 0.05, { at: [at[0] + (alongX ? u : 0), (h - 1) / 2, at[1] + (alongX ? 0 : u)], color: rand() < 0.2 ? B.charred : rand() < 0.5 ? B.grit : B.gritLight, jitter: 0.15 });
    }
  };
  ragged(w, [0, -d / 2], true, 1.6);
  ragged(d, [w / 2, 0], false, 1.2);
  ragged(w / 2, [w / 4, d / 2], true, 0.9);
  // The west gable stands to its peak, soot over its window hole.
  b.box(t, 3.2, d, { at: [-w / 2, 1.0, 0], color: B.grit, jitter: 0.12 });
  b.taper(t, d, t, 0.2, 1.8, { at: [-w / 2, 2.6, 0], color: B.grit });
  b.box(0.7, 0.8, 0.7, { at: [-w / 2, 2.4, 0], color: 0x141110, jitter: 0 });
  b.box(0.72, 1.0, 0.1, { at: [-w / 2 + 0.31, 3.0, 0], color: B.charred, jitter: 0.1 });
  for (let i = 0; i < 6; i++) b.box(0.18, 0.18, d * (0.6 + rand() * 0.5), { at: [-w / 2 + 1 + rand() * (w - 2), 0.2 + rand() * 0.7, (rand() - 0.5) * 1.2], rot: [0.3 * (rand() - 0.5), rand() * 0.6, 0.5 * (rand() - 0.5)], color: B.charred });
  b.box(w - 1, 0.04, d - 1, { at: [0, 0.03, 0], color: 0x3a3028 });
  for (let i = 0; i < 9; i++) {
    const a = rand() * PI * 2;
    b.box(0.4 + rand() * 0.3, 0.25, 0.3 + rand() * 0.2, { at: [Math.cos(a) * (w / 2 + 0.6 + rand()), 0.05, Math.sin(a) * (d / 2 + 0.6 + rand())], rot: [0, rand() * 3, 0], color: rand() < 0.5 ? B.grit : B.gritDark, jitter: 0.15 });
  }
}

/** A round sheepfold of dry stone, its gate gap on the front; an empty one with a gap fallen in its wall. */
function fold(b: ModelBuilder, r: number, broken: boolean, rand: Rand): void {
  const n = Math.max(10, Math.round((r * PI * 2) / 1.2));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    if (Math.abs(a - PI * 2) < 0.35 || a < 0.35) continue; // the gate, at the front
    if (broken && Math.abs(a - PI * 0.8) < 0.3) {
      b.box(0.5, 0.3, 0.4, { at: [Math.sin(a) * (r + 0.6), 0.05, Math.cos(a) * (r + 0.6)], rot: [0, a, 0.2], color: B.gritDark, jitter: 0.15 });
      continue;
    }
    const h = 1.0 + rand() * 0.25;
    const at = (k: number): Vec3 => [Math.sin(a) * r, k, Math.cos(a) * r];
    b.taper(0.75, (r * PI * 2) / n + 0.05, 0.5, (r * PI * 2) / n + 0.05, h + 0.5, { at: at(-0.5), rot: [0, a + PI / 2, 0], color: rand() < 0.5 ? B.grit : B.gritDark, jitter: 0.16 });
    b.box(0.34, 0.24, (r * PI * 2) / n - 0.1, { at: at(h + 0.08), rot: [0.1 * (rand() - 0.5), a + PI / 2, 0.15 * (rand() - 0.5)], color: B.gritDark, jitter: 0.2 });
  }
  if (!broken) for (const s of [-1, 1]) b.box(0.15, 1.1, 0.15, { at: [s * 0.6, 0.55, r], color: PAL.woodDark });
}

// ------------------------------------------------------------------ Fellgate Hall and the Kingsroad

/** Fellgate Hall: three storeys of dressed stone, a porch with columns, a stone parapet, too big and too clean for the moor. */
function hall(b: ModelBuilder, w: number, d: number): void {
  const h = 8.4;
  walls(b, w, d, h, B.dressed, [0, 0, 0], 0.03);
  b.box(w + 0.2, 0.6, d + 0.2, { at: [0, 0.1, 0], color: B.dressedDark, jitter: 0.02 });
  for (const y of [2.8, 5.6]) b.box(w + 0.16, 0.18, d + 0.16, { at: [0, y, 0], color: B.dressedDark, jitter: 0.02 });
  b.box(w + 0.3, 0.5, d + 0.3, { at: [0, h + 0.1, 0], color: B.dressedDark, jitter: 0.02 });
  roofX(b, w - 1, d - 1, h + 0.35, 2.6, 0.1, 0.1, HALL_ROOF);
  for (const x of [-w / 2 + 1.5, w / 2 - 1.5]) stack(b, x, 0, h + 1, h + 4.2, B.dressedDark);
  for (let s = 0; s < 3; s++) {
    for (let i = 0; i < 5; i++) {
      const x = -w / 2 + ((i + 0.5) * w) / 5;
      if (s === 0 && i === 2) continue;
      pane(b, [x, 1.5 + s * 2.8, d / 2], [0, 1], 1.0, 1.5 - s * 0.2, s === 0 && i % 2 === 1, B.dressedDark);
      pane(b, [x, 1.5 + s * 2.8, -d / 2], [0, -1], 1.0, 1.5 - s * 0.2, false, B.dressedDark);
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
  // Urns on the parapet's corners.
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) b.cyl(0.25, 0.18, 0.6, 6, { at: [x, h + 0.65, z], color: B.dressedDark });
}

/** The hall's stable block across its forecourt: dressed stone, four stable doors with their top halves open, a hayloft door, a cupola on its ridge. */
function stable(b: ModelBuilder, w: number, d: number): void {
  const h = 3.0;
  walls(b, w, d, h, B.dressed, [0, 0, 0], 0.04);
  b.box(w + 0.16, 0.2, d + 0.16, { at: [0, h - 0.1, 0], color: B.dressedDark, jitter: 0.02 });
  roofX(b, w, d, h, 2.2, 0.3, 0.15, HALL_ROOF);
  for (let i = 0; i < 4; i++) {
    const x = -w / 2 + (i + 0.5) * (w / 4);
    b.box(1.3, 2.3, 0.1, { at: [x, 1.15, d / 2 + 0.03], color: B.dressedDark });
    b.box(1.1, 1.05, 0.1, { at: [x, 0.55, d / 2 + 0.08], color: 0x3e4e3a });
    b.box(1.1, 1.0, 0.06, { at: [x, 1.65, d / 2 + 0.06], color: 0x16130f, jitter: 0 });
  }
  b.box(1.2, 1.1, 1.0, { at: [0, h + 0.5, d / 2 - 0.4], color: B.dressed }).box(1.0, 0.9, 0.06, { at: [0, h + 0.5, d / 2 + 0.12], color: 0x3e4e3a });
  roofZ(b, 1.2, 1.2, h + 1.05, 0.5, 0.1, 0.1, HALL_ROOF, [0, 0, d / 2 - 0.4]);
  b.box(0.9, 0.9, 0.9, { at: [0, h + 2.6, 0], color: B.dressed }).cone(0.75, 0.8, 4, { at: [0, h + 3.45, 0], rot: [0, PI / 4, 0], color: B.slateDark });
  b.box(0.04, 0.6, 0.04, { at: [0, h + 4.1, 0], color: PAL.ironDark, jitter: 0 }).box(0.5, 0.1, 0.04, { at: [0.1, h + 4.25, 0], color: PAL.ironDark, jitter: 0 });
}

/** A clipped box hedge in the hall's knot garden. */
function hedge(b: ModelBuilder, w: number, d: number, h: number): void {
  b.box(w, h, d, { at: [0, h / 2 - 0.05, 0], color: B.hedge, jitter: 0.18 });
  b.box(w - 0.2, 0.16, d - 0.2, { at: [0, h + 0.02, 0], color: B.hedgeLight, jitter: 0.15 });
}

/** The sundial in the knot garden: a dressed stone baluster, its bronze plate and gnomon. */
function sundial(b: ModelBuilder): void {
  b.box(0.7, 0.2, 0.7, { at: [0, 0.05, 0], color: B.dressedDark });
  b.taper(0.34, 0.34, 0.24, 0.24, 0.9, { at: [0, 0.15, 0], color: B.dressed });
  b.box(0.5, 0.08, 0.5, { at: [0, 1.08, 0], color: B.dressedDark }).box(0.4, 0.03, 0.4, { at: [0, 1.13, 0], color: 0x8a6a3a });
  b.taper(0.02, 0.3, 0.02, 0.02, 0.2, { at: [0, 1.14, 0], color: 0x6a4a2a });
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
  b.box(0.8, 0.3, 0.8, { at: [0, 0.1, 0], color: B.dressedDark });
}

/** The toll gate, open: two posts either side of the road and its painted bar raised. */
function tollgate(b: ModelBuilder, w: number): void {
  for (const s of [-1, 1]) b.box(0.3, 1.6, 0.3, { at: [(s * w) / 2, 0.8, 0], color: PAL.woodDark });
  const x = -w / 2 + 0.3;
  b.box(0.2, w + 0.2, 0.2, { at: [x, 1.15 + w / 2, 0], color: B.wool }).box(0.22, w * 0.2, 0.22, { at: [x, 1.15 + w * 0.3, 0], color: B.crimson });
  b.box(0.22, w * 0.2, 0.22, { at: [x, 1.15 + w * 0.7, 0], color: B.crimson });
}

/** A field gate between two posts: five bars and a brace, shut. */
function fieldGate(b: ModelBuilder, w: number): void {
  for (const s of [-1, 1]) b.box(0.2, 1.5, 0.2, { at: [(s * w) / 2, 0.6, 0], color: PAL.woodDark });
  for (let i = 0; i < 5; i++) b.box(w - 0.2, 0.08, 0.06, { at: [0, 0.25 + i * 0.22, 0], color: PAL.wood });
  b.bar([-w / 2 + 0.15, 0.25, 0], [w / 2 - 0.15, 1.13, 0], 0.08, 0.06, { color: PAL.wood });
}

/** A weathered painted map on a board, two legs, a little roof; its face left plain. */
function mapBoard(b: ModelBuilder): void {
  for (const s of [-1, 1]) b.box(0.14, 2.0, 0.14, { at: [s * 0.75, 1.0, 0], color: PAL.woodDark });
  b.box(1.5, 1.0, 0.08, { at: [0, 1.45, 0.05], rot: [-0.12, 0, 0], color: PAL.wood }).box(1.3, 0.8, 0.02, { at: [0, 1.45, 0.11], rot: [-0.12, 0, 0], color: 0xc8b88a, jitter: 0.04 });
  b.box(1.8, 0.08, 0.5, { at: [0, 2.05, 0.05], rot: [0.25, 0, 0], color: B.slateDark });
}

/** A signpost with a board for each way the road goes; at the Rockfall Gap a plank nailed across the first. */
function waySign(b: ModelBuilder, ways: readonly number[], closed: boolean): void {
  signpost(b, ways);
  b.box(0.22, 0.12, 0.22, { at: [0, 2.44, 0], color: EARTH.barkDark });
  b.box(0.5, 0.3, 0.5, { at: [0, 0.05, 0], color: B.gritDark, jitter: 0.15 });
  if (closed && ways.length > 0) {
    const a = ways[0];
    b.box(0.1, 0.12, 1.0, { at: [Math.sin(a) * 0.48, 2.2, Math.cos(a) * 0.48], rot: [0.5, a, 0], color: PAL.woodDark });
  }
}

/** A waymark stone by the road: a squared post of gritstone, a cross cut in its face, leaning a little. */
function waymark(b: ModelBuilder, h: number, rand: Rand): void {
  const tilt: Vec3 = [(rand() - 0.5) * 0.12, 0, (rand() - 0.5) * 0.12];
  b.taper(0.36, 0.28, 0.28, 0.22, h + 0.3, { at: [0, -0.3, 0], rot: tilt, color: B.grit, jitter: 0.1 });
  b.box(0.06, 0.26, 0.03, { at: [0, h * 0.72, 0.13], rot: tilt, color: B.gritSoot, jitter: 0 }).box(0.2, 0.06, 0.03, { at: [0, h * 0.76, 0.13], rot: tilt, color: B.gritSoot, jitter: 0 });
  b.box(0.3, 0.06, 0.24, { at: [0, h - 0.02, 0], rot: tilt, color: 0x8a8a5a, jitter: 0.2 });
}

// ------------------------------------------------------------------ the barrows and Hollowhill

/** A grassy barrow; a broken one has a dark cut into its side where the diggers went in. */
function barrow(b: ModelBuilder, r: number, h: number, broken: boolean, rand: Rand): void {
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + rand();
    b.ball(r * (0.75 + rand() * 0.15), { at: [Math.cos(a) * r * 0.25, -r * 0.7 + h, Math.sin(a) * r * 0.25], color: rand() < 0.5 ? 0x6e6c3e : 0x7a7444, jitter: 0.1 }, 1);
  }
  // Kerb stones round its foot, set deep.
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * PI * 2;
    b.box(0.6, 0.95, 0.4, { at: [Math.sin(a) * r * 0.95, -0.1, Math.cos(a) * r * 0.95], rot: [0, a, 0.08 * (rand() - 0.5)], color: rand() < 0.5 ? B.gritDark : B.grit, jitter: 0.15 });
  }
  if (broken) {
    b.box(1.4, 1.4, 2.6, { at: [0, 0.6, r * 0.7], rot: [0.25, 0, 0], color: 0x1a1612, jitter: 0 });
    b.box(1.8, 0.3, 0.3, { at: [0, 1.4, r * 0.55], color: B.deep });
    // A dropped pick by the cut.
    b.box(0.06, 0.06, 1.1, { at: [1.5, 0.1, r + 0.6], rot: [0, 0.6, 0], color: PAL.wood }).box(0.6, 0.08, 0.08, { at: [1.82, 0.12, r + 1.04], rot: [0, 0.6, 0], color: PAL.iron });
  }
}

/**
 * Hollowhill's door at the end of its passage: a frame of black Deepking
 * stone with its faint inlaid line, set in a face of great dressed blocks
 * that runs on into the mound either side and up under its turf; the stone
 * door standing ajar, the dark beyond, the diggers' rope and pick.
 */
function hollowDoor(b: ModelBuilder, w: number, h: number): void {
  const line: PartOpts = { color: B.deepLine, glow: 0.35, jitter: 0 };
  // The face it's set in.
  for (let row = 0; row < 4; row++) {
    for (const s of [-1, 1]) {
      const bw = 1.6 + (row % 2) * 0.4;
      b.box(bw, 1.2, 1.3, { at: [s * (w / 2 + 0.45 + bw / 2), -0.4 + row * 1.2 + 0.6, -0.1], color: row % 2 ? B.gritSoot : B.deep, jitter: 0.08 });
    }
  }
  b.box(w + 5.6, 1.6, 1.3, { at: [0, h + 1.5, -0.15], color: B.gritSoot, jitter: 0.08 });
  for (const s of [-1, 1]) {
    b.box(0.9, h + 0.6, 1.3, { at: [(s * w) / 2, (h + 0.6) / 2 - 0.3, 0], color: B.deep, jitter: 0.05 });
    b.box(0.06, h - 0.2, 0.04, { ...line, at: [(s * w) / 2 - s * 0.12, h / 2, 0.67] });
  }
  b.box(w + 1.8, 0.9, 1.45, { at: [0, h + 0.3, 0], color: B.deep, jitter: 0.05 });
  b.box(w + 1.2, 0.05, 0.04, { ...line, at: [0, h + 0.2, 0.74] });
  // The dark beyond, and the door slab swung in.
  b.box(w - 0.9, h, 0.2, { at: [0, h / 2, -0.4], color: 0x0c0b0a, jitter: 0 });
  b.box(w * 0.55, h - 0.1, 0.35, { at: [w / 4, h / 2, -0.5], rot: [0, -0.9, 0], color: B.deep, jitter: 0.05 });
  // The diggers' rope and a pick left at the threshold.
  b.box(0.06, 0.06, 1.2, { at: [-0.5, 0.06, 1.2], rot: [0, 0.4, 0], color: PAL.wood }).box(0.6, 0.08, 0.08, { at: [-0.25, 0.08, 1.7], rot: [0, 0.4, 0], color: PAL.iron });
  b.cyl(0.3, 0.3, 0.12, 8, { at: [0.6, 0.06, 1.0], color: 0x8a7a5a });
}

/**
 * The passage cut into Hollowhill from its foot to its door, along its own
 * +Z from the door: dry stone walls either side, `w` apart, their tops
 * (`tops`, a metre apart, over the door's floor) following the mound's face.
 */
function dromos(b: ModelBuilder, w: number, len: number, tops: readonly number[], rand: Rand): void {
  for (let k = 0; k < tops.length - 1 && k < len; k++) {
    const z0 = k;
    const z1 = Math.min(len, k + 1);
    const top = (tops[k] + tops[k + 1]) / 2;
    for (const s of [-1, 1]) {
      b.taper(0.95, z1 - z0 + 0.02, 0.7, z1 - z0 + 0.02, top + 2, { at: [s * (w / 2 + 0.42), -2, (z0 + z1) / 2], color: rand() < 0.5 ? B.grit : B.gritDark, jitter: 0.16 });
      b.box(0.5, 0.2, z1 - z0, { at: [s * (w / 2 + 0.42), top + 0.08, (z0 + z1) / 2], rot: [0, 0, 0.1 * (rand() - 0.5)], color: B.gritDark, jitter: 0.18 });
    }
  }
}

/** A heap of spoil from the diggers. */
function spoil(b: ModelBuilder, r: number, rand: Rand): void {
  for (let i = 0; i < 4; i++) b.ball(r * (0.4 + rand() * 0.3), { at: [(rand() - 0.5) * r, -0.1, (rand() - 0.5) * r], color: rand() < 0.5 ? 0x5a4632 : 0x6a543a, jitter: 0.15 });
}

/** A gritstone tor on a rise: piles of weathered slabs one on another, lichen on their tops. */
function tor(b: ModelBuilder, r: number, variant: number, rand: Rand): void {
  const piles = 2 + (variant % 3);
  for (let p = 0; p < piles; p++) {
    const a = (p / piles) * PI * 2 + variant;
    const px = p === 0 ? 0 : Math.cos(a) * r * 0.55;
    const pz = p === 0 ? 0 : Math.sin(a) * r * 0.55;
    const layers = (p === 0 ? 4 : 2) + Math.floor(rand() * 2);
    let y = -0.4;
    let sw = r * (p === 0 ? 0.9 : 0.6);
    for (let l = 0; l < layers; l++) {
      const th = 0.55 + rand() * 0.45;
      const sd = sw * (0.7 + rand() * 0.3);
      b.box(sw, th, sd, { at: [px + (rand() - 0.5) * 0.4, y + th / 2, pz + (rand() - 0.5) * 0.4], rot: [(rand() - 0.5) * 0.1, rand() * 3, (rand() - 0.5) * 0.12], color: [0x7a7468, 0x6c675c, 0x857e70][(l + p) % 3], jitter: 0.14 });
      y += th - 0.04;
      sw *= 0.78 + rand() * 0.12;
    }
    b.box(sw * 0.8, 0.06, sw * 0.6, { at: [px, y + 0.02, pz], rot: [0, rand() * 3, 0], color: 0x8a8a5a, jitter: 0.2 });
  }
}

// ------------------------------------------------------------------ the Kerchiefs' places, Raven Scar

/** A ridge tent of patched canvas, its flaps open at the front. */
function tent(b: ModelBuilder, w: number, d: number): void {
  const h = 2.0;
  const theta = Math.atan2(h, w / 2);
  const len = Math.hypot(h, w / 2);
  for (const s of [-1, 1]) b.box(0.06, len, d, { at: [(s * w) / 4, h / 2, 0], rot: [0, 0, s * (PI / 2 - theta)], color: s < 0 ? 0xb8a880 : 0xa89870, jitter: 0.1 });
  b.box(0.1, 0.1, d + 0.4, { at: [0, h, 0], color: PAL.woodDark });
  for (const z of [-d / 2, d / 2]) b.box(0.1, h, 0.1, { at: [0, h / 2, z], color: PAL.woodDark });
  b.box(w * 0.7, h * 0.6, 0.04, { at: [0, h * 0.3, -d / 2], color: 0xa89870 });
  b.box(0.7, 0.5, 0.06, { at: [0.5, 0.6, d / 2 - 0.1], rot: [0, 0.3, 0], color: 0x8a7a5a });
  b.box(0.5, 0.06, 0.4, { at: [0.6, 0.03, d / 2 + 0.6], color: B.kerchief });
}

/** A camp fire: a ring of stones, its logs and glowing embers, a pot hung over it on a tripod. */
function campfire(b: ModelBuilder, rand: Rand): void {
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * PI * 2;
    b.box(0.3, 0.22, 0.24, { at: [Math.sin(a) * 0.65, 0.08, Math.cos(a) * 0.65], rot: [0, a, 0], color: rand() < 0.5 ? B.grit : B.gritDark, jitter: 0.15 });
  }
  for (let i = 0; i < 4; i++) b.cyl(0.07, 0.07, 0.9, 5, { at: [0, 0.12, 0], rot: [0.3, (i * PI) / 4, PI / 2], color: B.charred });
  b.cyl(0.4, 0.45, 0.08, 7, { at: [0, 0.06, 0], color: PAL.coal, glow: 0.85, jitter: 0.1 });
  b.cone(0.2, 0.45, 5, { at: [0.05, 0.3, 0], color: PAL.flame, glow: 1, jitter: 0 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2;
    b.bar([Math.sin(a) * 0.75, 0, Math.cos(a) * 0.75], [0, 1.45, 0], 0.05, 0.05, { color: PAL.woodDark });
  }
  b.cyl(0.2, 0.16, 0.26, 7, { at: [0, 0.85, 0], color: PAL.ironDark });
  b.box(0.02, 0.5, 0.02, { at: [0, 1.2, 0], color: PAL.ironDark, jitter: 0 });
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

/** The old quarry's crane on the scar's lip: a timber mast braced back, its jib out over the pit, a block hanging from its rope. */
function crane(b: ModelBuilder, h: number): void {
  b.box(0.3, h, 0.3, { at: [0, h / 2 - 0.3, 0], color: PAL.woodDark });
  for (const s of [-1, 1]) b.bar([s * 1.6, -0.2, -2.2], [0, h * 0.8, 0], 0.16, 0.16, { color: PAL.woodDark });
  b.bar([0, 1.0, 0.1], [0, h * 0.85, 5.2], 0.22, 0.22, { color: PAL.wood });
  b.box(0.04, h * 0.85 + 2.5, 0.04, { at: [0, (h * 0.85 - 2.5) / 2, 5.2], color: 0xb8a878, jitter: 0 });
  b.box(1.1, 0.7, 0.8, { at: [0, -2.8, 5.2], color: B.cut, jitter: 0.08 });
  b.cyl(0.25, 0.25, 1.0, 6, { at: [0, 0.7, -0.6], rot: [0, 0, PI / 2], color: PAL.wood });
  for (const s of [-1, 1]) b.box(0.1, 0.9, 0.1, { at: [s * 0.55, 0.45, -0.6], color: PAL.woodDark });
}

/** Cut blocks of gritstone stacked where the quarrymen left them. */
function blocks(b: ModelBuilder, w: number, d: number, variant: number, rand: Rand): void {
  const n = 5 + variant;
  for (let i = 0; i < n; i++) {
    const tier = i < 3 ? 0 : i < 5 ? 1 : 2;
    const bw = 1.0 + rand() * 0.5;
    b.box(bw, 0.65, 0.75, { at: [-w / 2 + 0.6 + (i % 3) * (w / 3) + tier * 0.3, 0.3 + tier * 0.64, (rand() - 0.5) * (d - 0.8)], rot: [0, (rand() - 0.5) * 0.3, 0], color: rand() < 0.6 ? B.cut : B.grit, jitter: 0.08 });
  }
}

/** A fresh grave behind the scar: a mound, a shepherd's crook stuck in it and a red kerchief tied round the crook. */
function grave(b: ModelBuilder): void {
  b.box(0.9, 0.35, 2.0, { at: [0, 0.1, 0], color: 0x5a4632, jitter: 0.15 });
  b.box(0.06, 1.5, 0.06, { at: [0, 0.8, -1.0], color: PAL.wood }).box(0.06, 0.06, 0.3, { at: [0, 1.52, -0.88], color: PAL.wood });
  b.box(0.1, 0.18, 0.12, { at: [0, 1.2, -1.0], color: B.kerchief });
}

// ------------------------------------------------------------------ the peat, the bog, Beck's Foot

/** A stack of cut peat blocks drying, `w` by `d`, `h` high (at `at`, or the middle). */
function peatStack(b: ModelBuilder, w: number, d: number, h: number, at: Vec3 = [0, 0, 0]): void {
  const layers = Math.round(h / 0.22);
  for (let i = 0; i < layers; i++) {
    const f = 1 - i / (layers + 1);
    b.box(w * f, 0.22, d * f, { at: [at[0], at[1] + 0.11 + i * 0.22, at[2]], rot: [0, i * 0.2, 0], color: i % 2 ? B.peat : B.peatCut, jitter: 0.16 });
  }
}

/** A cut peat bank: a dark face where the cutters have dug, a few blocks lying cut beside it. */
function peatBank(b: ModelBuilder, w: number, d: number, rand: Rand): void {
  b.box(w, 1.0, d, { at: [0, -0.2, -d / 2], color: B.peat, jitter: 0.12 });
  for (let i = 0; i < 6; i++) b.box(0.45, 0.2, 0.3, { at: [-w / 2 + 0.6 + rand() * (w - 1.2), 0.08, 0.6 + rand() * 0.8], rot: [0, rand(), 0], color: B.peatCut, jitter: 0.12 });
  // A spade left standing in the bank.
  b.box(0.05, 1.2, 0.05, { at: [w / 3, 0.6, 0.2], rot: [0.2, 0, 0], color: PAL.wood }).box(0.24, 0.3, 0.03, { at: [w / 3, 0.05, 0.1], rot: [0.2, 0, 0], color: PAL.iron });
}

/** A rack of rails on two trestles, peat turves laid along it to dry. */
function rack(b: ModelBuilder, w: number, rand: Rand): void {
  for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) {
    for (const s of [-1, 1]) b.bar([x, 0, s * 0.45], [x, 1.1, 0], 0.07, 0.07, { color: PAL.woodDark });
  }
  for (const z of [-0.25, 0.25]) b.box(w, 0.06, 0.06, { at: [0, 0.92 + Math.abs(z) * -0.4, z], color: PAL.wood });
  for (let i = 0; i < 8; i++) b.box(0.3, 0.14, 0.42, { at: [-w / 2 + 0.4 + i * ((w - 0.8) / 7), 0.95, (rand() - 0.5) * 0.2], rot: [0, rand() * 0.3, 0.2], color: i % 2 ? B.peat : B.peatCut, jitter: 0.14 });
}

/** The eel-trapper's hut: a timber hut on short piles by the water, eel traps hung on its wall. */
function hut(b: ModelBuilder, w: number, d: number): void {
  for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) for (const z of [-d / 2 + 0.2, d / 2 - 0.2]) pile(b, x, z, -1, 0.6);
  b.box(w, 0.15, d, { at: [0, 0.6, 0], color: PAL.wood });
  b.box(w - 0.2, 2.0, d - 0.2, { at: [0, 1.65, 0], color: 0x6a5236, jitter: 0.12 });
  roofX(b, w - 0.2, d - 0.2, 2.65, 1.3, 0.3, 0.2, { roof: 0x8a7a48, ridge: 0x6a5a34, gable: 0x6a5236, thick: 0.3 });
  door(b, 0, d / 2 - 0.1, 0.8, 1.7, PAL.woodDark, PAL.wood);
  for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) b.cyl(0.25, 0.15, 0.9, 6, { at: [x, 1.5, d / 2 + 0.05], rot: [PI / 2, 0, 0], color: 0x8a7a50 });
  for (let i = 0; i < 2; i++) b.box(0.8, 0.1, 0.6, { at: [0, 0.68 + i * 0.12, d / 2 + 0.5], rot: [0, i * 0.3, 0], color: PAL.wood });
}

/** A short jetty of planks on piles, out from the bank along its own Z. */
function jetty(b: ModelBuilder, w: number, len: number): void {
  for (let z = -len / 2 + 0.3; z <= len / 2; z += 1.6) for (const x of [-w / 2, w / 2]) pile(b, x, z, -1.4, 0.55);
  const n = Math.round(len / 0.4);
  for (let i = 0; i < n; i++) b.box(w + 0.1, 0.08, len / n - 0.04, { at: [0, 0.5, -len / 2 + (i + 0.5) * (len / n)], color: i % 4 ? PAL.wood : PAL.woodDark, jitter: 0.14 });
}

/** Eel traps: three wicker baskets lying in the shallows on their stakes. */
function eelTraps(b: ModelBuilder, rand: Rand): void {
  for (let i = 0; i < 3; i++) {
    const x = -1 + i * 1.0;
    const z = (rand() - 0.5) * 0.8;
    b.cyl(0.18, 0.32, 1.2, 6, { at: [x, -0.1, z], rot: [PI / 2, rand() * 0.6, 0], color: i % 2 ? 0x8a7a50 : 0x7a6a42, jitter: 0.1 });
    pile(b, x + 0.4, z + 0.5, -1.4, 0.7, 0.05, PAL.woodDark);
  }
}

/** Granny Mott's herb garden: low beds edged with stone, a few rows of herbs. */
function garden(b: ModelBuilder, w: number, d: number, rand: Rand): void {
  for (let i = 0; i < 3; i++) {
    const z = -d / 2 + (i + 0.5) * (d / 3);
    b.box(w, 0.25, d / 3 - 0.6, { at: [0, 0.05, z], color: 0x4e3a28 });
    for (let k = 0; k < 6; k++) b.ball(0.25 + rand() * 0.12, { at: [-w / 2 + 0.6 + k * ((w - 1.2) / 5), 0.35, z], color: [0x4f7a34, 0x6a8a3a, 0x8a7a9a][i], jitter: 0.12 });
  }
  for (const z of [-d / 2, d / 2]) b.box(w + 0.3, 0.6, 0.3, { at: [0, 0.2, z], color: B.gritDark });
  for (const x of [-w / 2, w / 2]) b.box(0.3, 0.6, d, { at: [x, 0.2, 0], color: B.gritDark });
}

/** The Kerchiefs' hide in the drained pool: a tarp over poles, sacks of grave goods under it. */
function hide(b: ModelBuilder, w: number, d: number): void {
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) b.box(0.08, 1.5, 0.08, { at: [x, 0.75, z], color: PAL.woodDark });
  b.box(w + 0.4, 0.04, d + 0.4, { at: [0, 1.5, 0], rot: [0.15, 0, 0.05], color: 0x5a5a44 });
  for (let i = 0; i < 3; i++) b.ball(0.35, { at: [-0.8 + i * 0.7, 0.25, -0.3], color: 0x8a7a5a }, 1);
  b.box(0.4, 0.3, 0.3, { at: [0.9, 0.15, 0.6], color: 0x6a8a6a });
}

/** A few crates and a barrel. */
function crates(b: ModelBuilder, rand: Rand): void {
  crate(b, [0, 0, 0], 0.7, rand());
  crate(b, [0.8, 0, 0.2], 0.6, rand());
  crate(b, [0.3, 0.7, 0.1], 0.5, rand());
}

// ------------------------------------------------------------------ the Deepkings' stones, the town's cross

/** One of the Long Stones: tall, black Deepking stone, a faint inlaid line up its face, leaning a little. */
function longStone(b: ModelBuilder, h: number, rand: Rand): void {
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
