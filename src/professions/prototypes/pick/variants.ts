import type { Object3D, Vector3 } from 'three';
import type { FloatingText } from '../../../fx/floatingText';
import type { Particles } from '../../../fx/particles';
import type { Handedness } from '../../../player/input';
import type { Bag } from './bag';

// PROTOTYPE (?proto=pick): the three variants, as the rules each one plays by,
// and what the vein and the herbs get from the scaffold. Throwaway.

export interface Rules {
  /** How a strike on the vein counts: by the swing's speed alone, or more in the glinting weak spot. */
  strike: 'speed' | 'glint';
  /** What a broken vein drops: chunks you pick up, or ore that flies to the bag. */
  ore: 'grab' | 'bag';
  /** How you take an herb: a slice with the knife through its stems, or a grab and a pull. */
  herb: 'slice' | 'pull';
}

export interface Variant {
  key: string;
  name: string;
  /** How it plays, shown as you switch to it. */
  how: string;
  rules: Rules;
}

/**
 * A is the plain, speed-only swing with chunks to pick up. B and C strike the
 * glint and send the ore to the bag; they differ only in the herb, so B against
 * C compares the knife with the hand, and A against C the two ways to strike.
 */
export const VARIANTS: Variant[] = [
  {
    key: 'A',
    name: 'Swing hard, slice',
    how: 'Every strike counts by how fast the head is going: 3 full swings or 5 gentle ones break the vein. Pick up the chunks with either hand. Cut the Hearthleaf low, through its stems, with the knife.',
    rules: { strike: 'speed', ore: 'grab', herb: 'slice' },
  },
  {
    key: 'B',
    name: 'Strike the glint, pull',
    how: 'A glint moves over the ore: a strike in it counts more than twice a plain one (2 glints or 5 plain strikes). The ore flies to your bag. Grab the Hearthleaf with either hand and pull it up by the root.',
    rules: { strike: 'glint', ore: 'bag', herb: 'pull' },
  },
  {
    key: 'C',
    name: 'Strike the glint, slice',
    how: 'The glint as in B, and the ore flies to your bag. Cut the Hearthleaf low, through its stems, with the knife.',
    rules: { strike: 'glint', ore: 'bag', herb: 'slice' },
  },
];

/** What a gathering spot gets from the scaffold. */
export interface Fx {
  scene: Object3D;
  particles: Particles;
  floats: FloatingText;
  bag: Bag;
  pulse(hand: Handedness, intensity: number, ms: number): void;
  /** A line in front of you for a moment. */
  hint(text: string): void;
  heightAt(x: number, z: number): number;
  /** Seconds since the page started. */
  now(): number;
}

/** A hand, as the spots see it this frame. */
export interface HandNow {
  hand: Handedness;
  /** World position of the grip. */
  at: Vector3;
  /** m/s. */
  speed: number;
  squeeze: number;
  /** The grip went down this frame. */
  squeezed: boolean;
}
