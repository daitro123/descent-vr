import { Group, Mesh, MeshBasicMaterial, RingGeometry, Vector3 } from 'three';
import { closestSegmentSegment } from '../../combat/geometry';
import { IDLE } from '../../enemies/poses';
import { sfx } from '../../fx/sfx';
import type { GameMap } from '../../maps/types';
import { buildCharacter } from '../../models/characters';
import { createModelMaterial, type ModelMaterial } from '../../models/materials';
import { PAL } from '../../models/palette';
import { type DressContext, type Pose, type Proportions, Rig } from '../../models/rig';
import type { Sword } from '../../player/weapons';

// PROTOTYPE (Talking to NPCs and tracking quests): a stand-in Marshal Hale and
// three stand-in farm bandits for `?talk`. Hale's real look belongs to the
// Friendly characters ticket; real enemies in the zone to Enemies in the open.

const SKIN = 0xc09070;
const TABARD = 0x2c4a86;
const HAIR = 0x4a3526;

const HALE: Proportions = {
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

const _v = new Vector3();

/** A placeholder guard captain: mail, a blue tabard, a sword at the hip. One draw call. */
export class Hale {
  readonly root = new Group();
  readonly material: ModelMaterial = createModelMaterial();
  readonly rig: Rig;
  /** A gold ring at Hale's feet while a pointer is on them. */
  private readonly ring = new Mesh(
    new RingGeometry(0.45, 0.55, 32).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.85 }),
  );
  /** Head centre above the ground. */
  readonly headY = HALE.hipY + 0.06 + HALE.neck + 0.12;
  private waving = 0;
  private t = 0;

  constructor(
    map: GameMap,
    readonly x: number,
    readonly z: number,
  ) {
    this.rig = new Rig(HALE, dressHale, this.material, 5);
    this.ring.position.y = 0.08;
    this.ring.visible = false;
    this.root.add(this.rig.mesh, this.ring);
    this.root.position.set(x, map.heightAt(x, z), z);
    this.rig.apply(STAND);
  }

  get position(): Vector3 {
    return this.root.position;
  }

  /** World position of the head centre. */
  head(out: Vector3): Vector3 {
    return out.copy(this.root.position).setY(this.root.position.y + this.headY);
  }

  wave(): void {
    this.waving = 1.8;
  }

  set highlighted(on: boolean) {
    this.ring.visible = on;
  }

  update(dt: number, player: Vector3): void {
    this.t += dt;
    // Turn to face you when you come near.
    _v.subVectors(player, this.root.position);
    if (_v.x * _v.x + _v.z * _v.z < 64) {
      const want = Math.atan2(_v.x, _v.z);
      let d = want - this.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.root.rotation.y += d * Math.min(1, dt * 3);
    }
    this.waving = Math.max(0, this.waving - dt);
    const breathe = 0.02 * Math.sin(this.t * 1.7);
    if (this.waving > 0) {
      const lift = Math.min(1, this.waving * 4, (1.8 - this.waving) * 6);
      this.rig.apply({
        ...STAND,
        spine: [breathe, 0, 0],
        upperArmR: [-0.3 * lift, 0, -0.1 - 2.3 * lift],
        forearmR: [0, 0, -0.5 * lift + 0.45 * lift * Math.sin(this.t * 10)],
      });
    } else this.rig.apply({ ...STAND, spine: [breathe, 0, 0] });
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
    // A sheathed sword at the left hip.
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

interface StandIn {
  root: Group;
  x: number;
  z: number;
  ground: number;
  /** Seconds since it fell; < 0 while standing. */
  down: number;
}

const _base = new Vector3();
const _tip = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _hit = { distance: 0, pointA: new Vector3(), pointB: new Vector3() };

/** Skeletons standing in for the farm's bandits. A committed sword swing drops one; it stands again 20 s later. */
export class FarmStandIns {
  readonly root = new Group();
  private readonly standIns: StandIn[] = [];
  onKill?: (at: Vector3) => void;
  /** Desktop and scripted tests: drop the nearest standing one within `reach` metres. */
  strikeNearest(from: Vector3, reach: number): boolean {
    let best: StandIn | null = null;
    let bestD = reach;
    for (const s of this.standIns) {
      const d = Math.hypot(s.x - from.x, s.z - from.z);
      if (s.down < 0 && d < bestD) [best, bestD] = [s, d];
    }
    if (best) this.fell(best);
    return !!best;
  }

  constructor(map: GameMap, spots: readonly (readonly [number, number])[], face: readonly [number, number]) {
    spots.forEach(([x, z], i) => {
      const { rig } = buildCharacter('grunt', { material: createModelMaterial(), variant: i });
      rig.apply(IDLE.grunt);
      const root = new Group();
      root.rotation.order = 'YXZ'; // so it falls backwards whichever way it faces
      root.add(rig.mesh);
      const ground = map.heightAt(x, z);
      root.position.set(x, ground, z);
      root.rotation.y = Math.atan2(face[0] - x, face[1] - z);
      this.root.add(root);
      this.standIns.push({ root, x, z, ground, down: -1 });
    });
  }

  reset(): void {
    for (const s of this.standIns) this.standUp(s);
  }

  update(dt: number, sword: Sword, rig: Group): void {
    const hot = sword.hot;
    if (hot) sword.segment(rig, _base, _tip);
    for (const s of this.standIns) {
      if (s.down >= 0) {
        s.down += dt;
        const fall = Math.min(1, s.down / 0.45);
        s.root.rotation.x = -1.45 * fall * fall;
        s.root.position.y = s.ground - Math.max(0, s.down - 3) * 0.5;
        s.root.visible = s.down < 4.5;
        if (s.down > 20) this.standUp(s);
        continue;
      }
      if (!hot) continue;
      _a.set(s.x, s.ground + 0.35, s.z);
      _b.set(s.x, s.ground + 1.65, s.z);
      if (closestSegmentSegment(_base, _tip, _a, _b, _hit).distance < 0.3) {
        sfx.hit(false, _hit.pointB);
        this.fell(s);
      }
    }
  }

  private fell(s: StandIn): void {
    s.down = 0;
    sfx.death(_a.set(s.x, s.ground + 1, s.z));
    this.onKill?.(_a.set(s.x, s.ground + 1.7, s.z));
  }

  private standUp(s: StandIn): void {
    s.down = -1;
    s.root.rotation.x = 0;
    s.root.position.y = s.ground;
    s.root.visible = true;
  }
}
