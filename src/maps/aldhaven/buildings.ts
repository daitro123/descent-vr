import type { BufferGeometry } from 'three';
import { ModelBuilder, type PartOpts, type Vec3 } from '../../models/kit';
import { mulberry32 } from '../forest/noise';
import { AWNINGS, CITY_BUILD as C, DISTRICT_DOORS, HERALDRY as H, type District } from './palette';
import { ALDHAVEN, deckHeight, type Piece } from './plan';

// Aldhaven's buildings, landmarks and props, each in its own frame: origin on
// the ground at its footprint's middle (the lowest corner's height), front
// facing +Z, width along X. The two layers of stone tell the city's story:
// pale limestone, cream plaster and blue-grey slate above, and the Deepkings'
// black basalt in the plinths, the wall footings and the quays below. One
// small kit of house parts (plinth, stone floor, plaster floor, roof,
// chimney, sign) builds every house, its district carried by its colours;
// only the landmarks are their own.

const PI = Math.PI;

type Rand = () => number;

/** A box by its foot: `y` is its bottom, not its middle. */
function slab(b: ModelBuilder, w: number, h: number, d: number, x: number, y: number, z: number, color: number, o: Partial<PartOpts> = {}): void {
  b.box(w, h, d, { jitter: 0.06, ...o, at: [x, y + h / 2, z], color });
}

/**
 * A gable roof over a w×d box whose walls top out at `top`: its ridge along
 * X (or along Z with `alongZ`), overhanging `over`, with gable ends in
 * `gable` and a ridge capping.
 */
function roof(b: ModelBuilder, w: number, d: number, top: number, rise: number, over: number, color: number, gable: number, at: Vec3 = [0, 0, 0], alongZ = false, thick = 0.18): void {
  const [cx, , cz] = at;
  const span = alongZ ? w : d;
  const length = alongZ ? d : w;
  if (alongZ) b.taper(w, d, 0.04, d, rise, { at: [cx, top, cz], color: gable });
  else b.taper(w, d, w, 0.04, rise, { at: [cx, top, cz], color: gable });
  const half = span / 2 + over;
  const theta = Math.atan2(rise, span / 2);
  const len = half / Math.cos(theta);
  const drop = over * Math.tan(theta);
  const y = (top - drop + top + rise) / 2 + thick / 2;
  for (const side of [-1, 1]) {
    if (alongZ) b.box(len + 0.12, thick, length + 2 * over, { at: [cx + (side * half) / 2, y, cz], rot: [0, 0, -side * theta], color, jitter: 0.1 });
    else b.box(length + 2 * over, thick, len + 0.12, { at: [cx, y, cz + (side * half) / 2], rot: [side * theta, 0, 0], color, jitter: 0.1 });
  }
  const ridge = alongZ ? [0.3, 0.16, length + 2 * over] : [length + 2 * over, 0.16, 0.3];
  b.box(ridge[0], ridge[1], ridge[2], { at: [cx, top + rise + thick * 0.6, cz], color: C.slateDark });
}

/** A square pyramid roof (a tower's), point up. */
function pyramid(b: ModelBuilder, size: number, h: number, x: number, y: number, z: number, color: number): void {
  b.cone(size * 0.71, h, 4, { at: [x, y + h / 2, z], rot: [0, PI / 4, 0], color, jitter: 0.08 });
}

/** A window on the front (`face` 1) or back (-1) of a w×d box: a dark or lit pane in a stone surround. */
function window(b: ModelBuilder, x: number, y: number, d: number, face: 1 | -1, lit: boolean, w = 0.8, h = 1.1): void {
  const z = face * (d / 2 + 0.03);
  slab(b, w + 0.2, 0.12, 0.1, x, y - 0.12, z, C.limestoneShade);
  slab(b, w, h, 0.07, x, y, z, lit ? C.warmWindow : C.window, lit ? { glow: 0.55, jitter: 0 } : { jitter: 0.04 });
}

/** A window on a side wall (`side` -1 west, 1 east) of a box w wide. */
function sideWindow(b: ModelBuilder, z: number, y: number, w: number, side: 1 | -1, lit: boolean): void {
  slab(b, 0.07, 1.1, 0.8, side * (w / 2 + 0.03), y, z, lit ? C.warmWindow : C.window, lit ? { glow: 0.55, jitter: 0 } : { jitter: 0.04 });
}

/** A door on the front of a box d deep: its leaf, a lintel, a step. */
function door(b: ModelBuilder, x: number, y: number, d: number, color: number, w = 1.2, h = 2.2, face: 1 | -1 = 1): void {
  const z = face * (d / 2 + 0.04);
  slab(b, w, h, 0.08, x, y, z, color);
  slab(b, w + 0.4, 0.22, 0.16, x, y + h, z, C.limestoneDark);
  slab(b, w + 0.5, 0.18, 0.5, x, y - 0.1, face * (d / 2 + 0.25), C.limestoneDark);
}

/** A chimney from inside the roof up past its ridge. */
function chimney(b: ModelBuilder, x: number, z: number, from: number, to: number, color: number = C.limestoneShade): void {
  slab(b, 0.8, to - from, 0.8, x, from, z, color);
  slab(b, 0.95, 0.2, 0.95, x, to, z, C.basaltLight);
}

/** A painted sign on a wrought bracket, out from the front wall at `x`. */
function sign(b: ModelBuilder, x: number, y: number, d: number, color: number, glow = 0): void {
  b.box(0.06, 0.06, 1.0, { at: [x, y + 0.9, d / 2 + 0.5], color: C.iron, jitter: 0 });
  slab(b, 0.08, 0.7, 0.75, x, y, d / 2 + 0.75, color, { glow });
}

/** Crenellations along a run `len` long on the top at `y`, at z = `z`. */
function merlons(b: ModelBuilder, len: number, y: number, z: number, color: number, every = 2.4, alongZ = false): void {
  const n = Math.max(1, Math.floor(len / every));
  for (let k = 0; k < n; k++) {
    const u = -len / 2 + (k + 0.5) * (len / n);
    if (alongZ) slab(b, 0.6, 1.0, 1.2, z, y, u, color);
    else slab(b, 1.2, 1.0, 0.6, u, y, z, color);
  }
}

/** A ring of merlons round a round tower's top. */
function ringMerlons(b: ModelBuilder, r: number, y: number, n: number, color: number): void {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * PI * 2;
    b.box(1.0, 1.0, 0.6, { at: [Math.sin(a) * r, y + 0.5, Math.cos(a) * r], rot: [0, a, 0], color, jitter: 0.06 });
  }
}

/** A flag on a pole: the crown's blue with a gold band, or a great house's colours. */
function flag(b: ModelBuilder, x: number, y: number, z: number, h: number, colors: readonly [number, number]): void {
  b.cyl(0.07, 0.08, h, 5, { at: [x, y + h / 2, z], color: C.timber });
  slab(b, 1.6, 0.9, 0.05, x + 0.85, y + h - 1.0, z, colors[0]);
  slab(b, 1.6, 0.2, 0.06, x + 0.85, y + h - 0.65, z, colors[1]);
}

const CROWN: readonly [number, number] = [H.royalBlue, H.gold];
const HOUSE_COLOURS: readonly (readonly [number, number])[] = [CROWN, [H.corvane, H.corvaneKey], [H.harrowgate, H.harrowgateTower], [H.ashby, H.ashbyShip]];

// ------------------------------------------------------------------ houses

/** A district's plaster, stone and plinth. */
function looks(district: District, rand: Rand): { stone: number; plaster: number; plinth: number; doors: readonly number[] } {
  const plasters = district === 'harbour' ? [C.plaster, C.plasterSea, C.plasterWarm] : district === 'oldTown' ? [C.plasterWarm, C.plaster, C.plasterRose] : [C.plaster, C.plasterWarm, C.plasterRose, C.plaster];
  const basalt = district === 'oldTown' || district === 'harbour';
  return {
    stone: district === 'oldTown' ? C.basaltLight : rand() < 0.5 ? C.limestone : C.limestoneShade,
    plaster: plasters[Math.floor(rand() * plasters.length)],
    plinth: basalt ? C.basalt : C.limestoneDark,
    doors: DISTRICT_DOORS[district],
  };
}

/**
 * A town house: a plinth (basalt in Old Town and the harbour, where the
 * Deepkings built first), a stone ground floor, jettied plaster floors over
 * it framed in dark timber, a steep slate roof and a chimney; a door, lit and
 * dark windows, and sometimes a shop's sign or awning.
 */
