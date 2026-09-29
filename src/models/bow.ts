import type { WeaponSpec } from './characters';
import type { Vec3 } from './kit';
import { PAL } from './palette';
import type { DressContext } from './rig';

/** The bow's tips and string: bone on the undead's, iron and linen on the bandits'. */
export interface BowTrim {
  tips: number;
  string: number;
}

/**
 * Today's bow, held in the left fist with its limbs along the hand's Z. With
 * the arm raised forward the bow stands upright; its back faces the target
 * (hand -Y). The string's ends ride the tips and its middle rides the drawing
 * hand, so it follows the hand back to the cheek. A bow strikes nothing, so
 * the spec it returns is a placeholder that keeps the weapon type uniform.
 */
export function bow(ctx: DressContext, trim: BowTrim): WeaponSpec {
  const b = ctx.on('handL');
  const pts: Vec3[] = [
    [0, -0.06, 0],
    [0, -0.04, 0.2],
    [0, 0.0, 0.38],
    [0, 0.07, 0.54],
  ];
  for (const sign of [1, -1]) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, c] = [pts[i], pts[i + 1]];
      b.bar([a[0], a[1], a[2] * sign], [c[0], c[1], c[2] * sign], 0.03 - i * 0.005, 0.025 - i * 0.004, {
        color: i === 0 ? PAL.leatherDark : PAL.wood,
        mask: 1,
      });
    }
    b.box(0.025, 0.03, 0.03, { at: [0, 0.075, 0.55 * sign], color: trim.tips, mask: 1 });
  }
  const nock = ctx.point('handR', 0, -0.06, 0.02);
  for (const sign of [1, -1]) {
    ctx.builder.stretch(ctx.index('handL'), ctx.point('handL', 0, 0.075, 0.55 * sign), ctx.index('handR'), nock, 0.006, {
      color: trim.string,
      jitter: 0,
    });
  }
  return { bone: 'handL', base: [0, 0, 0], tip: [0, -0.1, 0], radius: 0 };
}
