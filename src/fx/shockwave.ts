import { DoubleSide, Mesh, MeshBasicMaterial, type Object3D, RingGeometry, type Vector3 } from 'three';

const geo = new RingGeometry(0.85, 1, 24);

/** Expanding floor ring for the War Cry. */
export class Shockwave {
  private readonly mesh: Mesh;
  private readonly mat = new MeshBasicMaterial({ color: 0xffb020, transparent: true, side: DoubleSide });
  private age = Infinity;

  constructor(parent: Object3D, private readonly radius: number) {
    this.mesh = new Mesh(geo, this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  trigger(at: Vector3): void {
    this.mesh.position.set(at.x, 0.05, at.z);
    this.age = 0;
    this.mesh.visible = true;
  }

  update(dt: number): void {
    if (!this.mesh.visible) return;
    this.age += dt;
    const k = this.age / 0.4;
    const s = 0.2 + k * this.radius;
    this.mesh.scale.set(s, s, 1);
    this.mat.opacity = 1 - k;
    if (k >= 1) this.mesh.visible = false;
  }
}
