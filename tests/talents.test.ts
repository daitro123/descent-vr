import { describe, expect, it } from 'vitest';
import { type AdventureEvent, AdventureState, type Effect, type Progress, statsAt, xpToReach } from '../src/adventureState';
import { ABILITY, abilitiesOf, type Shape, slotsOf } from '../src/classes';
import { CONFIG } from '../src/config';
import { CHAINS } from '../src/quests';
import { readSave, saveRecord } from '../src/save/record';
import { costWith, lastsWith, pointsAt, type Talent, TALENT, TALENT_POINT_LINE, talentsIn, tierOpensAt, treesOf } from '../src/talents';

// Talents and the warrior's trees (abilities ticket 25), at the adventure
// state's seam: a character at a level, the talent page's presses fed to it
// as events (spend a point, reset, swap two shapes), and what it answers:
// points to spend, which tiers are open, your numbers and abilities, the
// gesture slots, and what the save keeps.

/** A warrior at `level` (the cap raised to 20), with `talents` spent and the slots `placed`. */
function warrior(level: number, talents: Progress['talents'] = {}, placed?: Progress['placed']): AdventureState {
  const saved = { ...new AdventureState().snapshot(), level, xp: xpToReach(level), talents, ...(placed ? { placed } : {}) };
  return new AdventureState(saved, CHAINS, { class: 'warrior', cap: 20 });
}

const spend = (talent: Talent, fighting = false): AdventureEvent => ({ kind: 'spend', talent, fighting });
const swap = (a: Shape, b: Shape, fighting = false): AdventureEvent => ({ kind: 'swap', shapes: [a, b], fighting });
const RESET: AdventureEvent = { kind: 'resetTalents', fighting: false };

/** Spend a point in each of `talents`, in order; returns every effect. */
function spendAll(state: AdventureState, talents: readonly Talent[]): Effect[] {
  return talents.flatMap((t) => state.apply(spend(t)));
}

const ARMS_TO_TIER_3: readonly Talent[] = ['deepCuts', 'deepCuts', 'deepCuts', 'tactician', 'tactician', 'heavySwing'];
const PROTECTION_TO_TIER_3: readonly Talent[] = ['toughness', 'toughness', 'toughness', 'quickGuard', 'ironArm', 'ironArm'];

describe("the warrior's trees", () => {
  it('are Arms and Protection, three tiers of two talents each, the tier-3 abilities taking one point', () => {
    expect(treesOf('warrior')).toEqual(['arms', 'protection']);
    expect(talentsIn('arms').map((t) => [t, TALENT[t].tier, TALENT[t].max])).toEqual([
      ['deepCuts', 1, 3],
      ['bloodRage', 1, 2],
      ['tactician', 2, 2],
      ['heavySwing', 2, 3],
      ['mortalStrike', 3, 1],
      ['sweepingMastery', 3, 2],
    ]);
    expect(talentsIn('protection').map((t) => [t, TALENT[t].tier, TALENT[t].max])).toEqual([
      ['toughness', 1, 3],
      ['shieldSpikes', 1, 2],
      ['quickGuard', 2, 2],
      ['ironArm', 2, 3],
      ['shieldSlam', 3, 1],
      ['unbreakable', 3, 2],
    ]);
    expect([TALENT.mortalStrike.ability, TALENT.shieldSlam.ability]).toEqual(['mortalStrike', 'shieldSlam']);
  });
});

