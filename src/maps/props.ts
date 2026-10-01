import { type ModelBuilder, type PartOpts, type Vec3 } from '../models/kit';
import { PAL } from '../models/palette';
import { EARTH } from './forest/palette';
import { mulberry32, type P2 } from './forest/noise';

// Pieces of buildings and set dressing shared by the zones past Oakvale
// (Brackenmoor's stone towns and crofts, the Sallows' stilt houses), each
// authored in its building's own frame as Oakvale's are (forest/buildings.ts):
// origin on the ground at the footprint's middle, front facing +Z.

const PI = Math.PI;

/** How a roof is covered: its slabs, its ridge, and the gable ends under it. */
export interface RoofLook {
  readonly roof: number;
  readonly ridge: number;
  readonly gable: number;
  /** Slab thickness: thin slate, or thick thatch. */
  readonly thick: number;
}

/**
 * A gable roof with its ridge along X over a `w` by `d` footprint whose walls
 * stop at `top`: gable ends `rise` high and two slabs overhanging `over`.
 */
export function gableRoof(b: ModelBuilder, w: number, d: number, top: number, rise: number, over: number, look: RoofLook, at: Vec3 = [0, 0, 0]): void {
  const [ox, oy, oz] = at;
  b.taper(w, d, w, 0.04, rise, { at: [ox, oy + top, oz], color: look.gable });
  const half = d / 2 + over;
  const theta = Math.atan2(rise, d / 2);
  const len = half / Math.cos(theta);
  const drop = over * Math.tan(theta);
  for (const side of [-1, 1]) {
    b.box(w + 2 * over, look.thick, len + 0.1, {
      at: [ox, oy + (top - drop + top + rise) / 2 + look.thick / 2, oz + (side * half) / 2],
      rot: [side * theta, 0, 0],
      color: look.roof,
      jitter: 0.1,
    });
  }
  b.box(w + 2 * over, look.thick + 0.06, 0.3, { at: [ox, oy + top + rise + look.thick * 0.55, oz], color: look.ridge });
}

/** Rough walls that run well below the ground, so a slope never shows a gap under them. */
export function walls(b: ModelBuilder, w: number, d: number, h: number, color: number, at: Vec3 = [0, 0, 0], jitter = 0.08): void {
  b.box(w, h + 1.4, d, { at: [at[0], at[1] + (h - 1.4) / 2, at[2]], color, jitter });
}

/** Darker corner stones up a building's four corners. */
export function quoins(b: ModelBuilder, w: number, d: number, h: number, color: number): void {
  for (const x of [-w / 2, w / 2]) {
    for (const z of [-d / 2, d / 2]) {
      for (let y = 0.25; y < h; y += 0.5) {
        const long = Math.round(y / 0.5) % 2 === 0;
        b.box(long ? 0.5 : 0.3, 0.42, long ? 0.3 : 0.5, { at: [x, y, z], color, jitter: 0.12 });
      }
    }
  }
}

/** A door in the wall at z = `face` (front +, back −), its middle `x` along it. */
export function door(b: ModelBuilder, x: number, face: number, w: number, h: number, color: number, frame: number, open = 0): void {
  const s = Math.sign(face) || 1;
  b.box(w + 0.24, h + 0.14, 0.12, { at: [x, h / 2, face + s * 0.03], color: frame });
  if (open === 0) b.box(w, h, 0.1, { at: [x, h / 2, face + s * 0.08], color, jitter: 0.06 });
  else {
    // Hanging open on its hinge, the dark of the room behind it.
    b.box(w, h, 0.06, { at: [x, h / 2, face + s * 0.1], color: 0x15120f, jitter: 0 });
    b.box(w, h * 0.98, 0.08, { at: [x - w / 2 + Math.cos(open) * (w / 2), h / 2, face + s * (0.08 + Math.sin(open) * (w / 2))], rot: [0, -s * open, 0], color, jitter: 0.06 });
  }
}

/** A small square window in the wall facing `normal` ([x, z] unit), centred at `at`. */
export function windowOn(b: ModelBuilder, at: Vec3, normal: P2, size: number, glass: number, frame: number): void {
  const yaw = Math.atan2(normal[0], normal[1]);
  const [x, y, z] = at;
  b.box(size + 0.16, size + 0.16, 0.08, { at: [x + normal[0] * 0.02, y, z + normal[1] * 0.02], rot: [0, yaw, 0], color: frame });
  b.box(size, size, 0.08, { at: [x + normal[0] * 0.06, y, z + normal[1] * 0.06], rot: [0, yaw, 0], color: glass, jitter: 0 });
}

/** A stone chimney stack at (x, z) on a roof, from `from` up to `to`. */
export function chimney(b: ModelBuilder, x: number, z: number, from: number, to: number, color: number): void {
  b.box(0.7, to - from, 0.6, { at: [x, (from + to) / 2, z], color, jitter: 0.12 });
  b.box(0.82, 0.14, 0.72, { at: [x, to + 0.07, z], color: PAL.stoneDark });
}

/** How a dry stone wall is laid: height, width at the foot, and its stones' shades. */
export interface WallLook {
  readonly height: number;
  readonly width: number;
  readonly stone: number;
  readonly dark: number;
  /** Dressed stone: square courses and a flat coping, not a rough cap of upright stones. */
  readonly dressed?: boolean;
}

/**
 * A wall along `pts` (world floor points), following the ground: one battered
 * course box a metre or two long per stretch, with a cap. Built in world
 * space, as a fence is (forest/buildings.ts buildFence).
 */
