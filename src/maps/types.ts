import type { Camera, Object3D, Vector3 } from 'three';
import type { Role } from '../adventureState';
import type { RoadPoint } from '../enemies/patrol';
import type { Item, Place, QuestMoment, VillagerId } from '../quests';
import type { BirdLookId } from '../models/bird';
import type { EnemyFamily, EnemyKind } from '../models/characters';
import type { CritterLook } from '../models/critters';
import type { CastId } from '../people/cast';
import type { WorkName } from '../people/work';
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

/**
 * Where one of Oakvale's own villagers works (yaw as a model turns: 0 faces
 * +Z), and the building they're in, if any: the innkeeper, the smith, the
 * farmer and the herbalist, whom the quests, the wares and the trainers know
 * by name. Any other villager is a `PersonPlan`.
 */
export interface VillagerSpot extends Spot {
  readonly id: VillagerId;
  readonly interior: InteriorId | null;
  /** How far round to their left (rad) they turn to their work's other place: the smith's bellows. */
  readonly turn: number;
}

/**
 * A villager a zone places by data (people/population.ts): who they are, where
 * they stand at their work or which way they stroll, and what they say as you
 * pass. Built as you come within CONFIG.population.near and dropped as you go
 * on, like the chunks round them, so a zone can hold as many as its streets
 * want; only those near you cost anything. Out of doors only, for now: no
 * zone but Oakvale has interiors.
 */
export interface PersonPlan {
  /** Unique across the world, for the checks and the log: 'cairnford-shepherd'. */
  readonly id: string;
  /** Who they are: one of the cast (people/cast.ts), their body, clothes, stand and name. */
  readonly cast: CastId;
  /** Where their feet are, in world metres (x east, z south). */
  readonly x: number;
  readonly z: number;
  /** Which way they face at their work, as a model turns: their front faces (sin yaw, cos yaw), so 0 faces +Z. A stroller faces the way they walk. */
  readonly yaw: number;
  /** What they do there, round and round (people/work.ts WORKS): standing about without one. */
  readonly work?: WorkName;
  /** For a work with a second place (the smith's bellows): how far round to their left it stands, in radians. */
  readonly turn?: number;
  /** Their name over their barks, if not their cast's: "Old Maud". */
  readonly label?: string;
  /** What they say as you pass, one line after the next each time you come close: none, and they say nothing. */
  readonly barks?: readonly string[];
  /**
   * A stroll: from (x, z) along these points and back again, at a walk,
   * standing a while at each end at their work. They stop and turn to you as
   * you come near, as one standing at their work does. The way must be clear
   * to walk: a street, a road, a quay.
   */
  readonly route?: readonly RoadPoint[];
  /** There only from this moment of a quest on: the Fairweathers' son, home on the raft after North Wind. */
  readonly from?: QuestMoment;
  /** Gone from this moment of a quest on, for good: Jory Hask, once his office is empty. */
  readonly until?: QuestMoment;
  /**
   * Lying dead where they fell, face down: still, silent, not solid, never
   * turning to you or doing anything (the diggers by the open barrow). No
   * work, route or barks.
   */
  readonly fallen?: boolean;
}

/**
 * How many villagers are built round you, and how near (people/population.ts):
 * the nearest `most` within `near` m (or the fog's far edge, if nearer). A
 * city's house rows hide its streets past about 50 m, so it can show a nearer,
 * thicker crowd than the open moor: the zones' inhabitants specs measure each
 * against the frame budget (/zones/<zone>-inhabitants.md in the project's files).
 */
export interface Crowd {
  readonly near: number;
  readonly most: number;
}