describe('talent points', () => {
  it('come one a level from 2', () => {
    expect([1, 2, 3, 5, 7, 10, 20].map(pointsAt)).toEqual([0, 1, 2, 4, 6, 9, 19]);
    expect(warrior(1).pointsLeft).toBe(0);
    expect(warrior(5).pointsLeft).toBe(4);
  });

  it('wait unspent through levels, and the level-up says so from level 2', () => {
    const state = new AdventureState(undefined, CHAINS, { class: 'warrior', cap: 20 });
    for (let i = 0; i < 30; i++) state.apply({ kind: 'kill', camp: 'farm', level: 1, role: 'ordinary', family: 'bandit', seed: 1 });
    expect(state.level).toBe(3);
    expect(state.pointsLeft).toBe(2);
    expect(TALENT_POINT_LINE).toBe('Talent point: open your talents');
  });

  it('go in a talent, one a press, and are taken off the points left', () => {
    const state = warrior(3);
    expect(state.apply(spend('deepCuts'))).toEqual([{ kind: 'talent', talent: 'deepCuts', points: 1 }]);
    expect(state.apply(spend('deepCuts'))).toEqual([{ kind: 'talent', talent: 'deepCuts', points: 2 }]);
    expect(state.spentOn('deepCuts')).toBe(2);
    expect(state.spentIn('arms')).toBe(2);
    expect(state.pointsLeft).toBe(0);
    expect(state.apply(spend('bloodRage'))).toEqual([{ kind: 'talentRefused', reason: 'points' }]);
  });

  it('go in both trees if you like', () => {
    const state = warrior(3);
    spendAll(state, ['deepCuts', 'toughness']);
    expect([state.spentIn('arms'), state.spentIn('protection')]).toEqual([1, 1]);
  });
});

describe('tiers', () => {
  it('open at 3, 6 and 9 points in their tree', () => {
    expect([1, 2, 3, 4, 5].map(tierOpensAt)).toEqual([0, 3, 6, 9, 12]);
    const state = warrior(20);
    expect([1, 2, 3, 4].map((t) => state.opens('arms', t))).toEqual([true, false, false, false]);
    spendAll(state, ['deepCuts', 'deepCuts', 'deepCuts']);
    expect([1, 2, 3, 4].map((t) => state.opens('arms', t))).toEqual([true, true, false, false]);
    spendAll(state, ['tactician', 'tactician', 'heavySwing']);
    expect([1, 2, 3, 4].map((t) => state.opens('arms', t))).toEqual([true, true, true, false]);
    spendAll(state, ['heavySwing', 'heavySwing', 'bloodRage']);
    expect(state.spentIn('arms')).toBe(9);
    expect(state.opens('arms', 4)).toBe(true);
    // Points in one tree open nothing in the other.
    expect(state.opens('protection', 2)).toBe(false);
  });

  it('refuse a point in a talent whose tier is closed', () => {
    const state = warrior(10);
    expect(state.apply(spend('tactician'))).toEqual([{ kind: 'talentRefused', reason: 'tier' }]);
    spendAll(state, ['deepCuts', 'deepCuts', 'toughness']);
    // Three points, but only two in Arms.
    expect(state.apply(spend('tactician'))).toEqual([{ kind: 'talentRefused', reason: 'tier' }]);
    expect(state.apply(spend('mortalStrike'))).toEqual([{ kind: 'talentRefused', reason: 'tier' }]);
    expect(state.spentIn('arms')).toBe(2);
  });
});

describe('spending', () => {
  it('stops at a talent’s maximum', () => {
    const state = warrior(10);
    spendAll(state, ['bloodRage', 'bloodRage']);
    expect(state.apply(spend('bloodRage'))).toEqual([{ kind: 'talentRefused', reason: 'max' }]);
    expect(state.spentOn('bloodRage')).toBe(2);
    expect(state.pointsLeft).toBe(7);
  });

  it('is refused in a fight, and so are a reset and a swap', () => {
    const state = warrior(10, { deepCuts: 1 });
    expect(state.apply(spend('deepCuts', true))).toEqual([{ kind: 'talentRefused', reason: 'fighting' }]);
    expect(state.apply({ kind: 'resetTalents', fighting: true })).toEqual([{ kind: 'talentRefused', reason: 'fighting' }]);
    expect(state.apply(swap('ring', 'z', true))).toEqual([{ kind: 'talentRefused', reason: 'fighting' }]);
    expect(state.spentOn('deepCuts')).toBe(1);
    expect(state.slots.ring).toBe('heroicThrow');
    expect(state.refuses('deepCuts', true)).toBe('fighting');
    expect(state.refuses('deepCuts')).toBeNull();
  });

  it("is refused in another class's talent", () => {
    const mage = new AdventureState({ ...new AdventureState().snapshot(), level: 5, xp: xpToReach(5) }, CHAINS, { class: 'mage', cap: 20 });
    expect(mage.apply(spend('deepCuts'))).toEqual([{ kind: 'talentRefused', reason: 'class' }]);
  });
});

