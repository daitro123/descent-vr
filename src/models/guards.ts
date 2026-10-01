import { Vector3 } from 'three';
import { BUILDS, body, cuffs, HUE, head, type Look, mail, pauldrons, shade, sheathedSword, tabard } from './human';
import { PAL } from './palette';
import { HALE_STAND, type Person } from './people';
import { type DressContext, type Pose, posedBones, type Proportions } from './rig';

// The guards: the `guard` model family on the human body (human.ts), as the
// zones place them (/zones/model-list.md in the project's files). Aldhaven's
// City Watch and the royal guard at the keep in the crown's colours, the
// Watch's recruits, House Corvane's men-at-arms and Harrowgate's retainer at
// their great houses' doors, the crown's toll men on the Sallows' causeway,
// and Cairnford's watch of townsmen with spears. None of them fights: the
// bailiffs who do are an enemy family of their own (bailiffs.ts), in Corvane's
// livery. Who a guard serves shows in the colours they wear (LIVERY); red
// stays off their faces and waists (a bandit's), and no guard wears a green
// hood (an archer's).

const PI = Math.PI;

/** House Corvane's deep crimson: darker than the bandits' red, and bluer. */
const CRIMSON = 0x5a1426;
/** The black of Corvane's key, belts and boots. */
const SABLE = 0x1c181c;

/**
 * Who each guard serves, by the colours they wear: a tabard's field and the
 * badge on it, or a townsman's armband. Change a colour here and everyone in
 * that service follows. The crown's blue and gold are Marshal Hale's (Hale is
 * the crown's marshal): the Aldhaven spec recommends them for all the crown's
 * service, the City Watch, the royal guard and the toll men, and the question
 * is still open, so the crown's colours are only ever taken from here.
 */
export const LIVERY = {
  /** The crown: the City Watch, the royal guard, and (patched and faded) the toll men. */
  crown: { field: HUE.tabard, badge: PAL.gold },
  /** House Corvane: deep crimson with a black key, for its men-at-arms and its bailiffs. */
  corvane: { field: CRIMSON, badge: SABLE },
  /** House Harrowgate: grey with a white tower. */
  harrowgate: { field: 0x6a6c70, badge: 0xe2ddd0 },
  /** A town with no soldiers (Cairnford): a cream armband on a townsman's jack. */
  town: { band: 0xe0d6b4 },
} as const;

/** The crown's colours, long in the sun on the Sallows' causeway. */
const FADED = { field: mix(LIVERY.crown.field, 0x9a9a8a, 0.4), badge: mix(LIVERY.crown.badge, 0x9a9a8a, 0.35) };

/** `a` taken `t` of the way to `b`, channel by channel. */
function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Padded wool, undyed: the jack under a recruit's or a toll man's tabard. */
export const PADDING = 0x8e826a;
/** A townsman's own wool jack, brown-grey. */
const WOOL = 0x6e6250;
/** Dark hose under mail. */
const HOSE = 0x3a3436;

const thick = (l: Look) => BUILDS[l.build].thickness;
const belly = (l: Look) => BUILDS[l.build].belly;
/** How far in front of the spine a tabard's front panel stands. */
export const chestZ = (l: Look) => (0.125 + belly(l) * 0.6) * thick(l);

// ---------------------------------------------------------------- headgear

/** A kettle helm: an iron cap with a broad brim, low over the brows. */
export function kettleHelm(ctx: DressContext, color: number, band?: number): void {
  const h = ctx.on('head');
  h.cyl(0.1, 0.125, 0.1, 8, { at: [0, 0.265, -0.005], color }).cyl(0.185, 0.185, 0.02, 8, { at: [0, 0.215, -0.005], color: shade(color, 0.85) });
  if (band !== undefined) h.cyl(0.127, 0.127, 0.025, 8, { at: [0, 0.232, -0.005], color: band });
}

