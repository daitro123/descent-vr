import { PAL } from './palette';
import type { DressContext } from './rig';

// The skeleton's bones, shared by every family whose body is a skeleton: the
// undead (characters.ts), the barrow dead and the vault dead (barrow.ts,
// vault.ts), the drowned. Each part is authored in its bone's bind space on
// the humanoid rig; `s` scales the bones' thickness, never their length, so
// a skeleton of any proportions (a grunt's, the brute's, the Warden's) wears
// the same parts. A family's own armour and grave goods go on over them.

/**
 * How a skeleton's bones look: `s` scales their thickness (not their length),
 * `eye` is the light in its sockets, and `bone` and `shade` its bone's two
 * tones (clean bone by default; stained, peat-brown or old grey for the dead
 * of other places). Shared by every skeleton-bodied family.
 */
export interface SkeletonLook {
  s: number;
  eye: number;
  bone?: number;
  shade?: number;
}

export function skull(ctx: DressContext, l: SkeletonLook): void {
  const { s, eye } = l;
  const B = l.bone ?? PAL.bone;
  const S = l.shade ?? PAL.boneShade;
  const neckLen = ctx.p.neck - ctx.p.spine;
  ctx
    .on('head')
    .box(0.045 * s, neckLen + 0.05 * s, 0.045 * s, { at: [0, (0.05 * s - neckLen) / 2, -0.01 * s], color: S })
    .box(0.19 * s, 0.16 * s, 0.2 * s, { at: [0, 0.145 * s, 0], color: B })
    .taper(0.19 * s, 0.2 * s, 0.13 * s, 0.15 * s, 0.05 * s, { at: [0, 0.225 * s, 0], color: B })
    .box(0.2 * s, 0.03 * s, 0.04 * s, { at: [0, 0.168 * s, 0.09 * s], color: S })
    .box(0.16 * s, 0.07 * s, 0.05 * s, { at: [0, 0.088 * s, 0.08 * s], color: B })
    .box(0.056 * s, 0.046 * s, 0.03 * s, { at: [-0.046 * s, 0.13 * s, 0.093 * s], color: PAL.socket, jitter: 0 })
    .box(0.056 * s, 0.046 * s, 0.03 * s, { at: [0.046 * s, 0.13 * s, 0.093 * s], color: PAL.socket, jitter: 0 })
    .box(0.024 * s, 0.024 * s, 0.02 * s, { at: [-0.046 * s, 0.13 * s, 0.1 * s], color: eye, glow: 1, jitter: 0 })
    .box(0.024 * s, 0.024 * s, 0.02 * s, { at: [0.046 * s, 0.13 * s, 0.1 * s], color: eye, glow: 1, jitter: 0 })
    .box(0.026 * s, 0.03 * s, 0.02 * s, { at: [0, 0.09 * s, 0.106 * s], color: PAL.socket, jitter: 0 })
    .box(0.12 * s, 0.022 * s, 0.03 * s, { at: [0, 0.052 * s, 0.09 * s], color: B });
  ctx
    .on('jaw')
    .box(0.14 * s, 0.04 * s, 0.1 * s, { at: [0, 0.01 * s, 0.015 * s], color: B })
    .box(0.11 * s, 0.018 * s, 0.025 * s, { at: [0, 0.035 * s, 0.045 * s], color: B });
}

