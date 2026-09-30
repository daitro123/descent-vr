import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { itemOf } from '../../items';
import { RECIPES, type RecipeId } from '../professions';

// The note pinned at the back of the alchemy bench: the recipes you know and
// what each takes, so you know what to drop in the mortar, and what the bench
// is doing now. It only redraws when what it says changes.

const W = 768;
const H = 560;
const FONT = 'Georgia, "Times New Roman", serif';

/** What the note shows. */
export interface NoteState {
  /** The bench recipes you know, in the order learned. */
  readonly known: readonly RecipeId[];
  /** How many of an item the bag holds. */
  readonly has: (id: string) => number;
  /** The act under way, in a few words, or null while the bench waits for herbs. */
  readonly doing: string | null;
}

export class Note {
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
    this.mesh = new Mesh(new PlaneGeometry(0.36, (0.36 * H) / W), new MeshBasicMaterial({ map: this.texture }));
    this.mesh.name = 'bench-note';
  }

  show(s: NoteState): void {
    const rows = s.known.map((id) => {
      const r = RECIPES[id];
      const takes = Object.entries(r.takes).map(([item, n]) => ({ name: itemOf(item)?.name ?? item, n, short: s.has(item) < n }));
      return { name: itemOf(r.makes)?.name ?? id, takes };
    });
    const key = JSON.stringify([rows, s.doing]);
    if (key === this.last) return;
    this.last = key;
    const c = this.canvas.getContext('2d')!;
    c.fillStyle = '#e8dcb8';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = '#8a7250';
    c.lineWidth = 8;
    c.strokeRect(4, 4, W - 8, H - 8);
    c.textBaseline = 'top';
    c.fillStyle = '#5a1810';
    c.font = `bold 44px ${FONT}`;
    c.fillText('Brews you know', 32, 24);
    c.font = `italic 26px ${FONT}`;
    c.fillStyle = '#3a2a18';
    c.fillText('Drop the herbs in the mortar, grind, then stir.', 32, 80);
    if (!rows.length) {
      c.font = `30px ${FONT}`;
      c.fillText('None yet: the herbalist can teach you.', 32, 140);
    }
    rows.slice(0, 5).forEach((row, i) => {
      const y = 136 + i * 66;
      c.fillStyle = '#2a1c10';
      c.font = `bold 32px ${FONT}`;
      c.fillText(row.name, 32, y);
      c.font = `26px ${FONT}`;
      let x = 44;
      for (const t of row.takes) {
        const text = `${t.n} ${t.name}`;
        c.fillStyle = t.short ? '#9a4a3a' : '#4a6a2a';
        c.fillText(text, x, y + 34);
        x += c.measureText(text).width + 26;
      }
    });
    if (s.doing) {
      c.fillStyle = '#1c3a6a';
      c.font = `bold 30px ${FONT}`;
      c.fillText(s.doing, 32, H - 58);
    }
    this.texture.needsUpdate = true;
  }
}
