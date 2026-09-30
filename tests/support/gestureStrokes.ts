import type { Shape } from '../../src/classes';
import { classify, type Point, type Stroke } from '../../src/player/gestures/matcher';
import { DRAWN_FROM, densify, modelsOf, SHAPE } from '../../src/player/gestures/shapes';

// Strokes made up by code, standing in for strokes recorded on the headset:
// the gesture prototype's stroke maker and bench (src/prototype/gestures/
// gestureBench.prototype.ts), kept here for the game's own recogniser. Each
// shape drawn sloppily (a different size, tilt, speed and place each time,
// with wobble, tracking noise, and the grip pressed a moment early or let go
// late), and the warrior's moves of normal play (swings, thrusts and blocks)
// made with the grip held, the worst case for a player who squeezes it out of
// habit. The unit test and the headless check (`.scratch/abilities/checks/
// warrior-gestures.mjs`, from the dev server) both use it.

const HZ = 72;

/** A seeded random source, so a run can be repeated. */
export type Rng = () => number;

export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (r: Rng, lo: number, hi: number) => lo + (hi - lo) * r();
const gauss = (r: Rng) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

type V = [number, number, number];
const add = (a: Point, b: Point): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Point, b: Point): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Point, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: Point) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Point): V => mul(a, 1 / (len(a) || 1));

/** Rotate by yaw (about y), pitch (about x) and roll (about z), radians. */
function rotate(p: Point, yaw: number, pitch: number, roll: number): V {
  let [x, y, z] = p;
  [x, y] = [x * Math.cos(roll) - y * Math.sin(roll), x * Math.sin(roll) + y * Math.cos(roll)];
  [y, z] = [y * Math.cos(pitch) - z * Math.sin(pitch), y * Math.sin(pitch) + z * Math.cos(pitch)];
  [x, z] = [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
  return [x, y, z];
}

function cumulative(path: readonly Point[]): number[] {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + len(sub(path[i], path[i - 1])));
  return cum;
}

/** The point `u` (0–1) of the way along a polyline, by length. */
function along(path: readonly Point[], cum: number[], u: number): V {
  const total = cum[cum.length - 1];
  const want = Math.max(0, Math.min(1, u)) * total;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < want) i++;
  const seg = cum[i] - cum[i - 1];
  const t = seg > 1e-12 ? (want - cum[i - 1]) / seg : 0;
  return add(path[i - 1], mul(sub(path[i], path[i - 1]), t));
}

/** Minimum-jerk timing: a hand speeds up and slows down as a real one does. */
const minJerk = (t: number) => t * t * t * (10 - 15 * t + 6 * t * t);

interface Motion {
  /** The path the hand follows (body frame, m). */
  path: Point[];
  duration: number;
  /** Wobble and tracking noise, m. */
  wobble: number;
}

/** Move along a path in time, with wobble and noise, and the grip a moment early or late. */
function perform(m: Motion, r: Rng): Stroke {
  const cum = cumulative(m.path);
  const frames = Math.max(3, Math.round(m.duration * HZ));
  const waves = [0, 1, 2].map(() => [0, 1].map(() => ({ f: between(r, 1, 4), ph: between(r, 0, 6.3), a: m.wobble * between(r, 0.3, 1) })));
  const warp = between(r, -0.06, 0.06);
  const points: Point[] = [];
  const times: number[] = [];
  const at = (time: number, u: number): V => {
    const p = along(m.path, cum, u);
    return [0, 1, 2].map((k) => p[k] + waves[k].reduce((s, w) => s + w.a * Math.sin(2 * Math.PI * w.f * time + w.ph), 0) + 0.0015 * gauss(r)) as V;
  };
  // The grip went down a moment before the move began: the hand was still drifting in.
  const lead = r() < 0.7 ? Math.floor(between(r, 0, 5)) : 0;
  const drift = norm([gauss(r), gauss(r), gauss(r)]);
  const start = at(0, 0);
  for (let i = lead; i > 0; i--) {
    points.push(add(start, mul(drift, (i / HZ) * between(r, 0.2, 0.5))));
    times.push(points.length / HZ);
  }
  for (let i = 0; i <= frames; i++) {
    const t = i / frames;
    const u = minJerk(Math.max(0, Math.min(1, t + warp * Math.sin(Math.PI * t))));
    points.push(at(i / HZ, u));
    times.push(points.length / HZ);
  }
  // …and came up a moment after it ended: the hand carried on a little.
  const tail = Math.floor(between(r, 0, 7));
  const last = points[points.length - 1];
  const dir = norm(sub(last, points[Math.max(0, points.length - 4)]));
  const speed = between(r, 0.1, 0.6);
  for (let i = 1; i <= tail; i++) {
    points.push(add(last, mul(dir, (speed * i) / HZ / (1 + i * 0.3))));
    times.push(points.length / HZ);
  }
  return { points, times };
}

