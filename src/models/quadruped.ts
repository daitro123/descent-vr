import type { BufferGeometry, Material } from 'three';
import type { PartOpts, Vec3 } from './kit';
import { type DressContextOf, type DresserOf, type PoseOf, SkeletonRig, type SkeletonDef } from './rig';

// The four-legged skeleton every animal stands on: sheep, dogs, wolves and
// horses here, cats, cows, goats, boars and the rest later. One skeleton, its
// size and shape set per animal by `QuadProportions`, as the human body's
// builds set the humanoid's. The animal faces +Z, its left on +X, its origin
// on the floor under the middle of its back.
//
//   hips ─ spine ─ neck ─ head ─ jaw          the back, the neck and head
//   hips ─ tail
//   spine ─ foreThigh ─ foreShin              the front legs (L, R)
//   hips ─ hindThigh ─ hindShin               the hind legs (L, R)
//
// Poses turn bones as on any skeleton (rig.ts): x < 0 swings a leg forward,
// and x > 0 pitches the neck, the head or the jaw down (the jaw opens). The
// front knee bends like a person's (foreShin x > 0 folds the foot back); the
// hock the other way (hindShin x < 0 folds the foot forward). The hips are
// the root: turning them tips the whole animal (x < 0 rears up), and
// `setHipOffset` raises or drops it (lying down). The spine bends the back at
// the waist, carrying the chest, the front legs and the neck.
//
// At bind the legs stand as the animal stands, the hind ones bent at the hock,
// with every paw or hoof on the floor.

export const QUAD_BONES = [
  'hips',
  'spine',
  'neck',
  'head',
  'jaw',
  'tail',
  'foreThighL',
  'foreShinL',
  'foreThighR',
  'foreShinR',
  'hindThighL',
  'hindShinL',
  'hindThighR',
  'hindShinR',
] as const;
export type QuadBone = (typeof QUAD_BONES)[number];
export type QuadPose = PoseOf<QuadBone>;

/** An animal's size and shape, in metres (and radians for the neck). */
export interface QuadProportions {
  /** Height of the hind legs' top (the hip joint) over the floor. */
  hipY: number;
  /** Height of the front legs' top (the shoulder joint). */
  shoulderY: number;
  /** Hip joint to shoulder joint, along the back. */
  body: number;
  /** Half the width between the hind legs, and between the front legs. */
  hipW: number;
  shoulderW: number;
  /** The front knee's height, as a share of the shoulder's. */
  knee: number;
  /** The hock's height, as a share of the hip's: where the hind leg bends. */
  hock: number;
  /** How far behind the hip the hock sits. */
  hockBack: number;
  /** The neck's root over the shoulder joint (the top of the shoulders). */
  withers: number;
  /** Neck root to the head's pivot, and how far above level it points at bind. */
  neck: number;
  neckRise: number;
  /** The head's size: 1 is a dog's. Dressers size the skull by it; the jaw's hinge follows. */
  head: number;
  /** The tail's length, from its root over the rump. */
  tail: number;
}

const PARENT: Record<QuadBone, QuadBone | null> = {
  hips: null,
  spine: 'hips',
  neck: 'spine',
  head: 'neck',
  jaw: 'head',
  tail: 'hips',
  foreThighL: 'spine',
  foreShinL: 'foreThighL',
  foreThighR: 'spine',
  foreShinR: 'foreThighR',
  hindThighL: 'hips',
  hindShinL: 'hindThighL',
  hindThighR: 'hips',
  hindShinR: 'hindThighR',
};

/** Where the waist (the spine's pivot) sits along the back, as a share of `body` from the hips. */
const WAIST = 0.45;

function offsets(p: QuadProportions): Record<QuadBone, Vec3> {
  const rise = p.shoulderY - p.hipY;
  const front = p.body * (1 - WAIST);
  const knee = -p.shoulderY * (1 - p.knee);
  const hock = -p.hipY * (1 - p.hock);
  return {
    hips: [0, p.hipY, -p.body / 2],
    spine: [0, 0, p.body * WAIST],
    neck: [0, rise + p.withers, front],
    head: [0, p.neck * Math.sin(p.neckRise), p.neck * Math.cos(p.neckRise)],
    jaw: [0, -0.045 * p.head, 0.03 * p.head],
    tail: [0, 0.04 * p.head, -0.12 * p.body],
    foreThighL: [p.shoulderW, rise, front],
    foreShinL: [0, knee, 0],
    foreThighR: [-p.shoulderW, rise, front],
    foreShinR: [0, knee, 0],
    hindThighL: [p.hipW, 0, 0],
    hindShinL: [0, hock, -p.hockBack],
    hindThighR: [-p.hipW, 0, 0],
    hindShinR: [0, hock, -p.hockBack],
  };
}