/** The royal guard's helm: a steel cap with cheek guards, a gold crest and a plume swept back. */
function plumedHelm(ctx: DressContext, plume: number, crest: number): void {
  ctx
    .on('head')
    .taper(0.215, 0.235, 0.165, 0.185, 0.115, { at: [0, 0.195, -0.005], color: PAL.steel })
    .box(0.02, 0.11, 0.1, { at: [-0.106, 0.15, 0.02], color: PAL.steel })
    .box(0.02, 0.11, 0.1, { at: [0.106, 0.15, 0.02], color: PAL.steel })
    .box(0.025, 0.035, 0.2, { at: [0, 0.322, -0.01], color: crest })
    .taper(0.05, 0.06, 0.02, 0.03, 0.2, { at: [0, 0.33, -0.04], rot: [-1.1, 0, 0], color: plume, jitter: 0.12 })
    .taper(0.045, 0.05, 0.015, 0.02, 0.2, { at: [0, 0.27, -0.2], rot: [-2.1, 0, 0], color: shade(plume, 0.85), jitter: 0.12 });
}

/** A soft felt cap, for a guard off duty in all but name. */
function feltCap(ctx: DressContext, color: number): void {
  ctx
    .on('head')
    .cyl(0.105, 0.115, 0.06, 7, { at: [0, 0.255, -0.01], color })
    .box(0.12, 0.02, 0.06, { at: [0, 0.232, 0.1], rot: [0.3, 0, 0], color: shade(color, 0.85) });
}

// ---------------------------------------------------------------- clothes

/** Front and back panels of a tabard in a livery's field, with `badge` drawn on the chest in front (and plainer behind). */
export function liveryTabard(ctx: DressContext, l: Look, field: number, len: number, badge: (ctx: DressContext, l: Look, z: number, back: boolean) => void): void {
  tabard(ctx, l, field, len);
  badge(ctx, l, chestZ(l) + 0.012, false);
  badge(ctx, l, -0.125 * thick(l) - 0.012, true);
}

/**
 * Corvane's key, head up and bit to its right, on the chest at `z`: a ring
 * (its hole the tabard's own crimson), a shaft and the bit. Behind, the ring
 * and shaft alone.
 */
export function keyBadge(ctx: DressContext, l: Look, z: number, back: boolean): void {
  const k = thick(l);
  const y = ctx.p.spine * 0.62;
  const s = ctx.on('spine');
  s.box(0.075 * k, 0.07, 0.012, { at: [0, y + 0.055, z], color: LIVERY.corvane.badge }).box(0.022 * k, 0.15, 0.012, { at: [0, y - 0.04, z], color: LIVERY.corvane.badge });
  if (back) return;
  const out = z > 0 ? 0.006 : -0.006;
  s.box(0.034 * k, 0.03, 0.012, { at: [0, y + 0.055, z + out], color: LIVERY.corvane.field }).box(0.04 * k, 0.04, 0.012, {
    at: [-0.03 * k, y - 0.09, z],
    color: LIVERY.corvane.badge,
  });
}

/** Harrowgate's white tower: a keep and two merlons. Behind, the keep alone. */
function towerBadge(ctx: DressContext, l: Look, z: number, back: boolean): void {
  const k = thick(l);
  const y = ctx.p.spine * 0.6;
  const s = ctx.on('spine');
  const c = LIVERY.harrowgate.badge;
  s.box(0.065 * k, 0.1, 0.012, { at: [0, y, z], color: c });
  if (back) return;
  s.box(0.022 * k, 0.03, 0.012, { at: [-0.022 * k, y + 0.064, z], color: c }).box(0.022 * k, 0.03, 0.012, { at: [0.022 * k, y + 0.064, z], color: c });
}

/** A gold or faded hem across the bottom of a tabard's skirts, front and back: rank. */
function hem(ctx: DressContext, l: Look, len: number, color: number): void {
  const k = thick(l);
  const zf = chestZ(l) + 0.004;
  const y = -len + 0.04;
  ctx
    .on('hips')
    .box(0.275 * k, 0.04, 0.022, { at: [0, y, zf], color })
    .box(0.275 * k, 0.04, 0.022, { at: [0, y, -0.125 * k - 0.004], color });
}

/** A padded jack: quilted wool from the shoulders to mid-thigh, stitched in rows across the chest. */
export function paddedJack(ctx: DressContext, l: Look, color: number, skirt = 0.24): void {
  const k = thick(l);
  const L = ctx.p.spine;
  const b = belly(l);
  const s = ctx.on('spine');
  s.taper((0.33 + b) * k, (0.235 + b) * k, 0.43 * k, 0.27 * k, L * 0.7, { at: [0, -0.02, 0.005 + b * 0.3], color })
    .taper(0.43 * k, 0.27 * k, (ctx.p.shoulderW * 2 + 0.04) * k, 0.22 * k, L * 0.32, { at: [0, L * 0.68 - 0.02, 0], color });
  for (const y of [0.34, 0.55]) s.box(0.36 * k, 0.012, 0.012, { at: [0, L * y, (0.133 + b * 0.5) * k], color: shade(color, 0.72), jitter: 0 });
  ctx.on('hips').taper((0.39 + b) * k, (0.26 + b) * k, (0.34 + b) * k, (0.24 + b) * k, skirt, { at: [0, -skirt + 0.02, 0.005], color });
}

