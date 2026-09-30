import {
  type Camera,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import { CONFIG } from '../config';

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _cam = new Vector3();

/** Where smoke rises: a chimney's top, or a fire. */
export interface PlumeSource {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** A fire's smoke rises lower and thinner, and darker. */
  readonly fire: boolean;
}

let texture: CanvasTexture | null = null;

/** A soft round puff, drawn once. Null outside a browser (unit tests build zones in Node). */
function puffTexture(): CanvasTexture | null {
  if (texture) return texture;
  if (typeof document === 'undefined') return null;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  texture = new CanvasTexture(canvas);
  return texture;
}

/**
 * How far through its life a puff is, 0 to 1, how high it has risen and how
 * far the breeze has carried it (m), how wide it is (m), and how thick (its
 * opacity). Pure, for `Smoke` and its tests.
 */
export function puffAt(t: number, fire: boolean): { rise: number; drift: number; size: number; alpha: number } {
  const S = CONFIG.smoke;
  const kind = fire ? S.fire : S.chimney;
  const fadeIn = Math.min(1, t / S.fadeIn);
  return {
    rise: kind.rise * t,
    drift: S.drift * t * t,
    size: kind.size[0] + (kind.size[1] - kind.size[0]) * Math.sqrt(t),
    alpha: S.opacity * fadeIn * (1 - t) ** 1.2,
  };
}

/**
 * Smoke rising over the zone: every plume's soft puffs in one instanced mesh,
 * one draw call, each puff turned to face you, rising, widening, drifting on
 * the breeze and thinning away, then starting again at its chimney. Kept thin,
 * and few, for the overdraw.
 */
export class Smoke {
  readonly mesh: InstancedMesh;
  private readonly fade: InstancedBufferAttribute;
  private readonly wind: Vector3;

  constructor(private readonly plumes: readonly PlumeSource[]) {
    const S = CONFIG.smoke;
    const count = plumes.length * S.puffs;
    const geometry = new PlaneGeometry(1, 1);
    this.fade = new InstancedBufferAttribute(new Float32Array(count), 1);
    this.fade.setUsage(DynamicDrawUsage);
    geometry.setAttribute('fade', this.fade);
    const material = new MeshBasicMaterial({ map: puffTexture(), transparent: true, depthWrite: false });
    // Each puff's own opacity, as it thickens and thins.
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float fade;\nvarying float vFade;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = fade;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFade;')
        .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\ndiffuseColor.a *= vFade;');
    };
    material.customProgramCacheKey = () => 'descent-smoke';
    this.mesh = new InstancedMesh(geometry, material, count);
    this.mesh.name = 'smoke';
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    const color = new Color();
    plumes.forEach((p, i) => {
      color.set(p.fire ? S.fire.color : S.chimney.color);
      for (let k = 0; k < S.puffs; k++) this.mesh.setColorAt(i * S.puffs + k, color);
    });
    this.wind = new Vector3(S.wind[0], 0, S.wind[1]).normalize();
  }

  /** How many puffs it draws: every plume's. */
  get count(): number {
    return this.mesh.count;
  }

  /** Rise, drift and thin, each puff facing the camera. */
  update(time: number, camera: Camera): void {
    const S = CONFIG.smoke;
    camera.getWorldPosition(_cam);
    this.plumes.forEach((p, i) => {
      // Each plume's puffs are spread through its life, and each plume starts at its own point in it.
      const offset = (i * 0.37) % 1;
      for (let k = 0; k < S.puffs; k++) {
        const j = i * S.puffs + k;
        const t = (time / S.life + k / S.puffs + offset) % 1;
        const puff = puffAt(t, p.fire);
        const sway = Math.sin(time * 0.7 + j * 1.9) * S.sway * t;
        _p.set(p.x + this.wind.x * puff.drift - this.wind.z * sway, p.y + puff.rise, p.z + this.wind.z * puff.drift + this.wind.x * sway);
        _m.lookAt(_cam, _p, camera.up);
        _q.setFromRotationMatrix(_m);
        _m.compose(_p, _q, _s.setScalar(puff.size));
        this.mesh.setMatrixAt(j, _m);
        this.fade.setX(j, puff.alpha);
      }
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.fade.needsUpdate = true;
  }
}