describe('resetting', () => {
  it('gives every point back, free, and the abilities talents granted with them', () => {
    const state = warrior(10);
    spendAll(state, [...PROTECTION_TO_TIER_3, 'shieldSlam', 'shieldSpikes']);
    expect(state.pointsLeft).toBe(1);
    expect(state.stats.abilities).toContain('shieldSlam');
    expect(state.apply(RESET)).toEqual([{ kind: 'talentsReset', points: 8 }]);
    expect(state.pointsLeft).toBe(9);
    expect(state.talents).toEqual({});
    expect(state.stats.abilities).not.toContain('shieldSlam');
    expect(state.slots.triangle).toBeNull();
    expect(state.stats).toEqual(warrior(10).stats);
  });

  it('does nothing with nothing spent', () => {
    expect(warrior(5).apply(RESET)).toEqual([]);
  });
});

describe("the warrior's talents", () => {
  it('change nothing with no points', () => {
    const t = warrior(10).stats.talents;
    expect(Object.values(t).every((v) => v === 0)).toBe(true);
    expect(warrior(10).stats.maxHp).toBe(statsAt(10).maxHp);
  });

  it('change the numbers Combat reads, point by point', () => {
    const arms = warrior(20, { deepCuts: 3, bloodRage: 2, tactician: 2, heavySwing: 3, sweepingMastery: 2, mortalStrike: 1 }).stats.talents;
    expect(arms.headHit).toBeCloseTo(0.3, 9);
    expect(arms.hitRage).toBe(4);
    expect(arms.fullSwing).toBeCloseTo(0.15, 9);
    const prot = warrior(20, { toughness: 3, shieldSpikes: 2, quickGuard: 2, ironArm: 3, unbreakable: 2 }).stats.talents;
    expect([prot.bashDamage, prot.bashRage, prot.parry]).toEqual([10, 8, 0.5]);
    expect(prot.numbLess).toBeCloseTo(1, 9);
  });

  it('change costs and how long abilities last: Tactician the War Cry, Sweeping Mastery and Unbreakable their abilities', () => {
    const W = CONFIG.classes.warrior.abilities;
    const none = warrior(10).stats.talents;
    expect(costWith('warCry', none)).toBe(50);
    expect(costWith('warCry', warrior(10, { deepCuts: 3, tactician: 1 }).stats.talents)).toBe(40);
    expect(costWith('warCry', warrior(10, { deepCuts: 3, tactician: 2 }).stats.talents)).toBe(30);
    const mastered = warrior(10, { deepCuts: 3, tactician: 2, heavySwing: 1, sweepingMastery: 2 }).stats.talents;
    expect(lastsWith('sweepingStrikes', W.sweepingStrikes.time, none)).toBe(8);
    expect(lastsWith('sweepingStrikes', W.sweepingStrikes.time, mastered)).toBe(12);
    expect(lastsWith('shieldWall', W.shieldWall.time, mastered)).toBe(6);
    const unbroken = warrior(10, { toughness: 3, ironArm: 3, unbreakable: 1 }).stats.talents;
    expect(lastsWith('shieldWall', W.shieldWall.time, unbroken)).toBe(8);
    expect(costWith('heroicThrow', mastered)).toBe(15);
  });

  it('Toughness adds 5% health a point', () => {
    const plain = statsAt(10).maxHp;
    expect([1, 2, 3].map((n) => warrior(10, { toughness: n }).stats.maxHp)).toEqual([1, 2, 3].map((n) => Math.round(plain * (1 + 0.05 * n))));
    expect(warrior(1).stats.maxHp).toBe(100);
  });
});

