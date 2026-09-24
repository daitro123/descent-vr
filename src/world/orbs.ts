import { Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { CONFIG } from '../config';
import { sfx } from '../fx/sfx';
import type { Player } from '../player/player';

interface Orb {
  mesh: Mesh;
  age: number;
}

const geo = new IcosahedronGeometry(0.08, 0);
const mat = new MeshBasicMaterial({ color: 0xff3030 });
const _p = new Vector3();
const _feet = new Vector3();

/** Health orbs dropped by enemies. Grab with either hand, or walk over them. */
export class Orbs {
  readonly root = new Group();
  private readonly orbs: Orb[] = [];

  drop(at: Vector3): void {
    const mesh = new Mesh(geo, mat);
    mesh.position.set(at.x, 1.0, at.z);
    this.root.add(mesh);
    this.orbs.push({ mesh, age: 0 });
  }

  update(dt: number, player: Player): void {
    player.feetPosition(_feet);
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const orb = this.orbs[i];
      orb.age += dt;
      orb.mesh.position.y = 1.0 + Math.sin(orb.age * 3) * 0.05;
      orb.mesh.rotation.y += dt * 2;

      const touched =
        this.handNear(player.input.hands.left.grip, orb.mesh.position) ||
        this.handNear(player.input.hands.right.grip, orb.mesh.position) ||
        Math.hypot(_feet.x - orb.mesh.position.x, _feet.z - orb.mesh.position.z) < CONFIG.orb.walkRadius;

      if (touched && player.alive) {
        player.heal(CONFIG.orb.heal);
        sfx.pickup();
      }
      if (touched || orb.age > CONFIG.orb.lifetime) {
        this.root.remove(orb.mesh);
        this.orbs.splice(i, 1);
      }
    }
  }

  private handNear(grip: Group, p: Vector3): boolean {
    if (!grip.visible) return false;
    return grip.getWorldPosition(_p).distanceTo(p) < CONFIG.orb.pickupRadius;
  }

  clear(): void {
    for (const o of this.orbs) this.root.remove(o.mesh);
    this.orbs.length = 0;
  }
}