/** A cloth band round the left upper arm: a townsman's mark of the watch. */
function armband(ctx: DressContext, l: Look, color: number): void {
  const k = thick(l);
  ctx.on('upperArmL').taper(0.112 * k, 0.112 * k, 0.116 * k, 0.116 * k, 0.07, { at: [0, -0.17, 0], color });
}

/**
 * A cloak thrown back off the shoulders, to the calves: a fold over the back
 * of each shoulder, a cord across the chest between them, and the cloth
 * falling behind, wider as it goes.
 */
function cloak(ctx: DressContext, l: Look, color: number, cord: number): void {
  const k = thick(l);
  const L = ctx.p.spine;
  const s = ctx.on('spine');
  for (const side of [1, -1]) s.box(0.17 * k, 0.035, 0.17 * k, { at: [0.17 * k * side, L - 0.005, -0.035 * k], rot: [0, 0, -0.25 * side], color });
  s.box(0.3 * k, 0.016, 0.016, { at: [0, L - 0.07, chestZ(l) + 0.014], color: cord, jitter: 0 });
  s.taper(0.42 * k, 0.025, 0.5 * k, 0.025, L + 0.06, { at: [0, L - 0.01, -0.15 * k], rot: [PI + 0.05, 0, 0], color });
  ctx.on('hips').taper(0.5 * k, 0.025, 0.58 * k, 0.025, 0.7, { at: [0, 0.05, -0.18 * k], rot: [PI + 0.1, 0, 0], color: shade(color, 0.88) });
}

/** A belt over everything else, and its buckle. */
export function belt(ctx: DressContext, l: Look, color: number, buckle: number): void {
  const k = thick(l);
  const b = belly(l);
  ctx
    .on('hips')
    .box((0.33 + b) * k, 0.06, (0.245 + b) * k, { at: [0, 0.03, 0.005], color })
    .box(0.06, 0.05, 0.02, { at: [0, 0.03, (0.125 + b / 2) * k + 0.01], color: buckle });
}

// ---------------------------------------------------------------- what they hold

/** The grip on a polearm (in the right hand's space), and how far down its shaft the butt is, standing in POLE_STAND with it on the ground. */
const GRIP = new Vector3(0, -0.02, 0);
function gripHeight(p: Proportions): number {
  const hand = posedBones(p, POLE_STAND).handR;
  const up = new Vector3().setFromMatrixColumn(hand, 2);
  return GRIP.clone().applyMatrix4(hand).y / up.y;
}

/** A spear held upright in the right fist, its butt on the ground: along the hand's Z, as the farmer's pitchfork. */
function spear(ctx: DressContext): void {
  const grip = gripHeight(ctx.p);
  const len = 2.15;
  const b = ctx.on('handR');
  b.cyl(0.018, 0.02, len, 5, { at: [0, -0.02, len / 2 - grip], rot: [PI / 2, 0, 0], color: PAL.wood })
    .box(0.03, 0.03, 0.07, { at: [0, -0.02, len - grip], color: PAL.ironDark })
    .taper(0.045, 0.012, 0.004, 0.006, 0.24, { at: [0, -0.02, len - grip + 0.03], rot: [PI / 2, 0, 0], color: PAL.steel });
}

/** A halberd upright in the right fist: an axe blade facing forward, a spike above and a hook behind. */
function halberd(ctx: DressContext): void {
  const grip = gripHeight(ctx.p);
  const len = 2.0;
  const top = len - grip;
  ctx
    .on('handR')
    .cyl(0.02, 0.022, len, 5, { at: [0, -0.02, len / 2 - grip], rot: [PI / 2, 0, 0], color: PAL.woodDark })
    .box(0.014, 0.16, 0.2, { at: [0, -0.12, top - 0.1], rot: [0.12, 0, 0], color: PAL.steel })
    .taper(0.03, 0.02, 0.006, 0.006, 0.26, { at: [0, -0.02, top], rot: [PI / 2, 0, 0], color: PAL.steel })
    .box(0.014, 0.1, 0.035, { at: [0, 0.07, top - 0.1], rot: [-0.5, 0, 0], color: PAL.iron });
}

