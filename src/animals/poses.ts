import { ANIMALS, type AnimalId, muzzleOf, type Species } from '../models/animals';
import type { Vec3 } from '../models/kit';
import { LEGS, type QuadPose, type QuadProportions } from '../models/quadruped';

// How animals move on the four-legged skeleton (models/quadruped.ts), shared
// by the game (animals/animal.ts), the wolves (enemies/bodies.ts) and the
// model inspector, so what loops on the plinth is what stands on the moor.
// Poses that must meet the ground (grazing, a dog's nose to a scent) are
// worked out per look from its proportions, so a lamb and a cart horse both
// get their muzzle to the grass.

export type MutablePose = Record<string, [number, number, number]>;

/** What one look of animal plays: its stances, and how its legs swing as it walks. */
export interface AnimalMoves {
  /** Standing easy. */
  readonly stand: QuadPose;
  /** Muzzle down in the grass (a dog's: to a scent). */
  readonly graze: QuadPose;
  /** Head up, ears forward: looking at something. */
  readonly alert: QuadPose;
  /** Lying down, head up; `lieDrop` is how far the hips come down for it. */
  readonly lie: QuadPose;
  readonly lieDrop: number;
  /** A hind leg cocked, resting on the toe (a horse's). */
  readonly rest: QuadPose;
  /** Radians each leg swings either side of straight in a stride. */
  readonly swing: number;
  /** Metres the body moves in one full stride (one cycle of the gait). */
  readonly stride: number;
}

/** Each leg's place in a walk's cycle (lifted one at a time), and a trot's (in diagonal pairs). */
const WALK: Record<string, number> = { hindThighL: 0, foreThighL: 0.25, hindThighR: 0.5, foreThighR: 0.75 };
const TROT: Record<string, number> = { foreThighL: 0, hindThighR: 0, foreThighR: 0.5, hindThighL: 0.5 };

/**
 * Leg swing for a stride, added on top of a stance. `phase` in radians (one
 * stride every 2π), `amount` 0 (standing) to 1 (full stride), `trot` 0 for a
 * walk to 1 for a trot or a run. Each leg swings from the hip or shoulder and
 * lifts as it comes forward: the front knee folds back, the hock forward.
 */
export function gait(phase: number, amount: number, swing: number, trot: number, out: MutablePose): void {
  const a = swing * amount;
  for (const leg of LEGS) {
    const offset = WALK[leg.thigh] * (1 - trot) + TROT[leg.thigh] * trot;
    const u = phase + offset * 2 * Math.PI;
    const lift = Math.max(0, Math.cos(u)) * amount;
    out[leg.thigh] = [-a * Math.sin(u), 0, 0];
    out[leg.shin] = [(leg.fore ? 0.9 : -0.8) * lift * (0.6 + 0.4 * trot), 0, 0];
  }
  // The back sways, the head nods twice a stride, the tail swings with it.
  out.spine = [0, 0.06 * amount * Math.sin(phase), 0];
  out.neck = [0.05 * amount * Math.sin(phase * 2), -0.05 * amount * Math.sin(phase), 0];
  out.tail = [0.15 * trot * amount, 0.25 * amount * Math.sin(phase + 1), 0];
}

/** The body's bob over a stride, in metres (down, at each footfall). */
export function gaitBob(phase: number, amount: number, p: QuadProportions): number {
  return -Math.abs(Math.sin(phase * 2)) * 0.02 * Math.min(p.hipY, 1) * amount;
}

/** Radians a second the stride turns at `speed` m/s, so feet don't slide. */
export function strideRate(moves: AnimalMoves, speed: number): number {
  return (2 * Math.PI * speed) / moves.stride;
}

// ---------------------------------------------------------------- reaching the ground

