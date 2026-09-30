import { BoxGeometry, type BufferGeometry, DynamicDrawUsage, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Enemy } from '../enemies/enemy';

const MAX = 16;
/** Stalks round the feet. */
const STALKS = 7;
const UP = new Vector3(0, 1, 0);
const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();

/**
 * One coil of vines round a pair of feet, for a ring of radius 1 (scaled to
 * each body's radius across; up, in metres): a ring of runners on the ground
 * and stalks leaning in to clutch the legs, each with a leaf. 7 × 3 boxes,
 * 252 triangles.
 */
function coil(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < STALKS; i++) {
    const a = (i / STALKS) * Math.PI * 2 + (i % 2) * 0.2;
    const h = 0.26 + ((i * 37) % 7) * 0.035;
    const x = Math.sin(a);
    const z = Math.cos(a);
    // A runner along the ground to the next stalk.
    const mid = ((i + 0.5) / STALKS) * Math.PI * 2;
    const runner = new BoxGeometry(0.1, 0.03, 2 * Math.sin(Math.PI / STALKS) * 1.05);
    runner.applyMatrix4(new Matrix4().makeRotationY(mid + Math.PI / 2));
    runner.translate(Math.sin(mid), 0.015, Math.cos(mid));
    parts.push(runner);
    // The stalk, leaning in towards the legs.
    const stalk = new BoxGeometry(0.1, h, 0.1);
    stalk.translate(0, h / 2, 0);
    stalk.applyMatrix4(new Matrix4().makeRotationAxis(new Vector3(z, 0, -x), -0.45));
    stalk.translate(x, 0, z);
    parts.push(stalk);
    // A leaf at its top.
    const leaf = new BoxGeometry(0.28, 0.02, 0.14);
    leaf.applyMatrix4(new Matrix4().makeRotationY(a));
    leaf.translate(x * (1 - Math.sin(0.45) * h), Math.cos(0.45) * h, z * (1 - Math.sin(0.45) * h));
    parts.push(leaf);
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * The vines at every rooted enemy's feet, in one draw call: they grow in as
 * a root takes hold and wither as it ends (`Enemy.vineGrowth`). Whoever steps
 * the enemies (the arena, the Adventure) places them each frame after.
 */
export class Vines {
  readonly mesh: InstancedMesh;

  constructor() {
    this.mesh = new InstancedMesh(coil(), new MeshLambertMaterial({ color: 0x3f6a26, flatShading: true }), MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  /** How many are drawn this frame. */
  get count(): number {
    return this.mesh.count;
  }

  /** This frame's vines: round the feet of each rooted enemy that's drawn. */
  place(enemies: readonly Enemy[]): void {
    let n = 0;
    for (const e of enemies) {
      const grown = e.vineGrowth;
      if (grown <= 0 || n >= MAX) continue;
      // Not drawn (outdoors behind a shut door, or in a part of the mine that isn't): no vines either.
      if (!e.root.visible || e.root.parent?.visible === false) continue;
      const r = e.def.radius * (0.7 + 0.3 * grown);
      // Each body's coil turned its own way, so a rooted crowd's don't match.
      _q.setFromAxisAngle(UP, (e.position.x * 7.1 + e.position.z * 3.7) % (Math.PI * 2));
      _m.compose(e.position, _q, _s.set(r, grown, r));
      this.mesh.setMatrixAt(n++, _m);
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