export const QUADRUPED: SkeletonDef<QuadBone, QuadProportions> = {
  name: 'quadruped',
  bones: QUAD_BONES,
  parent: PARENT,
  offsets,
  shadeTo: (p) => Math.min(p.hipY, p.shoulderY) * 0.9,
};

export type QuadContext = DressContextOf<QuadBone, QuadProportions>;
export type QuadDresser = DresserOf<QuadBone, QuadProportions>;

/** An animal's rig: the quadruped skeleton at its proportions. */
export class QuadRig extends SkeletonRig<QuadBone, QuadProportions> {
  constructor(p: QuadProportions, dress: QuadDresser | BufferGeometry, material?: Material, seed = 1) {
    super(QUADRUPED, p, dress, material, seed);
  }
}

/** Where the paw or hoof's sole is, in its shin's space: on the floor at bind. */
export function sole(p: QuadProportions, end: 'fore' | 'hind'): Vec3 {
  return end === 'fore' ? [0, -p.shoulderY * p.knee, 0] : [0, -p.hipY * p.hock, p.hockBack * 0.55];
}

/** The four legs, each as its thigh and shin bones and whether it's a front one. */
export const LEGS = [
  { thigh: 'foreThighL', shin: 'foreShinL', fore: true, side: 1 },
  { thigh: 'foreThighR', shin: 'foreShinR', fore: true, side: -1 },
  { thigh: 'hindThighL', shin: 'hindShinL', fore: false, side: 1 },
  { thigh: 'hindThighR', shin: 'hindShinR', fore: false, side: -1 },
] as const;

/** How a leg is dressed: its thickness at the top, at the joint and at the foot, and its colours. */
export interface LegLook {
  /** Thickness of the upper leg (side to side, front to back). */
  upper: readonly [number, number];
  /** Thickness of the lower leg. */
  lower: readonly [number, number];
  color: number;
  /** The lower leg's colour, if not the leg's (socks, a sheep's dark shanks). */
  shank?: number;
  /** The foot: a hoof (a block of `color`) or a paw, `size` across. */
  foot: { readonly color: number; readonly size: readonly [number, number, number] };
  /** Part of the upper leg hidden in the body: how far up into it the upper part reaches. */
  tuck?: number;
}

/**
 * The four legs: an upper and a lower bar each, from joint to joint, and a
 * foot whose sole is on the floor. The hind legs bend back at the hock.
 */
export function legs(ctx: QuadContext, fore: LegLook, hind: LegLook = fore, opts: Omit<PartOpts, 'color'> = {}): void {
  const p = ctx.p;
  for (const leg of LEGS) {
    const look = leg.fore ? fore : hind;
    const top = leg.fore ? p.shoulderY : p.hipY;
    const joint = leg.fore ? -top * (1 - p.knee) : -top * (1 - p.hock);
    const back = leg.fore ? 0 : -p.hockBack;
    const tuck = look.tuck ?? 0;
    ctx.on(leg.thigh).bar([0, tuck, 0], [0, joint, back], look.upper[0], look.upper[1], { ...opts, color: look.color });
    const s = sole(p, leg.fore ? 'fore' : 'hind');
    const [fw, fh, fd] = look.foot.size;
    ctx
      .on(leg.shin)
      .bar([0, 0.01, 0], [s[0], s[1] + fh * 0.6, s[2]], look.lower[0], look.lower[1], { ...opts, color: look.shank ?? look.color })
      .box(fw, fh, fd, { ...opts, at: [s[0], s[1] + fh / 2, s[2] + fd * 0.15], color: look.foot.color });
  }
}

/** A box spanning `from` to `to` along Z (the back), `w` wide and `h` tall, centred at height `y`. */
export function along(ctx: QuadContext, bone: QuadBone, from: number, to: number, y: number, w: number, h: number, o: PartOpts): void {
  ctx.on(bone).box(w, h, to - from, { ...o, at: [0, y, (from + to) / 2] });
}

/** The waist's distance from the hips, for parts that join the rump to the chest. */
export function waist(p: QuadProportions): number {
  return p.body * WAIST;
}
