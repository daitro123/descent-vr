import {
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshLambertMaterial,
  Vector3,
} from 'three';
import { ModelBuilder } from '../../../models/kit';
import { sharedModelMaterial } from '../../../models/materials';

// PROTOTYPE (Brewing at the alchemy table): the table and what stands on it,
// built from the kit's boxes and cylinders. Every prop's origin is where it
// rests (its bottom's centre), in the bench's frame: x along the bench, y up
// from the floor, +z towards you. Throwaway.

/** The bench's work surface over the floor: waist height, where the research puts crafting. */
export const TOP = 0.92;
/** Half the bench's length, and its depth (its back against the wall at z = -DEPTH). */
export const HALF = 0.8;
export const DEPTH = 0.6;

/** Where each thing rests on the bench, left to right as you face it. */
export const SPOTS = {
  tray: new Vector3(-0.56, TOP, -0.2),
  mortar: new Vector3(-0.24, TOP, -0.22),
  pestle: new Vector3(-0.24, TOP + 0.022, -0.06),
  pot: new Vector3(0.14, TOP + 0.06, -0.25),
  flask: new Vector3(0.48, TOP + 0.012, -0.2),
  board: new Vector3(0, TOP + 0.26, -DEPTH + 0.05),
} as const;

/** Points on the props, in their own frames. */
export const MORTAR = { r: 0.075, inner: 0.058, height: 0.07, mouth: new Vector3(0, 0.07, 0) };
export const PESTLE = { tip: new Vector3(0, -0.165, 0) };
export const POT = {
  r: 0.1,
  height: 0.13,
  /** The brew's surface when full. */
  liquid: 0.105,
  handle: new Vector3(0, 0.1, 0.23),
  spout: new Vector3(0, 0.125, -0.125),
};
export const SPOON = { tip: new Vector3(0, -0.29, 0) };
export const FLASK = { grab: new Vector3(0, 0.05, 0), mouth: new Vector3(0, 0.13, 0) };

export const COLOURS = {
  water: 0x4f6878,
  green: 0x6aa23a,
  brew: 0xd42a24,
  powder: 0x7ab048,
};

function mesh(b: ModelBuilder): Mesh {
  return new Mesh(b.build(), sharedModelMaterial());
}

/** A plain lit material whose colour and glow change (liquids, powder). */
export function tint(color: number, glow = 0): MeshLambertMaterial {
  return new MeshLambertMaterial({ color, emissive: color, emissiveIntensity: glow });
}

/** The workbench against the wall, with a low shelf, a few jars at the back and a lamp's glow. */
export function bench(): Mesh {
  const b = new ModelBuilder(21);
  const wood = { color: 0x7a5634, jitter: 0.08 };
  b.box(HALF * 2, 0.05, DEPTH, { ...wood, at: [0, TOP - 0.025, -DEPTH / 2] });
  for (const x of [-HALF + 0.05, HALF - 0.05])
    for (const z of [-DEPTH + 0.05, -0.05]) b.box(0.06, TOP - 0.05, 0.06, { color: 0x5e4028, at: [x, (TOP - 0.05) / 2, z] });
  b.box(HALF * 2 - 0.1, 0.03, DEPTH - 0.1, { color: 0x6a4a2e, at: [0, 0.22, -DEPTH / 2], jitter: 0.1 });
  // Jars and bundles along the back, for the look of a herbalist's bench.
  b.cyl(0.04, 0.04, 0.12, 7, { color: 0x6e8a5a, at: [-0.7, TOP + 0.06, -0.5] })
    .cyl(0.045, 0.045, 0.012, 7, { color: 0x5a3a24, at: [-0.7, TOP + 0.125, -0.5] })
    .cyl(0.035, 0.03, 0.09, 7, { color: 0x8a6a9a, at: [-0.6, TOP + 0.045, -0.53] })
    .cyl(0.04, 0.04, 0.1, 7, { color: 0xa88a5a, at: [0.66, TOP + 0.05, -0.5] })
    .box(0.18, 0.03, 0.05, { color: 0x4a7a3a, at: [0.4, TOP + 0.015, -0.5], rot: [0, 0.3, 0] })
    .box(0.12, 0.2, 0.012, { color: 0xc8b890, at: [0.32, 0.22 + 0.1, -0.35], rot: [0.1, 0, 0] });
  // Under the shelf: sacks.
  b.ball(0.12, { color: 0x9a8058, at: [-0.45, 0.33, -0.3], jitter: 0.1 }).ball(0.1, { color: 0x8a7050, at: [0.5, 0.31, -0.28] });
  return mesh(b);
}

