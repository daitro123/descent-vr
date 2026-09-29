import type { Camera, Object3D, Vector3 } from 'three';
import { CONFIG } from '../config';
import type { Spot } from '../maps/types';
import type { Interior as InteriorId } from '../save/record';
import type { Atmosphere } from './atmosphere';

// Buildings you walk into. An interior is built with its zone and hidden
// until its door opens; inside its footprint the ground is its own. One small
// state machine, the Interiors switch, decides from where you stand whether
// its door is open, whose light you're in and whether the outdoors is drawn
// (.scratch/oakvale-starting-zone/spec.md, "Interiors").

/** A flame the World's pool of point lights may sit on. */
export interface Flame {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A building's frame: the footprint's centre on the ground, its front (+Z) facing (sin yaw, cos yaw). */
export interface Frame {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly y: number;
}

/** The point (x, z) on the floor plane, in `frame`'s own axes, written into `out`. */
export function toFrame<T extends { x: number; z: number }>(frame: Omit<Frame, 'y'>, x: number, z: number, out: T): T {
  const dx = x - frame.x;
  const dz = z - frame.z;
  const c = Math.cos(frame.yaw);
  const s = Math.sin(frame.yaw);
  out.x = dx * c - dz * s;
  out.z = dx * s + dz * c;
  return out;
}

/** An interior's plan: where it stands, its ground, its door, its flames and its air. No meshes. */
export interface InteriorPlan {
  readonly id: InteriorId;
  /** Its building's frame. */
  readonly frame: Frame;
  /** Half extents of the footprint, in the frame: inside it the ground is the interior's. */
  readonly footprint: { readonly hw: number; readonly hd: number };
  /** The floor's height, in world metres. */
  readonly floor: number;
  /** Floor to ceiling, metres: you're only inside below it (a camera flying over isn't). */
  readonly height: number;
  /** The doorway, centred on the front: the door's line is at z = footprint.hd in the frame. */
  readonly door: { readonly width: number };
  /** The flames the pool may sit on; the rest are glows. */
  readonly flames: readonly Flame[];
  /** How it looks with the door shut behind you. */
  readonly atmosphere: Atmosphere;
  /** Where you wake by its fire, if you wake there. */
  readonly respawn?: Spot;
  /** Its ground at (x, z), or null where it's the zone's: the footprint and the steps up to its door. */
  groundAt(x: number, z: number): number | null;
  /** Push a point on the floor plane out of its walls and props. True if it moved. */
  resolve(p: Vector3, radius: number): boolean;
}

/** An interior, built: its plan, the room (hidden until needed) and its door. */
export interface Interior extends InteriorPlan {
  /** Everything it draws: the room and its glows, and the door, which is part of the outside's look too. */
  readonly root: Object3D;
  /** The room: hidden while the door is shut and you're outside. */
  readonly room: Object3D;
  /** Swing the door: 0 shut, 1 open. */
  swing(open: number): void;
  /** Per-frame animation (glows), while the room shows. */
  update(dt: number, camera: Camera): void;
}

/**
 * Where you are with respect to an interior:
 * - _outside_: the door shut, the room hidden, the outdoors' light;
 * - _atDoor_: the door open, the room showing and lit by its flames, still in the outdoors' light;
 * - _inside_: the door shut behind you, the room's light, the outdoors hidden;
 * - _leaving_: walking back to the door from inside: the sun comes back up, and the door opens once it's up.
 */
export type InteriorState = 'outside' | 'atDoor' | 'inside' | 'leaving';

/** Where you stand, in the interior's frame. */
export interface Standing {
  /** Across the front, from the door's middle. */
  readonly x: number;
  /** Front to back: the door's line is at footprint.hd, and less is further in. */
  readonly z: number;
  /** Within the footprint and under the ceiling. */
  readonly within: boolean;
}

/**
 * The Interiors switch for one interior: pure, stepped with where you stand.
 * Doors open when you're within `open` m of them from either side, stay open
 * while you're in the doorway, and shut once you're `shut` m in past them or
 * `open + margin` m off outside. With the door shut behind you, the light
 * swaps over `fadeIn` s. Walking back to within `reopen` m of the door, the
 * sun comes back over `fadeOut` s, and only then does the door open. Arriving
 * inside or outside some other way (waking at the hearth, loading a save, a
 * teleport) swaps at once.
 */
export class InteriorSwitch {
  state: InteriorState = 'outside';
  /** How far the light has gone over to the interior's: 0 the outdoors', 1 the room's. */
  light = 0;
  /** How far the door has swung: 0 shut, 1 open. */
  door = 0;

  /** @param doorLine the door's line, z in the interior's frame (its footprint's half depth) */
  constructor(private readonly doorLine: number) {}

  /** Is the room drawn? From the door as it opens until it's shut again behind you on the way out. */
  get roomShown(): boolean {
    return this.state !== 'outside' || this.door > 0;
  }

  /** Are the room's flames lit by the pool? Whenever the room shows. */
  get flamesLit(): boolean {
    return this.roomShown;
  }

  /** Is the outdoors hidden? Once the door is shut behind you. */
  get outdoorsHidden(): boolean {
    return this.state === 'inside' && this.door === 0;
  }

  /** Are you in it, for the save and whoever asks? Inside, or walking back to its door. */
  get occupied(): boolean {
    return this.state === 'inside' || this.state === 'leaving';
  }

  /** Arrive inside or outside at once, door shut and the light already swapped: waking by the hearth, or loading a save. */
  settle(inside: boolean): void {
    this.state = inside ? 'inside' : 'outside';
    this.light = inside ? 1 : 0;
    this.door = 0;
  }

  update(dt: number, at: Standing): void {
    const { open, margin, shut, reopen, fadeIn, fadeOut, swing } = CONFIG.interiors;
    const fromDoor = Math.hypot(at.x, at.z - this.doorLine);
    const past = this.doorLine - at.z;
    switch (this.state) {
      case 'outside':
        if (fromDoor < open) this.state = 'atDoor';
        else if (at.within) this.settle(true);
        break;
      case 'atDoor':
        if (at.within && past > shut) this.state = 'inside';
        else if (!at.within && fromDoor > open + margin) this.state = 'outside';
        break;
      case 'inside':
      case 'leaving':
        if (!at.within) {
          // Out without walking back through the door's cue: at once.
          if (fromDoor < open) this.state = 'atDoor';
          else this.settle(false);
        } else if (past > shut) this.state = 'inside';
        else if (this.state === 'inside' && fromDoor < reopen) this.state = 'leaving';
        else if (this.state === 'leaving' && this.light === 0) this.state = 'atDoor';
        break;
    }
    // The light swaps only once the door is shut behind you.
    const lit = this.state === 'inside' && this.door === 0;
    this.light = toward(this.light, lit ? 1 : 0, dt / fadeIn, dt / fadeOut);
    this.door = toward(this.door, this.state === 'atDoor' ? 1 : 0, dt / swing, dt / swing);
  }
}

/** `v` moved towards 0 or 1: up by `up`, down by `down`. */
function toward(v: number, target: 0 | 1, up: number, down: number): number {
  return target > v ? Math.min(1, v + up) : target < v ? Math.max(0, v - down) : v;
}
