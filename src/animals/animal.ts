import { Group, Vector3 } from 'three';
import { CONFIG } from '../config';
import { ANIMALS, type AnimalId, type Species } from '../models/animals';
import { QUAD_BONES, type QuadPose, type QuadRig } from '../models/quadruped';
import { blendPoses } from '../models/rig';
import type { Ground } from '../world/ground';
import { type AnimalMoves, addInto, alive, gait, gaitBob, type MutablePose, movesOf, strideRate } from './poses';

// One animal in the world (animals/herds.ts places them): its body on the
// four-legged skeleton, standing on the ground and pitched to its slope, and
// what it's doing, carried out: a stance it eases into (standing, grazing,
// looking up, lying, resting a leg), a walk or a run to somewhere, its head
// turned to something. What it decides to do is its mind's (herds.ts).

/** What an animal does in place. */
export type Stance = 'stand' | 'graze' | 'alert' | 'lie' | 'rest';

/** How fast it goes somewhere: a walk (a dog's is a trot), or a run. */
export type Pace = 'walk' | 'run';

const _v = new Vector3();
/** How far it turns its head to look at something, either way, the neck and head sharing it. */
const MAX_LOOK = 1.1;
/** s a stamp takes: the near fore up, held, and down. */
const STAMP = 1.2;

/** Somewhere in the world nothing walks through, `r` m round (World.addBody). */
export interface Solid {
  x: number;
  z: number;
  r: number;
}

export class Animal {
  readonly root = new Group();
  /** Its feet: under the middle of its back, on the ground. */
  readonly position: Vector3;
  readonly species: Species;
  readonly moves: AnimalMoves;
  /** What it does in place; while it's going somewhere, it walks or runs instead. */
  stance: Stance = 'stand';
  /** Something it turns its head to (you), or null. */
  lookAt: Vector3 | null = null;
  /** Which way it faces: its front faces (sin yaw, cos yaw). */
  yaw: number;
  /** A yaw to turn to on the spot while it stands, or null. */
  private turnTo: number | null = null;
  private goal: { x: number; z: number; pace: Pace } | null = null;
  /** s it has been trying to get somewhere and barely moving. */
  private stuck = 0;
  private readonly pose: MutablePose = {};
  private readonly out: MutablePose = {};
  private readonly stride: MutablePose = {};
  /** 0 standing to 1 at its full pace, eased; 0 walking to 1 trotting or running. */
  private moving = 0;
  private trotting = 0;
  /** Its gait's phase, in radians, and how lain down it is (0 to 1). */
  private phase = 0;
  private lying = 0;
  private clock: number;
  private stampT = STAMP;
  private readonly radius: number;
  /**
   * Where it's solid (herds.ts stands them in the World, so you and the
   * others walk round it): round its middle, or a horse's at its fore and
   * hind ends.
   */
  readonly solids: readonly Solid[];

  constructor(
    readonly look: AnimalId,
    readonly rig: QuadRig,
    x: number,
    z: number,
    yaw: number,
    private readonly ground: Ground,
    /** s into its breathing and tail swishing it starts: animals of a herd each start at their own. */
    start = 0,
  ) {
    const a = ANIMALS[look];
    this.species = a.species;
    this.moves = movesOf(look);
    this.radius = CONFIG.animals.radius[a.species];
    const ends = a.species === 'horse' ? 2 : 1;
    this.solids = Array.from({ length: ends }, () => ({ x, z, r: ends > 1 ? this.radius * 0.85 : this.radius }));
    this.yaw = yaw;
    this.clock = start;
    this.position = this.root.position;
    this.root.rotation.order = 'YXZ';
    this.position.set(x, 0, z);
    this.root.add(rig.mesh);
    for (const [k, v] of Object.entries(this.moves.stand)) this.pose[k] = [v![0], v![1], v![2]];
    this.update(0);
  }

  /** Walk (or run) to (x, z); it stands in its stance once there. */
  go(x: number, z: number, pace: Pace = 'walk'): void {
    if (this.goal && this.goal.x === x && this.goal.z === z && this.goal.pace === pace) return;
    this.goal = { x, z, pace };
    this.turnTo = null;
    this.stuck = 0;
  }

  /** Stop where it is. */
  stop(): void {
    this.goal = null;
  }

  /** Is it standing (not on its way somewhere)? */
  get still(): boolean {
    return this.goal === null;
  }

  /** Turn on the spot to face `yaw`. */
  face(yaw: number): void {
    this.turnTo = yaw;
  }

  /** Lift the near forefoot and stamp it down (a horse's). */
  stamp(): void {
    this.stampT = 0;
  }

  /** Settle into its stance at once, lying already if it lies: built where you can't see. */
  snap(): void {
    this.lying = this.stance === 'lie' ? 1 : 0;
    blendPoses(this.pose, this.moves[this.stance], 1, this.pose, QUAD_BONES);
    this.update(0);
  }

  /** How far it is from (x, z) on the floor plane. */
  distanceTo(x: number, z: number): number {
    return Math.hypot(this.position.x - x, this.position.z - z);
  }

