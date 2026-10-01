import { BUILDS, type Look } from './human';
import { PAL } from './palette';
import type { DressContext } from './rig';

// Lanterns, as parts of a character: the Lantern Men's shuttered lantern at
// the belt, its shutter's slits glowing amber across the fog, and a lantern
// carried in the hand by its ring (Captain Crake's). A lit lantern's light is
// its glow (kit.ts): it shines in its own colour whatever the light round it.

/** A lantern's light through horn: amber. */
export const LANTERN_LIGHT = 0xffb04a;
/** The horn of an unlit lantern. */
const HORN = 0x4a4234;

/**
 * A shuttered lantern hung from the belt at the left hip: its horn window to
 * the front, half covered by the shutter's bar, and a slit to the side:
 * glowing when `lit`, dark horn when not (Gil Tarr's, by day in Reedholm).
 */
export function beltLantern(ctx: DressContext, l: Look, lit = true, frame: number = PAL.ironDark): void {
  const k = BUILDS[l.build].thickness;
  const x = 0.2 * k + BUILDS[l.build].belly * 0.5 + 0.03;
  const z = 0.06;
  const light = lit ? { color: LANTERN_LIGHT, glow: 1, jitter: 0 } : { color: HORN, jitter: 0 };
  ctx
    .on('hips')
    .taper(0.1, 0.1, 0.035, 0.035, 0.05, { at: [x, -0.06, z], color: frame })
    .box(0.09, 0.15, 0.09, { at: [x, -0.135, z], color: frame })
    .box(0.064, 0.09, 0.01, { at: [x, -0.135, z + 0.044], ...light })
    .box(0.074, 0.03, 0.014, { at: [x, -0.12, z + 0.05], color: frame })
    .box(0.012, 0.08, 0.05, { at: [x + 0.044, -0.135, z], ...light });
}

/** What a hand lantern is made of: its frame and fittings, and whether it's lit. */
export interface HandLanternTrim {
  frame: number;
  lit: boolean;
  /** Its size: 1 is a common lantern a forearm long. */
  size?: number;
}

/**
 * A lantern carried in the left fist by its ring, hanging along the hand
 * (with the arm down, straight down): a cap, four corner posts round its
 * horn panes, and a base. Lit, the panes glow on every side.
 */
export function handLantern(ctx: DressContext, trim: HandLanternTrim): void {
  const s = trim.size ?? 1;
  const top = -0.1 * s;
  const h = 0.2 * s;
  const w = 0.13 * s;
  const mid = top - 0.05 * s - h / 2;
  const b = ctx.on('handL');
  b.box(0.015, 0.07 * s, 0.05 * s, { at: [0, -0.06 * s, 0], color: trim.frame })
    .taper(0.04 * s, 0.04 * s, w + 0.03 * s, w + 0.03 * s, 0.05 * s, { at: [0, top, 0], rot: [Math.PI, 0, 0], color: trim.frame })
    .box(w, h, w, { at: [0, mid, 0], ...(trim.lit ? { color: LANTERN_LIGHT, glow: 1, jitter: 0 } : { color: HORN, jitter: 0 }) })
    .box(w + 0.03 * s, 0.03 * s, w + 0.03 * s, { at: [0, mid - h / 2 - 0.01 * s, 0], color: trim.frame });
  for (const [cx, cz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    b.box(0.022 * s, h, 0.022 * s, { at: [(cx * w) / 2, mid, (cz * w) / 2], color: trim.frame });
  }
}
