import { BoxGeometry, BufferAttribute, BufferGeometry, type Color, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import type { Stack } from '../../inventory';
import { type Card, FONT, roundRect } from '../card';
import type { CardText } from './cardLines';
import { FACE } from './layout';
import { BLANK_CELL, type IconAtlas, RARITY_COLOUR } from './looks';

// What a panel of slots is made of, shared by the bag's panel and the ones
// opened beside it (the stash's): every slot's frame in one draw, every
// slot's icon and count from one atlas in one more, and an item's card.

/** A slot on a panel's face: its middle, and whether it shows a stack's count. */
export interface SlotPoint {
  readonly x: number;
  readonly y: number;
  readonly counts: boolean;
}

/** A stack's count: two digits in the slot's lower right corner, for a slot `size` square. */
const digitsFor = (size: number) => ({ size: 0.018, x: size / 2 - 0.02, y: -size / 2 + 0.011, gap: 0.011 });

const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _p = new Vector3();

/**
 * Slots' frames and icons at `points`, each `size` square: two draws however
 * many there are. Colour a frame, point an icon at its atlas cell, and set a
 * count; then say it's `painted`. With `dims`, an icon and its count can be
 * drawn darker (a ware you can't afford).
 */
export class SlotMeshes {
  readonly frames: InstancedMesh;
  readonly icons: Mesh<BufferGeometry, MeshBasicMaterial>;
  private readonly uv: BufferAttribute;
  /** Each quad's brightness, with `dims`. */
  private readonly tint: BufferAttribute | null = null;
  /** Each slot's first digit's quad, or −1 for a slot without a count. */
  private readonly digits: number[] = [];

  constructor(
    points: readonly SlotPoint[],
    size: number,
    private readonly atlas: IconAtlas,
    dims = false,
  ) {
    this.frames = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ fog: false }), points.length);
    points.forEach(({ x, y }, i) => this.frames.setMatrixAt(i, _m.compose(_p.set(x, y, FACE / 2), _q.identity(), _s.set(size, size, FACE))));
    this.frames.frustumCulled = false;

    const D = digitsFor(size);
    const quads = points.length + points.filter((p) => p.counts).length * 2;
    const pos = new Float32Array(quads * 4 * 3);
    const index: number[] = [];
    const quad = (q: number, x: number, y: number, half: number, z: number) => {
      pos.set([x - half, y - half, z, x + half, y - half, z, x + half, y + half, z, x - half, y + half, z], q * 12);
      index.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
    };
    points.forEach(({ x, y }, i) => quad(i, x, y, size * 0.4, FACE + 0.001));
    let q = points.length;
    points.forEach(({ x, y, counts }) => {
      this.digits.push(counts ? q : -1);
      if (!counts) return;
      for (let d = 0; d < 2; d++) quad(q++, x + D.x - (1 - d) * D.gap, y + D.y, D.size / 2, FACE + 0.002);
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(pos, 3));
    this.uv = new BufferAttribute(new Float32Array(quads * 4 * 2), 2);
    geometry.setAttribute('uv', this.uv);
    if (dims) {
      this.tint = new BufferAttribute(new Float32Array(quads * 4 * 3).fill(1), 3);
      geometry.setAttribute('color', this.tint);
    }
    geometry.setIndex(index);
    this.icons = new Mesh(geometry, new MeshBasicMaterial({ map: atlas.texture, transparent: true, alphaTest: 0.05, fog: false, vertexColors: dims }));
    this.icons.frustumCulled = false;
  }

  /** Slot `i`'s frame in `c`. */
  colour(i: number, c: Color): void {
    this.frames.setColorAt(i, c);
  }

  /** The frames' colours are all set. */
  coloured(): void {
    this.frames.instanceColor!.needsUpdate = true;
  }

  /** Draw only the first `n` frames (the rest's icons should be blank). */
  set shown(n: number) {
    this.frames.count = n;
  }

  /** Slot `i`'s icon: the atlas's cell `cell`. */
  icon(i: number, cell: number): void {
    this.cell(i, cell);
  }

  /** Slot `i`'s count: shown from 2 up, blank otherwise. */
  count(i: number, n: number): void {
    const q = this.digits[i];
    if (q < 0) return;
    this.cell(q, n >= 10 ? this.atlas.digit(Math.floor(n / 10) % 10) : BLANK_CELL);
    this.cell(q + 1, n > 1 ? this.atlas.digit(n % 10) : BLANK_CELL);
  }

  /** Slot `i`'s icon and count drawn at brightness `k` (1 as they are), with `dims`. */
  dim(i: number, k: number): void {
    if (!this.tint) return;
    const a = this.tint.array as Float32Array;
    a.fill(k, i * 12, i * 12 + 12);
    const q = this.digits[i];
    if (q >= 0) a.fill(k, q * 12, q * 12 + 24);
  }

  /** The icons and counts are all set. */
  painted(): void {
    this.uv.needsUpdate = true;
    if (this.tint) this.tint.needsUpdate = true;
  }

  private cell(q: number, cell: number): void {
    const [u0, v0, u1, v1] = this.atlas.uv(cell);
    (this.uv.array as Float32Array).set([u0, v0, u1, v0, u1, v1, u0, v1], q * 8);
  }
}