/** A shallow wooden tray for the herbs. */
export function tray(): Mesh {
  const b = new ModelBuilder(22);
  b.box(0.24, 0.012, 0.16, { color: 0x8a6440, at: [0, 0.006, 0] });
  for (const [x, z, w, d] of [
    [0, 0.075, 0.24, 0.012],
    [0, -0.075, 0.24, 0.012],
    [0.114, 0, 0.012, 0.16],
    [-0.114, 0, 0.012, 0.16],
  ] as const)
    b.box(w, 0.03, d, { color: 0x7a5434, at: [x, 0.015, z] });
  return mesh(b);
}

/** A sprig of Hearthleaf: a broad green leaf with a red vein, lying flat. */
export function leaf(): Mesh {
  const b = new ModelBuilder(23);
  b.box(0.075, 0.006, 0.036, { color: 0x5aa040, at: [0, 0.003, 0], jitter: 0.1 })
    .box(0.05, 0.006, 0.024, { color: 0x4e9438, at: [0.03, 0.004, 0.012], rot: [0, 0.5, 0] })
    .box(0.085, 0.008, 0.005, { color: 0xb04a30, at: [-0.005, 0.005, 0] })
    .box(0.03, 0.006, 0.004, { color: 0x6a4a24, at: [-0.055, 0.004, 0] });
  return mesh(b);
}

/** The stone mortar. Its powder is a child mesh the station grows. */
export function mortar(): { root: Group; powder: Mesh } {
  const root = new Group();
  const b = new ModelBuilder(24);
  const { r, inner, height } = MORTAR;
  b.cyl(r, r * 0.8, height, 10, { color: 0x8c8a84, at: [0, height / 2, 0], jitter: 0.08 })
    .cyl(inner, inner, 0.004, 10, { color: 0x3e3c38, at: [0, height + 0.001, 0] })
    .cyl(r * 0.85, r * 0.85, 0.012, 10, { color: 0x7a7872, at: [0, 0.006, 0] });
  root.add(mesh(b));
  const powder = new Mesh(new CylinderGeometry(inner * 0.95, inner * 0.6, 1, 10), tint(COLOURS.powder, 0.1));
  powder.visible = false;
  root.add(powder);
  return { root, powder };
}

/** The pestle, held at the top of its handle (its origin), the head down its -Y. */
export function pestle(): Mesh {
  const b = new ModelBuilder(25);
  b.cyl(0.013, 0.015, 0.13, 7, { color: 0x9a9890, at: [0, -0.065, 0] }).ball(0.024, { color: 0x8a8880, at: [0, -0.145, 0] }, 1);
  return mesh(b);
}

/** The long wooden spoon, held at the top of its handle (its origin), the bowl down its -Y. */
export function spoon(): Mesh {
  const b = new ModelBuilder(26);
  b.cyl(0.009, 0.01, 0.25, 6, { color: 0xa07a4a, at: [0, -0.125, 0] }).box(0.04, 0.05, 0.012, {
    color: 0x9a7040,
    at: [0, -0.27, 0],
  });
  return mesh(b);
}

/** The little copper pot, its handle out towards you (+z), its spout at the back (-z). Its brew is a child mesh. */
export function pot(): { root: Group; brew: Mesh } {
  const root = new Group();
  const b = new ModelBuilder(27);
  const { r, height } = POT;
  b.cyl(r, r * 0.85, height, 12, { color: 0xb86a3a, at: [0, height / 2, 0], jitter: 0.06 })
    .cyl(r + 0.008, r + 0.008, 0.014, 12, { color: 0xc47a44, at: [0, height, 0] })
    .box(0.026, 0.02, 0.15, { color: 0x3a2a20, at: [0, 0.1, 0.17] })
    .box(0.03, 0.024, 0.05, { color: 0xc47a44, at: [0, 0.122, -0.115] });
  root.add(mesh(b));
  const brew = new Mesh(new CylinderGeometry(r - 0.006, r - 0.006, 0.004, 12), tint(COLOURS.water, 0.05));
  brew.position.y = POT.liquid;
  root.add(brew);
  return { root, brew };
}