/** (y, z) of `v` turned by `a` about X (x > 0 pitches forward things down). */
function pitch(y: number, z: number, a: number): [number, number] {
  return [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
}

/** Where the muzzle is, as the neck pitches by `neck` and the head by `head` more, on a body standing at bind. */
export function muzzleAt(p: QuadProportions, muzzle: Vec3, neck: number, head: number): [number, number] {
  const rootY = p.shoulderY + p.withers;
  const rootZ = p.body * 0.5;
  const [hy, hz] = pitch(p.neck * Math.sin(p.neckRise), p.neck * Math.cos(p.neckRise), neck);
  const [my, mz] = pitch(muzzle[1], muzzle[2], neck + head);
  return [rootY + hy + my, rootZ + hz + mz];
}

/**
 * The neck's pitch that brings the muzzle down to `height` over the floor,
 * the face held `face` below level (the head turns back by what the neck
 * turns): the least that does, or as far down as the neck goes.
 */
export function reachDown(p: QuadProportions, muzzle: Vec3, face: number, height: number): number {
  const at = (neck: number): number => muzzleAt(p, muzzle, neck, face - neck)[0];
  let lo = 0;
  let hi = p.neckRise + 1.45;
  if (at(hi) > height) return hi;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) > height) lo = mid;
    else hi = mid;
  }
  return hi;
}

// ---------------------------------------------------------------- each species

interface Style {
  /** The stand's neck and head pitch, and the tail's carriage. */
  neck: number;
  head: number;
  tail: number;
  /** How far below level the face points as it grazes; the neck brings it down. */
  grazeFace: number;
  /** How high the muzzle stops over the floor as it grazes. */
  grazeAt: number;
  swing: number;
  /** The hips' height lying down, as a share of standing: the belly on the ground. */
  lieHip: number;
  /** Lying, the front legs stretch out ahead (a dog's) or fold under the chest (a sheep's, a horse's). */
  lieFore: 'out' | 'under';
  /** The tail's lift and sweep to the side, lying. */
  lieTail: readonly [number, number];
}

const STYLE: Record<Species, Style> = {
  sheep: { neck: 0.15, head: 0.25, tail: 0, grazeFace: 1.15, grazeAt: 0.03, swing: 0.42, lieHip: 0.33, lieFore: 'under', lieTail: [0.5, 0.3] },
  dog: { neck: 0.05, head: 0.12, tail: 0.15, grazeFace: 1.15, grazeAt: 0.05, swing: 0.5, lieHip: 0.3, lieFore: 'out', lieTail: [1.1, 0.9] },
  horse: { neck: 0.05, head: 0.3, tail: 0.05, grazeFace: 1.0, grazeAt: 0.03, swing: 0.4, lieHip: 0.5, lieFore: 'under', lieTail: [0.8, 0.4] },
};

const clamp1 = (v: number): number => Math.max(-1, Math.min(1, v));

/**
 * Lying down: the hips dropped to `st.lieHip` of their height; each hind leg
 * runs back from the hip to its hock on the ground, the foot flat forward
 * beside the belly; the front legs reach the ground at the knee, then lie
 * out ahead or fold back under the chest.
 */
function lying(p: QuadProportions, st: Style): { pose: QuadPose; drop: number } {
  const drop = p.hipY * (1 - st.lieHip);
  // How far above the floor the hock and the knee stay: the leg's own thickness, and a folded hoof's.
  const leg = Math.min(p.hipY, p.shoulderY);
  const pad = 0.05 * leg;
  const kneePad = 0.14 * leg;
  const flat = Math.PI / 2 - 0.1;
  // Hind: angles back from straight down (x > 0 swings a limb back).
  const hipToHock = Math.hypot(p.hipY * (1 - p.hock), p.hockBack);
  const hockAtBind = Math.atan2(p.hockBack, p.hipY * (1 - p.hock));
  const hindThigh = Math.acos(clamp1((p.hipY - drop - pad) / hipToHock)) - hockAtBind;
  const footAtBind = Math.atan2(p.hockBack * 0.55, p.hipY * p.hock);
  const hindShin = footAtBind - flat - hindThigh;
  // Fore: the upper leg down and forward to the knee on the ground.
  const foreThigh = -Math.acos(clamp1((p.shoulderY - drop - kneePad) / (p.shoulderY * (1 - p.knee))));
  const foreShin = st.lieFore === 'out' ? -flat - foreThigh : flat - foreThigh;
  return {
    drop,
    pose: {
      neck: [st.neck - 0.1, 0, 0],
      head: [st.head, 0, 0],
      tail: [st.lieTail[0], st.lieTail[1], 0],
      foreThighL: [foreThigh, 0, 0.04],
      foreShinL: [foreShin, 0, 0],
      foreThighR: [foreThigh, 0, -0.04],
      foreShinR: [foreShin, 0, 0],
      hindThighL: [hindThigh, 0, 0.3],
      hindShinL: [hindShin, 0, 0],
      hindThighR: [hindThigh, 0, -0.3],
      hindShinR: [hindShin, 0, 0],
    },
  };
}

