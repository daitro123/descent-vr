import { describe, expect, it } from 'vitest';
import { AdventureState, xpToReach } from '../src/adventureState';
import { abilitiesOf, type Shape, SHAPES, slotsOf } from '../src/classes';
import { CONFIG } from '../src/config';
import { classify } from '../src/player/gestures/matcher';
import { GestureRecorder, type HandFrame } from '../src/player/gestures/recorder';
import { modelsOf, templateStroke } from '../src/player/gestures/shapes';
import { CHAINS } from '../src/quests';
import { bench, type Play, WARRIOR_PLAY } from './support/gestureStrokes';

// Abilities by gesture (abilities ticket 19): the recogniser promoted from the
// prototype, arming it with the right grip, and the gesture slots in the
// adventure state. The recogniser is driven by strokes made up by code
// (tests/support/gestureStrokes.ts, the prototype's stroke maker): each shape
// drawn sloppily, and the warrior's swings, thrusts and blocks made with the
// grip held.

const PLAY = Object.keys(WARRIOR_PLAY) as Play[];

describe('the recogniser', () => {
  it('reads each clean template as itself, among all five shapes', () => {
    const models = modelsOf(SHAPES);
    for (const s of SHAPES) expect(classify(templateStroke(s), models).id).toBe(s);
  });

  it("reads sloppy shapes at the prototype's rate or better, and never as another often", () => {
    // 200 of each, drawn by the prototype's stroke maker on its own seed: the prototype read 96.5% of them.
    const b = bench(SHAPES, [], 200, 7);
    expect(b.readRight).toBeGreaterThanOrEqual(0.965);
    expect(b.readWrong).toBeLessThanOrEqual(0.01);
    for (const s of SHAPES) expect(b.shapes[s].right / 200, s).toBeGreaterThanOrEqual(0.85);
  });

  it("reads the warrior's three shapes better still", () => {
    const b = bench(['ring', 'z', 'v'], [], 200, 11);
    expect(b.readRight).toBeGreaterThanOrEqual(0.98);
    expect(b.readWrong).toBe(0);
  });

  it('reads sword swings, thrusts and blocks made with the grip held as nothing', () => {
    const all = bench(SHAPES, PLAY, 200, 3);
    expect(all.falseReads).toBe(0);
    expect(Object.values(all.play).every((n) => n === 0)).toBe(true);
    // With only the warrior's three shapes to be mistaken for, too.
    expect(bench(['ring', 'z', 'v'], PLAY, 100, 5).falseReads).toBe(0);
  });

  it('reads nothing from a stroke too short to be a shape, or with no shape to read', () => {
    const tiny = { points: [[0, 0, 0.4], [0.05, 0, 0.4], [0.05, 0.05, 0.4]] as const, times: [0, 0.1, 0.2] };
    expect(classify(tiny, modelsOf(SHAPES))).toMatchObject({ id: null, miss: 'too small' });
    expect(classify(templateStroke('ring'), [])).toMatchObject({ id: null });
  });
});

describe('arming a gesture with the right grip', () => {
  /** One frame with the hand at `hand` from the eyes (x right, y up, z forward), looking down −z. */
  const frame = (hand: readonly [number, number, number], squeeze: number, more: Partial<HandFrame> = {}): HandFrame => ({
    hand: { x: hand[0], y: 1.6 + hand[1], z: -hand[2] },
    head: { x: 0, y: 1.6, z: 0 },
    gaze: { x: 0, y: 0, z: -1 },
    squeeze,
    tracked: true,
    busy: false,
    dt: 1 / 72,
    ...more,
  });

  it('records while the grip is held, in the body frame, and hands the stroke over on release', () => {
    const r = new GestureRecorder();
    const armed = r.update(frame([0.1, -0.3, 0.4], 1));
    expect(armed?.kind === 'armed' && armed.at.map((v) => +v.toFixed(3))).toEqual([0.1, -0.3, 0.4]);
    r.update(frame([0.2, -0.3, 0.4], 0.7)); // still held: the grip lets go only under 0.5
    const e = r.update(frame([0.3, -0.3, 0.4], 0.2));
    expect(e?.kind).toBe('stroke');
    if (e?.kind === 'stroke') expect(e.stroke.points.map((p) => p.map((v) => +v.toFixed(3)))).toEqual([[0.1, -0.3, 0.4], [0.2, -0.3, 0.4]]);
  });

  it('turns with your heading: "forward" is where you looked when it armed', () => {
    const r = new GestureRecorder();
    const e = r.update({ ...frame([0, 0, 0], 1), hand: { x: 0.4, y: 1.3, z: 0 }, gaze: { x: 1, y: -0.2, z: 0 } });
    expect(e?.kind === 'armed' && e.at.map((v) => +v.toFixed(3))).toEqual([0, -0.3, 0.4]);
    const back = r.toRig(0, -0.3, 0.4);
    expect([back.x, back.y, back.z].map((v) => +v.toFixed(3))).toEqual([0.4, 1.3, 0]);
  });

  it('never arms at either shoulder (the bag), either hip (a potion) or the tool loop, until the grip is let go', () => {
    for (const { at, name } of CONFIG.gestures.taken) {
      const r = new GestureRecorder();
      expect(r.update(frame(at, 1)), name).toEqual({ kind: 'taken', place: name });
      // Moving out of the place with the grip still held draws nothing.
      for (let i = 0; i < 20; i++) expect(r.update(frame([0.1, -0.2 + i * 0.01, 0.4], 1))).toBeNull();
      expect(r.update(frame([0.1, 0, 0.4], 0))).toBeNull();
      expect(r.armed).toBe(false);
    }
  });

  it('drops a stroke held too long, one that lost tracking, and one with the class’s attack in the hand', () => {
    const run = (more: Partial<HandFrame>, frames: number) => {
      const r = new GestureRecorder();
      r.update(frame([0.1, -0.3, 0.4], 1));
      for (let i = 0; i < frames; i++) r.update(frame([0.1 + i * 0.001, -0.3, 0.4], 1, more));
      return r.update(frame([0.1, -0.3, 0.4], 0));
    };
    expect(run({}, Math.ceil(CONFIG.gestures.arm.maxDuration * 72) + 2)).toEqual({ kind: 'dropped', reason: 'held too long' });
    expect(run({}, Math.floor(CONFIG.gestures.arm.maxDuration * 72) - 2)?.kind).toBe('stroke');
    expect(run({ tracked: false }, 5)).toEqual({ kind: 'dropped', reason: 'lost tracking' });
    expect(run({ busy: true }, 5)).toEqual({ kind: 'dropped', reason: 'busy' });
  });
});

