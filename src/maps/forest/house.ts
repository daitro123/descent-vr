import type { Atmosphere } from '../../world/atmosphere';
import type { InteriorPlan } from '../../world/interiors';
import { LIGHT, SKY } from './palette';
import { planInterior, type Shapes, type Site, wallShapes } from './interiorPlan';

// The house by the well: the slate-roofed cottage facing the crossroads, with
// the lantern at its door. The plan only (what stands where, what you bump
// into, its flames), in the house's own frame: origin on the ground at the
// footprint's centre, front (+Z) facing the crossroads, x across the front.
// The outside is buildings.ts's cottage; houseModel.ts builds the room.

/** The house's footprint and outer walls, and its one room, open to the rafters. */
export const HOUSE = {
  hw: 3.5,
  hd: 3,
  /** Thickness of the outer walls. */
  wall: 0.2,
  /** The floor, on the 0.3 m foundation. */
  floor: 0.31,
  /** The foundation's top, which the outer walls stand on, and their tops, where the roof starts; and how far it rises to the ridge. */
  base: 0.3,
  eaves: 3.2,
  rise: 2.5,
  /** The room's walls stand just inside the outer walls: its half width and depth. */
  room: { hw: 3.2, hd: 2.7 },
  /** The door's leaf hangs in the doorway this far out from the room's front wall. */
  leaves: { z: 2.88, thick: 0.05 },
  /** The doorway, right of the front's middle as you face it: its middle across the front, clear width and height over the floor. */
  door: { x: 0.9, width: 1.2, height: 2.05 },
  /** Down the steps outside the door, the floor meets the ground this far out. */
  steps: { width: 1.6, out: 1.0 },
  /** The hearth in the back right corner, against the right wall under the chimney: its middle along the wall (at the back wall), its width, how far it stands out, and its mouth. */
  hearth: { z: -2.0, width: 1.4, depth: 0.7, mouth: 1.05 },
  /** The chimney over it, at the gable end: its middle across the front, and how far it rises over the eaves. */
  chimney: { x: 3.1, rise: 3.1 },
  /** The bed along the left wall, its head against the back wall. */
  bed: { x: -2.65, z: -1.65, hw: 0.5, hd: 1.0 },
  /** The chest across the bed's foot. */
  chest: { x: -2.65, z: -0.4, hw: 0.45, hd: 0.25 },
  /** The table, with a chair at either end: the set takes `set` of room. */
  table: { x: -0.9, z: 0.8, hw: 0.55, hd: 0.4, height: 0.75, chair: 0.8, set: { hw: 1.05, hd: 0.4 } },
  /** The shelf of crocks against the back wall, between the back window and the hearth. */
  shelf: { x: 1.0, hw: 0.55, depth: 0.32, height: 1.5 },
  /** The rug before the hearth. */
  rug: { x: 1.4, z: -0.9, hw: 0.85, hd: 0.6 },
  /** The broom, leant in the front right corner. */
  broom: { x: 2.95, z: 2.45 },
} as const;

/** The house with the door shut: the hearth's warm dark, a low fill instead of the sky, fog close in. */
export const HOUSE_ATMOSPHERE_BASE: Omit<Atmosphere, 'flames'> = {
  background: 0x140d08,
  fog: { color: 0x2a1c12, near: 3, far: 24 },
  sky: { zenith: SKY.zenith, horizon: SKY.horizon, haze: SKY.haze, sun: SKY.sun },
  sun: { color: LIGHT.sun, intensity: 0 },
  hemisphere: { sky: 0xffc890, ground: 0x3a2618, intensity: 0.5 },
  farPlane: 60,
};

/** Where the roof's underside is over the room at `z`: the slope from the eaves up to the ridge. */
export function roofAt(z: number): number {
  const { eaves, rise, hd } = HOUSE;
  return eaves + rise * (1 - Math.abs(z) / hd);
}

/** The two flames the pool sits on, in the house's frame: the hearth and the candle on the table. */
export function houseFlames(): readonly [number, number, number][] {
  const { room, hearth, table, floor } = HOUSE;
  return [
    [room.hw - hearth.depth * 0.45, floor + 0.35, hearth.z],
    [table.x, floor + table.height + 0.19, table.z],
  ];
}

/**
 * The house's colliders, in its frame. The walls are the outer walls'
 * footprint, with the doorway left open, so from outside the house collides
 * as its old solid box did. The rug and the broom (in a corner no body
 * reaches) don't collide.
 */
export function houseColliders(): Shapes {
  const { hw, hd, room, door, hearth, bed, chest, table, shelf } = HOUSE;
  return {
    boxes: [
      ...wallShapes(hw, hd, room, door),
      [room.hw - hearth.depth / 2, hearth.z, hearth.depth / 2, hearth.width / 2],
      [bed.x, bed.z, bed.hw, bed.hd],
      [chest.x, chest.z, chest.hw, chest.hd],
      [table.x, table.z, table.set.hw, table.set.hd],
      [shelf.x, -room.hd + shelf.depth / 2, shelf.hw, shelf.depth / 2],
    ],
    circles: [],
  };
}

/** The house's interior, for the house standing at `house` (its footprint must be HOUSE's). Nobody is home. */
export function planHouse(house: Site): InteriorPlan {
  return planInterior({
    id: 'house',
    site: house,
    footprint: HOUSE,
    floor: HOUSE.floor,
    // You're inside below the eaves: above them, over the roof's slope, is outdoors.
    height: HOUSE.eaves - HOUSE.floor,
    door: HOUSE.door,
    steps: HOUSE.steps,
    shapes: houseColliders(),
    flames: houseFlames(),
    atmosphere: HOUSE_ATMOSPHERE_BASE,
  });
}