function house(b: ModelBuilder, w: number, d: number, storeys: number, district: District, variant: number, rand: Rand): void {
  const L = looks(district, rand);
  const plinth = 0.5;
  const ground = 3.0;
  const upper = 2.7;
  slab(b, w + 0.2, 4 + plinth, d + 0.2, 0, -4, 0, L.plinth);
  slab(b, w, ground, d, 0, plinth, 0, L.stone);
  let y = plinth + ground;
  for (let s = 1; s < storeys; s++) {
    const jetty = 0.25;
    slab(b, w + 0.1, upper, d + 2 * jetty, 0, y, 0, L.plaster);
    slab(b, w + 0.16, 0.2, d + 2 * jetty + 0.06, 0, y, 0, C.timber);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) slab(b, 0.22, upper, 0.22, sx * (w / 2), y, sz * (d / 2 + jetty), C.timber);
    for (const sz of [-1, 1]) {
      const bays = Math.max(2, Math.round(w / 2.4));
      for (let i = 1; i < bays; i++) slab(b, 0.14, upper, 0.08, -w / 2 + (i * w) / bays, y, sz * (d / 2 + jetty + 0.03), C.timber);
    }
    const n = Math.max(1, Math.floor(w / 2.4));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + ((i + 0.5) * w) / n;
      window(b, x, y + 0.8, d + 2 * jetty, 1, rand() < 0.22);
      window(b, x, y + 0.8, d + 2 * jetty, -1, rand() < 0.15);
    }
    if (d > 6 && rand() < 0.6) sideWindow(b, 0, y + 0.8, w + 0.1, rand() < 0.5 ? 1 : -1, rand() < 0.2);
    y += upper;
  }
  const rise = Math.min(5.5, d * 0.62);
  roof(b, w, d + (storeys > 1 ? 0.5 : 0), y, rise, 0.4, rand() < 0.2 ? C.slateLight : C.slate, storeys > 1 ? L.plaster : L.stone);
  chimney(b, (variant % 2 ? -1 : 1) * (w / 2 - 0.6), (rand() - 0.5) * d * 0.3, y + rise * 0.4, y + rise + 1.0, L.stone === C.basaltLight ? C.basaltLight : C.limestoneShade);
  // The ground floor's front: a door, windows either side, a sign or an awning.
  const doorX = ((variant % 3) - 1) * (w / 4);
  door(b, doorX, plinth, d, L.doors[variant % L.doors.length]);
  const n = Math.max(1, Math.floor(w / 2.4));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + ((i + 0.5) * w) / n;
    if (Math.abs(x - doorX) < 1.3) continue;
    window(b, x, plinth + 1.0, d, 1, rand() < 0.3, 0.9, 1.2);
  }
  const shop = district === 'market' || district === 'guild' || district === 'oldTown' || district === 'harbour';
  if (shop && rand() < 0.45) sign(b, doorX + (doorX > 0 ? -1.2 : 1.2), plinth + 2.2, d, AWNINGS[Math.floor(rand() * AWNINGS.length)]);
  else if (district === 'market' && rand() < 0.5) {
    const colour = AWNINGS[Math.floor(rand() * AWNINGS.length)];
    b.box(w - 0.6, 0.08, 1.4, { at: [0, plinth + 2.65, d / 2 + 0.65], rot: [0.35, 0, 0], color: colour, jitter: 0.04 });
  }
  if (rand() < 0.25) for (let i = 0; i < 2; i++) slab(b, 0.9, 0.25, 0.3, (i ? 1 : -1) * (w / 4), plinth + ground + 0.55, d / 2 + 0.45, C.plank);
}

/** A house as a stand-in: its body and its roof. */
function farHouse(b: ModelBuilder, w: number, d: number, storeys: number, district: District, rand: Rand): void {
  const L = looks(district, rand);
  const top = 3.5 + 2.7 * (storeys - 1);
  slab(b, w + 0.2, top + 4, d + 0.4, 0, -4, 0, storeys > 1 ? L.plaster : L.stone);
  b.taper(w + 0.8, d + 1, w + 0.8, 0.04, Math.min(5.5, d * 0.62), { at: [0, top, 0], color: C.slate });
}

/** A warehouse: a stone ground floor, a timber upper floor, loading doors one above another, a hoist beam. */
function warehouse(b: ModelBuilder, w: number, d: number, storeys: number, variant: number, rand: Rand): void {
  const h0 = 3.6;
  const h1 = 3.0;
  slab(b, w + 0.2, 4.6, d + 0.2, 0, -4, 0, C.basalt);
  slab(b, w, h0, d, 0, 0.6, 0, variant === 1 ? C.limestoneShade : C.limestone);
  const top = 0.6 + h0 + h1 * (storeys - 1);
  if (storeys > 1) {
    slab(b, w + 0.1, h1 * (storeys - 1), d + 0.1, 0, 0.6 + h0, 0, variant === 2 ? C.plasterSea : C.plank);
    for (let i = 0; i <= 4; i++) slab(b, 0.18, h1 * (storeys - 1), d + 0.16, -w / 2 + (i * w) / 4, 0.6 + h0, 0, C.timber);
  }
  roof(b, w, d, top, Math.min(4.2, d * 0.45), 0.45, C.slateDark, variant === 2 ? C.plasterSea : C.plank);
  // Loading doors one over another, and the hoist beam over them.
  slab(b, 2.6, 3.0, 0.1, 0, 0.6, d / 2 + 0.04, C.plank);
  slab(b, 0.12, 3.0, 0.14, 0, 0.6, d / 2 + 0.1, C.timber);
  for (let s = 1; s < storeys; s++) slab(b, 1.8, 2.0, 0.1, 0, 0.6 + h0 + h1 * (s - 1) + 0.4, d / 2 + 0.1, C.plank);
  slab(b, 0.3, 0.3, 1.8, 0, top - 0.6, d / 2 + 0.9, C.timber);
  b.box(0.04, 3.2, 0.04, { at: [0, top - 2.2, d / 2 + 1.6], color: C.rope });
  slab(b, 0.6, 0.6, 0.6, 0, top - 4.1, d / 2 + 1.6, C.plank);
  for (const x of [-w / 3, w / 3]) window(b, x, 2.0, d, 1, rand() < 0.2, 0.7, 0.9);
}

/** An inn: a big house with a lit porch and a large painted sign (the Gilded Gull's gold, the Drowned Lamp's sea green and lamp). */
function inn(b: ModelBuilder, w: number, d: number, storeys: number, variant: number, rand: Rand): void {
  house(b, w, d, storeys, variant ? 'oldTown' : 'market', 1, rand);
  slab(b, 3.6, 0.2, 2.0, 0, 3.2, d / 2 + 1.0, C.timber);
  for (const x of [-1.7, 1.7]) slab(b, 0.2, 2.7, 0.2, x, 0.5, d / 2 + 1.9, C.timber);
  for (const x of [-2.2, 2.2]) b.box(0.3, 0.4, 0.3, { at: [x, 3.0, d / 2 + 0.25], color: C.warmWindow, glow: 1, jitter: 0 });
  b.box(0.06, 0.06, 1.6, { at: [w / 2 - 1.2, 4.6, d / 2 + 0.8], color: C.iron, jitter: 0 });
  slab(b, 0.1, 1.3, 1.3, w / 2 - 1.2, 3.1, d / 2 + 1.3, variant ? 0x2e5a4e : H.gold, variant ? {} : { glow: 0.15 });
  if (variant) b.box(0.25, 0.35, 0.25, { at: [w / 2 - 1.2, 3.75, d / 2 + 1.3], color: C.warmWindow, glow: 1, jitter: 0 });
  else b.box(0.12, 0.25, 0.8, { at: [w / 2 - 1.2, 3.8, d / 2 + 1.3], color: C.plaster, jitter: 0 });
}

/**
 * A civic hall in dressed limestone: tall windows over two floors, a pillared
 * porch with a pediment, a slate roof. Its variant: the Council hall (a bell
 * turret), the bank (gold), the Exchange (a wider portico), the Watch house
 * (the crown's blue), the Apothecaries' Hall (green).
 */
function hall(b: ModelBuilder, w: number, d: number, variant: number, rand: Rand): void {
  const h = 8.5;
  slab(b, w + 0.4, 5.8, d + 0.4, 0, -5, 0, C.basalt);
  slab(b, w, h, d, 0, 0.8, 0, C.limestone);
  slab(b, w + 0.3, 0.4, d + 0.3, 0, 0.8 + h, 0, C.limestoneShade);
  slab(b, w + 0.3, 0.3, d + 0.3, 0, 0.8 + 4.2, 0, C.limestoneShade);
  roof(b, w, d, 1.2 + h, Math.min(4.5, d * 0.4), 0.3, C.slate, C.limestone);
  const n = Math.max(2, Math.floor(w / 2.6));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + ((i + 0.5) * w) / n;
    window(b, x, 5.6, d, 1, rand() < 0.3, 1.0, 2.2);
    window(b, x, 5.6, d, -1, rand() < 0.2, 1.0, 2.2);
    if (Math.abs(x) > 2.2) window(b, x, 1.9, d, 1, rand() < 0.3, 1.0, 2.0);
    window(b, x, 1.9, d, -1, false, 1.0, 2.0);
  }
  const doors = [H.royalBlue, H.gold, 0x5a3a22, H.royalBlue, 0x3f6a3a];
  door(b, 0, 0.8, d, doors[variant % doors.length], 1.8, 3.0);
  // The porch: pillars, a lintel, a pediment.
  const wide = variant === 2 ? Math.min(w - 1, 10) : 5;
  const cols = variant === 2 ? 6 : 4;
  slab(b, wide + 1, 0.4, 2.6, 0, 0.6, d / 2 + 1.3, C.limestoneShade);
  for (let i = 0; i < cols; i++) b.cyl(0.28, 0.32, 4.0, 8, { at: [-wide / 2 + (i * wide) / (cols - 1), 3.0, d / 2 + 2.1], color: C.limestone, jitter: 0.03 });
  slab(b, wide + 1, 0.6, 1.4, 0, 5.0, d / 2 + 1.9, C.limestoneShade);
  b.taper(wide + 1, 1.4, wide + 1, 0.04, 1.4, { at: [0, 5.6, d / 2 + 1.9], color: C.limestone });
  if (variant === 0) {
    slab(b, 2.2, 3.4, 2.2, 0, 1.2 + h + 2.5, 0, C.limestone);
    slab(b, 1.4, 1.6, 2.3, 0, 1.2 + h + 3.6, 0, C.window);
    pyramid(b, 2.6, 2.6, 0, 1.2 + h + 5.9, 0, C.slate);
    b.ball(0.3, { at: [0, 1.2 + h + 8.6, 0], color: H.gold, glow: 0.3 });
  }
  if (variant === 1) sign(b, w / 2 - 1.2, 3.0, d, H.gold, 0.2);
  if (variant === 3 || variant === 0) for (const x of [-w / 2 + 1.5, w / 2 - 1.5]) slab(b, 0.9, 2.6, 0.06, x, 4.6, d / 2 + 0.06, H.royalBlue);
  if (variant === 4) sign(b, w / 2 - 1.2, 3.0, d, 0x3f6a3a);
}