/** A recruit's wooden practice sword, in the hand along -Y, its edge to -Z (as the enemies hold theirs). */
function waster(ctx: DressContext): void {
  ctx
    .on('handR')
    .box(0.032, 0.12, 0.032, { at: [0, -0.04, 0], color: PAL.leatherDark })
    .box(0.03, 0.03, 0.16, { at: [0, -0.115, 0], color: PAL.woodDark })
    .taper(0.022, 0.05, 0.014, 0.04, 0.62, { at: [0, -0.13, 0], rot: [PI, 0, 0], color: 0x9a7a52 });
}

/** A plain arming sword, drawn, in the hand along -Y: the quartermaster's, looked over for nicks. */
function armingSword(ctx: DressContext): void {
  ctx
    .on('handR')
    .box(0.03, 0.03, 0.03, { at: [0, 0.03, 0], color: PAL.ironDark })
    .box(0.03, 0.11, 0.03, { at: [0, -0.045, 0], color: PAL.leatherDark })
    .box(0.026, 0.026, 0.17, { at: [0, -0.11, 0], color: PAL.iron })
    .taper(0.012, 0.052, 0.005, 0.012, 0.72, { at: [0, -0.125, 0], rot: [PI, 0, 0], color: PAL.steel });
}

// ---------------------------------------------------------------- stands

/** Standing with a polearm planted upright at the right side, the right forearm level; the left arm easy. */
export const POLE_STAND: Pose = {
  spine: [0.01, 0, 0],
  head: [-0.02, 0, 0],
  upperArmL: [0.04, 0, 0.1],
  forearmL: [-0.2, 0, 0],
  upperArmR: [-0.25, 0, -0.22],
  forearmR: [-1.25, 0, 0],
  handR: [0, -0.21, 0],
  thighL: [-0.03, 0, 0.04],
  thighR: [0.02, 0, -0.04],
};

/**
 * Walking with a polearm: the right fist 16 cm higher than in POLE_STAND,
 * the elbow at the side and the shaft still upright, so it's carried clear of
 * the ground as the hips bob and doesn't swing (people/walk.ts `walkOver`).
 */
const POLE_CARRY: Pose = {
  upperArmR: [-0.23, -0.15, -0.1],
  forearmR: [-1.93, -0.02, 0],
  handR: [0.59, -0.12, -0.66],
};

/** At attention: heels together, back straight, chin up, the halberd upright and the left arm straight down. */
const ATTENTION_STAND: Pose = {
  spine: [-0.02, 0, 0],
  head: [-0.06, 0, 0],
  upperArmL: [0, 0, 0.06],
  forearmL: [-0.08, 0, 0],
  upperArmR: POLE_STAND.upperArmR,
  forearmR: POLE_STAND.forearmR,
  handR: POLE_STAND.handR,
  thighL: [0, 0, 0.01],
  thighR: [0, 0, -0.01],
};

/** Arms folded over the chest, the right forearm over the left, feet apart: a sergeant watching the gate. */
const FOLDED: Pose = {
  spine: [-0.03, 0, 0],
  head: [-0.03, 0, 0],
  upperArmL: [-0.44, 0.01, 0.09],
  forearmL: [-1.53, -1.23, 0],
  upperArmR: [-0.42, 0.34, -0.25],
  forearmR: [-1.78, 0.95, 0],
  thighL: [-0.04, 0, 0.09],
  thighR: [0.03, 0, -0.09],
};

/** A drawn sword held low in the right hand, point down and forward, the left hand easy. */
const SWORD_LOW: Pose = {
  spine: [0.02, 0, 0],
  upperArmL: [0.04, 0, 0.1],
  forearmL: [-0.2, 0, 0],
  upperArmR: [-0.1, 0, -0.1],
  forearmR: [-0.7, 0, 0],
  handR: [-0.3, 0, 0],
  thighL: [-0.04, 0, 0.03],
  thighR: [0.03, 0, -0.03],
};

