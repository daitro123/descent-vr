import { CanvasTexture, SRGBColorSpace, Sprite, SpriteMaterial } from 'three';
import type { HaleShows } from '../adventureState';
import { FONT } from './card';

const W = 96;
const H = 160;
/** Metres tall. */
const SIZE = 0.366;

/**
 * The WoW-style marker over a quest giver's head: a gold "!" while they have a
 * quest on offer, a grey "?" while yours is under way, a gold "?" once it's
 * ready to hand in, and nothing once they have nothing left. It bobs gently.
 */
export class QuestMarker {
  readonly sprite: Sprite;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private shown: HaleShows['marker'] | undefined;
  private t = 0;

  constructor() {
    this.canvas.width = W;
    this.canvas.height = H;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.sprite = new Sprite(new SpriteMaterial({ map: this.texture, transparent: true, fog: false }));
    this.sprite.scale.set((SIZE * W) / H, SIZE, 1);
  }

  /** Show `marker`, bobbing about `y`. */
  update(dt: number, marker: HaleShows['marker'], y: number): void {
    this.t += dt;
    this.sprite.position.y = y + 0.05 * Math.sin(this.t * 2.4);
    this.sprite.visible = marker !== null;
    if (marker === this.shown) return;
    this.shown = marker;
    const c = this.canvas.getContext('2d')!;
    c.clearRect(0, 0, W, H);
    if (!marker) return;
    c.font = `900 150px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 14;
    c.strokeStyle = '#2a1a06';
    const glyph = marker === 'offered' ? '!' : '?';
    c.strokeText(glyph, W / 2, 86);
    c.fillStyle = marker === 'active' ? '#a8a8a8' : '#ffd23a';
    c.fillText(glyph, W / 2, 86);
    this.texture.needsUpdate = true;
  }
}