/** A great house's townhouse on Crown Hill: three storeys of dressed stone with quoins, its door and banners in the house's colours. */
function townhouse(b: ModelBuilder, w: number, d: number, variant: number, rand: Rand): void {
  const [main, second] = HOUSE_COLOURS[variant + 1] ?? CROWN;
  const h = 10;
  slab(b, w + 0.4, 6, d + 0.4, 0, -5, 0, C.basalt);
  slab(b, w, h, d, 0, 1, 0, C.limestone);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) slab(b, 0.5, h, 0.5, sx * (w / 2), 1, sz * (d / 2), C.limestoneDark);
  slab(b, w + 0.3, 0.35, d + 0.3, 0, 1 + h, 0, C.limestoneDark);
  roof(b, w, d, 1.35 + h, 5.2, 0.35, C.slateDark, C.limestone);
  for (const x of [-w / 2 + 1, w / 2 - 1]) chimney(b, x, 0, 1.35 + h + 1, 1.35 + h + 6.4);
  const n = Math.max(3, Math.floor(w / 2.6));
  for (let f = 0; f < 3; f++) {
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + ((i + 0.5) * w) / n;
      if (f === 0 && Math.abs(x) < 1.6) continue;
      window(b, x, 1.8 + f * 3.2, d, 1, rand() < 0.3, 1.0, 1.8);
      window(b, x, 1.8 + f * 3.2, d, -1, rand() < 0.2, 1.0, 1.8);
    }
  }
  door(b, 0, 1, d, main, 1.8, 2.8);
  // A stone porch with the house's arms over it.
  slab(b, 3.2, 0.3, 1.4, 0, 4.0, d / 2 + 0.7, C.limestoneShade);
  slab(b, 1.2, 1.4, 0.12, 0, 4.4, d / 2 + 0.1, main);
  slab(b, 0.5, 0.7, 0.14, 0, 4.75, d / 2 + 0.12, second);
  for (const x of [-w / 2 + 2, w / 2 - 2]) slab(b, 1.0, 3.6, 0.06, x, 4.2, d / 2 + 0.06, main);
  for (const x of [-w / 2 + 2, w / 2 - 2]) slab(b, 0.4, 0.5, 0.08, x, 6.6, d / 2 + 0.08, second);
}

/** The barracks: a long limestone block of two floors with a crenellated parapet. */
function barracks(b: ModelBuilder, w: number, d: number, rand: Rand): void {
  slab(b, w + 0.4, 4, d + 0.4, 0, -3, 0, C.basalt);
  slab(b, w, 7, d, 0, 1, 0, C.limestoneShade);
  merlons(b, w, 8, d / 2 - 0.3, C.limestoneShade);
  merlons(b, w, 8, -d / 2 + 0.3, C.limestoneShade);
  slab(b, w - 1.2, 0.2, d - 1.2, 0, 7.9, 0, C.slateDark);
  for (let i = 0; i < Math.floor(w / 2.6); i++) {
    const x = -w / 2 + 1.3 + i * 2.6;
    if (Math.abs(x) > 1.6) window(b, x, 2.2, d, 1, rand() < 0.3, 0.7, 1.2);
    window(b, x, 5.2, d, 1, rand() < 0.25, 0.7, 1.2);
  }
  door(b, 0, 1, d, H.royalBlue, 2.2, 2.8);
  for (const x of [-w / 2 + 2, w / 2 - 2]) slab(b, 0.9, 2.4, 0.06, x, 4.6, d / 2 + 0.06, H.royalBlue);
}

/** The Great Forge: an open-fronted stone smithy under slate, a great chimney, the hearth's glow and an anvil. */
function forge(b: ModelBuilder, w: number, d: number): void {
  slab(b, w + 0.4, 3.6, d + 0.4, 0, -3, 0, C.basalt);
  slab(b, w, 5, 0.6, 0, 0.6, -d / 2 + 0.3, C.limestoneShade);
  for (const s of [-1, 1]) slab(b, 0.6, 5, d, s * (w / 2 - 0.3), 0.6, 0, C.limestoneShade);
  for (let i = 1; i < 4; i++) slab(b, 0.4, 5, 0.4, -w / 2 + (i * w) / 4, 0.6, d / 2 - 0.3, C.timber);
  slab(b, w, 0.4, 0.4, 0, 5.4, d / 2 - 0.3, C.timber);
  roof(b, w, d, 5.6, 3.2, 0.4, C.slateDark, C.limestoneShade);
  slab(b, 3.2, 1.2, 2.4, -w / 4, 0.6, -d / 2 + 1.8, C.basalt);
  b.box(2.4, 0.3, 1.6, { at: [-w / 4, 1.95, -d / 2 + 1.8], color: 0xff7a2a, glow: 1, jitter: 0.1 });
  slab(b, 2.0, 9, 2.0, -w / 4, 1.8, -d / 2 + 1.2, C.basaltLight);
  slab(b, 0.5, 0.7, 0.4, w / 6, 0.6, 0.5, C.basalt);
  slab(b, 1.0, 0.3, 0.4, w / 6, 1.3, 0.5, C.iron);
  slab(b, 0.9, 0.9, 0.9, w / 3, 0.6, -1, C.plank);
  sign(b, w / 2 - 1.5, 3.4, d, C.iron);
}

/** The ranger lodge in the King's Garden: dark timber under a shingle roof, antlers over the door. */
function lodge(b: ModelBuilder, w: number, d: number): void {
  slab(b, w + 0.3, 3.4, d + 0.3, 0, -3, 0, C.limestoneDark);
  slab(b, w, 3.2, d, 0, 0.4, 0, C.plank);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) slab(b, 0.3, 3.2, 0.3, sx * (w / 2), 0.4, sz * (d / 2), C.timber);
  roof(b, w, d, 3.6, 2.8, 0.6, 0x5e4630, C.plank);
  door(b, 0, 0.4, d, 0x3f6a3a, 1.2, 2.2);
  for (const x of [-w / 3, w / 3]) window(b, x, 1.4, d, 1, true, 0.8, 0.9);
  for (const s of [-1, 1]) b.bar([0, 3.0, d / 2 + 0.1], [s * 0.8, 3.7, d / 2 + 0.15], 0.08, 0.08, { color: 0xd8ccb0 });
  chimney(b, w / 2 - 0.6, 0, 4.2, 7.2);
}

/** The coaching yard's stables: stone below, a hay loft over, wide doors. */
function stables(b: ModelBuilder, w: number, d: number): void {
  slab(b, w + 0.3, 3.4, d + 0.3, 0, -3, 0, C.limestoneDark);
  slab(b, w, 3.0, d, 0, 0.4, 0, C.limestoneShade);
  slab(b, w, 2.0, d, 0, 3.4, 0, C.plank);
  roof(b, w, d, 5.4, 2.6, 0.4, C.slate, C.plank);
  for (let i = 0; i < 4; i++) slab(b, 2.2, 2.4, 0.1, -w / 2 + 1.75 + i * 3.5, 0.4, d / 2 + 0.04, i % 2 ? C.plank : 0x6a4a2a);
  slab(b, 1.4, 1.2, 0.1, 0, 3.8, d / 2 + 0.06, C.plank);
}

/** A barn in the fields: plank walls on a stone footing, a thatched roof. */
function barn(b: ModelBuilder, w: number, d: number): void {
  slab(b, w + 0.3, 3.4, d + 0.3, 0, -3, 0, C.limestoneDark);
  slab(b, w, 4.2, d, 0, 0.4, 0, 0x8a3a26);
  roof(b, w, d, 4.6, 3.6, 0.6, C.straw, 0x8a3a26, [0, 0, 0], true, 0.3);
  slab(b, 3.2, 3.4, 0.1, 0, 0.4, d / 2 + 0.04, C.plank);
}

/** The windmill west of the walls: a tapered stone tower, a cap and four sails, still. */
function windmill(b: ModelBuilder, h: number): void {
  b.cyl(2.2, 3.0, h, 8, { at: [0, h / 2 - 1, 0], color: C.limestone });
  b.cone(2.8, 2.6, 8, { at: [0, h - 1 + 1.3, 0], color: C.slateDark });
  door(b, 0, 0, 5.6, C.door, 1.1, 2.0);
  const hub: Vec3 = [0, h - 2.2, 2.6];
  b.box(0.5, 0.5, 0.9, { at: hub, color: C.timber });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * PI * 2 + 0.4;
    const tip: Vec3 = [Math.sin(a) * 6.5, hub[1] + Math.cos(a) * 6.5, hub[2] + 0.3];
    b.bar(hub, tip, 0.22, 0.22, { color: C.timber });
    const mid: Vec3 = [Math.sin(a) * 4, hub[1] + Math.cos(a) * 4, hub[2] + 0.35];
    b.box(1.3, 4.6, 0.06, { at: mid, rot: [0, 0, -a], color: C.canvas });
  }
}

