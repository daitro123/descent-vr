import { type BufferGeometry, Color, DynamicDrawUsage, InstancedMesh, Matrix4, type Object3D, Quaternion, Vector3 } from 'three';
import { CONFIG } from '../config';
import type { Enemy } from '../enemies/enemy';
import { ModelBuilder } from '../models/kit';
import { sharedModelMaterial } from '../models/materials';
import { PAL } from '../models/palette';

// Snare Trap's traps (.scratch/abilities/spec.md, "Abilities"; the ranger's
// ticket, issues/12): a trap drops at your feet and lies there until its time
// runs out; the first enemy whose body reaches over it is rooted
// (`Enemy.afflict`, which does no damage and doesn't pull its camp), and the
// trap is gone. Explosive Trap's (the Survival tree's tier 3) lie the same
// way and burst when sprung; the kit decides what the burst does. At most a
// few of either lie about at once, the oldest ending when another is laid.
// One instanced mesh for them all, the explosive ones tinted.

/** A trap that roots (Snare Trap's) or bursts (Explosive Trap's). */
export type TrapKind = 'snare' | 'explosive';

/** A trap on the ground. */
export interface Trap {
  readonly kind: TrapKind;
  readonly at: Vector3;
  /** s it lies there before it's gone unsprung. */
  left: number;
  /** s it roots whoever springs it: 0 for one that bursts. */
  readonly root: number;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
/** Each kind's tint: a snare's iron as it is, an explosive one's glowing coal-red. */
const TINT: Readonly<Record<TrapKind, Color>> = { snare: new Color(1, 1, 1), explosive: new Color(1.6, 0.55, 0.3) };

/** An open trap of iron jaws round a wooden plate, 1 m across (scaled to the trap's size): 17 boxes, 204 triangles. */
function trapGeometry(): BufferGeometry {
  const b = new ModelBuilder(11);
  const teeth = 8;
  b.box(0.36, 0.03, 0.36, { at: [0, 0.015, 0], color: PAL.woodDark });
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const x = Math.sin(a) * 0.46;
    const z = Math.cos(a) * 0.46;
    // The ring, a bar per eighth, and a tooth standing in from each.
    b.box(0.07, 0.04, 0.38, { at: [x, 0.02, z], rot: [0, a + Math.PI / 2, 0], color: PAL.ironDark });
    b.box(0.05, 0.16, 0.03, { at: [x * 0.85, 0.09, z * 0.85], rot: [0, a, 0.35], color: PAL.iron });
  }
  return b.build();
}

export class Traps {
  readonly laid: Trap[] = [];
  readonly mesh: InstancedMesh;

  constructor(parent: Object3D | null) {
    const T = CONFIG.ranger.trap;
    this.mesh = new InstancedMesh(trapGeometry(), sharedModelMaterial(), T.alive);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.setColorAt(0, TINT.snare); // allocate the colour buffer
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    parent?.add(this.mesh);
  }

  /**
   * Lay a trap at `at` (on the ground) that lies `lasts` s and roots for
   * `root` s, or (`kind` 'explosive') bursts. The oldest goes if there are too many.
   */
  lay(at: Vector3, root: number, lasts: number, kind: TrapKind = 'snare'): Trap {
    if (this.laid.length >= CONFIG.ranger.trap.alive) this.laid.shift();
    const trap: Trap = { kind, at: at.clone(), left: lasts, root: kind === 'snare' ? root : 0 };
    this.laid.push(trap);
    return trap;
  }

  /**
   * One frame: traps run out, and the first enemy a blow could land on whose
   * body reaches over a trap springs it: a snare roots it for the trap's time
   * (brutes half, the Warden not at all: `afflict`'s rule), an explosive one
   * bursts. `sprung` hears of each, with the seconds it held (0 for a burst).
   */
  update(dt: number, enemies: readonly Enemy[], sprung: (trap: Trap, enemy: Enemy, held: number) => void): void {
    const reach = CONFIG.ranger.trap.radius;
    for (let i = this.laid.length - 1; i >= 0; i--) {
      const trap = this.laid[i];
      trap.left -= dt;
      const enemy = enemies.find((e) => e.hittable && Math.hypot(e.position.x - trap.at.x, e.position.z - trap.at.z) <= reach + e.def.radius);
      if (enemy) {
        this.laid.splice(i, 1);
        sprung(trap, enemy, trap.kind === 'snare' ? enemy.afflict('rooted', trap.root) : 0);
      } else if (trap.left <= 0) this.laid.splice(i, 1);
    }
  }

  render(): void {
    const size = CONFIG.ranger.trap.radius * 2;
    _s.set(size, size, size);
    this.laid.forEach((t, i) => {
      this.mesh.setMatrixAt(i, _m.compose(t.at, _q, _s));
      this.mesh.setColorAt(i, TINT[t.kind]);
    });
    this.mesh.count = this.laid.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.laid.length = 0;
    this.mesh.count = 0;
  }
}
