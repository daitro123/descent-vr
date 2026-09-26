import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  type Material,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  Quaternion,
  Euler,
  Vector3,
} from 'three';

interface Particle {
  pos: Vector3;
  vel: Vector3;
  spin: Vector3;
  rot: Euler;
  life: number;
  maxLife: number;
  size: number;
  gravity: number;
  drag: number;
  bounce: boolean;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _c = new Color();

/**
 * A fixed pool of tiny cubes drawn as one InstancedMesh: one draw call per
 * pool however many are alive. Cubes, not sprites, so they read as pixels in
 * stereo instead of flat cards.
 */
class Pool {
  readonly mesh: InstancedMesh;
  private readonly items: Particle[] = [];

  constructor(
    private readonly max: number,
    material: Material,
  ) {
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), material, max);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, _c.set(1, 1, 1)); // allocate the colour buffer
  }

  spawn(p: Omit<Particle, 'rot' | 'maxLife'>, color: Color): void {
    // Full pool: recycle the oldest.
    const i = this.items.length < this.max ? this.items.length : 0;
    const item = { ...p, rot: new Euler(Math.random() * 3, Math.random() * 3, 0), maxLife: p.life };
    if (i === this.items.length) this.items.push(item);
    else this.items[i] = item;
    this.mesh.setColorAt(i, color);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    let n = 0;
    for (let i = 0; i < this.items.length; i++) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.bounce && p.pos.y < p.size / 2) {
        p.pos.y = p.size / 2;
        p.vel.y = Math.abs(p.vel.y) * 0.35;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
        p.spin.multiplyScalar(0.5);
      }
      p.rot.x += p.spin.x * dt;
      p.rot.y += p.spin.y * dt;
      p.rot.z += p.spin.z * dt;
      const k = p.bounce ? Math.min(1, p.life * 2) : p.life / p.maxLife;
      _q.setFromEuler(p.rot);
      _m.compose(p.pos, _q, _s.setScalar(p.size * k));
      if (n !== i) {
        this.items[n] = p;
        this.mesh.getColorAt(i, _c);
        this.mesh.setColorAt(n, _c);
      }
      this.mesh.setMatrixAt(n, _m);
      n++;
    }
    this.items.length = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.items.length = 0;
    this.mesh.count = 0;
  }
}

export type BurstKind = 'sparks' | 'blood' | 'bone' | 'dust' | 'embers' | 'magic';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Particles {
  private readonly glow = new Pool(
    320,
    new MeshBasicMaterial({ blending: AdditiveBlending, transparent: true, depthWrite: false }),
  );
  private readonly solid = new Pool(200, new MeshLambertMaterial({ flatShading: true }));

  constructor(parent: Object3D) {
    parent.add(this.glow.mesh, this.solid.mesh);
  }

  /**
   * sparks: metal on metal. blood: dark ichor (the undead don't bleed red).
   * bone: chips that bounce. dust: slow, drifting. embers: rising sparks.
   * magic: cold blue motes (the Warden, summons).
   */
  burst(kind: BurstKind, at: Vector3, count: number, dir?: Vector3, color?: number): void {
    for (let i = 0; i < count; i++) {
      const v = new Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1));
      switch (kind) {
        case 'sparks':
          v.multiplyScalar(rnd(1.5, 4));
          if (dir) v.addScaledVector(dir, 2.5);
          v.y += 1;
          this.glow.spawn(
            { pos: at.clone(), vel: v, spin: new Vector3(), life: rnd(0.15, 0.4), size: rnd(0.012, 0.025), gravity: 9, drag: 1.5, bounce: false },
            _c.setHex(color ?? 0xffc860),
          );
          break;
        case 'embers':
          v.multiplyScalar(0.3).setY(rnd(0.6, 1.5));
          this.glow.spawn(
            { pos: at.clone(), vel: v, spin: new Vector3(), life: rnd(0.6, 1.4), size: rnd(0.012, 0.022), gravity: -0.3, drag: 1, bounce: false },
            _c.setHex(color ?? 0xff7a20),
          );
          break;
        case 'magic':
          v.multiplyScalar(rnd(0.3, 1.2));
          v.y = Math.abs(v.y) + 0.4;
          this.glow.spawn(
            { pos: at.clone(), vel: v, spin: new Vector3(), life: rnd(0.5, 1.1), size: rnd(0.02, 0.04), gravity: -0.5, drag: 1.2, bounce: false },
            _c.setHex(color ?? 0x5ab8ff),
          );
          break;
        case 'blood':
          v.multiplyScalar(rnd(0.8, 2.2));
          if (dir) v.addScaledVector(dir, 1.5);
          this.solid.spawn(
            { pos: at.clone(), vel: v, spin: new Vector3(rnd(-9, 9), rnd(-9, 9), 0), life: rnd(0.5, 0.9), size: rnd(0.02, 0.04), gravity: 9, drag: 0.5, bounce: true },
            _c.setHex(color ?? 0x3a2a18),
          );
          break;
        case 'bone':
          v.multiplyScalar(rnd(1, 2.6));
          if (dir) v.addScaledVector(dir, 1.8);
          v.y = Math.abs(v.y) + 0.8;
          this.solid.spawn(
            { pos: at.clone(), vel: v, spin: new Vector3(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)), life: rnd(0.9, 1.6), size: rnd(0.025, 0.05), gravity: 9.8, drag: 0.3, bounce: true },
            _c.setHex(color ?? 0xd9cfb0),
          );
          break;
        case 'dust':
          v.multiplyScalar(rnd(0.4, 1.4)).setY(rnd(0.2, 0.9));
          this.solid.spawn(
            { pos: at.clone().add(new Vector3(rnd(-0.3, 0.3), 0.05, rnd(-0.3, 0.3))), vel: v, spin: new Vector3(rnd(-3, 3), rnd(-3, 3), 0), life: rnd(0.5, 1.2), size: rnd(0.04, 0.09), gravity: 1.2, drag: 2.5, bounce: false },
            _c.setHex(color ?? 0x6a5e52),
          );
          break;
      }
    }
  }

  update(dt: number): void {
    this.glow.update(dt);
    this.solid.update(dt);
  }

  clear(): void {
    this.glow.clear();
    this.solid.clear();
  }
}
