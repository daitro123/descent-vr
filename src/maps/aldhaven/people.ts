import type { PersonPlan } from '../types';

// Aldhaven's villagers (maps/types.ts `PersonPlan`), built as you come near
// them. For now the Great Market and the Harbour Ward, from the city's cast
// (models/cityCast.ts), where the zone's inhabitants spec puts them
// (/zones/aldhaven-inhabitants.md in the project's files): the stallholders
// crying their wares round the cross, a man eating an apple on a bench, two
// talking, porters unloading the carts; on the Long Quay the crane hand
// walking the treadwheel and his mate signalling the load down, dockers
// carrying sacks off the Mary Elling, her crew on deck, the fishwives gutting
// and crying the catch, net menders and anglers sitting at their work, and
// the keeper with his pipe at the light's foot; a boatman in his boat and a
// bargeman on the barge by the Aldbridge. The rest of the city's people
// (the Watch, shoppers, Crown Hill, the close, Old Town, Guild Row, the gates
// and the farms) are placed from the same spec later.
//
// Where someone sits or stands on a prop, its floor is in world metres: the
// Mary Elling's deck 2.2, the barge's 0.65, the treadwheel's bottom rung 3.6
// (the crane stands at 2.44, its lowest rung 1.16 over that). The benches,
// stools and the keeper's crate are the city's own (maps/aldhaven/plan.ts).

/** Round the market cross (350, 345): the eight stallholders behind their stalls, facing it, crying their wares. */
const STALLS: readonly PersonPlan[] = (
  [
    ['baker', 356.4, 357.6, -2.67],
    ['fruiterer', 363.4, 349.4, -1.89],
    ['butcher', 362.6, 338.6, -1.1],
    ['clothier', 354.1, 331.1, -0.29],
    ['leatherworker', 343.1, 332.4, 0.5],
    ['chandler', 336.1, 340.8, 1.28],
    ['curioSeller', 337.4, 352.2, 2.09],
    ['flowerSeller', 345.6, 358.4, 2.82],
  ] as const
).map(([cast, x, z, yaw]) => ({ id: `aldhaven-market-${cast}`, cast, x, z, yaw, work: 'cry' }));

const MARKET: readonly PersonPlan[] = [
  ...STALLS,
  // On the benches under the plane trees: one eating an apple, an old man resting his legs.
  { id: 'aldhaven-market-bench-apple', cast: 'journeyman', x: 334, z: 332.5, yaw: 0, work: 'eat', seat: 0.5 },
  // The east bench stands on the slope, its seat 0.43 over the ground under its middle.
  { id: 'aldhaven-market-bench-old', cast: 'oldTownsman', x: 366, z: 332.5, yaw: 0, seat: 0.43 },
  // Two talking south of the cross, each speaking in turn.
  { id: 'aldhaven-market-talk-a', cast: 'townsman', x: 349.4, z: 351.4, yaw: 0.98, work: 'talk', start: 0 },
  { id: 'aldhaven-market-talk-b', cast: 'townswoman', x: 350.6, z: 352.2, yaw: -2.16, work: 'talk', start: 0.5 },
  // At the carts by the bank and the Exchange, beside each bed: a porter with crates, the miller with his flour.
  { id: 'aldhaven-market-porter', cast: 'porter', x: 344.2, z: 360.8, yaw: -1.27, work: 'unload' },
  { id: 'aldhaven-market-miller', cast: 'miller', x: 358.3, z: 360.9, yaw: -2.07, work: 'unload' },
];