/** The practice sword hanging at the right side, point down; the left hand easy. */
const WASTER_DOWN: Pose = {
  spine: [0.02, 0, 0],
  upperArmL: [0.04, 0, 0.1],
  forearmL: [-0.2, 0, 0],
  upperArmR: [0.02, 0, -0.12],
  forearmR: [-0.25, 0, 0],
  handR: [0.25, 0, 0],
  thighL: [-0.04, 0, 0.03],
  thighR: [0.03, 0, -0.03],
};

// ---------------------------------------------------------------- the City Watch

const WATCHMAN_LOOK: Look = {
  build: 'average',
  skin: HUE.skinWarm,
  hair: HUE.hairBrown,
  hairStyle: 'none',
  shirt: HOSE,
  forearm: PADDING,
  hands: PAL.leatherDark,
  trousers: HOSE,
  boots: PAL.leatherDark,
};

/** The City Watch's harness: mail under the crown's tabard and its gold mark, a belt, leather gloves and a kettle helm. */
function watchHarness(ctx: DressContext, l: Look, len = 0.4): void {
  body(ctx, l);
  head(ctx, l);
  mail(ctx, l);
  tabard(ctx, l, LIVERY.crown.field, len, LIVERY.crown.badge);
  belt(ctx, l, PAL.leather, PAL.iron);
}

/** A watchman of Aldhaven: mail, the crown's blue tabard with the gold mark, a kettle helm and a spear. */
function dressWatchman(ctx: DressContext, l: Look): void {
  watchHarness(ctx, l);
  kettleHelm(ctx, PAL.iron);
  spear(ctx);
}

const HALBERDIER_LOOK: Look = { ...WATCHMAN_LOOK, skin: HUE.skinTan, hair: HUE.hairBlack, beard: 'moustache' };

/** Another face of the Watch, with a halberd. */
function dressHalberdier(ctx: DressContext, l: Look): void {
  watchHarness(ctx, l);
  kettleHelm(ctx, PAL.iron);
  halberd(ctx);
}

const SERGEANT_LOOK: Look = { ...WATCHMAN_LOOK, build: 'broad', skin: HUE.skinFair, hair: HUE.hairRed, beard: 'full' };

/** A sergeant of the Watch (Ulf at the Gorgegate): broad, red-bearded, a gold band on the helm and a gold hem, a sword at the hip and arms folded. */
function dressSergeant(ctx: DressContext, l: Look): void {
  watchHarness(ctx, l, 0.42);
  hem(ctx, l, 0.42, LIVERY.crown.badge);
  kettleHelm(ctx, PAL.iron, LIVERY.crown.badge);
  sheathedSword(ctx, l, PAL.iron);
}

const COMMANDER_LOOK: Look = {
  build: 'average',
  skin: HUE.skinFair,
  hair: HUE.hairDark,
  hairStyle: 'cropped',
  beard: 'short',
  shirt: HOSE,
  forearm: PAL.leather,
  hands: PAL.leatherDark,
  trousers: HOSE,
  boots: PAL.leatherDark,
};

/** The Watch's commander (Holloway): bareheaded, dark-bearded, in mail and the crown's tabard under a cloak of the crown's blue, a hand on the sword. */
function dressCommander(ctx: DressContext, l: Look): void {
  watchHarness(ctx, l, 0.44);
  hem(ctx, l, 0.44, LIVERY.crown.badge);
  cloak(ctx, l, shade(LIVERY.crown.field, 0.62), LIVERY.crown.badge);
  cuffs(ctx, l, PAL.leatherDark);
  sheathedSword(ctx, l, LIVERY.crown.badge);
}

const QUARTERMASTER_LOOK: Look = {
  build: 'stout',
  skin: HUE.skinWarm,
  hair: HUE.hairGrey,
  hairStyle: 'bald',
  beard: 'moustache',
  shirt: PADDING,
  forearm: PAL.leather,
  hands: 'skin',
  trousers: PAL.leatherDark,
  boots: PAL.leatherDark,
};

/** The Watch's quartermaster: stout and bald, no helm, the crown's tabard over a padded jack, a blade from the rack in hand. */
function dressQuartermaster(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  tabard(ctx, l, LIVERY.crown.field, 0.38, LIVERY.crown.badge);
  belt(ctx, l, PAL.leather, PAL.iron);
  cuffs(ctx, l, PAL.leatherDark, 0.12);
  armingSword(ctx);
}

