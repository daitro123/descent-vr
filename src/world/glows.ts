import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  type Camera,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';

const MAX = 16;
const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _cam = new Vector3();

let texture: CanvasTexture | null = null;

/** Soft round falloff, drawn once. */
function glowTexture(): CanvasTexture {
  if (texture) return texture;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  texture = new CanvasTexture(canvas);
  return texture;
}

/**
 * Additive glow billboards for torches and braziers: fake light for the
 * flames that don't get a real PointLight. All of them are one draw call.
 */
export class Glows {
  readonly mesh: InstancedMesh;
  private readonly items: { pos: Vector3; size: number; seed: number }[] = [];

  constructor() {
    const mat = new MeshBasicMaterial({
      map: glowTexture(),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new InstancedMesh(new PlaneGeometry(1, 1), mat, MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  add(x: number, y: number, z: number, size: number, color: number): void {
    const i = this.items.length;
    if (i >= MAX) return;
    this.items.push({ pos: new Vector3(x, y, z), size, seed: i * 1.7 });
    this.mesh.setColorAt(i, new Color(color).multiplyScalar(0.55));
    this.mesh.count = this.items.length;
  }

  /** Face the camera and breathe with the flame. */
  update(time: number, camera: Camera): void {
    camera.getWorldPosition(_cam);
    for (let i = 0; i < this.items.length; i++) {
      const g = this.items[i];
      _m.lookAt(_cam, g.pos, camera.up);
      _q.setFromRotationMatrix(_m);
      const t = time * 8 + g.seed;
      const k = g.size * (0.9 + 0.08 * Math.sin(t) + 0.05 * Math.sin(t * 2.3));
      _p.copy(g.pos);
      _m.compose(_p, _q, _s.set(k, k, k));
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
