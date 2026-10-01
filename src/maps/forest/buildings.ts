import { BufferAttribute, BufferGeometry, Color, DodecahedronGeometry, Euler, IcosahedronGeometry, Matrix4, Vector3 } from 'three';
import { ModelBuilder, type PartOpts, type Vec3 } from '../../models/kit';
import { PAL } from '../../models/palette';
import type { Boulder, Deck, Field, ForestLayout, Structure } from './layout';
import { HOUSE } from './house';
import { INN } from './inn';
import { COTTAGE_CHIMNEY, localToWorld, MAP_BOARD, NORTH_PASS, SIGNPOSTS, type SignpostPlan, standingStones, TENT, worldToLocal } from './layout';
import { MINE } from './mine';
import { lerp, mulberry32 } from './noise';
import { stump } from './nature';
import { SMITHY } from './smithy';
import { BUILD, CROP, EARTH, GREEN, WATER } from './palette';

// Buildings and set pieces, each authored in its own frame: origin on the
// ground at the footprint's centre, front facing +Z. The caller turns and
// places the finished geometry. Timber-framed cottages with slate roofs, a
// thatched farm, a stone watchtower: the same kit and grain as the crypt.

const PI = Math.PI;

export interface StructureContext {
  layout: ForestLayout;
  /** A glow billboard (fake light) at a point in the structure's frame. */
  glow(at: Vec3, size: number, color: number): void;
  /** A separate mesh that turns about its own Z axis (windmill sails), at a point in the structure's frame. */
  spinner(geometry: BufferGeometry, at: Vec3): void;
}

export function buildStructure(s: Structure, ctx: StructureContext): BufferGeometry {
  const b = new ModelBuilder(1 + Math.floor(Math.abs(s.x * 13 + s.z * 7)));
  const rand = mulberry32(Math.floor(Math.abs(s.x * 101 + s.z * 57)) + 1);
  switch (s.kind) {
    case 'inn': inn(b, s, ctx); break;
    case 'house': house(b, s, ctx); break;
    case 'farmhouse': farmhouse(b, s); break;
    case 'smithy': smithy(b, s, ctx); break;
    case 'well': well(b); break;
    case 'signpost': signpost(b, SIGNPOSTS[s.variant]); break;
    case 'mapboard': mapBoard(b); break;
    case 'lamp': lamp(b, ctx); break;
    case 'cart': cart(b); break;
    case 'barn': barn(b, s); break;
    case 'windmill': windmill(b, ctx); break;
    case 'scarecrow': scarecrow(b); break;
    case 'haybale': haybale(b); break;
    case 'trough': trough(b); break;
    case 'tower': tower(b, ctx); break;
    case 'mine': mine(b, ctx, rand); break;
    case 'tent': tent(b, ctx); break;
    case 'campfire': campfire(b, ctx, rand); break;
    case 'logpile': logpile(b); break;
    case 'stones': stones(b, s, rand); break;
    case 'dock': dock(b, ctx.layout.dock); break;
    case 'boat': boat(b); break;
    case 'bridge': bridge(b, ctx.layout.bridge); break;
    case 'cairn': cairn(b, rand); break;
    case 'rockslide': rockslide(b, s, ctx.layout.slide); break;
  }
  return b.build();
}

// ------------------------------------------------------------------ building parts

type Face = 'front' | 'back' | 'left' | 'right';

/** Position and turn for something flat on a wall: `u` along the wall, `y` up it, `out` proud of it. */
function onFace(face: Face, w: number, d: number, u: number, y: number, out: number): { at: Vec3; rot: Vec3 } {
  switch (face) {
    case 'front':
      return { at: [u, y, d / 2 + out], rot: [0, 0, 0] };
    case 'back':
      return { at: [-u, y, -d / 2 - out], rot: [0, PI, 0] };
    case 'right':
      return { at: [w / 2 + out, y, -u], rot: [0, PI / 2, 0] };
    case 'left':
      return { at: [-w / 2 - out, y, u], rot: [0, -PI / 2, 0] };
  }
}

/** Stone footing that runs well below ground, so uneven ground never shows a gap. */
function foundation(b: ModelBuilder, w: number, d: number, top: number, color: number = PAL.stoneDark): void {
  b.box(w, 1.6 + top, d, { at: [0, (top - 1.6) / 2, 0], color });
}

/**
 * A gable roof with its ridge along X: plaster gable ends and two slabs that
 * overhang. With `ends`, the gable ends are that thick and the roof is hollow
 * under its slopes, for a building you can look up into.
 */
function gable(b: ModelBuilder, w: number, d: number, top: number, rise: number, over: number, roof: number, gableColor: number, thick = 0.16, ends?: number): void {
  if (ends === undefined) b.taper(w, d, w, 0.04, rise, { at: [0, top, 0], color: gableColor });
  else for (const s of [-1, 1]) b.taper(ends, d, ends, 0.04, rise, { at: [s * (w / 2 - ends / 2), top, 0], color: gableColor });
  const half = d / 2 + over;
  const theta = Math.atan2(rise, d / 2);
  const len = half / Math.cos(theta);
  const drop = over * Math.tan(theta);
  for (const side of [-1, 1]) {
    b.box(w + 2 * over, thick, len + 0.12, {
      at: [0, (top - drop + top + rise) / 2 + thick / 2, (side * half) / 2],
      rot: [side * theta, 0, 0],
      color: roof,
      jitter: 0.1,
    });
  }
  b.box(w + 2 * over, 0.16, 0.34, { at: [0, top + rise + thick * 0.6, 0], color: roof === BUILD.thatch ? BUILD.thatchDark : BUILD.slateDark });
}

/**
 * Dark timbers over a plaster storey: corner posts, sill and head beams, and a
 * few braces. A `doorway` in the front (its middle and width) is left clear.
 */
function frame(b: ModelBuilder, w: number, d: number, y0: number, h: number, doorway?: { x: number; width: number }): void {
  const t: PartOpts = { color: BUILD.timber, jitter: 0.1 };
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) b.box(0.24, h, 0.24, { ...t, at: [x, y0 + h / 2, z] });
  const [gapL, gapR] = doorway ? [doorway.x - doorway.width / 2 - 0.12, doorway.x + doorway.width / 2 + 0.12] : [Infinity, -Infinity];
  for (const z of [-d / 2 - 0.03, d / 2 + 0.03]) {
    b.box(w, 0.18, 0.08, { ...t, at: [0, y0 + h - 0.09, z] });
    if (z < 0 || !doorway) b.box(w, 0.18, 0.08, { ...t, at: [0, y0 + 0.09, z] });
    else {
      b.box(gapL + w / 2, 0.18, 0.08, { ...t, at: [(gapL - w / 2) / 2, y0 + 0.09, z] });
      b.box(w / 2 - gapR, 0.18, 0.08, { ...t, at: [(gapR + w / 2) / 2, y0 + 0.09, z] });
    }
  }
  for (const x of [-w / 2 - 0.03, w / 2 + 0.03]) {
    b.box(0.08, 0.18, d, { ...t, at: [x, y0 + 0.09, 0] }).box(0.08, 0.18, d, { ...t, at: [x, y0 + h - 0.09, 0] });
  }
  // Studs and braces on the long walls.
  const bays = Math.max(2, Math.round(w / 2.2));
  for (let i = 1; i < bays; i++) {
    const x = -w / 2 + (i * w) / bays;
    for (const z of [-d / 2 - 0.03, d / 2 + 0.03]) if (z < 0 || x < gapL - 0.08 || x > gapR + 0.08) b.box(0.16, h, 0.08, { ...t, at: [x, y0 + h / 2, z] });
  }
  for (const z of [-d / 2 - 0.04, d / 2 + 0.04]) {
    const x0 = -w / 2 + 0.1;
    const x1 = -w / 2 + w / bays - 0.1;
    b.bar([x0, y0 + 0.15, z], [x1, y0 + h - 0.15, z], 0.12, 0.07, t);
    b.bar([-x0, y0 + 0.15, z], [-x1, y0 + h - 0.15, z], 0.12, 0.07, t);
  }
  // Short braces on the gable walls.
  for (const x of [-w / 2 - 0.04, w / 2 + 0.04]) {
    b.bar([x, y0 + 0.15, -d / 2 + 0.2], [x, y0 + h - 0.15, -d / 2 + 1.4], 0.07, 0.12, t);
    b.bar([x, y0 + 0.15, d / 2 - 0.2], [x, y0 + h - 0.15, d / 2 - 1.4], 0.07, 0.12, t);
  }
}

function windowOn(b: ModelBuilder, face: Face, w: number, d: number, u: number, y: number, warm = false): void {
  const glass = onFace(face, w, d, u, y, 0.06);
  const trim = onFace(face, w, d, u, y, 0.03);
  const sill = onFace(face, w, d, u, y - 0.52, 0.1);
  b.box(1.0, 1.08, 0.06, { ...trim, color: BUILD.timber })
    .box(0.8, 0.9, 0.05, { ...glass, color: warm ? BUILD.warmWindow : BUILD.window, glow: warm ? 0.35 : 0, jitter: 0.03 })
    .box(0.06, 0.9, 0.08, { ...glass, color: BUILD.timber })
    .box(0.8, 0.06, 0.08, { ...glass, color: BUILD.timber })
    .box(1.1, 0.08, 0.18, { ...sill, color: BUILD.timber });
}

