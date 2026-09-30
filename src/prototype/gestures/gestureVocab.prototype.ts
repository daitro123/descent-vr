// PROTOTYPE (abilities ticket 07): the gestures, the three vocabularies tried,
// what each class binds them to, and the places on the body that never arm.
// Throwaway; see gestureKit.prototype.ts.

import type { GestureKind, Point } from './gestureMatcher.prototype';

/** One gesture, drawn with the right hand, as its ideal path. */
export interface GestureDef {
  id: string;
  /** What the banner and the panel call it. */
  name: string;
  /** How to draw it, in a few words. */
  how: string;
  kind: GestureKind;
  /**
   * The ideal path, in the body frame (x right, y up, z forward), at unit
   * size, starting at the origin: a list of corners, or a curve's samples.
   */
  path: Point[];
}

const TAU = Math.PI * 2;

function arc(cx: number, cy: number, r: number, from: number, to: number, n = 24): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a), 0]);
  }
  return out;
}

/** Move a path so it starts at the origin. */
function fromOrigin(path: Point[]): Point[] {
  const [x0, y0, z0] = path[0];
  return path.map(([x, y, z]) => [x - x0, y - y0, z - z0] as Point);
}

export const GESTURES: Record<string, GestureDef> = {
  // Flicks: a short, quick, straight move out of the chest.
  up: { id: 'up', name: 'FLICK UP', how: 'from the chest, flick the fist up past your face', kind: 'flick', path: [[0, 0, 0], [0, 1, 0.1]] },
  down: { id: 'down', name: 'FLICK DOWN', how: 'from the chest, flick the fist down to the belt', kind: 'flick', path: [[0, 0, 0], [0, -1, 0.1]] },
  out: { id: 'out', name: 'PUSH OUT', how: 'from the chest, punch the fist straight out', kind: 'flick', path: [[0, 0, 0], [0, 0.1, 1]] },
  side: { id: 'side', name: 'FLICK OUT', how: 'from the chest, flick the fist out to your right', kind: 'flick', path: [[0, 0, 0], [1, 0, 0.2]] },
  across: { id: 'across', name: 'FLICK ACROSS', how: 'from the chest, flick the fist across to your left', kind: 'flick', path: [[0, 0, 0], [-1, 0, 0.2]] },
  // Shapes: drawn in the air in front of you, as on a window.
  ring: {
    id: 'ring',
    name: 'RING',
    how: 'a circle, from the top, clockwise',
    kind: 'shape',
    path: fromOrigin(arc(0, 0, 1, TAU / 4, TAU / 4 - TAU * 1.05, 40)),
  },
  triangle: {
    id: 'triangle',
    name: 'TRIANGLE',
    how: 'from the top: down right, across left, back up',
    kind: 'shape',
    path: fromOrigin([[0, 1, 0], [0.87, -0.5, 0], [-0.87, -0.5, 0], [0, 1, 0]]),
  },
  zed: {
    id: 'zed',
    name: 'ZED',
    how: 'a Z: across, down to the left, across',
    kind: 'shape',
    path: fromOrigin([[-1, 1, 0], [1, 1, 0], [-1, -1, 0], [1, -1, 0]]),
  },
  vee: {
    id: 'vee',
    name: 'VEE',
    how: 'a V: down to the bottom, back up to the right',
    kind: 'shape',
    path: fromOrigin([[-0.7, 1, 0], [0, -1, 0], [0.7, 1, 0]]),
  },
  ess: {
    id: 'ess',
    name: 'ESS',
    how: 'an S, from the top right',
    kind: 'shape',
    path: fromOrigin([...arc(0, 0.5, 0.5, 0.3, Math.PI * 1.5, 16), ...arc(0, -0.5, 0.5, Math.PI / 2, -Math.PI * 0.8, 16).slice(1)]),
  },
  // Three more shapes, only to see how many one class can hold (the bench's growth run).
  hook: {
    id: 'hook',
    name: 'HOOK',
    how: 'a J: straight down, then curl up to the left',
    kind: 'shape',
    path: fromOrigin([[0.4, 1, 0], ...arc(0, -0.4, 0.4, 0, -Math.PI * 1.1, 14)]),
  },
  wave: {
    id: 'wave',
    name: 'WAVE',
    how: 'a wave, left to right: up, down, up, down',
    kind: 'shape',
    path: Array.from({ length: 33 }, (_, i) => [(i / 32) * 2, 0.5 * Math.sin((i / 32) * TAU * 1.5), 0] as Point),
  },
  box: {
    id: 'box',
    name: 'BOX',
    how: 'a square, from the top left, clockwise',
    kind: 'shape',
    path: fromOrigin([[-1, 1, 0], [1, 1, 0], [1, -1, 0], [-1, -1, 0], [-1, 1, 0]]),
  },
};

/** Every shape, in the order the growth run adds them. */
export const ALL_SHAPES = ['ring', 'zed', 'vee', 'triangle', 'ess', 'hook', 'wave', 'box'];

