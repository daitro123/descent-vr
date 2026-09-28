import type { Camera, MeshBasicMaterial, WebGLRenderer } from 'three';
import { TextPanel } from './panel';

/** Seconds between redraws: often enough to watch, rarely enough to read. */
const EVERY = 0.5;

/**
 * `?perf`: frame rate, draw calls, triangles and shader programs over
 * whichever game runs, head-locked low on the left of view so it reads the
 * same on the page and in the headset. Draw calls and triangles are the last
 * frame's, both eyes together in VR; the readout's own panel is one of each
 * per eye, and one program.
 */
export class PerfReadout {
  private readonly panel = new TextPanel(0.22);
  private frames = 0;
  private time = 0;
  private fps = 0;

  constructor(
    private readonly renderer: WebGLRenderer,
    camera: Camera,
  ) {
    const { mesh } = this.panel;
    const material = mesh.material as MeshBasicMaterial;
    // Over everything, never fogged or hidden behind a wall.
    material.depthTest = false;
    material.fog = false;
    mesh.renderOrder = 30;
    mesh.position.set(-0.17, -0.13, -0.5);
    camera.add(mesh);
  }

  /** Call after each frame's render, with the frame's real (unclamped) seconds. */
  update(dt: number): void {
    this.frames++;
    this.time += dt;
    if (this.time < EVERY) return;
    this.fps = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
    const { render, programs } = this.renderer.info;
    this.panel.draw([
      'perf',
      `fps        ${this.fps.toFixed(0)}`,
      `draw calls ${render.calls}`,
      `triangles  ${(render.triangles / 1000).toFixed(1)}k`,
      `programs   ${programs?.length ?? 0}`,
    ]);
  }
}