function doorOn(b: ModelBuilder, face: Face, w: number, d: number, u: number, y0: number, width = 1.1, color: number = BUILD.plank): void {
  const panel = onFace(face, w, d, u, y0 + 1.05, 0.05);
  const trim = onFace(face, w, d, u, y0 + 1.1, 0.02);
  b.box(width + 0.28, 2.3, 0.08, { ...trim, color: BUILD.timber })
    .box(width, 2.1, 0.06, { ...panel, color, jitter: 0.12 });
  const handle = onFace(face, w, d, u + width * 0.32, y0 + 1.05, 0.1);
  b.box(0.06, 0.06, 0.06, { ...handle, color: PAL.ironDark, jitter: 0 });
}

function chimney(b: ModelBuilder, x: number, z: number, from: number, to: number): void {
  b.box(0.8, to - from, 0.8, { at: [x, (from + to) / 2, z], color: PAL.stoneDark, jitter: 0.12 })
    .box(0.95, 0.2, 0.95, { at: [x, to, z], color: PAL.stone });
}

function barrel(b: ModelBuilder, x: number, z: number, y = 0): void {
  b.cyl(0.32, 0.28, 0.85, 8, { at: [x, y + 0.425, z], color: PAL.wood })
    .cyl(0.335, 0.335, 0.05, 8, { at: [x, y + 0.2, z], color: PAL.ironDark })
    .cyl(0.335, 0.335, 0.05, 8, { at: [x, y + 0.66, z], color: PAL.ironDark });
}

function crate(b: ModelBuilder, x: number, z: number, s: number, yaw: number, y = 0): void {
  b.box(s, s, s, { at: [x, y + s / 2, z], rot: [0, yaw, 0], color: PAL.wood })
    .box(s + 0.02, 0.08, s + 0.02, { at: [x, y + s * 0.8, z], rot: [0, yaw, 0], color: PAL.woodDark })
    .box(s + 0.02, 0.08, s + 0.02, { at: [x, y + s * 0.2, z], rot: [0, yaw, 0], color: PAL.woodDark });
}

// ------------------------------------------------------------------ the village

/**
 * Two storeys: a stone ground floor, a jettied timber-framed upper floor, a
 * tall slate roof. The ground floor's walls stand round the taproom, with a
 * real doorway in the front; the door itself, its frame and the room are the
 * interior's (innModel.ts). Faces point outwards, so from inside the walls vanish.
 */
function inn(b: ModelBuilder, s: Structure, ctx: StructureContext): void {
  const w = s.hw * 2;
  const d = s.hd * 2;
  foundation(b, w + 0.4, d + 0.4, 0.3);
  const t = INN.wall;
  const stone: PartOpts = { color: PAL.stone, jitter: 0.1 };
  const gap = INN.door.width / 2 + 0.1; // the frame's jambs cover the walls' ends
  const lintel = 0.3 + INN.door.height + 0.1;
  b.box(w, 3, t, { ...stone, at: [0, 1.8, -d / 2 + t / 2] })
    .box(t, 3, d - 2 * t, { ...stone, at: [-w / 2 + t / 2, 1.8, 0] })
    .box(t, 3, d - 2 * t, { ...stone, at: [w / 2 - t / 2, 1.8, 0] })
    .box(w / 2 - gap, 3, t, { ...stone, at: [-(w / 2 + gap) / 2, 1.8, d / 2 - t / 2] })
    .box(w / 2 - gap, 3, t, { ...stone, at: [(w / 2 + gap) / 2, 1.8, d / 2 - t / 2] })
    .box(2 * gap, 3.3 - lintel, t, { ...stone, at: [0, (lintel + 3.3) / 2, d / 2 - t / 2] });
  // The doorway's timber frame, lining the walls' ends down to where the leaves hang.
  const frameDepth = d / 2 + 0.04 - (INN.leaves.z - INN.leaves.thick);
  const frameZ = d / 2 + 0.04 - frameDepth / 2;
  const top = 0.3 + INN.door.height + 0.12;
  for (const side of [-1, 1]) b.box(0.12, top - 0.3, frameDepth, { at: [side * (INN.door.width / 2 + 0.06), (top + 0.3) / 2, frameZ], color: BUILD.timber, jitter: 0.1 });
  b.box(INN.door.width + 0.24, 0.13, frameDepth, { at: [0, top - 0.065, frameZ], color: BUILD.timber, jitter: 0.1 });
  const y1 = 3.3;
  const h1 = 2.7;
  const W = w + 0.4;
  const D = d + 0.4;
  b.box(W, h1, D, { at: [0, y1 + h1 / 2, 0], color: BUILD.plaster, jitter: 0.04 });
  b.box(W + 0.1, 0.22, D + 0.1, { at: [0, y1, 0], color: BUILD.timber });
  frame(b, W, D, y1, h1);
  gable(b, W, D, y1 + h1, 3.6, 0.6, BUILD.slate, BUILD.plaster);
  for (const c of INN.chimneys) chimney(b, c.x, c.z, y1 + h1, c.top);
  // A dormer window in each roof slope.
  for (const x of [-2.6, 2.6]) {
    b.box(1.4, 1.4, 1.6, { at: [x, y1 + h1 + 1.0, D / 2 - 0.9], color: BUILD.plaster })
      .taper(1.8, 1.9, 1.8, 0.04, 0.8, { at: [x, y1 + h1 + 1.7, D / 2 - 0.9], color: BUILD.slate });
    windowOn(b, 'front', 1.4, D - 0.1, x, y1 + h1 + 1.0, true);
  }

  // Ground floor: a wide doorway under a little porch roof, windows either side.
  for (const u of [-3.4, 3.4]) windowOn(b, 'front', w, d, u, 1.9, true);
  for (const u of [-2.2, 2.2]) {
    windowOn(b, 'left', w, d, u, 1.9, true);
    windowOn(b, 'right', w, d, u, 1.9);
    windowOn(b, 'back', w, d, u, 1.9);
  }
  for (const u of [-4, -1.4, 1.4, 4]) windowOn(b, 'front', W, D, u, y1 + 1.35, u > 0);
  for (const u of [-2, 2]) {
    windowOn(b, 'left', W, D, u, y1 + 1.35);
    windowOn(b, 'right', W, D, u, y1 + 1.35, true);
  }
  b.box(3.2, 0.14, 1.6, { at: [0, 2.85, d / 2 + 0.75], rot: [0.25, 0, 0], color: BUILD.slate });
  for (const x of [-1.45, 1.45]) b.box(0.16, 2.6, 0.16, { at: [x, 1.6, d / 2 + 1.45], color: BUILD.timber });
  // Steps up to the door.
  b.box(2.6, 0.2, 0.8, { at: [0, 0.2, d / 2 + 0.5], color: PAL.stone }).box(2.6, 0.2, 0.5, { at: [0, 0.05, d / 2 + 1.0], color: PAL.stoneDark });

  // The sign: an iron bracket and a hanging board with a gold tankard.
  const sx = 3.6;
  b.box(0.08, 0.08, 1.4, { at: [sx, 3.05, d / 2 + 0.7], color: PAL.ironDark })
    .box(0.03, 0.3, 0.03, { at: [sx, 2.85, d / 2 + 0.55], color: PAL.ironDark })
    .box(0.03, 0.3, 0.03, { at: [sx, 2.85, d / 2 + 1.25], color: PAL.ironDark })
    .box(0.08, 0.75, 1.0, { at: [sx, 2.35, d / 2 + 0.9], color: BUILD.plank })
    .box(0.1, 0.3, 0.22, { at: [sx, 2.35, d / 2 + 0.9], color: PAL.gold, jitter: 0 })
    .box(0.1, 0.12, 0.08, { at: [sx, 2.38, d / 2 + 1.06], color: PAL.gold, jitter: 0 });
  // Lanterns either side of the door.
  for (const x of [-1.25, 1.25]) {
    b.box(0.2, 0.28, 0.2, { at: [x, 2.3, d / 2 + 0.2], color: PAL.ironDark })
      .box(0.14, 0.2, 0.14, { at: [x, 2.3, d / 2 + 0.2], color: 0xffd080, glow: 1, jitter: 0 });
    ctx.glow([x, 2.3, d / 2 + 0.3], 0.7, 0xffb050);
  }
  // Barrels, crates and a bench by the front.
  barrel(b, -4.6, d / 2 + 0.6);
  barrel(b, -3.95, d / 2 + 0.9);
  barrel(b, -4.3, d / 2 + 0.7, 0.85);
  crate(b, 4.8, d / 2 + 0.7, 0.7, 0.3);
  crate(b, 4.75, d / 2 + 0.7, 0.5, 0.9, 0.7);
  b.box(2.0, 0.08, 0.4, { at: [-2.2, 0.48, d / 2 + 0.55], color: BUILD.plank })
    .box(0.1, 0.44, 0.34, { at: [-3.0, 0.22, d / 2 + 0.55], color: BUILD.timber })
    .box(0.1, 0.44, 0.34, { at: [-1.4, 0.22, d / 2 + 0.55], color: BUILD.timber });
}

/**
 * A one-storey cottage with an attic. Variants change the roof and walls. The
 * house by the well (variant 0) opens: its walls stand round its room with a
 * real doorway, and its roof is hollow over it; the door itself and the room
 * are the interior's (houseModel.ts). Faces point outwards, so from inside the
 * walls vanish.
 */
