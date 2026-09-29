import { Group, Vector3 } from 'three';
import type { HaleShows } from '../adventureState';
import { CONFIG } from '../config';
import type { Spot } from '../maps/types';
import { createModelMaterial } from '../models/materials';
import { PAL } from '../models/palette';
import { type DressContext, type Pose, type Proportions, Rig } from '../models/rig';
import { QuestMarker } from '../ui/questMarker';
import type { Ground } from '../world/ground';

// Marshal Hale, the village's guard captain and Oakvale's quest giver, at the
// crossroads. This is the talk prototype's stand-in (in history at merge
// 19ce545): mail, a blue tabard and a sword at the hip, on today's rig, until
// the human body lands (ticket 20).

const SKIN = 0xc09070;
const TABARD = 0x2c4a86;
const HAIR = 0x4a3526;

const BUILD: Proportions = {
  hipY: 0.96,
  hipW: 0.1,
  spine: 0.46,
  shoulderW: 0.2,
  neck: 0.5,
  upperArm: 0.29,
  forearm: 0.26,
  thigh: 0.45,
  shin: 0.45,
};

const STAND: Pose = {
  upperArmL: [0.05, 0, 0.1],
  forearmL: [-0.2, 0, 0],
  upperArmR: [0.05, 0, -0.1],
  forearmR: [-0.2, 0, 0],
};

/** Turn `from` towards `to` (radians) by the shorter way, `k` of the way. */
function easeAngle(from: number, to: number, k: number): number {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + d * k;
}

/**
 * Hale stands at their spot facing the crossroads. They turn to face you as
 * you come near and wave as you walk up, with the marker for what they have
 * for you floating over their head. One draw call, and the marker.
 */
export class Hale {
  readonly root = new Group();
  readonly marker = new QuestMarker();
  /** The circle nothing walks through: stand it in the World. */
  readonly body: { readonly x: number; readonly z: number; readonly r: number };
  /** Head centre above their feet. */
  readonly headY = BUILD.hipY + 0.06 + BUILD.neck + 0.12;
  private readonly rig: Rig;
  /** Which way they face at rest: the crossroads' centre. */
  private readonly rest: number;
  /** Seconds of wave left; 0 while not waving. */
  private waving = 0;
  /** Whether they'll wave the next time you walk up. */
  private waveReady = true;
  private t = 0;

  /** At `spot` on `ground`, showing `marker`. */
  constructor(spot: Spot, ground: Ground, marker: HaleShows['marker']) {
    this.rig = new Rig(BUILD, dressHale, createModelMaterial(), 5);
    this.root.name = 'hale';
    this.root.add(this.rig.mesh, this.marker.sprite);
    this.root.position.set(spot.x, ground.heightAt(spot.x, spot.z), spot.z);
    this.root.rotation.y = this.rest = spot.yaw;
    this.body = { x: spot.x, z: spot.z, r: CONFIG.hale.radius };
    this.rig.apply(STAND);
    this.marker.update(0, marker, this.headY + CONFIG.hale.marker);
  }

  get position(): Vector3 {
    return this.root.position;
  }

  /** World position of their head's centre. */
  head(out: Vector3): Vector3 {
    return out.copy(this.root.position).setY(this.root.position.y + this.headY);
  }

  /** Face you when you're near, wave as you walk up, and show `marker` over their head. */
  update(dt: number, you: Vector3, marker: HaleShows['marker']): void {
    const H = CONFIG.hale;
    this.t += dt;
    const dx = you.x - this.root.position.x;
    const dz = you.z - this.root.position.z;
    const d = Math.hypot(dx, dz);
    const want = d < H.turnWithin ? Math.atan2(dx, dz) : this.rest;
    this.root.rotation.y = easeAngle(this.root.rotation.y, want, Math.min(1, dt * H.turnRate));

    if (d > H.waveAgain) this.waveReady = true;
    if (this.waveReady && d < H.waveWithin) {
      this.waveReady = false;
      this.waving = H.waveTime;
    }
    this.waving = Math.max(0, this.waving - dt);
    const breathe: Pose = { ...STAND, spine: [0.02 * Math.sin(this.t * 1.7), 0, 0] };
    if (this.waving > 0) {
      const lift = Math.min(1, this.waving * 4, (H.waveTime - this.waving) * 6);
      this.rig.apply({
        ...breathe,
        upperArmR: [-0.3 * lift, 0, -0.1 - 2.3 * lift],
        forearmR: [0, 0, -0.5 * lift + 0.45 * lift * Math.sin(this.t * 10)],
      });
    } else this.rig.apply(breathe);

    this.marker.update(dt, marker, this.headY + H.marker);
  }
}

