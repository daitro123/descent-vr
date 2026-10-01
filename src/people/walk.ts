import type { Build } from '../models/human';

// A friendly walk on the human body, on any build: each foot lands on its
// heel, rolls flat, peels off from the toe, and stands still on the ground
// while it bears the weight, so a villager strolling a route doesn't skate.
// The feet are placed first (where the heel or the toe they pivot on is
// planted, and how far they're rolled), the hips ride as high as the planted
// feet let them, and the legs are solved to reach (hip to knee to ankle), so
// the same walk fits a child's short legs and a big man's long ones. The
// build's gait (human.ts `Gait`) sets the step, the pace and the carriage: a
// child's quick short steps, an elder's slow flat-footed shuffle. Over that
// the hips sway and turn, the chest turns against them, and the arms swing
// against the legs. Shared by the villagers and the model inspector, so what
// loops on the plinth is what walks the streets.
//
// A cycle is two steps: `u` 0 is the left heel striking the ground, 0.5 the
// right.

/** Share of the cycle each foot is on the ground: both are, for a moment after each heel strikes. */
export const STANCE = 0.6;

/** The boots' sole below the ankle, and how far the heel and the toe reach behind and ahead of it, at thickness 1 (human.ts `body`). */
export const SOLE = 0.03;
const HEEL = 0.085;
const TOE = 0.165;

/** rad the toe is up as the heel strikes, and down as it pushes off, for a full roll (`Gait.roll` 1). */
const STRIKE = -0.22;
const PUSH = 0.6;
/** Shares of the stance: rolling off the heel till the foot's flat, and flat till the heel lifts. */
const FLAT = 0.15;
const HEEL_OFF = 0.55;

/** Turns of the walk's bones: the legs and hips, and the swing laid on the arms, chest and head. */
export type MutablePose = Record<string, [number, number, number]>;

/** One moment of the walk. */
export interface WalkFrame {
  readonly pose: MutablePose;
  /** The hips' offset from bind, metres: their sway (x) and rise and fall (y). */
  readonly hip: [number, number, number];
}