// ------------------------------------------------------------------ landmarks

/**
 * The Cathedral of the Dawn, its west front (+Z) towards the market: a west
 * tower and a slate spire, the tallest thing in the city, with a gilt
 * sunburst at its point; the nave and its aisles with buttresses and
 * stained-glass lancets, the transept, the choir and its round apse, all on a
 * plinth of the Deepkings' black stone.
 */
function cathedral(b: ModelBuilder, h: number): void {
  const L = C.limestone;
  slab(b, 22, 10, 46, 0, -8, -0.5, C.basalt);
  // The nave and its aisles.
  slab(b, 11, 16, 26, 0, 2, 1, L);
  roof(b, 11, 26, 18, 7, 0.4, C.slate, L, [0, 0, 1], true);
  for (const s of [-1, 1]) {
    slab(b, 3.5, 9, 26, s * 7.25, 2, 1, C.limestoneShade);
    b.box(4.4, 0.2, 26.6, { at: [s * 7.25, 11.5, 1], rot: [0, 0, -s * 0.5], color: C.slateDark });
    for (let k = 0; k < 6; k++) {
      const z = -10 + k * 4.4;
      slab(b, 1.0, 8, 1.2, s * 9.4, 2, z, C.limestoneShade);
      b.taper(1.0, 1.2, 0.2, 1.2, 1.6, { at: [s * 9.4, 10, z], color: C.limestoneShade });
      // Stained glass: lancets in the aisles and the clerestory, blue, gold and crimson.
      const glass = [H.royalBlue, H.gold, H.corvane][k % 3];
      slab(b, 0.08, 4.2, 1.1, s * 9.04, 3.8, z + 2.2, glass, { glow: 0.35 });
      if (k < 5) slab(b, 0.08, 3.4, 1.0, s * 5.54, 13.2, z + 2.2, [H.gold, H.royalBlue][k % 2], { glow: 0.35 });
    }
  }
  // The transept across the nave, rose windows in its ends.
  slab(b, 25, 16, 9, 0, 2, -14, L);
  roof(b, 25, 9, 18, 6.5, 0.4, C.slate, L, [0, 0, -14]);
  for (const s of [-1, 1]) {
    b.cyl(2.2, 2.2, 0.12, 12, { at: [s * 12.56, 12.5, -14], rot: [0, 0, PI / 2], color: H.royalBlue, glow: 0.4 });
    b.cyl(0.9, 0.9, 0.14, 8, { at: [s * 12.58, 12.5, -14], rot: [0, 0, PI / 2], color: H.gold, glow: 0.5 });
    door(b, 0, 2, 0, C.door, 2, 3.6);
  }
  // The choir and its apse.
  slab(b, 11, 15, 6, 0, 2, -21.5, L);
  roof(b, 11, 6, 17, 6.5, 0.3, C.slate, L, [0, 0, -21.5], true);
  b.cyl(5.5, 5.5, 15, 10, { at: [0, 9.5, -24.5], color: L });
  b.cone(6.0, 5.0, 10, { at: [0, 19.5, -24.5], color: C.slate });
  // A slender flèche over the crossing.
  b.cyl(0.9, 1.1, 4, 8, { at: [0, 26.5, -14], color: C.lead });
  b.cone(1.1, 6, 8, { at: [0, 31.5, -14], color: C.lead });
  // The west tower and its spire.
  const tz = 18;
  slab(b, 9, 30, 9, 0, 2, tz, L);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) slab(b, 1.4, 30, 1.4, sx * 4.4, 2, tz + sz * 4.4, C.limestoneShade);
  for (const s of [-1, 1]) {
    slab(b, 0.1, 5, 2.2, s * 4.56, 22, tz, C.window);
    slab(b, 2.2, 5, 0.1, 0, 22, tz + s * 4.56, C.window);
  }
  merlons(b, 9, 32, tz + 4.2, L, 1.8);
  merlons(b, 9, 32, tz - 4.2, L, 1.8);
  merlons(b, 9, 32, 4.2, L, 1.8, true);
  merlons(b, 9, 32, -4.2, L, 1.8, true);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cone(0.8, 3.6, 4, { at: [sx * 4.4, 33.8, tz + sz * 4.4], rot: [0, PI / 4, 0], color: C.lead });
  const spire = h - 34;
  b.cone(4.4, spire, 8, { at: [0, 32 + spire / 2, tz], rot: [0, PI / 8, 0], color: C.slate, jitter: 0.05 });
  // The gilt sunburst at its point, catching the light from anywhere.
  const top = 32 + spire;
  b.ball(0.9, { at: [0, top + 0.6, tz], color: H.gold, glow: 0.7 }, 1);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * PI * 2;
    b.box(0.16, 1.4, 0.16, { at: [Math.sin(a) * 1.4, top + 0.6 + Math.cos(a) * 1.4, tz], rot: [0, 0, -a], color: H.gold, glow: 0.7, jitter: 0 });
  }
  // The west front: the great door and a rose window over it.
  slab(b, 3.6, 6, 0.3, 0, 2, tz + 4.6, C.door);
  b.taper(4.6, 0.6, 0.6, 0.6, 1.8, { at: [0, 8, tz + 4.65], color: C.limestoneShade });
  b.cyl(2.4, 2.4, 0.14, 12, { at: [0, 13.5, tz + 4.62], rot: [PI / 2, 0, 0], color: H.gold, glow: 0.4 });
  b.cyl(1.2, 1.2, 0.16, 8, { at: [0, 13.5, tz + 4.66], rot: [PI / 2, 0, 0], color: H.corvane, glow: 0.4 });
  slab(b, 12, 1.2, 1.6, 0, 1.2, tz + 5.4, C.limestoneDark);
}

/**
 * The keep on Crown Hill: a curtain wall round a square court, round towers
 * at its corners under slate cones, a gatehouse to the south (+Z), and the
 * great square keep in the middle with turrets and the crown's banners.
 */
function keep(b: ModelBuilder, size: number): void {
  const half = size / 2;
  const L = C.limestone;
  slab(b, size, 11, size, 0, -10, 0, C.basalt);
  for (const [x, z, alongZ] of [[0, -half + 1.25, false], [-half + 1.25, 0, true], [half - 1.25, 0, true]] as const) {
    if (alongZ) slab(b, 2.5, 9, size - 6, x, 1, z, L);
    else slab(b, size - 6, 9, 2.5, x, 1, z, L);
    merlons(b, size - 6, 10, alongZ ? x + (x < 0 ? -0.95 : 0.95) : z - 0.95, L, 2.2, alongZ);
  }
  // The south wall, split for its gate.
  for (const s of [-1, 1]) {
    const len = half - 3 - 3;
    slab(b, len, 9, 2.5, s * (3 + len / 2), 1, half - 1.25, L);
    merlons(b, len, 10, half - 0.3, L, 2.2);
    slab(b, 4, 12, 4, s * 4.5, 1, half - 1.25, C.limestoneShade);
    pyramid(b, 4.4, 3, s * 4.5, 13, half - 1.25, C.slate);
  }
  slab(b, 5, 4, 2.5, 0, 7, half - 1.25, L);
  slab(b, 5, 5.5, 0.1, 0, 1, half + 0.05, C.window);
  slab(b, 4.6, 0.6, 0.2, 0, 6.2, half + 0.12, C.iron);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.cyl(3.6, 3.9, 13, 10, { at: [sx * (half - 2), 7, sz * (half - 2)], color: L });
      b.cyl(4.0, 4.0, 0.5, 10, { at: [sx * (half - 2), 13.75, sz * (half - 2)], color: C.limestoneShade });
      b.cone(4.2, 5, 10, { at: [sx * (half - 2), 16.5, sz * (half - 2)], color: C.slate });
    }
  }
  // The great keep.
  slab(b, 16, 5, 16, 0, 1, -2, C.basaltLight);
  slab(b, 16, 17, 16, 0, 6, -2, L);
  slab(b, 16.4, 0.4, 16.4, 0, 23, -2, C.limestoneShade);
  merlons(b, 16, 23.4, 5.7, L, 2);
  merlons(b, 16, 23.4, -9.7, L, 2);
  merlons(b, 16, 23.4, 7.7, L, 2, true);
  merlons(b, 16, 23.4, -7.7, L, 2, true);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.cyl(1.6, 1.6, 26, 8, { at: [sx * 8, 14, -2 + sz * 8], color: L });
      b.cone(1.9, 3.4, 8, { at: [sx * 8, 28.7, -2 + sz * 8], color: C.slate });
    }
  }
  for (let f = 0; f < 3; f++) {
    for (const x of [-4, 0, 4]) {
      slab(b, 0.5, 1.6, 0.1, x, 9 + f * 4.5, 6.05, C.window);
      slab(b, 0.1, 1.6, 0.5, 8.05, 9 + f * 4.5, -2 + x, C.window);
      slab(b, 0.1, 1.6, 0.5, -8.05, 9 + f * 4.5, -2 + x, C.window);
    }
  }
  slab(b, 2.4, 3.2, 0.1, 0, 6, 6.05, C.door);
  flag(b, 0, 23.4, -2, 7, CROWN);
  flag(b, -half + 2, 19, half - 2, 4, CROWN);
  flag(b, half - 2, 19, half - 2, 4, CROWN);
  // The crown's colours over the gate.
  slab(b, 1.6, 3.4, 0.06, 0, 6.6, half + 0.1, H.royalBlue);
  slab(b, 0.8, 0.8, 0.08, 0, 8.6, half + 0.12, H.gold);
}

