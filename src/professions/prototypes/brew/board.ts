import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { type BrewVariant, modeOf, type Step, stepsOf, TURNS } from './variants';

// PROTOTYPE (Brewing at the alchemy table): the note pinned up at the back of
// the bench. It shows the recipe, the variant, each act and whether your hands
// or the table do it, where you are, and how long the last brew took, so the
// state is on show while you try it. Throwaway.

const W = 1024;
const H = 700;
const FONT = 'Georgia, "Times New Roman", serif';

export interface BoardState {
  variant: BrewVariant;
  step: Step;
  /** 0 to 1 through the current act. */
  progress: number;
  leaves: number;
  /** Seconds the last brew took, from the first leaf in to the cork. */
  last: number | null;
  onBelt: number;
  /** Seconds of the shared potion cooldown left. */
  cooldown: number;
}

function label(v: BrewVariant, step: Step): string {
  const into = v.load === 'mortar' ? 'the mortar' : 'the pot';
  const auto = modeOf(v, step) === 'auto';
  switch (step) {
    case 'load':
      return `Drop 2 Hearthleaf in ${into}`;
    case 'grind':
      return `Grind them with the pestle (${TURNS.grind} turns)`;
    case 'tip':
      return auto ? 'The mortar tips into the pot' : 'Tip the mortar into the pot';
    case 'stir':
      return auto ? 'The spoon stirs the pot' : `Stir the pot (${TURNS.stir} turns)`;
    case 'pour':
      return auto ? 'The pot pours into the flask' : 'Pour the pot into the flask';
    case 'take':
      return 'Take the flask: belt or drink';
  }
}

export class Board {
  readonly mesh: Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private last = '';

  constructor() {
    this.canvas.width = W;
    this.canvas.height = H;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.mesh = new Mesh(new PlaneGeometry(0.5, (0.5 * H) / W), new MeshBasicMaterial({ map: this.texture }));
    this.mesh.name = 'brew-board';
  }

  show(s: BoardState): void {
    const pct = Math.floor(s.progress * 10);
    const key = `${s.variant.key}|${s.step}|${pct}|${s.leaves}|${s.last}|${s.onBelt}|${Math.ceil(s.cooldown)}`;
    if (key === this.last) return;
    this.last = key;
    const c = this.canvas.getContext('2d')!;
    c.fillStyle = '#e8dcb8';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = '#8a7250';
    c.lineWidth = 10;
    c.strokeRect(5, 5, W - 10, H - 10);
    c.textBaseline = 'top';
    c.fillStyle = '#5a1810';
    c.font = `bold 50px ${FONT}`;
    c.fillText('Minor healing potion', 40, 30);
    c.fillStyle = '#3a2a18';
    c.font = `italic 32px ${FONT}`;
    c.fillText('2 Hearthleaf, ground, steeped and stirred.', 40, 92);
    c.fillStyle = '#1c3a6a';
    c.font = `bold 36px ${FONT}`;
    c.fillText(`${s.variant.key} · ${s.variant.name}`, 40, 150);

    const steps = stepsOf(s.variant);
    const at = steps.indexOf(s.step);
    steps.forEach((step, i) => {
      const y = 214 + i * 58;
      const done = i < at;
      const now = i === at;
      c.fillStyle = done ? '#4a7a2a' : now ? '#8a1a10' : '#6a5a44';
      c.font = `${now ? 'bold ' : ''}34px ${FONT}`;
      c.fillText(done ? '✓' : now ? '▶' : '○', 44, y);
      let text = label(s.variant, step);
      if (now && step === 'load') text += `  (${s.leaves} of 2)`;
      if (now && step !== 'load' && step !== 'take' && s.progress > 0) text += `  ${Math.round(s.progress * 100)}%`;
      c.fillText(text, 96, y);
      const mode = modeOf(s.variant, step);
      c.font = `26px ${FONT}`;
      c.fillStyle = mode === 'hand' ? '#6a3a1a' : '#4a5a7a';
      c.fillText(mode === 'hand' ? 'your hands' : 'by itself', W - 200, y + 6);
    });

    c.fillStyle = '#3a2a18';
    c.font = `30px ${FONT}`;
    const foot = [
      s.last !== null ? `Last brew: ${s.last.toFixed(1)} s` : 'No brew yet',
      `On your belt: ${s.onBelt} of 2`,
      s.cooldown > 0 ? `Potions ready in ${Math.ceil(s.cooldown)} s` : '',
    ].filter(Boolean);
    c.fillText(foot.join('   ·   '), 40, H - 60);
    this.texture.needsUpdate = true;
  }
}
