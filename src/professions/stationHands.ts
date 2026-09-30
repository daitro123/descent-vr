import { CONFIG } from '../config';

// One rule for hands at a station (.scratch/professions/spec.md, "Stations"):
// step within about 1.3 m of one, facing it and out of a fight, and both
// hands become the station's (the smith's hammer and tongs at the anvil,
// open hands at the alchemy bench); step back past about 2 m and they're
// yours again. A fight takes them back at once. Once they're the station's,
// turning away (to the forge, the bucket) keeps them.

/** Where you stand to a station this frame. */
export interface AtStation {
  /** Metres from the station to your head, over the ground. */
  readonly distance: number;
  /** Radians between where you look and the station, over the ground. */
  readonly facing: number;
  /** Is anything fighting you? */
  readonly fighting: boolean;
}

/** Are your hands the station's this frame, given whether they were last frame? */
export function stationHands(were: boolean, at: AtStation): boolean {
  const S = CONFIG.professions.station;
  if (at.fighting) return false;
  if (were) return at.distance <= S.far;
  return at.distance <= S.near && at.facing <= S.facing;
}

/**
 * Where you stand to a station at (sx, sz), your head at (hx, hz) looking
 * along (gx, gz) over the ground.
 */
export function atStation(sx: number, sz: number, hx: number, hz: number, gx: number, gz: number, fighting: boolean): AtStation {
  const dx = sx - hx;
  const dz = sz - hz;
  const distance = Math.hypot(dx, dz);
  const look = Math.hypot(gx, gz);
  const facing = distance < 1e-6 || look < 1e-6 ? 0 : Math.acos(Math.max(-1, Math.min(1, (dx * gx + dz * gz) / (distance * look))));
  return { distance, facing, fighting };
}