function house(b: ModelBuilder, s: Structure, ctx: StructureContext): void {
  const w = s.hw * 2;
  const d = s.hd * 2;
  const thatched = s.variant === 1;
  const opens = s.variant === 0;
  // Every cottage has the house by the well's walls and roof, so the room inside it fits.
  const y0 = HOUSE.base;
  const h = HOUSE.eaves - y0;
  foundation(b, w + 0.3, d + 0.3, y0);
  const { door } = HOUSE;
  if (s.variant === 1) {
    b.box(w, 1.1, d, { at: [0, y0 + 0.55, 0], color: PAL.stone });
    b.box(w - 0.02, h - 1.1, d - 0.02, { at: [0, y0 + 1.1 + (h - 1.1) / 2, 0], color: BUILD.plasterShade });
  } else if (opens) {
    const t = HOUSE.wall;
    const plaster: PartOpts = { color: BUILD.plaster, jitter: 0.04 };
    const left = door.x - door.width / 2 - 0.1; // the frame's jambs cover the walls' ends
    const right = door.x + door.width / 2 + 0.1;
    const lintel = HOUSE.floor + door.height + 0.1;
    b.box(w, h, t, { ...plaster, at: [0, y0 + h / 2, -d / 2 + t / 2] })
      .box(t, h, d - 2 * t, { ...plaster, at: [-w / 2 + t / 2, y0 + h / 2, 0] })
      .box(t, h, d - 2 * t, { ...plaster, at: [w / 2 - t / 2, y0 + h / 2, 0] })
      .box(left + w / 2, h, t, { ...plaster, at: [(left - w / 2) / 2, y0 + h / 2, d / 2 - t / 2] })
      .box(w / 2 - right, h, t, { ...plaster, at: [(right + w / 2) / 2, y0 + h / 2, d / 2 - t / 2] })
      .box(right - left, y0 + h - lintel, t, { ...plaster, at: [door.x, (lintel + y0 + h) / 2, d / 2 - t / 2] });
    // The doorway's timber frame, lining the walls' ends down to where the leaf hangs.
    const frameDepth = d / 2 + 0.04 - (HOUSE.leaves.z - HOUSE.leaves.thick);
    const frameZ = d / 2 + 0.04 - frameDepth / 2;
    const top = HOUSE.floor + door.height + 0.12;
    for (const side of [-1, 1]) b.box(0.12, top - y0, frameDepth, { at: [door.x + side * (door.width / 2 + 0.06), (top + y0) / 2, frameZ], color: BUILD.timber, jitter: 0.1 });
    b.box(door.width + 0.24, 0.13, frameDepth, { at: [door.x, top - 0.065, frameZ], color: BUILD.timber, jitter: 0.1 });
  } else {
    b.box(w, h, d, { at: [0, y0 + h / 2, 0], color: s.variant === 2 ? BUILD.plasterShade : BUILD.plaster, jitter: 0.04 });
  }
  frame(b, w, d, y0, h, opens ? door : undefined);
  gable(b, w, d, y0 + h, thatched ? 2.8 : HOUSE.rise, 0.5, thatched ? BUILD.thatch : BUILD.slate, BUILD.plaster, thatched ? 0.35 : 0.16, opens ? HOUSE.wall : undefined);
  // The house by the well's chimney stands at its gable end, over the hearth in the room's back corner.
  if (opens) chimney(b, HOUSE.chimney.x, HOUSE.hearth.z, y0 + h, y0 + h + HOUSE.chimney.rise);
  else if (!thatched) chimney(b, w / 2 - COTTAGE_CHIMNEY.inset, COTTAGE_CHIMNEY.z, y0 + h, y0 + h + COTTAGE_CHIMNEY.rise);
  if (!opens) doorOn(b, 'front', w, d, 0.9, y0);
  windowOn(b, 'front', w, d, -1.4, y0 + 1.5, s.variant === 0);
  windowOn(b, 'left', w, d, 0, y0 + 1.5);
  windowOn(b, 'right', w, d, 0, y0 + 1.5, true);
  windowOn(b, 'back', w, d, 0.8, y0 + 1.5);
  windowOn(b, 'front', w, d, 0, y0 + h + 0.7);
  if (opens) {
    // Steps up to the door.
    b.box(HOUSE.steps.width, 0.2, 0.5, { at: [door.x, 0.2, d / 2 + 0.25], color: PAL.stone }).box(HOUSE.steps.width, 0.2, 0.45, {
      at: [door.x, 0.05, d / 2 + 0.72],
      color: PAL.stoneDark,
    });
  } else b.box(1.4, 0.18, 0.6, { at: [0.9, 0.2, d / 2 + 0.35], color: PAL.stone });
  // Flower boxes and a woodpile.
  b.box(1.0, 0.18, 0.2, { at: [-1.4, y0 + 0.85, d / 2 + 0.18], color: BUILD.plank });
  for (let i = 0; i < 4; i++) b.box(0.1, 0.1, 0.1, { at: [-1.75 + i * 0.23, y0 + 1.0, d / 2 + 0.18], color: [0xd84a3a, 0xf0d040][i % 2], jitter: 0 });
  for (let i = 0; i < 3; i++) {
    b.cyl(0.12, 0.12, 1.3, 6, { at: [-w / 2 - 0.35, 0.14 + i * 0.22, d / 2 - 1.0 - (i % 2) * 0.12], rot: [PI / 2, 0, 0], color: EARTH.bark });
  }
  if (opens) {
    // The lantern at the door, on an iron bracket.
    const lx = door.x + 0.85;
    const ly = y0 + 2.15;
    b.box(0.04, 0.04, 0.3, { at: [lx, ly + 0.25, d / 2 + 0.12], color: PAL.ironDark, jitter: 0 })
      .box(0.03, 0.12, 0.03, { at: [lx, ly + 0.2, d / 2 + 0.26], color: PAL.ironDark, jitter: 0 })
      .box(0.2, 0.28, 0.2, { at: [lx, ly, d / 2 + 0.26], color: PAL.ironDark })
      .box(0.14, 0.2, 0.14, { at: [lx, ly, d / 2 + 0.26], color: 0xffd080, glow: 1, jitter: 0 });
    ctx.glow([lx, ly, d / 2 + 0.36], 0.6, 0xffb050);
  }
}

function farmhouse(b: ModelBuilder, s: Structure): void {
  const w = s.hw * 2;
  const d = s.hd * 2;
  foundation(b, w + 0.3, d + 0.3, 0.35, PAL.stone);
  const y0 = 0.35;
  const h = 3.0;
  b.box(w, h, d, { at: [0, y0 + h / 2, 0], color: BUILD.plaster, jitter: 0.05 });
  frame(b, w, d, y0, h);
  gable(b, w, d, y0 + h, 3.1, 0.6, BUILD.thatch, BUILD.plasterShade, 0.4);
  chimney(b, -w / 2 + 0.8, 0.6, y0 + h, y0 + h + 3.6);
  doorOn(b, 'front', w, d, -0.6, y0);
  for (const u of [-2.4, 1.4, 2.8]) windowOn(b, 'front', w, d, u, y0 + 1.6, u > 2);
  windowOn(b, 'left', w, d, 0.8, y0 + 1.6);
  windowOn(b, 'right', w, d, -0.8, y0 + 1.6);
  // Porch.
  b.box(4.2, 0.14, 1.8, { at: [-0.6, y0 + 2.7, d / 2 + 0.9], rot: [0.22, 0, 0], color: BUILD.thatchDark });
  for (const x of [-2.5, 1.3]) b.box(0.16, 2.8, 0.16, { at: [x, y0 + 1.3, d / 2 + 1.65], color: BUILD.timber });
  b.box(4.0, 0.14, 1.8, { at: [-0.6, 0.3, d / 2 + 0.95], color: BUILD.plank });
  barrel(b, 2.2, d / 2 + 0.6);
}

/**
 * The smithy: an open-fronted lean-to with a stone forge, an anvil and a rack
 * of blades. You walk in under its roof (smithy.ts says what you bump into);
 * its floor is flagstones flush with the levelled ground.
 */
