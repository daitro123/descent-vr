import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';

/**
 * A floating text readout for the debug tools: a canvas redrawn only when its
 * text changes. The first line is a heading; lines after the first blank line
 * are dimmer help text.
 */
export class TextPanel {
  readonly mesh: Mesh;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: CanvasTexture;
  private last = '';

  /** `width` in metres; the panel is half as tall. */
  constructor(width = 1.0) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    this.ctx = canvas.getContext('2d')!;
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.mesh = new Mesh(new PlaneGeometry(width, width / 2), new MeshBasicMaterial({ map: this.texture, transparent: true }));
  }

  draw(lines: string[]): void {
    const text = lines.join('\n');
    if (text === this.last) return;
    this.last = text;
    const blank = lines.indexOf('');
    const c = this.ctx;
    c.clearRect(0, 0, 1024, 512);
    c.fillStyle = 'rgba(8, 6, 10, 0.82)';
    c.fillRect(0, 0, 1024, 512);
    c.strokeStyle = '#5a4a30';
    c.lineWidth = 4;
    c.strokeRect(2, 2, 1020, 508);
    c.textBaseline = 'top';
    lines.forEach((line, i) => {
      const head = i === 0;
      const help = blank >= 0 && i > blank;
      c.font = `${head ? 'bold 44px' : help ? '30px' : '36px'} ui-monospace, Menlo, monospace`;
      c.fillStyle = head ? '#e0b060' : help ? '#9a8f7a' : '#e0d6c0';
      c.fillText(line, 28, 24 + i * 52 - (help ? 20 : 0), 968);
    });
    this.texture.needsUpdate = true;
  }
}