/**
 * How a flock of birds lives (birds/ways.ts), as the inhabitant specs ask:
 * - `peck`: feeds about its patch of ground; runs off from you and wanders back (hens).
 * - `graze`: feeds about its patch; one hisses at you while the rest waddle off (geese).
 * - `flush`: feeds about its patch; bursts up all at once as you come through,
 *   settles on its perches, and drops back down once you've gone (pigeons).
 * - `covey`: hidden in cover until you're nearly on it, then bursts up and flies
 *   off low a long way before dropping back in; home again later (grouse).
 * - `perch`: each bird on its own perch; flies off as you come near, circles
 *   overhead and lands again once you've gone (ravens, crows, gulls on bollards).
 * - `circle`: circles overhead, never landing (gulls over a harbour).
 * - `swim`: paddles about its stretch of water and dabbles; flies off as you
 *   wade in and comes back down onto it later (ducks), or paddles away (swans).
 * - `wade`: stands in the shallows and strikes at the water; flies off as you
 *   near, a long way, and comes home again later (herons, egrets).
 */
export type BirdWays = 'peck' | 'graze' | 'flush' | 'covey' | 'perch' | 'circle' | 'swim' | 'wade';

/**
 * Where a bird can sit: the perch's top (world metres; none, the ground
 * there) and which way birds there face; a ridge or a rail holds them in a
 * row `w` m long, across the way they face.
 */
export interface Perch {
  readonly x: number;
  readonly y?: number;
  readonly z: number;
  readonly yaw?: number;
  readonly w?: number;
}

/**
 * A flock a zone places by data (birds/birds.ts): which birds, how they live
 * and where. One flock is one mesh and one draw call however many birds are
 * in it. Built as you come within CONFIG.birds.near and dropped as you go,
 * like the villagers; back home and at peace when it's built again.
 */
export interface FlockPlan {
  /** Unique across the world, prefixed with the place: 'aldhaven-market-pigeons'. */
  readonly id: string;
  readonly ways: BirdWays;
  /** Its birds, one look each (models/bird.ts BIRD_LOOKS), in order: a drake and a duck, a cock among hens. */
  readonly birds: readonly BirdLookId[];
  /**
   * Where it keeps (world metres, x east, z south): the middle of the ground
   * or water it feeds on and how far round it goes; a covey's or a heron's
   * spot; the middle of where perchers or gulls circle, and how wide.
   */
  readonly x: number;
  readonly z: number;
  readonly r: number;
  /** A percher's perches (one per bird, in turn), or where a flushed flock settles. */
  readonly perches?: readonly Perch[];
  /** How near you come before it takes fright, if not its kind's (m). */
  readonly shy?: number;
  /** Circling, how high over the ground or water it goes, lowest and highest (m). */
  readonly high?: readonly [number, number];
}

/**
 * A critter a zone places by data (world/critters.ts): a hare on the moor, a
 * frog at a pool's edge, a rat along a wall. It lives round its spot by its
 * family's rule and runs from you, so `yaw` says which way: a frog leaps the
 * way it faces, into the water; a rat runs along its wall this way or back.
 */
