import type { Vector3 } from 'three';
import { CONFIG } from '../../config';
import { GEAR_SLOTS, type GearSlot } from '../../items';

// Where everything sits on the bag panel, in the panel's own space (metres,
// +X to your right, +Y up, +Z out of its face towards you), and what a point
// there touches: the sixteen slots of the page showing on the right, the
// seven gear slots round the figure of you on the left, the belt's two hip
// slots under the figure, and the page tabs along the top. From the bag
// prototype's panel (ui/bag-prototype/panel.ts).

/** A slot on the panel: one of the page's sixteen (the bag's, or the quest page's), a gear slot, or one of the belt's. */
export type Spot =
  | { readonly in: 'grid'; readonly i: number }
  | { readonly in: 'gear'; readonly slot: GearSlot }
  | { readonly in: 'belt'; readonly slot: number };

/** The pages the tabs switch between. The talent page is the Abilities map's to fill. */
export const PAGES = ['bag', 'quest', 'talents'] as const;
export type Page = (typeof PAGES)[number];
export const PAGE_NAME: Readonly<Record<Page, string>> = { bag: 'Bag', quest: 'Quests', talents: 'Talents' };

/** How close counts, round a slot's face, in front of it and behind it (m). */
export interface Reach {
  readonly margin: number;
  readonly front: number;
  readonly back: number;
}

const { slot: S, pitch: P } = CONFIG.bag.panel;
export const SLOT = S;
/** The slots stand this far off the board. */
export const FACE = 0.006;
const ROWS = [1.5 * P, 0.5 * P, -0.5 * P, -1.5 * P];
const GRID_X = [0, 1, 2, 3].map((k) => 0.076 + k * P);
const GEAR_AT: Readonly<Record<GearSlot, readonly [number, number]>> = {
  head: [-0.27, ROWS[0]],
  chest: [-0.27, ROWS[1]],
  legs: [-0.27, ROWS[2]],
  feet: [-0.27, ROWS[3]],
  hands: [-0.05, ROWS[0]],
  mainHand: [-0.05, ROWS[1]],
  offHand: [-0.05, ROWS[2]],
};
export const FIGURE = { x: -0.16, bottom: -0.135, height: 0.27, halfWidth: 0.055 };
/** The belt's two slots, under the figure: the left hip's on your left, the right's on your right. */
const BELT_AT = [FIGURE.x - P / 2, FIGURE.x + P / 2].map((x) => [x, -0.178] as const);
/** The tabs along the top, over the page they switch. */
const GRID_MIDDLE = (GRID_X[0] + GRID_X[3]) / 2;
export const TABS = { y: 0.188, w: 0.086, h: 0.036, x: [-1, 0, 1].map((k) => GRID_MIDDLE + k * 0.092) };
export const BOARD = { left: -0.315, right: 0.335, bottom: -0.225, top: TABS.y + TABS.h / 2 + 0.006 };
/** The coin count, under the page's slots. */
export const COINS = { x: GRID_MIDDLE, y: -0.19 };
/** Where the card sits, over the panel. */
export const CARD = { w: 0.28, h: 0.2, y: BOARD.top + 0.11 };

/** Every slot, in the order the panel draws them: the gear slots, the belt's, then the page's sixteen. */
export const SPOTS: readonly Spot[] = [
  ...GEAR_SLOTS.map((slot) => ({ in: 'gear', slot }) as const),
  ...Array.from({ length: CONFIG.belt.slots }, (_, slot) => ({ in: 'belt', slot }) as const),
  ...Array.from({ length: CONFIG.bag.slots }, (_, i) => ({ in: 'grid', i }) as const),
];

export function spotXY(spot: Spot): readonly [number, number] {
  if (spot.in === 'grid') return [GRID_X[spot.i % 4], ROWS[Math.floor(spot.i / 4)]];
  return spot.in === 'belt' ? BELT_AT[spot.slot] : GEAR_AT[spot.slot];
}

export function sameSpot(a: Spot | null, b: Spot | null): boolean {
  if (!a || !b) return a === b;
  if (a.in === 'grid') return b.in === 'grid' && a.i === b.i;
  return a.in === b.in && a.slot === (b as typeof a).slot;
}

/** Is `l` near the face, within `reach`? */
const nearFace = (l: Vector3, reach: Reach) => l.z < FACE + reach.front && l.z > -reach.back;

/** The slot `l` touches, if any; the page's sixteen only if `grid` (the talent page has none). */
export function spotAt(l: Vector3, reach: Reach, grid: boolean): Spot | null {
  if (!nearFace(l, reach)) return null;
  for (const spot of SPOTS) {
    if (spot.in === 'grid' && !grid) continue;
    const [x, y] = spotXY(spot);
    if (Math.abs(l.x - x) < S / 2 + reach.margin && Math.abs(l.y - y) < S / 2 + reach.margin) return spot;
  }
  return null;
}

/** Is `l` over the figure of you? Letting a piece go there wears it. */
export function figureAt(l: Vector3, reach: Reach): boolean {
  return nearFace(l, reach) && Math.abs(l.x - FIGURE.x) < FIGURE.halfWidth && l.y > FIGURE.bottom && l.y < FIGURE.bottom + FIGURE.height;
}

/** The slot whose centre is nearest `l`, within `near` of it: a carried item is aimed by eye, not by the hand. */
export function nearestSpot(l: Vector3, reach: Reach, grid: boolean, near: number): Spot | null {
  if (!nearFace(l, reach)) return null;
  let best: Spot | null = null;
  let bestD = near;
  for (const spot of SPOTS) {
    if (spot.in === 'grid' && !grid) continue;
    const [x, y] = spotXY(spot);
    const d = Math.hypot(l.x - x, l.y - y);
    if (d < bestD) {
      best = spot;
      bestD = d;
    }
  }
  return best;
}

/** Is `l` over the panel? Letting a carried item go anywhere else drops it. */
export function overBoard(l: Vector3, reach: Reach): boolean {
  const m = 0.03;
  return nearFace(l, reach) && l.x > BOARD.left - m && l.x < BOARD.right + m && l.y > BOARD.bottom - m && l.y < BOARD.top + m;
}

/** The tab `l` touches, if any. */
export function tabAt(l: Vector3, reach: Reach): Page | null {
  if (!nearFace(l, reach) || Math.abs(l.y - TABS.y) > TABS.h / 2 + reach.margin) return null;
  const i = TABS.x.findIndex((x) => Math.abs(l.x - x) < TABS.w / 2 + reach.margin);
  return i < 0 ? null : PAGES[i];
}