function smithy(b: ModelBuilder, s: Structure, ctx: StructureContext): void {
  const w = s.hw * 2;
  const d = s.hd * 2;
  const { back: bw, side, posts, forge, anvil, bellows, barrel: quench, grindstone: grind, crate: spare } = SMITHY;
  b.box(w, 0.3, d, { at: [0, -0.11, 0], color: PAL.stoneDark });
  b.box(w, 2.4, bw, { at: [0, 1.2, -d / 2 + bw / 2], color: PAL.stone, jitter: 0.12 });
  b.box(side, 1.2, d - bw, { at: [-w / 2 + side / 2, 0.6, bw / 2], color: PAL.stone, jitter: 0.12 });
  const back = 4.0;
  const front = 3.1;
  for (const x of [-w / 2 + posts.inset, 0, w / 2 - posts.inset]) {
    b.box(posts.size, back, posts.size, { at: [x, back / 2, -d / 2 + posts.inset], color: BUILD.timber })
      .box(posts.size, front, posts.size, { at: [x, front / 2, d / 2 - posts.inset], color: BUILD.timber });
  }
  const theta = Math.atan2(back - front, d);
  b.box(w + 0.8, 0.14, Math.hypot(d, back - front) + 1.0, { at: [0, (back + front) / 2 + 0.08, 0], rot: [theta, 0, 0], color: BUILD.slate });
  b.box(w, 0.2, 0.2, { at: [0, front - 0.1, d / 2 - posts.inset], color: BUILD.timber });
  // Forge, hood and chimney.
  const fx = forge.x;
  const fz = forge.z;
  b.box(2 * forge.hw, 0.95, 2 * forge.hd, { at: [fx, 0.48, fz], color: PAL.stone, jitter: 0.12 })
    .box(1.3, 0.06, 0.9, { at: [fx, 0.97, fz], color: PAL.coal, glow: 0.85, jitter: 0.2 })
    .taper(1.8, 1.4, 0.8, 0.8, 1.1, { at: [fx, 2.0, fz], color: PAL.stoneDark })
    .box(0.8, SMITHY.flue - 3.0, 0.8, { at: [fx, (SMITHY.flue + 3.0) / 2, fz], color: PAL.stoneDark });
  ctx.glow([fx, 1.2, fz + 0.3], 1.1, 0xff7a2a);
  // The bellows on a stand at the forge's side, nozzle into the fire, their handle standing up off the far end.
  const { x: bx, z: bz, hw: bhw, hd: bhd, handle } = bellows;
  for (const dx of [-bhw + 0.08, bhw - 0.08]) b.box(0.08, 0.5, 2 * bhd - 0.04, { at: [bx + dx, 0.25, bz], color: BUILD.timber });
  b.box(2 * bhw, 0.04, 2 * bhd, { at: [bx, 0.52, bz], color: BUILD.plank })
    .taper(2 * bhw - 0.12, 2 * bhd - 0.04, 2 * bhw - 0.12, 2 * bhd - 0.1, 0.14, { at: [bx + 0.02, 0.54, bz], color: PAL.leatherDark })
    .box(2 * bhw - 0.04, 0.035, 2 * bhd - 0.02, { at: [bx + 0.02, 0.7, bz], rot: [0, 0, -0.08], color: BUILD.plank })
    .cone(0.05, 0.16, 5, { at: [bx - bhw - 0.04, 0.57, bz], rot: [0, 0, PI / 2], color: PAL.ironDark })
    .box(0.05, handle.y - 0.7, 0.05, { at: [handle.x, (handle.y + 0.7) / 2, handle.z], color: BUILD.timber })
    .box(0.05, 0.05, 0.22, { at: [handle.x, handle.y, handle.z], color: PAL.leatherDark });
  // Anvil on a stump, a quench barrel, a grindstone.
  stump(b, anvil.x, 0, anvil.z, 1);
  b.box(0.5, 0.16, 0.2, { at: [anvil.x, 0.66, anvil.z], color: PAL.ironDark })
    .box(0.26, 0.12, 0.16, { at: [anvil.x, 0.55, anvil.z], color: PAL.ironDark })
    .cone(0.08, 0.26, 4, { at: [anvil.x + 0.36, 0.68, anvil.z], rot: [0, 0, -PI / 2], color: PAL.ironDark });
  barrel(b, quench.x, quench.z);
  b.box(0.8, 0.02, 0.8, { at: [quench.x, 0.83, quench.z], color: WATER.deep, jitter: 0 });
  b.cyl(0.4, 0.4, 0.14, 10, { at: [grind.x, 0.8, grind.z], rot: [PI / 2, 0, 0], color: PAL.stoneLight })
    .box(0.1, 0.8, 0.1, { at: [grind.x, 0.4, grind.z + 0.15], color: BUILD.timber })
    .box(0.1, 0.8, 0.1, { at: [grind.x, 0.4, grind.z - 0.15], color: BUILD.timber });
  // Blades on the back wall.
  for (let i = 0; i < 4; i++) {
    const x = -0.6 + i * 0.45;
    b.box(0.06, 1.1, 0.02, { at: [x, 1.35, -d / 2 + 0.47], color: PAL.steel, jitter: 0.03 })
      .box(0.2, 0.04, 0.04, { at: [x, 0.8, -d / 2 + 0.48], color: PAL.gold })
      .box(0.04, 0.2, 0.04, { at: [x, 0.68, -d / 2 + 0.48], color: PAL.leatherDark });
  }
  b.box(2.2, 0.08, 0.12, { at: [0.1, 0.9, -d / 2 + 0.5], color: BUILD.timber });
  crate(b, spare.x, spare.z, 0.6, 0.2);
}

function well(b: ModelBuilder): void {
  b.cyl(0.95, 1.0, 0.85, 10, { at: [0, 0.42, 0], color: PAL.stone, jitter: 0.12 })
    .cyl(1.02, 1.02, 0.12, 10, { at: [0, 0.88, 0], color: PAL.stoneLight })
    .cyl(0.72, 0.72, 0.04, 10, { at: [0, 0.6, 0], color: 0x1a2a30, jitter: 0 });
  for (const x of [-0.85, 0.85]) b.box(0.14, 2.1, 0.14, { at: [x, 1.05, 0], color: BUILD.timber });
  b.box(1.9, 0.1, 0.1, { at: [0, 1.75, 0], color: BUILD.timber })
    .cyl(0.08, 0.08, 1.5, 6, { at: [0, 1.5, 0], rot: [0, 0, PI / 2], color: PAL.wood })
    .taper(2.1, 1.5, 2.1, 0.04, 0.7, { at: [0, 2.05, 0], color: BUILD.slate })
    .box(0.02, 0.5, 0.02, { at: [0.1, 1.2, 0], color: PAL.leather })
    .cyl(0.14, 0.11, 0.24, 6, { at: [0.1, 0.9, 0.3], color: PAL.wood });
}

/**
 * A post with its boards, each pointing its way with its end cut to a point
 * (built unturned, so local axes are the world's). The names painted on them
 * are one mesh of their own (wayfinding.ts).
 */
function signpost(b: ModelBuilder, plan: SignpostPlan): void {
  const { post, length, height, boards, faded } = plan;
  const wood = faded ? BUILD.weathered : BUILD.timber;
  const plank = faded ? BUILD.weatheredPlank : BUILD.plank;
  // A weathered post leans a little, as it would wedged in a cairn's stones.
  const lean: Vec3 = faded ? [0.06, 0, -0.05] : [0, 0, 0];
  b.box(0.14, post, 0.14, { at: [0, post / 2, 0], rot: lean, color: wood });
  if (!faded) b.cone(0.1, 0.14, 4, { at: [0, post + 0.07, 0], color: wood });
  for (const { a, y } of boards) {
    const dir: Vec3 = [Math.sin(a), 0, Math.cos(a)];
    b.box(length, height, 0.05, { at: [dir[0] * length / 2, y, dir[2] * length / 2], rot: [0, a - PI / 2, 0], color: plank })
      .box(height, height, 0.05, { at: [dir[0] * (length + 0.02), y, dir[2] * (length + 0.02)], rot: [0, a - PI / 2 + PI / 4, 0], color: plank });
  }
}

/** The Old North Pass's rockslide: each boulder an angular lump of fresh grey stone, in the slide's frame. */
function rockslide(b: ModelBuilder, s: Structure, boulders: readonly Boulder[]): void {
  const shades = [EARTH.rock, EARTH.rockDark, PAL.stone, PAL.stoneLight, EARTH.cliff];
  for (const r of boulders) {
    const [lx, lz] = worldToLocal(s, r.x, r.z);
    const g = r.shade < 0.5 ? new IcosahedronGeometry(r.r, 0) : new DodecahedronGeometry(r.r, 0);
    g.scale(1, r.squash, 1.15);
    b.shape(g, { at: [lx, r.y - s.y + r.r * r.squash * 0.5, lz], rot: [r.tilt, r.yaw - s.yaw, r.tilt * 0.5], color: shades[Math.floor(r.shade * shades.length)], jitter: 0.14 });
  }
}

/**
 * The weathered cairn below the Old North Pass: rough stones heaped round a
 * squat core, mossed on top, with the waymark's post wedged in its middle
 * (the waymark is a signpost of its own).
 */
function cairn(b: ModelBuilder, rand: () => number): void {
  const h = NORTH_PASS.cairn.h;
  const layers = 5;
  b.taper(1.3, 1.3, 0.55, 0.55, h * 0.8, { at: [0, -0.1, 0], color: PAL.stoneDark, jitter: 0.12 });
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const r = 0.68 * (1 - t * 0.6);
    const count = Math.max(3, Math.round(7 - i * 1.2));
    for (let k = 0; k < count; k++) {
      const a = (k / count) * PI * 2 + i * 0.7 + rand() * 0.4;
      const s = 0.28 + rand() * 0.14 - t * 0.06;
      b.box(s * 1.3, s * 0.75, s, {
        at: [Math.cos(a) * r, 0.1 + t * h * 0.95, Math.sin(a) * r],
        rot: [(rand() - 0.5) * 0.4, a, (rand() - 0.5) * 0.4],
        color: rand() < 0.5 ? PAL.stone : rand() < 0.5 ? PAL.stoneLight : PAL.stoneDark,
        jitter: 0.18,
      });
    }
  }
  b.box(0.5, 0.12, 0.44, { at: [0.08, h * 0.98, -0.05], rot: [0, 0.5, 0.1], color: GREEN.moss, jitter: 0.2 });
}

/**
 * The map board's frame on two posts, its face leaning back a little; the
 * painted map on its face is a mesh of its own (wayfinding.ts). Its front
 * (+Z) is the side you read.
 */
