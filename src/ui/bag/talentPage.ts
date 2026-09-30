import type { Vector3 } from 'three';
import { ABILITY, type ClassId, type Shape, SHAPES, type Slots } from '../../classes';
import { SHAPE } from '../../player/gestures/shapes';
import { type Talent, TALENT, type TalentRefusal, talentsIn, tierOpensAt, tiersOf, type Tree, treeName, treesOf } from '../../talents';
import { FONT, roundRect } from '../card';
import { BOARD, nearFace, type Reach } from './layout';

// The talent page of the bag panel, a plain first pass until Tom's UI overhaul
// (.scratch/abilities/spec.md, "Talents on the bag's panel"): your class's two
// trees side by side, each talent a button with its points and maximum, the
// tiers not yet open dimmed; the points left and a Reset button; and under
// them the gesture slots, each shape with the ability it holds, two pressed
// one after the other swapping. It takes the whole board: the gear slots and
// the figure stand aside while it shows. Painted on the board's canvas, so it
// costs no draw of its own. Where it all sits is in the panel's own space, as
// layout.ts has the rest.

/** Something pressed on the talent page. */
export type TalentButton = { readonly kind: 'talent'; readonly talent: Talent } | { readonly kind: 'reset' } | { readonly kind: 'slot'; readonly shape: Shape };

export const sameButton = (a: TalentButton | null, b: TalentButton | null): boolean => {
  if (!a || !b) return a === b;
  if (a.kind === 'talent') return b.kind === 'talent' && a.talent === b.talent;
  if (a.kind === 'slot') return b.kind === 'slot' && a.shape === b.shape;
  return a.kind === b.kind;
};

/** What the talent page reads of your character: the adventure state answers it. */
export interface TalentState {
  readonly class: ClassId;
  readonly pointsLeft: number;
  readonly pointsSpent: number;
  readonly slots: Slots;
  spentOn(talent: Talent): number;
  spentIn(tree: Tree): number;
  opens(tree: Tree, tier: number): boolean;
}

/** What the talent page does: through the adventure state, shown and saved. Each answers why nothing happened, or null. */
export interface TalentActs {
  readonly state: TalentState;
  /** Is anything fighting you? The page works only out of a fight. */
  fighting(): boolean;
  spend(talent: Talent): TalentRefusal | null;
  reset(): TalentRefusal | null;
  swap(a: Shape, b: Shape): TalentRefusal | null;
}

/** A button's rectangle, by its centre, in the panel's space (m). */
interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Where everything sits on the page for a class. */
interface Layout {
  readonly trees: readonly { readonly tree: Tree; readonly x: number; readonly tiers: readonly { readonly tier: number; readonly y: number }[] }[];
  readonly buttons: readonly { readonly button: TalentButton; readonly rect: Rect }[];
}

/** The two columns' centres and width, the rows' places and the buttons' sizes (m). */
export const PAGE = {
  columns: [-0.155, 0.175],
  column: 0.29,
  heading: 0.15,
  firstTier: 0.112,
  tierStep: 0.05,
  talent: { h: 0.042, gap: 0.008 },
  points: { x: -0.29, y: -0.034 },
  reset: { x: 0.265, y: -0.034, w: 0.1, h: 0.036 },
  slotsLabel: -0.072,
  slot: { y: -0.12, w: 0.118, h: 0.052, step: 0.126 },
  line: -0.19,
};

const layouts = new Map<ClassId, Layout>();

/** Where every button sits for a `klass`: its trees' talents by tier, Reset, and the five shapes. */
export function layoutOf(klass: ClassId): Layout {
  const had = layouts.get(klass);
  if (had) return had;
  const buttons: { button: TalentButton; rect: Rect }[] = [];
  const trees = treesOf(klass).map((tree, c) => {
    const x = PAGE.columns[c];
    const tiers = tiersOf(tree).map((tier, row) => {
      const y = PAGE.firstTier - row * PAGE.tierStep;
      const talents = talentsIn(tree).filter((t) => TALENT[t].tier === tier);
      const { h, gap } = PAGE.talent;
      const w = (PAGE.column - gap * (talents.length - 1)) / talents.length;
      talents.forEach((talent, i) => buttons.push({ button: { kind: 'talent', talent }, rect: { x: x - PAGE.column / 2 + w / 2 + i * (w + gap), y, w, h } }));
      return { tier, y };
    });
    return { tree, x, tiers };
  });
  const R = PAGE.reset;
  buttons.push({ button: { kind: 'reset' }, rect: { x: R.x, y: R.y, w: R.w, h: R.h } });
  const S = PAGE.slot;
  const middle = (BOARD.left + BOARD.right) / 2;
  SHAPES.forEach((shape, i) => buttons.push({ button: { kind: 'slot', shape }, rect: { x: middle + (i - (SHAPES.length - 1) / 2) * S.step, y: S.y, w: S.w, h: S.h } }));
  const layout = { trees, buttons };
  layouts.set(klass, layout);
  return layout;
}

