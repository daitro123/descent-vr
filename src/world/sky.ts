import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  type Camera,
  Color,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { mulberry32 } from '../maps/forest/noise';
import type { Atmosphere } from './atmosphere';

// The World's sky: a gradient dome with the sun's disc, and a ring of blocky
// low-poly clouds that drift round it. Unlit and unfogged, drawn first without
// writing depth, and kept centred on the viewer so it always reads as
// infinitely far away. The dome's colours are uniforms, so a zone's
// atmosphere recolours it without touching a program.
//
// Low down the dome is pure haze, the fog's colour: ridges that the far plane
// cuts off are already fully fogged by then, so nothing pops against a bluer
// sky as you move.

const CLOUD = 0xf6f4ee;
const CLOUD_SHADE = 0xd8dce4;
const _cam = new Vector3();

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 haze;
uniform vec3 sunColor;
uniform vec3 sunDirection;
uniform float hazeTop;
uniform float hazeBlend;
uniform float sunDisc;
uniform float sunHalo;
varying vec3 vDir;
void main() {
  vec3 d = normalize( vDir );
  vec3 c = mix( horizon, zenith, pow( clamp( ( d.y - 0.02 ) / 0.7, 0.0, 1.0 ), 0.7 ) );
  c = mix( haze, c, smoothstep( hazeTop, hazeTop + hazeBlend, d.y ) );
  float s = dot( d, sunDirection );
  if ( s > sunHalo ) c = mix( horizon, sunColor, 0.25 );
  if ( s > sunDisc ) c = sunColor;
  gl_FragColor = vec4( c, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function paint(g: BufferGeometry, colorOf: (ny: number) => Color): BufferGeometry {
  const nrm = g.getAttribute('normal');
  const col = new Float32Array(nrm.count * 3);
  for (let i = 0; i < nrm.count; i++) {
    const c = colorOf(nrm.getY(i));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
}

export interface Sky {
  readonly root: Group;
  /** Recolour the dome for an atmosphere. */
  apply(atmosphere: Atmosphere): void;
  update(dt: number, camera: Camera): void;
}

export function buildSky(sunDirection: Vector3): Sky {
  const { radius, hazeTop, hazeBlend, sunDiscDeg, sunHaloDeg } = CONFIG.world.sky;
  const cos = (deg: number) => Math.cos((deg * Math.PI) / 180);
  const uniforms = {
    zenith: { value: new Color() },
    horizon: { value: new Color() },
    haze: { value: new Color() },
    sunColor: { value: new Color() },
    sunDirection: { value: sunDirection.clone().normalize() },
    hazeTop: { value: hazeTop },
    hazeBlend: { value: hazeBlend },
    sunDisc: { value: cos(sunDiscDeg) },
    sunHalo: { value: cos(sunHaloDeg) },
  };
  const dome = new Mesh(
    new SphereGeometry(radius, 32, 16),
    new ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, depthWrite: false, side: BackSide }),
  );
  dome.name = 'sky-dome';
  dome.renderOrder = -10;
  dome.frustumCulled = false;

  // Clouds: clumps of flattened boxes, lit from above by colour alone.
  const rand = mulberry32(17);
  const puffs: BufferGeometry[] = [];
  const white = new Color(CLOUD);
  const shade = new Color(CLOUD_SHADE);
  const tmp = new Color();
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rand() * 0.3;
    const elev = 0.1 + rand() * 0.28;
    const dist = radius - 20;
    const centre = new Vector3(Math.cos(a) * Math.cos(elev), Math.sin(elev), Math.sin(a) * Math.cos(elev)).multiplyScalar(dist);
    const face = new Matrix4().lookAt(centre, new Vector3(0, centre.y, 0), new Vector3(0, 1, 0)).setPosition(centre);
    const n = 3 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const w = 8 + rand() * 12;
      const h = 2.5 + rand() * 3;
      const box = new BoxGeometry(w, h, 5 + rand() * 6);
      box.translate((k - n / 2) * 7 + rand() * 3, (rand() - 0.3) * 2.5, (rand() - 0.5) * 4);
      box.applyMatrix4(face);
      puffs.push(paint(box.toNonIndexed(), (ny) => tmp.copy(shade).lerp(white, ny > 0.5 ? 1 : ny < -0.5 ? 0 : 0.6)));
    }
  }
  const clouds = new Mesh(
    mergeGeometries(puffs),
    new MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false }),
  );
  clouds.name = 'sky-clouds';
  clouds.renderOrder = -9;
  clouds.frustumCulled = false;

  const root = new Group();
  root.name = 'sky';
  root.add(dome, clouds);
  return {
    root,
    apply(atmosphere) {
      const { sky } = atmosphere;
      uniforms.zenith.value.setHex(sky.zenith);
      uniforms.horizon.value.setHex(sky.horizon);
      uniforms.haze.value.setHex(sky.haze);
      uniforms.sunColor.value.setHex(sky.sun);
    },
    update(dt, camera) {
      camera.getWorldPosition(_cam);
      root.position.copy(_cam);
      clouds.rotation.y += dt * 0.004;
    },
  };
}
