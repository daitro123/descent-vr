import { B, BIRD_LOOKS, type BirdFamily, type BirdLookId } from '../models/bird';
import { type BirdPose, FOLD, LIFT } from './flock';

// The birds' poses, written into a bird's pose array (flock.ts) a piece at a
// time: a stance to start from (standing, swimming or flying), then what it's
// doing on top (pecking, walking, a wingbeat), then its feet put back under
// it. Angles follow models/bird.ts. Every bird of a family shares its poses;
// a look only changes how it carries itself (a hen's tail cocked, a heron's
// neck drawn in) and how fast its wings beat.

const PI = Math.PI;

/** How a bird of a look carries itself, and flies. */
export interface Carriage {
  /** The body's tilt standing (< 0 breast up), the neck's lean, the head's nod and the tail's cock. */
  readonly pitch: number;
  readonly neck: number;
  readonly head: number;
  readonly tail: number;
  /** Wingbeats a second in level flight, and how deep (rad either side). */
  readonly beat: number;
  readonly depth: number;
  /** Its wings held gliding: lifted (rad), and the tips bent (> 0 up, < 0 down: a gull's crook). */
  readonly glide: readonly [number, number];
  /** Flies with its neck drawn back into its shoulders, as a heron does. */
  readonly tuck?: boolean;
  /** How much of its body sits under the water swimming, as a share of its depth. */
  readonly sink: number;
}

const CARRIAGE: Record<BirdFamily, Carriage> = {
  crow: { pitch: -0.32, neck: 0.1, head: 0.28, tail: -0.12, beat: 4, depth: 0.85, glide: [0.12, 0.12], sink: 0 },
  gull: { pitch: -0.12, neck: 0.15, head: 0.12, tail: -0.05, beat: 2.6, depth: 0.7, glide: [0.16, -0.32], sink: 0.35 },
  hen: { pitch: -0.12, neck: 0.05, head: 0.15, tail: 0.85, beat: 8, depth: 0.9, glide: [0.05, -0.08], sink: 0 },
  duck: { pitch: 0, neck: -0.05, head: 0.08, tail: 0.15, beat: 5.5, depth: 0.7, glide: [0.05, 0], sink: 0.42 },
  heron: { pitch: -0.5, neck: 0.32, head: 0.22, tail: -0.1, beat: 1.7, depth: 0.75, glide: [0.04, -0.12], tuck: true, sink: 0 },
};

/** Looks that carry themselves unlike the rest of their family. */
const OWN: Partial<Record<BirdLookId, Partial<Carriage>>> = {
  pigeon: { beat: 6.5, pitch: -0.28 },
  raven: { beat: 3.2, glide: [0.1, 0.18] },
  grouse: { tail: 0.1, pitch: 0, beat: 10, glide: [-0.05, -0.12] },
  swan: { neck: -0.12, head: 0.32, beat: 3, depth: 0.65, sink: 0.38 },
  goose: { neck: -0.08, head: 0.22, beat: 3.8, sink: 0.4 },
  cock: { tail: 1.0, pitch: -0.2 },
  curlew: { pitch: -0.15, neck: 0.15, head: 0.25, tuck: false, beat: 3 },
  bittern: { pitch: -0.35, neck: 0.2, head: 0.2 },
};

const carriages = new Map<BirdLookId, Carriage>();

/** How `look` carries itself. */
export function carriageOf(look: BirdLookId): Carriage {
  let c = carriages.get(look);
  if (!c) carriages.set(look, (c = { ...CARRIAGE[BIRD_LOOKS[look].family], ...OWN[look] }));
  return c;
}

/** How deep `look` sits swimming: its hip this far under the water's face (m), its body `sink` of its depth under. */
export function swimDepth(look: BirdLookId): number {
  const { breast, rump } = BIRD_LOOKS[look].body;
  const middle = (breast.y + rump.y) / 2;
  const depth = (breast.h + rump.h) / 2;
  return middle - depth / 2 + carriageOf(look).sink * depth;
}

// ------------------------------------------------------------ pieces