/** The button `l` (in the panel's space) touches on a `klass`'s page, if any. */
export function buttonAt(l: Vector3, reach: Reach, klass: ClassId): TalentButton | null {
  if (!nearFace(l, reach)) return null;
  const hit = layoutOf(klass).buttons.find(({ rect: r }) => Math.abs(l.x - r.x) < r.w / 2 + reach.margin && Math.abs(l.y - r.y) < r.h / 2 + reach.margin);
  return hit?.button ?? null;
}

/** The centre of a button on a `klass`'s page, in the panel's space. */
export function buttonXY(button: TalentButton, klass: ClassId): readonly [number, number] | null {
  const hit = layoutOf(klass).buttons.find((b) => sameButton(b.button, button));
  return hit ? [hit.rect.x, hit.rect.y] : null;
}

/** What the page shows beyond your talents: the button a fist or the tip is on, the shape picked to swap, and whether you're fighting. */
export interface PageShows {
  readonly lit: TalentButton | null;
  readonly picked: Shape | null;
  readonly fighting: boolean;
}

/** Everything the page shows, as a key: it's painted again only when this changes. */
export function pageKey(state: TalentState, shows: PageShows): string {
  const { buttons } = layoutOf(state.class);
  const points = buttons.map(({ button: b }) => (b.kind === 'talent' ? state.spentOn(b.talent) : b.kind === 'slot' ? (state.slots[b.shape] ?? '-') : state.pointsLeft));
  const lit = shows.lit ? JSON.stringify(shows.lit) : '';
  return `${points.join(',')}|${lit}|${shows.picked}|${shows.fighting}`;
}

/** What the line at the page's foot says: the lit talent's or shape's, or how the page works. */
function footLine(state: TalentState, shows: PageShows): string {
  if (shows.fighting) return 'Not in a fight: your talents wait until nothing fights you.';
  const lit = shows.lit;
  if (lit?.kind === 'talent') {
    const def = TALENT[lit.talent];
    return state.opens(def.tree, def.tier) ? def.line : `${def.line} (Opens at ${tierOpensAt(def.tier)} points in ${treeName(def.tree)}.)`;
  }
  if (lit?.kind === 'slot' || shows.picked) return shows.picked ? 'Press another shape to swap the two.' : 'Press two shapes to swap what they cast.';
  if (lit?.kind === 'reset') return 'Every point back, free.';
  return state.pointsLeft > 0 ? 'Press a talent to spend a point in it.' : 'A point to spend comes with each level.';
}

/** Paint the page on the board's canvas: `px` and `py` turn the panel's metres into pixels, `k` pixels a metre. */
export function paintPage(c: CanvasRenderingContext2D, px: (x: number) => number, py: (y: number) => number, k: number, state: TalentState, shows: PageShows): void {
  const layout = layoutOf(state.class);
  c.textBaseline = 'middle';
  // Each tree's name and the points in it; faint tier numbers down its side.
  for (const { tree, x, tiers } of layout.trees) {
    c.textAlign = 'center';
    c.font = `bold ${Math.round(0.022 * k)}px ${FONT}`;
    c.fillStyle = '#f0e0b0';
    c.fillText(`${treeName(tree)}  ${state.spentIn(tree)}`, px(x), py(PAGE.heading));
    c.font = `${Math.round(0.012 * k)}px ${FONT}`;
    for (const { tier, y } of tiers) {
      c.fillStyle = state.opens(tree, tier) ? '#8a7a60' : '#4a3e30';
      c.fillText(`${tier}`, px(x - PAGE.column / 2 - 0.008), py(y));
    }
  }
  for (const { button, rect } of layout.buttons) paintButton(c, px, py, k, rect, button, state, shows);
  // The points left, the heading over the shapes and the line at the foot.
  c.textAlign = 'left';
  c.font = `bold ${Math.round(0.018 * k)}px ${FONT}`;
  c.fillStyle = state.pointsLeft > 0 ? '#ffd23a' : '#a89c80';
  c.fillText(`${state.pointsLeft} ${state.pointsLeft === 1 ? 'point' : 'points'} to spend`, px(PAGE.points.x), py(PAGE.points.y));
  c.textAlign = 'center';
  c.font = `bold ${Math.round(0.014 * k)}px ${FONT}`;
  c.fillStyle = '#a89c80';
  c.fillText('Gestures', px((BOARD.left + BOARD.right) / 2), py(PAGE.slotsLabel));
  c.font = `${Math.round(0.013 * k)}px ${FONT}`;
  c.fillStyle = shows.fighting ? '#e08060' : '#c8bca0';
  c.fillText(footLine(state, shows), px((BOARD.left + BOARD.right) / 2), py(PAGE.line), (BOARD.right - BOARD.left - 0.03) * k);
}

