import { type Group, type Object3D, type PerspectiveCamera, Vector3 } from 'three';
import type { XRInput } from '../../player/input';
import type { Hale } from './actors';
import type { QuestBook, QuestEvent } from './quest';

// PROTOTYPE (Talking to NPCs and tracking quests): what every `?talk` variant
// gets from the scaffold, and what it must provide. Throwaway.

export interface VariantContext {
  camera: PerspectiveCamera;
  /** The player's rig: the camera and controllers ride in it. */
  rig: Group;
  input: XRInput;
  /** Target-ray spaces (where a controller points), by hand, once connected. */
  aim: { left: Object3D | null; right: Object3D | null };
  /** Points on the sword blade that can touch things (its tip). */
  swordPoints: Object3D[];
  hale: Hale;
  book: QuestBook;
  /** This frame's head position (world). */
  head: Vector3;
  /** This frame's gaze direction (world, unit). */
  gaze: Vector3;
  xr: boolean;
  /** Desktop keys, for one frame: E talks; `choice` is 0 or 1 when 1 or 2 was pressed, else -1. */
  keys: { talk: boolean; choice: number };
}

export interface Variant {
  readonly key: string;
  readonly name: string;
  /** One line on how it works, shown when you switch to it. */
  readonly how: string;
  /** Everything the variant draws; the scaffold adds it to the scene. */
  readonly root: Group;
  update(dt: number): void;
  onQuest(e: QuestEvent): void;
}

const _h = new Vector3();
const _d = new Vector3();

/** Floor distance from the head to Hale. */
export function distToHale(ctx: VariantContext): number {
  return Math.hypot(ctx.head.x - ctx.hale.position.x, ctx.head.z - ctx.hale.position.z);
}

/** Angle in degrees between the gaze and the direction to a point. */
export function gazeAngle(ctx: VariantContext, at: Vector3): number {
  _d.subVectors(at, ctx.head).normalize();
  return (ctx.gaze.angleTo(_d) * 180) / Math.PI;
}

/** Angle in degrees between the gaze and Hale's head. */
export function gazeAtHale(ctx: VariantContext): number {
  return gazeAngle(ctx, ctx.hale.head(_h));
}