/** Both wings: the left at (x, y, z) and its tip at (tx, ty, tz), the right mirrored. */
export function wings(p: BirdPose, x: number, y: number, z: number, tx = 0, ty = 0, tz = 0): void {
  p[B.wingL * 3] = x;
  p[B.wingL * 3 + 1] = y;
  p[B.wingL * 3 + 2] = z;
  p[B.wingR * 3] = x;
  p[B.wingR * 3 + 1] = -y;
  p[B.wingR * 3 + 2] = -z;
  p[B.tipL * 3] = tx;
  p[B.tipL * 3 + 1] = ty;
  p[B.tipL * 3 + 2] = tz;
  p[B.tipR * 3] = tx;
  p[B.tipR * 3 + 1] = -ty;
  p[B.tipR * 3 + 2] = -tz;
}

/** Folded wings at the sides, their tips crossed over the tail; `open` (0–1) lifts them out from the body. */
export function folded(p: BirdPose, open = 0): void {
  const k = 1 - open;
  wings(p, (-PI / 2) * k, (PI / 2 + 0.1) * k + 0.25 * open, 0.25 * open, 0, 0.05 * k, 0.18 * k);
  p[FOLD] = k;
}

/** Set one bone's turn. */
export function set(p: BirdPose, bone: number, x: number, y = 0, z = 0): void {
  p[bone * 3] = x;
  p[bone * 3 + 1] = y;
  p[bone * 3 + 2] = z;
}

/** Add to one bone's turn. */
export function add(p: BirdPose, bone: number, x: number, y = 0, z = 0): void {
  p[bone * 3] += x;
  p[bone * 3 + 1] += y;
  p[bone * 3 + 2] += z;
}

/** Stand the legs straight down from the hip, however the body's tipped, each swung `swing` (rad, the left; the right opposite). */
export function plant(p: BirdPose, swing = 0, roll = 0): void {
  const pitch = p[B.body * 3];
  set(p, B.legL, -pitch + swing, 0, -roll);
  set(p, B.legR, -pitch - swing, 0, -roll);
}

// ------------------------------------------------------------ stances

/** Standing at rest: the look's carriage, wings folded, feet under it. */
export function standing(p: BirdPose, c: Carriage): void {
  p.fill(0);
  set(p, B.body, c.pitch);
  set(p, B.neck, c.neck);
  set(p, B.head, c.head);
  set(p, B.tail, c.tail);
  folded(p);
  plant(p);
}

/** Sitting on the water (its hip `swimDepth` under), legs folded under it, unseen. */
export function swimming(p: BirdPose, c: Carriage): void {
  p.fill(0);
  set(p, B.neck, c.neck);
  set(p, B.head, c.head);
  set(p, B.tail, c.tail + 0.12);
  folded(p);
  set(p, B.legL, 1.4);
  set(p, B.legR, 1.4);
}

/**
 * Flying: the body level (the bird's pitch and roll do the rest), legs
 * trailing, the neck out (or drawn back, for a heron), the wings at `phase`
 * of a beat `power` deep (0 glides), easing toward the glide as power fades.
 */
export function flying(p: BirdPose, c: Carriage, phase: number, power: number): void {
  p.fill(0);
  const tuck = c.tuck ?? false;
  set(p, B.neck, tuck ? -0.75 : 1.05);
  set(p, B.head, tuck ? 1.1 : -0.95);
  set(p, B.tail, 0.02);
  set(p, B.legL, tuck ? 1.45 : 1.25);
  set(p, B.legR, tuck ? 1.45 : 1.25);
  const s = Math.sin(phase);
  const lag = Math.sin(phase - 0.9);
  const up = Math.max(0, Math.cos(phase));
  const [lift, bend] = c.glide;
  const d = c.depth * power;
  // Down fast and up with the wings drawn back a little; the tips trail the stroke.
  wings(p, 0, 0.08 + 0.32 * up * power, lift * (1 - power) + 0.2 * power + d * s, 0, 0.1 * up * power, bend * (1 - power) + 0.45 * d * lag);
}