function mapBoard(b: ModelBuilder): void {
  const { w, h, top, lean } = MAP_BOARD;
  const mid = top - (h / 2) * Math.cos(lean);
  const tilt: Vec3 = [-lean, 0, 0];
  // The backing board and its frame, leaning back about its middle.
  b.box(w + 0.04, h + 0.04, 0.04, { at: [0, mid, -0.03], rot: tilt, color: BUILD.plank });
  const frame = (fw: number, fh: number, x: number, y: number) =>
    b.box(fw, fh, 0.07, { at: [x, mid + y * Math.cos(lean), -0.02 - y * Math.sin(lean)], rot: tilt, color: BUILD.timber });
  frame(w + 0.14, 0.07, 0, h / 2 + 0.035);
  frame(w + 0.14, 0.07, 0, -h / 2 - 0.035);
  frame(0.07, h, -w / 2 - 0.035, 0);
  frame(0.07, h, w / 2 + 0.035, 0);
  // Two posts behind it, and a little roof over it.
  for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) b.box(0.1, top + 0.15, 0.1, { at: [x, (top + 0.15) / 2, -0.19], color: BUILD.timber });
  b.box(w + 0.3, 0.05, 0.4, { at: [0, top + 0.17, -0.1], rot: [0.25, 0, 0], color: BUILD.slate });
}

function lamp(b: ModelBuilder, ctx: StructureContext): void {
  b.box(0.3, 0.3, 0.3, { at: [0, 0.15, 0], color: PAL.stone })
    .box(0.12, 2.7, 0.12, { at: [0, 1.5, 0], color: BUILD.timber })
    .box(0.08, 0.08, 0.6, { at: [0, 2.75, 0.25], color: BUILD.timber })
    .box(0.03, 0.2, 0.03, { at: [0, 2.62, 0.5], color: PAL.ironDark })
    .box(0.24, 0.3, 0.24, { at: [0, 2.35, 0.5], color: PAL.ironDark })
    .box(0.16, 0.22, 0.16, { at: [0, 2.35, 0.5], color: 0xffd080, glow: 1, jitter: 0 })
    .cone(0.2, 0.14, 4, { at: [0, 2.57, 0.5], rot: [0, PI / 4, 0], color: PAL.ironDark });
  ctx.glow([0, 2.35, 0.55], 0.8, 0xffb050);
}

function cart(b: ModelBuilder): void {
  b.box(1.5, 0.12, 2.5, { at: [0, 0.78, 0], color: BUILD.plank });
  for (const x of [-0.72, 0.72]) b.box(0.08, 0.4, 2.5, { at: [x, 1.0, 0], color: PAL.woodDark });
  b.box(1.5, 0.4, 0.08, { at: [0, 1.0, -1.22], color: PAL.woodDark });
  for (const x of [-0.85, 0.85]) {
    b.cyl(0.52, 0.52, 0.1, 10, { at: [x, 0.52, -0.35], rot: [0, 0, PI / 2], color: PAL.wood })
      .cyl(0.12, 0.12, 0.14, 6, { at: [x, 0.52, -0.35], rot: [0, 0, PI / 2], color: PAL.ironDark });
    b.bar([x * 0.55, 0.72, 1.1], [x * 0.45, 0.45, 2.7], 0.08, 0.08, { color: PAL.wood });
  }
  b.box(1.6, 0.08, 0.08, { at: [0, 0.52, -0.35], color: PAL.ironDark });
  crate(b, -0.3, -0.6, 0.6, 0.2, 0.84);
  b.ball(0.3, { at: [0.35, 1.08, 0.4], color: BUILD.canvas }).ball(0.26, { at: [0.3, 1.05, -0.1], color: BUILD.canvas });
}

// ------------------------------------------------------------------ the farm

function barn(b: ModelBuilder, s: Structure): void {
  const w = s.hw * 2;
  const d = s.hd * 2;
  foundation(b, w + 0.2, d + 0.2, 0.25, PAL.stone);
  const h = 4.2;
  b.box(w, h, d, { at: [0, 0.25 + h / 2, 0], color: BUILD.redWood, jitter: 0.08 });
  for (let x = -w / 2 + 0.5; x < w / 2; x += 0.7) {
    for (const z of [-d / 2 - 0.02, d / 2 + 0.02]) b.box(0.06, h, 0.04, { at: [x, 0.25 + h / 2, z], color: 0x6e2c1c, jitter: 0 });
  }
  gable(b, w, d, 0.25 + h, 3.8, 0.5, 0x5a3a26, BUILD.redWood, 0.2);
  // Big doors with cross braces, a hay loft door above.
  for (const side of [-1, 1]) {
    const x = side * 1.1;
    b.box(2.1, 3.2, 0.1, { at: [x, 1.85, d / 2 + 0.06], color: BUILD.plank })
      .bar([x - 0.95, 0.4, d / 2 + 0.13], [x + 0.95, 3.3, d / 2 + 0.13], 0.14, 0.05, { color: 0xe0d6c0 })
      .bar([x + 0.95, 0.4, d / 2 + 0.13], [x - 0.95, 3.3, d / 2 + 0.13], 0.14, 0.05, { color: 0xe0d6c0 });
  }
  b.box(4.6, 0.16, 0.14, { at: [0, 3.5, d / 2 + 0.1], color: 0xe0d6c0 })
    .box(1.6, 1.3, 0.1, { at: [0, 5.3, d / 2 + 0.06], color: 0x2a2018 })
    .box(1.4, 0.3, 0.3, { at: [0, 4.75, d / 2 + 0.15], color: BUILD.thatch })
    .box(0.2, 0.2, 1.4, { at: [0, 6.4, d / 2 + 0.3], color: BUILD.timber });
  // Hay spilling out front.
  for (let i = 0; i < 5; i++) b.box(0.8, 0.12, 0.6, { at: [-0.8 + i * 0.4, 0.3, d / 2 + 0.7 + (i % 2) * 0.3], rot: [0, i, 0], color: BUILD.thatch });
}

function windmill(b: ModelBuilder, ctx: StructureContext): void {
  foundation(b, 4.4, 4.4, 0.2, PAL.stone);
  b.cyl(1.6, 2.3, 8, 8, { at: [0, 4.2, 0], color: BUILD.plaster, jitter: 0.06 })
    .cyl(2.35, 2.35, 0.3, 8, { at: [0, 0.35, 0], color: PAL.stone })
    .cyl(1.75, 1.75, 0.3, 8, { at: [0, 8.2, 0], color: BUILD.timber })
    .cone(2.1, 2.6, 8, { at: [0, 9.6, 0], color: BUILD.thatch, jitter: 0.1 });
  doorOn(b, 'front', 4.4, 4.44, 0, 0.2, 1.0);
  for (const [y, z] of [[3.6, 2.02], [6.2, 1.8]] as const) {
    b.box(0.6, 0.8, 0.08, { at: [0, y, z], rot: [-0.12, 0, 0], color: BUILD.window });
  }
  // The sails turn on a hub above the door.
  const sails = new ModelBuilder(3);
  sails.cyl(0.25, 0.25, 0.8, 8, { at: [0, 0, 0.1], rot: [PI / 2, 0, 0], color: BUILD.timber });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2;
    const dir: Vec3 = [Math.cos(a), Math.sin(a), 0];
    sails.bar([0, 0, 0.3], [dir[0] * 6.2, dir[1] * 6.2, 0.3], 0.18, 0.12, { color: BUILD.timber });
    // Cloth on one side of each arm, with a lattice edge.
    const side: Vec3 = [-dir[1], dir[0], 0];
    const mid = 3.7;
    sails.box(1.3, 4.6, 0.04, {
      at: [dir[0] * mid + side[0] * 0.75, dir[1] * mid + side[1] * 0.75, 0.36],
      rot: [0, 0, a - PI / 2],
      color: BUILD.canvas,
    });
    sails.bar(
      [dir[0] * 1.4 + side[0] * 1.4, dir[1] * 1.4 + side[1] * 1.4, 0.34],
      [dir[0] * 6.0 + side[0] * 1.4, dir[1] * 6.0 + side[1] * 1.4, 0.34],
      0.07,
      0.07,
      { color: BUILD.timber },
    );
  }
  ctx.spinner(sails.build(), [0, 7.4, 2.1]);
}

function scarecrow(b: ModelBuilder): void {
  b.box(0.1, 2.3, 0.1, { at: [0, 1.15, 0], color: PAL.wood })
    .box(1.5, 0.08, 0.08, { at: [0, 1.75, 0], color: PAL.wood })
    .box(0.6, 0.7, 0.26, { at: [0, 1.5, 0], color: BUILD.blue })
    .box(1.3, 0.2, 0.2, { at: [0, 1.75, 0], color: BUILD.blue })
    .box(0.12, 0.18, 0.12, { at: [0.72, 1.62, 0], color: BUILD.thatch })
    .box(0.12, 0.18, 0.12, { at: [-0.72, 1.62, 0], color: BUILD.thatch })
    .ball(0.22, { at: [0, 2.12, 0], color: BUILD.canvas })
    .box(0.05, 0.05, 0.02, { at: [-0.07, 2.16, 0.2], color: 0x201810, jitter: 0 })
    .box(0.05, 0.05, 0.02, { at: [0.07, 2.16, 0.2], color: 0x201810, jitter: 0 })
    .cyl(0.4, 0.4, 0.04, 8, { at: [0, 2.3, 0], color: PAL.leather })
    .cone(0.22, 0.34, 6, { at: [0, 2.48, 0], rot: [0.15, 0, 0.1], color: PAL.leather });
}

function haybale(b: ModelBuilder): void {
  b.cyl(0.6, 0.6, 1.7, 9, { at: [0, 0.58, 0], rot: [0, 0, PI / 2], color: BUILD.thatch, jitter: 0.1 });
  for (const x of [-0.45, 0.45]) b.cyl(0.61, 0.61, 0.05, 9, { at: [x, 0.58, 0], rot: [0, 0, PI / 2], color: BUILD.thatchDark });
}

