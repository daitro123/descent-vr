import type { AttackPoseName } from '../config';
import type { EnemyKind } from '../models/characters';
import type { Pose } from '../models/rig';

// Keyframe poses (see rig.ts for the rotation conventions). Attack poses are
// shared by every kind: the same angles on longer bones make a bigger arc.
// Each attack is a pair: `windup` is held at the end of the telegraph, and the
// swing blends windup → `strike`, so the arc between them IS the blow that the
// strike sweep tests against the player's shield, sword and body.

const HALF_PI = Math.PI / 2;

export const IDLE: Record<EnemyKind, Pose> = {
  grunt: {
    spine: [0.08, 0, 0],
    head: [-0.06, 0, 0],
    upperArmR: [-0.35, 0, -0.18],
    forearmR: [-0.9, 0, 0],
    handR: [-0.45, 0, 0],
    upperArmL: [-0.25, 0, 0.18],
    forearmL: [-0.7, 0, 0],
    thighL: [-0.15, 0, 0.04],
    shinL: [0.2, 0, 0],
    thighR: [0.12, 0, -0.04],
    shinR: [0.12, 0, 0],
  },
  archer: {
    spine: [0.05, 0, 0],
    upperArmL: [-0.5, -0.3, 0.1],
    forearmL: [-0.9, 0, 0],
    handL: [-0.2, 0, 0.1],
    upperArmR: [-0.45, 0.45, -0.05],
    forearmR: [-1.1, 0, 0],
    thighL: [-0.1, 0, 0.04],
    shinL: [0.12, 0, 0],
    thighR: [0.08, 0, -0.04],
    shinR: [0.1, 0, 0],
  },
  brute: {
    spine: [0.38, 0, 0],
    head: [-0.35, 0, 0],
    upperArmR: [-0.3, 0, -0.28],
    forearmR: [-0.35, 0, 0],
    handR: [-0.6, 0, 0],
    upperArmL: [-0.15, 0, 0.3],
    forearmL: [-0.55, 0, 0],
    thighL: [-0.3, 0, 0.08],
    shinL: [0.45, 0, 0],
    thighR: [-0.1, 0, -0.08],
    shinR: [0.3, 0, 0],
  },
  warden: {
    spine: [0.06, 0, 0],
    head: [-0.04, 0, 0],
    upperArmR: [-0.25, 0.2, -0.1],
    forearmR: [-0.5, 0, 0],
    handR: [-0.35, 0, 0],
    upperArmL: [-0.35, -0.2, 0.2],
    forearmL: [-0.6, 0, 0],
    thighL: [-0.12, 0, 0.04],
    shinL: [0.15, 0, 0],
    thighR: [0.1, 0, -0.04],
    shinR: [0.1, 0, 0],
  },
};

export interface AttackPoses {
  windup: Pose;
  strike: Pose;
}

/** Overhead chop: from behind the head, straight down in front. */
export const CHOP: AttackPoses = {
  windup: {
    spine: [-0.18, -0.2, 0],
    head: [0.1, 0.1, 0],
    upperArmR: [-3.35, 0.15, -0.15],
    forearmR: [-1.1, 0, 0],
    handR: [-0.7, 0, 0],
    upperArmL: [-1.0, 0, 0.35],
    forearmL: [-0.4, 0, 0],
  },
  strike: {
    spine: [0.4, 0.1, 0],
    head: [-0.3, 0, 0],
    upperArmR: [-1.05, 0.2, -0.05],
    forearmR: [-0.15, 0, 0],
    handR: [-0.25, 0, 0],
    upperArmL: [-0.3, 0, 0.5],
    forearmL: [-0.6, 0, 0],
  },
};

/**
 * Forehand slash from the attacker's right to its left. Facing it, the blade
 * arrives from the player's LEFT, the shield side. The hand is rolled a
 * quarter turn (y) so the edge leads the horizontal sweep instead of the
 * flat; x then bends the wrist in the plane of the swing.
 */
export const SLASH_R: AttackPoses = {
  windup: {
    spine: [0.05, -0.75, 0],
    head: [0, 0.6, 0],
    upperArmR: [-1.45, -1.35, -0.1],
    forearmR: [-0.9, 0, 0],
    handR: [-1.1, -HALF_PI, 0],
    upperArmL: [-1.1, -0.4, 0.3],
    forearmL: [-0.5, 0, 0],
  },
  strike: {
    spine: [0.12, 0.65, 0],
    head: [0, -0.5, 0],
    upperArmR: [-1.5, 1.15, 0],
    forearmR: [-0.1, 0, 0],
    handR: [0.7, -HALF_PI, 0],
    upperArmL: [-0.3, 0.2, 0.5],
    forearmL: [-0.5, 0, 0],
  },
};

/**
 * Backhand slash from the attacker's left: arrives on the player's RIGHT, the
 * sword side. Rolled the other way from SLASH_R, so the same edge leads.
 */
