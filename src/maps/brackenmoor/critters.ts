import type { CritterPlan } from '../types';

// Brackenmoor's critters (maps/types.ts `CritterPlan`, world/critters.ts):
// the hares of the open grass south of Cairnford, from the zone's inhabitants
// spec (/zones/brackenmoor-inhabitants.md in the project's files). Each sits
// about its spot, hops, sits up as you come, and bolts zig-zagging away.

export const MOOR_CRITTERS: readonly CritterPlan[] = [
  { look: 'hare', x: -20, z: 480, yaw: 0.6 },
  { look: 'hare', x: 130, z: 470, yaw: -2.2 },
  { look: 'hare', x: -110, z: 470, yaw: 1.9 },
];
