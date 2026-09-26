import {
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  type Vector3,
} from 'three';

const geo = new PlaneGeometry(1, 1);

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Drawn on a coarse pixel grid so it matches the rest of the pixel art.
const fragmentShader = /* glsl */ `
uniform float uFill;
uniform float uLag;
uniform vec3 uColor;
uniform float uCells;
varying vec2 vUv;
void main() {
  vec2 cell = floor(vUv * vec2(uCells, 4.0));
  bool border = cell.x < 1.0 || cell.x > uCells - 2.0 || cell.y < 1.0 || cell.y > 2.0;
  float x = (cell.x - 1.0) / (uCells - 2.0);
  vec3 c = border ? vec3(0.06, 0.05, 0.05)
    : x < uFill ? uColor * (cell.y > 1.5 ? 1.0 : 0.7)
    : x < uLag ? vec3(0.95, 0.85, 0.55)
    : vec3(0.16, 0.05, 0.05);
  gl_FragColor = vec4(c, 1.0);
}`;

/**
 * A pixel health bar that floats over an enemy's head once it's been hurt.
 * The pale "lag" segment shows the chunk the last hit took off.
 */
export class HealthBar {
  readonly root = new Group();
  private readonly mat: ShaderMaterial;
  private lag = 1;
  private shown = 0;

  constructor(width: number, height: number, color: number, label?: string) {
    this.mat = new ShaderMaterial({
      uniforms: {
        uFill: { value: 1 },
        uLag: { value: 1 },
        uColor: { value: new Color(color) },
        uCells: { value: Math.round(width * 60) },
      },
      vertexShader,
      fragmentShader,
    });
    const bar = new Mesh(geo, this.mat);
    bar.scale.set(width, height, 1);
    this.root.add(bar);
    if (label && typeof document !== 'undefined') this.root.add(labelMesh(label, width));
    this.root.visible = false;
  }

  /** `always` keeps it up (the boss); otherwise it shows for a while after a hit. */
  update(dt: number, fill: number, camera: Vector3, always = false): void {
    if (fill < this.mat.uniforms.uFill.value) this.shown = 4;
    this.shown = Math.max(0, this.shown - dt);
    this.lag = Math.max(fill, this.lag - dt * 0.6);
    this.mat.uniforms.uFill.value = fill;
    this.mat.uniforms.uLag.value = this.lag;
    this.root.visible = fill > 0 && (always || this.shown > 0);
    if (!this.root.visible) return;
    // Yaw-only billboard: stays upright.
    this.root.updateWorldMatrix(true, false);
    const e = this.root.matrixWorld.elements;
    const parentYaw = this.root.parent ? this.root.parent.rotation.y : 0;
    this.root.rotation.y = Math.atan2(camera.x - e[12], camera.z - e[14]) - parentYaw;
  }
}

function labelMesh(text: string, width: number): Mesh {
  const h = 10;
  const w = text.length * 6 + 6;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(text, w / 2 + 1, h / 2 + 1);
  ctx.fillStyle = '#e0c080';
  ctx.fillText(text, w / 2, h / 2);
  const tex = new CanvasTexture(canvas);
  tex.magFilter = tex.minFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = SRGBColorSpace;
  const m = new Mesh(geo, new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  const lh = Math.min(0.14, (width / w) * h);
  m.scale.set((lh * w) / h, lh, 1);
  m.position.y = lh * 0.9;
  return m;
}