export const SLASH_L: AttackPoses = {
  windup: {
    spine: [0.05, 0.7, 0],
    head: [0, -0.55, 0],
    upperArmR: [-1.4, 1.25, 0.1],
    forearmR: [-1.3, 0, 0],
    handR: [-1.1, HALF_PI, 0],
    upperArmL: [-0.4, 0.2, 0.4],
    forearmL: [-0.8, 0, 0],
  },
  strike: {
    spine: [0.12, -0.7, 0],
    head: [0, 0.5, 0],
    upperArmR: [-1.5, -1.25, -0.1],
    forearmR: [-0.05, 0, 0],
    handR: [0.6, HALF_PI, 0],
    upperArmL: [-0.8, -0.3, 0.3],
    forearmL: [-0.4, 0, 0],
  },
};

/** Two-handed overhead ground slam (brute, warden). Unblockable: the telegraph glows red. */
export const SLAM: AttackPoses = {
  windup: {
    spine: [-0.3, 0, 0],
    head: [0.2, 0, 0],
    upperArmR: [-3.3, 0.35, 0],
    forearmR: [-0.6, 0, 0],
    handR: [-0.5, 0, 0],
    upperArmL: [-3.3, -0.35, 0],
    forearmL: [-0.6, 0, 0],
    thighL: [-0.35, 0, 0.1],
    shinL: [0.35, 0, 0],
    thighR: [0.2, 0, -0.1],
    shinR: [0.2, 0, 0],
  },
  strike: {
    spine: [0.75, 0, 0],
    head: [-0.5, 0, 0],
    upperArmR: [-1.3, 0.3, 0],
    forearmR: [-0.1, 0, 0],
    handR: [-0.2, 0, 0],
    upperArmL: [-1.3, -0.3, 0],
    forearmL: [-0.1, 0, 0],
    thighL: [-0.8, 0, 0.1],
    shinL: [0.9, 0, 0],
    thighR: [0.3, 0, -0.1],
    shinR: [0.6, 0, 0],
  },
};

/**
 * Archer: side-on, bow arm straight at the target, string hand drawn to the
 * chin. At full draw the nocked arrow points straight ahead and level; the
 * enemy turns and bends the spine at runtime so it tracks the player (see
 * Enemy.aimBow).
 */
export const DRAW: AttackPoses = {
  windup: {
    spine: [0, -0.97, 0],
    head: [0, 0.97, 0],
    upperArmL: [-1.73, 0.74, 0],
    forearmL: [0, 0, 0],
    handL: [0, 0, 0],
    upperArmR: [-0.69, 1.25, 0.03],
    forearmR: [-2.16, 0, 0],
    handR: [-0.17, 0, 0],
    thighL: [-0.25, 0, 0.08],
    shinL: [0.15, 0, 0],
    thighR: [0.2, 0, -0.1],
    shinR: [0.1, 0, 0],
  },
  // Release: the string hand flicks back past the ear.
  strike: {
    spine: [0, -1.02, 0],
    head: [0, 0.97, 0],
    upperArmL: [-1.73, 0.74, 0],
    forearmL: [0, 0, 0],
    upperArmR: [-0.74, 0.9, -0.37],
    forearmR: [-2.3, 0, 0],
    handR: [-0.37, 0, 0],
    thighL: [-0.25, 0, 0.08],
    shinL: [0.15, 0, 0],
    thighR: [0.2, 0, -0.1],
    shinR: [0.1, 0, 0],
  },
};

/** Warden raising the greatsword to call up the dead. */
export const SUMMON: AttackPoses = {
  windup: {
    spine: [-0.25, 0, 0],
    head: [0.35, 0, 0],
    upperArmR: [-3.0, 0, -0.1],
    forearmR: [-0.1, 0, 0],
    handR: [-3.0, 0, 0],
    upperArmL: [-0.4, 0, 1.3],
    forearmL: [-0.3, 0, 0],
  },
  strike: {
    spine: [0.3, 0, 0],
    head: [-0.2, 0, 0],
    upperArmR: [-1.2, 0, -0.1],
    forearmR: [-0.1, 0, 0],
    handR: [-0.3, 0, 0],
    upperArmL: [-0.4, 0, 0.9],
    forearmL: [-0.3, 0, 0],
  },
};

export type GuardSide = 'high' | 'left' | 'right' | 'low';

/**
 * Guards: the weapon raised to take the player's blade (Enemy.updateGuard
 * picks one from where your sword is). `left` covers the enemy's left, which
 * is where your forehand arrives; `high` holds the blade flat over the head
 * against a chop; `low` hangs it point down across the front of the legs, the
 * wrist turned so the edge still faces you. Edge toward the blow, knees soft.
 */