/** The Long Quay to the light. */
const HARBOUR: readonly PersonPlan[] = [
  // The crane: one walking in its treadwheel, his mate at the quay's edge calling the load down off the ship.
  { id: 'aldhaven-crane-wheel', cast: 'porter2', x: 502, z: 385, yaw: 0, work: 'treadwheel', deck: 3.6 },
  { id: 'aldhaven-crane-signal', cast: 'docker2', x: 508.5, z: 388.6, yaw: -0.76, work: 'signal', cries: ['Lower away!', 'Steady! Steady...', 'Hold her there!'] },
  // Dockers carrying sacks off the Mary Elling's side to the cargo stacks, and back for the next.
  { id: 'aldhaven-docker-a', cast: 'docker', x: 497.3, z: 388.4, yaw: -2.3, route: [{ x: 490, z: 382 }, { x: 483, z: 382 }, { x: 478, z: 380 }] },
  { id: 'aldhaven-docker-b', cast: 'docker3', x: 497.3, z: 388.4, yaw: -2.3, start: 0.5, route: [{ x: 490, z: 382 }, { x: 483, z: 382 }, { x: 478, z: 380 }] },
  // The Mary Elling's crew on her deck: one hauling on a line at her mainmast, one coiling rope, facing the quay.
  { id: 'aldhaven-mary-elling-haul', cast: 'sailor2', x: 500, z: 394, yaw: -0.5, work: 'haul', deck: 2.2 },
  { id: 'aldhaven-mary-elling-coil', cast: 'deckhand', x: 505, z: 396, yaw: Math.PI, work: 'coil', deck: 2.2 },
  // Two sailors talking by the spare anchor.
  { id: 'aldhaven-quay-sailor-a', cast: 'sailor', x: 517.6, z: 387.4, yaw: Math.PI / 2, work: 'talk', start: 0 },
  { id: 'aldhaven-quay-sailor-b', cast: 'sailor3', x: 520.4, z: 387.4, yaw: -Math.PI / 2, work: 'talk', start: 0.5 },
  // The fish market: the fishwives behind their stalls, gutting and crying the catch; buyers haggling before them.
  { id: 'aldhaven-fishwife-a', cast: 'fishwife', x: 514, z: 380.6, yaw: Math.PI, work: 'gut' },
  { id: 'aldhaven-fishwife-b', cast: 'fishwife2', x: 520, z: 380.6, yaw: Math.PI, work: 'gut' },
  { id: 'aldhaven-fishwife-c', cast: 'fishwife3', x: 526, z: 380.6, yaw: Math.PI, work: 'gut' },
  { id: 'aldhaven-fish-buyer-a', cast: 'matron', x: 514.3, z: 376.2, yaw: -0.13, work: 'haggle' },
  { id: 'aldhaven-fish-buyer-b', cast: 'burgher', x: 520.6, z: 375.6, yaw: -0.2, work: 'haggle' },
  { id: 'aldhaven-fish-buyer-c', cast: 'oldTownswoman', x: 525, z: 376, yaw: 0.38, work: 'haggle' },
  // The customs officer at the customs house door, looking over a crate.
  { id: 'aldhaven-customs', cast: 'customsOfficer', x: 526, z: 373, yaw: -0.08, work: 'inspect' },
  // Net menders on their stools before the drying nets.
  { id: 'aldhaven-net-mender-a', cast: 'fisher', x: 480, z: 385.4, yaw: Math.PI, work: 'mend', seat: 0.45 },
  { id: 'aldhaven-net-mender-b', cast: 'fisher2', x: 486, z: 385.4, yaw: Math.PI, work: 'mend', seat: 0.45 },
  // Anglers on the mole's kerb over the basin, their legs hanging over the edge.
  { id: 'aldhaven-angler-a', cast: 'angler', x: 543.1, z: 392.3, yaw: -0.38, work: 'fish', seat: 0.5, hang: true },
  { id: 'aldhaven-angler-b', cast: 'angler2', x: 557.1, z: 397.9, yaw: -0.38, work: 'fish', seat: 0.5, hang: true },
  // The keeper on his crate at the light's foot, smoking, looking out over the basin.
  { id: 'aldhaven-light-keeper', cast: 'lighthouseKeeper', x: 565, z: 401, yaw: -0.8, work: 'pipe', seat: 0.45 },
];

/** On the river: a boatman sitting in his moored boat below the Aldbridge, coiling rope, facing the quay; a bargeman at the barge's bow, facing the wharf. */
const RIVER: readonly PersonPlan[] = [
  { id: 'aldhaven-boatman', cast: 'boatman', x: 406, z: 407.2, yaw: Math.PI, work: 'coil', deck: 0, seat: 0.45 },
  { id: 'aldhaven-bargeman', cast: 'bargeman', x: 324.8, z: 431.5, yaw: 0, deck: 0.65 },
];

export const ALDHAVEN_PEOPLE: readonly PersonPlan[] = [...MARKET, ...HARBOUR, ...RIVER];