function trough(b: ModelBuilder): void {
  b.box(2.1, 0.5, 0.8, { at: [0, 0.35, 0], color: BUILD.plank })
    .box(1.9, 0.02, 0.6, { at: [0, 0.55, 0], color: WATER.shallow, jitter: 0 });
  for (const x of [-0.8, 0.8]) b.box(0.12, 0.2, 0.9, { at: [x, 0.1, 0], color: BUILD.timber });
}

/** A field's tilled bed: how far above the ground it's laid, how far it runs past its crops, and its furrows' spacing. */
const BED = { lift: 0.05, margin: 0.4, furrow: 0.375, piece: 3.5 } as const;

/**
 * The bed a field's crops grow in: furrows along its rows (alternate ridges
 * and troughs), its margin half grown over, laid over the ground in pieces up
 * to `piece` m long (the fields lie on ground that's all but flat). Its edges
 * are the field's own, square and straight, not the ground's triangles.
 */
function soilBed(b: ModelBuilder, f: Field, heightAt: (x: number, z: number) => number): void {
  const { lift, margin, furrow, piece } = BED;
  const across = (half: number, step: number) => {
    const n = Math.max(1, Math.round((half * 2) / step));
    return [-half - margin, ...Array.from({ length: n + 1 }, (_, i) => -half + (i * half * 2) / n), half + margin];
  };
  const [xs, zs] = [across(f.hw, piece), across(f.hd, furrow)];
  const at = (lx: number, lz: number) => {
    const [x, z] = localToWorld(f, lx, lz);
    return [x, heightAt(x, z) + lift, z];
  };
  const ridge: number[] = [];
  const trough: number[] = [];
  const rim: number[] = [];
  for (let j = 0; j < zs.length - 1; j++) {
    for (let i = 0; i < xs.length - 1; i++) {
      const edge = j === 0 || j === zs.length - 2 || i === 0 || i === xs.length - 2;
      const [p, q, r, s] = [at(xs[i], zs[j]), at(xs[i + 1], zs[j]), at(xs[i], zs[j + 1]), at(xs[i + 1], zs[j + 1])];
      (edge ? rim : j % 2 ? trough : ridge).push(...p, ...r, ...q, ...q, ...r, ...s);
    }
  }
  const rimColour = new Color(EARTH.soil).lerp(new Color(GREEN.grass), 0.35).getHex();
  for (const [pts, color] of [[ridge, EARTH.soil], [trough, EARTH.soilDark], [rim, rimColour]] as const) {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
    b.shape(g, { color, jitter: 0.05 });
  }
}

export function buildField(b: ModelBuilder, f: Field, heightAt: (x: number, z: number) => number): void {
  const rand = mulberry32(Math.floor(f.x * 31 + f.z * 17));
  soilBed(b, f, heightAt);
  const place = (lx: number, lz: number): Vec3 => {
    const [x, z] = localToWorld(f, lx, lz);
    return [x, heightAt(x, z) + BED.lift, z];
  };
  if (f.crop === 'wheat') {
    for (let lz = -f.hd + 0.4; lz <= f.hd - 0.3; lz += 0.75) {
      for (let lx = -f.hw + 0.8; lx < f.hw; lx += 1.6) {
        const [x, y, z] = place(lx, lz);
        const h = 0.85 + rand() * 0.25;
        b.box(1.55, h, 0.34, { at: [x, y + h / 2, z], rot: [0, f.yaw, 0], color: CROP.wheat, jitter: 0.1 })
          .box(1.5, 0.14, 0.4, { at: [x, y + h + 0.03, z], rot: [0, f.yaw, 0], color: CROP.wheatDark, jitter: 0.1 });
      }
    }
  } else if (f.crop === 'pumpkin') {
    for (let lz = -f.hd + 0.6; lz <= f.hd - 0.4; lz += 1.3) {
      for (let lx = -f.hw + 0.6; lx < f.hw - 0.4; lx += 1.1) {
        const [x, y, z] = place(lx + (rand() - 0.5) * 0.3, lz);
        b.box(0.6, 0.04, 0.5, { at: [x + 0.3, y + 0.04, z + 0.2], rot: [0, rand() * PI, 0], color: CROP.stem });
        if (rand() < 0.35) continue;
        const r = 0.22 + rand() * 0.14;
        const g = new IcosahedronGeometry(r, 1);
        g.scale(1.1, 0.75, 1.1);
        b.shape(g, { at: [x, y + r * 0.6, z], rot: [0, rand() * PI, 0], color: CROP.pumpkin, jitter: 0.06 })
          .box(0.05, 0.12, 0.05, { at: [x, y + r * 1.3, z], rot: [0.3, 0, 0.2], color: CROP.stem, jitter: 0 });
      }
    }
  } else {
    for (let lz = -f.hd + 0.4; lz <= f.hd - 0.3; lz += 0.8) {
      for (let lx = -f.hw + 0.4; lx < f.hw - 0.3; lx += 0.7) {
        const [x, y, z] = place(lx, lz);
        b.ball(0.2 + rand() * 0.05, { at: [x, y + 0.14, z], color: rand() < 0.5 ? CROP.cabbage : GREEN.young[0], jitter: 0.12 });
      }
    }
  }
}

export function buildFence(b: ModelBuilder, pts: readonly (readonly [number, number])[], heightAt: (x: number, z: number) => number): void {
  const posts: Vec3[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 2.3));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n;
      const z = z0 + ((z1 - z0) * k) / n;
      posts.push([x, heightAt(x, z), z]);
    }
  }
  for (let i = 0; i < posts.length; i++) {
    const [x, y, z] = posts[i];
    b.box(0.13, 1.15, 0.13, { at: [x, y + 0.52, z], color: PAL.wood });
    if (i === 0) continue;
    const [px, py, pz] = posts[i - 1];
    for (const h of [0.45, 0.88]) b.bar([px, py + h, pz], [x, y + h, z], 0.06, 0.1, { color: PAL.woodDark });
  }
}

// ------------------------------------------------------------------ out in the woods

function tower(b: ModelBuilder, ctx: StructureContext): void {
  b.cyl(3.5, 3.8, 2.6, 10, { at: [0, -0.7, 0], color: PAL.stoneDark })
    .cyl(3.0, 3.3, 11, 10, { at: [0, 6.0, 0], color: PAL.stone, jitter: 0.1 })
    .cyl(3.25, 3.25, 0.35, 10, { at: [0, 11.6, 0], color: PAL.stoneLight })
    .cyl(3.3, 3.3, 0.9, 10, { at: [0, 12.2, 0], color: PAL.stone });
  for (let i = 0; i < 10; i++) {
    const a = ((i + 0.5) / 10) * PI * 2;
    b.box(0.95, 0.8, 0.55, { at: [Math.sin(a) * 3.1, 13.05, Math.cos(a) * 3.1], rot: [0, a, 0], color: PAL.stone });
  }
  // A banner on a pole.
  b.box(0.12, 4.5, 0.12, { at: [0, 14.4, 0], color: BUILD.timber })
    .box(0.05, 1.6, 1.1, { at: [0, 15.6, 0.6], color: BUILD.blue })
    .box(0.07, 0.5, 0.5, { at: [0, 15.7, 0.6], rot: [PI / 4, 0, 0], color: PAL.gold });
  // Door with a stone arch, arrow slits all round.
  b.box(1.5, 2.5, 0.3, { at: [0, 1.25, 3.2], color: BUILD.plank })
    .box(2.0, 0.4, 0.45, { at: [0, 2.65, 3.18], color: PAL.stoneLight })
    .box(0.35, 2.6, 0.45, { at: [-0.95, 1.3, 3.15], color: PAL.stoneLight })
    .box(0.35, 2.6, 0.45, { at: [0.95, 1.3, 3.15], color: PAL.stoneLight })
    .box(2.2, 0.2, 1.0, { at: [0, 0.1, 3.6], color: PAL.stoneDark });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2 + 0.5;
    const y = 4 + (i % 3) * 2.6;
    const r = 3.3 - (y / 11) * 0.3;
    b.box(0.16, 0.9, 0.1, { at: [Math.sin(a) * r, y, Math.cos(a) * r], rot: [0, a, 0], color: 0x151215, jitter: 0 });
  }
  b.box(0.2, 0.3, 0.2, { at: [1.3, 2.4, 3.45], color: PAL.ironDark })
    .box(0.14, 0.2, 0.14, { at: [1.3, 2.4, 3.45], color: 0xffd080, glow: 1, jitter: 0 });
  ctx.glow([1.3, 2.4, 3.6], 0.7, 0xffb050);
  barrel(b, -1.7, 3.6);
  crate(b, -2.3, 2.9, 0.6, 0.4);
}

/**
 * The old mine's mouth: a timbered frame in a pile of boulders, with rails
 * running out to an ore cart. The adit behind it is the mine's own (mine.ts,
 * mineModel.ts): the boulders keep clear of it, as wide as its tunnel and up
 * to its roof.
 */