/** A vocabulary: which gestures a class uses, in the order its abilities take them. */
export interface Vocabulary {
  id: 'A' | 'B' | 'C';
  name: string;
  gestures: string[];
}

export const VOCABULARIES: Vocabulary[] = [
  { id: 'A', name: 'mixed: two flicks, three shapes', gestures: ['out', 'up', 'ring', 'zed', 'vee'] },
  { id: 'B', name: 'flicks only', gestures: ['out', 'up', 'down', 'side', 'across'] },
  { id: 'C', name: 'shapes only', gestures: ['ring', 'zed', 'vee', 'triangle', 'ess'] },
];

/** The pick, on Tom's behalf (see the ticket's Answer). */
export const DEFAULT_VOCABULARY: Vocabulary['id'] = 'C';

export type ClassName = 'warrior' | 'ranger' | 'mage';

/** A placeholder ability: a coloured burst, a sound and a buzz, and a cost in the class's resource. */
export interface Ability {
  colour: string;
  hex: number;
  cost: number;
}

export interface ClassBinding {
  resource: 'rage' | 'focus' | 'mana';
  /** Gesture abilities, in vocabulary order: a class with fewer takes the first few. */
  gestures: Ability[];
  /** The A/X ability, where the button is free (the warrior's is the War Cry, as today). */
  button: Ability | null;
}

const RED: Omit<Ability, 'cost'> = { colour: 'red', hex: 0xff5040 };
const GOLD: Omit<Ability, 'cost'> = { colour: 'gold', hex: 0xffc040 };
const GREEN: Omit<Ability, 'cost'> = { colour: 'green', hex: 0x60e070 };
const BLUE: Omit<Ability, 'cost'> = { colour: 'blue', hex: 0x60a0ff };
const VIOLET: Omit<Ability, 'cost'> = { colour: 'violet', hex: 0xc070ff };
const WHITE: Omit<Ability, 'cost'> = { colour: 'white', hex: 0xf0f0ff };

/**
 * Costs from ticket 09 (every bar is 100): the warrior's War Cry is 50 and
 * Earthshaker 35, focus abilities cost 20 to 40 and mana ones 15 to 40. The
 * warrior keeps both of those and takes four gestures; the others take five
 * and a button.
 */
export const CLASSES: Record<ClassName, ClassBinding> = {
  warrior: {
    resource: 'rage',
    gestures: [
      { ...RED, cost: 15 },
      { ...GOLD, cost: 20 },
      { ...GREEN, cost: 25 },
      { ...BLUE, cost: 30 },
    ],
    button: null,
  },
  ranger: {
    resource: 'focus',
    gestures: [
      { ...RED, cost: 20 },
      { ...GOLD, cost: 25 },
      { ...GREEN, cost: 30 },
      { ...BLUE, cost: 35 },
      { ...VIOLET, cost: 40 },
    ],
    button: { ...WHITE, cost: 30 },
  },
  mage: {
    resource: 'mana',
    gestures: [
      { ...RED, cost: 15 },
      { ...GOLD, cost: 20 },
      { ...GREEN, cost: 25 },
      { ...BLUE, cost: 30 },
      { ...VIOLET, cost: 40 },
    ],
    button: { ...WHITE, cost: 25 },
  },
};

/** The gestures a class uses under a vocabulary, each with its ability. */
export function bindings(cls: ClassName, vocab: Vocabulary): { gesture: GestureDef; ability: Ability }[] {
  const abilities = CLASSES[cls].gestures;
  return vocab.gestures.slice(0, abilities.length).map((id, i) => ({ gesture: GESTURES[id], ability: abilities[i] }));
}

/**
 * Places on the body where a grip belongs to something else, in the body
 * frame from the eyes (m): the bag over either shoulder (Inventory's bag
 * prototype), the potion slots at the hips (the belt prototype), and the tool
 * loop behind the main-hand hip (Professions' pick prototype). A grip that
 * goes down in one never arms a gesture.
 */
export const TAKEN_PLACES: { name: string; at: Point; radius: number }[] = [
  { name: 'the bag (right shoulder)', at: [0.2, -0.14, -0.12], radius: 0.18 },
  { name: 'the bag (left shoulder)', at: [-0.2, -0.14, -0.12], radius: 0.18 },
  { name: 'a potion (right hip)', at: [0.19, -0.7, 0.04], radius: 0.12 },
  { name: 'a potion (left hip)', at: [-0.19, -0.7, 0.04], radius: 0.12 },
  { name: 'the tool loop', at: [0.19, -0.66, -0.16], radius: 0.12 },
];

/** Which taken place, if any, a grip at `p` (body frame) is in. */
export function takenPlace(p: Point): string | null {
  for (const z of TAKEN_PLACES) {
    if (Math.hypot(p[0] - z.at[0], p[1] - z.at[1], p[2] - z.at[2]) <= z.radius) return z.name;
  }
  return null;
}
