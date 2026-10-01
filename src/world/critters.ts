import { DynamicDrawUsage, Euler, Group, InstancedMesh, type Material, Matrix4, Quaternion, Vector3 } from 'three';
import { CONFIG } from '../config';
import type { CritterPlan } from '../maps/types';
import { type CritterFamily, type CritterFrame, type CritterLook, critterModel } from '../models/critters';
import { sharedModelMaterial } from '../models/materials';
import type { BlobShadows } from './shadows';

// The critters every zone places by data (maps/types.ts `CritterPlan`): hares
// that sit up and bolt, frogs that leap into the water, rats that run along
// a wall and are gone. Each lives round its spot by a small rule of its
// family's and always runs away from you, never towards you. None has a
// skeleton: a critter is drawn whole in one of its look's still frames
// (models/critters.ts), and every critter of one look in one frame is one
// instanced draw. Only those within CONFIG.critters.near of you move or are
// drawn; the rest wait unseen where they were.

/** The floor critters live on: its heights, what's solid, and where the water is. */
export interface CritterGround {
  heightAt(x: number, z: number): number;
  /** Push a point out of walls and props, and back inside where you can walk. True if it moved. */
  resolve(p: Vector3, radius: number): boolean;
  /** The water's surface at (x, z) where it stands over the ground; null (or no answer) where it's dry (Ground.waterAt). */
  waterAt?(x: number, z: number): number | null;
}

/** What a critter is doing. */
export type CritterState =
  /** About its spot: sitting, grazing, sniffing, hopping or shuffling a little way. */
  | 'about'
  /** Sat up, turned to you. */
  | 'watch'
  /** Running from you: a hare's zig-zag bolt, a rat along its wall. */
  | 'flee'
  /** A frog's leap into the water. */
  | 'dive'
  /** Gone into the water or a gap, out of sight, until you've been away a while. */
  | 'gone';

const _p = new Vector3();
const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler(0, 0, 0, 'YXZ');
const _s = new Vector3();

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
/** Its body's half-width, for pushing a landing spot out of what's solid. */
const RADIUS: Record<CritterFamily, number> = { rabbit: 0.15, frog: 0.06, rat: 0.08 };

/**
 * `u` of the way through a hop `height` m high (0 to 1): how high it is over
 * the straight line, its nose's tip (up off the ground, down onto it) and
 * its frame (stretched out in the air, sitting at either end).
 */
export function hopAt(u: number, height: number): { lift: number; pitch: number; frame: CritterFrame } {
  return { lift: 4 * height * u * (1 - u), pitch: (0.5 - u) * 0.6, frame: u > 0.1 && u < 0.9 ? 'leap' : 'sit' };
}

/** A hop in flight: from where, to where, how high and how long. */
interface Hop {
  readonly from: Vector3;
  readonly to: Vector3;
  readonly height: number;
  readonly time: number;
  t: number;
}

/** One critter: where it is, which frame it shows, and its rule. */
export class Critter {
  readonly family: CritterFamily;
  readonly position = new Vector3();
  yaw: number;
  /** Nose up (+) or down, rad: tipping through a hop. */
  pitch = 0;
  frame: CritterFrame = 'sit';
  state: CritterState = 'about';
  /** s in its state. */
  time = 0;
  private hop: Hop | null = null;
  /** s until it next does something about its spot (hop, sit up, graze). */
  private idle = rand(0.5, 3);
  /** Holding a frame about its spot (sitting up, grazing, a frog's throat) for this many s more. */
  private hold = 0;
  private held: CritterFrame = 'sit';
  /** Which way its last zig went, so the next zags. */
  private zig = Math.random() < 0.5 ? 1 : -1;
  /** A rat's run along its wall: +1 the way it faces at rest, -1 back. */
  private along = 1;
  /** s you've been far enough off for it to come back, while it's gone. */
  private awayFor = 0;

