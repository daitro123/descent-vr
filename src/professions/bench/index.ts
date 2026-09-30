import { Group } from 'three';
import { HOUSE } from '../../maps/forest/house';
import type { Interior } from '../../world/interiors';
import { AlchemyBench, type BenchContext } from './bench';

// The alchemy bench, stood in the house by the well: hung from its room in the
// house's frame, so it's drawn only while the room is. The herbalist at its end
// is a villager like the others (people/villagers.ts), placed by the zone's
// plan (.scratch/professions/issues/16-the-herbalist-and-the-alchemy-bench.md,
// 18-trainers-and-intro-quests.md).

export { AlchemyBench } from './bench';

/** Put the bench against `house`'s right wall. */
export function standInHouse(house: Interior, ctx: BenchContext): AlchemyBench {
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
  frame.updateMatrixWorld(true);
  return bench;
}
