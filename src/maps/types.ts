import type { Camera, Object3D, Vector3 } from 'three';
import type { Role } from '../adventureState';
import type { RoadPoint } from '../enemies/patrol';
import type { Item, Place, VillagerId } from '../quests';
import type { EnemyKind, Family } from '../models/characters';
import type { PlaceSound, TreeCover, ZoneAmbience } from '../world/ambience';
import type { Atmosphere } from '../world/atmosphere';
import type { Interior as InteriorId } from '../save/record';
import type { SpotKind } from '../professions/professions';
import type { ChunkSource } from '../world/chunks';
import type { Interior } from '../world/interiors';
import type { Mine } from '../world/mine';
import type { Walkable } from './walkable';

// A map is a place the game can put you. A zone (Oakvale) is a pure plan and
// a chunk builder: loaded into the World, it's lit, given the sky and fog, its
// ground answered, and its chunks streamed in round you. A whole-build map
// (the crypt hall) brings its own lights and is built at once. Gameplay, the
// map viewer and tests all go through these, so a map never needs to know who
// is looking at it.

interface MapBase {
  readonly id: string;
  /** Where a player starts on the floor plane, and which way they face (radians about +Y, 0 looks down −Z). */
  readonly spawn: { x: number; z: number; yaw: number };
  /** The box round where you can walk, on the floor plane. */
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

/** Where a villager works (yaw as a model turns: 0 faces +Z), and the building they're in, if any. */
export interface VillagerSpot extends Spot {
  readonly id: VillagerId;
  readonly interior: InteriorId | null;
  /** How far round to their left (rad) they turn to their work's other place: the smith's bellows. */
  readonly turn: number;
}

/**
 * The stash's chest: where it stands (yaw as a model turns: 0 faces +Z, its
 * front), the floor's height under it, and the building it's in.
 */
export interface StashSpot extends Spot {
  readonly y: number;
  readonly interior: InteriorId;
}

/** Where you wake after a death, and the building it's in, if any. */
export interface Respawn extends Spot {
  readonly interior: InteriorId | null;
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
  /** Its level, if not its camp's (the mine's deep brutes). */
  readonly level?: number;
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
  /** Who stands where. A patrol's members stand here, in file on its road, when it fills. */
  readonly posts: readonly PostPlan[];
  /**
   * A patrol's road: its members walk it end to end in single file instead of
   * standing at their posts (enemies/patrol.ts), and it refills only while
   * you're well away from the road rather than from its place.
   */
  readonly road?: readonly RoadPoint[];
  /**
   * Where it is, if not out of doors: the mine's undead. It notices you and
   * fights you only while you're in there too, rock blocks its noticing you
   * and bringing others, and it refills only once you've left.
   */
  readonly interior?: InteriorId;
}

/** Something lying in a zone to pick up by hand (the leader's orders): where, and which way it lies. */
export interface Pickup extends Spot {
  readonly item: Item;
  /** The height of what it lies on. */
  readonly y: number;
}

/** How a chest looks: a wooden chest, or the bandits' iron-bound strongbox. Each look's size is in CONFIG.chests.looks. */
export type ChestLook = 'chest' | 'strongbox';

/**
 * A chest standing in a zone, opened once per character by touching its lid
 * (.scratch/inventory/spec.md, "Chests"). It holds coins and a piece of gear
 * by its area's level, and what's inside comes out on the ground beside it.
 */
export interface ChestPlan {
  /** Its id, as the save keeps it among the chests opened. */
  readonly id: string;
  /** Its area's level. */
  readonly level: number;
  readonly look: ChestLook;
  /** The middle of its foot, on the floor it stands on. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** As a model turns about +Y: its front faces (sin yaw, cos yaw), so 0 faces +Z. */
  readonly yaw: number;
  /** The building or mine it's in, if any. */
  readonly interior: InteriorId | null;
  /** Where what's inside comes out: on the ground beside it, out of your feet's way as you stand to open it. */
  readonly drop: { readonly x: number; readonly y: number; readonly z: number };
}

/**
 * A gathering spot in a zone (.scratch/professions/spec.md, "Gathering spots
 * and the tool loop"): a copper vein, or a clump of Hearthleaf or Duskcap. What
 * state it's in (full, being worked, taken, refilling) is the world's, not
 * the save's.
 */
export interface SpotPlan {
  /** Its name, for the checks and the log: 'smithy-east'. */
  readonly id: string;
  readonly kind: SpotKind;
  /** The middle of its foot, on the ground or floor it stands on. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** As a model turns about +Y: the way its face (a vein's ore) looks, (sin yaw, cos yaw). */
  readonly yaw: number;
  /** The mine it's in, if any: it loads and shows with the mine. */
  readonly interior: InteriorId | null;
}

/**
 * Where a quest sends you, for the quest arrow: the spot it points at, and
 * the clearing where you've arrived and it hides.
 */
export interface QuestPlace {
  readonly x: number;
  readonly z: number;
  readonly clearing: { readonly x: number; readonly z: number; readonly r: number };
}

/**
 * A zone's edge where a neighbour takes over, along z = `z` from x = `minX`
 * to `maxX`: its heights there, every `step` m from `minX`, which the
 * neighbour's land meets exactly, and the roads that run on over it.
 */
export interface Seam {
  readonly z: number;
  readonly minX: number;
  readonly maxX: number;
  readonly step: number;
  readonly heights: readonly number[];
  /** Where each road crosses the line, how wide it is, and which way it runs on (a unit vector over the floor plane). */
  readonly roads: readonly { readonly x: number; readonly width: number; readonly dir: readonly [number, number] }[];
}

/** An outdoor region of the world, loaded into the World. */
export interface Zone extends MapBase {
  readonly kind: 'zone';
  /** Its name, as you'd say it: "Oakvale". */
  readonly label: string;
  /**
   * The zone's extras: glows, water, the windmill's sails, smoke, signposts'
   * names and the map board. Its chunks are streamed in by the World beside
   * it. No lights and no sky: those are the World's too.
   */
  readonly root: Object3D;
  /** Its chunks on the world's grid, and how to build each at full or stand-in detail. */
  readonly chunks: ChunkSource;
  /** Where you can walk, as a shape. It reaches CONFIG.world.ground.seam over each seam, into its neighbour's. */
  readonly walkable: Walkable;
  /** The rectangle its land (its chunks' ground) covers, on the floor plane: the World asks it for heights there. */
  readonly land: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number };
  /** Push a point on the floor plane out of its trunks, rocks, walls and props, but not back inside where you can walk (the World does that, across zones). True if it moved. */
  collide(p: Vector3, radius: number): boolean;
  /** Its heights along each seam with a neighbour. */
  readonly seams: readonly Seam[];
  /** Its fog, sky colours and light, which the World applies. */
  readonly atmosphere: Atmosphere;
  /** Its enemies, camp by camp. */
  readonly camps: readonly CampPlan[];
  /** The buildings you walk into, built with the zone and hidden until their doors open. */
  readonly interiors: readonly Interior[];
  /** The old mine, built with the zone and hidden but for its adit until you walk in by its mouth. */
  readonly mine: Mine | null;
  /** Where the innkeeper, the smith and the farmer work. */
  readonly villagers: readonly VillagerSpot[];
  /** What lies about to be picked up by hand, shown while the adventure state says it lies there. */
  readonly pickups: readonly Pickup[];
  /** Its chests, each opened once per character. */
  readonly chests: readonly ChestPlan[];
  /** Its gathering spots: the copper veins, then the clumps of herbs. */
  readonly spots: readonly SpotPlan[];
  /** The places that sound where they are. */
  readonly sounds: readonly PlaceSound[];
  /** Its trees, which its birds call from. */
  readonly trees: TreeCover;
  /** Its own ambience, placed nowhere: Oakvale's woods, Brackenmoor's moor. */
  readonly ambience: ZoneAmbience;
}

