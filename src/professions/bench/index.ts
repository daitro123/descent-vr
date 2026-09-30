import { Group, Vector3 } from 'three';
import { HOUSE } from '../../maps/forest/house';
import type { Interior } from '../../world/interiors';
import { AlchemyBench, type BenchContext } from './bench';
import { Herbalist } from './herbalist';

// The alchemy bench and its herbalist, stood in the house by the well: hung
// from its room in the house's frame, so both are drawn only while the room is
// (.scratch/professions/issues/16-the-herbalist-and-the-alchemy-bench.md).

export { AlchemyBench } from './bench';
export { Herbalist } from './herbalist';

/** The bench, the herbalist and the circle nothing walks through where they stand. */
export interface HouseBench {
  readonly bench: AlchemyBench;
  readonly herbalist: Herbalist;
  /** The herbalist's body, in the world: stand it in the World. */
  readonly body: { readonly x: number; readonly z: number; readonly r: number };
}

/** Put the bench against `house`'s right wall and the herbalist at its end. */
export function standInHouse(house: Interior, ctx: BenchContext, radius: number): HouseBench {
  const { room, bench: b } = HOUSE;
  const frame = new Group();
  frame.name = 'house-frame';
  frame.position.set(house.frame.x, house.floor, house.frame.z);
  frame.rotation.y = house.frame.yaw;
  house.room.add(frame);

  const bench = new AlchemyBench(ctx);
  // Its back against the wall, its front (+z) out into the room.
  bench.root.position.set(room.hw - b.depth, 0, b.z);
  bench.root.rotation.y = -Math.PI / 2;
  frame.add(bench.root);

  const herbalist = new Herbalist();
  herbalist.root.position.set(b.herbalist.x, 0, b.herbalist.z);
  herbalist.root.rotation.y = b.herbalist.yaw;
  frame.add(herbalist.root);

  frame.updateMatrixWorld(true);
  const at = herbalist.root.getWorldPosition(new Vector3());
  return { bench, herbalist, body: { x: at.x, z: at.z, r: radius } };
}
