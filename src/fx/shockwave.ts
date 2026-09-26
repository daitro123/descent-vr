import { AdditiveBlending, DoubleSide, Mesh, MeshBasicMaterial, type Object3D, RingGeometry, type Vector3 } from 'three';

const geo = new RingGeometry(0.85, 1, 32);

interface Ring {
  mesh: Mesh;
  mat: MeshBasicMaterial;
  age: number;
  radius: number;
  time: number;
}

/** Expanding floor rings: War Cry, ground slams, the brute's maul landing. A small fixed pool. */
export class Shockwaves {
  private readonly rings: Ring[] = [];

  constructor(parent: Object3D, size = 4) {
    for (let i = 0; i < size; i++) {
      const mat = new MeshBasicMaterial({
        transparent: true,
        side: DoubleSide,
        blending: AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      parent.add(mesh);
      this.rings.push({ mesh, mat, age: Infinity, radius: 1, time: 0.4 });
    }
  }

  trigger(at: Vector3, radius: number, color: number, time = 0.4): void {
    const ring = this.rings.reduce((a, b) => (b.age > a.age ? b : a));
    ring.mesh.position.set(at.x, 0.04, at.z);
    ring.mat.color.setHex(color);
    ring.age = 0;
    ring.radius = radius;
    ring.time = time;
    ring.mesh.visible = true;
  }

  update(dt: number): void {
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.age += dt;
      const k = r.age / r.time;
      const s = 0.2 + (1 - (1 - k) * (1 - k)) * r.radius;
      r.mesh.scale.set(s, s, 1);
      r.mat.opacity = 1 - k;
      if (k >= 1) r.mesh.visible = false;
    }
  }
}