function paintButton(
  c: CanvasRenderingContext2D,
  px: (x: number) => number,
  py: (y: number) => number,
  k: number,
  r: Rect,
  button: TalentButton,
  state: TalentState,
  shows: PageShows,
): void {
  const lit = sameButton(button, shows.lit);
  const x = px(r.x - r.w / 2);
  const y = py(r.y + r.h / 2);
  const w = r.w * k;
  const h = r.h * k;
  let open = true;
  let marked = false;
  if (button.kind === 'talent') {
    const def = TALENT[button.talent];
    open = state.opens(def.tree, def.tier);
    marked = state.spentOn(button.talent) > 0;
  } else if (button.kind === 'slot') marked = shows.picked === button.shape;
  c.fillStyle = !open ? '#20180f' : lit ? '#6a4a24' : marked ? '#4a3418' : '#3a2716';
  roundRect(c, x, y, w, h, 8);
  c.fill();
  c.strokeStyle = lit ? '#f0c060' : marked ? '#c89a40' : open ? '#5a4632' : '#2e2418';
  c.lineWidth = marked || lit ? 4 : 2;
  c.stroke();
  const ink = open ? '#f0e0b0' : '#5a4c3c';
  switch (button.kind) {
    case 'talent': {
      const def = TALENT[button.talent];
      const points = state.spentOn(button.talent);
      c.textAlign = 'left';
      c.font = `bold ${Math.round(0.0135 * k)}px ${FONT}`;
      c.fillStyle = ink;
      c.fillText(def.name, x + 0.006 * k, y + h * 0.36, w - 0.036 * k);
      c.font = `${Math.round(0.011 * k)}px ${FONT}`;
      c.fillStyle = def.ability ? (open ? '#9fd8ff' : '#3c4c58') : open ? '#a89c80' : '#4a3e30';
      c.fillText(def.ability ? 'ability' : `tier ${def.tier}`, x + 0.006 * k, y + h * 0.74);
      c.textAlign = 'right';
      c.font = `bold ${Math.round(0.016 * k)}px ${FONT}`;
      c.fillStyle = !open ? '#5a4c3c' : points >= def.max ? '#ffd23a' : points > 0 ? '#f0c060' : '#c8bca0';
      c.fillText(`${points}/${def.max}`, x + w - 0.006 * k, y + h / 2);
      return;
    }
    case 'reset':
      c.textAlign = 'center';
      c.font = `bold ${Math.round(0.015 * k)}px ${FONT}`;
      c.fillStyle = ink;
      c.fillText('Reset', x + w / 2, y + h / 2);
      return;
    case 'slot': {
      const ability = state.slots[button.shape];
      paintShape(c, button.shape, x + 0.018 * k, y + h / 2, 0.011 * k, ability ? '#f0c060' : '#5a4c3c');
      c.textAlign = 'left';
      c.font = `bold ${Math.round(0.012 * k)}px ${FONT}`;
      c.fillStyle = ability ? '#f0e0b0' : '#6a5a48';
      c.fillText(ability ? ABILITY[ability].name : 'empty', x + 0.034 * k, y + h / 2, w - 0.038 * k);
      return;
    }
  }
}

/** A shape's path, drawn small round (`cx`, `cy`), `r` pixels a unit. */
function paintShape(c: CanvasRenderingContext2D, shape: Shape, cx: number, cy: number, r: number, colour: string): void {
  const path = SHAPE[shape].path;
  const xs = path.map((p) => p[0]);
  const ys = path.map((p) => p[1]);
  const mx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const my = (Math.min(...ys) + Math.max(...ys)) / 2;
  const scale = r / Math.max(0.5, (Math.max(...xs) - Math.min(...xs)) / 2, (Math.max(...ys) - Math.min(...ys)) / 2);
  c.beginPath();
  path.forEach(([x, y], i) => (i ? c.lineTo(cx + (x - mx) * scale, cy - (y - my) * scale) : c.moveTo(cx + (x - mx) * scale, cy - (y - my) * scale)));
  c.strokeStyle = colour;
  c.lineWidth = 3;
  c.stroke();
}