describe('Mortal Strike and Shield Slam', () => {
  it('appear in the triangle once their talent has its point: at level 8 with every point in one tree', () => {
    expect(warrior(7).pointsLeft).toBe(6);
    const state = warrior(8);
    spendAll(state, ARMS_TO_TIER_3);
    expect(state.slots.triangle).toBeNull();
    expect(state.apply(spend('mortalStrike'))).toEqual([{ kind: 'talent', talent: 'mortalStrike', points: 1 }]);
    expect(state.stats.abilities).toEqual(['warCry', 'earthshaker', 'heroicThrow', 'shieldWall', 'mortalStrike']);
    expect(state.slots).toEqual({ ring: 'heroicThrow', z: 'shieldWall', v: null, triangle: 'mortalStrike', s: null });
    expect(state.unlearned).toEqual(['ring', 'z', 'triangle']);
    expect(ABILITY.mortalStrike.level).toBe(8);
  });

  it('Shield Slam too, for 20 rage on a 10 s cooldown', () => {
    const state = warrior(10);
    spendAll(state, [...PROTECTION_TO_TIER_3, 'shieldSlam']);
    expect(state.slots).toEqual({ ring: 'heroicThrow', z: 'shieldWall', v: 'sweepingStrikes', triangle: 'shieldSlam', s: null });
    expect([ABILITY.shieldSlam.cost, ABILITY.shieldSlam.cooldown, ABILITY.mortalStrike.cost, ABILITY.mortalStrike.cooldown]).toEqual([20, 10, 30, 8]);
  });

  it('the second of the two takes the next free shape', () => {
    const state = warrior(15);
    spendAll(state, [...ARMS_TO_TIER_3, 'mortalStrike', ...PROTECTION_TO_TIER_3, 'shieldSlam']);
    expect(state.slots).toEqual({ ring: 'heroicThrow', z: 'shieldWall', v: 'sweepingStrikes', triangle: 'mortalStrike', s: 'shieldSlam' });
  });

  it('are no base ability: the arena and a level alone never bring them', () => {
    expect(abilitiesOf('warrior')).not.toContain('mortalStrike');
    expect(slotsOf(abilitiesOf('warrior')).triangle).toBeNull();
    expect(warrior(20).stats.abilities).not.toContain('shieldSlam');
  });
});

describe('swapping the gesture slots', () => {
  it('swaps what two shapes cast', () => {
    const state = warrior(10);
    expect(state.apply(swap('ring', 'v'))).toEqual([{ kind: 'swapped', shapes: ['ring', 'v'] }]);
    expect(state.slots).toEqual({ ring: 'sweepingStrikes', z: 'shieldWall', v: 'heroicThrow', triangle: null, s: null });
  });

  it('moves an ability into an empty shape, and does nothing with two empty ones or a shape and itself', () => {
    const state = warrior(6);
    state.apply(swap('ring', 's'));
    expect(state.slots).toEqual({ ring: null, z: null, v: null, triangle: null, s: 'heroicThrow' });
    expect(state.apply(swap('z', 'v'))).toEqual([]);
    expect(state.apply(swap('s', 's'))).toEqual([]);
  });

  it('keeps a swap as levels bring more, the new one in its own shape or the next free', () => {
    const state = new AdventureState({ ...warrior(6).snapshot() }, CHAINS, { class: 'warrior', cap: 20 });
    state.apply(swap('ring', 'z'));
    expect(state.slots.z).toBe('heroicThrow');
    // Shield Wall, at 8, starts in the Z: taken, so it goes to the first free shape.
    for (let i = 0; i < 30; i++) state.apply({ kind: 'kill', camp: null, level: 8, role: 'ordinary', family: 'bandit', seed: 1 });
    expect(state.level).toBeGreaterThanOrEqual(8);
    expect(state.slots).toMatchObject({ ring: 'shieldWall', z: 'heroicThrow' });
  });

  it('keeps a talent ability where it was swapped to through a reset and taking it again', () => {
    const state = warrior(10);
    spendAll(state, [...ARMS_TO_TIER_3, 'mortalStrike']);
    state.apply(swap('triangle', 's'));
    expect(state.slots).toMatchObject({ triangle: null, s: 'mortalStrike' });
    state.apply(RESET);
    expect(state.slots.s).toBeNull();
    spendAll(state, [...ARMS_TO_TIER_3, 'mortalStrike']);
    expect(state.slots).toMatchObject({ triangle: null, s: 'mortalStrike' });
  });
});

