import type { Shapes } from './interiorPlan';

// The smithy: an open-fronted lean-to you walk in under, up to the forge and
// the anvil. No door and no switch: it's lit by the sun. What stands where,
// in its own frame (origin on the ground at the footprint's centre, the open
// front facing +Z); buildings.ts builds it from the same numbers.

export const SMITHY = {
  hw: 3.5,
  hd: 3,
  /** The stone back wall, full width: its thickness. */
  back: 0.45,
  /** The low side wall on the left, from the back wall to the front: its thickness. */
  side: 0.45,
  /** The roof's posts: along the back and the front, at the ends and the middle. */
  posts: { size: 0.26, inset: 0.2 },
  /** The forge in the back left corner: its middle and half extents. */
  forge: { x: -2.2, z: -1.8, hw: 0.9, hd: 0.7 },
  /** The top of the forge's flue, over the floor. */
  flue: 5.4,
  /** The anvil on its stump, a step from the forge. */
  anvil: { x: -0.35, z: -0.2, r: 0.46 },
  /** The bellows on their stand against the forge's right side, blowing into it: middle and half extents, and their handle's end. */
  bellows: { x: -0.875, z: -1.65, hw: 0.425, hd: 0.22, handle: { x: -0.5, z: -1.45, y: 1.0 } },
  /** Where the smith stands at the anvil (ticket 29), facing it and the open front, with the bellows' handle behind them on their right. */
  smith: { x: -0.2, z: -0.95 },
  /** Where the smith steps aside to while you work the anvil, out of the way to the forge. */
  aside: { x: 1.3, z: -1.9 },
  /** The quench bucket beside the anvil (the anvil's station builds it): the barrel is across the room. */
  bucket: { x: 0.45, z: -0.5, r: 0.17, water: 0.56 },
  /** The quench barrel. */
  barrel: { x: 2.3, z: 1.8, r: 0.34 },
  /** The grindstone in its frame, the wheel turning across X. */
  grindstone: { x: 2.5, z: -0.9, hw: 0.42, hd: 0.2 },
  /** A crate in the back right corner. */
  crate: { x: 2.9, z: -2.23, half: 0.32 },
} as const;

/**
 * What you bump into under the smithy's roof, in its frame: the back wall,
 * the low side wall, the forge and its bellows, the anvil, the barrel, the grindstone, the
 * crate and the front posts. The open front and the right side let you in.
 */
export function smithyColliders(): Shapes {
  const { hw, hd, back, side, posts, forge, anvil, bellows, barrel, grindstone, crate } = SMITHY;
  const post = posts.size / 2;
  const front = hd - posts.inset;
  return {
    boxes: [
      [0, -hd + back / 2, hw, back / 2],
      [-hw + side / 2, back / 2, side / 2, hd - back / 2],
      [forge.x, forge.z, forge.hw, forge.hd],
      [bellows.x, bellows.z, bellows.hw, bellows.hd],
      [grindstone.x, grindstone.z, grindstone.hw, grindstone.hd],
      [crate.x, crate.z, crate.half, crate.half],
      [0, front, post, post],
      [hw - posts.inset, front, post, post],
    ],
    circles: [
      [anvil.x, anvil.z, anvil.r],
      [barrel.x, barrel.z, barrel.r],
    ],
  };
}
