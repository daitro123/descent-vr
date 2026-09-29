import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';

// Canvas-drawn text on flat cards, for talking and tracking: Hale's board and
// the quest tracker (from the talk prototype, in history at merge 19ce545).

export const FONT = 'system-ui, Roboto, "Segoe UI", sans-serif';

/**
 * A flat card `w` × `h` metres, drawn into a canvas at `ppm` pixels per metre.
 * `overlay` cards draw over the world (no depth test), like the tracker.
 */
export class Card {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly pw: number;
  readonly ph: number;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: CanvasTexture;
  private key = '';

  constructor(
    readonly w: number,
    readonly h: number,
    opts: { ppm?: number; overlay?: boolean } = {},
  ) {
    const ppm = opts.ppm ?? 1400;
    const canvas = document.createElement('canvas');
    this.pw = canvas.width = Math.round(w * ppm);
    this.ph = canvas.height = Math.round(h * ppm);
    this.ctx = canvas.getContext('2d')!;
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    const material = new MeshBasicMaterial({ map: this.texture, transparent: true, side: DoubleSide, fog: false });
    if (opts.overlay) {
      material.depthTest = false;
      material.depthWrite = false;
    }
    this.mesh = new Mesh(new PlaneGeometry(w, h), material);
    if (opts.overlay) this.mesh.renderOrder = 20;
  }

  /** Redraw, but only when `key` changes. */
  paint(key: string, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void): void {
    if (key === this.key) return;
    this.key = key;
    this.ctx.clearRect(0, 0, this.pw, this.ph);
    draw(this.ctx, this.pw, this.ph);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/** Break `text` into lines no wider than `max` pixels in the context's current font. */
export function wrap(c: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && c.measureText(next).width > max) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Parchment in a dark wooden frame: Hale's board. */
export function parchment(c: CanvasRenderingContext2D, w: number, h: number, border = 10): void {
  c.fillStyle = '#3a2716';
  roundRect(c, 0, 0, w, h, border * 2);
  c.fill();
  c.fillStyle = '#e6d6b0';
  roundRect(c, border, border, w - border * 2, h - border * 2, border);
  c.fill();
}