describe('the save', () => {
  it('keeps the talents and swaps round the store', () => {
    const state = warrior(10);
    spendAll(state, [...PROTECTION_TO_TIER_3, 'shieldSlam', 'bloodRage']);
    state.apply(swap('triangle', 'ring'));
    const snap = state.snapshot();
    expect(snap.talents).toEqual({ toughness: 3, quickGuard: 1, ironArm: 2, shieldSlam: 1, bloodRage: 1 });
    expect(snap.placed).toEqual({ shieldSlam: 'ring', heroicThrow: 'triangle' });
    const read = readSave(structuredClone(saveRecord(snap, { x: 0, z: 0, yaw: 0 })));
    if (read.kind !== 'saved') throw new Error(read.kind);
    const back = new AdventureState(read.record, CHAINS, { class: 'warrior', cap: 20 });
    expect(back.talents).toEqual(state.talents);
    expect(back.slots).toEqual(state.slots);
    expect(back.pointsLeft).toBe(1);
    expect(back.stats).toEqual(state.stats);
  });

  it('writes no swaps until one is made', () => {
    expect(warrior(5).snapshot()).not.toHaveProperty('placed');
    expect(warrior(5).snapshot().talents).toEqual({});
  });

  it('gives every point back from a record whose talents no longer fit', () => {
    // More points than the level brings (a level the cap took back), a closed tier, a talent past its maximum, one unknown.
    for (const talents of [{ deepCuts: 3, bloodRage: 2 }, { tactician: 1 }, { deepCuts: 4 }, { deepCuts: 1, axeMastery: 1 }]) {
      const state = new AdventureState({ ...warrior(4).snapshot(), talents: talents as Progress['talents'] }, CHAINS, { class: 'warrior', cap: 20 });
      expect(state.talents, JSON.stringify(talents)).toEqual({});
      expect(state.pointsLeft).toBe(3);
    }
  });

  it('drops swaps of an ability or to a shape this build doesn’t know', () => {
    const state = warrior(10, {}, { heroicThrow: 'z', shieldWall: 'ring', axeThrow: 'v', sweepingStrikes: 'star' } as unknown as Progress['placed']);
    expect(state.slots).toEqual({ ring: 'shieldWall', z: 'heroicThrow', v: 'sweepingStrikes', triangle: null, s: null });
    expect(state.snapshot().placed).toEqual({ heroicThrow: 'z', shieldWall: 'ring' });
  });
});

// The ranger's and the mage's trees (abilities ticket 26), on the same machinery.

/** A `klass` at `level` (the cap raised to 20), with `talents` spent. */
function character(klass: 'ranger' | 'mage', level: number, talents: Progress['talents'] = {}): AdventureState {
  const saved = { ...new AdventureState().snapshot(), level, xp: xpToReach(level), talents };
  return new AdventureState(saved, CHAINS, { class: klass, cap: 20 });
}

