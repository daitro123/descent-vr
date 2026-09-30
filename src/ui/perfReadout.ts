import type { Camera, MeshBasicMaterial, WebGLRenderer } from 'three';
import type { ChunkCounts } from '../world/streamer';
import { TextPanel } from './panel';

/** Seconds between redraws: often enough to watch, rarely enough to read. */
const EVERY = 0.5;

/** A buffer upload's size in bytes: `data` a size, or an array or its part (`length` elements on from `offset`). */
function bytesOf(data: unknown, offset = 0, length?: number): number {
  if (typeof data === 'number') return data;
  if (ArrayBuffer.isView(data)) {
    const each = (data as unknown as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1;
    return length ? length * each : data.byteLength - offset * each;
  }
  return data instanceof ArrayBuffer ? data.byteLength : 0;
}

/**
 * `?perf`: frame rate, draw calls, triangles, shader programs, the bytes
 * handed to the GPU's buffers and (in the Adventure) the chunks loaded at
 * each detail over whichever game runs, head-locked low on the left of view
 * so it reads the same on the page and in the headset. Draw calls and
 * triangles are the last frame's, both eyes together in VR; the readout's
 * own panel is one of each per eye, and one program. The bytes uploaded are
 * the most in any one frame since the last redraw (most frames upload
 * nothing), vertices and indices, not textures.
 */
export class PerfReadout {
  private readonly panel = new TextPanel(0.22);
  private frames = 0;
  private time = 0;
  private fps = 0;
  /** Loaded chunks by detail, where a world streams them. */
  chunks: (() => ChunkCounts) | null = null;
  /** Bytes handed to buffers since the last frame, and the most in a frame since the last redraw. */
  private bytes = 0;
  private mostBytes = 0;

  constructor(
    private readonly renderer: WebGLRenderer,
    camera: Camera,
  ) {
    // Count every byte the page hands WebGL's buffers: only with ?perf, so the game never pays for it.
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const bufferData = gl.bufferData;
    const bufferSubData = gl.bufferSubData;
    gl.bufferData = ((...args: unknown[]) => {
      this.bytes += bytesOf(args[1], args[3] as number | undefined, args[4] as number | undefined);
      return (bufferData as (...a: unknown[]) => void).apply(gl, args);
    }) as typeof gl.bufferData;
    gl.bufferSubData = ((...args: unknown[]) => {
      this.bytes += bytesOf(args[2], args[3] as number | undefined, args[4] as number | undefined);
      return (bufferSubData as (...a: unknown[]) => void).apply(gl, args);
    }) as typeof gl.bufferSubData;
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
    this.mostBytes = Math.max(this.mostBytes, this.bytes);
    this.bytes = 0;
    if (this.time < EVERY) return;
    this.fps = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
    const { render, programs } = this.renderer.info;
    const uploaded = this.mostBytes;
    this.mostBytes = 0;
    const chunks = this.chunks?.();
    this.panel.draw([
      'perf',
      `fps        ${this.fps.toFixed(0)}`,
      `draw calls ${render.calls}`,
      `triangles  ${(render.triangles / 1000).toFixed(1)}k`,
      `programs   ${programs?.length ?? 0}`,
      `uploaded   ${(uploaded / 1024).toFixed(0)} KB`,
      ...(chunks ? [`chunks     ${chunks.full} full ${chunks.standIn} far`] : []),
    ]);
  }
}
