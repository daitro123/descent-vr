import { B, BIRD_LOOKS, type BirdLookId } from '../models/bird';
import { type BirdPose, newPose, type Placing } from './flock';
import {
  type Carriage,
  calling,
  carriageOf,
  crouching,
  dabbling,
  flying,
  hissing,
  hopping,
  hovering,
  peck,
  plant,
  preening,
  squabbling,
  standing,
  striking,
  swimDepth,
  swimming,
  walking,
} from './poses';

// One bird: where it is and how it gets about (standing, walking, swimming,
// flying, landing), and the pose that goes with it. Its flock's brain
// (ways.ts) decides where it goes and what it does when it gets there; this
// moves it there and poses it, and knows nothing of the player or the zone
// but the floor's height under it.

const TAU = Math.PI * 2;
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** Turn `from` toward `to` by at most `step` radians, the short way round. */
export function turnToward(from: number, to: number, step: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return from + Math.max(-step, Math.min(step, d));
}

/** What a bird does where it is, on its feet or the water: each a few seconds' clip. */
export type Act = 'idle' | 'look' | 'peck' | 'preen' | 'call' | 'hop' | 'strike' | 'hiss' | 'dabble' | 'squabble' | 'crouch' | 'alert';

/** How a bird is getting about. */
export type Doing = 'stand' | 'walk' | 'swim' | 'fly' | 'land' | 'hidden';

/** How much of a wading bird's legs the water can come up to, at most: deeper, it's standing on the mud as far as that and the water hides the rest. */
export const WADE = 0.7;

/** How the bird stands where it stands: on the ground (or a perch), or in the shallows up to its legs. */
export type Footing = 'ground' | 'water';

/** The floor under a bird: the ground's height, and the water's (NaN where it's dry). */
export interface Floor {
  heightAt(x: number, z: number): number;
  waterAt(x: number, z: number): number;
}

/** How fast a family gets about: walking, swimming, flying, and how hard it turns (rad/s). */
interface Paces {
  readonly walk: number;
  readonly run: number;
  readonly swim: number;
  readonly fly: number;
  readonly turn: number;
  /** Flying, its wings beat in bursts this long out of every `glides` seconds (1: always beating). */
  readonly beats: number;
  /** How hard it climbs taking off (m/s up) and how fast it runs off the ground's edge. */
  readonly climb: number;
}

const PACES: Record<string, Paces> = {
  crow: { walk: 0.45, run: 1.2, swim: 0, fly: 7, turn: 5, beats: 0.75, climb: 2.8 },
  pigeon: { walk: 0.4, run: 1, swim: 0, fly: 8, turn: 6, beats: 0.85, climb: 3.2 },
  gull: { walk: 0.45, run: 1.2, swim: 0.3, fly: 7, turn: 3.5, beats: 0.35, climb: 2.4 },
  hen: { walk: 0.3, run: 1.7, swim: 0, fly: 6, turn: 5, beats: 1, climb: 1.4 },
  grouse: { walk: 0.3, run: 1.4, swim: 0, fly: 11, turn: 3, beats: 0.45, climb: 3 },
  duck: { walk: 0.3, run: 1, swim: 0.28, fly: 9, turn: 3, beats: 1, climb: 2.2 },
  swan: { walk: 0.25, run: 0.8, swim: 0.22, fly: 8, turn: 1.4, beats: 1, climb: 1.2 },
  goose: { walk: 0.3, run: 0.9, swim: 0.25, fly: 8, turn: 2.5, beats: 1, climb: 1.6 },
  heron: { walk: 0.25, run: 0.6, swim: 0, fly: 5, turn: 1.8, beats: 1, climb: 1.4 },
};

function pacesOf(look: BirdLookId): Paces {
  if (look in PACES) return PACES[look];
  const family = BIRD_LOOKS[look].family;
  if (family === 'duck' && look.startsWith('mallard')) return PACES.duck;
  return PACES[family];
}

/** An approach to a landing: a curve from where the bird was to where it'll stand. */
interface Approach {
  readonly from: readonly [number, number, number];
  readonly v0: readonly [number, number, number];
  readonly to: readonly [number, number, number];
  readonly v1: readonly [number, number, number];
  readonly time: number;
  t: number;
  /** What it lands on: its feet on the ground (or a perch), the shallows, or swimming. */
  readonly on: Footing | 'swim';
  /** Which way it faces once down. */
  readonly yaw: number;
}

/** Where a bird's flight is taking it: a point to pass, or a circle to go round. */
export type Heading =
  | { readonly kind: 'point'; x: number; y: number; z: number }
  | { readonly kind: 'circle'; x: number; y: number; z: number; r: number; dir: 1 | -1 };

