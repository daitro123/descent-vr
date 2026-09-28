import {
  CanvasTexture,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
} from 'three';
import type { Mood } from './quest';

// PROTOTYPE (Talking to NPCs and tracking quests): canvas-drawn text for the
// `?talk` variants. Throwaway.

export const FONT = 'system-ui, Roboto, "Segoe UI", sans-serif';

/**
 * A flat card `w` × `h` metres, drawn into a canvas at `ppm` pixels per metre.
 * `overlay` cards draw over the world (no depth test): HUD-like trackers and toasts.
 */
export class Card {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly ctx: CanvasRenderingContext2D;
  readonly pw: number;
  readonly ph: number;
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

  /** Redraw only when `key` changes. Returns true if `draw` ran. */
  paint(key: string, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void): boolean {
    if (key === this.key) return false;
    this.key = key;
    this.ctx.clearRect(0, 0, this.pw, this.ph);
    draw(this.ctx, this.pw, this.ph);
    this.texture.needsUpdate = true;
    return true;
  }

  set opacity(v: number) {
    this.mesh.material.opacity = v;
    this.mesh.visible = v > 0.01;
  }

  get opacity(): number {
    return this.mesh.material.opacity;
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

/** Parchment board with a dark frame: the "physical" look of variant A. */
export function parchment(c: CanvasRenderingContext2D, w: number, h: number, border = 10): void {
  c.fillStyle = '#3a2716';
  roundRect(c, 0, 0, w, h, border * 2);
  c.fill();
  c.fillStyle = '#e6d6b0';
  roundRect(c, border, border, w - border * 2, h - border * 2, border);
  c.fill();
}

/** WoW-style quest marker over a quest giver's head: gold "!", gold "?", grey "?". */
export class Marker {
  readonly sprite: Sprite;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private mood: Mood | null = null;
  private t = 0;

  constructor() {
    this.canvas.width = 96;
    this.canvas.height = 160;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.sprite = new Sprite(new SpriteMaterial({ map: this.texture, transparent: true, fog: false }));
    this.sprite.scale.set(0.22, 0.366, 1);
  }

  update(dt: number, mood: Mood, x: number, y: number, z: number): void {
    this.t += dt;
    this.sprite.position.set(x, y + 0.05 * Math.sin(this.t * 2.4), z);
    if (mood === this.mood) return;
    this.mood = mood;
    const c = this.canvas.getContext('2d')!;
    c.clearRect(0, 0, 96, 160);
    c.font = `900 150px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 14;
    c.strokeStyle = '#2a1a06';
    const glyph = mood === 'offer' ? '!' : '?';
    c.strokeText(glyph, 48, 86);
    c.fillStyle = mood === 'waiting' ? '#a8a8a8' : '#ffd23a';
    c.fillText(glyph, 48, 86);
    this.texture.needsUpdate = true;
  }
}
