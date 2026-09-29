import type { Atmosphere } from '../../world/atmosphere';
import type { InteriorPlan } from '../../world/interiors';
import { LIGHT, SKY } from './palette';
import { planInterior, type Shapes, type Site, wallShapes } from './interiorPlan';

// The Golden Tankard's taproom: the plan only (what stands where, what you
// bump into, its flames), in the inn's own frame: origin on the ground at the
// footprint's centre, front (+Z) facing the crossroads, x across the front.
// innModel.ts builds its meshes from the same numbers.

/** The inn's footprint and its outer walls, which the outside model (buildings.ts) builds. */
export const INN = {
  hw: 5.5,
  hd: 4,
  /** Thickness of the stone ground floor's walls. */
  wall: 0.25,
  /** The floor, on the 0.3 m foundation. */
  floor: 0.31,
  /**
   * The room's walls stand just inside the outer walls: its half width and
   * depth, and floor to ceiling (under the jettied upper floor's beam).
   */
  room: { hw: 5.15, hd: 3.65, height: 2.86 },
  /** The door's leaves hang in the doorway this far out from the room's front wall. */
  leaves: { z: 3.88, thick: 0.05 },
  /** The doorway in the middle of the front: its middle across it, clear width and height over the floor. */
  door: { x: 0, width: 1.8, height: 2.1 },
  /** Down the steps outside the door, the floor meets the ground this far out. */
  steps: { width: 2.6, out: 1.25 },
  /** The big hearth under the larger chimney, on the right wall: its middle along the wall, its width and how far it stands out. */
  hearth: { z: -0.8, width: 1.7, depth: 0.8 },
  /** The small fireplace under the other chimney, on the left wall. */
  fireplace: { z: 0.9, width: 1.0, depth: 0.55 },
  /** The bar along the back: from x0 to x1, its front's middle at z, its depth and height. */
  bar: { x0: -2.6, x1: 2.0, z: -1.87, depth: 0.55, height: 1.05 },
  /** Shelves of bottles and tankards on the back wall behind the bar, between its windows. */
  shelves: { half: 1.5, depth: 0.3 },
  /** Barrels past the bar's right end, one with a tap. */
  barrels: [
    [4.6, -3.15],
    [3.95, -3.2],
  ] as readonly (readonly [number, number])[],
  barrelRadius: 0.33,
  /**
   * Four tables with a bench along each side; a table and its benches take
   * `table.set` of room. They leave a body's width between them and the walls,
   * or no room at all, so nothing can be knocked into a nook it can't walk out of.
   */
  tables: [
    [-2.4, -0.5],
    [-3.85, 2.4],
    [2.8, 2.3],
    [1.9, -0.6],
  ] as readonly (readonly [number, number])[],
  table: { hw: 0.7, hd: 0.38, height: 0.75, set: { hw: 0.8, hd: 0.78 } },
  /** Lanterns hang this far below the ceiling: over the bar and over the first and third tables. */
  lanternDrop: 0.65,
  /** Where the innkeeper stands behind the bar, facing the room: a body's width off its back, within reach of its top. */
  keeper: { x: 0, z: -2.72 },
  /** Where you wake: before the hearth, facing the door. */
  wake: { x: 3.5, z: -0.8 },
} as const;

/** The taproom with the door shut: the fire's warm dark, a low fill instead of the sky, fog close in. */
export const INN_ATMOSPHERE_BASE: Omit<Atmosphere, 'flames'> = {
  background: 0x140d08,
  fog: { color: 0x2a1c12, near: 4, far: 30 },
  sky: { zenith: SKY.zenith, horizon: SKY.horizon, haze: SKY.haze, sun: SKY.sun },
  sun: { color: LIGHT.sun, intensity: 0 },
  hemisphere: { sky: 0xffc890, ground: 0x3a2618, intensity: 0.55 },
  farPlane: 60,
};

/** The four flames the pool sits on, in the inn's frame: the hearth, the lantern over the bar and those over two tables. */
export function innFlames(): readonly [number, number, number][] {
  const { room, hearth, bar, tables, lanternDrop, floor } = INN;
  const hang = floor + room.height - lanternDrop;
  return [
    [room.hw - hearth.depth / 2, floor + 0.45, hearth.z],
    [(bar.x0 + bar.x1) / 2, hang, bar.z - bar.depth / 2],
    [tables[0][0], hang, tables[0][1]],
    [tables[2][0], hang, tables[2][1]],
  ];
}

/**
 * The taproom's colliders, in the inn's frame. The walls are the outer walls'
 * footprint, with the doorway left open, so from outside the inn collides as
 * its old solid box did.
 */
export function innColliders(): Shapes {
  const { hw, hd, room, door, hearth, fireplace, bar, shelves, barrels, barrelRadius, tables, table } = INN;
  return {
    boxes: [
      ...wallShapes(hw, hd, room, door),
      [room.hw - hearth.depth / 2, hearth.z, hearth.depth / 2, hearth.width / 2],
      [-room.hw + fireplace.depth / 2, fireplace.z, fireplace.depth / 2, fireplace.width / 2],
      [(bar.x0 + bar.x1) / 2, bar.z - bar.depth / 2, (bar.x1 - bar.x0) / 2, bar.depth / 2],
      [0, -room.hd + shelves.depth / 2, shelves.half, shelves.depth / 2],
      ...tables.map(([x, z]) => [x, z, table.set.hw, table.set.hd] as const),
    ],
    circles: barrels.map(([x, z]) => [x, z, barrelRadius] as const),
  };
}

/**
 * The Golden Tankard's interior, for the inn standing at `inn` (its footprint
 * must be INN's). Its ground is the floor over the footprint and a ramp down
 * the steps outside the door; its walls and props are colliders.
 */
export function planInn(inn: Site): InteriorPlan {
  return planInterior({
    id: 'inn',
    site: inn,
    footprint: INN,
    floor: INN.floor,
    height: INN.room.height,
    door: INN.door,
    steps: INN.steps,
    shapes: innColliders(),
    flames: innFlames(),
    atmosphere: INN_ATMOSPHERE_BASE,
    wake: INN.wake,
  });
}