/** The shape drawn once, by someone in the middle of a fight. */
export function performShape(shape: Shape, r: Rng): Stroke {
  const def = SHAPE[shape];
  const size = between(r, 0.11, 0.24);
  const sx = between(r, 0.8, 1.25);
  const sy = between(r, 0.8, 1.25);
  const yaw = between(r, -0.35, 0.35);
  const pitch = between(r, -0.35, 0.35);
  const roll = between(r, -0.26, 0.26);
  const bulge = between(r, -0.08, 0.08);
  const origin = add(DRAWN_FROM, [between(r, -0.15, 0.15), between(r, -0.15, 0.15), between(r, -0.08, 0.08)]);
  const dense = densify(def.path, 60);
  const path = dense.map((p, i) => {
    const q: Point = [p[0] * sx * size, p[1] * sy * size, p[2] * size + bulge * Math.sin((Math.PI * i) / (dense.length - 1))];
    return add(origin, rotate(q, yaw, pitch, roll));
  });
  const duration = between(r, 0.45, 1.1) * (def.path.length > 20 ? 1 : 0.9);
  return perform({ path, duration, wobble: between(r, 0.005, 0.02) }, r);
}

// ---------------------------------------------------------------- normal play, grip held

/** Where the sword arm swings from: the right shoulder, from the eyes. */
const SHOULDER: Point = [0.2, -0.25, 0];
/** Where a fighter's hand waits between blows. */
const GUARD: Point = [0.2, -0.42, 0.3];

/** Points on an arc around the shoulder, from `from` to `to` (degrees), in the plane of `u` and `v`. */
function swingArc(u: Point, v: Point, from: number, to: number, radius: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= 30; i++) {
    const a = ((from + ((to - from) * i) / 30) * Math.PI) / 180;
    out.push(add(SHOULDER, add(mul(u, Math.cos(a) * radius), mul(v, Math.sin(a) * radius))));
  }
  return out;
}

const RIGHT: Point = [1, 0, 0];
const UPV: Point = [0, 1, 0];
const FWD: Point = [0, 0, 1];

/** A sword blow: sometimes with its wind-up, sometimes with the return to guard, and the grip pressed partway. */
function blow(u: Point, v: Point, from: number, to: number): (r: Rng) => Motion {
  return (r) => {
    const tilt = between(r, -0.3, 0.3);
    const uu = rotate(u, 0, tilt, between(r, -0.2, 0.2));
    const vv = rotate(v, between(r, -0.2, 0.2), tilt, 0);
    const radius = between(r, 0.45, 0.7);
    let path = swingArc(uu, vv, from + between(r, -15, 15), to + between(r, -15, 15), radius);
    let duration = between(r, 0.22, 0.45);
    if (r() < 0.5) {
      // The wind-up: back along the first third, then the blow.
      path = [...path.slice(0, 11).reverse(), ...path];
      duration += between(r, 0.15, 0.3);
    }
    if (r() < 0.5) {
      path = [...path, GUARD];
      duration += between(r, 0.2, 0.4);
    }
    // The grip went down partway into the move, or came up before its end.
    const cut0 = r() < 0.4 ? Math.floor(between(r, 0, path.length * 0.3)) : 0;
    const cut1 = r() < 0.3 ? Math.floor(between(r, 0, path.length * 0.2)) : 0;
    const kept = path.slice(cut0, path.length - cut1);
    return { path: kept, duration: (duration * kept.length) / path.length, wobble: 0.01 };
  };
}

