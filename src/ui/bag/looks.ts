import { type BufferGeometry, CanvasTexture, NearestFilter, SRGBColorSpace, TorusGeometry } from 'three';
import { CATALOGUE, type GearSlot, type ItemDef, type Rarity } from '../../items';
import { ModelBuilder } from '../../models/kit';
import { PAL } from '../../models/palette';

// How items are drawn, promoted from the bag prototype (ui/bag-prototype/looks.ts):
// flat icons in one texture atlas, so every slot of the bag panel is a single
// draw, and a small 3D model for the item you carry and the item lying on the
// ground. Each item's look comes from its model's name; a model this table
// doesn't know yet (loot added by a later build) is drawn by its slot or kind,
// in its rarity's colour (.scratch/inventory/spec.md, "The view in VR").

/** The shapes an item is drawn as. */
export type Look =
  | 'sword'
  | 'bow'
  | 'wand'
  | 'staff'
  | 'shield'
  | 'quiver'
  | 'focus'
  | 'helm'
  | 'chest'
  | 'gloves'
  | 'legs'
  | 'boots'
  | 'flask'
  | 'scroll'
  | 'trinket'
  | 'cloth'
  | 'charm'
  | 'dust'
  | 'pouch';

/** An item's shape and its main colour. */
export interface ItemLook {
  readonly look: Look;
  readonly tint: number;
}

/** WoW's rarity colours: grey junk, white, green, blue. */
export const RARITY_COLOUR: Readonly<Record<Rarity, string>> = { grey: '#9d9d9d', white: '#ffffff', green: '#1eff00', blue: '#0070dd' };

/** Oakvale's models, by name. */
const MODELS: Readonly<Record<string, ItemLook>> = {
  plain: { look: 'sword', tint: PAL.iron },
  hale: { look: 'sword', tint: PAL.gold },
  'round-shield': { look: 'shield', tint: 0x7a5a34 },
  'short-bow': { look: 'bow', tint: PAL.wood },
  quiver: { look: 'quiver', tint: PAL.leather },
  wand: { look: 'wand', tint: 0x8a6a9a },
  focus: { look: 'focus', tint: 0x7ac8e0 },
  tunic: { look: 'chest', tint: 0x8a7a5a },
  boots: { look: 'boots', tint: 0x5a3a24 },
  // Hale's hand-ins' picks.
  'farmstead-gloves': { look: 'gloves', tint: 0x8a6a3a },
  'hedgerow-boots': { look: 'boots', tint: 0x4a6a2a },
  'timberline-leggings': { look: 'legs', tint: 0x6a5030 },
  'marshals-cap': { look: 'helm', tint: 0x3a4a6a },
  'wardens-mantle': { look: 'chest', tint: 0x2a3a6a },
  'hunting-bow': { look: 'bow', tint: 0x4a2a18 },
  'crypt-staff': { look: 'staff', tint: 0xd8d0b8 },
  // The ranger's and mage's loot, white, green and blue (items.ts, LOOT_HANDS).
  'ash-bow': { look: 'bow', tint: 0xc8a878 },
  'yew-bow': { look: 'bow', tint: 0x9a4a2a },
  'horn-bow': { look: 'bow', tint: 0x3a3440 },
  'hide-quiver': { look: 'quiver', tint: 0x9a7a5a },
  'tooled-quiver': { look: 'quiver', tint: 0x6a4020 },
  'moonhide-quiver': { look: 'quiver', tint: 0x3a4460 },
  'birch-wand': { look: 'wand', tint: 0xd8d0c0 },
  'rowan-staff': { look: 'staff', tint: 0x7a3a2a },
  'moonwood-staff': { look: 'staff', tint: 0x4a5a8a },
  'quartz-focus': { look: 'focus', tint: 0xe0e8f0 },
  'amethyst-focus': { look: 'focus', tint: 0x9a5ad0 },
  'moonstone-focus': { look: 'focus', tint: 0x8ab0e8 },
  'flask-red': { look: 'flask', tint: 0xc02020 },
  scroll: { look: 'scroll', tint: 0xe8d8a8 },
  trinket: { look: 'trinket', tint: 0xc0a060 },
  cloth: { look: 'cloth', tint: 0x8a6a5a },
  charm: { look: 'charm', tint: PAL.bone },
  dust: { look: 'dust', tint: 0x9a9488 },
  slime: { look: 'dust', tint: 0x4a5a34 },
  teeth: { look: 'charm', tint: 0xd8cfb0 },
  snakeskin: { look: 'cloth', tint: 0x8a7e66 },
  fang: { look: 'charm', tint: 0xe8e0c8 },
  // House Corvane's bailiffs' junk: a notched tally of the tithes owed, and the house's pewter badge.
  tally: { look: 'charm', tint: 0x9a7a4a },
  'key-badge': { look: 'trinket', tint: 0x4a4a52 },
  // The smugglers' junk: the Lantern Men's tarred twine and a lantern's bent shutter, the Undergate's cellar key and dice.
  twine: { look: 'cloth', tint: 0x3a322a },
  shutter: { look: 'trinket', tint: 0x3a3b42 },
  'cellar-key': { look: 'trinket', tint: 0x8a5436 },
  dice: { look: 'charm', tint: 0xd8cfb0 },
  // The fen raiders' junk: a rusty eel hook, and a charm of plaited reed.
  'eel-hook': { look: 'trinket', tint: 0x8a4e2a },
  'reed-charm': { look: 'charm', tint: 0xa89d62 },
  // Professions' materials and what they make (the pouch stands in for ore, stone, bars and herbs).
  'ore-copper': { look: 'pouch', tint: 0xb8733a },
  'stone-rough': { look: 'pouch', tint: 0x8a8680 },
  'bar-copper': { look: 'pouch', tint: 0xd08a4a },
  'herb-hearthleaf': { look: 'pouch', tint: 0x7aa83a },
  'herb-duskcap': { look: 'pouch', tint: 0x5a3a7a },
  'flask-orange': { look: 'flask', tint: 0xd0701a },
  'flask-blue': { look: 'flask', tint: 0x2a5ad0 },
  'flask-green': { look: 'flask', tint: 0x3aa04a },
  whetstone: { look: 'charm', tint: 0x7a7a80 },
  'copper-gauntlets': { look: 'gloves', tint: 0xb8733a },
};

