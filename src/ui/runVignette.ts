import { Mesh, type PerspectiveCamera, RingGeometry, type Scene, ShaderMaterial, type WebGLRenderer } from 'three';
import { CONFIG } from '../config';

const DEG = Math.PI / 180;
/** How far in front of the eyes the ring hangs (inside the near plane's reach, past its 0.05 m). */
const DISTANCE = 0.1;

/** The fade's level a frame on: towards 1 while you run, towards 0 once you don't, over `CONFIG.run.vignette.fade` s. */
export function fadeLevel(level: number, running: boolean, dt: number): number {
  const step = dt / CONFIG.run.vignette.fade;
  return running ? Math.min(1, level + step) : Math.max(0, level - step);
}

/**
 * The run's comfort vignette: the edges of your view darken a little while
 * you run. A flat ring hung in front of the eyes, clear in its middle and
 * darkest at its rim, so it covers only the edges (not the whole-sphere hurt
 * and dash vignette's overdraw): one draw call while it shows, none once it's
 * faded out. Its strength is `CONFIG.run.vignette.strength`; 0 turns it off.
 * Drawn under the tracker and the hurt vignette, and under the death's fade.
 */
export class RunVignette {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private level = 0;

  constructor(camera: PerspectiveCamera) {
    const V = CONFIG.run.vignette;
    const at = (deg: number) => DISTANCE * Math.tan(deg * DEG);
    this.material = new ShaderMaterial({
      uniforms: { uStrength: { value: 0 }, uClear: { value: Math.cos(V.clearDeg * DEG) }, uFull: { value: Math.cos(V.fullDeg * DEG) } },
      vertexShader: /* glsl */ `
        varying vec3 vView;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      // By the angle off the middle of the view: clear inside uClear, darkest past uFull (both as cosines).
      fragmentShader: /* glsl */ `
        uniform float uStrength;
        uniform float uClear;
        uniform float uFull;
        varying vec3 vView;
        void main() {
          float ahead = -normalize(vView).z;
          gl_FragColor = vec4(0.0, 0.0, 0.0, smoothstep(uClear, uFull, ahead) * uStrength);
        }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    // Its hole starts a little inside where the shading does, so its inner edge never shows.
    this.mesh = new Mesh(new RingGeometry(at(V.clearDeg * 0.9), at(V.reachDeg), 32, 1), this.material);
    this.mesh.name = 'run-vignette';
    this.mesh.position.z = -DISTANCE;
    this.mesh.renderOrder = 19;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    camera.add(this.mesh);
  }

  /** Compile its shader now, so the first run doesn't stall a frame. */
  warm(renderer: WebGLRenderer, camera: PerspectiveCamera, scene: Scene): void {
    this.mesh.visible = true;
    renderer.compile(this.mesh, camera, scene);
    this.mesh.visible = false;
  }

  /** Fade in while you run, out once you don't. */
  update(dt: number, running: boolean): void {
    this.level = fadeLevel(this.level, running, dt);
    const strength = this.level * CONFIG.run.vignette.strength;
    this.material.uniforms.uStrength.value = strength;
    this.mesh.visible = strength > 0.001;
  }
}