export function wallAlong(b: ModelBuilder, pts: readonly P2[], heightAt: (x: number, z: number) => number, look: WallLook, seed = 1, lite = false): void {
  const rand = mulberry32(seed);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) continue;
    const yaw = Math.atan2(bx - ax, bz - az);
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const y = Math.min(heightAt(ax, az), heightAt(bx, bz), heightAt(mx, mz));
    const h = look.height * (look.dressed ? 1 : 0.92 + rand() * 0.16);
    const shade = rand() < 0.5 ? look.stone : look.dark;
    // Its long axis along its own Z.
    b.taper(look.width, len + 0.04, look.width * 0.7, len + 0.04, h + 0.5, { at: [mx, y - 0.5, mz], rot: [0, yaw, 0], color: shade, jitter: 0.1 });
    if (lite) continue;
    if (look.dressed) b.box(look.width * 0.85, 0.12, len + 0.06, { at: [mx, y + h + 0.06, mz], rot: [0, yaw, 0], color: look.dark, jitter: 0.04 });
    else b.box(look.width * 0.55, 0.22, len, { at: [mx, y + h + 0.1, mz], rot: [0.08 * (rand() - 0.5), yaw, 0], color: look.dark, jitter: 0.2 });
  }
}

/** A post with blank boards pointing each way a road goes (`ways`, radians about +Y from +Z), the boards' names left for later. */
export function signpost(b: ModelBuilder, ways: readonly number[]): void {
  const t: PartOpts = { color: EARTH.bark, jitter: 0.1 };
  b.box(0.16, 2.5, 0.16, { ...t, at: [0, 1.15, 0] });
  ways.forEach((a, i) => {
    const y = 2.2 - i * 0.26;
    b.box(0.08, 0.2, 0.9, { at: [Math.sin(a) * 0.48, y, Math.cos(a) * 0.48], rot: [0, a, 0], color: EARTH.cutWood, jitter: 0.08 });
  });
}

/** A stack of stones travellers have added to, `h` high. */
export function cairn(b: ModelBuilder, h: number, seed: number, stone: number = EARTH.rock, dark: number = EARTH.rockDark): void {
  const rand = mulberry32(seed);
  const layers = Math.max(3, Math.round(h / 0.32));
  for (let i = 0; i < layers; i++) {
    const f = 1 - i / layers;
    const r = 0.25 + f * h * 0.32;
    const n = Math.max(1, Math.round(f * 7));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * PI * 2 + i;
      const s = 0.22 + rand() * 0.2;
      b.box(s * 1.3, s, s, { at: [Math.cos(a) * r * (n > 1 ? 0.75 : 0), i * (h / layers) + s / 2, Math.sin(a) * r * (n > 1 ? 0.75 : 0)], rot: [rand() * 0.3, rand() * PI, rand() * 0.3], color: rand() < 0.5 ? stone : dark, jitter: 0.12 });
    }
  }
}

/** A flat-bottomed boat, `len` long, along its own Z. */
export function punt(b: ModelBuilder, len: number, wood: number = PAL.wood, dark: number = PAL.woodDark): void {
  b.box(1.1, 0.12, len, { at: [0, 0.06, 0], color: dark });
  for (const s of [-1, 1]) b.box(0.08, 0.36, len, { at: [s * 0.55, 0.2, 0], color: wood, jitter: 0.1 });
  for (const s of [-1, 1]) b.box(1.1, 0.3, 0.08, { at: [0, 0.2, s * (len / 2)], rot: [s * 0.4, 0, 0], color: wood });
  b.box(1.0, 0.06, 0.3, { at: [0, 0.3, len * 0.2], color: wood });
}

/** A wooden crate. */
export function crate(b: ModelBuilder, at: Vec3, s: number, yaw: number): void {
  b.box(s, s, s, { at: [at[0], at[1] + s / 2, at[2]], rot: [0, yaw, 0], color: PAL.wood, jitter: 0.08 });
  b.box(s + 0.02, 0.08, s + 0.02, { at: [at[0], at[1] + s * 0.85, at[2]], rot: [0, yaw, 0], color: PAL.woodDark });
}

/** A barrel standing on end. */
export function barrel(b: ModelBuilder, at: Vec3, h = 0.9): void {
  b.cyl(0.32, 0.28, h, 8, { at: [at[0], at[1] + h / 2, at[2]], color: PAL.wood, jitter: 0.08 });
  for (const f of [0.2, 0.8]) b.cyl(0.335, 0.335, 0.06, 8, { at: [at[0], at[1] + h * f, at[2]], color: PAL.ironDark, jitter: 0 });
}

/** A post driven into the ground or the mud, from `y0` up to `y1`. */
export function pile(b: ModelBuilder, x: number, z: number, y0: number, y1: number, r = 0.14, color: number = PAL.woodDark): void {
  b.cyl(r, r * 1.1, y1 - y0, 5, { at: [x, (y0 + y1) / 2, z], color, jitter: 0.12 });
}

/** Planks across a deck `w` wide and `len` long along its own Z, `y` high, laid `gap` apart. */
export function planks(b: ModelBuilder, w: number, len: number, y: number, color: number, gap = 0.04): void {
  const n = Math.max(1, Math.round(len / 0.5));
  const step = len / n;
  for (let i = 0; i < n; i++) b.box(w, 0.08, step - gap, { at: [0, y - 0.04, -len / 2 + step * (i + 0.5)], color, jitter: 0.14 });
}
