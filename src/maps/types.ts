import type { Camera, Object3D, Vector3 } from 'three';
import type { Role } from '../adventureState';
import type { EnemyKind, Family } from '../models/characters';
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

/** A spot to stand on the floor plane, facing `yaw` (radians about +Y, 0 looks down −Z). */
export interface Spot {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

/**
 * Every camp in the zones, by id. The quest chain counts kills by these, so a
 * camp built under another name would never count (quests.ts).
 */
export type CampId = 'farm' | 'lumberCamp' | 'patrol' | 'watchtower' | 'mine';

/** One enemy's place in a camp: what it is, where it waits and which way it faces there. */
export interface PostPlan {
  /** How it fights: the thug is a grunt, the bandit leader a brute. */
  readonly behaviour: Exclude<EnemyKind, 'warden'>;
  /** What its kill pays for, if not an ordinary member: the bandit leader or one of the mine's deep brutes. */
  readonly role?: Extract<Role, 'leader' | 'deepBrute'>;
  /** Who it is: bandits wear the human body, the undead are skeletons. */
  readonly family: Family;
  readonly x: number;
  readonly z: number;
  /** As a model turns about +Y: its front faces (sin yaw, cos yaw), so 0 faces +Z. */
  readonly yaw: number;
}

/** A group of enemies waiting at one place, pulled a few at a time (enemies/camps.ts). */
export interface CampPlan {
  readonly id: CampId;
  /** Its clearing: a cleared camp refills only while you're well away from it. */
  readonly place: { readonly x: number; readonly z: number; readonly r: number };
  readonly level: number;
  readonly posts: readonly PostPlan[];
}

/** An outdoor region of the world, loaded into the World. */
export interface Zone extends MapBase {
  readonly kind: 'zone';
  /** The zone's meshes. No lights and no sky: those are the World's. */
  readonly root: Object3D;
  /** Its fog, sky colours and light, which the World applies. */
  readonly atmosphere: Atmosphere;
  /** Its enemies, camp by camp. */
  readonly camps: readonly CampPlan[];
  /** Where you wake after a death. */
  readonly respawns: { readonly village: Spot };
  /** Where Marshal Hale, the quest giver, stands (yaw as a model turns: 0 faces +Z). */
  readonly hale: Spot;
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