  constructor(
    readonly plan: CritterPlan,
    private readonly ground: CritterGround,
  ) {
    this.family = critterModel(plan.look).family;
    this.yaw = plan.yaw;
    this.position.set(plan.x, ground.heightAt(plan.x, plan.z), plan.z);
  }

  get look(): CritterLook {
    return this.plan.look;
  }

  /** In the water or a gap, out of sight. */
  get hidden(): boolean {
    return this.state === 'gone';
  }

  /** How far `you` are from it, on the floor plane. */
  far(you: { x: number; z: number }): number {
    return Math.hypot(you.x - this.position.x, you.z - this.position.z);
  }

  /** One frame of its life with you at `you` (your head or feet: only x and z count). */
  update(dt: number, you: { x: number; z: number }): void {
    this.time += dt;
    const d = this.far(you);
    switch (this.family) {
      case 'rabbit':
        this.rabbit(dt, you, d);
        break;
      case 'frog':
        this.frog(dt, you, d);
        break;
      case 'rat':
        this.rat(dt, you, d);
        break;
    }
  }

  private enter(state: CritterState): void {
    this.state = state;
    this.time = 0;
  }

  // ------------------------------------------------------------ hares and rabbits

  private rabbit(dt: number, you: { x: number; z: number }, d: number): void {
    const R = CONFIG.critters.rabbit;
    if (this.hop) {
      // In the air it carries on; the next hop's chosen as it lands.
      this.flyHop(dt);
      if (this.hop) return;
    }
    if (d < R.flee && this.state !== 'flee') this.enter('flee');
    switch (this.state) {
      case 'flee': {
        if (d > R.safe) {
          this.enter('watch');
          return;
        }
        // Away from you, each hop swinging the other way off straight away: a zig-zag.
        this.zig = -this.zig;
        const away = Math.atan2(this.position.x - you.x, this.position.z - you.z);
        const B = R.bolt;
        this.leapTowards(away + this.zig * rand(0.3, 1) * B.zig, rand(B.near[0], B.near[1]), B.speed, B.height, you);
        return;
      }
      case 'watch': {
        this.frame = 'up';
        this.turnTo(Math.atan2(you.x - this.position.x, you.z - this.position.z), dt, 4);
        // Settles once you've kept your distance a while (or gone).
        if (d > R.notice && this.time > 2) this.enter('about');
        else if (d > R.flee && this.time > 6 && Math.random() < dt * 0.3) this.enter('about');
        return;
      }
      default: {
        if (d < R.notice) {
          this.enter('watch');
          return;
        }
        this.aboutSpot(dt, you, d);
      }
    }
  }

  /** Sitting about its spot: grazes, sits up, and now and then hops a little way, home again if it's strayed. */
  private aboutSpot(dt: number, you: { x: number; z: number }, d: number): void {
    const R = CONFIG.critters.rabbit;
    if (this.hold > 0) {
      this.hold -= dt;
      this.frame = this.held;
      return;
    }
    this.frame = 'sit';
    this.idle -= dt;
    if (this.idle > 0) return;
    this.idle = rand(R.rest[0], R.rest[1]);
    const roll = Math.random();
    if (roll < 0.3) return this.holdFrame('graze', rand(2, 5));
    if (roll < 0.45) return this.holdFrame('up', rand(1, 2.2));
    // A hop about: home if it has strayed past its patch, else anywhere in it but towards you.
    const home = Math.hypot(this.plan.x - this.position.x, this.plan.z - this.position.z);
    const homeward = Math.atan2(this.plan.x - this.position.x, this.plan.z - this.position.z);
    const way = home > R.wander ? homeward + rand(-0.5, 0.5) : rand(-Math.PI, Math.PI);
    const H = R.hop;
    this.leapTowards(way, rand(H.near[0], H.near[1]), H.speed, H.height, d < R.notice * 2 ? you : null);
  }

  private holdFrame(frame: CritterFrame, seconds: number): void {
    this.held = frame;
    this.hold = seconds;
    this.frame = frame;
  }