/** The Lamplit Collegium: a small basalt-plinthed hall and its slim tower, the lamp room at its top always lit. */
function collegium(b: ModelBuilder, w: number, d: number, h: number, rand: Rand): void {
  const hx = -w / 2 + 4.5;
  slab(b, w + 0.3, 3.6, d + 0.3, 0, -3, 0, C.basalt);
  slab(b, 9, 6, d, hx, 0.6, 0, C.limestone);
  roof(b, 9, d, 6.6, 3.6, 0.3, C.slateDark, C.limestone, [hx, 0, 0]);
  door(b, hx, 0.6, d, 0x4a3a6a, 1.4, 2.6);
  for (const x of [hx - 3, hx + 3]) window(b, x, 2.0, d, 1, rand() < 0.6, 0.8, 1.8);
  const tx = w / 2 - 2.5;
  slab(b, 4.6, h - 4, 4.6, tx, 0.6, 0, C.limestone);
  for (let f = 1; f < 6; f++) {
    slab(b, 0.5, 1.2, 0.1, tx, 2 + f * 4.4, 2.35, f % 2 ? C.window : C.warmWindow, f % 2 ? {} : { glow: 0.5 });
  }
  slab(b, 5.2, 0.4, 5.2, tx, h - 3.4, 0, C.limestoneShade);
  slab(b, 3.8, 3.0, 3.8, tx, h - 3.0, 0, 0xcfe8ff, { glow: 1, jitter: 0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) slab(b, 0.3, 3.0, 0.3, tx + sx * 1.9, h - 3.0, sz * 1.9, C.basalt);
  slab(b, 4.6, 0.3, 4.6, tx, h, 0, C.basalt);
  pyramid(b, 4.8, 6, tx, h + 0.3, 0, C.slateDark);
  b.ball(0.35, { at: [tx, h + 6.6, 0], color: 0xcfe8ff, glow: 1 });
}

/** The harbour light: a round tower tapering up, its gallery and the lamp room, lit, at the end of the mole. */
function lighthouse(b: ModelBuilder, h: number): void {
  b.cyl(4.2, 4.6, 5, 10, { at: [0, -0.5, 0], color: C.basalt });
  b.cyl(2.5, 3.6, h - 2, 10, { at: [0, 2 + (h - 2) / 2, 0], color: C.limestone });
  for (const y of [7, 12]) b.cyl(3.4 - (y - 2) * 0.055, 3.5 - (y - 2) * 0.055, 0.4, 10, { at: [0, y, 0], color: 0x8a3a2b });
  b.cyl(3.4, 3.4, 0.4, 10, { at: [0, h + 0.2, 0], color: C.basalt });
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * PI * 2;
    slab(b, 0.1, 1.0, 0.1, Math.sin(a) * 3.2, h + 0.4, Math.cos(a) * 3.2, C.iron);
  }
  b.cyl(1.9, 1.9, 2.6, 8, { at: [0, h + 1.7, 0], color: 0xffd680, glow: 1, jitter: 0 });
  b.cone(2.4, 2.2, 8, { at: [0, h + 4.1, 0], color: C.basaltLight });
  door(b, 0, 2, 7.0, C.door, 1.2, 2.2);
}

/** The great treadwheel crane on the Long Quay: its housing, the wheel men walk, the mast and the jib out over the water (+Z). */
function crane(b: ModelBuilder, h: number): void {
  slab(b, 5.6, 1.0, 5.6, 0, 0, 0, C.plank);
  const r = 2.6;
  for (const x of [-0.9, 0.9]) {
    const n = 14;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * PI * 2;
      const a1 = ((k + 1) / n) * PI * 2;
      b.bar([x, 1 + r + Math.cos(a0) * r, -1 + Math.sin(a0) * r], [x, 1 + r + Math.cos(a1) * r, -1 + Math.sin(a1) * r], 0.22, 0.22, { color: C.plank });
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * PI;
      b.bar([x, 1 + r + Math.cos(a) * r, -1 + Math.sin(a) * r], [x, 1 + r - Math.cos(a) * r, -1 - Math.sin(a) * r], 0.14, 0.14, { color: C.timber });
    }
  }
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * PI * 2;
    b.box(1.9, 0.12, 0.3, { at: [0, 1 + r + Math.cos(a) * (r - 0.1), -1 + Math.sin(a) * (r - 0.1)], color: C.plank });
  }
  b.cyl(0.18, 0.18, 2.4, 6, { at: [0, 1 + r, -1], rot: [0, 0, PI / 2], color: C.timber });
  for (const s of [-1, 1]) b.bar([s * 1.6, 1, -1], [s * 1.2, 1 + r, -1], 0.3, 0.3, { color: C.timber });
  slab(b, 0.6, h - 1, 0.6, 0, 1, 1.6, C.timber);
  b.bar([0, h - 1, 1.2], [0, h + 1.5, 9.5], 0.45, 0.45, { color: C.timber });
  b.bar([0, 4, 1.8], [0, h - 2, 6.5], 0.25, 0.25, { color: C.timber });
  b.box(0.05, 6.5, 0.05, { at: [0, h + 1.5 - 3.25, 9.5], color: C.rope });
  slab(b, 1.2, 1.0, 1.2, 0, h - 5.8, 9.5, C.plank);
  b.box(2.2, 0.12, 2.2, { at: [0, 1 + 2 * r + 0.5, -1], rot: [0.3, 0, 0], color: C.slateDark });
}

/**
 * The Aldbridge: a stone deck of five arches over the river (along Z), its
 * piers with cutwaters, low parapets; the houses that crowd along it are
 * their own pieces. Its deck follows the plan's hump, so you walk on what you see.
 */
function aldbridge(b: ModelBuilder, w: number, d: number): void {
  const mid = (ALDHAVEN.bridge.from + ALDHAVEN.bridge.to) / 2;
  const deck = (z: number) => deckHeight(z + mid);
  const half = d / 2;
  const piers = [-12, -4, 4, 12];
  const pierW = 3;
  // The deck: a slab along the hump.
  const n = 16;
  for (let k = 0; k < n; k++) {
    const z0 = -half + (k * d) / n;
    const z1 = -half + ((k + 1) * d) / n;
    b.bar([0, deck(z0) - 0.45, z0], [0, deck(z1) - 0.45, z1], w, 0.9, { color: C.limestoneShade, jitter: 0.04 });
    for (const s of [-1, 1]) b.bar([s * (w / 2 - 0.2), deck(z0) + 0.4, z0], [s * (w / 2 - 0.2), deck(z1) + 0.4, z1], 0.4, 0.8, { color: C.limestone });
  }
  // Piers down to the river bed, with cutwaters upstream and down.
  for (const z of piers) {
    slab(b, w, deck(z) + 3, pierW, 0, -3.5, z, C.basalt);
    for (const s of [-1, 1]) b.box(2.1, 4.2, 2.1, { at: [s * (w / 2), -1.4, z], rot: [0, PI / 4, 0], color: C.basalt });
  }
  // The arches: each opening's spandrels in slices, so the arch reads from the water.
  const edges = [-half, ...piers.flatMap((z) => [z - pierW / 2, z + pierW / 2]), half];
  for (let k = 0; k < edges.length; k += 2) {
    const [e0, e1] = [edges[k], edges[k + 1]];
    const c = (e0 + e1) / 2;
    const r = (e1 - e0) / 2;
    const slices = 9;
    for (let i = 0; i < slices; i++) {
      const z = e0 + ((i + 0.5) * (e1 - e0)) / slices;
      const archY = 0.9 + Math.sqrt(Math.max(0, r * r - (z - c) ** 2)) * 0.85;
      const top = deck(z) - 0.8;
      if (top > archY) slab(b, w - 0.4, top - archY, (e1 - e0) / slices + 0.02, 0, archY, z, i === 0 || i === slices - 1 ? C.limestoneShade : C.limestone);
      slab(b, w - 0.2, 0.35, (e1 - e0) / slices + 0.02, 0, archY - 0.35, z, C.limestoneDark);
    }
  }
  // Its abutments on either bank.
  for (const s of [-1, 1]) slab(b, w, ALDHAVEN.quay + 3.5, 2, 0, -3.5, s * (half - 1), C.basalt);
}

// ------------------------------------------------------------------ walls and gates

/** A run of the city wall, `w` long: basalt footings, limestone above, a wall walk and merlons on its outer (+Z) face. */
function wallRun(b: ModelBuilder, w: number, d: number, h: number): void {
  slab(b, w, 8, d + 0.6, 0, -7, 0, C.basalt);
  slab(b, w, h - 1, d, 0, 1, 0, C.limestone);
  slab(b, w, 0.35, d + 0.2, 0, h - 2.6, 0, C.limestoneShade);
  merlons(b, w, h, d / 2 - 0.3, C.limestone, 2.4);
  slab(b, w, 0.5, 0.4, 0, h, -d / 2 + 0.2, C.limestoneShade);
}

