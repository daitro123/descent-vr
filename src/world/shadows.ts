import type { Enemy } from '../enemies/enemy';
import {
  CanvasTexture,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';

const MAX = 24;
const _m = new Matrix4();
const _q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
const _p = new Vector3();
const _s = new Vector3();

function blobTexture(): CanvasTexture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.4)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

/**
 * Blob shadows under everyone that moves. No shadow maps on Quest (a shadowed
 * point light re-renders the scene six times); a dark disc grounds a figure
 * almost as well, and all of them are one draw call.
 */
export class BlobShadows {
  readonly mesh: InstancedMesh;
  private n = 0;

  constructor() {
    this.mesh = new InstancedMesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      MAX,
    );
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
  }

  begin(): void {
    this.n = 0;
  }

  /** A blob on the ground at (x, y, z). */
  add(x: number, y: number, z: number, radius: number): void {
    if (this.n >= MAX) return;
    _m.compose(_p.set(x, y + 0.012, z), _q, _s.set(radius * 2.4, radius * 2.4, 1));
    this.mesh.setMatrixAt(this.n++, _m);
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** This frame's blobs: one under your feet and one under each enemy, growing as it rises, gone once it has fallen. */
  cast(feet: Vector3, enemies: readonly Enemy[]): void {
    this.begin();
    this.add(feet.x, feet.y, feet.z, 0.26);
    for (const e of enemies) {
      if (e.state === 'dead' && e.stateTime > 1) continue;
      // Not drawn (outdoors behind a shut door, or in a part of the mine that isn't): no blob either.
      if (!e.root.visible || e.root.parent?.visible === false) continue;
      const scale = e.state === 'rising' ? Math.min(1, e.stateTime * 1.5) : 1;
      this.add(e.position.x, e.position.y, e.position.z, e.def.radius * 1.1 * scale);
    }
    this.end();
  }
}