export interface CritterPlan {
  readonly look: CritterLook;
  /** Its spot, in world metres (x east, z south). */
  readonly x: number;
  readonly z: number;
  /** As a model turns: its front faces (sin yaw, cos yaw), so 0 faces +Z. */
  readonly yaw: number;
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
 * A camp's id, unique across the world: the quest chain counts kills by it, so
 * a camp built under another name would never count (quests.ts). Oakvale's are
 * 'farm', 'lumberCamp', 'patrol', 'watchtower' and 'mine'; another zone's
 * begin with the zone's id: 'brackenmoor-raven-scar'. tests/population.test.ts
 * checks both.
 */
export type CampId = string;

/** One enemy's place in a camp: what it is, where it waits and which way it faces there. */
export interface PostPlan {
  /** How it fights: the thug is a grunt, the bandit leader a brute. */
  readonly behaviour: Exclude<EnemyKind, 'warden'>;
  /** What its kill pays for, if not an ordinary member: the bandit leader or one of the mine's deep brutes. */
  readonly role?: Extract<Role, 'leader' | 'deepBrute'>;
  /** Its level, if not its camp's (the mine's deep brutes). */
  readonly level?: number;
  /** Who it is: the undead are skeletons, the bandits, House Corvane's men, the smugglers and the raiders wear the human body, leeches and adders are crawlers. */
  readonly family: EnemyFamily;
  /**
   * Which of its family's looks, if a set one. A leech's are 0 the black mire
   * leech, 1 the pale fen leech and 2 the Old Mother Leech. Unset, a person or
   * skeleton takes one at random and a leech is a mire leech.
   */
  readonly variant?: number;
  /**
   * Which of its family's named fighters it is, if one (FamilyDef.named): a
   * leader or a boss dressed for this post, fighting with its own behaviour,
   * which `behaviour` must be. The Lantern Men's 'leader', 'crake'.
   */
  readonly named?: string;
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
  /**
   * Leaves you be until this moment of a quest: it notices you only once you
   * hurt one of it (and brings its campmates then, as any camp does).
   * Fellgate's bailiffs, until Letters from the House.
   */
  readonly neutralUntil?: QuestMoment;
  /** There only from this moment of a quest on: the smuggler punt's crew, once you've shown the lantern signal. */
  readonly from?: QuestMoment;
  /**
   * Gone from this moment of a quest on, for good, once it's calm and its
   * fallen have fallen. A camp that comes or goes is raised only while you're
   * near, as another zone's camps are, even in the starting zone.
   */
  readonly until?: QuestMoment;
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

/**
 * A zone's edge where a neighbour to its east or west takes over, along x =
 * `x` from z = `minZ` to `maxZ`: its heights there, every `step` m from
 * `minZ`, which the neighbour's land meets exactly, and the roads that run on
 * over it (Brackenmoor's Fen road into the Sallows).
 */
export interface SideSeam {
  readonly x: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly step: number;
  readonly heights: readonly number[];
  /** Where each road crosses the line, how wide it is, and which way it runs on (a unit vector over the floor plane). */
  readonly roads: readonly { readonly z: number; readonly width: number; readonly dir: readonly [number, number] }[];
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
  /** Its heights along each seam with a neighbour north or south of it. */
  readonly seams: readonly Seam[];
  /** Its heights along each seam with a neighbour east or west of it, if it has any. */
  readonly sideSeams?: readonly SideSeam[];
  /** Its fog, sky colours and light, which the World applies. */
  readonly atmosphere: Atmosphere;
  /**
   * Its enemies, camp by camp. The starting zone's stand from the start; any
   * other zone's are raised as you come within CONFIG.population.near of
   * their clearing (or a patrol's road) and laid to rest once you've gone and
   * they're calm (enemies/camps.ts).
   */
  readonly camps: readonly CampPlan[];
  /** The buildings you walk into, built with the zone and hidden until their doors open. */
  readonly interiors: readonly Interior[];
  /** The old mine, built with the zone and hidden but for its adit until you walk in by its mouth. */
  readonly mine: Mine | null;
  /** Where Oakvale's own villagers work: the innkeeper, the smith, the farmer and the herbalist. */
  readonly villagers: readonly VillagerSpot[];
  /** Its other villagers, placed by data and built as you come near them. */
  readonly people: readonly PersonPlan[];
  /** Its birds, flock by flock, placed by data and built as you come near them. */
  readonly birds: readonly FlockPlan[];
  /** How near you villagers are built while you're in it, and how many at once. */
  readonly crowd: Crowd;
  /** Its critters, placed by data, living and drawn only while you're near (world/critters.ts). */
  readonly critters?: readonly CritterPlan[];
  /** The water's surface at (x, z) where water stands over the ground, or null where it's dry (Ground.waterAt). Without it, the zone is dry. */
  waterAt?(x: number, z: number): number | null;
  /**
   * Where you wake after dying in it, out of doors: the one nearest where you
   * fell. None, and you wake by Oakvale's inn hearth (a death in the mine
   * wakes you outside its mouth, whatever this says).
   */
  readonly respawnPoints: readonly Respawn[];
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