/** A round tower on the wall: basalt below, limestone above, crenellated, some under a slate cone. */
function wallTower(b: ModelBuilder, w: number, h: number, roofed: boolean): void {
  const r = w / 2;
  b.cyl(r + 0.3, r + 0.4, 9, 10, { at: [0, -2.5, 0], color: C.basalt });
  b.cyl(r, r, h - 2, 10, { at: [0, 2 + (h - 2) / 2, 0], color: C.limestone });
  b.cyl(r + 0.3, r + 0.3, 0.4, 10, { at: [0, h - 0.2, 0], color: C.limestoneShade });
  if (roofed) b.cone(r + 0.6, 4.5, 10, { at: [0, h + 2.25, 0], color: C.slate });
  else ringMerlons(b, r, h, 10, C.limestone);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * PI * 2 + 0.5;
    b.box(0.25, 1.4, 0.1, { at: [Math.sin(a) * (r + 0.02), h - 4, Math.cos(a) * (r + 0.02)], rot: [0, a, 0], color: C.window });
  }
}

/** A gatehouse over a way through the wall (along Z): towers either side, the arch over, the portcullis raised, the crown's banner. */
function gatehouse(b: ModelBuilder, w: number, d: number, h: number): void {
  const gap = ALDHAVEN.gates.width;
  const tw = (w - gap) / 2;
  for (const s of [-1, 1]) {
    const x = s * (gap / 2 + tw / 2);
    slab(b, tw, 8, d, x, -7, 0, C.basalt);
    slab(b, tw, h - 1, d, x, 1, 0, C.limestone);
    slab(b, tw + 0.3, 0.4, d + 0.3, x, h, 0, C.limestoneShade);
    pyramid(b, Math.max(tw, d) + 0.4, 4, x, h + 0.4, 0, C.slate);
    for (const face of [-1, 1]) slab(b, 0.4, 1.4, 0.1, x, h - 5, face * (d / 2 + 0.03), C.window);
  }
  slab(b, gap + 0.2, h - 7.5, d, 0, 7.5, 0, C.limestone);
  merlons(b, gap, h, d / 2 - 0.3, C.limestone, 1.8);
  merlons(b, gap, h, -d / 2 + 0.3, C.limestone, 1.8);
  slab(b, gap + 0.2, 0.5, d + 0.2, 0, 7.0, 0, C.limestoneDark);
  for (let k = 0; k < 6; k++) slab(b, 0.12, 0.9, 0.12, -gap / 2 + 0.6 + (k * (gap - 1.2)) / 5, 6.2, d / 2 - 1, C.iron);
  slab(b, 1.6, 4.2, 0.06, 0, 8.4, d / 2 + 0.06, H.royalBlue);
  slab(b, 1.6, 0.4, 0.08, 0, 11.2, d / 2 + 0.08, H.gold);
  slab(b, 1.6, 4.2, 0.06, 0, 8.4, -d / 2 - 0.06, H.royalBlue);
}

/** The water gate where the wall crosses the river (along X): basalt piers, arches over the water, a wall walk above. */
function waterGate(b: ModelBuilder, w: number, d: number, h: number): void {
  const top = ALDHAVEN.quay + h;
  slab(b, w, top - 3.6, d, 0, 3.6, 0, C.limestone);
  merlons(b, w, top, d / 2 - 0.3, C.limestone);
  const n = 4;
  for (let k = 0; k <= n; k++) {
    const x = -w / 2 + (k * w) / n;
    slab(b, 2.4, 3.6 + 3.5, d + 0.8, x, -3.5, 0, C.basalt);
  }
  for (let k = 0; k < n; k++) {
    const x = -w / 2 + ((k + 0.5) * w) / n;
    for (let i = 0; i < 7; i++) slab(b, 0.12, 3.8, 0.12, x - 3 + i, -0.4, d / 2 - 0.4, C.iron);
    slab(b, w / n - 2.4, 0.3, 0.2, x, 2.8, d / 2 - 0.4, C.iron);
  }
}

/** The Gorgegate: a fortified toll arch across the valley road at the gorge's mouth (along X), walls out to the cliffs. */
function gorgegate(b: ModelBuilder, w: number, d: number, h: number): void {
  const gap = 8;
  for (const s of [-1, 1]) {
    slab(b, 6, h + 6, 6, s * (gap / 2 + 3), -6, 0, C.limestoneShade);
    pyramid(b, 6.6, 3.6, s * (gap / 2 + 3), h, 0, C.slateDark);
    const wl = w / 2 - gap / 2 - 6;
    slab(b, wl, h - 4 + 8, 3, s * (gap / 2 + 6 + wl / 2), -8, 0, C.limestoneDark);
    merlons(b, wl, h - 4, 1.2, C.limestoneDark);
  }
  slab(b, gap + 0.4, 4.5, d, 0, 6, 0, C.limestoneShade);
  merlons(b, gap, 10.5, d / 2 - 0.3, C.limestoneShade, 1.8);
  slab(b, gap + 0.3, 0.5, d + 0.2, 0, 5.6, 0, C.basalt);
  slab(b, 1.6, 3.6, 0.06, 0, 6.4, d / 2 + 0.06, H.royalBlue);
  slab(b, 1.6, 0.4, 0.08, 0, 9.2, d / 2 + 0.08, H.gold);
  // The toll bar, raised.
  b.bar([-gap / 2 + 0.5, 1.1, -d / 2 - 1], [-gap / 2 + 2.5, 5, -d / 2 - 1], 0.15, 0.15, { color: 0xc8c0a8 });
  slab(b, 0.4, 1.2, 0.4, -gap / 2 + 0.5, 0, -d / 2 - 1, C.timber);
}

/** A stretch of quay wall `w` long, its top at the quay's level (y 0), its face (+Z) to the water: basalt to the river bed, a limestone coping and a lip. */
function quay(b: ModelBuilder, w: number, d: number): void {
  slab(b, w, 5.2, d, 0, -6.4, 0, C.basalt);
  slab(b, w, 1.2, d, 0, -1.2, 0, C.limestoneShade);
  slab(b, w, 0.3, 0.4, 0, 0, -d / 2 + 0.25, C.limestoneDark);
}

/** A low wall with a coping: the close's, the King's Garden's. */
function lowWall(b: ModelBuilder, w: number, d: number, h: number): void {
  slab(b, w, h + 2, d, 0, -2, 0, C.limestone);
  slab(b, w + 0.1, 0.2, d + 0.2, 0, h, 0, C.limestoneShade);
}

// ------------------------------------------------------------------ props

function marketCross(b: ModelBuilder): void {
  for (const [r, y] of [[2.2, 0], [1.6, 0.4], [1.1, 0.8]] as const) b.cyl(r, r, 0.4, 8, { at: [0, y + 0.2 - (y === 0 ? 0.6 : 0), 0], color: y === 0.8 ? C.basaltLight : C.limestoneShade });
  b.cyl(0.3, 0.38, 4.2, 8, { at: [0, 3.3, 0], color: C.limestone });
  b.box(1.4, 0.3, 0.3, { at: [0, 4.7, 0], color: C.limestone });
  b.ball(0.45, { at: [0, 5.7, 0], color: H.gold, glow: 0.4 });
}

function stall(b: ModelBuilder, w: number, d: number, variant: number, rand: Rand): void {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) slab(b, 0.12, sz > 0 ? 2.2 : 2.6, 0.12, sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.1), C.timber);
  slab(b, w, 0.9, 0.7, 0, 0, d / 2 - 0.4, C.plank);
  slab(b, w + 0.1, 0.08, 0.8, 0, 0.9, d / 2 - 0.4, 0x8a6a44);
  b.box(w + 0.4, 0.08, d + 0.5, { at: [0, 2.4, 0.05], rot: [0.2, 0, 0], color: AWNINGS[variant % AWNINGS.length] });
  const goods = [0xd8782a, 0x7aac5a, 0xc8a26a, 0x9e3a2b, 0xd8b85a, 0x6a8aa8];
  for (let i = 0; i < 4; i++) slab(b, 0.45, 0.25, 0.4, -w / 2 + 0.5 + i * ((w - 1) / 3), 0.98, d / 2 - 0.4, goods[Math.floor(rand() * goods.length)]);
  slab(b, 0.6, 0.6, 0.6, w / 2 - 0.5, 0, -d / 2 + 0.4, C.plank);
}

function lamp(b: ModelBuilder, h: number): void {
  b.cyl(0.07, 0.1, h, 6, { at: [0, h / 2, 0], color: C.iron });
  b.box(0.1, 0.1, 0.5, { at: [0, h - 0.1, 0.22], color: C.iron, jitter: 0 });
  b.box(0.3, 0.38, 0.3, { at: [0, h - 0.45, 0.45], color: C.warmWindow, glow: 1, jitter: 0 });
  b.cone(0.26, 0.2, 4, { at: [0, h - 0.16, 0.45], rot: [0, PI / 4, 0], color: C.iron });
}