/** A look's moves, from its species' style and its own proportions. */
export function movesFor(species: Species, p: QuadProportions): AnimalMoves {
  const st = STYLE[species];
  const muzzle = muzzleOf(species, p);
  const graze = reachDown(p, muzzle, st.grazeFace, st.grazeAt);
  const leg = Math.min(p.hipY, p.shoulderY);
  const lie = lying(p, st);
  return {
    stand: { neck: [st.neck, 0, 0], head: [st.head, 0, 0], tail: [st.tail, 0, 0] },
    graze: {
      neck: [graze, 0, 0],
      head: [st.grazeFace - graze, 0, 0],
      jaw: [0.08, 0, 0],
      tail: [st.tail * 0.5, 0, 0],
      // The front legs brace a touch wider apart.
      foreThighL: [-0.06, 0, 0.04],
      foreThighR: [-0.06, 0, -0.04],
    },
    alert: { neck: [st.neck - 0.35, 0, 0], head: [st.head - 0.1, 0, 0], tail: [st.tail + 0.15, 0, 0] },
    lie: lie.pose,
    lieDrop: lie.drop,
    rest: {
      neck: [st.neck + 0.15, 0, 0],
      head: [st.head + 0.1, 0, 0],
      tail: [st.tail, 0, 0],
      hindThighR: [-0.08, 0, 0],
      hindShinR: [-0.45, 0, 0],
    },
    swing: st.swing,
    stride: 2 * leg * Math.sin(st.swing),
  };
}

const cache = new Map<AnimalId, AnimalMoves>();

/** One of the animal looks' moves (built once). */
export function movesOf(id: AnimalId): AnimalMoves {
  let m = cache.get(id);
  if (!m) {
    const a = ANIMALS[id];
    m = movesFor(a.species, a.proportions);
    cache.set(id, m);
  }
  return m;
}

// ---------------------------------------------------------------- what plays over a stance

/** Breathing's phase rate, in radians a second. */
const BREATH = 2.2;

/**
 * `stance` with an animal's life over it, `clock` seconds in: breathing, the
 * tail swishing (`swish`, 0 to 1: a horse at flies), and the jaw chewing
 * (`chew`, 0 to 1: grazing).
 */
export function alive(stance: QuadPose, clock: number, out: MutablePose, swish = 0, chew = 0): MutablePose {
  for (const k of Object.keys(out)) delete out[k];
  for (const [k, v] of Object.entries(stance)) out[k] = [v![0], v![1], v![2]];
  const spine = (out.spine ??= [0, 0, 0]);
  spine[0] += 0.015 * Math.sin(clock * BREATH);
  if (swish > 0) {
    const tail = (out.tail ??= [0, 0, 0]);
    const s = Math.sin(clock * 3.1) * Math.max(0, Math.sin(clock * 0.7));
    tail[1] += 0.6 * swish * s;
    tail[0] += 0.15 * swish * Math.abs(s);
  }
  if (chew > 0) {
    const jaw = (out.jaw ??= [0, 0, 0]);
    jaw[0] += 0.12 * chew * Math.max(0, Math.sin(clock * 9));
    jaw[1] += 0.06 * chew * Math.sin(clock * 4.5);
  }
  return out;
}

/** Add `add`'s turns to `out`'s, bone by bone. */
export function addInto(out: MutablePose, add: MutablePose): MutablePose {
  for (const [bone, r] of Object.entries(add)) {
    const o = (out[bone] ??= [0, 0, 0]);
    o[0] += r[0];
    o[1] += r[1];
    o[2] += r[2];
  }
  return out;
}
