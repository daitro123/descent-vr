import { BUILDS, chestFront, type Look, shade, skirt } from './human';
import { PAL } from './palette';
import type { DressContext } from './rig';

// What the city's people wear over the human body (human.ts), beyond what
// every body has: hats and caps, coats with tails, waistcoats and bodices,
// capes, a great house's livery with its badge, striped aprons, spectacles
// and a pack. Each is a few parts on the bones they move with; coat-tails
// are the skirt's drape (human.ts `skirt`), so they swing with the legs.

const PI = Math.PI;
const thick = (l: Look) => BUILDS[l.build].thickness;
const bellyOf = (l: Look) => BUILDS[l.build].belly;

// ---------------------------------------------------------------- on the head

/** A flat wool cap, its peak over the brow. */
export function flatCap(ctx: DressContext, color: number): void {
  ctx
    .on('head')
    .cyl(0.12, 0.115, 0.06, 8, { at: [0, 0.262, -0.008], rot: [0.08, 0, 0], color })
    .box(0.17, 0.018, 0.075, { at: [0, 0.243, 0.112], rot: [0.14, 0, 0], color: shade(color, 0.8) });
}

/** A felt hat with a round crown, a band and a brim all round. */
export function brimHat(ctx: DressContext, color: number, band = shade(color, 0.6), brim = 0.2): void {
  ctx
    .on('head')
    .cyl(brim, brim, 0.018, 10, { at: [0, 0.258, 0], color })
    .cyl(0.1, 0.112, 0.11, 8, { at: [0, 0.32, -0.005], color })
    .cyl(0.114, 0.114, 0.025, 8, { at: [0, 0.278, -0.005], color: band, jitter: 0 });
}

/** A three-cornered hat, a corner over the brow. */
export function tricorn(ctx: DressContext, color: number, trim?: number): void {
  const h = ctx.on('head');
  h.cyl(0.215, 0.215, 0.05, 3, { at: [0, 0.262, -0.015], color }).cyl(0.105, 0.112, 0.08, 8, { at: [0, 0.31, -0.01], color });
  if (trim !== undefined) h.cyl(0.222, 0.222, 0.012, 3, { at: [0, 0.29, -0.015], color: trim, jitter: 0 });
}

/** A close knitted cap with a rolled band. */
export function knitCap(ctx: DressContext, color: number): void {
  ctx
    .on('head')
    .cyl(0.095, 0.115, 0.1, 8, { at: [0, 0.295, -0.01], color })
    .cyl(0.122, 0.122, 0.04, 8, { at: [0, 0.248, -0.01], color: shade(color, 0.85) });
}

/** A baker's soft white cap, puffed over the crown. */
export function bakersCap(ctx: DressContext, color: number): void {
  ctx
    .on('head')
    .cyl(0.135, 0.115, 0.1, 8, { at: [0, 0.3, -0.01], color })
    .cyl(0.12, 0.12, 0.03, 8, { at: [0, 0.25, -0.01], color: shade(color, 0.9) });
}

/** A wide straw hat. */
export function strawHat(ctx: DressContext, color: number, band?: number): void {
  const h = ctx.on('head');
  h.cyl(0.24, 0.25, 0.02, 10, { at: [0, 0.245, 0], color }).cyl(0.1, 0.12, 0.1, 8, { at: [0, 0.295, 0], color });
  if (band !== undefined) h.cyl(0.121, 0.121, 0.025, 8, { at: [0, 0.262, 0], color: band, jitter: 0 });
}

/** A close skullcap over the crown. */
export function skullcap(ctx: DressContext, color: number): void {
  ctx.on('head').cyl(0.1, 0.112, 0.05, 8, { at: [0, 0.262, -0.015], color });
}

/** A headscarf over the hair, tied in a knot at the nape. */
export function headscarf(ctx: DressContext, color: number): void {
  ctx
    .on('head')
    .box(0.215, 0.05, 0.235, { at: [0, 0.255, -0.01], color })
    .box(0.025, 0.14, 0.2, { at: [-0.105, 0.18, -0.03], color })
    .box(0.025, 0.14, 0.2, { at: [0.105, 0.18, -0.03], color })
    .box(0.215, 0.17, 0.03, { at: [0, 0.18, -0.115], color })
    .box(0.06, 0.05, 0.05, { at: [0, 0.1, -0.13], color: shade(color, 0.8) });
}

/** A feather stood up from a cap's band at the left. */
export function feather(ctx: DressContext, color: number, y = 0.3): void {
  ctx.on('head').box(0.012, 0.16, 0.035, { at: [0.1, y + 0.05, -0.04], rot: [-0.5, 0, -0.2], color, jitter: 0 });
}

/** Spectacles: round rims over the eyes and a bridge between, in brass or iron. */
export function spectacles(ctx: DressContext, color: number): void {
  const h = ctx.on('head');
  const z = 0.118;
  for (const x of [-0.043, 0.043]) {
    h.box(0.042, 0.006, 0.006, { at: [x, 0.165, z], color, jitter: 0 }).box(0.042, 0.006, 0.006, { at: [x, 0.131, z], color, jitter: 0 });
  }
  h.box(0.03, 0.006, 0.006, { at: [0, 0.158, z], color, jitter: 0 });
}