/** The iron trivet the pot sits on, embers glowing under it. */
export function trivet(): Mesh {
  const b = new ModelBuilder(28);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.box(0.08, 0.012, 0.014, { color: 0x2e2a28, at: [Math.cos(a) * 0.092, 0.054, Math.sin(a) * 0.092], rot: [0, -a + Math.PI / 2, 0] });
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.box(0.012, 0.06, 0.012, { color: 0x2a2624, at: [Math.cos(a) * 0.085, 0.03, Math.sin(a) * 0.085] });
  }
  b.box(0.09, 0.02, 0.07, { color: 0xff6a20, glow: 0.9, at: [0, 0.01, 0] }).box(0.05, 0.015, 0.05, {
    color: 0xffb040,
    glow: 1,
    at: [0.01, 0.022, 0.005],
    rot: [0, 0.6, 0],
  });
  return mesh(b);
}

/** The flask's wooden stand. */
export function stand(): Mesh {
  const b = new ModelBuilder(29);
  b.box(0.1, 0.02, 0.1, { color: 0x6a4a2e, at: [0, 0.01 - 0.012, 0] });
  return mesh(b);
}

/** A round-bottomed flask: glass, the brew inside (scaled by how full) and the cork, shown once it's full. */
export function flask(): { root: Group; brew: Mesh; cork: Mesh; glass: MeshLambertMaterial } {
  const root = new Group();
  const glass = new MeshLambertMaterial({ color: 0xcfe4ea, transparent: true, opacity: 0.4, depthWrite: false });
  const g = new ModelBuilder(30);
  g.ball(0.038, { color: 0xffffff, at: [0, 0.038, 0] }, 1).cyl(0.012, 0.014, 0.055, 7, { color: 0xffffff, at: [0, 0.095, 0] });
  const body = new Mesh(g.build(), glass);
  body.renderOrder = 2;
  const brew = new Mesh(new IcosahedronGeometry(0.034, 1), tint(COLOURS.brew, 0.5));
  brew.position.y = 0.038;
  brew.scale.setScalar(0.001);
  const c = new ModelBuilder(31);
  c.cyl(0.014, 0.011, 0.02, 7, { color: 0x8a6440, at: [0, 0.127, 0] });
  const cork = mesh(c);
  cork.visible = false;
  root.add(brew, body, cork);
  return { root, brew, cork, glass };
}

/** A leather loop at the hip for a flask. */
export function beltLoop(): Mesh {
  const b = new ModelBuilder(32);
  b.box(0.08, 0.05, 0.012, { color: 0x4a3222, at: [0, 0, 0.03] })
    .box(0.07, 0.014, 0.07, { color: 0x5a3c28, at: [0, -0.02, 0] })
    .box(0.07, 0.03, 0.012, { color: 0x5a3c28, at: [0, -0.01, -0.035] });
  return mesh(b);
}

/**
 * A gloved hand: palm and fingers that curl as you squeeze, in the grip's
 * space (-Z out past the knuckles).
 */
export function hand(): { root: Group; fingers: Group } {
  const root = new Group();
  const leather = 0x7a5236;
  const p = new ModelBuilder(33);
  p.box(0.08, 0.032, 0.09, { color: leather, at: [0, 0, 0.035], jitter: 0.06 })
    .box(0.024, 0.024, 0.05, { color: 0x6e4a30, at: [-0.045, 0.004, 0.0], rot: [0, 0.5, 0] })
    .box(0.085, 0.04, 0.04, { color: 0x5a3c28, at: [0, 0, 0.095] });
  root.add(mesh(p));
  const fingers = new Group();
  fingers.position.set(0, 0, -0.01);
  const f = new ModelBuilder(34);
  f.box(0.076, 0.026, 0.07, { color: leather, at: [0, 0, -0.035], jitter: 0.08 });
  fingers.add(mesh(f));
  root.add(fingers);
  return { root, fingers };
}