/** What each gear slot is drawn as, when its model isn't in the table: the main and off hand by class. */
const SLOT_LOOK: Readonly<Record<Exclude<GearSlot, 'mainHand' | 'offHand'>, Look>> = { head: 'helm', chest: 'chest', hands: 'gloves', legs: 'legs', feet: 'boots' };
const HANDS: Readonly<Record<'warrior' | 'ranger' | 'mage', readonly [Look, Look]>> = {
  warrior: ['sword', 'shield'],
  ranger: ['bow', 'quiver'],
  mage: ['wand', 'focus'],
};
/** A tint for each rarity, for gear drawn by its slot. */
const RARITY_TINT: Readonly<Record<Rarity, number>> = { grey: 0x8a8478, white: 0xb0a890, green: 0x4a8a3a, blue: 0x3a5a9a };

/** How `item` is drawn. */
export function lookOf(item: ItemDef): ItemLook {
  const known = MODELS[item.model];
  if (known) return known;
  const tint = RARITY_TINT[item.rarity];
  switch (item.kind) {
    case 'gear':
      if (item.slot === 'mainHand' || item.slot === 'offHand') return { look: HANDS[item.class ?? 'warrior'][item.slot === 'mainHand' ? 0 : 1], tint };
      return { look: SLOT_LOOK[item.slot], tint };
    case 'consumable':
      return { look: 'flask', tint: 0xc02020 };
    case 'quest':
      return { look: 'scroll', tint: 0xe8d8a8 };
    case 'material':
      return { look: 'pouch', tint: PAL.leather };
    case 'junk':
      return { look: 'trinket', tint };
  }
}

/** What an empty gear or belt slot shows, faintly, so you know what goes there. */
const GHOST: Readonly<Record<GearSlot | 'belt', Look>> = {
  mainHand: 'sword',
  offHand: 'shield',
  head: 'helm',
  chest: 'chest',
  hands: 'gloves',
  legs: 'legs',
  feet: 'boots',
  belt: 'flask',
};