/** Lifting off or coming in: wings high and reaching forward, beating hard, legs down, tail spread down. */
export function hovering(p: BirdPose, c: Carriage, phase: number): void {
  flying(p, c, phase, 1);
  const s = Math.sin(phase);
  wings(p, 0, -0.45 + 0.25 * Math.cos(phase), 0.55 + 0.75 * s, 0, -0.1, 0.35 * Math.sin(phase - 0.9));
  set(p, B.neck, (c.tuck ? 0.1 : 0.3) + c.neck * 0.5);
  set(p, B.head, c.head * 0.6);
  set(p, B.legL, -0.35);
  set(p, B.legR, -0.35);
  set(p, B.tail, -0.45);
}

// ------------------------------------------------------------ what they do

/** Head down to the ground (`u` 0–1 of the way): pecking, grazing, feeding. */
export function peck(p: BirdPose, c: Carriage, u: number): void {
  add(p, B.body, (0.55 - c.pitch * 0.6) * u);
  add(p, B.neck, 0.75 * u);
  add(p, B.head, 0.5 * u);
  add(p, B.tail, 0.25 * u);
}

/** Walking: legs swinging at `phase`, the body rocking and the head bobbing with each step. */
export function walking(p: BirdPose, phase: number, stride: number, bob = 0): void {
  const s = Math.sin(phase);
  add(p, B.body, 0, 0, 0.05 * s);
  add(p, B.neck, bob * Math.sin(phase * 2));
  p[LIFT] += Math.abs(Math.cos(phase)) * stride * 0.06;
  plant(p, stride * s, 0.05 * s);
}

/** A croak or a caw: the body thrust forward, the neck stretched out and the tail flicked, the wings loosened. */
export function calling(p: BirdPose, u: number): void {
  add(p, B.body, 0.35 * u);
  add(p, B.neck, 0.5 * u);
  add(p, B.head, -0.45 * u);
  add(p, B.tail, 0.3 * u);
  folded(p, 0.12 * u);
}

/** Its head turned back over its shoulder into its wing (`side` 1 its left, -1 its right). */
export function preening(p: BirdPose, u: number, side: number): void {
  add(p, B.neck, -0.25 * u);
  add(p, B.head, 0.55 * u, 2.4 * side * u);
}

/** Head down and tail up in the water: dabbling. */
export function dabbling(p: BirdPose, u: number): void {
  add(p, B.body, 1.15 * u);
  add(p, B.neck, 0.55 * u);
  add(p, B.head, 0.45 * u);
  add(p, B.tail, 0.4 * u);
}

/** A heron's strike: the neck shot out and down at the water, the bill after it. */
export function striking(p: BirdPose, u: number): void {
  add(p, B.body, 0.45 * u);
  add(p, B.neck, 1.75 * u);
  add(p, B.head, -0.25 * u);
}

/** A goose's threat: neck low and out toward you, wings half open, the body tipped forward. */
export function hissing(p: BirdPose, u: number): void {
  add(p, B.body, 0.25 * u);
  add(p, B.neck, 1.25 * u);
  add(p, B.head, -1.2 * u);
  folded(p, 0.45 * u);
}

/** Squabbling: wings lifted half open, neck out, the body forward. */
export function squabbling(p: BirdPose, u: number, flick: number): void {
  add(p, B.body, 0.3 * u);
  add(p, B.neck, 0.7 * u);
  add(p, B.head, -0.5 * u);
  folded(p, (0.45 + 0.15 * flick) * u);
}

/** Down on its belly in cover, neck drawn in: a grouse in the heather. */
export function crouching(p: BirdPose, leg: number, u: number): void {
  add(p, B.body, 0.05 * u);
  add(p, B.neck, -0.3 * u);
  add(p, B.head, 0.2 * u);
  p[LIFT] -= leg * 0.9 * u;
  plant(p);
  add(p, B.legL, -1.3 * u);
  add(p, B.legR, -1.3 * u);
}

/** A hop: legs tucked a little at the top. */
export function hopping(p: BirdPose, u: number): void {
  add(p, B.legL, -0.4 * u);
  add(p, B.legR, -0.4 * u);
  folded(p, 0.2 * u);
}
