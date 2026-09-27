import type { Camera, Object3D } from 'three';
import { CONFIG } from '../config';
import { Arena } from './arena';

// Every map the game has, for the map viewer (`?maps`) and anything else that
// lists or switches maps. Adding a map is one entry in MAPS.

/** A built map: its scene graph and whatever animates in it. */
export interface GameMap {
  readonly root: Object3D;
  /** Per-frame animation: torch flicker, billboards facing `camera`. */
  update(dt: number, camera: Camera): void;
  /** Floor height under (x, z), for walking at eye height. Flat at 0 when absent. */
  groundHeight?(x: number, z: number): number;
}

export interface MapEntry {
  /** URL key: `?maps=crypt`. */
  id: string;
  label: string;
  /** Background colour; fog fades to it. */
  sky: number;
  /** Fog near and far, in metres. */
  fog: readonly [near: number, far: number] | null;
  build(): GameMap;
}

export const MAPS: readonly MapEntry[] = [
  {
    id: 'crypt',
    label: 'Crypt hall',
    sky: 0x0c0a0e,
    fog: [6, CONFIG.arena.halfSize * 2.2],
    build: () => new Arena(),
  },
];

/** Index of the map with this id, or the first map. */
export function mapIndex(id: string | null): number {
  return Math.max(0, MAPS.findIndex((m) => m.id === id));
}
