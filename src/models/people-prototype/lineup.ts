import { Group, Object3D, Vector3 } from 'three';
import { IDLE } from '../../enemies/poses';
import type { GameMap } from '../../maps/types';
import { buildCharacter, type EnemyKind } from '../characters';
import { createModelMaterial } from '../materials';
import type { Pose } from '../rig';
import { banditsWith, HALES, type Person, VILLAGERS } from './people';

// PROTOTYPE (Friendly characters): `?map=forest&people` stands everyone where
// they'd live in Oakvale, in the zone's own light: the three Hales by the
// signpost, the villagers at the smithy, the well and the inn door, and the
// bandits in three rows (family marks A, B, C) in the farmyard with a row of
// skeletons behind, all facing the road in.

/** A new character's start, a few steps from Marshal Hale (the ?talk prototype's spots). */
export const START = { x: 0.2, z: 1.5 };
export const FARM_ROAD = { x: 47, z: 20 };

const _v = new Vector3();

function stand(map: GameMap, root: Group, rig: { mesh: Object3D; apply(p: Pose): void }, pose: Pose, x: number, z: number, faceX: number, faceZ: number): void {
  rig.apply(pose);
  const g = new Group();
  g.add(rig.mesh);
  g.position.set(x, map.heightAt(x, z), z);
  g.rotation.y = Math.atan2(faceX - x, faceZ - z);
  root.add(g);
}

function place(map: GameMap, root: Group, p: Person, x: number, z: number, faceX: number, faceZ: number): void {
  stand(map, root, p.build(createModelMaterial()).rig, p.stand, x, z, faceX, faceZ);
}

/** A point in a structure's own frame (local x, z) in world metres. */
function local(cx: number, cz: number, yaw: number, lx: number, lz: number): [number, number] {
  _v.set(lx, 0, lz).applyAxisAngle(new Vector3(0, 1, 0), yaw);
  return [cx + _v.x, cz + _v.z];
}

export function buildLineup(map: GameMap): Group {
  const root = new Group();
  root.name = 'people-prototype';
  // Hale A where the ?talk prototype stood them, B and C beside for comparison.
  const haleSpots: [number, number][] = [
    [1.5, 4.8],
    [0.1, 5.5],
    [-1.3, 6.2],
  ];
  HALES.forEach((h, i) => place(map, root, h, ...haleSpots[i], START.x, START.z));

  const [innkeeper, smith, farmer] = VILLAGERS;
  // Smithy at (13, 12) facing the crossroads; the smith behind the anvil.
  const smithyYaw = Math.atan2(3 - 13, 3 - 12);
  const [sx, sz] = local(13, 12, smithyYaw, 0.8, -0.35);
  const [fx, fz] = local(13, 12, smithyYaw, 0.8, 3);
  place(map, root, smith, sx, sz, fx, fz);
  // Inn at (13, -15) facing (2, -3): the innkeeper stands in for the bar at the door.
  const innYaw = Math.atan2(2 - 13, -3 + 15);
  const [ix, iz] = local(13, -15, innYaw, 1.5, 4.9);
  place(map, root, innkeeper, ix, iz, 2, -3);
  place(map, root, farmer, -3.9, -4.1, 0, 0);

  // Farmyard: four groups side by side across the view from the road (marks A, B, C, then the undead).
  const base = new Vector3(53, 0, 30);
  const back = new Vector3(base.x - FARM_ROAD.x, 0, base.z - FARM_ROAD.z).normalize();
  const side = new Vector3(back.z, 0, -back.x);
  const spot = (group: number, i: number) =>
    base
      .clone()
      .addScaledVector(side, (group - 1.5) * 5 + ((i % 2) - 0.5) * 1.6)
      .addScaledVector(back, i < 2 ? 0 : 1.8);
  (['A', 'B', 'C'] as const).forEach((m, g) => {
    banditsWith(m)
      .filter((p) => p.id !== `thug2${m}`)
      .forEach((p, i) => {
        const at = spot(g, i);
        place(map, root, p, at.x, at.z, FARM_ROAD.x, FARM_ROAD.z);
      });
  });
  (['grunt', 'grunt', 'archer', 'brute'] as EnemyKind[]).forEach((kind, i) => {
    const at = spot(3, i);
    const { rig } = buildCharacter(kind, { material: createModelMaterial(), variant: i });
    stand(map, root, rig, IDLE[kind], at.x, at.z, FARM_ROAD.x, FARM_ROAD.z);
  });
  return root;
}