function mine(b: ModelBuilder, ctx: StructureContext, rand: () => number): void {
  const rock = (r: number, at: Vec3, squash = 0.8) => {
    const g = new IcosahedronGeometry(r, 0);
    g.scale(1, squash, 0.9);
    b.shape(g, { at, rot: [rand() * PI, rand() * PI, 0], color: rand() < 0.5 ? EARTH.cliff : EARTH.rockDark, jitter: 0.14 });
  };
  const front = 2.5;
  const { hw, height } = MINE.tunnel;
  const { rails, cart } = MINE.outside;
  // Boulders framing the mouth and piled up the ridge behind it.
  for (const side of [-1, 1]) {
    rock(1.8, [side * 3.9, 1.0, front - 0.8]);
    rock(1.4, [side * 4.2, 0.6, front - 0.1]);
    rock(2.0, [side * 3.0, 5.3, front - 1.6]);
    rock(1.6, [side * 4.6, 2.6, -0.6]);
  }
  rock(2.3, [0, 5.6, front - 2.2]);
  rock(2.6, [-1.8, 6.0, -1.8]);
  rock(2.6, [2.2, 5.8, -2.0]);
  rock(3.0, [0, 7.6, -3.0]);
  // Timber frame, its posts either side of the adit.
  const post = hw + 0.16;
  for (const x of [-post, post]) b.box(0.32, height + 0.35, 0.32, { at: [x, (height + 0.35) / 2, front + 0.05], color: PAL.woodDark });
  b.box(2 * post + 0.5, 0.38, 0.42, { at: [0, height + 0.19, front + 0.05], color: PAL.woodDark })
    .bar([-post + 0.1, height - 0.4, front + 0.12], [-post + 0.9, height + 0.1, front + 0.12], 0.14, 0.1, { color: PAL.woodDark })
    .bar([post - 0.1, height - 0.4, front + 0.12], [post - 0.9, height + 0.1, front + 0.12], 0.14, 0.1, { color: PAL.woodDark });
  // Rails and sleepers, from the mouth out along the rail bed.
  for (let z = front + 0.3; z < front + rails; z += 0.6) b.box(1.3, 0.08, 0.2, { at: [0, 0.04, z], color: PAL.woodDark });
  for (const x of [-0.45, 0.45]) b.box(0.07, 0.07, rails - 0.1, { at: [x, 0.12, front + 0.1 + (rails - 0.1) / 2], color: PAL.iron });
  // A cart of ore on the rails.
  const cz = front + cart.z;
  b.taper(0.8, 1.0, 1.0, 1.2, 0.6, { at: [0, 0.3, cz], color: PAL.ironDark });
  for (const x of [-0.45, 0.45]) for (const z of [-0.35, 0.35]) b.cyl(0.14, 0.14, 0.08, 8, { at: [x, 0.22, cz + z], rot: [0, 0, PI / 2], color: PAL.iron });
  for (let i = 0; i < 4; i++) rock(0.2, [(rand() - 0.5) * 0.5, 0.9, cz + (rand() - 0.5) * 0.6], 0.8);
  // A lantern on the lintel and a warning board.
  b.box(0.2, 0.28, 0.2, { at: [0.9, height - 0.05, front + 0.35], color: PAL.ironDark })
    .box(0.14, 0.2, 0.14, { at: [0.9, height - 0.05, front + 0.35], color: 0xffd080, glow: 1, jitter: 0 });
  ctx.glow([0.9, height - 0.05, front + 0.45], 0.7, 0xffb050);
  b.box(0.12, 1.6, 0.12, { at: [2.6, 0.8, front + 1.8], rot: [0, 0, 0.08], color: PAL.woodDark })
    .box(1.0, 0.6, 0.06, { at: [2.63, 1.4, front + 1.86], rot: [0, -0.2, 0.08], color: BUILD.plank })
    .box(0.5, 0.1, 0.02, { at: [2.63, 1.45, front + 1.9], rot: [0, -0.2, 0.9], color: PAL.cloth, jitter: 0 })
    .box(0.5, 0.1, 0.02, { at: [2.63, 1.45, front + 1.9], rot: [0, -0.2, -0.7], color: PAL.cloth, jitter: 0 });
}

/**
 * The lumber camp leader's ridge tent (layout's TENT): canvas down to the
 * ground either side, its door flaps rolled back on two crates stacked just
 * inside, where the leader keeps their orders, and behind them a bedroll and
 * a lantern on the ridge pole. The canvas is slabs, so its inside shows
 * through the door.
 */
function tent(b: ModelBuilder, ctx: StructureContext): void {
  const { hw, hd, ridge, crates } = TENT;
  const slope = Math.atan2(ridge, hw);
  const len = Math.hypot(hw, ridge);
  const canvas: PartOpts = { color: BUILD.canvas, jitter: 0.06 };
  for (const side of [-1, 1]) {
    b.box(len, 0.05, 2 * hd + 0.2, { ...canvas, at: [(side * hw) / 2, ridge / 2, 0.05], rot: [0, 0, -side * slope] });
    // The door's flaps, rolled up along the front edges and tied.
    b.bar([side * hw * 0.96, 0.08, hd + 0.12], [side * 0.14, ridge - 0.18, hd + 0.12], 0.13, 0.13, canvas);
    b.box(0.03, 0.18, 0.18, { at: [side * hw * 0.5, ridge * 0.5, hd + 0.12], rot: [0, 0, -side * slope], color: PAL.woodDark, jitter: 0 });
  }
  b.taper(2 * hw, 0.05, 0.04, 0.05, ridge, { ...canvas, at: [0, 0, -hd] });
  // The ridge pole, and the pole at the back.
  b.box(0.08, 0.08, 2 * hd + 0.4, { at: [0, ridge - 0.02, 0.1], color: PAL.wood });
  b.box(0.08, ridge, 0.08, { at: [0, ridge / 2, -hd + 0.06], color: PAL.wood });
  // Guy ropes from the ridge pole's ends, out to pegs off the corners.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [x, z] = [sx * (hw + 0.5), sz * (hd + 0.85)];
      b.bar([0, ridge - 0.05, sz * (hd + 0.2)], [x, 0.05, z], 0.02, 0.02, { color: BUILD.canvas });
      b.box(0.06, 0.2, 0.06, { at: [x, 0.08, z], color: PAL.woodDark });
    }
  }
  for (const side of [-1, 1]) for (const z of [-hd + 0.3, 0, hd - 0.3]) b.box(0.06, 0.16, 0.06, { at: [side * (hw + 0.1), 0.06, z], color: PAL.woodDark });
  // A lantern hanging from the ridge pole over the crates.
  const lantern = 0.9;
  b.bar([0, ridge - 0.05, lantern], [0, ridge - 0.35, lantern], 0.02, 0.02, { color: PAL.ironDark })
    .box(0.16, 0.22, 0.16, { at: [0, ridge - 0.46, lantern], color: PAL.ironDark })
    .box(0.1, 0.14, 0.1, { at: [0, ridge - 0.46, lantern], color: 0xffc060, glow: 1, jitter: 0 });
  ctx.glow([0, ridge - 0.46, lantern], 0.8, 0xffb050);
  // A bedroll under the canvas at the back, a blanket rolled at its head.
  b.box(0.7, 0.1, 1.9, { at: [-0.6, 0.05, -0.6], color: PAL.cloth })
    .cyl(0.12, 0.12, 0.7, 7, { at: [-0.6, 0.16, -1.45], rot: [0, 0, PI / 2], color: PAL.clothDark });
  // The crates in the doorway: the orders lie on the top one (layout's TENT.orders).
  const low = 2 * crates.half;
  const high = crates.top - low;
  crate(b, 0, crates.z, low, 0);
  crate(b, 0, crates.z + crates.half - high / 2, high, 0.12, low);
}

function campfire(b: ModelBuilder, ctx: StructureContext, rand: () => number): void {
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * PI * 2;
    const g = new IcosahedronGeometry(0.17, 0);
    g.scale(1, 0.7, 1);
    b.shape(g, { at: [Math.cos(a) * 0.55, 0.08, Math.sin(a) * 0.55], rot: [rand(), rand() * 3, 0], color: EARTH.rockDark });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + 0.4;
    b.bar([Math.cos(a) * 0.45, 0.05, Math.sin(a) * 0.45], [0, 0.55, 0], 0.08, 0.08, { color: EARTH.barkDark });
  }
  b.cyl(0.35, 0.35, 0.04, 8, { at: [0, 0.04, 0], color: PAL.coal, glow: 0.8, jitter: 0.2 })
    .cone(0.28, 0.6, 5, { at: [0, 0.35, 0], color: PAL.flame, glow: 1, jitter: 0 })
    .cone(0.14, 0.4, 5, { at: [0.05, 0.3, -0.04], color: 0xffe080, glow: 1, jitter: 0 });
  ctx.glow([0, 0.5, 0], 1.6, 0xff8a30);
  // A spit, and logs to sit on.
  for (const x of [-0.75, 0.75]) b.box(0.06, 0.9, 0.06, { at: [x, 0.45, 0], color: PAL.wood });
  b.box(1.7, 0.05, 0.05, { at: [0, 0.86, 0], color: PAL.wood }).box(0.2, 0.2, 0.3, { at: [0, 0.76, 0], rot: [0.3, 0, 0], color: 0x8a4a2a });
  for (const [x, z, yaw] of [[1.7, 0.4, 0.3], [-1.5, 1.0, 2.2]] as const) {
    b.cyl(0.24, 0.26, 1.7, 7, { at: [x, 0.22, z], rot: [0, yaw, PI / 2], color: EARTH.bark });
  }
}