/**
 * The starting zone (Oakvale): a zone with somewhere to wake, a quest giver
 * and the places the quests send you. A zone where nothing can hurt you
 * (Brackenmoor) has none of it.
 */
export interface StartingZone extends Zone {
  /** Where you wake after a death: the village's is by the inn's hearth, the mine's outside its mouth. */
  readonly respawns: { readonly village: Respawn; readonly mine: Respawn };
  /** The stash's chest, by the inn's hearth: touch its lid for the stash. */
  readonly stash: StashSpot;
  /** Where Marshal Hale, the quest giver, stands (yaw as a model turns: 0 faces +Z). */
  readonly hale: Spot;
  /** Where each quest sends you, for the quest arrow. */
  readonly places: Readonly<Record<Place, QuestPlace>>;
}

/** Is `zone` one a new character can start in? */
export function isStartingZone(zone: Zone): zone is StartingZone {
  return 'hale' in zone;
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

/** A zone as the registry lists it, before it's loaded. */
export interface ZoneInfo {
  readonly kind: 'zone';
  readonly id: string;
  readonly label: string;
  /** Where the zone sits on the world's chunk grid: its plan's (0, 0), in world metres. */
  readonly origin: { readonly x: number; readonly z: number };
  /** The zones across its seams, by id. */
  readonly neighbours: readonly string[];
  /** Plans the zone and builds its extras; its chunks are built as the World streams them. Split out and loaded on demand. */
  load(): Promise<Zone>;
}

/** A whole-build map as the registry lists it. */
export interface WholeInfo {
  readonly kind: 'whole';
  readonly id: string;
  readonly label: string;
  /** Builds the map. Heavy, so each map's code is split out and loaded on demand. */
  load(): Promise<WholeMap>;
}

export type MapInfo = ZoneInfo | WholeInfo;
