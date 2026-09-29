import { type BufferGeometry, type Camera, Group, Matrix4, Mesh, Vector3 } from 'three';
import { CONFIG } from '../../config';
import { ModelBuilder, type PartOpts } from '../../models/kit';
import { sharedModelMaterial } from '../../models/materials';
import { PAL } from '../../models/palette';
import { Glows } from '../../world/glows';
import type { Interior, InteriorPlan } from '../../world/interiors';
import { BUILD, EARTH } from './palette';

// What the rooms you walk into share, as meshes: one mesh for the room built
// in its building's frame, its glows, and the door's leaves, which hang in
// the doorway whether you're in or out (innModel.ts, houseModel.ts).

export const FLAME = 0xffb050;
export const DAYLIGHT = 0xe4ecf0;

/** A glow billboard at a point in the building's frame. */
export type Glow = (x: number, y: number, z: number, size: number) => void;

/** A door's leaf, hinged at `hinge` across the front, reaching `reach` (+1 towards +X, −1 towards −X) `width` wide. */
export interface Leaf {
  readonly hinge: number;
  readonly reach: 1 | -1;
  readonly width: number;
}

export interface InteriorParts {
  /** Names the meshes and groups: `<name>-room` (and its group with the glows, `<name>-inside`), `<name>-door`, `<name>-interior`. */
  readonly name: string;
  /** Its seed for the builder's jitter. */
  readonly seed: number;
  /** Builds the room, in the building's frame. */
  build(b: ModelBuilder, glow: Glow): void;
  /** Fake ambient occlusion up from the floor. */
  readonly ao: { from: number; to: number; min: number };
  /** The door's leaves, and where they hang: over the floor at `floor`, `z` their outer face, `thick` thick, `height` high. */
  readonly leaves: readonly Leaf[];
  readonly door: { readonly floor: number; readonly z: number; readonly thick: number; readonly height: number };
}

/** A room, its glows and its door, for the building's `plan`. */
export function buildInterior(plan: InteriorPlan, parts: InteriorParts): Interior {
  const { frame } = plan;
  const place = new Matrix4().makeRotationY(frame.yaw).setPosition(frame.x, frame.y, frame.z);
  const glows = new Glows();
  const glow: Glow = (x, y, z, size) => {
    const p = new Vector3(x, y, z).applyMatrix4(place);
    glows.add(p.x, p.y, p.z, size, FLAME);
  };

  const b = new ModelBuilder(parts.seed);
  parts.build(b, glow);
  const geometry = b.build({ ao: parts.ao });
  geometry.applyMatrix4(place);
  const roomMesh = new Mesh(geometry, sharedModelMaterial());
  roomMesh.name = `${parts.name}-room`;
  const room = new Group();
  room.name = `${parts.name}-inside`;
  room.add(roomMesh, glows.mesh);
  room.visible = false;

  // The leaves, each hinged at the doorway's side and swinging in.
  const { door } = parts;
  const hinges = parts.leaves.map((leaf) => {
    const hinge = new Group();
    const mesh = new Mesh(buildLeaf(leaf.width - 0.01, door.height, door.thick), sharedModelMaterial());
    mesh.name = `${parts.name}-door`;
    mesh.scale.x = leaf.reach;
    hinge.add(mesh);
    hinge.position.copy(new Vector3(leaf.hinge, door.floor, door.z - door.thick / 2).applyMatrix4(place));
    return { hinge, reach: leaf.reach };
  });

  const root = new Group();
  root.name = `${parts.name}-interior`;
  root.add(room, ...hinges.map((h) => h.hinge));
  let time = 0;
  const interior: Interior = {
    ...plan,
    root,
    room,
    swing(open: number) {
      // Turning a leaf reaching +X by +a swings it in towards −Z; one reaching −X turns the other way.
      for (const { hinge, reach } of hinges) hinge.rotation.y = frame.yaw + reach * CONFIG.interiors.angle * open;
    },
    update(dt: number, camera: Camera) {
      time += dt;
      if (room.visible) glows.update(time, camera);
    },
  };
  interior.swing(0);
  return interior;
}

/** One of a door's leaves, from its hinge (at the origin, on the floor) out along +X. */
function buildLeaf(w: number, h: number, t: number): BufferGeometry {
  const b = new ModelBuilder(7);
  const board: PartOpts = { color: BUILD.plank, jitter: 0.12 };
  const boards = 3;
  for (let i = 0; i < boards; i++) b.box(w / boards - 0.01, h, t, { ...board, at: [(i + 0.5) * (w / boards), h / 2, 0] });
  for (const y of [0.35, h - 0.35]) b.box(w - 0.04, 0.12, t + 0.03, { at: [w / 2, y, 0], color: BUILD.timber, jitter: 0.1 });
  b.bar([0.06, 0.45, 0], [w - 0.08, h - 0.45, 0], 0.1, t + 0.02, { color: BUILD.timber, jitter: 0.1 });
  for (const y of [0.35, h - 0.35]) b.box(0.4, 0.05, t + 0.05, { at: [0.2, y, 0], color: PAL.ironDark, jitter: 0 });
  b.box(0.05, 0.14, 0.06, { at: [w - 0.12, h * 0.48, 0.05], color: PAL.ironDark, jitter: 0 });
  b.box(0.05, 0.14, 0.06, { at: [w - 0.12, h * 0.48, -0.05], color: PAL.ironDark, jitter: 0 });
  return b.build();
}