function logpile(b: ModelBuilder): void {
  const rows: [number, number[]][] = [
    [0.3, [-0.62, 0, 0.62]],
    [0.82, [-0.31, 0.31]],
    [1.34, [0]],
  ];
  for (const [y, zs] of rows) {
    for (const z of zs) {
      b.cyl(0.3, 0.3, 3.9, 7, { at: [0, y, z], rot: [0, 0, PI / 2], color: EARTH.bark, jitter: 0.12 });
      for (const x of [-1.96, 1.96]) b.cyl(0.27, 0.27, 0.02, 7, { at: [x, y, z], rot: [0, 0, PI / 2], color: EARTH.cutWood });
    }
  }
  for (const x of [-1.2, 1.2]) for (const z of [-1, 1]) b.box(0.12, 1.3, 0.12, { at: [x, 0.65, z], color: PAL.woodDark });
  stump(b, 2.9, 0, 0.9, 1);
  b.box(0.05, 0.75, 0.05, { at: [2.95, 0.85, 0.9], rot: [0, 0, -0.35], color: PAL.wood })
    .box(0.24, 0.16, 0.04, { at: [2.84, 0.55, 0.9], rot: [0, 0, -0.35], color: PAL.steel });
}

/**
 * One weathered standing stone `h` m tall, its broad face turned by `yaw`,
 * leaning a little by `tilt` (rad about X and Z), with a band of moss: the
 * circle's, and Brackenmoor's border stone.
 */
export function standingStone(b: ModelBuilder, at: Vec3, h: number, yaw: number, tilt: readonly [number, number], light: boolean): void {
  const [x, y, z] = at;
  b.taper(0.95, 0.55, 0.6, 0.4, h, { at: [x, y - 0.3, z], rot: [tilt[0], yaw, tilt[1]], color: light ? PAL.stoneLight : PAL.stone, jitter: 0.1 });
  b.box(0.7, 0.3, 0.45, { at: [x, y + h * 0.45, z], rot: [0, yaw, 0], color: GREEN.moss });
}

/**
 * Seven weathered standing stones round a low altar with a few faint runes.
 * The tallest has a carving worn almost smooth on its face to the altar: the
 * same crowned king and bowing, chained giants as the wall behind the
 * Warden's throne (mineModel.ts), so the Deepkings were here above ground too.
 */
function stones(b: ModelBuilder, s: Structure, rand: () => number): void {
  const placed = standingStones(s).map(([x, z]) => {
    const lx = x - s.x;
    const lz = z - s.z;
    const h = 2.3 + rand() * 1.0;
    const tilt = [(rand() - 0.5) * 0.12, (rand() - 0.5) * 0.12] as const;
    const light = rand() >= 0.5;
    standingStone(b, [lx, 0, lz], h, Math.atan2(lx, lz), tilt, light);
    return { lx, lz, h, tilt, light };
  });
  const tallest = placed.reduce((a, c) => (c.h > a.h ? c : a));
  wornCarving(b, tallest);
  b.box(1.9, 0.55, 1.2, { at: [0, 0.2, 0], color: PAL.stoneDark })
    .box(2.1, 0.12, 1.35, { at: [0, 0.53, 0], color: PAL.stone });
  for (let i = 0; i < 5; i++) {
    b.box(0.2, 0.02, 0.06, { at: [-0.7 + i * 0.35, 0.6, (i % 2) * 0.2 - 0.1], rot: [0, 0.4 + i, 0], color: PAL.rune, glow: 0.5, jitter: 0 });
  }
}

/**
 * The carving on a standing stone's inner face (toward the altar, its own
 * −Z), in shallow relief a shade off the stone's own colour: a crowned figure
 * over two great figures bowed toward it, a chain at each one's neck.
 */
function wornCarving(b: ModelBuilder, st: { lx: number; lz: number; h: number; tilt: readonly [number, number]; light: boolean }): void {
  const yaw = Math.atan2(st.lx, st.lz);
  const turn = new Matrix4().makeRotationFromEuler(new Euler(st.tilt[0], yaw, st.tilt[1]));
  const p = new Vector3();
  // Worn almost smooth: barely a shade off the stone.
  const color = st.light ? 0x847e74 : 0x645f58;
  // On the face: `u` across it, `v` up it, `w` m wide and `h` tall, turned `r` in the face's plane.
  const cut = (u: number, v: number, w: number, h: number, r = 0) => {
    // The stone tapers from 0.55 m deep at its foot to 0.4 at its top (standingStone), set 0.3 m into the ground.
    const depth = lerp(0.55, 0.4, (v + 0.3) / st.h) / 2;
    p.set(u, v + 0.3, -depth - 0.008).applyMatrix4(turn);
    b.box(w, h, 0.03, { at: [st.lx + p.x, p.y - 0.3, st.lz + p.z], rot: [st.tilt[0], yaw, st.tilt[1] + r], color, jitter: 0.25 });
  };
  const y = st.h * 0.55;
  // The king, crowned, over the middle.
  cut(0, y + 0.42, 0.07, 0.2);
  cut(0, y + 0.58, 0.08, 0.07);
  for (const u of [-0.04, 0, 0.04]) cut(u, y + 0.65, 0.025, 0.05);
  // The giants either side, bent low toward the king, a chain from each one's neck to the ground.
  for (const side of [-1, 1]) {
    cut(side * 0.15, y + 0.1, 0.12, 0.28, side * 0.75);
    cut(side * 0.07, y + 0.2, 0.08, 0.08);
    cut(side * 0.2, y - 0.12, 0.05, 0.22);
    cut(side * 0.06, y - 0.05, 0.015, 0.4, side * -0.2);
  }
}

// ------------------------------------------------------------------ water crossings

function dock(b: ModelBuilder, deck: Deck): void {
  const { hw, hd } = deck;
  for (let z = -hd + 0.15; z < hd; z += 0.32) b.box(hw * 2, 0.08, 0.28, { at: [0, -0.04, z], rot: [0, (Math.sin(z * 7) * 0.02), 0], color: BUILD.plank, jitter: 0.12 });
  for (const x of [-hw + 0.15, hw - 0.15]) b.box(0.14, 0.2, hd * 2, { at: [x, -0.18, 0], color: PAL.woodDark });
  for (let z = -hd + 0.3; z <= hd; z += 2.2) {
    for (const x of [-hw, hw]) b.cyl(0.1, 0.11, 2.4, 6, { at: [x, -1.0, z], color: PAL.woodDark });
  }
  b.cyl(0.12, 0.12, 1.0, 6, { at: [hw, 0.3, hd - 0.2], color: PAL.woodDark }).cyl(0.14, 0.14, 0.12, 6, { at: [hw, 0.4, hd - 0.2], color: BUILD.canvas });
}

function boat(b: ModelBuilder): void {
  b.box(0.9, 0.1, 2.6, { at: [0, 0.02, 0], color: BUILD.plank });
  for (const side of [-1, 1]) b.box(0.08, 0.36, 2.6, { at: [side * 0.5, 0.2, 0], rot: [0, 0, side * -0.25], color: BUILD.plank });
  b.taper(1.0, 0.1, 0.1, 0.1, 0.7, { at: [0, 0.2, 1.3], rot: [PI / 2, 0, 0], color: PAL.woodDark })
    .box(1.0, 0.36, 0.08, { at: [0, 0.2, -1.3], color: PAL.woodDark });
  for (const z of [-0.5, 0.5]) b.box(0.95, 0.06, 0.3, { at: [0, 0.3, z], color: PAL.wood });
  b.bar([-0.3, 0.35, -0.6], [0.25, 0.35, 1.0], 0.05, 0.05, { color: PAL.wood });
}

/** A humped stone bridge: arched deck, parapets, and a solid arch down into the water. */
function bridge(b: ModelBuilder, deck: Deck): void {
  const { hw, hd, y0, y1, rise } = deck;
  const n = 12;
  const yAt = (t: number) => (y1 - y0) * t + rise * Math.sin(PI * t);
  for (let k = 0; k < n; k++) {
    const t0 = k / n;
    const t1 = (k + 1) / n;
    const tm = (t0 + t1) / 2;
    const z0 = -hd + 2 * hd * t0;
    const z1 = -hd + 2 * hd * t1;
    const ya = yAt(t0);
    const yb = yAt(t1);
    const ym = (ya + yb) / 2;
    const len = Math.hypot(z1 - z0, yb - ya) + 0.04;
    const tilt = -Math.atan2(yb - ya, z1 - z0);
    const zm = (z0 + z1) / 2;
    b.box(hw * 2, 0.3, len, { at: [0, ym - 0.15, zm], rot: [tilt, 0, 0], color: PAL.stoneLight, jitter: 0.08 });
    for (const side of [-1, 1]) {
      b.box(0.34, 0.85, len, { at: [side * (hw + 0.14), ym + 0.2, zm], rot: [tilt, 0, 0], color: PAL.stone, jitter: 0.1 });
    }
    // The arch: solid near the banks, opening over the water in the middle.
    const open = tm > 0.22 && tm < 0.78 ? 1.3 * Math.sin((PI * (tm - 0.22)) / 0.56) : 0;
    const bottom = -2.6 + open * 1.5;
    const top = ym - 0.3;
    if (top > bottom) b.box(hw * 2 + 0.6, top - bottom, len - 0.02, { at: [0, (top + bottom) / 2, zm], color: PAL.stone, jitter: 0.12 });
  }
  // Newel stones at the four corners.
  for (const z of [-hd, hd]) {
    const y = z < 0 ? 0 : y1 - y0;
    for (const side of [-1, 1]) b.box(0.5, 1.2, 0.5, { at: [side * (hw + 0.14), y + 0.35, z], color: PAL.stoneLight });
  }
}
