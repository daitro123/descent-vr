import { type Shape, SHAPES } from '../../classes';
import { features, type Model, type Point, type Stroke } from './matcher';
import { RECORDED } from './recorded';

// The five shapes a gesture is drawn in (ticket 07's pick, set C), each as
// its ideal path and the templates the matcher reads a stroke against: the
// clean path, and any strokes Tom recorded on the headset (recorded.ts).
// Every shape turns through a corner or a loop: a straight line or a single
// arc is what a sword already does.

export interface ShapeDef {
  readonly id: Shape;
  /** How to draw it, in a few words. */
  readonly how: string;
  /**
   * The ideal path, in the body frame (x right, y up, z forward), at unit
   * size, starting at the origin: a list of corners, or a curve's samples.
   */
  readonly path: readonly Point[];
}

const TAU = Math.PI * 2;

function arc(cx: number, cy: number, r: number, from: number, to: number, n: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a), 0]);
  }
  return out;
}

/** Move a path so it starts at the origin. */
function fromOrigin(path: readonly Point[]): Point[] {
  const [x0, y0, z0] = path[0];
  return path.map(([x, y, z]) => [x - x0, y - y0, z - z0] as Point);
}

export const SHAPE: Readonly<Record<Shape, ShapeDef>> = {
  ring: { id: 'ring', how: 'a circle, from the top, clockwise', path: fromOrigin(arc(0, 0, 1, TAU / 4, TAU / 4 - TAU * 1.05, 40)) },
  z: { id: 'z', how: 'a Z: across, down to the left, across', path: fromOrigin([[-1, 1, 0], [1, 1, 0], [-1, -1, 0], [1, -1, 0]]) },
  v: { id: 'v', how: 'a V: down to the bottom, back up to the right', path: fromOrigin([[-0.7, 1, 0], [0, -1, 0], [0.7, 1, 0]]) },
  triangle: {
    id: 'triangle',
    how: 'from the top: down right, across left, back up',
    path: fromOrigin([[0, 1, 0], [0.87, -0.5, 0], [-0.87, -0.5, 0], [0, 1, 0]]),
  },
  s: {
    id: 's',
    how: 'an S, from the top right',
    path: fromOrigin([...arc(0, 0.5, 0.5, 0.3, Math.PI * 1.5, 16), ...arc(0, -0.5, 0.5, Math.PI / 2, -Math.PI * 0.8, 16).slice(1)]),
  },
};

/** Where a shape is drawn from, as a template: in front of the chest, on the right (body frame, m). */
export const DRAWN_FROM: Point = [0.1, -0.15, 0.38];
/** How big a template is drawn: 0.18 m a unit, about 35 cm across. */
export const DRAWN_SIZE = 0.18;

/** The point `u` (0 to 1) of the way along a path, by length. */
export function densifyAt(path: readonly Point[], u: number): Point {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]));
  const want = Math.max(0, Math.min(1, u)) * cum[cum.length - 1];
  let i = 1;
  while (i < cum.length - 1 && cum[i] < want) i++;
  const seg = cum[i] - cum[i - 1];
  const t = seg > 1e-12 ? (want - cum[i - 1]) / seg : 0;
  const a = path[i - 1];
  const b = path[i];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** `n` + 1 points evenly along a path. */
export function densify(path: readonly Point[], n: number): Point[] {
  return Array.from({ length: n + 1 }, (_, k) => densifyAt(path, k / n));
}

/**
 * The shape drawn cleanly, at a middling size, in front of you, in 0.7 s at
 * 72 Hz with a hand's speeding up and slowing down: its clean template.
 */
export function templateStroke(shape: Shape): Stroke {
  const path = densify(SHAPE[shape].path, 60).map(([x, y, z]) => [DRAWN_FROM[0] + x * DRAWN_SIZE, DRAWN_FROM[1] + y * DRAWN_SIZE, DRAWN_FROM[2] + z * DRAWN_SIZE] as Point);
  const frames = Math.round(0.7 * 72);
  const points: Point[] = [];
  const times: number[] = [];
  for (let i = 0; i <= frames; i++) {
    const t = i / frames;
    points.push(densifyAt(path, t * t * t * (10 - 15 * t + 6 * t * t)));
    times.push(i / 72);
  }
  return { points, times };
}

const MODELS = {} as Record<Shape, Model<Shape>>;
for (const id of SHAPES) MODELS[id] = { id, templates: [features(templateStroke(id)), ...(RECORDED[id] ?? []).map(features)] };

/** The matcher's models for `shapes`: each shape's clean template and its recordings. */
export const modelsOf = (shapes: readonly Shape[]): Model<Shape>[] => shapes.map((s) => MODELS[s]);
