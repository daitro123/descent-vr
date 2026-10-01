import { IDLE } from '../enemies/poses';
import type { Pose } from './rig';

// The poses the robed and named figures stand in (clergy.ts, gentry.ts,
// trainers.ts), each holding what they hold: a book or a ledger before the
// chest, a staff or a spade upright at the side, hands folded or clasped
// behind the back, arms folded. Their work loops (people/work.ts) play over
// these, so what's held stays held.

/** Standing easy in a long robe, the hands hanging clear of its sleeves and skirt. */
export const EASY_ROBE: Pose = {
  spine: [0.02, 0, 0],
  upperArmL: [0.04, 0, 0.16],
  forearmL: [-0.2, 0, 0],
  upperArmR: [0.04, 0, -0.16],
  forearmR: [-0.2, 0, 0],
  thighL: [-0.04, 0, 0.03],
  thighR: [0.03, 0, -0.03],
};

/** Hands folded before the waist, into each other's sleeves. */
export const FOLDED: Pose = {
  ...EASY_ROBE,
  upperArmL: [-0.18, 0, 0.12],
  forearmL: [-1.25, -0.55, 0],
  handL: [0, 0, 0],
  upperArmR: [-0.18, 0, -0.12],
  forearmR: [-1.25, 0.55, 0],
  handR: [0, 0, 0],
};

/** Hands clasped behind the back, the chest out: a lord looking over what's his. */
export const BEHIND: Pose = {
  spine: [-0.03, 0, 0],
  head: [-0.04, 0, 0],
  upperArmL: [0.3, 0, 0.1],
  forearmL: [-1.45, -2.0, 0],
  upperArmR: [0.3, 0, -0.1],
  forearmR: [-1.45, 2.0, 0],
  thighL: [-0.04, 0, 0.04],
  thighR: [0.03, 0, -0.04],
};

/** Arms folded across the chest, the left over the right. */
export const ARMS_FOLDED: Pose = {
  spine: [0.0, 0, 0],
  head: [-0.03, 0, 0],
  upperArmL: [-0.42, 0, 0.15],
  forearmL: [-1.75, -1.1, 0],
  upperArmR: [-0.36, 0, -0.15],
  forearmR: [-1.62, 1.1, 0],
  thighL: [-0.05, 0, 0.06],
  thighR: [0.03, 0, -0.06],
};

/** An open book held before the chest on the left palm, the right hand at its edge, the head bowed to it. */
export const READING: Pose = {
  spine: [0.08, 0, 0],
  head: [0.4, 0, 0],
  upperArmL: [-0.35, 0, 0.1],
  forearmL: [-1.25, -0.35, 0],
  handL: [-0.3, 0, 0],
  upperArmR: [-0.35, 0, -0.1],
  forearmR: [-1.25, 0.35, 0],
  handR: [-0.2, 0, 0],
  thighL: [-0.04, 0, 0.03],
  thighR: [0.03, 0, -0.03],
};

/** A ledger open on the left palm, the quill in the right at the page. */
export const WRITING: Pose = {
  ...READING,
  upperArmL: [-0.3, 0, 0.12],
  forearmL: [-1.3, -0.45, 0],
  upperArmR: [-0.32, 0, -0.06],
  forearmR: [-1.4, 0.55, 0],
  handR: [0.35, 0, 0],
};

/** A staff upright in the right fist, the forearm level, the left hand easy. */
export const STAFF: Pose = {
  ...EASY_ROBE,
  upperArmR: [-0.2, 0, -0.12],
  forearmR: [-1.35, 0, 0],
  handR: [0.05, 0, 0.14],
};

/** The same, a book open on the left palm before the chest, looked down at. */
export const STAFF_AND_BOOK: Pose = {
  ...STAFF,
  head: [0.45, 0.15, 0],
  upperArmL: [-0.3, 0, 0.1],
  forearmL: [-1.3, -0.5, 0],
  handL: [-0.3, 0, 0],
};

/** A staff (or a spade) upright in the left fist, the right hand easy. */
export const STAFF_LEFT: Pose = {
  ...EASY_ROBE,
  upperArmL: [-0.2, 0, 0.12],
  forearmL: [-1.35, 0, 0],
  handL: [0.05, 0, -0.14],
};

/** A coin box on the left palm before the chest, a coin in the right fingers over it. */
export const COUNTING: Pose = {
  ...WRITING,
  head: [0.45, 0, 0],
  upperArmR: [-0.38, 0, -0.04],
  forearmR: [-1.35, 0.5, 0],
  handR: [0.1, 0, 0],
};

/** A drawn sword hanging in the right fist, its point by the right foot. */
export const ON_SWORD: Pose = {
  spine: [0.02, 0, 0],
  head: [-0.03, 0, 0],
  upperArmL: [0.04, 0, 0.12],
  forearmL: [-0.25, 0, 0],
  upperArmR: [-0.1, 0.1, -0.1],
  forearmR: [-0.35, 0, 0],
  handR: [0.5, 0, 0],
  thighL: [-0.05, 0, 0.06],
  thighR: [0.04, 0, -0.06],
};

/** An arrow held up before the chest in both hands, looked along. */
export const ARROW: Pose = {
  spine: [0.06, 0, 0],
  head: [0.35, -0.1, 0],
  upperArmL: [-0.35, 0, 0.12],
  forearmL: [-1.3, -0.5, 0],
  upperArmR: [-0.35, 0, -0.12],
  forearmR: [-1.3, 0.5, 0],
  handR: [0, 0, 0],
  thighL: [-0.04, 0, 0.03],
  thighR: [0.03, 0, -0.03],
};

/** A strung longbow held easy in the left hand, as the archers hold theirs, but stood square: their bent right knee would set a booted toe into the floor. */
export const BOW_EASY: Pose = {
  ...IDLE.archer,
  thighL: [-0.06, 0, 0.04],
  shinL: [0.04, 0, 0],
  thighR: [0.03, 0, -0.04],
  shinR: [0, 0, 0],
};
