import { describe, expect, it } from 'vitest';
import { bench, buildModels, CLASS_JUNK, templateStroke } from '../src/prototype/gestures/gestureBench.prototype';
import { classify } from '../src/prototype/gestures/gestureMatcher.prototype';
import { ARM, GestureRecorder, type HandFrame } from '../src/prototype/gestures/gestureRecorder.prototype';
import { GESTURES, VOCABULARIES } from '../src/prototype/gestures/gestureVocab.prototype';
import { readPage } from '../src/route';

// PROTOTYPE (abilities ticket 07): the gesture recogniser and its arming. The
// numbers the ticket's Answer quotes come from the headless check,
// .scratch/abilities/checks/gestures.mjs, over the same bench.

const SHAPES = VOCABULARIES.find((v) => v.id === 'C')!.gestures;

describe('the gesture matcher (prototype)', () => {
  it('reads each clean template as itself, among every gesture', () => {
    const ids = Object.keys(GESTURES);
    const models = buildModels(ids);
    for (const id of ids) expect(classify(templateStroke(GESTURES[id]), models).id).toBe(id);
  });

  it('reads sloppy shapes right nine times in ten and sword swings almost never', () => {
    const b = bench(SHAPES, CLASS_JUNK.warrior, 60, 3);
    expect(b.readRight).toBeGreaterThan(0.9);
    expect(b.readWrong).toBeLessThan(0.02);
    expect(b.falseReads).toBeLessThan(0.02);
  });

  it('takes a thrust for a push out: flicks are what a sword already does', () => {
    const b = bench(['out', 'up'], ['thrust', 'blockHigh'], 60, 3);
    expect(b.falseReads).toBeGreaterThan(0.3);
  });
});

describe('arming a gesture (prototype)', () => {
  const frame = (hand: [number, number, number], squeeze: number, more: Partial<HandFrame> = {}): HandFrame => ({
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
    r.update(frame([0.2, -0.3, 0.4], 0.7)); // still held: hysteresis
    const e = r.update(frame([0.3, -0.3, 0.4], 0.2));
    expect(e?.kind).toBe('stroke');
    if (e?.kind === 'stroke') expect(e.stroke.points.map((p) => p.map((v) => +v.toFixed(3)))).toEqual([[0.1, -0.3, 0.4], [0.2, -0.3, 0.4]]);
  });

  it('turns with your heading: "forward" is where you looked when it armed', () => {
    const r = new GestureRecorder();
    // Looking along +x; the hand 0.4 m further along +x is 0.4 m forward.
    const e = r.update({ ...frame([0, 0, 0], 1), hand: { x: 0.4, y: 1.3, z: 0 }, gaze: { x: 1, y: -0.2, z: 0 } });
    expect(e?.kind === 'armed' && e.at.map((v) => +v.toFixed(3))).toEqual([0, -0.3, 0.4]);
  });

  it('never arms in the bag, the potion slots or the tool loop', () => {
    for (const at of [[0.2, -0.14, -0.12], [-0.2, -0.14, -0.12], [0.19, -0.7, 0.04], [-0.19, -0.7, 0.04], [0.19, -0.66, -0.16]] as const) {
      const r = new GestureRecorder();
      expect(r.update(frame([...at], 1))?.kind).toBe('taken');
      expect(r.update(frame([...at], 0))).toBeNull();
    }
  });

  it('drops a stroke held too long, one with a shot in the hand, and one that lost tracking', () => {
    const run = (more: Partial<HandFrame>, frames: number) => {
      const r = new GestureRecorder();
      r.update(frame([0.1, -0.3, 0.4], 1));
      for (let i = 0; i < frames; i++) r.update(frame([0.1 + i * 0.01, -0.3, 0.4], 1, more));
      return r.update(frame([0.1, -0.3, 0.4], 0));
    };
    expect(run({}, Math.ceil(ARM.maxDuration * 72) + 2)).toEqual({ kind: 'dropped', reason: 'held too long' });
    expect(run({ busy: true }, 5)).toEqual({ kind: 'dropped', reason: 'busy' });
    expect(run({ tracked: false }, 5)).toEqual({ kind: 'dropped', reason: 'lost tracking' });
  });
});

describe('the gestures flag', () => {
  it('opens the arena with gestures over a class at ?arena&class=<name>&gestures', () => {
    expect(readPage('?arena&class=mage&gestures').route).toMatchObject({ kind: 'arena', playerClass: 'mage', gestures: true });
    expect(readPage('?arena&gestures').route).toMatchObject({ kind: 'arena', gestures: true });
    expect(readPage('?arena&class=ranger').route).not.toHaveProperty('gestures', true);
  });
});