export class Bird {
  readonly look: BirdLookId;
  readonly c: Carriage;
  readonly paces: Paces;
  /** Its size, as a share of its look's. */
  readonly size: number;
  /** How tall its legs stand it, at its size. */
  readonly leg: number;
  /** How deep its hip sits swimming. */
  readonly sink: number;
  readonly at: Placing = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
  readonly pose: BirdPose = newPose();
  doing: Doing = 'stand';
  footing: Footing = 'ground';
  /** A perch's top it stands on, if it isn't the ground (NaN: the ground). */
  perch = NaN;
  /** Its act where it is, how far through it (s) and how long it lasts. */
  act: Act = 'idle';
  actT = 0;
  actFor = 1;
  /** Where its head's turned (rad, its left), and to where it's turning it. */
  head = 0;
  headTo = 0;
  /** Standing or swimming still, which way it's turning to face (NaN: as it is). */
  face = NaN;
  /** Walking or swimming: where to, and how fast. */
  tx = 0;
  tz = 0;
  pace = 0;
  /** Walk cycle and wingbeat phases. */
  private step = 0;
  private beat = 0;
  /** Flying: its velocity, and how hard its wings are working (0 gliding, 1 beating). */
  readonly v = [0, 0, 0];
  power = 1;
  /** s since it took off, and of the current burst of beats or glide. */
  aloft = 0;
  private burst = 0;
  heading: Heading | null = null;
  /** The cruising speed of this flight (it can be pushed: a grouse bursting away). */
  cruise: number;
  private approach: Approach | null = null;
  /** Running (a hen scattering) rather than walking. */
  running = false;
  private readonly random: () => number;