/** A hearth or fireplace against a side wall. */
export interface Fireplace {
  /** The wall's inner face at x = `wall` (its sign says which side). */
  readonly wall: number;
  /** Its middle along the wall. */
  readonly z: number;
  readonly width: number;
  /** How far it stands out from the wall. */
  readonly depth: number;
  /** The mouth's height, under the mantel. */
  readonly mouth: number;
  /** A big fire (three flames and logs) or a small one. */
  readonly big: boolean;
  /** The floor, and where the chimney breast meets the ceiling or the roof. */
  readonly floor: number;
  readonly top: number;
}

/**
 * A hearth against a side wall: stone cheeks and a timber mantel round the
 * fire, the chimney breast up to the ceiling above, logs and flames inside.
 * Returns where its fire burns, in the building's frame.
 */
export function fireplaceOn(b: ModelBuilder, glow: Glow, f: Fireplace): [number, number, number] {
  const { wall, z, width, depth, mouth, big, floor, top } = f;
  const s = Math.sign(wall);
  const x = (d: number) => wall - s * d; // `d` in from the wall
  const cheek = 0.25;
  const stone: PartOpts = { color: PAL.stoneLight, jitter: 0.12 };
  b.box(depth + 0.2, 0.08, width + 0.4, { color: PAL.stoneDark, jitter: 0.1, at: [x((depth + 0.2) / 2), floor + 0.04, z] });
  for (const side of [-1, 1]) b.box(depth, mouth, cheek, { ...stone, at: [x(depth / 2), floor + mouth / 2, z + side * (width / 2 - cheek / 2)] });
  b.box(depth + 0.08, 0.16, width + 0.12, { color: BUILD.timber, jitter: 0.1, at: [x(depth / 2), floor + mouth + 0.08, z] })
    .box(depth - 0.15, top - floor - mouth - 0.16, width - 0.1, { ...stone, at: [x((depth - 0.15) / 2), (floor + mouth + 0.16 + top) / 2, z] })
    .box(0.05, mouth, width - 2 * cheek, { color: 0x1a120c, jitter: 0.05, at: [x(0.03), floor + mouth / 2, z] });
  // Logs, embers and flames.
  const inX = x(depth * 0.45);
  const logs = big ? 3 : 2;
  for (let i = 0; i < logs; i++) {
    b.cyl(0.07, 0.07, width - 2 * cheek - 0.15, 6, { at: [inX + (i - (logs - 1) / 2) * 0.12, floor + 0.14 + (i % 2) * 0.08, z], rot: [Math.PI / 2, 0, 0], color: EARTH.barkDark });
  }
  b.box(depth * 0.6, 0.05, width - 2 * cheek - 0.1, { at: [inX, floor + 0.1, z], color: PAL.coal, glow: 0.9, jitter: 0.2 });
  const flames = big ? [-0.3, 0, 0.3] : [-0.12, 0.12];
  flames.forEach((dz, i) => {
    const h = (big ? 0.55 : 0.35) * (i % 2 ? 0.75 : 1);
    b.cone(0.12, h, 5, { at: [inX, floor + 0.2 + h / 2, z + dz], color: PAL.flame, glow: 1, jitter: 0.1 });
  });
  glow(inX, floor + (big ? 0.5 : 0.35), z, big ? 1.4 : 0.8);
  return [inX, floor + (big ? 0.5 : 0.35), z];
}

/**
 * A window as seen from inside: a pane glowing with the afternoon outside, its
 * frame proud of the wall into the room. `yaw` turns it as a model turns, to
 * face the room; its middle is at (x, y, z) on the wall's inner face.
 */
export function windowIn(b: ModelBuilder, x: number, y: number, z: number, yaw: number): void {
  const rot = [0, yaw, 0] as const;
  const out = (d: number) => [x + Math.sin(yaw) * d, z + Math.cos(yaw) * d] as const;
  const [px, pz] = out(0.03);
  const [fx, fz] = out(0.05);
  const [sx, sz] = out(0.1);
  b.box(0.8, 0.9, 0.03, { at: [px, y, pz], rot, color: DAYLIGHT, glow: 0.85, jitter: 0.02 })
    .box(1.0, 0.1, 0.06, { at: [fx, y + 0.5, fz], rot, color: BUILD.timber })
    .box(0.1, 1.08, 0.06, { at: [fx + Math.cos(yaw) * 0.45, y, fz - Math.sin(yaw) * 0.45], rot, color: BUILD.timber })
    .box(0.1, 1.08, 0.06, { at: [fx - Math.cos(yaw) * 0.45, y, fz + Math.sin(yaw) * 0.45], rot, color: BUILD.timber })
    .box(0.06, 0.9, 0.05, { at: [fx, y, fz], rot, color: BUILD.timber })
    .box(0.8, 0.06, 0.05, { at: [fx, y, fz], rot, color: BUILD.timber })
    .box(1.1, 0.07, 0.16, { at: [sx, y - 0.5, sz], rot, color: BUILD.timber });
}
