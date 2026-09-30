import {
  AdditiveBlending,
  type BufferGeometry,
  CircleGeometry,
  ConeGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { CONFIG } from '../config';
import type { Particles } from '../fx/particles';
import type { Ground } from '../world/ground';
import { ABILITY_COLOUR, type Target, throwTarget } from './abilities';
import { within } from './mage';

// Blizzard (the mage's level-10 ability; .scratch/abilities/issues/13): ice
// falls for 5 s over a 4 m circle where you point, biting every enemy in it
// every 0.5 s and slowing it while it stands there. `blizzardAt` is where it
// falls; `Blizzard` is the storm, one at a time (its cooldown outlasts it), a
// lasting effect in the budget of ticket 16: a pale disc on the floor and one
// instanced mesh of falling shards, 2 draw calls and at most 500 triangles.
// Combat decides what each tick does to whom it catches.

/** Shards falling at once. */
const SHARDS = 24;
/** m over the circle's floor a shard starts its fall, lowest to highest, and its speed, m/s. */
const FALL = { from: 3, to: 5, speed: [6, 9] } as const;
/** s the disc takes to fade in, and out once the last shard has fallen. */
const FADE = 0.3;
/** m apart that the way to a Blizzard's circle is tried, so it never falls past a wall or a prop. */
const STEP = 0.5;
/** m over the floor a clear line to the circle is looked for. */
const CHEST = 1;

const _to = new Vector3();
const _probe = new Vector3();
const _flat = new Vector3();

/**
 * Where a Blizzard aimed from `from` along `hand` (where the right hand faces
 * as the gesture ends) falls, written to `out` (on the floor): on the nearest
 * enemy within `aimDeg`° of the hand and `range` m, in sight; else where the
 * hand's line meets the floor, at most `range` m off (and `range` m off if it
 * points level or up), stopped short of a wall.
 */
export function blizzardAt<T extends Target>(
  from: Vector3,
  hand: Vector3,
  enemies: readonly T[],
  ground: Ground,
  out: Vector3,
  { range, aimDeg }: { readonly range: number; readonly aimDeg: number } = CONFIG.classes.mage.abilities.blizzard,
): Vector3 {
  const sees = (a: Vector3, b: Vector3) => ground.lineOfSight(a, b);
  const target = throwTarget(from, [hand], enemies, sees, { range, aimDeg });
  if (target) return out.set(target.position.x, ground.heightAt(target.position.x, target.position.z), target.position.z);
  _flat.set(hand.x, 0, hand.z);
  const flat = _flat.length();
  let far = range;
  if (flat < 1e-6) far = 0;
  else if (hand.y < 0) far = Math.min(range, ((from.y - ground.heightAt(from.x, from.z)) / -hand.y) * flat);
  if (flat > 1e-6) _flat.divideScalar(flat);
  let went = 0;
  for (let d = STEP; d <= far + 1e-6; d += STEP) {
    _probe.set(from.x + _flat.x * d, 0, from.z + _flat.z * d);
    _probe.y = ground.heightAt(_probe.x, _probe.z) + CHEST;
    if (ground.arrowStops(_probe) || !ground.lineOfSight(_to.copy(from), _probe)) break;
    went = d;
  }
  // The last step to the exact point, if the way there was clear all along.
  if (went > far - STEP) went = far;
  const x = from.x + _flat.x * went;
  const z = from.z + _flat.z * went;
  return out.set(x, ground.heightAt(x, z), z);
}

interface Shard {
  x: number;
  y: number;
  z: number;
  speed: number;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3(1, 1, 1);
const _p = new Vector3();

/** An icicle, point down, 0.3 m long. */
function shardGeometry() {
  const g = new ConeGeometry(0.035, 0.3, 4, 1);
  g.rotateX(Math.PI);
  return g;
}

/** The storm: where it falls, how long it has left, and whom each of its ticks catches. */
export class Blizzard {
  readonly centre = new Vector3();
  /** The pale circle on the floor. */
  readonly disc: Mesh;
  /** The ice falling in it. */
  readonly shards: InstancedMesh;
  private readonly discMaterial: MeshBasicMaterial;
  private readonly falling: Shard[] = [];
  /** m its circle reaches: its own, or further with Arctic Reach (set as it starts). */
  radius: number;
  private elapsed = 0;
  private ticks = 0;
  private fade = 0;

  constructor(parent: Object3D | null) {
    const B = CONFIG.classes.mage.abilities.blizzard;
    const colour = ABILITY_COLOUR.blizzard!;
    this.radius = B.radius;
    this.ticks = this.total; // none falling yet
    this.discMaterial = new MeshBasicMaterial({ color: colour, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
    this.disc = new Mesh(new CircleGeometry(1, 32), this.discMaterial);
    this.disc.rotation.x = -Math.PI / 2;
    this.disc.visible = false;
    this.shards = new InstancedMesh(shardGeometry(), new MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false }), SHARDS);
    this.shards.instanceMatrix.setUsage(DynamicDrawUsage);
    this.shards.frustumCulled = false;
    this.shards.count = 0;
    parent?.add(this.disc, this.shards);
  }

  /** Is ice falling? */
  get active(): boolean {
    return this.ticks < this.total;
  }

  /** s of ice left to fall: 0 when none does. */
  get left(): number {
    return this.active ? Math.max(0, CONFIG.classes.mage.abilities.blizzard.time - this.elapsed) : 0;
  }

  /** Every tick a storm bites: the first as it starts, then one every `every` s. */
  private get total(): number {
    const B = CONFIG.classes.mage.abilities.blizzard;
    return Math.round(B.time / B.every);
  }

  /** Ice starts to fall over the circle at `at` (on the floor), `radius` m across. One already falling ends. */
  start(at: Vector3, particles: Particles | null = null, radius: number = CONFIG.classes.mage.abilities.blizzard.radius): void {
    this.centre.copy(at);
    this.radius = radius;
    this.elapsed = 0;
    this.ticks = 0;
    this.falling.length = 0;
    for (let i = 0; i < SHARDS; i++) this.falling.push(this.drop({ x: 0, y: 0, z: 0, speed: 0 }, Math.random()));
    this.disc.position.set(at.x, at.y + 0.03, at.z);
    this.disc.scale.setScalar(this.radius);
    this.disc.visible = true;
    particles?.burst('magic', _p.copy(at).setY(at.y + 0.3), 30, undefined, ABILITY_COLOUR.blizzard);
  }

  /**
   * Step the storm `dt` s: each tick due calls `tick` with the enemies a blow
   * can land on within its circle.
   */
  update<T extends Target>(dt: number, enemies: readonly T[], tick: (caught: T[]) => void, particles: Particles | null = null): void {
    const B = CONFIG.classes.mage.abilities.blizzard;
    if (this.active) {
      const due = Math.min(this.total, Math.floor((this.elapsed + 1e-6) / B.every) + 1);
      while (this.ticks < due) {
        this.ticks++;
        tick(within(this.centre, this.radius, enemies));
        if (particles) this.flurry(particles);
      }
      this.elapsed += dt;
    }
    this.fall(dt, particles);
  }

  /** A shard lands and a new one starts its fall; once the ice stops, the last ones fall out and the disc fades. */
  private fall(dt: number, particles: Particles | null): void {
    const falling = this.active;
    const floor = this.centre.y;
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const s = this.falling[i];
      s.y -= s.speed * dt;
      if (s.y > floor) continue;
      if (particles && Math.random() < 0.3) particles.burst('sparks', _p.set(s.x, floor + 0.02, s.z), 2, undefined, ABILITY_COLOUR.blizzard);
      if (falling) this.drop(s, 0);
      else this.falling.splice(i, 1);
    }
    this.fade = falling || this.falling.length ? Math.min(1, this.fade + dt / FADE) : Math.max(0, this.fade - dt / FADE);
    this.discMaterial.opacity = 0.16 * this.fade;
    this.disc.visible = this.fade > 0;
    let n = 0;
    for (const s of this.falling) {
      _m.compose(_p.set(s.x, s.y, s.z), _q, _s);
      this.shards.setMatrixAt(n++, _m);
    }
    this.shards.count = n;
    this.shards.instanceMatrix.needsUpdate = true;
  }

  /** A shard at a random point over the circle, `through` of the way down its fall already. */
  private drop(s: Shard, through: number): Shard {
    const r = this.radius * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    const top = FALL.from + Math.random() * (FALL.to - FALL.from);
    s.x = this.centre.x + Math.cos(a) * r;
    s.z = this.centre.z + Math.sin(a) * r;
    s.y = this.centre.y + top * (1 - through);
    s.speed = FALL.speed[0] + Math.random() * (FALL.speed[1] - FALL.speed[0]);
    return s;
  }

  /** A tick's snow: a few white motes over the circle. */
  private flurry(particles: Particles): void {
    for (let i = 0; i < 4; i++) {
      const r = this.radius * Math.sqrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      _p.set(this.centre.x + Math.cos(a) * r, this.centre.y + 0.2, this.centre.z + Math.sin(a) * r);
      particles.burst('magic', _p, 3, undefined, ABILITY_COLOUR.blizzard);
    }
  }

  /** How many triangles it draws at most: the disc and every shard. */
  get triangles(): number {
    const tris = (g: BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    return tris(this.disc.geometry) + tris(this.shards.geometry) * SHARDS;
  }

  /** Nothing falling: after death, or a new run. */
  clear(): void {
    this.ticks = this.total;
    this.falling.length = 0;
    this.fade = 0;
    this.disc.visible = false;
    this.shards.count = 0;
  }
}
