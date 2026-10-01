import { Color, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { castClips, type MutablePose } from '../src/inspector/clips';
import type { PersonPlan } from '../src/maps/types';
import { buildCharacter, type EnemyKind, FAMILIES } from '../src/models/characters';
import { GUARDS, LIVERY } from '../src/models/guards';
import { HUE } from '../src/models/human';
import type { Person } from '../src/models/people';
import { BONES, type Rig } from '../src/models/rig';
import { Wardrobe } from '../src/people/cast';
import { type Placed, Population } from '../src/people/population';
import { WORKS } from '../src/people/work';

// The guards (models/guards.ts) and House Corvane's bailiffs (models/bailiffs.ts):
// what a player would notice of them. A polearm stands on the ground, not in
// it or over it, at rest, at sentry and leant on; the recruits at drill keep
// one clock however they came to be built; and the colours say whose they are:
// the crown's blue and gold on its men, never the bandits' red on anyone's.

type GuardId = keyof typeof GUARDS;
const IDS = Object.keys(GUARDS) as GuardId[];
/** Those who carry a polearm planted at their side. */
const POLEARMS: GuardId[] = ['watchman', 'watchHalberdier', 'royalGuard', 'corvaneMan', 'tollMan', 'tollSergeant', 'townWatchman'];
/** Those in the crown's service in Aldhaven, in its blue and gold. */
const CROWN: GuardId[] = ['watchman', 'watchHalberdier', 'watchSergeant', 'watchCommander', 'quartermaster', 'royalGuard'];

const _v = new Vector3();

/** The lowest point of what `rig` holds in its right hand (its polearm's butt), standing in `pose` with its hips shifted by `hip`. */
function butt(rig: Rig, pose: Parameters<Rig['apply']>[0], hip: readonly number[] = [0, 0, 0]): number {
  rig.apply(pose);
  rig.setHipOffset(hip[0], hip[1], hip[2]);
  rig.mesh.updateMatrixWorld(true);
  const geo = rig.mesh.geometry;
  const skin = geo.getAttribute('skinIndex');
  const hand = BONES.indexOf('handR');
  let low = Infinity;
  for (let i = 0; i < geo.getAttribute('position').count; i++) {
    if (skin.getX(i) !== hand) continue;
    rig.mesh.getVertexPosition(i, _v);
    low = Math.min(low, _v.y);
  }
  return low;
}

describe('a guard’s polearm', () => {
  it.each(POLEARMS)('%s stands with its butt on the ground', (id) => {
    expect(Math.abs(butt(new Wardrobe().dress(id), GUARDS[id].stand))).toBeLessThan(0.02);
  });

  it.each(POLEARMS.filter((id) => (GUARDS[id] as Person).works?.includes('sentry')))(
    '%s at sentry keeps it on the ground, lifting it no more than a hand’s breadth',
    (id) => {
      const rig = new Wardrobe().dress(id);
      const sentry = WORKS.sentry(GUARDS[id].stand);
      const heights = Array.from({ length: 200 }, (_, i) => {
        const w = sentry.at((sentry.duration * i) / 200);
        return butt(rig, w.pose, w.hip);
      });
      expect(Math.min(...heights)).toBeGreaterThan(-0.03);
      expect(Math.max(...heights)).toBeLessThan(0.12);
      expect(heights.filter((h) => Math.abs(h) < 0.03).length).toBeGreaterThan(heights.length * 0.8);
    },
  );

  it.each(POLEARMS)('%s walking carries it upright, clear of the ground and not swinging', (id) => {
    const rig = new Wardrobe().dress(id);
    const walk = castClips(id).find((c) => c.name === 'walk')!;
    const out: MutablePose = {};
    const lows: number[] = [];
    for (let i = 0; i < 48; i++) {
      const frame = walk.sample((walk.duration * i) / 48, out);
      lows.push(butt(rig, frame.pose, frame.hip ?? [0, frame.hipY, 0]));
      const up = new Vector3().setFromMatrixColumn(rig.bones.handR.matrixWorld, 2).normalize();
      expect(up.y, `${i}/48`).toBeGreaterThan(0.98);
    }
    expect(Math.min(...lows)).toBeGreaterThan(0.02);
    expect(Math.max(...lows)).toBeLessThan(0.25);
  });

  it.each(['tollMan', 'tollSergeant'] as const)('%s leaning on it keeps its butt on the ground, both hands on the shaft', (id) => {
    const rig = new Wardrobe().dress(id);
    const lean = WORKS.lean(GUARDS[id].stand);
    for (let i = 0; i < 60; i++) {
      const w = lean.at((lean.duration * i) / 60);
      expect(Math.abs(butt(rig, w.pose, w.hip)), `${i}/60`).toBeLessThan(0.05);
    }
    // The left fist round the shaft above the right.
    const w = lean.at(0);
    rig.apply(w.pose);
    rig.mesh.updateMatrixWorld(true);
    const right = new Vector3(0, -0.02, 0).applyMatrix4(rig.bones.handR.matrixWorld);
    const up = new Vector3().setFromMatrixColumn(rig.bones.handR.matrixWorld, 2).normalize();
    const left = new Vector3(0, -0.06, 0).applyMatrix4(rig.bones.handL.matrixWorld);
    const along = left.clone().sub(right).dot(up);
    const off = left.clone().sub(right).addScaledVector(up, -along).length();
    expect(along).toBeGreaterThan(0.1);
    expect(off).toBeLessThan(0.05);
  });
});

describe('the recruits’ drill', () => {
  /** A stand-in body: it keeps the time the population last gave it. */
  class Body implements Placed {
    shown = true;
    time = NaN;
    constructor(readonly plan: PersonPlan) {}
    update(_dt: number, _you: Vector3, time: number) {
      this.time = time;
    }
    far(you: Vector3) {
      return Math.hypot(this.plan.x - you.x, this.plan.z - you.z);
    }
    say() {}
  }
  const recruit = (id: string, x: number): PersonPlan => ({ id, cast: 'recruit', x, z: 0, yaw: 0, work: 'drill' });

  it('is kept in time by everyone at it, whenever each was built', () => {
    const drill = WORKS.drill(GUARDS.recruit.stand);
    expect(drill.together).toBe(true);
    const population = new Population<Body>({ make: (plan) => new Body(plan), drop: () => {} });
    const you = new Vector3(0, 1.6, 40);
    population.add([recruit('r1', -2), recruit('r2', 0)]);
    population.fill(you);
    for (let i = 0; i < 72 * 3.3; i++) population.update(1 / 72, you);
    // A third comes into view later, and is given the same clock as the rest.
    population.add([recruit('r3', 2)]);
    for (let i = 0; i < 72 * 2.1; i++) population.update(1 / 72, you);
    const times = ['r1', 'r2', 'r3'].map((id) => population.get(id)!.time);
    expect(times[0]).toBeCloseTo(5.4, 1);
    expect(new Set(times).size).toBe(1);
    // Which is a moment of the drill itself, not a rest between rounds.
    const sword = drill.at(times[0]).pose.upperArmR!;
    expect(Math.abs(sword[0]) + Math.abs(sword[2])).toBeGreaterThan(0.3);
  });
});

/** Every distinct hue (deg) and saturation on `rig`'s body, as drawn. */
function shades(rig: Rig): { h: number; s: number }[] {
  const colors = rig.mesh.geometry.getAttribute('color');
  const c = new Color();
  const hsl = { h: 0, s: 0, l: 0 };
  const out: { h: number; s: number }[] = [];
  for (let i = 0; i < colors.count; i++) {
    c.setRGB(colors.getX(i), colors.getY(i), colors.getZ(i)).getHSL(hsl);
    out.push({ h: hsl.h * 360, s: hsl.s });
  }
  return out;
}

/** Does `rig` wear `hex` anywhere (any shade of it)? */
function wears(rig: Rig, hex: number): boolean {
  const want = { h: 0, s: 0, l: 0 };
  new Color(hex).getHSL(want);
  const dh = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  return shades(rig).some(({ h, s }) => dh(h, want.h * 360) < 1.5 && Math.abs(s - want.s) < 0.02);
}

describe('whose they are, by their colours', () => {
  /** Every fighter of House Corvane, each look. */
  const BAILIFFS: [string, () => Rig][] = (Object.entries(FAMILIES.corvane.fights) as [EnemyKind, { label: string; looks: number }][]).flatMap(([kind, f]) =>
    Array.from({ length: f.looks }, (_, variant): [string, () => Rig] => [`${f.label} ${variant}`, () => buildCharacter(kind, { family: 'corvane', variant }).rig]),
  );

  it.each(CROWN)('%s wears the crown’s blue and gold', (id) => {
    const rig = new Wardrobe().dress(id);
    expect(wears(rig, LIVERY.crown.field)).toBe(true);
    expect(wears(rig, LIVERY.crown.badge)).toBe(true);
  });

  it.each([...BAILIFFS, ['Corvane man-at-arms', () => new Wardrobe().dress('corvaneMan')] as [string, () => Rig]])('%s wears Corvane’s crimson and black', (_name, build) => {
    const rig = build();
    expect(wears(rig, LIVERY.corvane.field)).toBe(true);
    expect(wears(rig, LIVERY.corvane.badge)).toBe(true);
  });

  it('Corvane’s crimson is darker and bluer than the bandits’ red', () => {
    const crimson = { h: 0, s: 0, l: 0 };
    const red = { h: 0, s: 0, l: 0 };
    new Color(LIVERY.corvane.field).getHSL(crimson);
    new Color(HUE.banditRed).getHSL(red);
    expect(crimson.l).toBeLessThan(red.l);
    // Round past red toward the blues, not toward the oranges.
    expect(crimson.h * 360).toBeGreaterThan(320);
    expect(crimson.h * 360).toBeLessThan(355);
  });

  it.each([...IDS.map((id): [string, () => Rig] => [GUARDS[id].label, () => new Wardrobe().dress(id)]), ...BAILIFFS])('%s wears none of the bandits’ red', (_name, build) => {
    const rig = build();
    expect(wears(rig, HUE.banditRed)).toBe(false);
    expect(wears(rig, HUE.banditRedDark)).toBe(false);
  });

  it('as every bandit does', () => {
    for (const variant of [0, 1, 2]) expect(wears(buildCharacter('grunt', { family: 'bandit', variant }).rig, HUE.banditRed)).toBe(true);
  });
});