  /**
   * Hop `length` m towards `way` (a yaw), turning to it, at `speed` m/s and
   * `height` m high. Round what's solid and never into water; and with `you`
   * given, never landing nearer you than it stands. If nowhere near that way
   * will do, it stays put.
   */
  private leapTowards(way: number, length: number, speed: number, height: number, you: { x: number; z: number } | null): void {
    const from = this.position;
    const before = you ? Math.hypot(you.x - from.x, you.z - from.z) : 0;
    for (const turn of [0, 0.5, -0.5, 1, -1, 1.6, -1.6]) {
      const a = way + turn;
      _p.set(from.x + Math.sin(a) * length, 0, from.z + Math.cos(a) * length);
      this.ground.resolve(_p, RADIUS[this.family]);
      if (Math.hypot(_p.x - from.x, _p.z - from.z) < length * 0.5) continue; // blocked: a wall, a trunk
      if (this.wet(_p.x, _p.z)) continue;
      if (you && Math.hypot(you.x - _p.x, you.z - _p.z) < before) continue;
      _p.y = this.ground.heightAt(_p.x, _p.z);
      this.yaw = Math.atan2(_p.x - from.x, _p.z - from.z);
      const run = Math.hypot(_p.x - from.x, _p.z - from.z);
      this.hop = { from: from.clone(), to: _p.clone(), height, time: Math.max(0.16, run / speed), t: 0 };
      this.frame = 'leap';
      return;
    }
  }

  /** On through the hop in flight: up and over in an arc, nose up off the ground and down onto it. */
  private flyHop(dt: number): void {
    const h = this.hop!;
    h.t = Math.min(h.time, h.t + dt);
    const u = h.t / h.time;
    this.position.lerpVectors(h.from, h.to, u);
    const at = hopAt(u, h.height);
    this.position.y += at.lift;
    this.pitch = at.pitch;
    this.frame = at.frame;
    if (u >= 1) {
      this.hop = null;
      this.pitch = 0;
      this.frame = 'sit';
    }
  }

  /** Is there water over the ground at (x, z)? */
  private wet(x: number, z: number): boolean {
    const w = this.ground.waterAt?.(x, z) ?? null;
    return w !== null && w > this.ground.heightAt(x, z) + 0.02;
  }

  private turnTo(yaw: number, dt: number, rate: number): void {
    const delta = Math.atan2(Math.sin(yaw - this.yaw), Math.cos(yaw - this.yaw));
    this.yaw += Math.max(-rate * dt, Math.min(rate * dt, delta));
  }

  // ------------------------------------------------------------ frogs

  private frog(dt: number, you: { x: number; z: number }, d: number): void {
    const F = CONFIG.critters.frog;
    switch (this.state) {
      case 'dive': {
        if (this.hop) this.flyHop(dt);
        if (!this.hop) {
          // Landed on dry ground (you came at it from the water): it sits there, out of your way.
          if (!this.wet(this.position.x, this.position.z)) return this.enter('about');
          // Down through the surface, then gone.
          this.frame = 'leap';
          this.position.y -= dt * 0.4;
          if (this.time > F.time + 0.25) this.enter('gone');
        }
        return;
      }
      case 'gone':
        return this.comeBack(dt, d, F.away, F.after);
      default: {
        if (d < F.flee) {
          // Off its stone the way it faces, into the water; swung aside, or back onto the bank, if that's towards you.
          const a = this.diveWay(you, d, F.leap);
          this.yaw = a;
          _p.set(this.position.x + Math.sin(a) * F.leap, 0, this.position.z + Math.cos(a) * F.leap);
          _p.y = Math.max(this.ground.waterAt?.(_p.x, _p.z) ?? -Infinity, this.ground.heightAt(_p.x, _p.z));
          this.hop = { from: this.position.clone(), to: _p.clone(), height: F.height, time: F.time, t: 0 };
          this.enter('dive');
          return;
        }
        // Off its stone (it fled onto the bank): back on it once you've been away a while.
        if (this.position.x !== this.plan.x || this.position.z !== this.plan.z) this.comeBack(dt, d, F.away, F.after);
        // Sitting still, its throat puffing now and then.
        this.idle -= dt;
        if (this.idle <= 0) this.idle = rand(2, 6);
        this.frame = this.idle < 0.5 ? 'puff' : 'sit';
      }
    }
  }

