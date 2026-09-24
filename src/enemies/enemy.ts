import {
  BoxGeometry,
  CapsuleGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Vector3,
} from 'three';
import { CONFIG } from '../config';

export type EnemyState = 'spawning' | 'chase' | 'windup' | 'strike' | 'recover' | 'stagger' | 'dead';
export type StrikeResult = 'hit' | 'blocked' | 'parried' | 'miss';

export interface EnemyContext {
  /** Player's head projected to the floor. */
  playerFeet: Vector3;
  /** Called at the moment the club lands; decides what happened. */
  resolveStrike(enemy: Enemy): StrikeResult;
}

const SPAWN_TIME = 0.8;
const DEATH_TIME = 1.2;
const ARM_REST = -0.3;
const ARM_RAISED = -2.8;
const ARM_STRUCK = -1.3;

// Shared geometry; materials are per-enemy so flashes don't bleed across.
const bodyGeo = new CapsuleGeometry(0.28, 0.8, 2, 6);
const headGeo = new IcosahedronGeometry(0.2, 0);
const eyeGeo = new BoxGeometry(0.05, 0.03, 0.02);
const clubGeo = new BoxGeometry(0.09, 0.7, 0.09);
const eyeMat = new MeshBasicMaterial({ color: 0xff2a1a });

const _to = new Vector3();

/**
 * A white-box melee grunt. The state machine is the combat design:
 * chase → windup (telegraph, blockable) → strike → recover, and any sword hit
 * during windup staggers it — so aggression and blocking both pay off.
 */
export class Enemy {
  readonly root = new Group();
  readonly position: Vector3; // feet, alias of root.position
  hp: number = CONFIG.enemy.hp;
  state: EnemyState = 'spawning';
  stateTime = 0;
  /** Seconds until the sword can hit this enemy again. */
  hitCooldown = 0;
  readonly knockback = new Vector3();
  private readonly bodyMat = new MeshLambertMaterial({ color: 0xb8b09a });
  private readonly visual = new Group();
  private readonly arm = new Group();
  private flash = 0;
  private staggerDuration: number = CONFIG.enemy.staggerTime;

  constructor(x: number, z: number) {
    this.position = this.root.position;
    this.root.position.set(x, 0, z);
    this.root.add(this.visual);

    const body = new Mesh(bodyGeo, this.bodyMat);
    body.position.y = 0.75;
    const head = new Mesh(headGeo, this.bodyMat);
    head.position.y = 1.55;
    const eyeL = new Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.07, 1.58, 0.17);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.07;

    this.arm.position.set(0.34, 1.3, 0);
    const club = new Mesh(clubGeo, new MeshLambertMaterial({ color: 0x5a4030 }));
    club.position.y = -0.35;
    this.arm.add(club);
    this.arm.rotation.x = ARM_REST;

    this.visual.add(body, head, eyeL, eyeR, this.arm);
    this.visual.position.y = -1.8; // rises out of the floor on spawn
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  /** Can the sword damage it right now? */
  get hittable(): boolean {
    return this.state !== 'dead' && this.state !== 'spawning';
  }

  /** Axis of the hit capsule, world space. */
  capsule(outBottom: Vector3, outTop: Vector3): void {
    const r = CONFIG.enemy.radius;
    outBottom.set(this.position.x, r, this.position.z);
    outTop.set(this.position.x, CONFIG.enemy.height, this.position.z);
  }

  /** World position the club strikes from (the shoulder). */
  strikeOrigin(out: Vector3): Vector3 {
    return this.arm.getWorldPosition(out);
  }

  /** Returns true if this blow killed it. */
  takeHit(damage: number, push: Vector3): boolean {
    if (!this.hittable) return false;
    this.hp -= damage;
    this.flash = 0.12;
    this.knockback.add(push);
    this.hitCooldown = CONFIG.sword.perEnemyCooldown;
    if (this.hp <= 0) {
      this.enter('dead');
      return true;
    }
    this.stagger(CONFIG.enemy.staggerTime);
    return false;
  }

