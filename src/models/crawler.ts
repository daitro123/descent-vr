import { BufferGeometry, Float32BufferAttribute, type Material, Vector3 } from 'three';
import type { WeaponSpec } from './characters';
import type { Vec3 } from './kit';
import { type DressContextOf, type PoseOf, type SkeletonDef, SkeletonRig, type Turn } from './rig';

// The crawler: a long body of rigid segments on a chain, for the leeches of
// the mires and fens and the moor's adders. It's a skeleton of its own on the
// general rig (rig.ts): a middle segment at the root, three segments and the
// head in front of it, four behind, and a jaw. A pose turns each joint, so
// it slithers side to side (an adder), ripples up and down (a leech), rears
// its front and strikes. Every segment is one rigid part, so a crawler is
// one draw call, a few hundred triangles.
//
// It faces +Z, its middle over the origin, its belly on y = 0. Every joint
// pivots at the bottom of the body, so lifting the front leaves the rest on
// the ground.

export const CRAWLER_BONES = ['mid', 'fore1', 'fore2', 'fore3', 'head', 'jaw', 'aft1', 'aft2', 'aft3', 'aft4'] as const;
export type CrawlerBone = (typeof CRAWLER_BONES)[number];
export type CrawlerPose = PoseOf<CrawlerBone>;

/** Head to tail, the segments: nine, the head first. */
export const SEGMENTS = ['head', 'fore3', 'fore2', 'fore1', 'mid', 'aft1', 'aft2', 'aft3', 'aft4'] as const satisfies readonly CrawlerBone[];
type Segment = (typeof SEGMENTS)[number];

/** A crawler's size: its length and how wide and tall it is at its thickest. */
export interface CrawlerBuild {
  /** Snout to tail tip, m. */
  readonly length: number;
  /** Widest across, m. */
  readonly width: number;
  /** Tallest, m. */
  readonly height: number;
}

/** Each segment's length: a ninth of the body. */
export const segmentLength = (p: CrawlerBuild) => p.length / SEGMENTS.length;

/** The crawler skeleton: a chain of nine segments from the middle out, and a jaw under the head. */
export const CRAWLER: SkeletonDef<CrawlerBone, CrawlerBuild> = {
  name: 'crawler',
  bones: CRAWLER_BONES,
  parent: { mid: null, fore1: 'mid', fore2: 'fore1', fore3: 'fore2', head: 'fore3', jaw: 'head', aft1: 'mid', aft2: 'aft1', aft3: 'aft2', aft4: 'aft3' },
  offsets: (p) => {
    const l = segmentLength(p);
    // The middle's centre is the root; each segment in front hangs from the front end of the one behind it,
    // each one behind from the back end of the one in front. The jaw hinges at the back of the mouth.
    return {
      mid: [0, 0, 0],
      fore1: [0, 0, l / 2],
      fore2: [0, 0, l],
      fore3: [0, 0, l],
      head: [0, 0, l],
      jaw: [0, p.height * 0.18, l * 0.3],
      aft1: [0, 0, -l / 2],
      aft2: [0, 0, -l],
      aft3: [0, 0, -l],
      aft4: [0, 0, -l],
    };
  },
  shadeTo: (p) => p.height,
};

/** Where along the body each segment is, snout (0) to tail tip (1): its front and back. */
function span(seg: Segment): [number, number] {
  const i = SEGMENTS.indexOf(seg);
  return [i / SEGMENTS.length, (i + 1) / SEGMENTS.length];
}

/** Where a segment runs in its bone's space: from its back end to its front end along z. */
function along(seg: Segment, l: number): [number, number] {
  if (seg === 'mid') return [-l / 2, l / 2];
  return seg.startsWith('aft') ? [-l, 0] : [0, l];
}

// ---------------------------------------------------------------- looks

/** How it lives and fights: a leech ripples and latches, a snake slithers and strikes. */
export type CrawlerKind = 'leech' | 'snake';

/** A crawler's look: the moor's black mire leech, the fens' pale banded one, Old Mother Leech, the adder. */
export type CrawlerLook = 'mireLeech' | 'fenLeech' | 'motherLeech' | 'adder';