function line(points: Point[], lo: number, hi: number, jitter = 0.06): (r: Rng) => Motion {
  return (r) => ({
    path: points.map((p) => add(p, [gauss(r) * jitter, gauss(r) * jitter, gauss(r) * jitter])),
    duration: between(r, lo, hi),
    wobble: 0.008,
  });
}

const UP_RIGHT = norm([1, 1, 0]);
const UP_LEFT = norm([-1, 1, 0]);
const DOWN_RIGHT = norm([1, -1, 0]);

/** The warrior's moves of normal play, each made with the grip held. */
export const WARRIOR_PLAY = {
  slash: blow(RIGHT, FWD, 10, 165),
  backhand: blow(RIGHT, FWD, 165, 15),
  chop: blow(UPV, FWD, -10, 150),
  diagonal: blow(UP_RIGHT, FWD, 0, 160),
  diagonalBack: blow(UP_LEFT, FWD, 0, 160),
  uppercut: blow(DOWN_RIGHT, FWD, 0, 150),
  thrust: line([[0.22, -0.48, 0.1], [0.15, -0.36, 0.62]], 0.18, 0.35),
  blockHigh: line([GUARD, [0.15, 0.05, 0.32]], 0.25, 0.5),
  blockSide: line([GUARD, [0.48, -0.3, 0.22]], 0.2, 0.4),
} satisfies Record<string, (r: Rng) => Motion>;

export type Play = keyof typeof WARRIOR_PLAY;

export function performPlay(move: Play, r: Rng): Stroke {
  return perform(WARRIOR_PLAY[move](r), r);
}

// ---------------------------------------------------------------- the bench

export interface Bench {
  /** Per shape: of `n` drawn, how many were read as it, as another shape, or as nothing. */
  readonly shapes: Record<string, { right: number; wrong: number; missed: number }>;
  /** Per move of play: of `n` made, how many read as a shape. */
  readonly play: Record<string, number>;
  /** Of every shape drawn, the share read as the shape meant. */
  readonly readRight: number;
  /** …and as another one. */
  readonly readWrong: number;
  /** Of every move of play, the share read as a shape. */
  readonly falseReads: number;
}

/** Draw each shape `n` times and make each move of play `n` times, and read them all against `shapes`. */
export function bench(shapes: readonly Shape[], play: readonly Play[], n: number, seed = 7): Bench {
  const models = modelsOf(shapes);
  const r = rng(seed);
  const out = { shapes: {} as Bench['shapes'], play: {} as Bench['play'] };
  let right = 0;
  let wrong = 0;
  for (const s of shapes) {
    const g = (out.shapes[s] = { right: 0, wrong: 0, missed: 0 });
    for (let i = 0; i < n; i++) {
      const v = classify(performShape(s, r), models);
      if (v.id === s) g.right++;
      else if (v.id) g.wrong++;
      else g.missed++;
    }
    right += g.right;
    wrong += g.wrong;
  }
  let fired = 0;
  for (const m of play) {
    out.play[m] = 0;
    for (let i = 0; i < n; i++) if (classify(performPlay(m, r), models).id) out.play[m]++;
    fired += out.play[m];
  }
  return {
    ...out,
    readRight: right / (shapes.length * n),
    readWrong: wrong / (shapes.length * n),
    falseReads: play.length ? fired / (play.length * n) : 0,
  };
}
