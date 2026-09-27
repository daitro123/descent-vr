import type { Camera, Object3D, Vector3 } from 'three';

// A map is a place the game can put you: its scene, its sky, and the ground
// rules for walking on it. Gameplay, the map viewer and tests all go through
// this interface, so a map never needs to know who is looking at it.

export interface GameMap {
  readonly id: string;
  /** Everything to add to the scene, including the map's own lights. */
  readonly root: Object3D;
  /** Scene background and distance fog. */
  readonly sky: { background: number; fog: { color: number; near: number; far: number } };
  /** Camera far plane this map needs, in metres. */
  readonly viewDistance: number;
  /** Where a player starts on the floor plane, and which way they face (radians about +Y, 0 looks down −Z). */
  readonly spawn: { x: number; z: number; yaw: number };
  /** The walkable extent on the floor plane. */
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Named spots worth a look, for the viewer's jump list. */
  readonly landmarks: readonly { label: string; x: number; z: number }[];
  /** Ground height at (x, z), in metres. */
  heightAt(x: number, z: number): number;
  /** Push a point on the floor plane out of walls, trees and props. True if it moved. */
  resolve(p: Vector3, radius: number): boolean;
  /** Per-frame animation (torches, water). `camera` is for billboards. */
  update(dt: number, camera: Camera): void;
}

export interface MapInfo {
  id: string;
  label: string;
  /** Builds the map. Heavy, so each map's code is split out and loaded on demand. */
  load(): Promise<GameMap>;
}