export const GUARD: Record<GuardSide, Pose> = {
  high: {
    spine: [0.05, 0.07, 0],
    head: [-0.1, -0.07, 0],
    upperArmR: [-2.06, -1.7, 0.27],
    forearmR: [-1.14, 0.12, 0],
    handR: [-1.3, 0.2, 0],
    upperArmL: [-0.5, 0, 0.3],
    forearmL: [-1.0, 0, 0],
    thighL: [-0.25, 0, 0.08],
    shinL: [0.3, 0, 0],
    thighR: [0.1, 0, -0.08],
    shinR: [0.2, 0, 0],
  },
  left: {
    spine: [0.05, 0.11, 0],
    head: [0, -0.1, 0],
    upperArmR: [-0.15, 0.44, 0.15],
    forearmR: [-1.41, 0, 0],
    handR: [-1.3, 0.6, -0.24],
    upperArmL: [-0.3, -0.2, 0.35],
    forearmL: [-0.9, 0, 0],
    thighL: [-0.25, 0, 0.08],
    shinL: [0.3, 0, 0],
    thighR: [0.1, 0, -0.08],
    shinR: [0.2, 0, 0],
  },
  right: {
    spine: [0.05, -0.23, 0],
    head: [0, 0.2, 0],
    upperArmR: [0, 0, -0.14],
    forearmR: [-1.63, 0, 0],
    handR: [-1.3, -0.19, 0.1],
    upperArmL: [-0.45, 0, 0.25],
    forearmL: [-1.0, 0, 0],
    thighL: [-0.25, 0, 0.08],
    shinL: [0.3, 0, 0],
    thighR: [0.1, 0, -0.08],
    shinR: [0.2, 0, 0],
  },
  low: {
    spine: [0.15, 0, 0],
    head: [-0.2, 0, 0],
    upperArmR: [-0.3, 0.06, 0.13],
    forearmR: [-0.48, 0, 0],
    handR: [-0.25, 2.92, -0.2],
    upperArmL: [-0.3, -0.2, 0.35],
    forearmL: [-0.9, 0, 0],
    thighL: [-0.35, 0, 0.12],
    shinL: [0.45, 0, 0],
    thighR: [0.15, 0, -0.12],
    shinR: [0.3, 0, 0],
  },
};

/** Knocked to one knee: brings a giant's head down into sword reach. */
export const KNEEL: Pose = {
  spine: [0.45, 0, 0],
  head: [-0.2, 0, 0],
  upperArmR: [-0.3, 0, -0.4],
  forearmR: [-0.2, 0, 0],
  handR: [-0.2, 0, 0],
  upperArmL: [-0.9, 0, 0.2],
  forearmL: [-0.9, 0, 0],
  thighL: [-1.45, 0, 0.1],
  shinL: [1.5, 0, 0],
  thighR: [0.2, 0, -0.1],
  shinR: [1.9, 0, 0],
};
/** Hip drop that goes with KNEEL, as a fraction of hip height. */
export const KNEEL_DROP = 0.42;

/** Rocked back by a blow. Mirrored in X for hits from the other side. */
export const STAGGER: Pose = {
  spine: [-0.35, 0, 0.12],
  head: [-0.35, 0, 0],
  upperArmR: [-0.7, 0, -0.7],
  forearmR: [-0.3, 0, 0],
  upperArmL: [-0.7, 0, 0.7],
  forearmL: [-0.3, 0, 0],
};

/** Clawing out of the grave while rising. */
export const RISE: Pose = {
  spine: [0.3, 0, 0],
  head: [-0.4, 0, 0],
  upperArmR: [-2.6, 0, -0.3],
  forearmR: [-0.4, 0, 0],
  upperArmL: [-2.8, 0, 0.3],
  forearmL: [-0.4, 0, 0],
  thighL: [-0.6, 0, 0],
  shinL: [0.9, 0, 0],
  thighR: [-0.2, 0, 0],
  shinR: [0.5, 0, 0],
};

/** Walk cycle offsets, added on top of a base pose. `phase` in radians, `amount` 0–1. */
export function walkOffsets(phase: number, amount: number, out: Record<string, [number, number, number]>): void {
  const s = Math.sin(phase);
  const a = 0.5 * amount;
  out.thighL = [-a * s, 0, 0];
  out.thighR = [a * s, 0, 0];
  out.shinL = [amount * 0.7 * Math.max(0, Math.sin(phase + 1.3)), 0, 0];
  out.shinR = [amount * 0.7 * Math.max(0, Math.sin(phase + 1.3 + Math.PI)), 0, 0];
  out.upperArmL = [a * 0.5 * s, 0, 0];
  out.upperArmR = [-a * 0.3 * s, 0, 0];
  out.spine = [0.06 * amount, 0.1 * amount * s, 0];
}

export const ATTACK_POSES: Record<AttackPoseName, AttackPoses> = {
  chop: CHOP,
  slashR: SLASH_R,
  slashL: SLASH_L,
  slam: SLAM,
  draw: DRAW,
  summon: SUMMON,
};