  constructor(look: BirdLookId, size: number, seed: number) {
    this.look = look;
    this.c = carriageOf(look);
    this.paces = pacesOf(look);
    this.size = size;
    this.leg = BIRD_LOOKS[look].body.leg * size;
    this.sink = swimDepth(look) * size;
    this.cruise = this.paces.fly;
    let s = seed | 0;
    this.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** A number from 0 to 1, the same each run for the same bird. */
  rand(): number {
    return this.random();
  }

  /** Is it on the wing (flying or coming in to land)? */
  get flying(): boolean {
    return this.doing === 'fly' || this.doing === 'land';
  }

  // ------------------------------------------------------------ putting it somewhere

  /** Standing at (x, z) on `floor` (or a perch at `perch`), facing `yaw`. */
  standAt(x: number, z: number, yaw: number, floor: Floor, perch = NaN, footing: Footing = 'ground'): void {
    this.doing = 'stand';
    this.footing = footing;
    this.perch = perch;
    this.at.x = x;
    this.at.z = z;
    this.at.yaw = yaw;
    this.at.pitch = this.at.roll = 0;
    this.at.y = this.floorAt(floor) + this.leg;
    this.tx = x;
    this.tz = z;
    this.face = NaN;
    this.setAct('idle', 0.5 + this.rand());
  }

  /** Swimming at (x, z) on the water at `water`, facing `yaw`. */
  swimAt(x: number, z: number, yaw: number, water: number): void {
    this.doing = 'swim';
    this.perch = NaN;
    this.at.x = x;
    this.at.z = z;
    this.at.yaw = yaw;
    this.at.pitch = this.at.roll = 0;
    this.at.y = water - this.sink;
    this.tx = x;
    this.tz = z;
    this.face = NaN;
    this.setAct('idle', 1 + this.rand());
  }

  /** On the wing at (x, y, z), flying `yaw`-ward at its cruise toward `heading`: a gull already circling as you come. */
  flyAt(x: number, y: number, z: number, yaw: number, heading: Heading): void {
    Object.assign(this.at, { x, y, z, yaw, pitch: 0, roll: 0 });
    this.v[0] = Math.sin(yaw) * this.paces.fly;
    this.v[1] = 0;
    this.v[2] = Math.cos(yaw) * this.paces.fly;
    this.doing = 'fly';
    this.perch = NaN;
    this.heading = heading;
    this.cruise = this.paces.fly;
    this.aloft = 10;
    this.burst = this.rand() * 2.4;
    this.power = 0;
    this.approach = null;
  }

  /** Out of sight where it is (down in cover). */
  hideAt(x: number, z: number, floor: Floor): void {
    this.standAt(x, z, this.rand() * TAU, floor);
    this.doing = 'hidden';
  }

  setAct(act: Act, time: number): void {
    this.act = act;
    this.actT = 0;
    this.actFor = time;
  }

  /** Walk (or run, or paddle) to (x, z). */
  goTo(x: number, z: number, run = false): void {
    this.tx = x;
    this.tz = z;
    this.running = run;
    this.face = NaN;
    if (this.doing === 'stand') this.doing = 'walk';
    this.setAct('idle', 0);
  }

  /** How far it has yet to walk or swim. */
  get left(): number {
    return Math.hypot(this.tx - this.at.x, this.tz - this.at.z);
  }

  /**
   * Up off its feet (or the water) and away along (dx, dz), climbing hard,
   * then on toward `heading`.
   */
  takeOff(dx: number, dz: number, heading: Heading, cruise = this.paces.fly): void {
    const d = Math.hypot(dx, dz) || 1;
    const out = this.doing === 'swim' ? 2.2 : 1.2;
    this.v[0] = (dx / d) * out;
    this.v[2] = (dz / d) * out;
    this.v[1] = this.paces.climb;
    this.at.yaw = Math.atan2(dx, dz);
    this.doing = 'fly';
    this.perch = NaN;
    this.heading = heading;
    this.cruise = cruise;
    this.aloft = 0;
    this.burst = 0;
    this.power = 1;
    this.approach = null;
  }

  /** On the wing, change where it's heading. */
  headFor(heading: Heading, cruise = this.cruise): void {
    this.heading = heading;
    this.cruise = cruise;
    if (this.doing === 'land') this.doing = 'fly';
    this.approach = null;
  }

  /**
   * Come in and land at (x, y, z): its feet on the ground or a perch there
   * (`y` the floor's height), in the shallows, or swimming (`y` the water's
   * face), facing `yaw` once down.
   */
  landAt(x: number, y: number, z: number, yaw: number, on: Footing | 'swim', perch = NaN): void {
    const [vx, vy, vz] = this.v;
    const hip = on === 'swim' ? y - this.sink : y + this.leg;
    const from = [this.at.x, this.at.y, this.at.z] as const;
    const dist = Math.hypot(x - from[0], hip - from[1], z - from[2]);
    const speed = Math.max(2, Math.hypot(vx, vy, vz));
    const time = Math.max(1.1, (dist / speed) * 1.6);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    this.approach = {
      from,
      v0: [vx * time, vy * time, vz * time],
      to: [x, hip, z],
      // Coming in slow and level, the last of it a gentle drop.
      v1: [fx * 0.6 * time * 0.3, -0.5 * time * 0.3, fz * 0.6 * time * 0.3],
      time,
      t: 0,
      on,
      yaw,
    };
    this.perch = perch;
    this.doing = 'land';
  }

  // ------------------------------------------------------------ each frame

  /** One frame: get about as it's doing, and pose for it. */
  update(dt: number, floor: Floor): void {
    switch (this.doing) {
      case 'stand':
      case 'walk':
        this.onFoot(dt, floor);
        break;
      case 'swim':
        this.onWater(dt, floor);
        break;
      case 'fly':
        this.onWing(dt);
        break;
      case 'land':
        this.landing(dt, floor);
        break;
      case 'hidden':
        break;
    }
  }

  /** The floor where it stands: a perch's top, the ground, or the bed under the shallows. */
  private floorAt(floor: Floor): number {
    if (!Number.isNaN(this.perch)) return this.perch;
    const ground = floor.heightAt(this.at.x, this.at.z);
    if (this.footing === 'ground') return ground;
    // Wading, it stands on the bed, but never deeper than most of its legs.
    const water = floor.waterAt(this.at.x, this.at.z);
    return Number.isNaN(water) ? ground : Math.max(ground, water - this.leg * WADE);
  }

  private onFoot(dt: number, floor: Floor): void {
    const { at, pose, c } = this;
    let moving = false;
    if (this.doing === 'walk') {
      const dx = this.tx - at.x;
      const dz = this.tz - at.z;
      const d = Math.hypot(dx, dz);
      const speed = (this.running ? this.paces.run : this.paces.walk) * this.size ** 0.5;
      if (d < 0.05) {
        this.doing = 'stand';
        this.running = false;
      } else {
        at.yaw = turnToward(at.yaw, Math.atan2(dx, dz), this.paces.turn * dt * (this.running ? 2 : 1));
        // Walk on only once it's (nearly) facing the way.
        const facing = Math.cos(Math.atan2(dx, dz) - at.yaw);
        const go = Math.min(d, speed * dt * clamp01(facing * 2));
        at.x += Math.sin(at.yaw) * go;
        at.z += Math.cos(at.yaw) * go;
        this.step += (go / Math.max(0.02, this.leg * 0.9)) * 1.6;
        moving = go > 0;
      }
    }
    if (!moving && !Number.isNaN(this.face)) at.yaw = turnToward(at.yaw, this.face, this.paces.turn * 0.7 * dt);
    at.y = this.floorAt(floor) + this.leg;
    at.pitch = at.roll = 0;
    standing(pose, c);
    if (moving) {
      walking(pose, this.step, this.running ? 0.75 : 0.45, this.look === 'pigeon' ? 0.3 : 0.12);
      if (this.running) {
        // Wings half out, flapping as it runs.
        const s = Math.sin(this.step * 2);
        pose[B.wingL * 3] *= 0.4;
        pose[B.wingR * 3] *= 0.4;
        pose[B.wingL * 3 + 2] = 0.3 + 0.35 * s;
        pose[B.wingR * 3 + 2] = -(0.3 + 0.35 * s);
        pose[0] += 0.25;
        plant(pose, 0.75 * Math.sin(this.step));
      }
    } else this.doAct(dt);
    this.turnHead(dt);
  }

  private onWater(dt: number, floor: Floor): void {
    const { at, pose, c } = this;
    const dx = this.tx - at.x;
    const dz = this.tz - at.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.05) {
      at.yaw = turnToward(at.yaw, Math.atan2(dx, dz), this.paces.turn * 0.6 * dt);
      const facing = Math.cos(Math.atan2(dx, dz) - at.yaw);
      const go = Math.min(d, this.paces.swim * (this.running ? 2.5 : 1) * dt * clamp01(0.3 + facing));
      at.x += Math.sin(at.yaw) * go;
      at.z += Math.cos(at.yaw) * go;
    } else {
      this.running = false;
      if (!Number.isNaN(this.face)) at.yaw = turnToward(at.yaw, this.face, this.paces.turn * 0.4 * dt);
    }
    this.step += dt;
    const water = floor.waterAt(at.x, at.z);
    at.y = (Number.isNaN(water) ? at.y + this.sink : water) - this.sink + 0.006 * Math.sin(this.step * 2.1);
    at.pitch = 0;
    at.roll = 0.03 * Math.sin(this.step * 1.3);
    swimming(pose, c);
    this.doAct(dt);
    this.turnHead(dt);
  }