/** The atlas is CELLS × CELLS icons of CELL pixels. */
const CELLS = 10;
const CELL = 100;
/** A slot's dark ground with nothing on it. */
export const EMPTY_CELL = 0;
/** Nothing at all: a quad pointed here isn't drawn (a stack's count with no count). */
export const BLANK_CELL = 1;
const DIGIT_CELL = 2;
const GHOST_CELL = DIGIT_CELL + 10;
const GHOST_SLOTS = Object.keys(GHOST) as (GearSlot | 'belt')[];
const FIRST_ITEM_CELL = GHOST_CELL + GHOST_SLOTS.length;
/** How many looks the atlas has cells for; past that, a look shares its shape's first cell. */
export const ITEM_CELLS = CELLS * CELLS - FIRST_ITEM_CELL;

function hex(c: number, k = 1): string {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k));
  const b = Math.min(255, Math.round((c & 255) * k));
  return `rgb(${r},${g},${b})`;
}

/**
 * Every icon in one texture: the empty ground, the digits for stacks' counts,
 * a faint outline for each empty gear slot, then a cell for each look and
 * tint as it's first asked for. Every item in the catalogue is drawn at once,
 * so only loot a later build adds draws a new cell (and re-uploads the texture).
 */
export class IconAtlas {
  readonly texture: CanvasTexture;
  private readonly canvas: HTMLCanvasElement;
  private readonly c: CanvasRenderingContext2D;
  private readonly cells = new Map<string, number>();
  private next = FIRST_ITEM_CELL;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = CELLS * CELL;
    this.c = this.canvas.getContext('2d')!;
    const { c } = this;
    for (let i = 0; i < CELLS * CELLS; i++) {
      if (i === BLANK_CELL) continue;
      // Every cell's dark ground, so the slot's frame shows round it in the rarity's colour.
      c.fillStyle = '#1e1610';
      c.fillRect((i % CELLS) * CELL, Math.floor(i / CELLS) * CELL, CELL, CELL);
    }
    for (let d = 0; d < 10; d++) this.drawDigit(DIGIT_CELL + d, d);
    GHOST_SLOTS.forEach((slot, i) => this.drawInCell(GHOST_CELL + i, GHOST[slot], 0xb0a080, 0.22));
    for (const item of Object.values(CATALOGUE)) this.cellOf(item);
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.magFilter = NearestFilter;
    this.texture.anisotropy = 4;
  }

  /** The cell of `item`'s icon, drawn now if it's the first of its look. */
  cellOf(item: ItemDef): number {
    const { look, tint } = lookOf(item);
    const key = `${look}:${tint}`;
    let cell = this.cells.get(key);
    if (cell !== undefined) return cell;
    if (this.next >= CELLS * CELLS) {
      // Full: share the first cell drawn with the same shape.
      cell = [...this.cells].find(([k]) => k.startsWith(`${look}:`))?.[1] ?? EMPTY_CELL;
    } else {
      cell = this.next++;
      this.drawInCell(cell, look, tint, 1);
      if (this.texture) this.texture.needsUpdate = true;
    }
    this.cells.set(key, cell);
    return cell;
  }

  /** The cell of an empty gear or belt slot's faint outline. */
  ghostOf(slot: GearSlot | 'belt'): number {
    return GHOST_CELL + GHOST_SLOTS.indexOf(slot);
  }

  /** The cell of digit `d`. */
  digit(d: number): number {
    return DIGIT_CELL + d;
  }

  /** A cell's corners in the texture: u0, v0, u1, v1. */
  uv(cell: number): [number, number, number, number] {
    const u0 = (cell % CELLS) / CELLS;
    const v1 = 1 - Math.floor(cell / CELLS) / CELLS;
    return [u0, v1 - 1 / CELLS, u0 + 1 / CELLS, v1];
  }

  private drawInCell(cell: number, look: Look, tint: number, alpha: number): void {
    const { c } = this;
    c.save();
    c.globalAlpha = alpha;
    c.translate((cell % CELLS) * CELL + CELL * 0.1, Math.floor(cell / CELLS) * CELL + CELL * 0.1);
    c.scale(CELL * 0.8, CELL * 0.8);
    drawIcon(c, look, tint);
    c.restore();
  }

  /** A digit on nothing, outlined so it reads over any icon. */
  private drawDigit(cell: number, d: number): void {
    const { c } = this;
    const x = (cell % CELLS) * CELL;
    const y = Math.floor(cell / CELLS) * CELL;
    c.clearRect(x, y, CELL, CELL);
    c.save();
    c.font = `bold ${Math.round(CELL * 0.9)}px system-ui, Roboto, "Segoe UI", sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.lineWidth = CELL * 0.14;
    c.strokeStyle = '#000';
    c.strokeText(String(d), x + CELL / 2, y + CELL * 0.54);
    c.fillStyle = '#f4ead0';
    c.fillText(String(d), x + CELL / 2, y + CELL * 0.54);
    c.restore();
  }
}

const STEEL = PAL.steel;
const LEATHER = PAL.leather;

/** Draw an icon in a 1 × 1 box (the context is scaled to the cell). */
function drawIcon(c: CanvasRenderingContext2D, look: Look, tint: number): void {
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.lineWidth = 0.04;
  c.strokeStyle = 'rgba(0,0,0,0.75)';
  const fill = (color: string, path: () => void) => {
    c.beginPath();
    path();
    c.fillStyle = color;
    c.fill();
    c.stroke();
  };
  const line = (color: string, width: number, path: () => void) => {
    c.beginPath();
    path();
    c.strokeStyle = 'rgba(0,0,0,0.75)';
    c.lineWidth = width + 0.04;
    c.stroke();
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.75)';
    c.lineWidth = 0.04;
  };
  switch (look) {
    case 'sword':
      c.save();
      c.translate(0.5, 0.5);
      c.rotate(Math.PI / 4);
      fill(hex(STEEL), () => {
        c.moveTo(-0.06, 0.12);
        c.lineTo(-0.06, -0.36);
        c.lineTo(0, -0.46);
        c.lineTo(0.06, -0.36);
        c.lineTo(0.06, 0.12);
      });
      fill(hex(tint), () => c.rect(-0.2, 0.1, 0.4, 0.07));
      fill(hex(LEATHER), () => c.rect(-0.04, 0.17, 0.08, 0.18));
      fill(hex(tint, 1.2), () => c.arc(0, 0.39, 0.06, 0, Math.PI * 2));
      c.restore();
      break;
    case 'bow':
      line(hex(tint), 0.08, () => {
        c.moveTo(0.3, 0.1);
        c.quadraticCurveTo(0.9, 0.5, 0.3, 0.9);
      });
      line('#e8e0c8', 0.015, () => {
        c.moveTo(0.3, 0.1);
        c.lineTo(0.3, 0.9);
      });
      fill(hex(LEATHER), () => c.rect(0.56, 0.44, 0.08, 0.12));
      break;
    case 'wand':
      c.save();
      c.translate(0.5, 0.5);
      c.rotate(Math.PI / 4);
      fill(hex(tint), () => c.rect(-0.04, -0.34, 0.08, 0.72));
      fill('#9ae0ff', () => c.arc(0, -0.38, 0.09, 0, Math.PI * 2));
      c.restore();
      break;
    case 'staff':
      c.save();
      c.translate(0.5, 0.5);
      c.rotate(Math.PI / 4);
      fill(hex(tint), () => c.rect(-0.035, -0.36, 0.07, 0.82));
      fill(hex(tint, 0.6), () => c.rect(-0.07, -0.34, 0.14, 0.05));
      fill('#9ae0ff', () => c.arc(0, -0.42, 0.08, 0, Math.PI * 2));
      c.restore();
      break;
    case 'shield':
      fill(hex(tint), () => {
        c.moveTo(0.18, 0.14);
        c.lineTo(0.82, 0.14);
        c.lineTo(0.8, 0.5);
        c.quadraticCurveTo(0.74, 0.78, 0.5, 0.9);
        c.quadraticCurveTo(0.26, 0.78, 0.2, 0.5);
        c.closePath();
      });
      fill(hex(tint, 1.6), () => {
        c.moveTo(0.46, 0.16);
        c.lineTo(0.54, 0.16);
        c.lineTo(0.54, 0.86);
        c.lineTo(0.46, 0.86);
      });
      fill(hex(STEEL), () => c.arc(0.5, 0.42, 0.09, 0, Math.PI * 2));
      break;
    case 'quiver':
      for (const x of [0.4, 0.5, 0.6]) {
        line('#d8d0c0', 0.03, () => {
          c.moveTo(x, 0.12);
          c.lineTo(x, 0.4);
        });
        fill('#c83020', () => {
          c.moveTo(x, 0.08);
          c.lineTo(x - 0.05, 0.18);
          c.lineTo(x + 0.05, 0.18);
          c.closePath();
        });
      }
      fill(hex(tint), () => {
        c.moveTo(0.3, 0.32);
        c.lineTo(0.7, 0.32);
        c.lineTo(0.64, 0.9);
        c.lineTo(0.36, 0.9);
        c.closePath();
      });
      break;
    case 'focus':
      fill(hex(tint), () => c.arc(0.5, 0.42, 0.26, 0, Math.PI * 2));
      fill('#ffffff', () => c.arc(0.42, 0.34, 0.06, 0, Math.PI * 2));
      fill(hex(PAL.wood), () => c.rect(0.34, 0.7, 0.32, 0.14));
      break;
    case 'helm':
      fill(hex(tint), () => {
        c.moveTo(0.2, 0.72);
        c.lineTo(0.2, 0.5);
        c.quadraticCurveTo(0.2, 0.16, 0.5, 0.16);
        c.quadraticCurveTo(0.8, 0.16, 0.8, 0.5);
        c.lineTo(0.8, 0.72);
        c.closePath();
      });
      fill(hex(tint, 0.6), () => c.rect(0.16, 0.66, 0.68, 0.1));
      fill(hex(tint, 1.3), () => c.rect(0.46, 0.44, 0.08, 0.38));
      break;
    case 'chest':
      fill(hex(tint), () => {
        c.moveTo(0.3, 0.14);
        c.lineTo(0.42, 0.2);
        c.lineTo(0.58, 0.2);
        c.lineTo(0.7, 0.14);
        c.lineTo(0.9, 0.3);
        c.lineTo(0.8, 0.46);
        c.lineTo(0.72, 0.4);
        c.lineTo(0.72, 0.86);
        c.lineTo(0.28, 0.86);
        c.lineTo(0.28, 0.4);
        c.lineTo(0.2, 0.46);
        c.lineTo(0.1, 0.3);
        c.closePath();
      });
      fill(hex(tint, 0.6), () => c.rect(0.28, 0.6, 0.44, 0.07));
      break;
    case 'gloves':
      for (const [x, flip] of [
        [0.3, -1],
        [0.7, 1],
      ] as const) {
        fill(hex(tint), () => {
          c.moveTo(x - 0.14, 0.86);
          c.lineTo(x - 0.14, 0.34);
          c.quadraticCurveTo(x, 0.14, x + 0.14, 0.34);
          c.lineTo(x + 0.14, 0.86);
          c.closePath();
        });
        fill(hex(tint, 1.2), () => c.ellipse(x + flip * 0.17, 0.5, 0.05, 0.11, flip * 0.5, 0, Math.PI * 2));
        fill(hex(tint, 0.6), () => c.rect(x - 0.15, 0.74, 0.3, 0.1));
      }
      break;
    case 'legs':
      fill(hex(tint), () => {
        c.moveTo(0.24, 0.14);
        c.lineTo(0.76, 0.14);
        c.lineTo(0.8, 0.88);
        c.lineTo(0.56, 0.88);
        c.lineTo(0.5, 0.4);
        c.lineTo(0.44, 0.88);
        c.lineTo(0.2, 0.88);
        c.closePath();
      });
      fill(hex(LEATHER), () => c.rect(0.23, 0.14, 0.54, 0.08));
      break;
    case 'boots':
      for (const x of [0.2, 0.52]) {
        fill(hex(tint), () => {
          c.moveTo(x, 0.2);
          c.lineTo(x + 0.18, 0.2);
          c.lineTo(x + 0.18, 0.64);
          c.lineTo(x + 0.3, 0.7);
          c.lineTo(x + 0.3, 0.84);
          c.lineTo(x, 0.84);
          c.closePath();
        });
        fill(hex(tint, 0.55), () => c.rect(x, 0.78, 0.3, 0.06));
      }
      break;
    case 'flask':
      fill('rgba(200,220,230,0.9)', () => {
        c.moveTo(0.42, 0.12);
        c.lineTo(0.58, 0.12);
        c.lineTo(0.58, 0.36);
        c.quadraticCurveTo(0.82, 0.5, 0.78, 0.7);
        c.quadraticCurveTo(0.72, 0.9, 0.5, 0.9);
        c.quadraticCurveTo(0.28, 0.9, 0.22, 0.7);
        c.quadraticCurveTo(0.18, 0.5, 0.42, 0.36);
        c.closePath();
      });
      fill(hex(tint), () => {
        c.moveTo(0.24, 0.62);
        c.lineTo(0.76, 0.62);
        c.quadraticCurveTo(0.72, 0.88, 0.5, 0.88);
        c.quadraticCurveTo(0.28, 0.88, 0.24, 0.62);
      });
      fill(hex(PAL.wood), () => c.rect(0.42, 0.06, 0.16, 0.1));
      break;
    case 'scroll':
      fill(hex(tint), () => c.rect(0.22, 0.2, 0.56, 0.6));
      fill(hex(tint, 0.8), () => c.rect(0.16, 0.14, 0.68, 0.1));
      fill(hex(tint, 0.8), () => c.rect(0.16, 0.76, 0.68, 0.1));
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.moveTo(0.3, 0.34 + i * 0.1);
        c.lineTo(0.7, 0.34 + i * 0.1);
        c.strokeStyle = 'rgba(60,40,20,0.7)';
        c.lineWidth = 0.025;
        c.stroke();
      }
      c.strokeStyle = 'rgba(0,0,0,0.75)';
      fill('#a02020', () => c.arc(0.66, 0.72, 0.07, 0, Math.PI * 2));
      break;
    case 'trinket':
      line(hex(tint, 0.8), 0.03, () => {
        c.moveTo(0.3, 0.14);
        c.quadraticCurveTo(0.5, 0.5, 0.7, 0.14);
      });
      fill(hex(tint), () => c.arc(0.5, 0.62, 0.2, 0, Math.PI * 2));
      fill(hex(tint, 1.4), () => c.arc(0.5, 0.62, 0.08, 0, Math.PI * 2));
      break;
    case 'cloth':
      fill(hex(tint), () => {
        c.moveTo(0.16, 0.24);
        c.lineTo(0.84, 0.18);
        c.lineTo(0.78, 0.5);
        c.lineTo(0.86, 0.82);
        c.lineTo(0.6, 0.74);
        c.lineTo(0.4, 0.86);
        c.lineTo(0.2, 0.7);
        c.lineTo(0.26, 0.46);
        c.closePath();
      });
      fill(hex(tint, 0.7), () => c.rect(0.3, 0.4, 0.4, 0.05));
      break;
    case 'charm':
      line(hex(LEATHER, 1.4), 0.035, () => {
        c.moveTo(0.3, 0.12);
        c.quadraticCurveTo(0.5, 0.45, 0.7, 0.12);
      });
      fill(hex(tint), () => {
        c.moveTo(0.5, 0.36);
        c.lineTo(0.68, 0.6);
        c.lineTo(0.5, 0.88);
        c.lineTo(0.32, 0.6);
        c.closePath();
      });
      break;
    case 'dust':
      fill(hex(LEATHER), () => {
        c.moveTo(0.3, 0.4);
        c.quadraticCurveTo(0.14, 0.88, 0.5, 0.88);
        c.quadraticCurveTo(0.86, 0.88, 0.7, 0.4);
        c.closePath();
      });
      fill(hex(tint), () => c.ellipse(0.5, 0.36, 0.22, 0.1, 0, 0, Math.PI * 2));
      fill(hex(LEATHER, 0.7), () => c.rect(0.34, 0.42, 0.32, 0.06));
      break;
    case 'pouch':
      fill(hex(tint), () => {
        c.moveTo(0.34, 0.3);
        c.quadraticCurveTo(0.12, 0.9, 0.5, 0.88);
        c.quadraticCurveTo(0.88, 0.9, 0.66, 0.3);
        c.closePath();
      });
      fill(hex(tint, 0.7), () => c.rect(0.32, 0.24, 0.36, 0.08));
      break;
  }
}

/** An item's small 3D model, about a metre across and centred; scale it to fit. One geometry per look, cached. */
export function modelOf(item: ItemDef): BufferGeometry {
  const { look, tint } = lookOf(item);
  const key = `${look}:${tint}`;
  let g = models.get(key);
  if (!g) {
    g = buildModel(look, tint);
    models.set(key, g);
  }
  return g;
}
const models = new Map<string, BufferGeometry>();

function buildModel(look: Look, tint: number): BufferGeometry {
  const m = new ModelBuilder(7);
  switch (look) {
    case 'sword':
      m.taper(0.1, 0.025, 0.02, 0.01, 0.62, { at: [0, -0.2, 0], color: STEEL, jitter: 0.03 });
      m.box(0.34, 0.06, 0.07, { at: [0, -0.22, 0], color: tint });
      m.cyl(0.03, 0.03, 0.2, 6, { at: [0, -0.35, 0], color: LEATHER });
      m.ball(0.05, { at: [0, -0.46, 0], color: tint });
      break;
    case 'bow':
      m.bar([0, -0.45, 0], [0.12, -0.2, 0], 0.05, 0.05, { color: tint });
      m.bar([0.12, -0.2, 0], [0.14, 0.2, 0], 0.05, 0.05, { color: tint });
      m.bar([0.14, 0.2, 0], [0, 0.45, 0], 0.05, 0.05, { color: tint });
      m.bar([0, -0.45, 0], [0, 0.45, 0], 0.012, 0.012, { color: 0xe8e0c8 });
      m.box(0.07, 0.12, 0.07, { at: [0.13, 0, 0], color: LEATHER });
      break;
    case 'wand':
      m.cyl(0.025, 0.035, 0.7, 6, { at: [0, -0.05, 0], color: tint });
      m.ball(0.07, { at: [0, 0.34, 0], color: 0x9ae0ff, glow: 0.5 }, 1);
      break;
    case 'staff':
      m.cyl(0.022, 0.03, 0.95, 6, { at: [0, -0.05, 0], color: tint });
      m.cyl(0.04, 0.04, 0.05, 6, { at: [0, 0.38, 0], color: tint });
      m.ball(0.06, { at: [0, 0.46, 0], color: 0x9ae0ff, glow: 0.5 }, 1);
      break;
    case 'shield':
      m.taper(0.36, 0.06, 0.72, 0.06, 0.4, { at: [0, -0.15, 0], color: tint });
      m.box(0.72, 0.28, 0.06, { at: [0, 0.39, 0], color: tint });
      m.box(0.08, 0.76, 0.07, { at: [0, 0.14, 0], color: tint, jitter: 0.2 });
      m.ball(0.1, { at: [0, 0.2, 0.05], color: STEEL });
      break;
    case 'quiver':
      m.cyl(0.14, 0.11, 0.6, 8, { at: [0, -0.1, 0], color: tint });
      for (const x of [-0.05, 0, 0.05]) m.box(0.02, 0.3, 0.02, { at: [x, 0.3, 0], color: 0xd8d0c0 });
      break;
    case 'focus':
      m.ball(0.26, { at: [0, 0.1, 0], color: tint, glow: 0.3 }, 1);
      m.cyl(0.12, 0.16, 0.14, 6, { at: [0, -0.22, 0], color: PAL.wood });
      break;
    case 'helm':
      m.cyl(0.24, 0.3, 0.32, 8, { at: [0, -0.06, 0], color: tint });
      m.ball(0.25, { at: [0, 0.12, 0], color: tint }, 1);
      m.box(0.66, 0.05, 0.66, { at: [0, -0.22, 0], color: tint, jitter: 0.15 });
      m.box(0.05, 0.26, 0.05, { at: [0, -0.12, 0.3], color: STEEL });
      break;
    case 'chest':
      m.taper(0.44, 0.24, 0.56, 0.28, 0.62, { at: [0, -0.34, 0], color: tint });
      m.box(0.24, 0.14, 0.3, { at: [-0.34, 0.2, 0], color: tint, jitter: 0.15 });
      m.box(0.24, 0.14, 0.3, { at: [0.34, 0.2, 0], color: tint, jitter: 0.15 });
      m.box(0.5, 0.06, 0.3, { at: [0, -0.18, 0], color: LEATHER });
      break;
    case 'gloves':
      for (const x of [-0.2, 0.2]) {
        m.box(0.22, 0.34, 0.12, { at: [x, 0, 0], color: tint });
        m.box(0.26, 0.12, 0.16, { at: [x, -0.2, 0], color: tint, jitter: 0.15 });
        m.box(0.07, 0.14, 0.08, { at: [x + Math.sign(x) * 0.14, 0.02, 0], color: tint });
      }
      break;
    case 'legs':
      m.box(0.5, 0.1, 0.24, { at: [0, 0.38, 0], color: LEATHER });
      m.taper(0.2, 0.2, 0.22, 0.22, 0.72, { at: [-0.13, -0.4, 0], color: tint });
      m.taper(0.2, 0.2, 0.22, 0.22, 0.72, { at: [0.13, -0.4, 0], color: tint });
      break;
    case 'boots':
      for (const x of [-0.16, 0.16]) {
        m.box(0.2, 0.5, 0.22, { at: [x, 0.05, 0], color: tint });
        m.box(0.2, 0.14, 0.44, { at: [x, -0.18, 0.1], color: tint, jitter: 0.15 });
      }
      break;
    case 'flask':
      m.ball(0.26, { at: [0, -0.12, 0], color: tint, glow: 0.25 }, 1);
      m.cyl(0.08, 0.1, 0.24, 6, { at: [0, 0.2, 0], color: 0xc8dce6 });
      m.cyl(0.09, 0.09, 0.08, 6, { at: [0, 0.34, 0], color: PAL.wood });
      break;
    case 'scroll':
      m.cyl(0.12, 0.12, 0.7, 8, { at: [0, 0, 0], rot: [0, 0, Math.PI / 2], color: tint });
      m.cyl(0.13, 0.13, 0.06, 8, { at: [0, 0, 0], rot: [0, 0, Math.PI / 2], color: 0xa02020 });
      break;
    case 'trinket':
      m.shape(new TorusGeometry(0.2, 0.02, 4, 12), { at: [0, 0.22, 0], color: tint });
      m.cyl(0.18, 0.18, 0.06, 10, { at: [0, -0.12, 0], rot: [Math.PI / 2, 0, 0], color: tint, jitter: 0.1 });
      break;
    case 'cloth':
      m.box(0.6, 0.06, 0.44, { at: [0, 0, 0], rot: [0, 0.3, 0.1], color: tint, jitter: 0.2 });
      m.box(0.4, 0.06, 0.3, { at: [0.05, 0.05, 0.02], rot: [0, -0.4, -0.1], color: tint, jitter: 0.2 });
      break;
    case 'charm':
      m.shape(new TorusGeometry(0.2, 0.02, 4, 12), { at: [0, 0.22, 0], color: LEATHER });
      m.taper(0.3, 0.08, 0.02, 0.02, 0.5, { at: [0, -0.4, 0], color: tint, rot: [0, 0, 0] });
      m.box(0.16, 0.1, 0.1, { at: [0, -0.02, 0], color: tint, jitter: 0.2 });
      break;
    case 'dust':
    case 'pouch':
      m.ball(0.28, { at: [0, -0.1, 0], color: look === 'dust' ? LEATHER : tint, jitter: 0.1 }, 1);
      m.cyl(0.1, 0.14, 0.14, 6, { at: [0, 0.22, 0], color: look === 'dust' ? LEATHER : tint });
      if (look === 'dust') m.cyl(0.12, 0.12, 0.04, 6, { at: [0, 0.3, 0], color: tint });
      break;
  }
  return m.build();
}