const ROYAL_LOOK: Look = {
  build: 'broad',
  skin: HUE.skinTan,
  hair: HUE.hairDark,
  hairStyle: 'none',
  shirt: HOSE,
  forearm: PAL.steel,
  hands: PAL.leatherDark,
  trousers: HOSE,
  boots: PAL.leatherDark,
};

/** The royal guard at the keep: broad, in mail and steel, the crown's tabard hemmed in gold, a plumed helm and a halberd. */
function dressRoyalGuard(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  mail(ctx, l);
  tabard(ctx, l, LIVERY.crown.field, 0.46, LIVERY.crown.badge);
  hem(ctx, l, 0.46, LIVERY.crown.badge);
  belt(ctx, l, PAL.leatherDark, LIVERY.crown.badge);
  pauldrons(ctx, l, PAL.steel);
  plumedHelm(ctx, LIVERY.crown.field, LIVERY.crown.badge);
  halberd(ctx);
}

const RECRUIT_LOOK: Look = {
  build: 'average',
  skin: HUE.skinFair,
  hair: HUE.hairSandy,
  hairStyle: 'short',
  shirt: PADDING,
  forearm: HUE.linen,
  hands: 'skin',
  trousers: HUE.russet,
  boots: PAL.leather,
};

/** A recruit of the Watch: young and bareheaded in a padded jack, with a wooden sword. */
function dressRecruit(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  paddedJack(ctx, l, PADDING);
  belt(ctx, l, PAL.leather, PAL.iron);
  waster(ctx);
}

// ---------------------------------------------------------------- the great houses

const MAN_AT_ARMS_LOOK: Look = {
  build: 'average',
  skin: HUE.skinFair,
  hair: HUE.hairDark,
  hairStyle: 'none',
  shirt: SABLE,
  forearm: SABLE,
  hands: SABLE,
  trousers: SABLE,
  boots: SABLE,
};

/** House Corvane's man-at-arms at its door: mail, the crimson tabard with the black key, black hose, clean black boots, a blackened kettle helm and a spear. */
function dressManAtArms(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  mail(ctx, l);
  liveryTabard(ctx, l, LIVERY.corvane.field, 0.42, keyBadge);
  belt(ctx, l, SABLE, PAL.steel);
  kettleHelm(ctx, PAL.ironDark);
  spear(ctx);
}

const RETAINER_LOOK: Look = {
  build: 'average',
  skin: HUE.skinWarm,
  hair: HUE.hairSandy,
  hairStyle: 'cropped',
  beard: 'stubble',
  shirt: PAL.leatherDark,
  forearm: PAL.leather,
  hands: PAL.leatherDark,
  trousers: PAL.clothDark,
  boots: PAL.leatherDark,
};

/** Lady Harrowgate's retainer: bareheaded, a leather jack under Harrowgate's grey with the white tower, a hand on the sword. */
function dressRetainer(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  liveryTabard(ctx, l, LIVERY.harrowgate.field, 0.4, towerBadge);
  belt(ctx, l, PAL.leatherDark, PAL.steel);
  cuffs(ctx, l, PAL.leatherDark);
  sheathedSword(ctx, l, PAL.steel);
}

// ---------------------------------------------------------------- the crown's toll men

const TOLL_LOOK: Look = {
  build: 'average',
  skin: HUE.skinTan,
  hair: HUE.hairBrown,
  hairStyle: 'none',
  beard: 'stubble',
  shirt: PADDING,
  forearm: PADDING,
  hands: 'skin',
  trousers: PAL.leather,
  boots: PAL.woodDark,
};

/** The crown's tabard, faded and patched, over a padded jack: the toll men's. */
function tollHarness(ctx: DressContext, l: Look, len: number): void {
  body(ctx, l);
  head(ctx, l);
  tabard(ctx, l, FADED.field, len, FADED.badge);
  // A patch sewn over a tear at the hem.
  ctx.on('hips').box(0.09, 0.08, 0.022, { at: [0.06, -len + 0.12, chestZ(l) + 0.004], rot: [0, 0, 0.12], color: shade(FADED.field, 1.18) });
  belt(ctx, l, PAL.leather, PAL.rust);
}