interface Colours {
  body: number;
  /** Every other segment's, for bands; the same as `body` for none. */
  band: number;
  /** Along the back: a leech's stripe, an adder's zigzag. */
  back: number;
  belly: number;
  /** Along each side. */
  side: number;
  eye: number;
  /** How much the eyes glow. */
  glow: number;
}

export interface CrawlerDress {
  readonly kind: CrawlerKind;
  readonly label: string;
  readonly build: CrawlerBuild;
  readonly colours: Colours;
}

export const CRAWLER_LOOKS: Record<CrawlerLook, CrawlerDress> = {
  mireLeech: {
    kind: 'leech',
    label: 'Mire leech',
    build: { length: 0.6, width: 0.11, height: 0.05 },
    colours: { body: 0x1e1b18, band: 0x1e1b18, back: 0x2e3322, belly: 0x3a3626, side: 0x5a4224, eye: 0xb02a14, glow: 0.5 },
  },
  fenLeech: {
    kind: 'leech',
    label: 'Fen leech',
    build: { length: 0.46, width: 0.085, height: 0.04 },
    colours: { body: 0x9aa086, band: 0x5e6648, back: 0x7a8262, belly: 0xbab69a, side: 0x8a6a3a, eye: 0xb02a14, glow: 0.5 },
  },
  motherLeech: {
    kind: 'leech',
    label: 'Old Mother Leech',
    build: { length: 0.92, width: 0.17, height: 0.08 },
    colours: { body: 0x8a8e74, band: 0x4a503a, back: 0x6a7052, belly: 0xa8a48a, side: 0x7a5a30, eye: 0xd03a18, glow: 0.8 },
  },
  adder: {
    kind: 'snake',
    label: 'Adder',
    build: { length: 0.7, width: 0.055, height: 0.045 },
    colours: { body: 0x7c705c, band: 0x7c705c, back: 0x2a221c, belly: 0x3a3632, side: 0x5e5446, eye: 0xc8521c, glow: 0.35 },
  },
};

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** How wide (of its widest) and tall (of its tallest) it is `s` along, snout to tail. */
function profile(kind: CrawlerKind, s: number): [number, number] {
  if (kind === 'leech') {
    // A small front sucker widening to the broad back half, narrowing a little to the rear sucker.
    const w = lerp(0.4, 1, smoothstep(0, 0.6, s)) * lerp(1, 0.7, smoothstep(0.75, 1, s));
    const h = lerp(0.55, 1, smoothstep(0, 0.45, s)) * lerp(1, 0.7, smoothstep(0.8, 1, s));
    return [w, h];
  }
  // A broad flat head on a narrow neck, the body thickest in the middle, tapering to a fine tail.
  if (s < 0.1) return [lerp(0.7, 1.25, smoothstep(0, 0.07, s)), 0.85];
  const w = lerp(0.68, 1, smoothstep(0.11, 0.32, s)) * lerp(1, 0.16, smoothstep(0.58, 1, s));
  return [w, w * 0.92];
}

const PI = Math.PI;
/** A taper laid along +Z (it grows along +Y). */
const FORWARD: Vec3 = [PI / 2, 0, 0];

/** One end of a band of body: where along z, its half width, its height, its belly's height. */
interface Ring {
  z: number;
  w: number;
  h: number;
}

/** A ring's six corners round the body, belly first, going to its left: (x, y). */
function corners(r: Ring): [number, number][] {
  const a = r.w * 0.55;
  return [
    [-a, 0],
    [a, 0],
    [r.w, r.h * 0.5],
    [a, r.h],
    [-a, r.h],
    [-r.w, r.h * 0.5],
  ];
}

/**
 * A band of body from ring `back` to ring `front`: a flattened six-sided tube,
 * open at its ends, with only the faces in `faces` (0 the belly, 1 and 5 the
 * lower flanks, 2 and 4 the upper, 3 the back), so each face can take its own
 * colour: two triangles a face.
 */