  update(dt: number): void {
    this.clock += dt;
    const pace = CONFIG.animals.speed[this.species];
    const turnRate = CONFIG.animals.turn;
    let speed = 0;
    const goal = this.goal;
    if (goal) {
      const dx = goal.x - this.position.x;
      const dz = goal.z - this.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.2) this.goal = null;
      else {
        const off = this.turn(Math.atan2(dx, dz), dt, goal.pace === 'run' ? turnRate * 2 : turnRate);
        // It gets up and turns first, and sets off as it comes round; it slows into where it's going.
        speed = pace[goal.pace] * Math.max(0, 1 - Math.abs(off) / 1.3) * Math.min(1, 0.4 + d / 1.5) * (1 - this.lying);
        if (speed > 0 && dt > 0) {
          _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          // The World pushes a body out of every solid it stands, its own too (herds.ts stands them):
          // for its own steps they're nothing, their radius less its own, so nothing is within them.
          for (const b of this.solids) b.r = -this.radius;
          this.ground.steer(this.position, _v, this.radius);
          const x0 = this.position.x;
          const z0 = this.position.z;
          this.position.addScaledVector(_v, speed * dt);
          this.ground.resolve(this.position, this.radius);
          const moved = Math.hypot(this.position.x - x0, this.position.z - z0);
          // Got nowhere for a while (a wall, a rock): it gives up and stands.
          this.stuck = moved < speed * dt * 0.3 ? this.stuck + dt : Math.max(0, this.stuck - dt);
          if (this.stuck > 1.5) this.goal = null;
        }
      }
    } else if (this.turnTo !== null) {
      if (Math.abs(this.turn(this.turnTo, dt, turnRate * 0.6)) < 0.02) this.turnTo = null;
    }
    const running = goal?.pace === 'run';
    const ease = 1 - Math.exp(-6 * dt);
    this.moving += (Math.min(1, speed / (running ? pace.run : pace.walk)) - this.moving) * ease;
    this.trotting += ((running || this.species === 'dog' ? 1 : 0) - this.trotting) * ease;
    if (this.moving > 0.01) this.phase += dt * strideRate(this.moves, Math.max(speed, 0.3 * pace.walk));

    // The stance it eases into; it gets up before it walks, and lies down slowly.
    const stance: Stance = this.goal ? 'stand' : this.stance;
    this.lying += ((stance === 'lie' ? 1 : 0) - this.lying) * (1 - Math.exp(-(stance === 'lie' ? 1.6 : 3) * dt));
    blendPoses(this.pose, this.stanceOf(stance), dt > 0 ? 1 - Math.exp(-4 * dt) : 1, this.pose, QUAD_BONES);

    // Over it: breathing, a horse's tail at the flies, chewing as it crops; its legs' stride; its head turned.
    const out = alive(this.pose, this.clock, this.out, this.species === 'horse' ? 1 : 0, stance === 'graze' ? 1 : 0);
    if (this.moving > 0.01) {
      for (const k of Object.keys(this.stride)) delete this.stride[k];
      gait(this.phase, this.moving, this.moves.swing, this.trotting, this.stride);
      addInto(out, this.stride);
    }
    if (this.stampT < STAMP) {
      this.stampT += dt;
      const k = Math.max(0, Math.sin(Math.min(1, this.stampT / (STAMP * 0.75)) * Math.PI));
      addInto(out, { foreThighL: [-0.35 * k, 0, 0], foreShinL: [1.1 * k, 0, 0], neck: [0.1 * k, 0, 0] });
    }
    if (this.lookAt && !this.goal) {
      const want = Math.atan2(this.lookAt.x - this.position.x, this.lookAt.z - this.position.z);
      const turn = Math.max(-MAX_LOOK, Math.min(MAX_LOOK, wrap(want - this.yaw)));
      addInto(out, { neck: [0, turn * 0.55, 0], head: [0, turn * 0.45, 0] });
    }
    this.rig.apply(out);
    const p = this.rig.proportions;
    this.rig.setHipOffset(0, -this.moves.lieDrop * this.lying + gaitBob(this.phase, this.moving, p), 0);

    // On the ground, pitched to the slope under it, front to back.
    const half = p.body * 0.5;
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    const { x, z } = this.position;
    const front = this.ground.heightAt(x + s * half, z + c * half);
    const back = this.ground.heightAt(x - s * half, z - c * half);
    this.position.y = (front + back) / 2;
    this.placeSolids();
    this.root.rotation.set(-Math.atan2(front - back, 2 * half) * (1 - 0.5 * this.lying), this.yaw, 0);
  }

  /** Its solids where it stands now: one round its middle, or a horse's ends along its back. */
  private placeSolids(): void {
    const { solids } = this;
    const reach = solids.length > 1 ? this.rig.proportions.body * 0.55 : 0;
    for (let i = 0; i < solids.length; i++) {
      const along = solids.length > 1 ? (i === 0 ? reach : -reach) : 0;
      const b = solids[i];
      b.x = this.position.x + Math.sin(this.yaw) * along;
      b.z = this.position.z + Math.cos(this.yaw) * along;
      b.r = solids.length > 1 ? this.radius * 0.85 : this.radius;
    }
  }

  /** Out of the world: off its parent. Its rig's geometry is the fold's to give back (herds.ts). */
  dispose(): void {
    this.root.removeFromParent();
  }

  /** Turn towards `yaw` at `rate` rad/s; returns how far it still has to go. */
  private turn(yaw: number, dt: number, rate: number): number {
    const delta = wrap(yaw - this.yaw);
    const step = rate * dt;
    this.yaw += Math.max(-step, Math.min(step, delta));
    return wrap(yaw - this.yaw);
  }

  private stanceOf(stance: Stance): QuadPose {
    return this.moves[stance];
  }
}

/** An angle wrapped into (−π, π]. */
function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
