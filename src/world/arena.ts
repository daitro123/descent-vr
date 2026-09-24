import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  PointLight,
  Vector3,
} from 'three';
import { CONFIG } from '../config';
import { pushOutOfCircle } from '../combat/geometry';
import { brickWallTexture, stoneFloorTexture } from './pixelTexture';

/** A square dungeon room with pillars. Owns the static collision shapes. */
export class Arena {
  readonly root = new Group();
  private readonly half = CONFIG.arena.halfSize;

  constructor() {
    const { halfSize, wallHeight, pillars } = CONFIG.arena;
    const size = halfSize * 2;

    const floor = new Mesh(
      new PlaneGeometry(size, size),
      new MeshLambertMaterial({ map: stoneFloorTexture(size / 2) }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.root.add(floor);

    const wallMat = new MeshLambertMaterial({ map: brickWallTexture(size / 2, wallHeight / 2) });
    for (let i = 0; i < 4; i++) {
      const wall = new Mesh(new PlaneGeometry(size, wallHeight), wallMat);
      const angle = (i * Math.PI) / 2;
      wall.position.set(Math.sin(angle) * -halfSize, wallHeight / 2, Math.cos(angle) * -halfSize);
      wall.rotation.y = angle;
      this.root.add(wall);
    }

    const pillarMat = new MeshLambertMaterial({ color: 0x77706a });
    const torchMat = new MeshBasicMaterial({ color: 0xffaa44 });
    for (const p of pillars) {
      const pillar = new Mesh(new CylinderGeometry(p.r, p.r, wallHeight, 8), pillarMat);
      pillar.position.set(p.x, wallHeight / 2, p.z);
      this.root.add(pillar);

      // Torch on the side of the pillar facing the room centre.
      const toCentre = new Vector3(-p.x, 0, -p.z).normalize();
      const torchPos = new Vector3(p.x, 2.1, p.z).addScaledVector(toCentre, p.r + 0.06);
      const torch = new Mesh(new BoxGeometry(0.08, 0.16, 0.08), torchMat);
      torch.position.copy(torchPos);
      this.root.add(torch);
      const light = new PointLight(0xff9a3c, 6, 9, 1.6);
      light.position.copy(torchPos).addScaledVector(toCentre, 0.2);
      this.root.add(light);
    }

    this.root.add(new HemisphereLight(0x8a8fb0, 0x2a2018, 1.1));
  }

  /**
   * Push a point on the floor plane out of walls and pillars.
   * `radius` is the body radius of whatever is being resolved.
   */
  resolve(p: Vector3, radius: number): boolean {
    let moved = false;
    const limit = this.half - radius;
    if (p.x > limit) (p.x = limit), (moved = true);
    if (p.x < -limit) (p.x = -limit), (moved = true);
    if (p.z > limit) (p.z = limit), (moved = true);
    if (p.z < -limit) (p.z = -limit), (moved = true);
    for (const pillar of CONFIG.arena.pillars) {
      if (pushOutOfCircle(p, pillar.x, pillar.z, pillar.r + radius)) moved = true;
    }
    return moved;
  }
}