  /**
   * Which way a frog leaps: the way it faces, or swung up to about 60° either
   * side, the first that lands in water no nearer you than it sits (`d`).
   * With none (you're in the water before it), back onto the bank, the way
   * that lands farthest from you.
   */
  private diveWay(you: { x: number; z: number }, d: number, leap: number): number {
    let best = this.plan.yaw;
    let bestFar = -Infinity;
    for (const turn of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3, Math.PI]) {
      const a = this.plan.yaw + turn;
      const x = this.position.x + Math.sin(a) * leap;
      const z = this.position.z + Math.cos(a) * leap;
      const far = Math.hypot(you.x - x, you.z - z);
      const wet = this.ground.waterAt ? this.wet(x, z) : true;
      if (wet && far >= d && Math.abs(turn) <= 1) return a;
      if (far > bestFar) [best, bestFar] = [a, far];
    }
    return best;
  }

  /** Gone: back where it was once you've been at least `away` m off for `after` s. */
  private comeBack(dt: number, d: number, away: number, after: number): void {
    this.awayFor = d > away ? this.awayFor + dt : 0;
    if (this.awayFor < after) return;
    this.awayFor = 0;
    this.position.set(this.plan.x, this.ground.heightAt(this.plan.x, this.plan.z), this.plan.z);
    this.yaw = this.plan.yaw;
    this.pitch = 0;
    this.frame = 'sit';
    this.hop = null;
    this.enter('about');
  }

  // ------------------------------------------------------------ rats

  private rat(dt: number, you: { x: number; z: number }, d: number): void {
    const R = CONFIG.critters.rat;
    switch (this.state) {
      case 'gone':
        return this.comeBack(dt, d, R.away, R.after);
      case 'flee': {
        // Along its wall at a scurry, the two halves of the gallop in turn, until it's gone into a gap.
        this.scurry(dt, R.speed);
        if (this.time * R.speed >= R.run) this.enter('gone');
        return;
      }
      default: {
        if (d < R.flee) {
          // Along its wall whichever way takes it farther from you.
          const fx = Math.sin(this.plan.yaw);
          const fz = Math.cos(this.plan.yaw);
          this.along = (this.position.x - you.x) * fx + (this.position.z - you.z) * fz >= 0 ? 1 : -1;
          this.yaw = this.plan.yaw + (this.along > 0 ? 0 : Math.PI);
          this.enter('flee');
          return;
        }
        // About its spot: sits, rears to sniff, and shuffles a little way along its wall and back.
        if (this.hold > 0) {
          this.hold -= dt;
          if (this.held === 'run') {
            this.scurry(dt, R.speed * 0.4);
            // Never past its patch of wall.
            const off = (this.position.x - this.plan.x) * Math.sin(this.plan.yaw) + (this.position.z - this.plan.z) * Math.cos(this.plan.yaw);
            if (Math.abs(off) > R.shuffle) this.hold = 0;
          } else this.frame = this.held;
          return;
        }
        this.frame = 'sit';
        this.idle -= dt;
        if (this.idle > 0) return;
        this.idle = rand(1, 4);
        if (Math.random() < 0.4) return this.holdFrame('up', rand(0.8, 2));
        // A shuffle: back towards its spot if it's off it, else either way.
        const off = (this.position.x - this.plan.x) * Math.sin(this.plan.yaw) + (this.position.z - this.plan.z) * Math.cos(this.plan.yaw);
        this.along = Math.abs(off) > 0.1 ? -Math.sign(off) : Math.random() < 0.5 ? 1 : -1;
        this.yaw = this.plan.yaw + (this.along > 0 ? 0 : Math.PI);
        this.held = 'run';
        this.hold = rand(0.2, 0.5);
      }
    }
  }

  /** Along its wall at `speed` m/s, galloping. */
  private scurry(dt: number, speed: number): void {
    this.position.x += Math.sin(this.yaw) * speed * dt;
    this.position.z += Math.cos(this.yaw) * speed * dt;
    this.position.y = this.ground.heightAt(this.position.x, this.position.z);
    this.frame = Math.floor(this.time * speed * 9) % 2 ? 'gather' : 'run';
  }
}