function well(b: ModelBuilder): void {
  b.cyl(1.1, 1.15, 1.0, 10, { at: [0, 0.3, 0], color: C.basalt });
  b.cyl(0.85, 0.85, 0.05, 10, { at: [0, 0.78, 0], color: 0x101014 });
  for (const s of [-1, 1]) slab(b, 0.16, 2.4, 0.16, s * 0.95, 0.5, 0, C.timber);
  b.box(2.4, 0.1, 1.3, { at: [0, 2.95, 0.35], rot: [0.5, 0, 0], color: C.slate });
  b.box(2.4, 0.1, 1.3, { at: [0, 2.95, -0.35], rot: [-0.5, 0, 0], color: C.slate });
  b.cyl(0.08, 0.08, 1.8, 6, { at: [0, 2.2, 0], rot: [0, 0, PI / 2], color: C.timber });
  slab(b, 0.35, 0.35, 0.35, 0.3, 1.2, 0, C.plank);
  // The Deepkings' glyphs, worn into its stone (they match the Warden's crypt in Oakvale).
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * PI * 2 + 0.3;
    b.box(0.25, 0.25, 0.04, { at: [Math.sin(a) * 1.13, 0.45, Math.cos(a) * 1.13], rot: [0, a, PI / 4], color: 0x4a5a7a, glow: 0.25 });
  }
}

/** The first High Lector, standing on a broken chain, a sun in her raised hand. */
function statue(b: ModelBuilder): void {
  slab(b, 1.6, 1.4, 1.6, 0, 0, 0, C.limestoneShade);
  b.taper(0.9, 0.7, 0.5, 0.4, 1.9, { at: [0, 1.4, 0], color: C.limestone });
  b.ball(0.24, { at: [0, 3.5, 0], color: C.limestone });
  b.bar([0.2, 3.0, 0], [0.45, 3.9, 0.1], 0.14, 0.14, { color: C.limestone });
  b.ball(0.22, { at: [0.5, 4.1, 0.1], color: H.gold, glow: 0.4 });
  for (let k = 0; k < 3; k++) b.box(0.3, 0.1, 0.18, { at: [-0.4 + k * 0.32, 1.47, 0.45], rot: [0, k % 2 ? PI / 2 : 0, 0], color: C.iron });
}

function grave(b: ModelBuilder, rand: Rand): void {
  const h = 0.7 + rand() * 0.4;
  slab(b, 0.6, h, 0.16, 0, -0.2, 0, rand() < 0.5 ? C.limestoneShade : 0x9a968c);
  b.cyl(0.3, 0.3, 0.16, 8, { at: [0, h - 0.2, 0], rot: [PI / 2, 0, 0], color: C.limestoneShade });
}

function butt(b: ModelBuilder): void {
  for (const s of [-1, 1]) b.bar([s * 0.5, 0, -0.4], [s * 0.4, 1.8, 0], 0.1, 0.1, { color: C.timber });
  b.cyl(0.75, 0.75, 0.35, 12, { at: [0, 1.15, 0.1], rot: [PI / 2, 0, 0], color: C.straw });
  for (const [r, c] of [[0.55, 0xf0ece0], [0.38, 0x2c4a8c], [0.2, 0xd84a3a], [0.08, 0xd9a93b]] as const) b.cyl(r, r, 0.04, 12, { at: [0, 1.15, 0.29 + (0.55 - r) * 0.02], rot: [PI / 2, 0, 0], color: c, jitter: 0 });
}

function dummy(b: ModelBuilder): void {
  b.cyl(0.08, 0.1, 1.9, 6, { at: [0, 0.95, 0], color: C.timber });
  b.cyl(0.25, 0.22, 0.8, 6, { at: [0, 1.2, 0], color: C.straw });
  b.box(1.2, 0.1, 0.1, { at: [0, 1.4, 0], color: C.timber });
  b.ball(0.18, { at: [0, 1.8, 0], color: C.canvas });
}

function bench(b: ModelBuilder, w: number): void {
  slab(b, w, 0.08, 0.45, 0, 0.42, 0, C.plank);
  for (const s of [-1, 1]) slab(b, 0.1, 0.42, 0.4, s * (w / 2 - 0.2), 0, 0, C.limestoneShade);
}

function crates(b: ModelBuilder, rand: Rand): void {
  for (let i = 0; i < 3; i++) {
    const s = 0.6 + rand() * 0.3;
    slab(b, s, s, s, (rand() - 0.5) * 1.0, i === 2 ? 0.75 : 0, (rand() - 0.5) * 1.0, rand() < 0.5 ? C.plank : 0x8a6a44, { jitter: 0.1 });
  }
}

function barrels(b: ModelBuilder, rand: Rand): void {
  for (let i = 0; i < 3; i++) {
    const x = (rand() - 0.5) * 1.1;
    const z = (rand() - 0.5) * 1.1;
    b.cyl(0.32, 0.28, 0.85, 8, { at: [x, 0.42, z], color: 0x6a4a2a });
    b.cyl(0.33, 0.33, 0.06, 8, { at: [x, 0.62, z], color: C.iron });
  }
}

function cart(b: ModelBuilder): void {
  slab(b, 1.5, 0.15, 2.4, 0, 0.7, 0, C.plank);
  for (const s of [-1, 1]) {
    slab(b, 0.08, 0.5, 2.4, s * 0.72, 0.85, 0, C.plank);
    b.cyl(0.5, 0.5, 0.1, 10, { at: [s * 0.82, 0.5, 0.2], rot: [0, 0, PI / 2], color: C.timber });
    b.bar([s * 0.45, 0.75, 1.2], [s * 0.4, 0.15, 2.8], 0.08, 0.08, { color: C.timber });
  }
  slab(b, 1.0, 0.4, 0.8, 0, 0.85, -0.4, C.canvas);
}

/** A merchant ship at anchor, its bow +Z: a tarred hull, a stern castle, two masts with furled sails, rigging and a flag. */
function ship(b: ModelBuilder, w: number, d: number, variant: number): void {
  const hull = [0x5a3a22, 0x4a321e, 0x6a4a2a][variant % 3];
  b.taper(w * 0.45, d * 0.8, w, d * 0.95, 2.4, { at: [0, -1.1, 0], color: C.tar });
  slab(b, w, 0.9, d * 0.95, 0, 1.3, 0, hull);
  b.taper(w, 2.4, 0.3, 0.2, 2.2, { at: [0, -0.4, d * 0.475 + 1.0], rot: [PI / 2, 0, 0], color: hull });
  slab(b, w * 0.94, 0.15, d * 0.9, 0, 2.0, 0, C.plank);
  slab(b, w, 2.2, 4, 0, 2.0, -d / 2 + 2.2, hull);
  slab(b, w + 0.1, 0.3, 4.1, 0, 4.2, -d / 2 + 2.2, C.timber);
  for (let k = 0; k < 4; k++) slab(b, 0.5, 0.4, 0.06, -1.2 + k * 0.8, 3.0, -d / 2 + 0.17, C.warmWindow, { glow: 0.5, jitter: 0 });
  b.bar([0, 2.6, d / 2 - 0.5], [0, 4.2, d / 2 + 4], 0.22, 0.22, { color: C.timber });
  const masts: [number, number][] = [[d * 0.15, 13], [-d * 0.15, 11]];
  for (const [z, h] of masts) {
    b.cyl(0.14, 0.2, h, 6, { at: [0, 2 + h / 2, z], color: C.timber });
    for (const y of [h * 0.55, h * 0.85]) {
      b.cyl(0.08, 0.08, w * 1.3, 5, { at: [0, 2 + y, z], rot: [0, 0, PI / 2], color: C.timber });
      b.cyl(0.25, 0.25, w * 1.2, 6, { at: [0, 2 + y - 0.25, z], rot: [0, 0, PI / 2], color: C.sail });
    }
    b.box(0.04, 0.04, Math.hypot(h, d / 2), { at: [0, 2 + h / 2, z + d / 4 - 0.5], rot: [-Math.atan2(h, d / 2 - (z > 0 ? z : 0)), 0, 0], color: C.rope, jitter: 0 });
    for (const s of [-1, 1]) b.bar([0, 2 + h * 0.9, z], [s * (w / 2), 2.2, z - 1.5], 0.04, 0.04, { color: C.rope, jitter: 0 });
  }
  flag(b, 0, 2 + 13, d * 0.15, 1.2, [[H.ashby, H.royalBlue, H.ashby][variant % 3], [H.ashbyShip, H.gold, H.gold][variant % 3]]);
}

function boat(b: ModelBuilder, w: number, d: number): void {
  b.taper(w * 0.55, d * 0.8, w, d, 0.6, { at: [0, -0.15, 0], color: 0x6a4a2a });
  slab(b, w * 0.8, 0.06, 0.25, 0, 0.32, 0, C.plank);
  b.bar([-0.3, 0.45, -0.4], [-1.4, 0.0, 0.6], 0.06, 0.06, { color: C.timber });
}

/** A signpost: a post with boards pointing along the ways out of the square (the variant picks which). */
function signpost(b: ModelBuilder, h: number, variant: number): void {
  const ways: readonly (readonly number[])[] = [[0.2, PI], [0, PI / 2, -PI / 2], [PI, PI / 2, -PI / 2], [0, PI / 2, -PI * 0.6]];
  b.cyl(0.08, 0.1, h, 6, { at: [0, h / 2, 0], color: C.timber });
  (ways[variant] ?? ways[0]).forEach((a, i) => {
    const y = h - 0.35 - i * 0.4;
    b.box(0.95, 0.24, 0.05, { at: [Math.sin(a + PI / 2) * 0.45, y, Math.cos(a + PI / 2) * 0.45], rot: [0, a, 0], color: i % 2 ? 0x5a6a8a : C.plank });
  });
  b.ball(0.12, { at: [0, h + 0.1, 0], color: H.gold });
}