  /** Its act where it stands (or swims): looking about, pecking, preening... */
  private doAct(dt: number): void {
    const { pose, c } = this;
    this.actT += dt;
    const t = this.actT;
    const u = clamp01(t / this.actFor);
    const ease = smooth(clamp01(t / 0.3)) * smooth(clamp01((this.actFor - t) / 0.3));
    switch (this.act) {
      case 'peck': {
        // Pecks every 0.4 s or so, quick down and up.
        const k = (t * 2.6) % 1;
        peck(pose, c, ease * (0.55 + 0.45 * Math.max(0, Math.sin(k * Math.PI))));
        plant(pose);
        break;
      }
      case 'preen':
        preening(pose, ease, this.actFor > 2.5 ? -1 : 1);
        if (this.doing !== 'swim') plant(pose);
        break;
      case 'call':
        calling(pose, ease * Math.max(0, Math.sin(u * Math.PI * 2)));
        plant(pose);
        break;
      case 'hop': {
        const h = Math.sin(u * Math.PI);
        hopping(pose, h);
        this.at.y += h * this.leg * 0.9;
        break;
      }
      case 'strike': {
        const lean = smooth(clamp01(u / 0.6)) * (1 - smooth(clamp01((u - 0.75) / 0.25)));
        const hit = u > 0.6 && u < 0.78 ? Math.sin(((u - 0.6) / 0.18) * Math.PI) : 0;
        striking(pose, 0.22 * lean + 0.78 * hit);
        plant(pose);
        break;
      }
      case 'hiss':
        hissing(pose, ease);
        plant(pose);
        break;
      case 'dabble':
        dabbling(pose, ease);
        break;
      case 'squabble':
        squabbling(pose, ease, Math.sin(t * 18));
        plant(pose);
        break;
      case 'crouch':
        crouching(pose, this.leg, smooth(clamp01(t / 0.5)));
        break;
      case 'alert':
        // Neck up and still: watching you.
        pose[B.neck * 3] -= 0.25 * ease;
        pose[B.head * 3] -= 0.1 * ease;
        break;
      case 'look':
      case 'idle':
        break;
    }
  }

  private turnHead(dt: number): void {
    this.head += (this.headTo - this.head) * Math.min(1, dt * 6);
    this.pose[B.head * 3 + 1] += this.head;
  }