const TO_TIER_3: Readonly<Record<'marksmanship' | 'survival' | 'fire' | 'frost', readonly Talent[]>> = {
  marksmanship: ['steadyAim', 'steadyAim', 'steadyAim', 'efficiency', 'swiftArrows', 'swiftArrows'],
  survival: ['trapper', 'trapper', 'fleetFoot', 'serratedTips', 'serratedTips', 'steadyWard'],
  fire: ['ignite', 'ignite', 'incineration', 'improvedFireball', 'criticalMass', 'criticalMass'],
  frost: ['frostbite', 'iceShards', 'iceShards', 'permafrost', 'arcticReach', 'arcticReach'],
};

describe("the ranger's and the mage's trees", () => {
  it('are Marksmanship and Survival, Fire and Frost: three tiers of two talents each, the tier-3 abilities taking one point', () => {
    const rows = (tree: Parameters<typeof talentsIn>[0]) => talentsIn(tree).map((t) => [t, TALENT[t].tier, TALENT[t].max]);
    expect(treesOf('ranger')).toEqual(['marksmanship', 'survival']);
    expect(treesOf('mage')).toEqual(['fire', 'frost']);
    expect(rows('marksmanship')).toEqual([
      ['steadyAim', 1, 3],
      ['keenEye', 1, 2],
      ['efficiency', 2, 2],
      ['swiftArrows', 2, 3],
      ['trueshot', 3, 1],
      ['improvedVolley', 3, 2],
    ]);
    expect(rows('survival')).toEqual([
      ['trapper', 1, 3],
      ['fleetFoot', 1, 2],
      ['serratedTips', 2, 3],
      ['steadyWard', 2, 2],
      ['explosiveTrap', 3, 1],
      ['improvedScatter', 3, 2],
    ]);
    expect(rows('fire')).toEqual([
      ['ignite', 1, 3],
      ['incineration', 1, 2],
      ['improvedFireball', 2, 2],
      ['criticalMass', 2, 3],
      ['pyroblast', 3, 1],
      ['masterOfElements', 3, 2],
    ]);
    expect(rows('frost')).toEqual([
      ['frostbite', 1, 3],
      ['iceShards', 1, 2],
      ['permafrost', 2, 2],
      ['arcticReach', 2, 3],
      ['iceBarrier', 3, 1],
      ['frozenWard', 3, 2],
    ]);
    expect(['trueshot', 'explosiveTrap', 'pyroblast', 'iceBarrier'].map((t) => TALENT[t as Talent].ability)).toEqual(['trueshot', 'explosiveTrap', 'pyroblast', 'iceBarrier']);
    // Every talent has a name and a line for the page.
    for (const tree of [...treesOf('ranger'), ...treesOf('mage')]) for (const t of talentsIn(tree)) expect(TALENT[t].line.length, t).toBeGreaterThan(10);
  });

  it.each([
    ['ranger', 'marksmanship', 'trueshot', ['powerShot', 'snareTrap', 'volley', 'scatter', 'trueshot']],
    ['ranger', 'survival', 'explosiveTrap', ['powerShot', 'snareTrap', 'volley', 'scatter', 'explosiveTrap']],
    ['mage', 'fire', 'pyroblast', ['frostNova', 'fireball', 'frostbolt', 'chainLightning', 'pyroblast']],
    ['mage', 'frost', 'iceBarrier', ['frostNova', 'fireball', 'frostbolt', 'chainLightning', 'iceBarrier']],
  ] as const)("the %s's %s: tier 3 at 6 points, and %s in the triangle at level 8", (klass, tree, ability, abilities) => {
    const state = character(klass, 8);
    expect(state.apply(spend(ability))).toEqual([{ kind: 'talentRefused', reason: 'tier' }]);
    spendAll(state, TO_TIER_3[tree]);
    expect(state.opens(tree, 3)).toBe(true);
    expect(state.apply(spend(ability))).toEqual([{ kind: 'talent', talent: ability, points: 1 }]);
    expect(state.pointsLeft).toBe(0);
    expect(state.stats.abilities).toEqual(abilities);
    expect(state.slots.triangle).toBe(ability);
    expect(ABILITY[ability]).toMatchObject({ class: klass, level: 8, byTalent: true, use: 'triangle' });
    // Reset takes it back.
    state.apply(RESET);
    expect(state.slots.triangle).toBeNull();
  });

  it("refuse another class's talents", () => {
    expect(character('ranger', 10).apply(spend('ignite'))).toEqual([{ kind: 'talentRefused', reason: 'class' }]);
    expect(character('mage', 10).apply(spend('steadyAim'))).toEqual([{ kind: 'talentRefused', reason: 'class' }]);
    expect(warrior(10).apply(spend('trapper'))).toEqual([{ kind: 'talentRefused', reason: 'class' }]);
    expect(character('mage', 10).apply(spend('deepCuts'))).toEqual([{ kind: 'talentRefused', reason: 'class' }]);
  });

  it("change the numbers Combat reads, point by point: the ranger's", () => {
    const m = character('ranger', 20, { steadyAim: 3, keenEye: 2, efficiency: 2, swiftArrows: 3, improvedVolley: 2, trueshot: 1 }).stats.talents;
    expect([m.arrowDamage, m.headMultiplier, m['cost:powerShot'], m.arrowSpeed, m.volleyArrows].map((n) => +n.toFixed(9))).toEqual([0.15, 0.4, -10, 0.3, 2]);
    const s = character('ranger', 20, { trapper: 3, fleetFoot: 2, serratedTips: 3, steadyWard: 2, improvedScatter: 2 }).stats.talents;
    expect([s.trapRoot, s.dashSooner, s.bleed, s.wardLonger, s.scatterSlow].map((n) => +n.toFixed(9))).toEqual([3, 0.6, 6, 0.6, 0.6]);
    expect(costWith('powerShot', m)).toBe(10);
  });

  it("change the numbers Combat reads, point by point: the mage's", () => {
    const f = character('mage', 20, { ignite: 3, incineration: 2, improvedFireball: 2, criticalMass: 3, masterOfElements: 2 }).stats.talents;
    expect([f.ignite, f.chargeFaster, f.fireballRadius, f.headMultiplier, f.fireHeadMana].map((n) => +n.toFixed(9))).toEqual([0.3, 0.2, 1, 0.3, 10]);
    const r = character('mage', 20, { frostbite: 3, iceShards: 2, permafrost: 2, arcticReach: 3, frozenWard: 2 }).stats.talents;
    expect([r.frostbite, r.frostDamage, r.slowLonger, r.slowStronger, r.frostReach, r.wardSlow].map((n) => +n.toFixed(9))).toEqual([0.15, 0.2, 2, 0.2, 0.9, 0.4]);
    // A talent of one class adds nothing to another's numbers.
    expect(Object.values(character('mage', 20).stats.talents).every((v) => v === 0)).toBe(true);
  });

  it("round the save with the ranger's and the mage's characters", () => {
    for (const [klass, tree, ability] of [
      ['ranger', 'survival', 'explosiveTrap'],
      ['mage', 'fire', 'pyroblast'],
    ] as const) {
      const state = character(klass, 9);
      spendAll(state, [...TO_TIER_3[tree], ability, TO_TIER_3[tree][0]]);
      const read = readSave(structuredClone(saveRecord(state.snapshot(), { x: 0, z: 0, yaw: 0 })));
      if (read.kind !== 'saved') throw new Error(read.kind);
      const back = new AdventureState(read.record, CHAINS, { class: klass, cap: 20 });
      expect(back.talents).toEqual(state.talents);
      expect(back.slots.triangle).toBe(ability);
      expect(back.stats).toEqual(state.stats);
    }
  });
});
