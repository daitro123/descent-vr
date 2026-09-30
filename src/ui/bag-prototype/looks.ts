import { CanvasTexture, type BufferGeometry, NearestFilter, SRGBColorSpace, TorusGeometry } from 'three';
import { ModelBuilder } from '../../models/kit';
import { ALL_ITEMS, GEAR_SLOTS, type GearSlot, type Item, type Look } from './items';

// PROTOTYPE (The bag and the gear panel): how items are drawn. Two ways, to
// weigh against the draw-call budget: flat icons, every item in one texture
// atlas, so all 23 slots are a single draw; or a small 3D model per item, one
// draw each. The item you've picked up is always its model.

/** The atlas is a CELLS × CELLS grid of icons: every item's, then a faint outline for each empty gear slot. */
export const CELLS = 5;
const CELL = 128;
/** A cell left blank, for an empty bag slot. */
export const EMPTY_CELL = CELLS * CELLS - 1;
/** What an empty gear slot shows, faintly, so you know what goes there. */
const GHOST: Record<GearSlot, Look> = { mainHand: 'sword', offHand: 'shield', head: 'helm', chest: 'chest', hands: 'gloves', legs: 'legs', feet: 'boots' };

/** Which atlas cell an item's icon is in. */
export function cellOf(it: Item): number {
  return ALL_ITEMS.indexOf(it);
}

/** Which atlas cell an empty gear slot's outline is in. */
export function ghostCellOf(slot: GearSlot): number {
  return ALL_ITEMS.length + GEAR_SLOTS.indexOf(slot);
}

function hex(c: number, k = 1): string {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k));
  const b = Math.min(255, Math.round((c & 255) * k));
  return `rgb(${r},${g},${b})`;
}

const STEEL = 0xc8d0d8;
const LEATHER = 0x4a3020;

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
    case 'charm':
      c.beginPath();
      c.moveTo(0.3, 0.12);
      c.quadraticCurveTo(0.5, 0.45, 0.7, 0.12);
      c.strokeStyle = hex(LEATHER, 1.4);
      c.lineWidth = 0.035;
      c.stroke();
      c.strokeStyle = 'rgba(0,0,0,0.75)';
      c.lineWidth = 0.04;
      fill(hex(tint), () => {
        c.moveTo(0.5, 0.36);
        c.lineTo(0.68, 0.6);
        c.lineTo(0.5, 0.88);
        c.lineTo(0.32, 0.6);
        c.closePath();
      });
      c.beginPath();
      c.moveTo(0.46, 0.5);
      c.lineTo(0.56, 0.66);
      c.lineTo(0.48, 0.76);
      c.stroke();
      break;
    case 'rope':
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.ellipse(0.5, 0.52 + (i - 1) * 0.1, 0.32 - i * 0.04, 0.14, 0, 0, Math.PI * 2);
        c.strokeStyle = 'rgba(0,0,0,0.75)';
        c.lineWidth = 0.1;
        c.stroke();
        c.strokeStyle = hex(tint);
        c.lineWidth = 0.06;
        c.stroke();
      }
      break;
  }
}

/** Every icon in one texture: a CELLS × CELLS grid, the top-left cell first. */
export function buildAtlas(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = CELLS * CELL;
  const c = canvas.getContext('2d')!;
  // Every cell's dark ground, inset so the slot's frame shows round it in the rarity's colour.
  for (let i = 0; i < CELLS * CELLS; i++) {
    c.fillStyle = '#1e1610';
    c.fillRect((i % CELLS) * CELL, Math.floor(i / CELLS) * CELL, CELL, CELL);
  }
  ALL_ITEMS.forEach((it, i) => {
    c.save();
    c.translate((i % CELLS) * CELL + CELL * 0.1, Math.floor(i / CELLS) * CELL + CELL * 0.1);
    c.scale(CELL * 0.8, CELL * 0.8);
    drawIcon(c, it.look, it.tint);
    c.restore();
  });
  for (const slot of GEAR_SLOTS) {
    const i = ghostCellOf(slot);
    c.save();
    c.globalAlpha = 0.22;
    c.translate((i % CELLS) * CELL + CELL * 0.1, Math.floor(i / CELLS) * CELL + CELL * 0.1);
    c.scale(CELL * 0.8, CELL * 0.8);
    drawIcon(c, GHOST[slot], 0xb0a080);
    c.restore();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.anisotropy = 4;
  return texture;
}

/** An item's small 3D model, about a metre across and centred; scale it to fit. One geometry per item, cached. */
export function modelOf(it: Item): BufferGeometry {
  let g = models.get(it);
  if (!g) {
    g = buildModel(it.look, it.tint);
    models.set(it, g);
  }
  return g;
}
const models = new Map<Item, BufferGeometry>();

function buildModel(look: Look, tint: number): BufferGeometry {
  const m = new ModelBuilder(7);
  switch (look) {
    case 'sword':
      m.taper(0.1, 0.025, 0.02, 0.01, 0.62, { at: [0, -0.2, 0], color: STEEL, jitter: 0.03 });
      m.box(0.34, 0.06, 0.07, { at: [0, -0.22, 0], color: tint });
      m.cyl(0.03, 0.03, 0.2, 6, { at: [0, -0.35, 0], color: LEATHER });
      m.ball(0.05, { at: [0, -0.46, 0], color: tint });
      break;
    case 'shield':
      m.taper(0.36, 0.06, 0.72, 0.06, 0.4, { at: [0, -0.15, 0], color: tint });
      m.box(0.72, 0.28, 0.06, { at: [0, 0.39, 0], color: tint });
      m.box(0.08, 0.76, 0.07, { at: [0, 0.14, 0], color: tint, jitter: 0.2 });
      m.ball(0.1, { at: [0, 0.2, 0.05], color: STEEL });
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
    case 'charm':
      m.shape(new TorusGeometry(0.2, 0.02, 4, 12), { at: [0, 0.22, 0], color: LEATHER });
      m.taper(0.3, 0.08, 0.02, 0.02, 0.5, { at: [0, -0.4, 0], color: tint, rot: [0, 0, 0] });
      m.box(0.16, 0.1, 0.1, { at: [0, -0.02, 0], color: tint, jitter: 0.2 });
      break;
    case 'rope':
      for (let i = 0; i < 3; i++) {
        m.shape(new TorusGeometry(0.34 - i * 0.05, 0.06, 4, 14), { at: [0, -0.12 + i * 0.12, 0], rot: [Math.PI / 2, 0, 0], color: tint, jitter: 0.15 });
      }
      break;
  }
  return m.build();
}