/** Every critter of the loaded zones, and the instanced meshes that draw them. */
export class Critters {
  readonly root = new Group();
  private readonly all: Critter[] = [];
  /** One mesh per look and frame, made as a look's first critter is added. */
  private readonly meshes = new Map<string, InstancedMesh>();
  /** The critters drawn this frame, nearest first (kept to spare the garbage collector). */
  private readonly near: Critter[] = [];

  constructor(
    private readonly ground: CritterGround,
    /** Their blobs on the ground, if they're to have any (not in tests). */
    private readonly shadows: BlobShadows | null = null,
    private readonly material: Material = sharedModelMaterial(),
  ) {
    this.root.name = 'critters';
    if (shadows) this.root.add(shadows.mesh);
  }

  /** Take in a zone's critters (as it's loaded). */
  add(plans: readonly CritterPlan[]): void {
    for (const plan of plans) {
      this.all.push(new Critter(plan, this.ground));
      const model = critterModel(plan.look);
      for (const [frame, geometry] of Object.entries(model.frames)) {
        const key = `${plan.look}:${frame}`;
        if (this.meshes.has(key)) continue;
        const mesh = new InstancedMesh(geometry, this.material, CONFIG.critters.most);
        mesh.name = `critters-${key}`;
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        // They move every frame and stand all over: one sphere round them all would be no tighter.
        mesh.frustumCulled = false;
        mesh.count = 0;
        this.meshes.set(key, mesh);
        this.root.add(mesh);
      }
    }
  }

  /** Every critter placed, in the order they were added. */
  get placed(): readonly Critter[] {
    return this.all;
  }

  /** Those drawn last frame, nearest first. */
  get shown(): readonly Critter[] {
    return this.near;
  }

  /** How many instanced draws and triangles they took last frame. */
  get cost(): { draws: number; triangles: number } {
    let draws = 0;
    let triangles = 0;
    for (const mesh of this.meshes.values()) {
      if (mesh.count === 0) continue;
      draws++;
      triangles += (mesh.geometry.getAttribute('position').count / 3) * mesh.count;
    }
    return { draws, triangles };
  }

  /** One frame with you at `you` (your head: only x and z count): those within `near` m live and are drawn. */
  update(dt: number, you: Vector3, near: number = CONFIG.critters.near): void {
    const shown = this.near;
    shown.length = 0;
    for (const c of this.all) {
      if (c.far(you) > near) continue;
      c.update(dt, you);
      if (!c.hidden) shown.push(c);
    }
    shown.sort((a, b) => a.far(you) - b.far(you));
    for (const mesh of this.meshes.values()) mesh.count = 0;
    this.shadows?.begin();
    // The nearest few only: the rest live on, undrawn.
    if (shown.length > CONFIG.critters.most) shown.length = CONFIG.critters.most;
    for (const c of shown) {
      const mesh = this.meshes.get(`${c.look}:${c.frame}`);
      if (!mesh) continue;
      _q.setFromEuler(_e.set(-c.pitch, c.yaw, 0));
      _m.compose(c.position, _q, _s.set(1, 1, 1));
      mesh.setMatrixAt(mesh.count++, _m);
      if (this.shadows) {
        const lift = c.position.y - this.ground.heightAt(c.position.x, c.position.z);
        const r = critterModel(c.look).length * 0.45 * Math.max(0.4, 1 - lift * 2);
        this.shadows.add(c.position.x, c.position.y - lift, c.position.z, r);
      }
    }
    this.shadows?.end();
    for (const mesh of this.meshes.values()) mesh.instanceMatrix.needsUpdate = true;
  }
}