export function ribcage(ctx: DressContext, l: SkeletonLook): void {
  const { s } = l;
  const B = l.bone ?? PAL.bone;
  const S = l.shade ?? PAL.boneShade;
  const L = ctx.p.spine;
  const b = ctx.on('spine');
  b.box(0.045 * s, L + 0.03 * s, 0.045 * s, { at: [0, L / 2 - 0.015 * s, -0.075 * s], color: S });
  const ribs: [number, number, number][] = [
    [L - 0.07 * s, 0.26, 0.17],
    [L - 0.13 * s, 0.28, 0.18],
    [L - 0.19 * s, 0.26, 0.17],
    [L - 0.25 * s, 0.21, 0.15],
  ];
  const t = 0.026 * s;
  for (const [y, w0, d0] of ribs) {
    const w = w0 * s;
    const d = d0 * s;
    b.box(t, t, d, { at: [-w / 2, y, 0], color: B })
      .box(t, t, d, { at: [w / 2, y, 0], color: B })
      .box(w / 2 - 0.03 * s, t, t, { at: [-(w / 4 + 0.015 * s), y - 0.012 * s, d / 2], color: B })
      .box(w / 2 - 0.03 * s, t, t, { at: [w / 4 + 0.015 * s, y - 0.012 * s, d / 2], color: B })
      .box(w, t, t, { at: [0, y, -d / 2], color: S });
  }
  b.box(0.035 * s, 0.2 * s, 0.025 * s, { at: [0, L - 0.16 * s, 0.09 * s], color: B })
    .box(ctx.p.shoulderW * 2, 0.03 * s, 0.035 * s, { at: [0, L - 0.01 * s, 0.03 * s], color: B })
    .box(0.1 * s, 0.12 * s, 0.02 * s, { at: [-0.09 * s, L - 0.09 * s, -0.1 * s], color: S })
    .box(0.1 * s, 0.12 * s, 0.02 * s, { at: [0.09 * s, L - 0.09 * s, -0.1 * s], color: S });
  ctx
    .on('hips')
    .taper(0.16 * s, 0.1 * s, 0.26 * s, 0.14 * s, 0.12 * s, { at: [0, -0.09 * s, 0], color: B })
    .box(0.07 * s, 0.05 * s, 0.03 * s, { at: [0, -0.02 * s, 0.075 * s], color: PAL.socket, jitter: 0 });
}

export function skeletonLimbs(ctx: DressContext, l: SkeletonLook): void {
  const { s } = l;
  const B = l.bone ?? PAL.bone;
  const S = l.shade ?? PAL.boneShade;
  const { upperArm: UA, forearm: FA, thigh: TH, shin: SH } = ctx.p;
  for (const side of ['L', 'R'] as const) {
    ctx
      .on(`upperArm${side}`)
      .ball(0.04 * s, { color: B })
      .box(0.04 * s, UA - 0.05 * s, 0.04 * s, { at: [0, -UA / 2, 0], color: B })
      .ball(0.034 * s, { at: [0, -UA, 0], color: S });
    ctx
      .on(`forearm${side}`)
      .box(0.024 * s, FA - 0.03 * s, 0.024 * s, { at: [-0.012 * s, -FA / 2, 0], color: B })
      .box(0.024 * s, FA - 0.03 * s, 0.024 * s, { at: [0.012 * s, -FA / 2, 0], color: S });
    ctx
      .on(`hand${side}`)
      .box(0.05 * s, 0.055 * s, 0.028 * s, { at: [0, -0.035 * s, 0], color: B })
      .box(0.05 * s, 0.045 * s, 0.045 * s, { at: [0, -0.075 * s, 0.006 * s], color: S });
    ctx
      .on(`thigh${side}`)
      .ball(0.045 * s, { color: B })
      .box(0.048 * s, TH - 0.06 * s, 0.048 * s, { at: [0, -TH / 2, 0], color: B })
      .ball(0.042 * s, { at: [0, -TH, 0.01 * s], color: S });
    ctx
      .on(`shin${side}`)
      .box(0.042 * s, SH - 0.04 * s, 0.042 * s, { at: [0, -SH / 2, 0], color: B })
      .box(0.08 * s, 0.045 * s, 0.2 * s, { at: [0, -SH - 0.012 * s, 0.05 * s], color: S });
  }
}

export function skeleton(ctx: DressContext, l: SkeletonLook): void {
  skull(ctx, l);
  ribcage(ctx, l);
  skeletonLimbs(ctx, l);
}

/** Tattered cloth hanging from the hips, front and back. */
export function loincloth(ctx: DressContext, s: number, color: number, len: number): void {
  ctx
    .on('hips')
    .box(0.3 * s, 0.05 * s, 0.18 * s, { at: [0, -0.02 * s, 0], color: PAL.leather })
    .box(0.16 * s, len, 0.02 * s, { at: [0, -len / 2 - 0.02 * s, 0.09 * s], color })
    .box(0.1 * s, len * 0.7, 0.02 * s, { at: [0.03 * s, -len * 0.35 - 0.02 * s, -0.09 * s], color })
    .box(0.06 * s, len * 0.5, 0.02 * s, { at: [-0.07 * s, -len * 0.25 - 0.02 * s, -0.09 * s], color });
}
