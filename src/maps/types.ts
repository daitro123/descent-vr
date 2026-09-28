import type { Camera, Object3D, Vector3 } from 'three';
import type { Atmosphere } from '../world/atmosphere';

// A map is a place the game can put you. A zone (Oakvale) is loaded into the
// World, which lights it, gives it the sky and fog, and answers its ground; a
// whole-build map (the crypt hall) brings its own lights. Gameplay, the map
// viewer and tests all go through these, so a map never needs to know who is
// looking at it.

interface MapBase {
  readonly id: string;
  /** Where a player starts on the floor plane, and which way they face (radians about +Y, 0 looks down −Z). */
  readonly spawn: { x: number; z: number; yaw: number };
  /** The walkable extent on the floor plane. */
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Named spots worth a look, for the viewer's jump list. */
  readonly landmarks: readonly { label: string; x: number; z: number }[];
  /** Ground height at (x, z), in metres. */
  heightAt(x: number, z: number): number;
  /** Push a point on the floor plane out of walls, trees and props, and back inside the bounds. True if it moved. */
  resolve(p: Vector3, radius: number): boolean;
  /** Per-frame animation (torches, water). `camera` is for billboards. */
  update(dt: number, camera: Camera): void;
}

/** An outdoor region of the world, loaded into the World. */
export interface Zone extends MapBase {
  readonly kind: 'zone';
  /** The zone's meshes. No lights and no sky: those are the World's. */
  readonly root: Object3D;
  /** Its fog, sky colours and light, which the World applies. */
  readonly atmosphere: Atmosphere;
}

/** A map built whole, lights and all: the crypt hall. */
export interface WholeMap extends MapBase {
  readonly kind: 'whole';
  /** Everything to add to the scene, including the map's own lights. */
  readonly root: Object3D;
  /** Scene background and distance fog. */
  readonly sky: { background: number; fog: { color: number; near: number; far: number } };
  /** Camera far plane this map needs, in metres. */
  readonly viewDistance: number;
}

export type GameMap = Zone | WholeMap;

export interface MapInfo {
  id: string;
  label: string;
  /** Builds the map. Heavy, so each map's code is split out and loaded on demand. */
  load(): Promise<GameMap>;
}