/** A short clay pipe in the corner of the mouth. */
export function pipeInMouth(ctx: DressContext): void {
  ctx
    .on('jaw')
    .box(0.012, 0.012, 0.1, { at: [-0.03, 0.025, 0.11], rot: [-0.25, 0, 0], color: 0xd8d0c0, jitter: 0 })
    .cyl(0.02, 0.016, 0.04, 6, { at: [-0.03, 0.045, 0.16], color: 0xd8d0c0 });
}

// ---------------------------------------------------------------- on the body

/**
 * A coat in the look's shirt, open below the waist: its tails to `hem` above
 * the floor, draped like a skirt so they swing as they walk; a turned-down
 * collar, and buttons down the front.
 */
export function coat(ctx: DressContext, l: Look, opts: { hem?: number; collar?: number; buttons?: number; flare?: number } = {}): void {
  const k = thick(l);
  const L = ctx.p.spine;
  skirt(ctx, l, l.shirt, { hem: opts.hem ?? 0.45, flare: opts.flare ?? 0.04 });
  const s = ctx.on('spine');
  s.taper((ctx.p.shoulderW * 2 - 0.04) * k, 0.26 * k, 0.2 * k, 0.2 * k, 0.07, { at: [0, L - 0.02, -0.01], color: opts.collar ?? shade(l.shirt, 0.8) });
  if (opts.buttons !== undefined) {
    const z = chestFront(l, 0.122) + 0.004;
    for (let i = 0; i < 4; i++) s.box(0.022, 0.022, 0.012, { at: [0, L * (0.2 + i * 0.16), z], color: opts.buttons, jitter: 0 });
  }
}

/** A waistcoat or a laced bodice: a panel down the front from the collarbones to the waist, over the shirt. */
export function bodice(ctx: DressContext, l: Look, color: number, laces?: number): void {
  const k = thick(l);
  const L = ctx.p.spine;
  const z = chestFront(l, 0.122) + 0.004;
  const s = ctx.on('spine');
  s.box(0.24 * k, L * 0.72, 0.016, { at: [0, L * 0.38, z], color });
  s.box(0.24 * k, L * 0.72, 0.016, { at: [0, L * 0.38, -0.124 * k], color });
  if (laces !== undefined) for (let i = 0; i < 3; i++) s.box(0.06, 0.008, 0.008, { at: [0, L * (0.15 + i * 0.18), z + 0.01], rot: [0, 0, i % 2 ? 0.5 : -0.5], color: laces, jitter: 0 });
}

/** A short cape on the shoulders over a coat, to the elbows. */
export function capelet(ctx: DressContext, l: Look, color: number, len = 0.32): void {
  const k = thick(l);
  const L = ctx.p.spine;
  const SW = ctx.p.shoulderW;
  ctx
    .on('spine')
    .taper((SW * 2 + 0.2) * k, 0.36 * k + BUILDS[l.build].figure.bust, (SW * 2 + 0.06) * k, 0.26 * k, len, { at: [0, L + 0.02 - len, 0], color, jitter: 0.08 });
}

/**
 * A great house's badge on the left breast: Corvane's black key, Harrowgate's
 * white tower, Ashby's silver ship, or the crown's gold mark.
 */
export function badge(ctx: DressContext, l: Look, kind: 'key' | 'tower' | 'ship' | 'crown', color: number, back = 0): void {
  const k = thick(l);
  const L = ctx.p.spine;
  const z = chestFront(l, 0.122) + 0.016;
  const x = 0.075 * k;
  const y = L * 0.68;
  const s = ctx.on('spine');
  switch (kind) {
    case 'key':
      s.box(0.035, 0.035, 0.008, { at: [x, y + 0.03, z], color, jitter: 0 })
        .box(0.01, 0.07, 0.008, { at: [x, y - 0.02, z], color, jitter: 0 })
        .box(0.025, 0.01, 0.008, { at: [x + 0.012, y - 0.045, z], color, jitter: 0 });
      break;
    case 'tower':
      s.box(0.035, 0.06, 0.008, { at: [x, y, z], color, jitter: 0 })
        .box(0.012, 0.015, 0.008, { at: [x - 0.012, y + 0.037, z], color, jitter: 0 })
        .box(0.012, 0.015, 0.008, { at: [x + 0.012, y + 0.037, z], color, jitter: 0 });
      break;
    case 'ship':
      s.box(0.06, 0.016, 0.008, { at: [x, y - 0.02, z], color, jitter: 0 })
        .box(0.008, 0.06, 0.008, { at: [x, y + 0.01, z], color, jitter: 0 })
        .box(0.024, 0.03, 0.008, { at: [x + 0.014, y + 0.015, z], color, jitter: 0 });
      break;
    case 'crown':
      s.box(0.05, 0.03, 0.008, { at: [x, y, z], color, jitter: 0 }).box(0.05, 0.012, 0.008, { at: [x, y + 0.024, z], rot: [0, 0, 0], color, jitter: 0 });
      break;
  }
  // A great house's servants wear it on the back of their coats too.
  if (back) s.box(0.1 * k, 0.12, 0.008, { at: [0, L * 0.62, -0.124 * k - 0.006], color: back, jitter: 0 });
}

