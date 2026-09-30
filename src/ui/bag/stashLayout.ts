import type { Vector3 } from 'three';
import { CONFIG } from '../../config';
import type { Where } from '../../inventory';
import { BOARD as BAG_BOARD, nearFace, type Reach, TABS as BAG_TABS } from './layout';

// Where everything sits on the stash panel, in its own space (as the bag
// panel's: metres, +X to your right, +Y up, +Z out of its face), and what a
// point there touches: a page of sixteen slots, the two page tabs along the
// top, and the stash's name under the slots. The panel stands on the bag
// panel's left, turned in towards you (.scratch/inventory/spec.md, "The stash
// panel").

const { slot: S, pitch: P } = CONFIG.bag.panel;
/** Slots on a page: as many as the bag's. */
export const PER_PAGE = CONFIG.bag.slots;
/** Its pages: the stash's slots, sixteen to a page. */
export const STASH_PAGES = Math.ceil(CONFIG.bag.stash / PER_PAGE);
const COLUMNS = 4;
const X = Array.from({ length: COLUMNS }, (_, k) => (k - (COLUMNS - 1) / 2) * P);
const Y = Array.from({ length: PER_PAGE / COLUMNS }, (_, k) => ((PER_PAGE / COLUMNS - 1) / 2 - k) * P);

/** The page tabs along the top, level with the bag's. */
export const STASH_TABS = { y: BAG_TABS.y, w: BAG_TABS.w, h: BAG_TABS.h, x: Array.from({ length: STASH_PAGES }, (_, k) => (k - (STASH_PAGES - 1) / 2) * 0.092) };
const HALF = X[COLUMNS - 1] + S / 2 + 0.04;
export const STASH_BOARD = { left: -HALF, right: HALF, bottom: BAG_BOARD.bottom, top: BAG_BOARD.top };
/** The stash's name and how full it is, under the slots, where the bag has its coins. */
export const STASH_CAPTION = { x: 0, y: -0.19 };
/** Its card: over the panel, as the bag's is. */
export const STASH_CARD = { w: 0.28, h: 0.2, y: STASH_BOARD.top + 0.11 };

/** Where the panel stands in the bag panel's space: left of it, turned in by `turn`, its right edge `gap` off the bag's. */
export function stashPlacement(): { x: number; z: number; yaw: number } {
  const { gap, turn } = CONFIG.bag.stashPanel;
  const yaw = (turn * Math.PI) / 180;
  return { x: BAG_BOARD.left - gap - HALF * Math.cos(yaw), z: HALF * Math.sin(yaw), yaw };
}

/** Slot `i` of a page's middle. */
export function stashXY(i: number): readonly [number, number] {
  return [X[i % COLUMNS], Y[Math.floor(i / COLUMNS)]];
}

/** The place in your things slot `i` of page `page` is. */
export const stashWhere = (page: number, i: number): Where => ({ in: 'stash', slot: page * PER_PAGE + i });

/** The slot of a page `l` touches, if any. */
export function stashSpotAt(l: Vector3, reach: Reach): number | null {
  if (!nearFace(l, reach)) return null;
  for (let i = 0; i < PER_PAGE; i++) {
    const [x, y] = stashXY(i);
    if (Math.abs(l.x - x) < S / 2 + reach.margin && Math.abs(l.y - y) < S / 2 + reach.margin) return i;
  }
  return null;
}

/** The slot whose middle is nearest `l`, within `near` of it: a carried item is aimed by eye, not by the hand. */
export function stashNearest(l: Vector3, reach: Reach, near: number): number | null {
  if (!nearFace(l, reach)) return null;
  let best: number | null = null;
  let bestD = near;
  for (let i = 0; i < PER_PAGE; i++) {
    const [x, y] = stashXY(i);
    const d = Math.hypot(l.x - x, l.y - y);
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

/** The page tab `l` touches, if any. */
export function stashTabAt(l: Vector3, reach: Reach): number | null {
  if (!nearFace(l, reach) || Math.abs(l.y - STASH_TABS.y) > STASH_TABS.h / 2 + reach.margin) return null;
  const i = STASH_TABS.x.findIndex((x) => Math.abs(l.x - x) < STASH_TABS.w / 2 + reach.margin);
  return i < 0 ? null : i;
}

/** Is `l` over the panel? */
export function overStash(l: Vector3, reach: Reach): boolean {
  const m = 0.03;
  const B = STASH_BOARD;
  return nearFace(l, reach) && l.x > B.left - m && l.x < B.right + m && l.y > B.bottom - m && l.y < B.top + m;
}
