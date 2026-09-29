import type { Vector3 } from 'three';
import type { Interior as InteriorId } from '../../save/record';
import type { Atmosphere } from '../../world/atmosphere';
import { type Flame, type Frame, type InteriorPlan, toFrame } from '../../world/interiors';
import { Colliders } from './colliders';

// What the buildings you walk into share, as plans: a room on a building's
// footprint, its floor at the top of the foundation with steps down from its
// door, its walls and props as colliders, and its flames. Each building's own
// module (inn.ts, house.ts) says what stands where, in the building's frame:
// origin on the ground at the footprint's centre, front (+Z) facing out, x
// across the front.

/** A point (lx, lz) in `f`'s frame, in the world. */
export function toWorld(f: Omit<Frame, 'y'>, lx: number, lz: number): [number, number] {
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  return [f.x + lx * c + lz * s, f.z - lx * s + lz * c];
}

/** Colliders in a building's frame: boxes (x, z, half width, half depth) and circles (x, z, r). */
export interface Shapes {
  readonly boxes: readonly (readonly [number, number, number, number])[];
  readonly circles: readonly (readonly [number, number, number])[];
}

/**
 * The walls round a room, as colliders: the outer walls' footprint (half
 * extents `hw`, `hd`) down to the room's (`room`), with the doorway (`door`)
 * left open in the front. From outside they collide as a solid box would.
 */
export function wallShapes(
  hw: number,
  hd: number,
  room: { readonly hw: number; readonly hd: number },
  door: { readonly x: number; readonly width: number },
): [number, number, number, number][] {
  const side = (hw - room.hw) / 2;
  const end = (hd - room.hd) / 2;
  const left = door.x - door.width / 2;
  const right = door.x + door.width / 2;
  return [
    [0, -(room.hd + end), hw, end],
    [-(room.hw + side), 0, side, hd],
    [room.hw + side, 0, side, hd],
    [(-hw + left) / 2, room.hd + end, (left + hw) / 2, end],
    [(right + hw) / 2, room.hd + end, (hw - right) / 2, end],
  ];
}

/** A building that opens, as its module describes it, in its own frame. */
export interface RoomSpec {
  readonly id: InteriorId;
  /** Where the building stands, and its footprint's half extents. */
  readonly site: Frame & { readonly hw: number; readonly hd: number };
  /** The floor over the ground, at the top of the foundation. */
  readonly floor: number;
  /** Floor to ceiling (or to the eaves, where it's open to the rafters). */
  readonly height: number;
  readonly door: { readonly x: number; readonly width: number };
  /** Down the steps outside the door (centred on it), the floor meets the ground this far out. */
  readonly steps: { readonly width: number; readonly out: number };
  readonly shapes: Shapes;
  /** The flames the pool sits on: (x, height over the ground, z). */
  readonly flames: readonly (readonly [number, number, number])[];
  readonly atmosphere: Omit<Atmosphere, 'flames'>;
  /** Where you wake, facing the door, if you wake here. */
  readonly wake?: { readonly x: number; readonly z: number };
}

/**
 * A room's plan, placed with its building: its ground is the floor over the
 * footprint and a ramp down the steps outside the door; its walls and props
 * are colliders.
 */
export function planRoom(spec: RoomSpec): InteriorPlan {
  const { site, floor, steps, door, wake } = spec;
  const { hw, hd } = site;
  const frame = { x: site.x, z: site.z, yaw: site.yaw, y: site.y };
  const colliders = new Colliders({ minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity });
  for (const [lx, lz, bw, bd] of spec.shapes.boxes) {
    const [x, z] = toWorld(frame, lx, lz);
    colliders.addBox({ x, z, hw: bw, hd: bd, yaw: frame.yaw });
  }
  for (const [lx, lz, r] of spec.shapes.circles) {
    const [x, z] = toWorld(frame, lx, lz);
    colliders.addCircle({ x, z, r });
  }
  const flames: Flame[] = spec.flames.map(([lx, y, lz]) => {
    const [x, z] = toWorld(frame, lx, lz);
    return { x, y: frame.y + y, z };
  });
  let respawn;
  if (wake) {
    const [wx, wz] = toWorld(frame, wake.x, wake.z);
    // Facing the door's middle: yaw 0 looks down −Z, so a turn of a looks along (−sin a, −cos a).
    const lookYaw = Math.atan2(-(door.x - wake.x), -(hd - wake.z));
    respawn = { x: wx, z: wz, yaw: lookYaw + frame.yaw };
  }
  const top = frame.y + floor;
  const local = { x: 0, z: 0 };
  return {
    id: spec.id,
    frame,
    footprint: { hw, hd },
    floor: top,
    height: spec.height,
    door: { x: door.x, width: door.width },
    flames,
    atmosphere: { ...spec.atmosphere, flames },
    respawn,
    groundAt(x, z) {
      const { x: lx, z: lz } = toFrame(frame, x, z, local);
      if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) return top;
      // The steps: from the floor at the door's line down to the ground at their foot.
      if (Math.abs(lx - door.x) <= steps.width / 2 && lz > hd && lz < hd + steps.out) return frame.y + floor * (1 - (lz - hd) / steps.out);
      return null;
    },
    resolve: (p: Vector3, radius: number) => colliders.resolve(p, radius),
  };
}