/** The line along a card's foot: what a vendor pays for it, or what it costs. */
export interface CardFooter {
  readonly text: string;
  readonly colour: string;
}

/** "1 coin", "12 coins". */
export const coinsText = (n: number): string => `${n} ${n === 1 ? 'coin' : 'coins'}`;

/**
 * Paint an item's card: its name in its rarity's colour, what it is, its lock
 * and level, its numbers against what's worn, and along its foot what a vendor
 * pays, or `footer` in its place (a ware's price).
 */
export function paintCard(card: Card, text: CardText, key: string, footer?: CardFooter): void {
  const foot = footer ?? (text.sells ? { text: `Sells for ${coinsText(text.sells)}`, colour: '#a89c80' } : null);
  card.paint(`${key}|${foot?.text}|${foot?.colour}`, (c, w, h) => {
    const colour = RARITY_COLOUR[text.rarity];
    c.fillStyle = 'rgba(12, 10, 16, 0.94)';
    roundRect(c, 0, 0, w, h, 18);
    c.fill();
    c.strokeStyle = colour;
    c.lineWidth = 4;
    roundRect(c, 3, 3, w - 6, h - 6, 16);
    c.stroke();
    c.textBaseline = 'top';
    c.fillStyle = colour;
    c.font = `bold 32px ${FONT}`;
    c.fillText(text.count > 1 ? `${text.name} ×${text.count}` : text.name, 20, 14, w - 40);
    c.font = `24px ${FONT}`;
    let y = 54;
    // What it is, and the class it's locked to (red if it isn't yours).
    c.fillStyle = '#a89c80';
    const kind = text.worn ? `${text.kind} · worn` : text.kind;
    c.fillText(kind, 20, y);
    if (text.lock) {
      c.fillStyle = text.lock.yours ? '#a89c80' : '#ff5040';
      c.textAlign = 'right';
      c.fillText(text.lock.name, w - 20, y);
      c.textAlign = 'left';
    }
    y += 30;
    if (text.level) {
      c.fillStyle = text.level.reached ? '#a89c80' : '#ff5040';
      c.fillText(`Item level ${text.level.value}`, 20, y);
      y += 32;
    }
    c.font = `26px ${FONT}`;
    for (const s of text.stats) {
      c.fillStyle = s.yours ? '#ece6d6' : '#6a6458';
      c.fillText(`${s.name} ${s.value}`, 20, y);
      if (s.diff) {
        c.fillStyle = s.diff > 0 ? '#40e040' : '#ff5040';
        c.fillText(`${s.diff > 0 ? '+' : '−'}${Math.abs(s.diff)}${s.name === 'Damage' ? '%' : ''}`, 270, y);
      }
      y += 30;
    }
    if (text.note) {
      c.fillStyle = '#ece6d6';
      c.fillText(text.note, 20, y, w - 40);
    }
    if (foot) {
      c.fillStyle = foot.colour;
      c.font = `20px ${FONT}`;
      c.textAlign = 'right';
      c.fillText(foot.text, w - 20, h - 32);
      c.textAlign = 'left';
    }
  });
}

/** The key a card is repainted by: the stack, and what it's compared against. */
export const cardKey = (stack: Stack, gear: object, level: number): string => `${stack.id}|${stack.count}|${JSON.stringify(gear)}|${level}`;
