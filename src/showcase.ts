import { Group, type PerspectiveCamera } from 'three';
import { IDLE } from './enemies/poses';
import { buildCharacter, type EnemyKind } from './models/characters';
import { createModelMaterial } from './models/materials';
import type { Rig } from './models/rig';

// Title-screen bestiary: one of each enemy standing in the arena, so the
// desktop page shows the art and models can be reviewed without a headset.
// `?showcase` pins the camera on the lineup instead of the idle orbit.

export interface Showcase {
  root: Group;
  rigs: Partial<Record<EnemyKind, Rig>>;
}

export function buildShowcase(): Showcase {
  const root = new Group();
  const rigs: Showcase['rigs'] = {};
  const lineup: [EnemyKind, number, number][] = [
    ['archer', -2.1, -3.2],
    ['grunt', -0.9, -3.0],
    ['warden', 0.5, -3.8],
    ['brute', 2.1, -3.2],
  ];
  for (const [kind, x, z] of lineup) {
    const { rig } = buildCharacter(kind, { material: createModelMaterial() });
    rig.apply(IDLE[kind]);
    rig.mesh.position.set(x, 0, z);
    rig.mesh.rotation.y = -x * 0.12;
    root.add(rig.mesh);
    rigs[kind] = rig;
  }
  return { root, rigs };
}

export function pinShowcaseCamera(camera: PerspectiveCamera): void {
  camera.position.set(0, 1.5, 0.6);
  camera.lookAt(0, 1.1, -3.2);
}