  stagger(duration: number): void {
    if (!this.hittable) return;
    // Don't shorten a longer stagger (e.g. a parry) with a quick hit.
    if (this.state === 'stagger' && this.staggerDuration - this.stateTime > duration) return;
    this.staggerDuration = duration;
    this.enter('stagger');
  }

  private enter(state: EnemyState): void {
    this.state = state;
    this.stateTime = 0;
  }

  /** Returns false once it has finished dying and should be removed. */
  update(dt: number, ctx: EnemyContext): boolean {
    const E = CONFIG.enemy;
    this.stateTime += dt;
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    this.flash = Math.max(0, this.flash - dt);

    // Knockback slides the body; decays quickly.
    this.position.addScaledVector(this.knockback, dt);
    this.knockback.multiplyScalar(Math.exp(-8 * dt));

    _to.subVectors(ctx.playerFeet, this.position);
    _to.y = 0;
    const dist = _to.length();

    switch (this.state) {
      case 'spawning': {
        const k = Math.min(1, this.stateTime / SPAWN_TIME);
        this.visual.position.y = -1.8 * (1 - k) * (1 - k);
        this.face(_to, dt * 3);
        if (k >= 1) this.enter('chase');
        break;
      }
      case 'chase':
        this.face(_to, dt);
        this.arm.rotation.x = ARM_REST;
        if (dist <= E.attackRange) this.enter('windup');
        else this.position.addScaledVector(_to.normalize(), E.moveSpeed * dt);
        break;
      case 'windup': {
        this.face(_to, dt);
        const k = Math.min(1, this.stateTime / E.windup);
        this.arm.rotation.x = ARM_REST + (ARM_RAISED - ARM_REST) * easeOut(k);
        if (k >= 1) this.enter('strike');
        break;
      }
      case 'strike': {
        const k = Math.min(1, this.stateTime / E.strikeTime);
        this.arm.rotation.x = ARM_RAISED + (ARM_STRUCK - ARM_RAISED) * k;
        if (k >= 1) {
          const result = ctx.resolveStrike(this);
          if (result === 'blocked') this.stagger(E.blockStagger);
          else if (result === 'parried') this.stagger(E.parryStagger);
          else this.enter('recover');
        }
        break;
      }
      case 'recover':
        this.arm.rotation.x += (ARM_REST - this.arm.rotation.x) * Math.min(1, dt * 4);
        if (this.stateTime >= E.recover) this.enter('chase');
        break;
      case 'stagger':
        // Rock back, arm flops down.
        this.arm.rotation.x += (ARM_REST - this.arm.rotation.x) * Math.min(1, dt * 10);
        this.visual.rotation.x = -0.25 * Math.sin(Math.min(1, this.stateTime / this.staggerDuration) * Math.PI);
        if (this.stateTime >= this.staggerDuration) {
          this.visual.rotation.x = 0;
          this.enter('chase');
        }
        break;
      case 'dead': {
        const k = Math.min(1, this.stateTime / DEATH_TIME);
        this.visual.rotation.x = (-Math.PI / 2) * easeOut(Math.min(1, k * 2));
        this.visual.position.y = -0.6 * Math.max(0, k * 2 - 1);
        if (k >= 1) return false;
        break;
      }
    }

    // Hit flash white; telegraph glows orange as the wind-up builds.
    const tele = this.state === 'windup' ? this.stateTime / E.windup : this.state === 'strike' ? 1 : 0;
    if (this.flash > 0) this.bodyMat.emissive.setRGB(1, 1, 1);
    else this.bodyMat.emissive.setRGB(0.9 * tele, 0.35 * tele, 0);
    return true;
  }

  private face(dir: Vector3, dt: number): void {
    if (dir.lengthSq() < 1e-6) return;
    const target = Math.atan2(dir.x, dir.z);
    let delta = target - this.root.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    const maxStep = CONFIG.enemy.turnSpeed * dt;
    this.root.rotation.y += Math.max(-maxStep, Math.min(maxStep, delta));
  }
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}