describe('gesture slots', () => {
  it("hold the warrior's gesture abilities in their own shapes: Heroic Throw the ring, Shield Wall the Z, Sweeping Strikes the V", () => {
    expect(slotsOf(abilitiesOf('warrior'))).toEqual({ ring: 'heroicThrow', z: 'shieldWall', v: 'sweepingStrikes', triangle: null, s: null });
    expect(slotsOf(['warCry', 'earthshaker'])).toEqual({ ring: null, z: null, v: null, triangle: null, s: null });
  });

  /** A warrior at `level`, with the cap raised to reach it. */
  const warrior = (level: number, drawn?: readonly Shape[]) => {
    const fresh = new AdventureState(undefined, CHAINS, { cap: 20 }).snapshot();
    return new AdventureState({ ...fresh, level, xp: xpToReach(level), ...(drawn ? { drawn } : {}) }, CHAINS, { cap: 20 });
  };

  it('fill as the levels bring each gesture ability', () => {
    expect(warrior(5).slots).toEqual({ ring: null, z: null, v: null, triangle: null, s: null });
    expect(warrior(6).slots.ring).toBe('heroicThrow');
    expect(warrior(8).slots).toMatchObject({ ring: 'heroicThrow', z: 'shieldWall', v: null });
    expect(warrior(10).slots).toMatchObject({ ring: 'heroicThrow', z: 'shieldWall', v: 'sweepingStrikes' });
  });

  it('list the shapes never drawn, which go once each is drawn, and are kept by the save', () => {
    const state = warrior(10);
    expect(state.unlearned).toEqual(['ring', 'z', 'v']);
    expect(state.apply({ kind: 'drawn', shape: 'z' })).toEqual([{ kind: 'learned', shape: 'z' }]);
    expect(state.apply({ kind: 'drawn', shape: 'z' })).toEqual([]);
    // A shape holding nothing isn't learned by drawing it.
    expect(state.apply({ kind: 'drawn', shape: 's' })).toEqual([]);
    expect(state.unlearned).toEqual(['ring', 'v']);
    const saved = state.snapshot();
    expect(saved.drawn).toEqual(['z']);
    expect(new AdventureState(saved, CHAINS, { cap: 20 }).unlearned).toEqual(['ring', 'v']);
  });

  it('keep nothing drawn for a character who has drawn nothing, and take an odd record as best they can', () => {
    expect(warrior(1).snapshot()).not.toHaveProperty('drawn');
    expect(warrior(10, ['v', 'nonsense' as Shape]).unlearned).toEqual(['ring', 'z']);
    expect(warrior(10, 'v' as unknown as Shape[]).unlearned).toEqual(['ring', 'z', 'v']);
  });

  it('say nothing is waiting at level 5, the cap today: Oakvale plays as before', () => {
    const state = new AdventureState();
    expect(state.unlearned).toEqual([]);
    expect(Object.values(state.slots).every((a) => a === null)).toBe(true);
  });

  it('have the matcher read only the shapes that hold something', () => {
    // A Z with only the ring to be read as reads as nothing.
    expect(classify(templateStroke('z'), modelsOf(['ring'])).id).toBeNull();
  });
});