function dressHale(ctx: DressContext): void {
  const { spine: L, upperArm: UA, forearm: FA, thigh: TH, shin: SH } = ctx.p;
  const neck = ctx.p.neck - L;
  ctx
    .on('head')
    .box(0.09, neck + 0.04, 0.09, { at: [0, -neck / 2 + 0.02, 0], color: SKIN })
    .box(0.18, 0.22, 0.2, { at: [0, 0.12, 0], color: SKIN })
    .box(0.2, 0.08, 0.22, { at: [0, 0.24, -0.01], color: HAIR })
    .box(0.2, 0.14, 0.05, { at: [0, 0.16, -0.1], color: HAIR })
    .box(0.035, 0.03, 0.02, { at: [-0.045, 0.14, 0.1], color: PAL.socket, jitter: 0 })
    .box(0.035, 0.03, 0.02, { at: [0.045, 0.14, 0.1], color: PAL.socket, jitter: 0 })
    .box(0.11, 0.03, 0.03, { at: [0, 0.07, 0.1], color: 0x8a8278 })
    .box(0.03, 0.05, 0.04, { at: [0, 0.11, 0.11], color: 0xa87a5c });
  ctx.on('jaw').box(0.13, 0.05, 0.1, { at: [0, 0.0, 0.03], color: SKIN });
  ctx
    .on('spine')
    .taper(0.3, 0.2, 0.42, 0.26, L + 0.02, { at: [0, -0.02, 0], color: PAL.iron })
    .box(0.3, L - 0.02, 0.03, { at: [0, L / 2 - 0.02, 0.13], color: TABARD })
    .box(0.3, L - 0.02, 0.03, { at: [0, L / 2 - 0.02, -0.13], color: TABARD })
    .box(0.08, 0.08, 0.035, { at: [0, L - 0.16, 0.145], color: PAL.gold })
    .box(0.46, 0.08, 0.28, { at: [0, L - 0.02, 0], color: PAL.ironDark });
  ctx
    .on('hips')
    .taper(0.34, 0.22, 0.3, 0.2, 0.18, { at: [0, -0.14, 0], color: PAL.leatherDark })
    .box(0.36, 0.06, 0.25, { at: [0, 0.02, 0], color: PAL.leather })
    .box(0.07, 0.06, 0.03, { at: [0, 0.02, 0.13], color: PAL.gold })
    .box(0.28, 0.36, 0.03, { at: [0, -0.18, 0.13], color: TABARD })
    .box(0.28, 0.36, 0.03, { at: [0, -0.18, -0.13], color: TABARD })
    // Their old longsword, sheathed at the left hip.
    .box(0.04, 0.7, 0.06, { at: [0.2, -0.34, 0.04], rot: [0.25, 0, 0.05], color: PAL.leatherDark })
    .box(0.04, 0.14, 0.04, { at: [0.2, 0.08, -0.06], rot: [0.25, 0, 0.05], color: PAL.leather })
    .box(0.03, 0.03, 0.16, { at: [0.2, 0.02, -0.04], color: PAL.gold });
  for (const side of ['L', 'R'] as const) {
    ctx
      .on(`upperArm${side}`)
      .ball(0.07, { color: PAL.iron })
      .taper(0.1, 0.1, 0.085, 0.085, UA, { at: [0, -UA, 0], color: PAL.iron });
    ctx.on(`forearm${side}`).taper(0.1, 0.1, 0.075, 0.075, FA, { at: [0, -FA, 0], color: PAL.leather });
    ctx.on(`hand${side}`).box(0.07, 0.1, 0.05, { at: [0, -0.05, 0], color: SKIN });
    ctx.on(`thigh${side}`).taper(0.11, 0.12, 0.13, 0.14, TH, { at: [0, -TH, 0], color: PAL.leatherDark });
    ctx
      .on(`shin${side}`)
      .taper(0.1, 0.11, 0.11, 0.12, SH, { at: [0, -SH, 0], color: PAL.woodDark })
      .box(0.11, 0.06, 0.22, { at: [0, -SH - 0.01, 0.04], color: PAL.leatherDark });
  }
}