/** A toll man on the causeway: the crown's colours patched and faded, a rusty kettle helm, a spear. */
function dressTollMan(ctx: DressContext, l: Look): void {
  tollHarness(ctx, l, 0.4);
  kettleHelm(ctx, PAL.rust);
  spear(ctx);
}

const TOLL_SERGEANT_LOOK: Look = { ...TOLL_LOOK, build: 'stout', skin: HUE.skinFair, hair: HUE.hairGrey, hairStyle: 'short', beard: 'moustache' };

/** The toll house's sergeant (Ludo Brisk): stout and greying, a felt cap for a helm, the faded hem of his rank, a halberd to lean on. */
function dressTollSergeant(ctx: DressContext, l: Look): void {
  tollHarness(ctx, l, 0.4);
  hem(ctx, l, 0.4, FADED.badge);
  feltCap(ctx, shade(FADED.field, 0.7));
  halberd(ctx);
}

// ---------------------------------------------------------------- a town's watch

const TOWN_WATCH_LOOK: Look = {
  build: 'average',
  skin: HUE.skinFair,
  hair: HUE.hairBrown,
  hairStyle: 'short',
  beard: 'full',
  shirt: WOOL,
  forearm: HUE.linenDark,
  hands: 'skin',
  trousers: PAL.leather,
  boots: PAL.leatherDark,
};

/** A townsman on the watch (Cairnford's): a padded jack of undyed wool, a cream armband, a spear, no helm. */
function dressTownWatchman(ctx: DressContext, l: Look): void {
  body(ctx, l);
  head(ctx, l);
  paddedJack(ctx, l, WOOL);
  armband(ctx, l, LIVERY.town.band);
  belt(ctx, l, PAL.leatherDark, PAL.iron);
  spear(ctx);
}

/**
 * The guards, by their cast name (people/cast.ts), with the work loops each
 * is made for (people/work.ts). A zone places them as villagers: the gate's
 * pair as `sentry`, a patrol as a stroll, the recruits at `drill`.
 */
export const GUARDS = {
  watchman: { label: 'Watchman', look: WATCHMAN_LOOK, stand: POLE_STAND, dress: dressWatchman, seed: 81, works: ['sentry', 'peer'], carry: POLE_CARRY },
  watchHalberdier: { label: 'Watch halberdier', look: HALBERDIER_LOOK, stand: POLE_STAND, dress: dressHalberdier, seed: 82, works: ['sentry'], carry: POLE_CARRY },
  watchSergeant: { label: 'Watch sergeant', look: SERGEANT_LOOK, stand: FOLDED, dress: dressSergeant, seed: 83 },
  watchCommander: { label: 'Watch commander', look: COMMANDER_LOOK, stand: HALE_STAND, dress: dressCommander, seed: 84 },
  quartermaster: { label: 'Quartermaster', look: QUARTERMASTER_LOOK, stand: SWORD_LOW, dress: dressQuartermaster, seed: 85, works: ['blades'] },
  royalGuard: { label: 'Royal guard', look: ROYAL_LOOK, stand: ATTENTION_STAND, dress: dressRoyalGuard, seed: 86, works: ['attention'], carry: POLE_CARRY },
  recruit: { label: 'Recruit', look: RECRUIT_LOOK, stand: WASTER_DOWN, dress: dressRecruit, seed: 87, works: ['drill'] },
  corvaneMan: { label: 'Corvane man-at-arms', look: MAN_AT_ARMS_LOOK, stand: POLE_STAND, dress: dressManAtArms, seed: 88, works: ['sentry'], carry: POLE_CARRY },
  harrowgateRetainer: { label: 'Harrowgate retainer', look: RETAINER_LOOK, stand: HALE_STAND, dress: dressRetainer, seed: 89 },
  tollMan: { label: 'Toll man', look: TOLL_LOOK, stand: POLE_STAND, dress: dressTollMan, seed: 90, works: ['sentry', 'lean'], carry: POLE_CARRY },
  tollSergeant: { label: 'Toll sergeant', look: TOLL_SERGEANT_LOOK, stand: POLE_STAND, dress: dressTollSergeant, seed: 91, works: ['lean'], carry: POLE_CARRY },
  townWatchman: { label: 'Town watchman', look: TOWN_WATCH_LOOK, stand: POLE_STAND, dress: dressTownWatchman, seed: 92, works: ['sentry'], carry: POLE_CARRY },
} satisfies Record<string, Person>;