/** A painted map board: the city's districts in their colours, a "you are here". */
function mapboard(b: ModelBuilder): void {
  for (const s of [-1, 1]) slab(b, 0.12, 2.2, 0.12, s * 0.9, 0, 0, C.timber);
  slab(b, 2.0, 1.3, 0.08, 0, 0.8, 0.04, C.canvas);
  b.box(2.2, 0.12, 0.3, { at: [0, 2.2, 0.05], rot: [0.3, 0, 0], color: C.slate });
  const patches = [[-0.6, 1.6, 0x6a8a4a], [-0.1, 1.75, H.royalBlue], [0.4, 1.6, 0xd8ccb0], [-0.4, 1.15, C.basaltLight], [0.3, 1.1, 0x8a6a44], [0.75, 1.3, 0x3e7f8c]] as const;
  for (const [x, y, c] of patches) slab(b, 0.42, 0.3, 0.03, x, y - 0.15, 0.1, c);
  slab(b, 1.9, 0.08, 0.03, 0, 1.4, 0.11, 0x3e7f8c);
  b.ball(0.06, { at: [-0.3, 1.5, 0.13], color: 0xd84a3a, glow: 0.3 });
}

/** A banner on a tall pole: the crown's, or a great house's (Corvane's crimson with its black key). */
function banner(b: ModelBuilder, h: number, variant: number): void {
  const [main, second] = HOUSE_COLOURS[variant] ?? CROWN;
  b.cyl(0.08, 0.1, h, 6, { at: [0, h / 2, 0], color: C.timber });
  b.box(1.4, 0.08, 0.08, { at: [0, h - 0.2, 0.12], color: C.timber });
  slab(b, 1.2, 2.8, 0.05, 0, h - 3.1, 0.14, main);
  if (variant === 1) {
    slab(b, 0.18, 1.0, 0.06, 0, h - 2.4, 0.16, second);
    b.cyl(0.24, 0.24, 0.06, 8, { at: [0, h - 1.2, 0.16], rot: [PI / 2, 0, 0], color: second });
    slab(b, 0.3, 0.12, 0.06, 0.12, h - 2.3, 0.16, second);
  } else slab(b, 1.2, 0.35, 0.06, 0, h - 1.2, 0.16, second);
}

/** The fallen street in Old Town: a black hole in the setts, rubble round it, a Watch fence. */
function sinkhole(b: ModelBuilder, w: number, rand: Rand): void {
  const r = w / 2 - 0.6;
  b.cyl(r - 0.6, r - 1.2, 0.3, 10, { at: [0, -0.1, 0], color: 0x0a0a0c, jitter: 0 });
  for (let k = 0; k < 9; k++) {
    const a = rand() * PI * 2;
    const d = r - 0.8 + rand() * 0.8;
    b.box(0.4 + rand() * 0.5, 0.3, 0.4 + rand() * 0.4, { at: [Math.sin(a) * d, 0.08, Math.cos(a) * d], rot: [rand() * 0.4, a, 0], color: rand() < 0.5 ? C.basalt : C.limestoneShade });
  }
  const n = 8;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * PI * 2;
    const a1 = ((k + 1) / n) * PI * 2;
    const p0: Vec3 = [Math.sin(a0) * (r + 0.5), 0, Math.cos(a0) * (r + 0.5)];
    const p1: Vec3 = [Math.sin(a1) * (r + 0.5), 0, Math.cos(a1) * (r + 0.5)];
    slab(b, 0.12, 1.1, 0.12, p0[0], 0, p0[2], C.timber);
    if (k !== 2) b.bar([p0[0], 0.85, p0[2]], [p1[0], 0.85, p1[2]], 0.08, 0.08, { color: k % 2 ? H.royalBlue : C.plank });
  }
}

function haystack(b: ModelBuilder, w: number, h: number): void {
  b.cyl(w / 2, w / 2 + 0.1, h * 0.6, 8, { at: [0, h * 0.3, 0], color: C.straw });
  b.cone(w / 2 + 0.1, h * 0.5, 8, { at: [0, h * 0.6 + h * 0.25, 0], color: 0xc8a84a });
}

function bollard(b: ModelBuilder): void {
  b.cyl(0.2, 0.24, 0.7, 6, { at: [0, 0.35, 0], color: C.iron });
  b.cyl(0.26, 0.26, 0.1, 6, { at: [0, 0.7, 0], color: C.iron });
}

/** The King's Garden pond's stone rim. */
function pondRim(b: ModelBuilder, w: number): void {
  const r = w / 2;
  const n = 18;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * PI * 2;
    b.box((2 * PI * r) / n + 0.1, 0.45, 0.6, { at: [Math.sin(a) * r, 0.05, Math.cos(a) * r], rot: [0, a, 0], color: C.limestoneShade });
  }
}

// ------------------------------------------------------------------ the one entry

/** The kinds built the same near and far: the landmarks, the walls and gates, which make the city's skyline. */
const SKYLINE: ReadonlySet<Piece['kind']> = new Set(['cathedral', 'keep', 'collegium', 'lighthouse', 'bridge', 'wall', 'tower', 'gatehouse', 'waterGate', 'gorgegate', 'quay', 'windmill', 'lowWall']);

/** The model of one piece in its own frame, at full detail or as a stand-in. */
export function buildPiece(p: Piece, far = false): BufferGeometry {
  const b = new ModelBuilder(1 + (p.seed % 997) * 13);
  const rand = mulberry32(p.seed * 7919 + 3);
  if (far && !SKYLINE.has(p.kind)) {
    if (p.kind === 'ship') {
      b.taper(p.w * 0.5, p.d * 0.8, p.w, p.d, 3.2, { at: [0, -1, 0], color: C.tar });
      b.cyl(0.2, 0.2, 13, 4, { at: [0, 8.5, p.d * 0.15], color: C.timber });
      b.cyl(0.2, 0.2, 11, 4, { at: [0, 7.5, -p.d * 0.15], color: C.timber });
    } else if (p.kind === 'crane') {
      slab(b, 5.6, 6, 5.6, 0, 0, -1, C.plank);
      b.bar([0, p.h - 1, 1.2], [0, p.h + 1.5, 9.5], 0.45, 0.45, { color: C.timber });
      slab(b, 0.6, p.h - 1, 0.6, 0, 1, 1.6, C.timber);
    } else farHouse(b, p.w, p.d, p.kind === 'house' || p.kind === 'warehouse' ? p.storeys : 3, p.district, rand);
    return b.build();
  }
  switch (p.kind) {
    case 'house': house(b, p.w, p.d, p.storeys, p.district, p.variant, rand); break;
    case 'warehouse': warehouse(b, p.w, p.d, p.storeys, p.variant % 3, rand); break;
    case 'inn': inn(b, p.w, p.d, p.storeys, p.variant, rand); break;
    case 'hall': hall(b, p.w, p.d, p.variant, rand); break;
    case 'townhouse': townhouse(b, p.w, p.d, p.variant, rand); break;
    case 'barracks': barracks(b, p.w, p.d, rand); break;
    case 'forge': forge(b, p.w, p.d); break;
    case 'lodge': lodge(b, p.w, p.d); break;
    case 'stables': stables(b, p.w, p.d); break;
    case 'barn': barn(b, p.w, p.d); break;
    case 'windmill': windmill(b, p.h); break;
    case 'cathedral': cathedral(b, p.h); break;
    case 'keep': keep(b, p.w); break;
    case 'collegium': collegium(b, p.w, p.d, p.h, rand); break;
    case 'lighthouse': lighthouse(b, p.h); break;
    case 'crane': crane(b, p.h); break;
    case 'bridge': aldbridge(b, p.w, p.d); break;
    case 'wall': wallRun(b, p.w, p.d, p.h); break;
    case 'tower': wallTower(b, p.w, p.h, p.seed % 3 === 0); break;
    case 'gatehouse': gatehouse(b, p.w, p.d, p.h); break;
    case 'waterGate': waterGate(b, p.w, p.d, p.h); break;
    case 'gorgegate': gorgegate(b, p.w, p.d, p.h); break;
    case 'quay': quay(b, p.w, p.d); break;
    case 'lowWall': lowWall(b, p.w, p.d, p.h); break;
    case 'marketCross': marketCross(b); break;
    case 'stall': stall(b, p.w, p.d, p.variant, rand); break;
    case 'lamp': lamp(b, p.h); break;
    case 'well': well(b); break;
    case 'statue': statue(b); break;
    case 'grave': grave(b, rand); break;
    case 'butt': butt(b); break;
    case 'dummy': dummy(b); break;
    case 'bench': bench(b, p.w); break;
    case 'crates': crates(b, rand); break;
    case 'barrels': barrels(b, rand); break;
    case 'cart': cart(b); break;
    case 'ship': ship(b, p.w, p.d, p.variant); break;
    case 'boat': boat(b, p.w, p.d); break;
    case 'signpost': signpost(b, p.h, p.variant); break;
    case 'mapboard': mapboard(b); break;
    case 'banner': banner(b, p.h, p.variant); break;
    case 'sinkhole': sinkhole(b, p.w, rand); break;
    case 'haystack': haystack(b, p.w, p.h); break;
    case 'bollard': bollard(b); break;
    case 'pondRim': pondRim(b, p.w); break;
  }
  return b.build();
}
