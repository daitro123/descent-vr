import type { Vector3 } from 'three';
import { CONFIG } from '../../config';
import { BOARD as BAG_BOARD, type Reach } from '../bag/layout';

// Where everything sits on a vendor's wares board, in the board's own space
// (metres, +X to your right, +Y up, +Z out of its face towards you), and what
// a point there touches: the vendor's name and the "Sell junk" button along
// the top, their stock in a grid of four across with each price under its
// slot, and the Sold row of six along the bottom. The slots are the bag
// panel's size, so an item looks the same on both. The board stands on the
// bag panel's left, turned in towards you as the stash's panel is.

const { slot: S, pitch: P } = CONFIG.bag.panel;
export const SLOT = S;
/** The slots stand this far off the board. */
export const FACE = 0.006;
/** The stock: four across and four down, a price line under each. */
export const GRID = { cols: 4, rows: 4, pitchY: 0.09 };
const GRID_X = Array.from({ length: GRID.cols }, (_, k) => (k - (GRID.cols - 1) / 2) * P);
const GRID_Y = Array.from({ length: GRID.rows }, (_, k) => 0.158 - k * GRID.pitchY);
/** How many wares the grid holds. */
export const WARES = GRID.cols * GRID.rows;
/** The Sold row: the last things sold, newest on the left. */
export const SOLD = { y: -0.222, label: -0.176, count: CONFIG.bag.buyback };
const SOLD_X = Array.from({ length: SOLD.count }, (_, k) => (k - (SOLD.count - 1) / 2) * P);
/** Each price's line, this far under its slot's centre. */
export const PRICE_UNDER = S / 2 + 0.012;
export const BOARD = { left: -0.24, right: 0.24, bottom: -0.285, top: 0.262 };
/** The vendor's name, top left, and the "Sell junk" button, top right. */
export const TITLE = { x: BOARD.left + 0.02, y: 0.232 };
export const SELL_JUNK = { x: 0.16, y: 0.232, w: 0.12, h: 0.038 };
/** Where the card sits, over the board. */
export const CARD = { w: 0.28, h: 0.2, y: BOARD.top + 0.11 };

/** Every slot's count: the wares' sixteen, then the Sold row's six. */
export const SLOTS = WARES + SOLD.count;

/** Is slot `i` in the Sold row? Its index there is `i - WARES`. */
export const isSold = (i: number): boolean => i >= WARES;

export function slotXY(i: number): readonly [number, number] {
  if (isSold(i)) return [SOLD_X[i - WARES], SOLD.y];
  return [GRID_X[i % GRID.cols], GRID_Y[Math.floor(i / GRID.cols)]];
}

/** Is `l` near the face, within `reach`? */
const nearFace = (l: Vector3, reach: Reach) => l.z < FACE + reach.front && l.z > -reach.back;

/** The slot `l` touches, if any, of the first `shown` wares and the Sold row. */
export function slotAt(l: Vector3, reach: Reach, shown: (i: number) => boolean): number | null {
  if (!nearFace(l, reach)) return null;
  for (let i = 0; i < SLOTS; i++) {
    if (!shown(i)) continue;
    const [x, y] = slotXY(i);
    if (Math.abs(l.x - x) < S / 2 + reach.margin && Math.abs(l.y - y) < S / 2 + reach.margin) return i;
  }
  return null;
}

/** Is `l` over the board, within `reach` round it? Letting something of yours go here sells it. */
export function overBoard(l: Vector3, reach: Reach): boolean {
  const m = reach.margin;
  return nearFace(l, reach) && l.x > BOARD.left - m && l.x < BOARD.right + m && l.y > BOARD.bottom - m && l.y < BOARD.top + m;
}

/** Is `l` on the "Sell junk" button? */
export function sellJunkAt(l: Vector3, reach: Reach): boolean {
  return nearFace(l, reach) && Math.abs(l.x - SELL_JUNK.x) < SELL_JUNK.w / 2 + reach.margin && Math.abs(l.y - SELL_JUNK.y) < SELL_JUNK.h / 2 + reach.margin;
}

/** Where the board stands in the bag panel's space: left of it, turned in as the stash's is, its right edge the stash's gap off the bag's. */
export function waresPlacement(): { x: number; z: number; yaw: number } {
  const { gap, turn } = CONFIG.bag.stashPanel;
  const yaw = (turn * Math.PI) / 180;
  const half = (BOARD.right - BOARD.left) / 2;
  return { x: BAG_BOARD.left - gap - half * Math.cos(yaw), z: half * Math.sin(yaw), yaw };
}