/** An armband round the left upper arm: a crown's man's, a house's. */
export function armband(ctx: DressContext, l: Look, color: number): void {
  const k = thick(l);
  ctx.on('upperArmL').taper(0.112 * k, 0.112 * k, 0.118 * k, 0.118 * k, 0.07, { at: [0, -ctx.p.upperArm * 0.45, 0], color, jitter: 0 });
}

/** A collar of another colour at the neck, over the shirt: a linen collar, a chain of office's ribbon. */
export function collar(ctx: DressContext, l: Look, color: number): void {
  const k = thick(l);
  const L = ctx.p.spine;
  ctx.on('spine').taper((ctx.p.shoulderW * 2 - 0.06) * k, 0.25 * k, 0.17 * k, 0.17 * k, 0.05, { at: [0, L - 0.01, -0.005], color, jitter: 0 });
}

/** An apron with stripes down it: a butcher's blue and white. */
export function stripedApron(ctx: DressContext, l: Look, color: number, stripe: number, len: number): void {
  const k = thick(l);
  const L = ctx.p.spine;
  const zf = (0.12 + bellyOf(l) * 0.62) * k + 0.005;
  const zb = Math.max(zf, chestFront(l, 0.12));
  const s = ctx.on('spine');
  const h = ctx.on('hips');
  s.box(0.24 * k, L * 0.75, 0.02, { at: [0, L * 0.4, zb], color });
  h.box(0.3 * k, len, 0.02, { at: [0, -len / 2 + 0.04, zf], color });
  for (const x of [-0.08, 0, 0.08]) {
    ctx.on('spine').box(0.022, L * 0.75, 0.006, { at: [x * k, L * 0.4, zb + 0.012], color: stripe, jitter: 0 });
    ctx.on('hips').box(0.022, len, 0.006, { at: [x * k * 1.15, -len / 2 + 0.04, zf + 0.012], color: stripe, jitter: 0 });
  }
}

/** A pack on the back on two straps, a rolled blanket over it. */
export function pack(ctx: DressContext, l: Look, color: number, roll: number): void {
  const k = thick(l);
  const L = ctx.p.spine;
  const z = -0.125 * k - 0.1;
  ctx
    .on('spine')
    .box(0.3 * k, 0.36, 0.18, { at: [0, L * 0.5, z], color })
    .cyl(0.07, 0.07, 0.34 * k, 6, { at: [0, L * 0.5 + 0.24, z + 0.02], rot: [0, 0, PI / 2], color: roll })
    .bar([0.1 * k, L + 0.02, 0.0], [0.1 * k, L * 0.25, chestFront(l, 0.122) + 0.004], 0.03, 0.015, { color: PAL.leatherDark })
    .bar([-0.1 * k, L + 0.02, 0.0], [-0.1 * k, L * 0.25, chestFront(l, 0.122) + 0.004], 0.03, 0.015, { color: PAL.leatherDark });
}

/** A purse or a satchel at the right hip, on the belt. */
export function purse(ctx: DressContext, l: Look, color: number): void {
  const k = thick(l);
  ctx.on('hips').box(0.07, 0.11, 0.12, { at: [-0.19 * k, -0.06, 0.04], color }).box(0.075, 0.03, 0.125, { at: [-0.19 * k, 0.0, 0.04], color: shade(color, 0.75) });
}

/** A heavy linen smock's yoke: a band across the shoulders over the shirt. */
export function yoke(ctx: DressContext, l: Look, color: number): void {
  const k = thick(l);
  const L = ctx.p.spine;
  ctx.on('spine').taper((ctx.p.shoulderW * 2) * k, 0.25 * k, (ctx.p.shoulderW * 2 + 0.02) * k, 0.21 * k, 0.12, { at: [0, L - 0.12, 0], color });
}

/** Rags: torn patches of other browns on the shirt and the trousers. */
export function patches(ctx: DressContext, l: Look, colors: readonly number[]): void {
  const k = thick(l);
  const L = ctx.p.spine;
  const z = chestFront(l, 0.122) + 0.004;
  ctx
    .on('spine')
    .box(0.09, 0.08, 0.012, { at: [0.06 * k, L * 0.3, z], rot: [0, 0, 0.2], color: colors[0] })
    .box(0.08, 0.1, 0.012, { at: [-0.05 * k, L * 0.7, -0.125 * k - 0.002], rot: [0, 0, -0.3], color: colors[1 % colors.length] });
  ctx.on('thighL').box(0.07, 0.08, 0.02, { at: [0, -ctx.p.thigh * 0.6, 0.075 * k], rot: [0, 0, 0.3], color: colors[2 % colors.length] });
  ctx.on('shinR').box(0.06, 0.07, 0.02, { at: [0, -ctx.p.shin * 0.35, 0.062 * k], color: colors[0] });
}
