import { movesFor } from '../animals/poses';
import type { AttackConfig } from '../config';
import { dressWolf, WOLF_BUILD, WOLF_LOOKS } from '../models/animals';
import type { WeaponSpec } from '../models/characters';
import type { ModelMaterial } from '../models/materials';
import { type QuadBone, type QuadPose, QuadRig } from '../models/quadruped';

// The wolf as an enemy (Wolf, kinds.ts): its body, the four-legged skeleton at
// a wolf's build in one of its coats (models/animals.ts), and the poses it
// fights in. On that skeleton (models/quadruped.ts) x < 0 swings a leg forward,
// x > 0 pitches the neck and head down and opens the jaw; the hips are the
// root, and x < 0 there rears the whole body up, so the hind thighs turn back
// by as much to keep the hind feet under it.

/** Ready to fight: head low, hackles up, lips drawn back off the teeth. */
export const WOLF_IDLE: QuadPose = {
  spine: [0.04, 0, 0],
  neck: [0.25, 0, 0],
  head: [-0.1, 0, 0],
  jaw: [0.12, 0, 0],
  tail: [-0.1, 0, 0],
};

/** Rocked back by a blow, yelping. Mirrored side to side as a person's stagger is (the spine's lean). */
export const WOLF_STAGGER: QuadPose = {
  hips: [-0.15, 0, 0],
  hindThighL: [0.15, 0, 0],
  hindThighR: [0.15, 0, 0],
  spine: [0, 0, 0.15],
  neck: [-0.2, 0, 0],
  head: [0.15, 0, 0],
  jaw: [0.5, 0, 0],
  tail: [-0.3, 0, 0],
};

/** The wolf's attacks: CONFIG.wolf's `bite` and `lunge`. */
export type WolfAttack = 'bite' | 'lunge';

/** An attack's two keyframes: held at the end of the wind-up, and where the blow ends. */
export interface WolfStrike {
  readonly windup: QuadPose;
  readonly strike: QuadPose;
}

export const WOLF_ATTACKS: Record<WolfAttack, WolfStrike> = {
  // A snap at your legs: the head drawn back and the jaws wide, then a step in
  // and up off the front feet with the neck thrown forward, the jaws shutting.
  bite: {
    windup: {
      hips: [0.06, 0, 0],
      hindThighL: [-0.06, 0, 0],
      hindThighR: [-0.06, 0, 0],
      neck: [0.09, 0, 0],
      head: [-0.3, 0, 0],
      jaw: [0.6, 0, 0],
      tail: [0.1, 0, 0],
    },
    strike: {
      hips: [-0.35, 0, 0],
      hindThighL: [0.35, 0, 0],
      hindThighR: [0.35, 0, 0],
      foreThighL: [-0.5, 0, 0],
      foreShinL: [0.55, 0, 0],
      foreThighR: [-0.5, 0, 0],
      foreShinR: [0.55, 0, 0],
      neck: [0.6, 0, 0],
      head: [-0.25, 0, 0],
      jaw: [0.05, 0, 0],
      tail: [0.15, 0, 0],
    },
  },
  // A spring from a few metres out: crouched with the hind legs gathered under
  // it, then stretched out in the air, forepaws reaching, jaws wide at your
  // chest. Its `surge` and `leap` (CONFIG.wolf) carry it there.
  lunge: {
    windup: {
      hips: [0.12, 0, 0],
      hindThighL: [-0.25, 0, 0],
      hindShinL: [-0.3, 0, 0],
      hindThighR: [-0.25, 0, 0],
      hindShinR: [-0.3, 0, 0],
      foreThighL: [0.1, 0, 0],
      foreShinL: [0.25, 0, 0],
      foreThighR: [0.1, 0, 0],
      foreShinR: [0.25, 0, 0],
      neck: [0.28, 0, 0],
      head: [-0.4, 0, 0],
      jaw: [0.3, 0, 0],
      tail: [0.2, 0, 0],
    },
    strike: {
      hips: [-0.45, 0, 0],
      hindThighL: [0.9, 0, 0],
      hindShinL: [0.4, 0, 0],
      hindThighR: [0.9, 0, 0],
      hindShinR: [0.4, 0, 0],
      foreThighL: [-1.1, 0, 0],
      foreShinL: [0.7, 0, 0],
      foreThighR: [-1.1, 0, 0],
      foreShinR: [0.7, 0, 0],
      neck: [0.7, 0, 0],
      head: [-0.25, 0, 0],
      jaw: [0.75, 0, 0],
      tail: [0.4, 0, 0],
    },
  },
};

/** The keyframes of one of the wolf's attacks. */
export function wolfStrike(attack: AttackConfig): WolfStrike {
  const poses = WOLF_ATTACKS[attack.pose as WolfAttack];
  if (!poses) throw new Error(`A wolf has no ${attack.pose}`);
  return poses;
}

/** Struck dead: rolled over onto its side, legs loose, head and tail down. */
export const WOLF_DEAD: QuadPose = {
  foreThighL: [-0.35, 0, 0],
  foreShinL: [0.3, 0, 0],
  foreThighR: [-0.2, 0, 0],
  foreShinR: [0.5, 0, 0],
  hindThighL: [-0.3, 0, 0],
  hindShinL: [-0.2, 0, 0],
  hindThighR: [-0.15, 0, 0],
  hindShinR: [-0.4, 0, 0],
  neck: [-0.15, 0, 0],
  head: [0.2, 0, 0],
  jaw: [0.35, 0, 0],
  tail: [-0.4, 0, 0],
};

/** m its middle stands off the ground: rolled onto its side, it lies that far over, so it's slid back under where it stood. */
export const WOLF_MIDDLE = 0.85 * WOLF_BUILD.hipY;

/** Its trot as it fights: longer strides than a dog's walk (models/animals.ts swing), so its feet keep up at a wolf's pace. */
export const WOLF_SWING = 0.75;

const MOVES = movesFor('dog', WOLF_BUILD);

/** Metres it covers in one full stride of its trot. */
export const WOLF_STRIDE = (MOVES.stride * Math.sin(WOLF_SWING)) / Math.sin(MOVES.swing);

/** The wolf's teeth: from the back of the jaws to the tip of the muzzle, on the head bone. */
export function wolfBite(): WeaponSpec<QuadBone> {
  const h = WOLF_BUILD.head;
  return { bone: 'head', base: [0, -0.01 * h, 0.06 * h], tip: [0, -0.03 * h, 0.2 * h], radius: 0.07 * h };
}

/** Its head's crit sphere, in the head bone's space, and its radius. */
export const WOLF_HEAD = { centre: [0, 0.02 * WOLF_BUILD.head, 0.06 * WOLF_BUILD.head] as const, radius: 0.1 * WOLF_BUILD.head };

/** Its highest point standing ready, over its feet: the top of its head. */
export const WOLF_HEIGHT = WOLF_BUILD.shoulderY + WOLF_BUILD.withers + WOLF_BUILD.neck * Math.sin(WOLF_BUILD.neckRise) + 0.1 * WOLF_BUILD.head;

/** How many coats wolves come in: an enemy's `variant` wraps round them. */
export const WOLF_COATS = WOLF_LOOKS.length;

/** A wolf in its coat (`variant`, wrapping round), on the four-legged skeleton. */
export function buildWolf(variant: number, material?: ModelMaterial): QuadRig {
  const v = ((variant % WOLF_COATS) + WOLF_COATS) % WOLF_COATS;
  return new QuadRig(WOLF_BUILD, dressWolf(v), material, 7 + v);
}