function band(back: Ring, front: Ring, faces: readonly number[]): BufferGeometry {
  const b = corners(back);
  const f = corners(front);
  const pos: number[] = [];
  for (const i of faces) {
    const j = (i + 1) % 6;
    const B = (k: number) => [b[k][0], b[k][1], back.z];
    const F = (k: number) => [f[k][0], f[k][1], front.z];
    pos.push(...B(i), ...B(j), ...F(j), ...B(i), ...F(j), ...F(i));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return g;
}

/** The end of the body at ring `r`, facing +Z (`front`) or -Z. */
function cap(r: Ring, front: boolean): BufferGeometry {
  const c = corners(r);
  const pos: number[] = [];
  for (let k = 1; k < 5; k++) {
    const [p, q] = front ? [k, k + 1] : [k + 1, k];
    pos.push(c[0][0], c[0][1], r.z, c[p][0], c[p][1], r.z, c[q][0], c[q][1], r.z);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return g;
}

/** Dress a crawler in `look`. */
export function dressCrawler(ctx: DressContextOf<CrawlerBone, CrawlerBuild>, look: CrawlerLook): void {
  const { kind, colours: c, build: p } = CRAWLER_LOOKS[look];
  const l = segmentLength(p);
  // Each band runs a little into its neighbours, so a bent joint shows no gap.
  const over = l * 0.14;
  const ring = (z: number, s: number): Ring => {
    const [w, h] = profile(kind, s);
    return { z, w: (w * p.width) / 2, h: h * p.height };
  };
  SEGMENTS.forEach((seg, i) => {
    const [front, back] = span(seg);
    const [z0, z1] = along(seg, l);
    const head = seg === 'head';
    const tail = seg === 'aft4';
    const r0 = ring(z0 - (tail ? 0 : over), back);
    const r1 = ring(z1 + (head ? 0 : over), front);
    const b = ctx.on(seg);
    // Banded: every other segment's flanks in the band colour.
    const flank = i % 2 ? c.band : c.body;
    b.shape(band(r0, r1, [0]), { color: c.belly, jitter: 0.03 })
      .shape(band(r0, r1, [1, 5]), { color: kind === 'leech' ? c.side : flank, jitter: 0.05 })
      .shape(band(r0, r1, [2, 4]), { color: flank, jitter: 0.05 })
      .shape(band(r0, r1, [3]), { color: kind === 'leech' && !head ? c.back : flank, jitter: 0.04 });
    if (tail) b.shape(cap(r0, false), { color: flank });
    if (head && kind === 'leech') b.shape(cap(r1, true), { color: c.body });
    if (kind === 'snake' && !head && !tail) {
      // The adder's dark zigzag: one bar a segment along its back, slanting left then right.
      const zig = i % 2 ? 1 : -1;
      const w = r0.w + r1.w;
      const h = (r0.h + r1.h) / 2;
      b.box(w * 0.26, h * 0.08, l * 1.05, { at: [zig * w * 0.08, h * 0.98, (z0 + z1) / 2], rot: [0, zig * 0.55, 0], color: c.back, jitter: 0.03 });
    }
  });
  if (kind === 'leech') dressLeechEnds(ctx, look);
  else dressAdderHead(ctx);
}

/** A leech's ends: the rear sucker, a ring of mouth round its front, its teeth and two dull red eye spots. */
function dressLeechEnds(ctx: DressContextOf<CrawlerBone, CrawlerBuild>, look: CrawlerLook): void {
  const { colours: c, build: p } = CRAWLER_LOOKS[look];
  const l = segmentLength(p);
  const [w] = profile('leech', 1);
  // The rear sucker, a disc it grips the bottom with.
  ctx.on('aft4').cyl(w * p.width * 0.5, w * p.width * 0.56, p.height * 0.3, 6, { at: [0, p.height * 0.15, -l * 0.92], color: c.belly, jitter: 0.05 });
  const [wh, hh] = profile('leech', 0.05);
  const hw = wh * p.width;
  const top = hh * p.height;
  // Two dull red eye spots on the crown.
  for (const side of [-1, 1]) {
    ctx.on('head').box(hw * 0.18, top * 0.16, hw * 0.18, { at: [side * hw * 0.2, top * 0.98, l * 0.66], color: c.eye, glow: c.glow, jitter: 0 });
  }
  // The front sucker, which opens as it lunges: its red mouth and a row of pale teeth.
  ctx
    .on('jaw')
    .taper(hw * 0.95, top * 0.45, hw * 1.1, top * 0.4, l * 0.7, { at: [0, -top * 0.05, -l * 0.02], rot: FORWARD, color: c.body })
    .box(hw * 0.72, top * 0.1, l * 0.5, { at: [0, top * 0.18, l * 0.36], color: 0x5a1a14, jitter: 0 })
    .box(hw * 0.7, top * 0.16, hw * 0.1, { at: [0, top * 0.22, l * 0.64], color: 0xd8cfb0, jitter: 0 });
}

/** The adder's head: broad and flat, a dark V on its crown, copper eyes, fangs, and a lower jaw that drops. */
function dressAdderHead(ctx: DressContextOf<CrawlerBone, CrawlerBuild>): void {
  const { colours: c, build: p } = CRAWLER_LOOKS.adder;
  const l = segmentLength(p);
  const w = p.width * 1.25;
  const h = p.height * 0.85;
  const head = ctx.on('head');
  head
    .box(w * 0.92, h * 0.55, l * 0.5, { at: [0, h * 0.7, l * 0.62], color: c.body })
    .taper(w * 0.9, h * 0.5, w * 0.55, h * 0.4, l * 0.42, { at: [0, h * 0.68, l * 0.85], rot: FORWARD, color: c.body });
  for (const side of [-1, 1]) {
    head
      // The V: two dark bars meeting at the snout end of the crown.
      .box(w * 0.14, h * 0.1, l * 0.45, { at: [side * w * 0.15, h * 0.99, l * 0.55], rot: [0, -side * 0.45, 0], color: c.back, jitter: 0 })
      .box(w * 0.1, h * 0.2, l * 0.13, { at: [side * w * 0.43, h * 0.8, l * 0.86], color: c.eye, glow: c.glow, jitter: 0 })
      .box(w * 0.11, h * 0.16, l * 0.04, { at: [side * w * 0.435, h * 0.8, l * 0.87], color: 0x120c08, jitter: 0 })
      // Fangs, folded back until the jaw drops.
      .cone(w * 0.05, h * 0.5, 4, { at: [side * w * 0.22, h * 0.3, l * 1.1], rot: [PI, 0, 0], color: 0xe0d8c0 });
  }
  ctx
    .on('jaw')
    .box(w * 0.8, h * 0.28, l * 0.9, { at: [0, -h * 0.02, l * 0.45], color: c.belly })
    .box(w * 0.6, h * 0.08, l * 0.7, { at: [0, h * 0.13, l * 0.45], color: 0x6a2a24, jitter: 0 })
    // The forked tongue, flicking out ahead.
    .box(w * 0.08, h * 0.06, l * 0.5, { at: [0, h * 0.12, l * 1.05], color: 0x2a0e10, jitter: 0 })
    .box(w * 0.06, h * 0.06, l * 0.16, { at: [-w * 0.05, h * 0.12, l * 1.34], rot: [0, 0.4, 0], color: 0x2a0e10, jitter: 0 })
    .box(w * 0.06, h * 0.06, l * 0.16, { at: [w * 0.05, h * 0.12, l * 1.34], rot: [0, -0.4, 0], color: 0x2a0e10, jitter: 0 });
}

/** A crawler in `look`, one draw call. */
export function buildCrawler(look: CrawlerLook, material?: Material): SkeletonRig<CrawlerBone, CrawlerBuild> {
  return new SkeletonRig(CRAWLER, CRAWLER_LOOKS[look].build, (ctx) => dressCrawler(ctx, look), material, 31 + Object.keys(CRAWLER_LOOKS).indexOf(look) * 5);
}

/** What strikes: its jaws, from the hinge to a little past the snout, as thick as its head. */
export function crawlerWeapon(look: CrawlerLook): WeaponSpec<CrawlerBone> {
  const p = CRAWLER_LOOKS[look].build;
  const l = segmentLength(p);
  return { bone: 'jaw', base: [0, 0, 0], tip: [0, 0, l * 0.95], radius: Math.max(0.03, p.width * 0.45) };
}

/** A biter's look by its family and variant: the leeches' 0 the mire leech, 1 the fen leech and 2 Old Mother Leech; the snakes' the adder. */
export function crawlerLook(family: 'leech' | 'snake', variant = 0): CrawlerLook {
  if (family === 'snake') return 'adder';
  return (['mireLeech', 'fenLeech', 'motherLeech'] as const)[variant] ?? 'mireLeech';
}

// ---------------------------------------------------------------- poses

/**
 * Bend the body: `turn(s)` is how far each joint turns to the crawler's left
 * and `lift(s)` how far it tips its front up, going headward, at the joint `s`
 * along the body (snout 0, tail tip 1). A joint behind the middle turns its
 * segment the other way round, so one function bends the whole body as one.
 */
export function bend(turn: (s: number) => number, lift: (s: number) => number, out: Record<string, [number, number, number]> = {}): CrawlerPose {
  for (let i = 0; i < SEGMENTS.length; i++) {
    const seg = SEGMENTS[i];
    if (seg === 'mid') continue;
    // The joint a segment hangs from: its back end in front of the middle, its front end behind it.
    const behind = seg.startsWith('aft');
    const s = behind ? i / SEGMENTS.length : (i + 1) / SEGMENTS.length;
    const sign = behind ? -1 : 1;
    const o = (out[seg] ??= [0, 0, 0]);
    o[0] = -sign * lift(s);
    o[1] = sign * turn(s);
    o[2] = 0;
  }
  return out as CrawlerPose;
}

/** `pose` with the jaw opened `open` rad. */
function withJaw(pose: CrawlerPose, open: number): CrawlerPose {
  return { ...pose, jaw: [open, 0, 0] as Turn };
}

/** Lying at rest: a leech nearly straight, its front a little raised; an adder in a lazy S, head up. */
export function restPose(kind: CrawlerKind): CrawlerPose {
  if (kind === 'leech') return withJaw(bend((s) => 0.12 * Math.sin(s * 5), (s) => (s < 0.3 ? 0.08 : 0)), 0.05);
  return bend(
    (s) => 0.55 * Math.sin(s * 9 + 0.5) * (s < 0.15 ? 0.4 : 1),
    (s) => (s < 0.12 ? -0.15 : s < 0.3 ? 0.12 : 0),
  );
}

/**
 * Crawling, `phase` rad through its wave and `amount` (0 to 1) of full pace:
 * an adder's S travelling down its body side to side, a leech's ripple up
 * and down. Offsets on top of its rest, as the walk is on a body standing.
 */
export function crawlOffsets(kind: CrawlerKind, phase: number, amount: number, out: Record<string, [number, number, number]>): void {
  if (kind === 'snake') {
    // The head stays steady while the wave passes back along the body, growing towards the tail.
    bend(
      (s) => amount * 0.5 * Math.sin(s * 11 - phase) * smoothstep(0.08, 0.35, s),
      () => 0,
      out,
    );
    return;
  }
  bend(
    (s) => amount * 0.1 * Math.sin(s * 6 - phase),
    (s) => amount * 0.16 * Math.sin(s * 9 - phase) * smoothstep(0.05, 0.25, s),
    out,
  );
}

/**
 * rad/s its crawl's wave turns at `speed` m/s. An adder's S runs back along
 * it as fast as it goes forward, so each bend slides along one track; a
 * leech's ripple turns a little slower than its humps would need.
 */
export function crawlRate(kind: CrawlerKind, p: CrawlerBuild, speed: number): number {
  return ((kind === 'snake' ? 11 : 6) * speed) / p.length;
}

/** How high its middle rides crawling (a leech's ripple), so no hump dips under the ground: m at full pace. */
export function crawlRise(kind: CrawlerKind, p: CrawlerBuild): number {
  return kind === 'leech' ? p.length * 0.02 : 0;
}

/** A strike's two keyframes: drawn back and up (held at the end of the wind-up), and flung forward and low (the blow). */
export interface CrawlerStrike {
  readonly windup: CrawlerPose;
  readonly strike: CrawlerPose;
  /** How far its middle draws back, then lunges, along +Z: m at each keyframe, as a share of its length. */
  readonly reach: readonly [number, number];
}

/** A turn or lift for each joint in front of the middle, snout first (the head's, fore3's, fore2's, fore1's); none behind it. */
function fore(head: number, f3: number, f2: number, f1: number): (s: number) => number {
  return (s) => (s > 0.5 ? 0 : s > 0.4 ? f1 : s > 0.3 ? f2 : s > 0.2 ? f3 : head);
}

/**
 * The lunge at your legs. An adder draws its front up and back into an S,
 * head level and cocked, then flings it straight out at your ankles, jaw
 * wide. A leech rears its front in an arc, then throws it forward and down
 * onto your shin, its sucker open.
 */
export function strikePoses(kind: CrawlerKind): CrawlerStrike {
  if (kind === 'snake') {
    return {
      windup: withJaw(bend(fore(-0.6, 1.0, -1.1, 0.9), fore(-0.45, -0.1, 0.25, 0.35)), 0.3),
      strike: withJaw(bend(fore(0, 0, 0, 0.1), fore(-0.12, -0.05, 0, 0.18)), 0.95),
      reach: [-0.12, 0.42],
    };
  }
  return {
    windup: withJaw(bend(fore(0.1, -0.15, 0.2, 0.1), fore(-0.4, -0.3, 0.35, 0.6)), 0.4),
    strike: withJaw(bend(() => 0, fore(-0.12, -0.1, -0.05, 0.28)), 0.9),
    reach: [-0.1, 0.45],
  };
}

/** Recoiling from a blow: the front thrown up and back, the body kinked. */
export function recoilPose(kind: CrawlerKind): CrawlerPose {
  return withJaw(
    bend(
      (s) => (kind === 'snake' ? 0.7 : 0.4) * Math.sin(s * 8 + 1),
      (s) => (s < 0.4 ? 0.3 : 0),
    ),
    0.6,
  );
}

/** Dying: curled up tight, nose to tail. */
export function curlPose(kind: CrawlerKind): CrawlerPose {
  return withJaw(
    bend(
      () => (kind === 'snake' ? 0.62 : 0.5),
      () => 0,
    ),
    0.3,
  );
}

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeIn = (t: number) => t * t;

/**
 * How far its middle is thrown along +Z during a strike, as a share of its
 * length: drawn back over the wind-up (`k` 0 to 1 of it), flung out in the
 * blow, and back over the recovery, eased as the poses are (Enemy.updateAttack).
 */
export function lungeAt(strike: CrawlerStrike, phase: 'windup' | 'active' | 'recover', k: number): number {
  const [back, out] = strike.reach;
  if (phase === 'windup') return back * easeOut(k);
  if (phase === 'active') return back + (out - back) * easeIn(k);
  return out * (1 - smoothstep(0, 1, k));
}

const reaches = new Map<CrawlerLook, number>();

/**
 * How far ahead of its middle its jaws reach at the end of its lunge, m: what
 * it can strike from where it lies. Measured once per look on a bare rig.
 */
export function strikeReach(look: CrawlerLook): number {
  const known = reaches.get(look);
  if (known !== undefined) return known;
  const { kind, build } = CRAWLER_LOOKS[look];
  const rig = buildCrawler(look);
  const strike = strikePoses(kind);
  rig.apply(strike.strike);
  rig.setHipOffset(0, 0, lungeAt(strike, 'active', 1) * build.length);
  rig.mesh.updateMatrixWorld(true);
  const [x, y, z] = crawlerWeapon(look).tip;
  const reach = new Vector3(x, y, z).applyMatrix4(rig.bones.jaw.matrixWorld).z;
  rig.mesh.geometry.dispose();
  reaches.set(look, reach);
  return reach;
}
