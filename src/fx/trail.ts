import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Vector3,
} from 'three';

const N = 14; // samples kept (≈0.2 s at 72 Hz)

/**
 * A ribbon behind the blade while it's moving fast enough to hurt: shows the
 * arc you just cut, which is most of what makes a swing feel like a swing.
 */
export class SwordTrail {
  private readonly geo = new BufferGeometry();
  private readonly positions = new Float32Array(N * 2 * 3);
  private readonly colors = new Float32Array(N * 2 * 4);
  private readonly bases: Vector3[] = [];
  private readonly tips: Vector3[] = [];
  private readonly mesh: Mesh;
  private readonly tint = [0.5, 0.65, 1];
  private fade = 0;

  constructor(parent: Object3D) {
    const index: number[] = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(index);
    this.geo.setAttribute('position', new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage));
    this.geo.setAttribute('color', new BufferAttribute(this.colors, 4).setUsage(DynamicDrawUsage));
    this.mesh = new Mesh(
      this.geo,
      new MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        fog: false,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  /** Feed this frame's blade (world space). `hot` = fast enough to deal damage. */
  update(dt: number, base: Vector3, tip: Vector3, hot: boolean, frenzy: boolean): void {
    this.fade = hot ? 1 : Math.max(0, this.fade - dt * 6);
    if (this.fade <= 0) {
      this.mesh.visible = false;
      this.bases.length = this.tips.length = 0;
      return;
    }
    // Trail the upper two-thirds of the blade: the part that cuts.
    this.bases.unshift(base.clone().lerp(tip, 0.35));
    this.tips.unshift(tip.clone());
    if (this.bases.length > N) {
      this.bases.pop();
      this.tips.pop();
    }
    const [r, g, b] = frenzy ? [1, 0.45, 0.1] : this.tint;
    for (let i = 0; i < N; i++) {
      const bi = this.bases[Math.min(i, this.bases.length - 1)];
      const ti = this.tips[Math.min(i, this.tips.length - 1)];
      this.positions.set([bi.x, bi.y, bi.z, ti.x, ti.y, ti.z], i * 6);
      const a = (1 - i / (N - 1)) * 0.55 * this.fade;
      this.colors.set([r, g, b, a * 0.2, r, g, b, a], i * 8);
    }
    this.geo.getAttribute('position').needsUpdate = true;
    this.geo.getAttribute('color').needsUpdate = true;
    this.mesh.visible = this.bases.length > 1;
  }
}
