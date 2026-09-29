import type { Camera, Object3D, Vector3 } from 'three';
import { CONFIG } from '../config';
import type { Seat } from '../enemies/enemy';
import type { Spot } from '../maps/types';
import type { Atmosphere } from './atmosphere';
import type { Flame, Frame } from './interiors';

// The old mine, as the World sees it. It is part of Oakvale, not a zone:
// built with it and hidden but for its adit until you walk in through its
// mouth. In or out goes by the mouth, not by where you stand, since the
// adit's first metres run under ground you can stand on. Past the adit's
// bend the Interiors switch runs as it does at a door: the sun fades, the
// mine's light and fog come up and the outdoors is hidden
// (.scratch/oakvale-starting-zone/spec.md, "The mine").

/** Where the eye stands with respect to the mine's mouth and its adit's bend. */
export interface MineStanding {
  /** How far in past the mouth's line: negative out in front of it. */
  readonly ahead: number;
  /** In the mouth's opening: across it no wider than the adit, and under its roof. */
  readonly inMouth: boolean;
  /** How far on past the adit's bend along the route: negative before it. */
  readonly past: number;
  /** How far from the mouth's middle. */
  readonly fromMouth: number;
}

/** The Warden's hall at the mine's foot, for the Warden (enemies/throne.ts): its throne and its one way in. */
export interface ThronePlan {
  /** Where the Warden sits, slumped on its throne, facing the gate. */
  readonly seat: Seat;
  /** Where it stands up to, before the throne, and walks back to before it sits again. */
  readonly front: Spot;
  /** Is (x, z) in the hall, through its gate? */
  through(x: number, z: number): boolean;
  /** Is (x, z) out through the gate, back in the antechamber? */
  outside(x: number, z: number): boolean;
  /** Hold a body of `radius` at `p` in the hall, short of its gate: the Warden never leaves it. */
  keepIn(p: Vector3, radius: number): void;
}

/** The mine's plan: where it opens, its ground, its route, its flames and its air. No meshes. */
export interface MinePlan {
  readonly id: 'mine';
  /** The mouth: its middle on the floor, facing out along +Z. */
  readonly mouth: Frame;
  /** The flames the pool may sit on; the rest are glows. */
  readonly flames: readonly Flame[];
  /** How it looks past the adit's bend. */
  readonly atmosphere: Atmosphere;
  /** Its route's centre line so far, in world metres: from the mouth through every chamber. */
  readonly route: readonly { readonly x: number; readonly z: number }[];
  /** Its parts along the route, from the adit in: only the one you're in and its neighbours are drawn. */
  readonly parts: readonly string[];
  /** The part holding (x, z), or the nearest. */
  partAt(x: number, z: number): number;
  /** Where the eye at (x, y, z) stands, written into `out`. */
  stand(x: number, y: number, z: number, out: MineStanding): MineStanding;
  /** Is there a clear line from a to b with no rock between? */
  sees(ax: number, az: number, bx: number, bz: number): boolean;
  /**
   * Its floor at (x, z), or null where the mine doesn't reach: out past the
   * mouth, or deep in the rock. Only for whoever came in by the mouth.
   */
  groundAt(x: number, z: number): number | null;
  /** Push a point on the floor plane off its walls and out of its props. True if it moved. */
  resolve(p: Vector3, radius: number): boolean;
  /**
   * Has a flying arrow at `p` struck its floor, its ceiling, the rock round
   * it or a prop? Null out past the mouth, where the mine has no say.
   */
  arrowStops(p: Vector3): boolean | null;
  /** Is this triangle of the hillside dug out for the mine, so the zone leaves it out? */
  cuts(tri: readonly (readonly [number, number, number])[]): boolean;
  /** Its Warden's hall and throne. */
  readonly throne: ThronePlan;
}

/** The mine, built: its plan and its parts' meshes. */
export interface Mine extends MinePlan {
  readonly root: Object3D;
  /**
   * Draw what can be seen: from outside, the adit alone (and nothing while
   * the outdoors is hidden); from inside, the part you're in and its neighbours.
   */
  show(entered: boolean, outdoors: boolean, x: number, z: number): void;
  /** Which parts are drawn. */
  readonly drawn: readonly boolean[];
  /** How many triangles part i draws. */
  triangles(part: number): number;
  /** Per-frame animation (glows). */
  update(dt: number, camera: Camera): void;
}

/**
 * - _outside_: not come in by the mouth; the mine's ground and walls aren't yours;
 * - _adit_: in by the mouth, short of the bend: the mine's ground, the outdoors' light;
 * - _inside_: past the bend: the mine's light, the outdoors hidden;
 * - _leaving_: walking back to the bend from inside: the sun comes back before you can see out.
 */
export type MineState = 'outside' | 'adit' | 'inside' | 'leaving';

/**
 * The Interiors switch for the mine: pure, stepped with where you stand.
 * Walking in through the mouth puts you in the mine, and only walking out
 * through it takes you out. Once `inside` m past the bend the light swaps
 * over `fadeIn` s; walking back to `back` m past it, the sun comes back over
 * `fadeOut` s. Arriving some other way (loading a save, waking) swaps at once.
 */
export class MineSwitch {
  state: MineState = 'outside';
  /** How far the light has gone over to the mine's: 0 the outdoors', 1 the mine's. */
  light = 0;
  /** Last step's `ahead`, to see you cross the mouth's line; null when there's none to go by. */
  private lastAhead: number | null = null;
  /** After `settle`, take the state from where you stand on the next step, with no fade. */
  private snap = false;
  private near = false;

  /** Did you come in by the mouth? Then the mine's ground and walls are yours. */
  get entered(): boolean {
    return this.state !== 'outside';
  }

  /** Are you in it, for the save and whoever asks? Anywhere in from the mouth. */
  get occupied(): boolean {
    return this.entered;
  }

  /** Are its flames lit by the pool? Once you're near the mouth, and all the while you're in. */
  get flamesLit(): boolean {
    return this.entered || this.near;
  }

  /** Is the outdoors hidden? Past the bend. */
  get outdoorsHidden(): boolean {
    return this.state === 'inside';
  }

  /** Arrive in the mine or out of it at once, its light already on or off. */
  settle(inside: boolean): void {
    this.state = inside ? 'inside' : 'outside';
    this.light = inside ? 1 : 0;
    this.snap = inside;
    this.lastAhead = null;
  }

  update(dt: number, at: MineStanding): void {
    const { inside, back, near, fadeIn, fadeOut } = CONFIG.mine;
    if (this.state === 'outside') {
      if (this.lastAhead !== null && this.lastAhead <= 0 && at.ahead > 0 && at.inMouth) this.state = 'adit';
    } else if (at.ahead <= 0) {
      // Out through the mouth (the only way out through the rock).
      this.state = 'outside';
      this.light = 0;
    }
    this.lastAhead = at.ahead;
    this.near = at.fromMouth < near;
    if (this.snap) {
      this.snap = false;
      if (this.entered) {
        this.state = at.past > back ? 'inside' : 'adit';
        this.light = this.state === 'inside' ? 1 : 0;
      }
    }
    switch (this.state) {
      case 'adit':
        if (at.past > inside) this.state = 'inside';
        break;
      case 'inside':
        if (at.past < back) this.state = 'leaving';
        break;
      case 'leaving':
        if (at.past > inside) this.state = 'inside';
        else if (this.light === 0) this.state = 'adit';
        break;
    }
    const lit = this.state === 'inside';
    this.light = lit ? Math.min(1, this.light + dt / fadeIn) : Math.max(0, this.light - dt / fadeOut);
  }
}
