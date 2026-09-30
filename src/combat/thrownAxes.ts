import { AdditiveBlending, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, type Object3D, Quaternion, Vector3 } from 'three';
import { CONFIG } from '../config';
import type { Enemy } from '../enemies/enemy';
import { ModelBuilder } from '../models/kit';
import { ABILITY_COLOUR, CHEST } from './abilities';

// Heroic Throw's spectral axes in flight: one instanced mesh for all of them
// (.scratch/abilities/spec.md, "Performance"). Each flies from the hand at
// the enemy it was thrown at, turning end over end, and lands on its chest;
// if the enemy falls or walks home first, the axe flies on and fades.

/** Axes in the air at once: a fourth ends the oldest. */
const MAX = 3;
/** Spins a second, end over end. */
const SPIN = 14;
/** Lands this close to the chest, past the body's radius (m). */
const REACH = 0.15;

function axeGeometry() {
  // The handle along +Y, the head's edge on +X, centred on its grip so it spins about its middle.
  const b = new ModelBuilder(5);
  b.box(0.03, 0.46, 0.03, { at: [0, 0, 0], color: 0xffffff })
    .box(0.16, 0.12, 0.02, { at: [0.07, 0.17, 0], color: 0xffffff })
    .box(0.04, 0.2, 0.02, { at: [0.16, 0.17, 0], color: 0xffffff });
  return b.build();
}

interface Axe {
  readonly pos: Vector3;
  readonly dir: Vector3;
  readonly from: Vector3;
  target: Enemy | null;
  /** Metres left before it fades, flying on. */
  left: number;
  spin: number;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _spin = new Quaternion();
const _to = new Vector3();
const _one = new Vector3(1, 1, 1);
const _x = new Vector3(1, 0, 0);
const _y = new Vector3(0, 1, 0);

export class ThrownAxes {
  readonly mesh: InstancedMesh;
  private readonly axes: Axe[] = [];

  constructor(parent: Object3D) {
    this.mesh = new InstancedMesh(
      axeGeometry(),
      new MeshBasicMaterial({ color: ABILITY_COLOUR.heroicThrow, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false }),
      MAX,
    );
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    parent.add(this.mesh);
  }

  /** How many are in the air. */
  get flying(): number {
    return this.axes.length;
  }

  /** Throw one from `from` at `target`. */
  throw(from: Vector3, target: Enemy): void {
    if (this.axes.length >= MAX) this.axes.shift();
    _to.copy(target.position).setY(target.position.y + CHEST).sub(from).normalize();
    this.axes.push({ pos: from.clone(), dir: _to.clone(), from: from.clone(), target, left: CONFIG.classes.warrior.abilities.heroicThrow.range, spin: 0 });
  }

  /** Fly each a frame; `land` is called for each that reaches its enemy, at the point it struck, flying along `dir`. */
  update(dt: number, land: (enemy: Enemy, at: Vector3, dir: Vector3, from: Vector3) => void): void {
    const speed = CONFIG.classes.warrior.abilities.heroicThrow.speed;
    for (let i = this.axes.length - 1; i >= 0; i--) {
      const a = this.axes[i];
      a.spin += SPIN * dt;
      const t = a.target;
      if (t && !t.hittable) a.target = null;
      if (a.target) {
        // Homing on its chest, wherever it's got to.
        _to.copy(a.target.position).setY(a.target.position.y + CHEST).sub(a.pos);
        const d = _to.length();
        if (d <= a.target.def.radius + REACH + speed * dt) {
          this.axes.splice(i, 1);
          land(a.target, a.pos.addScaledVector(_to, Math.max(0, d - a.target.def.radius) / Math.max(d, 1e-6)), a.dir, a.from);
          continue;
        }
        a.dir.copy(_to).divideScalar(d);
      }
      a.pos.addScaledVector(a.dir, speed * dt);
      a.left -= speed * dt;
      if (a.left <= 0) this.axes.splice(i, 1);
    }
    this.render();
  }

  clear(): void {
    this.axes.length = 0;
    this.mesh.count = 0;
  }

  private render(): void {
    this.axes.forEach((a, i) => {
      // The head leads along the flight, the handle upright, turning end over end about the side axis.
      _q.setFromUnitVectors(_x, a.dir);
      _spin.setFromAxisAngle(_to.crossVectors(a.dir, _y).normalize().lengthSq() > 0 ? _to : _x, -a.spin);
      _q.premultiply(_spin);
      this.mesh.setMatrixAt(i, _m.compose(a.pos, _q, _one));
    });
    this.mesh.count = this.axes.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
