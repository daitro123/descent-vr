import { Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { Inventory } from '../src/inventory';
import { BeltFrame, HIPS, TOOL_LOOP } from '../src/player/beltZones';
import { GestureRecorder, type HandFrame } from '../src/player/gestures/recorder';
import { inLoop, loopGrip, loopOpen, type LoopNow, putBack } from '../src/professions/gathering/loop';
import { scoreStrike, SpotStates, type Strike } from '../src/professions/gathering/spots';
import { Professions } from '../src/professions/professions';

// Gathering at the seams that don't need a headset
// (.scratch/professions/issues/13-the-tool-loop-and-mining.md): the tool
// loop's zone and its rules, a strike's score, and a vein's state from full
// through worked and taken to refilled. How the swings feel, the loop's reach
// and the veins in Oakvale are the check script's, in the browser
// (.scratch/professions/checks/mining.mjs).

const L = CONFIG.professions.toolLoop;
const V = CONFIG.professions.vein;
const P = CONFIG.professions.pick;

/** A head at eye height `y`, over (x, z), looking along heading `yaw` (0 looks down −Z). */
function head(x: number, y: number, z: number, yaw = 0): Object3D {
  const h = new Object3D();
  h.position.set(x, y, z);
  h.rotation.set(0, yaw, 0, 'YXZ');
  h.updateMatrixWorld();
  return h;
}

describe('the tool loop, as a zone of the belt', () => {
  it('hangs behind the right hip’s potion slot, where the gestures keep it taken', () => {
    const frame = new BeltFrame();
    frame.update(head(0, 1.7, 0), 1 / 72);
    const hip = frame.place(HIPS[1], new Vector3());
    const loop = frame.place(TOOL_LOOP, new Vector3());
    expect(loop.distanceTo(hip)).toBeCloseTo(L.behind);
    expect(loop.z).toBeGreaterThan(hip.z); // behind you, looking down −Z
    // In the eyes' frame (x right, y up, z forward), as the gestures' places are.
    const taken = CONFIG.gestures.taken.find((t) => t.name === 'the tool loop')!;
    expect(loop.x).toBeCloseTo(taken.at[0]);
    expect(loop.y - 1.7).toBeCloseTo(taken.at[1]);
    expect(-loop.z).toBeCloseTo(taken.at[2]);
  });

  it('finds a hand in it and not one at the potion slot beside it', () => {
    const frame = new BeltFrame();
    frame.update(head(3, 1.6, -2), 1 / 72);
    const loop = frame.place(TOOL_LOOP, new Vector3());
    expect(inLoop(frame, loop)).toBe(true);
    expect(inLoop(frame, loop.clone().add(new Vector3(0, 0.08, 0)))).toBe(true);
    expect(inLoop(frame, frame.place(HIPS[1], new Vector3()))).toBe(false);
  });

  // The gestures' own places turn with your head; the belt turns only once you've looked 30° away.
  // Whichever way you look within that, a grip where the loop really hangs is the loop's.
  it('never arms a gesture with a grip in the loop, however far your head has turned from the belt', () => {
    for (const turn of [-0.45, -0.25, 0, 0.25, 0.45]) {
      const frame = new BeltFrame();
      frame.update(head(0, 1.6, 0), 1 / 72); // the belt faces down −Z…
      const eyes = head(0, 1.6, 0, turn); // …and you look `turn` rad off it, inside its dead zone
      frame.update(eyes, 1 / 72);
      expect(frame.yaw).toBeCloseTo(Math.PI);
      const hand = frame.place(TOOL_LOOP, new Vector3());
      const gaze = new Vector3(0, 0, -1).applyQuaternion(eyes.quaternion);
      const f = (squeeze: number, at = hand): HandFrame => ({
        hand: at,
        head: eyes.position,
        gaze,
        squeeze,
        tracked: true,
        busy: false,
        taken: inLoop(frame, at) ? 'the tool loop' : null,
        dt: 1 / 72,
      });
      const r = new GestureRecorder();
      expect(r.update(f(1)), `turned ${turn}`).toEqual({ kind: 'taken', place: 'the tool loop' });
      // Drawing the pick out and swinging with the grip held arms nothing.
      for (let i = 0; i < 20; i++) expect(r.update(f(1, hand.clone().add(new Vector3(0.02 * i, 0.04 * i, -0.03 * i))))).toBeNull();
      expect(r.armed).toBe(false);
      expect(r.update(f(0))).toBeNull();
    }
  });
});

describe("the tool loop's rules", () => {
  const near: LoopNow = { drawn: false, fighting: false, nearestFull: 2, nearestAny: 2 };
  const grip = { gripDown: true, inLoop: true, speed: 0.3 };

  it('draws the tool within 3 m of a spot, and does nothing farther off', () => {
    expect(loopGrip(grip, near)).toBe('draw');
    expect(loopGrip(grip, { ...near, nearestFull: L.draw })).toBe('draw');
    expect(loopGrip(grip, { ...near, nearestFull: 10, nearestAny: 10 })).toBe('nothing');
    // A taken spot gives nothing to draw for.
    expect(loopGrip(grip, { ...near, nearestFull: Infinity, nearestAny: 1 })).toBe('nothing');
  });

  it('puts the tool back with a grip in the loop', () => {
    expect(loopGrip(grip, { ...near, drawn: true })).toBe('putAway');
  });

  it('does nothing while anything fights you', () => {
    expect(loopGrip(grip, { ...near, fighting: true })).toBe('nothing');
    expect(loopGrip(grip, { ...near, fighting: true, drawn: true })).toBe('nothing');
    expect(loopOpen({ ...near, fighting: true })).toBe(false);
  });

  it('only takes a grip that goes down in the loop, the hand under 1.5 m/s', () => {
    expect(loopGrip({ ...grip, gripDown: false }, near)).toBeNull();
    expect(loopGrip({ ...grip, inLoop: false }, near)).toBeNull();
    expect(loopGrip({ ...grip, speed: L.maxSpeed }, near)).toBeNull();
  });

  it('glows only where it would give or take', () => {
    expect(loopOpen(near)).toBe(true);
    expect(loopOpen({ ...near, nearestFull: 10 })).toBe(false);
    expect(loopOpen({ ...near, nearestFull: 10, drawn: true })).toBe(true);
  });

  it('puts a drawn tool away at once in a fight, and once you walk 5 m from every spot', () => {
    const drawn = { ...near, drawn: true };
    expect(putBack(drawn)).toBeNull();
    expect(putBack({ ...drawn, fighting: true })).toBe('pulled');
    expect(putBack({ ...drawn, nearestFull: 7, nearestAny: L.putAway })).toBeNull();
    expect(putBack({ ...drawn, nearestFull: 7, nearestAny: L.putAway + 0.1 })).toBe('walkedOff');
    expect(putBack({ ...near, fighting: true })).toBeNull();
  });
});

describe('a strike with the pick', () => {
  const hot = { committed: true, speed: P.minSpeed + 0.5, onOre: true, inGlint: false };

  it('counts a committed swing on the ore 1, and 2.25 in the glint', () => {
    expect(scoreStrike(hot)).toMatchObject({ kind: 'good', value: V.plain });
    expect(scoreStrike({ ...hot, inGlint: true })).toMatchObject({ kind: 'glint', value: V.glint });
  });

  it('is only a tap too slow or uncommitted, and nothing off the ore', () => {
    expect(scoreStrike({ ...hot, speed: P.minSpeed - 0.1 })).toMatchObject({ kind: 'tap', value: 0 });
    expect(scoreStrike({ ...hot, committed: false })).toMatchObject({ kind: 'tap', value: 0 });
    expect(scoreStrike({ ...hot, onOre: false })).toMatchObject({ kind: 'stone', value: 0 });
  });

  it('sizes its power from the gate’s speed to full', () => {
    expect(scoreStrike({ ...hot, speed: P.minSpeed }).power).toBe(0);
    expect(scoreStrike({ ...hot, speed: P.fullSpeed }).power).toBe(1);
    expect(scoreStrike({ ...hot, speed: 99 }).power).toBe(1);
  });
});

describe("a vein's state", () => {
  const VEIN = { kind: 'copperVein' as const, x: 10, z: 10 };
  const glint: Strike = scoreStrike({ committed: true, speed: 3, onOre: true, inGlint: true });
  const plain: Strike = scoreStrike({ committed: true, speed: 3, onOre: true, inGlint: false });
  const refill = CONFIG.professions.spots.copperVein.refill;

  it('breaks in 2 strikes in the glint', () => {
    const s = new SpotStates([VEIN]);
    expect(s.strike(0, glint, 1)).toEqual({ counted: true, broke: false, stage: 1 });
    expect(s.phase(0)).toBe('worked');
    expect(s.strike(0, glint, 2)).toEqual({ counted: true, broke: true, stage: 3 });
    expect(s.phase(0)).toBe('taken');
  });

  it('breaks in 5 plain strikes, cracking at a third and two thirds', () => {
    const s = new SpotStates([VEIN]);
    const stages = [1, 2, 3, 4, 5].map((swing) => s.strike(0, plain, swing));
    expect(stages.map((r) => r.broke)).toEqual([false, false, false, false, true]);
    expect(stages.map((r) => r.stage)).toEqual([0, 1, 2, 2, 3]);
    expect(s.strikes(0)).toBe(5);
  });

  it('counts one strike a swing, and none for a tap, a strike off the ore or a taken vein', () => {
    const s = new SpotStates([VEIN]);
    s.strike(0, plain, 1);
    expect(s.strike(0, plain, 1).counted).toBe(false); // the head's other point, same swing
    expect(s.strike(0, scoreStrike({ committed: false, speed: 1, onOre: true, inGlint: true }), 2).counted).toBe(false);
    expect(s.strike(0, scoreStrike({ committed: true, speed: 3, onOre: false, inGlint: false }), 3).counted).toBe(false);
    expect(s.progress(0)).toBe(V.plain);
    s.take(0);
    expect(s.strike(0, glint, 4).counted).toBe(false);
  });

  it('refills 180 s after it was taken, and only once you are 30 m off', () => {
    const s = new SpotStates([VEIN]);
    s.strike(0, glint, 1);
    s.strike(0, glint, 2);
    const here = { x: 12, z: 10 };
    const far = { x: 10 + refill.away, z: 10 };
    expect(s.update(refill.after - 1, far)).toEqual([]);
    expect(s.update(2, here)).toEqual([]); // time's up, but you're standing at it
    expect(s.phase(0)).toBe('taken');
    expect(s.update(1, far)).toEqual([0]);
    expect(s.phase(0)).toBe('full');
    expect(s.progress(0)).toBe(0);
  });

  it('gives 3 copper ore, 1 rough stone and a point of Mining once broken, through the professions module', () => {
    const inventory = new Inventory({ class: 'warrior', level: 1 });
    const professions = new Professions(inventory);
    professions.learn('mining');
    const s = new SpotStates([VEIN]);
    s.strike(0, glint, 1);
    expect(s.strike(0, glint, 2).broke).toBe(true);
    const effects = professions.gather(VEIN.kind);
    expect(effects).toContainEqual({ kind: 'gathered', spot: 'copperVein' });
    expect(inventory.count('copper-ore')).toBe(3);
    expect(inventory.count('rough-stone')).toBe(1);
    expect(professions.proficiency('mining')).toBe(1);
  });
});
