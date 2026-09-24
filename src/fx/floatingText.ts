import {
  CanvasTexture,
  NearestFilter,
  type Object3D,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  type Vector3,
} from 'three';

interface Floater {
  sprite: Sprite;
  age: number;
  life: number;
  rise: number;
}

/**
 * Diablo-style floating combat text. Drawn into a tiny canvas and magnified
 * with NearestFilter so it reads as chunky pixel font.
 */
export class FloatingText {
  private readonly active: Floater[] = [];

  constructor(private readonly parent: Object3D) {}

  spawn(
    text: string,
    at: Vector3,
    opts: { color?: string; scale?: number; life?: number; rise?: number } = {},
  ): void {
    const { color = '#ffffff', scale = 0.25, life = 0.9, rise = 0.6 } = opts;
    const w = Math.max(16, text.length * 6 + 4);
    const h = 12;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(text, w / 2 + 1, h / 2 + 1);
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2);

    const tex = new CanvasTexture(canvas);
    tex.magFilter = tex.minFilter = NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = SRGBColorSpace;
    const sprite = new Sprite(
      new SpriteMaterial({ map: tex, transparent: true, depthTest: false }),
    );
    sprite.renderOrder = 10;
    sprite.scale.set((scale * w) / h, scale, 1);
    sprite.position.copy(at);
    this.parent.add(sprite);
    this.active.push({ sprite, age: 0, life, rise });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const f = this.active[i];
      f.age += dt;
      f.sprite.position.y += (f.rise / f.life) * dt;
      f.sprite.material.opacity = 1 - Math.max(0, (f.age / f.life - 0.6) / 0.4);
      if (f.age >= f.life) {
        this.parent.remove(f.sprite);
        f.sprite.material.map?.dispose();
        f.sprite.material.dispose();
        this.active.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const f of this.active) this.parent.remove(f.sprite);
    this.active.length = 0;
  }
}