/** Bones the walk sets outright; the rest it swings on top of the standing pose. */
const LEGS = ['hips', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'] as const;

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The thigh's and the shin's turns (x) that put the ankle at (`z` ahead, `y` up) from the hip joint, knee forward. */
export function reach(z: number, y: number, thigh: number, shin: number, out: [number, number] = [0, 0]): [number, number] {
  const d = clamp(Math.hypot(z, y), Math.abs(thigh - shin) + 1e-3, (thigh + shin) * 0.9999);
  const line = Math.atan2(-z, -y);
  const knee = Math.acos(clamp((thigh * thigh + shin * shin - d * d) / (2 * thigh * shin), -1, 1));
  const lean = Math.acos(clamp((thigh * thigh + d * d - shin * shin) / (2 * thigh * d), -1, 1));
  out[0] = line - lean;
  out[1] = Math.PI - knee;
  return out;
}

/** How far up from the ankle the sole's lowest point is (negative: below it), with the foot pitched `pitch` (toe down +). */
function lowest(pitch: number, k: number): number {
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  return Math.min(-SOLE * c + HEEL * k * s, -SOLE * c - TOE * k * s);
}

/** The ankle from where the heel touches the ground: ahead, and up, pivoting on the heel (pitch ≤ 0) or on the toe (pitch > 0). */
function fromHeel(pitch: number, k: number, out: [number, number]): [number, number] {
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  if (pitch <= 0) {
    out[0] = SOLE * s + HEEL * k * c;
    out[1] = SOLE * c - HEEL * k * s;
  } else {
    out[0] = (HEEL + TOE) * k + SOLE * s - TOE * k * c;
    out[1] = SOLE * c + TOE * k * s;
  }
  return out;
}

/** The planted foot's pitch `v` of the way through the stance: off the heel, flat, onto the toe. */
function rolled(v: number, roll: number): number {
  if (v < FLAT) return STRIKE * roll * (1 - smooth(v / FLAT));
  if (v < HEEL_OFF) return 0;
  return PUSH * roll * Math.pow((v - HEEL_OFF) / (1 - HEEL_OFF), 1.6);
}

/** One foot: its ankle ahead of and up from the hip joint's place on the ground, and its pitch. */
interface Foot {
  z: number;
  y: number;
  pitch: number;
}

const _a: [number, number] = [0, 0];
const _b: [number, number] = [0, 0];

/** The pelvis' turn toward the forward leg, rad (left forward at u 0). */
const pelvis = (b: Build, u: number) => -0.1 * b.gait.step * Math.cos(2 * Math.PI * u);

/** Where a foot is at `phase` of its own cycle (0: its heel strikes, `heel` m ahead of the hip joint). */
function footAt(b: Build, heel: number, phase: number, out: Foot): Foot {
  const k = b.thickness;
  const g = b.gait;
  const stride = 2 * g.step;
  if (phase < STANCE) {
    // On the ground: still in the world while the hips go on over it.
    const pitch = rolled(phase / STANCE, g.roll);
    fromHeel(pitch, k, _a);
    out.z = heel + _a[0] - phase * stride;
    out.y = _a[1];
    out.pitch = pitch;
    return out;
  }
  // In the air: from where the toe left the ground to where the heel will
  // land, the toe swinging up, the sole clearing the ground by `lift` at most.
  // It eases off the ground and down onto it again as the world sees it, so
  // it leaves and lands at rest, not skating.
  const w = (phase - STANCE) / (1 - STANCE);
  const off = PUSH * g.roll;
  const on = STRIKE * g.roll;
  fromHeel(off, k, _a);
  fromHeel(on, k, _b);
  const z0 = heel + _a[0];
  const z1 = heel + _b[0] + stride;
  const e = smooth(w);
  out.pitch = on + (off - on) * (1 - e) * (1 - e);
  out.z = z0 + (z1 - z0) * e - phase * stride;
  const y = _a[1] + (_b[1] - _a[1]) * e + g.lift * Math.sin(Math.PI * w);
  // Never with the toe or the heel through the ground.
  out.y = Math.max(y, -lowest(out.pitch, k) + g.lift * 0.25 * Math.sin(Math.PI * w));
  return out;
}

/** A build's walk, worked out once: where the heel lands, and the hips' rise and fall. */
interface Plan {
  /** Where the heel lands, ahead of the hip joint's place on the ground as it strikes. */
  readonly heel: number;
  /** The hip joints' height above the floor through the cycle, sampled evenly from u 0. */
  readonly bob: Float32Array;
}

const plans = new WeakMap<Build, Plan>();
/** Samples round a cycle. */
const BOB = 96;
/** m a cycle squared: how fast the hips' rise and fall may bend, so they never jolt. */
const EASE = 2.5;

const _foot: Foot = { z: 0, y: 0, pitch: 0 };

/**
 * Where the heel lands, so the hips pass over the planted ankle halfway
 * through the stance; and the hips' rise and fall: as high as the planted
 * feet let them with the legs on the ground all but straight, highest over
 * each foot and lowest as the weight passes from one to the other, and eased
 * (the highest curve under that limit that bends no faster than `EASE`, up or
 * down).
 */
function planOf(b: Build): Plan {
  const known = plans.get(b);
  if (known) return known;
  const p = b.proportions;
  const k = b.thickness;
  const stride = 2 * b.gait.step;
  fromHeel(STRIKE * b.gait.roll, k, _a);
  fromHeel(PUSH * b.gait.roll, k, _b);
  // The ankle as far ahead of the hips as the heel strikes as it's behind them as the toe leaves.
  const heel = (STANCE * stride - _a[0] - _b[0]) / 2;
  const legs = (p.thigh + p.shin) * 0.99;
  const most = new Float32Array(BOB);
  for (let i = 0; i < BOB; i++) {
    const u = i / BOB;
    let h = Infinity;
    for (const [side, phase] of [
      [1, u],
      [-1, (u + 0.5) % 1],
    ] as const) {
      if (phase >= STANCE) continue;
      footAt(b, heel, phase, _foot);
      const z = _foot.z + side * p.hipW * Math.sin(pelvis(b, u));
      h = Math.min(h, _foot.y + Math.sqrt(Math.max(0, legs * legs - z * z)));
    }
    most[i] = h;
  }
  const plan = { heel, bob: ease(most) };
  plans.set(b, plan);
  return plan;
}

/**
 * The highest curve under `h` round the cycle that bends no faster than
 * `EASE`, either way. Its corners are rounded from below: at the bottom, as
 * the weight changes feet, by the lowest of the parabolas opening up from
 * each sample; then over the top, where the hips start down again, by
 * lowering each sample the curve bends down at too fast, till none is left.
 */
function ease(h: Float32Array): Float32Array {
  const out = new Float32Array(BOB);
  for (let i = 0; i < BOB; i++) {
    let v = Infinity;
    for (let j = 0; j < BOB; j++) {
      const du = Math.min(Math.abs(i - j), BOB - Math.abs(i - j)) / BOB;
      v = Math.min(v, h[j] + EASE * du * du);
    }
    out[i] = v;
  }
  const bend = EASE / (BOB * BOB);
  for (let moved = true; moved; ) {
    moved = false;
    for (let i = 0; i < BOB; i++) {
      const most = (out[(i + BOB - 1) % BOB] + out[(i + 1) % BOB]) / 2 + bend;
      if (out[i] > most + 1e-7) {
        out[i] = most;
        moved = true;
      }
    }
  }
  return out;
}

/** The hip joints' height above the floor at `u` (0 to 1) round the cycle. */
function bobAt(bob: Float32Array, u: number): number {
  const x = u * BOB;
  const i = Math.floor(x) % BOB;
  const t = x - Math.floor(x);
  return bob[i] + (bob[(i + 1) % BOB] - bob[i]) * t;
}

const _legs: [number, number] = [0, 0];

/**
 * The walk `u` cycles in (any number: it wraps) on `build`, written into `out`.
 * The hip offset puts the planted foot's sole on the floor, so set it with the
 * pose (`Rig.setHipOffset`).
 */
export function walkFrame(u: number, build: Build, out: WalkFrame = { pose: {}, hip: [0, 0, 0] }): WalkFrame {
  u -= Math.floor(u);
  const p = build.proportions;
  const g = build.gait;
  const plan = planOf(build);
  const H = bobAt(plan.bob, u);
  const yaw = pelvis(build, u);
  const pose = out.pose;
  for (const [side, phase, thighBone, shinBone, footBone] of [
    [1, u, 'thighL', 'shinL', 'footL'],
    [-1, (u + 0.5) % 1, 'thighR', 'shinR', 'footR'],
  ] as const) {
    footAt(build, plan.heel, phase, _foot);
    // From this hip joint, which the pelvis' turn carries forward or back.
    reach(_foot.z + side * p.hipW * Math.sin(yaw), _foot.y - H, p.thigh, p.shin, _legs);
    pose[thighBone] = [_legs[0], 0, 0];
    pose[shinBone] = [_legs[1], 0, 0];
    // The foot keeps its own pitch, whatever the shin's.
    pose[footBone] = [_foot.pitch - _legs[0] - _legs[1], 0, 0];
  }
  // The arms trail the legs a little; each elbow bends more as its arm swings forward.
  const arm = Math.cos(2 * Math.PI * (u - 0.04));
  pose.hips = [0, yaw, 0];
  pose.spine = [g.lean, -1.5 * yaw, 0];
  pose.head = [-g.lean * 0.8, 0.5 * yaw, 0];
  pose.upperArmL = [g.arms * arm, 0, 0];
  pose.upperArmR = [-g.arms * arm, 0, 0];
  pose.forearmL = [-0.1 - g.arms * 0.8 * Math.max(0, -arm), 0, 0];
  pose.forearmR = [-0.1 - g.arms * 0.8 * Math.max(0, arm), 0, 0];
  // Swaying over the foot that bears the weight.
  out.hip[0] = 0.018 * g.step * Math.cos(2 * Math.PI * (u - STANCE / 2));
  out.hip[1] = H - (p.hipY - 0.02);
  out.hip[2] = 0;
  return out;
}

/**
 * Lay a walk over `pose` (standing, at work: written in place), `w` of the
 * way in (0 standing to 1 walking): the legs and hips go over to the walk's,
 * and its swing is added to the arms, chest and head, so what's held stays
 * held. Returns the hips' offset, eased the same way, to add to the pose's own.
 */
export function walkOver(pose: MutablePose, frame: WalkFrame, w: number, hip: [number, number, number] = [0, 0, 0]): [number, number, number] {
  for (const [bone, r] of Object.entries(frame.pose)) {
    const o = (pose[bone] ??= [0, 0, 0]);
    const set = (LEGS as readonly string[]).includes(bone);
    for (let i = 0; i < 3; i++) o[i] = set ? o[i] + (r[i] - o[i]) * w : o[i] + r[i] * w;
  }
  for (let i = 0; i < 3; i++) hip[i] = frame.hip[i] * w;
  return hip;
}

/** Cycles walked over `metres` on `build`: two steps a cycle. */
export const cyclesOver = (metres: number, build: Build) => metres / (2 * build.gait.step);
