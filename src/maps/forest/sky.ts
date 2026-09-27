import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  type Camera,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './noise';
import { SKY } from './palette';

// A gradient dome with a sun disc, and a ring of blocky low-poly clouds that
// drift round it. Unlit and unfogged, drawn first without writing depth, and
// kept centred on the viewer so it always reads as infinitely far away.

const RADIUS = 180;
const _cam = new Vector3();

function paint(g: BufferGeometry, colorOf: (x: number, y: number, z: number, ny: number) => Color): BufferGeometry {
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = colorOf(pos.getX(i), pos.getY(i), pos.getZ(i), nrm.getY(i));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
}

export function buildSky(sunDirection: Vector3): { root: Group; update(dt: number, camera: Camera): void } {
  const zenith = new Color(SKY.zenith);
  const horizon = new Color(SKY.horizon);
  const haze = new Color(SKY.haze);
  const tmp = new Color();

  const dome = paint(new SphereGeometry(RADIUS, 32, 16), (_x, y) => {
    const e = y / RADIUS;
    if (e < 0.02) return tmp.copy(haze);
    return tmp.copy(horizon).lerp(zenith, Math.pow(Math.min(1, (e - 0.02) / 0.7), 0.7));
  });
  const place = (g: BufferGeometry, dist: number) => {
    const at = sunDirection.clone().multiplyScalar(dist);
    g.applyMatrix4(new Matrix4().lookAt(at, new Vector3(), new Vector3(0, 1, 0)).setPosition(at));
    return g;
  };
  const halo = paint(place(new CircleGeometry(12, 16), RADIUS - 6), () => tmp.copy(horizon).lerp(new Color(SKY.sun), 0.25));
  const sun = paint(place(new CircleGeometry(6, 12), RADIUS - 8), () => tmp.set(SKY.sun));
  const skyMesh = new Mesh(
    mergeGeometries([dome, halo, sun].map((g) => g.toNonIndexed())),
    new MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false, side: DoubleSide }),
  );
  skyMesh.renderOrder = -10;
  skyMesh.frustumCulled = false;

  // Clouds: clumps of flattened boxes, lit from above by colour alone.
  const rand = mulberry32(17);
  const puffs: BufferGeometry[] = [];
  const white = new Color(SKY.cloud);
  const shade = new Color(SKY.cloudShade);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rand() * 0.3;
    const elev = 0.1 + rand() * 0.28;
    const dist = RADIUS - 20;
    const centre = new Vector3(Math.cos(a) * Math.cos(elev), Math.sin(elev), Math.sin(a) * Math.cos(elev)).multiplyScalar(dist);
    const face = new Matrix4().lookAt(centre, new Vector3(0, centre.y, 0), new Vector3(0, 1, 0)).setPosition(centre);
    const n = 3 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const w = 8 + rand() * 12;
      const h = 2.5 + rand() * 3;
      const box = new BoxGeometry(w, h, 5 + rand() * 6);
      box.translate((k - n / 2) * 7 + rand() * 3, (rand() - 0.3) * 2.5, (rand() - 0.5) * 4);
      box.applyMatrix4(face);
      puffs.push(paint(box.toNonIndexed(), (_x, _y, _z, ny) => tmp.copy(shade).lerp(white, ny > 0.5 ? 1 : ny < -0.5 ? 0 : 0.6)));
    }
  }
  const clouds = new Mesh(
    mergeGeometries(puffs),
    new MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false }),
  );
  clouds.renderOrder = -9;
  clouds.frustumCulled = false;

  const root = new Group();
  root.name = 'forest-sky';
  root.add(skyMesh, clouds);
  return {
    root,
    update(dt, camera) {
      camera.getWorldPosition(_cam);
      root.position.copy(_cam);
      clouds.rotation.y += dt * 0.004;
    },
  };
}
