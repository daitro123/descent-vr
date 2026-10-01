import type { AnimalId } from '../../models/animals';
import type { HerdPlan } from '../types';

// Brackenmoor's livestock (maps/types.ts `HerdPlan`, animals/herds.ts), from
// its inhabitants spec (/zones/brackenmoor-inhabitants.md in the project's
// files), whose spots were checked against the built moor. The zone's story is
// told in sheep: a few hardy moor ewes on the open moor, whose flocks were
// sold, that run from you; and the landlord's enclosure full of fat white
// sheep, used to men, that don't. Wenna's sheepdog minds her flock at Hob's
// Fold; the town dog sleeps by the inn's barrels; Joss's cart horse waits in
// the wagon yard and Dunmore's riding horse in Fellgate's forecourt.

const ewes = (n: number): AnimalId[] => Array.from({ length: n }, () => 'moorEwe');
const white: AnimalId[] = ['whiteSheep', 'whiteSheep', 'whiteSheep', 'whiteSheep'];

export const MOOR_ANIMALS: readonly HerdPlan[] = [
  // Wenna's flock, inside Hob's Fold's ring of stones (6 m round, its gap to the east).
  { kind: 'flock', id: 'brackenmoor-hobs-fold', x: -36, z: 222, sheep: [...ewes(5), 'lamb'], roam: 3.6, shy: true },
  // Her sheepdog, lying by her door watching the fold, and going round it outside the stones.
  { kind: 'dog', id: 'brackenmoor-wennas-dog', x: -27.6, z: 233.2, yaw: -2.5, dog: 'sheepdog', minds: 'brackenmoor-hobs-fold', ring: 8.5 },
  // The strays, alone on Passfoot's slopes.
  { kind: 'flock', id: 'brackenmoor-stray-north', x: -52, z: 208, sheep: ewes(1), roam: 4, shy: true },
  { kind: 'flock', id: 'brackenmoor-stray-east', x: -16, z: 196, sheep: ewes(1), roam: 4, shy: true },
  { kind: 'flock', id: 'brackenmoor-stray-west', x: -58, z: 240, sheep: ewes(1), roam: 4, shy: true },
  // Moor ewes in threes on the open moor.
  { kind: 'flock', id: 'brackenmoor-ewes-passfoot', x: -30, z: 280, sheep: ewes(3), shy: true },
  { kind: 'flock', id: 'brackenmoor-ewes-west', x: -40, z: 465, sheep: ewes(3), shy: true },
  { kind: 'flock', id: 'brackenmoor-ewes-south', x: 64, z: 494, sheep: ewes(3), shy: true },
  // Cairnford's walled intakes.
  { kind: 'flock', id: 'brackenmoor-intake-north', x: 2, z: 312, sheep: ewes(4), roam: 5, shy: true },
  { kind: 'flock', id: 'brackenmoor-intake-south', x: 82, z: 437, sheep: ewes(4), roam: 5, shy: true },
  // The landlord's enclosure: four flocks of white sheep that only step out of your way.
  { kind: 'flock', id: 'brackenmoor-enclosure-north', x: 175, z: 280, sheep: white, roam: 7, shy: false },
  { kind: 'flock', id: 'brackenmoor-enclosure-middle', x: 200, z: 318, sheep: white, roam: 7, shy: false },
  { kind: 'flock', id: 'brackenmoor-enclosure-park', x: 200, z: 375, sheep: white, roam: 7, shy: false },
  { kind: 'flock', id: 'brackenmoor-enclosure-south', x: 150, z: 410, sheep: white, roam: 7, shy: false },
  // The town dog asleep by the inn's barrels.
  { kind: 'dog', id: 'brackenmoor-town-dog', x: 52.2, z: 359.9, yaw: -1.9, dog: 'townDog' },
  // Joss's cart horse in the wagon yard, facing the road; Dunmore's riding horse in the forecourt, its groom at its side.
  { kind: 'tethered', id: 'brackenmoor-cart-horse', x: 92.6, z: 354.8, yaw: 0, horse: 'cartHorse' },
  { kind: 'tethered', id: 'brackenmoor-riding-horse', x: 169.4, z: 329, yaw: Math.PI / 2, horse: 'ridingHorse' },
];
