import {
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  type Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { CONFIG } from '../config';
import type { Enemy } from '../enemies/enemy';
import { ModelBuilder } from '../models/kit';
import { sharedModelMaterial } from '../models/materials';
import { PAL } from '../models/palette';
import type { Ground } from '../world/ground';

/** What an enemy arrow met on the player this frame. `glanced`: stopped by a still blade, and gone. */
export type ArrowContact = 'blocked' | 'parried' | 'deflected' | 'glanced' | 'hit' | 'dodged';

/** Combat decides what an arrow touched (and applies damage); Projectiles handles the flight. */
export interface ArrowResolver {
  playerContact(prev: Vector3, pos: Vector3, arrow: Arrow): ArrowContact | null;
  /** A reflected arrow flying back into the room: which enemy did it hit? */
  enemyContact(prev: Vector3, pos: Vector3): Enemy | null;
}

export interface Arrow {
  pos: Vector3;
  prev: Vector3;
  vel: Vector3;
  life: number;
  damage: number;
  owner: Enemy | null;
  reflected: boolean;
  /** Seconds left stuck in something; 0 while flying. */
  stuck: number;
  attached: Object3D | null;
  localPos: Vector3;
  localDir: Vector3;
}

const MAX = 32;
const _m = new Matrix4();
const _q = new Quaternion();
const _one = new Vector3(1, 1, 1);
const _fwd = new Vector3(0, 0, 1);
const _dir = new Vector3();
const _p = new Vector3();

function arrowGeometry() {
  // Along +Z, tip at the origin so a stuck arrow's point sits in the surface.
  const b = new ModelBuilder(3);
  b.box(0.012, 0.012, 0.62, { at: [0, 0, -0.31], color: PAL.wood })
    .cone(0.018, 0.06, 4, { at: [0, 0, 0.02], rot: [Math.PI / 2, 0, 0], color: PAL.iron })
    .box(0.002, 0.04, 0.09, { at: [0, 0.012, -0.57], color: PAL.cloth })
    .box(0.04, 0.002, 0.09, { at: [0, 0, -0.57], color: PAL.cloth });
  return b.build();
}

/** Arrows in flight, stuck in things, and on archers' strings. One draw call for all of them. */
export class Projectiles {
  readonly mesh: InstancedMesh;
  private readonly arrows: Arrow[] = [];
  private readonly nocked = new Map<Enemy, { from: Vector3; to: Vector3 }>();

  constructor(
    parent: Object3D,
    private readonly ground: Ground,
  ) {
    this.mesh = new InstancedMesh(arrowGeometry(), sharedModelMaterial(), MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    parent.add(this.mesh);
  }

  /** Show an arrow on an archer's string this frame (nock → grip). */
  nock(owner: Enemy, from: Vector3, to: Vector3): void {
    this.nocked.set(owner, { from: from.clone(), to: to.clone() });
  }

  fire(owner: Enemy, from: Vector3, target: Vector3, damage: number): void {
    this.nocked.delete(owner);
    const vel = target.clone().sub(from).normalize().multiplyScalar(CONFIG.arrow.speed);
    this.add({
      pos: from.clone(),
      prev: from.clone(),
      vel,
      life: CONFIG.arrow.life,
      damage,
      owner,
      reflected: false,
      stuck: 0,
      attached: null,
      localPos: new Vector3(),
      localDir: new Vector3(),
    });
  }

  private add(a: Arrow): void {
    if (this.arrows.length >= MAX - 4) {
      // Recycle the oldest stuck arrow first.
      const i = this.arrows.findIndex((x) => x.stuck > 0);
      this.arrows.splice(i >= 0 ? i : 0, 1);
    }
    this.arrows.push(a);
  }

  /** Send an arrow back the way it came (a parry or a sword deflect). */
  reflect(a: Arrow, toward: Vector3 | null): void {
    a.reflected = true;
    a.life = CONFIG.arrow.life;
    if (toward) a.vel.subVectors(toward, a.pos).normalize().multiplyScalar(CONFIG.arrow.speed * 1.3);
    else a.vel.negate().multiplyScalar(1.1);
  }

  /** Stick into a moving thing (the shield): keeps its pose relative to it. */
  attach(a: Arrow, to: Object3D): void {
    a.stuck = CONFIG.arrow.stickTime;
    a.attached = to;
    to.updateWorldMatrix(true, false);
    _m.copy(to.matrixWorld).invert();
    a.localPos.copy(a.pos).applyMatrix4(_m);
    a.localDir.copy(a.vel).normalize().transformDirection(_m);
  }

  update(dt: number, resolver: ArrowResolver): void {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      if (a.stuck > 0) {
        a.stuck -= dt;
        if (a.stuck <= 0) this.arrows.splice(i, 1);
        continue;
      }
      a.life -= dt;
      a.prev.copy(a.pos);
      a.pos.addScaledVector(a.vel, dt);

      if (!a.reflected) {
        const hit = resolver.playerContact(a.prev, a.pos, a);
        if (hit === 'hit' || hit === 'glanced') {
          this.arrows.splice(i, 1);
          continue;
        }
        if (hit === 'blocked' || hit === 'parried' || hit === 'deflected') continue; // resolver re-aimed or attached it
      } else if (resolver.enemyContact(a.prev, a.pos)) {
        this.arrows.splice(i, 1);
        continue;
      }

      // The floor, walls and props catch arrows.
      if (this.ground.arrowStops(a.pos)) {
        a.pos.y = Math.max(this.ground.heightAt(a.pos.x, a.pos.z) + 0.02, a.pos.y);
        a.stuck = CONFIG.arrow.stickTime;
        continue;
      }
      if (a.life <= 0) this.arrows.splice(i, 1);
    }
  }

  /** Write instance matrices; call after everything that nocks or moves arrows. */
  render(): void {
    let n = 0;
    for (const a of this.arrows) {
      if (a.attached) {
        a.pos.copy(a.localPos).applyMatrix4(a.attached.matrixWorld);
        _dir.copy(a.localDir).transformDirection(a.attached.matrixWorld);
      } else _dir.copy(a.vel).normalize();
      _q.setFromUnitVectors(_fwd, _dir);
      _m.compose(a.pos, _q, _one);
      this.mesh.setMatrixAt(n++, _m);
    }
    for (const { from, to } of this.nocked.values()) {
      if (n >= MAX) break;
      _dir.subVectors(to, from).normalize();
      _q.setFromUnitVectors(_fwd, _dir);
      // Tip just past the bow grip.
      _p.copy(to).addScaledVector(_dir, 0.08);
      _m.compose(_p, _q, _one);
      this.mesh.setMatrixAt(n++, _m);
    }
    this.nocked.clear();
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.arrows.length = 0;
    this.nocked.clear();
    this.mesh.count = 0;
  }
}