  private onWing(dt: number): void {
    const { at, v, pose, c } = this;
    this.aloft += dt;
    const h = this.heading;
    // Where it wants to be going: at the point, or round the circle a little ahead of where it is.
    let tx = at.x;
    let ty = at.y;
    let tz = at.z;
    if (h?.kind === 'point') {
      tx = h.x;
      ty = h.y;
      tz = h.z;
    } else if (h?.kind === 'circle') {
      const a = Math.atan2(at.x - h.x, at.z - h.z) + (h.dir * this.cruise * 0.6) / Math.max(4, h.r);
      tx = h.x + Math.sin(a) * h.r;
      tz = h.z + Math.cos(a) * h.r;
      ty = h.y;
    }
    const dx = tx - at.x;
    const dy = ty - at.y;
    const dz = tz - at.z;
    const d = Math.hypot(dx, dz) || 1;
    // Taking off, it climbs hard at first, then levels out toward where it's going.
    const early = clamp01(1 - this.aloft / 0.9);
    const speed = this.cruise * (0.45 + 0.55 * (1 - early));
    const want = [(dx / d) * speed, Math.max(-2.5, Math.min(2.5, dy * 1.2)) * (1 - early) + this.paces.climb * early, (dz / d) * speed];
    const k = Math.min(1, dt * 1.6);
    for (let i = 0; i < 3; i++) v[i] += (want[i] - v[i]) * k;
    at.x += v[0] * dt;
    at.y += v[1] * dt;
    at.z += v[2] * dt;
    const yaw = Math.atan2(v[0], v[2]);
    const before = at.yaw;
    at.yaw = turnToward(at.yaw, yaw, this.paces.turn * dt);
    const turning = (at.yaw - before) / Math.max(dt, 1e-4);
    at.roll += (-0.18 * turning - at.roll) * Math.min(1, dt * 3);
    const flat = Math.hypot(v[0], v[2]);
    at.pitch += (-Math.atan2(v[1], Math.max(1, flat)) * 0.6 - at.pitch) * Math.min(1, dt * 4);
    // Beating while it climbs, takes off or hasn't the speed; else in bursts and glides, its family's way.
    this.burst += dt;
    const cycle = 2.4;
    const beating = early > 0 || v[1] > 0.6 || flat < this.cruise * 0.6 || (this.burst % cycle) / cycle < this.paces.beats;
    this.power += ((beating ? 1 : 0) - this.power) * Math.min(1, dt * 4);
    this.beat += dt * this.c.beat * TAU * (0.6 + 0.4 * this.power);
    if (early > 0.5) hovering(pose, c, this.beat);
    else flying(pose, c, this.beat, this.power);
    this.head = this.headTo = 0;
  }

  private landing(dt: number, floor: Floor): void {
    const a = this.approach!;
    const { at, pose, c, v } = this;
    a.t = Math.min(a.time, a.t + dt);
    const u = a.t / a.time;
    // A Hermite curve from where it was (its speed then) to where it'll stand (slow, level).
    const u2 = u * u;
    const u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;
    const px = at.x;
    const py = at.y;
    const pz = at.z;
    at.x = h00 * a.from[0] + h10 * a.v0[0] + h01 * a.to[0] + h11 * a.v1[0];
    at.y = h00 * a.from[1] + h10 * a.v0[1] + h01 * a.to[1] + h11 * a.v1[1];
    at.z = h00 * a.from[2] + h10 * a.v0[2] + h01 * a.to[2] + h11 * a.v1[2];
    v[0] = (at.x - px) / Math.max(dt, 1e-4);
    v[1] = (at.y - py) / Math.max(dt, 1e-4);
    v[2] = (at.z - pz) / Math.max(dt, 1e-4);
    const flat = Math.hypot(v[0], v[2]);
    if (flat > 0.3) at.yaw = turnToward(at.yaw, Math.atan2(v[0], v[2]), this.paces.turn * dt);
    at.roll *= 1 - Math.min(1, dt * 3);
    at.pitch += (-0.35 * u - at.pitch) * Math.min(1, dt * 4);
    this.beat += dt * this.c.beat * TAU * (u > 0.55 ? 1.2 : 0.6);
    if (u > 0.55) hovering(pose, c, this.beat);
    else flying(pose, c, this.beat, 0.3);
    if (u >= 1) {
      const [x, y, z] = a.to;
      this.approach = null;
      if (a.on === 'swim') this.swimAt(x, z, a.yaw, y + this.sink);
      else this.standAt(x, z, a.yaw, floor, this.perch, a.on);
      this.v[0] = this.v[1] = this.v[2] = 0;
    }
  }
}
